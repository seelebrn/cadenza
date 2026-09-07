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
  onStartMove: (e: React.MouseEvent) => void
  onStartResize: (e: React.MouseEvent) => void
}

function ClusterFrame({
  cluster,
  category,
  depth,
  dragState,
  liveDelta,
  resizePreview,
  onStartMove,
  onStartResize
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
        className="absolute rounded-lg border-2 border-dashed"
        style={{
          left: x,
          top: y,
          width,
          height,
          borderColor: category.color,
          backgroundColor: `${category.color}${fillOpacityForDepth(depth)}`
        }}
      >
      <div
        className="flex cursor-move items-center gap-1 rounded-t-md px-2 py-1 text-xs text-white"
        style={{ backgroundColor: category.color }}
        onMouseDown={onStartMove}
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
          e.stopPropagation()
          onStartResize(e)
        }}
      />
      </div>
    </>
  )
}

export default ClusterFrame
