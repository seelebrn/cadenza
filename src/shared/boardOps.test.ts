import { describe, expect, it } from 'vitest'
import {
  addAllClustersToBoard,
  addAllCodesToBoard,
  addAllNotesToBoard,
  addItemToBoard,
  assignItemToCluster,
  computeAccommodatingSize,
  computeClusterSize,
  computeGridPosition,
  createBoard,
  createClusterForCategory,
  createClusterWithNewCategory,
  deleteBoard,
  deleteCluster,
  describeBoardItem,
  findClusterAtPoint,
  findClusterForCategoryOnBoard,
  findSnapTarget,
  getClusterMemberItems,
  getDefaultBoardId,
  getLinkedGroup,
  getVisibleBoardClusters,
  getVisibleBoardItems,
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
import type { BoardCluster, BoardItem, BoardRecord, CategoryRecord, ProjectData } from './types'

// --- test fixtures -----------------------------------------------------

function makeCategory(id: string, overrides: Partial<CategoryRecord> = {}): CategoryRecord {
  return {
    id,
    kind: 'theme',
    name: id,
    color: '#fff',
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
