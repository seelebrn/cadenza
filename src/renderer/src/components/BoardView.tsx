import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import {
  computeAccommodatingSize,
  computeGridPosition,
  findClusterAtPoint,
  findClustersEnclosedBy,
  findSnapTarget,
  getClusterMemberItems,
  getDefaultBoardId,
  getLinkedGroup,
  getVisibleBoardClusters,
  getVisibleBoardItems,
  getVisibleClusterLinks,
  MEMBER_CARD_HEIGHT,
  MEMBER_CARD_WIDTH
} from '@shared/boardOps'
import { getCategoryDepth, getDescendantCategoryIds } from '@shared/categoryOps'
import type { BoardCluster, BoardItem, CategoryKind } from '@shared/types'
import BoardItemCard from './BoardItemCard'
import type { DragState, Position } from './boardDragTypes'
import { MIN_CLUSTER_HEIGHT, MIN_CLUSTER_WIDTH } from './boardLayoutConstants'
import ClusterFrame from './ClusterFrame'

// Single source of truth for a card's rendered size lives in boardOps.ts —
// the cluster auto-layout there needs to know it too, to stack member
// cards without overlapping.
const CARD_WIDTH = MEMBER_CARD_WIDTH
const CARD_HEIGHT = MEMBER_CARD_HEIGHT
const DEFAULT_CLUSTER_WIDTH = 280
const DEFAULT_CLUSTER_HEIGHT = 200
// Breathing room left around a cluster dropped into another when the
// destination grows to accommodate it.
const CLUSTER_NEST_PADDING = 20
const CANVAS_WIDTH = 2400
const CANVAS_HEIGHT = 1600
const PALETTE = ['#8b5cf6', '#3b82f6', '#22c55e', '#f97316', '#ef4444', '#14b8a6', '#eab308', '#ec4899']

const MIN_ZOOM = 0.3
const MAX_ZOOM = 2.5
const ZOOM_WHEEL_SENSITIVITY = 0.0015
// Empty margin left around everything when "Fit view" zooms to show it all.
const FIT_VIEW_PADDING = 60
// How close two cards must get while dragging to snap/link; how far an
// already-linked pair must be dragged apart to sever automatically.
const SNAP_DISTANCE = 70
const UNLINK_DISTANCE = 200

