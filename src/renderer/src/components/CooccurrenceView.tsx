import { useMemo, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import { flattenCodeTree } from '@shared/codeTree'
import { getCodeCooccurrenceMatrix, getCooccurringPassages } from '@shared/cooccurrence'
import { useRowWindow } from '../lib/useRowWindow'

/** Columns drawn beyond the visible ones, on each side, so a fast scroll
 * doesn't flash empty space. */
const OVERSCAN_COLUMNS = 8
/** Every count column is this wide (px), which is what lets the columns in
 * view be worked out from the scroll position alone. */
const COLUMN_WIDTH = 40

/** Codes × codes: how often two codes land on the same passage (overlapping
 * selections in the same document — see cooccurrence.ts). The diagonal is
 * each code's own passage count, the "n" its row reads against. Click a
 * cell to see the shared passages in a side panel.
 *
 * Only the rows and columns in view are rendered: a codebook of a few
 * hundred codes makes a table of 100,000+ cells, which took seconds to
 * draw and made every click and every scroll step re-render all of it. */
function CooccurrenceView(): JSX.Element | null {
  const data = useProjectStore((s) => s.data)
  const goToPassage = useWorkspaceUiStore((s) => s.goToPassage)

  const [includeDescendants, setIncludeDescendants] = useState(true)
  const [hideUnused, setHideUnused] = useState(true)
  const [selected, setSelected] = useState<{ a: string; b: string } | null>(null)

  // Counted in whole columns, like the rows in useRowWindow: scrolling
  // re-renders only when a new column comes into range.
  const [scrolledColumns, setScrolledColumns] = useState(0)

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

  const rows = useRowWindow(shownCodes.length)
  const firstColumn = Math.max(0, Math.min(scrolledColumns, shownCodes.length - 1) - OVERSCAN_COLUMNS)
  const lastColumn = Math.min(shownCodes.length, scrolledColumns + Math.ceil(rows.viewportWidth / COLUMN_WIDTH) + OVERSCAN_COLUMNS)
  const shownColumns = shownCodes.slice(firstColumn, lastColumn)
  const columnsBefore = firstColumn
  const columnsAfter = shownCodes.length - lastColumn
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

      <div className="flex flex-1 overflow-hidden">
        <div
          ref={rows.scrollRef}
          className="relative flex-1 overflow-auto p-4"
          onScroll={(e) => {
            rows.onScroll(e)
            setScrolledColumns(Math.floor(e.currentTarget.scrollLeft / COLUMN_WIDTH))
          }}
        >
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 border-b border-slate-200 bg-white p-2" />
                {columnsBefore > 0 && (
                  <th className="sticky top-0 z-10 border-b border-slate-200 bg-white p-0" aria-hidden>
                    <div style={{ width: columnsBefore * COLUMN_WIDTH }} />
                  </th>
                )}
                {shownColumns.map(({ code }) => (
                  <th
                    key={code.id}
                    className="sticky top-0 z-10 border-b border-slate-200 bg-white p-0 align-bottom font-medium text-slate-500"
                    style={{ width: COLUMN_WIDTH, minWidth: COLUMN_WIDTH, maxWidth: COLUMN_WIDTH }}
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
                {columnsAfter > 0 && (
                  <th className="sticky top-0 z-10 border-b border-slate-200 bg-white p-0" aria-hidden>
                    <div style={{ width: columnsAfter * COLUMN_WIDTH }} />
                  </th>
                )}
              </tr>
            </thead>
            <tbody ref={rows.bodyRef}>
              {rows.spacerBefore > 0 && <tr style={{ height: rows.spacerBefore }} aria-hidden />}
              {shownCodes.slice(rows.firstRow, rows.lastRow).map(({ code: row, depth }) => (
                <tr key={row.id} data-row className="hover:bg-slate-50">
                  <th
                    className="sticky left-0 z-10 border-b border-slate-100 bg-white p-2 text-left font-normal"
                    style={{ paddingLeft: `${depth * 14 + 8}px` }}
                    title={row.name}
                  >
                    {/* A fixed width: with rows drawn on demand, a column as
                        wide as its widest visible name would jump around
                        while scrolling. */}
                    <span className="flex w-64 items-center gap-1.5">
                      <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                      <span className="truncate">{row.name}</span>
                    </span>
                  </th>
                  {columnsBefore > 0 && <td className="p-0" aria-hidden />}
                  {shownColumns.map(({ code: col }) => {
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
                            className={`h-8 w-full px-0.5 font-medium hover:outline hover:outline-2 hover:outline-slate-400 ${
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
                  {columnsAfter > 0 && <td className="p-0" aria-hidden />}
                </tr>
              ))}
              {rows.spacerAfter > 0 && <tr style={{ height: rows.spacerAfter }} aria-hidden />}
            </tbody>
          </table>
        </div>

        {selected && selectedA && selectedB && (
          <aside className="w-96 flex-shrink-0 overflow-auto border-l border-slate-200 p-4">
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
          </aside>
        )}
      </div>
    </div>
  )
}

export default CooccurrenceView
