import type { ReportDocument, ReportTableRow } from "./reportModel";

const PAGE_SIZE_DEFAULT = 50;

const s = (v: any, max = 2000) => {
    if (v === null || v === undefined) return "";
    let out = typeof v === "string" ? v : String(v);
    if (out.length > max) out = out.slice(0, max) + "…";
    return out;
};

function parseKm(v: any): number | null {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return v;

    const str = String(v).trim();
    // es: "0 km", "9 km", "12.5 km", "12,5 km"
    const m = str.match(/-?\d+(?:[.,]\d+)?/);
    if (!m) return null;

    const n = Number(m[0].replace(",", "."));
    return Number.isFinite(n) ? n : null;
}


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
    return { pageSize, rows: rows.map((r) => ({ cells: r.map((x) => s(x)) })) };
}

/* ---------------------------
   DETECTION + NORMALIZATION
---------------------------- */

function unwrapIfNeeded(input: any): any {
    // support wrapper { parserUsed, data, ... }
    if (input && typeof input === "object" && "data" in input && (input.parserUsed || input.primaryError)) {
        return input.data;
    }
    return input;
}

function isReadEsmShape(j: any): boolean {
    return !!(j?.CardIccIdentification || j?.CardChipIdentification || j?.DriverCardApplicationIdentification);
}

function isDddParserShape(j: any): boolean {
    return !!(j?.card_icc_identification_1 || j?.card_icc_identification_2 || j?.card_identification_and_driver_card_holder_identification_1);
}

function isVehicleUnitShape(j: any): boolean {
    // Explicit type check from TachographGo (most reliable)
    if (j?.type === 'VEHICLE_UNIT') return true;

    // Has vehicleUnit structure (TachographGo format)
    if (j?.vehicleUnit) return true;

    // Check for driver card indicators first (to avoid false positives)
    const hasDriverCardKeys = !!(
        j?.driverCard ||
        j?.type === 'DRIVER_CARD' ||
        j?.CardIccIdentification ||
        j?.CardChipIdentification ||
        j?.DriverCardApplicationIdentification ||
        j?.card_icc_identification_1 ||
        j?.card_identification_and_driver_card_holder_identification_1
    );

    // If it has driver card keys, it's NOT a vehicle unit
    if (hasDriverCardKeys) return false;

    // Only then check for VU legacy keys
    return !!(j?.vu_overview_1 || j?.vu_activities_1);
}

function pickBlock(root: any, base: string) {
    if (!root || typeof root !== "object") return null;
    return root[`${base}_2`] ?? root[`${base}_1`] ?? root[base] ?? null;
}

function buildVehicleRegistrationTitle(v: any): string {
    if (!v || typeof v !== "object") return "";
    const nation = v.vehicle_registration_nation ?? v.vehicleRegistrationNation ?? v.nation;
    const num = v.vehicle_registration_number ?? v.vehicleRegistrationNumber ?? v.number;
    return [nation, num].filter(Boolean).join(" ");
}

function birthDateTitle(bd: any): string {
    if (!bd || typeof bd !== "object") return "";
    const y = bd.year ?? "";
    const m = bd.month ?? "";
    const d = bd.day ?? "";
    const parts = [y, m, d].filter((x) => x !== "").map((x) => String(x).padStart(2, "0"));
    if (parts.length === 3) return `${parts[0]}-${parts[1]}-${parts[2]}`;
    return parts.join("-");
}

function flattenMaybeArrayOfRecords(container: any, key: string): any[] {
    const v = container?.[key];
    if (!Array.isArray(v)) return [];
    const out: any[] = [];
    for (const item of v) {
        if (!item) continue;
        const er = (item as any).card_event_records;
        if (er) {
            if (Array.isArray(er)) out.push(...er);
            else if (Array.isArray((er as any).records)) out.push(...(er as any).records);
            else out.push(er);
        }
        const fr = (item as any).card_fault_records;
        if (fr) {
            if (Array.isArray(fr)) out.push(...fr);
            else if (Array.isArray((fr as any).records)) out.push(...(fr as any).records);
            else out.push(fr);
        }
    }
    return out;
}

