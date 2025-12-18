import type { ReportDocument } from "../../../shared/reportModel";
import "./report.css";

export default function ReportView({ report }: { report: ReportDocument }) {
    return (
        <div className="report">
            {report.blocks.map((b, i) => {
                if (b.type === "title") return <h1 key={i} className="report-title">{b.text}</h1>;
                if (b.type === "h1") return <h2 key={i} className="report-h1">{b.text}</h2>;
                if (b.type === "h2") return <h3 key={i} className="report-h2">{b.text}</h3>;
                if (b.type === "p") return <p key={i} className="report-p">{b.text}</p>;

                if (b.type === "table") {
                    const headers = b.headers;
                    return (
                        <div key={i} className="report-table-wrap">
                            <table className="report-table">
                                {headers && (
                                    <thead>
                                        <tr>
                                            {headers.map((h, hi) => <th key={hi}>{h}</th>)}
                                        </tr>
                                    </thead>
                                )}
                                <tbody>
                                    {b.rows.map((row, ri) => (
                                        <tr key={ri}>
                                            {row.map((cell, ci) => <td key={ci}>{cell}</td>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                }

                return null;
            })}
        </div>
    );
}
