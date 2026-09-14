import { useEffect, useState } from 'react'
import type { BackupEntry } from '@shared/types'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(0)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

/**
 * "History" panel — lists the automatic backups Cadenza has silently taken
 * of the current project (see main/backups.ts: one before every save, at
 * most every 5 minutes, capped at 20) and lets the user recover one. A
 * restore loads that snapshot as a copy: it comes back dirty/unsaved (see
 * projectStore.restoreBackup), so the file the backup was made *from* is
 * never silently overwritten — the user reviews it and explicitly Saves As
 * if they want to keep it. Mounted once at the app level, same as
 * CodeInfoModal/NoteInfoModal.
 */
function VersionHistoryModal(): JSX.Element | null {
  const isOpen = useWorkspaceUiStore((s) => s.isVersionHistoryOpen)
  const setOpen = useWorkspaceUiStore((s) => s.setVersionHistoryOpen)
  const listBackups = useProjectStore((s) => s.listBackups)
  const restoreBackup = useProjectStore((s) => s.restoreBackup)
  const isDirty = useProjectStore((s) => s.isDirty)

  const [backups, setBackups] = useState<BackupEntry[] | null>(null)
  const [pendingRestore, setPendingRestore] = useState<string | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setBackups(null)
    setPendingRestore(null)
    listBackups().then(setBackups)
  }, [isOpen, listBackups])

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, setOpen])

  if (!isOpen) return null

  function close(): void {
    setOpen(false)
  }

  async function confirmRestore(fileName: string): Promise<void> {
    setIsRestoring(true)
    try {
      await restoreBackup(fileName)
      close()
    } finally {
      setIsRestoring(false)
    }
  }

  const newestFirst = backups ? [...backups].reverse() : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="flex-1 text-sm font-semibold text-slate-800">History</h2>
          <button
            className="flex-shrink-0 rounded px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={close}
            title="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 text-sm">
          <p className="mb-3 text-[11px] text-slate-400">
            Cadenza silently keeps a few recent backups of this project as you save it. Restoring one loads it as a
            copy — it won&apos;t touch your current file until you explicitly save it.
          </p>

          {backups === null && <p className="text-slate-400">Loading…</p>}

          {backups !== null && backups.length === 0 && (
            <p className="text-slate-400">No backups yet — one will be made the next time you save.</p>
          )}

          {newestFirst && newestFirst.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {newestFirst.map((backup) => (
                <li
                  key={backup.fileName}
                  className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-slate-700">{formatTimestamp(backup.createdAt)}</p>
                    <p className="text-[10px] text-slate-400">{formatSize(backup.sizeBytes)}</p>
                  </div>
                  {pendingRestore === backup.fileName ? (
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      <span className="text-[10px] text-slate-500">
                        {isDirty ? 'Discard unsaved changes and restore?' : 'Restore this version?'}
                      </span>
                      <button
                        className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-50 disabled:opacity-50"
                        disabled={isRestoring}
                        onClick={() => confirmRestore(backup.fileName)}
                      >
                        {isRestoring ? 'Restoring…' : 'Yes, restore'}
                      </button>
                      <button
                        className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-50"
                        disabled={isRestoring}
                        onClick={() => setPendingRestore(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="flex-shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"
                      onClick={() => setPendingRestore(backup.fileName)}
                    >
                      Restore
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default VersionHistoryModal
