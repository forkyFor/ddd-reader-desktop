import { BrowserWindow, dialog } from "electron";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseIconToken } from "../../shared/iconTokens";

type PdfTable = { title?: string; headers: string[]; rows: string[][] };

/**
 * Il fac-simile richiede il tabulato senza la colonna "Veicolo".
 * Per sicurezza la rimuoviamo lato template PDF, indipendentemente da come viene composto a monte.
 */
function stripVehicleColumn(t: PdfTable): PdfTable {
    const headers = Array.isArray(t?.headers) ? t.headers : [];
    if (!headers.length) return t;

    const removeIdx: number[] = [];
    headers.forEach((h, i) => {
        const k = String(h ?? "").trim().toLowerCase();
        if (k === "veicolo" || k.includes("veicolo")) removeIdx.push(i);
    });
    if (!removeIdx.length) return t;

    const keep = headers.map((_, i) => i).filter((i) => !removeIdx.includes(i));
    if (!keep.length) return t;

    return {
        ...t,
        headers: keep.map((i) => headers[i]),
        rows: (t.rows ?? []).map((r) => keep.map((i) => String((r ?? [])[i] ?? ""))),
    };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ICON_DATA_URI_CACHE: Record<string, string | null> = {};

function getIconDataUri(key: string): string | null {
    const k = String(key ?? "").toLowerCase();
    if (!k) return null;
    if (Object.prototype.hasOwnProperty.call(ICON_DATA_URI_CACHE, k)) return ICON_DATA_URI_CACHE[k];
    const p = path.resolve(__dirname, "..", "word", "assets", "event-icons", `${k}.png`);
    try {
        const buf = fsSync.readFileSync(p);
        const b64 = buf.toString("base64");
        const uri = `data:image/png;base64,${b64}`;
        ICON_DATA_URI_CACHE[k] = uri;
        return uri;
    } catch {
        ICON_DATA_URI_CACHE[k] = null;
        return null;
    }
}

function renderCellHtml(raw: string): string {
    const parsed = parseIconToken(raw);
    if (!parsed) return esc(raw ?? "");
    const icon = getIconDataUri(parsed.key);
    // Use the module's HTML escaping helper.
    // (Previously this referenced `escapeHtml`, which doesn't exist at runtime.)
    const text = esc(parsed.text || "");
    if (!icon) return text || "&mdash;";
    return `<span class="cell-icon"><img src="${icon}" alt="" />${text ? ` <span>${text}</span>` : ""}</span>`;
}

export type RecordPdfPayload = {
    kind: "INFRACTION" | "EVENT" | "FAULT";
    code: string;
    title: string;
    companyName?: string;
    driver?: { name?: string; cardNumber?: string };
    vehicle?: string;
    period?: { start?: string; end?: string };
    documentDate?: string;
    legal?: { title?: string; paragraphs?: string[] };
    detail?: { title?: string; paragraphs?: string[] };
    tables?: PdfTable[];
    footerNote?: string;
    requireSignature?: boolean;
};

function esc(s: any): string {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function fmtPeriod(p?: { start?: string; end?: string }): string {
    const a = p?.start ? String(p.start).replace("T", " ").replace("Z", "") : "";
    const b = p?.end ? String(p.end).replace("T", " ").replace("Z", "") : "";
    if (a && b) return `${a} - ${b}`;
    return a || b || "—";
}

function nowItalian(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tableHtml(t: PdfTable): string {
    const tt = stripVehicleColumn(t);
    const title = tt.title ? `<h3>${esc(tt.title)}</h3>` : "";
    const head = `<tr>${(tt.headers ?? []).map((h) => `<th>${esc(h)}</th>`).join("")}</tr>`;
    const body = (tt.rows ?? [])
        .map((r) => `<tr>${(r ?? []).map((c) => `<td>${renderCellHtml(String(c ?? ""))}</td>`).join("")}</tr>`)
        .join("");
    return `${title}<table class="tbl"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function buildHtml(payload: RecordPdfPayload): string {
    const company = payload.companyName ? esc(payload.companyName) : "—";
    const driver = payload.driver?.name || payload.driver?.cardNumber
        ? `${esc(payload.driver?.name || "—")} (${esc(payload.driver?.cardNumber || "—")})`
        : "—";

    const docDate = payload.documentDate || nowItalian();

    const legalTitle = payload.legal?.title ? esc(payload.legal.title) : "";
    const legalPars = (payload.legal?.paragraphs ?? []).map((p) => `<p class="legal">${esc(p)}</p>`).join("");

    const detailTitle = payload.detail?.title ? esc(payload.detail.title) : "Dettaglio";
    const detailPars = (payload.detail?.paragraphs ?? []).map((p) => `<p>${esc(p)}</p>`).join("");

    const tables = (payload.tables ?? []).map((t) => tableHtml(t)).join("<div class='sp'></div>");

    const footerNote = payload.footerNote ? `<p class="footer">${esc(payload.footerNote)}</p>` : "";

    // Fac-simile (allegato): dichiarazione presa visione, sotto al tabulato e prima delle firme.
    const acknowledgement = payload.requireSignature
        ? `<p class="ack">Il conducente dichiara di aver preso nota dell’infrazione/evento in oggetto</p>`
        : "";
    const signature = payload.requireSignature
        ? `
        <div class="sigWrap">
            <div class="sigCol">
                <div class="sigLine"></div>
                <div class="sigLbl">Luogo e Data</div>
            </div>
            <div class="sigCol sigColRight">
                <div class="sigLine"></div>
                <div class="sigLbl">Firma</div>
                <div class="stampBoxBottom"></div>
                <div class="stampLblBottom">Timbro aziendale</div>
            </div>
        </div>`
        : "";

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(payload.title)}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; }
    h1 { font-size: 18px; margin: 0 0 10px 0; text-align: center; }
    h2 { font-size: 16px; margin: 18px 0 8px; text-align: center; }
    h3 { font-size: 13px; margin: 14px 0 6px; }
    .meta { font-size: 12px; margin: 0 0 14px 0; }
    .metaRow { display: flex; gap: 18px; margin: 4px 0; }
    .metaRow b { width: 110px; display: inline-block; }
    /* Timbro: in basso sotto la firma (come da fac-simile) */
    .stampBoxBottom { margin: 14px auto 0; width: 70mm; height: 30mm; border: 1px dashed #777; }
    .stampLblBottom { width: 70mm; margin: 2px auto 0; text-align: center; font-size: 10px; color: #444; }
    .legal { font-style: italic; font-size: 12px; line-height: 1.35; }
    p { font-size: 12px; line-height: 1.35; margin: 6px 0; }
    .tbl { width: 100%; border-collapse: collapse; font-size: 11px; }
    .tbl th { background: #1d75a5; color: #fff; text-align: left; padding: 6px 6px; }
    .tbl td { border-bottom: 1px solid #ddd; padding: 5px 6px; vertical-align: top; }
    .cell-icon { display: inline-flex; align-items: center; gap: 4px; }
    .cell-icon img { width: 12px; height: 12px; }
    .sp { height: 8px; }
    .footer { margin-top: 18px; text-align: center; font-weight: 600; }
    .ack { margin-top: 18px; text-align: center; font-weight: 600; }
    .sigWrap { margin-top: 30px; display: flex; justify-content: space-between; gap: 30px; page-break-inside: avoid; }
    .sigCol { width: 45%; text-align: center; }
    .sigColRight { text-align: center; }
    .sigLine { border-bottom: 1px solid #999; height: 22px; }
    .sigLbl { font-size: 11px; color: #333; margin-top: 6px; }
  </style>
</head>
<body>
  <h1>${esc(payload.title)}</h1>

  <div class="meta">
    <div class="metaRow"><b>Azienda:</b> <span>${company}</span></div>
    <div class="metaRow"><b>Conducente:</b> <span>${driver}</span></div>
    <div class="metaRow"><b>Veicolo:</b> <span>${esc(payload.vehicle || "—")}</span></div>
    <div class="metaRow"><b>Periodo:</b> <span>${esc(fmtPeriod(payload.period))}</span></div>
    <div class="metaRow"><b>Data documento:</b> <span>${esc(docDate)}</span></div>
  </div>

  ${legalTitle ? `<h2>${legalTitle}</h2>` : ""}
  ${legalPars}

  <h2>${detailTitle}</h2>
  ${detailPars}

  ${tables ? `<h2>Tabulato eventi</h2>${tables}` : ""}

  ${footerNote}
  ${acknowledgement}
  ${signature}
</body>
</html>`;
}

export async function exportRecordPdf(payload: RecordPdfPayload): Promise<string | null> {
    const safeName = `${payload.code || "record"}`.replace(/[^a-z0-9_-]+/gi, "_");
    const res = await dialog.showSaveDialog({
        filters: [{ name: "PDF", extensions: ["pdf"] }],
        defaultPath: `${safeName}.pdf`,
    });
    if (res.canceled || !res.filePath) return null;

    const html = buildHtml(payload);
    const win = new BrowserWindow({
        show: false,
        webPreferences: {
            sandbox: false,
        },
    });

    try {
        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        await win.webContents.executeJavaScript("document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()", true);

        const pdfBuf = await win.webContents.printToPDF({
            printBackground: true,
            pageSize: "A4",
        });

        await fs.writeFile(res.filePath, pdfBuf);
        return res.filePath;
    } finally {
        try {
            win.close();
        } catch {
            // ignore
        }
    }
}
