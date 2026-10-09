/**
 * Where to draw the board's large cluster names when it is zoomed far out
 * (below OVERVIEW_LABEL_ZOOM), where the clusters' own headers are too
 * small to read. Every cluster whose name fits inside it on screen gets
 * one, whatever its depth: the more the board is zoomed in, the deeper the
 * names that show. A name wraps onto at most two lines rather than being
 * cut at the frame's width, and a name that would land on one already
 * placed (a child's on its parent's, at the same top-left corner) slides
 * down below it, or is left out if its cluster has no room for it there.
 *
 * Pure — sizes are worked out in screen pixels from `measure`, which gives
 * a string's on-screen width at a font size; positions come back in canvas
 * units, ready to be drawn inside the zoomed canvas.
 */

export interface OverviewLabelInput {
  id: string
  x: number
  y: number
  width: number
  height: number
  depth: number
  text: string
  /** A smaller line under the name (e.g. what the cluster holds), shown
   * only when there is room for it. */
  detail?: string
}

export interface OverviewLabel {
  id: string
  /** Canvas units. */
  x: number
  y: number
  /** Screen pixels. */
  fontPx: number
  lines: string[]
  detail?: string
  detailFontPx: number
  /** Screen pixels, padding included. */
  widthPx: number
  heightPx: number
}

export type MeasureText = (text: string, fontPx: number) => number

const FONT_PX_BY_DEPTH = [18, 14, 12, 11]
export const OVERVIEW_LINE_HEIGHT = 1.25
export const OVERVIEW_PAD_X = 7
export const OVERVIEW_PAD_Y = 3
/** A top-level name may overhang its cluster up to this width (screen
 * pixels), so it is never squeezed into a sliver at the far-out end. */
const ROOT_MIN_WIDTH_PX = 240
/** Gap kept between a name and the edge of its cluster / the name above. */
const INSET_PX = 2
const MAX_LINES = 2

export function fontPxForDepth(depth: number): number {
  return FONT_PX_BY_DEPTH[Math.min(depth, FONT_PX_BY_DEPTH.length - 1)]
}

/** `text` cut to fit `maxWidth`, with an ellipsis if anything was cut. */
function truncateToWidth(text: string, maxWidth: number, fontPx: number, measure: MeasureText): string {
  if (measure(text, fontPx) <= maxWidth) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (measure(text.slice(0, mid).trimEnd() + '…', fontPx) <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return lo === 0 ? '' : text.slice(0, lo).trimEnd() + '…'
}

/** Greedy word wrap to `maxLines` lines of at most `maxWidth`; the last line
 * is cut with an ellipsis if the text does not fit. `complete` is false when
 * anything had to be cut. */
export function wrapText(
  text: string,
  maxWidth: number,
  fontPx: number,
  measure: MeasureText,
  maxLines = MAX_LINES
): { lines: string[]; complete: boolean } {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  let i = 0
  for (; i < words.length; i++) {
    const candidate = current ? `${current} ${words[i]}` : words[i]
    if (measure(candidate, fontPx) <= maxWidth) {
      current = candidate
      continue
    }
    if (!current) {
      // A single word wider than the line.
      lines.push(truncateToWidth(words[i], maxWidth, fontPx, measure))
      return { lines, complete: false }
    }
    lines.push(current)
    current = words[i]
    if (lines.length === maxLines - 1) {
      // Last line: whatever is left.
      const rest = words.slice(i).join(' ')
      const last = truncateToWidth(rest, maxWidth, fontPx, measure)
      lines.push(last)
      return { lines, complete: last === rest }
    }
  }
  if (current) lines.push(current)
  return { lines, complete: true }
}

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

export function layoutOverviewLabels(
  inputs: OverviewLabelInput[],
  zoom: number,
  measure: MeasureText
): OverviewLabel[] {
  // Outer clusters first, so their names win the top-left corners; then
  // the bigger ones, so a small cluster's name is the one that gives way.
  const ordered = [...inputs].sort(
    (a, b) => a.depth - b.depth || b.width * b.height - a.width * a.height || a.y - b.y || a.x - b.x
  )
  const placed: Rect[] = []
  const labels: OverviewLabel[] = []

  for (const input of ordered) {
    const label = placeLabel(input, zoom, measure, placed)
    if (!label) continue
    placed.push({ left: label.x * zoom, top: label.y * zoom, right: label.x * zoom + label.widthPx, bottom: label.y * zoom + label.heightPx })
    labels.push(label)
  }
  return labels
}

/** A top-level name is tried at smaller sizes before being left out. */
const ROOT_FONT_STEPS = [0, 4, 6]

function placeLabel(input: OverviewLabelInput, zoom: number, measure: MeasureText, placed: Rect[]): OverviewLabel | null {
  const isRoot = input.depth === 0
  const sx = input.x * zoom
  const sy = input.y * zoom
  const sw = input.width * zoom
  const sh = input.height * zoom
  const inset = isRoot ? 0 : INSET_PX
  const bottomLimit = sy + sh - inset
  const left = sx + inset

  for (const step of isRoot ? ROOT_FONT_STEPS : [0]) {
    const fontPx = fontPxForDepth(input.depth) - step
    const boxMaxWidth = isRoot ? Math.max(sw, ROOT_MIN_WIDTH_PX) : sw - 2 * inset
    const textMaxWidth = boxMaxWidth - 2 * OVERVIEW_PAD_X
    if (textMaxWidth < fontPx * 2.5) continue

    const { lines, complete } = wrapText(input.text, textMaxWidth, fontPx, measure)
    // A nested name is shown whole or not at all (zooming in shows it); a
    // top-level one may be cut.
    if (!isRoot && !complete) continue
    if (lines.length === 0 || lines[0] === '') continue

    const detailFontPx = Math.max(10, fontPx - 4)
    let detail = input.detail
    if (detail && measure(detail, detailFontPx) > textMaxWidth) detail = undefined
    const textWidth = Math.max(...lines.map((l) => measure(l, fontPx)), detail ? measure(detail, detailFontPx) : 0)
    const widthPx = Math.ceil(textWidth) + 2 * OVERVIEW_PAD_X
    const namePx = lines.length * fontPx * OVERVIEW_LINE_HEIGHT + 2 * OVERVIEW_PAD_Y
    const detailPx = detailFontPx * OVERVIEW_LINE_HEIGHT

    let top = sy + inset
    let heightPx = detail ? namePx + detailPx : namePx
    for (;;) {
      const rect = { left, top, right: left + widthPx, bottom: top + heightPx }
      const hits = placed.filter((p) => overlaps(p, rect))
      // A top-level name may be taller than its (small) cluster, as long
      // as it sits on the cluster's corner and covers no other name.
      const overflows = top + heightPx > bottomLimit && !(isRoot && top === sy)
      if (overflows && detail) {
        // Drop the detail line before giving up on the name.
        detail = undefined
        heightPx = namePx
        continue
      }
      if (overflows) break
      if (hits.length === 0) {
        return { id: input.id, x: left / zoom, y: top / zoom, fontPx, lines, detail, detailFontPx, widthPx, heightPx }
      }
      top = Math.max(...hits.map((h) => h.bottom)) + INSET_PX
    }
  }
  return null
}
