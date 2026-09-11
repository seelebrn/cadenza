import { describe, expect, it } from 'vitest'
import {
  addAllClustersToBoard,
  addAllCodesToBoard,
  addAllNotesToBoard,
  addItemToBoard,
  applyClusterPositions,
  assignItemToCluster,
  computeAccommodatingSize,
  computeClusterSize,
  computeGridPosition,
  computeRadialLayout,
  computeTreeLayout,
  createBoard,
  createClusterForCategory,
  createClusterWithNewCategory,
  deleteBoard,
  deleteCluster,
  describeBoardItem,
  findClusterAtPoint,
  findClusterForCategoryOnBoard,
  findClustersEnclosedBy,
  findSnapTarget,
  getClusterMemberItems,
  getDefaultBoardId,
  getLinkedGroup,
  getVisibleBoardClusters,
  getVisibleBoardItems,
  getVisibleClusterLinks,
  linkItems,
  moveCluster,
  moveItem,
  removeItemFromBoard,
  renameBoard,
  resetDefaultBoardClusterLayout,
  resizeCluster,
  unassignItemFromCluster,
  unlinkItems
} from './boardOps'
import { addCodeToCategory } from './categoryOps'
import type { BoardCluster, BoardItem, BoardRecord, CategoryRecord, ClusterLink, ProjectData } from './types'

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
})

// --- resetDefaultBoardClusterLayout ---------------------------------------

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

    // The frozen 60x60 box couldn't fit a member row — after reflow it must
    // have grown to accommodate one.
    expect(cluster.width * cluster.height).toBeGreaterThan(before.width * before.height)
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

  it('an item with an existing explicit position keeps it regardless of cluster membership', () => {
    const category = makeCategory('cat1', { codeIds: ['code1'] })
    const clusters = getVisibleBoardClusters(DEFAULT_BOARD, [], [category])
    const explicit: BoardItem[] = [{ id: 'realItem', boardId: DEFAULT_BOARD.id, refType: 'code', refId: 'code1', x: 9999, y: 9999 }]
    const items = getVisibleBoardItems(DEFAULT_BOARD, explicit, [{ id: 'code1' }], [], [category], clusters)
    expect(items).toEqual(explicit)
  })

  it('old 4-argument call signature (no categories/clusters) still works', () => {
    const items = getVisibleBoardItems(DEFAULT_BOARD, [], [{ id: 'c1' }], [{ id: 'n1' }])
    expect(items).toHaveLength(2)
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

// --- computeClusterSize ---------------------------------------------------

describe('computeClusterSize', () => {
  it('grows height with member count, never shrinking below the default', () => {
    const empty = computeClusterSize(0)
    const many = computeClusterSize(10)
    expect(empty.height).toBeGreaterThanOrEqual(200)
    expect(many.height).toBeGreaterThan(empty.height)
    expect(empty.width).toBe(280)
    expect(many.width).toBe(280)
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

// --- findSnapTarget ---------------------------------------------------

describe('findSnapTarget', () => {
  const CARD_WIDTH = 180
  const CARD_HEIGHT = 64

  it('returns null when nothing is within snap distance', () => {
    const items = [{ id: 'other', x: 2000, y: 2000 }]
    expect(findSnapTarget(items, 'dragged', 0, 0, CARD_WIDTH, CARD_HEIGHT, 70)).toBeNull()
  })

  it('ignores the dragged item itself as a snap candidate', () => {
    const items = [{ id: 'dragged', x: 0, y: 0 }]
    expect(findSnapTarget(items, 'dragged', 0, 0, CARD_WIDTH, CARD_HEIGHT, 70)).toBeNull()
  })

  it('snaps to the horizontal neighbor when closer horizontally, placing the dragged card edge-to-edge', () => {
    const items = [{ id: 'target', x: 300, y: 0 }]
    // Dragged card approaches from the left, level vertically (dy=0), well
    // within snap distance horizontally.
    const snap = findSnapTarget(items, 'dragged', 100, 0, CARD_WIDTH, CARD_HEIGHT, 200)
    expect(snap?.targetId).toBe('target')
    expect(snap?.snappedX).toBe(300 - CARD_WIDTH - 12) // to the left of target, with the 12px gap
  })

  it('picks the nearest of several candidates within range', () => {
    const items = [
      { id: 'far', x: 150, y: 0 },
      { id: 'near', x: 60, y: 0 }
    ]
    const snap = findSnapTarget(items, 'dragged', 0, 0, CARD_WIDTH, CARD_HEIGHT, 200)
    expect(snap?.targetId).toBe('near')
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
})

describe('computeRadialLayout', () => {
  function cluster(id: string, categoryId: string, x = 0, y = 0): BoardCluster {
    return { id, boardId: 'b1', categoryId, x, y, width: 100, height: 100, createdAt: '0' }
  }

  it('returns nothing for an empty board', () => {
    expect(computeRadialLayout([], null)).toEqual([])
  })

  it('a single cluster stays exactly where it is', () => {
    const positions = computeRadialLayout([cluster('only', 'A', 50, 60)], null)
    expect(positions).toEqual([{ id: 'only', x: 50, y: 60 }])
  })

  it('keeps the focus cluster in place and spreads the rest around it, equidistant from center', () => {
    const focus = cluster('focus', 'A', 0, 0)
    const others = [cluster('b', 'B'), cluster('c', 'C'), cluster('d', 'D')]
    const positions = computeRadialLayout([focus, ...others], 'A')
    const byId = new Map(positions.map((p) => [p.id, p]))
    expect(byId.get('focus')).toEqual({ id: 'focus', x: 0, y: 0 })

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
    const positions = computeRadialLayout([cluster('only', 'A', 5, 5), cluster('other', 'B')], 'missing')
    expect(positions.find((p) => p.id === 'only')).toEqual({ id: 'only', x: 5, y: 5 })
  })
})
