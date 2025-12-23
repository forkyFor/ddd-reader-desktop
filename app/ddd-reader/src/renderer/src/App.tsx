import { useMemo, useState } from "react";
import ReportView from "./components/ReportView";
import JsonViewer from "./components/JsonViewer";
import { buildReport } from "../../shared/buildReport";
import type { ReportDocument } from "../../shared/reportModel";

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
  const [jsonFolder, setJsonFolder] = useState<string | null>(null);
  const [jsonFiles, setJsonFiles] = useState<string[]>([]);
  const [jsonSelected, setJsonSelected] = useState<string | null>(null);
  const [parsed, setParsed] = useState<any>(null);
  const [doc, setDoc] = useState<ReportDocument | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [view, setView] = useState<"REPORT" | "JSON" | "NORMALIZED">("REPORT");

  const title = useMemo(() => "DDD Reader", []);

  async function onOpen() {
    setErr(null);
    const p = await window.api.openDddFile();
    if (!p) return;
    setDddPath(p);
    setParsed(null);
    setDoc(null);
  }

  async function onOpenJsonFile() {
    setErr(null);
    const p = await window.api.openJsonFile();
    if (!p) return;
    setLoading(true);
    try {
      const json = await window.api.readJsonFile(p);
      setDddPath(null);
      setJsonFolder(null);
      setJsonFiles([]);
      setJsonSelected(p);
      setParsed(json);
      setDoc(buildReport(json));
      setView("REPORT");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onOpenJsonFolder() {
    setErr(null);
    const folder = await window.api.openJsonFolder();
    if (!folder) return;
    setLoading(true);
    try {
      const files = await window.api.listJsonFiles(folder);
      setJsonFolder(folder);
      setJsonFiles(files);
      setJsonSelected(files[0] ?? null);

      if (files[0]) {
        const json = await window.api.readJsonFile(files[0]);
        setParsed(json);
        setDoc(buildReport(json));
        setView("REPORT");
      } else {
        setParsed(null);
        setDoc(null);
      }
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onParse() {
    if (!dddPath) return;
    setErr(null);
    setElapsed(0);
    setLoading(true);
    const t0 = Date.now();
    const interval = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
    }, 500);

    try {
      const json = await window.api.parseDdd(dddPath);
      setParsed(json);
      setDoc(buildReport(json));
      setView("REPORT");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      window.clearInterval(interval);
      setLoading(false);
    }
  }

  async function onSelectJsonFile(path: string) {
    setErr(null);
    setLoading(true);
    try {
      const json = await window.api.readJsonFile(path);
      setJsonSelected(path);
      setParsed(json);
      setDoc(buildReport(json));
      setView("REPORT");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
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
    <div style={{ padding: 16, fontFamily: "system-ui", height: "100vh", overflow: "auto", overflowX: "auto" }}>
      {loading && <LoadingOverlay text="Parsing del file .ddd in corso..." seconds={elapsed} />}
      <h2 style={{ marginTop: 0 }}>{title}</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={onOpen} disabled={loading}>
          Seleziona .ddd
        </button>
        <button onClick={onParse} disabled={!dddPath || loading}>
          Analizza
        </button>
        {/*  <button onClick={onOpenJsonFile} disabled={loading}>
          Apri JSON (singolo)
        </button>
        <button onClick={onOpenJsonFolder} disabled={loading}>
          Apri cartella out_json
        </button> */}
        <button onClick={onExportWord} disabled={!parsed || loading}>
          Export Word
        </button>
        <button onClick={onExportJson} disabled={!parsed || loading}>
          Export JSON
        </button>
      </div>

      {dddPath && <div style={{ marginBottom: 12, fontSize: 13 }}>File .ddd: {dddPath}</div>}
      {jsonSelected && <div style={{ marginBottom: 12, fontSize: 13 }}>JSON: {jsonSelected}</div>}
      {err && <div style={{ color: "crimson", marginBottom: 12 }}>{err}</div>}

      <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
        {jsonFolder && jsonFiles.length > 0 && (
          <div style={{ width: 360, flex: "0 0 auto", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: 10, background: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontSize: 12 }}>
              Cartella: {jsonFolder}
            </div>
            <div style={{ maxHeight: "70vh", overflow: "auto" }}>
              {jsonFiles.map((f) => {
                const name = f.split(/[\\/]/).slice(-1)[0];
                const isSel = f === jsonSelected;
                return (
                  <div
                    key={f}
                    onClick={() => onSelectJsonFile(f)}
                    style={{
                      cursor: "pointer",
                      padding: "8px 10px",
                      fontSize: 12,
                      borderBottom: "1px solid #f3f4f6",
                      background: isSel ? "#eef2ff" : "transparent",
                    }}
                  >
                    {name}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ flex: "1 1 auto", minWidth: 720 }}>
          {/* <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <button onClick={() => setView("REPORT")} disabled={!parsed}>
              Report
            </button>
            <button onClick={() => setView("NORMALIZED")} disabled={!parsed}>
              Normalizzato
            </button>
            <button onClick={() => setView("JSON")} disabled={!parsed}>
              JSON completo
            </button>
          </div> */}

          {!parsed ? (
            <div style={{ fontSize: 13, opacity: 0.85 }}>
              Seleziona un file .ddd (e fai Parse) oppure apri un JSON / cartella out_json per vedere il report.
            </div>
          ) : view === "REPORT" ? (
            doc ? <ReportView doc={doc} /> : <div>Impossibile costruire il report.</div>
          ) : view === "NORMALIZED" ? (
            <JsonViewer value={parsed?.normalized ?? parsed?.Normalized ?? {}} />
          ) : (
            <JsonViewer value={parsed} />
          )}
        </div>
      </div>
    </div>
  );
}
