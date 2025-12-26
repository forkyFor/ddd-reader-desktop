import crypto from "crypto";
import {
    AuthorizeFileRequest,
    AuthorizeFileResponse,
    LicenseState,
} from "../../shared/licensing/types";
import { getLicenseState, setLicenseState } from "./licenseStore";

function nowIso() {
    return new Date().toISOString();
}

function addDaysIso(days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
}

function tokenHint(token: string) {
    const t = (token || "").trim();
    if (t.length <= 4) return t ? `…${t}` : undefined;
    return `…${t.slice(-4)}`;
}

// Feature flag (default OFF)
export function isLicensingEnabled(): boolean {
    return String(process.env.LICENSING_ENABLED || "").toLowerCase() === "true";
}

export async function activateWithToken(token: string): Promise<LicenseState> {
    const t = (token || "").trim();
    if (!t) {
        return setLicenseState({ status: "INVALID" });
    }

    // STUB: in futuro chiamerà /activate del cloud e riceverà JWT/allowedVehicles/expiresAt
    const fakeJwt = crypto.randomBytes(16).toString("hex");

    const next = setLicenseState({
        status: "ACTIVE",
        tokenHint: tokenHint(t),
        jwt: fakeJwt,
        companyId: "stub-company",
        expiresAt: addDaysIso(30),
        lastValidatedAt: nowIso(),
        allowedVehicles: [], // in futuro max 3
    });

    return next;
}

export async function validateLicense(): Promise<LicenseState> {
    // STUB: in futuro chiamerà /validate sul cloud
    const st = getLicenseState();
    return setLicenseState({ ...st, lastValidatedAt: nowIso() });
}

export async function authorizeFile(
    req: AuthorizeFileRequest
): Promise<AuthorizeFileResponse> {
    // Se feature flag OFF, non blocchiamo nulla
    if (!isLicensingEnabled()) {
        return { authorized: true, scope: "FULL" };
    }

    const st = getLicenseState();

    if (st.status !== "ACTIVE") {
        return {
            authorized: false,
            scope: "BLOCKED",
            reason: "Licenza non attiva",
        };
    }

    // STUB: qui in futuro chiamerai il cloud, match VRN/VIN vs whitelist
    return { authorized: true, scope: "FULL" };
}
