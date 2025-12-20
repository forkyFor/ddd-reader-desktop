import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path, { join } from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";

import { exportReportToWord } from "./word/exportWord";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.electron");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  ipcMain.on("ping", () => console.log("pong"));

  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ----------------------
// PATHS (wrappers/tools)
// ----------------------

function getReadEsmWrapperPath() {
  // In dev: tools/ nel progetto. In prod: tools/ in resources (extraResources)
  if (app.isPackaged) return path.join(process.resourcesPath, "tools", "readesm-wrapper.mjs");
  return path.join(app.getAppPath(), "tools", "readesm-wrapper.mjs");
}

function getDddParserExePath() {
  // dddparser.exe (fallback)
  if (app.isPackaged) return path.join(process.resourcesPath, "tools", "dddparser.exe");
  return path.join(app.getAppPath(), "tools", "dddparser.exe");
}

function getTachographGoExePath() {
  if (app.isPackaged) return path.join(process.resourcesPath, "tools", "tachograph-go.exe");
  return path.join(app.getAppPath(), "tools", "tachograph-go.exe");
}

// ----------------------
// IPC: Open file
// ----------------------

ipcMain.handle("ddd:openFile", async () => {
  const res = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "File tachigrafo (.ddd)", extensions: ["ddd"] }]
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});

// ----------------------
// Parser A: readesm-js wrapper (Node via Electron as Node)
// ----------------------

async function parseWithReadEsm(dddPath: string) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ddd-reader-"));
  const outJson = path.join(tmpDir, "output.json");

  const wrapper = getReadEsmWrapperPath();

  const child = spawn(process.execPath, [wrapper, dddPath, outJson], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    windowsHide: true
  });

  let stderr = "";
  child.stderr?.on("data", (d) => (stderr += d.toString()));

  const code: number = await new Promise((resolve) => child.on("close", resolve));
  if (code !== 0) throw new Error(stderr || `readesm wrapper exited with code ${code}`);

  const raw = await fs.readFile(outJson, "utf-8");
  return JSON.parse(raw);
}

// ----------------------
// Parser B: dddparser.exe (stdin->stdout) + progress
// README: reads from STDIN, outputs JSON to STDOUT, needs -card or -vu :contentReference[oaicite:5]{index=5}
// ----------------------

function guessDddTypeForFallback(errOrJson: any, dddPath: string): "-card" | "-vu" {
  const name = path.basename(dddPath).toUpperCase();

  // Se l'errore parla di "card block", è praticamente sicuro sia driver card
  const msg = String(errOrJson?.errorMessage || errOrJson?.message || "");
  if (msg.toLowerCase().includes("card block")) return "-card";

  // euristica filename (non perfetta, ma utile)
  if (name.includes("_DR") || name.includes("DRIVER") || name.includes("CARD")) return "-card";

  // default
  return "-vu";
}

async function parseWithDddParserExe(dddPath: string, mode: "-card" | "-vu") {
  const exe = getDddParserExePath();

  // check exe exists
  await fs.stat(exe);

  // file size (per percentuale)
  const st = await fs.stat(dddPath);
  const total = st.size || 1;

  // reset progress
  mainWindow?.webContents.send("ddd:parseProgress", { percent: 0, stage: "Avvio parsing (fallback)..." });

  const child = spawn(exe, [mode], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";

  child.stdout?.on("data", (d) => (stdout += d.toString("utf-8")));
  child.stderr?.on("data", (d) => (stderr += d.toString("utf-8")));

  // stream input with progress
  let sent = 0;
  await new Promise<void>((resolve, reject) => {
    const rs = fsSync.createReadStream(dddPath, { highWaterMark: 1024 * 256 });

    rs.on("data", (chunk) => {
      sent += chunk.length;
      const percent = Math.min(100, Math.round((sent / total) * 100));
      mainWindow?.webContents.send("ddd:parseProgress", { percent, stage: "Parsing in corso (fallback)..." });
    });

    rs.on("error", reject);

    rs.on("end", () => {
      child.stdin?.end();
    });

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

  mainWindow?.webContents.send("ddd:parseProgress", { percent: 100, stage: "Completato." });

  // dddparser writes JSON to STDOUT
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`Fallback parser: output non JSON. stderr=${stderr.slice(0, 2000)}`);
  }
}

async function parseWithTachographGo(dddPath: string) {
  console.log("[parseWithTachographGo] start", dddPath);
  const exe = getTachographGoExePath();
  try {
    await fs.stat(exe);
  } catch (e) {
    throw new Error(`TachographGo exe missing at ${exe}`);
  }

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
      console.log("[parseWithTachographGo] closed code=", code);
      if (code !== 0) {
        reject(new Error(stderr || `tachograph-go exited with code ${code}`));
      } else {
        try {
          resolve(JSON.parse(stdout));
        } catch (err: any) {
          reject(new Error(`JSON parse error from tachograph-go: ${err.message}`));
        }
      }
    });

    child.on("error", reject);
  });
}

