import { describe, expect, it } from 'vitest'
import {
  addCodeToCategory,
  addMemberByRefType,
  addNoteToCategory,
  addSegmentToCategory,
  createCategory,
  deleteCategory,
  getCategoryDepth,
  getDescendantCategoryIds,
  isCategoryMember,
  removeCodeFromCategory,
  removeMemberByRefType,
  removeNoteFromCategory,
  removeSegmentFromCategory,
  renameCategory,
  reparentCategory,
  setCategoryColor,
  setCategoryDefinition,
  setCategoryKind
} from './categoryOps'
import type { CategoryRecord, ProjectData } from './types'

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

function makeData(categories: CategoryRecord[] = []): ProjectData {
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
    categories,
    boards: [],
    boardItems: [],
    boardClusters: [],
    boardLinks: []
  } as ProjectData
}

describe('createCategory', () => {
  it('creates a category with empty membership lists, no parent, and no definition by default', () => {
    const { data, categoryId } = createCategory(makeData(), { name: 'Emotions', kind: 'theme', color: '#f00' })
    const category = data.categories.find((c) => c.id === categoryId)!
    expect(category).toMatchObject({
      name: 'Emotions',
      kind: 'theme',
      color: '#f00',
      definition: '',
      codeIds: [],
      noteIds: [],
      segmentIds: [],
      parentCategoryId: null
    })
  })

  it('accepts an explicit definition at creation time', () => {
    const { data, categoryId } = createCategory(makeData(), {
      name: 'Emotions',
      kind: 'theme',
      color: '#f00',
      definition: 'Passages expressing an emotional reaction.'
    })
    expect(data.categories.find((c) => c.id === categoryId)?.definition).toBe(
      'Passages expressing an emotional reaction.'
    )
  })

  it('accepts an explicit parentCategoryId at creation time', () => {
    const { data, categoryId } = createCategory(makeData([makeCategory('parent')]), {
      name: 'Child',
      kind: 'theme',
      color: '#f00',
      parentCategoryId: 'parent'
    })
    expect(data.categories.find((c) => c.id === categoryId)?.parentCategoryId).toBe('parent')
  })
})

describe('renameCategory / setCategoryColor / setCategoryKind / setCategoryDefinition', () => {
  it('each only touches the targeted category', () => {
    const data = makeData([makeCategory('A'), makeCategory('B')])
    const renamed = renameCategory(data, 'A', 'New name')
    expect(renamed.categories.find((c) => c.id === 'A')?.name).toBe('New name')
    expect(renamed.categories.find((c) => c.id === 'B')?.name).toBe('B')

    const recolored = setCategoryColor(data, 'A', '#123456')
    expect(recolored.categories.find((c) => c.id === 'A')?.color).toBe('#123456')
    expect(recolored.categories.find((c) => c.id === 'B')?.color).toBe('#fff')

    const rekinded = setCategoryKind(data, 'A', 'question')
    expect(rekinded.categories.find((c) => c.id === 'A')?.kind).toBe('question')
    expect(rekinded.categories.find((c) => c.id === 'B')?.kind).toBe('theme')

    const redefined = setCategoryDefinition(data, 'A', 'What this theme actually means.')
    expect(redefined.categories.find((c) => c.id === 'A')?.definition).toBe('What this theme actually means.')
    expect(redefined.categories.find((c) => c.id === 'B')?.definition).toBe('')
  })
})

