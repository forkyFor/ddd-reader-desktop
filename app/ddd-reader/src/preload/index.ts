import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

const api = {
  openDddFile: () => ipcRenderer.invoke("ddd:openFile"),
  parseDdd: (dddPath: string) => ipcRenderer.invoke("ddd:parse", dddPath),
  exportWord: (json: any) => ipcRenderer.invoke("ddd:exportWord", json),
  exportJson: (json: any) => ipcRenderer.invoke("ddd:exportJson", json),
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
