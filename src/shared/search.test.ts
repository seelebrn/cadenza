import { describe, expect, it } from 'vitest'
import { foldAccents, searchDocuments, sentenceAround } from './search'
import { joinParagraphs } from './text'
import type { DocumentRecord, ProjectData } from './types'

function makeDoc(id: string, paragraphs: string[], title = id): DocumentRecord {
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
    clusterLinks: [],
    ...overrides
  } as ProjectData
}

describe('searchDocuments', () => {
  const doc = makeDoc('d1', ['Il parle de la réunion. Puis de la charge de travail.', 'La réunion suivante était courte.'], 'Interview 1')

  it('returns every occurrence with offsets that index the joined document text', () => {
    const data = makeData({ documents: [doc] })
    const hits = searchDocuments(data, 'réunion')
    expect(hits).toHaveLength(2)
    const full = joinParagraphs(doc.paragraphs)
    for (const hit of hits) {
      expect(full.slice(hit.start, hit.end)).toBe('réunion')
      expect(hit.match).toBe('réunion')
    }
    expect(hits.map((h) => h.paragraphIndex)).toEqual([0, 1])
  })

  it('ignores case and accents by default, with offsets still on the original text', () => {
    const data = makeData({ documents: [doc] })
    const full = joinParagraphs(doc.paragraphs)
    for (const query of ['REUNION', 'reunion', 'Réunion']) {
      const hits = searchDocuments(data, query)
      expect(hits, query).toHaveLength(2)
      for (const hit of hits) expect(full.slice(hit.start, hit.end)).toBe('réunion')
    }
    expect(searchDocuments(data, 'reunion', { ignoreAccents: false })).toHaveLength(0)
    expect(searchDocuments(data, 'Reunion', { matchCase: true, ignoreAccents: true })).toHaveLength(0)
  })

  it('an accented query finds unaccented text too', () => {
    const data = makeData({ documents: [makeDoc('d', ['une reunion sans accent'])] })
    expect(searchDocuments(data, 'réunion')).toHaveLength(1)
  })

  it('whole-word matching excludes a match inside a longer word', () => {
    const data = makeData({ documents: [makeDoc('d', ['The cat sat. A category is not a cat.'])] })
    expect(searchDocuments(data, 'cat')).toHaveLength(3)
    const whole = searchDocuments(data, 'cat', { wholeWord: true })
    expect(whole).toHaveLength(2)
    expect(whole.map((h) => h.start)).toEqual([4, 33])
  })

  it('gives the containing sentence, in global offsets', () => {
    const data = makeData({ documents: [doc] })
    const [first, second] = searchDocuments(data, 'réunion')
    expect(first.sentence.text).toBe('Il parle de la réunion.')
    expect(second.sentence.text).toBe('La réunion suivante était courte.')
    const full = joinParagraphs(doc.paragraphs)
    expect(full.slice(second.sentence.start, second.sentence.end)).toBe(second.sentence.text)
  })

  it('reports codes already on a passage overlapping the match', () => {
    const data = makeData({
      documents: [doc],
      segments: [{ id: 's1', documentId: 'd1', start: 15, end: 22, text: 'réunion' }],
      codings: [{ id: 'c1', segmentId: 's1', codeId: 'meetings', createdAt: '0' }]
    })
    const [first, second] = searchDocuments(data, 'réunion')
    expect(first.codeIds).toEqual(['meetings'])
    expect(second.codeIds).toEqual([])
  })

  it('shows surrounding context and says when it was clipped', () => {
    const long = 'x'.repeat(200) + ' target ' + 'y'.repeat(200)
    const data = makeData({ documents: [makeDoc('d', [long])] })
    const [hit] = searchDocuments(data, 'target')
    expect(hit.before.length).toBe(80)
    expect(hit.after.length).toBe(80)
    expect(hit.beforeClipped).toBe(true)
    expect(hit.afterClipped).toBe(true)
    const [short] = searchDocuments(makeData({ documents: [makeDoc('d', ['a target b'])] }), 'target')
    expect(short.before).toBe('a ')
    expect(short.beforeClipped).toBe(false)
  })

  it('can be restricted to some documents, treats regex characters literally, and ignores an empty query', () => {
    const data = makeData({ documents: [makeDoc('a', ['what? (yes)']), makeDoc('b', ['what? no'])] })
    expect(searchDocuments(data, 'what?').map((h) => h.documentId)).toEqual(['a', 'b'])
    expect(searchDocuments(data, '(yes)')).toHaveLength(1)
    expect(searchDocuments(data, 'what?', { documentIds: ['b'] }).map((h) => h.documentId)).toEqual(['b'])
    expect(searchDocuments(data, '   ')).toEqual([])
  })
})

describe('foldAccents', () => {
  it('maps every folded position back to the original index', () => {
    const text = 'Élève à côté'
    const { folded, indexMap } = foldAccents(text)
    expect(folded).toBe('Eleve a cote')
    expect(indexMap).toHaveLength(folded.length + 1)
    expect(text.slice(indexMap[0], indexMap[5])).toBe('Élève')
    expect(indexMap[folded.length]).toBe(text.length)
  })
})

describe('sentenceAround', () => {
  it('stops at sentence punctuation followed by a space, and at paragraph edges', () => {
    const p = 'First one. Second here! Third? Last with no end'
    expect(p.slice(...Object.values(sentenceAround(p, 12, 18)) as [number, number])).toBe('Second here!')
    expect(p.slice(...Object.values(sentenceAround(p, 32, 36)) as [number, number])).toBe('Last with no end')
    expect(p.slice(...Object.values(sentenceAround(p, 0, 5)) as [number, number])).toBe('First one.')
  })

  it('does not split on a period inside a number or abbreviation followed directly by text', () => {
    const p = 'Il gagne 3.5 fois plus. Vraiment.'
    const s = sentenceAround(p, 13, 17)
    expect(p.slice(s.start, s.end)).toBe('Il gagne 3.5 fois plus.')
  })
})
