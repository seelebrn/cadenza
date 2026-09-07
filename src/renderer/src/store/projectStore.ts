import { create } from 'zustand'
import type { ProjectData, RecentProjectEntry } from '@shared/types'

interface ProjectState {
  data: ProjectData | null
  filePath: string | null
  isDirty: boolean
  isSaving: boolean
  recent: RecentProjectEntry[]
  error: string | null

  loadRecent: () => Promise<void>
  newProject: (name: string) => Promise<void>
  openProject: () => Promise<void>
  openRecent: (filePath: string) => Promise<void>
  save: () => Promise<void>
  saveAs: () => Promise<void>
  closeProject: () => void
  /** Apply a change to the current project and (if already saved once) autosave it. */
  updateProject: (updater: (data: ProjectData) => ProjectData) => void
}

const AUTOSAVE_DELAY_MS = 1500
let autosaveTimer: ReturnType<typeof setTimeout> | null = null

export const useProjectStore = create<ProjectState>((set, get) => ({
  data: null,
  filePath: null,
  isDirty: false,
  isSaving: false,
  recent: [],
  error: null,

  loadRecent: async () => {
    const recent = await window.api.project.getRecent()
    set({ recent })
  },

  newProject: async (name) => {
    const data = await window.api.project.create(name)
    set({ data, filePath: null, isDirty: true, error: null })
  },

  openProject: async () => {
    try {
      const result = await window.api.project.openDialog()
      if (!result) return
      set({ data: result.data, filePath: result.filePath, isDirty: false, error: null })
      await get().loadRecent()
    } catch (e) {
      set({ error: `Could not open project: ${(e as Error).message}` })
    }
  },

  openRecent: async (filePath) => {
    try {
      const result = await window.api.project.openPath(filePath)
      set({ data: result.data, filePath: result.filePath, isDirty: false, error: null })
      await get().loadRecent()
    } catch (e) {
      set({ error: `Could not open ${filePath}: ${(e as Error).message}` })
    }
  },

  save: async () => {
    const { data, filePath } = get()
    if (!data) return
    set({ isSaving: true, error: null })
    try {
      const result = await window.api.project.save(data, filePath)
      if (!result) return // user canceled the implicit save-as dialog
      set({ filePath: result.filePath, isDirty: false })
      await get().loadRecent()
    } catch (e) {
      set({ error: `Could not save project: ${(e as Error).message}` })
    } finally {
      set({ isSaving: false })
    }
  },

  saveAs: async () => {
    const { data } = get()
    if (!data) return
    set({ isSaving: true, error: null })
    try {
      const result = await window.api.project.saveAs(data)
      if (!result) return
      set({ filePath: result.filePath, isDirty: false })
      await get().loadRecent()
    } catch (e) {
      set({ error: `Could not save project: ${(e as Error).message}` })
    } finally {
      set({ isSaving: false })
    }
  },

  closeProject: () => {
    if (autosaveTimer) clearTimeout(autosaveTimer)
    set({ data: null, filePath: null, isDirty: false, error: null })
  },

  updateProject: (updater) => {
    const { data, filePath } = get()
    if (!data) return
    set({ data: updater(data), isDirty: true })
    if (filePath) {
      if (autosaveTimer) clearTimeout(autosaveTimer)
      autosaveTimer = setTimeout(() => {
        void get().save()
      }, AUTOSAVE_DELAY_MS)
    }
  }
}))
