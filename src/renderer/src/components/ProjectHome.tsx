import { useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import type { QdpxImportReport } from '@shared/refiQda'

function ProjectHome(): JSX.Element {
  const [name, setName] = useState('Untitled project')
  const recent = useProjectStore((s) => s.recent)
  const error = useProjectStore((s) => s.error)
  const newProject = useProjectStore((s) => s.newProject)
  const openProject = useProjectStore((s) => s.openProject)
  const openRecent = useProjectStore((s) => s.openRecent)
  const removeRecent = useProjectStore((s) => s.removeRecent)
  const openExample = useProjectStore((s) => s.openExample)
  const importQdpx = useProjectStore((s) => s.importQdpx)
  const [importReport, setImportReport] = useState<QdpxImportReport | null>(null)

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

      <p className="-mt-4 text-sm text-slate-500">
        New to Cadenza?{' '}
        <button
          className="font-medium text-slate-700 underline hover:text-slate-900"
          onClick={() => void openExample()}
        >
          Explore an example project
        </button>{' '}
        — a small fictional study, already coded, notated, and organized into a thematic map.
      </p>

      <p className="-mt-4 text-sm text-slate-500">
        Coming from another tool?{' '}
        <button
          className="font-medium text-slate-700 underline hover:text-slate-900"
          onClick={() => void importQdpx().then((report) => setImportReport(report))}
        >
          Import a REFI-QDA project (.qdpx)
        </button>{' '}
        — the exchange format NVivo, MAXQDA, ATLAS.ti and QualCoder can export. Documents, codes, coded
        passages, notes, case attributes and sets come across; audio/video and layouts don't.
      </p>
      {importReport && (
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Imported {importReport.documents} document{importReport.documents === 1 ? '' : 's'}, {importReport.codes} code
          {importReport.codes === 1 ? '' : 's'}, {importReport.codings} coded passage{importReport.codings === 1 ? '' : 's'},{' '}
          {importReport.notes} note{importReport.notes === 1 ? '' : 's'} and {importReport.clusters} cluster
          {importReport.clusters === 1 ? '' : 's'} as a new project — save it to keep it.
          {importReport.skipped.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-amber-700">
              {importReport.skipped.map((s, i) => (
                <li key={i}>Skipped: {s}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium text-slate-500">Recent projects</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400">No recent projects yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {recent.map((entry) => (
              <li key={entry.filePath} className="group flex items-center">
                <button
                  className="flex flex-1 flex-col items-start px-4 py-3 text-left hover:bg-slate-50"
                  onClick={() => void openRecent(entry.filePath)}
                >
                  <span className="text-sm font-medium">{entry.name}</span>
                  <span className="text-xs text-slate-400">{entry.filePath}</span>
                </button>
                <button
                  className="mr-3 rounded px-2 py-1 text-xs text-slate-300 opacity-0 hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
                  title="Remove from recent projects"
                  aria-label={`Remove ${entry.name} from recent projects`}
                  onClick={(e) => {
                    e.stopPropagation()
                    void removeRecent(entry.filePath)
                  }}
                >
                  ✕
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