describe('reparentCategory', () => {
  it('sets parentCategoryId on the target', () => {
    const data = makeData([makeCategory('A'), makeCategory('B')])
    const next = reparentCategory(data, 'A', 'B')
    expect(next.categories.find((c) => c.id === 'A')?.parentCategoryId).toBe('B')
  })

  it('un-nests when given null', () => {
    const data = makeData([makeCategory('A', { parentCategoryId: 'B' }), makeCategory('B')])
    const next = reparentCategory(data, 'A', null)
    expect(next.categories.find((c) => c.id === 'A')?.parentCategoryId).toBeNull()
  })

  it('refuses to make a category its own parent', () => {
    const data = makeData([makeCategory('A')])
    expect(reparentCategory(data, 'A', 'A')).toBe(data)
  })

  it('refuses to create a cycle (nesting a category under its own descendant)', () => {
    // A -> B -> C (C is A's grandchild). Trying to reparent A under C
    // would create a cycle.
    const data = makeData([makeCategory('A'), makeCategory('B', { parentCategoryId: 'A' }), makeCategory('C', { parentCategoryId: 'B' })])
    const next = reparentCategory(data, 'A', 'C')
    expect(next).toBe(data)
    expect(next.categories.find((c) => c.id === 'A')?.parentCategoryId).toBeNull()
  })

  it('allows nesting under an unrelated category (not a cycle)', () => {
    const data = makeData([makeCategory('A'), makeCategory('B')])
    const next = reparentCategory(data, 'A', 'B')
    expect(next.categories.find((c) => c.id === 'A')?.parentCategoryId).toBe('B')
  })
})

describe('getDescendantCategoryIds', () => {
  it('returns all transitive descendants, not just direct children', () => {
    const categories = [makeCategory('A'), makeCategory('B', { parentCategoryId: 'A' }), makeCategory('C', { parentCategoryId: 'B' })]
    expect(getDescendantCategoryIds(categories, 'A').sort()).toEqual(['B', 'C'])
  })

  it('returns an empty list for a leaf with no children', () => {
    const categories = [makeCategory('A'), makeCategory('B', { parentCategoryId: 'A' })]
    expect(getDescendantCategoryIds(categories, 'B')).toEqual([])
  })
})

describe('getCategoryDepth', () => {
  it('a root has depth 0', () => {
    expect(getCategoryDepth([makeCategory('A')], 'A')).toBe(0)
  })

  it('counts hops up to the root, independent of array/creation order', () => {
    // Child appears BEFORE its parent in the array — depth must still be
    // computed correctly by following parentCategoryId, not array position.
    const categories = [makeCategory('B', { parentCategoryId: 'A' }), makeCategory('A')]
    expect(getCategoryDepth(categories, 'A')).toBe(0)
    expect(getCategoryDepth(categories, 'B')).toBe(1)
  })

  it('handles three levels', () => {
    const categories = [makeCategory('A'), makeCategory('B', { parentCategoryId: 'A' }), makeCategory('C', { parentCategoryId: 'B' })]
    expect(getCategoryDepth(categories, 'C')).toBe(2)
  })

  it('does not infinite-loop on a corrupted cycle', () => {
    const categories = [makeCategory('X', { parentCategoryId: 'Y' }), makeCategory('Y', { parentCategoryId: 'X' })]
    expect(() => getCategoryDepth(categories, 'X')).not.toThrow()
    expect(Number.isFinite(getCategoryDepth(categories, 'X'))).toBe(true)
  })
})

describe('deleteCategory', () => {
  it('removes the category and promotes its children to its own parent', () => {
    const data = makeData([
      makeCategory('grandparent'),
      makeCategory('parent', { parentCategoryId: 'grandparent' }),
      makeCategory('child', { parentCategoryId: 'parent' })
    ])
    const next = deleteCategory(data, 'parent')
    expect(next.categories.map((c) => c.id).sort()).toEqual(['child', 'grandparent'])
    expect(next.categories.find((c) => c.id === 'child')?.parentCategoryId).toBe('grandparent')
  })

  it('a deleted root category promotes its children to root (null parent)', () => {
    const data = makeData([makeCategory('root'), makeCategory('child', { parentCategoryId: 'root' })])
    const next = deleteCategory(data, 'root')
    expect(next.categories.find((c) => c.id === 'child')?.parentCategoryId).toBeNull()
  })

  it('falls back notes attached to the deleted category to a project-level attachment', () => {
    const data: ProjectData = {
      ...makeData([makeCategory('A')]),
      notes: [
        {
          id: 'n1',
          attachedTo: { kind: 'category', categoryId: 'A' },
          question: null,
          answer: 'x',
          tags: [],
          noteCategoryId: null,
          createdAt: '0',
          updatedAt: '0'
        }
      ]
    }
    const next = deleteCategory(data, 'A')
    expect(next.notes[0].attachedTo).toEqual({ kind: 'project' })
  })

  it('removes board cluster shapes representing the deleted category, on every board', () => {
    const data: ProjectData = {
      ...makeData([makeCategory('A')]),
      boardClusters: [
        { id: 'c1', boardId: 'b1', categoryId: 'A', x: 0, y: 0, width: 1, height: 1, createdAt: '0' },
        { id: 'c2', boardId: 'b2', categoryId: 'A', x: 0, y: 0, width: 1, height: 1, createdAt: '0' },
        { id: 'c3', boardId: 'b1', categoryId: 'other', x: 0, y: 0, width: 1, height: 1, createdAt: '0' }
      ]
    }
    const next = deleteCategory(data, 'A')
    expect(next.boardClusters.map((c) => c.id)).toEqual(['c3'])
  })

  it('is a no-op if the category does not exist', () => {
    const data = makeData([makeCategory('A')])
    expect(deleteCategory(data, 'missing')).toBe(data)
  })
})

