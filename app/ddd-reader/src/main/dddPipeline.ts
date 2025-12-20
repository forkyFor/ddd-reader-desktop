import { app } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";

export interface ParseProgress {
    percent: number;
    stage: string;
}

export type ProgressCallback = (progress: ParseProgress) => void;

export interface IDDDParser {
    name: string;
    parse(dddPath: string, onProgress?: ProgressCallback): Promise<any>;
}

// ----------------------------------------------------------------------------
// Helpers (Paths)
// ----------------------------------------------------------------------------

function getReadEsmWrapperPath() {
    if (app.isPackaged) return path.join(process.resourcesPath, "tools", "readesm-wrapper.mjs");
    return path.join(app.getAppPath(), "tools", "readesm-wrapper.mjs");
}

function getDddParserExePath() {
    if (app.isPackaged) return path.join(process.resourcesPath, "tools", "dddparser.exe");
    return path.join(app.getAppPath(), "tools", "dddparser.exe");
}

function getTachographGoExePath() {
    if (app.isPackaged) return path.join(process.resourcesPath, "tools", "tachograph-go.exe");
    return path.join(app.getAppPath(), "tools", "tachograph-go.exe");
}

function getTachoparserExePath() {
    if (app.isPackaged) return path.join(process.resourcesPath, "tools", "tachoparser.exe");
    return path.join(app.getAppPath(), "tools", "tachoparser.exe");
}

// ----------------------------------------------------------------------------
// Parsers
// ----------------------------------------------------------------------------

export class ReadEsmParser implements IDDDParser {
    name = "readesm-js";

    async parse(dddPath: string, onProgress?: ProgressCallback): Promise<any> {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ddd-reader-"));
        const outJson = path.join(tmpDir, "output.json");
        const wrapper = getReadEsmWrapperPath();

        // Wrapper check
        try {
            await fs.stat(wrapper);
        } catch (e: any) {
            throw new Error(`Wrapper non trovato: ${wrapper}`);
        }

        if (onProgress) onProgress({ percent: 0, stage: "Starting ReadESM..." });

        const child = spawn(process.execPath, [wrapper, dddPath, outJson], {
            env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
            windowsHide: true,
        });

        let stderr = "";
        let stdout = "";

        child.stdout?.on("data", (d) => {
            const t = d.toString();
            stdout += t;
            // Could parse progress from stdout if wrapper supported it standardly
            // wrapper emits json strings: { type: "progress", percent, stage } 
            // but in index.ts logic it wasn't fully parsed. 
            // However the wrapper source shows it emits JSON lines.
            // Let's try to parse them if possible, but keep it simple as before first.
        });

        child.stderr?.on("data", (d) => {
            stderr += d.toString();
        });

        const TIMEOUT_MS = 6 * 60 * 1000;
        let timer: NodeJS.Timeout | undefined;

        const code = await new Promise<number>((resolve) => {
            timer = setTimeout(() => {
                child.kill();
            }, TIMEOUT_MS);
            child.on("close", resolve);
        });
        if (timer) clearTimeout(timer);

        if (code !== 0) {
            throw new Error(stderr || stdout || `ReadESM parser exited with code ${code}`);
        }

        // Ensure output exists
        try {
            await fs.stat(outJson);
        } catch (e: any) {
            throw new Error("Output JSON non generato dal parser (output.json mancante).");
        }

        const raw = await fs.readFile(outJson, "utf-8");
        if (onProgress) onProgress({ percent: 100, stage: "ReadESM Done" });
        return JSON.parse(raw);
    }
}

export class TachographGoParser implements IDDDParser {
    name = "tachograph-go";

    async parse(dddPath: string, onProgress?: ProgressCallback): Promise<any> {
        const exe = getTachographGoExePath();
        try {
            await fs.stat(exe);
        } catch (e) {
            throw new Error(`TachographGo exe missing at ${exe}`);
        }

        if (onProgress) onProgress({ percent: 0, stage: "Starting TachographGo..." });

        return new Promise((resolve, reject) => {
            const child = spawn(exe, ["parse", dddPath], {
                windowsHide: true,
                stdio: ["ignore", "pipe", "pipe"]
            });

            let stdout = "";
            let stderr = "";

            child.stdout.on("data", (d) => (stdout += d.toString()));
            child.stderr.on("data", (d) => (stderr += d.toString()));

            child.on("close", (code) => {
                if (code !== 0) {
                    reject(new Error(stderr || `tachograph-go exited with code ${code}`));
                } else {
                    try {
                        if (onProgress) onProgress({ percent: 100, stage: "TachographGo Done" });
                        resolve(JSON.parse(stdout));
                    } catch (err: any) {
                        reject(new Error(`JSON parse error from tachograph-go: ${err.message}`));
                    }
                }
            });

            child.on("error", reject);
        });
    }
}

