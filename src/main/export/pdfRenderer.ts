import { BrowserWindow } from 'electron'
import type { PrintToPDFOptions } from 'electron'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

export interface PdfPageSize {
  widthPx: number
  heightPx: number
}

/**
 * Renders an HTML string to a PDF buffer by loading it into a hidden,
 * offscreen window and using Electron's own print pipeline — no separate
 * PDF-generation library needed, Chromium already does this well.
 *
 * When `pageSize` is given, the PDF is exactly that one page (converting
 * CSS pixels to the inches printToPDF's custom pageSize expects, at the
 * standard 96px/inch), margin-free — used for the board export, which
 * needs one big page matching its actual content size rather than being
 * paginated like a normal document. Without it, prints at a normal A4
 * page with default margins and lets content paginate naturally across
 * as many pages as it needs — the report exports.
 *
 * Writes the HTML to a temp file rather than a data: URL, mainly so an
 * arbitrarily large board snapshot never has to fit in a URL at all.
 */
export async function renderHtmlToPdf(html: string, pageSize?: PdfPageSize): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'cadenza-export-'))
  const filePath = join(dir, 'export.html')
  await writeFile(filePath, html, 'utf8')

  // Deliberately NOT webPreferences.offscreen — that switches Chromium to
  // its separate off-screen-rendering pipeline (meant for continuously
  // capturing frames, e.g. video), which pulled in real GPU-state errors
  // in testing here. A plain hidden (show: false) window still renders
  // normally, just without an OS window ever appearing, and is what
  // printToPDF is actually designed to be used against.
  const win = new BrowserWindow({ show: false })
  try {
    await win.loadFile(filePath)
    const options: PrintToPDFOptions = pageSize
      ? {
          printBackground: true,
          margins: { marginType: 'none' },
          pageSize: { width: pageSize.widthPx / 96, height: pageSize.heightPx / 96 }
        }
      : { printBackground: true, pageSize: 'A4' }
    return await win.webContents.printToPDF(options)
  } finally {
    win.destroy()
    await rm(dir, { recursive: true, force: true })
  }
}
