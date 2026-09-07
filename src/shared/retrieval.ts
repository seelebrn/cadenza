// Pure "show me everything" queries over ProjectData — the flat retrieval
// views (by code/item, by note) that every method here (Kaufmann, IPA,
// Reflexive TA, AQA) needs and none of them had a way to do before this.

import type { CodeNode, NoteRecord, ProjectData, Segment } from './types'

/** All descendant code ids of a code (not including itself). */
export function getDescendantCodeIds(codes: CodeNode[], rootId: string): string[] {
  const children = codes.filter((c) => c.parentId === rootId)
  const result: string[] = []
  for (const child of children) {
    result.push(child.id)
    result.push(...getDescendantCodeIds(codes, child.id))
  }
  return result
}

export interface CodeRetrievalResult {
  documentId: string
  documentTitle: string
  segment: Segment
  codingId: string
  /** The specific code this coding used — may be a descendant of the
   * code the caller searched for, if includeDescendants was set. */
  codeId: string
}

export interface RetrieveByCodeOptions {
  includeDescendants: boolean
}

/** Every segment coded with `codeId` (optionally including its descendants
 * in the code hierarchy — e.g. treating a parent as a superordinate theme
 * whose subordinate/child codes' instances should also surface), grouped
 * implicitly by a stable sort: document title, then position in document. */
export function retrieveByCode(
  data: ProjectData,
  codeId: string,
  options: RetrieveByCodeOptions = { includeDescendants: true }
): CodeRetrievalResult[] {
  const codeIds = new Set([codeId])
  if (options.includeDescendants) {
    for (const id of getDescendantCodeIds(data.codes, codeId)) codeIds.add(id)
  }

  const segmentById = new Map(data.segments.map((s) => [s.id, s]))
  const documentById = new Map(data.documents.map((d) => [d.id, d]))

  const results: CodeRetrievalResult[] = []
  for (const coding of data.codings) {
    if (!codeIds.has(coding.codeId)) continue
    const segment = segmentById.get(coding.segmentId)
    if (!segment) continue
    results.push({
      documentId: segment.documentId,
      documentTitle: documentById.get(segment.documentId)?.title ?? '(deleted document)',
      segment,
      codingId: coding.id,
      codeId: coding.codeId
    })
  }

  results.sort(
    (a, b) => a.documentTitle.localeCompare(b.documentTitle) || a.segment.start - b.segment.start
  )
  return results
}

export interface NoteRetrievalFilters {
  /** undefined = no filter; null = only uncategorized notes; a string = that category. */
  noteCategoryId?: string | null
  tag?: string
  hasQuestion?: boolean
}

/** Notes matching the given filters, oldest first (the chronological
 * questioning-pass reading order). */
export function retrieveNotes(data: ProjectData, filters: NoteRetrievalFilters = {}): NoteRecord[] {
  return data.notes
    .filter((n) => {
      if (filters.noteCategoryId !== undefined && n.noteCategoryId !== filters.noteCategoryId) return false
      if (filters.tag && !n.tags.includes(filters.tag)) return false
      if (filters.hasQuestion !== undefined && Boolean(n.question) !== filters.hasQuestion) return false
      return true
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}
