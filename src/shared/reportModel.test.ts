import { describe, expect, it } from 'vitest'
import { renderReportToHtml } from './reportModel'
import type { Report } from './reportModel'

describe('renderReportToHtml', () => {
  it('renders headings, paragraphs, and tables in order', () => {
    const report: Report = {
      title: 'My Report',
      blocks: [
        { kind: 'heading', level: 2, text: 'Section' },
        { kind: 'paragraph', text: 'Hello world' },
        { kind: 'table', headers: ['A', 'B'], rows: [['1', '2']] }
      ]
    }
    const html = renderReportToHtml(report)
    expect(html).toContain('<title>My Report</title>')
    expect(html).toContain('<h1>My Report</h1>')
    expect(html).toContain('<h2>Section</h2>')
    expect(html).toContain('<p>Hello world</p>')
    expect(html).toContain('<th>A</th>')
    expect(html).toContain('<td>1</td>')
    // Order preserved: heading before paragraph before table.
    const sectionIdx = html.indexOf('<h2>Section</h2>')
    const paraIdx = html.indexOf('<p>Hello world</p>')
    const tableIdx = html.indexOf('<table>')
    expect(sectionIdx).toBeLessThan(paraIdx)
    expect(paraIdx).toBeLessThan(tableIdx)
  })

  it('escapes HTML-significant characters so injected content cannot break the document', () => {
    const report: Report = {
      title: 'Title <script>',
      blocks: [{ kind: 'paragraph', text: '<b>bold</b> & "quoted"' }]
    }
    const html = renderReportToHtml(report)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot;')
  })

  it('applies the quote/meta paragraph style as a class, but not for normal/unstyled paragraphs', () => {
    const report: Report = {
      title: 'T',
      blocks: [
        { kind: 'paragraph', text: 'quoted text', style: 'quote' },
        { kind: 'paragraph', text: 'meta text', style: 'meta' },
        { kind: 'paragraph', text: 'plain text' }
      ]
    }
    const html = renderReportToHtml(report)
    expect(html).toContain('<p class="quote">quoted text</p>')
    expect(html).toContain('<p class="meta">meta text</p>')
    expect(html).toContain('<p>plain text</p>')
  })

  it('applies a heading color when given, omits the style attribute otherwise', () => {
    const report: Report = {
      title: 'T',
      blocks: [
        { kind: 'heading', level: 3, text: 'Colored', color: '#ff0000' },
        { kind: 'heading', level: 3, text: 'Plain' }
      ]
    }
    const html = renderReportToHtml(report)
    expect(html).toContain('<h3 style="color:#ff0000">Colored</h3>')
    expect(html).toContain('<h3>Plain</h3>')
  })
})
