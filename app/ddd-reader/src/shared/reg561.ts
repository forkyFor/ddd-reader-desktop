import { addDays, fmtMinutes, isoWeekKey, parseDurationHHMM, s } from "./timeUtils";

export type Reg561Daily = {
  date: string; // YYYY-MM-DD (UTC day)
  drivingMinutes: number;
  workMinutes: number;
  availabilityMinutes: number;
  restMinutes: number;
  distanceKm?: number;

  // Simplified flags
  isExtendedTo10h: boolean;
  dailyDrivingViolation?: string;
  longestRestMinutes?: number;
  dailyRestFlag?: "OK" | "REDUCED" | "INSUFFICIENT";
};

export type Reg561Weekly = {
  isoWeek: string; // YYYY-Www
  drivingMinutes: number;
  weeklyDrivingViolation?: string;
};

export type Reg561BreakViolation = {
  at: string; // dateKey + time (best effort)
  drivingSinceLastBreakMinutes: number;
  message: string;
};

export type Reg561FortnightViolation = {
  windowStart: string;
  windowEnd: string;
  drivingMinutes: number;
  message: string;
};

export type Reg561Report = {
  periodStart?: string;
  periodEnd?: string;
  daily: Reg561Daily[];
  weekly: Reg561Weekly[];
  breakViolations: Reg561BreakViolation[];
  fortnightViolations: Reg561FortnightViolation[];
  notes: string[];
};

type ActivityChangeRecord = {
  activity?: string;
  activityCode?: number;
  from?: string; // HH:MM
  duration?: string; // HH:MM
  title?: string;
};

function isDriving(r: ActivityChangeRecord): boolean {
  return r.activity === "driving" || r.activityCode === 3;
}

function isWork(r: ActivityChangeRecord): boolean {
  return r.activity === "work" || r.activityCode === 2;
}

function isAvailability(r: ActivityChangeRecord): boolean {
  return r.activity === "availability" || r.activityCode === 1;
}

function isRestLike(r: ActivityChangeRecord): boolean {
  // Depending on the parser, pauses may appear as "break/rest" or "short break".
  return (
    r.activity === "break/rest" ||
    r.activity === "short break" ||
    r.activityCode === 0 ||
    r.activityCode === 5
  );
}

function getDailyRecordsMap(combinedData: any): Record<string, any> | null {
  const m = combinedData?.CardDriverActivity?.CardActivityDailyRecord?.dailyRecords;
  if (m && typeof m === "object") return m;
  return null;
}

export function deriveDailyTotalsFromCombinedData(combinedData: any): Reg561Daily[] {
  const map = getDailyRecordsMap(combinedData);
  if (!map) return [];

  const dates = Object.keys(map).sort();
  const out: Reg561Daily[] = [];

  for (const date of dates) {
    const rec = map[date];
    const changes: ActivityChangeRecord[] = Array.isArray(rec?.ActivityChangeInfo?.records)
      ? rec.ActivityChangeInfo.records
      : [];

    let driving = 0;
    let work = 0;
    let avail = 0;
    let rest = 0;
    let longestRest = 0;

    for (const c of changes) {
      const dur = parseDurationHHMM(c?.duration);
      if (isDriving(c)) driving += dur;
      else if (isWork(c)) work += dur;
      else if (isAvailability(c)) avail += dur;
      else if (isRestLike(c)) {
        rest += dur;
        if (dur > longestRest) longestRest = dur;
      }
    }

    const distanceRaw = rec?.activityDayDistance;
    const distanceKm = typeof distanceRaw === "number" ? Math.round(distanceRaw) : undefined;

    out.push({
      date,
      drivingMinutes: driving,
      workMinutes: work,
      availabilityMinutes: avail,
      restMinutes: rest,
      distanceKm,
      isExtendedTo10h: false,
      longestRestMinutes: longestRest || undefined,
      dailyRestFlag: longestRest >= 11 * 60 ? "OK" : longestRest >= 9 * 60 ? "REDUCED" : "INSUFFICIENT",
    });
  }

  return out;
}

