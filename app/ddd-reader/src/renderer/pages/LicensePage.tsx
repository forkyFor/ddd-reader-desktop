import React, { useEffect, useState } from "react";
import type { LicenseState } from "../../shared/licensing/types";

export default function LicensePage() {
    const [state, setState] = useState<LicenseState | null>(null);
    const [token, setToken] = useState("");
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string>("");

    async function refresh() {
        const st = await window.api.licensing.getState();
        setState(st);
    }

    useEffect(() => {
        refresh().catch(() => { });
    }, []);

    async function onActivate() {
        setBusy(true);
        setMsg("");
        try {
            const st = await window.api.licensing.activate(token);
            setState(st);
            setMsg("Token attivato (stub).");
        } catch (e: any) {
            setMsg(`Errore attivazione: ${String(e?.message || e)}`);
        } finally {
            setBusy(false);
        }
    }

    async function onValidate() {
        setBusy(true);
        setMsg("");
        try {
            const st = await window.api.licensing.validate();
            setState(st);
            setMsg("Stato licenza aggiornato (stub).");
        } catch (e: any) {
            setMsg(`Errore verifica: ${String(e?.message || e)}`);
        } finally {
            setBusy(false);
        }
    }

    async function onClear() {
        setBusy(true);
        setMsg("");
        try {
            await window.api.licensing.clear();
            setToken("");
            await refresh();
            setMsg("Licenza rimossa.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div style={{ padding: 16, maxWidth: 900 }}>
            <h1>Licenza</h1>

            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                <input
                    style={{ flex: 1, padding: 10 }}
                    placeholder="Inserisci token licenza"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    disabled={busy}
                />
                <button onClick={onActivate} disabled={busy || !token.trim()}>
                    Attiva
                </button>
                <button onClick={onValidate} disabled={busy}>
                    Verifica
                </button>
                <button onClick={onClear} disabled={busy}>
                    Rimuovi
                </button>
            </div>

            {msg ? (
                <div style={{ marginBottom: 12, padding: 10, border: "1px solid #334155", borderRadius: 8 }}>
                    {msg}
                </div>
            ) : null}

            <div style={{ padding: 12, border: "1px solid #334155", borderRadius: 10 }}>
                <h2>Stato</h2>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                        <Row k="Status" v={state?.status ?? "—"} />
                        <Row k="Company ID" v={state?.companyId ?? "—"} />
                        <Row k="Scadenza" v={state?.expiresAt ?? "—"} />
                        <Row k="Ultima verifica" v={state?.lastValidatedAt ?? "—"} />
                        <Row k="Token" v={state?.tokenHint ?? "—"} />
                    </tbody>
                </table>

                <h3 style={{ marginTop: 14 }}>Veicoli autorizzati</h3>
                {state?.allowedVehicles?.length ? (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #334155" }}>VRN</th>
                                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #334155" }}>VIN</th>
                            </tr>
                        </thead>
                        <tbody>
                            {state.allowedVehicles.map((v, i) => (
                                <tr key={i}>
                                    <td style={{ padding: 8, borderBottom: "1px solid #1f2937" }}>{v.vrn ?? "—"}</td>
                                    <td style={{ padding: 8, borderBottom: "1px solid #1f2937" }}>{v.vin ?? "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div style={{ opacity: 0.8 }}>Nessun veicolo associato (stub).</div>
                )}
            </div>
        </div>
    );
}

function Row({ k, v }: { k: string; v: string }) {
    return (
        <tr>
            <td style={{ padding: 8, width: 220, opacity: 0.9 }}>{k}</td>
            <td style={{ padding: 8 }}>{v}</td>
        </tr>
    );
}
