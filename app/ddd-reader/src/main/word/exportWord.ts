import fs from "node:fs/promises";
import {
    Document,
    Packer,
    Paragraph,
    Table,
    TableRow,
    TableCell,
    TextRun,
    HeadingLevel,
    WidthType,
    TableLayoutType,
} from "docx";

import { buildReport } from "../../shared/buildReport";
import type { ReportBlock, ReportDocument, ReportTableRow } from "../../shared/reportModel";

function cell(text: string, isHeader = false) {
    return new TableCell({
        children: [
            new Paragraph({
                children: [new TextRun({ text: text || "—", bold: isHeader })],
            }),
        ],
    });
}

function makeTable(headers: string[], rows: ReportTableRow[]) {
    const headerRow = new TableRow({
        children: headers.map((h) => cell(h, true)),
    });

    const bodyRows = rows.map((r) =>
        new TableRow({
            children: (r.cells ?? []).map((c) => cell(String(c ?? ""))),
        })
    );

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.AUTOFIT,
        rows: [headerRow, ...bodyRows],
    });
}

function blockToDocx(block: ReportBlock): (Paragraph | Table)[] {
    if (block.type === "title") {
        return [
            new Paragraph({
                text: block.text,
                heading: HeadingLevel.TITLE,
            }),
            new Paragraph({ text: "" }),
        ];
    }

    if (block.type === "h1") {
        return [
            new Paragraph({
                text: block.text,
                heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph({ text: "" }),
        ];
    }

    if (block.type === "p") {
        return [
            new Paragraph({
                children: [new TextRun({ text: block.text })],
            }),
            new Paragraph({ text: "" }),
        ];
    }

    if (block.type === "table") {
        const out: (Paragraph | Table)[] = [];

        const headers = Array.isArray(block.headers) ? block.headers : [];
        const rows = Array.isArray(block.rows) ? block.rows : [];

        if (headers.length === 0) {
            out.push(
                new Paragraph({
                    children: [new TextRun({ text: "Tabella non valida: headers mancanti." })],
                }),
                new Paragraph({ text: "" })
            );
            return out;
        }

        if (rows.length === 0) {
            out.push(
                new Paragraph({
                    children: [new TextRun({ text: "Nessun dato disponibile." })],
                }),
                new Paragraph({ text: "" })
            );
            return out;
        }

        // Tabella principale
        out.push(makeTable(headers, rows), new Paragraph({ text: "" }));

        // Se ci sono righe con "details" (Driver Activity), aggiungo tabelle di dettaglio sotto
        for (const r of rows) {
            if (!r.details) continue;

            out.push(
                new Paragraph({
                    text: r.details.title,
                    heading: HeadingLevel.HEADING_2,
                })
            );

            const dHeaders = Array.isArray(r.details.headers) ? r.details.headers : [];
            const dRows = Array.isArray(r.details.rows) ? r.details.rows : [];

            const detailRows: ReportTableRow[] = dRows.map((dr) => ({ cells: dr.map((x) => String(x ?? "")) }));

            if (dHeaders.length && detailRows.length) {
                out.push(makeTable(dHeaders, detailRows));
            } else {
                out.push(new Paragraph({ text: "Nessun dettaglio disponibile." }));
            }

            out.push(new Paragraph({ text: "" }));
        }

        return out;
    }

    return [];
}

export async function exportReportToWord(parsedJson: any, filePath: string): Promise<void> {
    const report: ReportDocument = buildReport(parsedJson);

    if (!report || !Array.isArray(report.blocks)) {
        throw new Error("Report non valido: buildReport() non ha restituito { blocks: [...] }");
    }

    const children: (Paragraph | Table)[] = [];

    for (const b of report.blocks) {
        children.push(...blockToDocx(b));
    }

    const doc = new Document({
        sections: [{ children }],
    });

    const buf = await Packer.toBuffer(doc);
    await fs.writeFile(filePath, buf);
}
