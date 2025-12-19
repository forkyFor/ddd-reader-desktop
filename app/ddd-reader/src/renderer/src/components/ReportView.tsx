import type { ReportDocument } from "../../../shared/reportModel";
import ReportTable from "./ReportTable";

export default function ReportView({ doc }: { doc: ReportDocument }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {doc.blocks.map((b, idx) => {
                if (b.type === "title") {
                    return <h2 key={idx} style={{ margin: 0 }}>{b.text}</h2>;
                }
                if (b.type === "h1") {
                    return <h3 key={idx} style={{ margin: "6px 0 0 0" }}>{b.text}</h3>;
                }
                if (b.type === "p") {
                    return <div key={idx} style={{ fontSize: 13, opacity: 0.95 }}>{b.text}</div>;
                }
                if (b.type === "table") {
                    return (
                        <div key={idx}>
                            <ReportTable headers={b.headers} rows={b.rows} pageSize={b.pageSize ?? 50} />
                        </div>
                    );
                }
                return null;
            })}
        </div>
    );
}
