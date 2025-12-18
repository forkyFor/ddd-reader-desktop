import { useMemo, useState } from "react";
import ReportView from "./components/ReportView";
import { buildReport } from "../../shared/buildReport";
import type { ReportDocument } from "../../shared/reportModel";

export default function App() {
  const [dddPath, setDddPath] = useState<string | null>(null);
  const [json, setJson] = useState<any>(null);
  const [report, setReport] = useState<ReportDocument | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const title = useMemo(() => "DDD Reader", []);

  async function onOpen() {
    setErr(null);
    const p = await window.api.openDddFile();
    if (!p) return;
    setDddPath(p);
  }

  async function onParse() {
    if (!dddPath) return;
    setErr(null);
    setLoading(true);
    try {
      const j = await window.api.parseDdd(dddPath);
      setJson(j);
      setReport(buildReport(j));
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onExportWord() {
    if (!json) return;
    setErr(null);
    try {
      await window.api.exportWord(json);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  async function onExportJson() {
    if (!json) return;
    setErr(null);
    try {
      await window.api.exportJson(json);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui" }}>
      <h2>{title}</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={onOpen}>Seleziona .ddd</button>
        <button onClick={onParse} disabled={!dddPath || loading}>
          {loading ? "Parsing..." : "Parse"}
        </button>
        <button onClick={onExportWord} disabled={!json}>Export Word</button>
        <button onClick={onExportJson} disabled={!json}>Export JSON</button>
      </div>

      {dddPath && <div style={{ marginBottom: 12 }}>File: {dddPath}</div>}
      {err && <div style={{ color: "crimson", marginBottom: 12 }}>{err}</div>}

      {report && <ReportView report={report} />}
    </div>
  );
}
