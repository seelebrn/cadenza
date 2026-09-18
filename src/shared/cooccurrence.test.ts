import { describe, expect, it } from 'vitest'
import { getCodeCooccurrenceMatrix, getCooccurringPassages } from './cooccurrence'
import type { CodeNode, DocumentRecord, ProjectData, Segment } from './types'

function makeCode(id: string, overrides: Partial<CodeNode> = {}): CodeNode {
  return { id, kind: 'code', name: id, color: '#fff', definition: '', parentId: null, createdAt: '0', ...overrides }
}
function makeDoc(id: string, text: string): DocumentRecord {
  return { id, title: `Doc ${id}`, paragraphs: [text], sourceFormat: 'txt', assetRelPath: null, importedAt: '0', attributes: {} }
}
function seg(id: string, documentId: string, start: number, end: number): Segment {
  return { id, documentId, start, end, text: `${start}-${end}` }
}
function coding(id: string, segmentId: string, codeId: string): ProjectData['codings'][number] {
  return { id, segmentId, codeId, createdAt: '0' }
}
function makeData(overrides: Partial<ProjectData>): ProjectData {
  return {
    schemaVersion: 2, id: 'p', name: 'P', createdAt: '0', updatedAt: '0',
    documents: [], segments: [], codes: [], codings: [], notes: [], noteCategories: [], categories: [],
    boards: [], boardItems: [], boardClusters: [], boardLinks: [], clusterLinks: [],
    ...overrides
  } as ProjectData
}

// One document, 0123456789 — passages: s1 [0,5) A; s2 [3,8) B; s3 [3,8) A
// (same span as s2, coded A too); s4 [8,10) C (touches s2's end, no
// overlap); s5 in another document [0,3) A and s6 [1,2) B.
const data = makeData({
  documents: [makeDoc('d1', '0123456789'), makeDoc('d2', 'abcdefghij')],
  codes: [makeCode('A'), makeCode('B'), makeCode('C'), makeCode('P'), makeCode('A1', { parentId: 'P' })],
  segments: [seg('s1', 'd1', 0, 5), seg('s2', 'd1', 3, 8), seg('s3', 'd1', 3, 8), seg('s4', 'd1', 8, 10), seg('s5', 'd2', 0, 3), seg('s6', 'd2', 1, 2)],
  codings: [
    coding('c1', 's1', 'A'),
    coding('c2', 's2', 'B'),
    coding('c3', 's3', 'A'),
    coding('c4', 's4', 'C'),
    coding('c5', 's5', 'A'),
    coding('c6', 's6', 'B'),
    coding('c7', 's4', 'A1')
  ]
})

describe('getCodeCooccurrenceMatrix', () => {
  it('counts overlapping passage pairs symmetrically, with the diagonal as passages per code', () => {
    const cells = getCodeCooccurrenceMatrix(data, ['A', 'B', 'C'], false)
    const get = (a: string, b: string): { count: number; documentCount: number } | undefined => {
      const [x, y] = a < b ? [a, b] : [b, a]
      const cell = cells.find((c) => c.codeA === x && c.codeB === y)
      return cell && { count: cell.count, documentCount: cell.documentCount }
    }
    // A-B: s1×s2 (0-5 vs 3-8), s3×s2 (same span), s5×s6 (d2) = 3 pairs in 2 documents.
    expect(get('A', 'B')).toEqual({ count: 3, documentCount: 2 })
    expect(get('B', 'A')).toEqual({ count: 3, documentCount: 2 })
    // s4 [8,10) only touches s2 [3,8): no overlap.
    expect(get('B', 'C')).toBeUndefined()
    expect(get('A', 'C')).toBeUndefined()
    // Diagonal: A is on s1, s3, s5.
    expect(get('A', 'A')).toEqual({ count: 3, documentCount: 2 })
    expect(get('C', 'C')).toEqual({ count: 1, documentCount: 1 })
  })

  it('rolls up descendants when asked', () => {
    // A1 (child of P) is on s4, which overlaps nothing but touches s2.
    expect(getCodeCooccurrenceMatrix(data, ['P', 'B'], true).find((c) => c.codeA === 'B' && c.codeB === 'P')).toBeUndefined()
    expect(getCodeCooccurrenceMatrix(data, ['P', 'C'], true).find((c) => c.codeA === 'C' && c.codeB === 'P')).toMatchObject({ count: 1 })
    expect(getCodeCooccurrenceMatrix(data, ['P', 'C'], false).find((c) => c.codeA === 'C' && c.codeB === 'P')).toBeUndefined()
  })

  it('omits codes with no passages entirely, even from the diagonal', () => {
    expect(getCodeCooccurrenceMatrix(data, ['P'], false)).toEqual([])
  })
})

