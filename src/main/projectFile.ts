import JSZip from 'jszip'
import { readFile, writeFile } from 'fs/promises'
import { nanoid } from 'nanoid'
import { normalizeProjectData } from '../shared/normalizeProject'
import {
  PROJECT_SCHEMA_VERSION,
  type NoteCategoryDef,
  type ProjectData,
  type SerializedAssets
} from '../shared/types'

/**
 * A .qdaproj file is a zip: project.json holds all structured data, plus an
 * assets/ folder holding original imported files (docx/odt/xlsx source
 * bytes), keyed by the relative path stored on each DocumentRecord.
 */

// Default note-category catalog (IPA-style exploratory remark types);
// fully user-editable/renameable/recolorable/deletable from there.
function seedNoteCategories(): NoteCategoryDef[] {
  const now = new Date().toISOString()
  return [
    { id: nanoid(), name: 'Note Descriptive', color: '#22c55e', createdAt: now },
    { id: nanoid(), name: 'Note Linguistique', color: '#3b82f6', createdAt: now },
    { id: nanoid(), name: 'Note Conceptuelle', color: '#ef4444', createdAt: now }
  ]
}

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
    noteCategories: seedNoteCategories(),
    categories: [],
    boards: [],
    boardItems: [],
    boardClusters: []
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
  const rawData = JSON.parse(await projectJson.async('string')) as ProjectData
  if (rawData.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported project schema version ${rawData.schemaVersion} (expected ${PROJECT_SCHEMA_VERSION})`
    )
  }
  const data = normalizeProjectData(rawData)
  const assets: SerializedAssets = {}
  for (const file of zip.file(/^assets\//)) {
    const relPath = file.name.replace(/^assets\//, '')
    assets[relPath] = await file.async('uint8array')
  }
  return { data, assets }
}
