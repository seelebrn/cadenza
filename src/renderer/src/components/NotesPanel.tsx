import { useEffect, useMemo, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import { describeNoteAttachment } from '@shared/notesOps'
import type { NoteRecord } from '@shared/types'

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

function NotesPanel(): JSX.Element {
  const data = useProjectStore((s) => s.data)
  const addNote = useProjectStore((s) => s.addNote)
  const addNoteToSelection = useProjectStore((s) => s.addNoteToSelection)

  const pendingSelection = useWorkspaceUiStore((s) => s.pendingSelection)
  const clearUi = useWorkspaceUiStore((s) => s.clear)
  const selectedDocumentId = useWorkspaceUiStore((s) => s.selectedDocumentId)

  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [tags, setTags] = useState('')
  const [manualTarget, setManualTarget] = useState<'document' | 'project'>('document')
  const [filterMode, setFilterMode] = useState<'document' | 'all'>('document')

  useEffect(() => {
    if (!selectedDocumentId && manualTarget === 'document') setManualTarget('project')
  }, [selectedDocumentId, manualTarget])

  function handleAdd(): void {
    const trimmedAnswer = answer.trim()
    if (!trimmedAnswer) return
    const tagList = parseTags(tags)
    const q = question.trim() || null

    if (pendingSelection) {
      addNoteToSelection(
        pendingSelection.documentId,
        pendingSelection.start,
        pendingSelection.end,
        pendingSelection.text,
        q,
        trimmedAnswer,
        tagList
      )
    } else if (manualTarget === 'document' && selectedDocumentId) {
      addNote({ kind: 'document', documentId: selectedDocumentId }, q, trimmedAnswer, tagList)
    } else {
      addNote({ kind: 'project' }, q, trimmedAnswer, tagList)
    }

    setQuestion('')
    setAnswer('')
    setTags('')
  }

  const visibleNotes = useMemo(() => {
    if (!data) return []
    let list = data.notes
    if (filterMode === 'document') {
      list = selectedDocumentId
        ? list.filter((n) => {
            const attachedTo = n.attachedTo
            if (attachedTo.kind === 'document') return attachedTo.documentId === selectedDocumentId
            if (attachedTo.kind === 'segment') {
              const segment = data.segments.find((s) => s.id === attachedTo.segmentId)
              return segment?.documentId === selectedDocumentId
            }
            return false
          })
        : []
    }
    return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [data, filterMode, selectedDocumentId])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {pendingSelection && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="mb-1 font-medium">New note on the highlighted text:</p>
          <p className="italic">&ldquo;{pendingSelection.text}&rdquo;</p>
          <button className="mt-1 text-amber-700 underline" onClick={clearUi}>
            Done — clear selection
          </button>
        </div>
      )}

      <div className="space-y-1.5 border-b border-slate-200 p-3">
        {!pendingSelection && (
          <div className="flex gap-3 text-xs text-slate-500">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={manualTarget === 'document'}
                disabled={!selectedDocumentId}
                onChange={() => setManualTarget('document')}
              />
              This document
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={manualTarget === 'project'}
                onChange={() => setManualTarget('project')}
              />
              Project
            </label>
          </div>
        )}
        <input
          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          placeholder="Analytic question (optional — AQA-style)"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <textarea
          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          rows={3}
          placeholder="Answer / memo…"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
            placeholder="tags, comma, separated"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
          <button
            className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
            onClick={handleAdd}
          >
            Add note
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 border-b border-slate-200 px-3 py-1.5 text-xs text-slate-500">
        <span>Show:</span>
        <button
          className={filterMode === 'document' ? 'font-semibold text-slate-800' : 'hover:text-slate-700'}
          onClick={() => setFilterMode('document')}
        >
          This document
        </button>
        <button
          className={filterMode === 'all' ? 'font-semibold text-slate-800' : 'hover:text-slate-700'}
          onClick={() => setFilterMode('all')}
        >
          All notes
        </button>
      </div>

      <div className="flex-1 overflow-auto p-2">
        {visibleNotes.length === 0 && (
          <p className="p-3 text-center text-sm text-slate-400">No notes yet.</p>
        )}
        {visibleNotes.map((note) => (
          <NoteCard key={note.id} note={note} />
        ))}
      </div>
    </div>
  )
}

