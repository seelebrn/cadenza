import type { ImportedDocument, ProjectData, RecentProjectEntry, SerializedAssets } from './types'

export interface OpenProjectResult {
  data: ProjectData
  assets: SerializedAssets
  filePath: string
}

export interface SaveProjectResult {
  filePath: string
}

/** The renderer-facing surface exposed via contextBridge as `window.api`. */
export interface CadenzaApi {
  project: {
    create: (name: string) => Promise<ProjectData>
    openDialog: () => Promise<OpenProjectResult | null>
    openPath: (filePath: string) => Promise<OpenProjectResult>
    /** Saves to filePath; if null, falls back to a save-as dialog. Null return = user canceled. */
    save: (
      data: ProjectData,
      assets: SerializedAssets,
      filePath: string | null
    ) => Promise<SaveProjectResult | null>
    saveAs: (data: ProjectData, assets: SerializedAssets) => Promise<SaveProjectResult | null>
    getRecent: () => Promise<RecentProjectEntry[]>
  }
  document: {
    /** Opens a native file picker (.docx/.odt/.txt) and imports the chosen file. Null = user canceled. */
    importDialog: () => Promise<ImportedDocument | null>
  }
}
