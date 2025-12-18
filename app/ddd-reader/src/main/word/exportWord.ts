import fs from "node:fs/promises";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell } from "docx";

function safeText(v: any, maxLen = 2000) {
    if (v === null || v === undefined) return "";
    let s = "";

    if (typeof v === "string") s = v;
    else if (typeof v === "number" || typeof v === "boolean") s = String(v);
    else {
        // oggetti/array: serializza ma evita dimensioni enormi
        try {
            s = JSON.stringify(v);
        } catch {
            s = String(v);
        }
    }

    if (s.length > maxLen) s = s.slice(0, maxLen) + "…";
    return s;
}

function kvTable(rows: Array<[string, any]>) {
    const safeRows = (rows && rows.length > 0)
        ? rows
        : [["Info", "Nessun dato disponibile"]];

    const tableRows = safeRows.map(([k, v]) =>
        new TableRow({
            children: [
                new TableCell({
                    children: [
                        new Paragraph({
                            children: [new TextRun({ text: safeText(k), bold: true })],
                        }),
                    ],
                }),
                new TableCell({
                    children: [new Paragraph(safeText(v))],
                }),
            ],
        })
    );

    return new Table({ rows: tableRows });
}

export async function exportJsonToWord(json: any, outPath: string) {
    const id = json?.Identification;
    const events = json?.CardEventData?.CardEventRecord?.records ?? [];
    const vehicles = json?.CardVehiclesUsed?.CardVehicleRecord?.records ?? [];

    const doc = new Document({
        sections: [
            {
                children: [
                    new Paragraph({ text: "DDD Report", heading: HeadingLevel.TITLE }),

                    new Paragraph({ text: "Identificazione", heading: HeadingLevel.HEADING_1 }),
                    kvTable([
                        ["Card number", id?.cardNumber ?? ""],
                        ["Issuing state", id?.cardIssuingMemberState ?? ""],
                        ["Issuing authority", id?.cardIssuingAuthorityName ?? ""],
                        ["Issue date", id?.cardIssueDate ?? ""],
                        ["Expiry date", id?.cardExpiryDate ?? ""],
                        ["Holder surname", id?.cardHolderName?.surname ?? ""],
                        ["Holder first names", id?.cardHolderName?.firstNames ?? ""],
                        ["Holder birth date", id?.cardHolderBirthDate?.title ?? ""]
                    ]),

                    new Paragraph({ text: "Eventi (estratto)", heading: HeadingLevel.HEADING_1 }),
                    kvTable(
                        events.slice(0, 20).map((e: any, idx: number) => [
                            `#${idx + 1} ${e?.eventType ?? ""}`,
                            `${e?.eventTime ?? ""} | ${e?.eventVehicleRegistration?.title ?? ""}`
                        ])
                    ),

                    new Paragraph({ text: "Veicoli usati (estratto)", heading: HeadingLevel.HEADING_1 }),
                    kvTable(
                        vehicles.slice(0, 20).map((v: any, idx: number) => [
                            `#${idx + 1}`,
                            `${v?.title ?? ""} | ${v?.vehicleUse ?? ""}`
                        ])
                    )
                ]
            }
        ]
    });

    const buf = await Packer.toBuffer(doc);
    await fs.writeFile(outPath, buf);
}