// ----------------------
// IPC: Parse (chain A -> B)
// ----------------------

ipcMain.handle("ddd:parse", async (_evt, dddPath: string) => {

  console.log("[ddd:parse] start", { dddPath });

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ddd-reader-"));
  const outJson = path.join(tmpDir, "output.json");

  // Wrapper path inline (dev vs packaged)
  const wrapper = app.isPackaged
    ? path.join(process.resourcesPath, "tools", "readesm-wrapper.mjs")
    : path.join(app.getAppPath(), "tools", "readesm-wrapper.mjs");

  console.log("[ddd:parse] wrapper", wrapper);
  console.log("[ddd:parse] outJson", outJson);

  // Attempt 1: ReadESM (Standard)
  try {
    return await parseWithReadEsmInternal(dddPath, wrapper, outJson);
  } catch (err1: any) {
    console.error("[ddd:parse] ReadESM failed:", err1.message);

    // Attempt 2: TachographGo (New)
    try {
      console.log("[ddd:parse] Trying TachographGo fallback...");
      return await parseWithTachographGo(dddPath);
    } catch (err2: any) {
      console.error("[ddd:parse] TachographGo failed:", err2.message);

      // Attempt 3: DDDParser.exe (Old Fallback)
      console.log("[ddd:parse] Trying dddparser.exe fallback...");
      const mode = guessDddTypeForFallback(err1, dddPath);
      return await parseWithDddParserExe(dddPath, mode);
    }
  }
});

// Helper to encapsulate the ReadESM logic originally inside the handler
async function parseWithReadEsmInternal(dddPath: string, wrapper: string, outJson: string) {
  // Wrapper check
  try {
    await fs.stat(wrapper);
  } catch (e: any) {
    throw new Error(`Wrapper non trovato: ${wrapper}`);
  }

  const child = spawn(process.execPath, [wrapper, dddPath, outJson], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    windowsHide: true,
  });

  let stderr = "";
  let stdout = "";

  child.stdout?.on("data", (d) => {
    const t = d.toString();
    stdout += t;
    console.log("[readesm][stdout]", t.trim().slice(0, 200));
  });

  child.stderr?.on("data", (d) => {
    const t = d.toString();
    stderr += t;
    console.log("[readesm][stderr]", t.trim().slice(0, 200));
  });

  const TIMEOUT_MS = 6 * 60 * 1000;
  let timer: NodeJS.Timeout | undefined;

  const code = await new Promise<number>((resolve) => {
    timer = setTimeout(() => {
      console.log("[readesm] TIMEOUT");
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
  return JSON.parse(raw);
}




// ----------------------
// Export Word
// ----------------------

ipcMain.handle("ddd:exportWord", async (_evt, json: any) => {
  const res = await dialog.showSaveDialog({
    filters: [{ name: "Documento Word", extensions: ["docx"] }],
    defaultPath: "ddd-report.docx"
  });
  if (res.canceled || !res.filePath) return null;

  await exportReportToWord(json, res.filePath);
  return res.filePath;
});

// ----------------------
// Export JSON
// ----------------------

ipcMain.handle("ddd:exportJson", async (_evt, json: any) => {
  const res = await dialog.showSaveDialog({
    filters: [{ name: "JSON", extensions: ["json"] }],
    defaultPath: "ddd-output.json"
  });
  if (res.canceled || !res.filePath) return null;

  await fs.writeFile(res.filePath, JSON.stringify(json, null, 2), "utf-8");
  return res.filePath;
});
