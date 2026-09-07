import { useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import CodebookPanel from './CodebookPanel'
import NotesPanel from './NotesPanel'

function RightSidebar(): JSX.Element {
  const activeTab = useWorkspaceUiStore((s) => s.activeSidebarTab)
  const setActiveTab = useWorkspaceUiStore((s) => s.setActiveSidebarTab)

  return (
    <aside className="flex w-80 flex-shrink-0 flex-col border-l border-slate-200 bg-white">
      <FileUnderCategoryBar />

      <div className="flex border-b border-slate-200">
        <button
          className={`flex-1 px-3 py-2 text-sm font-medium ${
            activeTab === 'codes' ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-400 hover:text-slate-600'
          }`}
          onClick={() => setActiveTab('codes')}
        >
          Codes &amp; items
        </button>
        <button
          className={`flex-1 px-3 py-2 text-sm font-medium ${
            activeTab === 'notes' ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-400 hover:text-slate-600'
          }`}
          onClick={() => setActiveTab('notes')}
        >
          Notes
        </button>
      </div>

      {activeTab === 'codes' ? <CodebookPanel /> : <NotesPanel />}
    </aside>
  )
}

/** Files the active span as a raw quote under a category — usable
 * regardless of whether it's been coded/memoed, and regardless of which
 * sidebar tab is open, since it's about the span, not the tab. */
function FileUnderCategoryBar(): JSX.Element | null {
  const data = useProjectStore((s) => s.data)
  const fileSpanUnderCategory = useProjectStore((s) => s.fileSpanUnderCategory)
  const activeSpan = useWorkspaceUiStore((s) => s.activeSpan)
  const [categoryId, setCategoryId] = useState('')

  const categories = data?.categories ?? []
  if (!activeSpan || categories.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
      <span className="flex-shrink-0 text-slate-500">File under:</span>
      <select
        className="min-w-0 flex-1 rounded border border-slate-300 px-1 py-0.5"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
      >
        <option value="" disabled>
          Choose category…
        </option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.kind === 'question' ? '❓ ' : '🏷 '}
            {c.name}
          </option>
        ))}
      </select>
      <button
        className="flex-shrink-0 rounded bg-slate-900 px-2 py-0.5 text-white disabled:opacity-40"
        disabled={!categoryId}
        onClick={() => {
          fileSpanUnderCategory(activeSpan.documentId, activeSpan.start, activeSpan.end, activeSpan.text, categoryId)
          setCategoryId('')
        }}
      >
        File
      </button>
    </div>
  )
}

export default RightSidebar
