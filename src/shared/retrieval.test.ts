import { describe, expect, it } from 'vitest'
import { CODE_USAGE_CONTEXT_WORDS, getCodeUsageDetail, getDescendantCodeIds, retrieveByCode, retrieveNotes } from './retrieval'
import type { CodeNode, DocumentRecord, ProjectData, Segment } from './types'

function makeCode(id: string, overrides: Partial<CodeNode> = {}): CodeNode {
  return { id, kind: 'code', name: id, color: '#fff', definition: '', parentId: null, createdAt: '0', ...overrides }
}

function makeDoc(id: string, paragraphs: string[], title = 'Doc'): DocumentRecord {
  return { id, title, paragraphs, sourceFormat: 'txt', assetRelPath: null, importedAt: '0' }
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

describe('getDescendantCodeIds', () => {
  it('returns all transitive descendants', () => {
    const codes = [makeCode('A'), makeCode('B', { parentId: 'A' }), makeCode('C', { parentId: 'B' })]
    expect(getDescendantCodeIds(codes, 'A').sort()).toEqual(['B', 'C'])
  })

  it('returns nothing for a leaf', () => {
    const codes = [makeCode('A'), makeCode('B', { parentId: 'A' })]
    expect(getDescendantCodeIds(codes, 'B')).toEqual([])
  })
})

describe('retrieveByCode', () => {
  const parent = makeCode('parent')
  const child = makeCode('child', { parentId: 'parent' })
  const doc = makeDoc('d1', ['some text here'], 'Interview A')
  const seg1: Segment = { id: 's1', documentId: 'd1', start: 0, end: 4, text: 'some' }
  const seg2: Segment = { id: 's2', documentId: 'd1', start: 5, end: 9, text: 'text' }

  it('finds every instance coded with exactly that code, by default including descendants', () => {
    const data = makeData({
      codes: [parent, child],
      documents: [doc],
      segments: [seg1, seg2],
      codings: [
        { id: 'c1', segmentId: 's1', codeId: 'parent', createdAt: '0' },
        { id: 'c2', segmentId: 's2', codeId: 'child', createdAt: '0' }
      ]
    })
    const results = retrieveByCode(data, 'parent')
    expect(results).toHaveLength(2)
  })

  it('excludes descendants when explicitly asked to', () => {
    const data = makeData({
      codes: [parent, child],
      documents: [doc],
      segments: [seg1, seg2],
      codings: [
        { id: 'c1', segmentId: 's1', codeId: 'parent', createdAt: '0' },
        { id: 'c2', segmentId: 's2', codeId: 'child', createdAt: '0' }
      ]
    })
    const results = retrieveByCode(data, 'parent', { includeDescendants: false })
    expect(results).toHaveLength(1)
    expect(results[0].codeId).toBe('parent')
  })

  it('sorts by document title, then by position within the document', () => {
    const docA = makeDoc('dA', ['x'], 'Alpha')
    const docB = makeDoc('dB', ['y'], 'Beta')
    const segLate: Segment = { id: 'sLate', documentId: 'dA', start: 10, end: 14, text: 'late' }
    const segEarly: Segment = { id: 'sEarly', documentId: 'dA', start: 0, end: 5, text: 'early' }
    const segOther: Segment = { id: 'sOther', documentId: 'dB', start: 0, end: 1, text: 'z' }
    const data = makeData({
      codes: [makeCode('c1')],
      documents: [docA, docB],
      segments: [segLate, segEarly, segOther],
      codings: [
        { id: 'k1', segmentId: 'sLate', codeId: 'c1', createdAt: '0' },
        { id: 'k2', segmentId: 'sEarly', codeId: 'c1', createdAt: '0' },
        { id: 'k3', segmentId: 'sOther', codeId: 'c1', createdAt: '0' }
      ]
    })
    const results = retrieveByCode(data, 'c1')
    expect(results.map((r) => r.segment.id)).toEqual(['sEarly', 'sLate', 'sOther'])
  })

  it('labels a segment whose document was deleted as "(deleted document)" rather than erroring', () => {
    const data = makeData({
      codes: [makeCode('c1')],
      segments: [{ id: 's1', documentId: 'gone', start: 0, end: 1, text: 'x' }],
      codings: [{ id: 'k1', segmentId: 's1', codeId: 'c1', createdAt: '0' }]
    })
    expect(retrieveByCode(data, 'c1')[0].documentTitle).toBe('(deleted document)')
  })

  it('skips a coding whose segment no longer exists', () => {
    const data = makeData({
      codes: [makeCode('c1')],
      codings: [{ id: 'k1', segmentId: 'gone', codeId: 'c1', createdAt: '0' }]
    })
    expect(retrieveByCode(data, 'c1')).toEqual([])
  })
})

describe('getCodeUsageDetail', () => {
  it('pairs the count and verbatim of every instance with its surrounding context, excluding descendants', () => {
    const doc = makeDoc('d1', ['The weather today was quite unusually cold and windy outside.'])
    const start = doc.paragraphs[0].indexOf('cold')
    const segment: Segment = { id: 'seg1', documentId: 'd1', start, end: start + 'cold'.length, text: 'cold' }
    const code = makeCode('code1', { name: 'Weather' })
    const subcode = makeCode('code2', { name: 'Cold weather', parentId: 'code1' })
    const data = makeData({
      documents: [doc],
      segments: [segment],
      codes: [code, subcode],
      codings: [
        { id: 'coding1', segmentId: 'seg1', codeId: 'code1', createdAt: '0' },
        { id: 'coding2', segmentId: 'seg1', codeId: 'code2', createdAt: '0' }
      ]
    })

    const usage = getCodeUsageDetail(data, 'code1')
    expect(usage.count).toBe(1) // only the direct coding, not code2's
    expect(usage.instances[0].segment.text).toBe('cold')
    expect(usage.instances[0].documentTitle).toBe('Doc')
    expect(usage.instances[0].contextBefore).toBe('The weather today was quite unusually')
    expect(usage.instances[0].contextAfter).toBe('and windy outside.')
    expect(usage.instances[0].contextBefore.split(' ').length).toBeLessThanOrEqual(CODE_USAGE_CONTEXT_WORDS)
  })

  it('returns zero count and no instances for a code that was never used', () => {
    const usage = getCodeUsageDetail(makeData({ codes: [makeCode('unused')] }), 'unused')
    expect(usage).toEqual({ count: 0, instances: [] })
  })

  it('an instance whose document no longer exists gets empty context rather than erroring', () => {
    const data = makeData({
      codes: [makeCode('c1')],
      segments: [{ id: 's1', documentId: 'gone', start: 0, end: 1, text: 'x' }],
      codings: [{ id: 'k1', segmentId: 's1', codeId: 'c1', createdAt: '0' }]
    })
    const usage = getCodeUsageDetail(data, 'c1')
    expect(usage.instances[0].contextBefore).toBe('')
    expect(usage.instances[0].contextAfter).toBe('')
  })
})

describe('retrieveNotes', () => {
  const notes: ProjectData['notes'] = [
    { id: 'n1', attachedTo: { kind: 'project' }, question: 'Q?', answer: 'a', tags: ['x'], noteCategoryId: 'cat1', createdAt: '2', updatedAt: '2' },
    { id: 'n2', attachedTo: { kind: 'project' }, question: null, answer: 'b', tags: ['y'], noteCategoryId: null, createdAt: '1', updatedAt: '1' },
    { id: 'n3', attachedTo: { kind: 'project' }, question: 'Q?', answer: 'c', tags: ['x', 'y'], noteCategoryId: 'cat2', createdAt: '3', updatedAt: '3' }
  ]

  it('with no filters, returns everything sorted oldest first', () => {
    const result = retrieveNotes(makeData({ notes }))
    expect(result.map((n) => n.id)).toEqual(['n2', 'n1', 'n3'])
  })

  it('filters by noteCategoryId', () => {
    const result = retrieveNotes(makeData({ notes }), { noteCategoryId: 'cat1' })
    expect(result.map((n) => n.id)).toEqual(['n1'])
  })

  it('filters for uncategorized notes with noteCategoryId: null', () => {
    const result = retrieveNotes(makeData({ notes }), { noteCategoryId: null })
    expect(result.map((n) => n.id)).toEqual(['n2'])
  })

  it('filters by tag', () => {
    const result = retrieveNotes(makeData({ notes }), { tag: 'y' })
    expect(result.map((n) => n.id).sort()).toEqual(['n2', 'n3'])
  })

  it('filters by hasQuestion', () => {
    expect(retrieveNotes(makeData({ notes }), { hasQuestion: true }).map((n) => n.id).sort()).toEqual(['n1', 'n3'])
    expect(retrieveNotes(makeData({ notes }), { hasQuestion: false }).map((n) => n.id)).toEqual(['n2'])
  })

  it('combines filters (AND, not OR)', () => {
    const result = retrieveNotes(makeData({ notes }), { tag: 'x', hasQuestion: true })
    expect(result.map((n) => n.id).sort()).toEqual(['n1', 'n3'])
  })
})
