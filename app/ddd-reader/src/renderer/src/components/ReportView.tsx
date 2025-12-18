import { useState } from "react";
import type { ReportDocument, ReportTableRow } from "../../../shared/reportModel";
import "./report.css";

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

export default function ReportView({ report }: { report: ReportDocument }) {
    // pagina per tabella (key = blockIndex)
    const [pages, setPages] = useState<Record<number, number>>({});
    // expanded row per tabella (key = blockIndex -> rowKey)
    const [expanded, setExpanded] = useState<Record<number, string | null>>({});

    function getPage(i: number) {
        return pages[i] ?? 1;
    }

    function setPage(i: number, next: number) {
        setPages((p) => ({ ...p, [i]: next }));
    }

    function rowKey(row: ReportTableRow, fallback: string) {
        // se la prima cella è una data, usiamola come key
        return (row.cells?.[0] ? `k:${row.cells[0]}` : fallback);
    }

    function toggleRow(blockIndex: number, key: string, hasDetails: boolean) {
        if (!hasDetails) return;
        setExpanded((e) => ({ ...e, [blockIndex]: e[blockIndex] === key ? null : key }));
    }

    return (
        <div className="report">
            {report.blocks.map((b, i) => {
                if (b.type === "title") return <h1 key={i} className="report-title">{b.text}</h1>;
                if (b.type === "h1") return <h2 key={i} className="report-h1">{b.text}</h2>;
                if (b.type === "h2") return <h3 key={i} className="report-h2">{b.text}</h3>;
                if (b.type === "p") return <p key={i} className="report-p">{b.text}</p>;

                if (b.type === "table") {
                    const headers = b.headers;
                    const rows = b.rows ?? [];
                    const pageSize = b.pageSize ?? 50;

                    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
                    const page = clamp(getPage(i), 1, totalPages);

                    const start = (page - 1) * pageSize;
                    const end = start + pageSize;
                    const pageRows = rows.slice(start, end);

                    const expandedKey = expanded[i] ?? null;

                    return (
                        <div key={i} className="report-table-section">
                            <div className="report-table-toolbar">
                                <div className="report-table-meta">
                                    Righe: {rows.length} — Pagina {page} / {totalPages}
                                </div>
                                {rows.length > pageSize && (
                                    <div className="report-table-pager">
                                        <button className="pager-btn" onClick={() => setPage(i, 1)} disabled={page === 1}>«</button>
                                        <button className="pager-btn" onClick={() => setPage(i, page - 1)} disabled={page === 1}>Prev</button>
                                        <button className="pager-btn" onClick={() => setPage(i, page + 1)} disabled={page === totalPages}>Next</button>
                                        <button className="pager-btn" onClick={() => setPage(i, totalPages)} disabled={page === totalPages}>»</button>
                                    </div>
                                )}
                            </div>

                            <div className="report-table-wrap">
                                <table className="report-table">
                                    {headers && (
                                        <thead>
                                            <tr>
                                                {headers.map((h, hi) => <th key={hi}>{h}</th>)}
                                            </tr>
                                        </thead>
                                    )}
                                    <tbody>
                                        {pageRows.map((row, ri) => {
                                            const key = rowKey(row, `row:${start + ri}`);
                                            const hasDetails = !!row.details && row.details.rows?.length > 0;
                                            const isOpen = expandedKey === key;

                                            return (
                                                <>
                                                    <tr
                                                        key={key}
                                                        className={hasDetails ? "expandable-row" : undefined}
                                                        onClick={() => toggleRow(i, key, hasDetails)}
                                                        title={hasDetails ? "Clicca per espandere/chiudere il dettaglio" : undefined}
                                                    >
                                                        {row.cells.map((cell, ci) => <td key={ci}>{cell}</td>)}
                                                    </tr>

                                                    {hasDetails && isOpen && (
                                                        <tr key={`${key}-details`}>
                                                            <td colSpan={headers?.length ?? row.cells.length}>
                                                                <div className="details-box">
                                                                    {row.details?.title && <div className="details-title">{row.details.title}</div>}
                                                                    <div className="details-table-wrap">
                                                                        <table className="details-table">
                                                                            {row.details?.headers && (
                                                                                <thead>
                                                                                    <tr>
                                                                                        {row.details.headers.map((h, hi) => <th key={hi}>{h}</th>)}
                                                                                    </tr>
                                                                                </thead>
                                                                            )}
                                                                            <tbody>
                                                                                {row.details?.rows.map((dr, di) => (
                                                                                    <tr key={di}>
                                                                                        {dr.map((dc, dci) => <td key={dci}>{dc}</td>)}
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </>
                                            );
                                        })}

                                        {pageRows.length === 0 && (
                                            <tr>
                                                <td colSpan={headers?.length ?? 2}>Nessun dato disponibile.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                }

                return null;
            })}
        </div>
    );
}
