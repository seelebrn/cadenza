// Pure operations for the visual grouping board: freeform canvases holding
// BoardItems (referencing a code, note, or segment, at an x/y position) that
// can be dragged into BoardClusters — visual frames a cluster's members can
// later be "promoted" out of into a durable CategoryRecord (theme or AQA
// question). This is the general-purpose regrouping tool for coding-based
// methods and non-coding methods alike (serves Reflexive TA's organic
// clustering in particular).

import { nanoid } from 'nanoid'
import {
  addCodeToCategory,
  addNoteToCategory,
  addSegmentToCategory,
  createCategory
} from './categoryOps'
import type { BoardCluster, BoardItem, BoardRecord, CategoryKind, ProjectData } from './types'

export interface BoardItemDescription {
  label: string
  sublabel: string
  color: string | null
}

/** Pure display helper: resolves a board item's ref to what a card should
 * show. Returns null if the ref no longer exists (e.g. its code was
 * deleted) — the caller should skip rendering that item. */
export function describeBoardItem(data: ProjectData, item: BoardItem): BoardItemDescription | null {
  if (item.refType === 'code') {
    const code = data.codes.find((c) => c.id === item.refId)
    if (!code) return null
    return { label: code.name, sublabel: code.kind, color: code.color }
  }
  if (item.refType === 'note') {
    const note = data.notes.find((n) => n.id === item.refId)
    if (!note) return null
    const category = data.noteCategories.find((c) => c.id === note.noteCategoryId)
    return {
      label: note.question || note.answer.slice(0, 60) || '(empty note)',
      sublabel: 'note',
      color: category?.color ?? null
    }
  }
  const segment = data.segments.find((s) => s.id === item.refId)
  if (!segment) return null
  return { label: segment.text.slice(0, 60), sublabel: 'quote', color: null }
}

/** Which cluster (if any) contains a point — used when a dragged item is
 * dropped, to decide its new clusterId. Prefers the smallest containing
 * rect if several overlap, so a small frame nested inside a bigger one wins. */
export function findClusterAtPoint(clusters: BoardCluster[], px: number, py: number): BoardCluster | null {
  let best: BoardCluster | null = null
  let bestArea = Infinity
  for (const c of clusters) {
    if (px >= c.x && px <= c.x + c.width && py >= c.y && py <= c.y + c.height) {
      const area = c.width * c.height
      if (area < bestArea) {
        best = c
        bestArea = area
      }
    }
  }
  return best
}

export function createBoard(data: ProjectData, name: string): { data: ProjectData; boardId: string } {
  const board: BoardRecord = { id: nanoid(), name }
  return { data: { ...data, boards: [...data.boards, board] }, boardId: board.id }
}

export function renameBoard(data: ProjectData, boardId: string, name: string): ProjectData {
  return { ...data, boards: data.boards.map((b) => (b.id === boardId ? { ...b, name } : b)) }
}

/** Deletes a board and everything on it (items + clusters) — other boards untouched. */
export function deleteBoard(data: ProjectData, boardId: string): ProjectData {
  return {
    ...data,
    boards: data.boards.filter((b) => b.id !== boardId),
    boardItems: data.boardItems.filter((i) => i.boardId !== boardId),
    boardClusters: data.boardClusters.filter((c) => c.boardId !== boardId)
  }
}

/** Adds a code/note/segment to a board at a position, or no-ops (returning
 * the existing item's id) if that ref is already on this board. */
export function addItemToBoard(
  data: ProjectData,
  boardId: string,
  refType: BoardItem['refType'],
  refId: string,
  x: number,
  y: number
): { data: ProjectData; itemId: string } {
  const existing = data.boardItems.find(
    (i) => i.boardId === boardId && i.refType === refType && i.refId === refId
  )
  if (existing) return { data, itemId: existing.id }

  const item: BoardItem = { id: nanoid(), boardId, refType, refId, x, y, clusterId: null }
  return { data: { ...data, boardItems: [...data.boardItems, item] }, itemId: item.id }
}

export function moveItem(
  data: ProjectData,
  itemId: string,
  x: number,
  y: number,
  clusterId: string | null
): ProjectData {
  return {
    ...data,
    boardItems: data.boardItems.map((i) => (i.id === itemId ? { ...i, x, y, clusterId } : i))
  }
}

export function removeItemFromBoard(data: ProjectData, itemId: string): ProjectData {
  return { ...data, boardItems: data.boardItems.filter((i) => i.id !== itemId) }
}

export function createCluster(
  data: ProjectData,
  input: {
    boardId: string
    name: string
    color: string
    x: number
    y: number
    width: number
    height: number
  }
): { data: ProjectData; clusterId: string } {
  const cluster: BoardCluster = {
    id: nanoid(),
    boardId: input.boardId,
    name: input.name,
    color: input.color,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    createdAt: new Date().toISOString()
  }
  return { data: { ...data, boardClusters: [...data.boardClusters, cluster] }, clusterId: cluster.id }
}

export function renameCluster(data: ProjectData, clusterId: string, name: string): ProjectData {
  return {
    ...data,
    boardClusters: data.boardClusters.map((c) => (c.id === clusterId ? { ...c, name } : c))
  }
}

export function setClusterColor(data: ProjectData, clusterId: string, color: string): ProjectData {
  return {
    ...data,
    boardClusters: data.boardClusters.map((c) => (c.id === clusterId ? { ...c, color } : c))
  }
}

export function moveCluster(data: ProjectData, clusterId: string, x: number, y: number): ProjectData {
  return {
    ...data,
    boardClusters: data.boardClusters.map((c) => (c.id === clusterId ? { ...c, x, y } : c))
  }
}

export function resizeCluster(
  data: ProjectData,
  clusterId: string,
  width: number,
  height: number
): ProjectData {
  return {
    ...data,
    boardClusters: data.boardClusters.map((c) => (c.id === clusterId ? { ...c, width, height } : c))
  }
}

/** Deletes a cluster, un-clustering (not deleting) its member items. */
export function deleteCluster(data: ProjectData, clusterId: string): ProjectData {
  return {
    ...data,
    boardClusters: data.boardClusters.filter((c) => c.id !== clusterId),
    boardItems: data.boardItems.map((i) => (i.clusterId === clusterId ? { ...i, clusterId: null } : i))
  }
}

/** Turns a cluster's current members into a durable CategoryRecord — the
 * "make this spatial grouping formal" step. Returns null if the cluster
 * doesn't exist or has no members. */
export function promoteClusterToCategory(
  data: ProjectData,
  clusterId: string,
  kind: CategoryKind,
  color: string
): { data: ProjectData; categoryId: string } | null {
  const cluster = data.boardClusters.find((c) => c.id === clusterId)
  if (!cluster) return null
  const members = data.boardItems.filter((i) => i.clusterId === clusterId)
  if (members.length === 0) return null

  let result = createCategory(data, { name: cluster.name, kind, color })
  for (const member of members) {
    if (member.refType === 'code') result.data = addCodeToCategory(result.data, result.categoryId, member.refId)
    else if (member.refType === 'note') result.data = addNoteToCategory(result.data, result.categoryId, member.refId)
    else result.data = addSegmentToCategory(result.data, result.categoryId, member.refId)
  }
  return result
}
