import { create } from 'zustand'

export interface PendingSelection {
  documentId: string
  start: number
  end: number
  text: string
}

export type SidebarTab = 'codes' | 'notes'

/** Ephemeral (non-persisted) workspace UI state shared across the reader,
 * codebook, and notes panels — which document is open, which sidebar tab is
 * active, a just-made text selection awaiting a code/item/note, codings
 * under an inspected highlight, and a "promote note to code" handoff. */
interface WorkspaceUiState {
  selectedDocumentId: string | null
  setSelectedDocumentId: (id: string | null) => void

  activeSidebarTab: SidebarTab
  setActiveSidebarTab: (tab: SidebarTab) => void

  pendingSelection: PendingSelection | null
  setPendingSelection: (selection: PendingSelection | null) => void

  inspectedCodingIds: string[]
  setInspectedCodingIds: (ids: string[]) => void

  /** Set by "promote note to code" so the codebook's new-code form can
   * prefill a name; consumed (cleared) once read. */
  suggestedCodeName: string | null
  setSuggestedCodeName: (name: string | null) => void

  clear: () => void
}

export const useWorkspaceUiStore = create<WorkspaceUiState>((set) => ({
  selectedDocumentId: null,
  setSelectedDocumentId: (id) => set({ selectedDocumentId: id }),

  activeSidebarTab: 'codes',
  setActiveSidebarTab: (tab) => set({ activeSidebarTab: tab }),

  pendingSelection: null,
  setPendingSelection: (selection) => set({ pendingSelection: selection, inspectedCodingIds: [] }),

  inspectedCodingIds: [],
  setInspectedCodingIds: (ids) => set({ inspectedCodingIds: ids, pendingSelection: null }),

  suggestedCodeName: null,
  setSuggestedCodeName: (name) => set({ suggestedCodeName: name }),

  clear: () => set({ pendingSelection: null, inspectedCodingIds: [] })
}))
