import { describe, expect, it } from 'vitest'
import {
  addAllClustersToBoard,
  addClusterSubtreeToBoard,
  GRID_ORIGIN_X,
  addAllCodesToBoard,
  addAllNotesToBoard,
  addItemToBoard,
  applyClusterLayoutWithMembers,
  applyClusterPositions,
  assignItemToCluster,
  computeAccommodatingSize,
  computeCategoryLayout,
  type ClusterPosition,
  computeClusterLinkPath,
  computeGridPosition,
  computeNestedLayout,
  computeOwnClusterSize,
  computeRadialLayout,
  computeTreeLayout,
  createBoard,
  createClusterForCategory,
  createClusterWithNewCategory,
  deleteBoard,
  deleteCategoryOnBoard,
  deleteCluster,
  detachClustersFrom,
  ensureClusterShape,
  describeBoardItem,
  findAlignmentSnap,
  findClusterAtPoint,
  findClusterForCategoryOnBoard,
  findClustersEnclosedBy,
  findDistributionSnap,
  findNestTarget,
  findPointerSnapTarget,
  forgetItemPositionIfUnclustered,
  getClusterMemberItems,
  getDefaultBoardId,
  getLinkedGroup,
  getStructuralNestingEdges,
  getVisibleBoardClusters,
  getVisibleBoardItems,
  getVisibleClusterLinks,
  growAncestorClustersToFit,
  growClusterToFitOwnMembers,
  linkItems,
  materializeChildClusters,
  materializeSiblingClusters,
  MEMBER_CARD_HEIGHT,
  MEMBER_CARD_WIDTH,
  moveCluster,
  moveItem,
  reassignRefCategoryMembership,
  removeItemFromBoard,
  renameBoard,
  renestClustersCleanly,
  reparentCategoryOnBoard,
  resetDefaultBoardClusterLayout,
  resolveGroupClusterReassignment,
  resolveItemOverlaps,
  resolveResizeEnclosure,
  resolveResizeExclusion,
  resolveSiblingOverlaps,
  setBoardClusterFrameSize,
  setBoardClusterLinkStyle,
  resizeCluster,
  segmentIntersectsBox,
  unassignItemFromCluster,
  unlinkItems
} from './boardOps'
import { addCodeToCategory, createCategory, reparentCategory } from './categoryOps'
import type { BoardCluster, BoardItem, BoardRecord, CategoryRecord, ClusterLink, CodeNode, ProjectData } from './types'

// --- test fixtures -----------------------------------------------------

function makeCategory(id: string, overrides: Partial<CategoryRecord> = {}): CategoryRecord {
  return {
    id,
    kind: 'theme',
    name: id,
    color: '#fff',
    definition: '',
    codeIds: [],
    noteIds: [],
    segmentIds: [],
    parentCategoryId: null,
    createdAt: '0',
    ...overrides
  }
}

function makeCode(id: string): CodeNode {
  return { id, kind: 'code', name: id, color: '#fff', definition: '', parentId: null, createdAt: '0' }
}

function makeData(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    schemaVersion: 2,
    id: 'p1',
    name: 'Project',
    createdAt: '0',
    updatedAt: '0',
    documents: [],
    segments: [],
    codes: [],
    codings: [],
    notes: [],
    noteCategories: [],
    categories: [],
    boards: [],
    boardItems: [],
    boardClusters: [],
    boardLinks: [],
    clusterLinks: [],
    ...overrides
  } as ProjectData
}

const DEFAULT_BOARD: Pick<BoardRecord, 'id' | 'isDefault'> = { id: 'board1', isDefault: true }
const OTHER_BOARD: Pick<BoardRecord, 'id' | 'isDefault'> = { id: 'board2', isDefault: false }

function rectContains(outer: BoardCluster, inner: BoardCluster): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}
function rectsOverlap(a: BoardCluster, b: BoardCluster): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

// --- describeBoardItem ---------------------------------------------------

describe('describeBoardItem', () => {
  it('describes a code item', () => {
    const data = makeData({ codes: [{ id: 'c1', kind: 'code', name: 'Fear', color: '#111', definition: '', parentId: null, createdAt: '0' }] })
    const item: BoardItem = { id: 'i1', boardId: 'b1', refType: 'code', refId: 'c1', x: 0, y: 0 }
    expect(describeBoardItem(data, item)).toEqual({ label: 'Fear', sublabel: 'code', color: '#111' })
  })

  it('describes a note item, falling back to the answer when there is no question', () => {
    const data = makeData({
      notes: [
        {
          id: 'n1',
          attachedTo: { kind: 'project' },
          question: null,
          answer: 'A fairly long answer that goes on',
          tags: [],
          noteCategoryId: null,
          createdAt: '0',
          updatedAt: '0'
        }
      ]
    })
    const item: BoardItem = { id: 'i1', boardId: 'b1', refType: 'note', refId: 'n1', x: 0, y: 0 }
    expect(describeBoardItem(data, item)?.label).toBe('A fairly long answer that goes on')
  })

  it('returns null for a dangling ref (e.g. the code was deleted)', () => {
    const data = makeData()
    const item: BoardItem = { id: 'i1', boardId: 'b1', refType: 'code', refId: 'missing', x: 0, y: 0 }
    expect(describeBoardItem(data, item)).toBeNull()
  })
})

// --- findClusterAtPoint ---------------------------------------------------

describe('findClusterAtPoint', () => {
  const big: BoardCluster = { id: 'big', boardId: 'b1', categoryId: 'A', x: 0, y: 0, width: 400, height: 400, createdAt: '0' }
  const small: BoardCluster = { id: 'small', boardId: 'b1', categoryId: 'B', x: 100, y: 100, width: 50, height: 50, createdAt: '0' }

  it('returns the smallest containing rect when several overlap', () => {
    expect(findClusterAtPoint([big, small], 110, 110)?.id).toBe('small')
  })

  it('returns the single containing cluster when only one contains the point', () => {
    expect(findClusterAtPoint([big, small], 10, 10)?.id).toBe('big')
  })

  it('returns null when no cluster contains the point', () => {
    expect(findClusterAtPoint([big, small], 1000, 1000)).toBeNull()
  })
})

// --- resolveGroupClusterReassignment ---------------------------------------

describe('resolveGroupClusterReassignment', () => {
  const clusterA: BoardCluster = { id: 'A', boardId: 'b1', categoryId: 'catA', x: 0, y: 0, width: 400, height: 400, createdAt: '0' }
  const clusterB: BoardCluster = { id: 'B', boardId: 'b1', categoryId: 'catB', x: 1000, y: 0, width: 400, height: 400, createdAt: '0' }
  const CARD_W = 180
  const CARD_H = 64

  it('returns null for an empty group', () => {
    expect(resolveGroupClusterReassignment([clusterA, clusterB], {}, new Map(), [], CARD_W, CARD_H)).toBeNull()
  })

  it('a whole group joining a cluster is decided by its topmost (smallest y) member, even when a trailing member spills into a different cluster', () => {
    // top: well inside A both before and after. trailing: its own final
    // position actually lands inside CLUSTER B, not A — a per-member
    // check would put "top" in A and "trailing" in B, splitting one
    // linked group across two different clusters.
    const startPositions = { top: { x: 100, y: 50 }, trailing: { x: 900, y: 300 } }
    const finalPositions = new Map([
      ['top', { x: 120, y: 60 }],
      ['trailing', { x: 920, y: 310 }] // center (1010, 342) falls inside B, not A
    ])
    const result = resolveGroupClusterReassignment(
      [clusterA, clusterB],
      startPositions,
      finalPositions,
      ['top', 'trailing'],
      CARD_W,
      CARD_H
    )
    expect(result?.oldCluster?.id).toBe('A')
    expect(result?.newCluster?.id).toBe('A')
  })

  it('a group leaving a cluster is decided by the same reference member on both sides', () => {
    const startPositions = { top: { x: 100, y: 50 } }
    const finalPositions = new Map([['top', { x: 1100, y: 50 }]])
    const result = resolveGroupClusterReassignment([clusterA, clusterB], startPositions, finalPositions, ['top'], CARD_W, CARD_H)
    expect(result?.oldCluster?.id).toBe('A')
    expect(result?.newCluster?.id).toBe('B')
  })

  it('no change reported when the reference member starts and ends in the same cluster', () => {
    const startPositions = { top: { x: 100, y: 50 } }
    const finalPositions = new Map([['top', { x: 150, y: 80 }]])
    const result = resolveGroupClusterReassignment([clusterA, clusterB], startPositions, finalPositions, ['top'], CARD_W, CARD_H)
    expect(result?.oldCluster?.id).toBe(result?.newCluster?.id)
  })
})

// --- computeAccommodatingSize ---------------------------------------------

describe('computeAccommodatingSize', () => {
  const parent = { x: 100, y: 100, width: 280, height: 200 }

  it('does not grow when the child already fits', () => {
    const child = { x: 150, y: 150, width: 100, height: 50 }
    expect(computeAccommodatingSize(parent, child, 20)).toEqual({ width: 280, height: 200 })
  })

  it('grows width only when the child pokes out the right edge', () => {
    const child = { x: 300, y: 150, width: 150, height: 50 }
    expect(computeAccommodatingSize(parent, child, 20)).toEqual({ width: 370, height: 200 })
  })

  it('grows height only when the child pokes out the bottom edge', () => {
    const child = { x: 150, y: 250, width: 50, height: 150 }
    expect(computeAccommodatingSize(parent, child, 20)).toEqual({ width: 280, height: 320 })
  })

  it('grows both dimensions when the child pokes out both edges', () => {
    const child = { x: 320, y: 280, width: 100, height: 100 }
    const size = computeAccommodatingSize(parent, child, 20)
    expect(size).toEqual({ width: 340, height: 300 })
  })

  it('never shrinks below the parent current size for a tiny child', () => {
    const tinyChild = { x: 110, y: 110, width: 10, height: 10 }
    expect(computeAccommodatingSize(parent, tinyChild, 20)).toEqual({ width: 280, height: 200 })
  })

  it('does NOT accommodate a child poking out the top/left — documented trade-off', () => {
    const childPokesLeft = { x: 50, y: 150, width: 40, height: 50 }
    expect(computeAccommodatingSize(parent, childPokesLeft, 20)).toEqual({ width: 280, height: 200 })
  })
})

// --- findClustersEnclosedBy ------------------------------------------------

describe('findClustersEnclosedBy', () => {
  const box = { x: 0, y: 0, width: 400, height: 400 }
  const inside: BoardCluster = { id: 'inside', boardId: 'b1', categoryId: 'A', x: 50, y: 50, width: 100, height: 100, createdAt: '0' }
  const partiallyOut: BoardCluster = { id: 'partial', boardId: 'b1', categoryId: 'B', x: 350, y: 50, width: 100, height: 100, createdAt: '0' }
  const fullyOutside: BoardCluster = { id: 'outside', boardId: 'b1', categoryId: 'C', x: 500, y: 500, width: 50, height: 50, createdAt: '0' }

  it('only includes clusters entirely inside the box, not ones merely overlapping it', () => {
    const result = findClustersEnclosedBy([inside, partiallyOut, fullyOutside], box, new Set())
    expect(result.map((c) => c.id)).toEqual(['inside'])
  })

  it('excludes categories in excludeCategoryIds even if geometrically enclosed', () => {
    const result = findClustersEnclosedBy([inside, partiallyOut, fullyOutside], box, new Set(['A']))
    expect(result).toEqual([])
  })

  it('a cluster exactly matching the box counts as enclosed (inclusive bounds)', () => {
    const exact: BoardCluster = { id: 'exact', boardId: 'b1', categoryId: 'D', x: 0, y: 0, width: 400, height: 400, createdAt: '0' }
    expect(findClustersEnclosedBy([exact], box, new Set()).map((c) => c.id)).toEqual(['exact'])
  })
})

// --- Boards ---------------------------------------------------------------

describe('board CRUD', () => {
  it('getDefaultBoardId prefers the flagged default, then the first board, then null', () => {
    expect(getDefaultBoardId([{ id: 'a', name: 'A', isDefault: false }, { id: 'b', name: 'B', isDefault: true }])).toBe('b')
    expect(getDefaultBoardId([{ id: 'a', name: 'A', isDefault: false }])).toBe('a')
    expect(getDefaultBoardId([])).toBeNull()
  })

  it('createBoard adds a non-default board', () => {
    const { data, boardId } = createBoard(makeData(), 'New board')
    expect(data.boards).toHaveLength(1)
    expect(data.boards[0].isDefault).toBe(false)
    expect(data.boards[0].id).toBe(boardId)
  })

  it('renameBoard only touches the target board', () => {
    const data = makeData({ boards: [{ id: 'a', name: 'A', isDefault: true }, { id: 'b', name: 'B', isDefault: false }] })
    const next = renameBoard(data, 'b', 'Renamed')
    expect(next.boards.find((x) => x.id === 'a')?.name).toBe('A')
    expect(next.boards.find((x) => x.id === 'b')?.name).toBe('Renamed')
  })

  it('setBoardClusterLinkStyle only touches the target board', () => {
    const data = makeData({ boards: [{ id: 'a', name: 'A', isDefault: true }, { id: 'b', name: 'B', isDefault: false }] })
    const next = setBoardClusterLinkStyle(data, 'b', 'straight')
    expect(next.boards.find((x) => x.id === 'a')?.clusterLinkStyle).toBeUndefined()
    expect(next.boards.find((x) => x.id === 'b')?.clusterLinkStyle).toBe('straight')
  })

  it('setBoardClusterFrameSize only touches the target board', () => {
    const data = makeData({ boards: [{ id: 'a', name: 'A', isDefault: true }, { id: 'b', name: 'B', isDefault: false }] })
    const next = setBoardClusterFrameSize(data, 'b', 'compact')
    expect(next.boards.find((x) => x.id === 'a')?.clusterFrameSize).toBeUndefined()
    expect(next.boards.find((x) => x.id === 'b')?.clusterFrameSize).toBe('compact')
  })

  it('deleteBoard removes the board and everything placed on it, leaving other boards alone', () => {
    const data = makeData({
      boards: [{ id: 'a', name: 'A', isDefault: false }, { id: 'b', name: 'B', isDefault: false }],
      boardItems: [
        { id: 'i1', boardId: 'a', refType: 'code', refId: 'c1', x: 0, y: 0 },
        { id: 'i2', boardId: 'b', refType: 'code', refId: 'c1', x: 0, y: 0 }
      ],
      boardClusters: [{ id: 'cl1', boardId: 'a', categoryId: 'A', x: 0, y: 0, width: 1, height: 1, createdAt: '0' }],
      boardLinks: [{ id: 'l1', boardId: 'a', itemAId: 'i1', itemBId: 'i2', createdAt: '0' }]
    })
    const next = deleteBoard(data, 'a')
    expect(next.boards.map((b) => b.id)).toEqual(['b'])
    expect(next.boardItems.map((i) => i.id)).toEqual(['i2'])
    expect(next.boardClusters).toHaveLength(0)
    expect(next.boardLinks).toHaveLength(0)
  })

  it('deleteBoard promotes another board to default if the default board is removed', () => {
    const data = makeData({
      boards: [{ id: 'a', name: 'A', isDefault: true }, { id: 'b', name: 'B', isDefault: false }]
    })
    const next = deleteBoard(data, 'a')
    expect(next.boards).toEqual([{ id: 'b', name: 'B', isDefault: true }])
  })

  it('deleteBoard leaves no boards, and no crash, when the only board is deleted', () => {
    const data = makeData({ boards: [{ id: 'a', name: 'A', isDefault: true }] })
    expect(deleteBoard(data, 'a').boards).toHaveLength(0)
  })
})

// --- Items ------------------------------------------------------------

describe('addItemToBoard / moveItem / removeItemFromBoard', () => {
  it('adds a new item and returns its id', () => {
    const { data, itemId } = addItemToBoard(makeData(), 'b1', 'code', 'c1', 10, 20)
    expect(data.boardItems).toHaveLength(1)
    expect(data.boardItems[0]).toEqual({ id: itemId, boardId: 'b1', refType: 'code', refId: 'c1', x: 10, y: 20 })
  })

  it('no-ops (returns the existing id) if that ref is already on the board', () => {
    const first = addItemToBoard(makeData(), 'b1', 'code', 'c1', 10, 20)
    const second = addItemToBoard(first.data, 'b1', 'code', 'c1', 999, 999)
    expect(second.itemId).toBe(first.itemId)
    expect(second.data.boardItems).toHaveLength(1)
    expect(second.data.boardItems[0].x).toBe(10) // unchanged, not moved to 999
  })

  it('the same ref can exist independently on two different boards', () => {
    const first = addItemToBoard(makeData(), 'b1', 'code', 'c1', 10, 20)
    const second = addItemToBoard(first.data, 'b2', 'code', 'c1', 30, 40)
    expect(second.data.boardItems).toHaveLength(2)
  })

  it('moveItem updates only the targeted item', () => {
    const data = makeData({
      boardItems: [
        { id: 'i1', boardId: 'b1', refType: 'code', refId: 'c1', x: 0, y: 0 },
        { id: 'i2', boardId: 'b1', refType: 'code', refId: 'c2', x: 5, y: 5 }
      ]
    })
    const next = moveItem(data, 'i1', 100, 200)
    expect(next.boardItems.find((i) => i.id === 'i1')).toMatchObject({ x: 100, y: 200 })
    expect(next.boardItems.find((i) => i.id === 'i2')).toMatchObject({ x: 5, y: 5 })
  })

  it('moveItem on a virtual (never-materialized) id is a silent no-op — this is exactly the bug class fixed earlier in cluster-drag and item-drag: callers must materialize first', () => {
    const data = makeData()
    const next = moveItem(data, 'virtual:code:whatever', 1, 1)
    expect(next.boardItems).toHaveLength(0)
  })

  it('removeItemFromBoard also removes any links referencing it', () => {
    const data = makeData({
      boardItems: [
        { id: 'i1', boardId: 'b1', refType: 'code', refId: 'c1', x: 0, y: 0 },
        { id: 'i2', boardId: 'b1', refType: 'code', refId: 'c2', x: 0, y: 0 }
      ],
      boardLinks: [{ id: 'l1', boardId: 'b1', itemAId: 'i1', itemBId: 'i2', createdAt: '0' }]
    })
    const next = removeItemFromBoard(data, 'i1')
    expect(next.boardItems.map((i) => i.id)).toEqual(['i2'])
    expect(next.boardLinks).toHaveLength(0)
  })
})

// --- computeGridPosition ------------------------------------------------

describe('computeGridPosition', () => {
  it('lays out items in an 8-column grid from the default origin', () => {
    expect(computeGridPosition(0)).toEqual({ x: 40, y: 40 })
    expect(computeGridPosition(1)).toEqual({ x: 240, y: 40 })
    expect(computeGridPosition(8)).toEqual({ x: 40, y: 130 }) // wraps to the next row
  })

  it('accepts a custom originY to shift the whole grid down', () => {
    expect(computeGridPosition(0, 500)).toEqual({ x: 40, y: 500 })
  })
})

// --- getVisibleBoardClusters (recursive nested layout) --------------------

