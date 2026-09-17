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
  deleteCategory,
  getDescendantCategoryIds,
  isCategoryMember,
  reconcileSoleCategoryMembership,
  removeMemberByRefType,
  reparentCategory
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

/**
 * Which cluster a dropped cluster nests into.
 *
 * With the pointer on a cluster's header band, that cluster — the header
 * is the one part of a full superordinate that isn't covered by its own
 * sub-clusters, so it's the only way to aim at the superordinate itself.
 * Otherwise, whatever the dropped frame's center lands on, smallest first
 * (findClusterAtPoint). Center-only targeting made a full superordinate
 * unreachable: every spot inside it is some sub-cluster, so a drop always
 * nested one level too deep. Reported as: "I wanted to add a cluster to a
 * SO cluster, but I could only make it a child of a cluster already
 * inside."
 *
 * `headerReach` is the header band's height in canvas units — larger than
 * the bar itself when zoomed out, since the header's contents are
 * counter-scaled then (see ClusterFrame) and overhang it evenly above and
 * below.
 */
export function findNestTarget(
  clusters: BoardCluster[],
  center: { x: number; y: number },
  pointer: { x: number; y: number },
  headerReach: number = CLUSTER_HEADER_HEIGHT
): BoardCluster | null {
  const overhang = Math.max(0, headerReach - CLUSTER_HEADER_HEIGHT) / 2
  let best: BoardCluster | null = null
  for (const c of clusters) {
    const onHeader =
      pointer.x >= c.x &&
      pointer.x <= c.x + c.width &&
      pointer.y >= c.y - overhang &&
      pointer.y <= c.y + CLUSTER_HEADER_HEIGHT + overhang
    if (onHeader && (!best || c.width * c.height < best.width * best.height)) best = c
  }
  return best ?? findClusterAtPoint(clusters, center.x, center.y)
}

/** Which single cluster a whole linked group of items is leaving/entering
 * on a drag, decided off one reference member (the topmost by y) rather
 * than each member independently checking its own final position. A
 * snapped-together list of linked items can be tall/wide enough that its
 * trailing members straddle a cluster's edge even while the group visibly
 * reads as "inside" it — checking each member on its own could then split
 * a linked group across two different clusters mid-drag. Anchoring both
 * the "leaving" and "entering" side of the decision on the same member
 * keeps the whole group's membership change internally consistent.
 * Returns null if the group is empty or the reference member's final
 * position is missing. */
