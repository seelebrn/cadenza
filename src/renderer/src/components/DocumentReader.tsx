import { useMemo } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useCodingUiStore } from '../store/codingUiStore'
import { computeParagraphRuns, type CodingWithSegment } from '@shared/highlightRuns'
import { getParagraphStartOffsets, joinParagraphs } from '@shared/text'
import { resolveSelectionOffsets } from '../lib/selection'

interface Props {
  documentId: string | null
}

function DocumentReader({ documentId }: Props): JSX.Element {
  const document = useProjectStore(
    (s) => s.data?.documents.find((d) => d.id === documentId) ?? null
  )
  const codings = useProjectStore((s) => s.data?.codings ?? [])
  const segments = useProjectStore((s) => s.data?.segments ?? [])
  const codes = useProjectStore((s) => s.data?.codes ?? [])
  const setPendingSelection = useCodingUiStore((s) => s.setPendingSelection)
  const setInspectedCodingIds = useCodingUiStore((s) => s.setInspectedCodingIds)

  const paragraphStartOffsets = useMemo(
    () => (document ? getParagraphStartOffsets(document.paragraphs) : []),
    [document]
  )

  const codingsWithSegments = useMemo<CodingWithSegment[]>(() => {
    if (!document) return []
    const segmentById = new Map(segments.map((s) => [s.id, s]))
    const result: CodingWithSegment[] = []
    for (const coding of codings) {
      const segment = segmentById.get(coding.segmentId)
      if (segment && segment.documentId === document.id) result.push({ coding, segment })
    }
    return result
  }, [codings, segments, document])

  const codeById = useMemo(() => new Map(codes.map((c) => [c.id, c])), [codes])

  function handleMouseUp(): void {
    if (!document) return
    const resolved = resolveSelectionOffsets(paragraphStartOffsets)
    if (!resolved) return
    const text = joinParagraphs(document.paragraphs).slice(resolved.start, resolved.end)
    if (!text.trim()) return
    setPendingSelection({ documentId: document.id, start: resolved.start, end: resolved.end, text })
    window.getSelection()?.removeAllRanges()
  }

  if (!document) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        Select a document, or import one to get started.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-8" onMouseUp={handleMouseUp}>
      <h2 className="mb-1 text-xl font-semibold">{document.title}</h2>
      <p className="mb-6 text-xs uppercase tracking-wide text-slate-400">
        {document.sourceFormat} · {document.paragraphs.length} paragraphs · imported{' '}
        {new Date(document.importedAt).toLocaleString()}
      </p>
      <div className="space-y-4 text-sm leading-relaxed text-slate-800">
        {document.paragraphs.map((paragraph, i) => {
          const runs = computeParagraphRuns(paragraph, paragraphStartOffsets[i], codingsWithSegments)
          return (
            <p key={i} data-paragraph-index={i}>
              {runs.map((run, runIndex) => {
                if (run.codingIds.length === 0) return <span key={runIndex}>{run.text}</span>
                const primary = codingsWithSegments.find((c) => c.coding.id === run.codingIds[0])
                const color = primary ? codeById.get(primary.coding.codeId)?.color : undefined
                return (
                  <mark
                    key={runIndex}
                    style={{ backgroundColor: color ? `${color}55` : undefined }}
                    className="cursor-pointer rounded-sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setInspectedCodingIds(run.codingIds)
                    }}
                    title={run.codingIds
                      .map((id) => {
                        const c = codingsWithSegments.find((cs) => cs.coding.id === id)
                        return c ? codeById.get(c.coding.codeId)?.name : undefined
                      })
                      .filter(Boolean)
                      .join(', ')}
                  >
                    {run.text}
                  </mark>
                )
              })}
            </p>
          )
        })}
      </div>
    </div>
  )
}

export default DocumentReader
