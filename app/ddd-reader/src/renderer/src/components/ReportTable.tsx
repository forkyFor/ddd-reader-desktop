import { Fragment, useMemo, useState, useEffect } from "react";
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
    const [search, setSearch] = useState("");
    const [sortCol, setSortCol] = useState<number | null>(null);
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

    // Se cambiano le righe, resetto pagina e dettaglio aperto
    useEffect(() => {
        setPage(1);
        setExpandedIndex(null);
    }, [safeRows.length, pageSize]);

    useEffect(() => {
        setPage(1);
        setExpandedIndex(null);
    }, [search, sortCol, sortDir]);

    function parseForSort(v: string): number | string {
        const s = String(v ?? "").trim();

        // Date YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
            const t = Date.parse(s.includes("T") ? s : s + "T00:00:00Z");
            if (!Number.isNaN(t)) return t;
        }

        // ISO week YYYY-Wxx
        const wk = s.match(/^(\d{4})-W(\d{2})$/i);
        if (wk) return Number(wk[1]) * 100 + Number(wk[2]);

        // Time HH:MM
        const hm = s.match(/^(\d{1,2}):(\d{2})$/);
        if (hm) return Number(hm[1]) * 60 + Number(hm[2]);

        // Number (including with colon removed e.g., 04:30 not matched above)
        const n = Number(s.replace(",", "."));
        if (Number.isFinite(n)) return n;

        return s.toLowerCase();
    }

    const filteredSorted = useMemo(() => {
        let out = safeRows;

        const q = search.trim().toLowerCase();
        if (q) {
            out = out.filter((r) => {
                const hay = (r.cells ?? []).join(" ").toLowerCase();
                return hay.includes(q);
            });
        }

        if (sortCol !== null) {
            const col = sortCol;
            const dir = sortDir;
            out = [...out].sort((a, b) => {
                const av = parseForSort(a.cells?.[col] ?? "");
                const bv = parseForSort(b.cells?.[col] ?? "");

                let cmp = 0;
                if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
                else cmp = String(av).localeCompare(String(bv));

                return dir === "asc" ? cmp : -cmp;
            });
        }

        return out;
    }, [safeRows, search, sortCol, sortDir]);

    const totalPages = Math.max(1, Math.ceil(filteredSorted.length / pageSize));
    const needsPagination = filteredSorted.length > pageSize;

    const slice = useMemo(() => {
        if (!needsPagination) return filteredSorted;
        const start = (page - 1) * pageSize;
        return filteredSorted.slice(start, start + pageSize);
    }, [filteredSorted, page, pageSize, needsPagination]);

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
            <div
                style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    padding: "10px 12px",
                    borderBottom: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.03)",
                    flexWrap: "wrap",
                }}
            >
                <div style={{ fontSize: 12, opacity: 0.9 }}>
                    Righe: {filteredSorted.length}
                    {safeRows.length !== filteredSorted.length ? ` (filtrate da ${safeRows.length})` : ""}
                </div>

                <div style={{ flex: "1 1 220px" }} />

                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cerca..."
                    style={{
                        flex: "0 0 260px",
                        maxWidth: "100%",
                        padding: "6px 8px",
                        borderRadius: 8,
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(0,0,0,0.25)",
                        color: "white",
                        fontSize: 12,
                    }}
                />
                <button onClick={() => setSearch("")} disabled={!search.trim()}>
                    Pulisci
                </button>
            </div>
            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                    <thead>
                        <tr>
                            {safeHeaders.map((h, idx) => (
                                <th
                                    key={idx}
                                    onClick={() => {
                                        if (sortCol === idx) {
                                            setSortDir(sortDir === "asc" ? "desc" : "asc");
                                        } else {
                                            setSortCol(idx);
                                            setSortDir("asc");
                                        }
                                    }}
                                    style={{
                                        textAlign: "left",
                                        padding: "10px 12px",
                                        fontSize: 13,
                                        borderBottom: "1px solid rgba(255,255,255,0.15)",
                                        background: "rgba(255,255,255,0.06)",
                                        cursor: "pointer",
                                        userSelect: "none",
                                    }}
                                >
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                        {h}
                                        {sortCol === idx && <span style={{ fontSize: 12, opacity: 0.9 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
                                    </span>
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
                                <Fragment key={globalIndex}>
                                    <tr
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
                                </Fragment>
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
                        Pagina {page} / {totalPages} (righe filtrate: {filteredSorted.length})
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
