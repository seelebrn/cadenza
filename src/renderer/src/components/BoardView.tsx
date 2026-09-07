import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import { describeBoardItem, findClusterAtPoint, findSnapTarget, getLinkedGroup } from '@shared/boardOps'
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

const MIN_ZOOM = 0.3
const MAX_ZOOM = 2.5
const ZOOM_WHEEL_SENSITIVITY = 0.0015
// How close two cards must get while dragging to snap/link; how far an
// already-linked pair must be dragged apart to sever automatically.
const SNAP_DISTANCE = 70
const UNLINK_DISTANCE = 200

function nextColor(count: number): string {
  return PALETTE[count % PALETTE.length]
}

interface Position {
  x: number
  y: number
}

type DragState =
  | {
      kind: 'item'
      /** The card actually grabbed — used for snap-target lookup and as the
       * "other side" of a new link. */
      id: string
      /** Every item that moves rigidly together with it (itself plus every
       * item transitively linked to it) — see getLinkedGroup. */
      groupItemIds: string[]
      startMouseX: number
      startMouseY: number
      startPositions: Record<string, Position>
    }
  | {
      kind: 'cluster-move'
      id: string
      /** The cluster's current members, moved rigidly along with the frame. */
      memberItemIds: string[]
      startMouseX: number
      startMouseY: number
      startX: number
      startY: number
      memberStartPositions: Record<string, Position>
    }
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
  const linkItemsAction = useProjectStore((s) => s.linkItems)
  const unlinkItemsAction = useProjectStore((s) => s.unlinkItems)

  const selectedBoardId = useWorkspaceUiStore((s) => s.selectedBoardId)
  const setSelectedBoardId = useWorkspaceUiStore((s) => s.setSelectedBoardId)

  const [newBoardName, setNewBoardName] = useState('')
  const [codeToAdd, setCodeToAdd] = useState('')
  const [noteToAdd, setNoteToAdd] = useState('')
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [liveDelta, setLiveDelta] = useState({ dx: 0, dy: 0 })
  const [zoom, setZoom] = useState(1)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pendingZoomAnchorRef = useRef<{
    contentX: number
    contentY: number
    offsetX: number
    offsetY: number
  } | null>(null)

  const boards = data?.boards ?? []

  useEffect(() => {
    if (!selectedBoardId && boards.length > 0) setSelectedBoardId(boards[0].id)
  }, [selectedBoardId, boards, setSelectedBoardId])

  const items = data?.boardItems.filter((i) => i.boardId === selectedBoardId) ?? []
  const clusters = data?.boardClusters.filter((c) => c.boardId === selectedBoardId) ?? []
  const links = data?.boardLinks.filter((l) => l.boardId === selectedBoardId) ?? []

  // Wheel-to-zoom, centered on the cursor. Attached as a native listener
  // (not React's onWheel) because React registers wheel listeners as
  // passive by default, so e.preventDefault() inside a JSX handler silently
  // does nothing and native scrolling would fight the zoom.
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    function handleWheel(e: WheelEvent): void {
      e.preventDefault()
      const rect = container!.getBoundingClientRect()
      const offsetX = e.clientX - rect.left
      const offsetY = e.clientY - rect.top

      setZoom((prevZoom) => {
        const contentX = (container!.scrollLeft + offsetX) / prevZoom
        const contentY = (container!.scrollTop + offsetY) / prevZoom
        const factor = Math.exp(-e.deltaY * ZOOM_WHEEL_SENSITIVITY)
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom * factor))
        pendingZoomAnchorRef.current = { contentX, contentY, offsetX, offsetY }
        return nextZoom
      })
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [])

  // After zoom changes and the new transform has painted, correct the
  // scroll position so the point that was under the cursor stays there.
  useLayoutEffect(() => {
    const anchor = pendingZoomAnchorRef.current
    const container = scrollContainerRef.current
    if (!anchor || !container) return
    container.scrollLeft = anchor.contentX * zoom - anchor.offsetX
    container.scrollTop = anchor.contentY * zoom - anchor.offsetY
    pendingZoomAnchorRef.current = null
  }, [zoom])

  useEffect(() => {
    if (!dragState) return
    const state = dragState // a stable local const narrows reliably; re-reading dragState! repeatedly does not

    function handleMouseMove(e: MouseEvent): void {
      // Divide by zoom: a screen-pixel mouse delta corresponds to more (when
      // zoomed out) or fewer (zoomed in) canvas-content-space units.
      setLiveDelta({
        dx: (e.clientX - state.startMouseX) / zoom,
        dy: (e.clientY - state.startMouseY) / zoom
      })
    }

    function handleMouseUp(e: MouseEvent): void {
      const dx = (e.clientX - state.startMouseX) / zoom
      const dy = (e.clientY - state.startMouseY) / zoom

      if (state.kind === 'item') {
        const grabbedStart = state.startPositions[state.id]
        const rawX = grabbedStart.x + dx
        const rawY = grabbedStart.y + dy
        // Snap candidates exclude the whole group — a card never snaps to
        // something it's already rigidly moving with.
        const candidates = items.filter((i) => !state.groupItemIds.includes(i.id))
        const snap = findSnapTarget(candidates, state.id, rawX, rawY, CARD_WIDTH, CARD_HEIGHT, SNAP_DISTANCE)
        const adjustX = snap ? snap.snappedX - rawX : 0
        const adjustY = snap ? snap.snappedY - rawY : 0

        const finalPositions = new Map<string, Position>()
        for (const memberId of state.groupItemIds) {
          const start = state.startPositions[memberId]
          if (!start) continue
          const finalX = start.x + dx + adjustX
          const finalY = start.y + dy + adjustY
          finalPositions.set(memberId, { x: finalX, y: finalY })
          const cluster = findClusterAtPoint(clusters, finalX + CARD_WIDTH / 2, finalY + CARD_HEIGHT / 2)
          moveItem(memberId, finalX, finalY, cluster?.id ?? null)
        }

        if (snap && selectedBoardId) {
          linkItemsAction(selectedBoardId, state.id, snap.targetId)
        }

        // Whether or not a new snap happened, check every link that crosses
        // the group's boundary (one endpoint inside, one outside) — if this
        // drag pulled it further than UNLINK_DISTANCE, sever it. Links
        // entirely inside the group can't drift apart since it moves rigidly.
        for (const link of links) {
          const aInGroup = state.groupItemIds.includes(link.itemAId)
          const bInGroup = state.groupItemIds.includes(link.itemBId)
          if (aInGroup === bInGroup) continue
          const insideId = aInGroup ? link.itemAId : link.itemBId
          const outsideId = aInGroup ? link.itemBId : link.itemAId
          const insidePos = finalPositions.get(insideId)
          const outsideItem = items.find((i) => i.id === outsideId)
          if (!insidePos || !outsideItem) continue
          const dist = Math.hypot(
            insidePos.x + CARD_WIDTH / 2 - (outsideItem.x + CARD_WIDTH / 2),
            insidePos.y + CARD_HEIGHT / 2 - (outsideItem.y + CARD_HEIGHT / 2)
          )
          if (dist > UNLINK_DISTANCE) unlinkItemsAction(link.id)
        }
      } else if (state.kind === 'cluster-move') {
        moveCluster(state.id, state.startX + dx, state.startY + dy)
        // Members stay assigned to the cluster being dragged regardless of
        // exact overlap math — moving the frame shouldn't itself evict them.
        for (const memberId of state.memberItemIds) {
          const start = state.memberStartPositions[memberId]
          if (start) moveItem(memberId, start.x + dx, start.y + dy, state.id)
        }
      } else {
        resizeCluster(
          state.id,
          Math.max(MIN_CLUSTER_WIDTH, state.startWidth + dx),
          Math.max(MIN_CLUSTER_HEIGHT, state.startHeight + dy)
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
  }, [dragState, clusters, items, links, zoom, selectedBoardId])

  // Live position (and snap-preview) for every item, shared by the cards
  // themselves and the link lines so both agree on where things are mid-drag.
  const displayPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; isSnapping: boolean }>()

    if (dragState?.kind === 'item') {
      const grabbedStart = dragState.startPositions[dragState.id]
      let adjustX = 0
      let adjustY = 0
      let isGrabbedSnapping = false
      if (grabbedStart) {
        const rawX = grabbedStart.x + liveDelta.dx
        const rawY = grabbedStart.y + liveDelta.dy
        const candidates = items.filter((i) => !dragState.groupItemIds.includes(i.id))
        const snap = findSnapTarget(candidates, dragState.id, rawX, rawY, CARD_WIDTH, CARD_HEIGHT, SNAP_DISTANCE)
        if (snap) {
          adjustX = snap.snappedX - rawX
          adjustY = snap.snappedY - rawY
          isGrabbedSnapping = true
        }
      }
      for (const item of items) {
        if (dragState.groupItemIds.includes(item.id)) {
          const start = dragState.startPositions[item.id] ?? { x: item.x, y: item.y }
          map.set(item.id, {
            x: start.x + liveDelta.dx + adjustX,
            y: start.y + liveDelta.dy + adjustY,
            isSnapping: item.id === dragState.id && isGrabbedSnapping
          })
        } else {
          map.set(item.id, { x: item.x, y: item.y, isSnapping: false })
        }
      }
    } else if (dragState?.kind === 'cluster-move') {
      for (const item of items) {
        const start = dragState.memberStartPositions[item.id]
        map.set(
          item.id,
          start
            ? { x: start.x + liveDelta.dx, y: start.y + liveDelta.dy, isSnapping: false }
            : { x: item.x, y: item.y, isSnapping: false }
        )
      }
    } else {
      for (const item of items) {
        map.set(item.id, { x: item.x, y: item.y, isSnapping: false })
      }
    }

    return map
  }, [items, dragState, liveDelta])

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

        <div className="ml-auto flex items-center gap-1 text-xs text-slate-500">
          <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
          <button
            className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-100"
            onClick={() => setZoom(1)}
          >
            Reset zoom
          </button>
        </div>
      </div>

      {selectedBoardId && (
        <p className="border-b border-slate-100 bg-white px-4 py-1 text-[11px] text-slate-400">
          Scroll to zoom · drag two cards close together to link them (they snap), and linked/clustered cards move
          together · drag a linked card away to unlink · click the × on a connector to unlink directly
        </p>
      )}

      {!selectedBoardId ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          Create a board to start grouping codes, notes, and quotes spatially.
        </div>
      ) : (
        <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-slate-50">
          <div
            className="relative"
            style={{
              width: CANVAS_WIDTH,
              height: CANVAS_HEIGHT,
              transform: `scale(${zoom})`,
              transformOrigin: '0 0'
            }}
          >
            <svg className="pointer-events-none absolute left-0 top-0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT}>
              {links.map((link) => {
                const a = items.find((i) => i.id === link.itemAId)
                const b = items.find((i) => i.id === link.itemBId)
                if (!a || !b) return null
                const posA = displayPositions.get(a.id) ?? { x: a.x, y: a.y }
                const posB = displayPositions.get(b.id) ?? { x: b.x, y: b.y }
                const ax = posA.x + CARD_WIDTH / 2
                const ay = posA.y + CARD_HEIGHT / 2
                const bx = posB.x + CARD_WIDTH / 2
                const by = posB.y + CARD_HEIGHT / 2
                const midX = (ax + bx) / 2
                const midY = (ay + by) / 2
                return (
                  <g key={link.id}>
                    <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#94a3b8" strokeWidth={2} />
                    <circle
                      cx={midX}
                      cy={midY}
                      r={9}
                      fill="white"
                      stroke="#94a3b8"
                      strokeWidth={1.5}
                      className="pointer-events-auto cursor-pointer hover:stroke-red-400"
                      onClick={() => unlinkItemsAction(link.id)}
                    >
                      <title>Unlink</title>
                    </circle>
                    <text
                      x={midX}
                      y={midY + 3}
                      textAnchor="middle"
                      fontSize={11}
                      className="pointer-events-none select-none"
                      fill="#64748b"
                    >
                      ×
                    </text>
                  </g>
                )
              })}
            </svg>

            {clusters.map((cluster) => (
              <ClusterFrame
                key={cluster.id}
                cluster={cluster}
                dragState={dragState}
                liveDelta={liveDelta}
                onStartMove={(e) => {
                  const memberItemIds = items.filter((i) => i.clusterId === cluster.id).map((i) => i.id)
                  const memberStartPositions: Record<string, Position> = {}
                  for (const i of items) {
                    if (i.clusterId === cluster.id) memberStartPositions[i.id] = { x: i.x, y: i.y }
                  }
                  setDragState({
                    kind: 'cluster-move',
                    id: cluster.id,
                    memberItemIds,
                    startMouseX: e.clientX,
                    startMouseY: e.clientY,
                    startX: cluster.x,
                    startY: cluster.y,
                    memberStartPositions
                  })
                }}
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
            {items.map((item) => {
              const pos = displayPositions.get(item.id) ?? { x: item.x, y: item.y, isSnapping: false }
              return (
                <BoardItemCard
                  key={item.id}
                  item={item}
                  x={pos.x}
                  y={pos.y}
                  isDragging={
                    (dragState?.kind === 'item' && dragState.groupItemIds.includes(item.id)) ||
                    (dragState?.kind === 'cluster-move' && dragState.memberItemIds.includes(item.id))
                  }
                  isSnapping={pos.isSnapping}
                  onStartDrag={(e) => {
                    const group = getLinkedGroup(links, item.id)
                    const startPositions: Record<string, Position> = {}
                    for (const gid of group) {
                      const gItem = items.find((i) => i.id === gid)
                      if (gItem) startPositions[gid] = { x: gItem.x, y: gItem.y }
                    }
                    setDragState({
                      kind: 'item',
                      id: item.id,
                      groupItemIds: Array.from(group),
                      startMouseX: e.clientX,
                      startMouseY: e.clientY,
                      startPositions
                    })
                  }}
                />
              )
            })}
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
  x: number
  y: number
  isDragging: boolean
  isSnapping: boolean
  onStartDrag: (e: React.MouseEvent) => void
}

function BoardItemCard({ item, x, y, isDragging, isSnapping, onStartDrag }: BoardItemCardProps): JSX.Element | null {
  const data = useProjectStore((s) => s.data)
  const removeItemFromBoard = useProjectStore((s) => s.removeItemFromBoard)

  if (!data) return null
  const description = describeBoardItem(data, item)
  if (!description) return null

  return (
    <div
      className={`group absolute cursor-move select-none rounded border bg-white p-2 text-xs shadow-sm transition-shadow ${
        isSnapping ? 'border-blue-400 ring-2 ring-blue-300' : 'border-slate-300'
      } ${isDragging ? 'shadow-md' : ''}`}
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