export class DddParserExeParser implements IDDDParser {
    name = "dddparser-legacy";

    async parse(dddPath: string, onProgress?: ProgressCallback): Promise<any> {
        const exe = getDddParserExePath();
        await fs.stat(exe);

        const st = await fs.stat(dddPath);
        const total = st.size || 1;

        // Guess mode
        const mode = this.guessDddType(dddPath);

        if (onProgress) onProgress({ percent: 0, stage: "Starting DDDParser fallback..." });

        const child = spawn(exe, [mode], {
            windowsHide: true,
            stdio: ["pipe", "pipe", "pipe"]
        });

        let stdout = "";
        let stderr = "";

        child.stdout?.on("data", (d) => (stdout += d.toString("utf-8")));
        child.stderr?.on("data", (d) => (stderr += d.toString("utf-8")));

        let sent = 0;
        await new Promise<void>((resolve, reject) => {
            const rs = fsSync.createReadStream(dddPath, { highWaterMark: 1024 * 256 });

            rs.on("data", (chunk) => {
                sent += chunk.length;
                const percent = Math.min(100, Math.round((sent / total) * 100));
                if (onProgress) onProgress({ percent, stage: "Parsing..." });
            });
            rs.on("error", reject);
            rs.on("end", () => child.stdin?.end());

            rs.pipe(child.stdin!);

            child.on("error", reject);
            child.on("close", (code) => {
                if (code !== 0) {
                    reject(new Error(stderr || `dddparser exited with code ${code}`));
                } else {
                    resolve();
                }
            });
        });

        if (onProgress) onProgress({ percent: 100, stage: "DDDParser Done" });

        try {
            return JSON.parse(stdout);
        } catch {
            throw new Error(`Fallback parser: output non JSON. stderr=${stderr.slice(0, 2000)}`);
        }
    }

    private guessDddType(dddPath: string): "-card" | "-vu" {
        const name = path.basename(dddPath).toUpperCase();
        // euristica filename
        if (name.includes("_DR") || name.includes("DRIVER") || name.includes("CARD")) return "-card";
        return "-vu";
    }
}

// ----------------------------------------------------------------------------
// Python Parser
// ----------------------------------------------------------------------------

export class PythonDumperParser implements IDDDParser {
    name = "python-dump";

    async parse(dddPath: string, onProgress?: ProgressCallback): Promise<any> {
        // Check for python
        const pythonExe = "python"; // Assume in PATH
        const script = app.isPackaged
            ? path.join(process.resourcesPath, "tools", "simple_dump.py")
            : path.join(app.getAppPath(), "tools", "simple_dump.py");

        try {
            await fs.stat(script);
        } catch {
            throw new Error(`Python script missing at ${script}`);
        }

        if (onProgress) onProgress({ percent: 0, stage: "Starting Python parser..." });

        return new Promise((resolve, reject) => {
            const child = spawn(pythonExe, [script, dddPath], {
                windowsHide: true
            });

            let stdout = "";
            let stderr = "";

            child.stdout.on("data", (d) => (stdout += d.toString()));
            child.stderr.on("data", (d) => (stderr += d.toString()));

            child.on("close", (code) => {
                if (code !== 0) {
                    reject(new Error(stderr || `python exited with code ${code}`));
                } else {
                    try {
                        if (onProgress) onProgress({ percent: 100, stage: "Python Done" });
                        resolve(JSON.parse(stdout));
                    } catch (err: any) {
                        // If python passed but output isn't JSON
                        reject(new Error(`JSON parse error from python: ${err.message}. Output: ${stdout.slice(0, 100)}`));
                    }
                }
            });
            child.on("error", (err) => {
                reject(new Error(`Failed to spawn python. Is it installed? ${err.message}`));
            });
        });
    }
}

// ----------------------------------------------------------------------------
// Tachoparser (traconiq/tachoparser - Go-based comprehensive parser)
// ----------------------------------------------------------------------------

export class TachoparserParser implements IDDDParser {
    name = "tachoparser";

