export type IconKey =
    | "unknown"
    | "rest"
    | "work"
    | "drive"
    | "event"
    | "fault"
    | "violation"
    | "anomaly"
    | "calibration"
    | "vehicle"
    | "card"
    | "speed"
    | "power"
    | "tamper"
    | "time"
    | "warning"
    | "info"
    | "ok";

export const ICON_TOKEN_RE = /^\[\[ico:([a-z0-9_-]+)\]\]\s*(.*)$/i;

export function activityToIconKey(label: string): IconKey | null {
    const s = String(label ?? "").trim().toLowerCase();
    if (!s) return null;

    // Italian / English
    if (s === "guida" || s.includes("guida") || s === "drive" || s.includes("driv")) return "drive";
    if (s === "lavoro" || s.includes("lavor") || s === "work" || s.includes("work")) return "work";
    if (s === "riposo" || s.includes("riposo") || s.includes("pausa") || s.includes("break") || s === "rest" || s.includes("rest")) return "rest";
    if (s === "sconosciuto" || s.includes("sconosci") || s === "unknown") return "unknown";

    // Some parsers use numeric activity codes: 0=rest, 1=available, 2=work, 3=drive
    if (/^\d+$/.test(s)) {
        const n = Number(s);
        if (n === 0) return "rest";
        if (n === 2) return "work";
        if (n === 3) return "drive";
        return "unknown";
    }

    return null;
}

export function statusToIconKey(label: string): IconKey | null {
    const s = String(label ?? "").trim().toUpperCase();
    if (!s) return null;
    if (s === "OK") return "ok";
    if (s === "REDUCED") return "info";
    if (s === "INSUFFICIENT") return "warning";
    return null;
}

function includesAny(hay: string, needles: string[]): boolean {
    for (const n of needles) if (hay.includes(n)) return true;
    return false;
}

export function eventTypeToIconKey(label: string): IconKey {
    const s = String(label ?? "").trim().toLowerCase();
    if (!s) return "event";

    if (includesAny(s, ["anomaly", "anomalia", "error", "errore"])) return "anomaly";

    if (includesAny(s, ["power", "supply interruption", "interruption"])) return "power";
    if (includesAny(s, ["over speed", "overspeed", "speed"])) return "speed";
    if (includesAny(s, ["time", "clock", "adjustment"])) return "time";
    if (includesAny(s, ["tamper", "security", "breach", "manipul", "interference"])) return "tamper";
    if (includesAny(s, ["calibration", "workshop"])) return "calibration";
    if (includesAny(s, ["card", "session", "driver card", "work card"])) return "card";

    // generic keywords
    if (includesAny(s, ["fault"])) return "fault";
    if (includesAny(s, ["violation", "infring", "infrazione"])) return "violation";

    return "event";
}

export function faultTypeToIconKey(label: string): IconKey {
    const s = String(label ?? "").trim().toLowerCase();
    if (!s) return "fault";
    if (includesAny(s, ["power"])) return "power";
    if (includesAny(s, ["sensor", "motion", "unit", "tachograph", "printer", "fault"])) return "fault";
    if (includesAny(s, ["tamper", "security", "breach", "manipul"])) return "tamper";
    return "fault";
}

export function iconizeStatusLabel(label: string): string {
    const k = statusToIconKey(label);
    if (!k) return String(label ?? "");
    return `[[ico:${k}]] ${String(label ?? "")}`;
}

export function iconizeEventLabel(label: string): string {
    const k = eventTypeToIconKey(label);
    return `[[ico:${k}]] ${String(label ?? "")}`;
}

export function iconizeFaultLabel(label: string): string {
    const k = faultTypeToIconKey(label);
    return `[[ico:${k}]] ${String(label ?? "")}`;
}

export function iconizeViolationLabel(label: string): string {
    const s = String(label ?? "");
    if (!s) return "";
    return `[[ico:violation]] ${s}`;
}

export function iconizeActivityLabel(label: string): string {
    const key = activityToIconKey(label);
    if (!key) return String(label ?? "");
    return `[[ico:${key}]] ${String(label ?? "")}`;
}

export function parseIconToken(text: string): { key: string; text: string } | null {
    const m = ICON_TOKEN_RE.exec(String(text ?? ""));
    if (!m) return null;
    return { key: String(m[1]).toLowerCase(), text: m[2] ?? "" };
}
