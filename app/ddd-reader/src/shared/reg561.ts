import { addDays, fmtMinutes, isoWeekKey, parseDurationHHMM, s } from "./timeUtils";
import { iconizeActivityLabel, iconizeStatusLabel, iconizeViolationLabel } from "./iconTokens";

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

function hhmmToMinutes(hhmm: string): number | null {
  if (!hhmm) return null;
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  return h * 60 + mi;
}

function minutesToHHMM(mins: number): string {
  const m = ((mins % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function extractFromTo(text: string): { from?: string; to?: string } {
  if (!text) return {};
  const m = String(text).match(/From\s+([^\s]+)\s+To\s+([^\s]+)/i);
  if (!m) return {};
  return { from: m[1], to: m[2] };
}

function getActivityChangesForDate(combinedData: any, date: string): any[] {
  const rec = combinedData?.CardDriverActivity?.CardActivityDailyRecord?.dailyRecords?.[date];
  const changes = Array.isArray(rec?.ActivityChangeInfo?.records) ? rec.ActivityChangeInfo.records : [];
  return changes;
}

function buildActivityDetailsTable(combinedData: any, date: string): { title: string; headers: string[]; rows: string[][] } | undefined {
  const changes = getActivityChangesForDate(combinedData, date);
  if (!changes.length) return undefined;

  // Build a best-effort timeline with start/end.
  let cursor = 0;
  const rows: string[][] = [];
  for (const c of changes) {
    const from = typeof c?.from === "string" ? c.from : "";
    const startMin = hhmmToMinutes(from);
    const dur = parseDurationHHMM(c?.duration);
    if (startMin !== null) cursor = startMin;
    const endMin = cursor + dur;
    const activityRaw = String(c?.activity ?? c?.title ?? c?.activityCode ?? "");
    const activity = iconizeActivityLabel(activityRaw);
    rows.push([
      minutesToHHMM(cursor),
      minutesToHHMM(endMin),
      activity,
      c?.duration ? String(c.duration) : "",
      c?.activityCode !== undefined ? String(c.activityCode) : "",
    ]);
    cursor = endMin;
  }

  return {
    title: `Attività (dettaglio) – ${date}`,
    headers: ["Da", "A", "Attività", "Durata", "Codice"],
    rows,
  };
}

function buildBreakViolationDetails(combinedData: any, v: Reg561BreakViolation): { title: string; headers: string[]; rows: string[][] } | undefined {
  const at = String(v?.at ?? "");
  const date = at.slice(0, 10);
  const timePart = at.length >= 16 ? at.slice(11, 16) : "";
  const tMin = hhmmToMinutes(timePart);
  const changes = getActivityChangesForDate(combinedData, date);
  if (!changes.length) return undefined;

  // Rebuild segments with absolute minutes
  let cursor = 0;
  const segments: { start: number; end: number; activity: string; dur: string }[] = [];
  for (const c of changes) {
    const from = typeof c?.from === "string" ? c.from : "";
    const startMin = hhmmToMinutes(from);
    const durMin = parseDurationHHMM(c?.duration);
    if (startMin !== null) cursor = startMin;
    const end = cursor + durMin;
    const activityRaw = String(c?.activity ?? c?.title ?? c?.activityCode ?? "");
    segments.push({ start: cursor, end, activity: iconizeActivityLabel(activityRaw), dur: c?.duration ? String(c.duration) : "" });
    cursor = end;
  }

  const rows: string[][] = [];
  rows.push(["Violazione", "", "", "", ""]);
  rows.push(["Violazione", at, "", "", String(v?.message ?? "")]);

  if (tMin !== null) {
    const wStart = Math.max(0, tMin - 120);
    const wEnd = Math.min(24 * 60, tMin + 120);
    rows.push(["Contesto (±2h)", "", "", "", ""]);
    for (const s of segments) {
      if (s.end <= wStart || s.start >= wEnd) continue;
      rows.push([
        "Contesto",
        `${minutesToHHMM(s.start)}–${minutesToHHMM(s.end)}`,
        s.activity,
        s.dur,
        "",
      ]);
    }
  }

  rows.push(["Giornata (tutti i record)", "", "", "", ""]);
  for (const s of segments) {
    rows.push([
      "Giornata",
      `${minutesToHHMM(s.start)}–${minutesToHHMM(s.end)}`,
      s.activity,
      s.dur,
      "",
    ]);
  }

  return {
    title: `Dettaglio violazione pausa – ${at}`,
    headers: ["Sezione", "Ora", "Attività", "Durata", "Note"],
    rows,
  };
}

export function build561Blocks(
  c561: Reg561Report,
  combinedData?: any,
  meta?: {
    companyName?: string;
    driverName?: string;
    driverCardNumber?: string;
    vehicle?: string;
  }
): { type: any; text?: string; headers?: string[]; rows?: any[]; pageSize?: number }[] {
  const blocks: any[] = [];

  function basePdfPayload(args: {
    code: string;
    title: string;
    period?: { start?: string; end?: string };
    legalTitle?: string;
    legalParagraphs?: string[];
    detailParagraphs?: string[];
    tables?: { title?: string; headers: string[]; rows: string[][] }[];
  }) {
    return {
      kind: "INFRACTION",
      code: args.code,
      title: args.title,
      companyName: meta?.companyName,
      driver: {
        name: meta?.driverName,
        cardNumber: meta?.driverCardNumber,
      },
      vehicle: meta?.vehicle,
      period: args.period,
      legal: {
        title: args.legalTitle,
        paragraphs: args.legalParagraphs ?? [],
      },
      detail: {
        title: "Dettaglio infrazione",
        paragraphs: args.detailParagraphs ?? [],
      },
      tables: args.tables ?? [],
      footerNote: "Il conducente dichiara di aver preso nota dell'infrazione in oggetto",
      requireSignature: true,
    };
  }

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
      rows: daily.map((d: any) => {
        const details = combinedData ? buildActivityDetailsTable(combinedData, String(d.date)) : undefined;

        const isDriveViolation = !!d.dailyDrivingViolation;
        const isRestInsuff = String(d.dailyRestFlag || "") === "INSUFFICIENT";

        const actions: any[] = [];
        if (isDriveViolation || isRestInsuff) {
          const parts: string[] = [];
          const detailPars: string[] = [];
          if (isDriveViolation) {
            parts.push("D0601");
            detailPars.push(String(d.dailyDrivingViolation));
          }
          if (isRestInsuff) {
            parts.push("D0801");
            detailPars.push(`Riposo giornaliero insufficiente (riposo max ${fmtMinutes(d.longestRestMinutes)}).`);
          }

          const code = `${parts.join("_")}_${String(d.date)}`;
          actions.push({
            type: "pdf",
            code,
            payload: basePdfPayload({
              code,
              title: `Dettaglio infrazione ${code} del ${String(d.date)}`,
              period: { start: `${String(d.date)}T00:00:00Z`, end: `${String(d.date)}T23:59:59Z` },
              legalTitle: "Regolamento (CE) n. 561/2006",
              legalParagraphs: [
                "Verifica automatica dei tempi di guida, interruzioni e riposo sulla base dei dati del tachigrafo.",
                isDriveViolation ? "Riferimento: Art. 6 (tempi di guida)." : "",
                isRestInsuff ? "Riferimento: Art. 8 (riposi)." : "",
              ].filter(Boolean),
              detailParagraphs: detailPars,
              tables: details ? [{ title: "Tabulato attività (giorno)", headers: details.headers, rows: details.rows }] : [],
            }),
          });
        }

        return {
          cells: [
            s(d.date),
            fmtMinutes(d.drivingMinutes),
            d.isExtendedTo10h ? "Sì" : "No",
            d.dailyDrivingViolation ? iconizeViolationLabel(s(d.dailyDrivingViolation)) : "",
            fmtMinutes(d.longestRestMinutes),
            iconizeStatusLabel(s(d.dailyRestFlag || "")),
          ],
          actions: actions.length ? actions : undefined,
          details,
        };
      }),
    });
  }

  if (weekly.length) {
    blocks.push({ type: "h1", text: "Dettaglio settimanale" });
    blocks.push({
      type: "table",
      pageSize: 30,
      headers: ["Settimana ISO", "Guida", "Violazione"],
      rows: weekly.map((w: any) => {
        const weekKey = String(w.isoWeek);
        const daysInWeek = daily.filter((d) => isoWeekKey(String(d.date)) === weekKey);
        const details = daysInWeek.length
          ? {
              title: `Dettaglio settimana ${weekKey}`,
              headers: ["Data", "Guida", "10h?", "Riposo", "Violazione"],
              rows: daysInWeek.map((d: any) => [
                s(d.date),
                fmtMinutes(d.drivingMinutes),
                d.isExtendedTo10h ? "Sì" : "No",
                iconizeStatusLabel(s(d.dailyRestFlag || "")),
                d.dailyDrivingViolation ? iconizeViolationLabel(s(d.dailyDrivingViolation)) : "",
              ]),
            }
          : undefined;

        return {
          cells: [s(w.isoWeek), fmtMinutes(w.drivingMinutes), w.weeklyDrivingViolation ? iconizeViolationLabel(s(w.weeklyDrivingViolation)) : ""],
          actions: w.weeklyDrivingViolation
            ? [
                {
                  type: "pdf",
                  code: `W0601_${weekKey}`,
                  payload: basePdfPayload({
                    code: `W0601_${weekKey}`,
                    title: `Dettaglio infrazione W0601 della settimana ${weekKey}`,
                    period: { start: daysInWeek?.[0]?.date, end: daysInWeek?.[daysInWeek.length - 1]?.date },
                    legalTitle: "Regolamento (CE) n. 561/2006 – Art. 6",
                    legalParagraphs: ["Limite di guida settimanale: massimo 56 ore."] ,
                    detailParagraphs: [String(w.weeklyDrivingViolation)],
                    tables: details ? [{ title: details.title, headers: details.headers, rows: details.rows }] : [],
                  }),
                },
              ]
            : undefined,
          details,
        };
      }),
    });
  }

  if (breakViolations.length) {
    blocks.push({ type: "h1", text: "Violazioni pause (Art. 7 – guida continuativa)" });
    blocks.push({
      type: "table",
      pageSize: 30,
      headers: ["Quando", "Guida da ultima pausa", "Nota"],
      rows: breakViolations.map((v: any) => {
        const details = combinedData ? buildBreakViolationDetails(combinedData, v) : undefined;
        const at = String(v.at || "");
        const code = `B0701_${at.replace(/[^0-9TZ:-]+/g, "")}`;
        return {
          cells: [s(v.at), fmtMinutes(v.drivingSinceLastBreakMinutes), v.message ? iconizeViolationLabel(s(v.message)) : ""],
          actions: [
            {
              type: "pdf",
              code,
              payload: basePdfPayload({
                code,
                title: `Dettaglio infrazione ${code}`,
                period: { start: at, end: at },
                legalTitle: "Regolamento (CE) n. 561/2006 – Art. 7",
                legalParagraphs: ["Dopo 4h30 di guida è obbligatoria una pausa di almeno 45 minuti (anche frazionabile 15+30)."],
                detailParagraphs: [String(v.message || "Violazione pausa")],
                tables: details ? [{ title: details.title, headers: details.headers, rows: details.rows }] : [],
              }),
            },
          ],
          details,
        };
      }),
    });
  }

  if (fortnightViolations.length) {
    blocks.push({ type: "h1", text: "Violazioni su 14 giorni (Art. 6 – 90h)" });
    blocks.push({
      type: "table",
      pageSize: 30,
      headers: ["Finestra", "Guida", "Nota"],
      rows: fortnightViolations.map((v: any) => {
        const start = String(v.windowStart);
        const end = String(v.windowEnd);
        const days = daily.filter((d) => String(d.date) >= start && String(d.date) <= end);
        return {
          cells: [`${s(v.windowStart)} → ${s(v.windowEnd)}`, fmtMinutes(v.drivingMinutes), v.message ? iconizeViolationLabel(s(v.message)) : ""],
          actions: [
            {
              type: "pdf",
              code: `F0601_${start}_${end}`,
              payload: basePdfPayload({
                code: `F0601_${start}_${end}`,
                title: `Dettaglio infrazione F0601 (90h/14 giorni)`,
                period: { start, end },
                legalTitle: "Regolamento (CE) n. 561/2006 – Art. 6",
                legalParagraphs: ["Limite di guida bisettimanale: massimo 90 ore su due settimane consecutive."],
                detailParagraphs: [String(v.message || "Violazione 90h/14 giorni")],
                tables: days.length
                  ? [
                      {
                        title: `Dettaglio guida giornaliera (${start} → ${end})`,
                        headers: ["Data", "Guida"],
                        rows: days.map((d: any) => [s(d.date), fmtMinutes(d.drivingMinutes)]),
                      },
                    ]
                  : [],
              }),
            },
          ],
          details: days.length
            ? {
                title: `Dettaglio finestra 14 giorni ${start} → ${end}`,
                headers: ["Data", "Guida"],
                rows: days.map((d: any) => [s(d.date), fmtMinutes(d.drivingMinutes)]),
              }
            : undefined,
        };
      }),
    });
  }

  if (Array.isArray(c561?.notes) && c561.notes.length) {
    blocks.push({ type: "h1", text: "Note sul calcolo" });
    for (const n of c561.notes) blocks.push({ type: "p", text: s(n) });
  }

  return blocks;
}
