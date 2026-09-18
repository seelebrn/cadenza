import { useMemo, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import { flattenCodeTree } from '@shared/codeTree'
import { getCaseGroups, getCases, getCodeCaseMatrix, getCodeGroupMatrix, type CaseInfo } from '@shared/comparison'
import { getAttributeNames } from '@shared/documentOps'
import { retrieveByCode } from '@shared/retrieval'
import type { CodeRetrievalResult } from '@shared/retrieval'

/** Phase 7 — cross-case comparison. A "case" is simply a document (no
 * separate case/participant concept exists in the data model, and this
 * matches how documents are already used everywhere else). Two linked
 * sub-views:
 *  - "Themes × cases": an IPA-style Group Experiential Themes table, using
 *    the existing code hierarchy as the theming structure (a parent code
 *    as a superordinate theme, its children as sub-themes) rather than a
 *    second, category-based rollup — count of coded passages per code per
 *    case, click a cell to see the actual quotes.
 *  - "Contrast one code": a Kaufmann-style side-by-side reading — pick one
 *    code, see every case's instances of it in its own column, including
 *    cases with none, since absence across cases is itself meaningful.
 * Both can be grouped by a case attribute (see DocumentRecord.attributes):
 * one column per attribute value instead of per case — "what do the
 * nurses say vs. the managers". */
function ComparisonView(): JSX.Element | null {
  const data = useProjectStore((s) => s.data)
  const goToPassage = useWorkspaceUiStore((s) => s.goToPassage)

  const [mode, setMode] = useState<'matrix' | 'contrast'>('matrix')
  const [includeDescendants, setIncludeDescendants] = useState(true)
  const [contrastCodeId, setContrastCodeId] = useState('')
  const [groupBy, setGroupBy] = useState('')

  const flatCodes = useMemo(() => (data ? flattenCodeTree(data.codes) : []), [data])
  const cases = useMemo(() => (data ? getCases(data) : []), [data])
  const attributeNames = useMemo(() => (data ? getAttributeNames(data) : []), [data])
  const isGrouped = groupBy !== '' && attributeNames.includes(groupBy)

  // The columns: one per case, or one per attribute value when grouped.
  const columns = useMemo<Array<{ key: string; label: string; cases: CaseInfo[] }>>(() => {
    if (!data) return []
    if (isGrouped) {
      return getCaseGroups(data, groupBy).map((g) => ({ key: g.value, label: g.value, cases: g.cases }))
    }
    return cases.map((c) => ({ key: c.documentId, label: c.documentTitle, cases: [c] }))
  }, [data, cases, isGrouped, groupBy])

  const matrix = useMemo(() => {
    const map = new Map<string, { count: number; caseCount: number }>()
    if (!data) return map
    const codeIds = flatCodes.map((f) => f.code.id)
    if (isGrouped) {
      for (const cell of getCodeGroupMatrix(data, codeIds, groupBy, includeDescendants)) {
        map.set(`${cell.codeId}:${cell.value}`, { count: cell.count, caseCount: cell.caseCount })
      }
    } else {
      for (const cell of getCodeCaseMatrix(data, codeIds, includeDescendants)) {
        map.set(`${cell.codeId}:${cell.documentId}`, { count: cell.count, caseCount: 1 })
      }
    }
    return map
  }, [data, flatCodes, includeDescendants, isGrouped, groupBy])

  const contrastResults = useMemo(() => {
    if (!data || !contrastCodeId) return []
    return retrieveByCode(data, contrastCodeId, { includeDescendants })
  }, [data, contrastCodeId, includeDescendants])

  const contrastByCase = useMemo(() => {
    const byDoc = new Map<string, CodeRetrievalResult[]>()
    for (const r of contrastResults) {
      const list = byDoc.get(r.documentId) ?? []
      list.push(r)
      byDoc.set(r.documentId, list)
    }
    return byDoc
  }, [contrastResults])

  function goToSegment(documentId: string, start: number, end: number, text: string): void {
    goToPassage({ documentId, start, end, text })
  }

  function openContrastFor(codeId: string): void {
    setContrastCodeId(codeId)
    setMode('contrast')
  }

  if (!data) return null

  const hasCases = cases.length > 0
  const hasCodes = flatCodes.length > 0

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 px-4 py-2 text-sm">
        <button
          className={mode === 'matrix' ? 'font-semibold text-slate-900' : 'text-slate-400 hover:text-slate-600'}
          onClick={() => setMode('matrix')}
        >
          Themes × cases
        </button>
        <button
          className={mode === 'contrast' ? 'font-semibold text-slate-900' : 'text-slate-400 hover:text-slate-600'}
          onClick={() => setMode('contrast')}
        >
          Contrast one code
        </button>
        <label
          className="ml-auto flex items-center gap-1 text-xs text-slate-500"
          title={
            attributeNames.length === 0
              ? 'Record case attributes (role, site, age…) under a document\'s title in the Workspace to compare groups of cases'
              : 'One column per value of this attribute, instead of one per case'
          }
        >
          Group cases by
          <select
            className="rounded border border-slate-300 px-1 py-0.5"
            value={isGrouped ? groupBy : ''}
            onChange={(e) => setGroupBy(e.target.value)}
            disabled={attributeNames.length === 0}
          >
            <option value="">— each case —</option>
            {attributeNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={includeDescendants}
            onChange={(e) => setIncludeDescendants(e.target.checked)}
          />
          Roll up sub-codes
        </label>
      </div>

      {!hasCases || !hasCodes ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-400">
          {!hasCases
            ? 'Import at least one document to compare cases.'
            : 'Create at least one code to compare across cases.'}
        </div>
      ) : mode === 'matrix' ? (
        <div className="flex-1 overflow-auto p-4">
          <p className="mb-3 text-xs text-slate-400">
            {isGrouped
              ? `How many coded passages each code/item has across the cases with each value of “${groupBy}” (and in how many of those cases). Click a cell to see the actual quotes side by side.`
              : 'How many coded passages each code/item has in each case (document). Click a cell to see the actual quotes side by side.'}
          </p>
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-slate-200 bg-white p-2 text-left font-medium text-slate-500">
                  Code / item
                </th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="whitespace-nowrap border-b border-slate-200 p-2 text-left font-medium text-slate-500"
                    title={isGrouped ? col.cases.map((c) => c.documentTitle).join(', ') : undefined}
                  >
                    {col.label}
                    {isGrouped && (
                      <span className="ml-1 font-normal text-slate-400">
                        ({col.cases.length} case{col.cases.length === 1 ? '' : 's'})
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flatCodes.map(({ code, depth }) => (
                <tr key={code.id} className="hover:bg-slate-50">
                  <td
                    className="sticky left-0 z-10 border-b border-slate-100 bg-white p-2"
                    style={{ paddingLeft: `${depth * 14 + 8}px` }}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: code.color }}
                      />
                      <span className="truncate">{code.name}</span>
                    </span>
                  </td>
                  {columns.map((col) => {
                    const cell = matrix.get(`${code.id}:${col.key}`)
                    return (
                      <td key={col.key} className="border-b border-slate-100 p-2">
                        {cell ? (
                          <button
                            className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700 hover:bg-slate-200"
                            title={
                              isGrouped
                                ? `${cell.count} passage${cell.count === 1 ? '' : 's'} in ${cell.caseCount} of ${col.cases.length} case${col.cases.length === 1 ? '' : 's'} — see them side by side`
                                : 'See these passages side by side'
                            }
                            onClick={() => openContrastFor(code.id)}
                          >
                            {cell.count}
                            {isGrouped && (
                              <span className="ml-1 font-normal text-slate-400">
                                {cell.caseCount}/{col.cases.length}
                              </span>
                            )}
                          </button>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2 text-sm">
            <select
              className="rounded border border-slate-300 px-2 py-1"
              value={contrastCodeId}
              onChange={(e) => setContrastCodeId(e.target.value)}
            >
              <option value="">Choose a code/item…</option>
              {flatCodes.map(({ code, depth }) => (
                <option key={code.id} value={code.id}>
                  {'—'.repeat(depth)} {code.name} ({code.kind})
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {contrastCodeId === '' && (
              <p className="text-sm text-slate-400">
                Pick a code/item to see how every case addresses it, side by side.
              </p>
            )}
            {contrastCodeId !== '' && (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {columns.map((col) => {
                  const results = col.cases.flatMap((c) => contrastByCase.get(c.documentId) ?? [])
                  return (
                    <div key={col.key} className="w-72 flex-shrink-0 rounded border border-slate-200">
                      <div className="border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-600">
                        {col.label}
                        <span className="ml-1 font-normal text-slate-400">
                          ({results.length}
                          {isGrouped ? ` · ${col.cases.length} case${col.cases.length === 1 ? '' : 's'}` : ''})
                        </span>
                      </div>
                      <div className="max-h-[60vh] space-y-2 overflow-y-auto p-2">
                        {results.length === 0 && (
                          <p className="text-xs italic text-slate-400">
                            {isGrouped ? 'No instances in these cases.' : 'No instances in this case.'}
                          </p>
                        )}
                        {results.map((r) => (
                          <div key={r.codingId} className="rounded border border-slate-100 bg-white p-2 text-xs">
                            {isGrouped && <p className="mb-0.5 text-[10px] text-slate-400">{r.documentTitle}</p>}
                            <p className="italic text-slate-700">&ldquo;{r.segment.text}&rdquo;</p>
                            <button
                              className="mt-1 text-slate-400 hover:text-slate-600 hover:underline"
                              onClick={() => goToSegment(r.documentId, r.segment.start, r.segment.end, r.segment.text)}
                            >
                              Go to passage →
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ComparisonView
