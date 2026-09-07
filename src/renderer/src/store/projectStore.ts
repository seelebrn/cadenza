import { create } from 'zustand'
import type {
  BoardItem,
  CategoryKind,
  NoteAttachment,
  ProjectData,
  RecentProjectEntry,
  SerializedAssets,
  TagKind
} from '@shared/types'
import {
  addCode as addCodeOp,
  applyCodeToSelection as applyCodeToSelectionOp,
  deleteCode as deleteCodeOp,
  ensureSegment as ensureSegmentOp,
  mergeCodes as mergeCodesOp,
  removeCoding as removeCodingOp,
  renameCode as renameCodeOp,
  reparentCode as reparentCodeOp,
  setCodeColor as setCodeColorOp,
  setCodeDefinition as setCodeDefinitionOp
} from '@shared/projectOps'
import {
  addNote as addNoteOp,
  addNoteCategory as addNoteCategoryOp,
  addNoteToSelection as addNoteToSelectionOp,
  deleteNote as deleteNoteOp,
  deleteNoteCategory as deleteNoteCategoryOp,
  renameNoteCategory as renameNoteCategoryOp,
  setNoteCategoryColor as setNoteCategoryColorOp,
  updateNote as updateNoteOp
} from '@shared/notesOps'
import {
  addCodeToCategory as addCodeToCategoryOp,
  addNoteToCategory as addNoteToCategoryOp,
  addSegmentToCategory as addSegmentToCategoryOp,
  createCategory as createCategoryOp,
  deleteCategory as deleteCategoryOp,
  removeCodeFromCategory as removeCodeFromCategoryOp,
  removeNoteFromCategory as removeNoteFromCategoryOp,
  removeSegmentFromCategory as removeSegmentFromCategoryOp,
  renameCategory as renameCategoryOp,
  setCategoryColor as setCategoryColorOp
} from '@shared/categoryOps'
import { editParagraph as editParagraphOp, renameDocument as renameDocumentOp } from '@shared/documentOps'
import {
  addItemToBoard as addItemToBoardOp,
  createBoard as createBoardOp,
  createCluster as createClusterOp,
  deleteBoard as deleteBoardOp,
  deleteCluster as deleteClusterOp,
  linkItems as linkItemsOp,
  moveCluster as moveClusterOp,
  moveItem as moveItemOp,
  promoteClusterToCategory as promoteClusterToCategoryOp,
  removeItemFromBoard as removeItemFromBoardOp,
  renameBoard as renameBoardOp,
  renameCluster as renameClusterOp,
  resizeCluster as resizeClusterOp,
  unlinkItems as unlinkItemsOp,
  setClusterColor as setClusterColorOp
} from '@shared/boardOps'
import { useWorkspaceUiStore } from './workspaceUiStore'

interface ProjectState {
  data: ProjectData | null
  assets: SerializedAssets
  filePath: string | null
  isDirty: boolean
  isSaving: boolean
  isImporting: boolean
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
  importDocument: () => Promise<void>

  // Codebook / coding
  addCode: (input: { name: string; kind: TagKind; color: string; definition?: string; parentId?: string | null }) => string | null
  renameCode: (codeId: string, name: string) => void
  setCodeColor: (codeId: string, color: string) => void
  setCodeDefinition: (codeId: string, definition: string) => void
  reparentCode: (codeId: string, parentId: string | null) => void
  deleteCode: (codeId: string) => void
  mergeCodes: (sourceId: string, targetId: string) => void
  applyCodeToSelection: (documentId: string, start: number, end: number, text: string, codeId: string) => void
  removeCoding: (codingId: string) => void

  // Notes / memos
  addNote: (
    attachedTo: NoteAttachment,
    question: string | null,
    answer: string,
    tags: string[],
    noteCategoryId: string | null
  ) => void
  addNoteToSelection: (
    documentId: string,
    start: number,
    end: number,
    text: string,
    question: string | null,
    answer: string,
    tags: string[],
    noteCategoryId: string | null
  ) => void
  updateNote: (
    noteId: string,
    patch: { question?: string | null; answer?: string; tags?: string[]; noteCategoryId?: string | null }
  ) => void
  deleteNote: (noteId: string) => void

