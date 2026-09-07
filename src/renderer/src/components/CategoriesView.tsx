import { useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import type { CategoryKind, CategoryRecord } from '@shared/types'

const PALETTE = ['#8b5cf6', '#3b82f6', '#22c55e', '#f97316', '#ef4444', '#14b8a6', '#eab308', '#ec4899']

function nextColor(count: number): string {
  return PALETTE[count % PALETTE.length]
}

function CategoriesView(): JSX.Element {
  const data = useProjectStore((s) => s.data)
  const createCategory = useProjectStore((s) => s.createCategory)

  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<CategoryKind>('theme')

  const categories = data?.categories ?? []

  function handleCreate(): void {
    const name = newName.trim()
    if (!name) return
    createCategory(name, newKind, nextColor(categories.length))
    setNewName('')
  }

  const questions = categories.filter((c) => c.kind === 'question')
  const themes = categories.filter((c) => c.kind === 'theme')

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-4 flex gap-2">
        <select
          className="rounded border border-slate-300 px-2 py-1 text-sm"
          value={newKind}
          onChange={(e) => setNewKind(e.target.value as CategoryKind)}
        >
          <option value="theme">Theme</option>
          <option value="question">Question</option>
        </select>
        <input
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          placeholder={newKind === 'question' ? 'New analytic question…' : 'New theme…'}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <button
          className="rounded bg-slate-900 px-3 py-1 text-sm font-medium text-white hover:bg-slate-700"
          onClick={handleCreate}
        >
          Add
        </button>
      </div>

      {categories.length === 0 && (
        <p className="text-sm text-slate-400">
          No categories yet. A "question" category is Paillé &amp; Mucchielli-style AQA: the category
          itself is the analytic question, and whatever you file under it (codes, notes, quotes) reads
          as an answer.
        </p>
      )}

      {questions.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-600">Analytic questions (AQA)</h2>
          <div className="space-y-3">
            {questions.map((cat) => (
              <CategoryCard key={cat.id} category={cat} />
            ))}
          </div>
        </div>
      )}

      {themes.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-600">Themes</h2>
          <div className="space-y-3">
            {themes.map((cat) => (
              <CategoryCard key={cat.id} category={cat} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CategoryCard({ category }: { category: CategoryRecord }): JSX.Element | null {
  const data = useProjectStore((s) => s.data)
  const renameCategory = useProjectStore((s) => s.renameCategory)
  const setCategoryColor = useProjectStore((s) => s.setCategoryColor)
  const deleteCategory = useProjectStore((s) => s.deleteCategory)
  const addCodeToCategory = useProjectStore((s) => s.addCodeToCategory)
  const removeCodeFromCategory = useProjectStore((s) => s.removeCodeFromCategory)
  const addNoteToCategory = useProjectStore((s) => s.addNoteToCategory)
  const removeNoteFromCategory = useProjectStore((s) => s.removeNoteFromCategory)
  const removeSegmentFromCategory = useProjectStore((s) => s.removeSegmentFromCategory)

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(category.name)
  const [isExpanded, setIsExpanded] = useState(category.kind === 'question')

  if (!data) return null

  const memberCodes = category.codeIds
    .map((id) => data.codes.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
  const memberNotes = category.noteIds
    .map((id) => data.notes.find((n) => n.id === id))
    .filter((n): n is NonNullable<typeof n> => Boolean(n))
  const memberSegments = category.segmentIds
    .map((id) => data.segments.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))

  const availableCodes = data.codes.filter((c) => !category.codeIds.includes(c.id))
  const availableNotes = data.notes.filter((n) => !category.noteIds.includes(n.id))

  function commitRename(): void {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== category.name) renameCategory(category.id, trimmed)
    setIsEditingName(false)
  }

  const itemCount = memberCodes.length + memberNotes.length + memberSegments.length

  return (
    <div className="rounded border border-slate-200 p-3">
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-4 w-4 flex-shrink-0 cursor-pointer border-0 bg-transparent p-0"
          value={category.color}
          onChange={(e) => setCategoryColor(category.id, e.target.value)}
          title="Change color"
        />
        {isEditingName ? (
          <input
            autoFocus
            className="flex-1 rounded border border-slate-300 px-1 text-sm"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => e.key === 'Enter' && commitRename()}
          />
        ) : (
          <button
            className="flex-1 truncate text-left text-sm font-medium text-slate-800"
            onDoubleClick={() => {
              setNameDraft(category.name)
              setIsEditingName(true)
            }}
            title="Double-click to rename"
          >
            {category.kind === 'question' ? `“${category.name}”` : category.name}
          </button>
        )}
        <button
          className="flex-shrink-0 text-xs text-slate-400 hover:text-slate-600"
          onClick={() => setIsExpanded((v) => !v)}
        >
          {isExpanded ? 'Collapse' : `${itemCount} item${itemCount === 1 ? '' : 's'}`}
        </button>
        <button
          className="flex-shrink-0 text-xs text-red-500 hover:underline"
          onClick={() => {
            if (window.confirm(`Delete "${category.name}"?`)) deleteCategory(category.id)
          }}
        >
          Delete
        </button>
      </div>

      {isExpanded && (
        <div className="mt-3 space-y-3 text-xs">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="font-medium text-slate-500">Codes/items</span>
              {availableCodes.length > 0 && (
                <select
                  className="rounded border border-slate-300 text-[11px]"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) addCodeToCategory(category.id, e.target.value)
                  }}
                >
                  <option value="">+ Add code…</option>
                  {availableCodes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {memberCodes.length === 0 && <p className="text-slate-400">None yet.</p>}
            <ul className="space-y-1">
              {memberCodes.map((code) => (
                <li key={code.id} className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: code.color }} />
                    {code.name}
                  </span>
                  <button
                    className="text-red-500 hover:underline"
                    onClick={() => removeCodeFromCategory(category.id, code.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="font-medium text-slate-500">
                {category.kind === 'question' ? 'Answers (notes)' : 'Notes'}
              </span>
              {availableNotes.length > 0 && (
                <select
                  className="rounded border border-slate-300 text-[11px]"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) addNoteToCategory(category.id, e.target.value)
                  }}
                >
                  <option value="">+ Add note…</option>
                  {availableNotes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {(n.question || n.answer).slice(0, 40)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {memberNotes.length === 0 && <p className="text-slate-400">None yet.</p>}
            <ul className="space-y-1">
              {memberNotes.map((note) => (
                <li key={note.id} className="rounded bg-slate-50 p-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {note.question && <p className="font-medium text-slate-700">Q: {note.question}</p>}
                      <p className="whitespace-pre-wrap text-slate-600">{note.answer}</p>
                    </div>
                    <button
                      className="flex-shrink-0 text-red-500 hover:underline"
                      onClick={() => removeNoteFromCategory(category.id, note.id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {memberSegments.length > 0 && (
            <div>
              <span className="font-medium text-slate-500">Quotes filed directly</span>
              <ul className="mt-1 space-y-1">
                {memberSegments.map((segment) => (
                  <li key={segment.id} className="flex items-center justify-between gap-2">
                    <span className="italic text-slate-600">&ldquo;{segment.text}&rdquo;</span>
                    <button
                      className="flex-shrink-0 text-red-500 hover:underline"
                      onClick={() => removeSegmentFromCategory(category.id, segment.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default CategoriesView