describe('getVisibleBoardClusters', () => {
  it('non-default boards only ever show explicitly-placed clusters', () => {
    const explicit: BoardCluster[] = [{ id: 'c1', boardId: 'board2', categoryId: 'A', x: 1, y: 1, width: 1, height: 1, createdAt: '0' }]
    expect(getVisibleBoardClusters(OTHER_BOARD, explicit, [makeCategory('A'), makeCategory('B')])).toEqual(explicit)
  })

  it('the default board auto-shows every category with no explicit shape yet', () => {
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], [makeCategory('A'), makeCategory('B')])
    expect(clusters).toHaveLength(2)
    expect(clusters.every((c) => c.id.startsWith('virtual:'))).toBe(true)
  })

  it('sibling root clusters never overlap, even with very different member counts', () => {
    const tall = makeCategory('big', { codeIds: ['c1', 'c2', 'c3', 'c4', 'c5'] })
    const small = makeCategory('small')
    const [a, b] = getVisibleBoardClusters(DEFAULT_BOARD, [], [tall, small])
    expect(rectsOverlap(a, b)).toBe(false)
  })

  it('a nested cluster is placed fully inside its real parent, below the header', () => {
    const parent = makeCategory('A', { codeIds: ['c1'] })
    const child = makeCategory('B', { parentCategoryId: 'A', codeIds: ['c2'] })
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], [parent, child])
    const a = clusters.find((c) => c.categoryId === 'A')!
    const b = clusters.find((c) => c.categoryId === 'B')!
    expect(rectContains(a, b)).toBe(true)
    expect(b.y).toBeGreaterThan(a.y + 28)
  })

  it("the parent's height grows to fit a nested child", () => {
    const [aAlone] = getVisibleBoardClusters(DEFAULT_BOARD, [], [makeCategory('A')])
    const parent = makeCategory('A')
    const child = makeCategory('B', { parentCategoryId: 'A' })
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], [parent, child])
    const aWithChild = clusters.find((c) => c.categoryId === 'A')!
    expect(aWithChild.height).toBeGreaterThan(aAlone.height)
  })

  it('three levels of nesting all transitively contain each other', () => {
    const root = makeCategory('A')
    const child = makeCategory('B', { parentCategoryId: 'A' })
    const grandchild = makeCategory('C', { parentCategoryId: 'B' })
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], [root, child, grandchild])
    const a = clusters.find((c) => c.categoryId === 'A')!
    const b = clusters.find((c) => c.categoryId === 'B')!
    const c = clusters.find((c) => c.categoryId === 'C')!
    expect(rectContains(a, b)).toBe(true)
    expect(rectContains(b, c)).toBe(true)
    expect(rectContains(a, c)).toBe(true)
  })

  it('sibling nested children of the same parent never overlap each other', () => {
    const root = makeCategory('A')
    const child1 = makeCategory('B', { parentCategoryId: 'A', codeIds: ['c1', 'c2', 'c3'] })
    const child2 = makeCategory('C', { parentCategoryId: 'A' })
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], [root, child1, child2])
    const b = clusters.find((c) => c.categoryId === 'B')!
    const c = clusters.find((c) => c.categoryId === 'C')!
    expect(rectsOverlap(b, c)).toBe(false)
  })

  it("a superordinate's children are packed into a grid (multiple columns), not a single column", () => {
    const root = makeCategory('A')
    const children = Array.from({ length: 6 }, (_, i) => makeCategory(`c${i}`, { parentCategoryId: 'A' }))
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], [root, ...children])
    const kids = clusters.filter((c) => c.categoryId !== 'A')
    expect(kids).toHaveLength(6)
    const distinctX = new Set(kids.map((c) => c.x))
    // 6 children -> ceil(sqrt(6)) = 3 columns.
    expect(distinctX.size).toBe(3)
    // Still all fully inside the parent, still never overlapping each other.
    const parent = clusters.find((c) => c.categoryId === 'A')!
    for (const kid of kids) expect(rectContains(parent, kid)).toBe(true)
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        expect(rectsOverlap(kids[i], kids[j])).toBe(false)
      }
    }
  })

  it("a superordinate's box widens to fit a grid of several children, not just its own single-column width", () => {
    const root = makeCategory('A')
    const singleChild = [makeCategory('only', { parentCategoryId: 'A' })]
    const [aWithOne] = getVisibleBoardClusters(DEFAULT_BOARD, [], [root, ...singleChild])

    const root2 = makeCategory('A')
    const manyChildren = Array.from({ length: 9 }, (_, i) => makeCategory(`c${i}`, { parentCategoryId: 'A' }))
    const clusters2 = getVisibleBoardClusters(DEFAULT_BOARD, [], [root2, ...manyChildren])
    const aWithMany = clusters2.find((c) => c.categoryId === 'A')!

    expect(aWithMany.width).toBeGreaterThan(aWithOne.width)
  })

  it('a cluster with many members grows shorter/wider (a grid) than the same count stacked in one column would need', () => {
    const fewCodes = makeCategory('few', { codeIds: ['c1', 'c2'] })
    const [fewBox] = getVisibleBoardClusters(DEFAULT_BOARD, [], [fewCodes])

    const manyCodeIds = Array.from({ length: 12 }, (_, i) => `c${i}`)
    const manyCodes = makeCategory('many', { codeIds: manyCodeIds })
    const [manyBox] = getVisibleBoardClusters(DEFAULT_BOARD, [], [manyCodes])

    // 12 members -> ceil(sqrt(12)) = 4 columns, 3 rows -> much wider than
    // the default, and nowhere near as tall as 12 stacked rows would be.
    expect(manyBox.width).toBeGreaterThan(fewBox.width)
    const singleColumnHeight = 28 + 20 * 2 + 12 * 72 // header + padding*2 + 12 * (card height + gap)
    expect(manyBox.height).toBeLessThan(singleColumnHeight)
  })

  it('an explicit parent keeps its own stored shape, and a virtual child still anchors to it', () => {
    const parent = makeCategory('A')
    const child = makeCategory('B', { parentCategoryId: 'A' })
    const explicitParent: BoardCluster = { id: 'realA', boardId: DEFAULT_BOARD.id, categoryId: 'A', x: 900, y: 500, width: 400, height: 300, createdAt: '0' }
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [explicitParent], [parent, child])
    const a = clusters.find((c) => c.categoryId === 'A')!
    const b = clusters.find((c) => c.categoryId === 'B')!
    expect(a.id).toBe('realA')
    expect(rectContains(a, b)).toBe(true)
  })

  it('an explicit cluster mixed with a virtual sibling never gets overlapped', () => {
    const categories = [makeCategory('first'), makeCategory('second')]
    const explicit: BoardCluster[] = [{ id: 'real1', boardId: DEFAULT_BOARD.id, categoryId: 'first', x: 40, y: 40, width: 280, height: 500, createdAt: '0' }]
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, explicit, categories)
    const first = clusters.find((c) => c.categoryId === 'first')!
    const second = clusters.find((c) => c.categoryId === 'second')!
    expect(first.id).toBe('real1')
    expect(rectsOverlap(first, second)).toBe(false)
  })

  it('a later root cluster clears an earlier root\'s tall nested subtree', () => {
    const root1 = makeCategory('A')
    const nestedChild = makeCategory('B', { parentCategoryId: 'A', codeIds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] })
    const root2 = makeCategory('C')
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], [root1, nestedChild, root2])
    const a = clusters.find((c) => c.categoryId === 'A')!
    const c = clusters.find((c) => c.categoryId === 'C')!
    expect(rectsOverlap(a, c)).toBe(false)
  })

  it('a fully-cyclic pair (unreachable from any root, given the single-parentCategoryId data model) safely yields zero clusters instead of hanging', () => {
    const x = makeCategory('X', { parentCategoryId: 'Y' })
    const y = makeCategory('Y', { parentCategoryId: 'X' })
    expect(() => getVisibleBoardClusters(DEFAULT_BOARD, [], [x, y])).not.toThrow()
    expect(getVisibleBoardClusters(DEFAULT_BOARD, [], [x, y])).toHaveLength(0)
  })

  it('a long legitimate chain places every level, with no artificial depth cap truncating it', () => {
    const chain: CategoryRecord[] = []
    let parentId: string | null = null
    for (let i = 0; i < 15; i++) {
      chain.push(makeCategory(`n${i}`, { parentCategoryId: parentId }))
      parentId = `n${i}`
    }
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], chain)
    expect(clusters).toHaveLength(15)
    const first = clusters.find((c) => c.categoryId === 'n0')!
    const last = clusters.find((c) => c.categoryId === 'n14')!
    expect(rectContains(first, last)).toBe(true)
  })

  it('root clusters are packed into a multi-column grid, not a single column', () => {
    const roots = Array.from({ length: 5 }, (_, i) => makeCategory(`r${i}`))
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], roots)
    const distinctX = new Set(clusters.map((c) => c.x))
    // 5 roots -> ceil(sqrt(5)) = 3 columns, not one.
    expect(distinctX.size).toBe(3)
  })

  it('a large flat set of root clusters still never overlaps, regardless of column packing', () => {
    const roots = Array.from({ length: 40 }, (_, i) =>
      makeCategory(`r${i}`, { codeIds: i % 3 === 0 ? ['a', 'b', 'c', 'd'] : [] })
    )
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], roots)
    expect(clusters).toHaveLength(40)
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        expect(rectsOverlap(clusters[i], clusters[j])).toBe(false)
      }
    }
  })

  it('root column count is capped, never producing an unreasonably wide grid', () => {
    const roots = Array.from({ length: 100 }, (_, i) => makeCategory(`r${i}`))
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], roots)
    const distinctX = new Set(clusters.map((c) => c.x))
    expect(distinctX.size).toBeLessThanOrEqual(6)
  })

  it('a single root cluster still gets one column (no pointless empty columns)', () => {
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], [makeCategory('solo')])
    expect(clusters).toHaveLength(1)
  })

  // Documents the root cause behind materializeSiblingClusters below:
  // pinning ONE root category's shape changes where an entirely untouched
  // SIBLING's own auto-computed position lands, purely because the
  // masonry-packing algorithm's running column-bottom bookkeeping depends
  // on every category processed before it in the same pass. Reported as
  // "resizing/moving one cluster, a different, unrelated cluster jumps and
  // lands overlapping a third one." Needs 3 roots packed into 2 columns
  // (not 2 roots, which would each just get their own column and never
  // interact) so growing the first one changes which column is shortest
  // by the time the third one is placed.
  it('pinning one root category shape moves an untouched sibling\'s own auto-computed position', () => {
    const a = makeCategory('a')
    const b = makeCategory('b')
    const c = makeCategory('c')
    const before = getVisibleBoardClusters(DEFAULT_BOARD, [], [a, b, c])
    const aBefore = before.find((cl) => cl.categoryId === 'a')!
    const cBefore = before.find((cl) => cl.categoryId === 'c')!

    // "a" gets resized/pinned much taller than the auto-layout ever had it
    // — same shape "materialize on first touch" would create, just with a
    // different (bigger) height, like an actual user resize.
    const pinnedA: BoardCluster = { id: 'realA', boardId: DEFAULT_BOARD.id, categoryId: 'a', x: aBefore.x, y: aBefore.y, width: aBefore.width, height: 900, createdAt: '0' }
    const after = getVisibleBoardClusters(DEFAULT_BOARD, [pinnedA], [a, b, c])
    const cAfter = after.find((cl) => cl.categoryId === 'c')!

    expect(cAfter).not.toEqual(cBefore)
  })
})

describe('materializeSiblingClusters', () => {
  it('gives every still-virtual sibling of categoryId a real, pinned shape at its current computed position', () => {
    const data = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [makeCategory('A'), makeCategory('B'), makeCategory('C')]
    })
    const before = getVisibleBoardClusters(DEFAULT_BOARD, [], data.categories)
    const bBefore = before.find((c) => c.categoryId === 'B')!
    const cBefore = before.find((c) => c.categoryId === 'C')!

    const next = materializeSiblingClusters(data, 'board1', 'A')
    const explicitB = next.boardClusters.find((c) => c.categoryId === 'B')!
    const explicitC = next.boardClusters.find((c) => c.categoryId === 'C')!
    expect(explicitB).toBeDefined()
    expect(explicitC).toBeDefined()
    expect({ x: explicitB.x, y: explicitB.y, width: explicitB.width, height: explicitB.height }).toEqual({
      x: bBefore.x,
      y: bBefore.y,
      width: bBefore.width,
      height: bBefore.height
    })
    expect({ x: explicitC.x, y: explicitC.y, width: explicitC.width, height: explicitC.height }).toEqual({
      x: cBefore.x,
      y: cBefore.y,
      width: cBefore.width,
      height: cBefore.height
    })
    // categoryId itself is NOT the caller's job here — this function only
    // freezes the *other* siblings.
    expect(next.boardClusters.find((c) => c.categoryId === 'A')).toBeUndefined()
  })

  it('a subsequent resize of a materialized sibling no longer affects any of the others', () => {
    const data = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [makeCategory('A'), makeCategory('B'), makeCategory('C')]
    })
    const stabilized = materializeSiblingClusters(data, 'board1', 'A')
    const bBefore = getVisibleBoardClusters(DEFAULT_BOARD, stabilized.boardClusters, stabilized.categories).find(
      (c) => c.categoryId === 'B'
    )!

    // Now A itself gets materialized (as the caller would) and resized much larger.
    const aBox = getVisibleBoardClusters(DEFAULT_BOARD, stabilized.boardClusters, stabilized.categories).find(
      (c) => c.categoryId === 'A'
    )!
    const withA = createClusterForCategory(stabilized, {
      boardId: 'board1',
      categoryId: 'A',
      x: aBox.x,
      y: aBox.y,
      width: aBox.width,
      height: aBox.height
    }).data
    const aCluster = withA.boardClusters.find((c) => c.categoryId === 'A')!
    const resized = resizeCluster(withA, aCluster.id, aBox.width, 900)

    const bAfter = getVisibleBoardClusters(DEFAULT_BOARD, resized.boardClusters, resized.categories).find(
      (c) => c.categoryId === 'B'
    )!
    expect(bAfter).toEqual(bBefore)
  })

  it('is a no-op when the category has no siblings', () => {
    const data = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [makeCategory('A')]
    })
    const next = materializeSiblingClusters(data, 'board1', 'A')
    expect(next.boardClusters).toEqual([])
  })

  it('leaves an already-explicit sibling untouched', () => {
    const already: BoardCluster = { id: 'existingB', boardId: 'board1', categoryId: 'B', x: 5, y: 5, width: 10, height: 10, createdAt: '0' }
    const data = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [makeCategory('A'), makeCategory('B')],
      boardClusters: [already]
    })
    const next = materializeSiblingClusters(data, 'board1', 'A')
    expect(next.boardClusters).toEqual([already])
  })
})

describe('growClusterToFitOwnMembers', () => {
  it('grows an already-explicit cluster that is too small for its current membership', () => {
    const category = makeCategory('A', { codeIds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] })
    const tooSmall: BoardCluster = { id: 'realA', boardId: 'board1', categoryId: 'A', x: 0, y: 0, width: 280, height: 200, createdAt: '0' }
    const data = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [category],
      boardClusters: [tooSmall]
    })
    const next = growClusterToFitOwnMembers(data, 'board1', 'A')
    // Nothing is written back (the stored size is the user's floor) — the
    // *shown* box is what holds every card.
    expect(next.boardClusters.find((c) => c.categoryId === 'A')).toEqual(tooSmall)
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, next.boardClusters, next.categories)
    const shown = clusters.find((c) => c.categoryId === 'A')!
    expect(shown.height).toBeGreaterThan(tooSmall.height)
    const items = getVisibleBoardItems(DEFAULT_BOARD, [], category.codeIds.map((id) => ({ id })), [], next.categories, clusters)
    for (const item of items) {
      expect(rectContains(shown, { ...shown, x: item.x, y: item.y, width: MEMBER_CARD_WIDTH, height: MEMBER_CARD_HEIGHT })).toBe(true)
    }
  })

  it('is a no-op for a still-virtual cluster — its live-computed size already matches its own membership', () => {
    // A virtual cluster's size is computeOwnClusterSize(category) on every
    // render, same formula this function's own "needed" size uses — so by
    // construction it can never be behind its own membership; only an
    // EXPLICIT (already frozen-size) cluster whose membership grew after
    // it was pinned can actually need growing.
    const category = makeCategory('A', { codeIds: Array.from({ length: 20 }, (_, i) => `c${i}`) })
    const data = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [category]
    })
    const next = growClusterToFitOwnMembers(data, 'board1', 'A')
    expect(next).toBe(data)
  })

  it('never shrinks an already-roomy box', () => {
    const category = makeCategory('A', { codeIds: ['c1'] })
    const roomy: BoardCluster = { id: 'realA', boardId: 'board1', categoryId: 'A', x: 0, y: 0, width: 900, height: 900, createdAt: '0' }
    const data = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [category],
      boardClusters: [roomy]
    })
    const next = growClusterToFitOwnMembers(data, 'board1', 'A')
    expect(next).toBe(data) // no-op: same reference, not just same values
  })

  // Regression: growing a nested cluster to fit a dropped code repacked its
  // still-virtual siblings around the bigger box — right out past the
  // superordinate's frozen edge — and only the grown cluster itself ever
  // got the superordinate grown for it. Reported as: after a drag between
  // clusters, the superordinate grew in one direction only, and two of
  // its clusters ended up outside it with connector lines back to it.
  it("keeps a superordinate containing its other, untouched children after one of them grows", () => {
    const so = makeCategory('SO')
    const d = makeCategory('D', { parentCategoryId: 'SO', codeIds: Array.from({ length: 12 }, (_, i) => `c${i}`) })
    const e = makeCategory('E', { parentCategoryId: 'SO' })
    const f = makeCategory('F', { parentCategoryId: 'SO' })
    const soBox: BoardCluster = { id: 'realSO', boardId: 'b1', categoryId: 'SO', x: 0, y: 0, width: 700, height: 600, createdAt: '0' }
    const dBox: BoardCluster = { id: 'realD', boardId: 'b1', categoryId: 'D', x: 20, y: 48, width: 280, height: 200, createdAt: '0' }
    const board = { id: 'b1', name: 'Main', isDefault: true }
    const data = makeData({
      boards: [board],
      categories: [so, d, e, f],
      codes: Array.from({ length: 12 }, (_, i) => makeCode(`c${i}`)),
      boardClusters: [soBox, dBox]
    })

    let next = growClusterToFitOwnMembers(data, 'b1', 'D')
    next = growAncestorClustersToFit(next, 'b1', 'D')

    const visible = getVisibleBoardClusters(board, next.boardClusters, next.categories)
    const soAfter = visible.find((c) => c.categoryId === 'SO')!
    for (const id of ['D', 'E', 'F']) {
      expect(rectContains(soAfter, visible.find((c) => c.categoryId === id)!)).toBe(true)
    }
    for (const a of ['D', 'E', 'F']) {
      for (const b of ['D', 'E', 'F']) {
        if (a < b) expect(rectsOverlap(visible.find((c) => c.categoryId === a)!, visible.find((c) => c.categoryId === b)!)).toBe(false)
      }
    }
  })
})

describe('growAncestorClustersToFit', () => {
  it("grows a parent whose child no longer fits inside it", () => {
    const parent = makeCategory('A')
    const child = makeCategory('B', { parentCategoryId: 'A' })
    const data = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [parent, child]
    })
    const before = getVisibleBoardClusters(DEFAULT_BOARD, [], data.categories)
    const parentBefore = before.find((c) => c.categoryId === 'A')!
    const childBefore = before.find((c) => c.categoryId === 'B')!

    // Materialize the child, resized much larger — as a manual resize would.
    const withChild = createClusterForCategory(data, {
      boardId: 'board1',
      categoryId: 'B',
      x: childBefore.x,
      y: childBefore.y,
      width: childBefore.width,
      height: childBefore.height
    }).data
    const childCluster = withChild.boardClusters.find((c) => c.categoryId === 'B')!
    const resized = resizeCluster(withChild, childCluster.id, 900, 900)

    const next = growAncestorClustersToFit(resized, 'board1', 'B')
    // The parent is shown grown around its bigger child (a box is never
    // smaller than its contents), whether or not it has a stored shape.
    const visible = getVisibleBoardClusters(DEFAULT_BOARD, next.boardClusters, next.categories)
    const grownParent = visible.find((c) => c.categoryId === 'A')!
    expect(grownParent.width).toBeGreaterThan(parentBefore.width)
    expect(rectContains(grownParent, visible.find((c) => c.categoryId === 'B')!)).toBe(true)
  })

  it("clears the root's free-placed neighbors out of a grown superordinate's way", () => {
    const parent = makeCategory('A')
    const child = makeCategory('B', { parentCategoryId: 'A' })
    const neighbor = makeCategory('N')
    const smallParent: BoardCluster = { id: 'realA', boardId: 'board1', categoryId: 'A', x: 0, y: 0, width: 300, height: 300, createdAt: '0' }
    const bigChild: BoardCluster = { id: 'realB', boardId: 'board1', categoryId: 'B', x: 0, y: 0, width: 900, height: 900, createdAt: '0' }
    const neighborBox: BoardCluster = { id: 'realN', boardId: 'board1', categoryId: 'N', x: 350, y: 0, width: 280, height: 200, createdAt: '0' }
    const data = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [parent, child, neighbor],
      boardClusters: [smallParent, bigChild, neighborBox]
    })

    const next = growAncestorClustersToFit(data, 'board1', 'B')

    const visible = getVisibleBoardClusters(DEFAULT_BOARD, next.boardClusters, next.categories)
    expect(rectsOverlap(visible.find((c) => c.categoryId === 'A')!, visible.find((c) => c.categoryId === 'N')!)).toBe(false)
  })

  it('grows transitively up a three-level chain', () => {
    const root = makeCategory('A')
    const mid = makeCategory('B', { parentCategoryId: 'A' })
    const leaf = makeCategory('C', { parentCategoryId: 'B' })
    const data = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [root, mid, leaf]
    })
    const before = getVisibleBoardClusters(DEFAULT_BOARD, [], data.categories)
    const leafBefore = before.find((c) => c.categoryId === 'C')!
    const rootBefore = before.find((c) => c.categoryId === 'A')!

    const withLeaf = createClusterForCategory(data, {
      boardId: 'board1',
      categoryId: 'C',
      x: leafBefore.x,
      y: leafBefore.y,
      width: leafBefore.width,
      height: leafBefore.height
    }).data
    const leafCluster = withLeaf.boardClusters.find((c) => c.categoryId === 'C')!
    const resized = resizeCluster(withLeaf, leafCluster.id, 700, 700)

    const next = growAncestorClustersToFit(resized, 'board1', 'C')
    const visible = getVisibleBoardClusters(DEFAULT_BOARD, next.boardClusters, next.categories)
    const grownRoot = visible.find((c) => c.categoryId === 'A')!
    expect(grownRoot.width).toBeGreaterThan(rootBefore.width)
    expect(rectContains(grownRoot, visible.find((c) => c.categoryId === 'B')!)).toBe(true)
    expect(rectContains(visible.find((c) => c.categoryId === 'B')!, visible.find((c) => c.categoryId === 'C')!)).toBe(true)
  })

  it('is a no-op for a root category with no parent', () => {
    const data = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [makeCategory('A')]
    })
    const next = growAncestorClustersToFit(data, 'board1', 'A')
    expect(next).toBe(data)
  })

  it('is a no-op when the parent already has (generously) enough room', () => {
    const parent = makeCategory('A')
    const child = makeCategory('B', { parentCategoryId: 'A' })
    // Deliberately explicit and much bigger than anything a child could
    // need, rather than relying on a fresh computeCategoryLayout's own
    // tightly-fitted size — computeAccommodatingSize's padding convention
    // doesn't byte-for-byte match computeCategoryLayout's own nested-child
    // sizing (see growAncestorClustersToFit's own comment), so a freshly
    // "just barely fits" pair isn't a reliable no-op fixture; a generously
    // oversized parent unambiguously is.
    const roomyParent: BoardCluster = { id: 'realA', boardId: 'board1', categoryId: 'A', x: 0, y: 0, width: 2000, height: 2000, createdAt: '0' }
    const data = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [parent, child],
      boardClusters: [roomyParent]
    })
    const next = growAncestorClustersToFit(data, 'board1', 'B')
    expect(next).toBe(data)
  })
})

