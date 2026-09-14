import type { BackupEntry, ImportedDocument, ProjectData, RecentProjectEntry, SerializedAssets } from './types'
import type { Report } from './reportModel'

export type ReportExportFormat = 'html' | 'docx' | 'pdf'

export interface OpenProjectResult {
  data: ProjectData
  assets: SerializedAssets
  filePath: string
}

export interface SaveProjectResult {
  filePath: string
}

/** A restored backup isn't tied to any real save location of its own —
 * filePath is always null, forcing the next save through Save As rather
 * than risking a silent overwrite of the file it was recovered from. */
export interface RestoreBackupResult {
  data: ProjectData
  assets: SerializedAssets
  filePath: null
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
    /** Drops one entry from the recent-projects list (e.g. it moved or no
     * longer opens) without touching the file it points to. */
    removeRecent: (filePath: string) => Promise<RecentProjectEntry[]>
    /** Shows a save dialog, copies the bundled example project to that path,
     * and opens the copy. Null = user canceled. */
    openExample: () => Promise<OpenProjectResult | null>
    /** Every automatic backup on file for this project, oldest first. See
     * main/backups.ts for the retention policy. */
    listBackups: (projectId: string) => Promise<BackupEntry[]>
    /** Loads one backup's contents as a copy, not tied to any file on disk —
     * the next save must go through Save As. */
    restoreBackup: (projectId: string, fileName: string) => Promise<RestoreBackupResult>
  }
  document: {
    /** Opens a native file picker (.docx/.odt/.txt) and imports the chosen file. Null = user canceled. */
    importDialog: () => Promise<ImportedDocument | null>
  }
  export: {
    /** Renders `report` to the given format and shows a save dialog for it.
     * Returns the chosen path, or null if the user canceled. */
    report: (report: Report, format: ReportExportFormat, suggestedName: string) => Promise<string | null>
    /**
     * Renders a pre-captured HTML snapshot of a board (already carrying its
     * own inline styles and a copy of the app's stylesheet — see
     * BoardView.tsx's export handler) to a single-page PDF sized exactly to
     * `widthPx`/`heightPx`, and shows a save dialog. Null = user canceled.
     */
    boardPdf: (html: string, widthPx: number, heightPx: number, suggestedName: string) => Promise<string | null>
  }
}
