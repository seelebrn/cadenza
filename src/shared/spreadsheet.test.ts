import { XMLValidator } from 'fast-xml-parser'
import { describe, expect, it } from 'vitest'
import { EMPTY_PASSAGE_QUERY, queryPassages } from './retrieval'
import { buildPassageSheet, buildQuerySheet, buildXlsxParts, columnName } from './spreadsheet'
import type { ProjectData } from './types'

const data = {
  schemaVersion: 2, id: 'p', name: 'Étude', createdAt: '0', updatedAt: '0',
  documents: [
    { id: 'd1', title: 'Interview <1> & co', paragraphs: ['Il parle de la réunion. Puis du reste.'], sourceFormat: 'txt', assetRelPath: null, importedAt: '0', attributes: { Role: 'nurse' } },
    { id: 'd2', title: 'Interview 2', paragraphs: ['Deuxième.'], sourceFormat: 'txt', assetRelPath: null, importedAt: '0', attributes: { Site: 'B' } }
  ],
  codes: [
    { id: 'c1', kind: 'code', name: 'Work', color: '#f00', definition: '', parentId: null, createdAt: '0' },
    { id: 'c2', kind: 'code', name: 'Load', color: '#0f0', definition: '', parentId: 'c1', createdAt: '0' }
  ],
  segments: [
    { id: 's1', documentId: 'd1', start: 16, end: 23, text: 'réunion' },
    { id: 's2', documentId: 'd2', start: 0, end: 9, text: 'Deuxième.' }
  ],
  codings: [
    { id: 'k1', segmentId: 's1', codeId: 'c1', createdAt: '0' },
    { id: 'k2', segmentId: 's1', codeId: 'c2', createdAt: '0' },
    { id: 'k3', segmentId: 's2', codeId: 'c2', createdAt: '0' }
  ],
  notes: [
    { id: 'n1', question: 'Pourquoi ?', answer: 'Parce que.', tags: [], noteCategoryId: null, attachedTo: { kind: 'segment', segmentId: 's1' }, createdAt: '0', updatedAt: '0' }
  ],
  noteCategories: [],
  categories: [
    { id: 'cat', kind: 'theme', name: 'Pressure', color: '#abc', definition: '', codeIds: ['c2'], noteIds: [], segmentIds: [], parentCategoryId: null, createdAt: '0' }
  ],
  boards: [], boardItems: [], boardClusters: [], boardLinks: [], clusterLinks: []
} as unknown as ProjectData

describe('columnName', () => {
  it('counts in letters the way Excel does', () => {
    expect([1, 2, 26, 27, 52, 53, 702, 703].map(columnName)).toEqual(['A', 'B', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA'])
  })
})

describe('buildPassageSheet', () => {
  const results = queryPassages(data, EMPTY_PASSAGE_QUERY)
  const sheet = buildPassageSheet(data, results)

  it('one row per passage, with every case attribute as its own column', () => {
    expect(sheet.rows[0]).toEqual(['Document', 'Role', 'Site', 'Passage', 'Codes', 'Clusters', 'Notes'])
    expect(sheet.rows).toHaveLength(3)
    expect(sheet.rows[1]).toEqual(['Interview <1> & co', 'nurse', '', 'réunion', 'Work\nWork › Load', 'Pressure', 'Pourquoi ?\nParce que.'])
    expect(sheet.rows[2]).toEqual(['Interview 2', '', 'B', 'Deuxième.', 'Work › Load', 'Pressure', ''])
  })

  it('the query tab describes what was asked', () => {
    const query = { ...EMPTY_PASSAGE_QUERY, codeIds: ['c1', 'c2'], match: 'all' as const, excludeCodeIds: ['c2'], documentIds: ['d2'], attributes: { Role: ['nurse', 'manager'], Site: [] } }
    const about = buildQuerySheet(data, query, 0, '2026-09-18')
    const byLabel = new Map(about.rows.map(([k, v]) => [k, v]))
    expect(byLabel.get('Codes')).toBe('All of: Work; Work › Load')
    expect(byLabel.get('Except where')).toBe('Work › Load')
    expect(byLabel.get('Documents')).toBe('Interview 2')
    expect(byLabel.get('Case attributes')).toBe('Role: nurse or manager')
    expect(byLabel.get('Passages')).toBe(0)
    expect(buildQuerySheet(data, EMPTY_PASSAGE_QUERY, 2, 'x').rows.find(([k]) => k === 'Codes')![1]).toBe('Every coded passage')
  })
})

describe('buildXlsxParts', () => {
  const control = String.fromCharCode(11)
  const parts = buildXlsxParts([
    { name: 'Passages', rows: [['Name', 'Count'], [`A & <b>${control}`, 3], ['', 4.5]], columnWidths: [20, 10], wrapColumns: [0] },
    { name: 'Too: long/name*with?bad[chars] and more than thirty-one', rows: [['k', 'v']], table: false },
    { name: 'Passages', rows: [] }
  ])

  it('writes the package parts, all well-formed XML', () => {
    expect(Object.keys(parts).sort()).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml',
      'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml'
    ])
    for (const [path, xml] of Object.entries(parts)) expect(XMLValidator.validate(xml), path).toBe(true)
  })

  it('escapes text, drops characters XML forbids, writes numbers as numbers, and skips empty cells', () => {
    const sheet = parts['xl/worksheets/sheet1.xml']
    expect(sheet).toContain('<t xml:space="preserve">A &amp; &lt;b&gt;</t>')
    expect(sheet).toContain('<c r="B2" s="0"><v>3</v></c>')
    expect(sheet).toContain('<c r="B3" s="0"><v>4.5</v></c>')
    expect(sheet).not.toContain('r="A3"')
    // Header bold, wrapped column, frozen header, filters over the table.
    expect(sheet).toContain('<c r="A1" s="1"')
    expect(sheet).toContain('<c r="A2" s="2"')
    expect(sheet).toContain('state="frozen"')
    expect(sheet).toContain('<autoFilter ref="A1:B3"/>')
  })

  it('gives tabs names Excel accepts, unique, and filters only on tables', () => {
    const workbook = parts['xl/workbook.xml']
    const names = [...workbook.matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1])
    expect(names[0]).toBe('Passages')
    expect(names[1]).toBe('Too long name with bad chars an')
    expect(names[1].length).toBeLessThanOrEqual(31)
    expect(names[2]).toBe('Passages (2)')
    expect(workbook.match(/_FilterDatabase/g)).toHaveLength(1)
    expect(parts['xl/worksheets/sheet2.xml']).not.toContain('autoFilter')
    expect(parts['xl/worksheets/sheet2.xml']).not.toContain('s="1"')
  })
})
