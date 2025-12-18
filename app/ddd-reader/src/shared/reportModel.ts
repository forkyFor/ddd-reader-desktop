export type ReportTableDetails = {
    title?: string;
    headers?: string[];
    rows: string[][];
};

export type ReportTableRow = {
    cells: string[];
    details?: ReportTableDetails;
};

export type ReportBlock =
    | { type: "title"; text: string }
    | { type: "h1"; text: string }
    | { type: "h2"; text: string }
    | { type: "p"; text: string }
    | {
        type: "table";
        headers?: string[];
        rows: ReportTableRow[];
        pageSize?: number;
    };

export type ReportDocument = {
    blocks: ReportBlock[];
};
