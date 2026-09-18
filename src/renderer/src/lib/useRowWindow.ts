import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject, UIEvent } from 'react'

export interface RowWindow {
  /** Goes on the scrolling element. */
  scrollRef: RefObject<HTMLDivElement>
  /** Goes on the <tbody> whose rows are windowed. */
  bodyRef: RefObject<HTMLTableSectionElement>
  /** Goes on the scrolling element's onScroll. */
  onScroll: (e: UIEvent<HTMLDivElement>) => void
  /** Render rows [firstRow, lastRow), each marked `data-row`, between two
   * spacer rows of `spacerBefore` / `spacerAfter` px. */
  firstRow: number
  lastRow: number
  spacerBefore: number
  spacerAfter: number
  viewportWidth: number
}

/** Rows drawn beyond the visible ones, above and below, so a fast scroll
 * doesn't flash empty space. */
const OVERSCAN_ROWS = 12

/**
 * Windowing for a long table of equal-height rows: only the rows in view
 * (plus a margin) are rendered, the rest stands as two spacer rows. A table
 * of 500 codes otherwise costs hundreds of milliseconds to draw, and again
 * on every change to it. The row height is measured from a rendered row;
 * the scroll position is tracked in whole rows, so scrolling re-renders
 * only when a new row comes into range, not on every pixel.
 */
export function useRowWindow(rowCount: number, estimatedRowHeight = 33): RowWindow {
  const scrollRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLTableSectionElement>(null)
  const [scrolledRows, setScrolledRows] = useState(0)
  const [viewport, setViewport] = useState({ width: 1600, height: 800 })
  const [rowHeight, setRowHeight] = useState(estimatedRowHeight)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setViewport({ width: el.clientWidth, height: el.clientHeight }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const height = bodyRef.current?.querySelector('tr[data-row]')?.getBoundingClientRect().height
    if (height && Math.abs(height - rowHeight) > 0.5) setRowHeight(height)
  })

  function onScroll(e: UIEvent<HTMLDivElement>): void {
    const bodyTop = bodyRef.current?.offsetTop ?? 0
    setScrolledRows(Math.max(0, Math.floor((e.currentTarget.scrollTop - bodyTop) / rowHeight)))
  }

  // A shorter list (a filter applied) may leave the scroll position past its end.
  const scrolled = Math.min(scrolledRows, Math.max(0, rowCount - 1))
  const firstRow = Math.max(0, scrolled - OVERSCAN_ROWS)
  const lastRow = Math.min(rowCount, scrolled + Math.ceil(viewport.height / rowHeight) + OVERSCAN_ROWS)
  return {
    scrollRef,
    bodyRef,
    onScroll,
    firstRow,
    lastRow,
    spacerBefore: firstRow * rowHeight,
    spacerAfter: (rowCount - lastRow) * rowHeight,
    viewportWidth: viewport.width
  }
}
