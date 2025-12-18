import type { ReportDocument, ReportTableRow } from "./reportModel";

const PAGE_SIZE_DEFAULT = 50;

const s = (v: any, max = 2000) => {
    if (v === null || v === undefined) return "";
    let out = typeof v === "string" ? v : String(v);
    if (out.length > max) out = out.slice(0, max) + "…";
    return out;
};

function toTimeMs(v: any): number | null {
    if (!v) return null;
    if (typeof v === "string") {
        const t = Date.parse(v);
        if (!Number.isNaN(t)) return t;
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
            const t2 = Date.parse(v + "T00:00:00Z");
            if (!Number.isNaN(t2)) return t2;
        }
    }
    return null;
}

function extractFromIso(text: string): string | null {
    if (!text) return null;
    const m = text.match(/From\s+([0-9]{4}-[0-9]{2}-[0-9]{2}(?:T[^ ]+)?)\s+To/i);
    if (m?.[1]) return m[1];
    return null;
}

function sortByTimeDesc<T>(arr: T[], getTime: (x: T) => number | null): T[] {
    return [...arr].sort((a, b) => {
        const ta = getTime(a);
        const tb = getTime(b);
        if (ta === null && tb === null) return 0;
        if (ta === null) return 1;
        if (tb === null) return -1;
        return tb - ta;
    });
}

function kvRows(obj: Array<[string, any]>): string[][] {
    return obj
        .map(([k, v]) => [s(k), s(v)])
        .filter((r) => r[0] && r[1] !== "");
}

function strTable(rows: string[][], pageSize = PAGE_SIZE_DEFAULT): { rows: ReportTableRow[]; pageSize: number } {
    return {
        pageSize,
        rows: rows.map((r) => ({ cells: r.map((x) => s(x)) })),
    };
}

