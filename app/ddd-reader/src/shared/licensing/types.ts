export type LicenseStatus =
    | "UNKNOWN"
    | "ACTIVE"
    | "EXPIRED"
    | "SUSPENDED"
    | "INVALID";

export type LicenseScope = "FULL" | "DRIVER_ONLY" | "BLOCKED";

export type VehicleId = {
    vrn?: string;
    vin?: string;
};

export type LicenseState = {
    status: LicenseStatus;
    companyId?: string;
    expiresAt?: string;
    lastValidatedAt?: string;
    tokenHint?: string;
    jwt?: string;
    allowedVehicles?: VehicleId[];
};

export type AuthorizeFileRequest = {
    fileHash: string;
    vehicleIds: VehicleId[];
    meta?: Record<string, unknown>;
};

export type AuthorizeFileResponse = {
    authorized: boolean;
    scope: LicenseScope;
    reason?: string;
    authToken?: string;
};
