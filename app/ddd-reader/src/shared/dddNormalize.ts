/*
  Normalization + EU 561/2006 compliance-oriented summaries.

  Goal: turn the heterogeneous outputs of the various parsers (tachoparser, readesm,
  tachograph-go, etc.) into a single, predictable JSON shape for:
    - DRIVER_CARD files
    - VEHICLE_UNIT files

  Notes:
  - Different parsers expose different key names and nesting.
  - This module uses *heuristics* (deep search + pattern matching) to extract:
      * identity (driver / vehicle)
      * activity timeline (DRIVING / REST / WORK / AVAILABLE)
    …and then computes the main Regulation (EC) 561/2006 limits.
  - If you later standardize on a single parser (e.g., tachograph-go), you can
    replace the heuristics with direct field mappings.
*/

export type NormalizedEntityType = "DRIVER_CARD" | "VEHICLE_UNIT" | "UNKNOWN";

export type ActivityKind = "DRIVING" | "REST" | "WORK" | "AVAILABLE" | "UNKNOWN";

export interface ActivitySegment {
  start: string; // ISO
  end: string;   // ISO
  kind: ActivityKind;
  sourcePath?: string; // where it was found
}

export interface DriverIdentity {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  cardNumber?: string;
  issuingState?: string;
  expiryDate?: string;
}

export interface VehicleIdentity {
  registrationNumber?: string;
  vin?: string;
  vuSerialNumber?: string;
  manufacturer?: string;
}

export interface Compliance561Daily {
  date: string; // YYYY-MM-DD
  drivingMinutes: number;
  isExtendedTo10h: boolean;
  dailyDrivingViolation?: string;
  longestRestMinutes?: number;
  dailyRestFlag?: "REGULAR" | "REDUCED" | "INSUFFICIENT";
}

export interface Compliance561Weekly {
  isoWeek: string; // YYYY-Www
  drivingMinutes: number;
  weeklyDrivingViolation?: string;
}

export interface Compliance561BreakViolation {
  at: string; // ISO
  drivingSinceLastBreakMinutes: number;
  message: string;
}

export interface Compliance561FortnightViolation {
  windowStart: string; // YYYY-MM-DD
  windowEnd: string;   // YYYY-MM-DD
  drivingMinutes: number;
  message: string;
}

export interface Compliance561Report {
  periodStart?: string;
  periodEnd?: string;

  daily: Compliance561Daily[];
  weekly: Compliance561Weekly[];

  breakViolations: Compliance561BreakViolation[];
  fortnightViolations: Compliance561FortnightViolation[];
  notes: string[];
}

export interface NormalizedDDD {
  extractedAt: string;
  entityType: NormalizedEntityType;
  source: {
    path?: string;
    guessedType?: string;
  };
  driver?: DriverIdentity;
  vehicle?: VehicleIdentity;
  timeline: ActivitySegment[];
  compliance561?: Compliance561Report;
}

// -------------------------
// Public API
// -------------------------

export function normalizeParsedDDD(combinedData: any, dddPath?: string): NormalizedDDD {
  const extractedAt = new Date().toISOString();

  const entityType = guessEntityType(combinedData, dddPath);
  // Even if the primary file is a card, vehicle details may exist (last used vehicle, session open vehicle, etc.).
  // Same for VU files, which can contain driver identities in activity records.
  const driver = extractDriverIdentity(combinedData);
  const vehicle = extractVehicleIdentity(combinedData);

  const timeline = extractActivityTimeline(combinedData);
  const compliance561 = timeline.length ? compute561Compliance(timeline) : undefined;

  return {
    extractedAt,
    entityType,
    source: {
      path: dddPath,
      guessedType: entityType === "UNKNOWN" ? "unknown" : entityType.toLowerCase(),
    },
    driver,
    vehicle,
    timeline,
    compliance561,
  };
}

// -------------------------
// Entity type detection
// -------------------------

function guessEntityType(combinedData: any, dddPath?: string): NormalizedEntityType {
  const byPath = (dddPath || "").toLowerCase();
  // Many firms name files with ..._C_ for card or ..._V_ for vehicle, but not guaranteed.
  if (byPath.includes("card") || byPath.includes("driver") || byPath.includes("_c_") || byPath.endsWith("-card.ddd")) {
    return "DRIVER_CARD";
  }
  if (byPath.includes("vu") || byPath.includes("vehicle") || byPath.includes("_v_") || byPath.endsWith("-vu.ddd")) {
    return "VEHICLE_UNIT";
  }

  // Prefer tachograph-go if present.
  const tgo = combinedData?.tachograph_go;
  const t = typeof tgo?.type === "string" ? tgo.type : undefined;
  if (t?.includes("DRIVER_CARD")) return "DRIVER_CARD";
  if (t?.includes("VEHICLE_UNIT")) return "VEHICLE_UNIT";

  // Heuristic: presence of likely top-level keys.
  if (deepHasKey(combinedData, ["driverCard", "cardHolder", "card_holder", "driverIdentification"])) return "DRIVER_CARD";
  if (deepHasKey(combinedData, ["vehicleUnit", "vehicle_identification", "registrationNumber", "vuIdentification"])) return "VEHICLE_UNIT";

  return "UNKNOWN";
}