export function buildReport(json: any): ReportDocument {
    const blocks: ReportDocument["blocks"] = [];
    blocks.push({ type: "title", text: "DDD Report" });

    // --- Card ICC
    blocks.push({ type: "h1", text: "Card ICC Identification" });
    blocks.push({
        type: "table",
        pageSize: PAGE_SIZE_DEFAULT,
        ...strTable(
            kvRows([
                ["Clock stop", json?.CardIccIdentification?.clockStop],
                ["Card extended serial number", json?.CardIccIdentification?.cardExtendedSerialNumber],
                ["Card serial number", json?.CardIccIdentification?.cardSerialNumber],
                ["Card approval number", json?.CardIccIdentification?.cardApprovalNumber],
                ["Card personalizer ID", json?.CardIccIdentification?.cardPersonalizerId],
                ["Embedder IC assembler ID", json?.CardIccIdentification?.embedderIcAssemblerId],
                ["IC identifier", json?.CardIccIdentification?.icIdentifier],
            ])
        ),
    });

    // --- Card Chip
    blocks.push({ type: "h1", text: "Card Chip Identification" });
    blocks.push({
        type: "table",
        pageSize: PAGE_SIZE_DEFAULT,
        ...strTable(
            kvRows([
                ["Chip serial number", json?.CardChipIdentification?.chipSerialNumber],
                ["Chip approval number", json?.CardChipIdentification?.chipApprovalNumber],
                ["Chip personalizer ID", json?.CardChipIdentification?.chipPersonalizerId],
            ])
        ),
    });

    // --- Driver Card App ID
    blocks.push({ type: "h1", text: "Driver Card Application Identification" });
    blocks.push({
        type: "table",
        pageSize: PAGE_SIZE_DEFAULT,
        ...strTable(
            kvRows([
                ["Type of tachograph card", json?.DriverCardApplicationIdentification?.typeOfTachographCardId],
                ["Card issuing member state", json?.DriverCardApplicationIdentification?.cardIssuingMemberState],
                ["Card structure version", json?.DriverCardApplicationIdentification?.cardStructureVersion],
            ])
        ),
    });

    // --- Identification
    const id = json?.Identification ?? {};
    blocks.push({ type: "h1", text: "Identificazione" });
    blocks.push({
        type: "table",
        pageSize: PAGE_SIZE_DEFAULT,
        ...strTable(
            kvRows([
                ["Card number", id?.cardNumber],
                ["Issuing state", id?.cardIssuingMemberState],
                ["Issuing authority", id?.cardIssuingAuthorityName],
                ["Issue date", id?.cardIssueDate],
                ["Expiry date", id?.cardExpiryDate],
                ["Holder surname", id?.cardHolderName?.surname],
                ["Holder first names", id?.cardHolderName?.firstNames],
                ["Holder birth date", id?.cardHolderBirthDate?.title],
            ])
        ),
    });

    // --- Current use
    blocks.push({ type: "h1", text: "Card Current Use" });
    blocks.push({
        type: "table",
        pageSize: PAGE_SIZE_DEFAULT,
        ...strTable(
            kvRows([
                ["Session open time", json?.CardCurrentUse?.sessionOpenTime],
                ["Session open vehicle", json?.CardCurrentUse?.sessionOpenVehicle?.title],
            ])
        ),
    });

    // --- Last download
    blocks.push({ type: "h1", text: "Last Card Download" });
    blocks.push({
        type: "table",
        pageSize: PAGE_SIZE_DEFAULT,
        ...strTable(kvRows([["Last download", json?.LastCardDownload?.lastCardDownload]])),
    });

    // --- Driving license
    blocks.push({ type: "h1", text: "Driving License Information" });
    blocks.push({
        type: "table",
        pageSize: PAGE_SIZE_DEFAULT,
        ...strTable(
            kvRows([
                ["Driving license issuing authority", json?.CardDrivingLicenseInformation?.drivingLicenseIssuingAuthority],
                ["Driving license issuing nation", json?.CardDrivingLicenseInformation?.drivingLicenseIssuingNation],
                ["Driving license number", json?.CardDrivingLicenseInformation?.drivingLicenseNumber],
            ])
        ),
    });

    // --- Control activity
    blocks.push({ type: "h1", text: "Control Activity Data Record" });
    blocks.push({
        type: "table",
        pageSize: PAGE_SIZE_DEFAULT,
        ...strTable(
            kvRows([
                ["Control type", json?.CardControlActivityDataRecord?.controlType],
                ["Control time", json?.CardControlActivityDataRecord?.controlTime],
                ["Control card number", json?.CardControlActivityDataRecord?.controlCardNumber],
                ["Control vehicle registration", json?.CardControlActivityDataRecord?.controlVehicleRegistration?.title],
                ["Control download period", json?.CardControlActivityDataRecord?.controlDownloadPeriod?.title],
            ])
        ),
    });

    // --- Events
    const eventRecords =
        json?.CardEventData?.CardEventRecord?.records ??
        json?.CardEventData?.records ??
        [];
    blocks.push({ type: "h1", text: "Eventi" });
    if (!Array.isArray(eventRecords) || eventRecords.length === 0) {
        blocks.push({ type: "p", text: "Nessun evento disponibile." });
    } else {
        const sortedEvents = sortByTimeDesc(eventRecords, (e: any) =>
            toTimeMs(e?.eventTime) ??
            toTimeMs(e?.time) ??
            toTimeMs(extractFromIso(e?.title || "")) ??
            null
        );

        blocks.push({
            type: "table",
            pageSize: PAGE_SIZE_DEFAULT,
            headers: ["#", "Tipo", "Data/Ora", "Dettagli"],
            rows: sortedEvents.map((e: any, idx: number) => ({
                cells: [
                    String(idx + 1),
                    s(e?.eventType ?? e?.type ?? e?.title),
                    s(e?.eventTime ?? e?.time ?? extractFromIso(e?.title || "")),
                    s(e?.eventVehicleRegistration?.title ?? e?.vehicle ?? e?.details ?? ""),
                ],
            })),
        });
    }

    // --- Faults
    const faultRecords =
        json?.CardFaultData?.CardFaultRecord?.records ??
        json?.CardFaultData?.records ??
        [];
    blocks.push({ type: "h1", text: "Fault" });
    if (!Array.isArray(faultRecords) || faultRecords.length === 0) {
        blocks.push({ type: "p", text: "Nessun fault disponibile." });
    } else {
        const sortedFaults = sortByTimeDesc(faultRecords, (f: any) =>
            toTimeMs(f?.faultTime) ??
            toTimeMs(f?.time) ??
            toTimeMs(extractFromIso(f?.title || "")) ??
            null
        );

        blocks.push({
            type: "table",
            pageSize: PAGE_SIZE_DEFAULT,
            headers: ["#", "Tipo", "Data/Ora", "Dettagli"],
            rows: sortedFaults.map((f: any, idx: number) => ({
                cells: [
                    String(idx + 1),
                    s(f?.faultType ?? f?.type ?? f?.title),
                    s(f?.faultTime ?? f?.time ?? extractFromIso(f?.title || "")),
                    s(f?.faultVehicleRegistration?.title ?? f?.vehicle ?? f?.details ?? ""),
                ],
            })),
        });
    }

    // --- Places
    const placeRecords = json?.CardPlaceDailyWorkPeriod?.PlaceRecord?.records ?? [];
    blocks.push({ type: "h1", text: "Place Daily Work Period" });
    if (!Array.isArray(placeRecords) || placeRecords.length === 0) {
        blocks.push({ type: "p", text: "Nessun record disponibile." });
    } else {
        const sortedPlaces = sortByTimeDesc(placeRecords, (p: any) => toTimeMs(p?.entryTime));
        blocks.push({
            type: "table",
            pageSize: PAGE_SIZE_DEFAULT,
            headers: ["#", "Entry time", "Paese", "Regione", "Odometer", "Tipo"],
            rows: sortedPlaces.map((p: any, idx: number) => ({
                cells: [
                    String(idx + 1),
                    s(p?.entryTime),
                    s(p?.dailyWorkPeriodCountry?.title ?? p?.dailyWorkPeriodCountry),
                    s(p?.dailyWorkPeriodRegion?.title ?? p?.dailyWorkPeriodRegion),
                    s(p?.vehicleOdometerValue),
                    s(p?.entryTypeDailyWorkPeriod),
                ],
            })),
        });
    }

    // --- Vehicles used
    const vehicleRecords = json?.CardVehiclesUsed?.CardVehicleRecord?.records ?? [];
    blocks.push({ type: "h1", text: "Veicoli usati" });
    if (!Array.isArray(vehicleRecords) || vehicleRecords.length === 0) {
        blocks.push({ type: "p", text: "Nessun veicolo disponibile." });
    } else {
        const sortedVehicles = sortByTimeDesc(vehicleRecords, (v: any) => {
            const from = extractFromIso(v?.vehicleUse || "") ?? extractFromIso(v?.title || "");
            return toTimeMs(from);
        });

        blocks.push({
            type: "table",
            pageSize: PAGE_SIZE_DEFAULT,
            headers: ["#", "Registrazione", "Periodo (From…To)", "Odometer begin", "Odometer end"],
            rows: sortedVehicles.map((v: any, idx: number) => ({
                cells: [
                    String(idx + 1),
                    s(v?.registration?.title ?? v?.registration ?? ""),
                    s(v?.vehicleUse ?? extractFromIso(v?.title || "") ?? v?.title),
                    s(v?.vehicleOdometerBegin),
                    s(v?.vehicleOdometerEnd),
                ],
            })),
        });
    }

    // --- Driver Activity (collassabile)
    const dailyRecordsObj = json?.CardDriverActivity?.CardActivityDailyRecord?.dailyRecords ?? {};
    const dayKeys = Object.keys(dailyRecordsObj);

    blocks.push({ type: "h1", text: "Driver Activity (clicca una riga per il dettaglio)" });

    if (dayKeys.length === 0) {
        blocks.push({ type: "p", text: "Nessuna attività giornaliera disponibile." });
    } else {
        const sortedDays = [...dayKeys].sort((a, b) => {
            const ta = toTimeMs(a);
            const tb = toTimeMs(b);
            if (ta === null && tb === null) return 0;
            if (ta === null) return 1;
            if (tb === null) return -1;
            return tb - ta;
        });

        const rows: ReportTableRow[] = sortedDays.map((d) => {
            const rec = dailyRecordsObj[d];
            const changes = rec?.ActivityChangeInfo?.records ?? [];

            // Ordina attività del giorno: più recente prima
            const sortedChanges = sortByTimeDesc(changes, (c: any) => {
                const from = c?.from;
                if (typeof from === "string" && /^\d{2}:\d{2}$/.test(from)) {
                    return Date.parse(`${d}T${from}:00Z`);
                }
                return toTimeMs(extractFromIso(c?.time || "")) ?? null;
            });

            const detailRows = sortedChanges.map((c: any, idx: number) => [
                String(idx + 1),
                s(c?.activity),
                s(c?.from),
                s(c?.duration),
                s(c?.time),
                s(c?.["slot status"]),
            ]);

            return {
                cells: [
                    s(rec?.activityRecordDate ?? d),
                    s(rec?.activityDayDistance),
                    s(rec?.activityRecordLength),
                    s(rec?.activityPresenceCounter),
                ],
                details: {
                    title: `Dettaglio attività - ${d}`,
                    headers: ["#", "Activity", "From", "Duration", "Time", "Slot status"],
                    rows: detailRows.length ? detailRows : [["", "Nessun dettaglio disponibile.", "", "", "", ""]],
                },
            };
        });

        blocks.push({
            type: "table",
            pageSize: PAGE_SIZE_DEFAULT,
            headers: ["Data", "Distanza (km)", "Record length", "Presence counter"],
            rows,
        });
    }

    return { blocks };
}
