import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import CodebookPanel from './CodebookPanel'
import NotesPanel from './NotesPanel'

function RightSidebar(): JSX.Element {
  const activeTab = useWorkspaceUiStore((s) => s.activeSidebarTab)
  const setActiveTab = useWorkspaceUiStore((s) => s.setActiveSidebarTab)

  return (
    <aside className="flex w-80 flex-shrink-0 flex-col border-l border-slate-200 bg-white">
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

export default RightSidebar
