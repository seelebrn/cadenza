import { describe, expect, it } from 'vitest'
import { getParagraphStartOffsets, getSurroundingWords, joinParagraphs, splitIntoParagraphs } from './text'

describe('joinParagraphs', () => {
  it('joins with a blank line between paragraphs', () => {
    expect(joinParagraphs(['a', 'b', 'c'])).toBe('a\n\nb\n\nc')
  })

  it('a single paragraph is unchanged', () => {
    expect(joinParagraphs(['solo'])).toBe('solo')
  })
})

describe('splitIntoParagraphs', () => {
  it('splits on blank lines, trimming each paragraph', () => {
    expect(splitIntoParagraphs('  first  \n\n  second  ')).toEqual(['first', 'second'])
  })

  it('normalizes CRLF before splitting', () => {
    expect(splitIntoParagraphs('first\r\n\r\nsecond')).toEqual(['first', 'second'])
  })

  it('falls back to splitting on every line break when there are no blank-line boundaries', () => {
    expect(splitIntoParagraphs('line one\nline two\nline three')).toEqual(['line one', 'line two', 'line three'])
  })

  it('drops empty paragraphs (e.g. from consecutive blank lines)', () => {
    expect(splitIntoParagraphs('a\n\n\n\nb')).toEqual(['a', 'b'])
  })

  it('returns an empty array for blank input', () => {
    expect(splitIntoParagraphs('   \n\n  ')).toEqual([])
  })
})

describe('getSurroundingWords', () => {
  it('returns the requested word count on each side', () => {
    const full = 'one two three four five SEGMENT six seven eight nine ten'
    const start = full.indexOf('SEGMENT')
    const end = start + 'SEGMENT'.length
    expect(getSurroundingWords(full, start, end, 3)).toEqual({ before: 'three four five', after: 'six seven eight' })
  })

  it('clamps at the start/end of the document instead of erroring when asked for more words than exist', () => {
    const full = 'a b SEGMENT c d'
    const start = full.indexOf('SEGMENT')
    const end = start + 'SEGMENT'.length
    expect(getSurroundingWords(full, start, end, 10)).toEqual({ before: 'a b', after: 'c d' })
  })

  it('a segment at the very start of the document has no "before"', () => {
    const full = 'SEGMENT rest of text'
    expect(getSurroundingWords(full, 0, 'SEGMENT'.length, 5)).toEqual({ before: '', after: 'rest of text' })
  })

  it('a segment at the very end of the document has no "after"', () => {
    const full = 'text before SEGMENT'
    const start = full.indexOf('SEGMENT')
    expect(getSurroundingWords(full, start, full.length, 5)).toEqual({ before: 'text before', after: '' })
  })

  it('zero requested words returns empty context on both sides', () => {
    const full = 'a b SEGMENT c d'
    const start = full.indexOf('SEGMENT')
    const end = start + 'SEGMENT'.length
    expect(getSurroundingWords(full, start, end, 0)).toEqual({ before: '', after: '' })
  })
})

describe('getParagraphStartOffsets', () => {
  it('the first paragraph starts at 0, each subsequent one after the previous + the join length', () => {
    const paragraphs = ['abc', 'de', 'fghij']
    expect(getParagraphStartOffsets(paragraphs)).toEqual([0, 5, 9]) // 3+2, then 5+2+2
  })

  it('offsets are consistent with joinParagraphs — slicing at an offset lands exactly on that paragraph', () => {
    const paragraphs = ['first paragraph', 'second one', 'third']
    const full = joinParagraphs(paragraphs)
    const offsets = getParagraphStartOffsets(paragraphs)
    paragraphs.forEach((p, i) => {
      expect(full.slice(offsets[i], offsets[i] + p.length)).toBe(p)
    })
  })

  it('an empty paragraph list returns an empty offsets list', () => {
    expect(getParagraphStartOffsets([])).toEqual([])
  })
})
