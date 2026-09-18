// Cross-case comparison — Phase 7. Every method here (Kaufmann's
// contrastive reading, IPA's Group Experiential Themes table) needs to see
// the same coded material broken out per case rather than as one flat
// list, which is exactly what retrieveByCode already produces per code —
// this module just adds the "case" axis on top of it. No separate
// case/participant concept exists in the data model, so a case is simply
// one document (matches how documents are already used everywhere else:
// one transcript per import).

import type { ProjectData } from './types'

export interface CaseInfo {
  documentId: string
  documentTitle: string
}

/** Every document, treated as one case, oldest-imported first (a stable,
 * meaningful order — e.g. interviews in the sequence they were collected —
 * rather than whatever order they happen to sit in the array). */
export function getCases(data: ProjectData): CaseInfo[] {
  return [...data.documents]
    .sort((a, b) => a.importedAt.localeCompare(b.importedAt))
    .map((d) => ({ documentId: d.id, documentTitle: d.title }))
}

/** Cases grouped by the value they have for one attribute — "what do the
 * nurses say vs. the managers" — with documents that don't have the
 * attribute (or have it empty) collected under `unsetLabel`, last, so no
 * case silently drops out of a comparison. Value groups come sorted
 * (numeric-aware), cases within a group oldest-imported first. */
export interface CaseGroup {
  value: string
  cases: CaseInfo[]
}

export const UNSET_ATTRIBUTE_LABEL = '(not set)'

export function getCaseGroups(data: ProjectData, attributeName: string): CaseGroup[] {
  const byValue = new Map<string, CaseInfo[]>()
  const unset: CaseInfo[] = []
  for (const document of [...data.documents].sort((a, b) => a.importedAt.localeCompare(b.importedAt))) {
    const info = { documentId: document.id, documentTitle: document.title }
    const value = document.attributes[attributeName]?.trim() ?? ''
    if (!value) unset.push(info)
    else byValue.set(value, [...(byValue.get(value) ?? []), info])
  }
  const groups = [...byValue.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map(([value, cases]) => ({ value, cases }))
  if (unset.length > 0) groups.push({ value: UNSET_ATTRIBUTE_LABEL, cases: unset })
  return groups
}

export interface CodeCaseCount {
  codeId: string
  documentId: string
  count: number
}

/** For each code, how many codings it has in each document — one pass over
 * the codings, each credited to its own code and (with roll-up) to every
 * ancestor of it. Same counts as running retrieveByCode per code, which is
 * what the matrices below used to do: that re-indexed the whole project
 * once per code, 500 times over for a 500-code codebook. Documents come in
 * title order, the order retrieveByCode lists them in. */
function countCodingsByDocument(data: ProjectData, includeDescendants: boolean): Map<string, Map<string, number>> {
  const parentOf = new Map(data.codes.map((c) => [c.id, c.parentId]))
  const documentOfSegment = new Map(data.segments.map((s) => [s.id, s.documentId]))
  const titleOf = new Map(data.documents.map((d) => [d.id, d.title]))
  const counts = new Map<string, Map<string, number>>()
  for (const coding of data.codings) {
    const documentId = documentOfSegment.get(coding.segmentId)
    if (documentId === undefined) continue
    const seen = new Set<string>()
    for (let id: string | null | undefined = coding.codeId; id && !seen.has(id); id = includeDescendants ? parentOf.get(id) : null) {
      seen.add(id)
      let byDocument = counts.get(id)
      if (!byDocument) counts.set(id, (byDocument = new Map()))
      byDocument.set(documentId, (byDocument.get(documentId) ?? 0) + 1)
    }
  }
  const title = (id: string): string => titleOf.get(id) ?? '(deleted document)'
  for (const [codeId, byDocument] of counts) {
    counts.set(codeId, new Map([...byDocument].sort((a, b) => title(a[0]).localeCompare(title(b[0])))))
  }
  return counts
}

/**
 * How many segments each code (optionally rolled up with its descendants,
 * same toggle as the plain retrieval view) was applied to, in each case —
 * the cell values for a codes-by-cases matrix. Standing in for "themes" in
 * an IPA-style Group Experiential Themes table: this app already treats
 * the code hierarchy as the theming structure (a parent code as a
 * superordinate theme, its children as sub-themes), so this reuses that
 * rather than inventing a second, category-based rollup alongside it.
 *
 * Only returns cells with count > 0 — a matrix UI treats an absent cell as
 * zero, and a code applied nowhere for a given case is the common case,
 * not worth carrying an explicit zero entry for.
 */
export function getCodeCaseMatrix(
  data: ProjectData,
  codeIds: string[],
  includeDescendants: boolean
): CodeCaseCount[] {
  const counts = countCodingsByDocument(data, includeDescendants)
  const results: CodeCaseCount[] = []
  for (const codeId of codeIds) {
    for (const [documentId, count] of counts.get(codeId) ?? []) results.push({ codeId, documentId, count })
  }
  return results
}

export interface CodeGroupCount {
  codeId: string
  /** The attribute value this column stands for (or UNSET_ATTRIBUTE_LABEL). */
  value: string
  /** Coded passages across every case in the group. */
  count: number
  /** How many of the group's cases have at least one — "3 of 5 nurses"
   * reads differently from "one nurse, three times". */
  caseCount: number
}

/** The codes-by-cases matrix rolled up by an attribute: one column per
 * attribute value instead of per document. Only cells with count > 0. */
export function getCodeGroupMatrix(
  data: ProjectData,
  codeIds: string[],
  attributeName: string,
  includeDescendants: boolean
): CodeGroupCount[] {
  const groups = getCaseGroups(data, attributeName)
  const valueByDocument = new Map<string, string>()
  for (const group of groups) for (const c of group.cases) valueByDocument.set(c.documentId, group.value)

  const countsByCode = countCodingsByDocument(data, includeDescendants)
  const results: CodeGroupCount[] = []
  for (const codeId of codeIds) {
    const counts = new Map<string, { count: number; caseCount: number }>()
    for (const [documentId, count] of countsByCode.get(codeId) ?? []) {
      const value = valueByDocument.get(documentId)
      if (value === undefined) continue
      const cell = counts.get(value) ?? { count: 0, caseCount: 0 }
      cell.count += count
      cell.caseCount++
      counts.set(value, cell)
    }
    for (const [value, cell] of counts) results.push({ codeId, value, count: cell.count, caseCount: cell.caseCount })
  }
  return results
}
