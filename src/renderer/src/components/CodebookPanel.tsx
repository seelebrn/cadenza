import { useEffect, useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import type { CategoryRecord, CodeNode, TagKind } from '@shared/types'

const PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899']

function nextColor(count: number): string {
  return PALETTE[count % PALETTE.length]
}

// Drag-and-drop in this panel carries two different kinds of payload (a
// code being reparented/assigned, or a cluster being nested) — both use
// the standard 'text/plain' slot for the dragged id (so existing drop
// targets that only know about codes keep working unchanged), plus this
// custom type as a discriminator so a drop target that accepts both (a
// cluster row) knows which action to take.
const DRAG_KIND_MIME = 'application/x-cadenza-kind'

interface TreeNode extends CodeNode {
  children: TreeNode[]
}

function buildTree(codes: CodeNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>(codes.map((c) => [c.id, { ...c, children: [] }]))
  const roots: TreeNode[] = []
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

interface ClusterTreeNode extends CategoryRecord {
  children: ClusterTreeNode[]
}

function buildClusterTree(clusters: CategoryRecord[]): ClusterTreeNode[] {
  const byId = new Map<string, ClusterTreeNode>(clusters.map((c) => [c.id, { ...c, children: [] }]))
  const roots: ClusterTreeNode[] = []
  for (const node of byId.values()) {
    const parent = node.parentCategoryId ? byId.get(node.parentCategoryId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

function CodebookPanel(): JSX.Element {
  const data = useProjectStore((s) => s.data)
  const addCode = useProjectStore((s) => s.addCode)
  const reparentCode = useProjectStore((s) => s.reparentCode)
  const applyCodeToSelection = useProjectStore((s) => s.applyCodeToSelection)
  const createCategory = useProjectStore((s) => s.createCategory)
  const addCodeToCategory = useProjectStore((s) => s.addCodeToCategory)
  const reparentCategory = useProjectStore((s) => s.reparentCategory)
  const fileSpanUnderCategory = useProjectStore((s) => s.fileSpanUnderCategory)
  const activeSpan = useWorkspaceUiStore((s) => s.activeSpan)
  const clearUi = useWorkspaceUiStore((s) => s.clear)
  const suggestedCodeName = useWorkspaceUiStore((s) => s.suggestedCodeName)
  const setSuggestedCodeName = useWorkspaceUiStore((s) => s.setSuggestedCodeName)

  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<TagKind | 'cluster'>('code')
  const [isRootDragOver, setIsRootDragOver] = useState(false)
  const [isClusterRootDragOver, setIsClusterRootDragOver] = useState(false)

  const codes = useMemo(() => data?.codes ?? [], [data])
  const tree = useMemo(() => buildTree(codes), [codes])
  const clusters = useMemo(() => data?.categories ?? [], [data])
  const clusterTree = useMemo(() => buildClusterTree(clusters), [clusters])

  // "Promote to code" (from the notes panel) drops a suggested name here.
  useEffect(() => {
    if (suggestedCodeName === null) return
    setNewName(suggestedCodeName)
    setSuggestedCodeName(null)
  }, [suggestedCodeName, setSuggestedCodeName])

  function handleCreate(): void {
    const name = newName.trim()
    if (!name) return
    if (newKind === 'cluster') {
      const clusterId = createCategory(name, 'theme', nextColor(codes.length + clusters.length))
      setNewName('')
      if (clusterId && activeSpan) {
        fileSpanUnderCategory(activeSpan.documentId, activeSpan.start, activeSpan.end, activeSpan.text, clusterId)
      }
      return
    }
    const codeId = addCode({ name, kind: newKind, color: nextColor(codes.length) })
    setNewName('')
    if (codeId && activeSpan) {
      applyCodeToSelection(activeSpan.documentId, activeSpan.start, activeSpan.end, activeSpan.text, codeId)
    }
  }

  function handleRootDrop(e: DragEvent): void {
    e.preventDefault()
    setIsRootDragOver(false)
    if (e.dataTransfer.getData(DRAG_KIND_MIME) === 'cluster') return
    const draggedId = e.dataTransfer.getData('text/plain')
    if (draggedId) reparentCode(draggedId, null)
  }

  function handleClusterRootDrop(e: DragEvent): void {
    e.preventDefault()
    setIsClusterRootDragOver(false)
    if (e.dataTransfer.getData(DRAG_KIND_MIME) !== 'cluster') return
    const draggedId = e.dataTransfer.getData('text/plain')
    if (draggedId) reparentCategory(draggedId, null)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {activeSpan && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="mb-1 font-medium">
            Apply as many codes/clusters as you like to the highlighted text below, then clear it:
          </p>
          <p className="italic">&ldquo;{activeSpan.text}&rdquo;</p>
          <button className="mt-1 text-amber-700 underline" onClick={clearUi}>
            Done — clear selection
          </button>
        </div>
      )}

      <div className="flex gap-2 border-b border-slate-200 p-3">
        <select
          className="rounded border border-slate-300 text-xs"
          value={newKind}
          onChange={(e) => setNewKind(e.target.value as TagKind | 'cluster')}
        >
          <option value="code">Code</option>
          <option value="cluster">Cluster</option>
        </select>
        <input
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          placeholder={`New ${newKind}…`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <button
          className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700"
          onClick={handleCreate}
        >
          Add
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <div
          className={`p-2 ${isRootDragOver ? 'bg-blue-50' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setIsRootDragOver(true)
          }}
          onDragLeave={() => setIsRootDragOver(false)}
          onDrop={handleRootDrop}
        >
          {tree.length === 0 && <p className="p-3 text-center text-sm text-slate-400">No codes yet.</p>}
          {tree.length > 0 && (
            <p className="mb-1 px-1 text-[10px] text-slate-400">
              Drag a row onto another to nest it, or here to un-nest — drag onto a cluster below to group it.
            </p>
          )}
          {tree.map((node) => (
            <CodeRow key={node.id} node={node} depth={0} allCodes={codes} />
          ))}
        </div>

        <div
          className={`border-t border-slate-200 p-2 ${isClusterRootDragOver ? 'bg-blue-50' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setIsClusterRootDragOver(true)
          }}
          onDragLeave={() => setIsClusterRootDragOver(false)}
          onDrop={handleClusterRootDrop}
        >
          <p className="mb-1 px-1 text-[10px] font-semibold uppercase text-slate-400">Clusters</p>
          {clusterTree.length === 0 ? (
            <p className="p-3 text-center text-sm text-slate-400">
              No clusters yet. The same clusters show up on the board, and vice versa.
            </p>
          ) : (
            <p className="mb-1 px-1 text-[10px] text-slate-400">
              Drag a cluster onto another to nest it, or here to un-nest.
            </p>
          )}
          {clusterTree.map((node) => (
            <ClusterRow key={node.id} node={node} depth={0} />
          ))}
        </div>
      </div>

      <InspectedCodings />
    </div>
  )
}

interface CodeRowProps {
  node: TreeNode
  depth: number
  allCodes: CodeNode[]
}

function CodeRow({ node, depth, allCodes }: CodeRowProps): JSX.Element {
  const renameCode = useProjectStore((s) => s.renameCode)
  const setCodeColor = useProjectStore((s) => s.setCodeColor)
  const setCodeDefinition = useProjectStore((s) => s.setCodeDefinition)
  const reparentCode = useProjectStore((s) => s.reparentCode)
  const deleteCode = useProjectStore((s) => s.deleteCode)
  const mergeCodes = useProjectStore((s) => s.mergeCodes)
  const applyCodeToSelection = useProjectStore((s) => s.applyCodeToSelection)
  const activeSpan = useWorkspaceUiStore((s) => s.activeSpan)

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(node.name)
  const [isEditingDefinition, setIsEditingDefinition] = useState(false)
  const [definitionDraft, setDefinitionDraft] = useState(node.definition)
  const [isDragOver, setIsDragOver] = useState(false)

  function commitRename(): void {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== node.name) renameCode(node.id, trimmed)
    setIsEditingName(false)
  }

  function commitDefinition(): void {
    if (definitionDraft !== node.definition) setCodeDefinition(node.id, definitionDraft)
    setIsEditingDefinition(false)
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    if (e.dataTransfer.getData(DRAG_KIND_MIME) === 'cluster') return
    const draggedId = e.dataTransfer.getData('text/plain')
    if (draggedId && draggedId !== node.id) reparentCode(draggedId, node.id)
  }

  const otherCodes = allCodes.filter((c) => c.id !== node.id)

  return (
    <div>
      <div
        className={`group rounded px-1.5 py-1 text-sm hover:bg-slate-50 ${
          isDragOver ? 'bg-blue-50 ring-1 ring-blue-300' : ''
        }`}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        <div
          className="flex items-center gap-1.5"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', node.id)
            e.dataTransfer.setData(DRAG_KIND_MIME, 'code')
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            type="color"
            className="h-4 w-4 flex-shrink-0 cursor-pointer border-0 bg-transparent p-0"
            value={node.color}
            onChange={(e) => setCodeColor(node.id, e.target.value)}
            title="Change color"
          />
          <span className="rounded bg-slate-100 px-1 text-[10px] uppercase text-slate-500">
            {node.kind}
          </span>

          {isEditingName ? (
            <input
              autoFocus
              className="flex-1 rounded border border-slate-300 px-1 text-xs"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => e.key === 'Enter' && commitRename()}
            />
          ) : (
            <button
              className="flex-1 truncate text-left"
              onDoubleClick={() => {
                setNameDraft(node.name)
                setIsEditingName(true)
              }}
              title="Double-click to rename"
            >
              {node.name}
            </button>
          )}

          <div className="hidden flex-shrink-0 gap-1 group-hover:flex">
            {activeSpan && (
              <button
                className="rounded border border-slate-300 px-1 text-[10px] hover:bg-slate-100"
                title="Apply to the active span"
                onClick={() =>
                  applyCodeToSelection(activeSpan.documentId, activeSpan.start, activeSpan.end, activeSpan.text, node.id)
                }
              >
                Apply
              </button>
            )}
            <button
              className="rounded border border-slate-300 px-1 text-[10px] hover:bg-slate-100"
              title="Edit definition"
              onClick={() => {
                setDefinitionDraft(node.definition)
                setIsEditingDefinition((v) => !v)
              }}
            >
              Def
            </button>
            {otherCodes.length > 0 && (
              <select
                className="rounded border border-slate-300 text-[10px]"
                defaultValue=""
                title="Merge into…"
                onChange={(e) => {
                  if (e.target.value) mergeCodes(node.id, e.target.value)
                }}
              >
                <option value="" disabled>
                  Merge into…
                </option>
                {otherCodes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <button
              className="rounded border border-red-200 px-1 text-[10px] text-red-600 hover:bg-red-50"
              onClick={() => {
                if (window.confirm(`Delete "${node.name}"? Codings using it will be removed.`)) {
                  deleteCode(node.id)
                }
              }}
            >
              Delete
            </button>
          </div>
        </div>

        {isEditingDefinition && (
          <textarea
            autoFocus
            className="mt-1 w-full rounded border border-slate-300 p-1 text-xs"
            rows={2}
            placeholder="Definition…"
            value={definitionDraft}
            onChange={(e) => setDefinitionDraft(e.target.value)}
            onBlur={commitDefinition}
          />
        )}
      </div>
      {node.children.map((child) => (
        <CodeRow key={child.id} node={child} depth={depth + 1} allCodes={allCodes} />
      ))}
    </div>
  )
}

interface ClusterRowProps {
  node: ClusterTreeNode
  depth: number
}

/** A cluster, shown alongside codes in the same tab so grouping never
 * requires leaving this panel. This is the same CategoryRecord the board
 * draws as a cluster frame — adding a code here (drag a code row onto this
 * one) or nesting a cluster here (drag one cluster row onto another) is
 * exactly what dragging on the board does, just from a list instead of a
 * canvas, so the two stay in sync automatically rather than needing to be
 * kept in sync. */
function ClusterRow({ node, depth }: ClusterRowProps): JSX.Element {
  const data = useProjectStore((s) => s.data)
  const renameCategory = useProjectStore((s) => s.renameCategory)
  const setCategoryColor = useProjectStore((s) => s.setCategoryColor)
  const deleteCategory = useProjectStore((s) => s.deleteCategory)
  const addCodeToCategory = useProjectStore((s) => s.addCodeToCategory)
  const removeCodeFromCategory = useProjectStore((s) => s.removeCodeFromCategory)
  const reparentCategory = useProjectStore((s) => s.reparentCategory)

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(node.name)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const memberCodes = useMemo(
    () =>
      node.codeIds
        .map((id) => data?.codes.find((c) => c.id === id))
        .filter((c): c is CodeNode => Boolean(c)),
    [data, node.codeIds]
  )
  const otherMemberCount = node.noteIds.length + node.segmentIds.length

  function commitRename(): void {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== node.name) renameCategory(node.id, trimmed)
    setIsEditingName(false)
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const kind = e.dataTransfer.getData(DRAG_KIND_MIME)
    const draggedId = e.dataTransfer.getData('text/plain')
    if (!draggedId) return
    if (kind === 'cluster') {
      if (draggedId !== node.id) reparentCategory(draggedId, node.id)
    } else {
      addCodeToCategory(node.id, draggedId)
    }
  }

  return (
    <div>
      <div
        className={`group rounded px-1.5 py-1 text-sm hover:bg-slate-50 ${
          isDragOver ? 'bg-blue-50 ring-1 ring-blue-300' : ''
        }`}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        <div
          className="flex items-center gap-1.5"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', node.id)
            e.dataTransfer.setData(DRAG_KIND_MIME, 'cluster')
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            type="color"
            className="h-4 w-4 flex-shrink-0 cursor-pointer border-0 bg-transparent p-0"
            value={node.color}
            onChange={(e) => setCategoryColor(node.id, e.target.value)}
            title="Change color"
          />
          <span className="rounded bg-slate-100 px-1 text-[10px] uppercase text-slate-500">
            {node.kind === 'question' ? '❓' : 'cluster'}
          </span>

          {isEditingName ? (
            <input
              autoFocus
              className="flex-1 rounded border border-slate-300 px-1 text-xs"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => e.key === 'Enter' && commitRename()}
            />
          ) : (
            <button
              className="flex-1 truncate text-left"
              onDoubleClick={() => {
                setNameDraft(node.name)
                setIsEditingName(true)
              }}
              title="Double-click to rename"
            >
              {node.name}
            </button>
          )}

          <button
            className="flex-shrink-0 text-[10px] text-slate-400 hover:text-slate-600"
            onClick={() => setIsExpanded((v) => !v)}
          >
            {memberCodes.length}
            {otherMemberCount > 0 ? `+${otherMemberCount}` : ''}
          </button>

          <div className="hidden flex-shrink-0 gap-1 group-hover:flex">
            <button
              className="rounded border border-red-200 px-1 text-[10px] text-red-600 hover:bg-red-50"
              onClick={() => {
                if (window.confirm(`Delete "${node.name}"?`)) deleteCategory(node.id)
              }}
            >
              Delete
            </button>
          </div>
        </div>

        {isExpanded && (
          <ul className="mt-1 space-y-0.5 pl-5 text-xs">
            {memberCodes.length === 0 && otherMemberCount === 0 && (
              <li className="text-slate-400">Nothing filed here yet — drag a code onto this row.</li>
            )}
            {memberCodes.map((code) => (
              <li key={code.id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 truncate">
                  <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: code.color }} />
                  {code.name}
                </span>
                <button
                  className="flex-shrink-0 text-red-500 hover:underline"
                  onClick={() => removeCodeFromCategory(node.id, code.id)}
                >
                  Remove
                </button>
              </li>
            ))}
            {otherMemberCount > 0 && (
              <li className="text-slate-400">
                +{otherMemberCount} note{otherMemberCount === 1 ? '' : 's'}/quote{otherMemberCount === 1 ? '' : 's'} —
                manage in Analysis &gt; Clusters
              </li>
            )}
          </ul>
        )}
      </div>
      {node.children.map((child) => (
        <ClusterRow key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

/** Shows the codings on the active span, if it happens to already have any
 * — reactively derived from live data (not a frozen snapshot), so applying
 * a new code or removing one updates this list immediately without
 * needing to re-click the passage. */
function InspectedCodings(): JSX.Element | null {
  const data = useProjectStore((s) => s.data)
  const removeCoding = useProjectStore((s) => s.removeCoding)
  const activeSpan = useWorkspaceUiStore((s) => s.activeSpan)

  const items = useMemo(() => {
    if (!data || !activeSpan) return []
    const segment = data.segments.find(
      (s) =>
        s.documentId === activeSpan.documentId && s.start === activeSpan.start && s.end === activeSpan.end
    )
    if (!segment) return []
    return data.codings
      .filter((c) => c.segmentId === segment.id)
      .map((coding) => ({ coding, code: data.codes.find((c) => c.id === coding.codeId) }))
  }, [data, activeSpan])

  if (items.length === 0) return null

  return (
    <div className="max-h-56 overflow-auto border-t border-slate-200 bg-slate-50 p-3">
      <h3 className="mb-1 text-xs font-semibold text-slate-600">Already on this passage</h3>
      <ul className="space-y-1">
        {items.map(({ coding, code }) => (
          <li key={coding.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 truncate">
              <span
                className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: code?.color ?? '#999' }}
              />
              {code?.name ?? '(deleted code)'}
            </span>
            <button className="flex-shrink-0 text-red-500 hover:underline" onClick={() => removeCoding(coding.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default CodebookPanel
