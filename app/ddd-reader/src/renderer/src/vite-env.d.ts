interface Window {
    api: {
        openDddFile(): Promise<string | null>;
        parseDdd(path: string): Promise<any>;
        exportWord(json: any): Promise<string | null>;
        exportJson(json: any): Promise<string | null>;
        onParseProgress(cb: (data: { parseId: string; percent: number; stage: string }) => void): () => void;
    };
}
