import { useMemo, useState } from "react";

export default function JsonViewer({ value }: { value: any }) {
  const [expanded, setExpanded] = useState(false);
  const text = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

  const shown = expanded ? text : text.slice(0, 30000);
  const isTruncated = text.length > shown.length;

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "8px 10px", display: "flex", gap: 10, alignItems: "center", background: "#f9fafb" }}>
        <button onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Comprimi" : "Espandi"}
        </button>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
            } catch {
              // ignore
            }
          }}
        >
          Copia JSON
        </button>
        {isTruncated && <span style={{ fontSize: 12, opacity: 0.7 }}>(troncato in anteprima)</span>}
      </div>
      <div style={{ overflow: "auto", maxHeight: "70vh", padding: 12 }}>
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre" }}>{shown}</pre>
      </div>
    </div>
  );
}
