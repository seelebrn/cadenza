import { describe, expect, it } from 'vitest'
import {
  addCode,
  applyCodeToSelection,
  deleteCode,
  ensureSegment,
  mergeCodes,
  pruneOrphanSegment,
  removeCoding,
  renameCode,
  reparentCode,
  setCodeColor,
  setCodeDefinition
} from './projectOps'
import type { CodeNode, ProjectData, Segment } from './types'

function makeCode(id: string, overrides: Partial<CodeNode> = {}): CodeNode {
  return { id, kind: 'code', name: id, color: '#fff', definition: '', parentId: null, createdAt: '0', ...overrides }
}

function makeSegment(id: string, overrides: Partial<Segment> = {}): Segment {
  return { id, documentId: 'doc1', start: 0, end: 5, text: 'hello', ...overrides }
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

describe('addCode', () => {
  it('creates a code with defaults for optional fields', () => {
    const { data, codeId } = addCode(makeData(), { name: 'Fear', kind: 'code', color: '#f00' })
    const code = data.codes.find((c) => c.id === codeId)!
    expect(code).toMatchObject({ name: 'Fear', kind: 'code', color: '#f00', definition: '', parentId: null })
  })

  it('accepts an explicit definition and parentId', () => {
    const { data, codeId } = addCode(makeData({ codes: [makeCode('parent')] }), {
      name: 'Child',
      kind: 'item',
      color: '#f00',
      definition: 'a note',
      parentId: 'parent'
    })
    const code = data.codes.find((c) => c.id === codeId)!
    expect(code.definition).toBe('a note')
    expect(code.parentId).toBe('parent')
    expect(code.kind).toBe('item')
  })
})

describe('renameCode / setCodeColor / setCodeDefinition', () => {
  it('each only touches the targeted code', () => {
    const data = makeData({ codes: [makeCode('A'), makeCode('B')] })
    expect(renameCode(data, 'A', 'New').codes.find((c) => c.id === 'A')?.name).toBe('New')
    expect(renameCode(data, 'A', 'New').codes.find((c) => c.id === 'B')?.name).toBe('B')
    expect(setCodeColor(data, 'A', '#123').codes.find((c) => c.id === 'A')?.color).toBe('#123')
    expect(setCodeDefinition(data, 'A', 'def').codes.find((c) => c.id === 'A')?.definition).toBe('def')
  })
})

describe('reparentCode', () => {
  it('sets parentId, and null un-nests', () => {
    const data = makeData({ codes: [makeCode('A'), makeCode('B')] })
    const nested = reparentCode(data, 'A', 'B')
    expect(nested.codes.find((c) => c.id === 'A')?.parentId).toBe('B')
    const unnested = reparentCode(nested, 'A', null)
    expect(unnested.codes.find((c) => c.id === 'A')?.parentId).toBeNull()
  })

  it('refuses to make a code its own parent', () => {
    const data = makeData({ codes: [makeCode('A')] })
    expect(reparentCode(data, 'A', 'A')).toBe(data)
  })

  it('refuses to create a cycle', () => {
    const data = makeData({ codes: [makeCode('A'), makeCode('B', { parentId: 'A' }), makeCode('C', { parentId: 'B' })] })
    const next = reparentCode(data, 'A', 'C')
    expect(next).toBe(data)
  })
})

describe('ensureSegment', () => {
  it('creates a new segment for a fresh span', () => {
    const { data, segmentId } = ensureSegment(makeData(), { documentId: 'd1', start: 0, end: 5, text: 'hello' })
    expect(data.segments).toHaveLength(1)
    expect(data.segments[0].id).toBe(segmentId)
  })

  it('reuses an existing segment at the exact same [documentId, start, end], not creating a duplicate', () => {
    const first = ensureSegment(makeData(), { documentId: 'd1', start: 0, end: 5, text: 'hello' })
    const second = ensureSegment(first.data, { documentId: 'd1', start: 0, end: 5, text: 'hello' })
    expect(second.segmentId).toBe(first.segmentId)
    expect(second.data.segments).toHaveLength(1)
  })

  it('a different offset range on the same document creates a distinct segment', () => {
    const first = ensureSegment(makeData(), { documentId: 'd1', start: 0, end: 5, text: 'hello' })
    const second = ensureSegment(first.data, { documentId: 'd1', start: 6, end: 11, text: 'world' })
    expect(second.segmentId).not.toBe(first.segmentId)
    expect(second.data.segments).toHaveLength(2)
  })
})

describe('applyCodeToSelection / removeCoding', () => {
  it('creates a segment and coding together', () => {
    const next = applyCodeToSelection(makeData({ codes: [makeCode('c1')] }), {
      documentId: 'd1',
      start: 0,
      end: 5,
      text: 'hello',
      codeId: 'c1'
    })
    expect(next.segments).toHaveLength(1)
    expect(next.codings).toHaveLength(1)
    expect(next.codings[0].codeId).toBe('c1')
  })

  it('does not duplicate a coding already applied to the exact same segment', () => {
    const once = applyCodeToSelection(makeData({ codes: [makeCode('c1')] }), {
      documentId: 'd1',
      start: 0,
      end: 5,
      text: 'hello',
      codeId: 'c1'
    })
    const twice = applyCodeToSelection(once, { documentId: 'd1', start: 0, end: 5, text: 'hello', codeId: 'c1' })
    expect(twice.codings).toHaveLength(1)
  })

  it('applying two DIFFERENT codes to the same segment both stick', () => {
    const withFirst = applyCodeToSelection(makeData({ codes: [makeCode('c1'), makeCode('c2')] }), {
      documentId: 'd1',
      start: 0,
      end: 5,
      text: 'hello',
      codeId: 'c1'
    })
    const withBoth = applyCodeToSelection(withFirst, { documentId: 'd1', start: 0, end: 5, text: 'hello', codeId: 'c2' })
    expect(withBoth.codings).toHaveLength(2)
    expect(withBoth.segments).toHaveLength(1) // still just one underlying segment
  })

  it('removeCoding prunes the segment if nothing else references it', () => {
    const data = applyCodeToSelection(makeData({ codes: [makeCode('c1')] }), {
      documentId: 'd1',
      start: 0,
      end: 5,
      text: 'hello',
      codeId: 'c1'
    })
    const codingId = data.codings[0].id
    const next = removeCoding(data, codingId)
    expect(next.codings).toHaveLength(0)
    expect(next.segments).toHaveLength(0)
  })

  it('removeCoding keeps the segment alive if a note still references it', () => {
    const coded = applyCodeToSelection(makeData({ codes: [makeCode('c1')] }), {
      documentId: 'd1',
      start: 0,
      end: 5,
      text: 'hello',
      codeId: 'c1'
    })
    const segmentId = coded.segments[0].id
    const withNote: ProjectData = {
      ...coded,
      notes: [
        {
          id: 'n1',
          attachedTo: { kind: 'segment', segmentId },
          question: null,
          answer: 'x',
          tags: [],
          noteCategoryId: null,
          createdAt: '0',
          updatedAt: '0'
        }
      ]
    }
    const next = removeCoding(withNote, withNote.codings[0].id)
    expect(next.codings).toHaveLength(0)
    expect(next.segments).toHaveLength(1) // kept alive by the note
  })
})

describe('pruneOrphanSegment', () => {
  it('keeps a segment referenced by a category', () => {
    const data = makeData({
      segments: [makeSegment('s1')],
      categories: [{ id: 'cat1', kind: 'theme', name: 'A', color: '#fff', codeIds: [], noteIds: [], segmentIds: ['s1'], parentCategoryId: null, createdAt: '0' }]
    })
    expect(pruneOrphanSegment(data, 's1').segments).toHaveLength(1)
  })

  it('keeps a segment referenced by a board item', () => {
    const data = makeData({
      segments: [makeSegment('s1')],
      boardItems: [{ id: 'bi1', boardId: 'b1', refType: 'segment', refId: 's1', x: 0, y: 0 }]
    })
    expect(pruneOrphanSegment(data, 's1').segments).toHaveLength(1)
  })

  it('removes a segment with no references left', () => {
    const data = makeData({ segments: [makeSegment('s1')] })
    expect(pruneOrphanSegment(data, 's1').segments).toHaveLength(0)
  })
})

describe('deleteCode', () => {
  it('removes the code, promotes children, cascades codings/notes/categories/board items, and prunes the orphaned segment', () => {
    const coded = applyCodeToSelection(makeData({ codes: [makeCode('grandparent'), makeCode('parent', { parentId: 'grandparent' }), makeCode('child', { parentId: 'parent' })] }), {
      documentId: 'd1',
      start: 0,
      end: 5,
      text: 'hello',
      codeId: 'parent'
    })
    const withExtras: ProjectData = {
      ...coded,
      notes: [
        { id: 'n1', attachedTo: { kind: 'code', codeId: 'parent' }, question: null, answer: 'x', tags: [], noteCategoryId: null, createdAt: '0', updatedAt: '0' }
      ],
      categories: [{ id: 'cat1', kind: 'theme', name: 'A', color: '#fff', codeIds: ['parent'], noteIds: [], segmentIds: [], parentCategoryId: null, createdAt: '0' }],
      boardItems: [{ id: 'bi1', boardId: 'b1', refType: 'code', refId: 'parent', x: 0, y: 0 }]
    }

    const next = deleteCode(withExtras, 'parent')
    expect(next.codes.map((c) => c.id).sort()).toEqual(['child', 'grandparent'])
    expect(next.codes.find((c) => c.id === 'child')?.parentId).toBe('grandparent') // promoted, not orphaned
    expect(next.codings).toHaveLength(0)
    expect(next.notes).toHaveLength(0)
    expect(next.categories[0].codeIds).toEqual([])
    expect(next.boardItems).toHaveLength(0)
    expect(next.segments).toHaveLength(0) // orphaned once the coding was removed
  })

  it('is a no-op if the code does not exist', () => {
    const data = makeData({ codes: [makeCode('A')] })
    expect(deleteCode(data, 'missing')).toBe(data)
  })
})

describe('mergeCodes', () => {
  it('moves codings from the source to the target, dropping the source code', () => {
    const withSource = applyCodeToSelection(makeData({ codes: [makeCode('source'), makeCode('target')] }), {
      documentId: 'd1',
      start: 0,
      end: 5,
      text: 'hello',
      codeId: 'source'
    })
    const next = mergeCodes(withSource, 'source', 'target')
    expect(next.codes.map((c) => c.id)).toEqual(['target'])
    expect(next.codings).toHaveLength(1)
    expect(next.codings[0].codeId).toBe('target')
  })

  it('does not duplicate a coding if the target already codes that exact segment', () => {
    const withSourceCoding = applyCodeToSelection(makeData({ codes: [makeCode('source'), makeCode('target')] }), {
      documentId: 'd1',
      start: 0,
      end: 5,
      text: 'hello',
      codeId: 'source'
    })
    const withBothCoding = applyCodeToSelection(withSourceCoding, { documentId: 'd1', start: 0, end: 5, text: 'hello', codeId: 'target' })
    const next = mergeCodes(withBothCoding, 'source', 'target')
    // Both codings pointed at the same segment; after merging, only one
    // (the target's) coding should remain for that segment.
    expect(next.codings.filter((c) => c.codeId === 'target')).toHaveLength(1)
  })

  it("moves the source's children under the target", () => {
    const data = makeData({ codes: [makeCode('source'), makeCode('target'), makeCode('child', { parentId: 'source' })] })
    const next = mergeCodes(data, 'source', 'target')
    expect(next.codes.find((c) => c.id === 'child')?.parentId).toBe('target')
  })

  it('reassigns category membership without duplicating if the target is already a member', () => {
    const data = makeData({
      codes: [makeCode('source'), makeCode('target')],
      categories: [{ id: 'cat1', kind: 'theme', name: 'A', color: '#fff', codeIds: ['source', 'target'], noteIds: [], segmentIds: [], parentCategoryId: null, createdAt: '0' }]
    })
    const next = mergeCodes(data, 'source', 'target')
    expect(next.categories[0].codeIds).toEqual(['target'])
  })

  it('reassigns board items referencing the source to the target', () => {
    const data = makeData({
      codes: [makeCode('source'), makeCode('target')],
      boardItems: [{ id: 'bi1', boardId: 'b1', refType: 'code', refId: 'source', x: 0, y: 0 }]
    })
    const next = mergeCodes(data, 'source', 'target')
    expect(next.boardItems[0].refId).toBe('target')
  })

  it('is a no-op merging a code into itself', () => {
    const data = makeData({ codes: [makeCode('A')] })
    expect(mergeCodes(data, 'A', 'A')).toBe(data)
  })
})
