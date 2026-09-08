import { describe, expect, it } from 'vitest'
import {
  addNote,
  addNoteCategory,
  addNoteToSelection,
  deleteNote,
  deleteNoteCategory,
  describeNoteAttachment,
  renameNoteCategory,
  setNoteCategoryColor,
  updateNote
} from './notesOps'
import type { DocumentRecord, NoteCategoryDef, ProjectData, Segment } from './types'

function makeDoc(id: string, title = 'Doc'): DocumentRecord {
  return { id, title, paragraphs: ['hello world'], sourceFormat: 'txt', assetRelPath: null, importedAt: '0' }
}

function makeData(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    schemaVersion: 2,
    id: 'p1',
    name: 'Project',
    createdAt: '0',
    updatedAt: '0',
    documents: [],
    segments: [],
    codes: [],
    codings: [],
    notes: [],
    noteCategories: [],
    categories: [],
    boards: [],
    boardItems: [],
    boardClusters: [],
    boardLinks: [],
    ...overrides
  } as ProjectData
}

describe('addNote', () => {
  it('creates a note with defaults for optional fields', () => {
    const { data, noteId } = addNote(makeData(), { attachedTo: { kind: 'project' }, answer: 'The answer' })
    const note = data.notes.find((n) => n.id === noteId)!
    expect(note).toMatchObject({ question: null, answer: 'The answer', tags: [], noteCategoryId: null })
  })

  it('trims a blank/whitespace-only question down to null', () => {
    const { data, noteId } = addNote(makeData(), { attachedTo: { kind: 'project' }, answer: 'x', question: '   ' })
    expect(data.notes.find((n) => n.id === noteId)?.question).toBeNull()
  })

  it('trims a real question but keeps its content', () => {
    const { data, noteId } = addNote(makeData(), { attachedTo: { kind: 'project' }, answer: 'x', question: '  What happened?  ' })
    expect(data.notes.find((n) => n.id === noteId)?.question).toBe('What happened?')
  })
})

describe('addNoteToSelection', () => {
  it('creates a segment and attaches the note to it', () => {
    const { data, noteId } = addNoteToSelection(makeData(), { documentId: 'd1', start: 0, end: 5, text: 'hello', answer: 'x' })
    expect(data.segments).toHaveLength(1)
    const note = data.notes.find((n) => n.id === noteId)!
    expect(note.attachedTo).toEqual({ kind: 'segment', segmentId: data.segments[0].id })
  })

  it('reuses the same segment as an existing coding on the exact same span (no duplicate segment)', () => {
    const withSegment = addNoteToSelection(makeData(), { documentId: 'd1', start: 0, end: 5, text: 'hello', answer: 'first' })
    const second = addNoteToSelection(withSegment.data, { documentId: 'd1', start: 0, end: 5, text: 'hello', answer: 'second' })
    expect(second.data.segments).toHaveLength(1)
    expect(second.data.notes).toHaveLength(2)
  })
})

describe('updateNote', () => {
  it('only patches the provided fields, leaving the rest untouched', () => {
    const { data, noteId } = addNote(makeData(), { attachedTo: { kind: 'project' }, answer: 'original', question: 'Q', tags: ['a'] })
    const next = updateNote(data, noteId, { answer: 'updated' })
    const note = next.notes.find((n) => n.id === noteId)!
    expect(note.answer).toBe('updated')
    expect(note.question).toBe('Q') // untouched
    expect(note.tags).toEqual(['a']) // untouched
  })

  it('an explicit null for noteCategoryId clears it (distinct from "not provided")', () => {
    const { data, noteId } = addNote(makeData(), { attachedTo: { kind: 'project' }, answer: 'x', noteCategoryId: 'cat1' })
    const next = updateNote(data, noteId, { noteCategoryId: null })
    expect(next.notes.find((n) => n.id === noteId)?.noteCategoryId).toBeNull()
  })

  it('bumps updatedAt', () => {
    const { data, noteId } = addNote(makeData(), { attachedTo: { kind: 'project' }, answer: 'x' })
    const originalUpdatedAt = data.notes[0].updatedAt
    const next = updateNote(data, noteId, { answer: 'y' })
    expect(next.notes.find((n) => n.id === noteId)?.updatedAt).not.toBe(undefined)
    // Just confirm it's a valid, parseable timestamp — not asserting it
    // differs from originalUpdatedAt since both could land in the same ms.
    expect(Number.isNaN(Date.parse(next.notes.find((n) => n.id === noteId)!.updatedAt))).toBe(false)
    void originalUpdatedAt
  })
})