/* ---------------------------
   PUBLIC API
---------------------------- */

export function buildReport(input: any): ReportDocument {
    // Check if this is a merged parser output
    let json = input;
    const normalized = input?.normalized; // produced by src/shared/dddNormalize.ts via the main pipeline

    if (input?.merged === true && input?.combinedData) {
        // This is the new merged output from all parsers
        console.log('[buildReport] Processing merged output from multiple parsers');
        console.log(`[buildReport] Success: ${input.successCount}, Failures: ${input.failureCount}`);

        // Use combinedData for building the report
        json = input.combinedData;
    } else {
        // Backward compatibility: unwrap old wrapper structure
        json = unwrapIfNeeded(input);
    }

    let doc: ReportDocument;

    // Check for DRIVER CARDS first (more common and to avoid false positives)
    if (isReadEsmShape(json)) doc = buildReportFromReadEsm(json);
    else if (isDddParserShape(json)) doc = buildReportFromDddParser(json);
    // Then check for VEHICLE UNITS
    else if (isVehicleUnitShape(json)) doc = buildReportFromVehicleUnit(json);
    // fallback minimale: se non riconosciuto
    else {
        doc = {
            blocks: [
                { type: "title", text: "DDD Report" },
                { type: "p", text: "Formato non riconosciuto per la formattazione a report. Mostra JSON grezzo finché non mappiamo questo tipo." }
            ]
        };
    }

    // Append Regulation 561/2006 summary if we have a normalized compliance report.
    if (normalized?.compliance561) {
        doc.blocks.push(...build561Blocks(normalized.compliance561));
    }

    return doc;
}

