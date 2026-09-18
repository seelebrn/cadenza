import { describe, expect, it } from 'vitest'
import { buildClusterTree } from './clusterTree'
import type { ClusterTreeNode } from './clusterTree'
import { filterNoteClusterTree, normalizeForFilter, noteMatchesQuery } from './noteFilter'
import type { CategoryRecord, NoteRecord } from '@shared/types'

function note(id: string, answer: string, overrides: Partial<NoteRecord> = {}): NoteRecord {
  return { id, question: null, answer, tags: [], noteCategoryId: null, attachedTo: { kind: 'project' }, createdAt: '0', updatedAt: '0', ...overrides }
}
function cluster(id: string, name: string, parentCategoryId: string | null, noteIds: string[] = []): CategoryRecord {
  return { id, kind: 'theme', name, color: '#000', definition: '', codeIds: [], noteIds, segmentIds: [], parentCategoryId, createdAt: id }
}
const names = (nodes: ClusterTreeNode[]): unknown[] =>
  nodes.map((n) => (n.children.length ? [n.name, names(n.children)] : n.name))

describe('noteMatchesQuery', () => {
  it('looks in the question, the answer and the tags, ignoring case and accents', () => {
    const n = note('n', 'La Réunion du lundi', { question: 'Pourquoi ?', tags: ['à creuser'] })
    for (const q of ['reunion', 'RÉUNION', 'pourquoi', 'a creuser', '']) expect(noteMatchesQuery(n, normalizeForFilter(q)), q).toBe(true)
    expect(noteMatchesQuery(n, normalizeForFilter('mardi'))).toBe(false)
  })
})

describe('filterNoteClusterTree', () => {
  // Travail
  //   Charge (n1 "fatigue", n2 "planning")
  //   Collectif (n3 "entraide")
  // Journal (n4 "planning revu")
  const tree = buildClusterTree([
    cluster('a', 'Travail', null),
    cluster('b', 'Charge', 'a', ['n1', 'n2']),
    cluster('c', 'Collectif', 'a', ['n3']),
    cluster('d', 'Journal', null, ['n4'])
  ])

  it('keeps everything with no query', () => {
    expect(filterNoteClusterTree(tree, new Set(), '')).toBe(tree)
  })

  it('keeps a cluster holding a matching note, and the clusters above it, with only the matching branches', () => {
    expect(names(filterNoteClusterTree(tree, new Set(['n2', 'n4']), 'planning'))).toEqual([['Travail', ['Charge']], 'Journal'])
    expect(names(filterNoteClusterTree(tree, new Set(['n3']), 'entraide'))).toEqual([['Travail', ['Collectif']]])
  })

  it('keeps a cluster whose name matches whole, sub-clusters included, even with no matching note', () => {
    expect(names(filterNoteClusterTree(tree, new Set(), 'travail'))).toEqual([['Travail', ['Charge', 'Collectif']]])
    expect(names(filterNoteClusterTree(tree, new Set(), 'collectif'))).toEqual([['Travail', ['Collectif']]])
  })

  it('drops everything when nothing matches', () => {
    expect(filterNoteClusterTree(tree, new Set(), 'zzz')).toEqual([])
  })
})
