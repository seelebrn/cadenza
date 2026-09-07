import { useProjectStore } from '../store/projectStore'

interface Props {
  documentId: string | null
}

function DocumentReader({ documentId }: Props): JSX.Element {
  const document = useProjectStore(
    (s) => s.data?.documents.find((d) => d.id === documentId) ?? null
  )

  if (!document) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        Select a document, or import one to get started.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <h2 className="mb-1 text-xl font-semibold">{document.title}</h2>
      <p className="mb-6 text-xs uppercase tracking-wide text-slate-400">
        {document.sourceFormat} · {document.paragraphs.length} paragraphs · imported{' '}
        {new Date(document.importedAt).toLocaleString()}
      </p>
      <div className="space-y-4 text-sm leading-relaxed text-slate-800">
        {document.paragraphs.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
    </div>
  )
}

export default DocumentReader
