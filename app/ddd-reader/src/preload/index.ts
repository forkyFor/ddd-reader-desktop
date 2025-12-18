import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from '@electron-toolkit/preload';

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

contextBridge.exposeInMainWorld("api", {
  openDddFile: () => ipcRenderer.invoke("ddd:openFile"),
  parseDdd: (dddPath: string) => ipcRenderer.invoke("ddd:parse", dddPath),
  exportWord: (json: any) => ipcRenderer.invoke("ddd:exportWord", json),
  exportJson: (json: any) => ipcRenderer.invoke("ddd:exportJson", json)
});
