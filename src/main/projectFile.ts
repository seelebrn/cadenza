import JSZip from 'jszip'
import { readFile, writeFile } from 'fs/promises'
import { nanoid } from 'nanoid'
import { PROJECT_SCHEMA_VERSION, type ProjectData, type SerializedAssets } from '../shared/types'

/**
 * A .qdaproj file is a zip: project.json holds all structured data, plus an
 * assets/ folder holding original imported files (docx/odt/xlsx source
 * bytes), keyed by the relative path stored on each DocumentRecord.
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
  assets: SerializedAssets = {}
): Promise<void> {
  const zip = new JSZip()
  const toSave: ProjectData = { ...data, updatedAt: new Date().toISOString() }
  zip.file('project.json', JSON.stringify(toSave, null, 2))
  const assetsFolder = zip.folder('assets')
  for (const [relPath, bytes] of Object.entries(assets)) {
    assetsFolder?.file(relPath, bytes)
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  await writeFile(filePath, buffer)
}

export async function readProjectFile(
  filePath: string
): Promise<{ data: ProjectData; assets: SerializedAssets }> {
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
  const assets: SerializedAssets = {}
  for (const file of zip.file(/^assets\//)) {
    const relPath = file.name.replace(/^assets\//, '')
    assets[relPath] = await file.async('uint8array')
  }
  return { data, assets }
}