describe('renestClustersCleanly', () => {
  function boxesOverlap(a: BoardCluster, b: BoardCluster): boolean {
    return a.x < b.x + a.width && a.x + a.width > b.x && a.y < b.y + a.height && a.y + a.height > b.y
  }

  // Regression: reparenting alone (what the resize-to-enclose handler did
  // before this function existed) leaves each newly-nested cluster at
  // whatever absolute position it had *before* joining this parent — if
  // one of them is already explicit (likely: it had to already exist
  // somewhere on the board to get enclosed by the resize), it stays
  // frozen there while computeCategoryLayout packs the other, still-
  // virtual ones fresh right around/on top of it. Reported as: resizing a
  // cluster to enclose several others left them overlapping instead of
  // tiled into a clean grid, with some pushed out past its edge.
  it('packs newly-enclosed clusters into a clean, non-overlapping grid even when one is already explicit', () => {
    const parent = makeCategory('super')
    const a = makeCategory('a')
    const b = makeCategory('b')
    const c = makeCategory('c')
    const baseData = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [parent, a, b, c]
    })
    // "a" already has an explicit shape from some unrelated earlier
    // interaction, sitting far away from where it's about to be enclosed.
    const aExplicit: BoardCluster = {
      id: 'realA',
      boardId: 'board1',
      categoryId: 'a',
      x: 5000,
      y: 5000,
      width: 280,
      height: 200,
      createdAt: '0'
    }
    const data = { ...baseData, boardClusters: [aExplicit] }

    // The resize itself (materializing "super" at a size that encloses
    // a/b/c) is the caller's job in BoardView — here it's simulated by
    // giving "super" a big enough explicit shape directly.
    const superBox: BoardCluster = {
      id: 'realSuper',
      boardId: 'board1',
      categoryId: 'super',
      x: 0,
      y: 0,
      width: 2000,
      height: 2000,
      createdAt: '0'
    }
    const withParentAndReparent = {
      ...data,
      boardClusters: [...data.boardClusters, superBox],
      categories: [
        parent,
        { ...a, parentCategoryId: 'super' },
        { ...b, parentCategoryId: 'super' },
        { ...c, parentCategoryId: 'super' }
      ]
    }

    const next = renestClustersCleanly(withParentAndReparent, 'board1', 'super', ['a', 'b', 'c'])

    const visible = getVisibleBoardClusters(DEFAULT_BOARD, next.boardClusters, next.categories)
    const childBoxes = ['a', 'b', 'c'].map((id) => visible.find((cl) => cl.categoryId === id)!)
    for (const box of childBoxes) expect(box).toBeDefined()
    for (let i = 0; i < childBoxes.length; i++) {
      for (let j = i + 1; j < childBoxes.length; j++) {
        expect(boxesOverlap(childBoxes[i], childBoxes[j])).toBe(false)
      }
    }
    const parentBox = visible.find((cl) => cl.categoryId === 'super')!
    for (const box of childBoxes) {
      expect(rectContains(parentBox, box)).toBe(true)
    }
    // In particular, "a" no longer sits at its old, unrelated position.
    const aAfter = visible.find((cl) => cl.categoryId === 'a')!
    expect(aAfter.x).not.toBe(5000)
    expect(aAfter.y).not.toBe(5000)
  })

  it('grows the parent to fit if its own (possibly manually-set) size is too small for the newly-packed children', () => {
    const parent = makeCategory('super', { parentCategoryId: null })
    const a = makeCategory('a', { parentCategoryId: 'super' })
    const b = makeCategory('b', { parentCategoryId: 'super' })
    const tooSmallSuper: BoardCluster = {
      id: 'realSuper',
      boardId: 'board1',
      categoryId: 'super',
      x: 0,
      y: 0,
      width: 300,
      height: 250,
      createdAt: '0'
    }
    const data = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [parent, a, b],
      boardClusters: [tooSmallSuper]
    })

    const next = renestClustersCleanly(data, 'board1', 'super', ['a', 'b'])

    const visible = getVisibleBoardClusters(DEFAULT_BOARD, next.boardClusters, next.categories)
    const parentAfter = visible.find((cl) => cl.categoryId === 'super')!
    const childBoxes = ['a', 'b'].map((id) => visible.find((cl) => cl.categoryId === id)!)
    for (const box of childBoxes) expect(rectContains(parentAfter, box)).toBe(true)
  })

  it('leaves an already-explicit child (not part of newChildCategoryIds) untouched', () => {
    const parent = makeCategory('super')
    const already = makeCategory('already', { parentCategoryId: 'super' })
    const fresh = makeCategory('fresh', { parentCategoryId: 'super' })
    const alreadyExplicit: BoardCluster = {
      id: 'realAlready',
      boardId: 'board1',
      categoryId: 'already',
      x: 1234,
      y: 1234,
      width: 280,
      height: 200,
      createdAt: '0'
    }
    const superBox: BoardCluster = {
      id: 'realSuper',
      boardId: 'board1',
      categoryId: 'super',
      x: 0,
      y: 0,
      width: 2000,
      height: 2000,
      createdAt: '0'
    }
    const data = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [parent, already, fresh],
      boardClusters: [alreadyExplicit, superBox]
    })

    const next = renestClustersCleanly(data, 'board1', 'super', ['fresh'])

    const alreadyAfter = next.boardClusters.find((cl) => cl.categoryId === 'already')!
    expect(alreadyAfter).toEqual(alreadyExplicit)
  })

  // Regression: an already-explicit sibling left untouched (previous test)
  // still has to be treated as occupied space when the newly-enclosed ones
  // get packed around it — otherwise a fresh one can land right on top of
  // it instead of using free space in the grid. Reported as: resizing a
  // superordinate cluster to enclose several others dropped one of them
  // right onto a neighbor already nested inside it.
  it('packs a newly-enclosed cluster around an already-explicit sibling instead of on top of it', () => {
    const parent = makeCategory('super')
    const already = makeCategory('already', { parentCategoryId: 'super' })
    const fresh = makeCategory('fresh', { parentCategoryId: 'super' })
    // Positioned at exactly the slot the packer would otherwise hand
    // "fresh" first (the natural first-column, first-row position).
    const alreadyExplicit: BoardCluster = {
      id: 'realAlready',
      boardId: 'board1',
      categoryId: 'already',
      x: 20,
      y: 48,
      width: 280,
      height: 200,
      createdAt: '0'
    }
    const superBox: BoardCluster = {
      id: 'realSuper',
      boardId: 'board1',
      categoryId: 'super',
      x: 0,
      y: 0,
      width: 2000,
      height: 2000,
      createdAt: '0'
    }
    const data = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [parent, fresh, already],
      boardClusters: [alreadyExplicit, superBox]
    })

    const next = renestClustersCleanly(data, 'board1', 'super', ['fresh'])

    expect(next.boardClusters.find((cl) => cl.categoryId === 'already')).toEqual(alreadyExplicit)
    const visible = getVisibleBoardClusters(DEFAULT_BOARD, next.boardClusters, next.categories)
    const alreadyAfter = visible.find((cl) => cl.categoryId === 'already')!
    const freshAfter = visible.find((cl) => cl.categoryId === 'fresh')!
    expect(boxesOverlap(alreadyAfter, freshAfter)).toBe(false)
    const parentAfter = visible.find((cl) => cl.categoryId === 'super')!
    expect(rectContains(parentAfter, alreadyAfter)).toBe(true)
    expect(rectContains(parentAfter, freshAfter)).toBe(true)
  })

  // Regression: a relocating cluster's own nested sub-cluster was
  // positioned relative to where the cluster *used* to be — left explicit
  // there, it ended up outside its parent's new frame (and drew a stray
  // structural connector to show for it).
  it("takes a relocating cluster's nested sub-cluster along with it", () => {
    const s = makeCategory('S')
    const q = makeCategory('Q', { parentCategoryId: 'S' })
    const r = makeCategory('R', { parentCategoryId: 'Q' })
    const sBox: BoardCluster = { id: 'realS', boardId: 'board1', categoryId: 'S', x: 0, y: 0, width: 2000, height: 2000, createdAt: '0' }
    const qBox: BoardCluster = { id: 'realQ', boardId: 'board1', categoryId: 'Q', x: 5000, y: 5000, width: 600, height: 500, createdAt: '0' }
    const rBox: BoardCluster = { id: 'realR', boardId: 'board1', categoryId: 'R', x: 5020, y: 5048, width: 280, height: 200, createdAt: '0' }
    const board = { id: 'board1', name: 'Main', isDefault: true }
    const data = makeData({ boards: [board], categories: [s, q, r], boardClusters: [sBox, qBox, rBox] })

    const next = renestClustersCleanly(data, 'board1', 'S', ['Q'])

    const visible = getVisibleBoardClusters(board, next.boardClusters, next.categories)
    const sAfter = visible.find((c) => c.categoryId === 'S')!
    const qAfter = visible.find((c) => c.categoryId === 'Q')!
    const rAfter = visible.find((c) => c.categoryId === 'R')!
    expect(rectContains(sAfter, qAfter)).toBe(true)
    expect(rectContains(qAfter, rAfter)).toBe(true)
    expect(next.categories.find((c) => c.id === 'R')!.parentCategoryId).toBe('Q')
  })

  it("leaves alone an id that isn't actually a child of the parent (a reparent that was refused)", () => {
    const p = makeCategory('P')
    const s = makeCategory('S', { parentCategoryId: 'P' })
    const pBox: BoardCluster = { id: 'realP', boardId: 'board1', categoryId: 'P', x: 0, y: 0, width: 3000, height: 3000, createdAt: '0' }
    const sBox: BoardCluster = { id: 'realS', boardId: 'board1', categoryId: 'S', x: 0, y: 0, width: 3500, height: 3500, createdAt: '0' }
    const data = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [p, s],
      boardClusters: [pBox, sBox]
    })

    const next = renestClustersCleanly(data, 'board1', 'S', ['P'])

    expect(next.boardClusters.find((c) => c.categoryId === 'P')).toEqual(pBox)
  })

  // Regression: a category being newly nested gets its own frame relocated
  // from wherever it rendered before (here: a root-level virtual position,
  // far from "super") to a fresh spot inside the parent's children grid —
  // but an already-individually-dragged member card of that category keeps
  // whatever absolute position it was pinned at, which has nothing to do
  // with the frame's new location. Reported as: enclosing several clusters
  // in one resize left one with its items sitting in place but no frame
  // around them, and the frame reappearing elsewhere with nothing in it.
  it("relocates a newly-nested category's own already-pinned member items along with its frame", () => {
    const parent = makeCategory('super')
    const a = makeCategory('a', { codeIds: ['codeA'] })
    const data = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [parent, a],
      codes: [makeCode('codeA')],
      boardItems: [{ id: 'itemA', boardId: 'board1', refType: 'code', refId: 'codeA', x: 9000, y: 9000 }]
    })
    const superBox: BoardCluster = {
      id: 'realSuper',
      boardId: 'board1',
      categoryId: 'super',
      x: 0,
      y: 0,
      width: 2000,
      height: 2000,
      createdAt: '0'
    }
    const withParentAndReparent = {
      ...data,
      boardClusters: [superBox],
      categories: [parent, { ...a, parentCategoryId: 'super' }]
    }

    const next = renestClustersCleanly(withParentAndReparent, 'board1', 'super', ['a'])

    const itemAAfter = next.boardItems.find((i) => i.refId === 'codeA')
    // Either it's still explicit but relocated, or it fell back to virtual
    // (recomputed fresh relative to the frame's new position) — either way
    // it must no longer be stranded at its old, unrelated coordinates.
    if (itemAAfter) {
      expect(itemAAfter.x === 9000 && itemAAfter.y === 9000).toBe(false)
    }
    const board = next.boards[0]
    const visibleClusters = getVisibleBoardClusters(board, next.boardClusters, next.categories)
    const visibleItems = getVisibleBoardItems(
      board,
      next.boardItems,
      next.codes,
      next.notes,
      next.categories,
      visibleClusters
    )
    const aBox = visibleClusters.find((c) => c.categoryId === 'a')!
    const codeAItem = visibleItems.find((i) => i.refType === 'code' && i.refId === 'codeA')!
    expect(
      rectContains(aBox, { ...aBox, x: codeAItem.x, y: codeAItem.y, width: 1, height: 1 })
    ).toBe(true)
  })
})

describe('resetDefaultBoardClusterLayout', () => {
  it('drops explicit cluster shapes only for the target board', () => {
    const data = makeData({
      boardClusters: [
        { id: 'c1', boardId: 'b1', categoryId: 'A', x: 0, y: 0, width: 1, height: 1, createdAt: '0' },
        { id: 'c2', boardId: 'b2', categoryId: 'A', x: 0, y: 0, width: 1, height: 1, createdAt: '0' }
      ]
    })
    const next = resetDefaultBoardClusterLayout(data, 'b1')
    expect(next.boardClusters.map((c) => c.boardId)).toEqual(['b2'])
  })

  it('drops explicit item positions for cluster members on that board, leaves unclustered items and other boards alone', () => {
    const data = makeData({
      categories: [makeCategory('A', { codeIds: ['code1'], noteIds: ['note1'] })],
      boardItems: [
        { id: 'item-code1', boardId: 'b1', refType: 'code', refId: 'code1', x: 999, y: 999 },
        { id: 'item-note1', boardId: 'b1', refType: 'note', refId: 'note1', x: 999, y: 999 },
        { id: 'item-free', boardId: 'b1', refType: 'code', refId: 'freeCode', x: 500, y: 500 },
        { id: 'item-other-board', boardId: 'b2', refType: 'code', refId: 'code1', x: 999, y: 999 }
      ]
    })
    const next = resetDefaultBoardClusterLayout(data, 'b1')
    expect(next.boardItems.map((i) => i.id).sort()).toEqual(['item-free', 'item-other-board'])
  })

  it('the full end-to-end scenario: nest two explicit clusters via reflow, then un-nest, and they stay separated', () => {
    const catA = makeCategory('A')
    const catB = makeCategory('B')
    let data = makeData({ boards: [{ id: 'b1', name: 'Main', isDefault: true }], categories: [catA, catB] })
    data = createClusterForCategory(data, { boardId: 'b1', categoryId: 'A', x: 40, y: 40, width: 280, height: 200 }).data
    data = createClusterForCategory(data, { boardId: 'b1', categoryId: 'B', x: 1000, y: 800, width: 280, height: 200 }).data

    let visible = getVisibleBoardClusters(DEFAULT_BOARD, data.boardClusters, data.categories)
    expect(rectsOverlap(visible.find((c) => c.categoryId === 'A')!, visible.find((c) => c.categoryId === 'B')!)).toBe(false)

    // Nest A into B (simulating reparentCategoryAndReflowBoard: reparent + reset).
    data = {
      ...data,
      categories: data.categories.map((c) => (c.id === 'A' ? { ...c, parentCategoryId: 'B' } : c))
    }
    data = resetDefaultBoardClusterLayout(data, 'b1')
    visible = getVisibleBoardClusters(DEFAULT_BOARD, data.boardClusters, data.categories)
    expect(rectContains(visible.find((c) => c.categoryId === 'B')!, visible.find((c) => c.categoryId === 'A')!)).toBe(true)

    // Pull A back out.
    data = { ...data, categories: data.categories.map((c) => (c.id === 'A' ? { ...c, parentCategoryId: null } : c)) }
    data = resetDefaultBoardClusterLayout(data, 'b1')
    visible = getVisibleBoardClusters(DEFAULT_BOARD, data.boardClusters, data.categories)
    expect(rectsOverlap(visible.find((c) => c.categoryId === 'A')!, visible.find((c) => c.categoryId === 'B')!)).toBe(false)
  })

  it('a code added to an already-explicit (frozen-size) cluster is positioned inside it once reflowed, and the box grows to fit', () => {
    let data = makeData({
      boards: [{ id: 'b1', name: 'Main', isDefault: true }],
      categories: [makeCategory('A')],
      codes: [{ id: 'code1', kind: 'code', name: 'Fear', color: '#111', definition: '', parentId: null, createdAt: '0' }]
    })
    // An explicit shape, frozen at a size that predates the new member —
    // this is the state a board is in right after a user has dragged/resized
    // a cluster by hand, before the code is ever added to it.
    data = createClusterForCategory(data, { boardId: 'b1', categoryId: 'A', x: 40, y: 40, width: 60, height: 60 }).data
    const before = getVisibleBoardClusters(DEFAULT_BOARD, data.boardClusters, data.categories).find(
      (c) => c.categoryId === 'A'
    )!

    // Simulates addCodeToCategoryAndReflowBoard: membership change, then reflow.
    data = addCodeToCategory(data, 'A', 'code1')
    data = resetDefaultBoardClusterLayout(data, 'b1')

    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, data.boardClusters, data.categories)
    const cluster = clusters.find((c) => c.categoryId === 'A')!
    const items = getVisibleBoardItems(DEFAULT_BOARD, data.boardItems, data.codes, [], data.categories, clusters)
    const codeItem = items.find((i) => i.refType === 'code' && i.refId === 'code1')!

    // The stored 60x60 box couldn't fit a member row — what's shown must
    // have room for one (the box is never smaller than its contents; it
    // already was before the reset, since a stored shape is only a floor).
    expect(cluster.width * cluster.height).toBeGreaterThan(60 * 60)
    expect(before.width * before.height).toBe(60 * 60)
    // And the new member actually lands inside the (grown) box, not outside it.
    expect(
      rectContains(cluster, {
        id: 'x',
        boardId: 'b1',
        categoryId: 'A',
        x: codeItem.x,
        y: codeItem.y,
        width: 180,
        height: 64,
        createdAt: '0'
      })
    ).toBe(true)
  })
})

// --- getVisibleBoardItems --------------------------------------------------

describe('getVisibleBoardItems', () => {
  it('non-default boards only show explicitly-placed items, plus explicit quotes always show', () => {
    const explicit: BoardItem[] = [{ id: 'i1', boardId: 'board2', refType: 'code', refId: 'c1', x: 0, y: 0 }]
    expect(getVisibleBoardItems(OTHER_BOARD, explicit, [{ id: 'c1' }], [])).toEqual(explicit)
  })

  it('auto-shows every code/note as virtual on the default board', () => {
    const items = getVisibleBoardItems(DEFAULT_BOARD, [], [{ id: 'c1' }], [{ id: 'n1' }])
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.id.startsWith('virtual:'))).toBe(true)
  })

  it('a clustered code/note is positioned inside its cluster, not the flat grid', () => {
    const category = makeCategory('cat1', { codeIds: ['code1', 'code2'], noteIds: ['note1'] })
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], [category])
    const items = getVisibleBoardItems(DEFAULT_BOARD, [], [{ id: 'code1' }, { id: 'code2' }], [{ id: 'note1' }], [category], clusters)
    const clusterBox = clusters[0]
    for (const item of items) {
      expect(item.x).toBeGreaterThanOrEqual(clusterBox.x)
      expect(item.x + 180).toBeLessThanOrEqual(clusterBox.x + clusterBox.width)
      expect(item.y).toBeGreaterThanOrEqual(clusterBox.y)
      expect(item.y + 64).toBeLessThanOrEqual(clusterBox.y + clusterBox.height)
    }
    // And no two members of the same cluster overlap each other.
    const [m0, m1] = items
    const overlap = m0.x < m1.x + 180 && m0.x + 180 > m1.x && m0.y < m1.y + 64 && m0.y + 64 > m1.y
    expect(overlap).toBe(false)
  })

  it('member cards are packed into a grid (multiple columns), not a single column', () => {
    const codeIds = Array.from({ length: 6 }, (_, i) => `code${i}`)
    const category = makeCategory('cat1', { codeIds })
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], [category])
    const items = getVisibleBoardItems(
      DEFAULT_BOARD,
      [],
      codeIds.map((id) => ({ id })),
      [],
      [category],
      clusters
    )
    const distinctX = new Set(items.map((i) => i.x))
    // 6 members -> ceil(sqrt(6)) = 3 columns.
    expect(distinctX.size).toBe(3)
    // Still all inside the cluster box, still no two overlapping.
    const box = clusters[0]
    for (const item of items) {
      expect(item.x).toBeGreaterThanOrEqual(box.x)
      expect(item.x + 180).toBeLessThanOrEqual(box.x + box.width)
      expect(item.y).toBeGreaterThanOrEqual(box.y)
      expect(item.y + 64).toBeLessThanOrEqual(box.y + box.height)
    }
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]
        const b = items[j]
        const overlap = a.x < b.x + 180 && a.x + 180 > b.x && a.y < b.y + 64 && a.y + 64 > b.y
        expect(overlap).toBe(false)
      }
    }
  })

  it('a member of a NESTED cluster is positioned inside that nested cluster (transitively inside its ancestor too)', () => {
    const root = makeCategory('root')
    const child = makeCategory('child', { parentCategoryId: 'root', codeIds: ['code1'], noteIds: ['note1'] })
    const categories = [root, child]
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], categories)
    const childCluster = clusters.find((c) => c.categoryId === 'child')!
    const rootCluster = clusters.find((c) => c.categoryId === 'root')!
    const items = getVisibleBoardItems(DEFAULT_BOARD, [], [{ id: 'code1' }], [{ id: 'note1' }], categories, clusters)
    for (const item of items) {
      expect(rectContains(childCluster, { id: 'x', boardId: 'b', categoryId: '', x: item.x, y: item.y, width: 180, height: 64, createdAt: '' })).toBe(true)
      expect(rectContains(rootCluster, { id: 'x', boardId: 'b', categoryId: '', x: item.x, y: item.y, width: 180, height: 64, createdAt: '' })).toBe(true)
    }
  })

  it('unclustered items fall back to the flat grid, positioned below the whole cluster area', () => {
    const category = makeCategory('cat1', { codeIds: ['clustered1'] })
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], [category])
    const items = getVisibleBoardItems(DEFAULT_BOARD, [], [{ id: 'clustered1' }, { id: 'free1' }], [], [category], clusters)
    const free = items.find((i) => i.refId === 'free1')!
    const clusterBottom = clusters[0].y + clusters[0].height
    expect(free.y).toBeGreaterThanOrEqual(clusterBottom)
  })

  it('a ref belonging to multiple categories homes in the first one, in categories order', () => {
    const catA = makeCategory('catA', { codeIds: ['shared'] })
    const catB = makeCategory('catB', { codeIds: ['shared'] })
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], [catA, catB])
    const items = getVisibleBoardItems(DEFAULT_BOARD, [], [{ id: 'shared' }], [], [catA, catB], clusters)
    expect(items).toHaveLength(1)
    const clusterA = clusters.find((c) => c.categoryId === 'catA')!
    expect(rectContains(clusterA, { id: 'x', boardId: 'b', categoryId: '', x: items[0].x, y: items[0].y, width: 180, height: 64, createdAt: '' })).toBe(true)
  })

  it('an explicit clustered item keeps its id but renders at its grid slot, not its stored position', () => {
    const category = makeCategory('cat1', { codeIds: ['code1'] })
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], [category])
    const explicit: BoardItem[] = [{ id: 'realItem', boardId: DEFAULT_BOARD.id, refType: 'code', refId: 'code1', x: 9999, y: 9999 }]
    const items = getVisibleBoardItems(DEFAULT_BOARD, explicit, [{ id: 'code1' }], [], [category], clusters)
    const virtual = getVisibleBoardItems(DEFAULT_BOARD, [], [{ id: 'code1' }], [], [category], clusters)
    expect(items).toEqual([{ ...explicit[0], x: virtual[0].x, y: virtual[0].y }])
  })

  it('an explicit item that is in no cluster keeps its stored position', () => {
    const explicit: BoardItem[] = [{ id: 'realItem', boardId: DEFAULT_BOARD.id, refType: 'code', refId: 'code1', x: 9999, y: 9999 }]
    const items = getVisibleBoardItems(DEFAULT_BOARD, explicit, [{ id: 'code1' }], [], [], [])
    expect(items).toEqual(explicit)
  })

  // Regression: clicking one still-virtual member (materializing it into an
  // explicit BoardItem at its own current slot) used to shift every OTHER
  // still-virtual sibling in the same cluster back by one slot, landing one
  // of them exactly on top of a neighbor — reported as "clicking an item
  // makes a different item jump on top of it".
  it('materializing one member does not move its still-virtual siblings onto each other', () => {
    const codeIds = ['code0', 'code1', 'code2']
    const category = makeCategory('cat1', { codeIds })
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], [category])
    const codesArg = codeIds.map((id) => ({ id }))

    // Baseline: every member virtual, note where the untouched siblings land.
    const before = getVisibleBoardItems(DEFAULT_BOARD, [], codesArg, [], [category], clusters)
    const before1 = before.find((i) => i.refId === 'code1')!
    const before2 = before.find((i) => i.refId === 'code2')!

    // code0 materializes (e.g. the user picked it up) at exactly its own
    // pre-materialization slot — the common case, since addItemToBoard is
    // called with the virtual item's own current x/y.
    const before0 = before.find((i) => i.refId === 'code0')!
    const explicit: BoardItem[] = [
      { id: 'real0', boardId: DEFAULT_BOARD.id, refType: 'code', refId: 'code0', x: before0.x, y: before0.y }
    ]
    const after = getVisibleBoardItems(DEFAULT_BOARD, explicit, codesArg, [], [category], clusters)
    const after1 = after.find((i) => i.refId === 'code1')!
    const after2 = after.find((i) => i.refId === 'code2')!

    // The untouched siblings must not have moved...
    expect(after1.x).toBe(before1.x)
    expect(after1.y).toBe(before1.y)
    expect(after2.x).toBe(before2.x)
    expect(after2.y).toBe(before2.y)
    // ...and in particular must not have landed on the materialized member.
    const overlapsExplicit = (item: BoardItem): boolean =>
      item.x < explicit[0].x + 180 && item.x + 180 > explicit[0].x && item.y < explicit[0].y + 64 && item.y + 64 > explicit[0].y
    expect(overlapsExplicit(after1)).toBe(false)
    expect(overlapsExplicit(after2)).toBe(false)
  })

  // Regression: a column count based only on still-virtual members (tried
  // as a fix for "moving a block of items reflows its cluster siblings")
  // combined with each member's stable-but-sparse slot number (which can
  // range up to the cluster's *total* member count, not just how many are
  // still virtual — see memberSlotByRef's own comment) produced rows far
  // beyond what the cluster's box was ever sized for: with 8 of 9 members
  // materialized, the one remaining virtual member (holding a late slot
  // number) divided by a column count sized for just 1 member landed many
  // rows below the cluster, reported as a code jumping to "a seemingly
  // random position, even out-of-cluster". Column count has to stay sized
  // for the same total every member's slot number can range across.
  it('a still-virtual member stays inside its cluster even once most other members are explicit', () => {
    const codeIds = Array.from({ length: 9 }, (_, i) => `code${i}`)
    const category = makeCategory('cat1', { codeIds })
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], [category])
    const box = clusters[0]

    // Every member but the last materializes (e.g. each was individually
    // dragged at some point) — the last one stays virtual, holding the
    // highest slot number in the cluster.
    const explicit: BoardItem[] = codeIds.slice(0, 8).map((id, i) => ({
      id: `real${i}`,
      boardId: DEFAULT_BOARD.id,
      refType: 'code',
      refId: id,
      x: box.x,
      y: box.y
    }))
    const items = getVisibleBoardItems(
      DEFAULT_BOARD,
      explicit,
      codeIds.map((id) => ({ id })),
      [],
      [category],
      clusters
    )
    const lastItem = items.find((i) => i.refId === 'code8')!
    expect(
      rectContains(box, { id: 'x', boardId: 'b', categoryId: '', x: lastItem.x, y: lastItem.y, width: 180, height: 64, createdAt: '' })
    ).toBe(true)
  })

  it('old 4-argument call signature (no categories/clusters) still works', () => {
    const items = getVisibleBoardItems(DEFAULT_BOARD, [], [{ id: 'c1' }], [{ id: 'n1' }])
    expect(items).toHaveLength(2)
  })
})

describe('reassignRefCategoryMembership', () => {
  it('moves a ref from its old category to a new one', () => {
    const oldCat = makeCategory('old', { codeIds: ['x'] })
    const newCat = makeCategory('new', { codeIds: [] })
    const data = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [oldCat, newCat],
      codes: [makeCode('x')]
    })
    const next = reassignRefCategoryMembership(data, 'board1', 'code', 'x', 'new')
    expect(next.categories.find((c) => c.id === 'old')!.codeIds).toEqual([])
    expect(next.categories.find((c) => c.id === 'new')!.codeIds).toEqual(['x'])
  })

  it('fully unclusters when newCategoryId is null', () => {
    const oldCat = makeCategory('old', { codeIds: ['x'] })
    const data = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [oldCat],
      codes: [makeCode('x')]
    })
    const next = reassignRefCategoryMembership(data, 'board1', 'code', 'x', null)
    expect(next.categories.find((c) => c.id === 'old')!.codeIds).toEqual([])
  })

  // Regression: reconcileSoleCategoryMembership + assignItemToCluster alone
  // (what BoardView called directly, before this function existed) can
  // densely renumber a destination cluster's grid slots as a side effect
  // of the join, landing a still-virtual sibling exactly on top of one
  // that's already explicit — reported as "moving a code between
  // clusters while linking it to a code already in the destination, a
  // code from either cluster ends up superposed on another code from the
  // same cluster."
  it('moving a ref into a cluster with a mix of explicit and virtual members never collides any of them', () => {
    // "dst" has 2 members, one already explicit (keep1, simulating a
    // previously-touched card); "moving" joins from "src" ordered *before*
    // both of them in the project's own code array. Found by fuzzing many
    // (member count, which one's explicit, join position) combinations
    // against the un-stabilized reconcileSoleCategoryMembership +
    // addMemberByRefType alone: this specific shape reliably renumbers
    // keep0's slot to land exactly on keep1's frozen position.
    const dst = makeCategory('dst', { codeIds: ['keep0', 'keep1'] })
    const src = makeCategory('src', { codeIds: ['moving'] })
    const codes = [makeCode('moving'), makeCode('keep0'), makeCode('keep1')]
    const baseData = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [src, dst],
      codes
    })
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], baseData.categories)
    const keep1Virtual = getVisibleBoardItems(DEFAULT_BOARD, [], codes, [], baseData.categories, clusters).find(
      (i) => i.refId === 'keep1'
    )!
    const keep1Explicit: BoardItem = {
      id: 'realKeep1',
      boardId: 'board1',
      refType: 'code',
      refId: 'keep1',
      x: keep1Virtual.x,
      y: keep1Virtual.y
    }
    const data = { ...baseData, boardItems: [keep1Explicit] }

    const next = reassignRefCategoryMembership(data, 'board1', 'code', 'moving', 'dst')

    const explicitClusters = next.boardClusters.filter((c) => c.boardId === 'board1')
    const visibleClusters = getVisibleBoardClusters(DEFAULT_BOARD, explicitClusters, next.categories)
    const items = getVisibleBoardItems(
      DEFAULT_BOARD,
      next.boardItems,
      next.codes,
      next.notes,
      next.categories,
      visibleClusters
    )
    const CARD_W = 180
    const CARD_H = 64
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]
        const b = items[j]
        const overlap = a.x < b.x + CARD_W && a.x + CARD_W > b.x && a.y < b.y + CARD_H && a.y + CARD_H > b.y
        expect(overlap).toBe(false)
      }
    }
  })

  // A clustered card always renders at its grid slot, so a virtual source
  // cluster is free to shrink to its smaller membership the instant a
  // member leaves — its remaining member re-grids inside it on the same
  // read. (This used to require pinning the source box and every member
  // first; that's gone.)
  it('a remaining member still renders inside its (now smaller) source cluster after another leaves', () => {
    const src = makeCategory('src', { codeIds: ['a', 'b'] })
    const dst = makeCategory('dst', { codeIds: [] })
    const codes = [makeCode('a'), makeCode('b')]
    const data = makeData({
      boards: [{ id: 'board1', name: 'Main', isDefault: true }],
      categories: [src, dst],
      codes
    })

    const next = reassignRefCategoryMembership(data, 'board1', 'code', 'a', 'dst')

    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, next.boardClusters, next.categories)
    const srcBox = clusters.find((c) => c.categoryId === 'src')!
    const items = getVisibleBoardItems(DEFAULT_BOARD, next.boardItems, next.codes, next.notes, next.categories, clusters)
    const bItem = items.find((i) => i.refId === 'b')!
    expect(rectContains(srcBox, { ...srcBox, x: bItem.x, y: bItem.y, width: MEMBER_CARD_WIDTH, height: MEMBER_CARD_HEIGHT })).toBe(true)
    expect(next.categories.find((c) => c.id === 'dst')!.codeIds).toEqual(['a'])
    expect(next.categories.find((c) => c.id === 'src')!.codeIds).toEqual(['b'])
  })
})

