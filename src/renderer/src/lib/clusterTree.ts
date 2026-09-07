// Shared by the Workspace's "Codes & items" tab and "Notes" tab, both of
// which render clusters as rows inside their own tree (alongside codes or
// notes respectively) rather than as a separate list — see CodebookPanel
// and NotesPanel. Kept in one place so the two trees can never define this
// shape or these drag-payload conventions differently.

import type { CategoryRecord } from '@shared/types'

export interface ClusterTreeNode extends CategoryRecord {
  children: ClusterTreeNode[]
}

/** Builds the cluster nesting tree (CategoryRecord.parentCategoryId is the
 * same nesting shape as CodeNode.parentId). */
export function buildClusterTree(clusters: CategoryRecord[]): ClusterTreeNode[] {
  const byId = new Map<string, ClusterTreeNode>(clusters.map((c) => [c.id, { ...c, children: [] }]))
  const roots: ClusterTreeNode[] = []
  for (const node of byId.values()) {
    const parent = node.parentCategoryId ? byId.get(node.parentCategoryId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

// Drag-and-drop in these trees carries a few different payloads (a code or
// note being reparented/assigned, or a cluster being nested) — all use the
// standard 'text/plain' slot for the dragged id (so a plain drop target
// that only knows about one kind keeps working unchanged), plus this
// custom type as a discriminator so a target that accepts more than one
// kind (a cluster row) knows which action to take. A dragged code/note
// also carries which cluster (if any) it's currently shown under, so
// dropping it elsewhere can cleanly move it out of that one cluster rather
// than leaving it double-homed.
export const DRAG_KIND_MIME = 'application/x-cadenza-kind'
export const SOURCE_CLUSTER_MIME = 'application/x-cadenza-source-cluster'
