/** Layout constants shared between BoardView (which clamps a live cluster
 * resize during its own mousemove handler) and ClusterFrame (which clamps
 * the same resize for its live-preview size while the drag is in
 * progress) — kept in one place so the two can never drift apart. Not in
 * boardOps.ts because, unlike the auto-layout algorithm there, this is a
 * UI-only floor on manual resizing, not something the pure layout logic
 * needs to know about. */
export const MIN_CLUSTER_WIDTH = 140
export const MIN_CLUSTER_HEIGHT = 100

/** Below this zoom, board cards are drawn as plain colored blocks (their
 * text is unreadable anyway) — see BoardItemCard's `simplified`. */
export const SIMPLIFIED_CARD_ZOOM = 0.5
/** Below this zoom, the board shows large on-screen names for its top two
 * levels of clusters instead of the regular headers, which would be too
 * small to read and would pile on each other. */
export const OVERVIEW_LABEL_ZOOM = 0.35
/** Below this zoom the board becomes a map: cards inside clusters are not
 * drawn at all (even as blocks they are only noise this far out), clusters
 * are filled with their color, card-to-card links are hidden, and the
 * cluster names say what each one holds. Cards outside any cluster still
 * show, as blocks. */
export const MAP_ZOOM = 0.15
