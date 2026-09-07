import JSZip from 'jszip'
import { readFile, writeFile } from 'fs/promises'
import { nanoid } from 'nanoid'
import { PROJECT_SCHEMA_VERSION, type ProjectData } from '../shared/types'

/**
 * A .qdaproj file is a zip: project.json holds all structured data, plus an
 * assets/ folder reserved for original imported files (docx/odt/xlsx source
 * bytes) — unused until Phase 2, but the read/write shape supports it now so
 * the format doesn't need to change later.
 */

export function createEmptyProject(name: string): ProjectData {
  const now = new Date().toISOString()
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: nanoid(),
    name,
    createdAt: now,
    updatedAt: now,
    documents: [],
    segments: [],
    codes: [],
    codings: [],
    notes: [],
    categories: [],
    boards: [],
    boardItems: []
  }
}

export async function writeProjectFile(
  filePath: string,
  data: ProjectData,
  assets: Record<string, Buffer> = {}
): Promise<void> {
  const zip = new JSZip()
  const toSave: ProjectData = { ...data, updatedAt: new Date().toISOString() }
  zip.file('project.json', JSON.stringify(toSave, null, 2))
  const assetsFolder = zip.folder('assets')
  for (const [relPath, buf] of Object.entries(assets)) {
    assetsFolder?.file(relPath, buf)
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  await writeFile(filePath, buffer)
}

export async function readProjectFile(
  filePath: string
): Promise<{ data: ProjectData; assets: Record<string, Buffer> }> {
  const buffer = await readFile(filePath)
  const zip = await JSZip.loadAsync(buffer)
  const projectJson = zip.file('project.json')
  if (!projectJson) {
    throw new Error('Not a valid Cadenza project file (missing project.json)')
  }
  const data = JSON.parse(await projectJson.async('string')) as ProjectData
  if (data.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported project schema version ${data.schemaVersion} (expected ${PROJECT_SCHEMA_VERSION})`
    )
  }
  const assets: Record<string, Buffer> = {}
  for (const file of zip.file(/^assets\//)) {
    const relPath = file.name.replace(/^assets\//, '')
    assets[relPath] = await file.async('nodebuffer')
  }
  return { data, assets }
}
