import { useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { useProjectStore } from '../store/projectStore'
import { DRAG_KIND_MIME, SOURCE_CLUSTER_MIME } from '../lib/clusterTree'
import type { ClusterTreeNode } from '../lib/clusterTree'

interface ClusterRowShellProps {
  node: ClusterTreeNode
  depth: number
  /** Which drag-payload kind this row accepts as a new member, besides
   * another cluster (which every row accepts, to nest one cluster inside
   * another) — 'code' for the codebook tab's rows, 'note' for the notes
   * tab's. Also gates handleDrop so the wrong kind can't be filed here even
   * if it briefly ends up draggable over this row. */
  memberKind: 'code' | 'note'
  /** True when there's nothing to show below the header (no sub-clusters,
   * no matching members) — swaps in the "drag X onto this row" hint. */
  isEmpty: boolean
  emptyPlaceholder: string
  /** Count of this cluster's OTHER member kinds (e.g. a codebook row shows
   * notes+quotes filed here, since its own codes are already shown as
   * rows) — not itself computed here since which kinds count as "other"
   * depends on which tab this is. */
  otherMemberCount: number
  otherMemberTooltip: string
  onAddMember: (categoryId: string, memberId: string) => void
  onRemoveMember: (categoryId: string, memberId: string) => void
  /** The recursive child-cluster rows and this cluster's own member rows —
   * left to the caller since a codebook row's members are a hierarchical,
   * search-filtered code subtree and a notes row's are a flat,
   * document/category-filtered note list: different enough in shape that
   * computing them isn't something this shared shell should own. */
  children?: ReactNode
}

/** The row chrome shared by the codebook tab's ClusterRow and the notes
 * tab's NoteClusterRow: this is the same CategoryRecord the board draws as
 * a cluster frame, so dragging a member onto this row or nesting one
 * cluster onto another here is exactly what dragging on the board does,
 * just from a list instead of a canvas. Same data either way — there's
 * nothing separate to keep in sync. Everything about *which* members a
 * cluster has and how they're rendered stays with the two thin wrappers;
 * this shell only owns the header (color swatch, name edit, kind badge,
 * other-member-count badge, delete) and the drag/drop plumbing common to
 * both. */
function ClusterRowShell({
  node,
  depth,
  memberKind,
  isEmpty,
  emptyPlaceholder,
  otherMemberCount,
  otherMemberTooltip,
  onAddMember,
  onRemoveMember,
  children
}: ClusterRowShellProps): JSX.Element {
  const renameCategory = useProjectStore((s) => s.renameCategory)
  const setCategoryColor = useProjectStore((s) => s.setCategoryColor)
  const deleteCategory = useProjectStore((s) => s.deleteCategory)
  // Nesting one cluster onto another from either tree has no board-drag
  // position to derive a placement from, so it also reflows the default
  // board's cluster layout — same reasoning as the member add/remove
  // actions each wrapper passes in as onAddMember/onRemoveMember.
  const reparentCategory = useProjectStore((s) => s.reparentCategoryAndReflowBoard)
  const withBatch = useProjectStore((s) => s.withBatch)

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(node.name)
  const [isDragOver, setIsDragOver] = useState(false)

  function commitRename(): void {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== node.name) renameCategory(node.id, trimmed)
    setIsEditingName(false)
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const kind = e.dataTransfer.getData(DRAG_KIND_MIME)
    const draggedId = e.dataTransfer.getData('text/plain')
    if (!draggedId) return
    if (kind === 'cluster') {
      if (draggedId !== node.id) reparentCategory(draggedId, node.id)
      return
    }
    if (kind !== memberKind) return
    withBatch(() => {
      onAddMember(node.id, draggedId)
      const sourceClusterId = e.dataTransfer.getData(SOURCE_CLUSTER_MIME)
      if (sourceClusterId && sourceClusterId !== node.id) {
        onRemoveMember(sourceClusterId, draggedId)
      }
    })
  }

  return (
    <div>
      <div
        className={`group rounded px-1.5 py-1 text-sm hover:bg-slate-50 ${
          isDragOver ? 'bg-blue-50 ring-1 ring-blue-300' : ''
        }`}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        <div
          className="flex items-center gap-1.5"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', node.id)
            e.dataTransfer.setData(DRAG_KIND_MIME, 'cluster')
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            type="color"
            className="h-4 w-4 flex-shrink-0 cursor-pointer border-0 bg-transparent p-0"
            value={node.color}
            onChange={(e) => setCategoryColor(node.id, e.target.value)}
            title="Change color"
          />
          <span className="rounded bg-slate-100 px-1 text-[10px] uppercase text-slate-500">
            {node.kind === 'question' ? '❓' : 'cluster'}
          </span>

          {isEditingName ? (
            <input
              autoFocus
              className="flex-1 rounded border border-slate-300 px-1 text-xs"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => e.key === 'Enter' && commitRename()}
            />
          ) : (
            <button
              className="flex-1 truncate text-left font-medium"
              onDoubleClick={() => {
                setNameDraft(node.name)
                setIsEditingName(true)
              }}
              title="Double-click to rename"
            >
              {node.name}
            </button>
          )}

          {otherMemberCount > 0 && (
            <span className="flex-shrink-0 text-[10px] text-slate-400" title={otherMemberTooltip}>
              +{otherMemberCount}
            </span>
          )}

          <div className="hidden flex-shrink-0 gap-1 group-hover:flex">
            <button
              className="rounded border border-red-200 px-1 text-[10px] text-red-600 hover:bg-red-50"
              onClick={() => {
                if (window.confirm(`Delete "${node.name}"?`)) deleteCategory(node.id)
              }}
            >
              Delete
            </button>
          </div>
        </div>

        {isEmpty && <p className="mt-0.5 pl-5 text-[11px] text-slate-400">{emptyPlaceholder}</p>}
      </div>
      {children}
    </div>
  )
}

export default ClusterRowShell