describe('getCooccurringPassages', () => {
  it('lists every overlapping pair with the shared text, in document then reading order', () => {
    const passages = getCooccurringPassages(data, 'A', 'B', false)
    expect(passages.map((p) => [p.documentTitle, p.overlap.text])).toEqual([
      ['Doc d1', '34'],
      ['Doc d1', '34567'],
      ['Doc d2', 'b']
    ])
    expect(passages[1].segmentA.id).toBe('s3')
    expect(passages[1].segmentB.id).toBe('s2')
  })

  it('is symmetric in its arguments and gives every passage for the diagonal', () => {
    expect(getCooccurringPassages(data, 'B', 'A', false).map((p) => p.overlap.text)).toEqual(['34', '34567', 'b'])
    expect(getCooccurringPassages(data, 'A', 'A', false).map((p) => p.segmentA.id)).toEqual(['s1', 's3', 's5'])
  })
})

describe('getCodeCooccurrenceMatrix against the pair-by-pair definition', () => {
  // The definition, computed the slow way: for every pair of codes, every
  // pair of their passages.
  function reference(data: ProjectData, codeIds: string[], includeDescendants: boolean): string[] {
    const descendants = (id: string): string[] => data.codes.filter((c) => c.parentId === id).flatMap((c) => [c.id, ...descendants(c.id)])
    const segmentsOf = (codeId: string): Segment[] => {
      const members = new Set([codeId, ...(includeDescendants ? descendants(codeId) : [])])
      const ids = new Set(data.codings.filter((k) => members.has(k.codeId)).map((k) => k.segmentId))
      return data.segments.filter((s) => ids.has(s.id))
    }
    const lines: string[] = []
    codeIds.forEach((a, i) => {
      const sa = segmentsOf(a)
      if (sa.length) lines.push(`${a}|${a}|${sa.length}|${new Set(sa.map((s) => s.documentId)).size}`)
      for (const b of codeIds.slice(i + 1)) {
        const pairs = sa.flatMap((x) => segmentsOf(b).filter((y) => x.documentId === y.documentId && x.start < y.end && y.start < x.end).map(() => x.documentId))
        if (pairs.length) lines.push(`${a < b ? a : b}|${a < b ? b : a}|${pairs.length}|${new Set(pairs).size}`)
      }
    })
    return lines
  }

  it('gives the same cells, in the same order, on random projects with sub-codes, overlaps and empty passages', () => {
    let seed = 7
    const rand = (): number => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    const int = (n: number): number => Math.floor(rand() * n)
    for (let round = 0; round < 6; round++) {
      const codes = Array.from({ length: 14 }, (_, i) => ({
        id: `c${(i * 5) % 14}`, kind: 'code' as const, name: `c${i}`, color: '#000', definition: '', createdAt: '0',
        parentId: null as string | null
      }))
      codes.forEach((c, i) => {
        if (i > 3 && rand() < 0.6) c.parentId = codes[int(i)].id
      })
      const segments: Segment[] = Array.from({ length: 40 }, (_, i) => {
        const start = int(200)
        return { id: `s${i}`, documentId: `d${int(3)}`, start, end: start + (rand() < 0.1 ? 0 : 1 + int(60)), text: '' }
      })
      const codings = Array.from({ length: 90 }, (_, i) => ({ id: `k${i}`, segmentId: `s${int(44)}`, codeId: `c${int(14)}`, createdAt: '0' }))
      const data = { codes, segments, codings, documents: [] } as unknown as ProjectData
      const codeIds = codes.map((c) => c.id).filter(() => rand() < 0.9)
      for (const rollUp of [true, false]) {
        const cells = getCodeCooccurrenceMatrix(data, codeIds, rollUp).map((c) => `${c.codeA}|${c.codeB}|${c.count}|${c.documentCount}`)
        expect(cells, `round ${round}, roll-up ${rollUp}`).toEqual(reference(data, codeIds, rollUp))
      }
    }
  })
})
