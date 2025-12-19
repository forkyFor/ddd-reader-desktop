import { useEffect, useMemo, useRef, useState } from "react";
import ReactJson from "react-json-view";

export default function App() {
  const [dddPath, setDddPath] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [progress, setProgress] = useState<{ percent: number; stage?: string } | null>(null);
  const unsubRef = useRef<null | (() => void)>(null);

  const title = useMemo(() => data?.title ?? "DDD Reader", [data]);

  useEffect(() => {
    return () => {
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = null;
    };
  }, []);

  async function onOpen() {
    setErr(null);
    const p = await window.api.openDddFile();
    if (!p) return;
    setDddPath(p);
    setData(null);
  }

  async function onParse() {
    if (!dddPath) return;
    setErr(null);
    setLoading(true);
    setProgress({ percent: 0, stage: "Avvio..." });

    // subscribe progress
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = window.api.onParseProgress((payload) => {
      setProgress(payload);
    });

    try {
      const json = await window.api.parseDdd(dddPath);
      setData(json);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);

      // small delay then hide overlay
      setTimeout(() => setProgress(null), 350);

      if (unsubRef.current) unsubRef.current();
      unsubRef.current = null;
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
    <div style={{ padding: 16, fontFamily: "system-ui", height: "100vh", overflow: "auto" }}>
      {/* Overlay fullscreen progress */}
      {progress && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.78)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999
          }}
        >
          <div style={{ width: 560, padding: 24, borderRadius: 14, background: "rgba(20,20,20,0.95)" }}>
            <div style={{ fontSize: 18, marginBottom: 10 }}>Parsing file DDD</div>
            <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 14 }}>{progress.stage ?? "..."}</div>

            <div style={{ width: "100%", height: 14, background: "rgba(255,255,255,0.15)", borderRadius: 8 }}>
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, progress.percent || 0))}%`,
                  height: 14,
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.85)",
                  transition: "width 120ms linear"
                }}
              />
            </div>

            <div style={{ marginTop: 12, fontSize: 14 }}>
              {Math.max(0, Math.min(100, progress.percent || 0))}%
            </div>
          </div>
        </div>
      )}

      <h2 style={{ marginTop: 0 }}>{title}</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={onOpen}>Seleziona file .ddd</button>
        <button onClick={onParse} disabled={!dddPath || loading}>
          {loading ? "Parsing..." : "Avvia parsing"}
        </button>
        <button onClick={onExportWord} disabled={!data}>Esporta Word</button>
        <button onClick={onExportJson} disabled={!data}>Esporta JSON</button>
      </div>

      {dddPath && <div style={{ marginBottom: 12 }}>File selezionato: {dddPath}</div>}
      {err && <div style={{ color: "crimson", marginBottom: 12 }}>{err}</div>}

      {data && (
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
          <div style={{ marginBottom: 8, fontSize: 13, opacity: 0.8 }}>
            Parser usato: <b>{data?.parserUsed ?? "n/d"}</b>
          </div>

          {data?.primaryError?.errorMessage && (
            <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: "#fff3cd", border: "1px solid #ffeeba" }}>
              Fallback attivo. Errore parser primario: {data.primaryError.errorMessage}
            </div>
          )}

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
