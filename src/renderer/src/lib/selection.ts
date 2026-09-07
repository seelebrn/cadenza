/** Sums text-node lengths inside `root`, in document order, up to `targetNode`
 * (+ targetOffset) — the standard way to get a flat character offset within
 * an element that may have arbitrarily nested inline markup (our coded-span
 * highlights). */
function getTextOffsetWithinElement(root: HTMLElement, targetNode: Node, targetOffset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let offset = 0
  let node = walker.nextNode()
  while (node) {
    if (node === targetNode) return offset + targetOffset
    offset += node.textContent?.length ?? 0
    node = walker.nextNode()
  }
  return offset
}

/** Walks up from a selection endpoint to the paragraph element that carries
 * data-paragraph-index (set by DocumentReader on each rendered <p>). */
function closestParagraphElement(node: Node): HTMLElement | null {
  let el: HTMLElement | null = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement)
  while (el) {
    if (el.dataset.paragraphIndex !== undefined) return el
    el = el.parentElement
  }
  return null
}

export interface ResolvedSelection {
  start: number
  end: number
}

/**
 * Maps the current window selection to global offsets into a document's
 * joined text (see joinParagraphs/getParagraphStartOffsets in
 * shared/text.ts), given each paragraph's start offset. Returns null if
 * there's no usable (non-collapsed, in-reader) selection.
 */
export function resolveSelectionOffsets(paragraphStartOffsets: number[]): ResolvedSelection | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)

  const startParagraphEl = closestParagraphElement(range.startContainer)
  const endParagraphEl = closestParagraphElement(range.endContainer)
  if (!startParagraphEl || !endParagraphEl) return null

  const startIndex = Number(startParagraphEl.dataset.paragraphIndex)
  const endIndex = Number(endParagraphEl.dataset.paragraphIndex)
  const startOffsetInParagraph = getTextOffsetWithinElement(
    startParagraphEl,
    range.startContainer,
    range.startOffset
  )
  const endOffsetInParagraph = getTextOffsetWithinElement(endParagraphEl, range.endContainer, range.endOffset)

  const start = paragraphStartOffsets[startIndex] + startOffsetInParagraph
  const end = paragraphStartOffsets[endIndex] + endOffsetInParagraph
  if (end <= start) return null
  return { start, end }
}
