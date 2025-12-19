import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { spawn } from "node:child_process";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";

let mainWindow: BrowserWindow | null = null;
import { buildReport } from "../shared/buildReport";
import { exportReportToWord } from "./word/exportWord";

function createWindow(): void {
  const mainWindowLocal = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow = mainWindowLocal;

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
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
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function getWrapperPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, "tools", "readesm-wrapper.mjs");
  return path.join(app.getAppPath(), "tools", "readesm-wrapper.mjs");
}

ipcMain.handle("ddd:openFile", async () => {
  const res = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "DDD files", extensions: ["ddd"] }],
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});

ipcMain.handle("ddd:parse", async (_evt, payload: any) => {
  // Compatibilità: accetta sia vecchio formato (string) che nuovo ({ dddPath, parseId })
  const dddPath: string | undefined =
    typeof payload === "string" ? payload : payload?.dddPath;

  const parseId: string =
    typeof payload === "object" && payload?.parseId
      ? String(payload.parseId)
      : `legacy-${Date.now()}`;

  if (!dddPath) {
    throw new Error("ddd:parse chiamato senza dddPath. Verifica preload/App.tsx e riavvia Electron.");
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ddd-reader-"));
  const outJson = path.join(tmpDir, "output.json");
  const wrapper = getWrapperPath();

  const sendProgress = (percent: number, stage: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("ddd:parseProgress", { parseId, percent, stage });
    }
  };

  sendProgress(0, "Avvio...");

  const child = spawn(process.execPath, [wrapper, dddPath, outJson], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    windowsHide: true
  });

  let stderr = "";

  child.stderr?.on("data", (d) => (stderr += d.toString()));

  let stdoutBuf = "";
  child.stdout?.on("data", (d) => {
    stdoutBuf += d.toString();
    const lines = stdoutBuf.split(/\r?\n/);
    stdoutBuf = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg?.type === "progress") {
          sendProgress(Number(msg.percent) || 0, String(msg.stage || ""));
        }
      } catch {
        // ignora linee non JSON
      }
    }
  });

  const code: number = await new Promise((resolve) => child.on("close", resolve));
  if (code !== 0) throw new Error(stderr || `Parser process exited with code ${code}`);

  const raw = await fs.readFile(outJson, "utf-8");

  sendProgress(100, "Completato");
  return JSON.parse(raw);
});

ipcMain.handle("ddd:exportWord", async (_evt, json: any) => {
  const res = await dialog.showSaveDialog({
    filters: [{ name: "Word document", extensions: ["docx"] }],
    defaultPath: "ddd-report.docx",
  });
  if (res.canceled || !res.filePath) return null;

  const report = buildReport(json);
  await exportReportToWord(report, res.filePath);
  return res.filePath;
});

ipcMain.handle("ddd:exportJson", async (_evt, json: any) => {
  const res = await dialog.showSaveDialog({
    filters: [{ name: "JSON", extensions: ["json"] }],
    defaultPath: "ddd-output.json",
  });
  if (res.canceled || !res.filePath) return null;

  await fs.writeFile(res.filePath, JSON.stringify(json, null, 2), "utf-8");
  return res.filePath;
});
