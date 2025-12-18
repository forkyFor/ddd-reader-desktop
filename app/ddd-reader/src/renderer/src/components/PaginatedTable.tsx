import React, { useMemo, useState } from "react";

export type Column<Row> = {
    header: string;
    width?: number | string;
    cell: (row: Row) => React.ReactNode;
};

type Props<Row> = {
    title: string;
    rows: Row[];
    columns: Column<Row>[];
    pageSize?: number; // default 50
    emptyText?: string;
};

export default function PaginatedTable<Row>({
    title,
    rows,
    columns,
    pageSize = 50,
    emptyText = "Nessun dato disponibile.",
}: Props<Row>) {
    const [page, setPage] = useState(1);

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const safePage = Math.min(Math.max(page, 1), totalPages);

    const pageRows = useMemo(() => {
        const start = (safePage - 1) * pageSize;
        return rows.slice(start, start + pageSize);
    }, [rows, safePage, pageSize]);

    function prev() {
        setPage((p) => Math.max(1, p - 1));
    }
    function next() {
        setPage((p) => Math.min(totalPages, p + 1));
    }

    // Se cambia rows, reset a pagina 1
    React.useEffect(() => {
        setPage(1);
    }, [total, pageSize]);

    return (
        <section className="ddd-section">
            <div className="ddd-section-header">
                <h3 className="ddd-h3">{title}</h3>
                <div className="ddd-meta">
                    Totale: <b>{total}</b> — Pagina <b>{safePage}</b> / <b>{totalPages}</b> — 50 righe per pagina
                </div>
                <div className="ddd-actions">
                    <button onClick={prev} disabled={safePage <= 1}>
                        Prev
                    </button>
                    <button onClick={next} disabled={safePage >= totalPages}>
                        Next
                    </button>
                </div>
            </div>

            {total === 0 ? (
                <div className="ddd-empty">{emptyText}</div>
            ) : (
                <div className="ddd-table-wrap">
                    <table className="ddd-table">
                        <thead>
                            <tr>
                                {columns.map((c, idx) => (
                                    <th key={idx} style={{ width: c.width }}>
                                        {c.header}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {pageRows.map((row, rIdx) => (
                                <tr key={rIdx}>
                                    {columns.map((c, cIdx) => (
                                        <td key={cIdx}>{c.cell(row)}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
