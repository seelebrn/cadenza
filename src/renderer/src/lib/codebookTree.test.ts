import { describe, expect, it } from 'vitest'
import { buildTree, filterClusterTree, filterTreeByQuery, findTreeNode, pruneClaimed, treeHasMatch } from './codebookTree'
import { buildClusterTree } from './clusterTree'
import type { CategoryRecord, CodeNode } from '@shared/types'

function makeCode(id: string, name: string, parentId: string | null = null): CodeNode {
  return { id, kind: 'code', name, color: '#fff', definition: '', parentId, createdAt: '0' }
}
function makeCategory(id: string, name: string, opts: Partial<CategoryRecord> = {}): CategoryRecord {
  return {
    id,
    kind: 'theme',
    name,
    color: '#fff',
    definition: '',
    codeIds: opts.codeIds ?? [],
    noteIds: [],
    segmentIds: [],
    parentCategoryId: opts.parentCategoryId ?? null,
    createdAt: '0'
  }
}

describe('buildTree', () => {
  it('nests children under their parentId, parent-before-child', () => {
    const codes = [makeCode('A', 'Emotions'), makeCode('B', 'Fear', 'A')]
    const tree = buildTree(codes)
    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe('A')
    expect(tree[0].children).toHaveLength(1)
    expect(tree[0].children[0].id).toBe('B')
  })

  it('multiple root codes with no relation to each other', () => {
    const tree = buildTree([makeCode('A', 'A'), makeCode('B', 'B')])
    expect(tree.map((n) => n.id).sort()).toEqual(['A', 'B'])
  })
})

describe('findTreeNode', () => {
  it('finds a node at any depth', () => {
    const tree = buildTree([makeCode('A', 'A'), makeCode('B', 'B', 'A'), makeCode('C', 'C', 'B')])
    expect(findTreeNode(tree, 'C')?.id).toBe('C')
  })

  it('returns null when not found', () => {
    const tree = buildTree([makeCode('A', 'A')])
    expect(findTreeNode(tree, 'nonexistent')).toBeNull()
  })
})

describe('pruneClaimed', () => {
  it('removes a claimed code from the top level and from within its ancestor\'s children', () => {
    const tree = buildTree([makeCode('A', 'A'), makeCode('B', 'B', 'A')])
    const pruned = pruneClaimed(tree, new Set(['B']))
    expect(pruned[0].children).toEqual([])
  })

  it('removes a claimed ROOT code entirely, not just from a parent\'s children list', () => {
    const tree = buildTree([makeCode('A', 'A'), makeCode('B', 'B')])
    const pruned = pruneClaimed(tree, new Set(['A']))
    expect(pruned.map((n) => n.id)).toEqual(['B'])
  })

  it('an empty claimed set is a no-op on structure (still a new array, but same content)', () => {
    const tree = buildTree([makeCode('A', 'A')])
    expect(pruneClaimed(tree, new Set())).toEqual(tree)
  })
})

describe('filterTreeByQuery / treeHasMatch — the ambiguous case: a code that is both a subcode of another code AND a cluster member', () => {
  // A (root, unclaimed) -> B (child, claimed by a cluster). This is the
  // exact scenario the unified tree has to resolve: B must render once,
  // under whichever "home" (its code parent, or its cluster) actually
  // owns it for THIS view, never duplicated or silently dropped.
  const codeA = makeCode('A', 'Emotions')
  const codeB = makeCode('B', 'Fear', 'A')
  const codeC = makeCode('C', 'Weather') // unrelated

  it('treeHasMatch finds a match anywhere in the subtree', () => {
    const tree = buildTree([codeA, codeB])
    expect(treeHasMatch(tree[0], 'fear')).toBe(true)
    expect(treeHasMatch(tree[0], 'emotions')).toBe(true)
    expect(treeHasMatch(tree[0], 'nonexistent')).toBe(false)
  })

  it('a deep match keeps the whole ancestor chain, not just the leaf', () => {
    const grandchild = makeCode('C2', 'Anxiety', 'B')
    const tree = buildTree([codeA, codeB, grandchild])
    const filtered = filterTreeByQuery(tree, 'anxiety')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('A')
    expect(filtered[0].children[0].id).toBe('B')
    expect(filtered[0].children[0].children[0].id).toBe('C2')
  })

  it('a node matching by its OWN name keeps its whole subtree unfiltered — the exact same object reference', () => {
    const tree = buildTree([codeA, codeB, codeC])
    const filtered = filterTreeByQuery(tree, 'emotions')
    expect(filtered).toHaveLength(1)
    expect(filtered[0]).toBe(tree.find((n) => n.id === 'A')) // same reference: not re-filtered
    expect(filtered[0].children[0].id).toBe('B')
  })

  it('empty query is a no-op returning the same array reference', () => {
    const tree = buildTree([codeA])
    expect(filterTreeByQuery(tree, '')).toBe(tree)
  })

  it('no match anywhere returns an empty result', () => {
    const tree = buildTree([codeA, codeB])
    expect(filterTreeByQuery(tree, 'nonexistent')).toEqual([])
  })

  it('claimed-then-filtered: pruning claimed codes first, then filtering by query, resolves the ambiguous case correctly', () => {
    // B is claimed by a cluster: pruneClaimed removes it from under A.
    const fullTree = buildTree([codeA, codeB])
    const claimed = new Set(['B'])
    const visibleRoots = pruneClaimed(fullTree, claimed)
    expect(visibleRoots[0].children).toEqual([]) // B no longer shows under A

    // But B is still reachable via the FULL (unpruned) tree, for whichever
    // cluster claims it to pull in its own subtree.
    expect(findTreeNode(fullTree, 'B')?.id).toBe('B')
  })
})

