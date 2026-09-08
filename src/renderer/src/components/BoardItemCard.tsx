import { useProjectStore } from '../store/projectStore'
import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import { describeBoardItem, MEMBER_CARD_HEIGHT, MEMBER_CARD_WIDTH } from '@shared/boardOps'
import type { BoardItem } from '@shared/types'

// Single source of truth for a card's rendered size lives in boardOps.ts —
// the cluster auto-layout there needs to know it too, to stack member
// cards without overlapping.
const CARD_WIDTH = MEMBER_CARD_WIDTH
const CARD_HEIGHT = MEMBER_CARD_HEIGHT

interface BoardItemCardProps {
  item: BoardItem
  boardId: string
  x: number
  y: number
  isDragging: boolean
  isSnapping: boolean
  /** realId is passed when a virtual item just materialized, since item.id
   * (a "virtual:..." marker) won't exist in boardItems yet. */
  onStartDrag: (e: React.MouseEvent, realId?: string) => void
}

function BoardItemCard({
  item,
  boardId,
  x,
  y,
  isDragging,
  isSnapping,
  onStartDrag
}: BoardItemCardProps): JSX.Element | null {
  const data = useProjectStore((s) => s.data)
  const removeItemFromBoard = useProjectStore((s) => s.removeItemFromBoard)
  const addItemToBoard = useProjectStore((s) => s.addItemToBoard)
  const setInspectedCodeId = useWorkspaceUiStore((s) => s.setInspectedCodeId)
  const setInspectedNoteId = useWorkspaceUiStore((s) => s.setInspectedNoteId)

  if (!data) return null
  const description = describeBoardItem(data, item)
  if (!description) return null

  const isVirtual = item.id.startsWith('virtual:')

  return (
    <div
      className={`group absolute cursor-move select-none rounded border bg-white p-2 text-xs shadow-sm transition-shadow ${
        isSnapping ? 'border-blue-400 ring-2 ring-blue-300' : 'border-slate-300'
      } ${isDragging ? 'shadow-md' : ''}`}
      style={{ left: x, top: y, width: CARD_WIDTH, minHeight: CARD_HEIGHT }}
      onMouseDown={(e) => {
        // A virtual (not-yet-persisted) item materializes into a real
        // BoardItem the moment it's touched, so the drag has something
        // real to move.
        if (isVirtual) {
          const realId = addItemToBoard(boardId, item.refType, item.refId, item.x, item.y)
          onStartDrag(e, realId ?? undefined)
        } else {
          onStartDrag(e)
        }
      }}
      // Right-click, not double-click: two cards sitting close together
      // (a common outcome of the auto-layout, or just a tightly-packed
      // cluster) make a double-click ambiguous with two independent single
      // clicks close together in time — since onMouseDown always starts a
      // drag-and-possibly-snap gesture (findSnapTarget has no minimum drag
      // distance), the first click of an attempted double-click can itself
      // register as a completed drag that lands within snap range of a
      // neighboring card and links the two, before the second click ever
      // arrives. Right-click never enters that mousedown/drag/snap path at
      // all, so it can't conflict with it.
      onContextMenu={(e) => {
        e.preventDefault()
        if (item.refType === 'code') setInspectedCodeId(item.refId)
        else if (item.refType === 'note') setInspectedNoteId(item.refId)
      }}
      // See ClusterFrame.tsx's identical guard — select-none (above) stops
      // a mousedown-on-text gesture from starting a native text-drag, and
      // this is the backstop in case a selection already existed.
      onDragStart={(e) => e.preventDefault()}
    >
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="flex items-center gap-1 truncate text-[10px] uppercase text-slate-400">
          {description.color && (
            <span
              className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: description.color }}
            />
          )}
          {description.sublabel}
        </span>
        <button
          className="hidden flex-shrink-0 text-slate-300 hover:text-red-500 group-hover:block"
          title="Remove from board"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => {
            if (!isVirtual) removeItemFromBoard(item.id)
          }}
        >
          ×
        </button>
      </div>
      <p className="line-clamp-3 text-slate-700">{description.label}</p>
    </div>
  )
}

export default BoardItemCard
