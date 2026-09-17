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
 * the "n" a row's counts are read against. */
export function getCodeCooccurrenceMatrix(
  data: ProjectData,
  codeIds: string[],
  includeDescendants: boolean
): CooccurrenceCell[] {
  const byCode = segmentsByCode(data, codeIds, includeDescendants)
  const cells: CooccurrenceCell[] = []
  for (let i = 0; i < codeIds.length; i++) {
    const a = codeIds[i]
    const segmentsA = byCode.get(a) ?? []
    if (segmentsA.length > 0) {
      cells.push({ codeA: a, codeB: a, count: segmentsA.length, documentCount: new Set(segmentsA.map((s) => s.documentId)).size })
    }
    for (let j = i + 1; j < codeIds.length; j++) {
      const b = codeIds[j]
      const segmentsB = byCode.get(b) ?? []
      let count = 0
      const documents = new Set<string>()
      for (const sa of segmentsA) {
        for (const sb of segmentsB) {
          if (!overlaps(sa, sb)) continue
          count++
          documents.add(sa.documentId)
        }
      }
      if (count > 0) {
        const [codeA, codeB] = a < b ? [a, b] : [b, a]
        cells.push({ codeA, codeB, count, documentCount: documents.size })
      }
    }
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
