// Pure operations for CategoryRecord: an emergent grouping cluster (theme)
// or, distinctively, a category that *is itself* an analytic question
// (Paillé & Mucchielli AQA-style) — codes/notes/segments filed under a
// question-category are read as answers/evidence, not theme instances.
// Deliberately separate from NoteCategoryDef (notesOps.ts), which is a flat
// per-note classification tag, not a grouping cluster.

import { nanoid } from 'nanoid'
import type { CategoryKind, CategoryRecord, ProjectData } from './types'

export function createCategory(
  data: ProjectData,
  input: { name: string; kind: CategoryKind; color: string }
): { data: ProjectData; categoryId: string } {
  const category: CategoryRecord = {
    id: nanoid(),
    kind: input.kind,
    name: input.name,
    color: input.color,
    codeIds: [],
    noteIds: [],
    segmentIds: [],
    createdAt: new Date().toISOString()
  }
  return { data: { ...data, categories: [...data.categories, category] }, categoryId: category.id }
}

export function renameCategory(data: ProjectData, categoryId: string, name: string): ProjectData {
  return {
    ...data,
    categories: data.categories.map((c) => (c.id === categoryId ? { ...c, name } : c))
  }
}

export function setCategoryColor(data: ProjectData, categoryId: string, color: string): ProjectData {
  return {
    ...data,
    categories: data.categories.map((c) => (c.id === categoryId ? { ...c, color } : c))
  }
}

export function setCategoryKind(data: ProjectData, categoryId: string, kind: CategoryKind): ProjectData {
  return {
    ...data,
    categories: data.categories.map((c) => (c.id === categoryId ? { ...c, kind } : c))
  }
}

/** Deletes a category. Notes attached directly *to* the category (via
 * NoteAttachment kind:'category') fall back to a project-level attachment
 * rather than being left pointing at a dangling id. */
export function deleteCategory(data: ProjectData, categoryId: string): ProjectData {
  const categories = data.categories.filter((c) => c.id !== categoryId)
  const notes = data.notes.map((n) =>
    n.attachedTo.kind === 'category' && n.attachedTo.categoryId === categoryId
      ? { ...n, attachedTo: { kind: 'project' as const } }
      : n
  )
  return { ...data, categories, notes }
}

function addMember<K extends 'codeIds' | 'noteIds' | 'segmentIds'>(
  data: ProjectData,
  categoryId: string,
  key: K,
  memberId: string
): ProjectData {
  return {
    ...data,
    categories: data.categories.map((c) =>
      c.id === categoryId && !c[key].includes(memberId) ? { ...c, [key]: [...c[key], memberId] } : c
    )
  }
}

function removeMember<K extends 'codeIds' | 'noteIds' | 'segmentIds'>(
  data: ProjectData,
  categoryId: string,
  key: K,
  memberId: string
): ProjectData {
  return {
    ...data,
    categories: data.categories.map((c) =>
      c.id === categoryId ? { ...c, [key]: c[key].filter((id) => id !== memberId) } : c
    )
  }
}

export const addCodeToCategory = (data: ProjectData, categoryId: string, codeId: string): ProjectData =>
  addMember(data, categoryId, 'codeIds', codeId)
export const removeCodeFromCategory = (data: ProjectData, categoryId: string, codeId: string): ProjectData =>
  removeMember(data, categoryId, 'codeIds', codeId)

export const addNoteToCategory = (data: ProjectData, categoryId: string, noteId: string): ProjectData =>
  addMember(data, categoryId, 'noteIds', noteId)
export const removeNoteFromCategory = (data: ProjectData, categoryId: string, noteId: string): ProjectData =>
  removeMember(data, categoryId, 'noteIds', noteId)

export const addSegmentToCategory = (data: ProjectData, categoryId: string, segmentId: string): ProjectData =>
  addMember(data, categoryId, 'segmentIds', segmentId)
export const removeSegmentFromCategory = (data: ProjectData, categoryId: string, segmentId: string): ProjectData =>
  removeMember(data, categoryId, 'segmentIds', segmentId)
