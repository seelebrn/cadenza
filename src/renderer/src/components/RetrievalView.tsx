import { useMemo, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import { flattenCodeTree } from '@shared/codeTree'
import { retrieveByCode, retrieveNotes } from '@shared/retrieval'
import { describeNoteAttachment } from '@shared/notesOps'

function RetrievalView(): JSX.Element | null {
  const data = useProjectStore((s) => s.data)
  const setMainView = useWorkspaceUiStore((s) => s.setMainView)
  const setSelectedDocumentId = useWorkspaceUiStore((s) => s.setSelectedDocumentId)
  const setActiveSpan = useWorkspaceUiStore((s) => s.setActiveSpan)
  const setActiveSidebarTab = useWorkspaceUiStore((s) => s.setActiveSidebarTab)

  const [mode, setMode] = useState<'codes' | 'notes'>('codes')
  const [selectedCodeId, setSelectedCodeId] = useState('')
  const [includeDescendants, setIncludeDescendants] = useState(true)
  const [noteCategoryFilter, setNoteCategoryFilter] = useState<string>('all')
  const [tagFilter, setTagFilter] = useState('')
  const [hasQuestionOnly, setHasQuestionOnly] = useState(false)

  const flatCodes = useMemo(() => (data ? flattenCodeTree(data.codes) : []), [data])
  const codeById = useMemo(() => new Map((data?.codes ?? []).map((c) => [c.id, c])), [data])

  const codeResults = useMemo(() => {
    if (!data || !selectedCodeId) return []
    return retrieveByCode(data, selectedCodeId, { includeDescendants })
  }, [data, selectedCodeId, includeDescendants])

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
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-2 text-sm">
            <select
              className="rounded border border-slate-300 px-2 py-1"
              value={selectedCodeId}
              onChange={(e) => setSelectedCodeId(e.target.value)}
            >
              <option value="">Choose a code/item…</option>
              {flatCodes.map(({ code, depth }) => (
                <option key={code.id} value={code.id}>
                  {'—'.repeat(depth)} {code.name} ({code.kind})
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={includeDescendants}
                onChange={(e) => setIncludeDescendants(e.target.checked)}
              />
              Include sub-codes
            </label>
            <span className="text-xs text-slate-400">
              {codeResults.length} result{codeResults.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {selectedCodeId === '' && (
              <p className="text-sm text-slate-400">Pick a code/item to see every passage coded with it.</p>
            )}
            {selectedCodeId !== '' && codeResults.length === 0 && (
              <p className="text-sm text-slate-400">No segments coded with this yet.</p>
            )}
            <ul className="space-y-2">
              {codeResults.map((r) => {
                const code = codeById.get(r.codeId)
                return (
                  <li key={r.codingId} className="rounded border border-slate-200 p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-400">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: code?.color ?? '#999' }}
                        />
                        <span className="truncate">{r.documentTitle}</span>
                        {code && code.id !== selectedCodeId && (
                          <span className="flex-shrink-0 italic">(via {code.name})</span>
                        )}
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
                )
              })}
            </ul>
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