// -------------------------
// Identity extraction (heuristic)
// -------------------------

function extractDriverIdentity(root: any): DriverIdentity {
  const firstName = asString(firstDeepValue(root, [
    "firstName",
    "firstname",
    "driverFirstName",
    "cardHolderFirstName",
  ]));
  const lastName = asString(firstDeepValue(root, [
    "lastName",
    "lastname",
    "surname",
    "driverSurname",
    "cardHolderSurname",
  ]));
  const fullName = asString(firstDeepValue(root, [
    "name",
    "driverName",
    "cardHolderName",
    "holderName",
  ])) || [firstName, lastName].filter(Boolean).join(" ") || undefined;

  const cardNumber = asString(firstDeepValue(root, [
    "cardNumber",
    "card_number",
    "driverCardNumber",
    "cardId",
    "cardIdentificationNumber",
    "identificationNumber",
  ]));

  const issuingState = asString(firstDeepValue(root, [
    "issuingState",
    "issuingCountry",
    "issuingMemberState",
    "cardIssuingMemberState",
    "memberState",
  ]));

  const expiryDate = asISODateMaybe(firstDeepValue(root, [
    "expiryDate",
    "expirationDate",
    "cardExpiry",
    "cardExpiryDate",
  ]));

  return {
    fullName: fullName || undefined,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    cardNumber: cardNumber || undefined,
    issuingState: issuingState || undefined,
    expiryDate: expiryDate || undefined,
  };
}

function extractVehicleIdentity(root: any): VehicleIdentity {
  const registrationNumber = asString(firstDeepValue(root, [
    "registrationNumber",
    "registration",
    "vehicleRegistration",
    "vehicleRegistrationNumber",
    "vehicleRegNumber",
    "vrn",
  ]));
  const vin = asString(firstDeepValue(root, ["vin", "vehicleIdentificationNumber", "vehicleVIN"]));
  const vuSerialNumber = asString(firstDeepValue(root, [
    "vuSerialNumber",
    "vehicleUnitSerialNumber",
    "serialNumber",
    "vu_number",
  ]));
  const manufacturer = asString(firstDeepValue(root, ["manufacturer", "maker", "vuManufacturer"]));

  return {
    registrationNumber: registrationNumber || undefined,
    vin: vin || undefined,
    vuSerialNumber: vuSerialNumber || undefined,
    manufacturer: manufacturer || undefined,
  };
}

// -------------------------
// Timeline extraction
// -------------------------