// --- bulk add actions -------------------------------------------------

describe('addAllCodesToBoard / addAllNotesToBoard / addAllClustersToBoard', () => {
  it('addAllCodesToBoard adds every code not already placed, and is idempotent', () => {
    const data = makeData({ codes: [{ id: 'c1', kind: 'code', name: 'A', color: '#111', definition: '', parentId: null, createdAt: '0' }] })
    const once = addAllCodesToBoard(data, 'b1')
    expect(once.boardItems).toHaveLength(1)
    const twice = addAllCodesToBoard(once, 'b1')
    expect(twice.boardItems).toHaveLength(1)
    expect(twice).toBe(once) // no-op returns the same reference (nothing to add)
  })

  it('addAllNotesToBoard adds every note not already placed', () => {
    const data = makeData({
      notes: [{ id: 'n1', attachedTo: { kind: 'project' }, question: null, answer: 'x', tags: [], noteCategoryId: null, createdAt: '0', updatedAt: '0' }]
    })
    const next = addAllNotesToBoard(data, 'b1')
    expect(next.boardItems).toHaveLength(1)
    expect(next.boardItems[0].refType).toBe('note')
  })

  it('addAllClustersToBoard places a cluster shape big enough for its members, without overlapping members', () => {
    const category = makeCategory('A', { codeIds: ['c1', 'c2', 'c3', 'c4', 'c5'] })
    const data = makeData({ categories: [category] })
    const next = addAllClustersToBoard(data, 'b1')
    expect(next.boardClusters).toHaveLength(1)
    expect(next.boardItems).toHaveLength(5)
    const cluster = next.boardClusters[0]
    for (const item of next.boardItems) {
      expect(item.y + 64).toBeLessThanOrEqual(cluster.y + cluster.height)
    }
    // No two members overlap each other (this is the exact bug fixed
    // earlier: members packed every 20px regardless of the ~64px card).
    for (let i = 0; i < next.boardItems.length; i++) {
      for (let j = i + 1; j < next.boardItems.length; j++) {
        const a = next.boardItems[i]
        const b = next.boardItems[j]
        const overlap = a.x < b.x + 180 && a.x + 180 > b.x && a.y < b.y + 64 && a.y + 64 > b.y
        expect(overlap).toBe(false)
      }
    }
  })

  it('addAllClustersToBoard: many clusters with many members each never overlap each other — the exact reported bug', () => {
    // Reproduces the real-world report: a project with several clusters
    // each holding enough codes that the old fixed-height grid row (240px)
    // was far shorter than the cluster's actual content, so the next
    // row's cluster visually overlapped the previous one's tall box.
    const categories = Array.from({ length: 8 }, (_, i) =>
      makeCategory(`cat${i}`, { codeIds: Array.from({ length: 15 }, (_, j) => `c${i}-${j}`) })
    )
    const data = makeData({ categories })
    const next = addAllClustersToBoard(data, 'b1')
    expect(next.boardClusters).toHaveLength(8)
    expect(next.boardItems).toHaveLength(8 * 15)

    for (let i = 0; i < next.boardClusters.length; i++) {
      for (let j = i + 1; j < next.boardClusters.length; j++) {
        expect(rectsOverlap(next.boardClusters[i], next.boardClusters[j])).toBe(false)
      }
    }
    // Every member genuinely sits inside its own cluster's box, not just
    // "somewhere on the board" — the actual symptom reported was cards
    // appearing to belong to the wrong cluster.
    const clusterByCategoryId = new Map(next.boardClusters.map((c) => [c.categoryId, c]))
    for (const category of categories) {
      const cluster = clusterByCategoryId.get(category.id)!
      const memberItems = next.boardItems.filter(
        (i) => i.refType === 'code' && category.codeIds.includes(i.refId)
      )
      for (const item of memberItems) {
        expect(item.x).toBeGreaterThanOrEqual(cluster.x)
        expect(item.x + 180).toBeLessThanOrEqual(cluster.x + cluster.width)
        expect(item.y).toBeGreaterThanOrEqual(cluster.y)
        expect(item.y + 64).toBeLessThanOrEqual(cluster.y + cluster.height)
      }
    }
  })

  it('addAllClustersToBoard packs a cluster\'s members into a near-square grid, not a single tall column', () => {
    const category = makeCategory('A', { codeIds: Array.from({ length: 9 }, (_, i) => `c${i}`) })
    const data = makeData({ categories: [category] })
    const next = addAllClustersToBoard(data, 'b1')
    const distinctColumns = new Set(next.boardItems.map((i) => i.x))
    // 9 members -> ceil(sqrt(9)) = 3 columns, matching computeCategoryLayout's
    // own sizing assumption — a single column would mean distinctColumns.size === 1.
    expect(distinctColumns.size).toBe(3)
  })

  it('addAllClustersToBoard lays new clusters out relative to ones already explicitly on this board', () => {
    const categories = [makeCategory('A'), makeCategory('B')]
    const existing: BoardCluster[] = [
      { id: 'realA', boardId: 'b1', categoryId: 'A', x: 900, y: 700, width: 280, height: 200, createdAt: '0' }
    ]
    const data = makeData({ categories, boardClusters: existing })
    const next = addAllClustersToBoard(data, 'b1')
    // A's already-real shape is untouched...
    expect(next.boardClusters.find((c) => c.categoryId === 'A')).toMatchObject({ id: 'realA', x: 900, y: 700 })
    // ...and B is a genuinely new shape, not overlapping A.
    const a = next.boardClusters.find((c) => c.categoryId === 'A')!
    const b = next.boardClusters.find((c) => c.categoryId === 'B')!
    expect(rectsOverlap(a, b)).toBe(false)
  })

  it('addAllClustersToBoard does not auto-place raw segments (they keep their own explicit position elsewhere)', () => {
    const category = makeCategory('A', { segmentIds: ['s1', 's2'] })
    const data = makeData({ categories: [category] })
    const next = addAllClustersToBoard(data, 'b1')
    expect(next.boardClusters).toHaveLength(1)
    expect(next.boardItems).toHaveLength(0)
  })

  it('addAllClustersToBoard(includeMembers: false) places only the empty cluster frames', () => {
    const category = makeCategory('A', { codeIds: ['c1', 'c2'], noteIds: ['n1'] })
    const data = makeData({ categories: [category] })
    const next = addAllClustersToBoard(data, 'b1', false)
    expect(next.boardClusters).toHaveLength(1)
    expect(next.boardItems).toHaveLength(0)
    // The frame is still sized as if the members were there, so it's
    // already the right size if they get added later.
    expect(next.boardClusters[0].height).toBeGreaterThan(200)
  })
})

describe('computeCategoryLayout', () => {
  // rectContains/rectsOverlap are typed against BoardCluster (used
  // everywhere else in this file) — pad a ComputedClusterLayout with dummy
  // board-specific fields rather than widening those two widely-used
  // helpers just for this describe block.
  function asCluster(l: { categoryId: string; x: number; y: number; width: number; height: number }): BoardCluster {
    return { id: l.categoryId, boardId: 'b1', categoryId: l.categoryId, x: l.x, y: l.y, width: l.width, height: l.height, createdAt: '0' }
  }

  it('nests a child inside its parent, matching getVisibleBoardClusters\' own containment guarantee', () => {
    const parent = makeCategory('A', { codeIds: ['c1'] })
    const child = makeCategory('B', { parentCategoryId: 'A', codeIds: ['c2'] })
    const layout = computeCategoryLayout([parent, child])
    const a = layout.find((l) => l.categoryId === 'A')!
    const b = layout.find((l) => l.categoryId === 'B')!
    expect(rectContains(asCluster(a), asCluster(b))).toBe(true)
  })

  it('respects an explicit override for one category, computing the rest fresh around it', () => {
    const categories = [makeCategory('A'), makeCategory('B')]
    const overrides = new Map([['A', { x: 500, y: 500, width: 280, height: 200 }]])
    const layout = computeCategoryLayout(categories, overrides)
    expect(layout.find((l) => l.categoryId === 'A')).toMatchObject({ x: 500, y: 500 })
    const a = layout.find((l) => l.categoryId === 'A')!
    const b = layout.find((l) => l.categoryId === 'B')!
    expect(rectsOverlap(asCluster(a), asCluster(b))).toBe(false)
  })

  it('returns an empty array for no categories', () => {
    expect(computeCategoryLayout([])).toEqual([])
  })

  it("compact mode sizes a leaf down to its header, ignoring how many codes/notes it holds", () => {
    const rich = makeCategory('A', { codeIds: Array.from({ length: 40 }, (_, i) => `c${i}`) })
    const normal = computeCategoryLayout([rich]).find((l) => l.categoryId === 'A')!
    const compact = computeCategoryLayout([rich], new Map(), true).find((l) => l.categoryId === 'A')!
    expect(compact.width).toBeLessThan(normal.width)
    expect(compact.height).toBeLessThan(normal.height)
  })

  it('compact mode still contains a compact parent\'s compact children, just at the smaller scale', () => {
    const parent = makeCategory('A', { codeIds: ['c1'] })
    const child = makeCategory('B', { parentCategoryId: 'A', codeIds: ['c2'] })
    const layout = computeCategoryLayout([parent, child], new Map(), true)
    const a = layout.find((l) => l.categoryId === 'A')!
    const b = layout.find((l) => l.categoryId === 'B')!
    expect(rectContains(asCluster(a), asCluster(b))).toBe(true)
  })

  // Regression: an explicit sibling's real position was only accounted for
  // by the shortest-column heuristic if it happened to be *processed*
  // before whichever virtual sibling the heuristic assigns the same
  // column-bottom slot to — the override's actual footprint was never
  // checked directly, only used to update column-bottom bookkeeping *if*
  // it was that column's turn first. A virtual sibling earlier in the
  // list (so packed into that slot before the override was ever
  // considered) landed exactly on top of it. Reported as: resizing a
  // superordinate cluster to enclose several others dropped one of them
  // right on top of a neighbor already nested inside it, instead of into
  // free space in the grid.
  it("packs a virtual root around an explicit one's real position, regardless of processing order", () => {
    const a = makeCategory('a')
    const b = makeCategory('b')
    const old = makeCategory('old')
    const c = makeCategory('c')
    // "old" comes *after* "a" and "b" in category order, and its real
    // position (set via the override map) is exactly where the
    // shortest-column heuristic would otherwise put the first virtual
    // root it processes.
    const first = computeCategoryLayout([a])[0]
    const overrides = new Map([['old', { x: first.x, y: first.y, width: 280, height: 200 }]])
    const layout = computeCategoryLayout([a, b, old, c], overrides)

    const boxes = ['a', 'b', 'old', 'c'].map((id) => asCluster(layout.find((l) => l.categoryId === id)!))
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(rectsOverlap(boxes[i], boxes[j])).toBe(false)
      }
    }
    const oldBox = layout.find((l) => l.categoryId === 'old')!
    expect({ x: oldBox.x, y: oldBox.y }).toEqual({ x: first.x, y: first.y })
  })

  it('places a nested category at its slot in the parent grid, ignoring its stored position', () => {
    const parent = makeCategory('super')
    const a = makeCategory('a', { parentCategoryId: 'super' })
    const b = makeCategory('b', { parentCategoryId: 'super' })
    const natural = computeCategoryLayout([parent, a, b])
    const withStray = computeCategoryLayout(
      [parent, a, b],
      new Map([['a', { x: 5000, y: 5000, width: 280, height: 200 }]])
    )
    const aNatural = natural.find((l) => l.categoryId === 'a')!
    const aShown = withStray.find((l) => l.categoryId === 'a')!
    expect({ x: aShown.x, y: aShown.y }).toEqual({ x: aNatural.x, y: aNatural.y })
    expect(rectContains(asCluster(withStray.find((l) => l.categoryId === 'super')!), asCluster(aShown))).toBe(true)
  })

  it("an explicit parent is shown big enough for its children grid, not frozen at its stored size", () => {
    const parent = makeCategory('super')
    const kids = ['a', 'b', 'c', 'd'].map((id) => makeCategory(id, { parentCategoryId: 'super' }))
    const layout = computeCategoryLayout(
      [parent, ...kids],
      new Map([['super', { x: 0, y: 0, width: 100, height: 100 }]])
    )
    const parentBox = asCluster(layout.find((l) => l.categoryId === 'super')!)
    expect({ x: parentBox.x, y: parentBox.y }).toEqual({ x: 0, y: 0 })
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(rectContains(parentBox, asCluster(layout.find((l) => l.categoryId === id)!))).toBe(true)
    }
  })
})

// --- Clusters (category shapes) -------------------------------------------

describe('cluster CRUD', () => {
  it('createClusterForCategory no-ops if the category already has a shape on that board', () => {
    const data = makeData()
    const first = createClusterForCategory(data, { boardId: 'b1', categoryId: 'A', x: 0, y: 0, width: 1, height: 1 })
    const second = createClusterForCategory(first.data, { boardId: 'b1', categoryId: 'A', x: 999, y: 999, width: 1, height: 1 })
    expect(second.clusterId).toBe(first.clusterId)
    expect(second.data.boardClusters).toHaveLength(1)
    expect(second.data.boardClusters[0].x).toBe(0)
  })

  it('findClusterForCategoryOnBoard is scoped per board', () => {
    const clusters: BoardCluster[] = [{ id: 'c1', boardId: 'b1', categoryId: 'A', x: 0, y: 0, width: 1, height: 1, createdAt: '0' }]
    expect(findClusterForCategoryOnBoard(clusters, 'b1', 'A')?.id).toBe('c1')
    expect(findClusterForCategoryOnBoard(clusters, 'b2', 'A')).toBeUndefined()
  })

  it('createClusterWithNewCategory creates the category and its shape together', () => {
    const { data, clusterId, categoryId } = createClusterWithNewCategory(makeData(), {
      boardId: 'b1',
      name: 'New cluster',
      kind: 'theme',
      color: '#fff',
      x: 0,
      y: 0,
      width: 280,
      height: 200
    })
    expect(data.categories).toHaveLength(1)
    expect(data.categories[0].id).toBe(categoryId)
    expect(data.boardClusters[0].id).toBe(clusterId)
    expect(data.boardClusters[0].categoryId).toBe(categoryId)
  })

  it('moveCluster and resizeCluster only touch the targeted cluster', () => {
    const data = makeData({
      boardClusters: [
        { id: 'c1', boardId: 'b1', categoryId: 'A', x: 0, y: 0, width: 100, height: 100, createdAt: '0' },
        { id: 'c2', boardId: 'b1', categoryId: 'B', x: 5, y: 5, width: 50, height: 50, createdAt: '0' }
      ]
    })
    const moved = moveCluster(data, 'c1', 200, 300)
    expect(moved.boardClusters.find((c) => c.id === 'c1')).toMatchObject({ x: 200, y: 300 })
    expect(moved.boardClusters.find((c) => c.id === 'c2')).toMatchObject({ x: 5, y: 5 })
    const resized = resizeCluster(data, 'c1', 400, 500)
    expect(resized.boardClusters.find((c) => c.id === 'c1')).toMatchObject({ width: 400, height: 500 })
  })

  it('deleteCluster removes only the shape, not the category itself', () => {
    const data = makeData({
      categories: [makeCategory('A')],
      boardClusters: [{ id: 'c1', boardId: 'b1', categoryId: 'A', x: 0, y: 0, width: 1, height: 1, createdAt: '0' }]
    })
    const next = deleteCluster(data, 'c1')
    expect(next.boardClusters).toHaveLength(0)
    expect(next.categories).toHaveLength(1)
  })

  it('assignItemToCluster / unassignItemFromCluster add/remove membership via the cluster\'s underlying category', () => {
    const data = makeData({
      categories: [makeCategory('A')],
      boardClusters: [{ id: 'c1', boardId: 'b1', categoryId: 'A', x: 0, y: 0, width: 1, height: 1, createdAt: '0' }]
    })
    const assigned = assignItemToCluster(data, 'c1', 'code', 'code1')
    expect(assigned.categories[0].codeIds).toEqual(['code1'])
    const unassigned = unassignItemFromCluster(assigned, 'c1', 'code', 'code1')
    expect(unassigned.categories[0].codeIds).toEqual([])
  })

  it('assignItemToCluster is a no-op if the cluster id does not exist', () => {
    const data = makeData({ categories: [makeCategory('A')] })
    const next = assignItemToCluster(data, 'nonexistent', 'code', 'code1')
    expect(next).toBe(data)
  })

  it('getClusterMemberItems filters items by the category\'s membership lists', () => {
    const category = makeCategory('A', { codeIds: ['c1'], noteIds: ['n1'] })
    const items: BoardItem[] = [
      { id: 'i1', boardId: 'b1', refType: 'code', refId: 'c1', x: 0, y: 0 },
      { id: 'i2', boardId: 'b1', refType: 'note', refId: 'n1', x: 0, y: 0 },
      { id: 'i3', boardId: 'b1', refType: 'code', refId: 'unrelated', x: 0, y: 0 }
    ]
    expect(getClusterMemberItems(items, category).map((i) => i.id).sort()).toEqual(['i1', 'i2'])
  })
})


// --- Links ------------------------------------------------------------

describe('linkItems / unlinkItems / getLinkedGroup', () => {
  it('links two items, and is idempotent regardless of argument order', () => {
    const data = makeData()
    const first = linkItems(data, 'b1', 'i1', 'i2')
    expect(first.boardLinks).toHaveLength(1)
    const second = linkItems(first, 'b1', 'i2', 'i1')
    expect(second.boardLinks).toHaveLength(1)
  })

  it('refuses to link an item to itself', () => {
    const data = makeData()
    expect(linkItems(data, 'b1', 'i1', 'i1')).toBe(data)
  })

  it('unlinkItems removes only the targeted link', () => {
    const data = makeData({
      boardLinks: [
        { id: 'l1', boardId: 'b1', itemAId: 'i1', itemBId: 'i2', createdAt: '0' },
        { id: 'l2', boardId: 'b1', itemAId: 'i2', itemBId: 'i3', createdAt: '0' }
      ]
    })
    const next = unlinkItems(data, 'l1')
    expect(next.boardLinks.map((l) => l.id)).toEqual(['l2'])
  })

  it('getLinkedGroup returns the whole transitively-connected chain', () => {
    const links = [
      { itemAId: 'i1', itemBId: 'i2' },
      { itemAId: 'i2', itemBId: 'i3' }
    ]
    expect([...getLinkedGroup(links, 'i1')].sort()).toEqual(['i1', 'i2', 'i3'])
  })

  it('getLinkedGroup returns just the item itself when it has no links', () => {
    expect([...getLinkedGroup([], 'i1')]).toEqual(['i1'])
  })

  it('getLinkedGroup does not cross into an unrelated component', () => {
    const links = [
      { itemAId: 'i1', itemBId: 'i2' },
      { itemAId: 'i3', itemBId: 'i4' }
    ]
    expect([...getLinkedGroup(links, 'i1')].sort()).toEqual(['i1', 'i2'])
  })
})

describe('getVisibleClusterLinks', () => {
  function link(id: string, fromCategoryId: string, toCategoryId: string): ClusterLink {
    return { id, fromCategoryId, toCategoryId, label: 'x', directed: true, createdAt: '0' }
  }

  it('only shows a link when both endpoint categories have a cluster on this board', () => {
    const onBoard: BoardCluster[] = [
      { id: 'c1', boardId: 'b1', categoryId: 'A', x: 0, y: 0, width: 1, height: 1, createdAt: '0' },
      { id: 'c2', boardId: 'b1', categoryId: 'B', x: 0, y: 0, width: 1, height: 1, createdAt: '0' }
    ]
    const links = [link('l1', 'A', 'B'), link('l2', 'A', 'not-on-board')]
    expect(getVisibleClusterLinks(links, onBoard).map((l) => l.id)).toEqual(['l1'])
  })
})

describe('getStructuralNestingEdges', () => {
  it('finds no edge when a child cluster is still fully contained in its parent (the default board, Radial)', () => {
    const categories = [makeCategory('parent'), makeCategory('child', { parentCategoryId: 'parent' })]
    const clusters: BoardCluster[] = [
      { id: 'p', boardId: 'b1', categoryId: 'parent', x: 0, y: 0, width: 400, height: 400, createdAt: '0' },
      { id: 'c', boardId: 'b1', categoryId: 'child', x: 20, y: 20, width: 100, height: 100, createdAt: '0' }
    ]
    expect(getStructuralNestingEdges(clusters, categories)).toEqual([])
  })

  it('reports an edge once a child is laid out beside its parent instead of inside it — the exact Tree bug reported', () => {
    const categories = [makeCategory('parent'), makeCategory('child', { parentCategoryId: 'parent' })]
    const clusters: BoardCluster[] = [
      { id: 'p', boardId: 'b1', categoryId: 'parent', x: 0, y: 0, width: 200, height: 100, createdAt: '0' },
      // Tree's actual arrangement: the child sits in its own row below the
      // parent, not inside its rectangle.
      { id: 'c', boardId: 'b1', categoryId: 'child', x: 0, y: 200, width: 200, height: 100, createdAt: '0' }
    ]
    expect(getStructuralNestingEdges(clusters, categories)).toEqual([
      { parentClusterId: 'p', childClusterId: 'c' }
    ])
  })

  it('ignores a category whose parent has no cluster on this board', () => {
    const categories = [makeCategory('parent'), makeCategory('child', { parentCategoryId: 'parent' })]
    const clusters: BoardCluster[] = [
      { id: 'c', boardId: 'b1', categoryId: 'child', x: 0, y: 0, width: 100, height: 100, createdAt: '0' }
    ]
    expect(getStructuralNestingEdges(clusters, categories)).toEqual([])
  })

  it('reports one edge per level for a three-generation chain laid out as a Tree', () => {
    const categories = [
      makeCategory('grandparent'),
      makeCategory('parent', { parentCategoryId: 'grandparent' }),
      makeCategory('child', { parentCategoryId: 'parent' })
    ]
    const clusters: BoardCluster[] = [
      { id: 'gp', boardId: 'b1', categoryId: 'grandparent', x: 0, y: 0, width: 100, height: 100, createdAt: '0' },
      { id: 'p', boardId: 'b1', categoryId: 'parent', x: 0, y: 200, width: 100, height: 100, createdAt: '0' },
      { id: 'c', boardId: 'b1', categoryId: 'child', x: 0, y: 400, width: 100, height: 100, createdAt: '0' }
    ]
    expect(getStructuralNestingEdges(clusters, categories)).toEqual([
      { parentClusterId: 'gp', childClusterId: 'p' },
      { parentClusterId: 'p', childClusterId: 'c' }
    ])
  })
})

