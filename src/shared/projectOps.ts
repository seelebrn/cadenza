// Pure, side-effect-free operations on ProjectData: codebook CRUD, hierarchy,
// merge, and applying/removing a coding on a piece of text. Kept UI/Electron
// agnostic so they're directly unit-testable and reusable (e.g. later by an
// export/report step) without spinning up React or IPC.

import { nanoid } from 'nanoid'
import type { CodeNode, Coding, ProjectData, Segment, TagKind } from './types'

export interface AddCodeInput {
  name: string
  kind: TagKind
  color: string
  definition?: string
  parentId?: string | null
}

export function addCode(data: ProjectData, input: AddCodeInput): { data: ProjectData; codeId: string } {
  const code: CodeNode = {
    id: nanoid(),
    kind: input.kind,
    name: input.name,
    color: input.color,
    definition: input.definition ?? '',
    parentId: input.parentId ?? null,
    createdAt: new Date().toISOString()
  }
  return { data: { ...data, codes: [...data.codes, code] }, codeId: code.id }
}

export function renameCode(data: ProjectData, codeId: string, name: string): ProjectData {
  return { ...data, codes: data.codes.map((c) => (c.id === codeId ? { ...c, name } : c)) }
}

export function setCodeColor(data: ProjectData, codeId: string, color: string): ProjectData {
  return { ...data, codes: data.codes.map((c) => (c.id === codeId ? { ...c, color } : c)) }
}

export function setCodeDefinition(data: ProjectData, codeId: string, definition: string): ProjectData {
  return { ...data, codes: data.codes.map((c) => (c.id === codeId ? { ...c, definition } : c)) }
}

function isDescendant(codes: CodeNode[], ancestorId: string, candidateId: string): boolean {
  let current = codes.find((c) => c.id === candidateId)
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true
    current = codes.find((c) => c.id === current!.parentId)
  }
  return false
}

/** No-ops (returns data unchanged) if the move would create a cycle. */
export function reparentCode(data: ProjectData, codeId: string, parentId: string | null): ProjectData {
  if (parentId === codeId) return data
  if (parentId && isDescendant(data.codes, codeId, parentId)) return data
  return { ...data, codes: data.codes.map((c) => (c.id === codeId ? { ...c, parentId } : c)) }
}

function isSegmentReferenced(data: ProjectData, segmentId: string): boolean {
  if (data.codings.some((c) => c.segmentId === segmentId)) return true
  if (data.notes.some((n) => n.attachedTo.kind === 'segment' && n.attachedTo.segmentId === segmentId)) {
    return true
  }
  if (data.categories.some((cat) => cat.segmentIds.includes(segmentId))) return true
  if (data.boardItems.some((bi) => bi.refType === 'segment' && bi.refId === segmentId)) return true
  return false
}

/** Removes a segment if nothing references it any more. */
export function pruneOrphanSegment(data: ProjectData, segmentId: string): ProjectData {
  if (isSegmentReferenced(data, segmentId)) return data
  return { ...data, segments: data.segments.filter((s) => s.id !== segmentId) }
}

/** Deletes a code, promoting its children to its own parent (the hierarchy
 * collapses one level rather than losing child codes), and cascades removal
 * through codings/notes/categories/board items, pruning orphaned segments. */
export function deleteCode(data: ProjectData, codeId: string): ProjectData {
  const target = data.codes.find((c) => c.id === codeId)
  if (!target) return data

  const removedSegmentIds = new Set(
    data.codings.filter((c) => c.codeId === codeId).map((c) => c.segmentId)
  )

  const codes = data.codes
    .filter((c) => c.id !== codeId)
    .map((c) => (c.parentId === codeId ? { ...c, parentId: target.parentId } : c))
  const codings = data.codings.filter((c) => c.codeId !== codeId)
  const notes = data.notes.filter(
    (n) => !(n.attachedTo.kind === 'code' && n.attachedTo.codeId === codeId)
  )
  const categories = data.categories.map((cat) => ({
    ...cat,
    codeIds: cat.codeIds.filter((id) => id !== codeId)
  }))
  const boardItems = data.boardItems.filter((bi) => !(bi.refType === 'code' && bi.refId === codeId))

  let next: ProjectData = { ...data, codes, codings, notes, categories, boardItems }
  for (const segmentId of removedSegmentIds) {
    next = pruneOrphanSegment(next, segmentId)
  }
  return next
}

