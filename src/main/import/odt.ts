import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'

// ODT is a zip of XML, like docx, but no mature pure-JS reader exists for it —
// this walks content.xml's AST (in document order, via preserveOrder) looking
// for <text:p>/<text:h> paragraph nodes anywhere in the tree, concatenating
// their text content (handling nested <text:span> etc. by just flattening).
const PARAGRAPH_TAGS = new Set(['text:p', 'text:h'])

type OdtNode = Record<string, unknown>

function collectText(node: OdtNode): string {
  if ('#text' in node) return String(node['#text'])
  let text = ''
  for (const key of Object.keys(node)) {
    if (key === ':@') continue
    const children = node[key]
    if (Array.isArray(children)) {
      for (const child of children) text += collectText(child as OdtNode)
    }
  }
  return text
}

function collectParagraphs(nodes: unknown[], paragraphs: string[]): void {
  for (const rawNode of nodes) {
    const node = rawNode as OdtNode
    for (const tag of Object.keys(node)) {
      if (tag === ':@') continue
      const children = node[tag]
      if (!Array.isArray(children)) continue
      if (PARAGRAPH_TAGS.has(tag)) {
        const text = collectText(node).trim()
        if (text) paragraphs.push(text)
      } else {
        collectParagraphs(children, paragraphs)
      }
    }
  }
}

/** Pure helper (no zip/file I/O) so paragraph extraction is unit-testable
 * against a fixed content.xml fixture. */
export function extractParagraphsFromOdtContentXml(xml: string): string[] {
  // trimValues: false — otherwise fast-xml-parser trims each individual text
  // fragment, so "Second " + <span>text</span> + " more" loses the spaces
  // around the span and words run together. We trim the *joined* paragraph
  // text instead, once it's fully assembled.
  const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: true, trimValues: false })
  const ast = parser.parse(xml) as unknown[]
  const paragraphs: string[] = []
  collectParagraphs(ast, paragraphs)
  return paragraphs
}

export async function extractOdtParagraphs(bytes: Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes)
  const contentFile = zip.file('content.xml')
  if (!contentFile) {
    throw new Error('Not a valid OpenDocument text file (missing content.xml)')
  }
  const xml = await contentFile.async('string')
  return extractParagraphsFromOdtContentXml(xml)
}
