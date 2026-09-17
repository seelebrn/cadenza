import { describe, expect, it } from 'vitest'
import { getCaseGroups, getCases, getCodeCaseMatrix, getCodeGroupMatrix, UNSET_ATTRIBUTE_LABEL } from './comparison'
import type { CodeNode, DocumentRecord, ProjectData, Segment } from './types'

function makeCode(id: string, overrides: Partial<CodeNode> = {}): CodeNode {
  return { id, kind: 'code', name: id, color: '#fff', definition: '', parentId: null, createdAt: '0', ...overrides }
}

function makeDoc(id: string, overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return { id, title: id, paragraphs: ['x'], sourceFormat: 'txt', assetRelPath: null, importedAt: '0', attributes: {}, ...overrides }
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

describe('comparison by attribute', () => {
  function build(): ProjectData {
    const docs = [
      makeDoc('n1', { title: 'Nurse 1', importedAt: '2020-01-01', attributes: { Role: 'nurse' } }),
      makeDoc('m1', { title: 'Manager 1', importedAt: '2020-01-02', attributes: { Role: 'manager' } }),
      makeDoc('n2', { title: 'Nurse 2', importedAt: '2020-01-03', attributes: { Role: 'nurse' } }),
      makeDoc('u1', { title: 'Unknown', importedAt: '2020-01-04', attributes: { Role: '  ' } })
    ]
    const seg = (id: string, documentId: string): Segment => ({ id, documentId, start: 0, end: 1, text: 'x' })
    return makeData({
      documents: docs,
      codes: [makeCode('stress')],
      segments: [seg('s1', 'n1'), seg('s2', 'n1'), seg('s3', 'm1'), seg('s4', 'u1')],
      codings: [
        { id: 'c1', segmentId: 's1', codeId: 'stress', createdAt: '0' },
        { id: 'c2', segmentId: 's2', codeId: 'stress', createdAt: '0' },
        { id: 'c3', segmentId: 's3', codeId: 'stress', createdAt: '0' },
        { id: 'c4', segmentId: 's4', codeId: 'stress', createdAt: '0' }
      ]
    })
  }

  it('getCaseGroups groups cases by attribute value, sorted, with unset cases last', () => {
    const groups = getCaseGroups(build(), 'Role')
    expect(groups.map((g) => g.value)).toEqual(['manager', 'nurse', UNSET_ATTRIBUTE_LABEL])
    expect(groups[1].cases.map((c) => c.documentTitle)).toEqual(['Nurse 1', 'Nurse 2'])
    expect(groups[2].cases.map((c) => c.documentId)).toEqual(['u1'])
    expect(getCaseGroups(build(), 'Missing')).toEqual([
      { value: UNSET_ATTRIBUTE_LABEL, cases: getCases(build()) }
    ])
  })

  it('getCodeGroupMatrix counts passages and cases per attribute value', () => {
    const cells = getCodeGroupMatrix(build(), ['stress'], 'Role', false)
    const byValue = new Map(cells.map((c) => [c.value, c]))
    expect(byValue.get('nurse')).toMatchObject({ count: 2, caseCount: 1 })
    expect(byValue.get('manager')).toMatchObject({ count: 1, caseCount: 1 })
    expect(byValue.get(UNSET_ATTRIBUTE_LABEL)).toMatchObject({ count: 1, caseCount: 1 })
  })
})
