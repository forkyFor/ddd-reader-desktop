import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";
import fs from "node:fs/promises";
import { exportReportToWord } from "./word/exportWord";
import { normalizeMergedOutput } from "../shared/normalize";
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
// IPC: Open JSON file/folder (out_json)
// ----------------------

ipcMain.handle("ddd:openJsonFile", async () => {
  const res = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});

ipcMain.handle("ddd:openJsonFolder", async () => {
  const res = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});

ipcMain.handle("ddd:listJsonFiles", async (_evt, folderPath: string) => {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json"))
    .map((e) => join(folderPath, e.name))
    .sort();
});

ipcMain.handle("ddd:readJsonFile", async (_evt, filePath: string) => {
  const raw = await fs.readFile(filePath, "utf-8");
  const parsed = JSON.parse(raw);

  // Backward compatibility: older generated JSON didn't include a normalized view.
  if (parsed?.merged && parsed?.combinedData && !parsed?.normalized) {
    try {
      parsed.normalized = normalizeMergedOutput({ combinedData: parsed.combinedData });
    } catch {
      // ignore
    }
  }

  return parsed;
});

// ----------------------
// IPC: Parse (chain A -> B)
// ----------------------

import { DDDParserPipeline } from "./dddPipeline";

ipcMain.handle("ddd:parse", async (_evt, dddPath: string) => {
  console.log("[ddd:parse] start", { dddPath });

  const pipeline = new DDDParserPipeline();

  return await pipeline.parse(dddPath, (progress) => {
    mainWindow?.webContents.send("ddd:parseProgress", progress);
  });
});





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
