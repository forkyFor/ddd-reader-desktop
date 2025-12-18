export type VehicleRow = {
    title?: string;
    vehicleUse?: string;
    registration?: {
        vehicleRegistrationNation?: string;
        vehicleRegistrationNumber?: string;
        title?: string;
    };
    vehicleOdometerBegin?: string;
    vehicleOdometerEnd?: string;
    vuDataBlockCounter?: number;
};

export type PlaceRow = {
    title?: string;
    entryTime?: string;
    entryTypeDailyWorkPeriod?: string;
    dailyWorkPeriodCountry?: string;
    dailyWorkPeriodRegion?: string;
    vehicleOdometerValue?: string;
};

export type ActivityRow = {
    day: string; // YYYY-MM-DD
    startIso: string; // used for sorting/display
    from?: string;
    duration?: string;
    activity?: string;
    activityCode?: number;
    time?: string;
    slotStatus?: string;
    rawData?: string;
    title?: string;
    dayDistance?: string;
    presenceCounter?: number;
};

function firstMatchDate(value?: string): Date | null {
    if (!value || value === "undefined") return null;

    // ISO Z
    const iso = value.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/);
    if (iso) return new Date(iso[0]);

    // date only
    const dateOnly = value.match(/\d{4}-\d{2}-\d{2}/);
    if (dateOnly) return new Date(`${dateOnly[0]}T00:00:00Z`);

    return null;
}

function extractPeriod(value?: string): { start?: Date; end?: Date } {
    if (!value) return {};
    // prende 1° e 2° data/iso trovate
    const matches =
        value.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g) ??
        value.match(/\d{4}-\d{2}-\d{2}/g) ??
        [];
    const start = matches[0] ? firstMatchDate(matches[0]) ?? undefined : undefined;
    const end = matches[1] ? firstMatchDate(matches[1]) ?? undefined : undefined;
    return { start, end };
}

function pad2(n: number) {
    return String(n).padStart(2, "0");
}

function buildIsoFromDayAndHHMM(day: string, hhmm?: string): string {
    // hhmm potrebbe essere "24:00" => lo portiamo a 23:59:59
    if (!hhmm) return `${day}T00:00:00Z`;
    const m = hhmm.match(/^(\d{2}):(\d{2})$/);
    if (!m) return `${day}T00:00:00Z`;

    let hh = Number(m[1]);
    let mm = Number(m[2]);

    if (hh === 24) {
        hh = 23;
        mm = 59;
        return `${day}T${pad2(hh)}:${pad2(mm)}:59Z`;
    }
    return `${day}T${pad2(hh)}:${pad2(mm)}:00Z`;
}

export function parseVehicles(data: any): VehicleRow[] {
    const rows: VehicleRow[] = data?.CardVehiclesUsed?.CardVehicleRecord?.records ?? [];
    const sorted = [...rows].sort((a, b) => {
        const aStart = extractPeriod(a.vehicleUse).start ?? firstMatchDate(a.title ?? "") ?? new Date(0);
        const bStart = extractPeriod(b.vehicleUse).start ?? firstMatchDate(b.title ?? "") ?? new Date(0);
        return bStart.getTime() - aStart.getTime();
    });
    return sorted;
}

export function parsePlaces(data: any): PlaceRow[] {
    const rows: PlaceRow[] = data?.CardPlaceDailyWorkPeriod?.PlaceRecord?.records ?? [];
    const sorted = [...rows].sort((a, b) => {
        const aT = firstMatchDate(a.entryTime ?? a.title ?? "") ?? new Date(0);
        const bT = firstMatchDate(b.entryTime ?? b.title ?? "") ?? new Date(0);
        return bT.getTime() - aT.getTime();
    });
    return sorted;
}

export function parseActivities(data: any): ActivityRow[] {
    const dailyRecords = data?.CardDriverActivity?.CardActivityDailyRecord?.dailyRecords ?? {};
    const rows: ActivityRow[] = [];

    for (const [day, dayObj] of Object.entries<any>(dailyRecords)) {
        const recs = dayObj?.ActivityChangeInfo?.records ?? [];
        for (const r of recs) {
            const startIso = buildIsoFromDayAndHHMM(day, r?.from);
            rows.push({
                day,
                startIso,
                from: r?.from,
                duration: r?.duration,
                activity: r?.activity,
                activityCode: r?.activityCode,
                time: r?.time,
                slotStatus: r?.["slot status"],
                rawData: r?.["Raw data"],
                title: r?.title,
                dayDistance: dayObj?.activityDayDistance,
                presenceCounter: dayObj?.activityPresenceCounter,
            });
        }
    }

    rows.sort((a, b) => new Date(b.startIso).getTime() - new Date(a.startIso).getTime());
    return rows;
}

export function flattenKeyValues(obj: any, prefix = "", depth = 0, maxDepth = 3) {
    // Ritorna righe {key, value} “leggibili” per sezioni anagrafiche/certificati ecc.
    const out: Array<{ key: string; value: any }> = [];
    if (!obj || typeof obj !== "object") return out;

    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;

        if (v == null) {
            out.push({ key, value: v });
            continue;
        }

        if (Array.isArray(v)) {
            out.push({ key, value: `Array(${v.length})` });
            continue;
        }

        if (typeof v === "object") {
            // se ha "title", la mostriamo subito
            if ("title" in v && typeof (v as any).title === "string") {
                out.push({ key: `${key}.title`, value: (v as any).title });
            }
            if (depth < maxDepth) {
                out.push(...flattenKeyValues(v, key, depth + 1, maxDepth));
            } else {
                out.push({ key, value: "[object]" });
            }
            continue;
        }

        out.push({ key, value: v });
    }

    // Ordine stabile
    out.sort((a, b) => a.key.localeCompare(b.key));
    return out;
}