describe('member add/remove (codes, notes, segments)', () => {
  it('addCodeToCategory adds without duplicating', () => {
    const data = makeData([makeCategory('A')])
    const once = addCodeToCategory(data, 'A', 'code1')
    expect(once.categories[0].codeIds).toEqual(['code1'])
    const twice = addCodeToCategory(once, 'A', 'code1')
    expect(twice.categories[0].codeIds).toEqual(['code1'])
  })

  it('removeCodeFromCategory removes only the targeted member', () => {
    const data = makeData([makeCategory('A', { codeIds: ['code1', 'code2'] })])
    const next = removeCodeFromCategory(data, 'A', 'code1')
    expect(next.categories[0].codeIds).toEqual(['code2'])
  })

  it('addNoteToCategory / removeNoteFromCategory work the same way for notes', () => {
    const data = makeData([makeCategory('A')])
    const added = addNoteToCategory(data, 'A', 'note1')
    expect(added.categories[0].noteIds).toEqual(['note1'])
    const removed = removeNoteFromCategory(added, 'A', 'note1')
    expect(removed.categories[0].noteIds).toEqual([])
  })

  it('addSegmentToCategory / removeSegmentFromCategory work the same way for raw quotes', () => {
    const data = makeData([makeCategory('A')])
    const added = addSegmentToCategory(data, 'A', 'seg1')
    expect(added.categories[0].segmentIds).toEqual(['seg1'])
    const removed = removeSegmentFromCategory(added, 'A', 'seg1')
    expect(removed.categories[0].segmentIds).toEqual([])
  })

  it('addMemberByRefType / removeMemberByRefType dispatch to the right list by refType', () => {
    const data = makeData([makeCategory('A')])
    const withCode = addMemberByRefType(data, 'A', 'code', 'c1')
    expect(withCode.categories[0].codeIds).toEqual(['c1'])
    const withNote = addMemberByRefType(withCode, 'A', 'note', 'n1')
    expect(withNote.categories[0].noteIds).toEqual(['n1'])
    const withSegment = addMemberByRefType(withNote, 'A', 'segment', 's1')
    expect(withSegment.categories[0].segmentIds).toEqual(['s1'])

    const withoutCode = removeMemberByRefType(withSegment, 'A', 'code', 'c1')
    expect(withoutCode.categories[0].codeIds).toEqual([])
  })
})

describe('isCategoryMember', () => {
  it('checks the correct list per refType', () => {
    const category = makeCategory('A', { codeIds: ['c1'], noteIds: ['n1'], segmentIds: ['s1'] })
    expect(isCategoryMember(category, 'code', 'c1')).toBe(true)
    expect(isCategoryMember(category, 'code', 'n1')).toBe(false)
    expect(isCategoryMember(category, 'note', 'n1')).toBe(true)
    expect(isCategoryMember(category, 'segment', 's1')).toBe(true)
    expect(isCategoryMember(category, 'segment', 'nope')).toBe(false)
  })
})
