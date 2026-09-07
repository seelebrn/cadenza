import { create } from 'zustand'

export interface PendingSelection {
  documentId: string
  start: number
  end: number
  text: string
}

interface CodingUiState {
  /** A just-made text selection awaiting a code/item to apply to it. */
  pendingSelection: PendingSelection | null
  /** Codings on a passage the user clicked in the reader, to inspect/remove. */
  inspectedCodingIds: string[]
  setPendingSelection: (selection: PendingSelection | null) => void
  setInspectedCodingIds: (ids: string[]) => void
  clear: () => void
}

export const useCodingUiStore = create<CodingUiState>((set) => ({
  pendingSelection: null,
  inspectedCodingIds: [],
  setPendingSelection: (selection) => set({ pendingSelection: selection, inspectedCodingIds: [] }),
  setInspectedCodingIds: (ids) => set({ inspectedCodingIds: ids, pendingSelection: null }),
  clear: () => set({ pendingSelection: null, inspectedCodingIds: [] })
}))
