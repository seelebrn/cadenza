import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import type { RecentProjectEntry } from '../shared/types'

const MAX_RECENT = 10

function recentFilePath(): string {
  return join(app.getPath('userData'), 'recent-projects.json')
}

export async function getRecentProjects(): Promise<RecentProjectEntry[]> {
  try {
    const raw = await readFile(recentFilePath(), 'utf-8')
    return JSON.parse(raw) as RecentProjectEntry[]
  } catch {
    return []
  }
}

export async function addRecentProject(
  entry: RecentProjectEntry
): Promise<RecentProjectEntry[]> {
  const existing = await getRecentProjects()
  const deduped = existing.filter((e) => e.filePath !== entry.filePath)
  deduped.unshift(entry)
  const trimmed = deduped.slice(0, MAX_RECENT)
  await writeFile(recentFilePath(), JSON.stringify(trimmed, null, 2), 'utf-8')
  return trimmed
}
