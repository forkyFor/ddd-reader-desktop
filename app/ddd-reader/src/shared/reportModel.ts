export type ReportRowAction =
    | {
          type: "pdf";
          /** Codice personalizzato (es. W0501) */
          code: string;
          /** Payload serializzabile, usato per generare il PDF in main */
          payload: any;
      };

export type ReportTableRow = {
    cells: string[];
    actions?: ReportRowAction[];
    details?: {
        title: string;
        headers: string[];
        rows: string[][];
    };
};

export type ReportBlock =
    | { type: "title"; text: string }
    | { type: "h1"; text: string }
    | { type: "p"; text: string }
    | {
        type: "table";
        headers: string[];
        rows: ReportTableRow[];
        pageSize?: number;
    };

export type ReportDocument = {
    blocks: ReportBlock[];
};
