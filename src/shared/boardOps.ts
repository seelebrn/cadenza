// Pure operations for the visual grouping board: freeform canvases holding
// BoardItems (referencing a code, note, or segment, at an x/y position) that
// can be dragged into BoardClusters. A cluster is *always* a CategoryRecord's
// spatial shape on a given board (see BoardCluster in types.ts) — there is
// no separate cluster-membership or promotion step, so managing membership
// here (Categories view, another board, this board) is always the same
// underlying data, never a copy that can drift.
//
// The default board (BoardRecord.isDefault) auto-shows every code and note
// without requiring an explicit BoardItem — see computeGridPosition, used by
// the renderer to lay out anything that doesn't have a stored position yet.

import { nanoid } from 'nanoid'
import {
  addMemberByRefType,
  createCategory,
  isCategoryMember,
  removeMemberByRefType
} from './categoryOps'
import type { BoardCluster, BoardItem, BoardRecord, CategoryKind, CategoryRecord, ProjectData } from './types'

export interface BoardItemDescription {
  label: string
  sublabel: string
  color: string | null
}

/** Pure display helper: resolves a board item's ref to what a card should
 * show. Returns null if the ref no longer exists (e.g. its code was
 * deleted) — the caller should skip rendering that item. */
export function describeBoardItem(data: ProjectData, item: BoardItem): BoardItemDescription | null {
  if (item.refType === 'code') {
    const code = data.codes.find((c) => c.id === item.refId)
    if (!code) return null
    return { label: code.name, sublabel: code.kind, color: code.color }
  }
  if (item.refType === 'note') {
    const note = data.notes.find((n) => n.id === item.refId)
    if (!note) return null
    const category = data.noteCategories.find((c) => c.id === note.noteCategoryId)
    return {
      label: note.question || note.answer.slice(0, 60) || '(empty note)',
      sublabel: 'note',
      color: category?.color ?? null
    }
  }
  const segment = data.segments.find((s) => s.id === item.refId)
  if (!segment) return null
  return { label: segment.text.slice(0, 60), sublabel: 'quote', color: null }
}

/** Which cluster (if any) contains a point — used both for "which cluster
 * does this dropped item land in" and "which cluster does this dropped
 * cluster land in" (nesting). Prefers the smallest containing rect if
 * several overlap, so a small frame nested inside a bigger one wins. */
export function findClusterAtPoint(clusters: BoardCluster[], px: number, py: number): BoardCluster | null {
  let best: BoardCluster | null = null
  let bestArea = Infinity
  for (const c of clusters) {
    if (px >= c.x && px <= c.x + c.width && py >= c.y && py <= c.y + c.height) {
      const area = c.width * c.height
      if (area < bestArea) {
        best = c
        bestArea = area
      }
    }
  }
  return best
}

// --- Boards ---

export function getDefaultBoardId(boards: BoardRecord[]): string | null {
  return boards.find((b) => b.isDefault)?.id ?? boards[0]?.id ?? null
}

export function createBoard(data: ProjectData, name: string): { data: ProjectData; boardId: string } {
  const board: BoardRecord = { id: nanoid(), name, isDefault: false }
  return { data: { ...data, boards: [...data.boards, board] }, boardId: board.id }
}

export function renameBoard(data: ProjectData, boardId: string, name: string): ProjectData {
  return { ...data, boards: data.boards.map((b) => (b.id === boardId ? { ...b, name } : b)) }
}

/** Deletes a board and everything on it (items + clusters + links) — other
 * boards untouched. If it was the default board, promotes another board to
 * default so there's always exactly one (when any boards remain). */
