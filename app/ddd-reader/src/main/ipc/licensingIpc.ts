import { ipcMain } from "electron";
import {
    AuthorizeFileRequest,
} from "../../shared/licensing/types";
import {
    activateWithToken,
    authorizeFile,
    validateLicense,
} from "../licensing/licenseService";
import {
    clearLicenseState,
    getLicenseState,
} from "../licensing/licenseStore";

export function registerLicensingIpc() {
    ipcMain.handle("licensing:getState", async () => {
        return getLicenseState();
    });

    ipcMain.handle("licensing:activate", async (_evt, payload: { token: string }) => {
        return activateWithToken(payload?.token || "");
    });

    ipcMain.handle("licensing:validate", async () => {
        return validateLicense();
    });

    ipcMain.handle("licensing:authorizeFile", async (_evt, req: AuthorizeFileRequest) => {
        return authorizeFile(req);
    });

    ipcMain.handle("licensing:clear", async () => {
        clearLicenseState();
        return { ok: true };
    });
}
