import { useMemo, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import { flattenCodeTree } from '@shared/codeTree'
import { getCodeCooccurrenceMatrix, getCooccurringPassages } from '@shared/cooccurrence'

/** Codes × codes: how often two codes land on the same passage (overlapping
 * selections in the same document — see cooccurrence.ts). The diagonal is
 * each code's own passage count, the "n" its row reads against. Click a
 * cell to see the shared passages underneath. */
function CooccurrenceView(): JSX.Element | null {
  const data = useProjectStore((s) => s.data)
  const goToPassage = useWorkspaceUiStore((s) => s.goToPassage)

  const [includeDescendants, setIncludeDescendants] = useState(true)
  const [hideUnused, setHideUnused] = useState(true)
  const [selected, setSelected] = useState<{ a: string; b: string } | null>(null)

  const flatCodes = useMemo(() => (data ? flattenCodeTree(data.codes) : []), [data])
  const codeById = useMemo(() => new Map((data?.codes ?? []).map((c) => [c.id, c])), [data])

  const cells = useMemo(() => {
    if (!data) return new Map<string, { count: number; documentCount: number }>()
    const map = new Map<string, { count: number; documentCount: number }>()
    for (const cell of getCodeCooccurrenceMatrix(data, flatCodes.map((f) => f.code.id), includeDescendants)) {
      map.set(`${cell.codeA}|${cell.codeB}`, { count: cell.count, documentCount: cell.documentCount })
    }
    return map
  }, [data, flatCodes, includeDescendants])

  function cellFor(a: string, b: string): { count: number; documentCount: number } | undefined {
    const [x, y] = a < b ? [a, b] : [b, a]
    return cells.get(`${x}|${y}`)
  }

  const shownCodes = useMemo(
    () => (hideUnused ? flatCodes.filter((f) => cellFor(f.code.id, f.code.id) !== undefined) : flatCodes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flatCodes, cells, hideUnused]
  )
  const maxOffDiagonal = useMemo(() => {
    let max = 0
    for (const [key, cell] of cells) {
      const [a, b] = key.split('|')
      if (a !== b) max = Math.max(max, cell.count)
    }
    return max
  }, [cells])

  const passages = useMemo(() => {
    if (!data || !selected) return []
    return getCooccurringPassages(data, selected.a, selected.b, includeDescendants)
  }, [data, selected, includeDescendants])

  function goToSpan(documentId: string, start: number, end: number, text: string): void {
    goToPassage({ documentId, start, end, text })
  }

  if (!data) return null
  if (flatCodes.length === 0 || data.codings.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-400">
        Code some passages first — co-occurrence shows which codes land on the same passages.
      </div>
    )
  }

  const selectedA = selected && codeById.get(selected.a)
  const selectedB = selected && codeById.get(selected.b)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 px-4 py-2 text-sm">
        <span className="text-xs text-slate-400">
          How often two codes/items are on the same passage (overlapping selections). The diagonal is each
          code's own passage count. Click a cell to see the shared passages.
        </span>
        <label className="ml-auto flex items-center gap-1 text-xs text-slate-500">
          <input type="checkbox" checked={hideUnused} onChange={(e) => setHideUnused(e.target.checked)} />
          Hide codes never applied
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

      <div className="flex-1 overflow-auto p-4">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 border-b border-slate-200 bg-white p-2" />
              {shownCodes.map(({ code }) => (
                <th
                  key={code.id}
                  className="sticky top-0 z-10 border-b border-slate-200 bg-white p-1 align-bottom font-medium text-slate-500"
                  title={code.name}
                >
                  <div className="flex h-28 items-end justify-center">
                    <span
                      className="block max-h-28 truncate"
                      style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                    >
                      {code.name}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shownCodes.map(({ code: row, depth }) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <th
                  className="sticky left-0 z-10 whitespace-nowrap border-b border-slate-100 bg-white p-2 text-left font-normal"
                  style={{ paddingLeft: `${depth * 14 + 8}px` }}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                    {row.name}
                  </span>
                </th>
                {shownCodes.map(({ code: col }) => {
                  const cell = cellFor(row.id, col.id)
                  const isDiagonal = row.id === col.id
                  const isSelected =
                    selected !== null &&
                    ((selected.a === row.id && selected.b === col.id) || (selected.a === col.id && selected.b === row.id))
                  const intensity = cell && !isDiagonal && maxOffDiagonal > 0 ? cell.count / maxOffDiagonal : 0
                  return (
                    <td
                      key={col.id}
                      className={`border-b border-slate-100 p-0 text-center ${isDiagonal ? 'bg-slate-50' : ''}`}
                    >
                      {cell ? (
                        <button
                          className={`h-8 w-full min-w-[2.5rem] px-1 font-medium hover:outline hover:outline-2 hover:outline-slate-400 ${
                            isSelected ? 'outline outline-2 outline-slate-900' : ''
                          } ${isDiagonal ? 'text-slate-400' : 'text-slate-800'}`}
                          style={isDiagonal ? undefined : { backgroundColor: `rgba(217, 119, 6, ${0.12 + intensity * 0.55})` }}
                          title={
                            isDiagonal
                              ? `${cell.count} passage${cell.count === 1 ? '' : 's'} coded “${row.name}” in ${cell.documentCount} document${cell.documentCount === 1 ? '' : 's'}`
                              : `“${row.name}” and “${col.name}” share ${cell.count} passage${cell.count === 1 ? '' : 's'} in ${cell.documentCount} document${cell.documentCount === 1 ? '' : 's'}`
                          }
                          onClick={() => setSelected({ a: row.id, b: col.id })}
                        >
                          {cell.count}
                        </button>
                      ) : (
                        <span className="text-slate-200">·</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {selected && selectedA && selectedB && (
          <section className="mt-6">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">
              {selectedA.id === selectedB.id ? (
                <>Passages coded “{selectedA.name}”</>
              ) : (
                <>
                  Passages coded both “{selectedA.name}” and “{selectedB.name}”
                </>
              )}
              <span className="ml-2 font-normal text-slate-400">({passages.length})</span>
              <button className="ml-3 text-xs font-normal text-slate-400 hover:underline" onClick={() => setSelected(null)}>
                close
              </button>
            </h3>
            <ul className="space-y-2">
              {passages.map((p, i) => (
                <li key={`${p.segmentA.id}|${p.segmentB.id}|${i}`} className="rounded border border-slate-200 p-3 text-sm">
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-400">
                    <span className="truncate">{p.documentTitle}</span>
                    <button
                      className="flex-shrink-0 text-slate-500 hover:underline"
                      onClick={() => goToSpan(p.documentId, p.overlap.start, p.overlap.end, p.overlap.text)}
                    >
                      Go to passage →
                    </button>
                  </div>
                  <p className="italic text-slate-700">&ldquo;{p.overlap.text}&rdquo;</p>
                  {selectedA.id !== selectedB.id && (p.segmentA.text !== p.overlap.text || p.segmentB.text !== p.overlap.text) && (
                    <p className="mt-1 text-[11px] text-slate-400">
                      Shared part of two selections: “{selectedA.name}” on “{p.segmentA.text}”, “{selectedB.name}” on “{p.segmentB.text}”.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

export default CooccurrenceView
