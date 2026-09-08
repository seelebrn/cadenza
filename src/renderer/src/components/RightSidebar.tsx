import { useEffect, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import CodebookPanel from './CodebookPanel'
import NotesPanel from './NotesPanel'

function RightSidebar(): JSX.Element {
  const activeTab = useWorkspaceUiStore((s) => s.activeSidebarTab)
  const setActiveTab = useWorkspaceUiStore((s) => s.setActiveSidebarTab)
  const sidebarWidth = useWorkspaceUiStore((s) => s.sidebarWidth)
  const setSidebarWidth = useWorkspaceUiStore((s) => s.setSidebarWidth)
  const isDocked = useWorkspaceUiStore((s) => s.sidebarDocked)
  const setDocked = useWorkspaceUiStore((s) => s.setSidebarDocked)
  const floatPosition = useWorkspaceUiStore((s) => s.sidebarFloatPosition)
  const setFloatPosition = useWorkspaceUiStore((s) => s.setSidebarFloatPosition)
  const floatSize = useWorkspaceUiStore((s) => s.sidebarFloatSize)
  const setFloatSize = useWorkspaceUiStore((s) => s.setSidebarFloatSize)

  const [widthDragStartX, setWidthDragStartX] = useState<number | null>(null)
  const [moveDrag, setMoveDrag] = useState<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(
    null
  )
  const [resizeDrag, setResizeDrag] = useState<{ mouseX: number; mouseY: number; startWidth: number; startHeight: number } | null>(
    null
  )

  // Docked-width resize (unchanged from before undocking existed).
  useEffect(() => {
    if (widthDragStartX === null) return
    const widthAtDragStart = sidebarWidth

    function handleMouseMove(e: MouseEvent): void {
      // Dragging left (cursor moves toward negative x relative to the
      // start) grows the sidebar, since it sits at the window's right edge.
      setSidebarWidth(widthAtDragStart + (widthDragStartX! - e.clientX))
    }
    function handleMouseUp(): void {
      setWidthDragStartX(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    // widthAtDragStart is captured once per drag gesture on purpose — it
    // must not update as sidebarWidth itself changes during the drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widthDragStartX])

  // Floating-panel move (drag the title bar).
  useEffect(() => {
    if (!moveDrag) return
    function handleMouseMove(e: MouseEvent): void {
      setFloatPosition({ x: moveDrag!.startX + (e.clientX - moveDrag!.mouseX), y: moveDrag!.startY + (e.clientY - moveDrag!.mouseY) })
    }
    function handleMouseUp(): void {
      setMoveDrag(null)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    // moveDrag's start values are captured once per drag gesture on
    // purpose, same reasoning as widthAtDragStart above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveDrag])

  // Floating-panel resize (drag the corner handle).
  useEffect(() => {
    if (!resizeDrag) return
    function handleMouseMove(e: MouseEvent): void {
      setFloatSize({
        width: resizeDrag!.startWidth + (e.clientX - resizeDrag!.mouseX),
        height: resizeDrag!.startHeight + (e.clientY - resizeDrag!.mouseY)
      })
    }
    function handleMouseUp(): void {
      setResizeDrag(null)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizeDrag])

  const tabButtons = (
    <>
      <button
        className={`flex-1 px-2 py-2 text-sm font-medium ${
          activeTab === 'codes' ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-400 hover:text-slate-600'
        }`}
        onClick={() => setActiveTab('codes')}
      >
        Codes &amp; items
      </button>
      <button
        className={`flex-1 px-2 py-2 text-sm font-medium ${
          activeTab === 'notes' ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-400 hover:text-slate-600'
        }`}
        onClick={() => setActiveTab('notes')}
      >
        Notes
      </button>
    </>
  )

  const panelBody = (
    <>
      {activeTab === 'codes' && <CodebookPanel />}
      {activeTab === 'notes' && <NotesPanel />}
    </>
  )

  if (!isDocked) {
    return (
      <div
        className="fixed z-40 flex flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl"
        style={{ left: floatPosition.x, top: floatPosition.y, width: floatSize.width, height: floatSize.height }}
      >
        <div
          className="flex flex-shrink-0 cursor-move select-none items-center justify-between border-b border-slate-200 bg-slate-100 px-2 py-1"
          title="Drag to move"
          onMouseDown={(e) => {
            if (e.button !== 0) return
            setMoveDrag({ mouseX: e.clientX, mouseY: e.clientY, startX: floatPosition.x, startY: floatPosition.y })
          }}
          // See BoardItemCard.tsx/ClusterFrame.tsx's identical guard — a
          // mousedown-then-move gesture starting on plain text can be
          // interpreted as a native "drag this selected text" instead of
          // (or racing) this drag, leaving the move uncommitted.
          onDragStart={(e) => e.preventDefault()}
        >
          <span className="truncate text-xs font-semibold text-slate-500">Codebook &amp; Notes</span>
          <button
            className="flex-shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setDocked(true)}
            title="Dock back into the sidebar"
          >
            Dock
          </button>
        </div>
        <FileUnderClusterBar />
        <div className="flex border-b border-slate-200">{tabButtons}</div>
        <div className="flex flex-1 flex-col overflow-hidden">{panelBody}</div>
        <div
          className="absolute bottom-0 right-0 h-3.5 w-3.5 cursor-nwse-resize"
          title="Drag to resize"
          onMouseDown={(e) => {
            if (e.button !== 0) return
            e.stopPropagation()
            setResizeDrag({ mouseX: e.clientX, mouseY: e.clientY, startWidth: floatSize.width, startHeight: floatSize.height })
          }}
        >
          <svg viewBox="0 0 10 10" className="h-full w-full text-slate-400">
            <path d="M9 1 1 9M9 5 5 9M9 9 9 9" stroke="currentColor" strokeWidth="1" fill="none" />
          </svg>
        </div>
      </div>
    )
  }

  return (
    <aside
      className="relative flex flex-shrink-0 flex-col border-l border-slate-200 bg-white"
      style={{ width: sidebarWidth }}
    >
      <div
        className="absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-blue-300"
        title="Drag to resize"
        onMouseDown={(e) => setWidthDragStartX(e.clientX)}
      />

      <FileUnderClusterBar />

      <div className="flex items-center border-b border-slate-200">
        {tabButtons}
        <button
          className="flex-shrink-0 px-2 text-xs font-medium text-slate-400 hover:text-slate-600"
          onClick={() => setDocked(false)}
          title="Undock into a floating, resizable panel"
        >
          Undock
        </button>
      </div>

      {panelBody}
    </aside>
  )
}

/** Files the active span as a raw quote under a cluster — usable regardless
 * of whether it's been coded/memoed, and regardless of which sidebar tab is
 * open, since it's about the span, not the tab. */
function FileUnderClusterBar(): JSX.Element | null {
  const data = useProjectStore((s) => s.data)
  const fileSpanUnderCategory = useProjectStore((s) => s.fileSpanUnderCategory)
  const activeSpan = useWorkspaceUiStore((s) => s.activeSpan)
  const [categoryId, setCategoryId] = useState('')

  const clusters = data?.categories ?? []
  if (!activeSpan || clusters.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
      <span className="flex-shrink-0 text-slate-500">File under:</span>
      <select
        className="min-w-0 flex-1 rounded border border-slate-300 px-1 py-0.5"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
      >
        <option value="" disabled>
          Choose cluster…
        </option>
        {clusters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.kind === 'question' ? '❓ ' : '🏷 '}
            {c.name}
          </option>
        ))}
      </select>
      <button
        className="flex-shrink-0 rounded bg-slate-900 px-2 py-0.5 text-white disabled:opacity-40"
        disabled={!categoryId}
        onClick={() => {
          fileSpanUnderCategory(activeSpan.documentId, activeSpan.start, activeSpan.end, activeSpan.text, categoryId)
          setCategoryId('')
        }}
      >
        File
      </button>
    </div>
  )
}

export default RightSidebar
