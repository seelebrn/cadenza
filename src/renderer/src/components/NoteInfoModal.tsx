import { useEffect, useMemo, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import { describeNoteAttachment } from '@shared/notesOps'
import { CODE_USAGE_CONTEXT_WORDS } from '@shared/retrieval'
import { getSurroundingWords, joinParagraphs } from '@shared/text'

/** The note-info window — the same idea as CodeInfoModal, for notes:
 * double-click a note anywhere it appears (a card in the Workspace notes
 * tree, or a card on the board) to see its full question/answer, which
 * cluster(s) it's filed under, and — when it's attached to a passage —
 * the verbatim quote, optionally with surrounding context. Mounted once
 * at the app level (see ProjectShell.tsx) so it works the same regardless
 * of which trigger opened it. Unlike a code (which can have many
 * instances), a note has at most one verbatim quote — the segment it's
 * attached to, if any — so this is simpler than CodeInfoModal's
 * usage-list: no count, just the one quote when there is one. */
function NoteInfoModal(): JSX.Element | null {
  const inspectedNoteId = useWorkspaceUiStore((s) => s.inspectedNoteId)
  const setInspectedNoteId = useWorkspaceUiStore((s) => s.setInspectedNoteId)
  const data = useProjectStore((s) => s.data)
  const [showContext, setShowContext] = useState(false)

  const note = useMemo(() => data?.notes.find((n) => n.id === inspectedNoteId) ?? null, [data, inspectedNoteId])
  const description = useMemo(() => (data && note ? describeNoteAttachment(data, note) : null), [data, note])
  const noteCategory = useMemo(
    () => (data && note ? data.noteCategories.find((c) => c.id === note.noteCategoryId) ?? null : null),
    [data, note]
  )
  // A note can be filed under more than one cluster — same one-position-
  // on-a-board-but-shows-everywhere-in-trees rule as codes (see boardOps.ts).
  const filedUnder = useMemo(
    () => (data && note ? data.categories.filter((c) => c.noteIds.includes(note.id)) : []),
    [data, note]
  )
  const context = useMemo(() => {
    const attachedTo = note?.attachedTo // stable local const — narrowing pitfall noted elsewhere in this codebase
    if (!data || !attachedTo || attachedTo.kind !== 'segment') return null
    const segment = data.segments.find((s) => s.id === attachedTo.segmentId)
    if (!segment) return null
    const doc = data.documents.find((d) => d.id === segment.documentId)
    if (!doc) return null
    return getSurroundingWords(joinParagraphs(doc.paragraphs), segment.start, segment.end, CODE_USAGE_CONTEXT_WORDS)
  }, [data, note])

  useEffect(() => {
    if (!inspectedNoteId) return
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') setInspectedNoteId(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [inspectedNoteId, setInspectedNoteId])

  if (!inspectedNoteId) return null

  function close(): void {
    setInspectedNoteId(null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          {noteCategory && (
            <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: noteCategory.color }} />
          )}
          <h2 className="flex-1 truncate text-sm font-semibold text-slate-800">
            {note ? note.question || description?.label || 'Note' : '(note no longer exists)'}
          </h2>
          {noteCategory && (
            <span className="flex-shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
              {noteCategory.name}
            </span>
          )}
          <button
            className="flex-shrink-0 rounded px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={close}
            title="Close"
          >
            ×
          </button>
        </div>

        {note && (
          <div className="flex-1 overflow-auto p-4 text-sm">
            {description && <p className="mb-2 text-[11px] font-medium text-slate-400">{description.label}</p>}
            {note.question && <p className="mb-1 font-medium text-slate-700">Q: {note.question}</p>}
            <p className="whitespace-pre-wrap text-slate-700">{note.answer}</p>

            {note.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {note.tags.map((tag) => (
                  <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {filedUnder.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-[11px] font-medium text-slate-400">Filed under</p>
                <div className="flex flex-wrap gap-1">
                  {filedUnder.map((c) => (
                    <span
                      key={c.id}
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                      style={{ backgroundColor: c.color }}
                    >
                      {c.kind === 'question' ? `“${c.name}”` : c.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {description?.quote && (
              <div className="mt-3 border-t border-slate-200 pt-3">
                <label className="mb-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                  <input type="checkbox" checked={showContext} onChange={(e) => setShowContext(e.target.checked)} />
                  Show {CODE_USAGE_CONTEXT_WORDS} words of context
                </label>
                <p className="leading-relaxed text-slate-700">
                  {showContext && context?.before && <span className="text-slate-400">…{context.before} </span>}
                  <span className="bg-amber-100 italic">&ldquo;{description.quote}&rdquo;</span>
                  {showContext && context?.after && <span className="text-slate-400"> {context.after}…</span>}
                </p>
              </div>
            )}
          </div>
        )}

        {!note && (
          <p className="p-4 text-sm text-slate-400">This note was deleted while its info window was open.</p>
        )}
      </div>
    </div>
  )
}

export default NoteInfoModal
