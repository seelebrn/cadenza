import { useMemo } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import { computeParagraphRuns, type CodingWithSegment } from '@shared/highlightRuns'
import { getParagraphStartOffsets, joinParagraphs } from '@shared/text'
import { resolveSelectionOffsets } from '../lib/selection'

// A synthetic id standing in for "the current pending selection" wherever a
// real Coding/Segment id is expected, so it can ride through the same
// run-splitting logic as real codings and get its own highlight treatment.
const PENDING_MARKER = '__pending-selection__'

function DocumentReader(): JSX.Element {
  const documentId = useWorkspaceUiStore((s) => s.selectedDocumentId)
  const document = useProjectStore(
    (s) => s.data?.documents.find((d) => d.id === documentId) ?? null
  )
  const codings = useProjectStore((s) => s.data?.codings ?? [])
  const segments = useProjectStore((s) => s.data?.segments ?? [])
  const codes = useProjectStore((s) => s.data?.codes ?? [])
  const pendingSelection = useWorkspaceUiStore((s) => s.pendingSelection)
  const setPendingSelection = useWorkspaceUiStore((s) => s.setPendingSelection)
  const setInspectedCodingIds = useWorkspaceUiStore((s) => s.setInspectedCodingIds)
  const clearPendingSelection = useWorkspaceUiStore((s) => s.clear)

  const paragraphStartOffsets = useMemo(
    () => (document ? getParagraphStartOffsets(document.paragraphs) : []),
    [document]
  )

  // Real codings on this document, plus (if any) the pending selection as a
  // fake "coding" so it renders as a highlight too — that's what keeps the
  // selected passage visually marked after the native browser selection is
  // cleared, right up until the user applies something or cancels it.
  const codingsWithSegments = useMemo<CodingWithSegment[]>(() => {
    if (!document) return []
    const segmentById = new Map(segments.map((s) => [s.id, s]))
    const result: CodingWithSegment[] = []
    for (const coding of codings) {
      const segment = segmentById.get(coding.segmentId)
      if (segment && segment.documentId === document.id) result.push({ coding, segment })
    }
    if (pendingSelection && pendingSelection.documentId === document.id) {
      result.push({
        coding: { id: PENDING_MARKER, segmentId: PENDING_MARKER, codeId: PENDING_MARKER, createdAt: '' },
        segment: {
          id: PENDING_MARKER,
          documentId: document.id,
          start: pendingSelection.start,
          end: pendingSelection.end,
          text: pendingSelection.text
        }
      })
    }
    return result
  }, [codings, segments, document, pendingSelection])

  const codeById = useMemo(() => new Map(codes.map((c) => [c.id, c])), [codes])

  function handleMouseUp(): void {
    if (!document) return
    const resolved = resolveSelectionOffsets(paragraphStartOffsets)
    if (!resolved) return
    const text = joinParagraphs(document.paragraphs).slice(resolved.start, resolved.end)
    if (!text.trim()) return
    setPendingSelection({ documentId: document.id, start: resolved.start, end: resolved.end, text })
    // Clear the native browser selection — our own rendered highlight (below)
    // takes over as the persistent visual marker for the pending selection.
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
                const isPending = run.codingIds.includes(PENDING_MARKER)
                const realCodingIds = run.codingIds.filter((id) => id !== PENDING_MARKER)

                if (realCodingIds.length === 0 && !isPending) {
                  return <span key={runIndex}>{run.text}</span>
                }

                const primary =
                  realCodingIds.length > 0
                    ? codingsWithSegments.find((c) => c.coding.id === realCodingIds[0])
                    : undefined
                const color = primary ? codeById.get(primary.coding.codeId)?.color : undefined
                const title =
                  realCodingIds.length > 0
                    ? realCodingIds
                        .map((id) => {
                          const c = codingsWithSegments.find((cs) => cs.coding.id === id)
                          return c ? codeById.get(c.coding.codeId)?.name : undefined
                        })
                        .filter(Boolean)
                        .join(', ')
                    : 'Pending selection — click to cancel'

                return (
                  <mark
                    key={runIndex}
                    style={{ backgroundColor: color ? `${color}55` : isPending ? '#fde68a80' : undefined }}
                    className={`cursor-pointer rounded-sm ${
                      isPending ? 'outline-dashed outline-2 outline-amber-500 outline-offset-1' : ''
                    }`}
                    title={title}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (realCodingIds.length > 0) setInspectedCodingIds(realCodingIds)
                      else if (isPending) clearPendingSelection()
                    }}
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