    async parse(dddPath: string, onProgress?: ProgressCallback): Promise<any> {
        const exe = getTachoparserExePath();

        // Check if executable exists
        try {
            await fs.stat(exe);
        } catch (e) {
            throw new Error(`Tachoparser exe not found at ${exe}. See tools/BUILD_TACHOPARSER.md for build instructions.`);
        }

        if (onProgress) onProgress({ percent: 0, stage: "Starting Tachoparser..." });

        // Guess mode (-card or -vu) based on filename
        const mode = this.guessDddType(dddPath);

        return new Promise((resolve, reject) => {
            const child = spawn(exe, [mode], {
                windowsHide: true,
                stdio: ["pipe", "pipe", "pipe"]
            });

            let stdout = "";
            let stderr = "";

            child.stdout?.on("data", (d) => (stdout += d.toString("utf-8")));
            child.stderr?.on("data", (d) => (stderr += d.toString("utf-8")));

            // Pipe file to stdin (like dddparser)
            const rs = fsSync.createReadStream(dddPath, { highWaterMark: 1024 * 256 });

            rs.on("error", reject);
            rs.on("end", () => child.stdin?.end());
            rs.pipe(child.stdin!);

            child.on("close", (code) => {
                if (code !== 0) {
                    reject(new Error(stderr || `tachoparser exited with code ${code}`));
                } else {
                    try {
                        if (onProgress) onProgress({ percent: 100, stage: "Tachoparser Done" });
                        resolve(JSON.parse(stdout));
                    } catch (err: any) {
                        reject(new Error(`JSON parse error from tachoparser: ${err.message}`));
                    }
                }
            });

            child.on("error", reject);
        });
    }

    private guessDddType(dddPath: string): "-card" | "-vu" {
        const name = path.basename(dddPath).toUpperCase();

        // C_ prefix = driver card, M_ prefix = vehicle unit
        if (name.startsWith("C_")) return "-card";
        if (name.startsWith("M_")) return "-vu";

        // Fallback heuristic (same as dddparser)
        if (name.includes("DRIVER") || name.includes("CARD")) return "-card";
        return "-vu";
    }
}


// ----------------------------------------------------------------------------
// Pipeline
// ----------------------------------------------------------------------------

/**
 * Deep merge utility function to combine multiple JSON objects
 * Later objects override earlier ones for conflicting keys
 */
function deepMerge(target: any, ...sources: any[]): any {
    if (!sources.length) return target;
    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
        for (const key in source) {
            if (isObject(source[key])) {
                if (!target[key]) Object.assign(target, { [key]: {} });
                deepMerge(target[key], source[key]);
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        }
    }

    return deepMerge(target, ...sources);
}

function isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
}

export interface ParserResult {
    success: boolean;
    data?: any;
    error?: string;
}

export interface MergedParserOutput {
    merged: true;
    timestamp: string;
    parsers: Record<string, ParserResult>;
    combinedData: any;
    successCount: number;
    failureCount: number;
}

export class DDDParserPipeline {
    private parsers: IDDDParser[] = [];

    constructor() {
        // All available parsers:
        // 1. ReadESM (Best for cards)
        // 2. TachographGo (Good for both VU and cards)
        // 3. Tachoparser (Comprehensive Gen1/2/2v2 support)
        // 4. Python Dump (Fallback/Demo - lightweight metadata)
        // 5. DDDParser (Legacy compatibility)

        this.parsers.push(new ReadEsmParser());
        this.parsers.push(new TachographGoParser());
        this.parsers.push(new TachoparserParser());
        this.parsers.push(new PythonDumperParser());
        this.parsers.push(new DddParserExeParser());
    }

    async parse(dddPath: string, onProgress?: ProgressCallback): Promise<MergedParserOutput> {
        console.log(`[DDDParserPipeline] Running all ${this.parsers.length} parsers in parallel...`);

        if (onProgress) onProgress({ percent: 0, stage: "Starting all parsers..." });

        // Run all parsers in parallel
        const results = await Promise.allSettled(
            this.parsers.map(async (parser) => {
                console.log(`[DDDParserPipeline] Starting parser: ${parser.name}`);
                try {
                    const data = await parser.parse(dddPath, onProgress);
                    console.log(`[DDDParserPipeline] Parser ${parser.name} succeeded`);
                    return { parser: parser.name, data };
                } catch (e: any) {
                    console.error(`[DDDParserPipeline] Parser ${parser.name} failed:`, e.message);
                    throw { parser: parser.name, error: e.message };
                }
            })
        );

        // Process results
        const parserResults: Record<string, ParserResult> = {};
        const successfulData: any[] = [];
        let successCount = 0;
        let failureCount = 0;

        for (const result of results) {
            if (result.status === 'fulfilled') {
                const { parser, data } = result.value;
                parserResults[parser] = {
                    success: true,
                    data
                };
                successfulData.push(data);
                successCount++;
            } else {
                const { parser, error } = result.reason;
                parserResults[parser] = {
                    success: false,
                    error
                };
                failureCount++;
            }
        }

        // Merge all successful parser outputs
        const combinedData = successfulData.reduce((merged, data) => {
            return deepMerge(merged, data);
        }, {});

        if (onProgress) onProgress({ percent: 100, stage: `Completed: ${successCount} succeeded, ${failureCount} failed` });

        console.log(`[DDDParserPipeline] Merge complete. ${successCount} parsers succeeded, ${failureCount} failed`);

        return {
            merged: true,
            timestamp: new Date().toISOString(),
            parsers: parserResults,
            combinedData,
            successCount,
            failureCount
        };
    }
}