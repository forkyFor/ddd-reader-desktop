import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

const api = {
  openDddFile: () => ipcRenderer.invoke("ddd:openFile"),
  openJsonFile: () => ipcRenderer.invoke("ddd:openJsonFile"),
  openJsonFolder: () => ipcRenderer.invoke("ddd:openJsonFolder"),
  listJsonFiles: (folderPath: string) => ipcRenderer.invoke("ddd:listJsonFiles", folderPath),
  readJsonFile: (filePath: string) => ipcRenderer.invoke("ddd:readJsonFile", filePath),
  parseDdd: (dddPath: string) => ipcRenderer.invoke("ddd:parse", dddPath),
  exportWord: (json: any) => ipcRenderer.invoke("ddd:exportWord", json),
  exportJson: (json: any) => ipcRenderer.invoke("ddd:exportJson", json),
  exportRecordPdf: (payload: any) => ipcRenderer.invoke("ddd:exportRecordPdf", payload),

  onParseProgress: (callback: (payload: { percent: number; stage?: string }) => void) => {
    const handler = (_: any, payload: any) => callback(payload);
    ipcRenderer.on("ddd:parseProgress", handler);
    return () => ipcRenderer.removeListener("ddd:parseProgress", handler);
  },
  licensing: {
    getState: () => ipcRenderer.invoke("licensing:getState"),
    activate: (token: string) => ipcRenderer.invoke("licensing:activate", { token }),
    validate: () => ipcRenderer.invoke("licensing:validate"),
    authorizeFile: (req: any) => ipcRenderer.invoke("licensing:authorizeFile", req),
    clear: () => ipcRenderer.invoke("licensing:clear"),
  }
};

console.log("[preload] loaded");

try {
  if (process.contextIsolated) {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } else {
    // @ts-ignore
    window.electron = electronAPI;
    // @ts-ignore
    window.api = api;
  }

  console.log("[preload] window.api exposed");
} catch (err) {
  console.error("[preload] expose failed:", err);
}