describe('segmentIntersectsBox', () => {
  const box = { x: 100, y: 100, width: 100, height: 100 } // spans (100,100)-(200,200)

  it('detects a segment passing straight through the box', () => {
    expect(segmentIntersectsBox(0, 150, 300, 150, box)).toBe(true)
  })

  it('detects a segment entirely missing the box', () => {
    expect(segmentIntersectsBox(0, 0, 300, 50, box)).toBe(false)
  })

  it('detects a segment whose endpoint sits inside the box', () => {
    expect(segmentIntersectsBox(150, 150, 400, 400, box)).toBe(true)
  })

  it('does not flag a segment that only passes near, not through, the box', () => {
    expect(segmentIntersectsBox(0, 0, 300, 90, box)).toBe(false)
  })
})

describe('computeClusterLinkPath', () => {
  const left = { x: 0, y: 0, width: 100, height: 100 } // center (50,50)
  const right = { x: 400, y: 0, width: 100, height: 100 } // center (450,50)

  it('draws a plain straight line when nothing obstructs and there is no parallel sibling', () => {
    const path = computeClusterLinkPath(left, right, [], 0, 1)
    expect(path.curved).toBe(false)
    // Endpoints clipped to each box's own edge (the boxes are horizontally
    // aligned, so the exit points sit on their facing vertical edges).
    expect(path.ax).toBeCloseTo(100, 5)
    expect(path.ay).toBeCloseTo(50, 5)
    expect(path.bx).toBeCloseTo(400, 5)
    expect(path.by).toBeCloseTo(50, 5)
  })

  it('bows around a third cluster sitting directly between the two endpoints', () => {
    // Well clear of the canvas origin (unlike `left`/`right` above) so the
    // top/left clamp tested separately below is a no-op here — this test
    // is only about the curving itself.
    const farLeft = { x: 500, y: 500, width: 100, height: 100 } // center (550,550)
    const farRight = { x: 900, y: 500, width: 100, height: 100 } // center (950,550)
    const obstruction = { x: 700, y: 520, width: 100, height: 60 } // straddles the straight path's y=550 line
    const path = computeClusterLinkPath(farLeft, farRight, [obstruction], 0, 1)
    expect(path.curved).toBe(true)
    // Bows perpendicular to a horizontal line, i.e. vertically, away from
    // the obstruction — some non-zero vertical displacement at the curve's
    // own midpoint (a quadratic Bézier's t=0.5 point sits halfway between
    // the straight midpoint and the control point, so this is smaller than
    // the raw clearing offset computed internally — a real, visible bow,
    // not the full computed clearance), while endpoints stay anchored to
    // the boxes themselves.
    expect(Math.abs(path.midY - 550)).toBeGreaterThan(20)
    expect(path.ax).toBeCloseTo(600, 5)
    expect(path.bx).toBeCloseTo(900, 5)
  })

  it("never bows a curve above the canvas's own top/left edge — the exact reported bug", () => {
    // Real-world report: a link near the top row of a board, needing to
    // clear an obstruction, bowed upward past y=0 — there's no negative
    // coordinate space to render into (no negative scroll, and an <svg>
    // with explicit width/height clips anything before its own origin),
    // so the curve's arc was simply cut off above the visible canvas.
    // `left`/`right` sit right at the origin, same as a cluster near the
    // very top of a board — the obstruction below them needs the curve to
    // bow *up*, which is exactly the direction with no room to spare.
    const obstruction = { x: 200, y: 20, width: 100, height: 60 }
    const path = computeClusterLinkPath(left, right, [obstruction], 0, 1)
    expect(path.curved).toBe(true)
    expect(path.controlY).toBeGreaterThanOrEqual(0)
    expect(path.midY).toBeGreaterThanOrEqual(0)
  })

  it("style: 'straight' never curves, even with an obstruction that would otherwise force it", () => {
    const obstruction = { x: 200, y: 20, width: 100, height: 60 }
    const path = computeClusterLinkPath(left, right, [obstruction], 0, 1, 'straight')
    expect(path.curved).toBe(false)
    expect(path.midX).toBeCloseTo(250, 5)
    expect(path.midY).toBeCloseTo(50, 5)
  })

  it("style: 'straight' never offsets a parallel pair either — a deliberate, simpler tradeoff", () => {
    const first = computeClusterLinkPath(left, right, [], 0, 2, 'straight')
    const second = computeClusterLinkPath(left, right, [], 1, 2, 'straight')
    expect(first.curved).toBe(false)
    expect(second.curved).toBe(false)
    expect(first.midY).toBeCloseTo(second.midY, 5)
  })

  it('ignores an obstruction the straight path never actually crosses', () => {
    const farAway = { x: 200, y: 500, width: 50, height: 50 }
    const path = computeClusterLinkPath(left, right, [farAway], 0, 1)
    expect(path.curved).toBe(false)
  })

  it('offsets parallel links between the same pair to opposite sides, symmetrically', () => {
    const first = computeClusterLinkPath(left, right, [], 0, 2)
    const second = computeClusterLinkPath(left, right, [], 1, 2)
    expect(first.curved).toBe(true)
    expect(second.curved).toBe(true)
    // Opposite sides of the straight midpoint, equal distance from it.
    expect(first.midY - 50).toBeCloseTo(-(second.midY - 50), 5)
    expect(Math.abs(first.midY - 50)).toBeGreaterThan(0)
  })

  it('lets a real obstruction override a smaller parallel offset', () => {
    const obstruction = { x: 200, y: 20, width: 200, height: 200 } // large — needs a big clearance
    const withoutObstruction = computeClusterLinkPath(left, right, [], 0, 2)
    const withObstruction = computeClusterLinkPath(left, right, [obstruction], 0, 2)
    expect(Math.abs(withObstruction.midY - 50)).toBeGreaterThan(Math.abs(withoutObstruction.midY - 50))
  })

  it('never produces NaN for two boxes at the exact same position (degenerate case)', () => {
    const same = { x: 0, y: 0, width: 100, height: 100 }
    const path = computeClusterLinkPath(same, same, [], 0, 1)
    expect(Number.isNaN(path.ax)).toBe(false)
    expect(Number.isNaN(path.midX)).toBe(false)
    expect(path.curved).toBe(false)
  })
})

describe('applyClusterPositions', () => {
  it('repositions only the clusters named in the given positions, leaving others untouched', () => {
    const data = makeData({
      boardClusters: [
        { id: 'c1', boardId: 'b1', categoryId: 'A', x: 0, y: 0, width: 10, height: 10, createdAt: '0' },
        { id: 'c2', boardId: 'b1', categoryId: 'B', x: 5, y: 5, width: 10, height: 10, createdAt: '0' }
      ]
    })
    const next = applyClusterPositions(data, [{ id: 'c1', x: 100, y: 200 }])
    expect(next.boardClusters.find((c) => c.id === 'c1')).toMatchObject({ x: 100, y: 200 })
    expect(next.boardClusters.find((c) => c.id === 'c2')).toMatchObject({ x: 5, y: 5 })
  })
})

describe('applyClusterLayoutWithMembers', () => {
  it('carries a cluster\'s member codes/notes along with it by the same delta — the exact reported bug', () => {
    const category = makeCategory('A', { codeIds: ['code1'], noteIds: ['note1'] })
    const data = makeData({
      categories: [category],
      boardClusters: [{ id: 'c1', boardId: 'b1', categoryId: 'A', x: 0, y: 0, width: 280, height: 200, createdAt: '0' }],
      boardItems: [
        { id: 'i1', boardId: 'b1', refType: 'code', refId: 'code1', x: 20, y: 40 },
        { id: 'i2', boardId: 'b1', refType: 'note', refId: 'note1', x: 40, y: 80 }
      ]
    })
    const next = applyClusterLayoutWithMembers(data, 'b1', [{ id: 'c1', x: 500, y: 700 }])
    // Cluster moved by (+500, +700) -> every member should move by exactly that too.
    expect(next.boardItems.find((i) => i.id === 'i1')).toMatchObject({ x: 520, y: 740 })
    expect(next.boardItems.find((i) => i.id === 'i2')).toMatchObject({ x: 540, y: 780 })
  })

  it('leaves items on a different board, or not a member of any moved cluster, untouched', () => {
    const category = makeCategory('A', { codeIds: ['code1'] })
    const unclustered = makeCategory('B')
    const data = makeData({
      categories: [category, unclustered],
      boardClusters: [{ id: 'c1', boardId: 'b1', categoryId: 'A', x: 0, y: 0, width: 280, height: 200, createdAt: '0' }],
      boardItems: [
        { id: 'i1', boardId: 'b1', refType: 'code', refId: 'code1', x: 20, y: 40 },
        { id: 'i2', boardId: 'b1', refType: 'code', refId: 'unrelated', x: 20, y: 40 },
        { id: 'i3', boardId: 'other-board', refType: 'code', refId: 'code1', x: 20, y: 40 }
      ]
    })
    const next = applyClusterLayoutWithMembers(data, 'b1', [{ id: 'c1', x: 500, y: 700 }])
    expect(next.boardItems.find((i) => i.id === 'i2')).toMatchObject({ x: 20, y: 40 })
    expect(next.boardItems.find((i) => i.id === 'i3')).toMatchObject({ x: 20, y: 40 })
  })

  it('a cluster that did not move in this pass leaves its members untouched too', () => {
    const category = makeCategory('A', { codeIds: ['code1'] })
    const data = makeData({
      categories: [category],
      boardClusters: [{ id: 'c1', boardId: 'b1', categoryId: 'A', x: 0, y: 0, width: 280, height: 200, createdAt: '0' }],
      boardItems: [{ id: 'i1', boardId: 'b1', refType: 'code', refId: 'code1', x: 20, y: 40 }]
    })
    // Same position as it already had -> zero delta -> no-op for its members.
    const next = applyClusterLayoutWithMembers(data, 'b1', [{ id: 'c1', x: 0, y: 0 }])
    expect(next.boardItems.find((i) => i.id === 'i1')).toMatchObject({ x: 20, y: 40 })
  })

  it('cascades a moved root\'s delta down to a nested cluster not itself in `positions` — the Radial fix', () => {
    // Radial only ever computes positions for roots (see computeRadialLayout);
    // this is what keeps a nested cluster (and its own members) moving
    // together with its ancestor instead of being left behind.
    const root = makeCategory('root')
    const nested = makeCategory('nested', { parentCategoryId: 'root', codeIds: ['code1'] })
    const data = makeData({
      categories: [root, nested],
      boardClusters: [
        { id: 'rootCluster', boardId: 'b1', categoryId: 'root', x: 0, y: 0, width: 280, height: 400, createdAt: '0' },
        { id: 'nestedCluster', boardId: 'b1', categoryId: 'nested', x: 20, y: 60, width: 200, height: 100, createdAt: '0' }
      ],
      boardItems: [{ id: 'i1', boardId: 'b1', refType: 'code', refId: 'code1', x: 40, y: 100 }]
    })
    // Only the root is in `positions` — moved by (+500, +300).
    const next = applyClusterLayoutWithMembers(data, 'b1', [{ id: 'rootCluster', x: 500, y: 300 }])
    expect(next.boardClusters.find((c) => c.id === 'nestedCluster')).toMatchObject({ x: 520, y: 360 })
    expect(next.boardItems.find((i) => i.id === 'i1')).toMatchObject({ x: 540, y: 400 })
  })

  it('cascades transitively through multiple nesting levels', () => {
    const root = makeCategory('root')
    const child = makeCategory('child', { parentCategoryId: 'root' })
    const grandchild = makeCategory('grandchild', { parentCategoryId: 'child' })
    const data = makeData({
      categories: [root, child, grandchild],
      boardClusters: [
        { id: 'rootC', boardId: 'b1', categoryId: 'root', x: 0, y: 0, width: 280, height: 600, createdAt: '0' },
        { id: 'childC', boardId: 'b1', categoryId: 'child', x: 20, y: 60, width: 240, height: 300, createdAt: '0' },
        { id: 'grandchildC', boardId: 'b1', categoryId: 'grandchild', x: 40, y: 120, width: 200, height: 100, createdAt: '0' }
      ]
    })
    const next = applyClusterLayoutWithMembers(data, 'b1', [{ id: 'rootC', x: 1000, y: 1000 }])
    expect(next.boardClusters.find((c) => c.id === 'grandchildC')).toMatchObject({ x: 1040, y: 1120 })
  })
})

describe('computeNestedLayout', () => {
  function cluster(id: string, categoryId: string, x = 0, y = 0, width = 100, height = 100): BoardCluster {
    return { id, boardId: 'b1', categoryId, x, y, width, height, createdAt: '0' }
  }

  it("restores containment after Tree separated a parent from its children — the reported follow-up bug", () => {
    // Exactly the scenario reported: a supercluster with no codes/notes of
    // its own, holding 2 clusters that DO have codes — after Tree, they sit
    // in a separate row, disconnected; computeNestedLayout should put the
    // child back genuinely *inside* the parent's box, not just move it near.
    const categories: CategoryRecord[] = [
      makeCategory('super'),
      makeCategory('c1', { parentCategoryId: 'super', codeIds: ['x1', 'x2'] }),
      makeCategory('c2', { parentCategoryId: 'super', codeIds: ['x3'] })
    ]
    // Positions as Tree would have left them: parent small and far above,
    // children in a separate row far below — nothing here is contained.
    const clusters = [
      cluster('super', 'super', 2000, 40, 280, 200),
      cluster('c1', 'c1', 0, 500, 300, 200),
      cluster('c2', 'c2', 400, 500, 300, 200)
    ]
    const positions = computeNestedLayout(clusters, categories)
    const byId = new Map(positions.map((p) => [p.id, p]))
    // computeNestedLayout always sets width/height (it's driven entirely by
    // a fresh computeCategoryLayout pass) — non-null assertions are safe here.
    const superPos = byId.get('super')!
    const c1Pos = byId.get('c1')!
    const c2Pos = byId.get('c2')!

    function contains(outer: ClusterPosition, inner: ClusterPosition): boolean {
      return (
        inner.x >= outer.x &&
        inner.y >= outer.y &&
        inner.x + inner.width! <= outer.x + outer.width! &&
        inner.y + inner.height! <= outer.y + outer.height!
      )
    }
    expect(contains(superPos, c1Pos)).toBe(true)
    expect(contains(superPos, c2Pos)).toBe(true)
  })

  it('positions every cluster on the board, root and nested alike, same contract as computeTreeLayout', () => {
    const categories: CategoryRecord[] = [makeCategory('A'), makeCategory('B', { parentCategoryId: 'A' })]
    const clusters = [cluster('a', 'A', 900, 900), cluster('b', 'B', 900, 900)]
    const positions = computeNestedLayout(clusters, categories)
    expect(positions.map((p) => p.id).sort()).toEqual(['a', 'b'])
  })

  it('ignores a category not actually present on this board', () => {
    const categories: CategoryRecord[] = [makeCategory('A'), makeCategory('B')]
    const clusters = [cluster('a', 'A')]
    const positions = computeNestedLayout(clusters, categories)
    expect(positions.map((p) => p.id)).toEqual(['a'])
  })

  it('compact: true resizes clusters already on the board, not just future ones — the reported follow-up request', () => {
    // A cluster with plenty of codes, already placed at its normal
    // item-reserving size (as "+ Add all clusters" without Compact would
    // have left it) — toggling Compact afterward should shrink it in
    // place, not just affect whatever gets added from here on.
    const rich = makeCategory('A', { codeIds: Array.from({ length: 40 }, (_, i) => `c${i}`) })
    const clusters = [cluster('a', 'A', 100, 100, 600, 500)]
    const full = computeNestedLayout(clusters, [rich], false)
    const compact = computeNestedLayout(clusters, [rich], true)
    const fullPos = full.find((p) => p.id === 'a')!
    const compactPos = compact.find((p) => p.id === 'a')!
    expect(compactPos.width!).toBeLessThan(fullPos.width!)
    expect(compactPos.height!).toBeLessThan(fullPos.height!)
  })
})

describe('computeTreeLayout', () => {
  function cluster(id: string, categoryId: string, width = 100, height = 100): BoardCluster {
    return { id, boardId: 'b1', categoryId, x: 0, y: 0, width, height, createdAt: '0' }
  }

  it('stacks a parent above its children, one row per depth', () => {
    const clusters = [cluster('root', 'A'), cluster('child', 'B')]
    const categories: CategoryRecord[] = [
      { id: 'A', kind: 'theme', name: 'A', color: '#fff', definition: '', codeIds: [], noteIds: [], segmentIds: [], parentCategoryId: null, createdAt: '0' },
      { id: 'B', kind: 'theme', name: 'B', color: '#fff', definition: '', codeIds: [], noteIds: [], segmentIds: [], parentCategoryId: 'A', createdAt: '0' }
    ]
    const positions = computeTreeLayout(clusters, categories)
    const byId = new Map(positions.map((p) => [p.id, p]))
    expect(byId.get('child')!.y).toBeGreaterThan(byId.get('root')!.y)
  })

  it('treats a category whose parent has no cluster on this board as its own root', () => {
    // Only 'B' is actually on the board — its parent 'A' isn't, so it must
    // not crash looking for a parent slot that was never placed here.
    const clusters = [cluster('onlyChild', 'B')]
    const categories: CategoryRecord[] = [
      { id: 'A', kind: 'theme', name: 'A', color: '#fff', definition: '', codeIds: [], noteIds: [], segmentIds: [], parentCategoryId: null, createdAt: '0' },
      { id: 'B', kind: 'theme', name: 'B', color: '#fff', definition: '', codeIds: [], noteIds: [], segmentIds: [], parentCategoryId: 'A', createdAt: '0' }
    ]
    const positions = computeTreeLayout(clusters, categories)
    expect(positions).toHaveLength(1)
  })

  it('a wide subtree pushes its next sibling root further right, never overlapping', () => {
    const clusters = [
      cluster('rootA', 'A'),
      cluster('childA1', 'B', 300),
      cluster('childA2', 'C', 300),
      cluster('rootD', 'D')
    ]
    const categories: CategoryRecord[] = [
      { id: 'A', kind: 'theme', name: 'A', color: '#fff', definition: '', codeIds: [], noteIds: [], segmentIds: [], parentCategoryId: null, createdAt: '0' },
      { id: 'B', kind: 'theme', name: 'B', color: '#fff', definition: '', codeIds: [], noteIds: [], segmentIds: [], parentCategoryId: 'A', createdAt: '0' },
      { id: 'C', kind: 'theme', name: 'C', color: '#fff', definition: '', codeIds: [], noteIds: [], segmentIds: [], parentCategoryId: 'A', createdAt: '0' },
      { id: 'D', kind: 'theme', name: 'D', color: '#fff', definition: '', codeIds: [], noteIds: [], segmentIds: [], parentCategoryId: null, createdAt: '0' }
    ]
    const positions = computeTreeLayout(clusters, categories)
    const byId = new Map(positions.map((p) => [p.id, p]))
    // rootD must clear the whole (wide) subtree under rootA, not just rootA's own narrow width.
    expect(byId.get('rootD')!.x).toBeGreaterThanOrEqual(byId.get('childA1')!.x + 300)
  })

  it("a parent with children on the board is resized to its own content, not the size it needed to contain them — the exact reported bug", () => {
    // The real bug, found via a real exported board: a supercluster with no
    // codes/notes of its own (all its "size" came from containing its 5
    // children in a prior Standard/default-board layout) kept that huge
    // contains-children box in Tree mode even once its children moved to
    // their own row far below — reading as completely disconnected, not
    // "arranged as a tree". A parent must shrink to computeOwnClusterSize
    // once its children are laid out separately.
    const parent = cluster('parent', 'A', 2340, 568) // real dimensions from the project that surfaced this
    const child = cluster('child', 'B', 1140, 500)
    const categories: CategoryRecord[] = [
      makeCategory('A'), // no own codeIds/noteIds — its old size was purely for containment
      makeCategory('B', { parentCategoryId: 'A' })
    ]
    const positions = computeTreeLayout([parent, child], categories)
    const byId = new Map(positions.map((p) => [p.id, p]))
    const expectedParentSize = computeOwnClusterSize(categories[0])
    expect(byId.get('parent')).toMatchObject(expectedParentSize)
    // ...and the child's row clears the *resized* (small) parent, not the
    // original 568px-tall containment box.
    const parentBottom = byId.get('parent')!.y + expectedParentSize.height
    expect(byId.get('child')!.y).toBeGreaterThanOrEqual(parentBottom)
  })

  it('a parent that also has its own codes/notes is resized to fit those, not shrunk to an empty header', () => {
    // A mixed case: 'A' holds 20 codes of its own *and* has a child on the
    // board — its Tree-mode size should reflect its own 20 codes, not
    // collapse to the bare-header minimum the previous test's childless
    // parent gets.
    const categories: CategoryRecord[] = [
      makeCategory('A', { codeIds: Array.from({ length: 20 }, (_, i) => `code${i}`) }),
      makeCategory('B', { parentCategoryId: 'A' })
    ]
    const parent = cluster('parent', 'A', 280, 200)
    const child = cluster('child', 'B', 100, 100)
    const positions = computeTreeLayout([parent, child], categories)
    const byId = new Map(positions.map((p) => [p.id, p]))
    const expectedParentSize = computeOwnClusterSize(categories[0])
    expect(expectedParentSize.height).toBeGreaterThan(200) // taller than the bare-header minimum
    expect(byId.get('parent')).toMatchObject(expectedParentSize)
  })

  it('a leaf (no children on the board) keeps its own real size untouched', () => {
    const categories: CategoryRecord[] = [makeCategory('A'), makeCategory('B', { parentCategoryId: 'A' })]
    const parent = cluster('parent', 'A', 2340, 568)
    const child = cluster('child', 'B', 1140, 500)
    const positions = computeTreeLayout([parent, child], categories)
    const byId = new Map(positions.map((p) => [p.id, p]))
    // 'B' has no children of its own on this board — a plain leaf, unresized.
    expect(byId.get('child')).toMatchObject({ width: 1140, height: 500 })
  })

  it('a shared row per depth clears the tallest *effective* node in any branch, not its original size', () => {
    // 'tallRoot' had a huge original height purely from containing its
    // child in some earlier layout, but has no codes/notes of its own —
    // once resized for Tree, its effective height is small, and the shared
    // depth-1 row only needs to clear *that*, not the stale 600px value.
    const tallRoot = cluster('tallRoot', 'A', 100, 600)
    const tallChild = cluster('tallChild', 'B', 100, 100)
    const shortRoot = cluster('shortRoot', 'C', 100, 100)
    const shortChild = cluster('shortChild', 'D', 100, 100)
    const categories: CategoryRecord[] = [
      makeCategory('A'),
      makeCategory('B', { parentCategoryId: 'A' }),
      makeCategory('C'),
      makeCategory('D', { parentCategoryId: 'C' })
    ]
    const positions = computeTreeLayout([tallRoot, tallChild, shortRoot, shortChild], categories)
    const byId = new Map(positions.map((p) => [p.id, p]))
    const effectiveTallRootHeight = computeOwnClusterSize(categories[0]).height
    // Both depth-1 children land on the same shared row...
    expect(byId.get('tallChild')!.y).toBe(byId.get('shortChild')!.y)
    // ...and that row clears the *resized* tall root's bottom, not its
    // stale 600px original height.
    expect(byId.get('shortChild')!.y).toBeGreaterThanOrEqual(byId.get('tallRoot')!.y + effectiveTallRootHeight)
    expect(effectiveTallRootHeight).toBeLessThan(600)
  })
})

