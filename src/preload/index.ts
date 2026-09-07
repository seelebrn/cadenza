import { contextBridge } from 'electron'

// Bridge for renderer <-> main IPC. Kept empty for now (Phase 0 scaffold) —
// Phase 1 (project persistence) and later phases will add typed invoke/
// handle channels here (e.g. openProject, saveProject, importDocument).
const api = {}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
