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
import type { ReportDocument, ReportBlock } from "../../shared/reportModel";

function docxTable(block: Extract<ReportBlock, { type: "table" }>) {
    const rows = block.rows?.length ? block.rows : [["Info", "Nessun dato disponibile"]];

    const tableRows: TableRow[] = [];

    if (block.headers && block.headers.length) {
        tableRows.push(
            new TableRow({
                children: block.headers.map(
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

    for (const r of rows) {
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
        } else if (b.type === "h1") {
            children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_1 }));
        } else if (b.type === "h2") {
            children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_2 }));
        } else if (b.type === "p") {
            children.push(new Paragraph({ text: b.text }));
        } else if (b.type === "table") {
            children.push(docxTable(b));
        }
    }

    const doc = new Document({
        sections: [{ children }],
    });

    const buf = await Packer.toBuffer(doc);
    await fs.writeFile(outPath, buf);
}
