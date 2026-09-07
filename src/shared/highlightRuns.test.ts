import { describe, expect, it } from 'vitest'
import { computeParagraphRuns } from './highlightRuns'
import type { Coding, Segment } from './types'

function makeCoding(id: string, segmentId: string): Coding {
  return { id, segmentId, codeId: 'code1', createdAt: '0' }
}
function makeSegment(id: string, start: number, end: number, text: string): Segment {
  return { id, documentId: 'd1', start, end, text }
}

describe('computeParagraphRuns', () => {
  it('a paragraph with no codings is one plain run', () => {
    const runs = computeParagraphRuns('hello world', 0, [])
    expect(runs).toEqual([{ text: 'hello world', codingIds: [] }])
  })

  it('one coding in the middle produces three runs: before, coded, after', () => {
    // "hello world" (0-11), code "world" (6-11).
    const segment = makeSegment('s1', 6, 11, 'world')
    const coding = makeCoding('c1', 's1')
    const runs = computeParagraphRuns('hello world', 0, [{ coding, segment }])
    expect(runs).toEqual([
      { text: 'hello ', codingIds: [] },
      { text: 'world', codingIds: ['c1'] }
    ])
  })

  it('a coding covering the whole paragraph is a single coded run', () => {
    const segment = makeSegment('s1', 0, 5, 'hello')
    const coding = makeCoding('c1', 's1')
    const runs = computeParagraphRuns('hello', 0, [{ coding, segment }])
    expect(runs).toEqual([{ text: 'hello', codingIds: ['c1'] }])
  })

  it('two overlapping codings both list in the overlapping run\'s codingIds', () => {
    // "hello world": code1 covers "hello wor" (0-9), code2 covers "lo world" (3-11).
    const seg1 = makeSegment('s1', 0, 9, 'hello wor')
    const seg2 = makeSegment('s2', 3, 11, 'lo world')
    const runs = computeParagraphRuns('hello world', 0, [
      { coding: makeCoding('c1', 's1'), segment: seg1 },
      { coding: makeCoding('c2', 's2'), segment: seg2 }
    ])
    // Expect three runs: [0-3) only c1, [3-9) both, [9-11) only c2.
    expect(runs).toEqual([
      { text: 'hel', codingIds: ['c1'] },
      { text: 'lo wor', codingIds: ['c1', 'c2'] },
      { text: 'ld', codingIds: ['c2'] }
    ])
  })

  it('two disjoint codings each get their own run, with a plain run between them', () => {
    const seg1 = makeSegment('s1', 0, 2, 'he')
    const seg2 = makeSegment('s2', 8, 11, 'rld')
    const runs = computeParagraphRuns('hello world', 0, [
      { coding: makeCoding('c1', 's1'), segment: seg1 },
      { coding: makeCoding('c2', 's2'), segment: seg2 }
    ])
    expect(runs).toEqual([
      { text: 'he', codingIds: ['c1'] },
      { text: 'llo wo', codingIds: [] },
      { text: 'rld', codingIds: ['c2'] }
    ])
  })

  it('ignores a coding whose segment is entirely in a different paragraph', () => {
    // Paragraph is at global offset 100-111; a segment at 0-5 is unrelated.
    const segment = makeSegment('s1', 0, 5, 'hello')
    const coding = makeCoding('c1', 's1')
    const runs = computeParagraphRuns('some other paragraph', 100, [{ coding, segment }])
    expect(runs).toEqual([{ text: 'some other paragraph', codingIds: [] }])
  })

  it('clips a segment that only partially overlaps this paragraph (spans a paragraph boundary)', () => {
    // Paragraph "second" is at global offset 10-16. A segment from an
    // earlier paragraph's end through into this one: global 8-13 ("ond" of
    // this paragraph is covered, "se" is not — clipped at the paragraph's
    // own start).
    const segment = makeSegment('s1', 8, 13, 'xx-sec')
    const coding = makeCoding('c1', 's1')
    const runs = computeParagraphRuns('second', 10, [{ coding, segment }])
    expect(runs).toEqual([
      { text: 'sec', codingIds: ['c1'] },
      { text: 'ond', codingIds: [] }
    ])
  })
})
