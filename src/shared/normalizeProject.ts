import type { ProjectData } from './types'

/**
 * Defensively fills in fields added to the schema after a project was first
 * saved, so older .qdaproj files keep opening without a hard schema-version
 * bump for changes that are purely additive (a new optional field, a new
 * top-level list). Runtime data from JSON.parse can be missing fields the
 * ProjectData type claims always exist — that's exactly the gap this closes.
 */
export function normalizeProjectData(raw: ProjectData): ProjectData {
  return {
    ...raw,
    noteCategories: raw.noteCategories ?? [],
    notes: raw.notes.map((n) => (n.noteCategoryId === undefined ? { ...n, noteCategoryId: null } : n))
  }
}
