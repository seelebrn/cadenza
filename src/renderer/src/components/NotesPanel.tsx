import { useEffect, useMemo, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import { describeNoteAttachment } from '@shared/notesOps'
import type { NoteCategoryDef, NoteRecord } from '@shared/types'

const PALETTE = ['#3b82f6', '#f97316', '#8b5cf6', '#22c55e', '#ef4444', '#14b8a6', '#eab308', '#ec4899']

function nextColor(count: number): string {
  return PALETTE[count % PALETTE.length]
}

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

  const activeSpan = useWorkspaceUiStore((s) => s.activeSpan)
  const clearUi = useWorkspaceUiStore((s) => s.clear)
  const selectedDocumentId = useWorkspaceUiStore((s) => s.selectedDocumentId)

  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [tags, setTags] = useState('')
  const [noteCategoryId, setNoteCategoryId] = useState<string | null>(null)
  const [manualTarget, setManualTarget] = useState<'document' | 'project'>('document')
  const [filterMode, setFilterMode] = useState<'document' | 'all'>('document')
  const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all')

  const categories = data?.noteCategories ?? []

  useEffect(() => {
    if (!selectedDocumentId && manualTarget === 'document') setManualTarget('project')
  }, [selectedDocumentId, manualTarget])

  function handleAdd(): void {
    const trimmedAnswer = answer.trim()
    if (!trimmedAnswer) return
    const tagList = parseTags(tags)
    const q = question.trim() || null

    if (activeSpan) {
      addNoteToSelection(
        activeSpan.documentId,
        activeSpan.start,
        activeSpan.end,
        activeSpan.text,
        q,
        trimmedAnswer,
        tagList,
        noteCategoryId
      )
    } else if (manualTarget === 'document' && selectedDocumentId) {
      addNote({ kind: 'document', documentId: selectedDocumentId }, q, trimmedAnswer, tagList, noteCategoryId)
    } else {
      addNote({ kind: 'project' }, q, trimmedAnswer, tagList, noteCategoryId)
    }

    setQuestion('')
    setAnswer('')
    setTags('')
    // noteCategoryId deliberately persists — taking several notes of the
    // same category in a row is a common pattern, so don't reset it.
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
    if (categoryFilter !== 'all') {
      list = list.filter((n) => n.noteCategoryId === categoryFilter)
    }
    return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [data, filterMode, selectedDocumentId, categoryFilter])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <NoteCategoryManager />

      {activeSpan && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="mb-1 font-medium">New note on the highlighted text:</p>
          <p className="italic">&ldquo;{activeSpan.text}&rdquo;</p>
          <button className="mt-1 text-amber-700 underline" onClick={clearUi}>
            Done — clear selection
          </button>
        </div>
      )}

      <div className="space-y-1.5 border-b border-slate-200 p-3">
        {!activeSpan && (
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
          <select
            className="min-w-0 flex-shrink rounded border border-slate-300 px-1 py-1 text-xs"
            value={noteCategoryId ?? ''}
            onChange={(e) => setNoteCategoryId(e.target.value || null)}
          >
            <option value="">No category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <input
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
            placeholder="tags, comma, separated"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>
        <button
          className="w-full rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
          onClick={handleAdd}
        >
          Add note
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-3 py-1.5 text-xs text-slate-500">
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
        {categories.length > 0 && (
          <select
            className="ml-auto rounded border border-slate-300 px-1 py-0.5 text-[11px]"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        )}
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

function NoteCategoryManager(): JSX.Element {
  const data = useProjectStore((s) => s.data)
  const addNoteCategory = useProjectStore((s) => s.addNoteCategory)

  const [isOpen, setIsOpen] = useState(false)
  const [newName, setNewName] = useState('')

  const categories = data?.noteCategories ?? []

  function handleAdd(): void {
    const name = newName.trim()
    if (!name) return
    addNoteCategory(name, nextColor(categories.length))
    setNewName('')
  }

  return (
    <div className="border-b border-slate-200 text-xs">
      <button
        className="flex w-full items-center justify-between px-3 py-1.5 text-slate-500 hover:bg-slate-50"
        onClick={() => setIsOpen((v) => !v)}
      >
        <span>Note categories ({categories.length})</span>
        <span>{isOpen ? '▾' : '▸'}</span>
      </button>
      {isOpen && (
        <div className="space-y-1 px-3 pb-2">
          {categories.length === 0 && <p className="text-slate-400">No categories yet.</p>}
          {categories.map((cat) => (
            <NoteCategoryRow key={cat.id} category={cat} />
          ))}
          <div className="flex gap-1 pt-1">
            <input
              className="flex-1 rounded border border-slate-300 px-1.5 py-1"
              placeholder="New category (e.g. Note Descriptive)…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button className="rounded bg-slate-900 px-2 text-white" onClick={handleAdd}>
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function NoteCategoryRow({ category }: { category: NoteCategoryDef }): JSX.Element {
  const renameNoteCategory = useProjectStore((s) => s.renameNoteCategory)
  const setNoteCategoryColor = useProjectStore((s) => s.setNoteCategoryColor)
  const deleteNoteCategory = useProjectStore((s) => s.deleteNoteCategory)

  const [isEditing, setIsEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState(category.name)

  function commit(): void {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== category.name) renameNoteCategory(category.id, trimmed)
    setIsEditing(false)
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        className="h-3.5 w-3.5 flex-shrink-0 cursor-pointer border-0 bg-transparent p-0"
        value={category.color}
        onChange={(e) => setNoteCategoryColor(category.id, e.target.value)}
        title="Change color"
      />
      {isEditing ? (
        <input
          autoFocus
          className="flex-1 rounded border border-slate-300 px-1"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
      ) : (
        <button
          className="flex-1 truncate text-left"
          onDoubleClick={() => {
            setNameDraft(category.name)
            setIsEditing(true)
          }}
          title="Double-click to rename"
        >
          {category.name}
        </button>
      )}
      <button
        className="flex-shrink-0 text-red-500 hover:underline"
        title="Delete category"
        onClick={() => {
          if (window.confirm(`Delete "${category.name}"? Notes using it become uncategorized.`)) {
            deleteNoteCategory(category.id)
          }
        }}
      >
        ×
      </button>
    </div>
  )
}

function NoteCard({ note }: { note: NoteRecord }): JSX.Element {
  const data = useProjectStore((s) => s.data)
  const updateNote = useProjectStore((s) => s.updateNote)
  const deleteNote = useProjectStore((s) => s.deleteNote)
  const setSelectedDocumentId = useWorkspaceUiStore((s) => s.setSelectedDocumentId)
  const setActiveSpan = useWorkspaceUiStore((s) => s.setActiveSpan)
  const setSuggestedCodeName = useWorkspaceUiStore((s) => s.setSuggestedCodeName)
  const setActiveSidebarTab = useWorkspaceUiStore((s) => s.setActiveSidebarTab)

  const [isEditing, setIsEditing] = useState(false)
  const [questionDraft, setQuestionDraft] = useState(note.question ?? '')
  const [answerDraft, setAnswerDraft] = useState(note.answer)
  const [tagsDraft, setTagsDraft] = useState(note.tags.join(', '))
  const [categoryDraft, setCategoryDraft] = useState(note.noteCategoryId ?? '')

  const categories = data?.noteCategories ?? []
  const category = categories.find((c) => c.id === note.noteCategoryId)
  const description = useMemo(() => (data ? describeNoteAttachment(data, note) : { label: '' }), [data, note])

  function commitEdit(): void {
    updateNote(note.id, {
      question: questionDraft.trim() || null,
      answer: answerDraft,
      tags: parseTags(tagsDraft),
      noteCategoryId: categoryDraft || null
    })
    setIsEditing(false)
  }

  function handlePromote(): void {
    const attachedTo = note.attachedTo
    if (attachedTo.kind !== 'segment' || !data) return
    const segment = data.segments.find((s) => s.id === attachedTo.segmentId)
    if (!segment) return
    setSelectedDocumentId(segment.documentId)
    setActiveSpan({
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
      <div className="mb-1 flex items-center justify-between gap-2 text-slate-400">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium text-slate-500">{description.label}</span>
          {category && (
            <span
              className="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: category.color }}
            >
              {category.name}
            </span>
          )}
        </span>
        <span className="flex-shrink-0">{new Date(note.createdAt).toLocaleString()}</span>
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
          <select
            className="w-full rounded border border-slate-300 px-1 py-0.5"
            value={categoryDraft}
            onChange={(e) => setCategoryDraft(e.target.value)}
          >
            <option value="">No category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
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
            <button
              className="text-slate-500 hover:underline"
              onClick={() => {
                setCategoryDraft(note.noteCategoryId ?? '')
                setIsEditing(true)
              }}
            >
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
