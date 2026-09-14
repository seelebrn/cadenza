// Pure decision logic for project backups — kept separate from and free of
// any Electron/filesystem dependency (see main/backups.ts for the actual
// glue) so the policy itself (when to snapshot, what to prune) is directly
// unit-testable, the same reasoning boardOps.ts's pure geometry is kept
// apart from BoardView.tsx's rendering.
//
// The feature this supports: before every write to a project's .qdaproj
// file (autosave and explicit save both go through the same
// writeProjectFile call), whatever was already on disk gets copied into a
// timestamped backup first — the one place a bad autosave (or a bad
// explicit save) can still be undone from, since in-session undo/redo
// doesn't survive closing the app and autosave itself just silently
// overwrites whatever was there.

export interface BackupInfo {
  fileName: string
  createdAt: string // ISO timestamp
}

/**
 * Whether enough time has passed since the most recent backup to justify
 * writing another one. An actively edited project autosaves every ~1.5s;
 * without this, the backups folder would fill with near-duplicates of a
 * potentially large file for no real safety benefit — the point is "a
 * checkpoint from a while ago I can go back to", not "every keystroke".
 * `mostRecentBackupAt` null (no backup exists yet) always creates one.
 */
export function shouldCreateBackup(
  mostRecentBackupAt: string | null,
  now: Date,
  minIntervalMs: number
): boolean {
  if (mostRecentBackupAt === null) return true
  const elapsed = now.getTime() - new Date(mostRecentBackupAt).getTime()
  return elapsed >= minIntervalMs
}

/**
 * Which backups to delete to bring the total down to `maxCount` — the
 * oldest ones beyond the cap, keeping the most recent `maxCount`. Returns
 * just the fileNames, since that's all a caller needs to unlink; order is
 * oldest-first, matching deletion order (not that it matters for
 * correctness, just easier to read in a log).
 */
export function pickBackupsToPrune(entries: BackupInfo[], maxCount: number): string[] {
  if (entries.length <= maxCount) return []
  const sorted = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return sorted.slice(0, sorted.length - maxCount).map((e) => e.fileName)
}
