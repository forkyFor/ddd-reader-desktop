import { isoWeekKey } from "./timeUtils";

export type NormalizedEntityType = "DRIVER_CARD" | "VEHICLE_UNIT" | "UNKNOWN";

export type NormalizedDriver = {
  name?: string;
  surname?: string;
  firstNames?: string;
  birthDate?: string;
  cardNumber?: string;
  cardExpiryDate?: string;
  cardIssuingMemberState?: string;
};

export type NormalizedVehicle = {
  registration?: string;
  nation?: string;
  number?: string;
  firstSeen?: string;
  lastSeen?: string;
  // Driver-card vehicle usage records (when available)
  odometerBegin?: number;
  odometerEnd?: number;
  distanceKm?: number;
  sessions?: number;
};

export type NormalizedEvent = {
  when?: string;
  type?: string;
  vehicle?: string;
  source?: string;
  raw?: any;
};

export type NormalizedFault = {
  when?: string;
  type?: string;
  vehicle?: string;
  source?: string;
  raw?: any;
};

export type NormalizedOutput = {
  entityType: NormalizedEntityType;
  driver?: NormalizedDriver;
  vehicles: NormalizedVehicle[];
  events: NormalizedEvent[];
  faults: NormalizedFault[];
  periodStart?: string;
  periodEnd?: string;
  // quick QA
  weeksCovered?: string[];
};

