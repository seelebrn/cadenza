import type { ProjectData, Segment } from './types'
import { getDescendantCodeIds } from './retrieval'

/** Code co-occurrence — which codes land on the same passages. Two codes
 * co-occur wherever a passage coded with one overlaps a passage coded with
 * the other (the same passage, or two overlapping selections) in the same
 * document. Each overlapping pair of passages counts once, so the measure
 * is symmetric: A-with-B is B-with-A. Pure; the Analysis tab renders the
 * matrix and drills into the passages behind a cell. */

export interface CooccurrenceCell {
  /** Ordered so that codeA < codeB by id; the matrix is symmetric. */
  codeA: string
  codeB: string
  /** Overlapping passage pairs across all documents. */
  count: number
  /** Documents in which the two co-occur at least once. */
  documentCount: number
}

export interface CooccurringPassage {
  documentId: string
  documentTitle: string
  segmentA: Segment
  segmentB: Segment
  /** The stretch of text both passages share. */
  overlap: { start: number; end: number; text: string }
}

/** Segments carrying each code (optionally with its descendants' codings
 * rolled up — same toggle as everywhere else), as a map code → distinct
 * segments. */
function segmentsByCode(data: ProjectData, codeIds: string[], includeDescendants: boolean): Map<string, Segment[]> {
  const segmentById = new Map(data.segments.map((s) => [s.id, s]))
  const result = new Map<string, Segment[]>()
  for (const codeId of codeIds) {
    const members = new Set([codeId])
    if (includeDescendants) for (const id of getDescendantCodeIds(data.codes, codeId)) members.add(id)
    const seen = new Set<string>()
    const segments: Segment[] = []
    for (const coding of data.codings) {
      if (!members.has(coding.codeId) || seen.has(coding.segmentId)) continue
      const segment = segmentById.get(coding.segmentId)
      if (!segment) continue
      seen.add(segment.id)
      segments.push(segment)
    }
    result.set(codeId, segments)
  }
  return result
}

function overlaps(a: Segment, b: Segment): boolean {
  return a.documentId === b.documentId && a.start < b.end && b.start < a.end
}

/** The full symmetric matrix over `codeIds`, as one cell per unordered
 * pair with at least one co-occurrence, plus one cell per code on the
 * diagonal (codeA === codeB) giving how many passages carry it at all —
 * the "n" a row's counts are read against.
 *
 * Computed from the passages rather than from the pairs of codes: comparing
 * every pair of codes' passages is quadratic in the codebook (seconds for
 * 500 codes); here each document's passages are swept once in reading order
 * to find the overlapping ones, and each overlap credits the codes found on
 * its two passages. */
export function getCodeCooccurrenceMatrix(
  data: ProjectData,
  codeIds: string[],
  includeDescendants: boolean
): CooccurrenceCell[] {
  const indexOf = new Map(codeIds.map((id, i) => [id, i]))
  // The matrix codes a coding counts toward: its own code, and with
  // roll-up every ancestor of it.
  const parentOf = new Map(data.codes.map((c) => [c.id, c.parentId]))
  const targetsCache = new Map<string, number[]>()
  const targetsOf = (codeId: string): number[] => {
    const cached = targetsCache.get(codeId)
    if (cached) return cached
    const targets: number[] = []
    const seen = new Set<string>()
    for (let id: string | null | undefined = codeId; id && !seen.has(id); id = includeDescendants ? parentOf.get(id) : null) {
      seen.add(id)
      const index = indexOf.get(id)
      if (index !== undefined) targets.push(index)
    }
    targetsCache.set(codeId, targets)
    return targets
  }

  const segmentById = new Map(data.segments.map((s) => [s.id, s]))
  const codesBySegment = new Map<Segment, Set<number>>()
  for (const coding of data.codings) {
    const segment = segmentById.get(coding.segmentId)
    if (!segment) continue
    const targets = targetsOf(coding.codeId)
    if (targets.length === 0) continue
    let codes = codesBySegment.get(segment)
    if (!codes) codesBySegment.set(segment, (codes = new Set()))
    for (const index of targets) codes.add(index)
  }

  const n = codeIds.length
  const tallies = new Map<number, { count: number; documents: Set<string> }>()
  const credit = (i: number, j: number, documentId: string): void => {
    const key = i < j ? i * n + j : j * n + i
    let tally = tallies.get(key)
    if (!tally) tallies.set(key, (tally = { count: 0, documents: new Set() }))
    tally.count++
    tally.documents.add(documentId)
  }

  const byDocument = new Map<string, Segment[]>()
  for (const segment of codesBySegment.keys()) {
    const list = byDocument.get(segment.documentId)
    if (list) list.push(segment)
    else byDocument.set(segment.documentId, [segment])
  }
  for (const [documentId, segments] of byDocument) {
    segments.sort((a, b) => a.start - b.start)
    for (let x = 0; x < segments.length; x++) {
      const s = segments[x]
      const codesS = [...codesBySegment.get(s)!]
      // The passage itself: on the diagonal for each of its codes, and one
      // co-occurrence for each pair of codes it carries.
      for (let a = 0; a < codesS.length; a++) {
        credit(codesS[a], codesS[a], documentId)
        if (overlaps(s, s)) for (let b = a + 1; b < codesS.length; b++) credit(codesS[a], codesS[b], documentId)
      }
      // Later passages starting before this one ends.
      for (let y = x + 1; y < segments.length && segments[y].start < s.end; y++) {
        const t = segments[y]
        if (!overlaps(s, t)) continue
        for (const a of codesS) for (const b of codesBySegment.get(t)!) if (a !== b) credit(a, b, documentId)
      }
    }
  }

  // Same order as the matrix reads: by row, the diagonal first.
  const cells: CooccurrenceCell[] = []
  for (const key of [...tallies.keys()].sort((p, q) => p - q)) {
    const i = Math.floor(key / n)
    const j = key % n
    const tally = tallies.get(key)!
    const [codeA, codeB] = codeIds[i] < codeIds[j] ? [codeIds[i], codeIds[j]] : [codeIds[j], codeIds[i]]
    cells.push({ codeA, codeB, count: tally.count, documentCount: tally.documents.size })
  }
  return cells
}

/** The passages behind one cell: every overlapping pair, document by
 * document in reading order, with the shared stretch of text. For the
 * diagonal (same code twice) this is simply every passage carrying it. */
export function getCooccurringPassages(
  data: ProjectData,
  codeA: string,
  codeB: string,
  includeDescendants: boolean
): CooccurringPassage[] {
  const byCode = segmentsByCode(data, [codeA, codeB], includeDescendants)
  const documentById = new Map(data.documents.map((d) => [d.id, d]))
  const segmentsA = byCode.get(codeA) ?? []
  const segmentsB = codeA === codeB ? segmentsA : byCode.get(codeB) ?? []
  const passages: CooccurringPassage[] = []
  for (const sa of segmentsA) {
    for (const sb of segmentsB) {
      if (codeA === codeB ? sa !== sb : !overlaps(sa, sb)) continue
      const document = documentById.get(sa.documentId)
      if (!document) continue
      const start = Math.max(sa.start, sb.start)
      const end = Math.min(sa.end, sb.end)
      const full = document.paragraphs.join('\n\n')
      passages.push({
        documentId: sa.documentId,
        documentTitle: document.title,
        segmentA: sa,
        segmentB: sb,
        overlap: { start, end, text: full.slice(start, end) }
      })
    }
  }
  passages.sort((x, y) => x.documentTitle.localeCompare(y.documentTitle) || x.overlap.start - y.overlap.start)
  return passages
}
