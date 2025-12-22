import { useEffect, useMemo, useState } from "react";
import ReportView from "./components/ReportView";
import { buildReport } from "../../shared/buildReport";
import type { ReportDocument } from "../../shared/reportModel";
import JsonViewer from "./components/JsonViewer";

function LoadingOverlay({ text, seconds }: { text?: string; seconds?: number }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(6px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(560px, 90vw)",
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 14,
          padding: 18,
          background: "rgba(255,255,255,0.06)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 10 }}>
          {text ?? "Parsing in corso..."}
        </div>

        <div
          style={{
            height: 10,
            borderRadius: 999,
            background: "rgba(255,255,255,0.12)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: "40%",
              borderRadius: 999,
              background: "rgba(255,255,255,0.55)",
              animation: "dddLoading 1.2s infinite ease-in-out",
            }}
          />
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          Tempo trascorso: {seconds ?? 0}s
        </div>

        <style>
          {`
            @keyframes dddLoading {
              0% { transform: translateX(-120%); }
              50% { transform: translateX(80%); }
              100% { transform: translateX(220%); }
            }
          `}
        </style>
      </div>
    </div>
  );
}


export default function App() {
  const [dddPath, setDddPath] = useState<string | null>(null);
  const [parsed, setParsed] = useState<any>(null);
  const [doc, setDoc] = useState<ReportDocument | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState<{ percent?: number; stage?: string } | null>(null);
  const [tab, setTab] = useState<"report" | "json" | "normalized">("report");

  const title = useMemo(() => "DDD Reader", []);

  useEffect(() => {
    // Optional progress updates from main process.
    try {
      // @ts-ignore - api typing is intentionally loose in this project
      const unsub = window.api?.onParseProgress?.((p: any) => {
        setProgress({ percent: p?.percent, stage: p?.stage });
      });
      return () => {
        if (typeof unsub === "function") unsub();
      };
    } catch {
      return;
    }
  }, []);

  async function onOpen() {
    setErr(null);
    const p = await window.api.openDddFile();
    if (!p) return;
    setDddPath(p);
    setParsed(null);
    setDoc(null);
    setTab("report");
  }

  async function onParse() {
    if (!dddPath) return;
    setErr(null);
    setElapsed(0);
    setLoading(true);
    setProgress(null);
    const t0 = Date.now();
    const interval = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
    }, 500);

    try {
      const json = await window.api.parseDdd(dddPath);
      setParsed(json);
      setDoc(buildReport(json));
      setTab("report");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      window.clearInterval(interval);
      setLoading(false);
    }
  }

  async function onExportWord() {
    if (!parsed) return;
    setErr(null);
    setLoading(true);
    try {
      await window.api.exportWord(parsed);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onExportJson() {
    if (!parsed) return;
    setErr(null);
    setLoading(true);
    try {
      await window.api.exportJson(parsed);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui", height: "100vh", overflow: "auto" }}>
      {loading && <LoadingOverlay text="Parsing del file .ddd in corso..." seconds={elapsed} />}
      <h2 style={{ marginTop: 0 }}>{title}</h2>

      {progress?.stage && (
        <div style={{ marginBottom: 10, fontSize: 12, opacity: 0.85 }}>
          Stato: {progress.stage}
          {typeof progress.percent === "number" ? ` (${progress.percent}%)` : ""}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={onOpen} disabled={loading}>
          Seleziona .ddd
        </button>
        <button onClick={onParse} disabled={!dddPath || loading}>
          Parse
        </button>
        <button onClick={onExportWord} disabled={!parsed || loading}>
          Export Word
        </button>
        <button onClick={onExportJson} disabled={!parsed || loading}>
          Export JSON
        </button>
      </div>

      {dddPath && <div style={{ marginBottom: 12, fontSize: 13 }}>File: {dddPath}</div>}
      {err && <div style={{ color: "crimson", marginBottom: 12 }}>{err}</div>}

      {parsed && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <button
            onClick={() => setTab("report")}
            disabled={!doc}
            style={{ fontWeight: tab === "report" ? 700 : 400 }}
          >
            Report
          </button>
          <button
            onClick={() => setTab("normalized")}
            style={{ fontWeight: tab === "normalized" ? 700 : 400 }}
          >
            JSON normalizzato
          </button>
          <button onClick={() => setTab("json")} style={{ fontWeight: tab === "json" ? 700 : 400 }}>
            JSON completo
          </button>
        </div>
      )}

      {tab === "report" ? (
        doc ? (
          <ReportView doc={doc} />
        ) : (
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            Seleziona un file e avvia il parsing per visualizzare il report formattato.
          </div>
        )
      ) : tab === "normalized" ? (
        <JsonViewer value={parsed?.normalized ?? null} title="Output normalizzato (driver/vehicle + 561/2006)" />
      ) : (
        <JsonViewer value={parsed} title="Output completo (parsers + merge + normalized)" />
      )}
    </div>
  );
}