  // Note category catalog (thematic/linguistic/conceptual, etc.)
  addNoteCategory: (name: string, color: string) => string | null
  renameNoteCategory: (categoryId: string, name: string) => void
  setNoteCategoryColor: (categoryId: string, color: string) => void
  deleteNoteCategory: (categoryId: string) => void

  // Categories (emergent theme or AQA-style question cluster)
  createCategory: (name: string, kind: CategoryKind, color: string) => string | null
  renameCategory: (categoryId: string, name: string) => void
  setCategoryColor: (categoryId: string, color: string) => void
  deleteCategory: (categoryId: string) => void
  addCodeToCategory: (categoryId: string, codeId: string) => void
  removeCodeFromCategory: (categoryId: string, codeId: string) => void
  addNoteToCategory: (categoryId: string, noteId: string) => void
  removeNoteFromCategory: (categoryId: string, noteId: string) => void
  removeSegmentFromCategory: (categoryId: string, segmentId: string) => void
  /** Files a text span under a category as a raw quote, creating/reusing
   * its Segment the same way coding/memoing does. */
  fileSpanUnderCategory: (
    documentId: string,
    start: number,
    end: number,
    text: string,
    categoryId: string
  ) => void

  // Editing the imported source text itself
  editParagraph: (documentId: string, paragraphIndex: number, newText: string) => void
  renameDocument: (documentId: string, title: string) => void

  // Visual grouping board
  createBoard: (name: string) => string | null
  renameBoard: (boardId: string, name: string) => void
  deleteBoard: (boardId: string) => void
  addItemToBoard: (
    boardId: string,
    refType: BoardItem['refType'],
    refId: string,
    x: number,
    y: number
  ) => void
  moveItem: (itemId: string, x: number, y: number, clusterId: string | null) => void
  removeItemFromBoard: (itemId: string) => void
  createCluster: (
    boardId: string,
    name: string,
    color: string,
    x: number,
    y: number,
    width: number,
    height: number
  ) => string | null
  renameCluster: (clusterId: string, name: string) => void
  setClusterColor: (clusterId: string, color: string) => void
  moveCluster: (clusterId: string, x: number, y: number) => void
  resizeCluster: (clusterId: string, width: number, height: number) => void
  deleteCluster: (clusterId: string) => void
  promoteClusterToCategory: (clusterId: string, kind: CategoryKind, color: string) => string | null
  linkItems: (boardId: string, itemAId: string, itemBId: string) => void
  unlinkItems: (linkId: string) => void
}

