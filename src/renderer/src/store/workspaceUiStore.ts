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

const SIDEBAR_WIDTH_KEY = 'cadenza.sidebarWidth'
const DEFAULT_SIDEBAR_WIDTH = 320
const MIN_SIDEBAR_WIDTH = 260
const MAX_SIDEBAR_WIDTH = 640

// A per-viewer UI preference (window layout), not project data — kept in
// localStorage rather than ProjectData/.qdaproj so it isn't tangled up with
// autosave/dirty-tracking and doesn't travel with the project file.
function loadSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY)
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed) ? parsed : DEFAULT_SIDEBAR_WIDTH
  } catch {
    return DEFAULT_SIDEBAR_WIDTH
  }
}

function saveSidebarWidth(width: number): void {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width))
  } catch {
    // not critical if this doesn't persist
  }
}

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

  sidebarWidth: number
  setSidebarWidth: (width: number) => void

  activeSpan: ActiveSpan | null
  setActiveSpan: (span: ActiveSpan | null) => void

  /** Set by "promote note to code" so the codebook's new-code form can
   * prefill a name; consumed (cleared) once read. */
  suggestedCodeName: string | null
  setSuggestedCodeName: (name: string | null) => void

  /** The code whose info window is open (double-clicked in the source
   * text, the Workspace codebook tree, or a board card) — null when
   * closed. One flag serves all three triggers since the window itself
   * doesn't care where the double-click came from. */
  inspectedCodeId: string | null
  setInspectedCodeId: (id: string | null) => void

  clear: () => void

  /** Resets everything that references *this project's* ids (selected
   * document/board, active span, etc.) — called on newProject/openProject/
   * openRecent/closeProject. Without this, e.g. selectedBoardId from a
   * previously open project (or an earlier test project) keeps pointing at
   * a board id that doesn't exist in whatever's open now: the board canvas
   * still renders (nothing here checked whether the id actually resolved),
   * but its item list silently comes back empty regardless of what's on
   * the board, since nothing matches a nonexistent board. Deliberately
   * leaves sidebarWidth alone — that's a window-layout preference, not
   * tied to project content. */
  resetForProjectSwitch: () => void
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

  sidebarWidth: loadSidebarWidth(),
  setSidebarWidth: (width) => {
    const clamped = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width))
    set({ sidebarWidth: clamped })
    saveSidebarWidth(clamped)
  },

  activeSpan: null,
  setActiveSpan: (span) => set({ activeSpan: span }),

  suggestedCodeName: null,
  setSuggestedCodeName: (name) => set({ suggestedCodeName: name }),

  inspectedCodeId: null,
  setInspectedCodeId: (id) => set({ inspectedCodeId: id }),

  clear: () => set({ activeSpan: null }),

  resetForProjectSwitch: () =>
    set({
      selectedDocumentId: null,
      mainView: 'workspace',
      analysisTab: 'retrieval',
      selectedBoardId: null,
      activeSidebarTab: 'codes',
      activeSpan: null,
      suggestedCodeName: null,
      inspectedCodeId: null
    })
}))
