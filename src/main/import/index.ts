import { dialog } from 'electron'
import { readFile } from 'fs/promises'
import { basename, extname } from 'path'
import { nanoid } from 'nanoid'
import type { DocumentRecord, ImportedDocument, SourceFormat } from '../../shared/types'
import { extractDocxParagraphs } from './docx'
import { extractOdtParagraphs } from './odt'
import { extractTxtParagraphs } from './txt'

const SUPPORTED_EXTENSIONS: SourceFormat[] = ['docx', 'odt', 'txt']

function isSupportedExtension(ext: string): ext is SourceFormat {
  return (SUPPORTED_EXTENSIONS as string[]).includes(ext)
}

/** Opens a native file picker and imports the chosen document. Returns null
 * if the user canceled. */
export async function importDocumentDialog(): Promise<ImportedDocument | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Documents (Word, OpenDocument, Text)', extensions: SUPPORTED_EXTENSIONS },
      { name: 'Word document', extensions: ['docx'] },
      { name: 'OpenDocument text', extensions: ['odt'] },
      { name: 'Plain text', extensions: ['txt'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const filePath = result.filePaths[0]
  const ext = extname(filePath).slice(1).toLowerCase()
  if (!isSupportedExtension(ext)) {
    throw new Error(`Unsupported file type: .${ext}`)
  }

  const bytes = await readFile(filePath)
  let paragraphs: string[]
  if (ext === 'docx') paragraphs = await extractDocxParagraphs(bytes)
  else if (ext === 'odt') paragraphs = await extractOdtParagraphs(bytes)
  else paragraphs = extractTxtParagraphs(bytes.toString('utf-8'))

  const id = nanoid()
  const document: DocumentRecord = {
    id,
    title: basename(filePath, extname(filePath)),
    paragraphs,
    sourceFormat: ext,
    assetRelPath: `documents/${id}${extname(filePath)}`,
    importedAt: new Date().toISOString()
  }

  return { document, assetBytes: new Uint8Array(bytes) }
}
