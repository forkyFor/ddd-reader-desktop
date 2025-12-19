import { useMemo, useState } from "react";
import ReportView from "./components/ReportView";
import { buildReport } from "../../shared/buildReport";
import type { ReportDocument } from "../../shared/reportModel";

export default function App() {
  const [dddPath, setDddPath] = useState<string | null>(null);
  const [parsed, setParsed] = useState<any>(null);
  const [doc, setDoc] = useState<ReportDocument | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const title = useMemo(() => "DDD Reader", []);

  async function onOpen() {
    setErr(null);
    const p = await window.api.openDddFile();
    if (!p) return;
    setDddPath(p);
    setParsed(null);
    setDoc(null);
  }

  async function onParse() {
    if (!dddPath) return;
    setErr(null);
    setLoading(true);
    try {
      const json = await window.api.parseDdd(dddPath);
      setParsed(json);
      setDoc(buildReport(json));
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onExportWord() {
    if (!parsed) return;
    setErr(null);
    try {
      await window.api.exportWord(parsed);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  async function onExportJson() {
    if (!parsed) return;
    setErr(null);
    try {
      await window.api.exportJson(parsed);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui", height: "100vh", overflow: "auto" }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={onOpen}>Seleziona .ddd</button>
        <button onClick={onParse} disabled={!dddPath || loading}>
          {loading ? "Parsing..." : "Parse"}
        </button>
        <button onClick={onExportWord} disabled={!parsed}>Export Word</button>
        <button onClick={onExportJson} disabled={!parsed}>Export JSON</button>
      </div>

      {dddPath && <div style={{ marginBottom: 12, fontSize: 13 }}>File: {dddPath}</div>}
      {err && <div style={{ color: "crimson", marginBottom: 12 }}>{err}</div>}

      {doc ? (
        <ReportView doc={doc} />
      ) : (
        <div style={{ fontSize: 13, opacity: 0.85 }}>
          Seleziona un file e avvia il parsing per visualizzare il report formattato.
        </div>
      )}
    </div>
  );
}
