import { useMemo, useState } from "react";
import ReactJson from "react-json-view";

export default function App() {
  const [dddPath, setDddPath] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const title = useMemo(() => data?.title ?? "DDD Reader", [data]);

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
      const json = await window.api.parseDdd(dddPath);
      setData(json);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onExportWord() {
    if (!data) return;
    setErr(null);
    try {
      await window.api.exportWord(data);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  async function onExportJson() {
    if (!data) return;
    setErr(null);
    try {
      await window.api.exportJson(data);
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
        <button onClick={onExportWord} disabled={!data}>Export Word</button>
        <button onClick={onExportJson} disabled={!data}>Export JSON</button>
      </div>

      {dddPath && <div style={{ marginBottom: 12 }}>File: {dddPath}</div>}
      {err && <div style={{ color: "crimson", marginBottom: 12 }}>{err}</div>}

      {data && (
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
          <ReactJson
            src={data}
            name={null}
            collapsed={2}
            enableClipboard={true}
            displayDataTypes={false}
          />
        </div>
      )}
    </div>
  );
}
