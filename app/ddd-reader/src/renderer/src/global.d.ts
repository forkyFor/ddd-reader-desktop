import type { AuthorizeFileRequest, AuthorizeFileResponse, LicenseState } from "../shared/licensing/types";

declare global {
    interface Window {
        api: {
            licensing: {
                getState: () => Promise<LicenseState>;
                activate: (token: string) => Promise<LicenseState>;
                validate: () => Promise<LicenseState>;
                authorizeFile: (req: AuthorizeFileRequest) => Promise<AuthorizeFileResponse>;
                clear: () => Promise<{ ok: boolean }>;
            };
        };
    }
}

export { };
