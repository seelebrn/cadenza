import { useMemo, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import { getCodeUsageDetail, CODE_USAGE_CONTEXT_WORDS } from '@shared/retrieval'

/** The code-info window: double-click a code anywhere it appears (a coded
 * passage in the source text, a row in the Workspace codebook tree, or a
 * card on the board) to see its name, how many times it's been used, and
 * every verbatim instance — optionally with surrounding context. Mounted
 * once at the app level (see App.tsx) so it works the same regardless of
 * which of those three triggered it, and survives switching views while
 * open. */
function CodeInfoModal(): JSX.Element | null {
  const inspectedCodeId = useWorkspaceUiStore((s) => s.inspectedCodeId)
  const setInspectedCodeId = useWorkspaceUiStore((s) => s.setInspectedCodeId)
  const data = useProjectStore((s) => s.data)
  const [showContext, setShowContext] = useState(false)

  const code = useMemo(
    () => data?.codes.find((c) => c.id === inspectedCodeId) ?? null,
    [data, inspectedCodeId]
  )
  const usage = useMemo(
    () => (data && inspectedCodeId ? getCodeUsageDetail(data, inspectedCodeId) : null),
    [data, inspectedCodeId]
  )

  if (!inspectedCodeId) return null

  function close(): void {
    setInspectedCodeId(null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          {code && <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: code.color }} />}
          <h2 className="flex-1 truncate text-sm font-semibold text-slate-800">
            {code ? code.name : '(code no longer exists)'}
          </h2>
          {code && (
            <span className="flex-shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
              {code.kind}
            </span>
          )}
          <button
            className="flex-shrink-0 rounded px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={close}
            title="Close"
          >
            ×
          </button>
        </div>

        {code && usage && (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2 text-xs text-slate-500">
              <span>
                Used <span className="font-semibold text-slate-800">{usage.count}</span>{' '}
                time{usage.count === 1 ? '' : 's'}
              </span>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={showContext}
                  onChange={(e) => setShowContext(e.target.checked)}
                />
                Show {CODE_USAGE_CONTEXT_WORDS} words of context
              </label>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {usage.instances.length === 0 && (
                <p className="text-center text-sm text-slate-400">Never applied to any text yet.</p>
              )}
              <ul className="space-y-3">
                {usage.instances.map((instance) => (
                  <li key={instance.codingId} className="rounded border border-slate-200 p-2.5 text-sm">
                    <p className="mb-1 text-[11px] font-medium text-slate-400">{instance.documentTitle}</p>
                    <p className="leading-relaxed text-slate-700">
                      {showContext && instance.contextBefore && (
                        <span className="text-slate-400">…{instance.contextBefore} </span>
                      )}
                      <span className="bg-amber-100">{instance.segment.text}</span>
                      {showContext && instance.contextAfter && (
                        <span className="text-slate-400"> {instance.contextAfter}…</span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {!code && (
          <p className="p-4 text-sm text-slate-400">
            This code was deleted while its info window was open.
          </p>
        )}
      </div>
    </div>
  )
}

export default CodeInfoModal
