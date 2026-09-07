import mammoth from 'mammoth'

// Word paragraphs/headings map to <p>/<h1-6> in mammoth's HTML output — using
// convertToHtml (rather than extractRawText) means paragraph boundaries come
// from Word's actual structure, not from guessing at whitespace conventions.
const BLOCK_TAG_PATTERN = /<(p|h[1-6])[^>]*>([\s\S]*?)<\/\1>/g

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Pure helper (no mammoth call) so paragraph extraction is unit-testable
 * against a fixed HTML fixture without needing a real .docx file. */
export function extractParagraphsFromHtml(html: string): string[] {
  const paragraphs: string[] = []
  for (const match of html.matchAll(BLOCK_TAG_PATTERN)) {
    const text = decodeEntities(stripTags(match[2])).trim()
    if (text) paragraphs.push(text)
  }
  return paragraphs
}

export async function extractDocxParagraphs(bytes: Uint8Array): Promise<string[]> {
  const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) })
  return extractParagraphsFromHtml(html)
}
