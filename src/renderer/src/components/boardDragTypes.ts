/** Drag-gesture state, owned and driven entirely by BoardView (which runs
 * the actual mousemove/mouseup lifecycle), but also read by the card/frame
 * components it renders so each can compute its own live position/size
 * during a drag. Kept in its own module — rather than defined in BoardView
 * and imported back out of it — so extracting those components into their
 * own files doesn't require a component to import a type from the file
 * that imports it. */

export interface Position {
  x: number
  y: number
}

export type DragState =
  | {
      kind: 'item'
      /** The card actually grabbed — used for snap-target lookup and as the
       * "other side" of a new link. */
      id: string
      /** Every item that moves rigidly together with it (itself plus every
       * item transitively linked to it, unless shift overrides that). */
      groupItemIds: string[]
      startMouseX: number
      startMouseY: number
      startPositions: Record<string, Position>
    }
  | {
      kind: 'cluster-move'
      id: string
      categoryId: string
      /** Shift+drag detaches from the parent cluster instead of evaluating
       * a new one, and doesn't drag descendants' membership assumptions. */
      shiftKey: boolean
      startWidth: number
      startHeight: number
      /** This cluster plus every descendant cluster present on this board —
       * the rigid group of frames that moves together. */
      groupClusterIds: string[]
      clusterStartPositions: Record<string, Position>
      /** Every item belonging to this category or any descendant category. */
      memberItemIds: string[]
      memberStartPositions: Record<string, Position>
      startMouseX: number
      startMouseY: number
      startX: number
      startY: number
    }
  | {
      kind: 'cluster-resize'
      id: string
      /** Needed to exclude this cluster's own category (and its existing
       * descendants) when checking which other clusters the growing box
       * now encloses — see findClustersEnclosedBy. */
      categoryId: string
      startMouseX: number
      startMouseY: number
      startWidth: number
      startHeight: number
    }
