import { useMemo, useState } from "react";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeStringify(v: any): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    // Should not happen for our parse output, but keep UI resilient.
    return String(v);
  }
}

export default function JsonViewer({
  value,
  title,
}: {
  value: any;
  title?: string;
}) {
  const [query, setQuery] = useState("");

  const jsonText = useMemo(() => safeStringify(value), [value]);

  const highlighted = useMemo(() => {
    if (!query.trim()) return escapeHtml(jsonText);

    // Very lightweight highlighter (case-insensitive), avoids heavy JSON tree deps.
    const q = query.trim();
    try {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
      return escapeHtml(jsonText).replace(re, (m) => `<mark>${escapeHtml(m)}</mark>`);
    } catch {
      return escapeHtml(jsonText);
    }
  }, [jsonText, query]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(jsonText);
    } catch {
      // ignore
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 650 }}>{title ?? "JSON"}</div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca nel JSON (es: driver, vin, periodStart...)"
          style={{
            flex: "1 1 340px",
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
          }}
        />

        <button onClick={onCopy} style={{ whiteSpace: "nowrap" }}>
          Copia JSON
        </button>
      </div>

      <div
        style={{
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 12,
          background: "rgba(0,0,0,0.03)",
          overflow: "auto",
          maxHeight: "70vh",
        }}
      >
        <pre
          style={{
            margin: 0,
            padding: 12,
            fontSize: 12,
            lineHeight: 1.4,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
            whiteSpace: "pre",
          }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </div>
    </div>
  );
}