export function resolveGroupClusterReassignment(
  clusters: BoardCluster[],
  startPositions: Record<string, { x: number; y: number }>,
  finalPositions: Map<string, { x: number; y: number }>,
  groupMemberIds: string[],
  cardWidth: number,
  cardHeight: number
): { oldCluster: BoardCluster | null; newCluster: BoardCluster | null } | null {
  if (groupMemberIds.length === 0) return null
  const topMemberId = groupMemberIds.reduce((topId, id) =>
    startPositions[id].y < startPositions[topId].y ? id : topId
  )
  const topStart = startPositions[topMemberId]
  const topFinal = finalPositions.get(topMemberId)
  if (!topFinal) return null
  return {
    oldCluster: findClusterAtPoint(clusters, topStart.x + cardWidth / 2, topStart.y + cardHeight / 2),
    newCluster: findClusterAtPoint(clusters, topFinal.x + cardWidth / 2, topFinal.y + cardHeight / 2)
  }
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

/**
 * The direct children of `categoryId` that a resize of its frame to `box`
 * leaves no longer fully inside it — the ones that resize means to take
 * *out*. Judged against where each child is actually shown (its slot in
 * the parent's grid), so what the live highlight marks is exactly what
 * detaches on release. Used by both the highlight and the commit.
 */
export function resolveResizeExclusion(
  clusters: BoardCluster[],
  categories: CategoryRecord[],
  box: Rect,
  categoryId: string
): string[] {
  const outer: BoardCluster = { id: '', boardId: '', categoryId, createdAt: '', ...box }
  return categories
    .filter((c) => c.parentCategoryId === categoryId)
    .map((c) => clusters.find((cl) => cl.categoryId === c.id))
    .filter((cl): cl is BoardCluster => cl !== undefined && !clusterRectContains(outer, cl))
    .map((cl) => cl.categoryId)
}

/**
 * The category ids a resize of `resizingCategoryId`'s frame to `box`
 * should newly nest — findClustersEnclosedBy, narrowed to what can
 * actually *become* a direct child:
 *
 * - not the resizing cluster itself, nor anything already nested under it
 *   (already a child, not a new one);
 * - not any of its own ancestors — a nested cluster resized to exactly
 *   its parent's own top-left corner and bigger than it geometrically
 *   "encloses" the parent, but nesting a parent under its own child is a
 *   cycle reparentCategory refuses anyway, and the caller would still go
 *   on to reset that parent's shape as if it had been nested;
 * - not a cluster whose own ancestor is *also* being enclosed — "draw a
 *   box around a cluster that has sub-clusters inside it" nests that
 *   cluster, keeping its sub-clusters under it, rather than flattening
 *   every level into direct children of the resizing one.
 *
 * Used by both the live highlight during the drag and the commit on
 * release, so what's highlighted is exactly what nests.
 */
export function resolveResizeEnclosure(
  clusters: BoardCluster[],
  categories: CategoryRecord[],
  box: Rect,
  resizingCategoryId: string
): string[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const excluded = new Set<string>([resizingCategoryId, ...getDescendantCategoryIds(categories, resizingCategoryId)])
  let ancestor = byId.get(resizingCategoryId)?.parentCategoryId ?? null
  while (ancestor && !excluded.has(ancestor)) {
    excluded.add(ancestor)
    ancestor = byId.get(ancestor)?.parentCategoryId ?? null
  }

  const enclosed = new Set(findClustersEnclosedBy(clusters, box, excluded).map((c) => c.categoryId))
  return [...enclosed].filter((id) => {
    let parent = byId.get(id)?.parentCategoryId ?? null
    while (parent) {
      if (enclosed.has(parent)) return false
      parent = byId.get(parent)?.parentCategoryId ?? null
    }
    return true
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

/** Sets how this board's ClusterLinks are drawn — see BoardRecord.
 * clusterLinkStyle. */
export function setBoardClusterLinkStyle(
  data: ProjectData,
  boardId: string,
  style: 'curved' | 'straight'
): ProjectData {
  return {
    ...data,
    boards: data.boards.map((b) => (b.id === boardId ? { ...b, clusterLinkStyle: style } : b))
  }
}

/** Just the persisted preference (see BoardRecord.clusterFrameSize) —
 * doesn't touch any cluster's actual size/position. Pair with
 * computeNestedLayout + applyClusterLayoutWithMembers (see the
 * setClusterFrameSize store action) to also resize whatever's already on
 * the board to match, right when the preference changes. */
export function setBoardClusterFrameSize(
  data: ProjectData,
  boardId: string,
  size: 'compact' | 'full'
): ProjectData {
  return {
    ...data,
    boards: data.boards.map((b) => (b.id === boardId ? { ...b, clusterFrameSize: size } : b))
  }
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
// Breathing room left around a child cluster's box when a destination is
// grown to accommodate it (computeAccommodatingSize) — shared by every
// caller (nesting a dropped cluster, growing an ancestor chain to fit a
// resized descendant) so a cluster never ends up snug right against its
// parent's own edge.
export const CLUSTER_NEST_PADDING = 20
// A "compact" leaf cluster (see computeCategoryLayout's own `compact` option)
// reserves no space for member cards at all, even if the category holds
// codes/notes — meant for a board that only ever shows cluster frames
// (never actually places the items on it), where the item-sized default
// above just reads as a large, mostly-empty box.
const COMPACT_LEAF_WIDTH = 220
const COMPACT_LEAF_HEIGHT = 48
const CLUSTER_GAP = 40
export const CLUSTER_HEADER_HEIGHT = 28
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

// Only codes and notes are auto-arranged as member cards inside a cluster's
// own content area (see getVisibleBoardItems below) — a segment/quote filed
// directly under a category always keeps its own explicit position instead,
// so it doesn't factor into how much room a cluster's own content needs.
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

/** The smallest box that fully contains a category's own member-card grid
 * (header + padding + the grid) — zero for a category with no cards, so
 * an empty cluster's box is never forced bigger than the user made it. */
function ownMemberMinSize(category: CategoryRecord): { width: number; height: number } {
  const ownGrid = ownMemberGridSize(category)
  if (ownGrid.width === 0) return { width: 0, height: 0 }
  return {
    width: ownGrid.width + CLUSTER_PADDING * 2,
    height: CLUSTER_HEADER_HEIGHT + CLUSTER_PADDING * 2 + ownGrid.height
  }
}

/**
 * A category's own box size — its header plus a grid of its own directly-
 * held codes/notes — deliberately ignoring any nested children entirely.
 * This is what computeCategoryLayout gives a leaf (no-children) category;
 * exported separately so computeTreeLayout can also use it for a "parent"
 * node once that node's children are laid out as their own separate boxes
 * rather than contained inside it (Tree's whole point) — the much larger
 * size computeCategoryLayout gave that same category *to contain* those
 * children stops meaning anything once they're pulled out, and left
 * unchanged makes a parent with several children a towering, mostly empty
 * box (found via a real exported board: a childless-of-its-own supercluster
 * kept its full contains-5-children height while those children moved to
 * their own row far below it, reading as broken rather than "arranged as a
 * tree").
 */
export function computeOwnClusterSize(category: CategoryRecord): { width: number; height: number } {
  const ownGrid = ownMemberGridSize(category)
  const ownContentWidth = ownGrid.width > 0 ? ownGrid.width + CLUSTER_PADDING : 0
  const ownContentHeight = CLUSTER_HEADER_HEIGHT + CLUSTER_PADDING * 2 + ownGrid.height
  return {
    width: Math.max(DEFAULT_CLUSTER_WIDTH, ownContentWidth),
    height: Math.max(DEFAULT_CLUSTER_HEIGHT, ownContentHeight)
  }
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
 *
 * `compact` (default false): every category's own member-card space is
 * ignored, even if it holds codes/notes — a leaf sizes down to just its
 * header (COMPACT_LEAF_WIDTH/HEIGHT). Meant for a board that only ever
 * shows cluster frames, never the items themselves (addAllClustersToBoard's
 * `includeMembers: false`) — sizing those boxes as if they needed to hold
 * a grid of cards they'll never actually show just reads as large, mostly
 * empty rectangles.
 */
export function computeCategoryLayout(
  categories: CategoryRecord[],
  explicitOverrides: Map<string, { x: number; y: number; width: number; height: number }> = new Map(),
  compact = false
): ComputedClusterLayout[] {
  const childrenByParentId = new Map<string, CategoryRecord[]>()
  for (const category of categories) {
    if (!category.parentCategoryId) continue
    const list = childrenByParentId.get(category.parentCategoryId) ?? []
    list.push(category)
    childrenByParentId.set(category.parentCategoryId, list)
  }

  // Every column in a children-grid shares one width, wide enough for the
  // widest child — simpler than letting each column take its narrowest
  // occupant's width (which would risk two adjacent columns' children
  // overlapping once a wider one lands in either), at the cost of some
  // unused space next to a narrower sibling in the same column. A single
  // child by itself still just gets its own natural width, no grid needed.
  function gridColumnWidth(childSizes: Array<{ width: number }>): number {
    return Math.max(compact ? COMPACT_LEAF_WIDTH : DEFAULT_CLUSTER_WIDTH, ...childSizes.map((s) => s.width))
  }

  // Bottom-up: the size a category's box needs to fit its own member cards
  // plus a grid of its nested children packed inside it. An explicit
  // (stored) size is a *floor* on that, never a ceiling: the box is shown
  // at whichever is bigger, so a stored shape shrunk by hand, or sized
  // before more cards/sub-clusters landed in it, still holds everything
  // — a cluster's picture is its contents, and its contents always fit.
  // No cycle guard needed here: every category has exactly one
  // parentCategoryId, so a cycle can only exist among categories that are
  // *not* reachable from any real root in the first place
  // (reparentCategory prevents ever creating one) — this only ever
  // recurses along real parent->child edges starting from an actual root.
  function computeSize(category: CategoryRecord): { width: number; height: number } {
    const natural = computeNaturalSize(category)
    const existing = explicitOverrides.get(category.id)
    if (!existing) return natural
    // An empty cluster (no cards, no sub-clusters) has nothing to hold —
    // its box stays exactly as drawn, even below the default size.
    const hasContent =
      category.codeIds.length + category.noteIds.length > 0 || (childrenByParentId.get(category.id)?.length ?? 0) > 0
    if (!hasContent) return { width: existing.width, height: existing.height }
    return { width: Math.max(existing.width, natural.width), height: Math.max(existing.height, natural.height) }
  }

  function computeNaturalSize(category: CategoryRecord): { width: number; height: number } {
    const children = childrenByParentId.get(category.id) ?? []
    const ownGrid = compact ? { width: 0, height: 0 } : ownMemberGridSize(category)
    const ownContentHeight = CLUSTER_HEADER_HEIGHT + CLUSTER_PADDING * 2 + ownGrid.height
    // + CLUSTER_PADDING once: the same one-sided inset used everywhere else
    // in this function (see childX/innerX below), not a margin on both sides.
    const ownContentWidth = ownGrid.width > 0 ? ownGrid.width + CLUSTER_PADDING : 0

    if (children.length === 0) {
      return compact ? { width: COMPACT_LEAF_WIDTH, height: COMPACT_LEAF_HEIGHT } : computeOwnClusterSize(category)
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
      width: Math.max(compact ? COMPACT_LEAF_WIDTH : DEFAULT_CLUSTER_WIDTH, ownContentWidth, childGridWidth),
      height: Math.max(compact ? COMPACT_LEAF_HEIGHT : DEFAULT_CLUSTER_HEIGHT, ownContentHeight + childGridHeight)
    }
  }

  const result: ComputedClusterLayout[] = []

  // Top-down: place this category's box at (x, y) using the size already
  // determined by computeSize, then recursively place its nested children
  // in the same grid arrangement computeSize assumed — same children, same
  // sizes, same greedy packing order, so the two can never disagree about
  // how much room was actually needed vs. how it's actually laid out.
  //
  // Only a *root* category's stored position is honored. A nested one
  // always sits at its slot in its parent's children grid, whatever its
  // stored x/y says (stored size still counts, as a floor) — so nothing
  // can be pushed out of a superordinate, and a stored position can never
  // disagree with the nesting it's actually in. Free placement is for the
  // board's top level only; inside a superordinate, arrangement is
  // automatic, exactly like cards inside a cluster.
  function placeCategory(category: CategoryRecord, x: number, y: number): { y: number; height: number } {
    const existing = category.parentCategoryId ? undefined : explicitOverrides.get(category.id)
    const size = computeSize(category)
    const actualX = existing ? existing.x : x
    const actualY = existing ? existing.y : y

    result.push({ categoryId: category.id, x: actualX, y: actualY, width: size.width, height: size.height })

    const children = childrenByParentId.get(category.id) ?? []
    if (children.length > 0) {
      const childSizes = children.map((child) => computeSize(child))
      const columnCount = packGridColumnCount(children.length)
      const columnWidth = gridColumnWidth(childSizes)
      const innerX = actualX + CLUSTER_PADDING
      const innerY =
        actualY + CLUSTER_HEADER_HEIGHT + CLUSTER_PADDING + (compact ? 0 : ownMemberGridSize(category).height)
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

  // Same reservation pass as a children-grid above, and for the same
  // reason: an explicit root keeps its own real position regardless of
  // packing, so a still-virtual root must not get shortest-column-
  // assigned the exact slot it already occupies.
  const overriddenRoots = roots.filter((r) => explicitOverrides.has(r.id))
  for (const category of overriddenRoots) {
    const box = explicitOverrides.get(category.id)!
    const size = computeSize(category)
    for (let i = 0; i < rootColumnCount; i++) {
      const colX = GRID_ORIGIN_X + i * (rootColumnWidth + CLUSTER_GAP)
      const overlapsColumn = box.x < colX + rootColumnWidth && box.x + size.width > colX
      if (overlapsColumn) columnBottoms[i] = Math.max(columnBottoms[i], box.y + size.height + CLUSTER_GAP)
    }
    placeCategory(category, box.x, box.y)
  }

  for (const category of roots) {
    if (explicitOverrides.has(category.id)) continue
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
  return layout.map((l) => {
    const explicit = explicitByCategory.get(l.categoryId)
    // An explicit shape keeps its identity, but what's *shown* is the
    // layout's: a root keeps its stored position and is at least as big as
    // its contents; a nested one sits at its slot in its parent's grid
    // (see computeCategoryLayout).
    if (explicit) return { ...explicit, x: l.x, y: l.y, width: l.width, height: l.height }
    return {
      id: `virtual:cluster:${l.categoryId}`,
      boardId: board.id,
      categoryId: l.categoryId,
      x: l.x,
      y: l.y,
      width: l.width,
      height: l.height,
      createdAt: ''
    }
  })
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
  clusters: BoardCluster[] = [],
  links: Array<{ itemAId: string; itemBId: string }> = []
): BoardItem[] {
  if (!board.isDefault) return explicitItems

  const explicitByRef = new Map(explicitItems.map((i) => [`${i.refType}:${i.refId}`, i]))
  const clusterByCategoryId = new Map(clusters.map((c) => [c.categoryId, c]))

  const homeClusterByRef = new Map<string, BoardCluster>()
  // Same near-square grid every other auto-layout in this file uses
  // (packGridColumnCount) — how many columns THIS cluster's own member
  // cards pack into, keyed by cluster id so positionForSlot below doesn't
  // need the category again. Matches exactly what getVisibleBoardClusters'
  // ownMemberGridSize assumed when it sized the cluster's box, so cards
  // never overflow it. Based on every declared member, which is also
  // exactly the set memberSlotByRef below hands slots to.
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

  // Each member's slot within its home cluster's grid: codebook order
  // (project-wide code order, then note order), except that cards linked
  // together in the same cluster take consecutive slots, so a linked pair
  // still reads as a pair inside the grid. Assigned once up front for every
  // member (explicit ones included — on the default board a clustered card
  // always sits at its slot; see placeRef), so a member's slot never
  // depends on which of its siblings happen to have been touched.
  //
  // A linked group sits where its *anchor* would: the card that was aimed
  // at. A link records the dragged card as itemA and the card it was
  // dropped on as itemB, so the anchor is a member that's only ever a
  // target within the group (earliest in codebook order if several, or if
  // a cycle leaves none). The rest follow it, breadth-first. Anchoring on
  // the codebook-earliest member instead pulled the target back to wherever
  // the dragged card used to be, whenever the dragged card came first —
  // shifting every card in between, so a third card slid into the very
  // spot the user had dropped onto and looked like the one linked.
  const refByItemId = new Map(explicitItems.map((i) => [i.id, `${i.refType}:${i.refId}`]))
  const linkedRefsByRef = new Map<string, string[]>()
  const sourceRefs = new Set<string>()
  for (const link of links) {
    const a = refByItemId.get(link.itemAId)
    const b = refByItemId.get(link.itemBId)
    if (!a || !b || a === b) continue
    linkedRefsByRef.set(a, [...(linkedRefsByRef.get(a) ?? []), b])
    linkedRefsByRef.set(b, [...(linkedRefsByRef.get(b) ?? []), a])
    if (homeClusterByRef.get(a) === homeClusterByRef.get(b)) sourceRefs.add(a)
  }
  const orderedRefs = [...codes.map((c) => `code:${c.id}`), ...notes.map((n) => `note:${n.id}`)]
  const rankByRef = new Map(orderedRefs.map((key, index) => [key, index]))
  const byRank = (a: string, b: string): number => (rankByRef.get(a) ?? 0) - (rankByRef.get(b) ?? 0)

  // Linked groups within one cluster, each with its anchor.
  const anchorByRef = new Map<string, string>()
  for (const key of orderedRefs) {
    const cluster = homeClusterByRef.get(key)
    if (!cluster || anchorByRef.has(key)) continue
    const group = [key]
    const inGroup = new Set(group)
    for (let i = 0; i < group.length; i++) {
      for (const partner of linkedRefsByRef.get(group[i]) ?? []) {
        if (homeClusterByRef.get(partner) !== cluster || inGroup.has(partner)) continue
        inGroup.add(partner)
        group.push(partner)
      }
    }
    group.sort(byRank)
    const anchor = group.find((ref) => !sourceRefs.has(ref)) ?? group[0]
    for (const ref of group) anchorByRef.set(ref, anchor)
  }

  const memberSlotByRef = new Map<string, number>()
  const slotCounterByCluster = new Map<string, number>()
  for (const key of orderedRefs) {
    const cluster = homeClusterByRef.get(key)
    // A non-anchor member is placed with its group, when its anchor comes up.
    if (!cluster || memberSlotByRef.has(key) || anchorByRef.get(key) !== key) continue
    const seen = new Set([key])
    const queue = [key]
    while (queue.length > 0) {
      const current = queue.shift()!
      const slot = slotCounterByCluster.get(cluster.id) ?? 0
      memberSlotByRef.set(current, slot)
      slotCounterByCluster.set(cluster.id, slot + 1)
      const partners = (linkedRefsByRef.get(current) ?? [])
        .filter((p) => homeClusterByRef.get(p) === cluster && !seen.has(p))
        .sort(byRank)
      for (const partner of partners) {
        seen.add(partner)
        queue.push(partner)
      }
    }
  }

  function positionForSlot(cluster: BoardCluster, slot: number): { x: number; y: number } {
    const columnCount = memberColumnCountByCluster.get(cluster.id) ?? 1
    const row = Math.floor(slot / columnCount)
    const column = slot % columnCount
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
    const homeCluster = homeClusterByRef.get(key)
    const slot = memberSlotByRef.get(key)
    // A clustered card always sits at its grid slot, whether or not it has
    // a stored BoardItem — the stored position of an explicit one is
    // ignored here (only its identity is kept, so links and drags keep
    // resolving it). A cluster's picture is its membership, nothing else:
    // no card can be stranded, stacked, or pushed out of its cluster, and
    // "Reset placement" can't disagree with what's on screen. Free
    // placement is only for cards that aren't in any cluster.
    if (homeCluster && slot !== undefined) {
      const pos = positionForSlot(homeCluster, slot)
      result.push(existing ? { ...existing, ...pos } : { id: `virtual:${key}`, boardId: board.id, refType, refId, ...pos })
      return
    }
    if (existing) {
      result.push(existing)
      return
    }
    // A hand-placed card keeps its spot; an auto-placed one skips any
    // flat-grid slot such a card already covers — the flat area's origin
    // moves with the clusters above it, so a slot can land on a card
    // placed there earlier.
    let pos = computeGridPosition(autoIndex++, unclusteredOriginY)
    while (
      explicitItems.some(
        (e) => Math.abs(e.x - pos.x) < MEMBER_CARD_WIDTH && Math.abs(e.y - pos.y) < MEMBER_CARD_HEIGHT
      )
    ) {
      pos = computeGridPosition(autoIndex++, unclusteredOriginY)
    }
    result.push({ id: `virtual:${key}`, boardId: board.id, refType, refId, ...pos })
  }

  for (const code of codes) placeRef('code', code.id)
  for (const note of notes) placeRef('note', note.id)

  // Any explicitly-added segment (quote) items always show too.
  result.push(...explicitItems.filter((i) => i.refType === 'segment'))
  return result
}

/**
 * Moves a ref's category membership from wherever it currently is to
 * `newCategoryId` (or fully unclusters it, if null): removed from every
 * category it's in except the new one, then added there. The one entry
 * point a board drag uses for a membership change.
 */
export function reassignRefCategoryMembership(
  data: ProjectData,
  boardId: string,
  refType: 'code' | 'note' | 'segment',
  refId: string,
  newCategoryId: string | null
): ProjectData {
  // Clustered cards render at their grid slots regardless of any stored
  // position (getVisibleBoardItems), so a membership change re-grids both
  // the category being left and the one being joined consistently on its
  // own — nothing has to be pinned first anymore. (This used to
  // materialize every member of both categories to keep a renumbered slot
  // from landing on a hand-placed card; that class of collision can no
  // longer occur.) boardId is kept so the store action's board-scoped
  // signature stays stable.
  void boardId
  let next = reconcileSoleCategoryMembership(data, refType, refId, newCategoryId)
  if (newCategoryId) next = addMemberByRefType(next, newCategoryId, refType, refId)
  return next
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
  includeMembers: boolean = true,
  /** Size every newly-placed cluster down to just its header, ignoring how
   * many codes/notes it holds — see computeCategoryLayout's own `compact`
   * option. Only meaningful alongside `includeMembers: false`: reserving
   * zero member-card space while also actually placing those cards would
   * just make them overflow their frame. */
  compact: boolean = false
): ProjectData {
  const existingOnBoard = data.boardClusters.filter((c) => c.boardId === boardId)
  const existingCategoryIds = new Set(existingOnBoard.map((c) => c.categoryId))
  const categoriesToPlace = data.categories.filter((c) => !existingCategoryIds.has(c.id))
  if (categoriesToPlace.length === 0) return data

  const explicitOverrides = new Map(existingOnBoard.map((c) => [c.categoryId, c]))
  const layoutByCategoryId = new Map(
    computeCategoryLayout(data.categories, explicitOverrides, compact && !includeMembers).map((l) => [
      l.categoryId,
      l
    ])
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

/**
 * Gives every sibling of `categoryId` (same parentCategoryId — the whole
 * root-level group, if it has none) that doesn't yet have an explicit
 * BoardCluster shape on this board a real, persisted one, frozen at its
 * *current* computed position.
 *
 * getVisibleBoardClusters' auto-layout packs every still-virtual category
 * into a masonry grid — each column tracks its own running bottom edge, so
 * a category's position depends on the sizes of every sibling processed
 * before it in the same pass. That makes it inherently unstable across
 * renders: resizing or moving *any one* sibling changes what the packing
 * algorithm hands back for the *others* on the next render, even though
 * nothing about them was touched — reported as "resizing/moving one
 * cluster, a different, unrelated cluster jumps and lands overlapping a
 * third one." Once a category has an explicit shape, by contrast, it's
 * pinned unconditionally (computeCategoryLayout always trusts an override
 * over recomputing) and never affected by anything else again.
 *
 * The fix: the moment any one cluster in a packing group is about to be
 * individually resized or moved (i.e. is about to become explicit, if it
 * isn't already), snapshot the *whole* group into explicit shapes at once,
 * at wherever the auto-layout currently has them — so every member of the
 * group is immediately and permanently immune to future reflow, not just
 * the one actually being dragged.
 */
export function materializeSiblingClusters(data: ProjectData, boardId: string, categoryId: string): ProjectData {
  const board = data.boards.find((b) => b.id === boardId)
  const category = data.categories.find((c) => c.id === categoryId)
  if (!board || !category) return data
  // Only the board's top level has free positions to protect — clusters
  // inside a superordinate always sit on its grid, and are *meant* to
  // rearrange when one of them changes.
  if (category.parentCategoryId) return data

  const siblings = data.categories.filter(
    (c) => c.id !== categoryId && c.parentCategoryId === category.parentCategoryId
  )
  if (siblings.length === 0) return data

  const explicitClusters = data.boardClusters.filter((c) => c.boardId === boardId)
  const explicitCategoryIds = new Set(explicitClusters.map((c) => c.categoryId))
  const visibleByCategoryId = new Map(
    getVisibleBoardClusters(board, explicitClusters, data.categories).map((c) => [c.categoryId, c])
  )

  let next = data
  for (const sibling of siblings) {
    if (explicitCategoryIds.has(sibling.id)) continue
    const computed = visibleByCategoryId.get(sibling.id)
    if (!computed) continue
    next = createClusterForCategory(next, {
      boardId,
      categoryId: sibling.id,
      x: computed.x,
      y: computed.y,
      width: computed.width,
      height: computed.height
    }).data
  }
  return next
}

/**
 * The destination-side counterpart of materializeSiblingClusters: pins
 * every still-virtual direct child of `parentCategoryId` (or every
 * still-virtual root, if null) at its current auto-computed position.
 *
 * Call this *before* a cluster joins that group (nesting into it, or
 * un-nesting back to root level), not after: a group's packed positions
 * depend on its whole membership — how many columns there are, and how
 * wide each one is, both follow from the full set of siblings — so the
 * moment a newcomer is added, every untouched virtual sibling's computed
 * position can shift. Pinning them afterward only freezes them at the
 * already-shifted spots; pinning them first keeps them exactly where they
 * were on screen, so joining a group never moves anything the user didn't
 * touch. The newcomer itself is placed wherever the user actually put it.
 */
export function materializeChildClusters(
  data: ProjectData,
  boardId: string,
  parentCategoryId: string | null
): ProjectData {
  const board = data.boards.find((b) => b.id === boardId)
  if (!board) return data
  // Inside a superordinate, children sit on its grid and rearrange by
  // design when one joins; only the free-placed top level needs pinning.
  if (parentCategoryId) return data

  const children = data.categories.filter((c) => (c.parentCategoryId ?? null) === parentCategoryId)
  if (children.length === 0) return data

  const explicitClusters = data.boardClusters.filter((c) => c.boardId === boardId)
  const explicitCategoryIds = new Set(explicitClusters.map((c) => c.categoryId))
  const visibleByCategoryId = new Map(
    getVisibleBoardClusters(board, explicitClusters, data.categories).map((c) => [c.categoryId, c])
  )

  let next = data
  for (const child of children) {
    if (explicitCategoryIds.has(child.id)) continue
    const computed = visibleByCategoryId.get(child.id)
    if (!computed) continue
    next = createClusterForCategory(next, {
      boardId,
      categoryId: child.id,
      x: computed.x,
      y: computed.y,
      width: computed.width,
      height: computed.height
    }).data
  }
  return next
}

/**
 * Called after a board drag adds a member to a cluster. The name is
 * historical: the box no longer needs growing (see below); this just
 * keeps the cluster's top-level ancestor clear of its neighbors.
 */
export function growClusterToFitOwnMembers(data: ProjectData, boardId: string, categoryId: string): ProjectData {
  const board = data.boards.find((b) => b.id === boardId)
  const category = data.categories.find((c) => c.id === categoryId)
  if (!board || !category) return data

  // A box is shown at no less than its own card grid (computeCategoryLayout),
  // whether its shape is stored or not, so there is nothing to grow here
  // anymore — and nothing is written back on purpose, so a cluster
  // shrinks again when cards leave. What can still need doing is at the
  // top level: a root that just got bigger to fit a new card can overlap a
  // free-placed neighbor.
  void board
  return growAncestorClustersToFit(data, boardId, categoryId)
}

/**
 * After anything that can change what a cluster's ancestors have to hold
 * (a card dropped in, a sub-cluster nested/resized/removed): clears the
 * top-level ancestor's free-placed neighbors out of its (possibly bigger)
 * way.
 *
 * Containment itself never needs fixing — a box is shown at no less than
 * its contents (computeCategoryLayout), so a superordinate always visibly
 * holds everything nested in it. And nothing is written back to the
 * stored shape on purpose: a stored size is the user's own floor, so a
 * container grows with its contents and shrinks back when they leave,
 * down to whatever the user last drew. What still matters visually is the
 * root: a root that just grew to fit its contents can now overlap a
 * free-placed neighbor, which resolveSiblingOverlaps pushes clear.
 */
export function growAncestorClustersToFit(data: ProjectData, boardId: string, categoryId: string): ProjectData {
  const byId = new Map(data.categories.map((c) => [c.id, c]))
  let root = byId.get(categoryId)
  if (!root) return data
  while (root.parentCategoryId && byId.has(root.parentCategoryId)) root = byId.get(root.parentCategoryId)!
  return resolveSiblingOverlaps(data, boardId, root.id)
}

/**
 * Used when several clusters get newly nested into the same parent at
 * once — a resize that grows a cluster's frame until it fully encloses
 * one or more others, nesting whichever ones ended up entirely inside it
 * (see findClustersEnclosedBy) — so the result reads as a clean grid
 * instead of an overlapping mess.
 *
 * Each of `newChildCategoryIds` kept whatever absolute position it had
 * *before* joining this parent, which has nothing to do with the
 * parent's own natural children-grid layout. A cluster that's been
 * enclosed by a resize has usually been individually touched before (it
 * had to already exist somewhere on the board), so it likely already has
 * an explicit shape — and computeCategoryLayout leaves an explicit
 * child's position frozen wherever it already was rather than packing it
 * into the parent's grid, while any of the *other* newly-enclosed
 * clusters that are still virtual get packed fresh right on top of it.
 * Reported as: resizing a cluster to enclose several others left them
 * overlapping instead of tiled cleanly.
 *
 * Drops each newly-nested cluster's own explicit shape first, so all of
 * them — new arrivals and whatever children the parent already had —
 * recompute together through the parent's normal children-grid packing,
 * then immediately (one at a time, so each later one's fresh position
 * already accounts for the ones just pinned before it — same mechanism
 * materializeSiblingClusters uses) pins the *entire* resulting children
 * set at those fresh positions, so the clean layout is also immediately
 * stable against future reflow. Finally grows the parent (and its own
 * ancestors, transitively) to actually fit what it now contains.
 *
 * Also drops each newly-nested category's own explicit member items
 * (codes/notes already individually dragged before). An explicit member's
 * position is computed once, relative to its cluster's box *at the time it
 * was pinned* (see positionForSlot in getVisibleBoardItems) — it never
 * moves again on its own. Re-nesting nearly always relocates the cluster's
 * frame (from wherever it rendered before — often as a root, packed among
 * unrelated siblings — to a fresh position inside the parent's children
 * grid), so any already-pinned member gets left stranded at its old,
 * now-unrelated coordinates instead of following its cluster. Reported as:
 * enclosing several clusters in one resize left one of them with its items
 * sitting in place but no frame around them, elsewhere the frame reappeared
 * empty. A relocating cluster's own nested sub-clusters get the same
 * treatment (their shapes and members reset along with it), for the same
 * reason one level down.
 *
 * Children the parent *already* had are left exactly where they are — pin
 * them first (materializeChildClusters) so that holds for still-virtual
 * ones too; the newcomers then pack into whatever space is genuinely free
 * around them (computeCategoryLayout reserves every explicit sibling's
 * footprint before placing anything).
 */
export function renestClustersCleanly(
  data: ProjectData,
  boardId: string,
  parentCategoryId: string,
  newChildCategoryIds: string[]
): ProjectData {
  const board = data.boards.find((b) => b.id === boardId)
  if (!board) return data

  // Only what actually ended up a direct child counts — a reparent that
  // was refused (it would have made a cycle) must not get its shape reset
  // as if it had gone through. Each relocating cluster takes its whole
  // nested subtree along: its sub-clusters (and their members) were
  // positioned relative to where *it* used to be, so they have to
  // recompute against its new position too, or they'd be left stranded
  // outside it exactly like its own member cards would.
  const relocatingCategoryIds = new Set<string>()
  for (const categoryId of newChildCategoryIds) {
    const category = data.categories.find((c) => c.id === categoryId)
    if (!category || category.parentCategoryId !== parentCategoryId) continue
    relocatingCategoryIds.add(categoryId)
    for (const id of getDescendantCategoryIds(data.categories, categoryId)) relocatingCategoryIds.add(id)
  }
  if (relocatingCategoryIds.size === 0) return data

  const relocatingRefs = new Set<string>()
  for (const category of data.categories) {
    if (!relocatingCategoryIds.has(category.id)) continue
    for (const codeId of category.codeIds) relocatingRefs.add(`code:${codeId}`)
    for (const noteId of category.noteIds) relocatingRefs.add(`note:${noteId}`)
  }

  let next: ProjectData = {
    ...data,
    boardClusters: data.boardClusters.filter(
      (c) => !(c.boardId === boardId && relocatingCategoryIds.has(c.categoryId))
    ),
    boardItems: data.boardItems.filter(
      (i) => i.boardId !== boardId || !relocatingRefs.has(`${i.refType}:${i.refId}`)
    )
  }

  void board
  for (const childId of newChildCategoryIds) {
    if (relocatingCategoryIds.has(childId)) next = growAncestorClustersToFit(next, boardId, childId)
  }

  return next
}

/** Shifts a cluster's explicit box, every explicit box nested anywhere
 * under it, and every explicit member card of any of them by (dx, dy) —
 * still-virtual ones follow on their own, being computed relative to it. */
export function translateClusterSubtree(
  data: ProjectData,
  boardId: string,
  categoryId: string,
  dx: number,
  dy: number
): ProjectData {
  if (dx === 0 && dy === 0) return data
  const ids = new Set([categoryId, ...getDescendantCategoryIds(data.categories, categoryId)])
  const refs = new Set<string>()
  for (const category of data.categories) {
    if (!ids.has(category.id)) continue
    for (const codeId of category.codeIds) refs.add(`code:${codeId}`)
    for (const noteId of category.noteIds) refs.add(`note:${noteId}`)
  }
  return {
    ...data,
    boardClusters: data.boardClusters.map((c) =>
      c.boardId === boardId && ids.has(c.categoryId) ? { ...c, x: c.x + dx, y: c.y + dy } : c
    ),
    boardItems: data.boardItems.map((i) =>
      i.boardId === boardId && refs.has(`${i.refType}:${i.refId}`) ? { ...i, x: i.x + dx, y: i.y + dy } : i
    )
  }
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/** The nearest spot (never at negative coordinates) that moves `rect`
 * clear of `collider` — preferring one that's clear of everything already
 * settled, then the smallest displacement. */
function pushClear(rect: Rect, collider: Rect, settled: Rect[], gap: number): Rect {
  const candidates = [
    { x: rect.x, y: collider.y + collider.height + gap },
    { x: collider.x + collider.width + gap, y: rect.y },
    { x: collider.x - rect.width - gap, y: rect.y },
    { x: rect.x, y: collider.y - rect.height - gap }
  ]
    .filter((p) => p.x >= 0 && p.y >= 0)
    .map((p) => ({
      p,
      distance: Math.hypot(p.x - rect.x, p.y - rect.y),
      clear: !settled.some((s) => rectsOverlap(s, { ...rect, x: p.x, y: p.y }))
    }))
    .sort((a, b) => (a.clear === b.clear ? a.distance - b.distance : a.clear ? -1 : 1))
  return { ...rect, x: candidates[0].p.x, y: candidates[0].p.y }
}

/**
 * After `categoryId`'s box has changed (resized by hand, grown to fit
 * what it now holds, or dropped somewhere), moves any explicit sibling in
 * its packing group (same parent, or the board's root level) that its box
 * now overlaps out of the way, to the nearest free spot — never the other
 * way round: the cluster that changed is the one the user (or the fit
 * logic) just put there, so it stays exactly where it is. A pushed sibling
 * takes its whole subtree and its member cards with it, and can itself
 * push the next one along; each then has its own ancestors grown to keep
 * containing it.
 *
 * Only explicit siblings need this: a still-virtual one is packed around
 * every explicit footprint in its group on each read (see the reservation
 * pass in computeCategoryLayout), so it can never be under anything.
 *
 * Without it, a box growing into a neighbor — a superordinate grown to
 * fit newly enclosed clusters, say — silently covered whatever it grew
 * over, leaving an uninvolved cluster hidden behind it. Reported as:
 * "make sure a neighboring unconcerned cluster won't be moved behind /
 * hidden behind another cluster."
 */
export function resolveSiblingOverlaps(data: ProjectData, boardId: string, categoryId: string): ProjectData {
  const board = data.boards.find((b) => b.id === boardId)
  const category = data.categories.find((c) => c.id === categoryId)
  if (!board || !category) return data
  // Clusters inside a superordinate sit on its grid: they can't overlap
  // by construction. Only the free-placed top level needs this.
  if (category.parentCategoryId) return data

  // Rects are the *shown* boxes (a stored shape can be shown bigger than
  // stored — see getVisibleBoardClusters), but only explicit siblings are
  // candidates to push: a virtual one already packs around every explicit
  // footprint on its own.
  const explicitClusters = data.boardClusters.filter((c) => c.boardId === boardId)
  const explicitCategoryIds = new Set(explicitClusters.map((c) => c.categoryId))
  if (!explicitCategoryIds.has(categoryId)) return data
  const visibleByCategoryId = new Map(
    getVisibleBoardClusters(board, explicitClusters, data.categories).map((c) => [c.categoryId, c])
  )
  const anchor = visibleByCategoryId.get(categoryId)
  if (!anchor) return data

  const parentId = category.parentCategoryId ?? null
  const siblings = data.categories
    .filter((c) => c.id !== categoryId && (c.parentCategoryId ?? null) === parentId && explicitCategoryIds.has(c.id))
    .map((c) => visibleByCategoryId.get(c.id))
    .filter((c): c is BoardCluster => c !== undefined)
  if (siblings.length === 0) return data

  const anchorRect: Rect = { x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height }
  // Whatever the anchor actually overlaps gets sorted out first; the rest
  // settle in reading order, so a push only ever ripples down/right-ward
  // through the group in a predictable way.
  const ordered = [...siblings].sort((a, b) => {
    const aHit = rectsOverlap(anchorRect, a) ? 0 : 1
    const bHit = rectsOverlap(anchorRect, b) ? 0 : 1
    return aHit - bHit || a.y - b.y || a.x - b.x
  })

  const settled: Rect[] = [anchorRect]
  const pushed: string[] = []
  let next = data
  for (const sibling of ordered) {
    let rect: Rect = { x: sibling.x, y: sibling.y, width: sibling.width, height: sibling.height }
    for (let guard = 0; guard < 100; guard++) {
      const collider = settled.find((s) => rectsOverlap(s, rect))
      if (!collider) break
      rect = pushClear(rect, collider, settled, CLUSTER_GAP)
    }
    const dx = rect.x - sibling.x
    const dy = rect.y - sibling.y
    if (dx !== 0 || dy !== 0) {
      next = translateClusterSubtree(next, boardId, sibling.categoryId, dx, dy)
      pushed.push(sibling.categoryId)
    }
    settled.push(rect)
  }
  for (const id of pushed) next = growAncestorClustersToFit(next, boardId, id)
  return next
}

/**
 * The card counterpart of resolveSiblingOverlaps: after a card (or a
 * linked group of them) is dropped, every other explicit card on the
 * board it now covers is pushed to the nearest free spot — the dropped
 * cards themselves stay exactly where they were released. A pushed card
 * that's a cluster member then has that cluster grown to keep containing
 * it (which in turn keeps the cluster's own neighbors clear).
 *
 * This is what makes dropping into an already-full cluster work: there's
 * no empty slot to release over, so the drop necessarily lands on an
 * existing card — previously the two just stacked. Now the one already
 * there moves over and the cluster grows to fit. Every card in the
 * destination cluster is explicit by the time this runs
 * (reassignRefCategoryMembership materializes them), so its whole grid
 * takes part.
 */
export function resolveItemOverlaps(data: ProjectData, boardId: string, anchorItemIds: string[]): ProjectData {
  // Only cards that aren't in any cluster: a clustered card renders at its
  // grid slot regardless of its stored position (see getVisibleBoardItems),
  // so it can neither cover anything nor be covered by its stored x/y.
  const clusteredRefs = new Set<string>()
  for (const category of data.categories) {
    for (const codeId of category.codeIds) clusteredRefs.add(`code:${codeId}`)
    for (const noteId of category.noteIds) clusteredRefs.add(`note:${noteId}`)
  }
  const explicitItems = data.boardItems.filter(
    (i) => i.boardId === boardId && !clusteredRefs.has(`${i.refType}:${i.refId}`)
  )
  const anchorIds = new Set(anchorItemIds)
  const anchors = explicitItems.filter((i) => anchorIds.has(i.id))
  if (anchors.length === 0) return data

  const rectOf = (i: BoardItem): Rect => ({ x: i.x, y: i.y, width: MEMBER_CARD_WIDTH, height: MEMBER_CARD_HEIGHT })
  const settled: Rect[] = anchors.map(rectOf)
  const others = explicitItems
    .filter((i) => !anchorIds.has(i.id))
    .sort((a, b) => {
      const aHit = settled.some((s) => rectsOverlap(s, rectOf(a))) ? 0 : 1
      const bHit = settled.some((s) => rectsOverlap(s, rectOf(b))) ? 0 : 1
      return aHit - bHit || a.y - b.y || a.x - b.x
    })

  let next = data
  for (const item of others) {
    let rect = rectOf(item)
    for (let guard = 0; guard < 100; guard++) {
      const collider = settled.find((s) => rectsOverlap(s, rect))
      if (!collider) break
      rect = pushClear(rect, collider, settled, MEMBER_CARD_GAP)
    }
    if (rect.x !== item.x || rect.y !== item.y) next = moveItem(next, item.id, rect.x, rect.y)
    settled.push(rect)
  }
  return next
}

/** Gives each of `categoryIds` a stored shape at exactly where it is
 * currently shown (moving/resizing an existing stored shape to match).
 * This is what "stays where it is" means for a cluster about to become
 * top-level: while nested it sat on its parent's grid and its stored
 * position (if any) was ignored — so that stored position is likely
 * stale, and a still-virtual one would otherwise get a fresh masonry slot
 * somewhere else entirely. */
export function pinClustersAtShownPositions(data: ProjectData, boardId: string, categoryIds: string[]): ProjectData {
  const board = data.boards.find((b) => b.id === boardId)
  if (!board || categoryIds.length === 0) return data
  const explicitClusters = data.boardClusters.filter((c) => c.boardId === boardId)
  const visibleByCategoryId = new Map(
    getVisibleBoardClusters(board, explicitClusters, data.categories).map((c) => [c.categoryId, c])
  )
  let next = data
  for (const categoryId of categoryIds) {
    const shown = visibleByCategoryId.get(categoryId)
    if (!shown) continue
    const stored = next.boardClusters.find((c) => c.boardId === boardId && c.categoryId === categoryId)
    if (stored) {
      next = moveCluster(next, stored.id, shown.x, shown.y)
      next = resizeCluster(next, stored.id, shown.width, shown.height)
    } else {
      next = createClusterForCategory(next, {
        boardId,
        categoryId,
        x: shown.x,
        y: shown.y,
        width: shown.width,
        height: shown.height
      }).data
    }
  }
  return next
}

/**
 * Gives a cluster a stored shape at exactly where it's shown, if it
 * doesn't have one yet — pinning the whole top-level group at its current
 * positions first. The top-level group is auto-packed together (masonry:
 * each cluster's spot depends on every one packed before it), so giving
 * just one of them a stored shape takes it out of the packing and the
 * others repack around it — visibly jumping. Every "this cluster is being
 * touched" path has to go through here rather than creating a shape
 * directly. Reported as: after a reset, a mere click on a cluster made its
 * neighbors jump.
 */
export function ensureClusterShape(data: ProjectData, boardId: string, categoryId: string): ProjectData {
  if (data.boardClusters.some((c) => c.boardId === boardId && c.categoryId === categoryId)) return data
  const next = materializeChildClusters(data, boardId, null)
  return pinClustersAtShownPositions(next, boardId, [categoryId])
}

function rootAncestorId(categories: CategoryRecord[], categoryId: string): string {
  const byId = new Map(categories.map((c) => [c.id, c]))
  let current = byId.get(categoryId)
  while (current?.parentCategoryId && byId.has(current.parentCategoryId)) current = byId.get(current.parentCategoryId)
  return current?.id ?? categoryId
}

/**
 * A parent change that doesn't come from a board drag (the Workspace
 * codebook/notes trees, Analysis > Clusters), applied so that nothing on
 * the board moves that didn't have to. Nesting into a target: the cluster
 * simply takes its slot in the target's grid, the target grows to hold
 * it, and the top-level group is pinned first so the root it left behind
 * doesn't make the other top-level clusters repack. Un-nesting to the top
 * level: it's pinned exactly where it was shown, then pushed clear of the
 * superordinate it just left (which still surrounds that spot). This used
 * to reset the whole board's layout instead — every cluster reflowed for
 * one tree drag.
 */
export function reparentCategoryOnBoard(
  data: ProjectData,
  boardId: string,
  categoryId: string,
  newParentId: string | null
): ProjectData {
  const category = data.categories.find((c) => c.id === categoryId)
  if (!category) return data
  const oldParentId = category.parentCategoryId ?? null
  if (oldParentId === newParentId) return data

  let next = materializeChildClusters(data, boardId, null)
  if (newParentId === null) next = pinClustersAtShownPositions(next, boardId, [categoryId])
  next = reparentCategory(next, categoryId, newParentId)
  if (next.categories.find((c) => c.id === categoryId)?.parentCategoryId !== newParentId) return data

  if (newParentId === null && oldParentId) {
    next = resolveSiblingOverlaps(next, boardId, rootAncestorId(next.categories, oldParentId))
  }
  return growAncestorClustersToFit(next, boardId, categoryId)
}

/**
 * deleteCategory, keeping the deleted cluster's children where they are
 * shown. They're promoted to its own parent: into that grid if it has one
 * (automatic), or — when the deleted cluster was top-level — to the top
 * level, where each would otherwise land at its stale stored position or
 * a fresh masonry slot far from where it sat. Reported as: "when deleting
 * a SO cluster, the orphan clusters are moved in remote places."
 */
export function deleteCategoryOnBoard(data: ProjectData, boardId: string, categoryId: string): ProjectData {
  const target = data.categories.find((c) => c.id === categoryId)
  if (!target) return data
  let next = data
  if (!target.parentCategoryId) {
    const childIds = data.categories.filter((c) => c.parentCategoryId === categoryId).map((c) => c.id)
    next = materializeChildClusters(next, boardId, null)
    next = pinClustersAtShownPositions(next, boardId, childIds)
  }
  return deleteCategory(next, categoryId)
}

/**
 * After a code/note leaves its last cluster somewhere that isn't a board
 * drag (the Workspace tree): forget its stored board position, so it
 * lands in the flat unclustered area rather than at a stale position from
 * before it was ever clustered (ignored while it was).
 */
export function forgetItemPositionIfUnclustered(
  data: ProjectData,
  boardId: string,
  refType: 'code' | 'note',
  refId: string
): ProjectData {
  if (data.categories.some((c) => isCategoryMember(c, refType, refId))) return data
  return {
    ...data,
    boardItems: data.boardItems.filter((i) => !(i.boardId === boardId && i.refType === refType && i.refId === refId))
  }
}

/**
 * Takes the given direct children of `categoryId` out of it — the resize
 * counterpart of drag-out: shrinking a superordinate so a nested cluster
 * no longer fits inside the drawn box means "this doesn't belong in here
 * anymore." A superordinate is always shown at least as big as its
 * contents, so without this a shrink simply bounced back to the old size;
 * with it, the excluded clusters leave first and the superordinate is free
 * to shrink to whatever remains.
 *
 * Each detached cluster moves out by exactly one level: it becomes a
 * sibling of the superordinate it left — a child of *its* parent, taking
 * a slot in that grid, or a top-level cluster if the superordinate was
 * top-level, pinned exactly where it was being shown (its sub-clusters
 * and cards follow, being on its grid). Anything else would leave it
 * either still visually inside the grandparent while not belonging to it,
 * or jumping out of the grandparent entirely. For a top-level
 * superordinate, the root group is pinned before the newcomers join (see
 * materializeChildClusters), and the superordinate then pushes anything
 * it still overlaps clear (resolveSiblingOverlaps) — a partly-covered
 * cluster ends up beside the shrunk box rather than under its edge.
 */
export function detachClustersFrom(
  data: ProjectData,
  boardId: string,
  categoryId: string,
  childCategoryIds: string[]
): ProjectData {
  const board = data.boards.find((b) => b.id === boardId)
  const superordinate = data.categories.find((c) => c.id === categoryId)
  if (!board || !superordinate || childCategoryIds.length === 0) return data

  const explicitClusters = data.boardClusters.filter((c) => c.boardId === boardId)
  const visibleByCategoryId = new Map(
    getVisibleBoardClusters(board, explicitClusters, data.categories).map((c) => [c.categoryId, c])
  )

  const toDetach = childCategoryIds.filter((childId) => {
    const child = data.categories.find((c) => c.id === childId)
    return child?.parentCategoryId === categoryId && visibleByCategoryId.has(childId)
  })
  if (toDetach.length === 0) return data

  const newParentId = superordinate.parentCategoryId ?? null
  let next = data
  if (!newParentId) {
    next = materializeChildClusters(next, boardId, null)
    next = pinClustersAtShownPositions(next, boardId, toDetach)
  }
  for (const childId of toDetach) next = reparentCategory(next, childId, newParentId)
  return newParentId ? growAncestorClustersToFit(next, boardId, categoryId) : resolveSiblingOverlaps(next, boardId, categoryId)
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

function clusterRectContains(outer: BoardCluster, inner: BoardCluster): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

export interface StructuralNestingEdge {
  parentClusterId: string
  childClusterId: string
}

/**
 * Everywhere a cluster's nesting is shown by geometric containment (its box
 * literally drawn inside its parent's box — the default board, and Radial,
 * which cascades a moved root's delta down its whole subtree specifically
 * to preserve this), the parent/child relationship is legible without any
 * extra line. Tree deliberately breaks that containment on purpose — it
 * lays parent and children out as separate, non-overlapping boxes (an
 * organizational-chart arrangement), which was itself a fix (see the Tree
 * row-spacing entry in the changelog): once children can no longer overlap
 * their own parent, nothing else on the board shows they still belong to
 * it.
 *
 * This returns one edge per parent/child cluster pair present on the board
 * whose containment relationship no longer holds geometrically, so the
 * caller can draw a connecting line for exactly those pairs — automatic
 * and structural, distinct from a manually-authored ClusterLink (a labeled
 * analytic relationship, not "this is literally a sub-theme of that one").
 * A pair that's still visually contained (the default board; Radial) is
 * skipped, since a redundant line there would just be visual noise.
 */
export function getStructuralNestingEdges(
  clusters: BoardCluster[],
  categories: CategoryRecord[]
): StructuralNestingEdge[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const clusterByCategoryId = new Map(clusters.map((c) => [c.categoryId, c]))
  const edges: StructuralNestingEdge[] = []
  for (const cluster of clusters) {
    const parentCategoryId = categoryById.get(cluster.categoryId)?.parentCategoryId ?? null
    if (!parentCategoryId) continue
    const parentCluster = clusterByCategoryId.get(parentCategoryId)
    if (!parentCluster) continue
    if (clusterRectContains(parentCluster, cluster)) continue
    edges.push({ parentClusterId: parentCluster.id, childClusterId: cluster.id })
  }
  return edges
}

// --- Cluster-link connector geometry (used by both the structural nesting
// edges above and BoardView's manually-authored ClusterLink rendering) ---

interface BoxLike {
  x: number
  y: number
  width: number
  height: number
}

/** Where a ray from `box`'s own center toward (towardX, towardY) crosses the
 * box's boundary — clips a connector to the box's actual edge instead of
 * running it all the way to the center, so the visible line (and wherever
 * it points) never cuts across the box's own interior. */
export function boxExitPoint(box: BoxLike, towardX: number, towardY: number): { x: number; y: number } {
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const dx = towardX - cx
  const dy = towardY - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const tx = dx !== 0 ? box.width / 2 / Math.abs(dx) : Infinity
  const ty = dy !== 0 ? box.height / 2 / Math.abs(dy) : Infinity
  const t = Math.min(tx, ty)
  return { x: cx + dx * t, y: cy + dy * t }
}

function cross(ox: number, oy: number, ax: number, ay: number, bx: number, by: number): number {
  return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox)
}

function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  const d1 = cross(cx, cy, dx, dy, ax, ay)
  const d2 = cross(cx, cy, dx, dy, bx, by)
  const d3 = cross(ax, ay, bx, by, cx, cy)
  const d4 = cross(ax, ay, bx, by, dx, dy)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** Whether the segment a→b passes through, or starts/ends inside, `box` —
 * used to detect a ClusterLink whose straight path would cut across some
 * cluster that isn't one of its own two endpoints. */
export function segmentIntersectsBox(ax: number, ay: number, bx: number, by: number, box: BoxLike): boolean {
  const left = box.x
  const right = box.x + box.width
  const top = box.y
  const bottom = box.y + box.height
  // Quick reject: the segment's own bounding box doesn't even reach the
  // cluster's bounding box, so a full edge-by-edge check can't be needed.
  if (Math.max(ax, bx) < left || Math.min(ax, bx) > right || Math.max(ay, by) < top || Math.min(ay, by) > bottom) {
    return false
  }
  if (ax >= left && ax <= right && ay >= top && ay <= bottom) return true
  if (bx >= left && bx <= right && by >= top && by <= bottom) return true
  return (
    segmentsIntersect(ax, ay, bx, by, left, top, right, top) ||
    segmentsIntersect(ax, ay, bx, by, right, top, right, bottom) ||
    segmentsIntersect(ax, ay, bx, by, right, bottom, left, bottom) ||
    segmentsIntersect(ax, ay, bx, by, left, bottom, left, top)
  )
}

export interface ClusterLinkPath {
  ax: number
  ay: number
  bx: number
  by: number
  /** Where a label should sit — the midpoint of the *visible* path (the
   * curve's own midpoint when curved, not the straight ax/bx,ay/by span). */
  midX: number
  midY: number
  curved: boolean
  /** Quadratic Bézier control point — meaningful only when curved is true;
   * equal to the straight midpoint otherwise, so callers that build a path
   * string unconditionally (`M ax,ay Q controlX,controlY bx,by`) still get
   * a correct straight line out of it. */
  controlX: number
  controlY: number
}

const CLUSTER_LINK_PARALLEL_STEP = 28
const CLUSTER_LINK_OBSTRUCTION_MARGIN = 30
// A curve must never bow past the canvas's own top/left edge (x/y = 0) —
// there's no negative coordinate space to render into (no negative scroll,
// and an <svg> with explicit width/height clips anything before its own
// origin), so a curve that needed to bow that far would simply vanish
// instead of doing its job. Clamping the control point to this margin
// trades a little of the ideal clearance near the very edge of the board
// for guaranteeing the whole curve always stays visible — found via a real
// exported board where a link bowing toward the topmost row (very little
// headroom above it to begin with) rendered its arc cut off above the
// visible canvas.
const CLUSTER_LINK_MIN_COORD = 20

/**
 * The path one ClusterLink should actually draw: clipped to each cluster's
 * own edge (boxExitPoint), then bowed into a quadratic curve instead of a
 * straight line whenever either —
 *
 * (a) the straight path would cut across some unrelated third cluster's
 *     box, which the relationship has no business crossing (a real
 *     clutter source on a busy map: nothing previously stopped a link
 *     between two clusters from running straight through a completely
 *     different one sitting in between), or
 * (b) this is one of several parallel ClusterLinks between the very same
 *     pair of clusters, which would otherwise draw as one indistinguishable
 *     line no matter how many separate relationships exist between that
 *     pair.
 *
 * Obstruction avoidance always wins over a plain parallel offset when both
 * apply — actually clearing the obstruction matters more than the
 * (smaller, purely cosmetic) parallel spacing. `parallelIndex`/
 * `parallelCount` describe this link's position within its own pair's
 * group (assign a stable index per pair, e.g. by creation order) — pass
 * `0, 1` for a link that's the only one between its pair.
 *
 * `style: 'straight'` (a per-board user choice — see BoardRecord.
 * clusterLinkStyle) skips all of the above and always returns a plain
 * edge-to-edge line: a crossing or an overlapping parallel pair can still
 * happen, but some readers find a page of curves harder to follow at a
 * glance than a page of straight lines with the occasional crossing, and
 * that's a legitimate call to leave to whoever's building the figure.
 */
export function computeClusterLinkPath(
  aBox: BoxLike,
  bBox: BoxLike,
  obstructingBoxes: BoxLike[],
  parallelIndex: number,
  parallelCount: number,
  style: 'curved' | 'straight' = 'curved'
): ClusterLinkPath {
  const aCenter = { x: aBox.x + aBox.width / 2, y: aBox.y + aBox.height / 2 }
  const bCenter = { x: bBox.x + bBox.width / 2, y: bBox.y + bBox.height / 2 }
  const start = boxExitPoint(aBox, bCenter.x, bCenter.y)
  const end = boxExitPoint(bBox, aCenter.x, aCenter.y)

  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  const midX0 = (start.x + end.x) / 2
  const midY0 = (start.y + end.y) / 2
  // A degenerate (near-zero-length) segment has no meaningful direction to
  // bow away from — draw it straight rather than risk a divide-by-zero.
  // Also always true (never even considers curving) when the board is set
  // to plain straight lines.
  if (length < 1 || style === 'straight') {
    return { ax: start.x, ay: start.y, bx: end.x, by: end.y, midX: midX0, midY: midY0, curved: false, controlX: midX0, controlY: midY0 }
  }
  // Perpendicular unit vector — the axis a curve bows along.
  const px = -dy / length
  const py = dx / length

  let offset = parallelCount > 1 ? (parallelIndex - (parallelCount - 1) / 2) * CLUSTER_LINK_PARALLEL_STEP : 0

  let worstNeeded = 0
  let worstSign = 0
  for (const box of obstructingBoxes) {
    if (!segmentIntersectsBox(start.x, start.y, end.x, end.y, box)) continue
    const centerX = box.x + box.width / 2
    const centerY = box.y + box.height / 2
    // Signed distance of the obstruction's center from the line, along the
    // perpendicular axis — bow to the *opposite* side, away from wherever
    // the obstruction actually sits.
    const proj = (centerX - midX0) * px + (centerY - midY0) * py
    const halfExtent = (box.width + box.height) / 4 // ~ average half-extent, a simple but effective clearing radius
    const needed = Math.abs(proj) + halfExtent + CLUSTER_LINK_OBSTRUCTION_MARGIN
    if (needed > worstNeeded) {
      worstNeeded = needed
      worstSign = proj >= 0 ? -1 : 1
    }
  }
  if (worstNeeded > 0) offset = worstSign * worstNeeded

  if (offset === 0) {
    return { ax: start.x, ay: start.y, bx: end.x, by: end.y, midX: midX0, midY: midY0, curved: false, controlX: midX0, controlY: midY0 }
  }

  const controlX = Math.max(CLUSTER_LINK_MIN_COORD, midX0 + px * offset)
  const controlY = Math.max(CLUSTER_LINK_MIN_COORD, midY0 + py * offset)
  // Midpoint of a quadratic Bézier at t=0.5 is the average of the control
  // point and the straight midpoint (0.25*start + 0.5*control + 0.25*end).
  const midX = 0.5 * midX0 + 0.5 * controlX
  const midY = 0.5 * midY0 + 0.5 * controlY
  return { ax: start.x, ay: start.y, bx: end.x, by: end.y, midX, midY, curved: true, controlX, controlY }
}

export interface ClusterPosition {
  id: string
  x: number
  y: number
  /** Set only by computeTreeLayout, for a node acting as a parent whose
   * own size needs to shrink from "contains its children" down to "just
   * its own content" now that those children are laid out separately —
   * see computeOwnClusterSize. Omitted (and left untouched) everywhere
   * else, including a Tree leaf and every computeRadialLayout position. */
  width?: number
  height?: number
}

/** Writes back a set of computed positions (from computeTreeLayout /
 * computeRadialLayout below) onto the matching BoardClusters — the one
 * place either layout actually touches ProjectData, so the layouts
 * themselves can stay pure geometry. A cluster with no entry in `positions`
 * (not part of this layout pass) is left untouched. A position that also
 * carries width/height (only computeTreeLayout ever sets these — see
 * ClusterPosition) resizes the cluster too; otherwise its existing size is
 * kept exactly as before. */
export function applyClusterPositions(data: ProjectData, positions: ClusterPosition[]): ProjectData {
  const byId = new Map(positions.map((p) => [p.id, p]))
  return {
    ...data,
    boardClusters: data.boardClusters.map((c) => {
      const pos = byId.get(c.id)
      if (!pos) return c
      return {
        ...c,
        x: pos.x,
        y: pos.y,
        width: pos.width ?? c.width,
        height: pos.height ?? c.height
      }
    })
  }
}

/**
 * Same as applyClusterPositions, but also carries each repositioned
 * cluster's member codes/notes/segments *and any nested cluster not itself
 * in `positions`* along with it, by the same delta — the one-click Tree/
 * Radial layouts' equivalent of what a manual cluster drag already does
 * (see BoardView's cluster-move handling, which moves `getClusterMemberItems`
 * alongside the frame). Without this, applying a layout moves a cluster's
 * *frame* but leaves its member cards — and, for Radial specifically,
 * every nested sub-cluster too, since that one only ever repositions roots
 * — sitting at their old position, reading as unlinked even though the
 * underlying membership/nesting never changed.
 *
 * A category not directly in `positions` (true for every nested category
 * under Radial; never true under Tree, which positions all of them)
 * inherits its nearest positioned ancestor's delta, cascading down through
 * however many nesting levels sit in between — the whole subtree moves
 * rigidly together, preserving whatever containment it already had rather
 * than trying to recompute it. A ref (or nested cluster) that's a member
 * of more than one moving category homes on the first one, in
 * `data.categories` order — the same "first membership wins" rule used
 * everywhere else a board can only give a ref one position (see
 * getVisibleBoardItems).
 */
export function applyClusterLayoutWithMembers(
  data: ProjectData,
  boardId: string,
  positions: ClusterPosition[]
): ProjectData {
  const clustersOnBoard = data.boardClusters.filter((c) => c.boardId === boardId)
  const clusterById = new Map(clustersOnBoard.map((c) => [c.id, c]))
  const categoryById = new Map(data.categories.map((c) => [c.id, c]))

  const directDeltaByCategoryId = new Map<string, { dx: number; dy: number }>()
  for (const pos of positions) {
    const cluster = clusterById.get(pos.id)
    if (!cluster) continue
    const dx = pos.x - cluster.x
    const dy = pos.y - cluster.y
    if (dx !== 0 || dy !== 0) directDeltaByCategoryId.set(cluster.categoryId, { dx, dy })
  }

  const resolvedCache = new Map<string, { dx: number; dy: number } | null>()
  function resolveDelta(categoryId: string): { dx: number; dy: number } | null {
    if (resolvedCache.has(categoryId)) return resolvedCache.get(categoryId)!
    resolvedCache.set(categoryId, null) // cycle guard while resolving — see getCategoryDepth's own note on this
    const direct = directDeltaByCategoryId.get(categoryId) ?? null
    const parentId = categoryById.get(categoryId)?.parentCategoryId ?? null
    const resolved = direct ?? (parentId ? resolveDelta(parentId) : null)
    resolvedCache.set(categoryId, resolved)
    return resolved
  }

  const deltaByRefKey = new Map<string, { dx: number; dy: number }>()
  for (const category of data.categories) {
    const delta = resolveDelta(category.id)
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

  const boardClusters = withPositions.boardClusters.map((c) => {
    if (c.boardId !== boardId || directDeltaByCategoryId.has(c.categoryId)) return c
    const delta = resolveDelta(c.categoryId)
    return delta ? { ...c, x: c.x + delta.dx, y: c.y + delta.dy } : c
  })

  const boardItems = withPositions.boardItems.map((item) => {
    if (item.boardId !== boardId) return item
    const delta = deltaByRefKey.get(`${item.refType}:${item.refId}`)
    return delta ? { ...item, x: item.x + delta.dx, y: item.y + delta.dy } : item
  })

  return { ...withPositions, boardClusters, boardItems }
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

/**
 * A "put it back to the nice arrangement" layout for a curated board: every
 * cluster already on the board gets a completely fresh position/size from
 * computeCategoryLayout — the same nesting-aware masonry pack the default
 * board and "+ Add all clusters" both use, where a nested cluster's box is
 * drawn genuinely *inside* its parent's (containment, not a separate row).
 *
 * Unlike Tree/Radial (which only ever move clusters that are already
 * there), this exists specifically to *undo* whatever Tree or Radial (or
 * manual dragging) left behind — there was previously no way back to a
 * contained/nested arrangement once either had run, since neither of them,
 * nor plain dragging, ever restores containment on its own. Every category
 * present on the board gets a position here (root or nested alike, same as
 * Tree), so apply with applyClusterLayoutWithMembers.
 *
 * `compact` (default false) re-sizes everything down to header-only frames
 * as it re-lays them out — see computeCategoryLayout's own `compact`
 * option — so toggling a board's compact/full preference doesn't just
 * change what *future* additions look like, it can also resize whatever's
 * already there on the spot (the boxes' positions get recomputed fresh
 * either way, same as any other call to this function, since a size
 * change without repositioning risks the new size overlapping a neighbor
 * that hasn't moved).
 */
export function computeNestedLayout(
  clusters: BoardCluster[],
  categories: CategoryRecord[],
  compact = false
): ClusterPosition[] {
  const categoryIdsOnBoard = new Set(clusters.map((c) => c.categoryId))
  const categoriesOnBoard = categories.filter((c) => categoryIdsOnBoard.has(c.id))
  const layout = computeCategoryLayout(categoriesOnBoard, new Map(), compact)
  const clusterByCategoryId = new Map(clusters.map((c) => [c.categoryId, c]))
  return layout
    .map((l): ClusterPosition | null => {
      const cluster = clusterByCategoryId.get(l.categoryId)
      if (!cluster) return null
      return { id: cluster.id, x: l.x, y: l.y, width: l.width, height: l.height }
    })
    .filter((p): p is ClusterPosition => p !== null)
}

const TREE_ROW_GAP = 40
const TREE_NODE_GAP = 40

/**
 * A top-down hierarchical-tree arrangement of a board's own clusters,
 * driven by the category hierarchy (parentCategoryId) — a cluster whose
 * parent category isn't *also* on this board is treated as its own root,
 * since there's nothing here to hang it under. Meant for a curated
 * (non-default) board built specifically as a figure — the default board
 * has its own auto-layout (see getVisibleBoardClusters) and isn't a target
 * for this.
 *
 * A node acting as a *parent* here (it has at least one child also on this
 * board) is sized via computeOwnClusterSize — its own header plus its own
 * directly-held codes/notes, ignoring whatever it needed to *contain*
 * those children before. A leaf keeps whatever size it already had. Without
 * this, a category whose only size ever came from containing its children
 * (the very common case: a superordinate theme with no codes of its own,
 * just sub-themes) keeps that same large, now-empty box once Tree pulls its
 * children out into their own row — found via a real exported board, where
 * a childless-of-its-own supercluster stayed hundreds of pixels tall while
 * its actual children sat in a thin strip far beneath it, reading as
 * completely disconnected rather than "arranged as a tree" (a plain
 * connector line, however visible, can't bridge a gap that large and still
 * read as "these belong together"). Positions are still only ever computed
 * fresh here for the clusters passed in; apply with applyClusterPositions,
 * which now also writes back a computed size when one is given.
 *
 * Each depth's row starts below the *tallest effective* node anywhere in
 * the row above it, computed per depth rather than assumed — confirmed
 * against real project data with actual nested, containment-sized parents,
 * not just synthetic same-size fixtures.
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

  // A parent's box for tree-diagram purposes is its own content only —
  // whatever size it needed to contain its children (now laid out
  // separately) no longer applies. A leaf keeps its real, unchanged size.
  const sizeCache = new Map<string, { width: number; height: number }>()
  function effectiveSize(cluster: BoardCluster): { width: number; height: number } {
    const cached = sizeCache.get(cluster.id)
    if (cached) return cached
    const hasChildrenOnBoard = (childrenByParentCategoryId.get(cluster.categoryId)?.length ?? 0) > 0
    const category = categoryById.get(cluster.categoryId)
    const size =
      hasChildrenOnBoard && category
        ? computeOwnClusterSize(category)
        : { width: cluster.width, height: cluster.height }
    sizeCache.set(cluster.id, size)
    return size
  }

  // Tallest node at each depth, across every branch — a shared row Y per
  // depth (not one per branch) keeps sibling subtrees of different shapes
  // visually aligned into the same horizontal rows, same as before.
  const maxHeightByDepth: number[] = []
  function recordHeights(cluster: BoardCluster, depth: number): void {
    maxHeightByDepth[depth] = Math.max(maxHeightByDepth[depth] ?? 0, effectiveSize(cluster).height)
    for (const child of childrenByParentCategoryId.get(cluster.categoryId) ?? []) recordHeights(child, depth + 1)
  }
  for (const root of roots) recordHeights(root, 0)

  const rowY: number[] = [GRID_ORIGIN_Y]
  for (let depth = 1; depth < maxHeightByDepth.length; depth++) {
    rowY[depth] = rowY[depth - 1] + maxHeightByDepth[depth - 1] + TREE_ROW_GAP
  }

  const result: ClusterPosition[] = []

  // Bottom-up: how wide a cluster's whole subtree needs to be so every
  // descendant fits side by side beneath it — a parent with children wider
  // (combined) than itself centers over them rather than the reverse.
  function subtreeWidth(cluster: BoardCluster): number {
    const children = childrenByParentCategoryId.get(cluster.categoryId) ?? []
    const ownWidth = effectiveSize(cluster).width
    if (children.length === 0) return ownWidth
    const childrenWidth =
      children.reduce((sum, child) => sum + subtreeWidth(child), 0) + TREE_NODE_GAP * (children.length - 1)
    return Math.max(ownWidth, childrenWidth)
  }

  // Top-down: places `cluster` centered within the span [left, left +
  // subtreeWidth(cluster)) at its depth's row, then lays out its children
  // left-to-right immediately below, each within its own subtree's span.
  function place(cluster: BoardCluster, left: number, depth: number): void {
    const { width, height } = effectiveSize(cluster)
    const span = subtreeWidth(cluster)
    result.push({ id: cluster.id, x: left + (span - width) / 2, y: rowY[depth], width, height })

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
 * A radial (hub-and-spoke) arrangement: one focus *root* cluster stays put
 * at its current position, every other *root* on the board spreads around
 * it in a single ring at equal angular spacing. `focusCategoryId` picks the
 * hub; if it's not one of `clusters` (or omitted), the first root is used
 * instead so this never errors on a mismatched id. Same pure-geometry/
 * apply-separately contract as computeTreeLayout above — and, like that
 * one, only ever computes positions for roots (a cluster whose parent
 * category isn't also on this board): a nested cluster stays out of the
 * ring entirely, moving only because its ancestor does (see
 * applyClusterLayoutWithMembers, which cascades a root's delta down its
 * whole descendant subtree — clusters and member items alike). Treating
 * nested clusters as independent ring points was the original bug this
 * guards against: it scattered sub-themes into the same ring as their own
 * superordinate, discarding the containment entirely.
 *
 * The ring's radius accounts for satellite size two ways, taking whichever
 * is larger: enough to clear the single *largest* satellite from the focus
 * (so one big satellite — e.g. a superordinate with its own wide nested-
 * children grid — can't overlap the hub), and separately enough that the
 * two largest satellites specifically couldn't overlap *each other* even
 * if equal angular spacing happened to land them right next to each other
 * — the worst case, checked directly via the chord-length between two
 * adjacent ring points, rather than assumed away by equal spacing (equal
 * *angle* doesn't imply equal *physical* spacing once sizes vary a lot).
 */
export function computeRadialLayout(
  clusters: BoardCluster[],
  categories: CategoryRecord[],
  focusCategoryId: string | null
): ClusterPosition[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const categoryIdsOnBoard = new Set(clusters.map((c) => c.categoryId))
  const roots = clusters.filter((c) => {
    const parentCategoryId = categoryById.get(c.categoryId)?.parentCategoryId ?? null
    return !parentCategoryId || !categoryIdsOnBoard.has(parentCategoryId)
  })
  if (roots.length === 0) return []

  const focus = roots.find((c) => c.categoryId === focusCategoryId) ?? roots[0]
  const others = roots.filter((c) => c.id !== focus.id)
  if (others.length === 0) return [{ id: focus.id, x: focus.x, y: focus.y }]

  const centerX = focus.x + focus.width / 2
  const centerY = focus.y + focus.height / 2
  const otherDimensions = others.map((o) => Math.max(o.width, o.height)).sort((a, b) => b - a)
  const radiusClearingLargest = RADIAL_RADIUS_STEP + Math.max(focus.width, focus.height) / 2 + otherDimensions[0] / 2

  // Chord length between two *adjacent* ring points, at angle 2π/N apart,
  // is 2r·sin(π/N) — solved for r so that distance is at least enough to
  // clear the two largest satellites' combined half-widths (+ a gap),
  // covering the worst case where equal spacing happens to seat them right
  // next to each other. Undefined (and unneeded) with only one satellite.
  const angleBetweenAdjacent = others.length >= 2 ? Math.PI / others.length : null
  const radiusClearingAdjacentPair =
    angleBetweenAdjacent && otherDimensions.length >= 2
      ? ((otherDimensions[0] + otherDimensions[1]) / 2 + CLUSTER_GAP) / (2 * Math.sin(angleBetweenAdjacent))
      : 0

  const radius = Math.max(radiusClearingLargest, radiusClearingAdjacentPair)

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
