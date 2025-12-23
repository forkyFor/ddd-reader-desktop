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
  vin?: string;
  downloadableStart?: string;
  downloadableEnd?: string;
  odometerBegin?: number;
  odometerEnd?: number;
  distanceKm?: number;
  source?: string;
};

// Minimal mapping for tachograph "member state" numeric codes seen in samples.
// (Can be extended as needed.)
const MEMBER_STATE_CODE_TO_NAME: Record<string, string> = {
  "26": "Italia",
};

function mapMemberState(v: any): string | undefined {
  if (v === null || v === undefined) return undefined;
  const k = String(v);
  return MEMBER_STATE_CODE_TO_NAME[k] ?? k;
}

function safeNum(v: any): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

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

export function toTitle(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (!isObj(v)) return String(v);

  // Common patterns from parsers
  if (typeof (v as any).title === "string") return (v as any).title;

  // Vehicle registration patterns
  const nation = (v as any).vehicleRegistrationNation ?? (v as any).vehicle_registration_nation ?? (v as any).nation;
  const num = (v as any).vehicleRegistrationNumber ?? (v as any).vehicle_registration_number ?? (v as any).number;
  if (nation && num) return `${num} (${mapMemberState(nation)})`;
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

  // -----------------------
  // VEHICLE UNIT enrichment
  // -----------------------

  const pickVu = (base: string) =>
    combinedData?.[`${base}_2_v2`] ?? combinedData?.[`${base}_2`] ?? combinedData?.[`${base}_1`] ?? combinedData?.[base];

  const vuOverview = pickVu("vu_overview");
  const vuTech = pickVu("vu_technical_data");
  const vuActivities = pickVu("vu_activities");
  const vuEventsFaults = pickVu("vu_events_and_faults");

  // VU: vehicle identity from calibration records
  if (entityType === "VEHICLE_UNIT") {
    const techArr: any[] = Array.isArray(vuTech) ? vuTech : vuTech ? [vuTech] : [];
    const calRecords: any[] = [];
    for (const t of techArr) {
      const cr = t?.vu_calibration_data?.vu_calibration_records;
      if (Array.isArray(cr)) calRecords.push(...cr);
    }

    const latestCal = calRecords
      .map((r) => ({ r, t: Date.parse(r?.new_time_value || r?.old_time_value || "") }))
      .filter((x) => Number.isFinite(x.t))
      .sort((a, b) => b.t - a.t)[0]?.r;

    const regObj = latestCal?.vehicle_registration_identification;
    const vin = typeof latestCal?.vehicle_identification_number === "string" ? latestCal.vehicle_identification_number : undefined;
    const regNum = regObj?.vehicle_registration_number;
    const regNation = regObj?.vehicle_registration_nation;

    const regTitle = regNum
      ? `${String(regNum).trim()} (${mapMemberState(regNation)})`
      : undefined;

    if (regTitle) {
      const existing = vehiclesByReg.get(regTitle) ?? { registration: regTitle };
      existing.number = existing.number ?? (regNum ? String(regNum) : undefined);
      existing.nation = existing.nation ?? (regNation !== undefined ? mapMemberState(regNation) : undefined);
      existing.vin = existing.vin ?? vin;
      existing.source = existing.source ?? "VU.calibration";
      vehiclesByReg.set(regTitle, existing);
    } else if (vin) {
      // no registration, but keep a placeholder vehicle
      const key = `VIN ${vin}`;
      const existing = vehiclesByReg.get(key) ?? { registration: key };
      existing.vin = vin;
      existing.source = existing.source ?? "VU.calibration";
      vehiclesByReg.set(key, existing);
    }

    // VU: downloadable period + current time
    const dStart = vuOverview?.vu_downloadable_period?.min_downloadable_time;
    const dEnd = vuOverview?.vu_downloadable_period?.max_downloadable_time;
    const currentDateTime = vuOverview?.current_date_time;

    // VU: odometer / activity period from vu_activities
    const actArr: any[] = Array.isArray(vuActivities) ? vuActivities : [];
    const actTimes = actArr.map((a) => a?.time_real).filter((x) => typeof x === "string").sort();
    const odoVals = actArr
      .map((a) => safeNum(a?.odometer_value_midnight))
      .filter((x): x is number => typeof x === "number")
      .sort((a, b) => a - b);
    const odometerBegin = odoVals.length ? odoVals[0] : undefined;
    const odometerEnd = odoVals.length ? odoVals[odoVals.length - 1] : undefined;
    const distanceKm =
      typeof odometerBegin === "number" && typeof odometerEnd === "number" && odometerEnd >= odometerBegin
        ? odometerEnd - odometerBegin
        : undefined;

    // Attach these to each known vehicle entry
    for (const v of vehiclesByReg.values()) {
      if (dStart) v.downloadableStart = v.downloadableStart ?? String(dStart);
      if (dEnd) v.downloadableEnd = v.downloadableEnd ?? String(dEnd);
      if (actTimes.length) {
        v.firstSeen = v.firstSeen ?? actTimes[0];
        v.lastSeen = v.lastSeen ?? actTimes[actTimes.length - 1];
      }
      if (typeof odometerBegin === "number") v.odometerBegin = v.odometerBegin ?? odometerBegin;
      if (typeof odometerEnd === "number") v.odometerEnd = v.odometerEnd ?? odometerEnd;
      if (typeof distanceKm === "number") v.distanceKm = v.distanceKm ?? distanceKm;
      // Keep current time as a pseudo lastSeen if missing
      if (!v.lastSeen && currentDateTime) v.lastSeen = String(currentDateTime);
    }
  }

  // Recompute vehicles after potential VU enrichment
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

  // VU events/faults
  if (entityType === "VEHICLE_UNIT") {
    const efArr: any[] = Array.isArray(vuEventsFaults) ? vuEventsFaults : vuEventsFaults ? [vuEventsFaults] : [];
    for (const ef of efArr) {
      const evRecs = ef?.vu_event_data?.vu_event_records;
      if (Array.isArray(evRecs)) {
        for (const r of evRecs) {
          const when = toTitle(r?.event_begin_time ?? r?.event_time) || undefined;
          const t = r?.event_type;
          const type = t !== undefined ? `EventType ${String(t)}` : undefined;
          events.push({ when, type, vehicle: vehicles[0]?.registration, source: "VU.event", raw: r });
        }
      }

      const ftRecs = ef?.vu_fault_data?.vu_fault_records;
      if (Array.isArray(ftRecs)) {
        for (const r of ftRecs) {
          const when = toTitle(r?.fault_begin_time ?? r?.fault_time) || undefined;
          const t = r?.fault_type;
          const type = t !== undefined ? `FaultType ${String(t)}` : undefined;
          faults.push({ when, type, vehicle: vehicles[0]?.registration, source: "VU.fault", raw: r });
        }
      }
    }
  }

  // Period covered
  let periodStart: string | undefined;
  let periodEnd: string | undefined;
  let dates: string[] = [];

  // Driver-card: from activity map
  const dailyMap = combinedData?.CardDriverActivity?.CardActivityDailyRecord?.dailyRecords;
  if (dailyMap && typeof dailyMap === "object") {
    dates = Object.keys(dailyMap).sort();
    periodStart = dates[0];
    periodEnd = dates.length ? dates[dates.length - 1] : undefined;
  }

  // Vehicle-unit: from activities dates or downloadable window
  if (entityType === "VEHICLE_UNIT") {
    const vuOverview = combinedData?.vu_overview_2_v2 ?? combinedData?.vu_overview_2 ?? combinedData?.vu_overview_1;
    const dStart = vuOverview?.vu_downloadable_period?.min_downloadable_time;
    const dEnd = vuOverview?.vu_downloadable_period?.max_downloadable_time;
    const actArr: any[] = Array.isArray(combinedData?.vu_activities_2_v2)
      ? combinedData.vu_activities_2_v2
      : Array.isArray(combinedData?.vu_activities_2)
        ? combinedData.vu_activities_2
        : Array.isArray(combinedData?.vu_activities_1)
          ? combinedData.vu_activities_1
          : [];
    const actTimes = actArr.map((a) => a?.time_real).filter((x) => typeof x === "string").sort();
    periodStart = (actTimes[0] ?? dStart) ? String(actTimes[0] ?? dStart) : periodStart;
    periodEnd = (actTimes.length ? actTimes[actTimes.length - 1] : dEnd) ? String(actTimes.length ? actTimes[actTimes.length - 1] : dEnd) : periodEnd;
    // Use date parts for weeksCovered
    dates = actTimes.map((t) => String(t).slice(0, 10));
  }

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
