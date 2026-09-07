import { useEffect, useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import type { CodeNode, TagKind } from '@shared/types'

const PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899']

function nextColor(count: number): string {
  return PALETTE[count % PALETTE.length]
}

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

function CodebookPanel(): JSX.Element {
  const data = useProjectStore((s) => s.data)
  const addCode = useProjectStore((s) => s.addCode)
  const reparentCode = useProjectStore((s) => s.reparentCode)
  const applyCodeToSelection = useProjectStore((s) => s.applyCodeToSelection)
  const pendingSelection = useWorkspaceUiStore((s) => s.pendingSelection)
  const clearUi = useWorkspaceUiStore((s) => s.clear)
  const suggestedCodeName = useWorkspaceUiStore((s) => s.suggestedCodeName)
  const setSuggestedCodeName = useWorkspaceUiStore((s) => s.setSuggestedCodeName)

  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<TagKind>('code')
  const [isRootDragOver, setIsRootDragOver] = useState(false)

  const codes = useMemo(() => data?.codes ?? [], [data])
  const tree = useMemo(() => buildTree(codes), [codes])

  // "Promote to code" (from the notes panel) drops a suggested name here.
  useEffect(() => {
    if (suggestedCodeName === null) return
    setNewName(suggestedCodeName)
    setSuggestedCodeName(null)
  }, [suggestedCodeName, setSuggestedCodeName])

  function handleCreate(): void {
    const name = newName.trim()
    if (!name) return
    const codeId = addCode({ name, kind: newKind, color: nextColor(codes.length) })
    setNewName('')
    if (codeId && pendingSelection) {
      applyCodeToSelection(
        pendingSelection.documentId,
        pendingSelection.start,
        pendingSelection.end,
        pendingSelection.text,
        codeId
      )
    }
  }

  function handleRootDrop(e: DragEvent): void {
    e.preventDefault()
    setIsRootDragOver(false)
    const draggedId = e.dataTransfer.getData('text/plain')
    if (draggedId) reparentCode(draggedId, null)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {pendingSelection && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="mb-1 font-medium">
            Apply as many codes/items as you like to the highlighted text below, then clear it:
          </p>
          <p className="italic">&ldquo;{pendingSelection.text}&rdquo;</p>
          <button className="mt-1 text-amber-700 underline" onClick={clearUi}>
            Done — clear selection
          </button>
        </div>
      )}

      <div className="flex gap-2 border-b border-slate-200 p-3">
        <select
          className="rounded border border-slate-300 text-xs"
          value={newKind}
          onChange={(e) => setNewKind(e.target.value as TagKind)}
        >
          <option value="code">Code</option>
          <option value="item">Item</option>
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

      <div
        className={`flex-1 overflow-auto p-2 ${isRootDragOver ? 'bg-blue-50' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setIsRootDragOver(true)
        }}
        onDragLeave={() => setIsRootDragOver(false)}
        onDrop={handleRootDrop}
      >
        {tree.length === 0 && <p className="p-3 text-center text-sm text-slate-400">No codes yet.</p>}
        {tree.length > 0 && (
          <p className="mb-1 px-1 text-[10px] text-slate-400">Drag a row here to un-nest it.</p>
        )}
        {tree.map((node) => (
          <CodeRow key={node.id} node={node} depth={0} allCodes={codes} />
        ))}
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
  const pendingSelection = useWorkspaceUiStore((s) => s.pendingSelection)

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
          onDragStart={(e) => e.dataTransfer.setData('text/plain', node.id)}
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
            {pendingSelection && (
              <button
                className="rounded border border-slate-300 px-1 text-[10px] hover:bg-slate-100"
                title="Apply to selected text"
                onClick={() =>
                  applyCodeToSelection(
                    pendingSelection.documentId,
                    pendingSelection.start,
                    pendingSelection.end,
                    pendingSelection.text,
                    node.id
                  )
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

function InspectedCodings(): JSX.Element | null {
  const data = useProjectStore((s) => s.data)
  const removeCoding = useProjectStore((s) => s.removeCoding)
  const inspectedCodingIds = useWorkspaceUiStore((s) => s.inspectedCodingIds)
  const clearUi = useWorkspaceUiStore((s) => s.clear)

  const items = useMemo(() => {
    if (!data) return []
    return inspectedCodingIds
      .map((id) => data.codings.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map((coding) => ({
        coding,
        code: data.codes.find((c) => c.id === coding.codeId),
        segment: data.segments.find((s) => s.id === coding.segmentId)
      }))
  }, [data, inspectedCodingIds])

  if (items.length === 0) return null

  return (
    <div className="max-h-56 overflow-auto border-t border-slate-200 bg-slate-50 p-3">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-600">On this passage</h3>
        <button className="text-xs text-slate-400 hover:text-slate-600" onClick={clearUi}>
          Close
        </button>
      </div>
      {items[0].segment && (
        <p className="mb-2 text-xs italic text-slate-500">&ldquo;{items[0].segment.text}&rdquo;</p>
      )}
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
