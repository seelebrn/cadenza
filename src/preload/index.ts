import { contextBridge, ipcRenderer } from 'electron'
import type { CadenzaApi } from '../shared/api'

const api: CadenzaApi = {
  project: {
    create: (name) => ipcRenderer.invoke('project:create', name),
    openDialog: () => ipcRenderer.invoke('project:open-dialog'),
    openPath: (filePath) => ipcRenderer.invoke('project:open-path', filePath),
    save: (data, assets, filePath) => ipcRenderer.invoke('project:save', data, assets, filePath),
    saveAs: (data, assets) => ipcRenderer.invoke('project:save-as', data, assets),
    getRecent: () => ipcRenderer.invoke('project:get-recent'),
    removeRecent: (filePath) => ipcRenderer.invoke('project:remove-recent', filePath),
    openExample: () => ipcRenderer.invoke('project:open-example'),
    listBackups: (projectId) => ipcRenderer.invoke('project:list-backups', projectId),
    restoreBackup: (projectId, fileName) =>
      ipcRenderer.invoke('project:restore-backup', projectId, fileName),
    exportQdpx: (data) => ipcRenderer.invoke('project:export-qdpx', data),
    importQdpx: () => ipcRenderer.invoke('project:import-qdpx')
  },
  app: {
    info: () => ipcRenderer.invoke('app:info')
  },
  document: {
    importDialog: () => ipcRenderer.invoke('document:import-dialog')
  },
  export: {
    report: (report, format, suggestedName) => ipcRenderer.invoke('export:report', report, format, suggestedName),
    boardPdf: (html, widthPx, heightPx, suggestedName) =>
      ipcRenderer.invoke('export:board-pdf', html, widthPx, heightPx, suggestedName),
    spreadsheet: (sheets, suggestedName) => ipcRenderer.invoke('export:spreadsheet', sheets, suggestedName)
  }
}

contextBridge.exposeInMainWorld('api', api)