function isObj(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asNumber(v: any): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const m = String(v).match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return undefined;
  const n = Number(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function parseUseRangeTitle(vehicleUse: any): { from?: string; to?: string } {
  const t = toTitle(vehicleUse);
  if (!t) return {};
  // Common: "From 2013-01-10T17:33Z To 2013-01-11T13:46Z"
  const m = t.match(/From\s+([^ ]+)\s+To\s+([^ ]+)/i);
  if (m?.[1] && m?.[2]) return { from: m[1], to: m[2] };
  return {};
}

export function toTitle(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (!isObj(v)) return String(v);

  // Common patterns from parsers
  if (typeof (v as any).title === "string") return (v as any).title;

  // Vehicle registration patterns
  const regObj = (v as any).vehicle_registration_identification && isObj((v as any).vehicle_registration_identification)
    ? (v as any).vehicle_registration_identification
    : v;

  const nation = (regObj as any).vehicleRegistrationNation ?? (regObj as any).vehicle_registration_nation ?? (regObj as any).nation;
  const num = (regObj as any).vehicleRegistrationNumber ?? (regObj as any).vehicle_registration_number ?? (regObj as any).number;
  if (nation && num) return `${num} (${nation})`;
  if (num) return String(num);

  // Person name patterns
  const surname = (v as any).surname;
  const firstNames = (v as any).firstNames ?? (v as any).first_names;
  if (surname || firstNames) {
    const s = surname ? String(surname).trim() : "";
    const f = firstNames ? String(firstNames).trim() : "";
    return [s, f].filter(Boolean).join(" ").trim();
  }

  // Birth date pattern
  if (typeof (v as any).year === "number" || typeof (v as any).year === "string") {
    const y = String((v as any).year).padStart(4, "0");
    const m = String((v as any).month ?? "").padStart(2, "0");
    const d = String((v as any).day ?? "").padStart(2, "0");
    if (m && d) return `${y}-${m}-${d}`;
    return y;
  }

  // Fallback: try to pick the most human-looking scalar
  for (const k of ["name", "value", "id", "number", "code"]) {
    if (typeof (v as any)[k] === "string") return (v as any)[k];
  }

  try {
    const s = JSON.stringify(v);
    return s.length > 200 ? s.slice(0, 200) + "…" : s;
  } catch {
    return "";
  }
}

export function normalizeMergedOutput(args: { combinedData: any; dddPath?: string }): NormalizedOutput {
  const { combinedData, dddPath } = args;

  const fileName = (dddPath ?? "").split(/[\\/]/).pop()?.toUpperCase() ?? "";

  const isDriverByData = !!combinedData?.CardDriverActivity || !!combinedData?.Identification?.cardNumber;
  const isVuByData = !!combinedData?.vehicleUnit || combinedData?.type === "VEHICLE_UNIT" || !!combinedData?.vu_overview_1;

  let entityType: NormalizedEntityType = "UNKNOWN";
  if (fileName.startsWith("C_")) entityType = "DRIVER_CARD";
  else if (fileName.startsWith("M_")) entityType = "VEHICLE_UNIT";
  else if (isDriverByData && !isVuByData) entityType = "DRIVER_CARD";
  else if (isVuByData && !isDriverByData) entityType = "VEHICLE_UNIT";
  else if (isDriverByData) entityType = "DRIVER_CARD";
  else if (isVuByData) entityType = "VEHICLE_UNIT";

  // Driver
  const id = combinedData?.Identification ?? {};
  const nameObj = id?.cardHolderName;
  const driver: NormalizedDriver | undefined = isDriverByData
    ? {
        surname: isObj(nameObj) ? String(nameObj?.surname ?? "").trim() || undefined : undefined,
        firstNames: isObj(nameObj) ? String(nameObj?.firstNames ?? "").trim() || undefined : undefined,
        name: (() => {
          const n = toTitle(nameObj);
          return n || undefined;
        })(),
        birthDate: toTitle(id?.cardHolderBirthDate) || undefined,
        cardNumber: toTitle(id?.cardNumber) || undefined,
        cardExpiryDate: toTitle(id?.cardExpiryDate) || undefined,
        cardIssuingMemberState: toTitle(id?.cardIssuingMemberState) || undefined,
      }
    : undefined;

  // Vehicles from CardVehiclesUsed
  const vehicleRecs: any[] = Array.isArray(combinedData?.CardVehiclesUsed?.CardVehicleRecord?.records)
    ? combinedData.CardVehiclesUsed.CardVehicleRecord.records
    : [];
  const vehiclesByReg = new Map<string, NormalizedVehicle>();
  for (const r of vehicleRecs) {
    const reg = toTitle(r?.registration ?? r?.vehicleRegistration ?? r?.eventVehicleRegistration);
    const regObj = r?.registration ?? r?.vehicleRegistration ?? r?.eventVehicleRegistration;
    const nation = isObj(regObj)
      ? (regObj.vehicleRegistrationNation ?? regObj.vehicle_registration_nation ?? regObj.nation)
      : undefined;
    const num = isObj(regObj)
      ? (regObj.vehicleRegistrationNumber ?? regObj.vehicle_registration_number ?? regObj.number)
      : undefined;
    if (!reg) continue;
    const existing = vehiclesByReg.get(reg) ?? { registration: reg };
    if (nation) existing.nation = String(nation);
    if (num) existing.number = String(num);

    const start = toTitle(r?.vehicleFirstUse ?? r?.firstUse ?? r?.first_seen);
    const end = toTitle(r?.vehicleLastUse ?? r?.lastUse ?? r?.last_seen);
    if (start && !existing.firstSeen) existing.firstSeen = start;
    if (end) existing.lastSeen = end;

    // Odometers (if provided by the parser)
    const odoBegin = asNumber(r?.vehicleOdometerBegin ?? r?.odometerBegin ?? r?.odometer_begin);
    const odoEnd = asNumber(r?.vehicleOdometerEnd ?? r?.odometerEnd ?? r?.odometer_end);
    if (odoBegin !== undefined) {
      existing.odometerBegin = existing.odometerBegin === undefined ? odoBegin : Math.min(existing.odometerBegin, odoBegin);
    }
    if (odoEnd !== undefined) {
      existing.odometerEnd = existing.odometerEnd === undefined ? odoEnd : Math.max(existing.odometerEnd, odoEnd);
    }

    existing.sessions = (existing.sessions ?? 0) + 1;

    if (existing.odometerBegin !== undefined && existing.odometerEnd !== undefined) {
      const dist = existing.odometerEnd - existing.odometerBegin;
      if (Number.isFinite(dist) && dist >= 0) existing.distanceKm = dist;
    }

    vehiclesByReg.set(reg, existing);
  }

  // Also include registrations found in events
  const eventsRaw: any[] = Array.isArray(combinedData?.CardEventData?.CardEventRecord?.records)
    ? combinedData.CardEventData.CardEventRecord.records
    : [];
  for (const e of eventsRaw) {
    const reg = toTitle(e?.eventVehicleRegistration);
    if (reg) {
      vehiclesByReg.set(reg, vehiclesByReg.get(reg) ?? { registration: reg });
    }
  }

  const vehicles = [...vehiclesByReg.values()].sort((a, b) => (a.registration ?? "").localeCompare(b.registration ?? ""));

  // Events/Faults
  const events: NormalizedEvent[] = eventsRaw.map((e) => ({
    when: toTitle(e?.eventTime) || undefined,
    type: toTitle(e?.eventType) || undefined,
    vehicle: toTitle(e?.eventVehicleRegistration) || undefined,
    source: "CardEventData",
    raw: e,
  }));

  const faultsRaw: any[] = Array.isArray(combinedData?.CardFaultData?.CardFaultRecord?.records)
    ? combinedData.CardFaultData.CardFaultRecord.records
    : [];
  const faults: NormalizedFault[] = faultsRaw.map((f) => ({
    when: toTitle(f?.faultTime ?? f?.eventTime) || undefined,
    type: toTitle(f?.faultType ?? f?.eventType) || undefined,
    vehicle: toTitle(f?.faultVehicleRegistration ?? f?.eventVehicleRegistration) || undefined,
    source: "CardFaultData",
    raw: f,
  }));

  // Period covered from driver activity (if present)
  const dailyMap = combinedData?.CardDriverActivity?.CardActivityDailyRecord?.dailyRecords;
  const dates = dailyMap && typeof dailyMap === "object" ? Object.keys(dailyMap).sort() : [];
  const periodStart = dates[0];
  const periodEnd = dates.length ? dates[dates.length - 1] : undefined;

  // Quick week coverage hint
  const weeksCovered = dates.length ? Array.from(new Set(dates.map(isoWeekKey))).sort() : [];

  return {
    entityType,
    driver,
    vehicles,
    events,
    faults,
    periodStart,
    periodEnd,
    weeksCovered,
  };
}
