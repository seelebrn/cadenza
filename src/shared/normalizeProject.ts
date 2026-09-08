import { nanoid } from 'nanoid'
import type { BoardCluster, BoardItem, BoardRecord, CategoryRecord, ProjectData } from './types'

/**
 * Defensively fills in fields added to the schema after a project was first
 * saved, so older .qdaproj files keep opening without a hard schema-version
 * bump for changes that are purely additive (a new optional field, a new
 * top-level list). Runtime data from JSON.parse can be missing fields the
 * ProjectData type claims always exist — that's exactly the gap this closes.
 */
const FALLBACK_CATEGORY_COLOR = '#64748b'

/** Ensures exactly one board is marked default: backfills the field on
 * boards saved before it existed, promotes the first board if none is
 * marked, or creates a fresh default board if there are none at all. */
function ensureDefaultBoard(boards: BoardRecord[]): BoardRecord[] {
  if (boards.length === 0) {
    return [{ id: nanoid(), name: 'Main board', isDefault: true }]
  }
  const withField = boards.map((b) => ({ ...b, isDefault: b.isDefault ?? false }))
  if (withField.some((b) => b.isDefault)) return withField
  return withField.map((b, i) => (i === 0 ? { ...b, isDefault: true } : b))
}

/** Pre-category-merge shape: a cluster had its own name/color, and
 * membership lived on each BoardItem's clusterId — there was no categoryId
 * at all. */
interface LegacyBoardCluster {
  id: string
  boardId: string
  name?: string
  color?: string
  categoryId?: string
  x: number
  y: number
  width: number
  height: number
  createdAt?: string
}

interface LegacyBoardItem extends BoardItem {
  clusterId?: string | null
}

/**
 * Migrates pre-merge clusters (their own name/color, membership via
 * BoardItem.clusterId) into the current model: a cluster is always a
 * CategoryRecord's spatial shape. Rather than silently dropping data that
 * doesn't fit the new shape — which earlier code in this project did, and
 * shouldn't have — this derives a real category from each legacy cluster's
 * name/color and whichever items pointed at it, so nothing is lost.
 * New-shape clusters (already have categoryId) pass through untouched.
 */
function migrateLegacyClusters(
  rawClusters: unknown[],
  rawItems: unknown[]
): { categories: CategoryRecord[]; boardClusters: BoardCluster[]; boardItems: BoardItem[] } {
  const clusters = rawClusters as LegacyBoardCluster[]
  const items = rawItems as LegacyBoardItem[]

  const migratedCategories: CategoryRecord[] = []
  const boardClusters: BoardCluster[] = []

  for (const cluster of clusters) {
    if (typeof cluster.categoryId === 'string') {
      boardClusters.push({
        id: cluster.id,
        boardId: cluster.boardId,
        categoryId: cluster.categoryId,
        x: cluster.x,
        y: cluster.y,
        width: cluster.width,
        height: cluster.height,
        createdAt: cluster.createdAt ?? new Date().toISOString()
      })
      continue
    }

    const members = items.filter((i) => i.clusterId === cluster.id)
    const category: CategoryRecord = {
      id: nanoid(),
      kind: 'theme',
      name: cluster.name ?? 'Migrated cluster',
      color: cluster.color ?? FALLBACK_CATEGORY_COLOR,
      definition: '',
      codeIds: members.filter((m) => m.refType === 'code').map((m) => m.refId),
      noteIds: members.filter((m) => m.refType === 'note').map((m) => m.refId),
      segmentIds: members.filter((m) => m.refType === 'segment').map((m) => m.refId),
      parentCategoryId: null,
      createdAt: cluster.createdAt ?? new Date().toISOString()
    }
    migratedCategories.push(category)
    boardClusters.push({
      id: cluster.id,
      boardId: cluster.boardId,
      categoryId: category.id,
      x: cluster.x,
      y: cluster.y,
      width: cluster.width,
      height: cluster.height,
      createdAt: cluster.createdAt ?? new Date().toISOString()
    })
  }

  const boardItems = items.map((item) => {
    const { clusterId: _clusterId, ...rest } = item
    return rest
  })

  return { categories: migratedCategories, boardClusters, boardItems }
}

export function normalizeProjectData(raw: ProjectData): ProjectData {
  const { categories: migratedCategories, boardClusters, boardItems } = migrateLegacyClusters(
    raw.boardClusters ?? [],
    raw.boardItems ?? []
  )

  return {
    ...raw,
    noteCategories: raw.noteCategories ?? [],
    notes: raw.notes.map((n) => (n.noteCategoryId === undefined ? { ...n, noteCategoryId: null } : n)),
    categories: [
      ...(raw.categories ?? []).map((c) => ({
        ...c,
        color: c.color ?? FALLBACK_CATEGORY_COLOR,
        parentCategoryId: c.parentCategoryId ?? null,
        definition: c.definition ?? ''
      })),
      ...migratedCategories
    ],
    boards: ensureDefaultBoard(raw.boards ?? []),
    boardItems,
    boardClusters,
    boardLinks: raw.boardLinks ?? []
  }
}
