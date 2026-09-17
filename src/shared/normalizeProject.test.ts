import { describe, expect, it } from 'vitest'
import { getVisibleBoardClusters } from './boardOps'
import { normalizeProjectData } from './normalizeProject'
import type { ProjectData } from './types'

// Raw, possibly-older-shape data as it might come back from JSON.parse on
// a real .qdaproj file — deliberately typed loosely (some fields cast
// through `any`/`as ProjectData`) since the whole point of this module is
// tolerating shapes that don't fully match the current ProjectData type.
function rawData(overrides: Record<string, unknown> = {}): ProjectData {
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
    ...overrides
  } as unknown as ProjectData
}

describe('normalizeProjectData', () => {
  it('backfills noteCategories when missing entirely', () => {
    const next = normalizeProjectData(rawData())
    expect(next.noteCategories).toEqual([])
  })

  it('backfills a note\'s noteCategoryId to null when the field is missing (not just falsy)', () => {
    const next = normalizeProjectData(
      rawData({ notes: [{ id: 'n1', attachedTo: { kind: 'project' }, question: null, answer: 'x', tags: [], createdAt: '0' }] })
    )
    expect(next.notes[0].noteCategoryId).toBeNull()
  })

  it('leaves an explicit noteCategoryId (including an explicit null) alone', () => {
    const next = normalizeProjectData(
      rawData({
        notes: [
          { id: 'n1', attachedTo: { kind: 'project' }, question: null, answer: 'x', tags: [], noteCategoryId: 'cat1', createdAt: '0' }
        ]
      })
    )
    expect(next.notes[0].noteCategoryId).toBe('cat1')
  })

  it('backfills a category\'s missing color, parentCategoryId, and definition', () => {
    const next = normalizeProjectData(
      rawData({ categories: [{ id: 'c1', kind: 'theme', name: 'A', codeIds: [], noteIds: [], segmentIds: [], createdAt: '0' }] })
    )
    expect(next.categories[0].color).toBeTruthy()
    expect(next.categories[0].parentCategoryId).toBeNull()
    expect(next.categories[0].definition).toBe('')
  })

  it('leaves a fully-specified category untouched', () => {
    const next = normalizeProjectData(
      rawData({
        categories: [
          { id: 'root', kind: 'theme', name: 'Root', color: '#000000', definition: '', codeIds: [], noteIds: [], segmentIds: [], parentCategoryId: null, createdAt: '0' },
          {
            id: 'c1',
            kind: 'theme',
            name: 'A',
            color: '#123456',
            definition: 'What this theme means.',
            codeIds: ['x'],
            noteIds: [],
            segmentIds: [],
            parentCategoryId: 'root',
            createdAt: '0'
          }
        ]
      })
    )
    expect(next.categories[1]).toMatchObject({
      color: '#123456',
      definition: 'What this theme means.',
      parentCategoryId: 'root',
      codeIds: ['x']
    })
  })

  // A parent link to a category that doesn't exist would leave the category
  // unreachable from any root — the board's layout walks down from the
  // roots, so it would silently never be drawn.
  it('clears a parentCategoryId that points to a category that no longer exists', () => {
    const next = normalizeProjectData(
      rawData({
        categories: [
          { id: 'c1', kind: 'theme', name: 'A', color: '#123456', definition: '', codeIds: [], noteIds: [], segmentIds: [], parentCategoryId: 'gone', createdAt: '0' }
        ]
      })
    )
    expect(next.categories[0].parentCategoryId).toBeNull()
  })

  it('creates a default board from scratch when there are none', () => {
    const next = normalizeProjectData(rawData())
    expect(next.boards).toHaveLength(1)
    expect(next.boards[0].isDefault).toBe(true)
  })

  it('promotes the first board to default when none is marked (backfilling an older file)', () => {
    const next = normalizeProjectData(rawData({ boards: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }))
    expect(next.boards.find((b) => b.id === 'a')?.isDefault).toBe(true)
    expect(next.boards.find((b) => b.id === 'b')?.isDefault).toBe(false)
  })

  it('leaves an already-correct single default board alone', () => {
    const next = normalizeProjectData(
      rawData({ boards: [{ id: 'a', name: 'A', isDefault: false }, { id: 'b', name: 'B', isDefault: true }] })
    )
    expect(next.boards.find((b) => b.id === 'b')?.isDefault).toBe(true)
    expect(next.boards.find((b) => b.id === 'a')?.isDefault).toBe(false)
  })

  it('backfills boardLinks when missing', () => {
    expect(normalizeProjectData(rawData()).boardLinks).toEqual([])
  })

  it('backfills clusterLinks when missing', () => {
    expect(normalizeProjectData(rawData()).clusterLinks).toEqual([])
  })

  describe('legacy cluster migration (the "must not silently drop data" case)', () => {
    it('passes a NEW-shape cluster (already has categoryId) through untouched', () => {
      const next = normalizeProjectData(
        rawData({
          categories: [{ id: 'cat1', kind: 'theme', name: 'A', color: '#fff', codeIds: [], noteIds: [], segmentIds: [], parentCategoryId: null, createdAt: '0' }],
          boardClusters: [{ id: 'bc1', boardId: 'b1', categoryId: 'cat1', x: 1, y: 2, width: 3, height: 4, createdAt: '0' }],
          boardItems: []
        })
      )
      expect(next.boardClusters.filter((c) => c.boardId === 'b1')).toEqual([{ id: 'bc1', boardId: 'b1', categoryId: 'cat1', x: 1, y: 2, width: 3, height: 4, createdAt: '0' }])
      expect(next.categories).toHaveLength(1) // no extra migrated category created
    })

    it('derives a real category from a LEGACY cluster (own name/color, membership via BoardItem.clusterId) instead of dropping it', () => {
      const next = normalizeProjectData(
        rawData({
          boardClusters: [{ id: 'legacyCluster1', boardId: 'b1', name: 'My old cluster', color: '#ff0000', x: 10, y: 20, width: 280, height: 200, createdAt: '2020-01-01' }],
          boardItems: [
            { id: 'i1', boardId: 'b1', refType: 'code', refId: 'code1', clusterId: 'legacyCluster1', x: 0, y: 0 },
            { id: 'i2', boardId: 'b1', refType: 'note', refId: 'note1', clusterId: 'legacyCluster1', x: 0, y: 0 },
            { id: 'i3', boardId: 'b1', refType: 'code', refId: 'unrelatedCode', clusterId: null, x: 0, y: 0 }
          ]
        })
      )
      expect(next.categories).toHaveLength(1)
      const migrated = next.categories[0]
      expect(migrated.name).toBe('My old cluster')
      expect(migrated.color).toBe('#ff0000')
      expect(migrated.codeIds).toEqual(['code1'])
      expect(migrated.noteIds).toEqual(['note1'])

      // The board cluster shape survives too, now pointing at the derived category.
      const onB1 = next.boardClusters.filter((c) => c.boardId === 'b1')
      expect(onB1).toHaveLength(1)
      expect(onB1[0]).toMatchObject({ id: 'legacyCluster1', x: 10, y: 20, width: 280, height: 200 })
      expect(onB1[0].categoryId).toBe(migrated.id)

      // clusterId is stripped from board items (no longer part of the
      // current BoardItem shape) without losing anything else about them.
      expect(next.boardItems.find((i) => i.id === 'i1')).not.toHaveProperty('clusterId')
      expect(next.boardItems.find((i) => i.id === 'i1')).toMatchObject({ refType: 'code', refId: 'code1' })
      expect(next.boardItems.find((i) => i.id === 'i3')).toMatchObject({ refType: 'code', refId: 'unrelatedCode' })
    })

    it('a legacy cluster with no name/color falls back to defaults rather than crashing', () => {
      const next = normalizeProjectData(
        rawData({
          boardClusters: [{ id: 'legacy1', boardId: 'b1', x: 0, y: 0, width: 1, height: 1 }],
          boardItems: []
        })
      )
      expect(next.categories).toHaveLength(1)
      expect(next.categories[0].name).toBeTruthy()
      expect(next.categories[0].color).toBeTruthy()
    })

    it('a legacy cluster with zero members migrates to a real, empty category (not dropped)', () => {
      const next = normalizeProjectData(
        rawData({
          boardClusters: [{ id: 'legacy1', boardId: 'b1', name: 'Empty', color: '#fff', x: 0, y: 0, width: 1, height: 1, createdAt: '0' }],
          boardItems: []
        })
      )
      expect(next.categories).toHaveLength(1)
      expect(next.categories[0].codeIds).toEqual([])
    })

    it('handles a mix of legacy and new-shape clusters in the same project', () => {
      const next = normalizeProjectData(
        rawData({
          categories: [{ id: 'existingCat', kind: 'theme', name: 'Existing', color: '#fff', codeIds: [], noteIds: [], segmentIds: [], parentCategoryId: null, createdAt: '0' }],
          boardClusters: [
            { id: 'newShape', boardId: 'b1', categoryId: 'existingCat', x: 0, y: 0, width: 1, height: 1, createdAt: '0' },
            { id: 'legacyShape', boardId: 'b1', name: 'Legacy', color: '#000', x: 0, y: 0, width: 1, height: 1, createdAt: '0' }
          ],
          boardItems: []
        })
      )
      expect(next.boardClusters.filter((c) => c.boardId === 'b1')).toHaveLength(2)
      expect(next.categories).toHaveLength(2) // the existing one + the newly-migrated one
      expect(next.categories.map((c) => c.name).sort()).toEqual(['Existing', 'Legacy'])
    })

    it('missing boardClusters/boardItems entirely does not crash', () => {
      expect(() => normalizeProjectData(rawData())).not.toThrow()
      const next = normalizeProjectData(rawData())
      expect(next.boardClusters).toEqual([])
      expect(next.boardItems).toEqual([])
    })
  })
})

