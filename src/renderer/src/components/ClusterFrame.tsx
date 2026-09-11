import { useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import type { BoardCluster, CategoryRecord } from '@shared/types'
import type { DragState } from './boardDragTypes'
import { MIN_CLUSTER_HEIGHT, MIN_CLUSTER_WIDTH } from './boardLayoutConstants'

// A root cluster's fill stays subtle (this is also what a lone,
// un-nested cluster has always looked like). Each nesting level below
// that gets a visibly more opaque fill of the *same* color, so a nested
// cluster reads as a distinct layer sitting on top of its parent instead
// of blending into it — position/size alone (a thin padding gap) wasn't
// enough to actually see the containment at a glance.
const CLUSTER_FILL_OPACITY_BY_DEPTH = ['0f', '26', '3d', '54']

function fillOpacityForDepth(depth: number): string {
  return CLUSTER_FILL_OPACITY_BY_DEPTH[Math.min(depth, CLUSTER_FILL_OPACITY_BY_DEPTH.length - 1)]
}

// Fixed accent for "you're about to become a child of the cluster being
// resized" — deliberately NOT the cluster's own color (which is already
// used for its border/fill and wouldn't stand out against them), and
// distinct from a nest-target's highlight (that one reuses the dragged
// cluster's own color, since it's a more direct "drop here" cue).
const ENCLOSED_BY_RESIZE_COLOR = '#3b82f6'

interface ClusterFrameProps {
  cluster: BoardCluster
  category: CategoryRecord
  /** How many parentCategoryId hops up to a root — drives the fill
   * opacity below so nesting is visually obvious, not just positionally
   * correct. */
  depth: number
  dragState: DragState | null
  liveDelta: { dx: number; dy: number }
  /** Set while another cluster is being dragged over this one and would
   * nest into it on drop — the size this frame would grow to, shown as a
   * ghost outline so the resize isn't a surprise once committed. */
  resizePreview: { width: number; height: number } | null
  /** True while another cluster is being dragged onto this one and would
   * nest into it on drop (independent of resizePreview, which stays null
   * when this frame is already roomy enough not to need the ghost — still
   * the target, still worth flagging clearly). */
  isNestTarget: boolean
  /** True while a *different* cluster is being resized and this one is
   * currently fully enclosed by that growing frame — it's about to become
   * that cluster's child on release. */
  isEnclosedByResize: boolean
  /** While true, the header's mousedown picks this cluster as a link
   * endpoint (onPick) instead of starting a move — link-mode and the
   * normal drag-to-nest gesture would otherwise be indistinguishable, both
   * starting from the same mousedown. */
  isLinkMode: boolean
  /** True while this cluster is the already-picked "from" end of a link
   * being drawn — highlighted so it's clear which one a second click will
   * connect to. */
  isLinkPicked: boolean
  onStartMove: (e: React.MouseEvent) => void
  onStartResize: (e: React.MouseEvent) => void
  onPick: () => void
}

function ClusterFrame({
  cluster,
  category,
  depth,
  dragState,
  liveDelta,
  resizePreview,
  isNestTarget,
  isEnclosedByResize,
  isLinkMode,
  isLinkPicked,
  onStartMove,
  onStartResize,
  onPick
}: ClusterFrameProps): JSX.Element {
  const renameCategory = useProjectStore((s) => s.renameCategory)
  const setCategoryColor = useProjectStore((s) => s.setCategoryColor)
  const deleteCluster = useProjectStore((s) => s.deleteCluster)

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(category.name)

  const isMoving = dragState?.kind === 'cluster-move' && dragState.groupClusterIds.includes(cluster.id)
  const isResizing = dragState?.kind === 'cluster-resize' && dragState.id === cluster.id
  const x = isMoving ? cluster.x + liveDelta.dx : cluster.x
  const y = isMoving ? cluster.y + liveDelta.dy : cluster.y
  const width = isResizing ? Math.max(MIN_CLUSTER_WIDTH, cluster.width + liveDelta.dx) : cluster.width
  const height = isResizing ? Math.max(MIN_CLUSTER_HEIGHT, cluster.height + liveDelta.dy) : cluster.height

  function commitRename(): void {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== category.name) renameCategory(category.id, trimmed)
    setIsEditingName(false)
  }

  return (
    <>
      {resizePreview && (
        <div
          className="pointer-events-none absolute rounded-lg border-2 border-dashed"
          style={{
            left: x,
            top: y,
            width: resizePreview.width,
            height: resizePreview.height,
            borderColor: category.color,
            backgroundColor: `${category.color}20`
          }}
        />
      )}
      <div
        className={`absolute select-none rounded-lg border-2 ${
          isNestTarget || isEnclosedByResize ? 'border-solid' : 'border-dashed'
        }`}
        style={{
          left: x,
          top: y,
          width,
          height,
          borderColor: isEnclosedByResize ? ENCLOSED_BY_RESIZE_COLOR : category.color,
          backgroundColor: `${category.color}${fillOpacityForDepth(depth)}`,
          boxShadow: isNestTarget
            ? `0 0 0 3px ${category.color}`
            : isEnclosedByResize
              ? `0 0 0 3px ${ENCLOSED_BY_RESIZE_COLOR}`
              : isLinkPicked
                ? `0 0 0 3px #0ea5e9`
                : undefined,
          cursor: isLinkMode ? 'crosshair' : undefined
        }}
      >
        {isLinkPicked && (
          <span className="pointer-events-none absolute -top-2.5 left-1 whitespace-nowrap rounded bg-sky-500 px-1.5 py-0.5 text-[9px] font-medium text-white shadow">
            Click another cluster to link
          </span>
        )}
        {isNestTarget && (
          <span
            className="pointer-events-none absolute -top-2.5 right-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-medium text-white shadow"
            style={{ backgroundColor: category.color }}
          >
            Drop to nest here
          </span>
        )}
        {isEnclosedByResize && (
          <span
            className="pointer-events-none absolute -top-2.5 right-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-medium text-white shadow"
            style={{ backgroundColor: ENCLOSED_BY_RESIZE_COLOR }}
          >
            Will become a child
          </span>
        )}
      <div
        className="flex cursor-move select-none items-center gap-1 rounded-t-md px-2 py-1 text-xs text-white"
        style={{ backgroundColor: category.color }}
        onMouseDown={(e) => {
          // Left button only — a right-click here shouldn't also start a
          // move (right-click has no cluster-level action yet, but a
          // stray move/resize is exactly the kind of left-click-leaking-
          // through-a-right-click bug already fixed once for board item
          // cards; guarding it here too keeps the whole board consistent).
          if (e.button !== 0) return
          // Link mode replaces the drag gesture entirely rather than
          // racing it — dragging one cluster onto another already means
          // "nest it", so a click-to-link gesture on the same mousedown
          // would be ambiguous with that.
          if (isLinkMode) {
            e.preventDefault()
            onPick()
            return
          }
          onStartMove(e)
        }}
        // The name/emoji in here are plain text, so a mousedown-then-move
        // gesture starting on top of them can be interpreted as a native
        // "drag this selected text" instead of (or racing) our own
        // mousemove-driven drag below. When that happens the OS shows the
        // "no-drop" cursor and, worse, swallows the mouseup that our
        // mousemove effect's window listener is waiting for — so the move
        // never commits and the cluster appears to snap back to where it
        // started. select-none (above) stops the selection that triggers
        // it; this is the belt-and-suspenders backstop in case a selection
        // already existed before the mousedown.
        onDragStart={(e) => e.preventDefault()}
      >
        <input
          type="color"
          className="h-3 w-3 flex-shrink-0 cursor-pointer border-0 bg-transparent p-0"
          value={category.color}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setCategoryColor(category.id, e.target.value)}
        />
        <span className="flex-shrink-0 rounded bg-black/20 px-1 text-[9px] uppercase">
          {category.kind === 'question' ? '❓' : '🏷'}
        </span>
        {isEditingName ? (
          <input
            autoFocus
            className="min-w-0 flex-1 rounded border-0 px-1 text-xs text-slate-900"
            value={nameDraft}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => e.key === 'Enter' && commitRename()}
          />
        ) : (
          <button
            className="min-w-0 flex-1 truncate text-left font-medium"
            onDoubleClick={(e) => {
              e.stopPropagation()
              setNameDraft(category.name)
              setIsEditingName(true)
            }}
            title={category.parentCategoryId ? 'Nested under a superordinate cluster' : undefined}
          >
            {category.name}
            {category.parentCategoryId ? ' ↰' : ''}
          </button>
        )}
        <button
          className="flex-shrink-0 text-white/80 hover:text-white"
          title="Remove from this board (the cluster itself is kept)"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => deleteCluster(cluster.id)}
        >
          ×
        </button>
      </div>
      <div
        className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize"
        style={{ backgroundColor: category.color }}
        onMouseDown={(e) => {
          if (e.button !== 0) return // left button only, same reasoning as the header's move handler above
          e.stopPropagation()
          onStartResize(e)
        }}
      />
      </div>
    </>
  )
}

export default ClusterFrame
