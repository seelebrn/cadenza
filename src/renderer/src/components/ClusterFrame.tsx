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
// The opposite cue: "the cluster being resized is about to let you go" —
// a nested cluster no longer fully inside the shrinking frame, detached on
// release. Amber, so it reads as a warning-ish change rather than the
// blue "joining" one.
const EXCLUDED_BY_RESIZE_COLOR = '#d97706'

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
  /** True while this cluster's own superordinate is being resized and this
   * one no longer fully fits inside the shrinking frame — it's about to be
   * detached (become top-level) on release. */
  isExcludedByResize: boolean
  /** While true, the header's mousedown picks this cluster as a link
   * endpoint (onPick) instead of starting a move — link-mode and the
   * normal drag-to-nest gesture would otherwise be indistinguishable, both
   * starting from the same mousedown. */
  isLinkMode: boolean
  /** True while this cluster is the already-picked "from" end of a link
   * being drawn — highlighted so it's clear which one a second click will
   * connect to. */
  isLinkPicked: boolean
  /** True on the default board, where every category always shows as a
   * cluster frame automatically (see getVisibleBoardClusters) — there's no
   * "remove from this board" to do there: deleting the underlying
   * BoardCluster shape would just make it reappear at its computed
   * fallback position, not disappear. So the × means something different
   * there: delete the category itself from the whole project (its codes/
   * notes are kept, just unfiled) rather than just this board's shape. */
  isDefaultBoard: boolean
  /** True while a *different* cluster is focused (hovered) and this one
   * isn't it and isn't directly linked to it — see focusConnectedCategoryIds
   * in BoardView. Fades this frame out rather than hiding it, so the rest
   * of the map's layout stays legible as context while attention narrows
   * to one cluster and its own relationships. */
  isDimmed: boolean
  /** The board's current zoom — the header (name + buttons) is counter-
   * scaled by it so it stays readable and clickable when zoomed far out,
   * where a 200-item board is actually worked on. */
  zoom: number
  /** Double-clicking the frame's own empty area: zoom the board to fit
   * this cluster. */
  onZoomTo: () => void
  onStartMove: (e: React.MouseEvent) => void
  onStartResize: (e: React.MouseEvent) => void
  onPick: () => void
  /** Fires true on hovering this frame, false on leaving it — drives the
   * thematic-map "focus" preview in BoardView. */
  onHoverChange: (hovering: boolean) => void
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
  isExcludedByResize,
  isLinkMode,
  isLinkPicked,
  isDefaultBoard,
  isDimmed,
  zoom,
  onZoomTo,
  onStartMove,
  onStartResize,
  onPick,
  onHoverChange
}: ClusterFrameProps): JSX.Element {
  // Map-style label: below 100% zoom the header's contents are scaled up
  // by the inverse of the zoom (capped), so on screen the name stays its
  // normal size — at 30% the bar itself is 8px tall and its text would be
  // a smudge otherwise. The bar keeps its layout height (the grid below
  // it is computed from CLUSTER_HEADER_HEIGHT); the scaled contents just
  // overhang it a little, still well above the first row of cards. Width
  // is clipped to the frame, so a long name truncates rather than spilling
  // over a neighbor (the full name is in the tooltip).
  const labelScale = Math.min(3.5, Math.max(1, 1 / zoom))
  const renameCategory = useProjectStore((s) => s.renameCategory)
  const openCategoryOnBoard = useProjectStore((s) => s.openCategoryOnBoard)
  const setCategoryColor = useProjectStore((s) => s.setCategoryColor)
  const deleteCluster = useProjectStore((s) => s.deleteCluster)
  const deleteCategory = useProjectStore((s) => s.deleteCategory)

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(category.name)
  // An inline confirm (swapping the × for a ✓/✕ pair) rather than
  // window.confirm() — see BoardView's confirmingDeleteBoard for why: a
  // native dialog's Windows/Electron focus-restoration quirk is the
  // leading suspect for a reported "delete something, then every text
  // field is unresponsive for a minute or so" freeze.
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false)

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
        className={`absolute select-none rounded-lg border-2 transition-opacity duration-150 ${
          isNestTarget || isEnclosedByResize || isExcludedByResize ? 'border-solid' : 'border-dashed'
        }`}
        style={{
          left: x,
          top: y,
          width,
          height,
          borderColor: isEnclosedByResize
            ? ENCLOSED_BY_RESIZE_COLOR
            : isExcludedByResize
              ? EXCLUDED_BY_RESIZE_COLOR
              : category.color,
          backgroundColor: `${category.color}${fillOpacityForDepth(depth)}`,
          boxShadow: isNestTarget
            ? `0 0 0 3px ${category.color}`
            : isEnclosedByResize
              ? `0 0 0 3px ${ENCLOSED_BY_RESIZE_COLOR}`
              : isExcludedByResize
                ? `0 0 0 3px ${EXCLUDED_BY_RESIZE_COLOR}`
                : isLinkPicked
                  ? `0 0 0 3px #0ea5e9`
                  : undefined,
          cursor: isLinkMode ? 'crosshair' : undefined,
          opacity: isDimmed ? 0.3 : 1
        }}
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => onHoverChange(false)}
        // Only the frame's own background — a double-click on a card, on
        // the header (which renames on the name), or on a nested frame
        // (which handles its own) must not also zoom to this one.
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget) onZoomTo()
        }}
        title="Double-click empty space in this cluster to zoom to it"
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
        {isExcludedByResize && (
          <span
            className="pointer-events-none absolute -top-2.5 right-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-medium text-white shadow"
            style={{ backgroundColor: EXCLUDED_BY_RESIZE_COLOR }}
          >
            Will be taken out
          </span>
        )}
      <div
        className="relative h-7 cursor-move select-none rounded-t-md text-xs text-white"
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
        <div
          className="absolute left-0 top-1/2 flex items-center gap-1 px-2"
          data-board-zoom-label=""
          data-frame-width={width}
          style={{
            width: width / labelScale,
            transform: `translateY(-50%) scale(${labelScale})`,
            transformOrigin: 'left center'
          }}
        >
        <input
          type="color"
          className="board-export-hide h-3 w-3 flex-shrink-0 cursor-pointer border-0 bg-transparent p-0"
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
            title={`${category.name}${category.parentCategoryId ? ' — nested under a superordinate cluster' : ''} (double-click to rename)`}
          >
            {category.name}
            {category.parentCategoryId ? ' ↰' : ''}
          </button>
        )}
        <button
          className="board-export-hide flex-shrink-0 text-[10px] text-white/80 hover:text-white"
          title="Open this cluster, its sub-clusters and their codes and notes on a board of their own"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => openCategoryOnBoard(category.id)}
        >
          ⧉
        </button>
        <button
          className="board-export-hide flex-shrink-0 text-white/80 hover:text-white"
          title={
            isDefaultBoard
              ? 'Delete this cluster from the whole project (its codes and notes are kept, just unfiled)'
              : 'Remove from this board (the cluster itself is kept)'
          }
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setIsConfirmingRemove(true)}
        >
          ×
        </button>
        </div>
      </div>

      {isConfirmingRemove && (
        <div
          className={`board-export-hide absolute left-0 top-full z-10 mt-1 w-56 rounded border p-2 text-[10px] shadow-lg ${
            isDefaultBoard ? 'border-red-300 bg-red-50 text-red-900' : 'border-slate-300 bg-white text-slate-700'
          }`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="mb-1.5">
            {isDefaultBoard
              ? `Delete "${category.name}" from the whole project? Its codes, notes, and quotes are NOT deleted — they just stop being grouped here. This also removes it from every other board.`
              : `Remove "${category.name}" from this board? The cluster itself — and its codes, notes, and quotes — will be kept; this only removes it from this board's layout.`}
          </p>
          <div className="flex justify-end gap-1.5">
            <button
              className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-slate-600 hover:bg-slate-100"
              onClick={() => setIsConfirmingRemove(false)}
            >
              Cancel
            </button>
            <button
              className={`rounded px-1.5 py-0.5 font-medium text-white ${
                isDefaultBoard ? 'bg-red-600 hover:bg-red-500' : 'bg-slate-700 hover:bg-slate-600'
              }`}
              onClick={() => {
                if (isDefaultBoard) deleteCategory(category.id)
                else deleteCluster(cluster.id)
                setIsConfirmingRemove(false)
              }}
            >
              {isDefaultBoard ? 'Delete cluster' : 'Remove'}
            </button>
          </div>
        </div>
      )}
      <div
        className="board-export-hide absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize"
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
