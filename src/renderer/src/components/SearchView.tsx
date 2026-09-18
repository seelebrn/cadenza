import { useMemo, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import { flattenCodeTree } from '@shared/codeTree'
import { searchDocuments, type SearchHit } from '@shared/search'

/** Full-text search across every document, with each hit shown in context.
 * From a hit: jump to it in the reader (it becomes the active span, ready
 * for codes/notes), or code the sentence it sits in right here — one hit,
 * or all of them at once ("auto-coding"). */
function SearchView(): JSX.Element | null {
  const data = useProjectStore((s) => s.data)
  const applyCodeToSelection = useProjectStore((s) => s.applyCodeToSelection)
  const withBatch = useProjectStore((s) => s.withBatch)
  const goToPassage = useWorkspaceUiStore((s) => s.goToPassage)

  const [query, setQuery] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [ignoreAccents, setIgnoreAccents] = useState(true)
  const [documentFilter, setDocumentFilter] = useState('all')
  const [codeId, setCodeId] = useState('')

  const flatCodes = useMemo(() => (data ? flattenCodeTree(data.codes) : []), [data])
  const codeById = useMemo(() => new Map((data?.codes ?? []).map((c) => [c.id, c])), [data])

  const hits = useMemo(() => {
    if (!data || !query.trim()) return []
    return searchDocuments(data, query, {
      matchCase,
      wholeWord,
      ignoreAccents,
      documentIds: documentFilter === 'all' ? undefined : [documentFilter]
    })
  }, [data, query, matchCase, wholeWord, ignoreAccents, documentFilter])

  const hitsByDocument = useMemo(() => {
    const groups = new Map<string, { title: string; hits: SearchHit[] }>()
    for (const hit of hits) {
      const group = groups.get(hit.documentId) ?? { title: hit.documentTitle, hits: [] }
      group.hits.push(hit)
      groups.set(hit.documentId, group)
    }
    return [...groups.entries()]
  }, [hits])

  function goToHit(hit: SearchHit): void {
    goToPassage({ documentId: hit.documentId, start: hit.start, end: hit.end, text: hit.match })
  }

  function codeSentence(hit: SearchHit): void {
    if (!codeId) return
    applyCodeToSelection(hit.documentId, hit.sentence.start, hit.sentence.end, hit.sentence.text, codeId)
  }

  function codeAllSentences(): void {
    if (!codeId) return
    withBatch(() => {
      for (const hit of hits) codeSentence(hit)
    })
  }

  if (!data) return null
  const selectedCode = codeById.get(codeId)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-2 text-sm">
        <input
          autoFocus
          className="w-72 rounded border border-slate-300 px-2 py-1"
          placeholder="Search every document…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="flex items-center gap-1 text-xs text-slate-500">
          <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
          Match case
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} />
          Whole word
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-500" title='"reunion" also finds "réunion"'>
          <input type="checkbox" checked={ignoreAccents} onChange={(e) => setIgnoreAccents(e.target.checked)} />
          Ignore accents
        </label>
        <select
          className="rounded border border-slate-300 px-2 py-1 text-xs"
          value={documentFilter}
          onChange={(e) => setDocumentFilter(e.target.value)}
        >
          <option value="all">All documents</option>
          {data.documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
        {query.trim() && (
          <span className="text-xs text-slate-400">
            {hits.length} hit{hits.length === 1 ? '' : 's'} in {hitsByDocument.length} document
            {hitsByDocument.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {hits.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs">
          <span className="text-slate-500">Code the sentence around a hit with</span>
          <select
            className="rounded border border-slate-300 px-2 py-1"
            value={codeId}
            onChange={(e) => setCodeId(e.target.value)}
          >
            <option value="">Choose a code/item…</option>
            {flatCodes.map(({ code, depth }) => (
              <option key={code.id} value={code.id}>
                {'—'.repeat(depth)} {code.name} ({code.kind})
              </option>
            ))}
          </select>
          <button
            className="rounded border border-slate-300 bg-white px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
            disabled={!codeId}
            title="Applies the code to every hit's sentence at once — one undo step"
            onClick={codeAllSentences}
          >
            Code all {hits.length} sentence{hits.length === 1 ? '' : 's'}
            {selectedCode ? ` with “${selectedCode.name}”` : ''}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        {!query.trim() && (
          <p className="text-sm text-slate-400">
            Type a word or phrase to find every place it occurs across your documents.
          </p>
        )}
        {query.trim() && hits.length === 0 && <p className="text-sm text-slate-400">No matches.</p>}
        <div className="space-y-4">
          {hitsByDocument.map(([documentId, group]) => (
            <section key={documentId}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {group.title} <span className="font-normal text-slate-400">· {group.hits.length}</span>
              </h3>
              <ul className="space-y-1">
                {group.hits.map((hit) => (
                  <li
                    key={`${hit.documentId}:${hit.start}`}
                    className="flex items-start justify-between gap-3 rounded border border-slate-200 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-slate-700">
                        {hit.beforeClipped && '…'}
                        {hit.before}
                        <mark className="rounded-sm bg-amber-200 px-0.5">{hit.match}</mark>
                        {hit.after}
                        {hit.afterClipped && '…'}
                      </p>
                      {hit.codeIds.length > 0 && (
                        <p className="mt-1 flex flex-wrap gap-1">
                          {hit.codeIds.map((id) => {
                            const code = codeById.get(id)
                            return (
                              <span
                                key={id}
                                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                                style={{ backgroundColor: code?.color ?? '#999' }}
                              >
                                {code?.name ?? id}
                              </span>
                            )
                          })}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-1 text-xs">
                      <button className="text-slate-500 hover:underline" onClick={() => goToHit(hit)}>
                        Go to →
                      </button>
                      <button
                        className="text-slate-500 hover:underline disabled:opacity-40 disabled:no-underline"
                        disabled={!codeId || (selectedCode !== undefined && hit.codeIds.includes(codeId))}
                        title={codeId ? `Code “${hit.sentence.text}”` : 'Choose a code above first'}
                        onClick={() => codeSentence(hit)}
                      >
                        {codeId && hit.codeIds.includes(codeId) ? 'Coded' : 'Code sentence'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

export default SearchView