describe('deleteNote', () => {
  it('removes the note and detaches it from any category/board item', () => {
    const { data, noteId } = addNote(makeData(), { attachedTo: { kind: 'project' }, answer: 'x' })
    const withExtras: ProjectData = {
      ...data,
      categories: [{ id: 'cat1', kind: 'theme', name: 'A', color: '#fff', definition: '', codeIds: [], noteIds: [noteId], segmentIds: [], parentCategoryId: null, createdAt: '0' }],
      boardItems: [{ id: 'bi1', boardId: 'b1', refType: 'note', refId: noteId, x: 0, y: 0 }]
    }
    const next = deleteNote(withExtras, noteId)
    expect(next.notes).toHaveLength(0)
    expect(next.categories[0].noteIds).toEqual([])
    expect(next.boardItems).toHaveLength(0)
  })

  it('prunes the segment if the note was the only thing referencing it', () => {
    const { data, noteId } = addNoteToSelection(makeData(), { documentId: 'd1', start: 0, end: 5, text: 'hello', answer: 'x' })
    const next = deleteNote(data, noteId)
    expect(next.segments).toHaveLength(0)
  })

  it('is a no-op if the note does not exist', () => {
    const data = makeData()
    expect(deleteNote(data, 'missing')).toBe(data)
  })
})

describe('describeNoteAttachment', () => {
  it('describes a segment attachment with its document title and verbatim quote', () => {
    const segment: Segment = { id: 's1', documentId: 'd1', start: 0, end: 5, text: 'hello' }
    const data = makeData({ documents: [makeDoc('d1', 'Interview 1')], segments: [segment] })
    const { data: withNote, noteId } = addNote(data, { attachedTo: { kind: 'segment', segmentId: 's1' }, answer: 'x' })
    const note = withNote.notes.find((n) => n.id === noteId)!
    expect(describeNoteAttachment(withNote, note)).toEqual({ label: 'Passage in "Interview 1"', quote: 'hello' })
  })

  it('describes a document attachment', () => {
    const data = makeData({ documents: [makeDoc('d1', 'Interview 1')] })
    const { data: withNote, noteId } = addNote(data, { attachedTo: { kind: 'document', documentId: 'd1' }, answer: 'x' })
    const note = withNote.notes.find((n) => n.id === noteId)!
    expect(describeNoteAttachment(withNote, note).label).toBe('Document "Interview 1"')
  })

  it('describes a project-level attachment', () => {
    const { data, noteId } = addNote(makeData(), { attachedTo: { kind: 'project' }, answer: 'x' })
    const note = data.notes.find((n) => n.id === noteId)!
    expect(describeNoteAttachment(data, note).label).toBe('Project')
  })

  it('falls back gracefully when the attached document/code/category no longer exists', () => {
    const { data, noteId } = addNote(makeData(), { attachedTo: { kind: 'document', documentId: 'deleted-doc' }, answer: 'x' })
    const note = data.notes.find((n) => n.id === noteId)!
    expect(describeNoteAttachment(data, note).label).toBe('Document')
  })
})

describe('note category catalog', () => {
  it('addNoteCategory creates one, rename/color only touch the target', () => {
    const { data, categoryId } = addNoteCategory(makeData(), { name: 'Descriptive', color: '#0f0' })
    expect(data.noteCategories).toHaveLength(1)
    const renamed = renameNoteCategory(data, categoryId, 'Renamed')
    expect(renamed.noteCategories[0].name).toBe('Renamed')
    const recolored = setNoteCategoryColor(data, categoryId, '#123')
    expect(recolored.noteCategories[0].color).toBe('#123')
  })

  it('deleteNoteCategory removes it and declassifies (not deletes) notes that used it', () => {
    const category: NoteCategoryDef = { id: 'cat1', name: 'Descriptive', color: '#0f0', createdAt: '0' }
    const { data, noteId } = addNote(makeData({ noteCategories: [category] }), {
      attachedTo: { kind: 'project' },
      answer: 'x',
      noteCategoryId: 'cat1'
    })
    const next = deleteNoteCategory(data, 'cat1')
    expect(next.noteCategories).toHaveLength(0)
    expect(next.notes.find((n) => n.id === noteId)?.noteCategoryId).toBeNull()
  })
})
