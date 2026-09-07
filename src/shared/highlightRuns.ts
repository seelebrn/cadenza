import type { Coding, Segment } from './types'

export interface ParagraphRun {
  text: string
  codingIds: string[]
}

export interface CodingWithSegment {
  coding: Coding
  segment: Segment
}

/**
 * Splits a paragraph's text into runs based on which codings' segments
 * overlap it, so the reader can render coded spans distinctly from plain
 * text. A run under more than one coding (overlapping codes) lists every
 * covering coding in codingIds — rendering picks how to represent that
 * (currently: the first one's color).
 */
export function computeParagraphRuns(
  paragraphText: string,
  paragraphGlobalStart: number,
  codingsWithSegments: CodingWithSegment[]
): ParagraphRun[] {
  const paragraphGlobalEnd = paragraphGlobalStart + paragraphText.length
  const relevant = codingsWithSegments.filter(
    ({ segment }) => segment.start < paragraphGlobalEnd && segment.end > paragraphGlobalStart
  )
  if (relevant.length === 0) return [{ text: paragraphText, codingIds: [] }]

  const clipped = relevant.map(({ coding, segment }) => ({
    coding,
    start: Math.max(segment.start, paragraphGlobalStart) - paragraphGlobalStart,
    end: Math.min(segment.end, paragraphGlobalEnd) - paragraphGlobalStart
  }))

  const points = new Set<number>([0, paragraphText.length])
  for (const c of clipped) {
    points.add(c.start)
    points.add(c.end)
  }
  const sorted = Array.from(points).sort((a, b) => a - b)

  const runs: ParagraphRun[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]
    const end = sorted[i + 1]
    if (start === end) continue
    const mid = (start + end) / 2
    const covering = clipped.filter((c) => mid >= c.start && mid < c.end)
    runs.push({
      text: paragraphText.slice(start, end),
      codingIds: covering.map((c) => c.coding.id)
    })
  }
  return runs
}
