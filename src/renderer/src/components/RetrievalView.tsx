import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import { flattenCodeTree } from '@shared/codeTree'
import { EMPTY_PASSAGE_QUERY, getDescendantCodeIds, queryPassages, retrieveNotes } from '@shared/retrieval'
import type { PassageQuery } from '@shared/retrieval'
import { describeNoteAttachment } from '@shared/notesOps'
import { getAttributeNames, getAttributeValues } from '@shared/documentOps'
import { buildPassageSheet, buildQuerySheet } from '@shared/spreadsheet'
import type { CodeNode } from '@shared/types'

/** Passages rendered at once; more on demand, so a project with thousands
 * of codings doesn't stall the view. */
const PAGE_SIZE = 200

/** Where the passage list was when the view was last left (it unmounts on
 * a tab change), so "Go to passage" and back lands on the same spot —
 * valid only for the same project and the same query. */
const lastPassageList = { projectId: '', query: null as PassageQuery | null, visibleCount: PAGE_SIZE, scrollTop: 0 }

function FilterRow({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-20 flex-shrink-0 text-xs font-medium text-slate-500">{label}</span>
      {children}
    </div>
  )
}

function Chip({ children, onRemove }: { children: ReactNode; onRemove: () => void }): JSX.Element {
  return (
    <span className="flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2 pr-1 text-xs text-slate-700">
      {children}
      <button className="text-slate-400 hover:text-slate-700" title="Remove" onClick={onRemove}>
        ×
      </button>
    </span>
  )
}

function CodeChip({ code, onRemove }: { code: CodeNode | undefined; onRemove: () => void }): JSX.Element {
  return (
    <Chip onRemove={onRemove}>
      <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: code?.color ?? '#999' }} />
      {code?.name ?? '(deleted code)'}
    </Chip>
  )
}

