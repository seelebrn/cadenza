/** Layout constants shared between BoardView (which clamps a live cluster
 * resize during its own mousemove handler) and ClusterFrame (which clamps
 * the same resize for its live-preview size while the drag is in
 * progress) — kept in one place so the two can never drift apart. Not in
 * boardOps.ts because, unlike the auto-layout algorithm there, this is a
 * UI-only floor on manual resizing, not something the pure layout logic
 * needs to know about. */
export const MIN_CLUSTER_WIDTH = 140
export const MIN_CLUSTER_HEIGHT = 100