describe('filterClusterTree', () => {
  const fullCodeTree = buildTree([makeCode('code1', 'Interruptions'), makeCode('code2', 'Silence')])

  it('keeps a cluster whose own name matches', () => {
    const clusters = [makeCategory('Y', 'Turn-taking dynamics'), makeCategory('Z', 'Something else')]
    const tree = buildClusterTree(clusters)
    const filtered = filterClusterTree(tree, fullCodeTree, 'turn-taking')
    expect(filtered.map((c) => c.id)).toEqual(['Y'])
  })

  it('keeps a cluster whose member code matches, even if its own name does not', () => {
    const clusters = [makeCategory('X', 'Unrelated cluster name', { codeIds: ['code1'] })]
    const tree = buildClusterTree(clusters)
    const filtered = filterClusterTree(tree, fullCodeTree, 'interrup')
    expect(filtered.map((c) => c.id)).toEqual(['X'])
  })

  it('a nested sub-cluster matching keeps the whole ancestor chain', () => {
    const grandchild = makeCategory('C', 'Deep match')
    const child = { ...makeCategory('B', 'Middle'), children: [] }
    const root = makeCategory('A', 'Top')
    const clusters = [root, child, grandchild]
    // Wire up parentCategoryId manually to match buildClusterTree's expectations.
    const withParents = [root, { ...child, parentCategoryId: 'A' }, { ...grandchild, parentCategoryId: 'B' }]
    const tree = buildClusterTree(withParents)
    const filtered = filterClusterTree(tree, fullCodeTree, 'deep match')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('A')
    expect(filtered[0].children[0].id).toBe('B')
    expect(filtered[0].children[0].children[0].id).toBe('C')
  })

  it('a cluster matching by NAME keeps its whole sub-cluster subtree unfiltered, even an unrelated grandchild', () => {
    const unrelatedGrandchild = makeCategory('F', 'Nothing to do with it')
    const child = makeCategory('E', 'Also unrelated', { parentCategoryId: 'D' })
    const matchingRoot = makeCategory('D', 'Findme')
    const tree = buildClusterTree([matchingRoot, child, { ...unrelatedGrandchild, parentCategoryId: 'E' }])
    const filtered = filterClusterTree(tree, fullCodeTree, 'findme')
    expect(filtered[0]).toBe(tree[0]) // exact same reference, not re-filtered
    expect(filtered[0].children[0].children[0].id).toBe('F')
  })

  it('a cluster matching only via a member code does NOT cascade "show everything" to its own sub-clusters', () => {
    const nonMatchingSubcluster = makeCategory('H', 'Totally unrelated sub-cluster', { parentCategoryId: 'G' })
    const memberMatchParent = makeCategory('G', 'Container', { codeIds: ['code1'] })
    const tree = buildClusterTree([memberMatchParent, nonMatchingSubcluster])
    const filtered = filterClusterTree(tree, fullCodeTree, 'interrup')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('G')
    expect(filtered[0].children).toEqual([]) // the unrelated sub-cluster is filtered out
  })

  it('empty query is a no-op', () => {
    const clusters = [makeCategory('A', 'A')]
    const tree = buildClusterTree(clusters)
    expect(filterClusterTree(tree, fullCodeTree, '')).toBe(tree)
  })
})
