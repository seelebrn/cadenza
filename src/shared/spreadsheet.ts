import type { PassageQuery, PassageResult } from './retrieval'
import { stripIllegalXmlChars } from './text'
import type { ProjectData } from './types'

/** A small .xlsx (SpreadsheetML) writer — just what a table of passages
 * needs: text and number cells, a bold frozen header row with filters,
 * column widths, wrapped long text. Returns the files of the package, path
 * → XML; the main process zips them. Written by hand rather than pulling
 * in a spreadsheet library for one table; Excel, LibreOffice and Numbers
 * all read it. Text goes in as inline strings, so there is no shared
 * string table to keep in sync. */

export type Cell = string | number

export interface Sheet {
  /** Tab name; trimmed to what Excel allows. */
  name: string
  /** The first row is the header. */
  rows: Cell[][]
  /** Width of each column, in characters; missing = Excel's default. */
  columnWidths?: number[]
  /** Columns whose text wraps (long passages, notes). */
  wrapColumns?: number[]
  /** A table (the default): bold header row, frozen, with filter buttons.
   * False for a plain sheet of label/value lines. */
  table?: boolean
}

const isTable = (sheet: Sheet): boolean => sheet.table !== false && sheet.rows.length > 0

/** Excel refuses a cell over this many characters. */
const MAX_CELL_LENGTH = 32767

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** A → 1-based column letters: 1 → A, 26 → Z, 27 → AA. */
export function columnName(index: number): string {
  let name = ''
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}

/** Excel's rules for a tab name: at most 31 characters, none of []:*?/\,
 * and unique in the workbook. */
