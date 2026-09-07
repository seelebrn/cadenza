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
  }
}

contextBridge.exposeInMainWorld('api', api)
