import { useState } from 'react'
import { useProjectStore } from '../store/projectStore'

function ProjectHome(): JSX.Element {
  const [name, setName] = useState('Untitled project')
  const recent = useProjectStore((s) => s.recent)
  const error = useProjectStore((s) => s.error)
  const newProject = useProjectStore((s) => s.newProject)
  const openProject = useProjectStore((s) => s.openProject)
  const openRecent = useProjectStore((s) => s.openRecent)

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col justify-center gap-8 px-8">
      <div>
        <h1 className="text-3xl font-semibold">Cadenza</h1>
        <p className="text-sm text-slate-500">Qualitative data analysis, kept local.</p>
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <input
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name"
        />
        <button
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          onClick={() => void newProject(name || 'Untitled project')}
        >
          New project
        </button>
        <button
          className="rounded border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
          onClick={() => void openProject()}
        >
          Open project…
        </button>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-slate-500">Recent projects</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400">No recent projects yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {recent.map((entry) => (
              <li key={entry.filePath}>
                <button
                  className="flex w-full flex-col items-start px-4 py-3 text-left hover:bg-slate-50"
                  onClick={() => void openRecent(entry.filePath)}
                >
                  <span className="text-sm font-medium">{entry.name}</span>
                  <span className="text-xs text-slate-400">{entry.filePath}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default ProjectHome