function NoteCard({ note }: { note: NoteRecord }): JSX.Element {
  const data = useProjectStore((s) => s.data)
  const updateNote = useProjectStore((s) => s.updateNote)
  const deleteNote = useProjectStore((s) => s.deleteNote)
  const setSelectedDocumentId = useWorkspaceUiStore((s) => s.setSelectedDocumentId)
  const setPendingSelection = useWorkspaceUiStore((s) => s.setPendingSelection)
  const setSuggestedCodeName = useWorkspaceUiStore((s) => s.setSuggestedCodeName)
  const setActiveSidebarTab = useWorkspaceUiStore((s) => s.setActiveSidebarTab)

  const [isEditing, setIsEditing] = useState(false)
  const [questionDraft, setQuestionDraft] = useState(note.question ?? '')
  const [answerDraft, setAnswerDraft] = useState(note.answer)
  const [tagsDraft, setTagsDraft] = useState(note.tags.join(', '))

  const description = useMemo(() => (data ? describeNoteAttachment(data, note) : { label: '' }), [data, note])

  function commitEdit(): void {
    updateNote(note.id, {
      question: questionDraft.trim() || null,
      answer: answerDraft,
      tags: parseTags(tagsDraft)
    })
    setIsEditing(false)
  }

  function handlePromote(): void {
    const attachedTo = note.attachedTo
    if (attachedTo.kind !== 'segment' || !data) return
    const segment = data.segments.find((s) => s.id === attachedTo.segmentId)
    if (!segment) return
    setSelectedDocumentId(segment.documentId)
    setPendingSelection({
      documentId: segment.documentId,
      start: segment.start,
      end: segment.end,
      text: segment.text
    })
    setSuggestedCodeName(note.question?.trim() || note.answer.slice(0, 40))
    setActiveSidebarTab('codes')
  }

  return (
    <div className="mb-2 rounded border border-slate-200 p-2 text-xs">
      <div className="mb-1 flex items-center justify-between text-slate-400">
        <span className="truncate font-medium text-slate-500">{description.label}</span>
        <span>{new Date(note.createdAt).toLocaleString()}</span>
      </div>
      {description.quote && <p className="mb-1 italic text-slate-500">&ldquo;{description.quote}&rdquo;</p>}

      {isEditing ? (
        <div className="space-y-1">
          <input
            className="w-full rounded border border-slate-300 px-1 py-0.5"
            placeholder="Analytic question (optional)"
            value={questionDraft}
            onChange={(e) => setQuestionDraft(e.target.value)}
          />
          <textarea
            className="w-full rounded border border-slate-300 px-1 py-0.5"
            rows={3}
            value={answerDraft}
            onChange={(e) => setAnswerDraft(e.target.value)}
          />
          <input
            className="w-full rounded border border-slate-300 px-1 py-0.5"
            placeholder="tags, comma, separated"
            value={tagsDraft}
            onChange={(e) => setTagsDraft(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button className="text-slate-500 hover:underline" onClick={() => setIsEditing(false)}>
              Cancel
            </button>
            <button className="font-medium text-slate-900 hover:underline" onClick={commitEdit}>
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          {note.question && <p className="mb-1 font-medium text-slate-700">Q: {note.question}</p>}
          <p className="whitespace-pre-wrap text-slate-700">{note.answer}</p>
          {note.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {note.tags.map((tag) => (
                <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="mt-1.5 flex gap-2 text-[11px]">
            <button className="text-slate-500 hover:underline" onClick={() => setIsEditing(true)}>
              Edit
            </button>
            {note.attachedTo.kind === 'segment' && (
              <button className="text-slate-500 hover:underline" onClick={handlePromote}>
                Promote to code
              </button>
            )}
            <button className="text-red-500 hover:underline" onClick={() => deleteNote(note.id)}>
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default NotesPanel
