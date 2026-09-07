import { describe, expect, it } from 'vitest'
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

  it('backfills a category\'s missing color and parentCategoryId', () => {
    const next = normalizeProjectData(
      rawData({ categories: [{ id: 'c1', kind: 'theme', name: 'A', codeIds: [], noteIds: [], segmentIds: [], createdAt: '0' }] })
    )
    expect(next.categories[0].color).toBeTruthy()
    expect(next.categories[0].parentCategoryId).toBeNull()
  })

  it('leaves a fully-specified category untouched', () => {
    const next = normalizeProjectData(
      rawData({
        categories: [
          { id: 'c1', kind: 'theme', name: 'A', color: '#123456', codeIds: ['x'], noteIds: [], segmentIds: [], parentCategoryId: 'root', createdAt: '0' }
        ]
      })
    )
    expect(next.categories[0]).toMatchObject({ color: '#123456', parentCategoryId: 'root', codeIds: ['x'] })
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

  describe('legacy cluster migration (the "must not silently drop data" case)', () => {
    it('passes a NEW-shape cluster (already has categoryId) through untouched', () => {
      const next = normalizeProjectData(
        rawData({
          categories: [{ id: 'cat1', kind: 'theme', name: 'A', color: '#fff', codeIds: [], noteIds: [], segmentIds: [], parentCategoryId: null, createdAt: '0' }],
          boardClusters: [{ id: 'bc1', boardId: 'b1', categoryId: 'cat1', x: 1, y: 2, width: 3, height: 4, createdAt: '0' }],
          boardItems: []
        })
      )
      expect(next.boardClusters).toEqual([{ id: 'bc1', boardId: 'b1', categoryId: 'cat1', x: 1, y: 2, width: 3, height: 4, createdAt: '0' }])
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
      expect(next.boardClusters).toHaveLength(1)
      expect(next.boardClusters[0]).toMatchObject({ id: 'legacyCluster1', x: 10, y: 20, width: 280, height: 200 })
      expect(next.boardClusters[0].categoryId).toBe(migrated.id)

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
      expect(next.boardClusters).toHaveLength(2)
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