describe('computeRadialLayout', () => {
  function cluster(id: string, categoryId: string, x = 0, y = 0, width = 100, height = 100): BoardCluster {
    return { id, boardId: 'b1', categoryId, x, y, width, height, createdAt: '0' }
  }
  // All-root categories, matching each cluster's categoryId — most tests
  // here aren't about nesting, so this keeps every category a root by
  // default (see the dedicated nesting-awareness tests below for the rest).
  function flatCategories(categoryIds: string[]): CategoryRecord[] {
    return categoryIds.map((id) => makeCategory(id))
  }

  it('returns nothing for an empty board', () => {
    expect(computeRadialLayout([], [], null)).toEqual([])
  })

  it('a single cluster stays exactly where it is', () => {
    const positions = computeRadialLayout([cluster('only', 'A', 50, 60)], flatCategories(['A']), null)
    expect(positions).toEqual([{ id: 'only', x: 50, y: 60 }])
  })

  it('keeps the focus cluster in place and spreads the rest around it, equidistant from center', () => {
    // Well clear of the canvas origin (further than the layout's own
    // radius) so keepPositionsOnBoard's safety net (tested separately
    // below) is a no-op here — this test is only about the radial geometry
    // itself.
    const focus = cluster('focus', 'A', 500, 500)
    const others = [cluster('b', 'B'), cluster('c', 'C'), cluster('d', 'D')]
    const positions = computeRadialLayout([focus, ...others], flatCategories(['A', 'B', 'C', 'D']), 'A')
    const byId = new Map(positions.map((p) => [p.id, p]))
    expect(byId.get('focus')).toEqual({ id: 'focus', x: 500, y: 500 })

    const centerX = focus.x + focus.width / 2
    const centerY = focus.y + focus.height / 2
    const distances = others.map((o) => {
      const pos = byId.get(o.id)!
      const cx = pos.x + o.width / 2
      const cy = pos.y + o.height / 2
      return Math.hypot(cx - centerX, cy - centerY)
    })
    // All three the same distance from the hub (within floating-point noise).
    expect(distances[1]).toBeCloseTo(distances[0], 5)
    expect(distances[2]).toBeCloseTo(distances[0], 5)
  })

  it('falls back to the first cluster as focus when focusCategoryId matches nothing on the board', () => {
    // Well clear of the origin, same reasoning as above — this test is
    // only about which cluster becomes the focus, not the safety net.
    const positions = computeRadialLayout(
      [cluster('only', 'A', 500, 500), cluster('other', 'B')],
      flatCategories(['A', 'B']),
      'missing'
    )
    expect(positions.find((p) => p.id === 'only')).toEqual({ id: 'only', x: 500, y: 500 })
  })

  it('never places a cluster at a negative coordinate, even when the focus starts near the canvas origin', () => {
    // This is the exact bug reported from real use: a focus cluster near
    // (0, 0) — where a newly placed cluster commonly lands — pushed a
    // sibling to a negative x/y, off the negative edge of the canvas the
    // board's scroll container can never scroll to reach (unlike
    // overflowing the positive edge, which is always reachable).
    const focus = cluster('focus', 'A', 10, 10)
    const others = [cluster('b', 'B'), cluster('c', 'C'), cluster('d', 'D'), cluster('e', 'E')]
    const positions = computeRadialLayout([focus, ...others], flatCategories(['A', 'B', 'C', 'D', 'E']), 'A')
    for (const p of positions) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('only arranges root clusters in the ring — a nested cluster is excluded entirely, the exact reported bug', () => {
    // Real-world report: applying Radial to a board with superordinate
    // clusters scattered every one of their nested sub-clusters into the
    // same ring as the roots, discarding the nesting entirely.
    const categories: CategoryRecord[] = [
      makeCategory('root1'),
      makeCategory('root2'),
      makeCategory('nested', { parentCategoryId: 'root1' })
    ]
    const clusters = [cluster('root1', 'root1', 500, 500), cluster('root2', 'root2'), cluster('nested', 'nested', 520, 520)]
    const positions = computeRadialLayout(clusters, categories, 'root1')
    expect(positions.map((p) => p.id).sort()).toEqual(['root1', 'root2'])
  })

  it('treats a category whose parent has no cluster on this board as its own root, same as computeTreeLayout', () => {
    const categories: CategoryRecord[] = [makeCategory('A', { parentCategoryId: 'not-on-board' })]
    const positions = computeRadialLayout([cluster('only', 'A', 50, 60)], categories, null)
    expect(positions).toEqual([{ id: 'only', x: 50, y: 60 }])
  })

  it("sizes the ring's radius to clear the largest satellite, not just the focus", () => {
    // Far enough from the origin in every direction that keepPositionsOnBoard's
    // safety net never has to shift anything — otherwise the *positioned*
    // focus would no longer match this local `focus` variable's own x/y.
    const focus = cluster('focus', 'A', 1000, 1000, 100, 100)
    const bigOther = cluster('big', 'B', 0, 0, 900, 700) // a superordinate-sized box
    const positions = computeRadialLayout(
      [focus, bigOther, cluster('c', 'C')],
      flatCategories(['A', 'B', 'C']),
      'A'
    )
    const bigPos = positions.find((p) => p.id === 'big')!
    const centerX = focus.x + focus.width / 2
    const centerY = focus.y + focus.height / 2
    const bigCx = bigPos.x + bigOther.width / 2
    const bigCy = bigPos.y + bigOther.height / 2
    const dist = Math.hypot(bigCx - centerX, bigCy - centerY)
    // The ring has to clear half the big satellite's own largest dimension
    // (900/2 = 450) on top of the base step, or it would overlap the focus.
    expect(dist).toBeGreaterThan(450)
  })
})

describe('findAlignmentSnap', () => {
  const SIZE = { width: 100, height: 100 }

  it('snaps to a left/left edge match and reports the matching guide', () => {
    const others = [{ x: 300, y: 500, width: 100, height: 100 }]
    // Dragged rect's left edge (302) is within tolerance of other's left (300).
    const result = findAlignmentSnap(302, 10, SIZE, others)
    expect(result.x).toBe(300)
    expect(result.guides).toContainEqual({ axis: 'x', position: 300 })
  })

  it('snaps center-to-center, independently of the left-edge snap', () => {
    // Self center would be at x + 50; align it with other's center (350).
    const others = [{ x: 300, y: 0, width: 100, height: 100 }]
    const result = findAlignmentSnap(298, 10, SIZE, others)
    expect(result.x).toBe(300) // self center 300+50=350 matches other's center 300+50=350
  })

  it('snaps x and y independently — a match on one axis does not require one on the other', () => {
    const others = [{ x: 300, y: 900, width: 100, height: 100 }]
    const result = findAlignmentSnap(301, 10, SIZE, others) // x close, y far
    expect(result.x).toBe(300)
    expect(result.y).toBe(10) // untouched — no y candidate within tolerance
  })

  it('does nothing when nothing is within tolerance', () => {
    const others = [{ x: 900, y: 900, width: 100, height: 100 }]
    const result = findAlignmentSnap(10, 10, SIZE, others)
    expect(result).toEqual({ x: 10, y: 10, guides: [] })
  })

  it('reports a guide for every other cluster sharing the matched position, not just the closest', () => {
    const others = [
      { x: 300, y: 0, width: 100, height: 100 },
      { x: 300, y: 700, width: 100, height: 100 }
    ]
    const result = findAlignmentSnap(302, 10, SIZE, others)
    expect(result.guides.filter((g) => g.axis === 'x' && g.position === 300)).toHaveLength(1) // de-duped, not one per source
  })
})

describe('findDistributionSnap', () => {
  const SIZE = { width: 100, height: 100 }

  it('snaps to the exact midpoint between two clusters that already roughly straddle it, same row', () => {
    // a centered at x=150, b centered at x=650 -> exact midpoint is x=400.
    const a = { x: 100, y: 200, width: 100, height: 100 }
    const b = { x: 600, y: 200, width: 100, height: 100 }
    // Dragged rect's tentative center is x=395 (close to the 400 midpoint), same row (y=200).
    const result = findDistributionSnap(345, 200, SIZE, [a, b])
    expect(result.x).toBe(350) // center becomes 400 -> x = 400 - width/2
    expect(result.guides).toHaveLength(1)
    expect(result.guides[0]).toMatchObject({ axis: 'x', beforeCenter: 150, afterCenter: 650 })
  })

  it('does not suggest a pair that is not roughly in the same row/column', () => {
    const a = { x: 100, y: 0, width: 100, height: 100 } // far above
    const b = { x: 600, y: 900, width: 100, height: 100 } // far below
    const result = findDistributionSnap(340, 200, SIZE, [a, b])
    expect(result.guides).toEqual([])
    expect(result).toMatchObject({ x: 340, y: 200 })
  })

  it('does not suggest anything when already-equal spacing is too far from the tentative position', () => {
    const a = { x: 0, y: 200, width: 100, height: 100 }
    const b = { x: 1000, y: 200, width: 100, height: 100 }
    // Midpoint would be far from where the rect actually is.
    const result = findDistributionSnap(10, 200, SIZE, [a, b])
    expect(result.guides).toEqual([])
  })

  it('handles x and y distribution independently, each against its own row/column', () => {
    // aX/bX share the dragged rect's row (y-center 248) and straddle it in x;
    // aY/bY share its column (x-center 398) and straddle it in y. Neither
    // pair is close enough on the cross axis to contaminate the other's
    // guide (the row/column band is 80, and these are ~200 apart).
    const aX = { x: 100, y: 198, width: 100, height: 100 } // center (150, 248)
    const bX = { x: 600, y: 198, width: 100, height: 100 } // center (650, 248)
    const aY = { x: 348, y: 0, width: 100, height: 100 } // center (398, 50)
    const bY = { x: 348, y: 396, width: 100, height: 100 } // center (398, 446)
    const result = findDistributionSnap(348, 198, SIZE, [aX, bX, aY, bY]) // center (398, 248)
    expect(result).toMatchObject({ x: 350, y: 198 }) // x-center snaps to the exact midpoint, 400
    expect(result.guides).toContainEqual({ axis: 'x', beforeCenter: 150, selfCenter: 400, afterCenter: 650 })
    expect(result.guides).toContainEqual({ axis: 'y', beforeCenter: 50, selfCenter: 248, afterCenter: 446 })
  })
})

describe('resolveResizeEnclosure', () => {
  const board = { id: 'b1', name: 'Main', isDefault: true }
  function box(categoryId: string, x: number, y: number, width: number, height: number): BoardCluster {
    return { id: `real:${categoryId}`, boardId: 'b1', categoryId, x, y, width, height, createdAt: '0' }
  }

  it('never encloses an ancestor, even when the resized child geometrically covers it', () => {
    // A child sitting at its parent's exact top-left corner, resized bigger
    // than the parent: findClustersEnclosedBy alone says the parent is
    // "inside" the child's new box.
    const categories = [makeCategory('P'), makeCategory('C', { parentCategoryId: 'P' })]
    const clusters = [box('P', 0, 0, 1000, 800), box('C', 0, 0, 280, 200)]
    const result = resolveResizeEnclosure(clusters, categories, { x: 0, y: 0, width: 1200, height: 900 }, 'C')
    expect(result).toEqual([])
    void board
  })

  it('nests a cluster that has its own sub-clusters as one unit, not flattened level by level', () => {
    const categories = [
      makeCategory('S'),
      makeCategory('Q'),
      makeCategory('R', { parentCategoryId: 'Q' }),
      makeCategory('T')
    ]
    const clusters = [
      box('S', 0, 0, 300, 300),
      box('Q', 100, 100, 400, 400),
      box('R', 120, 148, 200, 150),
      box('T', 600, 100, 280, 200)
    ]
    const result = resolveResizeEnclosure(clusters, categories, { x: 0, y: 0, width: 1000, height: 1000 }, 'S')
    expect(result.sort()).toEqual(['Q', 'T'])
  })

  it('still excludes the resizing cluster itself and what is already nested under it', () => {
    const categories = [makeCategory('S'), makeCategory('already', { parentCategoryId: 'S' }), makeCategory('new')]
    const clusters = [box('S', 0, 0, 300, 300), box('already', 20, 48, 100, 100), box('new', 400, 400, 100, 100)]
    const result = resolveResizeEnclosure(clusters, categories, { x: 0, y: 0, width: 1000, height: 1000 }, 'S')
    expect(result).toEqual(['new'])
  })
})

describe('materializeChildClusters', () => {
  const board = { id: 'b1', name: 'Main', isDefault: true }

  it("is a no-op for a superordinate's children — they sit on its grid and rearrange by design", () => {
    const p = makeCategory('P')
    const a = makeCategory('a', { parentCategoryId: 'P' })
    const b = makeCategory('b', { parentCategoryId: 'P' })
    const pBox: BoardCluster = { id: 'realP', boardId: 'b1', categoryId: 'P', x: 0, y: 0, width: 2000, height: 2000, createdAt: '0' }
    const data = makeData({ boards: [board], categories: [p, a, b], boardClusters: [pBox] })
    expect(materializeChildClusters(data, 'b1', 'P')).toBe(data)
  })

  it('pins still-virtual roots when given null', () => {
    const data = makeData({ boards: [board], categories: [makeCategory('A'), makeCategory('B')] })
    const before = getVisibleBoardClusters(board, [], data.categories)
    const next = materializeChildClusters(data, 'b1', null)
    for (const id of ['A', 'B']) {
      const b = before.find((c) => c.categoryId === id)!
      expect(next.boardClusters.find((c) => c.categoryId === id)).toMatchObject({ x: b.x, y: b.y })
    }
  })

  // Regression: a group's packed positions depend on its whole membership
  // (column count, column width) — a cluster joining it can shift every
  // untouched virtual sibling. Pinning them *after* the join (what the
  // cluster-move commit used to do) froze them at the already-shifted
  // spots; pinning first keeps them where they were on screen.
  it('pinning the roots before a cluster is un-nested keeps them where they were', () => {
    const roots = ['a', 'b', 'c', 'd'].map((id) => makeCategory(id))
    const p = makeCategory('P')
    const x = makeCategory('X', { parentCategoryId: 'P' })
    const pBox: BoardCluster = { id: 'realP', boardId: 'b1', categoryId: 'P', x: 3000, y: 40, width: 600, height: 500, createdAt: '0' }
    const data = makeData({ boards: [board], categories: [...roots, p, x], boardClusters: [pBox] })
    const before = new Map(
      getVisibleBoardClusters(board, data.boardClusters, data.categories).map((c) => [c.categoryId, c])
    )

    const pinnedFirst = reparentCategory(materializeChildClusters(data, 'b1', null), 'X', null)
    const after = getVisibleBoardClusters(board, pinnedFirst.boardClusters, pinnedFirst.categories)
    for (const id of ['a', 'b', 'c', 'd']) {
      const b = before.get(id)!
      const a = after.find((c) => c.categoryId === id)!
      expect({ x: a.x, y: a.y }).toEqual({ x: b.x, y: b.y })
    }
  })
})

describe('resolveSiblingOverlaps', () => {
  const board = { id: 'b1', name: 'Main', isDefault: true }
  function box(categoryId: string, x: number, y: number, width: number, height: number): BoardCluster {
    return { id: `real:${categoryId}`, boardId: 'b1', categoryId, x, y, width, height, createdAt: '0' }
  }

  it('pushes an explicit sibling the anchor now overlaps to the nearest free spot, anchor unmoved', () => {
    const data = makeData({
      boards: [board],
      categories: [makeCategory('A'), makeCategory('B')],
      boardClusters: [box('A', 0, 0, 600, 400), box('B', 500, 100, 280, 200)]
    })
    const next = resolveSiblingOverlaps(data, 'b1', 'A')
    const a = next.boardClusters.find((c) => c.categoryId === 'A')!
    const b = next.boardClusters.find((c) => c.categoryId === 'B')!
    expect(a).toEqual(data.boardClusters[0])
    expect(rectsOverlap(a, b)).toBe(false)
    // Right was the smaller push (140) vs. down (340).
    expect(b.y).toBe(100)
    expect(b.x).toBeGreaterThanOrEqual(600)
  })

  it("carries a pushed sibling's nested sub-cluster and member cards along by the same delta", () => {
    const data = makeData({
      boards: [board],
      categories: [makeCategory('A'), makeCategory('B', { codeIds: ['m'] }), makeCategory('C', { parentCategoryId: 'B' })],
      codes: [makeCode('m')],
      boardClusters: [box('A', 0, 0, 600, 400), box('B', 500, 100, 280, 200), box('C', 520, 148, 100, 50)],
      boardItems: [{ id: 'im', boardId: 'b1', refType: 'code', refId: 'm', x: 520, y: 220 }]
    })
    const next = resolveSiblingOverlaps(data, 'b1', 'A')
    const b = next.boardClusters.find((c) => c.categoryId === 'B')!
    const c = next.boardClusters.find((c) => c.categoryId === 'C')!
    const m = next.boardItems.find((i) => i.refId === 'm')!
    const dx = b.x - 500
    const dy = b.y - 100
    expect(dx !== 0 || dy !== 0).toBe(true)
    expect({ x: c.x, y: c.y }).toEqual({ x: 520 + dx, y: 148 + dy })
    expect({ x: m.x, y: m.y }).toEqual({ x: 520 + dx, y: 220 + dy })
  })

  it('leaves everything alone when nothing overlaps, or when the anchor is still virtual', () => {
    const data = makeData({
      boards: [board],
      categories: [makeCategory('A'), makeCategory('B')],
      boardClusters: [box('A', 0, 0, 300, 200), box('B', 400, 0, 280, 200)]
    })
    expect(resolveSiblingOverlaps(data, 'b1', 'A')).toBe(data)
    const virtualAnchor = makeData({ boards: [board], categories: [makeCategory('A'), makeCategory('B')], boardClusters: [box('B', 0, 0, 280, 200)] })
    expect(resolveSiblingOverlaps(virtualAnchor, 'b1', 'A')).toBe(virtualAnchor)
  })

  it('ripples: a pushed sibling that would land on a third pushes that one along too', () => {
    const data = makeData({
      boards: [board],
      categories: [makeCategory('A'), makeCategory('B'), makeCategory('C')],
      boardClusters: [box('A', 0, 0, 600, 400), box('B', 500, 100, 280, 200), box('C', 660, 100, 280, 200)]
    })
    const next = resolveSiblingOverlaps(data, 'b1', 'A')
    const boxes = ['A', 'B', 'C'].map((id) => next.boardClusters.find((c) => c.categoryId === id)!)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(rectsOverlap(boxes[i], boxes[j])).toBe(false)
    }
  })

  it('never pushes a sibling to negative coordinates', () => {
    const data = makeData({
      boards: [board],
      categories: [makeCategory('A'), makeCategory('B')],
      boardClusters: [box('A', 100, 100, 600, 400), box('B', 0, 0, 280, 200)]
    })
    const next = resolveSiblingOverlaps(data, 'b1', 'A')
    const b = next.boardClusters.find((c) => c.categoryId === 'B')!
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.y).toBeGreaterThanOrEqual(0)
    expect(rectsOverlap(next.boardClusters.find((c) => c.categoryId === 'A')!, b)).toBe(false)
  })

  it('growing a parent to fit pushes the parent\'s own overlapped neighbor out of its way', () => {
    const p = makeCategory('P')
    const x = makeCategory('X', { parentCategoryId: 'P' })
    const r = makeCategory('R')
    const data = makeData({
      boards: [board],
      categories: [p, x, r],
      boardClusters: [box('P', 0, 0, 300, 300), box('X', 20, 48, 600, 200), box('R', 350, 0, 280, 200)]
    })
    const next = growAncestorClustersToFit(data, 'b1', 'X')
    const visible = getVisibleBoardClusters(board, next.boardClusters, next.categories)
    const pAfter = visible.find((c) => c.categoryId === 'P')!
    const rAfter = visible.find((c) => c.categoryId === 'R')!
    expect(pAfter.width).toBeGreaterThan(300)
    expect(rectsOverlap(pAfter, rAfter)).toBe(false)
  })
})

describe('getVisibleBoardItems flat-grid slot skipping', () => {
  it('an auto-placed unclustered card skips a slot a hand-placed card already covers', () => {
    const board = { id: 'b1', name: 'Main', isDefault: true }
    const first = computeGridPosition(0)
    const explicit: BoardItem = { id: 'i1', boardId: 'b1', refType: 'code', refId: 'c1', x: first.x, y: first.y }
    const items = getVisibleBoardItems(board, [explicit], [makeCode('c1'), makeCode('c2')], [], [], [])
    const c1 = items.find((i) => i.refId === 'c1')!
    const c2 = items.find((i) => i.refId === 'c2')!
    expect(Math.abs(c1.x - c2.x) < MEMBER_CARD_WIDTH && Math.abs(c1.y - c2.y) < MEMBER_CARD_HEIGHT).toBe(false)
  })
})

describe('resolveItemOverlaps', () => {
  const board = { id: 'b1', name: 'Main', isDefault: true }
  function card(id: string, refId: string, x: number, y: number): BoardItem {
    return { id, boardId: 'b1', refType: 'code', refId, x, y }
  }
  function overlapsCard(a: BoardItem, b: BoardItem): boolean {
    return Math.abs(a.x - b.x) < MEMBER_CARD_WIDTH && Math.abs(a.y - b.y) < MEMBER_CARD_HEIGHT
  }

  it('moves the card that was already there, not the dropped one', () => {
    const data = makeData({
      boards: [board],
      codes: [makeCode('a'), makeCode('b')],
      boardItems: [card('ia', 'a', 100, 100), card('ib', 'b', 120, 110)]
    })
    const next = resolveItemOverlaps(data, 'b1', ['ia'])
    const a = next.boardItems.find((i) => i.id === 'ia')!
    const b = next.boardItems.find((i) => i.id === 'ib')!
    expect({ x: a.x, y: a.y }).toEqual({ x: 100, y: 100 })
    expect(overlapsCard(a, b)).toBe(false)
  })

  it('ripples through a full row: dropping onto a grid of cards leaves no pair stacked', () => {
    // Three cards packed at the auto grid pitch, and a drop right on the middle one.
    const pitch = MEMBER_CARD_WIDTH + 8
    const data = makeData({
      boards: [board],
      codes: ['a', 'b', 'c', 'd'].map(makeCode),
      boardItems: [
        card('ia', 'a', 20, 48),
        card('ib', 'b', 20 + pitch, 48),
        card('ic', 'c', 20 + 2 * pitch, 48),
        card('id', 'd', 20 + pitch + 30, 60)
      ]
    })
    const next = resolveItemOverlaps(data, 'b1', ['id'])
    const items = next.boardItems
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) expect(overlapsCard(items[i], items[j])).toBe(false)
    }
    expect(items.find((i) => i.id === 'id')).toMatchObject({ x: 20 + pitch + 30, y: 60 })
  })

  it('ignores clustered cards entirely — they render at grid slots, not their stored positions', () => {
    const a = makeCategory('A', { codeIds: ['a', 'b'] })
    const data = makeData({
      boards: [board],
      categories: [a],
      codes: [makeCode('a'), makeCode('b')],
      boardItems: [card('ia', 'a', 20, 48), card('ib', 'b', 30, 60)]
    })
    expect(resolveItemOverlaps(data, 'b1', ['ia'])).toBe(data)
  })

  it('is a no-op when nothing overlaps', () => {
    const data = makeData({
      boards: [board],
      codes: [makeCode('a'), makeCode('b')],
      boardItems: [card('ia', 'a', 100, 100), card('ib', 'b', 500, 500)]
    })
    expect(resolveItemOverlaps(data, 'b1', ['ia'])).toBe(data)
  })
})

