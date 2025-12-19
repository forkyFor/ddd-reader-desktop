import { useMemo, useState, useEffect } from "react";
import type { ReportTableRow } from "../../../shared/reportModel";

type Props = {
    headers?: string[];
    rows?: ReportTableRow[];
    pageSize?: number;
};

export default function ReportTable({ headers, rows, pageSize = 50 }: Props) {
    const safeHeaders = Array.isArray(headers) ? headers : [];
    const safeRows = Array.isArray(rows) ? rows : [];

    const [page, setPage] = useState(1);
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

    // Se cambiano le righe, resetto pagina e dettaglio aperto
    useEffect(() => {
        setPage(1);
        setExpandedIndex(null);
    }, [safeRows.length, pageSize]);

    const totalPages = Math.max(1, Math.ceil(safeRows.length / pageSize));
    const needsPagination = safeRows.length > pageSize;

    const slice = useMemo(() => {
        if (!needsPagination) return safeRows;
        const start = (page - 1) * pageSize;
        return safeRows.slice(start, start + pageSize);
    }, [safeRows, page, pageSize, needsPagination]);

    function go(p: number) {
        const next = Math.min(totalPages, Math.max(1, p));
        setPage(next);
        setExpandedIndex(null);
    }

    if (safeHeaders.length === 0) {
        return (
            <div style={{ padding: 12, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10 }}>
                Tabella non valida: headers mancanti.
            </div>
        );
    }

    if (safeRows.length === 0) {
        return (
            <div style={{ padding: 12, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10 }}>
                Nessun dato disponibile.
            </div>
        );
    }

    return (
        <div style={{ border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                    <thead>
                        <tr>
                            {safeHeaders.map((h, idx) => (
                                <th
                                    key={idx}
                                    style={{
                                        textAlign: "left",
                                        padding: "10px 12px",
                                        fontSize: 13,
                                        borderBottom: "1px solid rgba(255,255,255,0.15)",
                                        background: "rgba(255,255,255,0.06)",
                                    }}
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>

                    <tbody>
                        {slice.map((r, i) => {
                            const globalIndex = needsPagination ? (page - 1) * pageSize + i : i;
                            const isExpandable = !!r?.details;
                            const isOpen = expandedIndex === globalIndex;

                            return (
                                <>
                                    <tr
                                        key={globalIndex}
                                        onClick={() => {
                                            if (!isExpandable) return;
                                            setExpandedIndex(isOpen ? null : globalIndex);
                                        }}
                                        style={{
                                            cursor: isExpandable ? "pointer" : "default",
                                            background: isOpen ? "rgba(255,255,255,0.06)" : "transparent",
                                        }}
                                    >
                                        {(r?.cells ?? []).map((c, ci) => (
                                            <td
                                                key={ci}
                                                style={{
                                                    padding: "10px 12px",
                                                    fontSize: 13,
                                                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                                                    verticalAlign: "top",
                                                    whiteSpace: "pre-wrap",
                                                }}
                                            >
                                                {c || "—"}
                                            </td>
                                        ))}
                                    </tr>

                                    {isOpen && r.details && (
                                        <tr key={`${globalIndex}-details`}>
                                            <td colSpan={safeHeaders.length} style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                                <div style={{ marginBottom: 10, fontSize: 13, opacity: 0.9 }}>{r.details.title}</div>

                                                <div style={{ overflowX: "auto" }}>
                                                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                                                        <thead>
                                                            <tr>
                                                                {(r.details.headers ?? []).map((h, idx) => (
                                                                    <th
                                                                        key={idx}
                                                                        style={{
                                                                            textAlign: "left",
                                                                            padding: "8px 10px",
                                                                            fontSize: 12,
                                                                            borderBottom: "1px solid rgba(255,255,255,0.15)",
                                                                            background: "rgba(255,255,255,0.04)",
                                                                        }}
                                                                    >
                                                                        {h}
                                                                    </th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {(r.details.rows ?? []).map((dr, di) => (
                                                                <tr key={di}>
                                                                    {(dr ?? []).map((dc, dci) => (
                                                                        <td
                                                                            key={dci}
                                                                            style={{
                                                                                padding: "8px 10px",
                                                                                fontSize: 12,
                                                                                borderBottom: "1px solid rgba(255,255,255,0.08)",
                                                                                whiteSpace: "pre-wrap",
                                                                            }}
                                                                        >
                                                                            {dc || "—"}
                                                                        </td>
                                                                    ))}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* PAGINAZIONE: solo se serve */}
            {needsPagination && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px" }}>
                    <button onClick={() => go(1)} disabled={page === 1}>
                        {"<<"}
                    </button>
                    <button onClick={() => go(page - 1)} disabled={page === 1}>
                        {"<"}
                    </button>
                    <div style={{ fontSize: 13 }}>
                        Pagina {page} / {totalPages} (totale righe: {safeRows.length})
                    </div>
                    <button onClick={() => go(page + 1)} disabled={page === totalPages}>
                        {">"}
                    </button>
                    <button onClick={() => go(totalPages)} disabled={page === totalPages}>
                        {">>"}
                    </button>
                </div>
            )}
        </div>
    );
}
