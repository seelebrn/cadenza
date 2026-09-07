import { useProjectStore } from '../store/projectStore'
import DocumentList from './DocumentList'
import DocumentReader from './DocumentReader'
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

  if (!data) return null

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">{data.name}</h1>
          <p className="text-xs text-slate-400">
            {filePath ?? 'Not saved yet'}
            {isDirty && ' • unsaved changes'}
            {isSaving && ' • saving…'}
          </p>
        </div>
        <div className="flex gap-2">
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
      </header>

      {error && (
        <div className="border-b border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <DocumentList />
        <main className="flex-1 overflow-auto">
          <DocumentReader />
        </main>
        <RightSidebar />
      </div>
    </div>
  )
}

export default ProjectShell
