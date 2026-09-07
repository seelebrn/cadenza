import { useMemo, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import { computeParagraphRuns, type CodingWithSegment } from '@shared/highlightRuns'
import { getParagraphStartOffsets, joinParagraphs } from '@shared/text'
import { resolveSelectionOffsets } from '../lib/selection'

// A synthetic id standing in for "the current active span" wherever a real
// Coding/Segment id is expected, so it can ride through the same
// run-splitting logic as real codings and get its own highlight treatment.
const ACTIVE_MARKER = '__active-span__'

function DocumentReader(): JSX.Element {
  const documentId = useWorkspaceUiStore((s) => s.selectedDocumentId)
  const document = useProjectStore(
    (s) => s.data?.documents.find((d) => d.id === documentId) ?? null
  )
  const codings = useProjectStore((s) => s.data?.codings ?? [])
  const segments = useProjectStore((s) => s.data?.segments ?? [])
  const codes = useProjectStore((s) => s.data?.codes ?? [])
  const editParagraph = useProjectStore((s) => s.editParagraph)
  const renameDocument = useProjectStore((s) => s.renameDocument)
  const activeSpan = useWorkspaceUiStore((s) => s.activeSpan)
  const setActiveSpan = useWorkspaceUiStore((s) => s.setActiveSpan)
  const clearActiveSpan = useWorkspaceUiStore((s) => s.clear)

  const [editingParagraphIndex, setEditingParagraphIndex] = useState<number | null>(null)
  const [draftText, setDraftText] = useState('')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  const paragraphStartOffsets = useMemo(
    () => (document ? getParagraphStartOffsets(document.paragraphs) : []),
    [document]
  )

  // Real codings on this document, plus (if any) the active span as a fake
  // "coding" so it renders as a highlight too — that's what keeps a fresh
  // selection visually marked after the native browser selection is
  // cleared, and also puts a "you're working on this" outline on an
  // existing coded passage the user clicked to inspect/extend.
  const codingsWithSegments = useMemo<CodingWithSegment[]>(() => {
    if (!document) return []
    const segmentById = new Map(segments.map((s) => [s.id, s]))
    const result: CodingWithSegment[] = []
    for (const coding of codings) {
      const segment = segmentById.get(coding.segmentId)
      if (segment && segment.documentId === document.id) result.push({ coding, segment })
    }
    if (activeSpan && activeSpan.documentId === document.id) {
      result.push({
        coding: { id: ACTIVE_MARKER, segmentId: ACTIVE_MARKER, codeId: ACTIVE_MARKER, createdAt: '' },
        segment: {
          id: ACTIVE_MARKER,
          documentId: document.id,
          start: activeSpan.start,
          end: activeSpan.end,
          text: activeSpan.text
        }
      })
    }
    return result
  }, [codings, segments, document, activeSpan])

  const codeById = useMemo(() => new Map(codes.map((c) => [c.id, c])), [codes])

  function handleMouseUp(): void {
    if (!document || editingParagraphIndex !== null) return
    const resolved = resolveSelectionOffsets(paragraphStartOffsets)
    if (!resolved) return
    const text = joinParagraphs(document.paragraphs).slice(resolved.start, resolved.end)
    if (!text.trim()) return
    setActiveSpan({ documentId: document.id, start: resolved.start, end: resolved.end, text })
    // Clear the native browser selection — our own rendered highlight (below)
    // takes over as the persistent visual marker for the active span.
    window.getSelection()?.removeAllRanges()
  }

  function startEditingParagraph(index: number): void {
    if (!document) return
    setDraftText(document.paragraphs[index])
    setEditingParagraphIndex(index)
  }

  function commitParagraphEdit(): void {
    if (!document || editingParagraphIndex === null) return
    editParagraph(document.id, editingParagraphIndex, draftText)
    setEditingParagraphIndex(null)
  }

  function commitTitle(): void {
    if (!document) return
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== document.title) renameDocument(document.id, trimmed)
    setIsEditingTitle(false)
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
      {isEditingTitle ? (
        <input
          autoFocus
          className="mb-1 w-full rounded border border-slate-300 px-1 text-xl font-semibold"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === 'Enter' && commitTitle()}
        />
      ) : (
        <h2
          className="mb-1 text-xl font-semibold"
          onDoubleClick={() => {
            setTitleDraft(document.title)
            setIsEditingTitle(true)
          }}
          title="Double-click to rename"
        >
          {document.title}
        </h2>
      )}
      <p className="mb-6 text-xs uppercase tracking-wide text-slate-400">
        {document.sourceFormat} · {document.paragraphs.length} paragraphs · imported{' '}
        {new Date(document.importedAt).toLocaleString()}
      </p>
      <div className="space-y-4 text-sm leading-relaxed text-slate-800">
        {document.paragraphs.map((paragraph, i) => {
          if (editingParagraphIndex === i) {
            const paragraphStart = paragraphStartOffsets[i]
            const paragraphEnd = paragraphStart + paragraph.length
            const hasCodedContent = segments.some(
              (s) => s.documentId === document.id && s.start < paragraphEnd && s.end > paragraphStart
            )
            return (
              <div key={i} className="rounded border border-slate-300 bg-slate-50 p-2">
                {hasCodedContent && (
                  <p className="mb-1 text-xs text-amber-700">
                    This paragraph has coded/annotated passages — their verbatim quotes are kept, but
                    edits here may shift where they highlight.
                  </p>
                )}
                <textarea
                  autoFocus
                  className="w-full rounded border border-slate-300 p-2 text-sm leading-relaxed"
                  rows={Math.max(3, Math.ceil(draftText.length / 80))}
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                />
                <div className="mt-1 flex justify-end gap-2 text-xs">
                  <button className="text-slate-500 hover:underline" onClick={() => setEditingParagraphIndex(null)}>
                    Cancel
                  </button>
                  <button className="font-medium text-slate-900 hover:underline" onClick={commitParagraphEdit}>
                    Save
                  </button>
                </div>
              </div>
            )
          }

          const runs = computeParagraphRuns(paragraph, paragraphStartOffsets[i], codingsWithSegments)
          return (
            <div key={i} className="group relative">
              <p data-paragraph-index={i}>
                {runs.map((run, runIndex) => {
                  const isActive = run.codingIds.includes(ACTIVE_MARKER)
                  const realCodingIds = run.codingIds.filter((id) => id !== ACTIVE_MARKER)

                  if (realCodingIds.length === 0 && !isActive) {
                    return <span key={runIndex}>{run.text}</span>
                  }

                  const primaryEntry =
                    realCodingIds.length > 0
                      ? codingsWithSegments.find((c) => c.coding.id === realCodingIds[0])
                      : undefined
                  const color = primaryEntry ? codeById.get(primaryEntry.coding.codeId)?.color : undefined
                  const title =
                    realCodingIds.length > 0
                      ? realCodingIds
                          .map((id) => {
                            const c = codingsWithSegments.find((cs) => cs.coding.id === id)
                            return c ? codeById.get(c.coding.codeId)?.name : undefined
                          })
                          .filter(Boolean)
                          .join(', ')
                      : 'Click to add codes/items/notes — click again to cancel'

                  return (
                    <mark
                      key={runIndex}
                      style={{ backgroundColor: color ? `${color}55` : isActive ? '#fde68a80' : undefined }}
                      className={`cursor-pointer rounded-sm ${
                        isActive ? 'outline-dashed outline-2 outline-amber-500 outline-offset-1' : ''
                      }`}
                      title={title}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (primaryEntry) {
                          // Re-activate this exact segment: shows what's already
                          // on it (via the codebook/notes panels) *and* re-arms
                          // Apply/note actions so more can be added to it.
                          const { segment } = primaryEntry
                          setActiveSpan({
                            documentId: segment.documentId,
                            start: segment.start,
                            end: segment.end,
                            text: segment.text
                          })
                        } else if (isActive) {
                          clearActiveSpan()
                        }
                      }}
                    >
                      {run.text}
                    </mark>
                  )
                })}
              </p>
              <button
                className="absolute -right-5 top-0 hidden text-xs text-slate-300 hover:text-slate-600 group-hover:block"
                title="Edit this paragraph's text"
                onClick={() => startEditingParagraph(i)}
              >
                ✎
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DocumentReader
