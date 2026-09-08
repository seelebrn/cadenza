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