describe('clustered cards always sit on their cluster grid', () => {
  const board = { id: 'b1', name: 'Main', isDefault: true }

  it('renders an explicit clustered card at its grid slot, keeping its id, ignoring its stored position', () => {
    const a = makeCategory('A', { codeIds: ['c1', 'c2'] })
    const data = makeData({
      boards: [board],
      categories: [a],
      codes: [makeCode('c1'), makeCode('c2')],
      boardItems: [{ id: 'real1', boardId: 'b1', refType: 'code', refId: 'c1', x: 9000, y: 9000 }]
    })
    const clusters = getVisibleBoardClusters(board, [], data.categories)
    const withStored = getVisibleBoardItems(board, data.boardItems, data.codes, data.notes, data.categories, clusters)
    const allVirtual = getVisibleBoardItems(board, [], data.codes, data.notes, data.categories, clusters)
    const c1 = withStored.find((i) => i.refId === 'c1')!
    const c1Virtual = allVirtual.find((i) => i.refId === 'c1')!
    expect(c1.id).toBe('real1')
    expect({ x: c1.x, y: c1.y }).toEqual({ x: c1Virtual.x, y: c1Virtual.y })
    expect(rectContains(clusters[0], { ...clusters[0], x: c1.x, y: c1.y, width: MEMBER_CARD_WIDTH, height: MEMBER_CARD_HEIGHT })).toBe(true)
  })

  it('makes linked members touch even when the codebook order separates them', () => {
    const a = makeCategory('A', { codeIds: ['c1', 'c2', 'c3', 'c4'] })
    const items: BoardItem[] = [
      { id: 'i1', boardId: 'b1', refType: 'code', refId: 'c1', x: 0, y: 0 },
      { id: 'i4', boardId: 'b1', refType: 'code', refId: 'c4', x: 0, y: 0 }
    ]
    const data = makeData({
      boards: [board],
      categories: [a],
      codes: ['c1', 'c2', 'c3', 'c4'].map(makeCode),
      boardItems: items,
      boardLinks: [{ id: 'l', boardId: 'b1', itemAId: 'i1', itemBId: 'i4', createdAt: '0' }]
    })
    const clusters = getVisibleBoardClusters(board, [], data.categories)
    const visible = getVisibleBoardItems(board, items, data.codes, data.notes, data.categories, clusters, data.boardLinks)
    const byRef = (refId: string) => visible.find((i) => i.refId === refId)!
    // 4 members -> 2 columns: c1 c2 / c3 c4. The link is c1 (dragged) → c4
    // (aimed at), which sit diagonally. c4 stays put; c1 swaps with c4's
    // first unlinked neighbor — nothing to its right in that row, so the
    // one on its left, c3 — giving c3 c2 / c1 c4. Only c1 and c3 moved.
    expect(byRef('c4')).toMatchObject({ x: byRef('c2').x, y: byRef('c1').y })
    expect(byRef('c1').y).toBe(byRef('c4').y)
    expect(byRef('c1').x).toBeLessThan(byRef('c4').x)
    expect(byRef('c3').y).toBe(byRef('c2').y)
    expect(byRef('c3').x).toBeLessThan(byRef('c2').x)
  })

  it("shows an explicit box no smaller than its own card grid, so cards can't hang out of it", () => {
    const a = makeCategory('A', { codeIds: Array.from({ length: 9 }, (_, i) => `c${i}`) })
    const tiny: BoardCluster = { id: 'realA', boardId: 'b1', categoryId: 'A', x: 100, y: 100, width: 120, height: 80, createdAt: '0' }
    const data = makeData({
      boards: [board],
      categories: [a],
      codes: Array.from({ length: 9 }, (_, i) => makeCode(`c${i}`)),
      boardClusters: [tiny]
    })
    const clusters = getVisibleBoardClusters(board, data.boardClusters, data.categories)
    const shown = clusters[0]
    expect(shown.id).toBe('realA')
    expect({ x: shown.x, y: shown.y }).toEqual({ x: 100, y: 100 })
    const visible = getVisibleBoardItems(board, [], data.codes, data.notes, data.categories, clusters)
    for (const item of visible) {
      expect(rectContains(shown, { ...shown, x: item.x, y: item.y, width: MEMBER_CARD_WIDTH, height: MEMBER_CARD_HEIGHT })).toBe(true)
    }
    // An empty cluster's box is left exactly as the user made it.
    const empty = makeCategory('E')
    const emptyBox: BoardCluster = { ...tiny, id: 'realE', categoryId: 'E' }
    const emptyShown = getVisibleBoardClusters(board, [emptyBox], [empty])[0]
    expect({ width: emptyShown.width, height: emptyShown.height }).toEqual({ width: 120, height: 80 })
  })
})

describe('clusters inside a superordinate always sit on its grid', () => {
  const board = { id: 'b1', name: 'Main', isDefault: true }
  function box(categoryId: string, x: number, y: number, width: number, height: number): BoardCluster {
    return { id: `real:${categoryId}`, boardId: 'b1', categoryId, x, y, width, height, createdAt: '0' }
  }

  // Reported: dragging a cluster from one superordinate into another pushed
  // a cluster already in the destination out of it, and "Reset placement"
  // then showed that one as an orphan. Now the destination's children are
  // all on its grid, the superordinate grows to hold them, and a reset
  // changes nothing about where anything is.
  it('moving a cluster into another superordinate keeps every child inside it, with no orphan after a reset', () => {
    const so1 = makeCategory('SO1')
    const so2 = makeCategory('SO2')
    const x = makeCategory('X', { parentCategoryId: 'SO1', codeIds: ['c1', 'c2', 'c3'] })
    const k1 = makeCategory('K1', { parentCategoryId: 'SO2', codeIds: ['c4'] })
    const k2 = makeCategory('K2', { parentCategoryId: 'SO2', codeIds: ['c5'] })
    let data = makeData({
      boards: [board],
      categories: [so1, so2, x, k1, k2],
      codes: ['c1', 'c2', 'c3', 'c4', 'c5'].map(makeCode),
      boardClusters: [
        box('SO1', 0, 0, 700, 600),
        box('SO2', 1000, 0, 700, 600),
        box('X', 20, 48, 500, 300),
        box('K1', 1020, 48, 280, 200),
        box('K2', 1340, 48, 280, 200)
      ]
    })

    // The drop: X lands in SO2 (its stored position is wherever the user
    // released it — irrelevant once nested).
    data = moveCluster(data, 'real:X', 1100, 300)
    data = reparentCategory(data, 'X', 'SO2')
    data = growAncestorClustersToFit(data, 'b1', 'X')

    function check(d: ProjectData): void {
      const visible = getVisibleBoardClusters(board, d.boardClusters, d.categories)
      const so2Box = visible.find((c) => c.categoryId === 'SO2')!
      const kids = ['X', 'K1', 'K2'].map((id) => visible.find((c) => c.categoryId === id)!)
      for (const kid of kids) expect(rectContains(so2Box, kid)).toBe(true)
      for (let i = 0; i < kids.length; i++) {
        for (let j = i + 1; j < kids.length; j++) expect(rectsOverlap(kids[i], kids[j])).toBe(false)
      }
      expect(getStructuralNestingEdges(visible, d.categories)).toEqual([])
      for (const id of ['X', 'K1', 'K2']) {
        expect(d.categories.find((c) => c.id === id)!.parentCategoryId).toBe('SO2')
      }
    }
    check(data)
    check(resetDefaultBoardClusterLayout(data, 'b1'))
  })

  it('a stored position for a nested cluster never disagrees with its nesting: no structural edge on the default board', () => {
    const so = makeCategory('SO')
    const a = makeCategory('A', { parentCategoryId: 'SO' })
    const b = makeCategory('B', { parentCategoryId: 'SO' })
    const data = makeData({
      boards: [board],
      categories: [so, a, b],
      boardClusters: [box('SO', 0, 0, 300, 300), box('A', 5000, 5000, 280, 200), box('B', -50, 9000, 280, 200)]
    })
    const visible = getVisibleBoardClusters(board, data.boardClusters, data.categories)
    expect(getStructuralNestingEdges(visible, data.categories)).toEqual([])
    const soBox = visible.find((c) => c.categoryId === 'SO')!
    for (const id of ['A', 'B']) expect(rectContains(soBox, visible.find((c) => c.categoryId === id)!)).toBe(true)
  })
})

describe('resize-to-exclude: resolveResizeExclusion + detachClustersFrom', () => {
  const board = { id: 'b1', name: 'Main', isDefault: true }
  function box(categoryId: string, x: number, y: number, width: number, height: number): BoardCluster {
    return { id: `real:${categoryId}`, boardId: 'b1', categoryId, x, y, width, height, createdAt: '0' }
  }
  function setup(): ProjectData {
    const so = makeCategory('SO')
    const a = makeCategory('A', { parentCategoryId: 'SO' })
    const b = makeCategory('B', { parentCategoryId: 'SO' })
    const c = makeCategory('C', { parentCategoryId: 'SO' })
    return makeData({ boards: [board], categories: [so, a, b, c], boardClusters: [box('SO', 0, 0, 1000, 1000)] })
  }

  it('flags exactly the nested clusters that no longer fully fit in the drawn box', () => {
    const data = setup()
    const visible = getVisibleBoardClusters(board, data.boardClusters, data.categories)
    const a = visible.find((c) => c.categoryId === 'A')!
    // A box that keeps A whole but cuts through B and C (3 children -> 2
    // columns: A and B on the first row, C below).
    const drawn = { x: 0, y: 0, width: a.x + a.width + 5, height: a.y + a.height + 5 }
    expect(resolveResizeExclusion(visible, data.categories, drawn, 'SO').sort()).toEqual(['B', 'C'])
    // The full box excludes nothing.
    expect(resolveResizeExclusion(visible, data.categories, { x: 0, y: 0, width: 1000, height: 1000 }, 'SO')).toEqual([])
  })

  // Reported: "I can't resize a SO cluster to exclude some clusters from
  // it. It instantly goes back to its previous size." A box is never shown
  // smaller than its contents, so the shrink has to take the excluded
  // clusters *out* first — then the superordinate can actually be smaller.
  it('detaches the excluded clusters where they were shown, and the superordinate really shrinks', () => {
    let data = setup()
    const visibleBefore = getVisibleBoardClusters(board, data.boardClusters, data.categories)
    const a = visibleBefore.find((c) => c.categoryId === 'A')!
    const bBefore = visibleBefore.find((c) => c.categoryId === 'B')!
    const drawn = { x: 0, y: 0, width: a.x + a.width + 20, height: a.y + a.height + 20 }

    data = resizeCluster(data, 'real:SO', drawn.width, drawn.height)
    data = detachClustersFrom(data, 'b1', 'SO', ['B', 'C'])

    for (const id of ['B', 'C']) expect(data.categories.find((c) => c.id === id)!.parentCategoryId).toBeNull()
    expect(data.categories.find((c) => c.id === 'A')!.parentCategoryId).toBe('SO')

    const visible = getVisibleBoardClusters(board, data.boardClusters, data.categories)
    const so = visible.find((c) => c.categoryId === 'SO')!
    // Shrunk to the drawn box (A alone fits in it).
    expect({ width: so.width, height: so.height }).toEqual({ width: drawn.width, height: drawn.height })
    expect(rectContains(so, visible.find((c) => c.categoryId === 'A')!)).toBe(true)
    // B is a top-level cluster now, pinned near where it was shown, and
    // clear of the shrunk superordinate (pushed if it still overlapped).
    const b = visible.find((c) => c.categoryId === 'B')!
    expect(data.boardClusters.some((c) => c.categoryId === 'B')).toBe(true)
    expect(rectsOverlap(so, b)).toBe(false)
    expect(Math.abs(b.y - bBefore.y)).toBeLessThan(500)
    expect(getStructuralNestingEdges(visible, data.categories)).toEqual([])
  })

  it("leaves a cluster that isn't actually a child alone, and is a no-op for an empty list", () => {
    const data = setup()
    expect(detachClustersFrom(data, 'b1', 'SO', [])).toBe(data)
    const other = makeCategory('other')
    const withOther = { ...data, categories: [...data.categories, other] }
    expect(detachClustersFrom(withOther, 'b1', 'SO', ['other'])).toBe(withOther)
  })
})

describe('edge cases: containers shrink back, exclusion moves out one level', () => {
  const board = { id: 'b1', name: 'Main', isDefault: true }
  function box(categoryId: string, x: number, y: number, width: number, height: number): BoardCluster {
    return { id: `real:${categoryId}`, boardId: 'b1', categoryId, x, y, width, height, createdAt: '0' }
  }

  it('a superordinate grows with its contents and shrinks back to its drawn size when they leave', () => {
    const so = makeCategory('SO')
    const big = makeCategory('BIG', { codeIds: Array.from({ length: 16 }, (_, i) => `c${i}`) })
    let data = makeData({
      boards: [board],
      categories: [so, big],
      codes: Array.from({ length: 16 }, (_, i) => makeCode(`c${i}`)),
      boardClusters: [box('SO', 0, 0, 400, 300), box('BIG', 2000, 2000, 280, 200)]
    })
    const shown = (d: ProjectData): BoardCluster =>
      getVisibleBoardClusters(board, d.boardClusters, d.categories).find((c) => c.categoryId === 'SO')!
    expect({ width: shown(data).width, height: shown(data).height }).toEqual({ width: 400, height: 300 })

    data = reparentCategory(data, 'BIG', 'SO')
    data = growAncestorClustersToFit(data, 'b1', 'BIG')
    expect(shown(data).width).toBeGreaterThan(400)
    expect(shown(data).height).toBeGreaterThan(300)

    data = reparentCategory(data, 'BIG', null)
    data = growAncestorClustersToFit(data, 'b1', 'BIG')
    expect({ width: shown(data).width, height: shown(data).height }).toEqual({ width: 400, height: 300 })
  })

  it("excluding a cluster from a nested superordinate makes it the grandparent's child, not a stranded top-level one", () => {
    const outer = makeCategory('OUTER')
    const inner = makeCategory('INNER', { parentCategoryId: 'OUTER' })
    const a = makeCategory('A', { parentCategoryId: 'INNER' })
    const b = makeCategory('B', { parentCategoryId: 'INNER' })
    let data = makeData({ boards: [board], categories: [outer, inner, a, b], boardClusters: [box('OUTER', 0, 0, 2000, 2000)] })

    data = detachClustersFrom(data, 'b1', 'INNER', ['B'])

    expect(data.categories.find((c) => c.id === 'B')!.parentCategoryId).toBe('OUTER')
    expect(data.categories.find((c) => c.id === 'A')!.parentCategoryId).toBe('INNER')
    const visible = getVisibleBoardClusters(board, data.boardClusters, data.categories)
    const outerBox = visible.find((c) => c.categoryId === 'OUTER')!
    const innerBox = visible.find((c) => c.categoryId === 'INNER')!
    const bBox = visible.find((c) => c.categoryId === 'B')!
    expect(rectContains(outerBox, bBox)).toBe(true)
    expect(rectContains(outerBox, innerBox)).toBe(true)
    expect(rectsOverlap(innerBox, bBox)).toBe(false)
    expect(getStructuralNestingEdges(visible, data.categories)).toEqual([])
  })
})

describe('fuzz: random board operations keep every invariant', () => {
  const board = { id: 'b1', name: 'Main', isDefault: true }

  function mulberry32(seed: number): () => number {
    let a = seed >>> 0
    return () => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  function checkInvariants(data: ProjectData, label: string): void {
    const visible = getVisibleBoardClusters(board, data.boardClusters, data.categories)
    const byCat = new Map(visible.map((c) => [c.categoryId, c]))
    expect(visible.length, `${label}: every category drawn`).toBe(data.categories.length)
    expect(getStructuralNestingEdges(visible, data.categories), `${label}: no stray edges`).toEqual([])
    for (const c of visible) {
      expect(c.x >= 0 && c.y >= 0, `${label}: ${c.categoryId} at non-negative coords`).toBe(true)
      const parentId = data.categories.find((cat) => cat.id === c.categoryId)!.parentCategoryId
      if (parentId) expect(rectContains(byCat.get(parentId)!, c), `${label}: ${c.categoryId} inside ${parentId}`).toBe(true)
    }
    const byParent = new Map<string | null, BoardCluster[]>()
    for (const cat of data.categories) {
      const list = byParent.get(cat.parentCategoryId ?? null) ?? []
      list.push(byCat.get(cat.id)!)
      byParent.set(cat.parentCategoryId ?? null, list)
    }
    for (const [parent, group] of byParent) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          expect(
            rectsOverlap(group[i], group[j]),
            `${label}: siblings ${group[i].categoryId}/${group[j].categoryId} under ${parent} overlap`
          ).toBe(false)
        }
      }
    }
    const items = getVisibleBoardItems(board, data.boardItems, data.codes, data.notes, data.categories, visible, data.boardLinks)
    const home = new Map<string, string>()
    for (const cat of data.categories) for (const id of cat.codeIds) if (!home.has(id)) home.set(id, cat.id)
    for (const item of items) {
      expect(item.x >= 0 && item.y >= 0, `${label}: card ${item.refId} at non-negative coords`).toBe(true)
      const homeId = home.get(item.refId)
      if (homeId) {
        const cluster = byCat.get(homeId)!
        expect(
          rectContains(cluster, { ...cluster, x: item.x, y: item.y, width: MEMBER_CARD_WIDTH, height: MEMBER_CARD_HEIGHT }),
          `${label}: card ${item.refId} inside ${homeId}`
        ).toBe(true)
      }
    }
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]
        const b = items[j]
        if (home.get(a.refId) !== home.get(b.refId)) continue
        // Two hand-placed unclustered cards may sit wherever the user put
        // them; every other same-home pair must not stack.
        const bothHandPlaced =
          home.get(a.refId) === undefined && !a.id.startsWith('virtual:') && !b.id.startsWith('virtual:')
        if (bothHandPlaced) continue
        expect(
          Math.abs(a.x - b.x) < MEMBER_CARD_WIDTH && Math.abs(a.y - b.y) < MEMBER_CARD_HEIGHT,
          `${label}: cards ${a.refId}/${b.refId} stacked`
        ).toBe(false)
      }
    }
  }

  for (const seed of [1, 2, 3, 4, 5]) {
    it(`seed ${seed}`, () => {
      const rand = mulberry32(seed)
      function pick<T>(arr: T[]): T {
        return arr[Math.floor(rand() * arr.length)]
      }
      const catIds = ['C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7']
      const codeIds = Array.from({ length: 14 }, (_, i) => `k${i}`)
      let data = makeData({
        boards: [board],
        categories: catIds.map((id, i) => makeCategory(id, { codeIds: codeIds.filter((_, k) => k % catIds.length === i) })),
        codes: codeIds.map(makeCode)
      })
      checkInvariants(data, 'initial')

      for (let step = 0; step < 120; step++) {
        const op = Math.floor(rand() * 7)
        const label = `seed ${seed} step ${step} op ${op}`
        const visible = getVisibleBoardClusters(board, data.boardClusters, data.categories)
        if (op === 0) {
          // Drop a cluster onto another (nest) or onto empty space (un-nest).
          const id = pick(catIds)
          const target = rand() < 0.6 ? pick(catIds.filter((c) => c !== id)) : null
          const cat = data.categories.find((c) => c.id === id)!
          if (!cat.parentCategoryId || target === null) {
            const shown = visible.find((c) => c.categoryId === id)!
            data = createClusterForCategory(data, {
              boardId: 'b1',
              categoryId: id,
              x: shown.x,
              y: shown.y,
              width: shown.width,
              height: shown.height
            }).data
            const stored = data.boardClusters.find((c) => c.categoryId === id)!
            data = moveCluster(data, stored.id, Math.floor(rand() * 1500), Math.floor(rand() * 1500))
          }
          if ((target ?? null) !== (cat.parentCategoryId ?? null)) {
            data = materializeChildClusters(data, 'b1', target)
            data = reparentCategory(data, id, target)
          }
          data = growAncestorClustersToFit(data, 'b1', id)
          data = resolveSiblingOverlaps(data, 'b1', id)
        } else if (op === 1) {
          // Resize a cluster (enclose / exclude, like the resize commit).
          const id = pick(catIds)
          const shown = visible.find((c) => c.categoryId === id)!
          data = createClusterForCategory(data, {
            boardId: 'b1',
            categoryId: id,
            x: shown.x,
            y: shown.y,
            width: shown.width,
            height: shown.height
          }).data
          const stored = data.boardClusters.find((c) => c.categoryId === id)!
          const width = Math.max(120, Math.floor(rand() * 1400))
          const height = Math.max(90, Math.floor(rand() * 1000))
          data = materializeSiblingClusters(data, 'b1', id)
          data = resizeCluster(data, stored.id, width, height)
          const drawn = { x: shown.x, y: shown.y, width, height }
          const excluded = resolveResizeExclusion(visible, data.categories, drawn, id)
          data = detachClustersFrom(data, 'b1', id, excluded)
          const enclosed = resolveResizeEnclosure(visible, data.categories, drawn, id)
          if (enclosed.length > 0) {
            data = materializeChildClusters(data, 'b1', id)
            for (const e of enclosed) data = reparentCategory(data, e, id)
            data = renestClustersCleanly(data, 'b1', id, enclosed)
          }
          data = growAncestorClustersToFit(data, 'b1', id)
          data = resolveSiblingOverlaps(data, 'b1', id)
        } else if (op === 2) {
          // Drop a code into a cluster or onto empty space.
          const code = pick(codeIds)
          const target = rand() < 0.8 ? pick(catIds) : null
          data = reassignRefCategoryMembership(data, 'b1', 'code', code, target)
          if (!target) {
            const x = Math.floor(rand() * 1500)
            const y = 1800 + Math.floor(rand() * 300)
            const added = addItemToBoard(data, 'b1', 'code', code, x, y)
            data = moveItem(added.data, added.itemId, x, y)
            data = resolveItemOverlaps(data, 'b1', [added.itemId])
          } else {
            data = growClusterToFitOwnMembers(data, 'b1', target)
          }
        } else if (op === 3) {
          data = resetDefaultBoardClusterLayout(data, 'b1')
        } else {
          // Move a top-level cluster somewhere (the most common gesture).
          const roots = data.categories.filter((c) => !c.parentCategoryId)
          if (roots.length === 0) continue
          const id = pick(roots).id
          const shown = visible.find((c) => c.categoryId === id)!
          data = createClusterForCategory(data, {
            boardId: 'b1',
            categoryId: id,
            x: shown.x,
            y: shown.y,
            width: shown.width,
            height: shown.height
          }).data
          const stored = data.boardClusters.find((c) => c.categoryId === id)!
          data = materializeSiblingClusters(data, 'b1', id)
          data = moveCluster(data, stored.id, Math.floor(rand() * 1500), Math.floor(rand() * 1500))
          data = resolveSiblingOverlaps(data, 'b1', id)
        }
        checkInvariants(data, label)
      }
    })
  }
})

describe('parent changes outside a board drag keep everything where it is', () => {
  const board = { id: 'b1', name: 'Main', isDefault: true }
  function box(categoryId: string, x: number, y: number, width: number, height: number): BoardCluster {
    return { id: `real:${categoryId}`, boardId: 'b1', categoryId, x, y, width, height, createdAt: '0' }
  }
  function shownMap(d: ProjectData): Map<string, BoardCluster> {
    return new Map(getVisibleBoardClusters(board, d.boardClusters, d.categories).map((c) => [c.categoryId, c]))
  }
  function samePlace(a: BoardCluster, b: BoardCluster): boolean {
    return a.x === b.x && a.y === b.y
  }

  // Reported: "when deleting a SO cluster, the orphan clusters are moved in
  // remote places."
  it('deleting a top-level superordinate leaves its children exactly where they were shown', () => {
    const so = makeCategory('SO')
    const a = makeCategory('A', { parentCategoryId: 'SO', codeIds: ['c1'] })
    const b = makeCategory('B', { parentCategoryId: 'SO', codeIds: ['c2'] })
    const r = makeCategory('R', { codeIds: ['c3'] })
    const data = makeData({
      boards: [board],
      categories: [so, a, b, r],
      codes: ['c1', 'c2', 'c3'].map(makeCode),
      boardClusters: [box('SO', 100, 100, 1000, 800), box('A', 5000, 5000, 280, 200)]
    })
    const before = shownMap(data)

    const next = deleteCategoryOnBoard(data, 'b1', 'SO')

    expect(next.categories.find((c) => c.id === 'SO')).toBeUndefined()
    const after = shownMap(next)
    for (const id of ['A', 'B', 'R']) {
      expect(next.categories.find((c) => c.id === id)!.parentCategoryId).toBeNull()
      expect(samePlace(before.get(id)!, after.get(id)!), `${id} stays put`).toBe(true)
    }
    const roots = ['A', 'B', 'R'].map((id) => after.get(id)!)
    for (let i = 0; i < roots.length; i++) {
      for (let j = i + 1; j < roots.length; j++) expect(rectsOverlap(roots[i], roots[j])).toBe(false)
    }
  })

  it("deleting a nested superordinate hands its children to the grandparent's grid", () => {
    const outer = makeCategory('OUTER')
    const inner = makeCategory('INNER', { parentCategoryId: 'OUTER' })
    const a = makeCategory('A', { parentCategoryId: 'INNER' })
    const b = makeCategory('B', { parentCategoryId: 'INNER' })
    const data = makeData({ boards: [board], categories: [outer, inner, a, b], boardClusters: [box('OUTER', 0, 0, 2000, 2000)] })

    const next = deleteCategoryOnBoard(data, 'b1', 'INNER')

    const after = shownMap(next)
    for (const id of ['A', 'B']) {
      expect(next.categories.find((c) => c.id === id)!.parentCategoryId).toBe('OUTER')
      expect(rectContains(after.get('OUTER')!, after.get(id)!)).toBe(true)
    }
    expect(rectsOverlap(after.get('A')!, after.get('B')!)).toBe(false)
  })

  // Previously a tree drag reset the whole board's layout.
  it('un-nesting from the tree pins the cluster where it was, pushes it clear of its former superordinate, and moves nothing else', () => {
    const so = makeCategory('SO')
    const x = makeCategory('X', { parentCategoryId: 'SO', codeIds: ['c1'] })
    const r1 = makeCategory('R1', { codeIds: ['c2'] })
    const r2 = makeCategory('R2', { codeIds: ['c3'] })
    const data = makeData({
      boards: [board],
      categories: [so, x, r1, r2],
      codes: ['c1', 'c2', 'c3'].map(makeCode),
      boardClusters: [box('SO', 0, 0, 600, 500)]
    })
    const before = shownMap(data)

    const next = reparentCategoryOnBoard(data, 'b1', 'X', null)

    expect(next.categories.find((c) => c.id === 'X')!.parentCategoryId).toBeNull()
    const after = shownMap(next)
    expect(samePlace(before.get('R1')!, after.get('R1')!)).toBe(true)
    expect(samePlace(before.get('R2')!, after.get('R2')!)).toBe(true)
    expect(samePlace(before.get('SO')!, after.get('SO')!)).toBe(true)
    const roots = ['SO', 'X', 'R1', 'R2'].map((id) => after.get(id)!)
    for (let i = 0; i < roots.length; i++) {
      for (let j = i + 1; j < roots.length; j++) expect(rectsOverlap(roots[i], roots[j])).toBe(false)
    }
    // Pushed just clear of the superordinate, not sent somewhere remote.
    expect(after.get('X')!.x).toBeLessThan(1200)
    expect(after.get('X')!.y).toBeLessThan(1200)
    expect(getStructuralNestingEdges([...after.values()], next.categories)).toEqual([])
  })

  it('nesting from the tree puts the cluster on the target grid and moves no other top-level cluster', () => {
    const a = makeCategory('A', { codeIds: ['c1'] })
    const b = makeCategory('B', { codeIds: ['c2'] })
    const c = makeCategory('C', { codeIds: ['c3'] })
    const t = makeCategory('T')
    const data = makeData({
      boards: [board],
      categories: [a, b, c, t],
      codes: ['c1', 'c2', 'c3'].map(makeCode),
      boardClusters: [box('T', 1500, 0, 600, 500)]
    })
    const before = shownMap(data)

    const next = reparentCategoryOnBoard(data, 'b1', 'A', 'T')

    expect(next.categories.find((c) => c.id === 'A')!.parentCategoryId).toBe('T')
    const after = shownMap(next)
    expect(rectContains(after.get('T')!, after.get('A')!)).toBe(true)
    expect(samePlace(before.get('B')!, after.get('B')!)).toBe(true)
    expect(samePlace(before.get('C')!, after.get('C')!)).toBe(true)
    expect(samePlace(before.get('T')!, after.get('T')!)).toBe(true)
  })

  it('a reparent the category ops refuse (a cycle) changes nothing', () => {
    const p = makeCategory('P')
    const q = makeCategory('Q', { parentCategoryId: 'P' })
    const data = makeData({ boards: [board], categories: [p, q] })
    expect(reparentCategoryOnBoard(data, 'b1', 'P', 'Q')).toBe(data)
  })

  it('forgetItemPositionIfUnclustered drops a stale stored position only once the card is in no cluster', () => {
    const a = makeCategory('A', { codeIds: ['c1'] })
    const data = makeData({
      boards: [board],
      categories: [a],
      codes: [makeCode('c1')],
      boardItems: [{ id: 'i1', boardId: 'b1', refType: 'code', refId: 'c1', x: 9000, y: 9000 }]
    })
    expect(forgetItemPositionIfUnclustered(data, 'b1', 'code', 'c1')).toBe(data)
    const removed = { ...data, categories: [{ ...a, codeIds: [] }] }
    expect(forgetItemPositionIfUnclustered(removed, 'b1', 'code', 'c1').boardItems).toEqual([])
  })
})