function extractActivityTimeline(root: any): ActivitySegment[] {
  const segments: ActivitySegment[] = [];
  const visited = new Set<any>();

  const walk = (node: any, path: string) => {
    if (!node || typeof node !== "object") return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      // Candidate array of segments.
      for (let i = 0; i < node.length; i++) {
        const el = node[i];
        const seg = tryParseSegment(el, `${path}[${i}]`);
        if (seg) segments.push(seg);
        walk(el, `${path}[${i}]`);
      }
      return;
    }

    for (const [k, v] of Object.entries(node)) {
      walk(v, path ? `${path}.${k}` : k);
    }
  };

  walk(root, "");

  // Clean, sort, de-duplicate.
  const cleaned = segments
    .filter(s => {
      const st = Date.parse(s.start);
      const en = Date.parse(s.end);
      return Number.isFinite(st) && Number.isFinite(en) && en > st;
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  // De-dup by start+end+kind (we can see the same timeline from multiple parser views)
  const seen = new Set<string>();
  const uniq: ActivitySegment[] = [];
  for (const s of cleaned) {
    const key = `${s.start}|${s.end}|${s.kind}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniq.push(s);
    }
  }
  return uniq;
}

function tryParseSegment(obj: any, sourcePath: string): ActivitySegment | null {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;

  const startRaw = firstOwnValue(obj, ["start", "startTime", "start_time", "begin", "from", "startDateTime", "start_date_time"]);
  const endRaw = firstOwnValue(obj, ["end", "endTime", "end_time", "finish", "to", "endDateTime", "end_date_time"]);

  // Some formats store duration instead of end.
  const durRaw = firstOwnValue(obj, ["duration", "durationSeconds", "duration_seconds", "minutes", "durationMinutes"]);

  const startISO = asISOTimestampMaybe(startRaw);
  let endISO = asISOTimestampMaybe(endRaw);

  if (!startISO) return null;
  if (!endISO && durRaw != null) {
    const durMs = durationToMs(durRaw);
    if (durMs != null) {
      endISO = new Date(Date.parse(startISO) + durMs).toISOString();
    }
  }
  if (!endISO) return null;

  const kindRaw = firstOwnValue(obj, [
    "kind",
    "activity",
    "activityType",
    "activity_type",
    "type",
    "recordType",
    "record_type",
    "state",
  ]);

  const kind = normalizeActivityKind(kindRaw);
  if (kind === "UNKNOWN") return null;

  return {
    start: startISO,
    end: endISO,
    kind,
    sourcePath,
  };
}

function normalizeActivityKind(v: any): ActivityKind {
  if (v == null) return "UNKNOWN";
  if (typeof v === "number") {
    // Common enum mappings (varies by parser). Try best-effort.
    // 0=REST, 1=AVAILABLE, 2=WORK, 3=DRIVING is one frequent mapping.
    if (v === 3) return "DRIVING";
    if (v === 0) return "REST";
    if (v === 2) return "WORK";
    if (v === 1) return "AVAILABLE";
  }
  const s = String(v).toUpperCase();
  if (s.includes("DRIV")) return "DRIVING";
  if (s.includes("REST") || s.includes("BREAK")) return "REST";
  if (s.includes("WORK") || s.includes("OTHERWORK") || s.includes("OTHER_WORK")) return "WORK";
  if (s.includes("AVAIL") || s.includes("POA") || s.includes("STANDBY")) return "AVAILABLE";
  return "UNKNOWN";
}

// -------------------------
// 561/2006 compliance summaries (calendar-based approximation)
// -------------------------

export function compute561Compliance(timeline: ActivitySegment[]): Compliance561Report {
  const notes: string[] = [];
  if (!timeline.length) {
    return { daily: [], weekly: [], breakViolations: [], fortnightViolations: [], notes: ["No activity timeline found."] };
  }

  const drivingByDay = splitAndSumByDay(timeline, "DRIVING");
  const restByDayLongest = longestRestByDay(timeline);

  const periodStart = timeline[0]?.start;
  const periodEnd = timeline[timeline.length - 1]?.end;

  // Weekly grouping (ISO weeks)
  const weeklyMap = new Map<string, number>();
  for (const [day, mins] of drivingByDay.entries()) {
    const wk = isoWeekKey(new Date(day + "T00:00:00Z"));
    weeklyMap.set(wk, (weeklyMap.get(wk) || 0) + mins);
  }

  // Daily driving violations with "10h twice per week" allowance.
  // We assign the two "extended" days to the two largest driving totals (<= 10h) per ISO week.
  const daily: Compliance561Daily[] = [];
  const byWeekDays = new Map<string, Array<{ day: string; mins: number }>>();
  for (const [day, mins] of drivingByDay.entries()) {
    const wk = isoWeekKey(new Date(day + "T00:00:00Z"));
    const arr = byWeekDays.get(wk) || [];
    arr.push({ day, mins });
    byWeekDays.set(wk, arr);
  }
  const extendedDays = new Set<string>();
  for (const [wk, arr] of byWeekDays.entries()) {
    const candidates = arr
      .filter(x => x.mins > 9 * 60 && x.mins <= 10 * 60)
      .sort((a, b) => b.mins - a.mins)
      .slice(0, 2);
    for (const c of candidates) extendedDays.add(`${wk}|${c.day}`);
  }

  const allDays = Array.from(new Set([...drivingByDay.keys(), ...restByDayLongest.keys()])).sort();
  for (const day of allDays) {
    const drivingMinutes = drivingByDay.get(day) || 0;
    const wk = isoWeekKey(new Date(day + "T00:00:00Z"));
    const isExtendedTo10h = extendedDays.has(`${wk}|${day}`);
    let dailyDrivingViolation: string | undefined;
    if (drivingMinutes > 10 * 60) dailyDrivingViolation = "Daily driving time > 10h";
    else if (drivingMinutes > 9 * 60 && !isExtendedTo10h) dailyDrivingViolation = "Daily driving time > 9h (10h allowed only twice per week)";

    const longestRestMinutes = restByDayLongest.get(day);
    let dailyRestFlag: Compliance561Daily["dailyRestFlag"] = undefined;
    if (typeof longestRestMinutes === "number") {
      if (longestRestMinutes >= 11 * 60) dailyRestFlag = "REGULAR";
      else if (longestRestMinutes >= 9 * 60) dailyRestFlag = "REDUCED";
      else dailyRestFlag = "INSUFFICIENT";
    }

    daily.push({
      date: day,
      drivingMinutes,
      isExtendedTo10h,
      dailyDrivingViolation,
      longestRestMinutes,
      dailyRestFlag,
    });
  }

  const weekly: Compliance561Weekly[] = Array.from(weeklyMap.entries())
    .map(([isoWeek, drivingMinutes]) => ({
      isoWeek,
      drivingMinutes,
      weeklyDrivingViolation: drivingMinutes > 56 * 60 ? "Weekly driving time > 56h" : undefined,
    }))
    .sort((a, b) => a.isoWeek.localeCompare(b.isoWeek));

  const breakViolations = computeBreakViolations(timeline);

  const fortnightViolations = computeFortnightViolations(drivingByDay);

  notes.push(
    "The compliance checks here are calendar-based approximations (UTC midnights).",
    "Reg. 561/2006 also defines limits between rest periods (duty cycles). If you need enforcement-grade results, implement duty-period segmentation based on daily/weekly rests."
  );

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

function computeBreakViolations(timeline: ActivitySegment[]): Compliance561BreakViolation[] {
  const out: Compliance561BreakViolation[] = [];
  let drivingSinceBreak = 0;
  let pending15 = false;
  let pending15Start: string | null = null;

  const segs = timeline.slice().sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  for (const s of segs) {
    const mins = Math.round((Date.parse(s.end) - Date.parse(s.start)) / 60000);
    if (s.kind === "DRIVING") {
      drivingSinceBreak += mins;
      if (drivingSinceBreak > 270) {
        out.push({
          at: s.end,
          drivingSinceLastBreakMinutes: drivingSinceBreak,
          message: "Driving exceeded 4h30 without a qualifying break (45m or 15m+30m).",
        });
        // Don't spam continuously; reset to 4h30 threshold so we record only once per continuous block.
        drivingSinceBreak = 270;
      }
      continue;
    }

    if (s.kind === "REST") {
      // Single 45m break qualifies.
      if (mins >= 45) {
        drivingSinceBreak = 0;
        pending15 = false;
        pending15Start = null;
        continue;
      }

      // Split break: 15m then 30m (in that order).
      if (!pending15 && mins >= 15) {
        pending15 = true;
        pending15Start = s.end;
        continue;
      }
      if (pending15 && mins >= 30) {
        // Consider it valid if it happened after the 15m.
        if (!pending15Start || Date.parse(s.start) >= Date.parse(pending15Start)) {
          drivingSinceBreak = 0;
          pending15 = false;
          pending15Start = null;
        }
      }
    }
  }
  return out;
}

function computeFortnightViolations(drivingByDay: Map<string, number>): Compliance561FortnightViolation[] {
  const days = Array.from(drivingByDay.keys()).sort();
  if (days.length < 2) return [];

  const out: Compliance561FortnightViolation[] = [];
  // Build a continuous day index so we can do rolling windows over calendar days.
  const dayToMins = new Map(drivingByDay);

  const minDay = days[0];
  const maxDay = days[days.length - 1];
  const all: string[] = [];
  for (let d = new Date(minDay + "T00:00:00Z"); d <= new Date(maxDay + "T00:00:00Z"); d = addDays(d, 1)) {
    all.push(ymd(d));
  }

  // Rolling 14-day sum.
  let windowSum = 0;
  const q: number[] = [];
  for (let i = 0; i < all.length; i++) {
    const m = dayToMins.get(all[i]) || 0;
    q.push(m);
    windowSum += m;
    if (q.length > 14) windowSum -= q.shift()!;

    if (q.length === 14 && windowSum > 90 * 60) {
      out.push({
        windowStart: all[i - 13],
        windowEnd: all[i],
        drivingMinutes: windowSum,
        message: "Driving time in a 14-day window exceeded 90h.",
      });
    }
  }
  // De-dup overlapping identical windows
  const seen = new Set<string>();
  return out.filter(v => {
    const k = `${v.windowStart}|${v.windowEnd}|${v.drivingMinutes}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// -------------------------
// Helpers: day/week aggregation
// -------------------------

function splitAndSumByDay(timeline: ActivitySegment[], kind: ActivityKind): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of timeline) {
    if (s.kind !== kind) continue;
    const start = new Date(s.start);
    const end = new Date(s.end);
    if (!(start instanceof Date) || !(end instanceof Date) || end <= start) continue;

    let cur = new Date(start);
    while (cur < end) {
      const dayStart = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate(), 0, 0, 0));
      const nextDayStart = addDays(dayStart, 1);
      const sliceEnd = end < nextDayStart ? end : nextDayStart;
      const sliceStart = cur < dayStart ? dayStart : cur;
      const mins = Math.round((sliceEnd.getTime() - sliceStart.getTime()) / 60000);
      const key = ymd(dayStart);
      out.set(key, (out.get(key) || 0) + Math.max(0, mins));
      cur = sliceEnd;
    }
  }
  return out;
}

