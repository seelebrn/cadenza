import { contextBridge, ipcRenderer } from 'electron'
import type { CadenzaApi } from '../shared/api'

const api: CadenzaApi = {
  project: {
    create: (name) => ipcRenderer.invoke('project:create', name),
    openDialog: () => ipcRenderer.invoke('project:open-dialog'),
    openPath: (filePath) => ipcRenderer.invoke('project:open-path', filePath),
    save: (data, assets, filePath) => ipcRenderer.invoke('project:save', data, assets, filePath),
    saveAs: (data, assets) => ipcRenderer.invoke('project:save-as', data, assets),
    getRecent: () => ipcRenderer.invoke('project:get-recent')
  },
  document: {
    importDialog: () => ipcRenderer.invoke('document:import-dialog')
  },
  export: {
    report: (report, format, suggestedName) => ipcRenderer.invoke('export:report', report, format, suggestedName),
    boardPdf: (html, widthPx, heightPx, suggestedName) =>
      ipcRenderer.invoke('export:board-pdf', html, widthPx, heightPx, suggestedName)
  }
}

contextBridge.exposeInMainWorld('api', api)
