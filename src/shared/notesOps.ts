// Pure operations for the generic Note/Memo system: attachable to a
// segment, document, code, category, or the whole project. Optional
// question+answer fields make a Note usable as an AQA-style analytic log
// entry, but nothing here treats that as a special case — a memo is a memo
// whether or not it carries a question.

import { nanoid } from 'nanoid'
import { ensureSegment, pruneOrphanSegment, type SegmentSpan } from './projectOps'
import type { NoteAttachment, NoteRecord, ProjectData } from './types'

function normalizeQuestion(question: string | null | undefined): string | null {
  return question?.trim() ? question.trim() : null
}

export interface AddNoteInput {
  attachedTo: NoteAttachment
  question?: string | null
  answer: string
  tags?: string[]
}

export function addNote(data: ProjectData, input: AddNoteInput): { data: ProjectData; noteId: string } {
  const now = new Date().toISOString()
  const note: NoteRecord = {
    id: nanoid(),
    question: normalizeQuestion(input.question),
    answer: input.answer,
    tags: input.tags ?? [],
    attachedTo: input.attachedTo,
    createdAt: now,
    updatedAt: now
  }
  return { data: { ...data, notes: [...data.notes, note] }, noteId: note.id }
}

export interface AddNoteToSelectionInput extends SegmentSpan {
  question?: string | null
  answer: string
  tags?: string[]
}

/** Attaches a note to a text span, reusing (or creating) the underlying
 * Segment the same way coding does — so a passage can be coded *and*
 * memoed without ending up as two separate segments. */
export function addNoteToSelection(
  data: ProjectData,
  input: AddNoteToSelectionInput
): { data: ProjectData; noteId: string } {
  const { data: withSegment, segmentId } = ensureSegment(data, input)
  return addNote(withSegment, {
    attachedTo: { kind: 'segment', segmentId },
    question: input.question,
    answer: input.answer,
    tags: input.tags
  })
}

export function updateNote(
  data: ProjectData,
  noteId: string,
  patch: { question?: string | null; answer?: string; tags?: string[] }
): ProjectData {
  return {
    ...data,
    notes: data.notes.map((n) => {
      if (n.id !== noteId) return n
      return {
        ...n,
        question: patch.question !== undefined ? normalizeQuestion(patch.question) : n.question,
        answer: patch.answer !== undefined ? patch.answer : n.answer,
        tags: patch.tags !== undefined ? patch.tags : n.tags,
        updatedAt: new Date().toISOString()
      }
    })
  }
}

/** Deletes a note, detaching it from any category/board item, and prunes
 * its segment if the note was the only thing referencing it. */
export function deleteNote(data: ProjectData, noteId: string): ProjectData {
  const note = data.notes.find((n) => n.id === noteId)
  if (!note) return data

  const notes = data.notes.filter((n) => n.id !== noteId)
  const categories = data.categories.map((cat) => ({
    ...cat,
    noteIds: cat.noteIds.filter((id) => id !== noteId)
  }))
  const boardItems = data.boardItems.filter((bi) => !(bi.refType === 'note' && bi.refId === noteId))

  let next: ProjectData = { ...data, notes, categories, boardItems }
  if (note.attachedTo.kind === 'segment') {
    next = pruneOrphanSegment(next, note.attachedTo.segmentId)
  }
  return next
}

export interface NoteAttachmentDescription {
  label: string
  quote?: string
}

/** Pure display helper: resolves a note's attachment to a human-readable
 * label (and the verbatim quote, for a segment-attached note). */
export function describeNoteAttachment(data: ProjectData, note: NoteRecord): NoteAttachmentDescription {
  // Narrowed via a local variable — TS discriminated-union narrowing doesn't
  // reliably follow a nested property path like note.attachedTo.kind across
  // repeated note.attachedTo.<field> accesses.
  const attachedTo = note.attachedTo
  switch (attachedTo.kind) {
    case 'segment': {
      const segment = data.segments.find((s) => s.id === attachedTo.segmentId)
      const doc = segment ? data.documents.find((d) => d.id === segment.documentId) : undefined
      return { label: doc ? `Passage in "${doc.title}"` : 'Passage', quote: segment?.text }
    }
    case 'document': {
      const doc = data.documents.find((d) => d.id === attachedTo.documentId)
      return { label: doc ? `Document "${doc.title}"` : 'Document' }
    }
    case 'code': {
      const code = data.codes.find((c) => c.id === attachedTo.codeId)
      return { label: code ? `Code "${code.name}"` : 'Code' }
    }
    case 'category': {
      const category = data.categories.find((c) => c.id === attachedTo.categoryId)
      return { label: category ? `Category "${category.name}"` : 'Category' }
    }
    case 'project':
      return { label: 'Project' }
  }
}