function longestRestByDay(timeline: ActivitySegment[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of timeline) {
    if (s.kind !== "REST") continue;
    const start = new Date(s.start);
    const end = new Date(s.end);
    if (end <= start) continue;
    // Attribute the rest block to the day where it starts (simple, for UI summaries)
    const key = ymd(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())));
    const mins = Math.round((end.getTime() - start.getTime()) / 60000);
    out.set(key, Math.max(out.get(key) || 0, mins));
  }
  return out;
}

function isoWeekKey(d: Date): string {
  const { year, week } = isoWeek(d);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function isoWeek(date: Date): { year: number; week: number } {
  // ISO week algorithm (UTC)
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday determines the week.
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// -------------------------
// Helpers: deep search + coercions
// -------------------------

function deepHasKey(root: any, keys: string[]): boolean {
  const wanted = new Set(keys.map(k => k.toLowerCase()));
  const visited = new Set<any>();
  const walk = (node: any): boolean => {
    if (!node || typeof node !== "object") return false;
    if (visited.has(node)) return false;
    visited.add(node);
    if (Array.isArray(node)) {
      for (const el of node) if (walk(el)) return true;
      return false;
    }
    for (const k of Object.keys(node)) {
      if (wanted.has(k.toLowerCase())) return true;
    }
    for (const v of Object.values(node)) {
      if (walk(v)) return true;
    }
    return false;
  };
  return walk(root);
}

function firstDeepValue(root: any, keys: string[]): any {
  const wanted = new Set(keys.map(k => k.toLowerCase()));
  const visited = new Set<any>();
  const walk = (node: any): any => {
    if (!node || typeof node !== "object") return undefined;
    if (visited.has(node)) return undefined;
    visited.add(node);
    if (Array.isArray(node)) {
      for (const el of node) {
        const found = walk(el);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    for (const [k, v] of Object.entries(node)) {
      if (wanted.has(k.toLowerCase())) return v;
    }
    for (const v of Object.values(node)) {
      const found = walk(v);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return walk(root);
}

function firstOwnValue(obj: any, keys: string[]): any {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return (obj as any)[k];
    // Try case-insensitive match
    const foundKey = Object.keys(obj).find(x => x.toLowerCase() === k.toLowerCase());
    if (foundKey) return (obj as any)[foundKey];
  }
  return undefined;
}

function asString(v: any): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

function asISOTimestampMaybe(v: any): string | null {
  if (v == null) return null;

  // Protobuf JSON timestamp is usually RFC3339 string.
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }

  // Epoch seconds / ms.
  if (typeof v === "number") {
    const ms = v > 1e12 ? v : v * 1000;
    const t = new Date(ms);
    if (Number.isFinite(t.getTime())) return t.toISOString();
  }

  // { seconds, nanos } or { seconds } (protobuf)
  if (typeof v === "object") {
    const sec = (v as any).seconds;
    const nanos = (v as any).nanos;
    if (sec != null && (typeof sec === "string" || typeof sec === "number")) {
      const s = typeof sec === "string" ? parseInt(sec, 10) : sec;
      const n = typeof nanos === "number" ? nanos : 0;
      if (Number.isFinite(s)) {
        const ms = s * 1000 + Math.floor(n / 1e6);
        return new Date(ms).toISOString();
      }
    }
  }

  return null;
}

function asISODateMaybe(v: any): string | undefined {
  const iso = asISOTimestampMaybe(v);
  if (!iso) return undefined;
  return iso.slice(0, 10);
}

function durationToMs(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") {
    // Heuristic: if large, likely seconds; if small, might be minutes.
    if (v > 24 * 3600) return v * 1000; // seconds
    if (v > 24 * 60) return v * 1000; // seconds
    return v * 60000; // minutes
  }
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return durationToMs(n);
  }
  if (typeof v === "object") {
    const sec = (v as any).seconds;
    if (sec != null) return durationToMs(sec);
  }
  return null;
}