describe('findNestTarget', () => {
  const board = { id: 'b1', name: 'Main', isDefault: true }
  function box(categoryId: string, x: number, y: number, width: number, height: number): BoardCluster {
    return { id: `real:${categoryId}`, boardId: 'b1', categoryId, x, y, width, height, createdAt: '0' }
  }

  // Reported: "I wanted to add a cluster to a SO cluster, but I couldn't
  // since it didn't have enough free space. I could only make my moving
  // cluster a child of a cluster that's already inside."
  it('a full superordinate can be targeted by dropping on its header, then holds the newcomer on its grid', () => {
    const so = makeCategory('SO')
    const kids = ['A', 'B', 'C', 'D'].map((id) => makeCategory(id, { parentCategoryId: 'SO' }))
    const x = makeCategory('X')
    let data = makeData({ boards: [board], categories: [so, ...kids, x], boardClusters: [box('SO', 0, 0, 100, 100)] })
    const visible = getVisibleBoardClusters(board, data.boardClusters, data.categories)
    const soBox = visible.find((c) => c.categoryId === 'SO')!
    const candidates = visible.filter((c) => c.categoryId !== 'X')

    // Every point of the superordinate's body below its header is a sub-
    // cluster or a gap too narrow to matter: center-only targeting lands
    // on a child. Pick the center of child A to show it.
    const a = visible.find((c) => c.categoryId === 'A')!
    const aCenter = { x: a.x + a.width / 2, y: a.y + a.height / 2 }
    expect(findNestTarget(candidates, aCenter, aCenter)!.categoryId).toBe('A')

    // Same center, pointer on the superordinate's header: the superordinate.
    const onHeader = { x: soBox.x + 40, y: soBox.y + 10 }
    const target = findNestTarget(candidates, aCenter, onHeader)!
    expect(target.categoryId).toBe('SO')

    data = reparentCategory(data, 'X', 'SO')
    const after = getVisibleBoardClusters(board, data.boardClusters, data.categories)
    const soAfter = after.find((c) => c.categoryId === 'SO')!
    const children = ['A', 'B', 'C', 'D', 'X'].map((id) => after.find((c) => c.categoryId === id)!)
    for (const child of children) expect(rectContains(soAfter, child)).toBe(true)
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) expect(rectsOverlap(children[i], children[j])).toBe(false)
    }
  })

  it("a nested cluster's header targets that nested cluster, not its superordinate", () => {
    const so = box('SO', 0, 0, 800, 600)
    const inner = box('IN', 20, 48, 280, 200)
    const target = findNestTarget([so, inner], { x: 700, y: 500 }, { x: inner.x + 30, y: inner.y + 10 })
    expect(target!.categoryId).toBe('IN')
  })

  it('falls back to the center when the pointer is on no header, and returns null over empty space', () => {
    const so = box('SO', 0, 0, 800, 600)
    expect(findNestTarget([so], { x: 400, y: 300 }, { x: 400, y: 300 })!.categoryId).toBe('SO')
    expect(findNestTarget([so], { x: 2000, y: 2000 }, { x: 2000, y: 2000 })).toBeNull()
  })

  it('the header band grows with headerReach (zoomed out, the header text overhangs the bar)', () => {
    const so = box('SO', 0, 100, 800, 600)
    const justAbove = { x: 40, y: 90 }
    const far = { x: 2000, y: 2000 }
    expect(findNestTarget([so], far, justAbove)).toBeNull()
    expect(findNestTarget([so], far, justAbove, 98)!.categoryId).toBe('SO')
  })
})

describe('first touch of a cluster after a reset', () => {
  const board = { id: 'b1', name: 'Main', isDefault: true }

  function resetBoard(): ProjectData {
    // Top-level clusters of varied sizes, so the masonry packing stacks
    // several into the same column.
    const sizes = [1, 9, 2, 12, 4, 1, 7, 3, 16, 2]
    let codeIndex = 0
    const categories = sizes.map((n, i) => {
      const codeIds = Array.from({ length: n }, () => `k${codeIndex++}`)
      return makeCategory(`R${i}`, { codeIds })
    })
    const codes = Array.from({ length: codeIndex }, (_, i) => makeCode(`k${i}`))
    return resetDefaultBoardClusterLayout(makeData({ boards: [board], categories, codes }), 'b1')
  }
  function shown(d: ProjectData): Map<string, BoardCluster> {
    return new Map(getVisibleBoardClusters(board, d.boardClusters, d.categories).map((c) => [c.categoryId, c]))
  }

  // Reported: "after resetting the default placement, a click on a cluster
  // will make neighboring clusters jump to other locations." Pressing the
  // mouse on a cluster used to give it — alone — a stored shape, taking it
  // out of the auto-packing its neighbors are laid out around.
  it('giving one auto-placed top-level cluster a stored shape, alone, moves its neighbors', () => {
    const data = resetBoard()
    const before = shown(data)
    const moved = [...before.keys()].some((id) => {
      const b = before.get(id)!
      const pinned = createClusterForCategory(data, { boardId: 'b1', categoryId: id, x: b.x, y: b.y, width: b.width, height: b.height }).data
      const after = shown(pinned)
      return [...before.keys()].some((other) => other !== id && (after.get(other)!.x !== before.get(other)!.x || after.get(other)!.y !== before.get(other)!.y))
    })
    expect(moved).toBe(true)
  })

  it('ensureClusterShape pins the top-level group first, so nothing moves, for any cluster touched', () => {
    const data = resetBoard()
    const before = shown(data)
    for (const id of before.keys()) {
      const next = ensureClusterShape(data, 'b1', id)
      expect(next.boardClusters.some((c) => c.categoryId === id)).toBe(true)
      const after = shown(next)
      for (const [other, b] of before) {
        expect({ x: after.get(other)!.x, y: after.get(other)!.y }, `touching ${id} moved ${other}`).toEqual({ x: b.x, y: b.y })
      }
    }
  })

  it('ensureClusterShape is a no-op for a cluster that already has a shape', () => {
    let data = resetBoard()
    data = ensureClusterShape(data, 'b1', 'R0')
    expect(ensureClusterShape(data, 'b1', 'R0')).toBe(data)
  })
})

describe('adding a top-level cluster after a reset', () => {
  const board = { id: 'b1', name: 'Main', isDefault: true }
  function shown(d: ProjectData): Map<string, BoardCluster> {
    return new Map(getVisibleBoardClusters(board, d.boardClusters, d.categories).map((c) => [c.categoryId, c]))
  }
  function resetBoardWith(count: number): ProjectData {
    const categories = Array.from({ length: count }, (_, i) =>
      makeCategory(`R${i}`, { codeIds: Array.from({ length: (i * 5) % 7 }, (_, k) => `k${i}_${k}`) })
    )
    const codes = categories.flatMap((c) => c.codeIds.map(makeCode))
    return resetDefaultBoardClusterLayout(makeData({ boards: [board], categories, codes }), 'b1')
  }

  // 9 top-level clusters pack into 3 columns, 10 into 4: the new one
  // changes the column count and repacks every unplaced one.
  it('without pinning, a 10th top-level cluster repacks the other nine', () => {
    const data = resetBoardWith(9)
    const before = shown(data)
    const next = createCategory(data, { name: 'New', kind: 'theme', color: '#000' }).data
    const after = shown(next)
    const moved = [...before.keys()].some((id) => after.get(id)!.x !== before.get(id)!.x || after.get(id)!.y !== before.get(id)!.y)
    expect(moved).toBe(true)
  })

  it('pinning the top level first keeps all nine in place and puts the new one in free space', () => {
    const data = resetBoardWith(9)
    const before = shown(data)
    const next = createCategory(materializeChildClusters(data, 'b1', null), { name: 'New', kind: 'theme', color: '#000' })
    const after = shown(next.data)
    for (const [id, b] of before) expect({ x: after.get(id)!.x, y: after.get(id)!.y }).toEqual({ x: b.x, y: b.y })
    const fresh = after.get(next.categoryId)!
    for (const id of before.keys()) expect(rectsOverlap(fresh, after.get(id)!)).toBe(false)
  })
})

describe('growth after a reset stays local once the top level is pinned', () => {
  const board = { id: 'b1', name: 'Main', isDefault: true }
  function rng(seed: number): () => number {
    let s = seed >>> 0
    return () => ((s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) >>> 0) / 4294967296)
  }
  function resetBoard(seed: number): ProjectData {
    const r = rng(seed)
    const categories: CategoryRecord[] = []
    const codes: CodeNode[] = []
    let k = 0
    for (let i = 0; i < 16; i++) {
      const ids = Array.from({ length: Math.floor(r() * 8) }, () => `k${k++}`)
      ids.forEach((id) => codes.push(makeCode(id)))
      categories.push(makeCategory(`R${i}`, { codeIds: ids }))
    }
    return resetDefaultBoardClusterLayout(makeData({ boards: [board], categories, codes }), 'b1')
  }
  function shown(d: ProjectData): Map<string, BoardCluster> {
    return new Map(getVisibleBoardClusters(board, d.boardClusters, d.categories).map((c) => [c.categoryId, c]))
  }
  function dropSixCards(d: ProjectData, target: string): ProjectData {
    let next = d
    for (const c of d.codes.slice(-6)) next = reassignRefCategoryMembership(next, 'b1', 'code', c.id, target)
    return growClusterToFitOwnMembers(next, 'b1', target)
  }

  // Measured when this was found: across 20 reset boards, dropping six
  // cards into one top-level cluster moved up to 14 of the 15 others, with
  // 184 sideways column jumps in total — the whole top level repacking.
  it('left auto-placed, a cluster growing repacks the rest of the top level', () => {
    let sideways = 0
    for (let seed = 1; seed <= 20; seed++) {
      const d = resetBoard(seed)
      const before = shown(d)
      const after = shown(dropSixCards(d, 'R5'))
      for (const [id, b] of before) if (id !== 'R5' && after.get(id)!.x !== b.x) sideways++
    }
    expect(sideways).toBeGreaterThan(0)
  })

  // What "Reset placement" now does (the store pins right after resetting,
  // and loading a project pins too): the only clusters that move are ones
  // the grown cluster — or a cluster it pushed — actually ran into.
  it('pinned, only clusters actually run into move', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const d = materializeChildClusters(resetBoard(seed), 'b1', null)
      const before = shown(d)
      const after = shown(dropSixCards(d, 'R5'))
      const moved = [...before.keys()].filter(
        (id) => id !== 'R5' && (after.get(id)!.x !== before.get(id)!.x || after.get(id)!.y !== before.get(id)!.y)
      )
      const pushers = [after.get('R5')!, ...moved.map((id) => after.get(id)!)]
      for (const id of moved) {
        const old = before.get(id)!
        expect(
          pushers.some((p) => p.categoryId !== id && rectsOverlap(old, p)),
          `seed ${seed}: ${id} moved without having been run into`
        ).toBe(true)
      }
      const roots = [...after.values()]
      for (let i = 0; i < roots.length; i++) {
        for (let j = i + 1; j < roots.length; j++) expect(rectsOverlap(roots[i], roots[j])).toBe(false)
      }
    }
  })
})
describe('linked cards touch, and linking moves as little as possible', () => {
  const board = { id: 'b1', name: 'Main', isDefault: true }

  function layout(
    categories: CategoryRecord[],
    codeIds: string[],
    links: Array<{ itemAId: string; itemBId: string }>
  ): Map<string, { x: number; y: number }> {
    const explicit: BoardItem[] = codeIds.map((id) => ({ id: `item-${id}`, boardId: 'b1', refType: 'code', refId: id, x: 0, y: 0 }))
    const clusters = getVisibleBoardClusters(board, [], categories)
    const items = getVisibleBoardItems(board, explicit, codeIds.map(makeCode), [], categories, clusters, links)
    return new Map(items.map((i) => [i.refId, { x: i.x, y: i.y }]))
  }
  const same = (a: { x: number; y: number }, b: { x: number; y: number }): boolean => a.x === b.x && a.y === b.y
  /** Side by side in a row, or one directly above the other — what "linked
   * cards sit together" has to mean in a grid (the next slot can be the
   * start of the next row). */
  function touching(a: { x: number; y: number }, b: { x: number; y: number }, all: Array<{ x: number; y: number }>): boolean {
    const xs = [...new Set(all.map((p) => p.x))].sort((p, q) => p - q)
    const ys = [...new Set(all.map((p) => p.y))].sort((p, q) => p - q)
    const col = (p: { x: number }): number => xs.indexOf(p.x)
    const row = (p: { y: number }): number => ys.indexOf(p.y)
    return (row(a) === row(b) && Math.abs(col(a) - col(b)) === 1) || (col(a) === col(b) && Math.abs(row(a) - row(b)) === 1)
  }

  // Reported: four codes in a small cluster; 1 is Shift-dragged onto 3 (just
  // below it); on release "2 and 3 get linked, not 1 and 3". The link was
  // 1–3, but the grid re-slotted three cards and left 2 and 3 side by side
  // while 1 and 3 ended up diagonal.
  it('linking two cards that already touch moves nothing', () => {
    const ids = ['c1', 'c2', 'c3', 'c4']
    const categories = [makeCategory('A', { codeIds: ids })]
    const before = layout(categories, ids, [])
    const after = layout(categories, ids, [{ itemAId: 'item-c1', itemBId: 'item-c3' }])
    for (const id of ids) expect(same(after.get(id)!, before.get(id)!), `${id} moved`).toBe(true)
  })

  it('for every dragged → target pair: the target never moves, at most one other card moves, and the pair touches', () => {
    const ids = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']
    const categories = [makeCategory('A', { codeIds: ids })]
    const before = layout(categories, ids, [])
    for (const dragged of ids) {
      for (const target of ids) {
        if (dragged === target) continue
        const after = layout(categories, ids, [{ itemAId: `item-${dragged}`, itemBId: `item-${target}` }])
        const label = `${dragged} → ${target}`
        expect(same(after.get(target)!, before.get(target)!), `${label}: target moved`).toBe(true)
        const moved = ids.filter((id) => id !== dragged && !same(after.get(id)!, before.get(id)!))
        expect(moved.length, `${label}: others moved ${moved}`).toBeLessThanOrEqual(1)
        expect(touching(after.get(dragged)!, after.get(target)!, [...after.values()]), `${label}: not touching`).toBe(true)
        // Still a permutation of the same spots: nothing stacked, no spot lost.
        const spots = new Set([...after.values()].map((p) => `${p.x},${p.y}`))
        expect(spots.size, label).toBe(ids.length)
      }
    }
  })

  it('a chain keeps each earlier pair touching, and the first card aimed at never moves', () => {
    const ids = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9']
    const categories = [makeCategory('A', { codeIds: ids })]
    const before = layout(categories, ids, [])
    const links = [
      { itemAId: 'item-c1', itemBId: 'item-c9' },
      { itemAId: 'item-c2', itemBId: 'item-c1' }
    ]
    const after = layout(categories, ids, links)
    const all = [...after.values()]
    expect(same(after.get('c9')!, before.get('c9')!)).toBe(true)
    expect(touching(after.get('c1')!, after.get('c9')!, all)).toBe(true)
    expect(touching(after.get('c2')!, after.get('c1')!, all)).toBe(true)
  })

  it('a card dragged in from another cluster ends up touching its target, nothing stacked', () => {
    const inCluster = ['c2', 'c3', 'c4', 'c5', 'c6']
    const ids = ['c1', ...inCluster]
    for (const target of inCluster) {
      const joined = [makeCategory('A', { codeIds: [...inCluster, 'c1'] })]
      const after = layout(joined, ids, [{ itemAId: 'item-c1', itemBId: `item-${target}` }])
      const all = [...after.values()]
      expect(touching(after.get('c1')!, after.get(target)!, all), `c1 → ${target}`).toBe(true)
      expect(new Set(all.map((p) => `${p.x},${p.y}`)).size).toBe(ids.length)
    }
  })
})

describe('findPointerSnapTarget', () => {
  // A 2×2 cluster grid of 180×64 cards with an 8px gap: 1 2 / 3 4.
  const W = 180
  const H = 64
  const cards = [
    { id: '1', x: 20, y: 48 },
    { id: '2', x: 208, y: 48 },
    { id: '3', x: 20, y: 120 },
    { id: '4', x: 208, y: 120 }
  ]
  const others = cards.filter((c) => c.id !== '1')

  // Reported: dragging 1 around, it could only ever link to 3 (below it),
  // never to 2 (beside it).
  it('reaches the card beside as easily as the card below: the card under the pointer is the target', () => {
    expect(findPointerSnapTarget(others, '1', 300, 80, W, H, 16)?.targetId).toBe('2')
    expect(findPointerSnapTarget(others, '1', 100, 150, W, H, 16)?.targetId).toBe('3')
    expect(findPointerSnapTarget(others, '1', 300, 150, W, H, 16)?.targetId).toBe('4')
  })

  it('picks the side from where the pointer sits on the target, relative to its width and height', () => {
    const on2 = (px: number, py: number): { x: number; y: number } => {
      const s = findPointerSnapTarget(others, '1', px, py, W, H, 16)!
      return { x: s.snappedX, y: s.snappedY }
    }
    // Left third of 2 → dragged card to 2's left, same row.
    expect(on2(215, 80)).toEqual({ x: 208 - W - 12, y: 48 })
    // Right part → to its right.
    expect(on2(385, 80)).toEqual({ x: 208 + W + 12, y: 48 })
    // Near the top edge, centered horizontally → above; near the bottom → below.
    expect(on2(298, 50)).toEqual({ x: 208, y: 48 - H - 12 })
    expect(on2(298, 110)).toEqual({ x: 208, y: 48 + H + 12 })
  })

  it('in a gap between cards, takes the nearest within reach, and nothing beyond it', () => {
    // In the 8px gap between 2 (ends at y=112) and 4 (starts at y=120), closer to 4.
    expect(findPointerSnapTarget(others, '1', 300, 117, W, H, 16)?.targetId).toBe('4')
    expect(findPointerSnapTarget(others, '1', 300, 114, W, H, 16)?.targetId).toBe('2')
    // Far from every card.
    expect(findPointerSnapTarget(others, '1', 900, 900, W, H, 16)).toBeNull()
    expect(findPointerSnapTarget(others, '1', 300, 112 + 20, W, H, 16)?.targetId).toBe('4')
    expect(findPointerSnapTarget(others, '1', 600, 80, W, H, 16)).toBeNull()
  })

  it('never targets the dragged card itself', () => {
    expect(findPointerSnapTarget(cards, '1', 100, 80, W, H, 16)?.targetId).not.toBe('1')
  })
})

describe('addClusterSubtreeToBoard', () => {
  // top ─┬─ mid ─── leaf (codes c3)   notes n1 on mid
  //      └─ other (not part of the branch opened)
  // A code in two clusters, one outside the branch; a note on the root.
  const codes = ['c1', 'c2', 'c3', 'c4'].map(makeCode)
  const data = makeData({
    codes,
    notes: [{ id: 'n1', question: null, answer: 'memo', tags: [], noteCategoryId: null, attachedTo: { kind: 'project' }, createdAt: '0', updatedAt: '0' }],
    categories: [
      makeCategory('top', { codeIds: ['c1'] }),
      makeCategory('mid', { parentCategoryId: 'top', codeIds: ['c2'], noteIds: ['n1'] }),
      makeCategory('leaf', { parentCategoryId: 'mid', codeIds: ['c3'] }),
      makeCategory('other', { parentCategoryId: 'top', codeIds: ['c4'] }),
      makeCategory('elsewhere', { codeIds: ['c2'] })
    ],
    boards: [{ id: 'b', name: 'Main', isDefault: true }, { id: 'w', name: 'Work', isDefault: false }]
  })

  it('places the branch, nested, with its codes and notes, and nothing outside it', () => {
    const next = addClusterSubtreeToBoard(data, 'w', 'mid')
    const placed = next.boardClusters.filter((c) => c.boardId === 'w')
    expect(placed.map((c) => c.categoryId).sort()).toEqual(['leaf', 'mid'])
    const mid = placed.find((c) => c.categoryId === 'mid')!
    const leaf = placed.find((c) => c.categoryId === 'leaf')!
    // The branch root sits at the board's origin, its child inside it.
    expect(mid.x).toBe(GRID_ORIGIN_X)
    expect(leaf.x).toBeGreaterThanOrEqual(mid.x)
    expect(leaf.y).toBeGreaterThan(mid.y)
    expect(leaf.x + leaf.width).toBeLessThanOrEqual(mid.x + mid.width)
    expect(leaf.y + leaf.height).toBeLessThanOrEqual(mid.y + mid.height)
    const items = next.boardItems.filter((i) => i.boardId === 'w').map((i) => `${i.refType}:${i.refId}`).sort()
    expect(items).toEqual(['code:c2', 'code:c3', 'note:n1'])
    // The default board and the project's categories are untouched.
    expect(next.boardClusters.filter((c) => c.boardId === 'b')).toEqual([])
    expect(next.categories).toBe(data.categories)
  })

  it('from the top: the whole tree, and a second call adds nothing', () => {
    const next = addClusterSubtreeToBoard(data, 'w', 'top')
    expect(next.boardClusters.filter((c) => c.boardId === 'w').map((c) => c.categoryId).sort()).toEqual(['leaf', 'mid', 'other', 'top'])
    expect(addClusterSubtreeToBoard(next, 'w', 'top')).toBe(next)
    expect(addClusterSubtreeToBoard(next, 'w', 'nope')).toBe(next)
  })

  it('leaves what is already on the board where it is', () => {
    const first = addClusterSubtreeToBoard(data, 'w', 'other')
    const before = first.boardClusters.find((c) => c.categoryId === 'other')!
    const next = addClusterSubtreeToBoard(first, 'w', 'top')
    expect(next.boardClusters.find((c) => c.categoryId === 'other')).toBe(before)
    expect(next.boardClusters.filter((c) => c.boardId === 'w')).toHaveLength(4)
  })
})
