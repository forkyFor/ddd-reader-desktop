interface Window {
    api: {
        openDddFile(): Promise<string | null>;
        openJsonFile(): Promise<string | null>;
        openJsonFolder(): Promise<string | null>;
        listJsonFiles(folderPath: string): Promise<string[]>;
        readJsonFile(filePath: string): Promise<any>;
        parseDdd(path: string): Promise<any>;
        exportWord(json: any): Promise<string | null>;
        exportJson(json: any): Promise<string | null>;
        exportRecordPdf(payload: any): Promise<string | null>;

        onParseProgress(callback: (payload: { percent: number; stage?: string }) => void): () => void;
    };
}