const AUTOSAVE_DELAY_MS = 1500
let autosaveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleAutosave(get: () => ProjectState): void {
  if (!get().filePath) return // nothing to autosave to until the first explicit save
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => {
    void get().save()
  }, AUTOSAVE_DELAY_MS)
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  data: null,
  assets: {},
  filePath: null,
  isDirty: false,
  isSaving: false,
  isImporting: false,
  recent: [],
  error: null,

  loadRecent: async () => {
    const recent = await window.api.project.getRecent()
    set({ recent })
  },

  newProject: async (name) => {
    const data = await window.api.project.create(name)
    set({ data, assets: {}, filePath: null, isDirty: true, error: null })
  },

  openProject: async () => {
    try {
      const result = await window.api.project.openDialog()
      if (!result) return
      set({
        data: result.data,
        assets: result.assets,
        filePath: result.filePath,
        isDirty: false,
        error: null
      })
      await get().loadRecent()
    } catch (e) {
      set({ error: `Could not open project: ${(e as Error).message}` })
    }
  },

  openRecent: async (filePath) => {
    try {
      const result = await window.api.project.openPath(filePath)
      set({
        data: result.data,
        assets: result.assets,
        filePath: result.filePath,
        isDirty: false,
        error: null
      })
      await get().loadRecent()
    } catch (e) {
      set({ error: `Could not open ${filePath}: ${(e as Error).message}` })
    }
  },

  save: async () => {
    const { data, assets, filePath } = get()
    if (!data) return
    set({ isSaving: true, error: null })
    try {
      const result = await window.api.project.save(data, assets, filePath)
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
    const { data, assets } = get()
    if (!data) return
    set({ isSaving: true, error: null })
    try {
      const result = await window.api.project.saveAs(data, assets)
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
    set({ data: null, assets: {}, filePath: null, isDirty: false, error: null })
  },

  updateProject: (updater) => {
    const { data } = get()
    if (!data) return
    set({ data: updater(data), isDirty: true })
    scheduleAutosave(get)
  },

  importDocument: async () => {
    set({ isImporting: true, error: null })
    try {
      const result = await window.api.document.importDialog()
      if (!result) return
      const { document, assetBytes } = result
      set((state) => ({
        data: state.data ? { ...state.data, documents: [...state.data.documents, document] } : state.data,
        assets: document.assetRelPath
          ? { ...state.assets, [document.assetRelPath]: assetBytes }
          : state.assets,
        isDirty: true
      }))
      scheduleAutosave(get)
    } catch (e) {
      set({ error: `Could not import document: ${(e as Error).message}` })
    } finally {
      set({ isImporting: false })
    }
  },

  addCode: (input) => {
    const { data } = get()
    if (!data) return null
    const result = addCodeOp(data, input)
    get().updateProject(() => result.data)
    return result.codeId
  },

  renameCode: (codeId, name) => get().updateProject((data) => renameCodeOp(data, codeId, name)),

  setCodeColor: (codeId, color) => get().updateProject((data) => setCodeColorOp(data, codeId, color)),

  setCodeDefinition: (codeId, definition) =>
    get().updateProject((data) => setCodeDefinitionOp(data, codeId, definition)),

  reparentCode: (codeId, parentId) =>
    get().updateProject((data) => reparentCodeOp(data, codeId, parentId)),

  deleteCode: (codeId) => get().updateProject((data) => deleteCodeOp(data, codeId)),

  mergeCodes: (sourceId, targetId) =>
    get().updateProject((data) => mergeCodesOp(data, sourceId, targetId)),

  // Deliberately does not clear the pending selection afterwards — the same
  // passage stays selected so the user can stack several codes/items (and
  // notes) on it in a row without re-selecting. workspaceUiStore's own
  // "Clear selection" is the explicit way to finish.
  applyCodeToSelection: (documentId, start, end, text, codeId) => {
    get().updateProject((data) => applyCodeToSelectionOp(data, { documentId, start, end, text, codeId }))
  },

  removeCoding: (codingId) => get().updateProject((data) => removeCodingOp(data, codingId)),

  addNote: (attachedTo, question, answer, tags, noteCategoryId) =>
    get().updateProject(
      (data) => addNoteOp(data, { attachedTo, question, answer, tags, noteCategoryId }).data
    ),

  // Same deliberate non-clearing of the pending selection as applyCodeToSelection.
  addNoteToSelection: (documentId, start, end, text, question, answer, tags, noteCategoryId) =>
    get().updateProject(
      (data) =>
        addNoteToSelectionOp(data, {
          documentId,
          start,
          end,
          text,
          question,
          answer,
          tags,
          noteCategoryId
        }).data
    ),

  updateNote: (noteId, patch) => get().updateProject((data) => updateNoteOp(data, noteId, patch)),

  deleteNote: (noteId) => get().updateProject((data) => deleteNoteOp(data, noteId)),

  addNoteCategory: (name, color) => {
    const { data } = get()
    if (!data) return null
    const result = addNoteCategoryOp(data, { name, color })
    get().updateProject(() => result.data)
    return result.categoryId
  },

  renameNoteCategory: (categoryId, name) =>
    get().updateProject((data) => renameNoteCategoryOp(data, categoryId, name)),

  setNoteCategoryColor: (categoryId, color) =>
    get().updateProject((data) => setNoteCategoryColorOp(data, categoryId, color)),

  deleteNoteCategory: (categoryId) =>
    get().updateProject((data) => deleteNoteCategoryOp(data, categoryId)),

  createCategory: (name, kind, color) => {
    const { data } = get()
    if (!data) return null
    const result = createCategoryOp(data, { name, kind, color })
    get().updateProject(() => result.data)
    return result.categoryId
  },

  renameCategory: (categoryId, name) =>
    get().updateProject((data) => renameCategoryOp(data, categoryId, name)),

  setCategoryColor: (categoryId, color) =>
    get().updateProject((data) => setCategoryColorOp(data, categoryId, color)),

  deleteCategory: (categoryId) => get().updateProject((data) => deleteCategoryOp(data, categoryId)),

  addCodeToCategory: (categoryId, codeId) =>
    get().updateProject((data) => addCodeToCategoryOp(data, categoryId, codeId)),

  removeCodeFromCategory: (categoryId, codeId) =>
    get().updateProject((data) => removeCodeFromCategoryOp(data, categoryId, codeId)),

  addNoteToCategory: (categoryId, noteId) =>
    get().updateProject((data) => addNoteToCategoryOp(data, categoryId, noteId)),

  removeNoteFromCategory: (categoryId, noteId) =>
    get().updateProject((data) => removeNoteFromCategoryOp(data, categoryId, noteId)),

  removeSegmentFromCategory: (categoryId, segmentId) =>
    get().updateProject((data) => removeSegmentFromCategoryOp(data, categoryId, segmentId)),

  fileSpanUnderCategory: (documentId, start, end, text, categoryId) =>
    get().updateProject((data) => {
      const { data: withSegment, segmentId } = ensureSegmentOp(data, { documentId, start, end, text })
      return addSegmentToCategoryOp(withSegment, categoryId, segmentId)
    }),

  // Unlike applyCodeToSelection, this one deliberately DOES clear the active
  // span afterwards: an edit can shift every subsequent segment's offsets,
  // so a span captured before the edit is no longer trustworthy to act on.
  editParagraph: (documentId, paragraphIndex, newText) => {
    get().updateProject((data) => editParagraphOp(data, documentId, paragraphIndex, newText))
    useWorkspaceUiStore.getState().clear()
  },

  renameDocument: (documentId, title) =>
    get().updateProject((data) => renameDocumentOp(data, documentId, title)),

  createBoard: (name) => {
    const { data } = get()
    if (!data) return null
    const result = createBoardOp(data, name)
    get().updateProject(() => result.data)
    return result.boardId
  },

  renameBoard: (boardId, name) => get().updateProject((data) => renameBoardOp(data, boardId, name)),

  deleteBoard: (boardId) => get().updateProject((data) => deleteBoardOp(data, boardId)),

  addItemToBoard: (boardId, refType, refId, x, y) =>
    get().updateProject((data) => addItemToBoardOp(data, boardId, refType, refId, x, y).data),

  moveItem: (itemId, x, y, clusterId) =>
    get().updateProject((data) => moveItemOp(data, itemId, x, y, clusterId)),

  removeItemFromBoard: (itemId) => get().updateProject((data) => removeItemFromBoardOp(data, itemId)),

  createCluster: (boardId, name, color, x, y, width, height) => {
    const { data } = get()
    if (!data) return null
    const result = createClusterOp(data, { boardId, name, color, x, y, width, height })
    get().updateProject(() => result.data)
    return result.clusterId
  },

  renameCluster: (clusterId, name) =>
    get().updateProject((data) => renameClusterOp(data, clusterId, name)),

  setClusterColor: (clusterId, color) =>
    get().updateProject((data) => setClusterColorOp(data, clusterId, color)),

  moveCluster: (clusterId, x, y) => get().updateProject((data) => moveClusterOp(data, clusterId, x, y)),

  resizeCluster: (clusterId, width, height) =>
    get().updateProject((data) => resizeClusterOp(data, clusterId, width, height)),

  deleteCluster: (clusterId) => get().updateProject((data) => deleteClusterOp(data, clusterId)),

  promoteClusterToCategory: (clusterId, kind, color) => {
    const { data } = get()
    if (!data) return null
    const result = promoteClusterToCategoryOp(data, clusterId, kind, color)
    if (!result) return null
    get().updateProject(() => result.data)
    return result.categoryId
  },

  linkItems: (boardId, itemAId, itemBId) =>
    get().updateProject((data) => linkItemsOp(data, boardId, itemAId, itemBId)),

  unlinkItems: (linkId) => get().updateProject((data) => unlinkItemsOp(data, linkId))
}))
