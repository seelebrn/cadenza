import { describe, expect, it } from 'vitest'
import { buildProjectReport, hasComparisonData } from './reportBuilders'
import type { ProjectReportOptions } from './reportBuilders'
import type { CategoryRecord, CodeNode, DocumentRecord, NoteRecord, ProjectData, Segment } from '@shared/types'

function makeCode(id: string, overrides: Partial<CodeNode> = {}): CodeNode {
  return { id, kind: 'code', name: id, color: '#111', definition: '', parentId: null, createdAt: '0', ...overrides }
}
function makeCategory(id: string, overrides: Partial<CategoryRecord> = {}): CategoryRecord {
  return {
    id,
    kind: 'theme',
    name: id,
    color: '#222',
    codeIds: [],
    noteIds: [],
    segmentIds: [],
    parentCategoryId: null,
    createdAt: '0',
    ...overrides
  }
}
function makeDoc(id: string, overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return { id, title: id, paragraphs: ['x'], sourceFormat: 'txt', assetRelPath: null, importedAt: '0', ...overrides }
}
function makeNote(id: string, overrides: Partial<NoteRecord> = {}): NoteRecord {
  return {
    id,
    question: null,
    answer: 'an answer',
    tags: [],
    noteCategoryId: null,
    attachedTo: { kind: 'project' },
    createdAt: '0',
    updatedAt: '0',
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

const NONE: ProjectReportOptions = {
  includeCodes: false,
  includeNotes: false,
  includeComparison: false,
  includeVerbatim: false,
  contextWords: 0,
  includeFrequency: false
}

describe('buildProjectReport', () => {
  it('with nothing selected, says so rather than producing an empty document', () => {
    const report = buildProjectReport(makeData(), NONE)
    expect(report.blocks).toEqual([{ kind: 'paragraph', text: 'Nothing selected to export.', style: 'meta' }])
  })

  it('includeCodes walks the code hierarchy as headings, indented by depth', () => {
    const data = makeData({ codes: [makeCode('parent', { name: 'Parent' }), makeCode('child', { name: 'Child', parentId: 'parent' })] })
    const report = buildProjectReport(data, { ...NONE, includeCodes: true })
    const headings = report.blocks.filter((b) => b.kind === 'heading').map((b) => (b as { text: string }).text)
    expect(headings).toContain('Codebook')
    expect(headings).toContain('Parent')
    expect(headings).toContain('— Child')
  })

  it('includeCodes shows a code definition when present', () => {
    const data = makeData({ codes: [makeCode('a', { name: 'A', definition: 'A precise meaning.' })] })
    const report = buildProjectReport(data, { ...NONE, includeCodes: true })
    expect(report.blocks).toContainEqual({ kind: 'paragraph', text: 'A precise meaning.' })
  })

  it('includeFrequency adds a code-frequency table sorted by count, independent of includeVerbatim', () => {
    const data = makeData({
      codes: [makeCode('a', { name: 'A' }), makeCode('b', { name: 'B' })],
      codings: [
        { id: 'c1', segmentId: 's1', codeId: 'a', createdAt: '0' },
        { id: 'c2', segmentId: 's2', codeId: 'a', createdAt: '0' },
        { id: 'c3', segmentId: 's3', codeId: 'b', createdAt: '0' }
      ]
    })
    const report = buildProjectReport(data, { ...NONE, includeCodes: true, includeFrequency: true })
    const table = report.blocks.find((b) => b.kind === 'table') as { headers: string[]; rows: string[][] }
    expect(table.rows).toEqual([
      ['A', '2'],
      ['B', '1']
    ])
  })

  it('includeVerbatim with contextWords 0 shows the bare quote', () => {
    const doc = makeDoc('d1', { paragraphs: ['some quoted text here'] })
    const segment: Segment = { id: 's1', documentId: 'd1', start: 5, end: 11, text: 'quoted' }
    const data = makeData({
      codes: [makeCode('a')],
      documents: [doc],
      segments: [segment],
      codings: [{ id: 'c1', segmentId: 's1', codeId: 'a', createdAt: '0' }]
    })
    const report = buildProjectReport(data, { ...NONE, includeCodes: true, includeVerbatim: true, contextWords: 0 })
    expect(report.blocks).toContainEqual({ kind: 'paragraph', text: 'quoted', style: 'quote' })
  })

  it('includeVerbatim with contextWords > 0 wraps the quote in surrounding words', () => {
    const doc = makeDoc('d1', { paragraphs: ['some quoted text here'] })
    const segment: Segment = { id: 's1', documentId: 'd1', start: 5, end: 11, text: 'quoted' }
    const data = makeData({
      codes: [makeCode('a')],
      documents: [doc],
      segments: [segment],
      codings: [{ id: 'c1', segmentId: 's1', codeId: 'a', createdAt: '0' }]
    })
    const report = buildProjectReport(data, { ...NONE, includeCodes: true, includeVerbatim: true, contextWords: 5 })
    expect(report.blocks).toContainEqual({ kind: 'paragraph', text: 'some [quoted] text here', style: 'quote' })
  })

  it('includeCodes without includeVerbatim never includes any quote text', () => {
    const doc = makeDoc('d1', { paragraphs: ['some quoted text here'] })
    const segment: Segment = { id: 's1', documentId: 'd1', start: 5, end: 11, text: 'quoted' }
    const data = makeData({
      codes: [makeCode('a')],
      documents: [doc],
      segments: [segment],
      codings: [{ id: 'c1', segmentId: 's1', codeId: 'a', createdAt: '0' }]
    })
    const report = buildProjectReport(data, { ...NONE, includeCodes: true })
    const hasQuote = report.blocks.some((b) => b.kind === 'paragraph' && b.style === 'quote')
    expect(hasQuote).toBe(false)
  })

  it('includeNotes walks the cluster hierarchy, labels a question-cluster with curly quotes', () => {
    const question = makeCategory('q1', { kind: 'question', name: 'Why?', noteIds: ['n1'] })
    const note = makeNote('n1', { answer: 'Because.' })
    const data = makeData({ categories: [question], notes: [note] })
    const report = buildProjectReport(data, { ...NONE, includeNotes: true })
    const headings = report.blocks.filter((b) => b.kind === 'heading').map((b) => (b as { text: string }).text)
    expect(headings).toContain('“Why?”')
    expect(report.blocks).toContainEqual({ kind: 'paragraph', text: 'Because.' })
  })

  it('includeNotes lists a note not filed under any cluster in an "Unfiled notes" section', () => {
    const note = makeNote('n1', { answer: 'Standalone note.' })
    const data = makeData({ notes: [note] })
    const report = buildProjectReport(data, { ...NONE, includeNotes: true })
    const headings = report.blocks.filter((b) => b.kind === 'heading').map((b) => (b as { text: string }).text)
    expect(headings).toContain('Unfiled notes')
    expect(report.blocks).toContainEqual({ kind: 'paragraph', text: 'Standalone note.' })
  })

  it('includeNotes + includeVerbatim attaches the quote for a note on a segment', () => {
    const doc = makeDoc('d1', { paragraphs: ['some quoted text here'] })
    const segment: Segment = { id: 's1', documentId: 'd1', start: 5, end: 11, text: 'quoted' }
    const note = makeNote('n1', { answer: 'Noted.', attachedTo: { kind: 'segment', segmentId: 's1' } })
    const data = makeData({ documents: [doc], segments: [segment], notes: [note] })
    const report = buildProjectReport(data, { ...NONE, includeNotes: true, includeVerbatim: true, contextWords: 0 })
    expect(report.blocks).toContainEqual({ kind: 'paragraph', text: 'quoted', style: 'quote' })
  })

  it('includeComparison adds a code x case table', () => {
    const doc = makeDoc('d1', { title: 'Interview A' })
    const segment: Segment = { id: 's1', documentId: 'd1', start: 0, end: 1, text: 'x' }
    const data = makeData({
      codes: [makeCode('a', { name: 'A' })],
      documents: [doc],
      segments: [segment],
      codings: [{ id: 'c1', segmentId: 's1', codeId: 'a', createdAt: '0' }]
    })
    const report = buildProjectReport(data, { ...NONE, includeComparison: true })
    const table = report.blocks.find((b) => b.kind === 'table') as { headers: string[]; rows: string[][] }
    expect(table.headers).toEqual(['Code / item', 'Interview A'])
    expect(table.rows).toEqual([['A', '1']])
  })

  it('multiple sections can be included together in one report', () => {
    const data = makeData({ codes: [makeCode('a')], notes: [makeNote('n1')] })
    const report = buildProjectReport(data, { ...NONE, includeCodes: true, includeNotes: true })
    const headings = report.blocks.filter((b) => b.kind === 'heading').map((b) => (b as { text: string }).text)
    expect(headings).toContain('Codebook')
    expect(headings).toContain('Notes & clusters')
  })
})

describe('hasComparisonData', () => {
  it('false with no documents or no codes, true once both exist', () => {
    expect(hasComparisonData(makeData())).toBe(false)
    expect(hasComparisonData(makeData({ documents: [makeDoc('d1')] }))).toBe(false)
    expect(hasComparisonData(makeData({ codes: [makeCode('a')] }))).toBe(false)
    expect(hasComparisonData(makeData({ documents: [makeDoc('d1')], codes: [makeCode('a')] }))).toBe(true)
  })
})