export function deleteBoard(data: ProjectData, boardId: string): ProjectData {
  const target = data.boards.find((b) => b.id === boardId)
  let boards = data.boards.filter((b) => b.id !== boardId)
  if (target?.isDefault && boards.length > 0 && !boards.some((b) => b.isDefault)) {
    boards = boards.map((b, i) => (i === 0 ? { ...b, isDefault: true } : b))
  }
  return {
    ...data,
    boards,
    boardItems: data.boardItems.filter((i) => i.boardId !== boardId),
    boardClusters: data.boardClusters.filter((c) => c.boardId !== boardId),
    boardLinks: data.boardLinks.filter((l) => l.boardId !== boardId)
  }
}

// --- Items ---

/** Adds a code/note/segment to a board at a position, or no-ops (returning
 * the existing item's id) if that ref is already on this board. */
export function addItemToBoard(
  data: ProjectData,
  boardId: string,
  refType: BoardItem['refType'],
  refId: string,
  x: number,
  y: number
): { data: ProjectData; itemId: string } {
  const existing = data.boardItems.find(
    (i) => i.boardId === boardId && i.refType === refType && i.refId === refId
  )
  if (existing) return { data, itemId: existing.id }

  const item: BoardItem = { id: nanoid(), boardId, refType, refId, x, y }
  return { data: { ...data, boardItems: [...data.boardItems, item] }, itemId: item.id }
}

export function moveItem(data: ProjectData, itemId: string, x: number, y: number): ProjectData {
  return { ...data, boardItems: data.boardItems.map((i) => (i.id === itemId ? { ...i, x, y } : i)) }
}

export function removeItemFromBoard(data: ProjectData, itemId: string): ProjectData {
  return {
    ...data,
    boardItems: data.boardItems.filter((i) => i.id !== itemId),
    boardLinks: data.boardLinks.filter((l) => l.itemAId !== itemId && l.itemBId !== itemId)
  }
}

// --- Grid auto-layout (default-board auto-visibility + bulk-add actions) ---

const GRID_ORIGIN_X = 40
const GRID_ORIGIN_Y = 40
const GRID_COLUMNS = 8
const GRID_COLUMN_WIDTH = 200
const GRID_ROW_HEIGHT = 90

/** Deterministic fallback position for the Nth auto-placed item — used to
 * lay out anything that doesn't have a stored BoardItem position yet
 * (the default board's auto-visible codes/notes), and by the bulk "add
 * all ___" actions. */
export function computeGridPosition(index: number): { x: number; y: number } {
  const column = index % GRID_COLUMNS
  const row = Math.floor(index / GRID_COLUMNS)
  return { x: GRID_ORIGIN_X + column * GRID_COLUMN_WIDTH, y: GRID_ORIGIN_Y + row * GRID_ROW_HEIGHT }
}

/**
 * The items a board should actually show: on the default board, every code
 * and note is visible whether or not it has an explicit BoardItem yet
 * (falling back to a deterministic grid position for anything that
 * doesn't); other boards only show what's been explicitly placed. Kept as
 * its own pure, tested function rather than inline in the component,
 * because this is exactly the kind of indexing logic that's easy to get
 * subtly wrong and hard to verify just by reading it.
 */
export function getVisibleBoardItems(
  board: Pick<BoardRecord, 'id' | 'isDefault'>,
  explicitItems: BoardItem[],
  codes: Array<{ id: string }>,
  notes: Array<{ id: string }>
): BoardItem[] {
  if (!board.isDefault) return explicitItems

  const explicitByRef = new Map(explicitItems.map((i) => [`${i.refType}:${i.refId}`, i]))
  const result: BoardItem[] = []
  let autoIndex = 0

  for (const code of codes) {
    const key = `code:${code.id}`
    const existing = explicitByRef.get(key)
    if (existing) {
      result.push(existing)
    } else {
      const pos = computeGridPosition(autoIndex++)
      result.push({ id: `virtual:${key}`, boardId: board.id, refType: 'code', refId: code.id, ...pos })
    }
  }
  for (const note of notes) {
    const key = `note:${note.id}`
    const existing = explicitByRef.get(key)
    if (existing) {
      result.push(existing)
    } else {
      const pos = computeGridPosition(autoIndex++)
      result.push({ id: `virtual:${key}`, boardId: board.id, refType: 'note', refId: note.id, ...pos })
    }
  }
  // Any explicitly-added segment (quote) items always show too.
  result.push(...explicitItems.filter((i) => i.refType === 'segment'))
  return result
}

