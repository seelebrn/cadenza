import { create } from 'zustand'

export interface ActiveSpan {
  documentId: string
  start: number
  end: number
  text: string
}

export type SidebarTab = 'codes' | 'notes'
export type MainView = 'workspace' | 'analysis' | 'board' | 'export'
export type AnalysisTab = 'retrieval' | 'categories' | 'compare'

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

export interface FloatingPosition {
  x: number
  y: number
}
export interface FloatingSize {
  width: number
  height: number
}

// Same "per-viewer layout preference, not project data" reasoning as
// sidebarWidth above, for the Workspace right sidebar's docked/undocked
// state — undocking floats it (position: fixed, so it's simply removed
// from the flex layout's flow, freeing that space for the reader) as a
// draggable, resizable panel instead of the fixed sidebar column.
const SIDEBAR_DOCKED_KEY = 'cadenza.sidebarDocked'
const SIDEBAR_FLOAT_POSITION_KEY = 'cadenza.sidebarFloatPosition'
const SIDEBAR_FLOAT_SIZE_KEY = 'cadenza.sidebarFloatSize'
const DEFAULT_FLOAT_POSITION: FloatingPosition = { x: 120, y: 80 }
const DEFAULT_FLOAT_SIZE: FloatingSize = { width: 380, height: 520 }
const MIN_FLOAT_WIDTH = 280
const MIN_FLOAT_HEIGHT = 200

function loadSidebarDocked(): boolean {
  try {
    const raw = localStorage.getItem(SIDEBAR_DOCKED_KEY)
    return raw === null ? true : raw === 'true'
  } catch {
    return true
  }
}
function saveSidebarDocked(docked: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_DOCKED_KEY, String(docked))
  } catch {
    // not critical if this doesn't persist
  }
}

function loadJsonPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? { ...fallback, ...parsed } : fallback
  } catch {
    return fallback
  }
}
function saveJsonPref(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
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

  /** True = the normal fixed sidebar column; false = floating (position,
   * draggable, resizable — see sidebarFloatPosition/sidebarFloatSize
   * below) so the reader/board can reclaim that width when more space to
   * work is what's wanted. */
  sidebarDocked: boolean
  setSidebarDocked: (docked: boolean) => void
  sidebarFloatPosition: FloatingPosition
  setSidebarFloatPosition: (position: FloatingPosition) => void
  sidebarFloatSize: FloatingSize
  setSidebarFloatSize: (size: FloatingSize) => void

  activeSpan: ActiveSpan | null
  setActiveSpan: (span: ActiveSpan | null) => void

  /** Set by "promote note to code" so the codebook's new-code form can
   * prefill a name; consumed (cleared) once read. */
  suggestedCodeName: string | null
  setSuggestedCodeName: (name: string | null) => void

  /** The code whose info window is open (double-clicked in the source
   * text or the Workspace codebook tree, right-clicked on a board card —
   * see BoardItemCard.tsx for why the board uses right-click instead) —
   * null when closed. One flag serves all three triggers since the window
   * itself doesn't care where it came from. */
  inspectedCodeId: string | null
  setInspectedCodeId: (id: string | null) => void

  /** Same idea as inspectedCodeId, for notes — double-clicked in the
   * Workspace notes tree, right-clicked on a board card. */
  inspectedNoteId: string | null
  setInspectedNoteId: (id: string | null) => void

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

  sidebarDocked: loadSidebarDocked(),
  setSidebarDocked: (docked) => {
    set({ sidebarDocked: docked })
    saveSidebarDocked(docked)
  },

  sidebarFloatPosition: loadJsonPref(SIDEBAR_FLOAT_POSITION_KEY, DEFAULT_FLOAT_POSITION),
  setSidebarFloatPosition: (position) => {
    // Keeps a grabbable corner on-screen at all times — the only way back
    // to docked is the panel's own "Dock" button, which can't be clicked
    // if the whole panel has drifted off-screen (e.g. dragged near an
    // edge, then the window shrunk on a later launch).
    const clamped = {
      x: Math.min(Math.max(position.x, -DEFAULT_FLOAT_SIZE.width + 120), window.innerWidth - 120),
      y: Math.min(Math.max(position.y, 0), window.innerHeight - 40)
    }
    set({ sidebarFloatPosition: clamped })
    saveJsonPref(SIDEBAR_FLOAT_POSITION_KEY, clamped)
  },

  sidebarFloatSize: loadJsonPref(SIDEBAR_FLOAT_SIZE_KEY, DEFAULT_FLOAT_SIZE),
  setSidebarFloatSize: (size) => {
    const clamped = { width: Math.max(MIN_FLOAT_WIDTH, size.width), height: Math.max(MIN_FLOAT_HEIGHT, size.height) }
    set({ sidebarFloatSize: clamped })
    saveJsonPref(SIDEBAR_FLOAT_SIZE_KEY, clamped)
  },

  activeSpan: null,
  setActiveSpan: (span) => set({ activeSpan: span }),

  suggestedCodeName: null,
  setSuggestedCodeName: (name) => set({ suggestedCodeName: name }),

  inspectedCodeId: null,
  setInspectedCodeId: (id) => set({ inspectedCodeId: id }),

  inspectedNoteId: null,
  setInspectedNoteId: (id) => set({ inspectedNoteId: id }),

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
      inspectedCodeId: null,
      inspectedNoteId: null
    })
}))
