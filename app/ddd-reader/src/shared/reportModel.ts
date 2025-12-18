export type ReportBlock =
    | { type: "title"; text: string }
    | { type: "h1"; text: string }
    | { type: "h2"; text: string }
    | { type: "p"; text: string }
    | { type: "table"; headers?: string[]; rows: string[][] };

export type ReportDocument = {
    blocks: ReportBlock[];
};