function nextColor(count: number): string {
  return PALETTE[count % PALETTE.length]
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
  const resetBoardLayout = useProjectStore((s) => s.resetBoardLayout)
  const withBatch = useProjectStore((s) => s.withBatch)
  const createClusterLink = useProjectStore((s) => s.createClusterLink)
  const deleteClusterLink = useProjectStore((s) => s.deleteClusterLink)
  const applyTreeLayout = useProjectStore((s) => s.applyTreeLayout)
  const applyRadialLayout = useProjectStore((s) => s.applyRadialLayout)

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
  // Thematic-map cluster links: link mode replaces the normal drag gesture
  // (see ClusterFrame's onPick) rather than racing it, since dragging one
  // cluster onto another already means "nest it". Directed defaults on
  // (an arrow) since a named relationship — "shapes", "contrasts with" —
  // usually reads one way; toggled off for a plain undirected line.
  const [linkMode, setLinkMode] = useState(false)
  const [linkDirected, setLinkDirected] = useState(true)
  const [linkFromCategoryId, setLinkFromCategoryId] = useState<string | null>(null)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  // The actual content layer (holds every cluster/item, sized to the full
  // fixed canvas and zoom-transformed) — captured directly for "Export as
  // PDF" rather than trying to reconstruct the same DOM from React state a
  // second time, so the export can never visually drift from what's
  // actually on screen.
  const canvasRef = useRef<HTMLDivElement>(null)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
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

  // A cluster picked as a link's "from" end only makes sense on the board
  // it was picked on — switching boards (or leaving link mode) drops it,
  // rather than silently carrying a stale pick over to a different board's
  // clusters.
  useEffect(() => {
    setLinkFromCategoryId(null)
  }, [selectedBoardId, linkMode])

  const currentBoard = boards.find((b) => b.id === selectedBoardId) ?? null
  const explicitClusters = data?.boardClusters.filter((c) => c.boardId === selectedBoardId) ?? []
  const links = data?.boardLinks.filter((l) => l.boardId === selectedBoardId) ?? []
  const explicitItems = data?.boardItems.filter((i) => i.boardId === selectedBoardId) ?? []

  // A category created anywhere (the Workspace codebook tab, Analysis >
  // Clusters, or this board) has no board shape until something places one
  // — same reasoning as items below: on the default board, every category
  // shows as a cluster frame automatically, stacked so auto-placed clusters
  // never overlap each other, materializing into a real BoardCluster only
  // once actually touched (moved/resized/dropped into), so creating a
  // cluster in the Workspace is visible here immediately without an extra
  // "place it" step. Computed before `items` since a clustered code/note is
  // positioned relative to its cluster's resolved box.
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

  const items = useMemo<BoardItem[]>(() => {
    if (!data || !currentBoard) return []
    return getVisibleBoardItems(currentBoard, explicitItems, data.codes, data.notes, data.categories, clusters)
  }, [data, currentBoard, explicitItems, clusters])

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
    // currentBoard, not []: the scrollable container only exists in the DOM
    // once currentBoard is non-null (see the `!currentBoard ? ... : <div
    // ref={scrollContainerRef}>` branch below), and on a fresh mount
    // currentBoard is still null on the very first render (the effect a
    // few lines up that resolves a valid selectedBoardId hasn't run yet).
    // With an empty dependency array this effect fired once against a
    // still-null ref and never got a second chance — Ctrl/Cmd+wheel zoom
    // would silently do nothing until something else happened to remount
    // this component. Depending on currentBoard re-attaches once the
    // container actually exists.
  }, [currentBoard])

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

  // "Fit view": zooms and scrolls so every cluster/item currently on the
  // board is visible at once — handy after the auto-layout stacks a lot of
  // clusters into a tall single column, or just to get oriented on a
  // board you haven't looked at in a while, without hunting around
  // manually. Reuses the same zoom-anchor mechanism as wheel-zoom (center
  // the content's bounding-box midpoint in the viewport) when the zoom
  // level actually needs to change; when it doesn't, corrects scroll
  // immediately since there's no re-render to wait on.
  function handleFitToView(): void {
    const container = scrollContainerRef.current
    if (!container) return
    const boxes = [
      ...clusters.map((c) => ({ x: c.x, y: c.y, width: c.width, height: c.height })),
      ...items.map((i) => ({ x: i.x, y: i.y, width: CARD_WIDTH, height: CARD_HEIGHT }))
    ]
    if (boxes.length === 0) return

    const minX = Math.min(...boxes.map((b) => b.x))
    const minY = Math.min(...boxes.map((b) => b.y))
    const maxX = Math.max(...boxes.map((b) => b.x + b.width))
    const maxY = Math.max(...boxes.map((b) => b.y + b.height))
    const boxWidth = maxX - minX
    const boxHeight = maxY - minY
    const viewportWidth = container.clientWidth
    const viewportHeight = container.clientHeight

    const zoomX = viewportWidth / (boxWidth + FIT_VIEW_PADDING * 2)
    const zoomY = viewportHeight / (boxHeight + FIT_VIEW_PADDING * 2)
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(zoomX, zoomY)))
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const offsetX = viewportWidth / 2
    const offsetY = viewportHeight / 2

    if (nextZoom === zoom) {
      container.scrollLeft = centerX * zoom - offsetX
      container.scrollTop = centerY * zoom - offsetY
    } else {
      pendingZoomAnchorRef.current = { contentX: centerX, contentY: centerY, offsetX, offsetY }
      setZoom(nextZoom)
    }
  }

  // "Export as PDF": captures the *live* canvas DOM (clusters + item cards,
  // however they're actually rendered right now) rather than rebuilding an
  // equivalent HTML tree from scratch — the export can never visually
  // drift from what the board actually looks like. Always exports the
  // full content at 100% zoom (ignoring whatever zoom the user happens to
  // be viewing at) so the PDF is the whole board, not just whatever's
  // currently in the viewport.
  async function handleExportBoardPdf(): Promise<void> {
    if (!currentBoard || !canvasRef.current) return
    const boxes = [
      ...clusters.map((c) => ({ x: c.x, y: c.y, width: c.width, height: c.height })),
      ...items.map((i) => ({ x: i.x, y: i.y, width: CARD_WIDTH, height: CARD_HEIGHT }))
    ]
    if (boxes.length === 0) {
      window.alert('Nothing on this board yet to export.')
      return
    }
    const pageWidth = Math.max(...boxes.map((b) => b.x + b.width)) + FIT_VIEW_PADDING
    const pageHeight = Math.max(...boxes.map((b) => b.y + b.height)) + FIT_VIEW_PADDING

    setIsExportingPdf(true)
    try {
      // The app's own compiled styles (Tailwind utility classes and
      // everything else) — read straight from the live page's already-
      // parsed stylesheets rather than trying to locate the CSS bundle
      // file on disk, so this works identically in dev and in a packaged
      // build. A stylesheet that throws on .cssRules (a cross-origin one,
      // not expected here but cheap to guard) is just skipped.
      const css = Array.from(document.styleSheets)
        .map((sheet) => {
          try {
            return Array.from(sheet.cssRules)
              .map((rule) => rule.cssText)
              .join('\n')
          } catch {
            return ''
          }
        })
        .join('\n')

      const snapshot = canvasRef.current.cloneNode(true) as HTMLElement
      snapshot.style.transform = 'none'
      snapshot.style.width = `${pageWidth}px`
      snapshot.style.height = `${pageHeight}px`

      const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}\nhtml,body{margin:0;padding:0;}</style></head><body>${snapshot.outerHTML}</body></html>`

      const savedPath = await window.api.export.boardPdf(html, pageWidth, pageHeight, currentBoard.name)
      if (savedPath) window.alert(`Exported to ${savedPath}`)
    } finally {
      setIsExportingPdf(false)
    }
  }

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

      // One drag gesture can call several store actions in a row (moving a
      // whole linked group, re-evaluating cluster membership, nesting +
      // resizing a destination cluster…) — batched so it undoes as the one
      // gesture the user actually performed, not action-by-action.
      withBatch(() => {
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
            if (newParentId !== currentParentId) {
              reparentCategory(state.categoryId, newParentId)
              // Newly nested (not just re-confirming an existing parent) —
              // grow the destination to actually fit the cluster just
              // dropped into it, matching the live ghost preview shown
              // during the drag.
              if (target) {
                const childRect = { x: finalX, y: finalY, width: state.startWidth, height: state.startHeight }
                const size = computeAccommodatingSize(target, childRect, CLUSTER_NEST_PADDING)
                if (size.width !== target.width || size.height !== target.height) {
                  resizeCluster(materializeCluster(target), size.width, size.height)
                }
              }
            }
          }
        } else {
          const width = Math.max(MIN_CLUSTER_WIDTH, state.startWidth + dx)
          const height = Math.max(MIN_CLUSTER_HEIGHT, state.startHeight + dy)
          resizeCluster(state.id, width, height)

          // Resizing to enclose other existing clusters "draws a box
          // around" them — nest whichever ones ended up entirely inside
          // the grown frame. Same containment check the live highlight
          // during the drag used (resizeEnclosedCategoryIds below), just
          // against the final size, so what got highlighted is exactly
          // what nests.
          const resizingCluster = clusters.find((c) => c.id === state.id)
          if (resizingCluster) {
            const box = { x: resizingCluster.x, y: resizingCluster.y, width, height }
            const excluded = new Set([
              state.categoryId,
              ...getDescendantCategoryIds(currentData.categories, state.categoryId)
            ])
            for (const enclosed of findClustersEnclosedBy(clusters, box, excluded)) {
              reparentCategory(enclosed.categoryId, state.categoryId)
            }
          }
        }
      })
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

  // While dragging a cluster over another one it would nest into on drop,
  // identifies that destination so ClusterFrame can highlight it clearly
  // (not just show the size-change ghost below, which stays null whenever
  // the destination is already big enough — a real, valid target the user
  // still needs to see) — computed with the same candidate/target logic
  // handleMouseUp uses at drop time, just fed the in-progress liveDelta
  // instead of the final dx/dy, so the two can never disagree about what
  // counts as a valid target.
  const dragNestTarget = useMemo(() => {
    if (!data || dragState?.kind !== 'cluster-move' || dragState.shiftKey) return null
    const finalX = dragState.startX + liveDelta.dx
    const finalY = dragState.startY + liveDelta.dy
    const excluded = new Set([
      dragState.categoryId,
      ...getDescendantCategoryIds(data.categories, dragState.categoryId)
    ])
    const candidateClusters = clusters.filter((c) => !excluded.has(c.categoryId))
    const centerX = finalX + dragState.startWidth / 2
    const centerY = finalY + dragState.startHeight / 2
    const target = findClusterAtPoint(candidateClusters, centerX, centerY)
    if (!target) return null
    const childRect = { x: finalX, y: finalY, width: dragState.startWidth, height: dragState.startHeight }
    const size = computeAccommodatingSize(target, childRect, CLUSTER_NEST_PADDING)
    // A ghost outline is only useful when the target actually needs to
    // grow — but it's still the nest target (and still gets highlighted)
    // when it's already roomy enough to not need one.
    const growSize = size.width === target.width && size.height === target.height ? null : size
    return { targetClusterId: target.id, growSize }
  }, [data, dragState, liveDelta, clusters])

  // While resizing a cluster so its frame grows to enclose other existing
  // clusters, live-highlights which ones are currently fully inside the
  // growing box — the set that becomes this cluster's new children on
  // release (handleMouseUp's cluster-resize branch re-runs this same
  // containment check against the final size, so what's highlighted here
  // is exactly what nests).
  const resizeEnclosedCategoryIds = useMemo(() => {
    if (!data || dragState?.kind !== 'cluster-resize') return new Set<string>()
    const resizingCluster = clusters.find((c) => c.id === dragState.id)
    if (!resizingCluster) return new Set<string>()
    const width = Math.max(MIN_CLUSTER_WIDTH, dragState.startWidth + liveDelta.dx)
    const height = Math.max(MIN_CLUSTER_HEIGHT, dragState.startHeight + liveDelta.dy)
    const box = { x: resizingCluster.x, y: resizingCluster.y, width, height }
    const excluded = new Set([
      dragState.categoryId,
      ...getDescendantCategoryIds(data.categories, dragState.categoryId)
    ])
    return new Set(findClustersEnclosedBy(clusters, box, excluded).map((c) => c.categoryId))
  }, [data, dragState, liveDelta, clusters])

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

  // Thematic-map cluster links visible on this board (both endpoints
  // present here — see getVisibleClusterLinks) — geometry between cluster
  // centers, same live-drag-following treatment as clusterLinkGeometries'
  // item-link counterpart above: an endpoint currently being dragged as
  // part of a cluster-move follows liveDelta so the line doesn't lag a
  // frame behind the frame it's attached to.
  const clusterLinkGeometries = useMemo(() => {
    if (!data) return []
    const visible = getVisibleClusterLinks(data.clusterLinks, clusters)
    return visible
      .map((link) => {
        const a = clusters.find((c) => c.categoryId === link.fromCategoryId)
        const b = clusters.find((c) => c.categoryId === link.toCategoryId)
        if (!a || !b) return null
        const aMoving = dragState?.kind === 'cluster-move' && dragState.groupClusterIds.includes(a.id)
        const bMoving = dragState?.kind === 'cluster-move' && dragState.groupClusterIds.includes(b.id)
        const ax = a.x + (aMoving ? liveDelta.dx : 0) + a.width / 2
        const ay = a.y + (aMoving ? liveDelta.dy : 0) + a.height / 2
        const bx = b.x + (bMoving ? liveDelta.dx : 0) + b.width / 2
        const by = b.y + (bMoving ? liveDelta.dy : 0) + b.height / 2
        return { link, ax, ay, bx, by, midX: (ax + bx) / 2, midY: (ay + by) / 2 }
      })
      .filter((g): g is NonNullable<typeof g> => g !== null)
  }, [data, clusters, dragState, liveDelta])

  if (!data) return <></>

  function handlePickClusterForLink(categoryId: string): void {
    if (!linkFromCategoryId) {
      setLinkFromCategoryId(categoryId)
      return
    }
    if (linkFromCategoryId === categoryId) {
      setLinkFromCategoryId(null) // clicking the same cluster again cancels the pick
      return
    }
    const label = window.prompt('Label this relationship (e.g. "shapes", "contrasts with"):', '')
    if (label !== null) createClusterLink(linkFromCategoryId, categoryId, label.trim(), linkDirected)
    setLinkFromCategoryId(null)
  }

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

            {!currentBoard.isDefault && (
              <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                <button
                  className={`rounded border px-2 py-1 text-xs ${
                    linkMode
                      ? 'border-sky-500 bg-sky-500 text-white'
                      : 'border-slate-300 hover:bg-slate-100'
                  }`}
                  title="Click one cluster, then another, to draw a labeled relationship between them (a thematic-map link)"
                  onClick={() => setLinkMode((v) => !v)}
                >
                  🔗 {linkMode ? 'Linking: click two clusters' : 'Link clusters'}
                </button>
                {linkMode && (
                  <label className="flex items-center gap-1 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={linkDirected}
                      onChange={(e) => setLinkDirected(e.target.checked)}
                    />
                    Arrow
                  </label>
                )}
                <button
                  className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                  title="Re-arrange this board's clusters as a top-down hierarchical tree, following their superordinate/subordinate structure — you can still drag them afterward"
                  onClick={() => applyTreeLayout(currentBoard.id)}
                >
                  Tree
                </button>
                <button
                  className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                  title="Re-arrange this board's clusters radially around one focus cluster (the first one, by default) — you can still drag them afterward"
                  onClick={() => applyRadialLayout(currentBoard.id, clusters[0]?.categoryId ?? null)}
                >
                  Radial
                </button>
              </div>
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
          {currentBoard?.isDefault && (
            <button
              className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-100"
              title="Drop every dragged/resized position on this board and recompute the default grid layout from scratch"
              onClick={() => {
                if (
                  window.confirm(
                    'Reset every cluster and item on this board back to its automatic default layout? Any positions you\'ve dragged or resized here will be lost — the underlying codes, notes, and clusters themselves are not affected.'
                  )
                ) {
                  resetBoardLayout(currentBoard.id)
                }
              }}
            >
              Reset placement
            </button>
          )}
          {currentBoard && (
            <button
              className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-100 disabled:opacity-40"
              title="Export this board's full layout (not just what's currently visible) as a single-page PDF"
              disabled={isExportingPdf}
              onClick={() => void handleExportBoardPdf()}
            >
              {isExportingPdf ? 'Exporting…' : 'Export as PDF'}
            </button>
          )}
          <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
          <button
            className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-100"
            onClick={handleFitToView}
          >
            Fit view
          </button>
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
          superordinate group (shift+drag to pull it out) · click the × on a connector to unlink · right-click a
          code/note card for its full info and verbatim excerpts
          {!currentBoard.isDefault &&
            ' · "Link clusters" then click two clusters to draw a labeled thematic-map relationship between them'}
        </p>
      )}

      {!currentBoard ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          Create a board to start grouping codes, notes, and quotes spatially.
        </div>
      ) : (
        <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-slate-50">
          <div
            ref={canvasRef}
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
              <defs>
                <marker
                  id="cluster-link-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
                </marker>
              </defs>
              {linkGeometries.map(({ link, ax, ay, bx, by }) => (
                <line key={link.id} x1={ax} y1={ay} x2={bx} y2={by} stroke="#94a3b8" strokeWidth={2} />
              ))}
              {/* Thematic-map cluster links — a labeled relationship between two
                  clusters (see ClusterLink in types.ts), distinct from the plain
                  item-link lines above. Drawn with an optional arrowhead for a
                  directed relationship, and the label on a small background
                  rect so it stays legible over whatever it crosses. */}
              {clusterLinkGeometries.map(({ link, ax, ay, bx, by, midX, midY }) => (
                <g key={link.id}>
                  <line
                    x1={ax}
                    y1={ay}
                    x2={bx}
                    y2={by}
                    stroke="#475569"
                    strokeWidth={2}
                    markerEnd={link.directed ? 'url(#cluster-link-arrow)' : undefined}
                  />
                  {link.label && (
                    <>
                      <rect
                        x={midX - (link.label.length * 3.2 + 6)}
                        y={midY - 9}
                        width={link.label.length * 6.4 + 12}
                        height={18}
                        rx={4}
                        fill="white"
                        stroke="#cbd5e1"
                      />
                      <text x={midX} y={midY + 4} textAnchor="middle" fontSize={11} fill="#334155">
                        {link.label}
                      </text>
                    </>
                  )}
                </g>
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
                  depth={getCategoryDepth(data.categories, category.id)}
                  dragState={dragState}
                  liveDelta={liveDelta}
                  resizePreview={dragNestTarget?.targetClusterId === cluster.id ? dragNestTarget.growSize : null}
                  isNestTarget={dragNestTarget?.targetClusterId === cluster.id}
                  isEnclosedByResize={resizeEnclosedCategoryIds.has(cluster.categoryId)}
                  isLinkMode={linkMode}
                  isLinkPicked={linkFromCategoryId === category.id}
                  onPick={() => handlePickClusterForLink(category.id)}
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
                      categoryId: category.id,
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
              {/* Offset below the label rather than centered on it (unlike the
                  item-unlink button above, which sits on a bare line with
                  nothing else to cover) so this never sits on top of the
                  cluster-link's own label text. */}
              {clusterLinkGeometries.map(({ link, midX, midY }) => (
                <button
                  key={link.id}
                  className="pointer-events-auto absolute flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full border border-slate-400 bg-white text-[10px] leading-none text-slate-500 shadow hover:border-red-400 hover:text-red-500"
                  style={{ left: midX, top: midY + 12 }}
                  title="Remove this relationship"
                  onClick={() => deleteClusterLink(link.id)}
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

export default BoardView
