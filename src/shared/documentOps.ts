// Editing an imported document's text after the fact (fixing a transcription
// error, redacting a name, etc.) without corrupting existing codings/notes,
// which anchor on character offsets into the document's joined text.
//
// Strategy per edited paragraph: find the common prefix/suffix between the
// old and new paragraph text — the "hole" between them is what actually
// changed. Segments entirely before or after that hole just shift by the
// length delta (exact, no ambiguity). A segment overlapping the hole tries
// to relocate by finding its own verbatim text unchanged elsewhere in the
// new paragraph (handles "the edit was near my segment but didn't actually
// touch it" cases the prefix/suffix heuristic alone can't rule out); failing
// that, it's clamped into valid bounds as a best effort. The verbatim
// Segment.text snapshot is never rewritten by an edit — it's the historical
// record of what was coded, independent of where it currently sits.

import { getParagraphStartOffsets } from './text'
import type { ProjectData, Segment } from './types'

export function computePrefixSuffixDiff(
  oldText: string,
  newText: string
): { prefixLen: number; suffixLen: number } {
  const maxPrefix = Math.min(oldText.length, newText.length)
  let prefixLen = 0
  while (prefixLen < maxPrefix && oldText[prefixLen] === newText[prefixLen]) prefixLen++

  const maxSuffix = maxPrefix - prefixLen
  let suffixLen = 0
  while (
    suffixLen < maxSuffix &&
    oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
  ) {
    suffixLen++
  }

  return { prefixLen, suffixLen }
}

function reanchorSegment(
  segment: Segment,
  paragraphStart: number,
  oldText: string,
  newText: string,
  lengthDelta: number,
  holeStartOld: number,
  holeEndOld: number
): Segment {
  if (segment.end <= paragraphStart) return segment // in an earlier paragraph
  if (segment.start >= paragraphStart + oldText.length) {
    return { ...segment, start: segment.start + lengthDelta, end: segment.end + lengthDelta } // in a later paragraph
  }
  // within the edited paragraph
  if (segment.end <= holeStartOld) return segment // entirely before the edited hole
  if (segment.start >= holeEndOld) {
    return { ...segment, start: segment.start + lengthDelta, end: segment.end + lengthDelta } // entirely after the hole
  }
  // overlaps the edited hole — try to relocate by verbatim text first
  const idx = newText.indexOf(segment.text)
  if (idx !== -1) {
    const newStart = paragraphStart + idx
    return { ...segment, start: newStart, end: newStart + segment.text.length }
  }
  // give up on precise relocation — clamp into valid bounds, keep the
  // verbatim snapshot as-is regardless of where it now visually lands
  const paragraphEnd = paragraphStart + newText.length
  const clampedStart = Math.min(segment.start, paragraphEnd)
  const clampedEnd = Math.min(Math.max(segment.end + lengthDelta, clampedStart), paragraphEnd)
  return { ...segment, start: clampedStart, end: clampedEnd }
}

/** Replaces one paragraph's text and re-anchors every segment in the
 * document accordingly. No-ops if the document/paragraph doesn't exist or
 * the text is unchanged. */
export function editParagraph(
  data: ProjectData,
  documentId: string,
  paragraphIndex: number,
  newText: string
): ProjectData {
  const document = data.documents.find((d) => d.id === documentId)
  if (!document) return data
  const oldText = document.paragraphs[paragraphIndex]
  if (oldText === undefined || oldText === newText) return data

  const paragraphStart = getParagraphStartOffsets(document.paragraphs)[paragraphIndex]
  const lengthDelta = newText.length - oldText.length
  const { prefixLen, suffixLen } = computePrefixSuffixDiff(oldText, newText)
  const holeStartOld = paragraphStart + prefixLen
  const holeEndOld = paragraphStart + oldText.length - suffixLen

  const documents = data.documents.map((d) =>
    d.id === documentId
      ? { ...d, paragraphs: d.paragraphs.map((p, i) => (i === paragraphIndex ? newText : p)) }
      : d
  )
  const segments = data.segments.map((segment) =>
    segment.documentId === documentId
      ? reanchorSegment(segment, paragraphStart, oldText, newText, lengthDelta, holeStartOld, holeEndOld)
      : segment
  )

  return { ...data, documents, segments }
}

export function renameDocument(data: ProjectData, documentId: string, title: string): ProjectData {
  return {
    ...data,
    documents: data.documents.map((d) => (d.id === documentId ? { ...d, title } : d))
  }
}
