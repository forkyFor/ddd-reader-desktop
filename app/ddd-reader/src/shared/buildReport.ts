import type { ReportDocument } from "./reportModel";

const s = (v: any, max = 2000) => {
    if (v === null || v === undefined) return "";
    let out = typeof v === "string" ? v : String(v);
    if (out.length > max) out = out.slice(0, max) + "…";
    return out;
};

export function buildReport(json: any): ReportDocument {
    const id = json?.Identification ?? {};
    const events = json?.CardEventData?.CardEventRecord?.records ?? [];
    const vehicles = json?.CardVehiclesUsed?.CardVehicleRecord?.records ?? [];

    const blocks: ReportDocument["blocks"] = [];

    blocks.push({ type: "title", text: "DDD Report" });

    blocks.push({ type: "h1", text: "Identificazione" });
    blocks.push({
        type: "table",
        rows: [
            ["Card number", s(id?.cardNumber)],
            ["Issuing state", s(id?.cardIssuingMemberState)],
            ["Issuing authority", s(id?.cardIssuingAuthorityName)],
            ["Issue date", s(id?.cardIssueDate)],
            ["Expiry date", s(id?.cardExpiryDate)],
            ["Holder surname", s(id?.cardHolderName?.surname)],
            ["Holder first names", s(id?.cardHolderName?.firstNames)],
            ["Holder birth date", s(id?.cardHolderBirthDate?.title)],
        ].filter((r) => r[0] && r[1] !== ""),
    });

    blocks.push({ type: "h1", text: "Eventi (estratto)" });
    if (events.length === 0) {
        blocks.push({ type: "p", text: "Nessun evento disponibile." });
    } else {
        blocks.push({
            type: "table",
            headers: ["#", "Tipo", "Data/Ora", "Veicolo"],
            rows: events.slice(0, 50).map((e: any, idx: number) => [
                String(idx + 1),
                s(e?.eventType),
                s(e?.eventTime),
                s(e?.eventVehicleRegistration?.title),
            ]),
        });
    }

    blocks.push({ type: "h1", text: "Veicoli usati (estratto)" });
    if (vehicles.length === 0) {
        blocks.push({ type: "p", text: "Nessun veicolo disponibile." });
    } else {
        blocks.push({
            type: "table",
            headers: ["#", "Registrazione", "Uso"],
            rows: vehicles.slice(0, 50).map((v: any, idx: number) => [
                String(idx + 1),
                s(v?.title),
                s(v?.vehicleUse),
            ]),
        });
    }

    return { blocks };
}