/** Merges sourceId into targetId: reassigns codings/notes/categories/board
 * items, moves the source's children under the target, drops the source
 * code, and de-duplicates any coding that would end up on the same segment
 * for the target code twice. */
export function mergeCodes(data: ProjectData, sourceId: string, targetId: string): ProjectData {
  if (sourceId === targetId) return data
  const source = data.codes.find((c) => c.id === sourceId)
  if (!source) return data

  const codes = data.codes
    .filter((c) => c.id !== sourceId)
    .map((c) => (c.parentId === sourceId ? { ...c, parentId: targetId } : c))

  const seenCodingKeys = new Set(
    data.codings.filter((c) => c.codeId === targetId).map((c) => c.segmentId)
  )
  const codings = data.codings.reduce<Coding[]>((acc, c) => {
    if (c.codeId !== sourceId) {
      acc.push(c)
      return acc
    }
    if (seenCodingKeys.has(c.segmentId)) return acc // would duplicate target's coding on this segment
    seenCodingKeys.add(c.segmentId)
    acc.push({ ...c, codeId: targetId })
    return acc
  }, [])

  const notes = data.notes.map((n) =>
    n.attachedTo.kind === 'code' && n.attachedTo.codeId === sourceId
      ? { ...n, attachedTo: { kind: 'code' as const, codeId: targetId } }
      : n
  )
  const categories = data.categories.map((cat) => ({
    ...cat,
    codeIds: Array.from(new Set(cat.codeIds.map((id) => (id === sourceId ? targetId : id))))
  }))
  const boardItems = data.boardItems.map((bi) =>
    bi.refType === 'code' && bi.refId === sourceId ? { ...bi, refId: targetId } : bi
  )

  return { ...data, codes, codings, notes, categories, boardItems }
}

export interface ApplyCodeInput {
  documentId: string
  start: number
  end: number
  text: string
  codeId: string
}

/** Applies a code to a text span: reuses an existing Segment at the exact
 * same [documentId, start, end] if one exists (so coding the same passage
 * with a second code doesn't create a duplicate segment), otherwise creates
 * one with the verbatim `text` snapshot. No-ops if already coded with this
 * code. */
export function applyCodeToSelection(data: ProjectData, input: ApplyCodeInput): ProjectData {
  const existingSegment = data.segments.find(
    (s) => s.documentId === input.documentId && s.start === input.start && s.end === input.end
  )

  let segments = data.segments
  let segmentId: string
  if (existingSegment) {
    segmentId = existingSegment.id
  } else {
    const segment: Segment = {
      id: nanoid(),
      documentId: input.documentId,
      start: input.start,
      end: input.end,
      text: input.text
    }
    segments = [...segments, segment]
    segmentId = segment.id
  }

  const alreadyCoded = data.codings.some(
    (c) => c.segmentId === segmentId && c.codeId === input.codeId
  )
  if (alreadyCoded) return { ...data, segments }

  const coding: Coding = {
    id: nanoid(),
    segmentId,
    codeId: input.codeId,
    createdAt: new Date().toISOString()
  }
  return { ...data, segments, codings: [...data.codings, coding] }
}

/** Removes a single coding (not the code itself), pruning the segment if
 * nothing else references it. */
export function removeCoding(data: ProjectData, codingId: string): ProjectData {
  const coding = data.codings.find((c) => c.id === codingId)
  if (!coding) return data
  const codings = data.codings.filter((c) => c.id !== codingId)
  return pruneOrphanSegment({ ...data, codings }, coding.segmentId)
}
