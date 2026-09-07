// Pure tree-building and search-filtering logic for the Workspace codebook
// tab's unified code+cluster tree (CodebookPanel.tsx). Extracted out of that
// component so it's directly testable — this is exactly the kind of
// recursive indexing/filtering logic that's easy to get subtly wrong (see
// codebookTree.test.ts for the ambiguous cases this had to get right: a
// code that's both a subcode of another code AND a cluster member, and a
// search match that should keep its whole subtree instead of re-filtering
// within an already-matched branch).

import type { ClusterTreeNode } from './clusterTree'
import type { CodeNode } from '@shared/types'

export interface TreeNode extends CodeNode {
  children: TreeNode[]
}

/** The complete, natural code hierarchy (parentId-based), independent of
 * cluster membership — used both for the top-level tree and as a lookup
 * table so a cluster can pull in a member code's own subtree wherever
 * that member is filed under a cluster instead. */
export function buildTree(codes: CodeNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>(codes.map((c) => [c.id, { ...c, children: [] }]))
  const roots: TreeNode[] = []
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

export function findTreeNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findTreeNode(node.children, id)
    if (found) return found
  }
  return null
}

/** Removes any code that's a member of some cluster from a tree — at any
 * depth — since a clustered code is shown once, under its cluster,
 * instead of also at its plain hierarchy position. */
export function pruneClaimed(nodes: TreeNode[], claimed: Set<string>): TreeNode[] {
  return nodes.filter((n) => !claimed.has(n.id)).map((n) => ({ ...n, children: pruneClaimed(n.children, claimed) }))
}

/** True if this node's own name matches, or any descendant's does —
 * `query` is expected pre-lowercased by the caller (avoids re-lowercasing
 * on every recursive call). */
export function treeHasMatch(node: TreeNode, query: string): boolean {
  if (node.name.toLowerCase().includes(query)) return true
  return node.children.some((child) => treeHasMatch(child, query))
}

/** Keeps a node if it matches, or any descendant does — pruning collapses
 * a large tree down to just the paths leading to a hit, same idea as
 * pruneClaimed above but driven by the search box instead of cluster
 * membership. A node that matches *itself* keeps its whole subtree as-is,
 * unfiltered — finding "Emotions" should surface everything nested under
 * it, not just whichever sub-codes happen to also contain the search text.
 * An empty query is a no-op (returns `nodes` as-is). */
export function filterTreeByQuery(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) return nodes
  const result: TreeNode[] = []
  for (const node of nodes) {
    if (node.name.toLowerCase().includes(query)) {
      result.push(node)
      continue
    }
    const filteredChildren = filterTreeByQuery(node.children, query)
    if (filteredChildren.length > 0) result.push({ ...node, children: filteredChildren })
  }
  return result
}

/** Same idea as filterTreeByQuery, for the cluster tree — a cluster is
 * kept if its own name matches (in which case its whole sub-cluster
 * subtree is kept unfiltered too, same reasoning as above), one of its
 * direct member codes' subtree matches (via fullCodeTree, the unpruned
 * lookup), or a nested sub-cluster (recursively) matches. */
export function filterClusterTree(nodes: ClusterTreeNode[], fullCodeTree: TreeNode[], query: string): ClusterTreeNode[] {
  if (!query) return nodes
  const result: ClusterTreeNode[] = []
  for (const node of nodes) {
    if (node.name.toLowerCase().includes(query)) {
      result.push(node)
      continue
    }
    const hasMatchingMember = node.codeIds.some((id) => {
      const found = findTreeNode(fullCodeTree, id)
      return found ? treeHasMatch(found, query) : false
    })
    const filteredChildren = filterClusterTree(node.children, fullCodeTree, query)
    if (hasMatchingMember || filteredChildren.length > 0) {
      result.push({ ...node, children: filteredChildren })
    }
  }
  return result
}
