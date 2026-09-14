import { app } from 'electron'
import { join } from 'path'
import { access, copyFile, mkdir, readdir, stat, unlink } from 'fs/promises'
import { pickBackupsToPrune, shouldCreateBackup } from '../shared/backupOps'
import type { BackupEntry } from '../shared/types'

// See shared/backupOps.ts for why this exists and the policy behind it —
// this module is just the filesystem glue: where backups live, how a
// backup's own timestamp is read, and the actual copy/prune I/O.

const MAX_BACKUPS = 20
const MIN_BACKUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// Kept under Electron's own app-data folder (same place recent-projects.json
// already lives), not next to the .qdaproj file itself — a folder of backup
// files sitting beside their live project would be easy to mistake for
// clutter and delete, and wouldn't survive the user renaming or moving the
// project file. Keyed by the project's own id (ProjectData.id, stable
// across renames/moves), not its file path.
function backupsDir(projectId: string): string {
  return join(app.getPath('userData'), 'backups', projectId)
}

// Purely for a human glancing at the folder in a file browser — sortable,
// filesystem-safe on every platform (a plain ISO timestamp's colons aren't
// valid in a Windows filename). The app itself never parses a timestamp
// back out of this; see listBackups, which reads the file's own mtime.
function backupFileName(date: Date): string {
  return `${date.toISOString().replace(/[:.]/g, '-')}.qdaproj`
}

/** Every backup on file for this project, oldest first. Empty (not an
 * error) if the project has never been backed up. */
export async function listBackups(projectId: string): Promise<BackupEntry[]> {
  const dir = backupsDir(projectId)
  let fileNames: string[]
  try {
    fileNames = await readdir(dir)
  } catch {
    return []
  }
  const entries = await Promise.all(
    fileNames
      .filter((f) => f.endsWith('.qdaproj'))
      .map(async (fileName) => {
        const s = await stat(join(dir, fileName))
        return { fileName, createdAt: s.mtime.toISOString(), sizeBytes: s.size }
      })
  )
  return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** Resolves one backup's full path, e.g. to hand to readProjectFile. */
export function backupFilePath(projectId: string, fileName: string): string {
  return join(backupsDir(projectId), fileName)
}

/**
 * Copies whatever's currently at `filePath` into a timestamped backup,
 * meant to be called right before the caller overwrites that same path
 * with new content (see writeProjectFile) — the one place a bad autosave
 * or a bad explicit save can still be undone from, since in-session
 * undo/redo doesn't survive closing the app and autosave itself just
 * silently overwrites whatever was there.
 *
 * No-ops if there's nothing at `filePath` yet (a brand new project's first
 * save has nothing to back up) or if the most recent existing backup is
 * younger than the minimum interval — see shouldCreateBackup. Prunes down
 * to the most recent MAX_BACKUPS afterward — see pickBackupsToPrune.
 */
export async function createBackupIfDue(projectId: string, filePath: string): Promise<void> {
  try {
    await access(filePath)
  } catch {
    return
  }

  const existing = await listBackups(projectId)
  const mostRecent = existing.length > 0 ? existing[existing.length - 1].createdAt : null
  if (!shouldCreateBackup(mostRecent, new Date(), MIN_BACKUP_INTERVAL_MS)) return

  const dir = backupsDir(projectId)
  await mkdir(dir, { recursive: true })
  await copyFile(filePath, join(dir, backupFileName(new Date())))

  // Leave room for the one just added: prune the *previous* list down to
  // MAX_BACKUPS - 1 so the total after adding the new one stays at the cap.
  const toPrune = pickBackupsToPrune(existing, MAX_BACKUPS - 1)
  for (const fileName of toPrune) {
    await unlink(join(dir, fileName)).catch(() => {})
  }
}
