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
import type { BoardCluster, BoardItem, BoardRecord, CategoryKind, CategoryRecord, ClusterLink, ProjectData } from './types'

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

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The size a destination cluster needs to fully contain a child rect
 * (plus `padding` breathing room) dropped into it — used when nesting a
 * cluster into another on the board, so the destination visibly grows to
 * accommodate the one just dropped in rather than staying whatever fixed
 * size it happened to already be.
 *
 * Deliberately only ever grows width/height — never moves the parent's x/y
 * — so an already-nested sibling cluster (positioned in absolute canvas
 * coordinates, not relative to the parent) can't be silently orphaned by
 * the parent's origin shifting out from under it. The trade-off: a child
 * dropped so it pokes out past the parent's *top* or *left* edge (rather
 * than its bottom/right) isn't fully accommodated — it'll visually
 * overhang that edge instead. Growing toward the bottom/right, where a
 * cluster's own resize handle already lives, covers the common case.
 */
export function computeAccommodatingSize(parent: Rect, child: Rect, padding: number): { width: number; height: number } {
  return {
    width: Math.max(parent.width, child.x + child.width - parent.x + padding),
    height: Math.max(parent.height, child.y + child.height - parent.y + padding)
  }
}

/**
 * The clusters fully enclosed by `box` — used when resizing a cluster so
 * its frame grows to visually "draw a box around" other existing
 * clusters: whichever ones end up entirely inside become that cluster's
 * new children on release. `excludeCategoryIds` leaves out the cluster
 * being resized itself and anything already nested under it (already
 * correctly a child, not a *new* one this resize is about to create).
 *
 * Containment, not overlap — a cluster only half-covered by the growing
 * box isn't a candidate yet, matching what the user actually sees ("is
 * this one fully inside the box I'm drawing").
 */
