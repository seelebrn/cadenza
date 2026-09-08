import { useEffect, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import AnalysisView from './AnalysisView'
import BoardView from './BoardView'
import CodeInfoModal from './CodeInfoModal'
import DocumentList from './DocumentList'
import DocumentReader from './DocumentReader'
import ExportView from './ExportView'
import NoteInfoModal from './NoteInfoModal'
import RightSidebar from './RightSidebar'

function ProjectShell(): JSX.Element | null {
  const data = useProjectStore((s) => s.data)
  const filePath = useProjectStore((s) => s.filePath)
  const isDirty = useProjectStore((s) => s.isDirty)
  const isSaving = useProjectStore((s) => s.isSaving)
  const error = useProjectStore((s) => s.error)
  const save = useProjectStore((s) => s.save)
  const saveAs = useProjectStore((s) => s.saveAs)
  const closeProject = useProjectStore((s) => s.closeProject)
  const canUndo = useProjectStore((s) => s.past.length > 0)
  const canRedo = useProjectStore((s) => s.future.length > 0)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)
  const renameProject = useProjectStore((s) => s.renameProject)
  const mainView = useWorkspaceUiStore((s) => s.mainView)
  const setMainView = useWorkspaceUiStore((s) => s.setMainView)

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  // Ctrl/Cmd+Z to undo, Ctrl/Cmd+Shift+Z (and Ctrl+Y, the common Windows
  // alternate binding) to redo — skipped while focus is inside a text
  // input/textarea/contentEditable, so the browser's own native undo for
  // whatever the user is actively typing takes priority over the
  // project-wide history.
  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
    }
    function handleKeyDown(e: KeyboardEvent): void {
      if (!(e.ctrlKey || e.metaKey) || isEditableTarget(e.target)) return
      if (e.key.toLowerCase() === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
      } else if (e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  if (!data) return null
  const project = data // a stable local const narrows reliably; the nested handler below can't rely on the outer null-check

  function commitNameRename(): void {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== project.name) renameProject(trimmed)
    setIsEditingName(false)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          {isEditingName ? (
            <input
              autoFocus
              className="rounded border border-slate-300 px-1 text-lg font-semibold"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitNameRename}
              onKeyDown={(e) => e.key === 'Enter' && commitNameRename()}
            />
          ) : (
            <h1
              className="text-lg font-semibold"
              onDoubleClick={() => {
                setNameDraft(data.name)
                setIsEditingName(true)
              }}
              title="Double-click to rename"
            >
              {data.name}
            </h1>
          )}
          <p className="text-xs text-slate-400">
            {filePath ?? 'Not saved yet'}
            {isDirty && ' • unsaved changes'}
            {isSaving && ' • saving…'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex rounded border border-slate-300 text-sm">
            <button
              className={`px-3 py-1 ${mainView === 'workspace' ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}
              onClick={() => setMainView('workspace')}
            >
              Workspace
            </button>
            <button
              className={`px-3 py-1 ${mainView === 'analysis' ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}
              onClick={() => setMainView('analysis')}
            >
              Analysis
            </button>
            <button
              className={`px-3 py-1 ${mainView === 'board' ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}
              onClick={() => setMainView('board')}
            >
              Board
            </button>
            <button
              className={`px-3 py-1 ${mainView === 'export' ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}
              onClick={() => setMainView('export')}
            >
              Export
            </button>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-40"
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl/Cmd+Z)"
            >
              ↶ Undo
            </button>
            <button
              className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-40"
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl/Cmd+Shift+Z)"
            >
              ↷ Redo
            </button>
            <button
              className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-40"
              onClick={() => void save()}
              disabled={!isDirty || isSaving}
            >
              Save
            </button>
            <button
              className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
              onClick={() => void saveAs()}
            >
              Save As…
            </button>
            <button
              className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
              onClick={closeProject}
            >
              Close
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="border-b border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {mainView === 'workspace' && (
        <div className="flex flex-1 overflow-hidden">
          <DocumentList />
          <main className="flex-1 overflow-auto">
            <DocumentReader />
          </main>
          <RightSidebar />
        </div>
      )}
      {mainView === 'analysis' && (
        <div className="flex-1 overflow-hidden">
          <AnalysisView />
        </div>
      )}
      {mainView === 'board' && (
        <div className="flex-1 overflow-hidden">
          <BoardView />
        </div>
      )}
      {mainView === 'export' && (
        <div className="flex-1 overflow-hidden">
          <ExportView />
        </div>
      )}

      <CodeInfoModal />
      <NoteInfoModal />
    </div>
  )
}

export default ProjectShell
