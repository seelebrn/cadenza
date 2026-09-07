import { useEffect, useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import { buildClusterTree, DRAG_KIND_MIME, SOURCE_CLUSTER_MIME } from '../lib/clusterTree'
import type { ClusterTreeNode } from '../lib/clusterTree'
import { buildTree, filterClusterTree, filterTreeByQuery, findTreeNode, pruneClaimed } from '../lib/codebookTree'
import type { TreeNode } from '../lib/codebookTree'
import type { CodeNode, TagKind } from '@shared/types'

const PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899']

function nextColor(count: number): string {
  return PALETTE[count % PALETTE.length]
}

type MergedRootNode =
  | { kind: 'code'; id: string; createdAt: string; node: TreeNode }
  | { kind: 'cluster'; id: string; createdAt: string; node: ClusterTreeNode }

function CodebookPanel(): JSX.Element {
  const data = useProjectStore((s) => s.data)
  const addCode = useProjectStore((s) => s.addCode)
  const reparentCode = useProjectStore((s) => s.reparentCode)
  const applyCodeToSelection = useProjectStore((s) => s.applyCodeToSelection)
  const createCategory = useProjectStore((s) => s.createCategory)
  // Nesting/un-nesting from this tree has no board-drag position to derive
  // a placement from (unlike doing it on the board itself), so it also
  // resets the default board's cluster layout to recompute fresh —
  // otherwise a cluster that's already been touched once on the board
  // stays frozen wherever it was, ignoring this change entirely.
  const reparentCategory = useProjectStore((s) => s.reparentCategoryAndReflowBoard)
  // Removing a code from a cluster (the root drop zone's "outside" case)
  // has no board-drag position to shrink the cluster from — reflows the
  // default board so the destination visibly shrinks back down.
  const removeCodeFromCategory = useProjectStore((s) => s.removeCodeFromCategoryAndReflowBoard)
  const fileSpanUnderCategory = useProjectStore((s) => s.fileSpanUnderCategory)
  const withBatch = useProjectStore((s) => s.withBatch)
  const activeSpan = useWorkspaceUiStore((s) => s.activeSpan)
  const clearUi = useWorkspaceUiStore((s) => s.clear)
  const suggestedCodeName = useWorkspaceUiStore((s) => s.suggestedCodeName)
  const setSuggestedCodeName = useWorkspaceUiStore((s) => s.setSuggestedCodeName)

  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<TagKind | 'cluster'>('code')
  const [isRootDragOver, setIsRootDragOver] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const codes = useMemo(() => data?.codes ?? [], [data])
  const clusters = useMemo(() => data?.categories ?? [], [data])
  const normalizedQuery = searchQuery.trim().toLowerCase()

  // The full natural code hierarchy, kept around (unpruned) as a lookup
  // table for cluster rows to pull a member's own subtree from — a code
  // nested under another code doesn't lose that nesting just because it's
  // also filed under a cluster.
  const fullCodeTree = useMemo(() => buildTree(codes), [codes])
  const claimedCodeIds = useMemo(() => new Set(clusters.flatMap((c) => c.codeIds)), [clusters])
  const visibleCodeRoots = useMemo(() => {
    const pruned = pruneClaimed(fullCodeTree, claimedCodeIds)
    return filterTreeByQuery(pruned, normalizedQuery)
  }, [fullCodeTree, claimedCodeIds, normalizedQuery])
  const clusterTree = useMemo(() => {
    const tree = buildClusterTree(clusters)
    return filterClusterTree(tree, fullCodeTree, normalizedQuery)
  }, [clusters, fullCodeTree, normalizedQuery])

  // One combined, chronologically-ordered tree: clusters and un-clustered
  // root codes as siblings, exactly like the user asked for — a cluster is
  // just another kind of row in the same tree, not a separate section.
  const mergedRoots = useMemo<MergedRootNode[]>(() => {
    const entries: MergedRootNode[] = [
      ...visibleCodeRoots.map((n) => ({ kind: 'code' as const, id: n.id, createdAt: n.createdAt, node: n })),
      ...clusterTree.map((n) => ({ kind: 'cluster' as const, id: n.id, createdAt: n.createdAt, node: n }))
    ]
    return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [visibleCodeRoots, clusterTree])

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
      withBatch(() => {
        const clusterId = createCategory(name, 'theme', nextColor(codes.length + clusters.length))
        if (clusterId && activeSpan) {
          fileSpanUnderCategory(activeSpan.documentId, activeSpan.start, activeSpan.end, activeSpan.text, clusterId)
        }
      })
      setNewName('')
      return
    }
    withBatch(() => {
      const codeId = addCode({ name, kind: newKind, color: nextColor(codes.length) })
      if (codeId && activeSpan) {
        applyCodeToSelection(activeSpan.documentId, activeSpan.start, activeSpan.end, activeSpan.text, codeId)
      }
    })
    setNewName('')
  }

  function handleRootDrop(e: DragEvent): void {
    e.preventDefault()
    setIsRootDragOver(false)
    const kind = e.dataTransfer.getData(DRAG_KIND_MIME)
    const draggedId = e.dataTransfer.getData('text/plain')
    if (!draggedId) return
    if (kind === 'cluster') {
      reparentCategory(draggedId, null)
      return
    }
    // A code dropped at the root: if it was shown under a cluster, "outside"
    // means leaving that cluster (its own code-hierarchy position, if any,
    // is untouched and it'll reappear there). Otherwise this is the
    // existing un-nest-from-parent-code gesture.
    const sourceClusterId = e.dataTransfer.getData(SOURCE_CLUSTER_MIME)
    if (sourceClusterId) removeCodeFromCategory(sourceClusterId, draggedId)
    else reparentCode(draggedId, null)
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

      <div className="border-b border-slate-200 p-2">
        <input
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
          placeholder="Filter codes/clusters…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div
        className={`flex-1 overflow-auto p-2 ${isRootDragOver ? 'bg-blue-50' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setIsRootDragOver(true)
        }}
        onDragLeave={() => setIsRootDragOver(false)}
        onDrop={handleRootDrop}
      >
        {mergedRoots.length === 0 && (
          <p className="p-3 text-center text-sm text-slate-400">
            {normalizedQuery ? 'Nothing matches that filter.' : 'No codes or clusters yet.'}
          </p>
        )}
        {mergedRoots.length > 0 && !normalizedQuery && (
          <p className="mb-1 px-1 text-[10px] text-slate-400">
            Drag a code onto a cluster to group it, or onto another code to nest it — drop here to move it back
            out. Clusters made here show up on the board, and vice versa.
          </p>
        )}
        {mergedRoots.map((entry) =>
          entry.kind === 'code' ? (
            <CodeRow key={entry.id} node={entry.node} depth={0} allCodes={codes} />
          ) : (
            <ClusterRow
              key={entry.id}
              node={entry.node}
              depth={0}
              codes={codes}
              fullCodeTree={fullCodeTree}
              claimedCodeIds={claimedCodeIds}
              searchQuery={normalizedQuery}
            />
          )
        )}
      </div>

      <InspectedCodings />
    </div>
  )
}

interface CodeRowProps {
  node: TreeNode
  depth: number
  allCodes: CodeNode[]
  /** Set when this row is rendered as a cluster's member rather than at the
   * plain root — lets a drop target elsewhere know which cluster to remove
   * it from, so a code has one home in the tree at a time. */
  sourceClusterId?: string
}

function CodeRow({ node, depth, allCodes, sourceClusterId }: CodeRowProps): JSX.Element {
  const renameCode = useProjectStore((s) => s.renameCode)
  const setCodeColor = useProjectStore((s) => s.setCodeColor)
  const setCodeDefinition = useProjectStore((s) => s.setCodeDefinition)
  const reparentCode = useProjectStore((s) => s.reparentCode)
  const deleteCode = useProjectStore((s) => s.deleteCode)
  const mergeCodes = useProjectStore((s) => s.mergeCodes)
  const removeCodeFromCategory = useProjectStore((s) => s.removeCodeFromCategoryAndReflowBoard)
  const applyCodeToSelection = useProjectStore((s) => s.applyCodeToSelection)
  const withBatch = useProjectStore((s) => s.withBatch)
  const activeSpan = useWorkspaceUiStore((s) => s.activeSpan)
  const setInspectedCodeId = useWorkspaceUiStore((s) => s.setInspectedCodeId)

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
    if (!draggedId || draggedId === node.id) return
    withBatch(() => {
      reparentCode(draggedId, node.id)
      // Nesting a code under another code is a different tree slot than
      // "inside a cluster" — leave the cluster it came from, if any, so it
      // now shows only in the position just dropped onto.
      const draggedSourceClusterId = e.dataTransfer.getData(SOURCE_CLUSTER_MIME)
      if (draggedSourceClusterId) removeCodeFromCategory(draggedSourceClusterId, draggedId)
    })
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
            e.dataTransfer.setData(SOURCE_CLUSTER_MIME, sourceClusterId ?? '')
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
              onDoubleClick={() => setInspectedCodeId(node.id)}
              title="Double-click for usage info"
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
              title="Rename"
              onClick={() => {
                setNameDraft(node.name)
                setIsEditingName(true)
              }}
            >
              ✎
            </button>
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
            {sourceClusterId && (
              <button
                className="rounded border border-slate-300 px-1 text-[10px] hover:bg-slate-100"
                title="Remove from this cluster"
                onClick={() => removeCodeFromCategory(sourceClusterId, node.id)}
              >
                Unfile
              </button>
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
        <CodeRow key={child.id} node={child} depth={depth + 1} allCodes={allCodes} sourceClusterId={sourceClusterId} />
      ))}
    </div>
  )
}

interface ClusterRowProps {
  node: ClusterTreeNode
  depth: number
  codes: CodeNode[]
  fullCodeTree: TreeNode[]
  claimedCodeIds: Set<string>
  /** Pre-lowercased filter text from the panel's search box — empty means
   * no filter. This row itself is only rendered at all when it (or
   * something inside it) already matched (see filterClusterTree), so this
   * just narrows which of ITS OWN member codes show. */
  searchQuery: string
}

/** A cluster, shown as just another row in the same tree as codes — this
 * is the same CategoryRecord the board draws as a cluster frame, so
 * dragging a code onto this row (addCodeToCategory) or nesting one cluster
 * onto another (reparentCategory) is exactly what dragging on the board
 * does, just from a list instead of a canvas. Same data either way, so the
 * two are never out of sync — there's nothing separate to keep in sync. */
function ClusterRow({ node, depth, codes, fullCodeTree, claimedCodeIds, searchQuery }: ClusterRowProps): JSX.Element {
  const renameCategory = useProjectStore((s) => s.renameCategory)
  const setCategoryColor = useProjectStore((s) => s.setCategoryColor)
  const deleteCategory = useProjectStore((s) => s.deleteCategory)
  // Joining/leaving a cluster from this tree has no board-drag position to
  // size/place it from — reflows the default board so the destination
  // visibly grows/shrinks to fit, instead of leaving a frame frozen at
  // whatever size it happened to already be.
  const addCodeToCategory = useProjectStore((s) => s.addCodeToCategoryAndReflowBoard)
  const removeCodeFromCategory = useProjectStore((s) => s.removeCodeFromCategoryAndReflowBoard)
  const reparentCategory = useProjectStore((s) => s.reparentCategoryAndReflowBoard)
  const withBatch = useProjectStore((s) => s.withBatch)

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(node.name)
  const [isDragOver, setIsDragOver] = useState(false)

  // If this cluster's own name is what matched the search, show
  // everything under it unfiltered (same "found the neighborhood" logic
  // filterClusterTree uses) — only narrow member codes/sub-clusters by the
  // query when this row is showing at all *because* something inside it
  // matched, not because it matched itself.
  const selfMatches = searchQuery !== '' && node.name.toLowerCase().includes(searchQuery)
  const effectiveChildQuery = selfMatches ? '' : searchQuery

  // Each member code renders here with its own natural subtree intact
  // (children pruned of anything claimed by a cluster elsewhere), so
  // nesting codes under codes keeps working the same way inside a cluster
  // as it does at the root. A search query additionally prunes down to
  // just the members (or their sub-codes) that actually match.
  const memberCodeNodes = useMemo(() => {
    const seen = new Set<string>()
    const out: TreeNode[] = []
    for (const id of node.codeIds) {
      if (seen.has(id)) continue
      seen.add(id)
      const found = findTreeNode(fullCodeTree, id)
      if (found) out.push({ ...found, children: pruneClaimed(found.children, claimedCodeIds) })
    }
    return filterTreeByQuery(out, effectiveChildQuery)
  }, [node.codeIds, fullCodeTree, claimedCodeIds, effectiveChildQuery])
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
      return
    }
    withBatch(() => {
      addCodeToCategory(node.id, draggedId)
      const sourceClusterId = e.dataTransfer.getData(SOURCE_CLUSTER_MIME)
      if (sourceClusterId && sourceClusterId !== node.id) {
        removeCodeFromCategory(sourceClusterId, draggedId)
      }
    })
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
              className="flex-1 truncate text-left font-medium"
              onDoubleClick={() => {
                setNameDraft(node.name)
                setIsEditingName(true)
              }}
              title="Double-click to rename"
            >
              {node.name}
            </button>
          )}

          {otherMemberCount > 0 && (
            <span className="flex-shrink-0 text-[10px] text-slate-400" title="Notes/quotes filed here — manage in Analysis > Clusters">
              +{otherMemberCount}
            </span>
          )}

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

        {memberCodeNodes.length === 0 && node.children.length === 0 && (
          <p className="mt-0.5 pl-5 text-[11px] text-slate-400">Drag a code onto this row to file it here.</p>
        )}
      </div>
      {node.children.map((child) => (
        <ClusterRow
          key={child.id}
          node={child}
          depth={depth + 1}
          codes={codes}
          fullCodeTree={fullCodeTree}
          claimedCodeIds={claimedCodeIds}
          searchQuery={effectiveChildQuery}
        />
      ))}
      {memberCodeNodes.map((code) => (
        <CodeRow key={code.id} node={code} depth={depth + 1} allCodes={codes} sourceClusterId={node.id} />
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
