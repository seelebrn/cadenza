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
