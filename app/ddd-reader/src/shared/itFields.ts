// Utilities to render tachograph raw JSON as readable Italian key/value rows.
// Expands nested objects/arrays into individual fields.

export type ItKvRow = [string, string];

function isObj(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

const MEMBER_STATE_CODE_TO_IT: Record<string, string> = {
  "26": "Italia",
};

function mapMemberStateIt(v: any): string {
  if (v === null || v === undefined) return "";
  const k = String(v);
  return MEMBER_STATE_CODE_TO_IT[k] ?? k;
}

const TOKEN_IT: Record<string, string> = {
  event: "evento",
  fault: "guasto",
  calibration: "calibrazione",
  record: "record",
  purpose: "finalità",
  begin: "inizio",
  end: "fine",
  time: "ora",
  number: "numero",
  similar: "simili",
  card: "carta",
  driver: "conducente",
  codriver: "co-conducente",
  slot: "slot",
  issuing: "rilascio",
  member: "membro",
  state: "stato",
  workshop: "officina",
  address: "indirizzo",
  expiry: "scadenza",
  date: "data",
  vehicle: "veicolo",
  registration: "targa",
  identification: "identificazione",
  nation: "stato",
  authorised: "autorizzata",
  speed: "velocità",
  odometer: "contachilometri",
  old: "precedente",
  new: "nuovo",
  tyre: "pneumatico",
  size: "misura",
  circumference: "circonferenza",
  constant: "costante",
  equipment: "apparato",
  recording: "registrazione",
  characteristic: "caratteristica",
  k: "k",
  w: "w",
  l: "l",
};

const KEY_IT: Record<string, string> = {
  // --- VU/Driver events & faults ---
  event_type: "Tipo evento (codice)",
  event_record_purpose: "Finalità record evento",
  event_begin_time: "Inizio evento",
  event_end_time: "Fine evento",
  fault_type: "Tipo guasto (codice)",
  fault_record_purpose: "Finalità record guasto",
  fault_begin_time: "Inizio guasto",
  fault_end_time: "Fine guasto",
  similar_events_number: "Numero eventi simili",
  similar_faults_number: "Numero guasti simili",

  // --- Card numbers inside events/faults/calibrations ---
  card_number_driver_slot_begin: "Carta conducente (slot inizio)",
  card_number_codriver_slot_begin: "Carta co-conducente (slot inizio)",
  card_number_driver_slot_end: "Carta conducente (slot fine)",
  card_number_codriver_slot_end: "Carta co-conducente (slot fine)",
  card_type: "Tipo carta",
  card_issuing_member_state: "Stato membro di rilascio",
  card_number: "Numero carta",

  // --- Calibration ---
  calibration_purpose: "Finalità calibrazione",
  workshop_name: "Nome officina",
  workshop_address: "Indirizzo officina",
  workshop_card_number: "Carta officina",
  workshop_card_expiry_date: "Scadenza carta officina",
  vehicle_identification_number: "VIN",
  vehicle_registration_identification: "Targa",
  vehicle_registration_nation: "Stato membro immatricolazione",
  vehicle_registration_number: "Numero targa",
  w_vehicle_characteristic_constant: "Costante caratteristica veicolo (w)",
  k_constant_of_recording_equipment: "Costante tachigrafo (k)",
  l_tyre_circumference: "Circonferenza pneumatico (l)",
  tyre_size: "Misura pneumatico",
  authorised_speed: "Velocità autorizzata",
  old_odometer_value: "Contachilometri precedente",
  new_odometer_value: "Contachilometri nuovo",
  old_time_value: "Ora precedente",
  new_time_value: "Ora nuova",
  next_calibration_date: "Prossima calibrazione",

  // --- Card IW (VU activities) ---
  card_insertion_time: "Inserimento carta",
  card_withdrawal_time: "Estrazione carta",
  card_slot_number: "Numero slot",
  manual_input_flag: "Inserimento manuale",
  vehicle_odometer_value_at_insertion: "Contachilometri (inserimento)",
  vehicle_odometer_value_at_withdrawal: "Contachilometri (estrazione)",
  previous_vehicle_info: "Veicolo precedente",
  card_holder_name: "Intestatario carta",
  holder_surname: "Cognome",
  holder_first_names: "Nome",

  // --- Driver daily activity segments ---
  activity: "Attività",
  activityCode: "Codice attività",
  "slot status": "Stato slot",
  "Raw data": "Dati grezzi",
  from: "Da",
  duration: "Durata",
  activityDayDistance: "Distanza giorno (km)",

  // --- Place Daily Work Period ---
  entryTime: "Data/ora registrazione",
  entryTypeDailyWorkPeriod: "Tipo registrazione",
  dailyWorkPeriodCountry: "Paese",
  dailyWorkPeriodRegion: "Regione",
  vehicleOdometerValue: "Contachilometri",

};

function capText(s: string, maxLen = 4000): string {
  if (!s) return "";
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "…";
}

export function labelIt(rawKey: string): string {
  const k = String(rawKey ?? "").trim();
  if (!k) return "";
  if (KEY_IT[k]) return KEY_IT[k];

  // fallback: snake_case / camelCase -> human-ish Italian
  const snake = k
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/__+/g, "_")
    .toLowerCase();

  const parts = snake.split("_").filter(Boolean);
  if (!parts.length) return k;

  const mapped = parts.map((p) => TOKEN_IT[p] ?? p);
  const out = mapped.join(" ");
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export function formatValueIt(key: string, value: any, maxLen = 4000): string {
  if (value === null || value === undefined) return "";

  // boolean
  if (typeof value === "boolean") return value ? "Sì" : "No";

  // numbers
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return String(value);
  }

  // strings
  if (typeof value === "string") {
    const s = value;
    const k = String(key ?? "");

    // Member state / nation codes
    if (/member_state$/i.test(k) || /registration_nation$/i.test(k) || k.includes("member_state") || k.includes("registration_nation")) {
      const name = mapMemberStateIt(s);
      if (name && name !== s) return `${name} (${s})`;
      return name || s;
    }

    return capText(s, maxLen);
  }

  // arrays
  if (Array.isArray(value)) {
    const arr = value;
    if (arr.every((x) => x === null || x === undefined || ["string", "number", "boolean"].includes(typeof x))) {
      return capText(arr.map((x) => (x === null || x === undefined ? "" : String(x))).filter(Boolean).join(", "), maxLen);
    }
    return `(${arr.length} elementi)`;
  }

  // objects: should be flattened by caller, but keep a safe fallback.
  if (isObj(value)) {
    try {
      const s = JSON.stringify(value);
      return capText(s, maxLen);
    } catch {
      return "";
    }
  }

  try {
    return capText(String(value), maxLen);
  } catch {
    return "";
  }
}

