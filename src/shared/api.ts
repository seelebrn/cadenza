import type { ImportedDocument, ProjectData, RecentProjectEntry, SerializedAssets } from './types'
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
