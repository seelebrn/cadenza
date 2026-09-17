// Cross-case comparison — Phase 7. Every method here (Kaufmann's
// contrastive reading, IPA's Group Experiential Themes table) needs to see
// the same coded material broken out per case rather than as one flat
// list, which is exactly what retrieveByCode already produces per code —
// this module just adds the "case" axis on top of it. No separate
// case/participant concept exists in the data model, so a case is simply
// one document (matches how documents are already used everywhere else:
// one transcript per import).

import type { ProjectData } from './types'
import { retrieveByCode } from './retrieval'

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
  const results: CodeCaseCount[] = []
  for (const codeId of codeIds) {
    const byDocument = new Map<string, number>()
    for (const r of retrieveByCode(data, codeId, { includeDescendants })) {
      byDocument.set(r.documentId, (byDocument.get(r.documentId) ?? 0) + 1)
    }
    for (const [documentId, count] of byDocument) {
      results.push({ codeId, documentId, count })
    }
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

  const results: CodeGroupCount[] = []
  for (const codeId of codeIds) {
    const counts = new Map<string, { count: number; documents: Set<string> }>()
    for (const r of retrieveByCode(data, codeId, { includeDescendants })) {
      const value = valueByDocument.get(r.documentId)
      if (value === undefined) continue
      const cell = counts.get(value) ?? { count: 0, documents: new Set<string>() }
      cell.count++
      cell.documents.add(r.documentId)
      counts.set(value, cell)
    }
    for (const [value, cell] of counts) results.push({ codeId, value, count: cell.count, caseCount: cell.documents.size })
  }
  return results
}