export function flattenToItalianRows(input: any, opts?: { maxDepth?: number; maxArrayItems?: number }): ItKvRow[] {
  const maxDepth = opts?.maxDepth ?? 6;
  const maxArrayItems = opts?.maxArrayItems ?? 50;

  const out: ItKvRow[] = [];
  const seen = new Set<any>();

  const walk = (val: any, rawKey: string, prefixLabel: string, depth: number) => {
    const k = String(rawKey ?? "");
    const label = labelIt(k);
    const fullLabel = prefixLabel ? `${prefixLabel} – ${label}` : label;

    if (val === null || val === undefined) {
      out.push([fullLabel, ""]);
      return;
    }

    if (depth >= maxDepth) {
      out.push([fullLabel, formatValueIt(k, val)]);
      return;
    }

    if (Array.isArray(val)) {
      if (val.length === 0) {
        out.push([fullLabel, ""]);
        return;
      }

      const limited = val.slice(0, maxArrayItems);
      for (let i = 0; i < limited.length; i++) {
        const item = limited[i];
        const itemLabel = `${fullLabel} #${i + 1}`;
        if (isObj(item)) {
          if (seen.has(item)) {
            out.push([itemLabel, "(riferimento)" ]);
            continue;
          }
          seen.add(item);
          for (const [ck, cv] of Object.entries(item)) {
            walk(cv, ck, itemLabel, depth + 1);
          }
        } else if (Array.isArray(item)) {
          out.push([itemLabel, formatValueIt(k, item)]);
        } else {
          out.push([itemLabel, formatValueIt(k, item)]);
        }
      }
      if (val.length > maxArrayItems) {
        out.push([`${fullLabel} (altri)`, `… +${val.length - maxArrayItems} elementi`]);
      }
      return;
    }

    if (isObj(val)) {
      if (seen.has(val)) {
        out.push([fullLabel, "(riferimento)"]);
        return;
      }
      seen.add(val);
      const entries = Object.entries(val);
      if (entries.length === 0) {
        out.push([fullLabel, ""]);
        return;
      }
      for (const [ck, cv] of entries) {
        walk(cv, ck, fullLabel, depth + 1);
      }
      return;
    }

    // primitive
    out.push([fullLabel, formatValueIt(k, val)]);
  };

  if (isObj(input)) {
    for (const [k, v] of Object.entries(input)) {
      walk(v, k, "", 0);
    }
    return out;
  }

  // non-object root
  out.push(["Valore", formatValueIt("value", input)]);
  return out;
}
