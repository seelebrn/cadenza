import { contextBridge, ipcRenderer } from 'electron'
import type { CadenzaApi } from '../shared/api'

const api: CadenzaApi = {
  project: {
    create: (name) => ipcRenderer.invoke('project:create', name),
    openDialog: () => ipcRenderer.invoke('project:open-dialog'),
    openPath: (filePath) => ipcRenderer.invoke('project:open-path', filePath),
    save: (data, filePath) => ipcRenderer.invoke('project:save', data, filePath),
    saveAs: (data) => ipcRenderer.invoke('project:save-as', data),
    getRecent: () => ipcRenderer.invoke('project:get-recent')
  }
}

contextBridge.exposeInMainWorld('api', api)