function fmtHM(mins: number | undefined): string {
    if (typeof mins !== "number") return "";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${String(m).padStart(2, "0")}m`;
}



/* ---------------------------
   READESM (PRIMO PLUGIN)
---------------------------- */

function buildReportFromReadEsm(json: any): ReportDocument {
    const blocks: ReportDocument["blocks"] = [];
    blocks.push({ type: "title", text: "DDD Report" });

    // --- Card ICC
    blocks.push({ type: "h1", text: "Card ICC Identification" });
    blocks.push({
        type: "table",
        pageSize: PAGE_SIZE_DEFAULT,
        headers: ["Campo", "Valore"],
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
        headers: ["Campo", "Valore"],
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
        headers: ["Campo", "Valore"],
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
        headers: ["Campo", "Valore"],
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
        headers: ["Campo", "Valore"],
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
        headers: ["Campo", "Valore"],
        ...strTable(kvRows([["Last download", json?.LastCardDownload?.lastCardDownload]])),
    });

    // --- Driving license
    blocks.push({ type: "h1", text: "Driving License Information" });
    blocks.push({
        type: "table",
        pageSize: PAGE_SIZE_DEFAULT,
        headers: ["Campo", "Valore"],
        ...strTable(
            kvRows([
                ["Driving license issuing authority", json?.CardDrivingLicenseInformation?.drivingLicenseIssuingAuthority],
                ["Driving license issuing nation", json?.CardDrivingLicenseInformation?.drivingLicenseIssuingNation],
                ["Driving license number", json?.CardDrivingLicenseInformation?.drivingLicenseNumber],
            ])
        ),
    });

    // --- Events
    const eventRecords = json?.CardEventData?.CardEventRecord?.records ?? json?.CardEventData?.records ?? [];
    blocks.push({ type: "h1", text: "Eventi" });
    if (!Array.isArray(eventRecords) || eventRecords.length === 0) {
        blocks.push({ type: "p", text: "Nessun evento disponibile." });
    } else {
        const sortedEvents = sortByTimeDesc(eventRecords, (e: any) =>
            toTimeMs(e?.eventTime) ?? toTimeMs(e?.time) ?? toTimeMs(extractFromIso(e?.title || "")) ?? null
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
    const faultRecords = json?.CardFaultData?.CardFaultRecord?.records ?? json?.CardFaultData?.records ?? [];
    blocks.push({ type: "h1", text: "Fault" });
    if (!Array.isArray(faultRecords) || faultRecords.length === 0) {
        blocks.push({ type: "p", text: "Nessun fault disponibile." });
    } else {
        const sortedFaults = sortByTimeDesc(faultRecords, (f: any) =>
            toTimeMs(f?.faultTime) ?? toTimeMs(f?.time) ?? toTimeMs(extractFromIso(f?.title || "")) ?? null
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
        const sortedDays = [...dayKeys]
            // rimuovi giorni con 0 km
            .filter((d) => {
                const rec = dailyRecordsObj[d];
                const km = parseKm(rec?.activityDayDistance);
                return km === null ? true : km !== 0;
            })
            .sort((a, b) => {
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

/* ---------------------------
   DDDPARSER (FALLBACK)
---------------------------- */

function buildReportFromDddParser(data: any): ReportDocument {
    const blocks: ReportDocument["blocks"] = [];
    blocks.push({ type: "title", text: "DDD Report" });

    // Card ICC
    const icc = pickBlock(data, "card_icc_identification");
    blocks.push({ type: "h1", text: "Card ICC Identification" });
    blocks.push({
        type: "table",
        pageSize: PAGE_SIZE_DEFAULT,
        headers: ["Campo", "Valore"],
        ...strTable(
            kvRows([
                ["Verified", icc?.verified],
                ["Clock stop", icc?.clock_stop],
                ["Card approval number", icc?.card_approval_number],
                ["Card personaliser ID", icc?.card_personaliser_id],
                ["IC identifier", Array.isArray(icc?.ic_identifier) ? icc.ic_identifier.join(", ") : icc?.ic_identifier],
            ])
        ),
    });

    // Card Chip
    const chip = pickBlock(data, "card_chip_identification");
    blocks.push({ type: "h1", text: "Card Chip Identification" });
    blocks.push({
        type: "table",
        pageSize: PAGE_SIZE_DEFAULT,
        headers: ["Campo", "Valore"],
        ...strTable(
            kvRows([
                ["Verified", chip?.verified],
                ["IC serial number", Array.isArray(chip?.ic_serial_number) ? chip.ic_serial_number.join(", ") : chip?.ic_serial_number],
                ["IC manufacturing reference", Array.isArray(chip?.ic_manufacturing_reference) ? chip.ic_manufacturing_reference.join(", ") : chip?.ic_manufacturing_reference],
            ])
        ),
    });

    // Driver app id
    const appId = pickBlock(data, "driver_card_application_identification") ?? data?.driver_card_application_identification_v2 ?? null;
    blocks.push({ type: "h1", text: "Driver Card Application Identification" });
    blocks.push({
        type: "table",
        pageSize: PAGE_SIZE_DEFAULT,
        headers: ["Campo", "Valore"],
        ...strTable(
            kvRows([
                ["Verified", appId?.verified],
                ["Type of tachograph card", appId?.type_of_tachograph_card_id],
                ["No. events per type", appId?.no_of_events_per_type],
                ["No. faults per type", appId?.no_of_faults_per_type],
                ["No. vehicle records", appId?.no_of_card_vehicle_records],
                ["No. place records", appId?.no_of_card_place_records],
            ])
        ),
    });

    // Identification
    const ident = pickBlock(data, "card_identification_and_driver_card_holder_identification");
    blocks.push({ type: "h1", text: "Identificazione" });
    const card = ident?.card_identification ?? {};
    const holder = ident?.driver_card_holder_identification ?? {};
    blocks.push({
        type: "table",
        pageSize: PAGE_SIZE_DEFAULT,
        headers: ["Campo", "Valore"],
        ...strTable(
            kvRows([
                ["Verified", ident?.verified],
                ["Card number", card?.card_number],
                ["Issuing state", card?.card_issuing_member_state],
                ["Issuing authority", card?.card_issuing_authority_name],
                ["Issue date", card?.card_issue_date],
                ["Validity begin", card?.card_validity_begin],
                ["Expiry date", card?.card_expiry_date],
                ["Holder surname", holder?.card_holder_name?.holder_surname],
                ["Holder first names", holder?.card_holder_name?.holder_first_names],
                ["Holder birth date", birthDateTitle(holder?.card_holder_birth_date)],
                ["Preferred language", holder?.card_holder_preferred_language],
            ])
        ),
    });

    // Current use
    const currentUse = pickBlock(data, "card_current_use");
    blocks.push({ type: "h1", text: "Card Current Use" });
    blocks.push({
        type: "table",
        pageSize: PAGE_SIZE_DEFAULT,
        headers: ["Campo", "Valore"],
        ...strTable(
            kvRows([
                ["Verified", currentUse?.verified],
                ["Session open time", currentUse?.session_open_time],
                ["Session open vehicle", buildVehicleRegistrationTitle(currentUse?.session_open_vehicle)],
            ])
        ),
    });

    // Last download
    const lastDl = pickBlock(data, "last_card_download");
    blocks.push({ type: "h1", text: "Last Card Download" });
    blocks.push({
        type: "table",
        pageSize: PAGE_SIZE_DEFAULT,
        headers: ["Campo", "Valore"],
        ...strTable(kvRows([["Verified", lastDl?.verified], ["Last download", lastDl?.last_card_download]])),
    });

    // Events (se presenti)
    const ev = pickBlock(data, "card_event_data");
    blocks.push({ type: "h1", text: "Eventi" });
    const evRecords = ev ? flattenMaybeArrayOfRecords(ev, "card_event_records_array") : [];
    if (!Array.isArray(evRecords) || evRecords.length === 0) {
        blocks.push({ type: "p", text: "Nessun evento disponibile." });
    } else {
        const sortedEvents = sortByTimeDesc(evRecords, (e: any) =>
            toTimeMs(e?.event_time ?? e?.eventTime ?? e?.time ?? extractFromIso(e?.title || "")) ?? null
        );
        blocks.push({
            type: "table",
            pageSize: PAGE_SIZE_DEFAULT,
            headers: ["#", "Tipo", "Data/Ora", "Dettagli"],
            rows: sortedEvents.map((e: any, idx: number) => ({
                cells: [
                    String(idx + 1),
                    s(e?.event_type ?? e?.eventType ?? e?.type ?? e?.title),
                    s(e?.event_time ?? e?.eventTime ?? e?.time ?? extractFromIso(e?.title || "")),
                    s(e?.event_vehicle_registration ?? e?.vehicle ?? e?.details ?? ""),
                ],
            })),
        });
    }

    // Faults (se presenti)
    const ft = pickBlock(data, "card_fault_data");
    blocks.push({ type: "h1", text: "Fault" });
    const ftRecords = ft ? flattenMaybeArrayOfRecords(ft, "card_fault_records_array") : [];
    if (!Array.isArray(ftRecords) || ftRecords.length === 0) {
        blocks.push({ type: "p", text: "Nessun fault disponibile." });
    } else {
        const sortedFaults = sortByTimeDesc(ftRecords, (f: any) =>
            toTimeMs(f?.fault_time ?? f?.faultTime ?? f?.time ?? extractFromIso(f?.title || "")) ?? null
        );
        blocks.push({
            type: "table",
            pageSize: PAGE_SIZE_DEFAULT,
            headers: ["#", "Tipo", "Data/Ora", "Dettagli"],
            rows: sortedFaults.map((f: any, idx: number) => ({
                cells: [
                    String(idx + 1),
                    s(f?.fault_type ?? f?.faultType ?? f?.type ?? f?.title),
                    s(f?.fault_time ?? f?.faultTime ?? f?.time ?? extractFromIso(f?.title || "")),
                    s(f?.fault_vehicle_registration ?? f?.vehicle ?? f?.details ?? ""),
                ],
            })),
        });
    }

    return { blocks };
}

/* ---------------------------
   VEHICLE UNIT (VU)
---------------------------- */

function buildReportFromVehicleUnit(data: any): ReportDocument {
    const blocks: ReportDocument["blocks"] = [];
    blocks.push({ type: "title", text: "Vehicle Unit (VU) Report" });

    // Try to get data from either TachographGo or DDDParser format
    const vuData = data.vehicleUnit?.gen1 || data;
    const overview = vuData.overview || data.vu_overview_1 || {};

    // --- Vehicle Information
    blocks.push({ type: "h1", text: "Vehicle Information" });

    const vin = overview.vehicleIdentificationNumber?.value ||
        data.vu_overview_1?.vehicle_identification_number ||
        overview.vehicle_identification_number;

    const registration = overview.vehicleRegistrationWithNation ||
        overview.vehicleRegistrationIdentification ||
        data.vu_overview_1?.vehicle_registration_identification || {};

    const regNation = registration.nation || registration.vehicle_registration_nation;
    const regNumber = registration.number?.value ||
        registration.vehicle_registration_number;

    const currentDateTime = overview.currentDateTime ||
        overview.current_date_time ||
        data.vu_overview_1?.current_date_time;

    const downloadPeriod = overview.downloadablePeriod ||
        overview.vu_downloadable_period ||
        data.vu_overview_1?.vu_downloadable_period || {};

    blocks.push({
        type: "table",
        pageSize: PAGE_SIZE_DEFAULT,
        headers: ["Campo", "Valore"],
        ...strTable(
            kvRows([
                ["VIN (Vehicle Identification Number)", vin],
                ["Registration Nation", regNation],
                ["Registration Number", regNumber],
                ["Current Date/Time", currentDateTime],
                ["Download Period (From)", downloadPeriod.minTime || downloadPeriod.min_downloadable_time],
                ["Download Period (To)", downloadPeriod.maxTime || downloadPeriod.max_downloadable_time],
            ])
        ),
    });

    // --- Company Locks (if any)
    const companyLocks = overview.companyLocks ||
        data.vu_overview_1?.vu_company_locks_data?.vu_company_locks_records || [];

    if (Array.isArray(companyLocks) && companyLocks.length > 0) {
        blocks.push({ type: "h1", text: "Company Locks" });
        blocks.push({
            type: "table",
            pageSize: PAGE_SIZE_DEFAULT,
            headers: ["#", "Company Name", "Lock In", "Lock Out", "Company Address"],
            rows: companyLocks.map((lock: any, idx: number) => ({
                cells: [
                    String(idx + 1),
                    s(lock.companyName?.value || lock.company_name),
                    s(lock.lockInTime || lock.lock_in_time),
                    s(lock.lockOutTime || lock.lock_out_time),
                    s(lock.companyAddress?.value || lock.company_address),
                ],
            })),
        });
    }

    // --- Daily Activities
    const activities = vuData.activities || data.vu_activities_1 || [];

    if (Array.isArray(activities) && activities.length > 0) {
        blocks.push({ type: "h1", text: `Daily Activities (${activities.length} days)` });

        // Sort by date descending
        const sortedActivities = sortByTimeDesc(activities, (a: any) =>
            toTimeMs(a?.dateOfDay || a?.time_real) ?? null
        );

        blocks.push({
            type: "table",
            pageSize: PAGE_SIZE_DEFAULT,
            headers: ["Date", "Odometer (km)", "Details"],
            rows: sortedActivities.slice(0, 100).map((activity: any) => ({
                cells: [
                    s(activity.dateOfDay || activity.time_real),
                    s(activity.odometerMidnightKm || activity.odometer_value_midnight),
                    s(`${activity.vu_activity_daily_data?.no_of_activity_changes || 0} activity changes`),
                ],
            })),
        });

        if (sortedActivities.length > 100) {
            blocks.push({
                type: "p",
                text: `Showing first 100 of ${sortedActivities.length} daily activity records. See raw JSON for complete data.`
            });
        }
    }

    // --- Events and Faults
    const eventsAndFaults = data.vu_events_and_faults_1 || [];

    if (Array.isArray(eventsAndFaults) && eventsAndFaults.length > 0) {
        blocks.push({ type: "h1", text: "Events and Faults" });
        blocks.push({
            type: "table",
            pageSize: PAGE_SIZE_DEFAULT,
            headers: ["#", "Type", "Details"],
            rows: eventsAndFaults.map((item: any, idx: number) => ({
                cells: [
                    String(idx + 1),
                    s(item.event_type || item.fault_type || "Unknown"),
                    s(JSON.stringify(item).substring(0, 100)),
                ],
            })),
        });
    }

    // --- Technical Data
    const technicalData = data.vu_technical_data_1 || [];

    if (Array.isArray(technicalData) && technicalData.length > 0) {
        blocks.push({ type: "h1", text: "Technical Data" });
        blocks.push({
            type: "table",
            pageSize: PAGE_SIZE_DEFAULT,
            headers: ["#", "Information"],
            rows: technicalData.map((item: any, idx: number) => ({
                cells: [
                    String(idx + 1),
                    s(JSON.stringify(item, null, 2).substring(0, 200)),
                ],
            })),
        });
    }

    return { blocks };
}

/* ---------------------------
   REG. (CE) 561/2006 – SUMMARY
   (generated from normalized.compliance561)
---------------------------- */

function fmtMinutes(mins?: number | null): string {
    if (mins === null || mins === undefined) return "";
    const sign = mins < 0 ? "-" : "";
    const m = Math.abs(mins);
    const hh = Math.floor(m / 60);
    const mm = Math.round(m % 60);
    return `${sign}${hh}h${String(mm).padStart(2, "0")}`;
}

function build561BlocksStime(c561: any): ReportDocument["blocks"] {
    const blocks: ReportDocument["blocks"] = [];

    blocks.push({ type: "h1", text: "Reg. (CE) 561/2006 - Sintesi (stime)" });

    blocks.push({
        type: "p",
        text:
            `Periodo analizzato: ${s(c561?.periodStart || "").slice(0, 10)} → ${s(c561?.periodEnd || "").slice(0, 10)}. ` +
            `Le verifiche sono basate su giorni di calendario (UTC) e servono come indicazione rapida.`
    });

    const daily: any[] = Array.isArray(c561?.daily) ? c561.daily : [];
    const weekly: any[] = Array.isArray(c561?.weekly) ? c561.weekly : [];
    const breakViolations: any[] = Array.isArray(c561?.breakViolations) ? c561.breakViolations : [];
    const fortnightViolations: any[] = Array.isArray(c561?.fortnightViolations) ? c561.fortnightViolations : [];

    const dailyViolCount = daily.filter((d) => d?.dailyDrivingViolation || d?.dailyRestFlag === "INSUFFICIENT").length;
    const weeklyViolCount = weekly.filter((w) => w?.weeklyDrivingViolation).length;

    blocks.push({
        type: "table",
        headers: ["Voce", "Valore"],
        ...strTable(
            kvRows([
                ["Giorni con potenziale violazione (guida/rest)", dailyViolCount],
                ["Settimane con potenziale violazione (56h)", weeklyViolCount],
                ["Violazioni pause (4h30 / 45m)", breakViolations.length],
                ["Violazioni 2 settimane (90h su 14 giorni)", fortnightViolations.length],
            ]),
            999
        )
    });

    if (daily.length) {
        blocks.push({ type: "h1", text: "Dettaglio giornaliero" });
        blocks.push({
            type: "table",
            headers: ["Data", "Guida", "Estensione 10h", "Riposo (max)", "Flag riposo", "Note"],
            pageSize: 30,
            rows: daily.map((d) => ({
                cells: [
                    s(d?.date),
                    fmtHM(d?.drivingMinutes),
                    d?.isExtendedTo10h ? "SI" : "NO",
                    fmtHM(d?.longestRestMinutes),
                    s(d?.dailyRestFlag),
                    s(d?.dailyDrivingViolation || ""),
                ]
            }))
        });
    }

    if (weekly.length) {
        blocks.push({ type: "h1", text: "Dettaglio settimanale" });
        blocks.push({
            type: "table",
            headers: ["ISO Week", "Guida", "Note"],
            pageSize: 30,
            rows: weekly.map((w) => ({
                cells: [s(w?.isoWeek), fmtHM(w?.drivingMinutes), s(w?.weeklyDrivingViolation || "")]
            }))
        });
    }

    if (breakViolations.length) {
        blocks.push({ type: "h1", text: "Violazioni pause" });
        blocks.push({
            type: "table",
            headers: ["Quando", "Guida continuativa", "Descrizione"],
            pageSize: 30,
            rows: breakViolations.map((v) => ({
                cells: [s(v?.at), fmtHM(v?.drivingSinceLastBreakMinutes), s(v?.message)]
            }))
        });
    }

    if (fortnightViolations.length) {
        blocks.push({ type: "h1", text: "Violazioni 90h / 2 settimane" });
        blocks.push({
            type: "table",
            headers: ["Da", "A", "Guida", "Descrizione"],
            pageSize: 30,
            rows: fortnightViolations.map((v) => ({
                cells: [s(v?.windowStart), s(v?.windowEnd), fmtHM(v?.drivingMinutes), s(v?.message)]
            }))
        });
    }

    return blocks;
}

function build561BlocksTacho(c561: any): ReportDocument["blocks"] {
    const blocks: ReportDocument["blocks"] = [];

    blocks.push({ type: "h1", text: "Reg. (CE) 561/2006 – Sintesi (calcolo da tachigrafo)" });

    const period = [c561?.periodStart, c561?.periodEnd].filter(Boolean).join(" → ");
    if (period) blocks.push({ type: "p", text: `Periodo analizzato: ${period}` });

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
        ...strTable(
            kvRows([
                ["Giorni analizzati", daily.length],
                ["Violazioni guida giornaliera", dailyDrivingViol],
                ["Giorni con riposo insufficiente", dailyRestInsuff],
                ["Settimane con violazione guida", weeklyViol],
                ["Violazioni pause (4h30)", breakViolations.length],
                ["Violazioni 14 giorni (90h)", fortnightViolations.length],
            ]),
            30
        ),
    });

    if (daily.length) {
        blocks.push({ type: "h1", text: "Dettaglio giornaliero (approssimazione su giorni di calendario UTC)" });
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
                ]
            }))
        });
    }

    if (weekly.length) {
        blocks.push({ type: "h1", text: "Dettaglio settimanale" });
        blocks.push({
            type: "table",
            pageSize: 30,
            headers: ["Settimana ISO", "Guida", "Violazione"],
            rows: weekly.map((w: any) => ({
                cells: [s(w.isoWeek), fmtMinutes(w.drivingMinutes), s(w.weeklyDrivingViolation || "")]
            }))
        });
    }

    if (breakViolations.length) {
        blocks.push({ type: "h1", text: "Violazioni pause (Art. 7 – guida continuativa)" });
        blocks.push({
            type: "table",
            pageSize: 30,
            headers: ["Quando", "Guida da ultima pausa", "Nota"],
            rows: breakViolations.map((v: any) => ({
                cells: [s(v.at), fmtMinutes(v.drivingSinceLastBreakMinutes), s(v.message)]
            }))
        });
    }

    if (fortnightViolations.length) {
        blocks.push({ type: "h1", text: "Violazioni su 14 giorni (Art. 6 – 90h)" });
        blocks.push({
            type: "table",
            pageSize: 30,
            headers: ["Finestra", "Guida", "Nota"],
            rows: fortnightViolations.map((v: any) => ({
                cells: [
                    `${s(v.windowStart)} → ${s(v.windowEnd)}`,
                    fmtMinutes(v.drivingMinutes),
                    s(v.message),
                ]
            }))
        });
    }

    if (Array.isArray(c561?.notes) && c561.notes.length) {
        blocks.push({ type: "h1", text: "Note sul calcolo" });
        for (const n of c561.notes) blocks.push({ type: "p", text: s(n) });
    }

    return blocks;
}

/**
 * Wrapper: scegli quale versione usare.
 * Se non hai un flag oggi, puoi lasciare sempre quella "Tacho".
 */
function build561Blocks(c561: any): ReportDocument["blocks"] {
    // esempio: se c561.calculationMode === "ESTIMATE" usa Stime, altrimenti Tacho
    const mode = s(c561?.calculationMode || "").toUpperCase();
    return mode === "ESTIMATE" ? build561BlocksStime(c561) : build561BlocksTacho(c561);
}


