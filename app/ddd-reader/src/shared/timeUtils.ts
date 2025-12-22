export function s(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Parses "HH:MM" to minutes. Returns 0 on invalid input. */
export function parseHHMM(hhmm: string | undefined | null): number {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(hhmm ?? ""));
  if (!m) return 0;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return 0;
  return h * 60 + mm;
}

/** Same format as HH:MM in most parsers (duration). */
export function parseDurationHHMM(duration: string | undefined | null): number {
  return parseHHMM(duration);
}

export function fmtMinutes(mins: number | undefined | null): string {
  const m = Number(mins ?? 0);
  if (!Number.isFinite(m)) return "00:00";
  const sign = m < 0 ? "-" : "";
  const abs = Math.abs(Math.round(m));
  const h = Math.floor(abs / 60);
  const mm = abs % 60;
  return `${sign}${pad2(h)}:${pad2(mm)}`;
}

export function parseDateKey(dateKey: string): Date | null {
  const d = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(dateKey: string, days: number): string {
  const d = parseDateKey(dateKey) ?? new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return toDateKey(d);
}

/** Returns ISO week key like "2025-W03" based on a YYYY-MM-DD key. */
export function isoWeekKey(dateKey: string): string {
  const d0 = parseDateKey(dateKey);
  if (!d0) return "";
  const d = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate()));

  // ISO week starts on Monday, week 1 is the week with the first Thursday.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+d - +yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad2(weekNo)}`;
}
