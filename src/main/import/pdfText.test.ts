import { describe, expect, it } from 'vitest'
import { reconstructParagraphs, type PageText, type TextRun } from './pdfText'

function run(text: string, x: number, y: number, height = 10): TextRun {
  return { text, x, y, height }
}

describe('reconstructParagraphs', () => {
  it('joins runs on one line left to right and lines into a paragraph, breaking on a large gap', () => {
    // Baselines 12 apart = single spacing; a 30 gap = a blank line.
    const page: PageText = {
      runs: [
        run('Second', 0, 88),
        run('paragraph.', 40, 88),
        run('first', 30, 100),
        run('The', 0, 100),
        run('line continues here.', 0, 130),
        run('This is the', 0, 142)
      ]
    }
    expect(reconstructParagraphs([page])).toEqual(['This is the line continues here.', 'The first Second paragraph.'].map((s) => s))
  })

  it('treats OCR jitter (slightly different baselines) as the same line', () => {
    const page: PageText = { runs: [run('one', 0, 100), run('two', 30, 102), run('three', 60, 99)] }
    expect(reconstructParagraphs([page])).toEqual(['one two three'])
  })

  it('re-joins a word hyphenated across lines, and ends a paragraph at a page end', () => {
    const pages: PageText[] = [
      { runs: [run('an inter-', 0, 100), run('view about work', 0, 88)] },
      { runs: [run('Next page starts fresh.', 0, 100)] }
    ]
    expect(reconstructParagraphs(pages)).toEqual(['an interview about work', 'Next page starts fresh.'])
  })

  it('does not merge runs that pdf.js already spaced, and ignores empty runs', () => {
    const page: PageText = { runs: [run('Hello ', 0, 100), run('world', 40, 100), run('   ', 80, 100), run('', 90, 100)] }
    expect(reconstructParagraphs([page])).toEqual(['Hello world'])
  })

  it('scales the paragraph-break threshold to the page: double-spaced text is one paragraph', () => {
    // Every gap is 24 (double spacing for a 10pt font) — uniform, so no break.
    const page: PageText = { runs: [run('a', 0, 148), run('b', 0, 124), run('c', 0, 100), run('d', 0, 76)] }
    expect(reconstructParagraphs([page])).toEqual(['a b c d'])
    // Same, with one gap of 60: that one is a break.
    const page2: PageText = { runs: [run('a', 0, 184), run('b', 0, 160), run('c', 0, 100), run('d', 0, 76)] }
    expect(reconstructParagraphs([page2])).toEqual(['a b', 'c d'])
  })

  it('finds the break on a short page where half the gaps are breaks (a median would not)', () => {
    // Lines 14 apart, then a 40 gap — what the end-to-end probe PDF produces.
    const page: PageText = { runs: [run('Il parle.', 0, 250, 12), run('Puis.', 0, 236, 12), run('Deuxieme.', 0, 196, 12)] }
    expect(reconstructParagraphs([page])).toEqual(['Il parle. Puis.', 'Deuxieme.'])
  })

  it('returns nothing for a page with no text (a scan with no OCR layer)', () => {
    expect(reconstructParagraphs([{ runs: [] }, { runs: [run('  ', 0, 0)] }])).toEqual([])
  })
})
