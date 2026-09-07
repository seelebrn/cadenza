import { create } from 'zustand'

export interface ActiveSpan {
  documentId: string
  start: number
  end: number
  text: string
}

export type SidebarTab = 'codes' | 'notes'
export type MainView = 'workspace' | 'analysis' | 'board'
export type AnalysisTab = 'retrieval' | 'categories'

/** Ephemeral (non-persisted) workspace UI state shared across the reader,
 * codebook, and notes panels — which document is open, which sidebar tab is
 * active, and the "active span": a text span the user is currently working
 * on, whether it's a brand-new selection with no codes yet or an existing
 * highlighted passage they clicked to inspect. One concept serves both,
 * because they're the same thing — a span you might want to add codes/
 * items/notes to and/or see what's already on it. Also carries a "promote
 * note to code" handoff. */
interface WorkspaceUiState {
  selectedDocumentId: string | null
  setSelectedDocumentId: (id: string | null) => void

  mainView: MainView
  setMainView: (view: MainView) => void

  analysisTab: AnalysisTab
  setAnalysisTab: (tab: AnalysisTab) => void

  selectedBoardId: string | null
  setSelectedBoardId: (id: string | null) => void

  activeSidebarTab: SidebarTab
  setActiveSidebarTab: (tab: SidebarTab) => void

  activeSpan: ActiveSpan | null
  setActiveSpan: (span: ActiveSpan | null) => void

  /** Set by "promote note to code" so the codebook's new-code form can
   * prefill a name; consumed (cleared) once read. */
  suggestedCodeName: string | null
  setSuggestedCodeName: (name: string | null) => void

  clear: () => void
}

export const useWorkspaceUiStore = create<WorkspaceUiState>((set) => ({
  selectedDocumentId: null,
  setSelectedDocumentId: (id) => set({ selectedDocumentId: id }),

  mainView: 'workspace',
  setMainView: (view) => set({ mainView: view }),

  analysisTab: 'retrieval',
  setAnalysisTab: (tab) => set({ analysisTab: tab }),

  selectedBoardId: null,
  setSelectedBoardId: (id) => set({ selectedBoardId: id }),

  activeSidebarTab: 'codes',
  setActiveSidebarTab: (tab) => set({ activeSidebarTab: tab }),

  activeSpan: null,
  setActiveSpan: (span) => set({ activeSpan: span }),

  suggestedCodeName: null,
  setSuggestedCodeName: (name) => set({ suggestedCodeName: name }),

  clear: () => set({ activeSpan: null })
}))
