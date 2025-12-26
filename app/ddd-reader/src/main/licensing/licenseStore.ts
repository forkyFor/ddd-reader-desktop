import fs from "fs";
import path from "path";
import { app } from "electron";
import { LicenseState } from "../../shared/licensing/types";

const FILE_NAME = "license.json";

const defaultState: LicenseState = {
    status: "UNKNOWN",
};

function getFilePath() {
    const dir = app.getPath("userData");
    return path.join(dir, FILE_NAME);
}

export function getLicenseState(): LicenseState {
    try {
        const p = getFilePath();
        if (!fs.existsSync(p)) return { ...defaultState };
        const raw = fs.readFileSync(p, "utf-8");
        const parsed = JSON.parse(raw);
        return { ...defaultState, ...parsed };
    } catch {
        return { ...defaultState };
    }
}

export function setLicenseState(partial: Partial<LicenseState>): LicenseState {
    const current = getLicenseState();
    const next: LicenseState = { ...current, ...partial };
    const p = getFilePath();
    fs.writeFileSync(p, JSON.stringify(next, null, 2), "utf-8");
    return next;
}

export function clearLicenseState(): void {
    const p = getFilePath();
    try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
        // ignore
    }
}