const CLUSTER_GRID_COLUMNS = 4
const CLUSTER_GRID_COLUMN_WIDTH = 320
const CLUSTER_GRID_ROW_HEIGHT = 240
const DEFAULT_CLUSTER_WIDTH = 280
const DEFAULT_CLUSTER_HEIGHT = 200

function computeClusterGridPosition(index: number): { x: number; y: number } {
  const column = index % CLUSTER_GRID_COLUMNS
  const row = Math.floor(index / CLUSTER_GRID_COLUMNS)
  return {
    x: GRID_ORIGIN_X + column * CLUSTER_GRID_COLUMN_WIDTH,
    y: GRID_ORIGIN_Y + row * CLUSTER_GRID_ROW_HEIGHT
  }
}

/** Adds every code not already on this board, laid out in a grid. */
export function addAllCodesToBoard(data: ProjectData, boardId: string): ProjectData {
  const existing = new Set(
    data.boardItems.filter((i) => i.boardId === boardId && i.refType === 'code').map((i) => i.refId)
  )
  const toAdd = data.codes.filter((c) => !existing.has(c.id))
  if (toAdd.length === 0) return data
  const startIndex = data.boardItems.filter((i) => i.boardId === boardId).length
  const newItems: BoardItem[] = toAdd.map((code, i) => {
    const pos = computeGridPosition(startIndex + i)
    return { id: nanoid(), boardId, refType: 'code', refId: code.id, x: pos.x, y: pos.y }
  })
  return { ...data, boardItems: [...data.boardItems, ...newItems] }
}

/** Adds every note not already on this board, laid out in a grid. */
export function addAllNotesToBoard(data: ProjectData, boardId: string): ProjectData {
  const existing = new Set(
    data.boardItems.filter((i) => i.boardId === boardId && i.refType === 'note').map((i) => i.refId)
  )
  const toAdd = data.notes.filter((n) => !existing.has(n.id))
  if (toAdd.length === 0) return data
  const startIndex = data.boardItems.filter((i) => i.boardId === boardId).length
  const newItems: BoardItem[] = toAdd.map((note, i) => {
    const pos = computeGridPosition(startIndex + i)
    return { id: nanoid(), boardId, refType: 'note', refId: note.id, x: pos.x, y: pos.y }
  })
  return { ...data, boardItems: [...data.boardItems, ...newItems] }
}

/** Adds every category not already shaped on this board as a cluster (grid
 * layout), and ensures each of its current members also has a board item
 * here, positioned inside the new cluster — so the existing grouping
 * structure is visible immediately, not just the empty frames. */
export function addAllClustersToBoard(data: ProjectData, boardId: string): ProjectData {
  const existingCategoryIds = new Set(
    data.boardClusters.filter((c) => c.boardId === boardId).map((c) => c.categoryId)
  )
  const categoriesToPlace = data.categories.filter((c) => !existingCategoryIds.has(c.id))
  if (categoriesToPlace.length === 0) return data

  let next = data
  const startIndex = data.boardClusters.filter((c) => c.boardId === boardId).length

  categoriesToPlace.forEach((category, categoryIndex) => {
    const pos = computeClusterGridPosition(startIndex + categoryIndex)
    const clusterResult = createClusterForCategory(next, {
      boardId,
      categoryId: category.id,
      x: pos.x,
      y: pos.y,
      width: DEFAULT_CLUSTER_WIDTH,
      height: DEFAULT_CLUSTER_HEIGHT
    })
    next = clusterResult.data

    const members: Array<{ refType: BoardItem['refType']; refId: string }> = [
      ...category.codeIds.map((refId) => ({ refType: 'code' as const, refId })),
      ...category.noteIds.map((refId) => ({ refType: 'note' as const, refId })),
      ...category.segmentIds.map((refId) => ({ refType: 'segment' as const, refId }))
    ]
    members.forEach((member, memberIndex) => {
      const alreadyOnBoard = next.boardItems.some(
        (bi) => bi.boardId === boardId && bi.refType === member.refType && bi.refId === member.refId
      )
      if (alreadyOnBoard) return
      const item: BoardItem = {
        id: nanoid(),
        boardId,
        refType: member.refType,
        refId: member.refId,
        x: pos.x + 10,
        y: pos.y + 34 + memberIndex * 20
      }
      next = { ...next, boardItems: [...next.boardItems, item] }
    })
  })

  return next
}