describe('normalizeProjectData — board robustness on load', () => {
  const board = { id: 'main', name: 'Main', isDefault: true }
  function category(id: string, parentCategoryId: string | null = null, codeIds: string[] = []): unknown {
    return { id, kind: 'theme', name: id, color: '#fff', definition: '', codeIds, noteIds: [], segmentIds: [], parentCategoryId, createdAt: '0' }
  }

  // Only a damaged file can nest a cluster inside itself; it used to make
  // those clusters silently disappear from the board.
  it('breaks nesting cycles so every cluster is drawn', () => {
    const next = normalizeProjectData(
      rawData({ boards: [board], categories: [category('A', 'B'), category('B', 'A'), category('S', 'S'), category('OK')] })
    )
    const drawn = getVisibleBoardClusters(board, next.boardClusters, next.categories).map((c) => c.categoryId).sort()
    expect(drawn).toEqual(['A', 'B', 'OK', 'S'])
    // Only the cycle is cut: one of A/B stays nested under the other.
    expect(next.categories.filter((c) => c.parentCategoryId).length).toBe(1)
  })

  // Duplicates made a drag move one copy while the board drew the other.
  it('keeps one stored shape per cluster per board (the one that was drawn)', () => {
    const next = normalizeProjectData(
      rawData({
        boards: [board],
        categories: [category('A')],
        boardClusters: [
          { id: 'first', boardId: 'main', categoryId: 'A', x: 100, y: 100, width: 300, height: 200, createdAt: '0' },
          { id: 'second', boardId: 'main', categoryId: 'A', x: 900, y: 900, width: 300, height: 200, createdAt: '0' }
        ],
        boardItems: [
          { id: 'i1', boardId: 'main', refType: 'code', refId: 'c', x: 0, y: 0 },
          { id: 'i2', boardId: 'main', refType: 'code', refId: 'c', x: 50, y: 50 }
        ]
      })
    )
    expect(next.boardClusters.map((c) => c.id)).toEqual(['second'])
    expect(next.boardItems.map((i) => i.id)).toEqual(['i2'])
  })

  // Never-touched top-level clusters used to be packed together live, so the
  // first one to grow or be touched made the rest jump.
  it('pins never-touched top-level clusters on the default board, without moving anything', () => {
    const categories = [category('A', null, ['a', 'b', 'c', 'd', 'e']), category('B'), category('C', null, ['f']), category('D', 'A')]
    const raw = rawData({ boards: [board], categories })
    const shownBefore = getVisibleBoardClusters(board, [], raw.categories)
    const next = normalizeProjectData(raw)
    expect(next.boardClusters.map((c) => c.categoryId).sort()).toEqual(['A', 'B', 'C'])
    const shownAfter = getVisibleBoardClusters(board, next.boardClusters, next.categories)
    for (const b of shownBefore) {
      const a = shownAfter.find((c) => c.categoryId === b.categoryId)!
      expect({ x: a.x, y: a.y, width: a.width, height: a.height }).toEqual({ x: b.x, y: b.y, width: b.width, height: b.height })
    }
  })
})
