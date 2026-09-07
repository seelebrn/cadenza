import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import {
  computeGridPosition,
  describeBoardItem,
  findClusterAtPoint,
  findSnapTarget,
  getClusterMemberItems,
  getDefaultBoardId,
  getLinkedGroup,
  getVisibleBoardClusters,
  getVisibleBoardItems
} from '@shared/boardOps'
import { getCategoryDepth, getDescendantCategoryIds } from '@shared/categoryOps'
import type { BoardCluster, BoardItem, CategoryKind, CategoryRecord } from '@shared/types'

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
       * item transitively linked to it, unless shift overrides that). */
      groupItemIds: string[]
      startMouseX: number
      startMouseY: number
      startPositions: Record<string, Position>
    }
  | {
      kind: 'cluster-move'
      id: string
      categoryId: string
      /** Shift+drag detaches from the parent cluster instead of evaluating
       * a new one, and doesn't drag descendants' membership assumptions. */
      shiftKey: boolean
      startWidth: number
      startHeight: number
      /** This cluster plus every descendant cluster present on this board —
       * the rigid group of frames that moves together. */
      groupClusterIds: string[]
      clusterStartPositions: Record<string, Position>
      /** Every item belonging to this category or any descendant category. */
      memberItemIds: string[]
      memberStartPositions: Record<string, Position>
      startMouseX: number
      startMouseY: number
      startX: number
      startY: number
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
  const createClusterForCategory = useProjectStore((s) => s.createClusterForCategory)
  const createClusterWithNewCategory = useProjectStore((s) => s.createClusterWithNewCategory)
  const addItemToBoard = useProjectStore((s) => s.addItemToBoard)
  const addAllCodesToBoard = useProjectStore((s) => s.addAllCodesToBoard)
  const addAllNotesToBoard = useProjectStore((s) => s.addAllNotesToBoard)
  const addAllClustersToBoard = useProjectStore((s) => s.addAllClustersToBoard)
  const moveItem = useProjectStore((s) => s.moveItem)
  const moveCluster = useProjectStore((s) => s.moveCluster)
  const resizeCluster = useProjectStore((s) => s.resizeCluster)
  const assignItemToCluster = useProjectStore((s) => s.assignItemToCluster)
  const unassignItemFromCluster = useProjectStore((s) => s.unassignItemFromCluster)
  const reparentCategory = useProjectStore((s) => s.reparentCategory)
  const linkItemsAction = useProjectStore((s) => s.linkItems)
  const unlinkItemsAction = useProjectStore((s) => s.unlinkItems)

  const selectedBoardId = useWorkspaceUiStore((s) => s.selectedBoardId)
  const setSelectedBoardId = useWorkspaceUiStore((s) => s.setSelectedBoardId)

  const [newBoardName, setNewBoardName] = useState('')
  const [codeToAdd, setCodeToAdd] = useState('')
  const [noteToAdd, setNoteToAdd] = useState('')
  const [categoryToPlace, setCategoryToPlace] = useState('')
  const [newClusterName, setNewClusterName] = useState('')
  const [newClusterKind, setNewClusterKind] = useState<CategoryKind>('theme')
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
  const categories = data?.categories ?? []
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  // Re-selects the default board whenever selectedBoardId is empty OR
  // doesn't match any board that actually exists in this project. That
  // second case matters: without it, a stale id (left over from a
  // different/earlier project, since nothing used to reset this on
  // project switch) would make currentBoard resolve to null while the
  // canvas kept rendering anyway — every "add" appeared to silently do
  // nothing, because nothing was ever going to match a nonexistent board.
  useEffect(() => {
    if (boards.length === 0) return
    const isValid = selectedBoardId !== null && boards.some((b) => b.id === selectedBoardId)
    if (!isValid) setSelectedBoardId(getDefaultBoardId(boards))
  }, [selectedBoardId, boards, setSelectedBoardId])

  const currentBoard = boards.find((b) => b.id === selectedBoardId) ?? null
  const explicitClusters = data?.boardClusters.filter((c) => c.boardId === selectedBoardId) ?? []
  const links = data?.boardLinks.filter((l) => l.boardId === selectedBoardId) ?? []
  const explicitItems = data?.boardItems.filter((i) => i.boardId === selectedBoardId) ?? []

  const items = useMemo<BoardItem[]>(() => {
    if (!data || !currentBoard) return []
    return getVisibleBoardItems(currentBoard, explicitItems, data.codes, data.notes)
  }, [data, currentBoard, explicitItems])

  // A category created anywhere (the Workspace codebook tab, Analysis >
  // Clusters, or this board) has no board shape until something places one
  // — same reasoning as items above: on the default board, every category
  // shows as a cluster frame automatically (a deterministic grid fallback),
  // materializing into a real BoardCluster only once actually touched
  // (moved/resized/dropped into), so creating a cluster in the Workspace is
  // visible here immediately without an extra "place it" step.
  const clusters = useMemo<BoardCluster[]>(() => {
    if (!data || !currentBoard) return []
    const visible = getVisibleBoardClusters(currentBoard, explicitClusters, data.categories)
    // Painted ancestor-first (shallowest depth first) regardless of
    // creation order — plain DOM order otherwise decides which frame is
    // on top, so a superordinate cluster created *after* the one nested
    // into it would render over it and swallow every click on the shared
    // area, making the nested cluster's own controls unreachable.
    return [...visible].sort(
      (a, b) => getCategoryDepth(data.categories, a.categoryId) - getCategoryDepth(data.categories, b.categoryId)
    )
  }, [data, currentBoard, explicitClusters])

  /** Turns a possibly-virtual cluster into a real, persisted BoardCluster
   * (a no-op returning the same id if it already is one) — needed before
   * any operation that looks a cluster up by id in data.boardClusters
   * (moveCluster, resizeCluster, assign/unassignItemToCluster), since a
   * virtual id like "virtual:cluster:<categoryId>" only exists in this
   * computed `clusters` array, never in the stored data. */
  function materializeCluster(cluster: BoardCluster): string {
    if (!cluster.id.startsWith('virtual:')) return cluster.id
    const realId = createClusterForCategory(
      cluster.boardId,
      cluster.categoryId,
      cluster.x,
      cluster.y,
      cluster.width,
      cluster.height
    )
    return realId ?? cluster.id
  }

  // Wheel-to-zoom (Ctrl/Cmd+wheel only — plain wheel keeps scrolling/panning
  // natively). Attached as a native listener (not React's onWheel) because
  // React registers wheel listeners as passive by default, so
  // e.preventDefault() inside a JSX handler silently does nothing.
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    function handleWheel(e: WheelEvent): void {
      if (!e.ctrlKey && !e.metaKey) return // let native scroll handle a plain wheel
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
    if (!dragState || !data) return
    const state = dragState // a stable local const narrows reliably; re-reading dragState! repeatedly does not
    const currentData = data // same reasoning — nested functions below can't rely on the outer null-check

    function handleMouseMove(e: MouseEvent): void {
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
          moveItem(memberId, finalX, finalY)

          // Category (cluster) membership follows containment: left the old
          // cluster -> unassign; entered a new one -> assign.
          const member = items.find((i) => i.id === memberId)
          if (!member) continue
          const oldPos = { x: member.x, y: member.y }
          const oldCluster = findClusterAtPoint(clusters, oldPos.x + CARD_WIDTH / 2, oldPos.y + CARD_HEIGHT / 2)
          const newCluster = findClusterAtPoint(clusters, finalX + CARD_WIDTH / 2, finalY + CARD_HEIGHT / 2)
          if (oldCluster?.id !== newCluster?.id) {
            if (oldCluster) unassignItemFromCluster(materializeCluster(oldCluster), member.refType, member.refId)
            if (newCluster) assignItemToCluster(materializeCluster(newCluster), member.refType, member.refId)
          }
        }

        if (snap && selectedBoardId) {
          linkItemsAction(selectedBoardId, state.id, snap.targetId)
        }

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
        const finalX = state.startX + dx
        const finalY = state.startY + dy
        moveCluster(state.id, finalX, finalY)
        for (const clusterId of state.groupClusterIds) {
          if (clusterId === state.id) continue
          const start = state.clusterStartPositions[clusterId]
          if (start) moveCluster(clusterId, start.x + dx, start.y + dy)
        }
        for (const itemId of state.memberItemIds) {
          const start = state.memberStartPositions[itemId]
          if (start) moveItem(itemId, start.x + dx, start.y + dy)
        }

        // Re-evaluate (or explicitly break, if shift) this cluster's parent.
        const category = currentData.categories.find((c) => c.id === state.categoryId)
        const currentParentId = category?.parentCategoryId ?? null
        if (state.shiftKey) {
          if (currentParentId !== null) reparentCategory(state.categoryId, null)
        } else {
          const excluded = new Set([
            state.categoryId,
            ...getDescendantCategoryIds(currentData.categories, state.categoryId)
          ])
          const candidateClusters = clusters.filter((c) => !excluded.has(c.categoryId))
          const centerX = finalX + state.startWidth / 2
          const centerY = finalY + state.startHeight / 2
          const target = findClusterAtPoint(candidateClusters, centerX, centerY)
          const newParentId = target?.categoryId ?? null
          if (newParentId !== currentParentId) reparentCategory(state.categoryId, newParentId)
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
  }, [dragState, clusters, items, links, zoom, selectedBoardId, data])

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

  // Shared endpoint/midpoint geometry for each link — computed once and used
  // by both the (behind-cards) connector line and the (above-cards) unlink
  // button, so they can never disagree about where the midpoint actually is.
  const linkGeometries = useMemo(() => {
    return links
      .map((link) => {
        const a = items.find((i) => i.id === link.itemAId)
        const b = items.find((i) => i.id === link.itemBId)
        if (!a || !b) return null
        const posA = displayPositions.get(a.id) ?? { x: a.x, y: a.y }
        const posB = displayPositions.get(b.id) ?? { x: b.x, y: b.y }
        const ax = posA.x + CARD_WIDTH / 2
        const ay = posA.y + CARD_HEIGHT / 2
        const bx = posB.x + CARD_WIDTH / 2
        const by = posB.y + CARD_HEIGHT / 2
        return { link, ax, ay, bx, by, midX: (ax + bx) / 2, midY: (ay + by) / 2 }
      })
      .filter((g): g is NonNullable<typeof g> => g !== null)
  }, [links, items, displayPositions])

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
    const pos = computeGridPosition(explicitItems.length)
    addItemToBoard(selectedBoardId, 'code', codeId, pos.x, pos.y)
    setCodeToAdd('')
  }

  function handleAddNote(noteId: string): void {
    if (!selectedBoardId) return
    const pos = computeGridPosition(explicitItems.length)
    addItemToBoard(selectedBoardId, 'note', noteId, pos.x, pos.y)
    setNoteToAdd('')
  }

  function handlePlaceCategory(categoryId: string): void {
    if (!selectedBoardId) return
    createClusterForCategory(
      selectedBoardId,
      categoryId,
      60 + clusters.length * 30,
      60 + clusters.length * 30,
      DEFAULT_CLUSTER_WIDTH,
      DEFAULT_CLUSTER_HEIGHT
    )
    setCategoryToPlace('')
  }

  function handleNewCluster(): void {
    if (!selectedBoardId) return
    const name = newClusterName.trim() || 'New cluster'
    createClusterWithNewCategory(
      selectedBoardId,
      name,
      newClusterKind,
      nextColor(clusters.length),
      60 + clusters.length * 30,
      60 + clusters.length * 30,
      DEFAULT_CLUSTER_WIDTH,
      DEFAULT_CLUSTER_HEIGHT
    )
    setNewClusterName('')
  }

  const availableCodes = data.codes.filter((c) => !explicitItems.some((i) => i.refType === 'code' && i.refId === c.id))
  const availableNotes = data.notes.filter((n) => !explicitItems.some((i) => i.refType === 'note' && i.refId === n.id))
  const placeableCategories = categories.filter(
    (c) => !clusters.some((cluster) => cluster.categoryId === c.id)
  )

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
              {b.isDefault ? ' (default)' : ''}
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

        {currentBoard && (
          <>
            {!currentBoard.isDefault && (
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
                  onClick={() => addAllCodesToBoard(currentBoard.id)}
                >
                  + Add all codes
                </button>
                <button
                  className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                  onClick={() => addAllNotesToBoard(currentBoard.id)}
                >
                  + Add all notes
                </button>
              </>
            )}

            {placeableCategories.length > 0 && (
              <select
                className="rounded border border-slate-300 px-2 py-1 text-xs"
                value={categoryToPlace}
                onChange={(e) => {
                  if (e.target.value) handlePlaceCategory(e.target.value)
                  else setCategoryToPlace(e.target.value)
                }}
              >
                <option value="">+ Place cluster…</option>
                {placeableCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <div className="flex gap-1">
              <select
                className="rounded border border-slate-300 px-1 py-1 text-xs"
                value={newClusterKind}
                onChange={(e) => setNewClusterKind(e.target.value as CategoryKind)}
              >
                <option value="theme">Theme</option>
                <option value="question">Question</option>
              </select>
              <input
                className="w-28 rounded border border-slate-300 px-2 py-1 text-xs"
                placeholder="New cluster…"
                value={newClusterName}
                onChange={(e) => setNewClusterName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleNewCluster()}
              />
              <button
                className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                onClick={handleNewCluster}
              >
                + New cluster
              </button>
            </div>
            <button
              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
              onClick={() => addAllClustersToBoard(currentBoard.id)}
            >
              + Add all clusters
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

      {currentBoard && (
        <p className="border-b border-slate-100 bg-white px-4 py-1 text-[11px] text-slate-400">
          {currentBoard.isDefault &&
            'Every code, note, and cluster is shown automatically on this default board. '}
          Ctrl/Cmd+scroll to zoom · drag two cards close together to link them (they snap), and linked/clustered
          cards move together (shift+drag to move just one) · drag a cluster into another to nest it as a
          superordinate group (shift+drag to pull it out) · click the × on a connector to unlink
        </p>
      )}

      {!currentBoard ? (
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
            {/* Connector lines only — behind clusters/items. The clickable
                unlink control is a separate layer rendered *after* the cards
                (below) so it's never covered by one: a link's midpoint sits
                in the snap gap between two cards, which is narrower than the
                button itself, so it always overlaps both cards a little. */}
            <svg className="pointer-events-none absolute left-0 top-0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT}>
              {linkGeometries.map(({ link, ax, ay, bx, by }) => (
                <line key={link.id} x1={ax} y1={ay} x2={bx} y2={by} stroke="#94a3b8" strokeWidth={2} />
              ))}
            </svg>

            {clusters.map((cluster) => {
              const category = categoriesById.get(cluster.categoryId)
              if (!category) return null
              return (
                <ClusterFrame
                  key={cluster.id}
                  cluster={cluster}
                  category={category}
                  dragState={dragState}
                  liveDelta={liveDelta}
                  onStartMove={(e) => {
                    const descendantCategoryIds = getDescendantCategoryIds(data.categories, category.id)
                    const groupCategoryIds = [category.id, ...descendantCategoryIds]
                    const groupCategories = data.categories.filter((c) => groupCategoryIds.includes(c.id))
                    const groupClusters = clusters.filter((c) => groupCategoryIds.includes(c.categoryId))
                    // A cluster shown only as a "virtual" grid-fallback frame
                    // (a category with no BoardCluster shape on this board
                    // yet) has nothing for moveCluster to find by id.
                    // Materialize every cluster in the moving group now, up
                    // front, the same reasoning as member items just below.
                    const clusterIdByCategoryId = new Map<string, string>()
                    const clusterStartPositions: Record<string, Position> = {}
                    for (const c of groupClusters) {
                      const realId = materializeCluster(c)
                      clusterIdByCategoryId.set(c.categoryId, realId)
                      clusterStartPositions[realId] = { x: c.x, y: c.y }
                    }
                    const primaryClusterId = clusterIdByCategoryId.get(category.id) ?? cluster.id

                    const memberItemsMap = new Map<string, BoardItem>()
                    for (const cat of groupCategories) {
                      for (const item of getClusterMemberItems(items, cat)) memberItemsMap.set(item.id, item)
                    }
                    // A member that's only ever been shown as a "virtual"
                    // fallback card (never individually dragged) has no real
                    // BoardItem yet — moveItem has nothing to find and
                    // silently no-ops for it. Materialize every member now,
                    // right as the cluster-drag starts, same as a lone card
                    // materializes on its own mousedown (see BoardItemCard),
                    // so it actually moves with the cluster instead of
                    // snapping back to its grid fallback position afterward.
                    const memberItemIds: string[] = []
                    const memberStartPositions: Record<string, Position> = {}
                    for (const item of memberItemsMap.values()) {
                      const realId = item.id.startsWith('virtual:')
                        ? addItemToBoard(cluster.boardId, item.refType, item.refId, item.x, item.y)
                        : item.id
                      const id = realId ?? item.id
                      memberItemIds.push(id)
                      memberStartPositions[id] = { x: item.x, y: item.y }
                    }

                    setDragState({
                      kind: 'cluster-move',
                      id: primaryClusterId,
                      categoryId: category.id,
                      shiftKey: e.shiftKey,
                      startWidth: cluster.width,
                      startHeight: cluster.height,
                      groupClusterIds: Array.from(clusterIdByCategoryId.values()),
                      clusterStartPositions,
                      memberItemIds,
                      memberStartPositions,
                      startMouseX: e.clientX,
                      startMouseY: e.clientY,
                      startX: cluster.x,
                      startY: cluster.y
                    })
                  }}
                  onStartResize={(e) =>
                    setDragState({
                      kind: 'cluster-resize',
                      id: materializeCluster(cluster),
                      startMouseX: e.clientX,
                      startMouseY: e.clientY,
                      startWidth: cluster.width,
                      startHeight: cluster.height
                    })
                  }
                />
              )
            })}
            {items.map((item) => {
              const pos = displayPositions.get(item.id) ?? { x: item.x, y: item.y, isSnapping: false }
              return (
                <BoardItemCard
                  key={item.id}
                  item={item}
                  boardId={currentBoard.id}
                  x={pos.x}
                  y={pos.y}
                  isDragging={
                    (dragState?.kind === 'item' && dragState.groupItemIds.includes(item.id)) ||
                    (dragState?.kind === 'cluster-move' && dragState.memberItemIds.includes(item.id))
                  }
                  isSnapping={pos.isSnapping}
                  onStartDrag={(e, realId) => {
                    // A virtual (not-yet-persisted) item materializes into a
                    // real BoardItem right before the drag starts — realId is
                    // its actual id, since item.id (a "virtual:..." marker)
                    // won't exist in boardItems for moveItem to find.
                    const draggedId = realId ?? item.id
                    // Shift+drag is the escape hatch: move just this one
                    // card, ignoring whatever it's linked to.
                    const group = e.shiftKey ? new Set([draggedId]) : getLinkedGroup(links, draggedId)
                    const startPositions: Record<string, Position> = {}
                    for (const gid of group) {
                      const gItem = items.find((i) => i.id === gid)
                      if (gItem) startPositions[gid] = { x: gItem.x, y: gItem.y }
                    }
                    // The dragged item itself might not be in `items` yet
                    // under its real id if it was virtual a moment ago.
                    if (!startPositions[draggedId]) startPositions[draggedId] = { x: item.x, y: item.y }
                    setDragState({
                      kind: 'item',
                      id: draggedId,
                      groupItemIds: Array.from(group),
                      startMouseX: e.clientX,
                      startMouseY: e.clientY,
                      startPositions
                    })
                  }}
                />
              )
            })}

            {/* Unlink buttons render last (on top of every card) so a link's
                midpoint — which sits in a snap gap narrower than the button
                itself — is never covered by the cards it overlaps. */}
            <div
              className="pointer-events-none absolute left-0 top-0"
              style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
            >
              {linkGeometries.map(({ link, midX, midY }) => (
                <button
                  key={link.id}
                  className="pointer-events-auto absolute flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-400 bg-white text-[10px] leading-none text-slate-500 shadow hover:border-red-400 hover:text-red-500"
                  style={{ left: midX, top: midY }}
                  title="Unlink"
                  onClick={() => unlinkItemsAction(link.id)}
                >
                  ×
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface ClusterFrameProps {
  cluster: BoardCluster
  category: CategoryRecord
  dragState: DragState | null
  liveDelta: { dx: number; dy: number }
  onStartMove: (e: React.MouseEvent) => void
  onStartResize: (e: React.MouseEvent) => void
}

function ClusterFrame({ cluster, category, dragState, liveDelta, onStartMove, onStartResize }: ClusterFrameProps): JSX.Element {
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
    <div
      className="absolute rounded-lg border-2 border-dashed"
      style={{ left: x, top: y, width, height, borderColor: category.color, backgroundColor: `${category.color}0f` }}
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
  )
}

interface BoardItemCardProps {
  item: BoardItem
  boardId: string
  x: number
  y: number
  isDragging: boolean
  isSnapping: boolean
  /** realId is passed when a virtual item just materialized, since item.id
   * (a "virtual:..." marker) won't exist in boardItems yet. */
  onStartDrag: (e: React.MouseEvent, realId?: string) => void
}

function BoardItemCard({ item, boardId, x, y, isDragging, isSnapping, onStartDrag }: BoardItemCardProps): JSX.Element | null {
  const data = useProjectStore((s) => s.data)
  const removeItemFromBoard = useProjectStore((s) => s.removeItemFromBoard)
  const addItemToBoard = useProjectStore((s) => s.addItemToBoard)

  if (!data) return null
  const description = describeBoardItem(data, item)
  if (!description) return null

  const isVirtual = item.id.startsWith('virtual:')

  return (
    <div
      className={`group absolute cursor-move select-none rounded border bg-white p-2 text-xs shadow-sm transition-shadow ${
        isSnapping ? 'border-blue-400 ring-2 ring-blue-300' : 'border-slate-300'
      } ${isDragging ? 'shadow-md' : ''}`}
      style={{ left: x, top: y, width: CARD_WIDTH, minHeight: CARD_HEIGHT }}
      onMouseDown={(e) => {
        // A virtual (not-yet-persisted) item materializes into a real
        // BoardItem the moment it's touched, so the drag has something
        // real to move.
        if (isVirtual) {
          const realId = addItemToBoard(boardId, item.refType, item.refId, item.x, item.y)
          onStartDrag(e, realId ?? undefined)
        } else {
          onStartDrag(e)
        }
      }}
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
          onClick={() => {
            if (!isVirtual) removeItemFromBoard(item.id)
          }}
        >
          ×
        </button>
      </div>
      <p className="line-clamp-3 text-slate-700">{description.label}</p>
    </div>
  )
}

export default BoardView