function computeBreakViolationsFromDailyMap(combinedData: any): Reg561BreakViolation[] {
  const map = getDailyRecordsMap(combinedData);
  if (!map) return [];

  const dates = Object.keys(map).sort();
  const violations: Reg561BreakViolation[] = [];

  for (const date of dates) {
    const rec = map[date];
    const changes: ActivityChangeRecord[] = Array.isArray(rec?.ActivityChangeInfo?.records)
      ? rec.ActivityChangeInfo.records
      : [];

    let driveSinceBreak = 0;
    let partialBreak = 0; // >=15 and <45
    let lastTime = "00:00";

    for (const c of changes) {
      const dur = parseDurationHHMM(c?.duration);
      const from = s(c?.from) || lastTime;
      lastTime = from;

      if (isDriving(c)) {
        driveSinceBreak += dur;
        if (driveSinceBreak > 270) {
          violations.push({
            at: `${date} ${from}Z`,
            drivingSinceLastBreakMinutes: driveSinceBreak,
            message:
              "Guida continuativa > 4h30 senza pausa complessiva di 45m (stima - Art. 7).",
          });
          // avoid spamming: reset so we report one per day chunk
          driveSinceBreak = 0;
          partialBreak = 0;
        }
        continue;
      }

      if (isRestLike(c)) {
        // qualifying break logic (simplified)
        if (dur >= 45) {
          driveSinceBreak = 0;
          partialBreak = 0;
        } else if (dur >= 15 && dur < 45) {
          if (partialBreak === 0) partialBreak = dur;
          else if (partialBreak >= 15 && dur >= 30) {
            // 15 + 30 split (simplified)
            driveSinceBreak = 0;
            partialBreak = 0;
          } else {
            partialBreak = dur;
          }
        }
      }
    }
  }

  return violations;
}

export function computeReg561FromCombinedData(combinedData: any): Reg561Report {
  const daily = deriveDailyTotalsFromCombinedData(combinedData);
  const notes: string[] = [
    "Calcolo semplificato su giorni di calendario UTC basato su ActivityChangeInfo del tachigrafo.",
    "Le regole su riposi giornalieri/settimanali (riduzioni, compensazioni, riposi spezzati) sono trattate in modo indicativo.",
  ];

  const periodStart = daily.length ? daily[0].date : undefined;
  const periodEnd = daily.length ? daily[daily.length - 1].date : undefined;

  // --- Daily driving limits (Art. 6) ---
  // 9h, extended to 10h max 2 times per week.
  const byWeek: Record<string, Reg561Daily[]> = {};
  for (const d of daily) {
    const wk = isoWeekKey(d.date);
    (byWeek[wk] ??= []).push(d);
  }
  for (const wk of Object.keys(byWeek)) {
    const days = byWeek[wk];
    const extendedDays = days
      .filter((x) => x.drivingMinutes > 9 * 60 && x.drivingMinutes <= 10 * 60)
      .sort((a, b) => b.drivingMinutes - a.drivingMinutes);
    // mark up to 2 as extended, rest become violation
    extendedDays.forEach((d, idx) => {
      if (idx < 2) d.isExtendedTo10h = true;
      else {
        d.isExtendedTo10h = true;
        d.dailyDrivingViolation =
          "Più di 2 estensioni a 10h nella stessa settimana ISO (stima - Art. 6).";
      }
    });
  }

  for (const d of daily) {
    if (d.drivingMinutes > 10 * 60) {
      d.dailyDrivingViolation = `Guida giornaliera > 10h (${fmtMinutes(d.drivingMinutes)}) (stima - Art. 6).`;
    } else if (d.drivingMinutes > 9 * 60 && !d.isExtendedTo10h) {
      d.dailyDrivingViolation =
        `Guida giornaliera > 9h (${fmtMinutes(d.drivingMinutes)}) senza estensione valida (stima - Art. 6).`;
    }
  }

  // --- Weekly driving limit (56h) ---
  const weekly: Reg561Weekly[] = Object.keys(byWeek)
    .sort()
    .map((wk) => {
      const minutes = byWeek[wk].reduce((acc, d) => acc + (d.drivingMinutes || 0), 0);
      const w: Reg561Weekly = { isoWeek: wk, drivingMinutes: minutes };
      if (minutes > 56 * 60) {
        w.weeklyDrivingViolation = `Guida settimanale > 56h (${fmtMinutes(minutes)}) (stima - Art. 6).`;
      }
      return w;
    });

  // --- 14-day rolling limit (90h) ---
  const fortnightViolations: Reg561FortnightViolation[] = [];
  for (let i = 0; i < daily.length; i++) {
    const windowStart = daily[i].date;
    const windowEnd = addDays(windowStart, 13);

    // sum daily records in [start, end]
    const minutes = daily
      .filter((d) => d.date >= windowStart && d.date <= windowEnd)
      .reduce((acc, d) => acc + (d.drivingMinutes || 0), 0);

    if (minutes > 90 * 60) {
      fortnightViolations.push({
        windowStart,
        windowEnd,
        drivingMinutes: minutes,
        message: `Guida > 90h su 14 giorni (${fmtMinutes(minutes)}) (stima - Art. 6).`,
      });
    }
  }

  // --- Breaks (Art. 7, simplified) ---
  const breakViolations = computeBreakViolationsFromDailyMap(combinedData);

  return {
    periodStart,
    periodEnd,
    daily,
    weekly,
    breakViolations,
    fortnightViolations,
    notes,
  };
}

