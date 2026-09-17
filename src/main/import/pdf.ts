import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { reconstructParagraphs, type PageText } from './pdfText'

/** pdf.js's CMap tables, needed to read the text of PDFs whose fonts use
 * predefined CJK/CID encodings; shipped with the package (and kept in the
 * packaged app — see package.json's build.files). */
function cMapUrl(): string {
  const packageJson = createRequire(import.meta.url).resolve('pdfjs-dist/package.json')
  return join(dirname(packageJson), 'cmaps') + '/'
}

/** Text of a PDF as paragraphs — see pdfText.ts for how paragraphs are
 * inferred from positioned runs. Works for born-digital PDFs and for
 * scans that have been OCR'd (their invisible text layer is what pdf.js
 * reads); a scan with no text layer yields nothing, and the caller turns
 * that into a clear message rather than importing an empty document.
 *
 * pdf.js's "legacy" build runs in Node without a DOM; with no worker
 * configured it does the parsing on the main thread, fine for a one-off
 * import. Loaded lazily so the (large) library isn't paid for until a PDF
 * is actually imported. */
export async function extractPdfParagraphs(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = pdfjs.getDocument({ data: bytes, useSystemFonts: true, cMapUrl: cMapUrl(), cMapPacked: true })
  const document = await loadingTask.promise
  try {
    const pages: PageText[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      pages.push({
        runs: content.items.flatMap((item) =>
          'str' in item
            ? [{ text: item.str, x: item.transform[4], y: item.transform[5], height: item.height, hasEOL: item.hasEOL }]
            : []
        )
      })
      page.cleanup()
    }
    return reconstructParagraphs(pages)
  } finally {
    await loadingTask.destroy()
  }
}
