// Pure operations for CategoryRecord: an emergent grouping cluster (theme)
// or, distinctively, a category that *is itself* an analytic question
// (Paillé & Mucchielli AQA-style) — codes/notes/segments filed under a
// question-category are read as answers/evidence, not theme instances.
// Deliberately separate from NoteCategoryDef (notesOps.ts), which is a flat
// per-note classification tag, not a grouping cluster.
//
// Categories can nest (parentCategoryId — IPA-style superordinate/
// subordinate themes), the same hierarchy shape as CodeNode.parentId in
// projectOps.ts, including the same cycle-prevention approach.
//
// A CategoryRecord is also the board's only clustering concept — see
// BoardCluster in types.ts and boardOps.ts: a cluster is just a category's
// spatial shape on a particular board, so every category-membership change
// here is instantly visible on any board showing that category, and vice
// versa, because it's the same record.

import { nanoid } from 'nanoid'
import type { CategoryKind, CategoryRecord, ClusterLink, ProjectData } from './types'

export function createCategory(
  data: ProjectData,
  input: { name: string; kind: CategoryKind; color: string; parentCategoryId?: string | null; definition?: string }
): { data: ProjectData; categoryId: string } {
  const category: CategoryRecord = {
    id: nanoid(),
    kind: input.kind,
    name: input.name,
    color: input.color,
    definition: input.definition ?? '',
    codeIds: [],
    noteIds: [],
    segmentIds: [],
    parentCategoryId: input.parentCategoryId ?? null,
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

export function setCategoryDefinition(data: ProjectData, categoryId: string, definition: string): ProjectData {
  return {
    ...data,
    categories: data.categories.map((c) => (c.id === categoryId ? { ...c, definition } : c))
  }
}

export function setCategoryKind(data: ProjectData, categoryId: string, kind: CategoryKind): ProjectData {
  return {
    ...data,
    categories: data.categories.map((c) => (c.id === categoryId ? { ...c, kind } : c))
  }
}

function isDescendantCategory(categories: CategoryRecord[], ancestorId: string, candidateId: string): boolean {
  let current = categories.find((c) => c.id === candidateId)
  while (current?.parentCategoryId) {
    if (current.parentCategoryId === ancestorId) return true
    current = categories.find((c) => c.id === current!.parentCategoryId)
  }
  return false
}

/** Nests categoryId under parentCategoryId (a "superordinate cluster").
 * No-ops (returns data unchanged) if the move would create a cycle. */
export function reparentCategory(
  data: ProjectData,
  categoryId: string,
  parentCategoryId: string | null
): ProjectData {
  if (parentCategoryId === categoryId) return data
  if (parentCategoryId && isDescendantCategory(data.categories, categoryId, parentCategoryId)) return data
  return {
    ...data,
    categories: data.categories.map((c) => (c.id === categoryId ? { ...c, parentCategoryId } : c))
  }
}

/** All direct + transitive descendant category ids of categoryId (not
 * including itself) — used when a superordinate cluster is dragged, so its
 * whole nested subtree moves with it. */
export function getDescendantCategoryIds(categories: CategoryRecord[], categoryId: string): string[] {
  const children = categories.filter((c) => c.parentCategoryId === categoryId)
  const result: string[] = []
  for (const child of children) {
    result.push(child.id)
    result.push(...getDescendantCategoryIds(categories, child.id))
  }
  return result
}

/** How many parentCategoryId hops up to a root (0 for a root cluster
 * itself). Used to paint the board's cluster frames in ancestor-first
 * order regardless of creation order — without it, a superordinate
 * cluster created *after* the one nested into it renders on top and
 * silently swallows every click over the shared area, making the nested
 * cluster's own title bar/resize handle/delete button unreachable. Falls
 * back to 0 on an unexpected cycle (shouldn't happen — reparentCategory
 * already prevents creating one) rather than looping forever. */
export function getCategoryDepth(categories: CategoryRecord[], categoryId: string): number {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const visited = new Set<string>()
  let depth = 0
  let current = byId.get(categoryId)
  while (current?.parentCategoryId) {
    if (visited.has(current.id)) return depth
    visited.add(current.id)
    depth++
    current = byId.get(current.parentCategoryId)
  }
  return depth
}

/** Deletes a category, promoting its children to its own parent (mirrors
 * deleteCode) so nesting collapses one level rather than losing them.
 * Notes attached directly *to* the category fall back to a project-level
 * attachment, any board clusters representing it (on any board) are
 * removed — they have nothing left to point at — and so is any
 * ClusterLink naming it as either endpoint, for the same reason. */
export function deleteCategory(data: ProjectData, categoryId: string): ProjectData {
  const target = data.categories.find((c) => c.id === categoryId)
  if (!target) return data

  const categories = data.categories
    .filter((c) => c.id !== categoryId)
    .map((c) => (c.parentCategoryId === categoryId ? { ...c, parentCategoryId: target.parentCategoryId } : c))
  const notes = data.notes.map((n) =>
    n.attachedTo.kind === 'category' && n.attachedTo.categoryId === categoryId
      ? { ...n, attachedTo: { kind: 'project' as const } }
      : n
  )
  const boardClusters = data.boardClusters.filter((bc) => bc.categoryId !== categoryId)
  const clusterLinks = data.clusterLinks.filter(
    (l) => l.fromCategoryId !== categoryId && l.toCategoryId !== categoryId
  )
  return { ...data, categories, notes, boardClusters, clusterLinks }
}

// --- Cluster links (labeled relationships between two clusters) ---

/** No-ops (returns the existing link's id) if an identical from/to pair
 * already exists — same direction only: A->B and B->A are treated as
 * distinct relationships, since a directed pair can mean different things
 * each way ("A causes B" isn't "B causes A"). */
export function createClusterLink(
  data: ProjectData,
  fromCategoryId: string,
  toCategoryId: string,
  label: string,
  directed: boolean
): { data: ProjectData; linkId: string } {
  const existing = data.clusterLinks.find(
    (l) => l.fromCategoryId === fromCategoryId && l.toCategoryId === toCategoryId
  )
  if (existing) return { data, linkId: existing.id }

  const link: ClusterLink = {
    id: nanoid(),
    fromCategoryId,
    toCategoryId,
    label,
    directed,
    createdAt: new Date().toISOString()
  }
  return { data: { ...data, clusterLinks: [...data.clusterLinks, link] }, linkId: link.id }
}

export function updateClusterLink(
  data: ProjectData,
  linkId: string,
  changes: { label?: string; directed?: boolean }
): ProjectData {
  return {
    ...data,
    clusterLinks: data.clusterLinks.map((l) => (l.id === linkId ? { ...l, ...changes } : l))
  }
}

export function deleteClusterLink(data: ProjectData, linkId: string): ProjectData {
  return { ...data, clusterLinks: data.clusterLinks.filter((l) => l.id !== linkId) }
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

/** Is refId (of the given kind) a member of this category? Used by the
 * board to resolve "which items currently belong to this cluster". */
export function isCategoryMember(
  category: CategoryRecord,
  refType: 'code' | 'note' | 'segment',
  refId: string
): boolean {
  if (refType === 'code') return category.codeIds.includes(refId)
  if (refType === 'note') return category.noteIds.includes(refId)
  return category.segmentIds.includes(refId)
}

export function addMemberByRefType(
  data: ProjectData,
  categoryId: string,
  refType: 'code' | 'note' | 'segment',
  refId: string
): ProjectData {
  if (refType === 'code') return addCodeToCategory(data, categoryId, refId)
  if (refType === 'note') return addNoteToCategory(data, categoryId, refId)
  return addSegmentToCategory(data, categoryId, refId)
}

export function removeMemberByRefType(
  data: ProjectData,
  categoryId: string,
  refType: 'code' | 'note' | 'segment',
  refId: string
): ProjectData {
  if (refType === 'code') return removeCodeFromCategory(data, categoryId, refId)
  if (refType === 'note') return removeNoteFromCategory(data, categoryId, refId)
  return removeSegmentFromCategory(data, categoryId, refId)
}