export function findClustersEnclosedBy(
  clusters: BoardCluster[],
  box: Rect,
  excludeCategoryIds: Set<string>
): BoardCluster[] {
  return clusters.filter((c) => {
    if (excludeCategoryIds.has(c.categoryId)) return false
    return c.x >= box.x && c.y >= box.y && c.x + c.width <= box.x + box.width && c.y + c.height <= box.y + box.height
  })
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

/** A board item card's rendered size — kept here (not just in BoardView.tsx)
 * because the cluster auto-layout below needs to know it to stack member
 * cards without overlapping; BoardView imports these rather than keeping
 * its own separate copy, so the two can't quietly drift apart. */
export const MEMBER_CARD_WIDTH = 180
export const MEMBER_CARD_HEIGHT = 64

/** Deterministic fallback position for the Nth auto-placed item — used to
 * lay out anything that doesn't have a stored BoardItem position yet
 * (the default board's auto-visible codes/notes), and by the bulk "add
 * all ___" actions. `originY` shifts the whole grid down (used to keep
 * unclustered items clear of the auto-placed cluster frames above them). */
export function computeGridPosition(index: number, originY: number = GRID_ORIGIN_Y): { x: number; y: number } {
  const column = index % GRID_COLUMNS
  const row = Math.floor(index / GRID_COLUMNS)
  return { x: GRID_ORIGIN_X + column * GRID_COLUMN_WIDTH, y: originY + row * GRID_ROW_HEIGHT }
}

const DEFAULT_CLUSTER_WIDTH = 280
const DEFAULT_CLUSTER_HEIGHT = 200
const CLUSTER_GAP = 40
const CLUSTER_HEADER_HEIGHT = 28
// Also the margin a nested cluster's box is indented by within its
// parent — kept generous (not just enough for a member card) so a nested
// cluster's dashed border reads as clearly separate from its parent's,
// rather than a couple of pixels that blur together at normal zoom.
const CLUSTER_PADDING = 20
// Vertical and horizontal gap between member cards auto-arranged inside a
// cluster's own content area (see ownMemberGridSize below) — the same 8px
// either direction, just named separately since one folds into a row
// height and the other into a column width.
const MEMBER_CARD_GAP = 8
const CLUSTER_MEMBER_ROW_HEIGHT = MEMBER_CARD_HEIGHT + MEMBER_CARD_GAP

// How many columns the default board's auto-layout packs a set of
// siblings into — both the root categories directly on the board, and any
// category's own nested children (see getVisibleBoardClusters below). A
// near-square count (round up from sqrt of the sibling count) so even a
// handful of siblings form a sensible grid rather than a single wide row
// or a single tall column, capped so a large flat set doesn't stretch
// impossibly wide instead of wrapping into more rows.
const GRID_MAX_COLUMNS = 6

function packGridColumnCount(siblingCount: number): number {
  return Math.max(1, Math.min(GRID_MAX_COLUMNS, Math.ceil(Math.sqrt(siblingCount))))
}

export interface ComputedClusterLayout {
  categoryId: string
  x: number
  y: number
  width: number
  height: number
}

/**
 * The ideal, non-overlapping layout for a whole set of categories —
 * masonry-packed roots, each box sized to fit a grid of its own member
 * codes/notes plus a grid of its nested children, a nested category placed
 * genuinely inside its parent's box (below the parent's own member cards,
 * indented). This is the core algorithm behind the default board's
 * automatic layout (getVisibleBoardClusters below) *and* behind bulk-
 * placing every cluster onto any board at once (addAllClustersToBoard) —
 * factored out so both get the same visual quality instead of the bulk-add
 * path reimplementing a cruder, disconnected-from-real-size version of its
 * own (which is exactly what used to cause tall clusters to overlap the
 * next row on a fixed grid that had no idea how tall they actually were).
 *
 * `explicitOverrides`, keyed by category id, pins some categories to an
 * already-decided position/size instead of computing one — used by
 * getVisibleBoardClusters for a category that already has a real, user-
 * placed BoardCluster on the default board, and by addAllClustersToBoard
 * for whatever's already explicitly on the target board (so newly bulk-
 * added clusters lay out relative to reality, not a hypothetical fresh
 * position for something that's already sitting somewhere else). Leave a
 * category out of it (the default) to always compute its position fresh.
 *
 * Both the root categories and any category's own nested children are
 * packed into a multi-column grid (packGridColumnCount below), each sized
 * to fit its own content — a plain fixed-size grid cell doesn't work here
 * since a category's height (and width) varies a lot with descendant/
 * member count, so each column instead tracks its own running bottom edge
 * independently, and every next sibling goes into whichever column is
 * currently shortest. That keeps a column-only-ever-grows-from-its-own-
 * content overlap-proof guarantee, while actually using the available
 * width instead of stacking everything into one tall strip. Sizing is
 * computed bottom-up (deepest first, via computeSize) before anything is
 * positioned top-down (via placeCategory), since a parent can't know how
 * much room it needs for its children's grid until their own sizes are
 * known — and a grid's *width* requirement depends on its children too,
 * not just height.
 */
export function computeCategoryLayout(
  categories: CategoryRecord[],
  explicitOverrides: Map<string, { x: number; y: number; width: number; height: number }> = new Map()
): ComputedClusterLayout[] {
  const childrenByParentId = new Map<string, CategoryRecord[]>()
  for (const category of categories) {
    if (!category.parentCategoryId) continue
    const list = childrenByParentId.get(category.parentCategoryId) ?? []
    list.push(category)
    childrenByParentId.set(category.parentCategoryId, list)
  }

  // Only codes and notes are auto-arranged as member cards inside a
  // cluster's own content area (see getVisibleBoardItems below) — a
  // segment/quote filed directly under a category always keeps its own
  // explicit position instead, so it doesn't factor into how much room a
  // cluster's own content needs here.
  function ownMemberGridSize(category: CategoryRecord): { width: number; height: number } {
    const memberCount = category.codeIds.length + category.noteIds.length
    if (memberCount === 0) return { width: 0, height: 0 }
    const columnCount = packGridColumnCount(memberCount)
    const rows = Math.ceil(memberCount / columnCount)
    return {
      width: columnCount * MEMBER_CARD_WIDTH + (columnCount - 1) * MEMBER_CARD_GAP,
      height: rows * CLUSTER_MEMBER_ROW_HEIGHT
    }
  }

  // Every column in a children-grid shares one width, wide enough for the
  // widest child — simpler than letting each column take its narrowest
  // occupant's width (which would risk two adjacent columns' children
  // overlapping once a wider one lands in either), at the cost of some
  // unused space next to a narrower sibling in the same column. A single
  // child by itself still just gets its own natural width, no grid needed.
  function gridColumnWidth(childSizes: Array<{ width: number }>): number {
    return Math.max(DEFAULT_CLUSTER_WIDTH, ...childSizes.map((s) => s.width))
  }

  // Bottom-up: the size a category's box needs to fit its own member cards
  // plus a grid of its nested children packed inside it. An overridden
  // category keeps its own given size unconditionally (never recomputed —
  // the caller already decided it) — placeCategory below still sizes and
  // packs *its* children within whatever room that frozen box actually
  // gives them, which may not be enough; the fix is the same as always,
  // resetting the board's layout. No cycle guard needed here: every
  // category has exactly one parentCategoryId, so a cycle can only exist
  // among categories that are *not* reachable from any real root in the
  // first place (reparentCategory prevents ever creating one) — this only
  // ever recurses along real parent->child edges starting from an actual
  // root.
  function computeSize(category: CategoryRecord): { width: number; height: number } {
    const existing = explicitOverrides.get(category.id)
    if (existing) return { width: existing.width, height: existing.height }

    const children = childrenByParentId.get(category.id) ?? []
    const ownGrid = ownMemberGridSize(category)
    const ownContentHeight = CLUSTER_HEADER_HEIGHT + CLUSTER_PADDING * 2 + ownGrid.height
    // + CLUSTER_PADDING once: the same one-sided inset used everywhere else
    // in this function (see childX/innerX below), not a margin on both sides.
    const ownContentWidth = ownGrid.width > 0 ? ownGrid.width + CLUSTER_PADDING : 0

    if (children.length === 0) {
      return {
        width: Math.max(DEFAULT_CLUSTER_WIDTH, ownContentWidth),
        height: Math.max(DEFAULT_CLUSTER_HEIGHT, ownContentHeight)
      }
    }

    const childSizes = children.map((child) => computeSize(child))
    const columnCount = packGridColumnCount(children.length)
    const columnWidth = gridColumnWidth(childSizes)
    const columnHeights = new Array<number>(columnCount).fill(0)
    for (const size of childSizes) {
      let column = 0
      for (let i = 1; i < columnCount; i++) {
        if (columnHeights[i] < columnHeights[column]) column = i
      }
      columnHeights[column] += size.height + CLUSTER_GAP
    }
    const childGridWidth = columnCount * columnWidth + (columnCount - 1) * CLUSTER_GAP + CLUSTER_PADDING
    const childGridHeight = Math.max(...columnHeights) - CLUSTER_GAP // no trailing gap after the last child in the tallest column

    return {
      width: Math.max(DEFAULT_CLUSTER_WIDTH, ownContentWidth, childGridWidth),
      height: Math.max(DEFAULT_CLUSTER_HEIGHT, ownContentHeight + childGridHeight)
    }
  }

  const result: ComputedClusterLayout[] = []

  // Top-down: place this category's box at (x, y) using the size already
  // determined by computeSize, then recursively place its nested children
  // in the same grid arrangement computeSize assumed — same children, same
  // sizes, same greedy packing order, so the two can never disagree about
  // how much room was actually needed vs. how it's actually laid out.
  function placeCategory(category: CategoryRecord, x: number, y: number): { y: number; height: number } {
    const existing = explicitOverrides.get(category.id)
    const size = existing ?? computeSize(category)
    const actualX = existing ? existing.x : x
    const actualY = existing ? existing.y : y

    result.push({ categoryId: category.id, x: actualX, y: actualY, width: size.width, height: size.height })

    const children = childrenByParentId.get(category.id) ?? []
    if (children.length > 0) {
      const childSizes = children.map((child) => computeSize(child))
      const columnCount = packGridColumnCount(children.length)
      const columnWidth = gridColumnWidth(childSizes)
      const innerX = actualX + CLUSTER_PADDING
      const innerY = actualY + CLUSTER_HEADER_HEIGHT + CLUSTER_PADDING + ownMemberGridSize(category).height
      const columnBottoms = new Array<number>(columnCount).fill(innerY)
      for (const child of children) {
        let column = 0
        for (let i = 1; i < columnCount; i++) {
          if (columnBottoms[i] < columnBottoms[column]) column = i
        }
        const childX = innerX + column * (columnWidth + CLUSTER_GAP)
        const placed = placeCategory(child, childX, columnBottoms[column])
        columnBottoms[column] = placed.y + placed.height + CLUSTER_GAP
      }
    }

    return { y: actualY, height: size.height }
  }

  const roots = categories.filter((c) => !c.parentCategoryId)
  const rootSizes = roots.map((r) => computeSize(r))
  const rootColumnCount = packGridColumnCount(roots.length)
  const rootColumnWidth = gridColumnWidth(rootSizes)
  const columnBottoms = new Array<number>(rootColumnCount).fill(GRID_ORIGIN_Y)
  for (const category of roots) {
    // Shortest-column-first: a simple masonry pack, not a fixed row/column
    // assignment, so a handful of very tall roots don't lock in a lopsided
    // grid — the next one always goes wherever there's actually the least
    // height used so far.
    let column = 0
    for (let i = 1; i < rootColumnCount; i++) {
      if (columnBottoms[i] < columnBottoms[column]) column = i
    }
    const x = GRID_ORIGIN_X + column * (rootColumnWidth + CLUSTER_GAP)
    const placed = placeCategory(category, x, columnBottoms[column])
    columnBottoms[column] = placed.y + placed.height + CLUSTER_GAP
  }

  return result
}

/**
 * The clusters a board should actually show — the cluster counterpart of
 * getVisibleBoardItems below. On the default board, every category is
 * visible as a cluster frame whether or not it has an explicit BoardCluster
 * shape yet there (computeCategoryLayout above supplies the position/size
 * for whichever ones don't); other boards only show what's been explicitly
 * placed via "+ New cluster" / "+ Place cluster…" / "+ Add all clusters".
 * Without this, creating a category anywhere that isn't the board itself
 * (the Workspace codebook tab, Analysis > Clusters) leaves it with no shape
 * on any board — including the default one — so it silently never appears
 * until someone happens to place it.
 */
export function getVisibleBoardClusters(
  board: Pick<BoardRecord, 'id' | 'isDefault'>,
  explicitClusters: BoardCluster[],
  categories: CategoryRecord[]
): BoardCluster[] {
  if (!board.isDefault) return explicitClusters

  const explicitByCategory = new Map(explicitClusters.map((c) => [c.categoryId, c]))
  const layout = computeCategoryLayout(categories, explicitByCategory)
  return layout.map(
    (l) =>
      explicitByCategory.get(l.categoryId) ?? {
        id: `virtual:cluster:${l.categoryId}`,
        boardId: board.id,
        categoryId: l.categoryId,
        x: l.x,
        y: l.y,
        width: l.width,
        height: l.height,
        createdAt: ''
      }
  )
}

/**
 * Drops every explicit cluster shape on one board, so getVisibleBoardClusters
 * falls back to computing all of them fresh from the current category
 * structure. Used when a nesting change happens somewhere that isn't a
 * board drag (the Workspace codebook/notes trees) — those already recompute
 * correctly for a category that was never explicitly placed, but once a
 * cluster has an explicit shape (from being dragged/resized even once) its
 * position/size stays frozen regardless of later nesting changes, since
 * getVisibleBoardClusters always trusts an explicit shape over recomputing
 * it. Resetting is deliberately "everything on the board", not just the
 * categories the reparent directly touched: an incremental patch has to
 * either also reset every affected category's *entire* descendant subtree
 * (to avoid orphaning children whose parent's box just moved out from under
 * their untouched absolute position) or risk exactly that orphaning — full
 * reset sidesteps the problem by construction and reuses the already-tested
 * recursive layout for 100% of the result, at the cost of losing any manual
 * cluster arrangement on this board. Only ever called for the *default*
 * board — other boards stay fully user-curated, untouched by this.
 *
 * Also drops the explicit BoardItem position of any code/note/segment that's
 * a member of *some* category, for the same reason: an item that was
 * already individually placed keeps its old absolute position regardless of
 * where its cluster's frame ends up, so after a reflow it would end up
 * sitting outside the cluster it's actually a member of. Un-clustered items
 * are untouched — they were never positioned relative to a cluster to begin
 * with, so a cluster reflow has nothing to do with them.
 */
export function resetDefaultBoardClusterLayout(data: ProjectData, boardId: string): ProjectData {
  const clusteredRefs = new Set<string>()
  for (const category of data.categories) {
    for (const codeId of category.codeIds) clusteredRefs.add(`code:${codeId}`)
    for (const noteId of category.noteIds) clusteredRefs.add(`note:${noteId}`)
    for (const segmentId of category.segmentIds) clusteredRefs.add(`segment:${segmentId}`)
  }
  return {
    ...data,
    boardClusters: data.boardClusters.filter((c) => c.boardId !== boardId),
    boardItems: data.boardItems.filter(
      (i) => i.boardId !== boardId || !clusteredRefs.has(`${i.refType}:${i.refId}`)
    )
  }
}

/**
 * The items a board should actually show: on the default board, every code
 * and note is visible whether or not it has an explicit BoardItem yet;
 * other boards only show what's been explicitly placed. Kept as its own
 * pure, tested function rather than inline in the component, because this
 * is exactly the kind of indexing logic that's easy to get subtly wrong and
 * hard to verify just by reading it.
 *
 * `clusters` is the board's already-resolved cluster shapes (from
 * getVisibleBoardClusters, computed first) — a code/note that's a cluster
 * member is positioned stacked inside its cluster's box instead of the
 * flat fallback grid, so "clustered" actually looks clustered rather than
 * scattered elsewhere on the canvas. A ref that's a member of more than one
 * category (multi-membership) can only occupy one position on a spatial
 * canvas, so it homes in its first membership, in `categories` order; it
 * still shows under every cluster it belongs to in the Workspace tree,
 * which has no such one-position constraint. Everything left over (not a
 * member of any category) falls back to the flat grid — shifted below the
 * whole cluster layout so the two auto-placed regions never overlap.
 */
export function getVisibleBoardItems(
  board: Pick<BoardRecord, 'id' | 'isDefault'>,
  explicitItems: BoardItem[],
  codes: Array<{ id: string }>,
  notes: Array<{ id: string }>,
  categories: CategoryRecord[] = [],
  clusters: BoardCluster[] = []
): BoardItem[] {
  if (!board.isDefault) return explicitItems

  const explicitByRef = new Map(explicitItems.map((i) => [`${i.refType}:${i.refId}`, i]))
  const clusterByCategoryId = new Map(clusters.map((c) => [c.categoryId, c]))

  const homeClusterByRef = new Map<string, BoardCluster>()
  // Same near-square grid every other auto-layout in this file uses
  // (packGridColumnCount) — how many columns THIS cluster's own member
  // cards pack into, keyed by cluster id so nextPositionInCluster below
  // doesn't need the category again. Matches exactly what
  // getVisibleBoardClusters' ownMemberGridSize assumed when it sized the
  // cluster's box, so cards never overflow it.
  const memberColumnCountByCluster = new Map<string, number>()
  for (const category of categories) {
    const cluster = clusterByCategoryId.get(category.id)
    if (!cluster) continue
    for (const codeId of category.codeIds) {
      const key = `code:${codeId}`
      if (!homeClusterByRef.has(key)) homeClusterByRef.set(key, cluster)
    }
    for (const noteId of category.noteIds) {
      const key = `note:${noteId}`
      if (!homeClusterByRef.has(key)) homeClusterByRef.set(key, cluster)
    }
    const memberCount = category.codeIds.length + category.noteIds.length
    if (memberCount > 0) memberColumnCountByCluster.set(cluster.id, packGridColumnCount(memberCount))
  }

  const memberIndexByCluster = new Map<string, number>()
  function nextPositionInCluster(cluster: BoardCluster): { x: number; y: number } {
    const index = memberIndexByCluster.get(cluster.id) ?? 0
    memberIndexByCluster.set(cluster.id, index + 1)
    const columnCount = memberColumnCountByCluster.get(cluster.id) ?? 1
    const row = Math.floor(index / columnCount)
    const column = index % columnCount
    return {
      x: cluster.x + CLUSTER_PADDING + column * (MEMBER_CARD_WIDTH + MEMBER_CARD_GAP),
      y: cluster.y + CLUSTER_HEADER_HEIGHT + CLUSTER_PADDING + row * CLUSTER_MEMBER_ROW_HEIGHT
    }
  }

  const unclusteredOriginY =
    clusters.length > 0 ? Math.max(...clusters.map((c) => c.y + c.height)) + CLUSTER_GAP : GRID_ORIGIN_Y

  const result: BoardItem[] = []
  let autoIndex = 0

  function placeRef(refType: 'code' | 'note', refId: string): void {
    const key = `${refType}:${refId}`
    const existing = explicitByRef.get(key)
    if (existing) {
      result.push(existing)
      return
    }
    const homeCluster = homeClusterByRef.get(key)
    const pos = homeCluster ? nextPositionInCluster(homeCluster) : computeGridPosition(autoIndex++, unclusteredOriginY)
    result.push({ id: `virtual:${key}`, boardId: board.id, refType, refId, ...pos })
  }

  for (const code of codes) placeRef('code', code.id)
  for (const note of notes) placeRef('note', note.id)

  // Any explicitly-added segment (quote) items always show too.
  result.push(...explicitItems.filter((i) => i.refType === 'segment'))
  return result
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

/**
 * Adds every category not already shaped on this board as a cluster, and
 * ensures each of its current member codes/notes also has a board item
 * here, positioned inside the new cluster — so the existing grouping
 * structure is visible immediately, not just the empty frames.
 *
 * Uses computeCategoryLayout — the same masonry-packed, nesting-aware,
 * member-grid-sized algorithm the default board's own auto-layout runs —
 * rather than a separate, simpler fixed grid: that older approach placed
 * cluster boxes on a fixed row height with no idea how tall a cluster with
 * many members actually was, so a tall cluster would visually overlap the
 * next row's clusters (member cards from one appearing to sit inside a
 * different cluster's frame, though the underlying category membership was
 * always correct — a pure layout bug, not a data one). Whatever's already
 * explicitly on this board is passed in as computeCategoryLayout's
 * overrides, so newly-added clusters lay out relative to reality rather
 * than a hypothetical fresh position for something already placed
 * elsewhere on this same board.
 *
 * Segments (raw quotes filed directly under a category) are deliberately
 * not auto-placed here, matching getVisibleBoardItems' own convention
 * elsewhere — a segment always keeps its own explicit position rather than
 * being auto-homed into a cluster's member grid.
 *
 * `includeMembers` (default true) controls whether each cluster's member
 * codes/notes get placed too, or just the empty cluster frame itself —
 * "+ Add all clusters" (false) vs. "+ Add all clusters and items" (true) in
 * the toolbar. A curated board built as a thematic-map figure specifically
 * wants clusters with nothing cluttering them, which the combined
 * behavior couldn't offer at all before this split. Cluster boxes are
 * still sized as if their members were there either way (via
 * computeCategoryLayout, which only knows member *counts*) — a size that
 * already fits the content if it's added later, not a decorative default
 * that would need resizing.
 */
export function addAllClustersToBoard(
  data: ProjectData,
  boardId: string,
  includeMembers: boolean = true
): ProjectData {
  const existingOnBoard = data.boardClusters.filter((c) => c.boardId === boardId)
  const existingCategoryIds = new Set(existingOnBoard.map((c) => c.categoryId))
  const categoriesToPlace = data.categories.filter((c) => !existingCategoryIds.has(c.id))
  if (categoriesToPlace.length === 0) return data

  const explicitOverrides = new Map(existingOnBoard.map((c) => [c.categoryId, c]))
  const layoutByCategoryId = new Map(
    computeCategoryLayout(data.categories, explicitOverrides).map((l) => [l.categoryId, l])
  )

  let next = data

  for (const category of categoriesToPlace) {
    const layout = layoutByCategoryId.get(category.id)
    if (!layout) continue // every category gets an entry; defensive only

    const clusterResult = createClusterForCategory(next, {
      boardId,
      categoryId: category.id,
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height
    })
    next = clusterResult.data

    if (!includeMembers) continue

    const members: Array<{ refType: 'code' | 'note'; refId: string }> = [
      ...category.codeIds.map((refId) => ({ refType: 'code' as const, refId })),
      ...category.noteIds.map((refId) => ({ refType: 'note' as const, refId }))
    ]
    // Same near-square grid ownMemberGridSize (computeCategoryLayout)
    // already assumed when it sized this cluster's box, so cards never
    // overflow it.
    const columnCount = packGridColumnCount(members.length)

    members.forEach((member, memberIndex) => {
      const alreadyOnBoard = next.boardItems.some(
        (bi) => bi.boardId === boardId && bi.refType === member.refType && bi.refId === member.refId
      )
      if (alreadyOnBoard) return
      const row = Math.floor(memberIndex / columnCount)
      const column = memberIndex % columnCount
      const item: BoardItem = {
        id: nanoid(),
        boardId,
        refType: member.refType,
        refId: member.refId,
        x: layout.x + CLUSTER_PADDING + column * (MEMBER_CARD_WIDTH + MEMBER_CARD_GAP),
        y: layout.y + CLUSTER_HEADER_HEIGHT + CLUSTER_PADDING + row * CLUSTER_MEMBER_ROW_HEIGHT
      }
      next = { ...next, boardItems: [...next.boardItems, item] }
    })
  }

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

// --- Cluster links (labeled relationships between clusters — thematic map) ---

/** ClusterLinks are project-wide (see the type's own doc comment), but only
 * drawable on a board that actually shows both endpoint clusters — a link
 * naming a category with no shape here yet has nothing to connect to. */
export function getVisibleClusterLinks(clusterLinks: ClusterLink[], clustersOnBoard: BoardCluster[]): ClusterLink[] {
  const categoryIdsOnBoard = new Set(clustersOnBoard.map((c) => c.categoryId))
  return clusterLinks.filter(
    (l) => categoryIdsOnBoard.has(l.fromCategoryId) && categoryIdsOnBoard.has(l.toCategoryId)
  )
}

export interface ClusterPosition {
  id: string
  x: number
  y: number
}

/** Writes back a set of computed positions (from computeTreeLayout /
 * computeRadialLayout below) onto the matching BoardClusters — the one
 * place either layout actually touches ProjectData, so the layouts
 * themselves can stay pure geometry. A cluster with no entry in `positions`
 * (not part of this layout pass) is left untouched. */
export function applyClusterPositions(data: ProjectData, positions: ClusterPosition[]): ProjectData {
  const byId = new Map(positions.map((p) => [p.id, p]))
  return {
    ...data,
    boardClusters: data.boardClusters.map((c) => {
      const pos = byId.get(c.id)
      return pos ? { ...c, x: pos.x, y: pos.y } : c
    })
  }
}

/**
 * Same as applyClusterPositions, but also carries each repositioned
 * cluster's member codes/notes/segments along with it by the same delta —
 * the one-click Tree/Radial layouts' equivalent of what a manual cluster
 * drag already does (see BoardView's cluster-move handling, which moves
 * `getClusterMemberItems` alongside the frame). Without this, applying a
 * layout moves every cluster's *frame* but leaves its member cards sitting
 * at their old position, reading as if they'd been unlinked from their
 * cluster even though the underlying category membership never changed.
 *
 * Computes one delta per *category* (not per cluster id) since that's what
 * a member actually belongs to; a ref that's a member of more than one
 * category moving in this pass homes on the first one, in `data.categories`
 * order — the same "first membership wins" rule used everywhere else a
 * board can only give a ref one position (see getVisibleBoardItems).
 */
export function applyClusterLayoutWithMembers(
  data: ProjectData,
  boardId: string,
  positions: ClusterPosition[]
): ProjectData {
  const clusterById = new Map(data.boardClusters.filter((c) => c.boardId === boardId).map((c) => [c.id, c]))

  const deltaByCategoryId = new Map<string, { dx: number; dy: number }>()
  for (const pos of positions) {
    const cluster = clusterById.get(pos.id)
    if (!cluster) continue
    const dx = pos.x - cluster.x
    const dy = pos.y - cluster.y
    if (dx !== 0 || dy !== 0) deltaByCategoryId.set(cluster.categoryId, { dx, dy })
  }

  const deltaByRefKey = new Map<string, { dx: number; dy: number }>()
  for (const category of data.categories) {
    const delta = deltaByCategoryId.get(category.id)
    if (!delta) continue
    for (const codeId of category.codeIds) {
      const key = `code:${codeId}`
      if (!deltaByRefKey.has(key)) deltaByRefKey.set(key, delta)
    }
    for (const noteId of category.noteIds) {
      const key = `note:${noteId}`
      if (!deltaByRefKey.has(key)) deltaByRefKey.set(key, delta)
    }
    for (const segmentId of category.segmentIds) {
      const key = `segment:${segmentId}`
      if (!deltaByRefKey.has(key)) deltaByRefKey.set(key, delta)
    }
  }

  const withPositions = applyClusterPositions(data, positions)
  return {
    ...withPositions,
    boardItems: withPositions.boardItems.map((item) => {
      if (item.boardId !== boardId) return item
      const delta = deltaByRefKey.get(`${item.refType}:${item.refId}`)
      return delta ? { ...item, x: item.x + delta.dx, y: item.y + delta.dy } : item
    })
  }
}

/**
 * Shifts a whole set of computed positions uniformly — preserving their
 * relative arrangement exactly — so none sits at a negative or too-close-
 * to-zero coordinate. Overflowing the canvas's *positive* edge is harmless
 * (the board's scroll container can always scroll further right/down to
 * reach it); overflowing the *negative* edge is not — there's no scroll
 * position that reaches it, so a cluster placed there becomes invisible
 * and unreachable until the user resorts to undo. computeRadialLayout in
 * particular can push a cluster past the negative edge if its focus
 * cluster happened to start near the canvas origin (a very common case —
 * it's roughly where a newly placed cluster lands by default).
 */
function keepPositionsOnBoard(positions: ClusterPosition[]): ClusterPosition[] {
  if (positions.length === 0) return positions
  const minX = Math.min(...positions.map((p) => p.x))
  const minY = Math.min(...positions.map((p) => p.y))
  const shiftX = minX < GRID_ORIGIN_X ? GRID_ORIGIN_X - minX : 0
  const shiftY = minY < GRID_ORIGIN_Y ? GRID_ORIGIN_Y - minY : 0
  if (shiftX === 0 && shiftY === 0) return positions
  return positions.map((p) => ({ ...p, x: p.x + shiftX, y: p.y + shiftY }))
}

const TREE_LEVEL_HEIGHT = 220
const TREE_NODE_GAP = 40

/**
 * A top-down hierarchical-tree arrangement of a board's own clusters,
 * driven by the category hierarchy (parentCategoryId) — a cluster whose
 * parent category isn't *also* on this board is treated as its own root,
 * since there's nothing here to hang it under. Purely computes new x/y for
 * the clusters already passed in (never creates, removes, or resizes one);
 * apply with applyClusterPositions. Meant for a curated (non-default)
 * board built specifically as a figure — the default board has its own
 * auto-layout (see getVisibleBoardClusters) and isn't a target for this.
 */
export function computeTreeLayout(clusters: BoardCluster[], categories: CategoryRecord[]): ClusterPosition[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const categoryIdsOnBoard = new Set(clusters.map((c) => c.categoryId))
  const childrenByParentCategoryId = new Map<string, BoardCluster[]>()
  const roots: BoardCluster[] = []

  for (const cluster of clusters) {
    const parentCategoryId = categoryById.get(cluster.categoryId)?.parentCategoryId ?? null
    if (parentCategoryId && categoryIdsOnBoard.has(parentCategoryId)) {
      const siblings = childrenByParentCategoryId.get(parentCategoryId) ?? []
      siblings.push(cluster)
      childrenByParentCategoryId.set(parentCategoryId, siblings)
    } else {
      roots.push(cluster)
    }
  }

  const result: ClusterPosition[] = []

  // Bottom-up: how wide a cluster's whole subtree needs to be so every
  // descendant fits side by side beneath it — a parent with children wider
  // (combined) than itself centers over them rather than the reverse.
  function subtreeWidth(cluster: BoardCluster): number {
    const children = childrenByParentCategoryId.get(cluster.categoryId) ?? []
    if (children.length === 0) return cluster.width
    const childrenWidth =
      children.reduce((sum, child) => sum + subtreeWidth(child), 0) + TREE_NODE_GAP * (children.length - 1)
    return Math.max(cluster.width, childrenWidth)
  }

  // Top-down: places `cluster` centered within the span [left, left +
  // subtreeWidth(cluster)) at its depth's row, then lays out its children
  // left-to-right immediately below, each within its own subtree's span.
  function place(cluster: BoardCluster, left: number, depth: number): void {
    const width = subtreeWidth(cluster)
    result.push({ id: cluster.id, x: left + (width - cluster.width) / 2, y: GRID_ORIGIN_Y + depth * TREE_LEVEL_HEIGHT })

    const children = childrenByParentCategoryId.get(cluster.categoryId) ?? []
    let childLeft = left
    for (const child of children) {
      place(child, childLeft, depth + 1)
      childLeft += subtreeWidth(child) + TREE_NODE_GAP
    }
  }

  let rootLeft = GRID_ORIGIN_X
  for (const root of roots) {
    place(root, rootLeft, 0)
    rootLeft += subtreeWidth(root) + TREE_NODE_GAP
  }

  return keepPositionsOnBoard(result)
}

const RADIAL_RADIUS_STEP = 260

/**
 * A radial (hub-and-spoke) arrangement: one focus cluster stays put at its
 * current position, every other cluster on the board is spread around it
 * in a single ring at equal angular spacing. `focusCategoryId` picks the
 * hub; if it's not one of `clusters` (or omitted), the first cluster is
 * used instead so this never errors on a mismatched id. Same
 * pure-geometry/apply-separately contract as computeTreeLayout above.
 */
export function computeRadialLayout(clusters: BoardCluster[], focusCategoryId: string | null): ClusterPosition[] {
  if (clusters.length === 0) return []
  const focus = clusters.find((c) => c.categoryId === focusCategoryId) ?? clusters[0]
  const others = clusters.filter((c) => c.id !== focus.id)
  if (others.length === 0) return [{ id: focus.id, x: focus.x, y: focus.y }]

  const centerX = focus.x + focus.width / 2
  const centerY = focus.y + focus.height / 2
  const radius = RADIAL_RADIUS_STEP + Math.max(focus.width, focus.height) / 2

  const result: ClusterPosition[] = [{ id: focus.id, x: focus.x, y: focus.y }]
  others.forEach((cluster, i) => {
    const angle = (2 * Math.PI * i) / others.length - Math.PI / 2 // start straight up, go clockwise
    const cx = centerX + radius * Math.cos(angle)
    const cy = centerY + radius * Math.sin(angle)
    result.push({ id: cluster.id, x: cx - cluster.width / 2, y: cy - cluster.height / 2 })
  })
  return keepPositionsOnBoard(result)
}

// --- Alignment / distribution guides (dragging a cluster) ---
//
// PowerPoint/Figma-style "smart guides": while dragging a cluster, snap it
// to line up with another cluster's edge/center, or to sit exactly midway
// between two others that already roughly straddle it — and report which
// guide(s) matched so the renderer can draw them. Two independent, single-
// axis mechanisms (findAlignmentSnap for lining up, findDistributionSnap
// for equal spacing) rather than one combined pass, since they answer
// different questions and a drag can want either, both, or neither.

export type GuideAxis = 'x' | 'y'

/** One matched edge/center alignment, in canvas coordinates — the shared
 * position along `axis` that the dragged rect now lines up on (its own
 * left/center/right on the x axis, or top/center/bottom on y). */
export interface AlignmentGuide {
  axis: GuideAxis
  position: number
}

export interface AlignmentSnapResult {
  /** The rect's x/y after snapping — unchanged on an axis with no match. */
  x: number
  y: number
  guides: AlignmentGuide[]
}

const ALIGNMENT_TOLERANCE = 6

function edgesOf(start: number, size: number): [number, number, number] {
  return [start, start + size / 2, start + size]
}

/** Every edge/center alignment between a rect at (x, y) and any of
 * `others`, within `tolerance`, on both axes — used both to compute the
 * snap adjustment above and (called again against the already-snapped
 * position) to find every guide line actually worth drawing, so a cluster
 * aligned with several others at once shows a guide for each rather than
 * just whichever one happened to win the snap. */
function findAlignmentGuides(x: number, y: number, size: { width: number; height: number }, others: Rect[], tolerance: number): AlignmentGuide[] {
  const selfX = edgesOf(x, size.width)
  const selfY = edgesOf(y, size.height)
  const guides: AlignmentGuide[] = []
  for (const other of others) {
    for (const otherEdge of edgesOf(other.x, other.width)) {
      for (const selfEdge of selfX) {
        if (Math.abs(selfEdge - otherEdge) <= tolerance) guides.push({ axis: 'x', position: otherEdge })
      }
    }
    for (const otherEdge of edgesOf(other.y, other.height)) {
      for (const selfEdge of selfY) {
        if (Math.abs(selfEdge - otherEdge) <= tolerance) guides.push({ axis: 'y', position: otherEdge })
      }
    }
  }
  const seen = new Set<string>()
  return guides.filter((g) => {
    const key = `${g.axis}:${g.position}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Snaps a tentative (x, y) to the nearest edge/center alignment with any of
 * `others`, independently per axis (an x-snap and a y-snap can both apply
 * at once, from different clusters) — the cluster-frame equivalent of
 * findSnapTarget's card-to-card snapping above, just against edges/centers
 * of a box instead of whole-card proximity. No match on an axis leaves
 * that coordinate untouched.
 */
export function findAlignmentSnap(
  x: number,
  y: number,
  size: { width: number; height: number },
  others: Rect[],
  tolerance: number = ALIGNMENT_TOLERANCE
): AlignmentSnapResult {
  const selfX = edgesOf(x, size.width)
  const selfY = edgesOf(y, size.height)

  let bestXDelta: number | null = null
  let bestYDelta: number | null = null
  for (const other of others) {
    for (const otherEdge of edgesOf(other.x, other.width)) {
      for (const selfEdge of selfX) {
        const delta = otherEdge - selfEdge
        if (Math.abs(delta) <= tolerance && (bestXDelta === null || Math.abs(delta) < Math.abs(bestXDelta))) {
          bestXDelta = delta
        }
      }
    }
    for (const otherEdge of edgesOf(other.y, other.height)) {
      for (const selfEdge of selfY) {
        const delta = otherEdge - selfEdge
        if (Math.abs(delta) <= tolerance && (bestYDelta === null || Math.abs(delta) < Math.abs(bestYDelta))) {
          bestYDelta = delta
        }
      }
    }
  }

  const snappedX = x + (bestXDelta ?? 0)
  const snappedY = y + (bestYDelta ?? 0)
  return { x: snappedX, y: snappedY, guides: findAlignmentGuides(snappedX, snappedY, size, others, tolerance) }
}

/** One matched "equal gap" opportunity: the dragged rect's center sits (or
 * now sits, after snapping) exactly midway between `before` and `after`'s
 * centers along `axis` — rendered as two tick marks, one per gap. */
export interface DistributionGuide {
  axis: GuideAxis
  beforeCenter: number
  selfCenter: number
  afterCenter: number
}

export interface DistributionSnapResult {
  x: number
  y: number
  guides: DistributionGuide[]
}

const DISTRIBUTION_TOLERANCE = 6
// How far apart (on the cross axis) two candidates can be from the dragged
// rect's own cross-axis center and still count as "the same row/column" for
// distribution purposes — generous enough for a normal loose arrangement,
// not so generous that unrelated clusters elsewhere on the board start
// suggesting a spacing relationship that doesn't visually read as one.
const DISTRIBUTION_ROW_BAND = 80

/**
 * Snaps a tentative (x, y) so the dragged rect's center sits exactly midway
 * between the closest pair of `others` that already roughly straddle it on
 * each axis (PowerPoint/Figma's "equal spacing" guide) — independently per
 * axis, same as findAlignmentSnap. Only considers a pair "the same
 * row/column" when both are within DISTRIBUTION_ROW_BAND of the dragged
 * rect's center on the *other* axis, so a distribution guide only ever
 * suggests a relationship that already looks like one.
 */
export function findDistributionSnap(
  x: number,
  y: number,
  size: { width: number; height: number },
  others: Rect[],
  tolerance: number = DISTRIBUTION_TOLERANCE
): DistributionSnapResult {
  const selfCenterX = x + size.width / 2
  const selfCenterY = y + size.height / 2

  function bestGuide(
    selfCenter: number,
    crossSelfCenter: number,
    centerOf: (r: Rect) => number,
    crossCenterOf: (r: Rect) => number
  ): { adjust: number; guide: DistributionGuide } | null {
    let best: { adjust: number; guide: DistributionGuide } | null = null
    for (const a of others) {
      if (Math.abs(crossCenterOf(a) - crossSelfCenter) > DISTRIBUTION_ROW_BAND) continue
      for (const b of others) {
        if (a === b) continue
        if (Math.abs(crossCenterOf(b) - crossSelfCenter) > DISTRIBUTION_ROW_BAND) continue
        const ca = centerOf(a)
        const cb = centerOf(b)
        if (!(ca < selfCenter && selfCenter < cb)) continue // a, self, b in order along the axis
        const midpoint = (ca + cb) / 2
        const adjust = midpoint - selfCenter
        if (Math.abs(adjust) > tolerance) continue
        if (!best || Math.abs(adjust) < Math.abs(best.adjust)) {
          best = { adjust, guide: { axis: 'x', beforeCenter: ca, selfCenter: midpoint, afterCenter: cb } }
        }
      }
    }
    return best
  }

  const xGuide = bestGuide(
    selfCenterX,
    selfCenterY,
    (r) => r.x + r.width / 2,
    (r) => r.y + r.height / 2
  )
  const yGuideRaw = bestGuide(
    selfCenterY,
    selfCenterX,
    (r) => r.y + r.height / 2,
    (r) => r.x + r.width / 2
  )
  const yGuide = yGuideRaw ? { adjust: yGuideRaw.adjust, guide: { ...yGuideRaw.guide, axis: 'y' as const } } : null

  const guides: DistributionGuide[] = []
  if (xGuide) guides.push(xGuide.guide)
  if (yGuide) guides.push(yGuide.guide)

  return {
    x: x + (xGuide?.adjust ?? 0),
    y: y + (yGuide?.adjust ?? 0),
    guides
  }
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