/** A dropdown that adds a code to a filter and resets itself. */
function CodeAdder({
  flatCodes,
  taken,
  placeholder,
  onAdd
}: {
  flatCodes: { code: CodeNode; depth: number }[]
  taken: string[]
  placeholder: string
  onAdd: (codeId: string) => void
}): JSX.Element {
  return (
    <select
      className="rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-500"
      value=""
      onChange={(e) => e.target.value && onAdd(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {flatCodes
        .filter(({ code }) => !taken.includes(code.id))
        .map(({ code, depth }) => (
          <option key={code.id} value={code.id}>
            {'—'.repeat(depth)} {code.name}
            {code.kind === 'item' ? ' (item)' : ''}
          </option>
        ))}
    </select>
  )
}

function RetrievalView(): JSX.Element | null {
  const data = useProjectStore((s) => s.data)
  const setMainView = useWorkspaceUiStore((s) => s.setMainView)
  const setSelectedDocumentId = useWorkspaceUiStore((s) => s.setSelectedDocumentId)
  const setActiveSpan = useWorkspaceUiStore((s) => s.setActiveSpan)
  const setActiveSidebarTab = useWorkspaceUiStore((s) => s.setActiveSidebarTab)

  const mode = useWorkspaceUiStore((s) => s.retrievalMode)
  const setMode = useWorkspaceUiStore((s) => s.setRetrievalMode)
  const storedQuery = useWorkspaceUiStore((s) => s.passageQuery)
  const setQuery = useWorkspaceUiStore((s) => s.setPassageQuery)
  const noteFilters = useWorkspaceUiStore((s) => s.noteFilters)
  const setNoteFilters = useWorkspaceUiStore((s) => s.setNoteFilters)
  const sameListAsBefore = lastPassageList.projectId === data?.id && lastPassageList.query === storedQuery
  const [visibleCount, setVisibleCount] = useState(sameListAsBefore ? lastPassageList.visibleCount : PAGE_SIZE)
  const passageListRef = useRef<HTMLDivElement>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState<string | null>(null)

  // Kept filters may name a code, document, attribute or note category
  // deleted since: those are dropped rather than silently matching nothing.
  const query = useMemo<PassageQuery>(() => {
    if (!data) return storedQuery
    const codeIds = new Set(data.codes.map((c) => c.id))
    const documentIds = new Set(data.documents.map((d) => d.id))
    const attributeNames = new Set(getAttributeNames(data))
    return {
      ...storedQuery,
      codeIds: storedQuery.codeIds.filter((id) => codeIds.has(id)),
      excludeCodeIds: storedQuery.excludeCodeIds.filter((id) => codeIds.has(id)),
      documentIds: storedQuery.documentIds.filter((id) => documentIds.has(id)),
      attributes: Object.fromEntries(Object.entries(storedQuery.attributes).filter(([name]) => attributeNames.has(name)))
    }
  }, [data, storedQuery])
  const update = (patch: Partial<PassageQuery>): void => setQuery({ ...query, ...patch })

  const noteCategoryFilter =
    noteFilters.categoryId === 'all' ||
    noteFilters.categoryId === 'uncategorized' ||
    data?.noteCategories.some((c) => c.id === noteFilters.categoryId)
      ? noteFilters.categoryId
      : 'all'
  const tagFilter = noteFilters.tag
  const hasQuestionOnly = noteFilters.hasQuestionOnly
  const setNoteCategoryFilter = (categoryId: string): void => setNoteFilters({ ...noteFilters, categoryId })
  const setTagFilter = (tag: string): void => setNoteFilters({ ...noteFilters, tag })
  const setHasQuestionOnly = (hasQuestionOnly: boolean): void => setNoteFilters({ ...noteFilters, hasQuestionOnly })

  const flatCodes = useMemo(() => (data ? flattenCodeTree(data.codes) : []), [data])
  const codeById = useMemo(() => new Map((data?.codes ?? []).map((c) => [c.id, c])), [data])
  const attributeNames = useMemo(() => (data ? getAttributeNames(data) : []), [data])

  const codeResults = useMemo(() => (data ? queryPassages(data, query) : []), [data, query])
  const resultDocumentCount = useMemo(() => new Set(codeResults.map((r) => r.documentId)).size, [codeResults])
  /** The codes asked for (with their sub-codes when those count), to set
   * them apart from the other codes shown on each passage. */
  const chosenCodeIds = useMemo(() => {
    const ids = new Set(query.codeIds)
    if (data && query.includeDescendants) {
      for (const id of query.codeIds) for (const d of getDescendantCodeIds(data.codes, id)) ids.add(d)
    }
    return ids
  }, [data, query.codeIds, query.includeDescendants])
  const isEmptyQuery = JSON.stringify(query) === JSON.stringify(EMPTY_PASSAGE_QUERY)

  // A new query starts at the top; coming back to the same one doesn't.
  useEffect(() => {
    if (lastPassageList.projectId === data?.id && lastPassageList.query === storedQuery) return
    lastPassageList.projectId = data?.id ?? ''
    lastPassageList.query = storedQuery
    lastPassageList.scrollTop = 0
    setVisibleCount(PAGE_SIZE)
    setExportStatus(null)
    passageListRef.current?.scrollTo({ top: 0 })
  }, [data?.id, storedQuery])
  useEffect(() => {
    lastPassageList.visibleCount = visibleCount
  }, [visibleCount])
  useLayoutEffect(() => {
    if (mode === 'codes' && passageListRef.current) passageListRef.current.scrollTop = lastPassageList.scrollTop
  }, [mode])

  const noteResults = useMemo(() => {
    if (!data) return []
    return retrieveNotes(data, {
      noteCategoryId:
        noteCategoryFilter === 'all' ? undefined : noteCategoryFilter === 'uncategorized' ? null : noteCategoryFilter,
      tag: tagFilter.trim() || undefined,
      hasQuestion: hasQuestionOnly ? true : undefined
    })
  }, [data, noteCategoryFilter, tagFilter, hasQuestionOnly])

  function goToSegment(documentId: string, start: number, end: number, text: string, tab: 'codes' | 'notes'): void {
    setSelectedDocumentId(documentId)
    setActiveSpan({ documentId, start, end, text })
    setActiveSidebarTab(tab)
    setMainView('workspace')
  }

  async function exportToExcel(): Promise<void> {
    if (!data) return
    setIsExporting(true)
    try {
      const sheets = [
        buildPassageSheet(data, codeResults),
        buildQuerySheet(data, query, codeResults.length, new Date().toLocaleString())
      ]
      const path = await window.api.export.spreadsheet(sheets, `${data.name} — passages`)
      setExportStatus(path ? `Exported ${codeResults.length} passage${codeResults.length === 1 ? '' : 's'} to ${path}` : null)
    } catch (e) {
      setExportStatus(`Could not export: ${(e as Error).message}`)
    } finally {
      setIsExporting(false)
    }
  }

  if (!data) return null

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex gap-4 border-b border-slate-200 px-4 py-2 text-sm">
        <button
          className={mode === 'codes' ? 'font-semibold text-slate-900' : 'text-slate-400 hover:text-slate-600'}
          onClick={() => setMode('codes')}
        >
          By code / item
        </button>
        <button
          className={mode === 'notes' ? 'font-semibold text-slate-900' : 'text-slate-400 hover:text-slate-600'}
          onClick={() => setMode('notes')}
        >
          By note
        </button>
      </div>

      {mode === 'codes' ? (
        <>
          <div className="space-y-2 border-b border-slate-200 px-4 py-2 text-sm">
            <FilterRow label="Codes">
              {query.codeIds.map((id, i) => (
                <span key={id} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <span className="text-[11px] font-semibold uppercase text-slate-400">
                      {query.match === 'all' ? 'and' : 'or'}
                    </span>
                  )}
                  <CodeChip code={codeById.get(id)} onRemove={() => update({ codeIds: query.codeIds.filter((c) => c !== id) })} />
                </span>
              ))}
              <CodeAdder
                flatCodes={flatCodes}
                taken={query.codeIds}
                placeholder={query.codeIds.length ? '+ code' : 'Every coded passage — pick a code…'}
                onAdd={(id) => update({ codeIds: [...query.codeIds, id] })}
              />
              {query.codeIds.length >= 2 && (
                <span className="ml-1 flex overflow-hidden rounded border border-slate-300 text-xs">
                  {(['any', 'all'] as const).map((m) => (
                    <button
                      key={m}
                      className={`px-2 py-0.5 ${query.match === m ? 'bg-slate-700 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                      title={
                        m === 'any'
                          ? 'Passages carrying at least one of these codes'
                          : 'Passages where all these codes meet: on the passage itself or on an overlapping one'
                      }
                      onClick={() => update({ match: m })}
                    >
                      {m === 'any' ? 'Any (OR)' : 'All (AND)'}
                    </button>
                  ))}
                </span>
              )}
            </FilterRow>
            <FilterRow label="Except">
              {query.excludeCodeIds.map((id) => (
                <CodeChip
                  key={id}
                  code={codeById.get(id)}
                  onRemove={() => update({ excludeCodeIds: query.excludeCodeIds.filter((c) => c !== id) })}
                />
              ))}
              <CodeAdder
                flatCodes={flatCodes}
                taken={query.excludeCodeIds}
                placeholder={query.excludeCodeIds.length ? '+ code' : 'Leave out passages where a code meets…'}
                onAdd={(id) => update({ excludeCodeIds: [...query.excludeCodeIds, id] })}
              />
            </FilterRow>
            <FilterRow label="Documents">
              {query.documentIds.map((id) => (
                <Chip key={id} onRemove={() => update({ documentIds: query.documentIds.filter((d) => d !== id) })}>
                  {data.documents.find((d) => d.id === id)?.title ?? '(deleted document)'}
                </Chip>
              ))}
              <select
                className="rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-500"
                value=""
                onChange={(e) => e.target.value && update({ documentIds: [...query.documentIds, e.target.value] })}
              >
                <option value="">{query.documentIds.length ? '+ document' : 'All documents — pick some…'}</option>
                {data.documents
                  .filter((d) => !query.documentIds.includes(d.id))
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
              </select>
            </FilterRow>
            {attributeNames.length > 0 && (
              <FilterRow label="Cases">
                {Object.keys(query.attributes).map((name) => (
                  <span key={name} className="flex flex-wrap items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 text-xs">
                    <span className="font-medium text-slate-600">{name}:</span>
                    {getAttributeValues(data, name).map((value) => {
                      const on = query.attributes[name].includes(value)
                      return (
                        <button
                          key={value}
                          className={`rounded px-1.5 ${on ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                          onClick={() =>
                            update({
                              attributes: {
                                ...query.attributes,
                                [name]: on ? query.attributes[name].filter((v) => v !== value) : [...query.attributes[name], value]
                              }
                            })
                          }
                        >
                          {value}
                        </button>
                      )
                    })}
                    <button
                      className="ml-0.5 text-slate-400 hover:text-slate-700"
                      title="Remove this filter"
                      onClick={() => update({ attributes: Object.fromEntries(Object.entries(query.attributes).filter(([n]) => n !== name)) })}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {attributeNames.some((name) => !(name in query.attributes)) && (
                  <select
                    className="rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-500"
                    value=""
                    onChange={(e) => e.target.value && update({ attributes: { ...query.attributes, [e.target.value]: [] } })}
                  >
                    <option value="">
                      {Object.keys(query.attributes).length ? '+ attribute' : 'All cases — filter by an attribute…'}
                    </option>
                    {attributeNames
                      .filter((name) => !(name in query.attributes))
                      .map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                  </select>
                )}
              </FilterRow>
            )}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <label className="flex items-center gap-1 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={query.includeDescendants}
                  onChange={(e) => update({ includeDescendants: e.target.checked })}
                />
                Include sub-codes
              </label>
              <span className="text-xs text-slate-400">
                {codeResults.length} passage{codeResults.length === 1 ? '' : 's'}
                {codeResults.length > 0 && ` in ${resultDocumentCount} document${resultDocumentCount === 1 ? '' : 's'}`}
              </span>
              <span className="flex-1" />
              {!isEmptyQuery && (
                <button className="text-xs text-slate-500 hover:underline" onClick={() => setQuery(EMPTY_PASSAGE_QUERY)}>
                  Clear filters
                </button>
              )}
              <button
                className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-40"
                disabled={codeResults.length === 0 || isExporting}
                title="One row per passage listed here, with its document, case attributes, codes, clusters and notes"
                onClick={() => void exportToExcel()}
              >
                {isExporting ? 'Exporting…' : 'Export to Excel (.xlsx)'}
              </button>
            </div>
            {exportStatus && <p className="text-xs text-slate-500">{exportStatus}</p>}
          </div>
          <div
            ref={passageListRef}
            className="flex-1 overflow-auto p-4"
            onScroll={(e) => {
              lastPassageList.scrollTop = e.currentTarget.scrollTop
            }}
          >
            {codeResults.length === 0 && (
              <p className="text-sm text-slate-400">
                {data.codings.length === 0 ? 'Nothing is coded yet.' : 'No passage matches these filters.'}
              </p>
            )}
            <ul className="space-y-2">
              {codeResults.slice(0, visibleCount).map((r) => (
                <li key={r.segment.id} className="rounded border border-slate-200 p-3 text-sm">
                  <div className="mb-1 flex items-start justify-between gap-2 text-xs text-slate-400">
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="truncate font-medium text-slate-500">{r.documentTitle}</span>
                      {r.codeIds.map((id) => {
                        const code = codeById.get(id)
                        return (
                          <span
                            key={id}
                            className={`flex items-center gap-1 rounded-full px-1.5 py-px ${
                              chosenCodeIds.has(id) ? 'bg-slate-100 text-slate-700' : 'text-slate-400'
                            }`}
                          >
                            <span
                              className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                              style={{ backgroundColor: code?.color ?? '#999' }}
                            />
                            {code?.name ?? '?'}
                          </span>
                        )
                      })}
                    </span>
                    <button
                      className="flex-shrink-0 text-slate-500 hover:underline"
                      onClick={() => goToSegment(r.documentId, r.segment.start, r.segment.end, r.segment.text, 'codes')}
                    >
                      Go to passage →
                    </button>
                  </div>
                  <p className="italic text-slate-700">&ldquo;{r.segment.text}&rdquo;</p>
                </li>
              ))}
            </ul>
            {codeResults.length > visibleCount && (
              <button className="mt-3 text-sm text-slate-500 hover:underline" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
                Show {Math.min(PAGE_SIZE, codeResults.length - visibleCount)} more ({codeResults.length - visibleCount} not shown)
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-2 text-sm">
            <select
              className="rounded border border-slate-300 px-2 py-1 text-xs"
              value={noteCategoryFilter}
              onChange={(e) => setNoteCategoryFilter(e.target.value)}
            >
              <option value="all">All categories</option>
              <option value="uncategorized">Uncategorized</option>
              {data.noteCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              className="rounded border border-slate-300 px-2 py-1 text-xs"
              placeholder="Filter by tag…"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
            />
            <label className="flex items-center gap-1 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={hasQuestionOnly}
                onChange={(e) => setHasQuestionOnly(e.target.checked)}
              />
              Has an analytic question
            </label>
            <span className="text-xs text-slate-400">
              {noteResults.length} result{noteResults.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {noteResults.length === 0 && <p className="text-sm text-slate-400">No notes match these filters.</p>}
            <ul className="space-y-2">
              {noteResults.map((note) => {
                const description = describeNoteAttachment(data, note)
                const category = data.noteCategories.find((c) => c.id === note.noteCategoryId)
                const attachedTo = note.attachedTo
                return (
                  <li key={note.id} className="rounded border border-slate-200 p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-400">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate">{description.label}</span>
                        {category && (
                          <span
                            className="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                            style={{ backgroundColor: category.color }}
                          >
                            {category.name}
                          </span>
                        )}
                      </span>
                      {attachedTo.kind === 'segment' && (
                        <button
                          className="flex-shrink-0 text-slate-500 hover:underline"
                          onClick={() => {
                            const segment = data.segments.find((s) => s.id === attachedTo.segmentId)
                            if (segment) {
                              goToSegment(segment.documentId, segment.start, segment.end, segment.text, 'notes')
                            }
                          }}
                        >
                          Go to passage →
                        </button>
                      )}
                    </div>
                    {description.quote && (
                      <p className="mb-1 italic text-slate-500">&ldquo;{description.quote}&rdquo;</p>
                    )}
                    {note.question && <p className="mb-1 font-medium text-slate-700">Q: {note.question}</p>}
                    <p className="whitespace-pre-wrap text-slate-700">{note.answer}</p>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

export default RetrievalView
