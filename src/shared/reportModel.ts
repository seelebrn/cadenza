// A small, format-agnostic document model — every exporter (HTML, DOCX,
// and PDF, which is just "print the HTML") renders the *same* Report, so
// the actual content logic (buildCodebookReport, buildNotesReport,
// buildComparisonReport, in reportBuilders.ts) is written once and stays
// pure/testable, independent of which file format the user picks.

export type ReportBlockStyle = 'normal' | 'quote' | 'meta'

export type ReportBlock =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4; text: string; color?: string }
  | { kind: 'paragraph'; text: string; style?: ReportBlockStyle }
  | { kind: 'table'; headers: string[]; rows: string[][] }

export interface Report {
  title: string
  blocks: ReportBlock[]
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const HEADING_SIZE_PX: Record<1 | 2 | 3 | 4, number> = { 1: 26, 2: 20, 3: 16, 4: 14 }

/** Renders a Report to a complete, standalone HTML document — used
 * directly for the .html export, and as the intermediate step for .pdf
 * (loaded into a hidden window and printed). Inline CSS only, since a
 * standalone export shouldn't depend on any file alongside it. */
export function renderReportToHtml(report: Report): string {
  const body = report.blocks.map(renderBlockToHtml).join('\n')
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(report.title)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; color: #1e293b; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.5; }
  h1, h2, h3, h4 { font-weight: 600; margin: 1.4em 0 0.4em; }
  h1 { font-size: 26px; margin-top: 0; }
  p { margin: 0.3em 0; }
  p.quote { font-style: italic; color: #475569; margin-left: 1.2em; }
  p.meta { font-size: 12px; color: #94a3b8; margin-top: 0.8em; }
  table { border-collapse: collapse; margin: 0.8em 0; width: 100%; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 8px; text-align: left; font-size: 13px; }
  th { background: #f1f5f9; }
</style>
</head>
<body>
<h1>${escapeHtml(report.title)}</h1>
${body}
</body>
</html>`
}

function renderBlockToHtml(block: ReportBlock): string {
  if (block.kind === 'heading') {
    const style = block.color ? ` style="color:${escapeHtml(block.color)}"` : ''
    return `<h${block.level}${style}>${escapeHtml(block.text)}</h${block.level}>`
  }
  if (block.kind === 'paragraph') {
    const cls = block.style && block.style !== 'normal' ? ` class="${block.style}"` : ''
    return `<p${cls}>${escapeHtml(block.text)}</p>`
  }
  const headerRow = `<tr>${block.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`
  const bodyRows = block.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')
  return `<table>${headerRow}${bodyRows}</table>`
}

export { HEADING_SIZE_PX }
