import { useEffect, useMemo, useRef, useState } from "react";
import ReportView from "./components/ReportView";
import { buildReport } from "../../shared/buildReport";
import type { ReportDocument } from "../../shared/reportModel";

export default function App() {
  const [dddPath, setDddPath] = useState<string | null>(null);
  const [json, setJson] = useState<any>(null);
  const [report, setReport] = useState<ReportDocument | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStage, setProgressStage] = useState("In attesa...");

  const parseIdRef = useRef<string | null>(null);

  const title = useMemo(() => "DDD Reader", []);

  useEffect(() => {
    // sottoscrizione globale agli eventi di progresso
    const unsubscribe = window.api.onParseProgress(({ parseId, percent, stage }) => {
      // aggiorna solo se coincide con il parse corrente
      if (parseIdRef.current && parseId === parseIdRef.current) {
        setProgressPercent(Number.isFinite(percent) ? percent : 0);
        setProgressStage(stage || "");
      }
    });
    return () => unsubscribe();
  }, []);

  async function onOpen() {
    setErr(null);
    const p = await window.api.openDddFile();
    if (!p) return;
    setDddPath(p);
  }

  async function onParse() {
    if (!dddPath) return;
    setErr(null);

    const parseId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    parseIdRef.current = parseId;

    setLoading(true);
    setProgressPercent(0);
    setProgressStage("Avvio...");

    try {
      const j = await window.api.parseDdd(dddPath, parseId);
      setJson(j);
      setReport(buildReport(j));
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
      parseIdRef.current = null;
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
    <div
      style={{
        padding: 16,
        fontFamily: "system-ui",
        height: "100vh",
        overflowY: "auto",
        boxSizing: "border-box",
      }}
    >
      <h2>{title}</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={onOpen} disabled={loading}>Seleziona .ddd</button>
        <button onClick={onParse} disabled={!dddPath || loading}>
          {loading ? "Parsing..." : "Parse"}
        </button>
        <button onClick={onExportWord} disabled={!json || loading}>Export Word</button>
        <button onClick={onExportJson} disabled={!json || loading}>Export JSON</button>
      </div>

      {dddPath && <div style={{ marginBottom: 12 }}>File: {dddPath}</div>}
      {err && <div style={{ color: "crimson", marginBottom: 12 }}>{err}</div>}

      {report && <ReportView report={report} />}

      {/* Overlay fullscreen */}
      {loading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              width: "min(720px, 92vw)",
              background: "#111",
              border: "1px solid #333",
              borderRadius: 12,
              padding: 20,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
              Parsing in corso
            </div>

            <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 14 }}>
              {progressStage} ({progressPercent}%)
            </div>

            <div
              style={{
                width: "100%",
                height: 14,
                borderRadius: 999,
                background: "#222",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, progressPercent))}%`,
                  height: "100%",
                  background: "#4f8cff",
                  transition: "width 180ms linear",
                }}
              />
            </div>

            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
              Nota: durante la fase di conversione la percentuale è una stima, poi si completa a 100% quando termina.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