// ---------------------------
// Blocks builder (ReportView)
// ---------------------------

export function build561Blocks(c561: Reg561Report): { type: any; text?: string; headers?: string[]; rows?: any[]; pageSize?: number }[] {
  const blocks: any[] = [];

  blocks.push({ type: "h1", text: "Reg. (CE) 561/2006 – Sintesi (calcolo da tachigrafo)" });

  const period = [c561?.periodStart, c561?.periodEnd].filter(Boolean).join(" → ");
  if (period) blocks.push({ type: "p", text: `Periodo analizzato: ${period} (giorni UTC)` });

  const daily = Array.isArray(c561?.daily) ? c561.daily : [];
  const weekly = Array.isArray(c561?.weekly) ? c561.weekly : [];
  const breakViolations = Array.isArray(c561?.breakViolations) ? c561.breakViolations : [];
  const fortnightViolations = Array.isArray(c561?.fortnightViolations) ? c561.fortnightViolations : [];

  const dailyDrivingViol = daily.filter((d: any) => !!d.dailyDrivingViolation).length;
  const dailyRestInsuff = daily.filter((d: any) => d.dailyRestFlag === "INSUFFICIENT").length;
  const weeklyViol = weekly.filter((w: any) => !!w.weeklyDrivingViolation).length;

  blocks.push({
    type: "table",
    pageSize: 30,
    headers: ["Voce", "Valore"],
    rows: [
      { cells: ["Giorni analizzati", String(daily.length)] },
      { cells: ["Violazioni guida giornaliera (stima)", String(dailyDrivingViol)] },
      { cells: ["Giorni con riposo insufficiente (stima)", String(dailyRestInsuff)] },
      { cells: ["Settimane con violazione 56h (stima)", String(weeklyViol)] },
      { cells: ["Violazioni pause 4h30/45m (stima)", String(breakViolations.length)] },
      { cells: ["Violazioni 14 giorni 90h (stima)", String(fortnightViolations.length)] },
    ],
  });

  if (daily.length) {
    blocks.push({ type: "h1", text: "Dettaglio giornaliero" });
    blocks.push({
      type: "table",
      pageSize: 40,
      headers: ["Data", "Guida", "10h?", "Violazione guida", "Riposo max", "Riposo"],
      rows: daily.map((d: any) => ({
        cells: [
          s(d.date),
          fmtMinutes(d.drivingMinutes),
          d.isExtendedTo10h ? "Sì" : "No",
          s(d.dailyDrivingViolation || ""),
          fmtMinutes(d.longestRestMinutes),
          s(d.dailyRestFlag || ""),
        ],
      })),
    });
  }

  if (weekly.length) {
    blocks.push({ type: "h1", text: "Dettaglio settimanale" });
    blocks.push({
      type: "table",
      pageSize: 30,
      headers: ["Settimana ISO", "Guida", "Violazione"],
      rows: weekly.map((w: any) => ({
        cells: [s(w.isoWeek), fmtMinutes(w.drivingMinutes), s(w.weeklyDrivingViolation || "")],
      })),
    });
  }

  if (breakViolations.length) {
    blocks.push({ type: "h1", text: "Violazioni pause (Art. 7 – guida continuativa)" });
    blocks.push({
      type: "table",
      pageSize: 30,
      headers: ["Quando", "Guida da ultima pausa", "Nota"],
      rows: breakViolations.map((v: any) => ({
        cells: [s(v.at), fmtMinutes(v.drivingSinceLastBreakMinutes), s(v.message)],
      })),
    });
  }

  if (fortnightViolations.length) {
    blocks.push({ type: "h1", text: "Violazioni su 14 giorni (Art. 6 – 90h)" });
    blocks.push({
      type: "table",
      pageSize: 30,
      headers: ["Finestra", "Guida", "Nota"],
      rows: fortnightViolations.map((v: any) => ({
        cells: [`${s(v.windowStart)} → ${s(v.windowEnd)}`, fmtMinutes(v.drivingMinutes), s(v.message)],
      })),
    });
  }

  if (Array.isArray(c561?.notes) && c561.notes.length) {
    blocks.push({ type: "h1", text: "Note sul calcolo" });
    for (const n of c561.notes) blocks.push({ type: "p", text: s(n) });
  }

  return blocks;
}