// --- Clusters (category shapes) ---

export function findClusterForCategoryOnBoard(
  clusters: BoardCluster[],
  boardId: string,
  categoryId: string
): BoardCluster | undefined {
  return clusters.find((c) => c.boardId === boardId && c.categoryId === categoryId)
}

/** Places an existing category as a cluster on a board. No-ops (returns the
 * existing cluster's id) if that category already has a shape there. */
export function createClusterForCategory(
  data: ProjectData,
  input: { boardId: string; categoryId: string; x: number; y: number; width: number; height: number }
): { data: ProjectData; clusterId: string } {
  const existing = findClusterForCategoryOnBoard(data.boardClusters, input.boardId, input.categoryId)
  if (existing) return { data, clusterId: existing.id }
  const cluster: BoardCluster = {
    id: nanoid(),
    boardId: input.boardId,
    categoryId: input.categoryId,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    createdAt: new Date().toISOString()
  }
  return { data: { ...data, boardClusters: [...data.boardClusters, cluster] }, clusterId: cluster.id }
}

/** Creates a brand-new category and places it as a cluster on a board in one
 * step — the "+ New cluster" action (no separate promotion step exists). */
export function createClusterWithNewCategory(
  data: ProjectData,
  input: {
    boardId: string
    name: string
    kind: CategoryKind
    color: string
    x: number
    y: number
    width: number
    height: number
  }
): { data: ProjectData; clusterId: string; categoryId: string } {
  const created = createCategory(data, { name: input.name, kind: input.kind, color: input.color })
  const clustered = createClusterForCategory(created.data, {
    boardId: input.boardId,
    categoryId: created.categoryId,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height
  })
  return { data: clustered.data, clusterId: clustered.clusterId, categoryId: created.categoryId }
}

export function moveCluster(data: ProjectData, clusterId: string, x: number, y: number): ProjectData {
  return { ...data, boardClusters: data.boardClusters.map((c) => (c.id === clusterId ? { ...c, x, y } : c)) }
}

export function resizeCluster(
  data: ProjectData,
  clusterId: string,
  width: number,
  height: number
): ProjectData {
  return {
    ...data,
    boardClusters: data.boardClusters.map((c) => (c.id === clusterId ? { ...c, width, height } : c))
  }
}

/** Removes a cluster's shape from this board — the category itself (and its
 * membership) is untouched; it's just no longer drawn here. */
export function deleteCluster(data: ProjectData, clusterId: string): ProjectData {
  return { ...data, boardClusters: data.boardClusters.filter((c) => c.id !== clusterId) }
}

export function assignItemToCluster(
  data: ProjectData,
  clusterId: string,
  refType: BoardItem['refType'],
  refId: string
): ProjectData {
  const cluster = data.boardClusters.find((c) => c.id === clusterId)
  if (!cluster) return data
  return addMemberByRefType(data, cluster.categoryId, refType, refId)
}

