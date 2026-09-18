import type { NoteRecord } from '@shared/types'
import type { ClusterTreeNode } from './clusterTree'

/** Lowercased and without accents, so "reunion" finds "réunion" — the same
 * leniency as Analysis > Search. */
export function normalizeForFilter(text: string): string {
  return text.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase()
}

/** Whether a note's question, answer or one of its tags contains `query`
 * (already normalized; an empty query matches everything). */
export function noteMatchesQuery(note: NoteRecord, query: string): boolean {
  if (!query) return true
  return [note.question ?? '', note.answer, ...note.tags].some((text) => normalizeForFilter(text).includes(query))
}

/** Whether a cluster's own name contains `query` (already normalized). */
export function clusterNameMatches(node: ClusterTreeNode, query: string): boolean {
  return query !== '' && normalizeForFilter(node.name).includes(query)
}

/**
 * The Notes tab's cluster tree narrowed to `query`, same rules as the
 * codebook's filter: a cluster whose name matches is kept whole (its notes
 * are then shown unfiltered — see NoteClusterRow); otherwise it's kept only
 * if one of its notes matches (`matchingNoteIds`) or one of its
 * sub-clusters is kept, with just those sub-clusters.
 */
export function filterNoteClusterTree(
  nodes: ClusterTreeNode[],
  matchingNoteIds: Set<string>,
  query: string
): ClusterTreeNode[] {
  if (!query) return nodes
  const result: ClusterTreeNode[] = []
  for (const node of nodes) {
    if (clusterNameMatches(node, query)) {
      result.push(node)
      continue
    }
    const children = filterNoteClusterTree(node.children, matchingNoteIds, query)
    if (children.length > 0 || node.noteIds.some((id) => matchingNoteIds.has(id))) {
      result.push({ ...node, children })
    }
  }
  return result
}
