import { useMemo, useState } from "react";
import type { ReportDocument } from "../../../shared/reportModel";
import "./report.css";

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

export default function ReportView({ report }: { report: ReportDocument }) {
    // page state per ogni tabella (key = block index)
    const [pages, setPages] = useState<Record<number, number>>({});

    const tableBlockIndexes = useMemo(() => {
        const idxs: number[] = [];
        report.blocks.forEach((b, i) => {
            if (b.type === "table") idxs.push(i);
        });
        return idxs;
    }, [report]);

    function getPage(i: number) {
        return pages[i] ?? 1;
    }

    function setPage(i: number, next: number) {
        setPages((p) => ({ ...p, [i]: next }));
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

                    return (
                        <div key={i} className="report-table-section">
                            <div className="report-table-toolbar">
                                <div className="report-table-meta">
                                    Righe: {rows.length} — Pagina {page} / {totalPages}
                                </div>
                                {rows.length > pageSize && (
                                    <div className="report-table-pager">
                                        <button
                                            className="pager-btn"
                                            onClick={() => setPage(i, 1)}
                                            disabled={page === 1}
                                        >
                                            «
                                        </button>
                                        <button
                                            className="pager-btn"
                                            onClick={() => setPage(i, page - 1)}
                                            disabled={page === 1}
                                        >
                                            Prev
                                        </button>
                                        <button
                                            className="pager-btn"
                                            onClick={() => setPage(i, page + 1)}
                                            disabled={page === totalPages}
                                        >
                                            Next
                                        </button>
                                        <button
                                            className="pager-btn"
                                            onClick={() => setPage(i, totalPages)}
                                            disabled={page === totalPages}
                                        >
                                            »
                                        </button>
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
                                        {pageRows.map((row, ri) => (
                                            <tr key={ri}>
                                                {row.map((cell, ci) => <td key={ci}>{cell}</td>)}
                                            </tr>
                                        ))}
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
