import { useEffect, useMemo, useRef, useState } from 'react'
import type { CategoryRecord } from '@shared/types'

const MIN_ZOOM = 0.4
const MAX_ZOOM = 1.6

interface BoardPlanViewProps {
  /** The clusters to map — every category on the default board, or the
   * ones placed on a curated board. */
  categories: CategoryRecord[]
  /** A cluster was clicked: show it on the board. */
  onPick: (categoryId: string) => void
}

interface PlanNode {
  category: CategoryRecord
  children: PlanNode[]
}

/**
 * The board's "Plan": every cluster reduced to its name and what it holds,
 * nested, with no cards — a map of the project's structure. Unlike the
 * board it is laid out by the page itself (boxes wrap like words in a
 * paragraph, each as wide as its name), so every name is shown whole at a
 * readable size however many clusters there are; it gives up the board's
 * spatial arrangement for that. Read-only: clicking a cluster goes back to
 * the board, framed on it. Ctrl/Cmd+wheel zooms (the boxes re-wrap to the
 * width).
 */
function BoardPlanView({ categories, onPick }: BoardPlanViewProps): JSX.Element {
  const roots = useMemo(() => {
    const ids = new Set(categories.map((c) => c.id))
    const nodes = new Map<string, PlanNode>(categories.map((c) => [c.id, { category: c, children: [] }]))
    const top: PlanNode[] = []
    for (const node of nodes.values()) {
      const parentId = node.category.parentCategoryId
      if (parentId && ids.has(parentId)) nodes.get(parentId)!.children.push(node)
      else top.push(node)
    }
    return top
  }, [categories])

  const scrollRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [viewportWidth, setViewportWidth] = useState(1200)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setViewportWidth(el.clientWidth))
    observer.observe(el)
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      observer.disconnect()
      el.removeEventListener('wheel', onWheel)
    }
  }, [])

  if (roots.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
        No clusters on this board yet — the plan shows clusters only.
      </div>
    )
  }

  const renderNode = (node: PlanNode, depth: number): JSX.Element => {
    const { category } = node
    const counts = [
      category.codeIds.length ? `${category.codeIds.length} code${category.codeIds.length === 1 ? '' : 's'}` : '',
      category.noteIds.length ? `${category.noteIds.length} note${category.noteIds.length === 1 ? '' : 's'}` : ''
    ]
      .filter(Boolean)
      .join(' · ')
    return (
      <div
        key={category.id}
        className="flex max-w-full flex-col overflow-hidden rounded-md border-2"
        style={{ borderColor: category.color, backgroundColor: `${category.color}${depth === 0 ? '12' : '1c'}` }}
      >
        <button
          className={`flex items-baseline gap-1.5 px-2 py-0.5 text-left text-white hover:brightness-110 ${depth === 0 ? 'text-base font-semibold' : depth === 1 ? 'text-sm font-semibold' : 'text-xs font-medium'}`}
          style={{ backgroundColor: category.color }}
          title="Show this cluster on the board"
          onClick={() => onPick(category.id)}
        >
          <span>
            {category.kind === 'question' ? '❓ ' : ''}
            {category.name}
          </span>
          {counts && <span className="whitespace-nowrap text-[10px] font-normal opacity-90">{counts}</span>}
        </button>
        {node.children.length > 0 && (
          <div className="flex flex-wrap items-start gap-1.5 p-1.5">{node.children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="relative flex-1 overflow-auto bg-slate-50" data-board-plan="">
      <div
        className="flex flex-wrap items-start gap-3 p-4"
        style={{ width: viewportWidth / zoom, transform: `scale(${zoom})`, transformOrigin: '0 0' }}
      >
        {roots.map((root) => renderNode(root, 0))}
      </div>
      <div className="pointer-events-none fixed bottom-4 right-6 rounded bg-white/90 px-2 py-1 text-[11px] text-slate-500 shadow">
        Plan · {Math.round(zoom * 100)}% · Ctrl+wheel to zoom · click a cluster to show it on the board
      </div>
    </div>
  )
}

export default BoardPlanView