export function unassignItemFromCluster(
  data: ProjectData,
  clusterId: string,
  refType: BoardItem['refType'],
  refId: string
): ProjectData {
  const cluster = data.boardClusters.find((c) => c.id === clusterId)
  if (!cluster) return data
  return removeMemberByRefType(data, cluster.categoryId, refType, refId)
}

/** Which of this board's items currently belong to a category — used when
 * dragging a cluster frame, so its actual members (the logical truth) move
 * with it rather than whatever happens to be geometrically inside it. */
export function getClusterMemberItems(items: BoardItem[], category: CategoryRecord): BoardItem[] {
  return items.filter((item) => isCategoryMember(category, item.refType, item.refId))
}

// --- Links (pairwise, distinct from cluster/category membership) ---

export function linkItems(
  data: ProjectData,
  boardId: string,
  itemAId: string,
  itemBId: string
): ProjectData {
  if (itemAId === itemBId) return data
  const alreadyLinked = data.boardLinks.some(
    (l) =>
      l.boardId === boardId &&
      ((l.itemAId === itemAId && l.itemBId === itemBId) || (l.itemAId === itemBId && l.itemBId === itemAId))
  )
  if (alreadyLinked) return data
  const link = { id: nanoid(), boardId, itemAId, itemBId, createdAt: new Date().toISOString() }
  return { ...data, boardLinks: [...data.boardLinks, link] }
}

export function unlinkItems(data: ProjectData, linkId: string): ProjectData {
  return { ...data, boardLinks: data.boardLinks.filter((l) => l.id !== linkId) }
}

/** Every item transitively connected to itemId via links (including itemId
 * itself) — the rigid group that should move together when one of its
 * members is dragged. An item with no links returns just itself. */
export function getLinkedGroup(
  links: Array<{ itemAId: string; itemBId: string }>,
  itemId: string
): Set<string> {
  const adjacency = new Map<string, string[]>()
  function addEdge(from: string, to: string): void {
    if (!adjacency.has(from)) adjacency.set(from, [])
    adjacency.get(from)!.push(to)
  }
  for (const link of links) {
    addEdge(link.itemAId, link.itemBId)
    addEdge(link.itemBId, link.itemAId)
  }

  const visited = new Set<string>([itemId])
  const queue = [itemId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }
  }
  return visited
}

export interface PositionedItem {
  id: string
  x: number
  y: number
}

export interface SnapResult {
  targetId: string
  snappedX: number
  snappedY: number
}

/**
 * Finds the nearest other item within snapDistance of a tentative (x, y)
 * position, and where the dragged card should snap to sit edge-to-edge
 * beside it — used both for a live "magnetic" preview while dragging and
 * to decide the final drop position + auto-link. Snaps along whichever
 * axis (horizontal/vertical) the two cards are more aligned on.
 */
export function findSnapTarget(
  items: PositionedItem[],
  draggedItemId: string,
  x: number,
  y: number,
  cardWidth: number,
  cardHeight: number,
  snapDistance: number
): SnapResult | null {
  const centerX = x + cardWidth / 2
  const centerY = y + cardHeight / 2

  let best: (PositionedItem & { dist: number }) | null = null
  for (const item of items) {
    if (item.id === draggedItemId) continue
    const otherCenterX = item.x + cardWidth / 2
    const otherCenterY = item.y + cardHeight / 2
    const dist = Math.hypot(centerX - otherCenterX, centerY - otherCenterY)
    if (dist <= snapDistance && (!best || dist < best.dist)) {
      best = { ...item, dist }
    }
  }
  if (!best) return null

  const gap = 12
  const dx = centerX - (best.x + cardWidth / 2)
  const dy = centerY - (best.y + cardHeight / 2)
  const snappedX = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? best.x + cardWidth + gap : best.x - cardWidth - gap) : best.x
  const snappedY = Math.abs(dx) >= Math.abs(dy) ? best.y : dy >= 0 ? best.y + cardHeight + gap : best.y - cardHeight - gap

  return { targetId: best.id, snappedX, snappedY }
}
