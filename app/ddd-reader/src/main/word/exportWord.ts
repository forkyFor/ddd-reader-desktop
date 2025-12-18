import fs from "node:fs/promises";
import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    Table,
    TableRow,
    TableCell,
} from "docx";
import type { ReportDocument, ReportBlock, ReportTableRow } from "../../shared/reportModel";

function makeTable(headers: string[] | undefined, rows: string[][]) {
    const safeRows = rows?.length ? rows : [["Info", "Nessun dato disponibile"]];

    const tableRows: TableRow[] = [];

    if (headers && headers.length) {
        tableRows.push(
            new TableRow({
                children: headers.map(
                    (h) =>
                        new TableCell({
                            children: [
                                new Paragraph({
                                    children: [new TextRun({ text: String(h ?? ""), bold: true })],
                                }),
                            ],
                        })
                ),
            })
        );
    }

    for (const r of safeRows) {
        tableRows.push(
            new TableRow({
                children: r.map(
                    (cell) =>
                        new TableCell({
                            children: [new Paragraph(String(cell ?? ""))],
                        })
                ),
            })
        );
    }

    return new Table({ rows: tableRows });
}

export async function exportReportToWord(report: ReportDocument, outPath: string) {
    const children: any[] = [];

    for (const b of report.blocks) {
        if (b.type === "title") {
            children.push(new Paragraph({ text: b.text, heading: HeadingLevel.TITLE }));
            continue;
        }
        if (b.type === "h1") {
            children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_1 }));
            continue;
        }
        if (b.type === "h2") {
            children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_2 }));
            continue;
        }
        if (b.type === "p") {
            children.push(new Paragraph({ text: b.text }));
            continue;
        }

        if (b.type === "table") {
            // tabella principale (riassunto)
            const mainRows = (b.rows ?? []).map((r: ReportTableRow) => r.cells ?? []);
            children.push(makeTable(b.headers, mainRows));

            // dettagli: in Word li stampiamo sotto come tabelle separate
            const withDetails = (b.rows ?? []).filter((r) => r.details && r.details.rows?.length);
            for (const r of withDetails) {
                const dt = r.details!;
                if (dt.title) {
                    children.push(new Paragraph({ text: dt.title, heading: HeadingLevel.HEADING_3 }));
                }
                children.push(makeTable(dt.headers, dt.rows));
            }
        }
    }

    const doc = new Document({
        sections: [{ children }],
    });

    const buf = await Packer.toBuffer(doc);
    await fs.writeFile(outPath, buf);
}
