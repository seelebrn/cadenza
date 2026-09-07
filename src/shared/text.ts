/** Shared conventions for turning a document's paragraphs into the single
 * string that Segment start/end offsets are measured against. Keeping this
 * in one place means the reader pane, the future coding engine, and any
 * verbatim-extraction logic all agree on the same join. */

export const PARAGRAPH_JOIN = '\n\n'

export function joinParagraphs(paragraphs: string[]): string {
  return paragraphs.join(PARAGRAPH_JOIN)
}

/**
 * Splits raw extracted text (plain .txt files, or a document's flattened
 * text) into trimmed, non-empty paragraphs. Prefers blank-line boundaries;
 * falls back to splitting on every line break when the text has none (e.g.
 * one turn per line with no blank separators, common in transcripts).
 */
export function splitIntoParagraphs(rawText: string): string[] {
  const normalized = rawText.replace(/\r\n/g, '\n')
  const hasBlankLineBreaks = /\n\s*\n/.test(normalized)
  const rawParagraphs = hasBlankLineBreaks ? normalized.split(/\n\s*\n/) : normalized.split('\n')
  return rawParagraphs.map((p) => p.trim()).filter((p) => p.length > 0)
}

/** Up to `wordCount` whole words immediately before `start` and immediately
 * after `end` in `fullText` — used to show a verbatim quote "in context"
 * (e.g. the code-usage info window's expand-context checkbox). Clamps
 * naturally at the start/end of the document (fewer words, never an error)
 * since there's nothing before the first word or after the last. */
export function getSurroundingWords(
  fullText: string,
  start: number,
  end: number,
  wordCount: number
): { before: string; after: string } {
  const beforeWords = fullText.slice(0, start).trim().split(/\s+/).filter(Boolean)
  const afterWords = fullText.slice(end).trim().split(/\s+/).filter(Boolean)
  return {
    before: beforeWords.slice(Math.max(0, beforeWords.length - wordCount)).join(' '),
    after: afterWords.slice(0, wordCount).join(' ')
  }
}

/** The offset each paragraph starts at within joinParagraphs(paragraphs) —
 * i.e. where Segment.start/end for that paragraph's text begin counting
 * from. Used to map a DOM selection inside one rendered paragraph back to a
 * global offset into the joined text. */
export function getParagraphStartOffsets(paragraphs: string[]): number[] {
  const offsets: number[] = []
  let cursor = 0
  for (const paragraph of paragraphs) {
    offsets.push(cursor)
    cursor += paragraph.length + PARAGRAPH_JOIN.length
  }
  return offsets
}
