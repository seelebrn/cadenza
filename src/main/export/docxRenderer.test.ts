import { describe, expect, it } from 'vitest'
import { renderReportToDocx } from './docxRenderer'
import type { Report } from '../../shared/reportModel'

// .docx is itself a zip archive — a real one always starts with the ZIP
// local-file-header magic bytes ("PK\x03\x04"). Checking for that (rather
// than trying to parse the OOXML back out) is enough to catch the kind of
// mistake that actually matters here: the `docx` package throwing, or
// Packer.toBuffer silently producing something that isn't a real archive.
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04])

describe('renderReportToDocx', () => {
  it('produces a real (zip-backed) docx buffer for a report with every block kind', async () => {
    const report: Report = {
      title: 'Test Report',
      blocks: [
        { kind: 'heading', level: 2, text: 'Section', color: '#ff0000' },
        { kind: 'paragraph', text: 'Plain text' },
        { kind: 'paragraph', text: 'A quote', style: 'quote' },
        { kind: 'paragraph', text: 'Meta info', style: 'meta' },
        { kind: 'table', headers: ['A', 'B'], rows: [['1', '2']] }
      ]
    }
    const buffer = await renderReportToDocx(report)
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.length).toBeGreaterThan(0)
    expect(buffer.subarray(0, 4)).toEqual(ZIP_MAGIC)
  })

  it('handles an empty report (no blocks) without throwing', async () => {
    const report: Report = { title: 'Empty', blocks: [] }
    const buffer = await renderReportToDocx(report)
    expect(buffer.subarray(0, 4)).toEqual(ZIP_MAGIC)
  })
})
