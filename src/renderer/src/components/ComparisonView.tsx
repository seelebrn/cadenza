import { useMemo, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import { flattenCodeTree } from '@shared/codeTree'
import { getCases, getCodeCaseMatrix } from '@shared/comparison'
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
 *    cases with none, since absence across cases is itself meaningful. */
function ComparisonView(): JSX.Element | null {
  const data = useProjectStore((s) => s.data)
  const setMainView = useWorkspaceUiStore((s) => s.setMainView)
  const setSelectedDocumentId = useWorkspaceUiStore((s) => s.setSelectedDocumentId)
  const setActiveSpan = useWorkspaceUiStore((s) => s.setActiveSpan)
  const setActiveSidebarTab = useWorkspaceUiStore((s) => s.setActiveSidebarTab)

  const [mode, setMode] = useState<'matrix' | 'contrast'>('matrix')
  const [includeDescendants, setIncludeDescendants] = useState(true)
  const [contrastCodeId, setContrastCodeId] = useState('')

  const flatCodes = useMemo(() => (data ? flattenCodeTree(data.codes) : []), [data])
  const cases = useMemo(() => (data ? getCases(data) : []), [data])

  const matrix = useMemo(() => {
    const map = new Map<string, number>()
    if (!data) return map
    const cells = getCodeCaseMatrix(
      data,
      flatCodes.map((f) => f.code.id),
      includeDescendants
    )
    for (const cell of cells) map.set(`${cell.codeId}:${cell.documentId}`, cell.count)
    return map
  }, [data, flatCodes, includeDescendants])

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
    setSelectedDocumentId(documentId)
    setActiveSpan({ documentId, start, end, text })
    setActiveSidebarTab('codes')
    setMainView('workspace')
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
      <div className="flex items-center gap-4 border-b border-slate-200 px-4 py-2 text-sm">
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
        <label className="ml-auto flex items-center gap-1 text-xs text-slate-500">
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
            How many coded passages each code/item has in each case (document). Click a cell to see the actual
            quotes side by side.
          </p>
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-slate-200 bg-white p-2 text-left font-medium text-slate-500">
                  Code / item
                </th>
                {cases.map((c) => (
                  <th
                    key={c.documentId}
                    className="whitespace-nowrap border-b border-slate-200 p-2 text-left font-medium text-slate-500"
                  >
                    {c.documentTitle}
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
                  {cases.map((c) => {
                    const count = matrix.get(`${code.id}:${c.documentId}`) ?? 0
                    return (
                      <td key={c.documentId} className="border-b border-slate-100 p-2">
                        {count > 0 ? (
                          <button
                            className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700 hover:bg-slate-200"
                            title="See these passages side by side"
                            onClick={() => openContrastFor(code.id)}
                          >
                            {count}
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
                {cases.map((c) => {
                  const results = contrastByCase.get(c.documentId) ?? []
                  return (
                    <div key={c.documentId} className="w-72 flex-shrink-0 rounded border border-slate-200">
                      <div className="border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-600">
                        {c.documentTitle}
                        <span className="ml-1 font-normal text-slate-400">({results.length})</span>
                      </div>
                      <div className="max-h-[60vh] space-y-2 overflow-y-auto p-2">
                        {results.length === 0 && (
                          <p className="text-xs italic text-slate-400">No instances in this case.</p>
                        )}
                        {results.map((r) => (
                          <div key={r.codingId} className="rounded border border-slate-100 bg-white p-2 text-xs">
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
