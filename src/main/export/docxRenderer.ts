import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'
import type { Report, ReportBlock } from '../../shared/reportModel'

const HEADING_LEVEL_BY_BLOCK_LEVEL = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4
} as const

// Quote/meta paragraph styling mirrors reportModel.ts's HTML CSS (italic
// grayish quote, small pale meta line) — kept visually equivalent across
// formats rather than each renderer inventing its own look.
const QUOTE_COLOR = '475569'
const META_COLOR = '94A3B8'
const META_SIZE_HALF_POINTS = 18 // 9pt

function blockToDocxElement(block: ReportBlock): Paragraph | Table {
  if (block.kind === 'heading') {
    return new Paragraph({
      heading: HEADING_LEVEL_BY_BLOCK_LEVEL[block.level],
      children: [new TextRun({ text: block.text, color: block.color?.replace('#', '') })]
    })
  }

  if (block.kind === 'paragraph') {
    if (block.style === 'quote') {
      return new Paragraph({
        indent: { left: 480 },
        children: [new TextRun({ text: block.text, italics: true, color: QUOTE_COLOR })]
      })
    }
    if (block.style === 'meta') {
      return new Paragraph({
        children: [new TextRun({ text: block.text, color: META_COLOR, size: META_SIZE_HALF_POINTS })]
      })
    }
    return new Paragraph({ children: [new TextRun({ text: block.text })] })
  }

  // Table.
  const headerRow = new TableRow({
    children: block.headers.map(
      (h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })
    )
  })
  const bodyRows = block.rows.map(
    (row) => new TableRow({ children: row.map((cell) => new TableCell({ children: [new Paragraph(cell)] })) })
  )
  return new Table({ rows: [headerRow, ...bodyRows], width: { size: 100, type: WidthType.PERCENTAGE } })
}

/** Renders a Report to a real .docx file's bytes, via the `docx` package —
 * the only one of the three export formats that needs a dedicated library
 * (HTML is plain string building, PDF is "print the HTML"). */
export async function renderReportToDocx(report: Report): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: report.title, bold: true })] }),
          ...report.blocks.map(blockToDocxElement)
        ]
      }
    ]
  })
  return Packer.toBuffer(doc)
}
