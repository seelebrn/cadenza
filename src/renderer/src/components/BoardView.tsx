import { useEffect, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import { describeBoardItem, findClusterAtPoint } from '@shared/boardOps'
import type { BoardCluster, BoardItem, CategoryKind } from '@shared/types'

const CARD_WIDTH = 180
const CARD_HEIGHT = 64
const DEFAULT_CLUSTER_WIDTH = 280
const DEFAULT_CLUSTER_HEIGHT = 200
const MIN_CLUSTER_WIDTH = 140
const MIN_CLUSTER_HEIGHT = 100
const CANVAS_WIDTH = 2400
const CANVAS_HEIGHT = 1600
const PALETTE = ['#8b5cf6', '#3b82f6', '#22c55e', '#f97316', '#ef4444', '#14b8a6', '#eab308', '#ec4899']

function nextColor(count: number): string {
  return PALETTE[count % PALETTE.length]
}

type DragState =
  | { kind: 'item'; id: string; startMouseX: number; startMouseY: number; startX: number; startY: number }
  | { kind: 'cluster-move'; id: string; startMouseX: number; startMouseY: number; startX: number; startY: number }
  | {
      kind: 'cluster-resize'
      id: string
      startMouseX: number
      startMouseY: number
      startWidth: number
      startHeight: number
    }

function BoardView(): JSX.Element {
  const data = useProjectStore((s) => s.data)
  const createBoard = useProjectStore((s) => s.createBoard)
  const createCluster = useProjectStore((s) => s.createCluster)
  const addItemToBoard = useProjectStore((s) => s.addItemToBoard)
  const moveItem = useProjectStore((s) => s.moveItem)
  const moveCluster = useProjectStore((s) => s.moveCluster)
  const resizeCluster = useProjectStore((s) => s.resizeCluster)

  const selectedBoardId = useWorkspaceUiStore((s) => s.selectedBoardId)
  const setSelectedBoardId = useWorkspaceUiStore((s) => s.setSelectedBoardId)

  const [newBoardName, setNewBoardName] = useState('')
  const [codeToAdd, setCodeToAdd] = useState('')
  const [noteToAdd, setNoteToAdd] = useState('')
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [liveDelta, setLiveDelta] = useState({ dx: 0, dy: 0 })

  const boards = data?.boards ?? []

  useEffect(() => {
    if (!selectedBoardId && boards.length > 0) setSelectedBoardId(boards[0].id)
  }, [selectedBoardId, boards, setSelectedBoardId])

  const items = data?.boardItems.filter((i) => i.boardId === selectedBoardId) ?? []
  const clusters = data?.boardClusters.filter((c) => c.boardId === selectedBoardId) ?? []

  useEffect(() => {
    if (!dragState) return

    function handleMouseMove(e: MouseEvent): void {
      setLiveDelta({ dx: e.clientX - dragState!.startMouseX, dy: e.clientY - dragState!.startMouseY })
    }

    function handleMouseUp(e: MouseEvent): void {
      const dx = e.clientX - dragState!.startMouseX
      const dy = e.clientY - dragState!.startMouseY
      if (dragState!.kind === 'item') {
        const newX = dragState!.startX + dx
        const newY = dragState!.startY + dy
        const centerX = newX + CARD_WIDTH / 2
        const centerY = newY + CARD_HEIGHT / 2
        const cluster = findClusterAtPoint(clusters, centerX, centerY)
        moveItem(dragState!.id, newX, newY, cluster?.id ?? null)
      } else if (dragState!.kind === 'cluster-move') {
        moveCluster(dragState!.id, dragState!.startX + dx, dragState!.startY + dy)
      } else {
        resizeCluster(
          dragState!.id,
          Math.max(MIN_CLUSTER_WIDTH, dragState!.startWidth + dx),
          Math.max(MIN_CLUSTER_HEIGHT, dragState!.startHeight + dy)
        )
      }
      setDragState(null)
      setLiveDelta({ dx: 0, dy: 0 })
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState, clusters])

  if (!data) return <></>

  function handleCreateBoard(): void {
    const name = newBoardName.trim()
    if (!name) return
    const id = createBoard(name)
    if (id) setSelectedBoardId(id)
    setNewBoardName('')
  }

  function handleAddCode(codeId: string): void {
    if (!selectedBoardId) return
    const x = 40 + ((items.length * 40) % 800)
    const y = 40 + Math.floor((items.length * 40) / 800) * 90
    addItemToBoard(selectedBoardId, 'code', codeId, x, y)
    setCodeToAdd('')
  }

  function handleAddNote(noteId: string): void {
    if (!selectedBoardId) return
    const x = 40 + ((items.length * 40) % 800)
    const y = 40 + Math.floor((items.length * 40) / 800) * 90
    addItemToBoard(selectedBoardId, 'note', noteId, x, y)
    setNoteToAdd('')
  }

  function handleNewCluster(): void {
    if (!selectedBoardId) return
    createCluster(
      selectedBoardId,
      'New cluster',
      nextColor(clusters.length),
      60 + clusters.length * 30,
      60 + clusters.length * 30,
      DEFAULT_CLUSTER_WIDTH,
      DEFAULT_CLUSTER_HEIGHT
    )
  }

  const availableCodes = data.codes.filter((c) => !items.some((i) => i.refType === 'code' && i.refId === c.id))
  const availableNotes = data.notes.filter((n) => !items.some((i) => i.refType === 'note' && i.refId === n.id))

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 text-sm">
        <select
          className="rounded border border-slate-300 px-2 py-1"
          value={selectedBoardId ?? ''}
          onChange={(e) => setSelectedBoardId(e.target.value || null)}
        >
          {boards.length === 0 && <option value="">No boards yet</option>}
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          <input
            className="rounded border border-slate-300 px-2 py-1 text-xs"
            placeholder="New board name…"
            value={newBoardName}
            onChange={(e) => setNewBoardName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateBoard()}
          />
          <button
            className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700"
            onClick={handleCreateBoard}
          >
            New board
          </button>
        </div>

        {selectedBoardId && (
          <>
            <select
              className="rounded border border-slate-300 px-2 py-1 text-xs"
              value={codeToAdd}
              onChange={(e) => {
                if (e.target.value) handleAddCode(e.target.value)
                else setCodeToAdd(e.target.value)
              }}
            >
              <option value="">+ Add code/item…</option>
              {availableCodes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="rounded border border-slate-300 px-2 py-1 text-xs"
              value={noteToAdd}
              onChange={(e) => {
                if (e.target.value) handleAddNote(e.target.value)
                else setNoteToAdd(e.target.value)
              }}
            >
              <option value="">+ Add note…</option>
              {availableNotes.map((n) => (
                <option key={n.id} value={n.id}>
                  {(n.question || n.answer).slice(0, 40)}
                </option>
              ))}
            </select>
            <button
              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
              onClick={handleNewCluster}
            >
              + New cluster
            </button>
          </>
        )}
      </div>

      {!selectedBoardId ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          Create a board to start grouping codes, notes, and quotes spatially.
        </div>
      ) : (
        <div className="flex-1 overflow-auto bg-slate-50">
          <div className="relative" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
            {clusters.map((cluster) => (
              <ClusterFrame
                key={cluster.id}
                cluster={cluster}
                dragState={dragState}
                liveDelta={liveDelta}
                onStartMove={(e) =>
                  setDragState({
                    kind: 'cluster-move',
                    id: cluster.id,
                    startMouseX: e.clientX,
                    startMouseY: e.clientY,
                    startX: cluster.x,
                    startY: cluster.y
                  })
                }
                onStartResize={(e) =>
                  setDragState({
                    kind: 'cluster-resize',
                    id: cluster.id,
                    startMouseX: e.clientX,
                    startMouseY: e.clientY,
                    startWidth: cluster.width,
                    startHeight: cluster.height
                  })
                }
              />
            ))}
            {items.map((item) => (
              <BoardItemCard
                key={item.id}
                item={item}
                dragState={dragState}
                liveDelta={liveDelta}
                onStartDrag={(e) =>
                  setDragState({
                    kind: 'item',
                    id: item.id,
                    startMouseX: e.clientX,
                    startMouseY: e.clientY,
                    startX: item.x,
                    startY: item.y
                  })
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface ClusterFrameProps {
  cluster: BoardCluster
  dragState: DragState | null
  liveDelta: { dx: number; dy: number }
  onStartMove: (e: React.MouseEvent) => void
  onStartResize: (e: React.MouseEvent) => void
}

function ClusterFrame({ cluster, dragState, liveDelta, onStartMove, onStartResize }: ClusterFrameProps): JSX.Element {
  const renameCluster = useProjectStore((s) => s.renameCluster)
  const setClusterColor = useProjectStore((s) => s.setClusterColor)
  const deleteCluster = useProjectStore((s) => s.deleteCluster)
  const promoteClusterToCategory = useProjectStore((s) => s.promoteClusterToCategory)

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(cluster.name)

  const isMoving = dragState?.kind === 'cluster-move' && dragState.id === cluster.id
  const isResizing = dragState?.kind === 'cluster-resize' && dragState.id === cluster.id
  const x = isMoving ? cluster.x + liveDelta.dx : cluster.x
  const y = isMoving ? cluster.y + liveDelta.dy : cluster.y
  const width = isResizing ? Math.max(MIN_CLUSTER_WIDTH, cluster.width + liveDelta.dx) : cluster.width
  const height = isResizing ? Math.max(MIN_CLUSTER_HEIGHT, cluster.height + liveDelta.dy) : cluster.height

  function commitRename(): void {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== cluster.name) renameCluster(cluster.id, trimmed)
    setIsEditingName(false)
  }

  function handlePromote(kind: CategoryKind): void {
    promoteClusterToCategory(cluster.id, kind, cluster.color)
  }

  return (
    <div
      className="absolute rounded-lg border-2 border-dashed"
      style={{ left: x, top: y, width, height, borderColor: cluster.color, backgroundColor: `${cluster.color}0f` }}
    >
      <div
        className="flex cursor-move items-center gap-1 rounded-t-md px-2 py-1 text-xs text-white"
        style={{ backgroundColor: cluster.color }}
        onMouseDown={onStartMove}
      >
        <input
          type="color"
          className="h-3 w-3 flex-shrink-0 cursor-pointer border-0 bg-transparent p-0"
          value={cluster.color}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setClusterColor(cluster.id, e.target.value)}
        />
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
              setNameDraft(cluster.name)
              setIsEditingName(true)
            }}
          >
            {cluster.name}
          </button>
        )}
        <button
          className="flex-shrink-0 underline"
          title="Promote to a theme category"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => handlePromote('theme')}
        >
          →Theme
        </button>
        <button
          className="flex-shrink-0 underline"
          title="Promote to an AQA question category"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => handlePromote('question')}
        >
          →Question
        </button>
        <button
          className="flex-shrink-0 text-white/80 hover:text-white"
          title="Delete cluster (items are un-clustered, not deleted)"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => deleteCluster(cluster.id)}
        >
          ×
        </button>
      </div>
      <div
        className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize"
        style={{ backgroundColor: cluster.color }}
        onMouseDown={(e) => {
          e.stopPropagation()
          onStartResize(e)
        }}
      />
    </div>
  )
}

