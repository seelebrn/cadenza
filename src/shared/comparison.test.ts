import { describe, expect, it } from 'vitest'
import { getCases, getCodeCaseMatrix } from './comparison'
import type { CodeNode, DocumentRecord, ProjectData, Segment } from './types'

function makeCode(id: string, overrides: Partial<CodeNode> = {}): CodeNode {
  return { id, kind: 'code', name: id, color: '#fff', definition: '', parentId: null, createdAt: '0', ...overrides }
}

function makeDoc(id: string, overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return { id, title: id, paragraphs: ['x'], sourceFormat: 'txt', assetRelPath: null, importedAt: '0', ...overrides }
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

describe('getCases', () => {
  it('treats every document as a case, oldest imported first', () => {
    const data = makeData({
      documents: [
        makeDoc('d2', { title: 'Second', importedAt: '2020-02-01' }),
        makeDoc('d1', { title: 'First', importedAt: '2020-01-01' })
      ]
    })
    expect(getCases(data)).toEqual([
      { documentId: 'd1', documentTitle: 'First' },
      { documentId: 'd2', documentTitle: 'Second' }
    ])
  })

  it('returns an empty list for a project with no documents', () => {
    expect(getCases(makeData())).toEqual([])
  })
})

describe('getCodeCaseMatrix', () => {
  const parent = makeCode('parent')
  const child = makeCode('child', { parentId: 'parent' })
  const docA = makeDoc('a')
  const docB = makeDoc('b')
  const segments: Segment[] = [
    { id: 's1', documentId: 'a', start: 0, end: 1, text: 'x' },
    { id: 's2', documentId: 'a', start: 1, end: 2, text: 'y' },
    { id: 's3', documentId: 'b', start: 0, end: 1, text: 'z' }
  ]

  it('counts instances per code per case', () => {
    const data = makeData({
      codes: [parent],
      documents: [docA, docB],
      segments,
      codings: [
        { id: 'c1', segmentId: 's1', codeId: 'parent', createdAt: '0' },
        { id: 'c2', segmentId: 's2', codeId: 'parent', createdAt: '0' },
        { id: 'c3', segmentId: 's3', codeId: 'parent', createdAt: '0' }
      ]
    })
    const matrix = getCodeCaseMatrix(data, ['parent'], true)
    expect(matrix).toEqual(
      expect.arrayContaining([
        { codeId: 'parent', documentId: 'a', count: 2 },
        { codeId: 'parent', documentId: 'b', count: 1 }
      ])
    )
    expect(matrix).toHaveLength(2)
  })

  it('rolls up descendant codes when includeDescendants is true, excludes them when false', () => {
    const data = makeData({
      codes: [parent, child],
      documents: [docA],
      segments: [segments[0]],
      codings: [{ id: 'c1', segmentId: 's1', codeId: 'child', createdAt: '0' }]
    })
    expect(getCodeCaseMatrix(data, ['parent'], true)).toEqual([{ codeId: 'parent', documentId: 'a', count: 1 }])
    expect(getCodeCaseMatrix(data, ['parent'], false)).toEqual([])
  })

  it('omits cells with zero instances rather than including an explicit zero', () => {
    const data = makeData({ codes: [parent], documents: [docA, docB], segments, codings: [] })
    expect(getCodeCaseMatrix(data, ['parent'], true)).toEqual([])
  })

  it('handles multiple codes independently', () => {
    const other = makeCode('other')
    const data = makeData({
      codes: [parent, other],
      documents: [docA],
      segments: [segments[0]],
      codings: [{ id: 'c1', segmentId: 's1', codeId: 'other', createdAt: '0' }]
    })
    const matrix = getCodeCaseMatrix(data, ['parent', 'other'], true)
    expect(matrix).toEqual([{ codeId: 'other', documentId: 'a', count: 1 }])
  })
})