function sheetNames(sheets: Sheet[]): string[] {
  const taken = new Set<string>()
  return sheets.map((sheet) => {
    const base = sheet.name.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31).trim() || 'Sheet'
    let name = base
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base.slice(0, 31 - ` (${n})`.length)} (${n})`
    taken.add(name.toLowerCase())
    return name
  })
}

// Cell styles (cellXfs indices below): 0 plain, 1 bold header, 2 wrapped text.
const STYLES = `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

function sheetXml(sheet: Sheet): string {
  const width = Math.max(1, ...sheet.rows.map((r) => r.length))
  const wrap = new Set(sheet.wrapColumns ?? [])
  const rows = sheet.rows.map((row, r) => {
    const cells = row.map((value, c) => {
      const ref = `${columnName(c + 1)}${r + 1}`
      const style = r === 0 && isTable(sheet) ? 1 : wrap.has(c) ? 2 : 0
      if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}" s="${style}"><v>${value}</v></c>`
      const text = stripIllegalXmlChars(value).slice(0, MAX_CELL_LENGTH)
      if (text === '') return ''
      return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`
    })
    return `<row r="${r + 1}">${cells.join('')}</row>`
  })
  const cols = sheet.columnWidths?.length
    ? `<cols>${sheet.columnWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : ''
  const lastRef = `${columnName(width)}${Math.max(1, sheet.rows.length)}`
  const hasHeader = isTable(sheet)
  return `${XML_HEAD}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">
<sheetViews><sheetView workbookViewId="0">${hasHeader ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : ''}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${cols}<sheetData>${rows.join('\n')}</sheetData>
${hasHeader ? `<autoFilter ref="A1:${lastRef}"/>` : ''}
</worksheet>`
}

/** The files of an .xlsx package holding `sheets`, path → content. */
export function buildXlsxParts(sheets: Sheet[]): Record<string, string> {
  const names = sheetNames(sheets)
  const parts: Record<string, string> = {}
  parts['[Content_Types].xml'] = `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`
  parts['_rels/.rels'] = `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
  // The hidden _FilterDatabase names are what Excel itself writes beside an
  // autoFilter; without them some versions drop the filter buttons.
  const filters = sheets
    .map((sheet, i) => {
      if (!isTable(sheet)) return ''
      const width = Math.max(1, ...sheet.rows.map((r) => r.length))
      const quoted = `'${escapeXml(names[i].replace(/'/g, "''"))}'`
      return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${quoted}!$A$1:$${columnName(width)}$${sheet.rows.length}</definedName>`
    })
    .join('')
  parts['xl/workbook.xml'] = `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">
<sheets>${names.map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
${filters ? `<definedNames>${filters}</definedNames>` : ''}
</workbook>`
  parts['xl/_rels/workbook.xml.rels'] = `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  parts['xl/styles.xml'] = STYLES
  sheets.forEach((sheet, i) => {
    parts[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sheet)
  })
  return parts
}

// --- Passages as a table ---------------------------------------------------

/** A code's name with its parents', "Parent › Child", so a sub-code reads
 * unambiguously outside the codebook tree. */
function codePath(data: ProjectData, codeId: string): string {
  const byId = new Map(data.codes.map((c) => [c.id, c]))
  const names: string[] = []
  for (let code = byId.get(codeId); code && names.length < 50; code = code.parentId ? byId.get(code.parentId) : undefined) {
    names.unshift(code.name)
  }
  return names.join(' › ')
}

/** One row per passage: document, the document's case attributes (one
 * column each), the passage, its codes, the clusters those codes are filed
 * in, and the notes written on it. */
export function buildPassageSheet(data: ProjectData, results: PassageResult[]): Sheet {
  const attributeNames: string[] = []
  for (const d of data.documents) for (const name of Object.keys(d.attributes)) if (!attributeNames.includes(name)) attributeNames.push(name)
  const documentById = new Map(data.documents.map((d) => [d.id, d]))
  const header = ['Document', ...attributeNames, 'Passage', 'Codes', 'Clusters', 'Notes']
  const rows: Cell[][] = results.map((r) => {
    const document = documentById.get(r.documentId)
    const clusters = data.categories.filter((c) => c.codeIds.some((id) => r.codeIds.includes(id))).map((c) => c.name)
    const notes = data.notes
      .filter((n) => n.attachedTo.kind === 'segment' && n.attachedTo.segmentId === r.segment.id)
      .map((n) => (n.question ? `${n.question}\n${n.answer}` : n.answer))
    return [
      r.documentTitle,
      ...attributeNames.map((name) => document?.attributes[name] ?? ''),
      r.segment.text,
      r.codeIds.map((id) => codePath(data, id)).join('\n'),
      clusters.join('\n'),
      notes.join('\n\n')
    ]
  })
  const passageColumn = 1 + attributeNames.length
  return {
    name: 'Passages',
    rows: [header, ...rows],
    columnWidths: [24, ...attributeNames.map(() => 14), 70, 30, 24, 40],
    wrapColumns: [passageColumn, passageColumn + 1, passageColumn + 2, passageColumn + 3]
  }
}

/** A second tab saying what the table holds — which project, when, and the
 * query behind it — so a file passed around still says what it is. */
export function buildQuerySheet(data: ProjectData, query: PassageQuery, count: number, exportedAt: string): Sheet {
  const names = (ids: string[]): string => ids.map((id) => codePath(data, id)).join('; ')
  const titles = query.documentIds.map((id) => data.documents.find((d) => d.id === id)?.title ?? '?').join('; ')
  const attributes = Object.entries(query.attributes)
    .filter(([, values]) => values.length)
    .map(([name, values]) => `${name}: ${values.join(' or ')}`)
    .join('; ')
  const rows: Cell[][] = [
    ['Project', data.name],
    ['Exported', exportedAt],
    [
      'Codes',
      query.codeIds.length === 0
        ? 'Every coded passage'
        : query.codeIds.length === 1
          ? names(query.codeIds)
          : `${query.match === 'all' ? 'All of' : 'Any of'}: ${names(query.codeIds)}`
    ],
    ['Sub-codes', query.includeDescendants ? 'Included' : 'Not included'],
    ['Except where', query.excludeCodeIds.length ? names(query.excludeCodeIds) : '—'],
    ['Documents', titles || 'All'],
    ['Case attributes', attributes || '—'],
    ['Passages', count]
  ]
  return { name: 'Query', rows, columnWidths: [18, 80], wrapColumns: [1], table: false }
}
