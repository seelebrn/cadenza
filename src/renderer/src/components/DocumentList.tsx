import { useProjectStore } from '../store/projectStore'

interface Props {
  selectedId: string | null
  onSelect: (id: string) => void
}

function DocumentList({ selectedId, onSelect }: Props): JSX.Element {
  const documents = useProjectStore((s) => s.data?.documents ?? [])
  const isImporting = useProjectStore((s) => s.isImporting)
  const importDocument = useProjectStore((s) => s.importDocument)

  return (
    <aside className="flex w-72 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-3">
        <button
          className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
          onClick={() => void importDocument()}
          disabled={isImporting}
        >
          {isImporting ? 'Importing…' : 'Import document…'}
        </button>
        <p className="mt-1 text-center text-[11px] text-slate-400">.docx · .odt · .txt</p>
      </div>

      <ul className="flex-1 overflow-auto">
        {documents.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-slate-400">No documents yet.</li>
        )}
        {documents.map((doc) => (
          <li key={doc.id}>
            <button
              className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                doc.id === selectedId ? 'bg-slate-100 font-medium' : ''
              }`}
              onClick={() => onSelect(doc.id)}
              title={doc.title}
            >
              {doc.title}
              <span className="ml-1 text-xs text-slate-400">({doc.paragraphs.length})</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}

export default DocumentList
