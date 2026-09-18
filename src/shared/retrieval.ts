// Pure "show me everything" queries over ProjectData — the flat retrieval
// views (by code/item, by note) that every method here (Kaufmann, IPA,
// Reflexive TA, AQA) needs and none of them had a way to do before this.

import type { CodeNode, NoteRecord, ProjectData, Segment } from './types'
import { getSurroundingWords, joinParagraphs } from './text'

/** Word count on each side shown by the code-info window's "more context"
 * checkbox. A fixed constant (not a UI parameter) since it's cheap to
 * compute regardless of whether it's displayed. */
export const CODE_USAGE_CONTEXT_WORDS = 15

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

export interface CodeUsageInstance {
  documentId: string
  documentTitle: string
  segment: Segment
  codingId: string
  /** Up to CODE_USAGE_CONTEXT_WORDS words immediately surrounding the
   * verbatim quote, from the source document — empty string if the
   * document no longer exists or there's nothing on that side. */
  contextBefore: string
  contextAfter: string
}

export interface CodeUsageDetail {
  count: number
  instances: CodeUsageInstance[]
}

/** Everything the code-info window (double-click a code anywhere — the
 * source text, the Workspace tree, or the board) needs: how many times
 * this exact code was used and the verbatim of every instance, each
 * already paired with its surrounding context so the window's checkbox is
 * just a display toggle, not a recompute. Deliberately excludes descendant
 * codes (unlike retrieveByCode's default) — this is "how many times was
 * *this* code applied," not a rollup of its sub-codes too. */
export function getCodeUsageDetail(data: ProjectData, codeId: string): CodeUsageDetail {
  const results = retrieveByCode(data, codeId, { includeDescendants: false })
  const documentById = new Map(data.documents.map((d) => [d.id, d]))

  const instances: CodeUsageInstance[] = results.map((r) => {
    const document = documentById.get(r.documentId)
    const context = document
      ? getSurroundingWords(
          joinParagraphs(document.paragraphs),
          r.segment.start,
          r.segment.end,
          CODE_USAGE_CONTEXT_WORDS
        )
      : { before: '', after: '' }
    return {
      documentId: r.documentId,
      documentTitle: r.documentTitle,
      segment: r.segment,
      codingId: r.codingId,
      contextBefore: context.before,
      contextAfter: context.after
    }
  })

  return { count: instances.length, instances }
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

// --- Passage queries -------------------------------------------------------

/** What to retrieve in the Retrieval view: passages carrying some codes,
 * narrowed by which codes must meet on them, which must be absent, which
 * documents, and which case attributes. Codes "meet" the way they co-occur
 * in the co-occurrence matrix (see cooccurrence.ts): on the same passage or
 * on two overlapping ones. */
export interface PassageQuery {
  /** Codes to retrieve; empty = every coded passage. */
  codeIds: string[]
  /** 'any': passages carrying at least one of codeIds. 'all': those where
   * every one of codeIds meets. */
  match: 'any' | 'all'
  /** Passages where any of these meets are left out. */
  excludeCodeIds: string[]
  /** A code stands for itself and its sub-codes. */
  includeDescendants: boolean
  /** Only passages in these documents; empty = all documents. */
  documentIds: string[]
  /** Case attribute → the values accepted for it (a document must match
   * one value of every attribute listed; an empty list filters nothing). */
  attributes: Record<string, string[]>
}

export const EMPTY_PASSAGE_QUERY: PassageQuery = {
  codeIds: [],
  match: 'any',
  excludeCodeIds: [],
  includeDescendants: true,
  documentIds: [],
  attributes: {}
}

export interface PassageResult {
  documentId: string
  documentTitle: string
  segment: Segment
  /** Every code applied to this passage, in codebook order. */
  codeIds: string[]
}

/** The passages matching `query`, one entry per passage (however many of
 * the codes are on it), by document title then position. */
export function queryPassages(data: ProjectData, query: PassageQuery): PassageResult[] {
  const expand = (codeId: string): Set<string> => {
    const ids = new Set([codeId])
    if (query.includeDescendants) for (const id of getDescendantCodeIds(data.codes, codeId)) ids.add(id)
    return ids
  }
  const wanted = query.codeIds.map(expand)
  const excluded = query.excludeCodeIds.map(expand)

  const documentById = new Map(data.documents.map((d) => [d.id, d]))
  const allowedDocument = (documentId: string): boolean => {
    if (query.documentIds.length && !query.documentIds.includes(documentId)) return false
    const document = documentById.get(documentId)
    for (const [name, values] of Object.entries(query.attributes)) {
      if (values.length && !values.includes((document?.attributes[name] ?? '').trim())) return false
    }
    return true
  }

  const codeOrder = new Map(data.codes.map((c, i) => [c.id, i]))
  const codesBySegment = new Map<string, Set<string>>()
  for (const coding of data.codings) {
    const codes = codesBySegment.get(coding.segmentId) ?? new Set<string>()
    codes.add(coding.codeId)
    codesBySegment.set(coding.segmentId, codes)
  }
  const codedByDocument = new Map<string, Segment[]>()
  for (const segment of data.segments) {
    if (!codesBySegment.has(segment.id) || !allowedDocument(segment.documentId)) continue
    codedByDocument.set(segment.documentId, [...(codedByDocument.get(segment.documentId) ?? []), segment])
  }

  const carries = (segment: Segment, codes: Set<string>): boolean => {
    for (const id of codesBySegment.get(segment.id)!) if (codes.has(id)) return true
    return false
  }

  const results: PassageResult[] = []
  for (const segments of codedByDocument.values()) {
    for (const segment of segments) {
      if (wanted.length && !wanted.some((codes) => carries(segment, codes))) continue
      // The passage itself and every passage overlapping it.
      const around = segments.filter((other) => other.start < segment.end && segment.start < other.end)
      const meets = (codes: Set<string>): boolean => around.some((other) => carries(other, codes))
      if (query.match === 'all' && !wanted.every(meets)) continue
      if (excluded.some(meets)) continue
      results.push({
        documentId: segment.documentId,
        documentTitle: documentById.get(segment.documentId)?.title ?? '(deleted document)',
        segment,
        codeIds: [...codesBySegment.get(segment.id)!].sort((a, b) => (codeOrder.get(a) ?? 0) - (codeOrder.get(b) ?? 0))
      })
    }
  }
  results.sort((a, b) => a.documentTitle.localeCompare(b.documentTitle) || a.segment.start - b.segment.start)
  return results
}