interface BoardItemCardProps {
  item: BoardItem
  dragState: DragState | null
  liveDelta: { dx: number; dy: number }
  onStartDrag: (e: React.MouseEvent) => void
}

function BoardItemCard({ item, dragState, liveDelta, onStartDrag }: BoardItemCardProps): JSX.Element | null {
  const data = useProjectStore((s) => s.data)
  const removeItemFromBoard = useProjectStore((s) => s.removeItemFromBoard)

  if (!data) return null
  const description = describeBoardItem(data, item)
  if (!description) return null

  const isDragging = dragState?.kind === 'item' && dragState.id === item.id
  const x = isDragging ? item.x + liveDelta.dx : item.x
  const y = isDragging ? item.y + liveDelta.dy : item.y

  return (
    <div
      className="group absolute cursor-move select-none rounded border border-slate-300 bg-white p-2 text-xs shadow-sm"
      style={{ left: x, top: y, width: CARD_WIDTH, minHeight: CARD_HEIGHT }}
      onMouseDown={onStartDrag}
    >
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="flex items-center gap-1 truncate text-[10px] uppercase text-slate-400">
          {description.color && (
            <span
              className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: description.color }}
            />
          )}
          {description.sublabel}
        </span>
        <button
          className="hidden flex-shrink-0 text-slate-300 hover:text-red-500 group-hover:block"
          title="Remove from board"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => removeItemFromBoard(item.id)}
        >
          ×
        </button>
      </div>
      <p className="line-clamp-3 text-slate-700">{description.label}</p>
    </div>
  )
}

export default BoardView
