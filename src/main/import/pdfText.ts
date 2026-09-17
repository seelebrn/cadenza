/** Turns the positioned text runs pdf.js extracts from a PDF page into
 * paragraphs — the part of PDF import that's actually ours, kept pure and
 * separate from the pdf.js call so it can be tested on synthetic runs.
 *
 * A PDF has no paragraphs, only runs of text at (x, y) positions; an OCR'd
 * scan is the hardest case, since its text layer is whatever the OCR engine
 * emitted (often one run per word or per line, with uneven spacing). So:
 * runs are grouped into lines by vertical position, lines are joined into
 * paragraphs, and a paragraph break is inferred from a vertical gap clearly
 * larger than the usual line spacing on that page (a blank line, a new
 * section). Every page ends a paragraph. Hyphenated line ends are joined
 * back into one word. */

export interface TextRun {
  text: string
  /** Baseline position, PDF user space (y grows upward). */
  x: number
  y: number
  /** Glyph height — roughly the font size; used to tell "same line" and
   * "one line's spacing" apart from a real gap. */
  height: number
  /** pdf.js sets this when a run ends a line in the content stream. */
  hasEOL?: boolean
}

export interface PageText {
  runs: TextRun[]
}

/** Ratio of a line's height above which a vertical gap counts as a
 * paragraph break rather than ordinary line spacing. Single-spaced text
 * has gaps of ~1.0-1.3 line heights between baselines; a blank line
 * roughly doubles that. */
const PARAGRAPH_GAP_RATIO = 1.7
/** Runs whose baselines differ by less than this fraction of a line's
 * height are on the same line (superscripts, OCR jitter). */
const SAME_LINE_RATIO = 0.5

interface Line {
  y: number
  height: number
  text: string
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function linesOf(page: PageText): Line[] {
  const runs = page.runs.filter((r) => r.text.trim() !== '')
  if (runs.length === 0) return []
  // Reading order: top of the page first (y descends), left to right.
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: Array<{ y: number; height: number; runs: TextRun[] }> = []
  for (const run of sorted) {
    const current = lines[lines.length - 1]
    const tolerance = Math.max(current?.height ?? 0, run.height, 1) * SAME_LINE_RATIO
    if (current && Math.abs(current.y - run.y) <= tolerance) {
      current.runs.push(run)
      current.height = Math.max(current.height, run.height)
    } else {
      lines.push({ y: run.y, height: run.height, runs: [run] })
    }
  }
  return lines.map((line) => {
    const ordered = [...line.runs].sort((a, b) => a.x - b.x)
    let text = ''
    for (const run of ordered) {
      const piece = run.text
      if (text === '') text = piece
      else if (/\s$/.test(text) || /^\s/.test(piece)) text += piece
      else text += ` ${piece}`
    }
    return { y: line.y, height: line.height, text: text.replace(/\s+/g, ' ').trim() }
  })
}

function appendLine(paragraph: string, line: string): string {
  if (paragraph === '') return line
  // "inter-\nview" → "interview"; a real hyphenated compound split across
  // lines loses its hyphen too, the far rarer case.
  if (/[A-Za-zÀ-ÿ]-$/.test(paragraph) && /^[a-zà-ÿ]/.test(line)) return paragraph.slice(0, -1) + line
  return `${paragraph} ${line}`
}

export function reconstructParagraphs(pages: PageText[]): string[] {
  const paragraphs: string[] = []
  for (const page of pages) {
    const lines = linesOf(page)
    if (lines.length === 0) continue
    const gaps = lines.slice(1).map((line, i) => lines[i].y - line.y)
    const lineHeight = median(lines.map((l) => l.height)) || 1
    // The page's ordinary line spacing is its *smallest* plausible gap (at
    // least about half a line — anything tighter was already merged as one
    // line), not the median: on a short page of two paragraphs, half the
    // gaps are paragraph breaks and a median would hide them.
    const plausible = gaps.filter((g) => g >= lineHeight * SAME_LINE_RATIO)
    const usualGap = plausible.length > 0 ? Math.min(...plausible) : lineHeight
    const breakAt = Math.max(usualGap, lineHeight) * PARAGRAPH_GAP_RATIO

    let current = ''
    lines.forEach((line, i) => {
      const gap = i === 0 ? 0 : lines[i - 1].y - line.y
      if (i > 0 && gap > breakAt) {
        if (current) paragraphs.push(current)
        current = ''
      }
      current = appendLine(current, line.text)
    })
    if (current) paragraphs.push(current)
  }
  return paragraphs.map((p) => p.trim()).filter((p) => p.length > 0)
}
