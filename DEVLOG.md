# Cadenza — Development Log

The full, narrated history of Cadenza's development: what was reported or asked,
why each change happened, how bugs were root-caused, and how fixes were verified.
One dated entry per round of work, oldest first.

See `README.md` for the current feature overview and `CHANGELOG.md` for a short,
per-release summary of what actually shipped in each version.

### Methodology alignment (2026-09-07)

Target methods: Kaufmann's comprehensive interview analysis, IPA, Reflexive Thematic Analysis,
and AQA. At this point none ran end-to-end: Phase 5 (retrieval, real Category CRUD) closes the
two most foundational shared gaps; cross-case comparison (Phase 7) matters a lot for IPA/RTA
specifically; export/write-up (Phase 8) matters for all four eventually.

### Board/Workspace unification (2026-09-07)

The board and the Categories view used to be two separate grouping mechanisms (a
`BoardCluster` with its own copied membership, "promoted" once into a `CategoryRecord`) that
could drift out of sync. They're now the same data: a cluster is a category's spatial shape
on a given board, with no separate membership or promotion step — see `boardOps.ts` and
`categoryOps.ts`. Categories can also nest (`parentCategoryId`, mirroring `CodeNode.parentId`),
surfaced on the board as dragging one cluster into another. Every code and note is visible
on the one default board automatically; other boards stay opt-in/curated, with bulk
"add all codes/notes/clusters" actions for quickly populating one.

### Terminology + clusters inside the codebook tab (2026-09-07)

User-facing text says "cluster" everywhere this concept appears (Board, Analysis,
Workspace), rather than mixing "category"/"cluster"/"theme". The underlying type stays
`CategoryRecord`/`categoryOps.ts` internally — renaming it would have collided with the
already-distinct `BoardCluster` (a category's per-board position, not the category itself).

Cluster creation/management lives in the Workspace's existing "Codes & items" tab, not a
separate tab, and not even a separate section within it: clusters render as rows in the
*same* tree as codes, not beside it. The "New" form's second option creates a cluster
instead of a code; a cluster row sits as a sibling of root codes; and a code filed under a
cluster (drag it onto the cluster row) renders as that cluster's child, with its own
sub-codes nested beneath it exactly as they would at the root — a code has one place in the
tree at a time, cluster membership or plain code-hierarchy position, and dragging it
anywhere (another cluster, another code, back out to the root) moves it cleanly out of
wherever it was. Clusters can nest into each other the same way. Since this tree reads and
writes the exact same `data.categories`/`data.codes` the board does, there's no separate
sync step — dragging in this tree *is* dragging on the board, just via a list instead of a
canvas, and a change from either place is visible in the other immediately because it's one
underlying record, not two views kept in agreement by a mechanism that could fall out of
sync. Analysis still has its own Clusters tab for full membership management (notes,
quotes, AQA question/theme kind) — same `ClustersView` component, same data. (The separate
`NoteCategoryDef` concept — Note Descriptive/Linguistique/Conceptuelle classification tags
— intentionally keeps the word "category": a genuinely different thing, a flat per-note tag,
not a grouping cluster.)

The Notes tab got the same treatment: clusters render as rows in the same tree as notes
there too, with drag-and-drop to file a note under a cluster or pull it back out, and its
own compact "+ New cluster" control. Add Code and Add Note stay separate creation forms —
their fields don't overlap enough to earn a merged form — but the cluster tree itself is
shared code (`renderer/src/lib/clusterTree.ts`), so the Codes tab, the Notes tab, the
board, and Analysis are five views on one `data.categories`, never five copies.

Fixed: a cluster created anywhere other than the board itself (the Workspace codebook
tree, Analysis > Clusters) never showed up on any board, including the default one.
Cause — a `BoardCluster` is a category's spatial *shape* on a given board, and nothing
ever created one automatically; codes and notes get this for free via
`getVisibleBoardItems`'s virtual fallback, but clusters had no equivalent. Added
`getVisibleBoardClusters`, the cluster counterpart: on the default board, every category
now shows as a cluster frame whether or not it has a stored shape yet, materializing into
a real `BoardCluster` only once actually touched (moved, resized, or dropped into) — same
pattern as items, including the same "virtual id has nothing to update" failure mode it
had to avoid for moving/resizing/assigning members to a still-virtual cluster.

Fixed: dragging a cluster frame on the board stopped carrying its member items along.
Cause — a member that had only ever appeared as a "virtual" (not-yet-persisted) fallback
card, e.g. because it was added to the cluster from the codebook tab rather than physically
dragged into the frame, has no real `BoardItem` for `moveItem` to update, so the move
silently no-op'd and the item snapped back to its grid fallback position afterward. Fixed by
materializing every member into a real `BoardItem` the moment a cluster-drag starts, the
same way a lone card already materializes on its own mousedown.

Fixed: nesting a cluster into a superordinate one could make the nested cluster's own
title bar, resize handle, and delete button unreachable. Cause — cluster frames paint in
plain array order with no z-index, so whichever cluster happened to come later in
`data.categories` rendered on top; if the superordinate one was created *after* the one
nested into it, its larger frame painted over the nested cluster's controls entirely.
Added `getCategoryDepth` (categoryOps.ts) and sort board clusters by depth before
rendering — ancestors first, so a cluster's own frame always paints after, and on top of,
everything it's nested inside, independent of creation order.

### Default-board auto-layout rewrite (2026-09-07)

Two requirements: on first opening the board for a new project, auto-placed (non-nested)
clusters shouldn't overlap each other by accident, and a code/note that's a cluster member
should render *inside* its cluster's box, not scattered in the separate flat item grid. The
old layout put every category and every code/note through two completely independent
fixed-size grids sharing the same origin, with no relationship between a cluster's box and
its own members' positions — clusters could only avoid overlapping *each other* by
coincidence of matching a fixed cell size, and a clustered item's auto position had nothing
to do with where its cluster was drawn.

Rewrote both `getVisibleBoardClusters` and `getVisibleBoardItems` (boardOps.ts) to compute
clusters first, then items relative to them: root clusters stack in a single column, each
sized by `computeClusterSize` to actually fit its own member count before the next one is
placed below it — this guarantees no two auto-placed root clusters overlap regardless of
size, unlike a fixed grid cell. Nested clusters get a second column, offset clear of the
root one (true visual containment inside the literal parent frame wasn't attempted — only
the paint-order fix above matters for those). A clustered code/note now stacks inside its
resolved cluster box instead of the flat grid; anything with no cluster still uses the flat
grid, shifted below the whole cluster layout so the two regions can't collide. A ref
deliberately in more than one cluster (multi-membership) homes in the first one, since a
board item has exactly one position unlike the Workspace tree.

Extracted `MEMBER_CARD_WIDTH`/`MEMBER_CARD_HEIGHT` into boardOps.ts (BoardView.tsx now
imports them instead of keeping its own separate copy) since the cluster layout needs to
know a card's real size to stack members without overlapping — previously these lived only
in the renderer, invisible to the shared layout logic. Also fixed `addAllClustersToBoard`'s
member spacing, which packed members every 20px regardless of the ~64px card height it
was actually placing (a latent overlap bug in that separate, opt-in bulk action, caught
while touching the same sizing logic).

### Code-info window (2026-09-07)

Double-click a code anywhere it appears — a coded passage in the source text, its row in
the Workspace codebook tree, or its card on the board — to open a window showing its name,
how many times it's been used, and the verbatim of every instance, with a checkbox to show
15 words of context on each side pulled from the source document. One `inspectedCodeId`
flag (`workspaceUiStore.ts`) drives it regardless of which of the three triggered it, and
the window (`CodeInfoModal.tsx`) is mounted once at the project-shell level so it survives
switching between Workspace/Analysis/Board while open. The underlying data — usage count,
verbatim, and context — comes from a new pure `getCodeUsageDetail` (retrieval.ts) and
`getSurroundingWords` (text.ts), deliberately excluding a code's descendants (unlike
`retrieveByCode`'s default) since this is "how many times was *this* code applied," not a
rollup of its sub-codes. Repurposing double-click on the Workspace tree's code name (it
used to start an inline rename) meant giving rename its own dedicated "✎" button instead,
so the feature already there didn't just disappear.

### Resize-on-nest (2026-09-07)

Dragging a cluster into another to nest it now grows the destination to actually fit the
one just dropped in, with a live dashed "ghost" preview shown on the destination while
still dragging (matching what the drop will commit) rather than a silent resize with no
warning. `computeAccommodatingSize` (boardOps.ts) only ever grows width/height — it never
moves the destination's x/y — specifically so an already-nested sibling cluster (positioned
in absolute canvas coordinates, not relative to its parent) can't be orphaned by the
parent's origin shifting out from under it. The trade-off, made deliberately rather than
by accident: a cluster dropped so it pokes out past the destination's *top* or *left* edge
isn't fully accommodated — it'll visually overhang that edge instead of the destination
growing to meet it. Growing toward the bottom/right (where a cluster's own resize handle
already lives) covers the common case; solving the top/left case would mean reflowing the
destination's other existing children too, which is a bigger feature than what was needed
here.

### Three more QoL items (2026-09-07)

- **Escape closes the code-info window** — it only closed via the × or a backdrop click
  before.
- **"Fit view" on the board** — a toolbar button that zooms/scrolls so every cluster and
  item currently on the board is visible at once, reusing the same zoom-anchor mechanism
  wheel-zoom already uses (center the content's bounding-box midpoint in the viewport)
  when the zoom level needs to change, or corrects scroll immediately when it doesn't.
  Matters more now that the auto-layout can stack many clusters into a tall column.
- **A filter box in the Codes & items tree** — type to narrow the tree down to just the
  paths leading to a match (code name, cluster name, or a member code's name), scaling
  better than scrolling once a project has dozens of codes/clusters. A node that matches
  by its own name shows its *whole* subtree unfiltered ("found the neighborhood, show
  everything under it") rather than pruning further within an already-matched branch —
  deliberately not the same as a match reached only via a member code, which still filters
  its own sub-clusters normally, tested explicitly to keep the two cases from blurring
  together.

### Undo/redo (2026-09-07)

Ctrl/Cmd+Z to undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) to redo, plus header buttons showing
enabled/disabled state — up to 50 steps back, skipped while focus is inside a text field so
native in-field undo still wins there. Almost every store action already funneled through
one function, `updateProject`, so history-tracking lives entirely there rather than needing
to touch each of the ~40 individual actions: `past`/`future` are stacks of whole
`ProjectData` snapshots, cheap to keep many of despite sounding wasteful, since every op
already builds its result via `{ ...data, changedField }` — structural sharing means an
undo entry is mostly pointers to the same unchanged sub-trees, not a deep clone. Assets
(imported files' raw bytes) deliberately sit outside the history — undoing a document
import removes the document record but leaves its bytes in memory, a small accepted
trade-off against tracking a second, much larger piece of state per edit.

The harder problem: a single user gesture — dragging a whole linked group of board items,
moving a cluster together with its nested subtree and re-evaluating membership, nesting one
cluster into another *and* resizing the destination to fit — routes through several
separate store-action calls, which without help would each become their own undo step (hit
undo once after a five-item drag and only one item would move back). Added `withBatch(fn)`:
calls inside `fn` still apply immediately (so a later call in the same gesture sees an
earlier one's result), but only the state from *before* the batch's first change gets
pushed to history, once, when the outermost batch ends — nested batches collapse into that
same one entry. Wrapped it around the board's drag-drop commit and every other handler that
fires more than one store action per user gesture (a code or note crossing from one cluster
into another, creating a cluster while filing the active quote under it).

Verified: typecheck and build clean. Unit-tested the exact history/batching algorithm
(copied verbatim from projectStore.ts into a minimal set/get harness standing in for
Zustand, since the logic itself has nothing Zustand- or React-specific about it) covering:
sequential calls each getting their own step, a batch of three calls collapsing to one,
nested batches still collapsing to one, a no-op update not polluting history, redo
restoring what undo took back, a fresh edit after an undo correctly invalidating the redo
stack, and the history cap trimming old entries without erroring once exhausted. Boot-
tested a separate packaged instance (window title "Cadenza", no errors), then killed it and
confirmed no electron process was left running.

### Rename a project (2026-09-07)

There was genuinely no way to do this — `ProjectData.name` was set once at creation
(`newProject(name)`) and never touched again anywhere in the app. Added `renameProject`
(a one-line `updateProject` call, same as `importDocument`'s inline pattern, since there's
no real logic to a plain field assignment worth a dedicated shared/*.ts op function) and
double-click-to-rename on the project title in the header, matching the exact rename UI
already used for documents/codes/clusters elsewhere. Renaming only changes the in-app
name shown in the header and used as the default filename the next time a Save-As dialog
opens — it does not rename the `.qdaproj` file already on disk, the same way renaming a
document doesn't touch its imported source file.

### Nested clusters genuinely integrated on the board (2026-09-07)

Nesting a cluster into another from the Workspace tree wasn't showing up "integrated" on
the board — the earlier auto-layout put every nested cluster in a single disconnected
second column, unrelated to which category was actually its parent, since there was no
board-drag position to anchor a Workspace-driven nesting on. Rewrote `getVisibleBoardClusters`
around genuine recursive containment: a nested cluster is now placed *inside* its real
parent's box (below the parent's own member cards, indented, narrower by one padding's
worth per level), computed bottom-up (a parent's height has to account for its full nested
subtree, not just its own direct members) then placed top-down. Nesting from the Workspace
now looks the same as nesting by dragging on the board itself, and `getVisibleBoardItems`
needed no changes at all — it already treats `clusters` generically, so a member's fallback
position now correctly lands inside its actual (properly nested) cluster's box for free.

Caught and fixed a bug via the test suite before shipping: an initial width floor on
nested boxes (so they wouldn't shrink to nothing at extreme depth) clamped a deeply-nested
child back up to the same width as its equally-floored parent while still indenting it —
meaning it overflowed the parent's right edge once both hit the floor. Removed the floor
entirely; at any realistic nesting depth width stays comfortably positive, and the
pathological case just renders a very narrow box instead of a crash. Also investigated a
separately-reported "notes don't follow when a cluster moves, unlike codes" — traced the
full move/materialize path end to end and found no code-level asymmetry between refType
'code' and 'note' (three targeted runtime tests, including one specifically simulating a
note that's a member of a *nested* cluster, all passed against the pre-fix code too). Most
likely this was actually the nesting-integration issue above, now fixed, but flagged as
unresolved rather than claimed fixed since no distinct bug could be pinned down.

Verified: typecheck and build clean. Unit-tested the new layout extensively (bundled with
esbuild, run with node, then deleted): a nested cluster fully contained inside its real
parent, parent height growing to fit a nested child, three levels of transitive containment,
sibling root clusters and sibling nested children both never overlapping, an explicit
(user-placed) parent still correctly anchoring a virtual child, a later root cluster
clearing a tall nested subtree, non-default boards still auto-showing nothing, a fully
cyclic pair (unreachable from any root, given the single-parentCategoryId data model)
safely producing zero clusters rather than hanging, and a legitimate 30-level-deep chain
placing every level without an artificial cap truncating it. Boot-tested a separate
packaged instance (window title "Cadenza", no errors), then killed it and confirmed no
electron process was left running.

### The board reflows when nesting changes in the Workspace (2026-09-07)

The previous fix made a category's *first* board appearance correctly nest inside its
parent, but once a cluster has an explicit shape (dragged/resized even once), its position
stays frozen — `getVisibleBoardClusters` always trusts an explicit shape over recomputing
it. So integrating one cluster into another from the Workspace tree still didn't visually
move/resize anything on the board once either cluster had already been touched there — the
common case for a project anyone's actually worked in.

Added `resetDefaultBoardClusterLayout` (boardOps.ts): drops every explicit cluster shape
on one board, so the whole thing recomputes fresh from `getVisibleBoardClusters`'s
already-tested recursive layout. Deliberately resets *everything* on the board rather than
trying to patch just the directly-affected clusters — an incremental patch has to either
also reset every affected cluster's entire descendant subtree (to avoid orphaning children
whose parent's box just moved out from under their untouched absolute position) or risk
exactly that orphaning; a full reset sidesteps the problem by construction. Board *items*
(individual code/note/quote cards) are untouched — an item with its own explicit position
keeps it regardless of where its cluster's frame ends up, the same trade-off that already
applies when a cluster is manually dragged on the board itself.

New store action `reparentCategoryAndReflowBoard` wraps `reparentCategory` + (when the
parent actually changed) this reset, both inside one `withBatch` so it's still a single
undo step. `CodebookPanel.tsx` and `NotesPanel.tsx`'s Workspace-tree nesting/un-nesting now
call this instead of plain `reparentCategory`; `BoardView.tsx`'s board-drag nesting keeps
calling the plain action unchanged, since a board drag already positions everything itself
(via the resize-on-nest feature) and running a full reset on top would discard the position
the user just dragged the cluster to.

Only ever resets the *default* board — other boards stay fully user-curated, since the
whole point of a non-default board is manual, deliberate arrangement that shouldn't get
silently rewritten by an unrelated Workspace edit.

Verified: typecheck and build clean. Unit-tested `resetDefaultBoardClusterLayout` in
isolation (only touches the target board) and the full end-to-end scenario (boardOps.ts +
categoryOps.ts bundled with esbuild, run with node, then deleted): two explicit, far-apart
sibling clusters; nest one into the other via the Workspace path (reparent + reset, no
board drag) and confirm the child now sits inside the grown parent; pull it back out and
confirm they're visually separated again. Boot-tested a separate packaged instance (window
title "Cadenza", no errors), then killed it and confirmed no electron process was left
running.

### Two follow-up fixes to the reflow above (2026-09-07)

Two remaining gaps, both fixed:

- **Member items were left outside their (reflowed) cluster.** `resetDefaultBoardClusterLayout`
  deliberately left board *items* untouched, matching the pre-existing rule that an item
  with its own explicit position keeps it regardless of where its cluster's frame moves to
  — reasonable for a manual board drag, wrong here: after a Workspace-driven reflow, *every*
  already-materialized member (which in an actively-used project is most of them) stayed
  frozen at its old absolute spot while its cluster's frame moved out from under it. Fixed
  by having the reset also drop the explicit `BoardItem` position of any code/note/segment
  that's a member of *some* category — same reasoning as the cluster shapes themselves,
  just extended to their contents. Unclustered items are untouched, same as before.
- **The nesting was positionally correct but not visually readable.** Not a data bug —
  nested clusters did move together and stay logically linked. The problem was that every
  cluster frame, root or nested, used the same near-transparent (~6% opacity) fill and only
  a 10px margin, so a box drawn entirely inside another one just blended into it —
  technically contained, not perceptibly so. Added `fillOpacityForDepth` (BoardView.tsx): a
  root cluster keeps that original subtle fill, and each nesting level below it gets a
  visibly more opaque fill of the same color, so a nested cluster reads as a distinct layer
  sitting on top of its parent. Also doubled `CLUSTER_PADDING` (10px -> 20px) for a clearer
  gap around a nested box's edges.

Verified: typecheck and build clean. Unit-tested the item-position reset in isolation
(a clustered item's explicit position on the target board is dropped, an unclustered
item and an item on a *different* board are both left alone) and re-ran the nested-
containment test suite against the larger padding to confirm nothing regressed (still
contained at three levels, siblings still don't overlap, a 15-level chain still places
everything without overflow). Boot-tested a separate packaged instance alongside an
already-running dev session (window title "Cadenza", no renderer errors — only the
disk-cache warnings expected from two Electron instances sharing a user-data dir), then
killed only that instance's PIDs and confirmed the process list returned to exactly what
was running beforehand.

### A real test suite (2026-09-07)

Every correctness guarantee established so far — nested cluster containment, undo/redo
batching, item materialization on drag, auto-layout non-overlap, drag-and-drop membership
transfer, the codebook search filter's ambiguous cases — had only ever been verified with a
throwaway script (bundle with esbuild, run with node, delete). None of it was protected
against a future regression. Added Vitest (pinned to a version compatible with this
project's Vite 5, since latest Vitest requires Vite 6+) and ported the substance of that ad
hoc testing into a permanent suite: `npm test` runs it, `npm run test:watch` for
development. 232 tests across 11 files, all pure-logic (no React, no Electron, no DOM — a
plain node environment), covering every `src/shared/*.ts` module with actual logic (the two
without a test file, `api.ts` and `types.ts`, are pure type definitions with nothing to
run).

Also extracted the Workspace codebook tab's tree-building/search-filter logic
(`buildTree`/`findTreeNode`/`pruneClaimed`/`filterTreeByQuery`/`filterClusterTree`/
`treeHasMatch`) out of `CodebookPanel.tsx` into `renderer/src/lib/codebookTree.ts` —
it was pure logic with real edge cases (a code that's both a subcode of another code AND a
cluster member; a search match needing to keep its whole subtree rather than re-filtering
within an already-matched branch) sitting inert inside a `.tsx` file where it couldn't be
tested at all. Shrunk `CodebookPanel.tsx` by about 90 lines in the process.

### Reflow was still missing for plain membership changes (2026-09-07)

Symptom persisted: codes not landing inside their cluster's box after joining/splitting
clusters, still logically linked but not positioned right.

Cluster sizing itself was not the cause — `getVisibleBoardClusters`'s `computeHeight`
already sizes a cluster dynamically from its real content (`Math.max(DEFAULT_CLUSTER_HEIGHT,
ownContentHeight + childrenHeight)`). The real gap: the reflow-on-change wiring added in the
two sections above only covered a *cluster's own nesting* changing
(`reparentCategoryAndReflowBoard`, calling `reparentCategory`). It never covered a *code or
note's cluster membership* changing — `addCodeToCategory`, `removeCodeFromCategory`,
`addNoteToCategory`, `removeNoteFromCategory` all still went through unreflowed. So the
moment any cluster had an explicit (materialized) shape, filing a code/note into or out of
it from the Workspace tree or the Analysis > Clusters picker left the cluster's frame
frozen at its old size — exactly the reported symptom, and the more common path to hitting
it than re-nesting a whole cluster.

Fixed by extending the same pattern to these four actions: a new `reflowDefaultBoard(get,
boards)` module-level helper in `projectStore.ts` (factored out of what
`reparentCategoryAndReflowBoard` was already doing inline) backs four new store actions —
`addCodeToCategoryAndReflowBoard`, `removeCodeFromCategoryAndReflowBoard`,
`addNoteToCategoryAndReflowBoard`, `removeNoteFromCategoryAndReflowBoard` — each the plain
action plus a reflow, batched into one undo step. `CodebookPanel.tsx`, `NotesPanel.tsx`,
and `ClustersView.tsx` (the Analysis > Clusters picker) now call these instead of the plain
actions for every membership change that originates off the board. `BoardView.tsx`'s own
drag-based membership changes (dragging a card into/out of a cluster) keep calling the
plain actions unchanged, same reasoning as before — a board drag already positions
everything itself, so resetting on top of it would discard the position just dragged to.
Left `removeSegmentFromCategory` in `ClustersView.tsx` on the plain action deliberately: a
raw quote/segment filed directly under a category has no auto-position-inside-its-cluster
treatment at all yet (`getVisibleBoardItems` only homes codes/notes), so reflowing wouldn't
currently do anything for it — a separate, smaller, acknowledged gap, out of scope here.

Verified: typecheck and full test suite (233 tests, up from 232) clean, including a new
`resetDefaultBoardClusterLayout` case that reproduces the exact bug in isolation — an
already-explicit 60x60 cluster too small for a member row, a code added to it via
`addCodeToCategory`, then reset + recompute, asserting the box actually grew and the new
member's row lands inside it. Production build clean. Boot-tested a separate packaged
instance alongside an already-running dev session (only the expected shared-user-data-
dir disk-cache warnings, no real errors), then killed only that instance's PIDs and
confirmed the process list returned to exactly what was running beforehand.

### Low-risk cleanup: splitting BoardView.tsx and deduping the cluster rows (2026-09-07)

`BoardView.tsx` had grown to 1136 lines, and `CodebookPanel.tsx`/`NotesPanel.tsx` each had
their own ~95%-identical cluster-row component (`ClusterRow`/`NoteClusterRow`) — same
header chrome, same drag/drop plumbing, differing only in which kind of member (code vs.
note) they file. Pure extraction, no behavior change intended anywhere in this pass.

`BoardView.tsx`'s `ClusterFrame` and `BoardItemCard` were already broken out into their
own function components but still lived in the same file, sharing its module-level
`DragState` type and `MIN_CLUSTER_WIDTH`/`MIN_CLUSTER_HEIGHT` constants by closure. Moved
both into their own files (`ClusterFrame.tsx`, `BoardItemCard.tsx`), and factored what they
needed out from under `BoardView.tsx` into two small shared modules rather than importing
types back out of the file that imports them: `boardDragTypes.ts` (the `DragState`/
`Position` types) and `boardLayoutConstants.ts` (the two resize-floor constants).
`BoardView.tsx` dropped from 1136 to 872 lines.

For the row duplication: added `ClusterRowShell.tsx`, owning everything that was
byte-for-byte identical between the two rows (color swatch, inline rename, the "cluster"
kind badge, the other-member-count badge, delete button, and all the drag/drop/nest
plumbing including the reflow-triggering `reparentCategoryAndReflowBoard` call). It takes
a `memberKind: 'code' | 'note'` (which also now correctly gates handleDrop — a latent gap
in the original `ClusterRow` let it accept a drop without checking the payload was
actually a code, since nothing in practice ever dragged a note over it; `NoteClusterRow`
already had the equivalent `note` check, so the shared shell just applies it uniformly
now), `onAddMember`/`onRemoveMember`, an `otherMemberCount`/tooltip pair, and a
`children` slot for whatever the two callers render below the header — which stayed with
each of them, since a codebook row's members are a hierarchical, search-filtered code
subtree and a notes row's are a flat, document/category-filtered note list: different
enough in shape that folding that into the shared shell wasn't worth it.
`CodebookPanel.tsx`'s `ClusterRow` and `NotesPanel.tsx`'s `NoteClusterRow` are now thin
wrappers that compute their own member list and pass it to `ClusterRowShell` as children.
649 -> 549 lines and 741 -> 638 lines respectively, with the ~100 lines of duplication
between them now living once, in the 179-line shell.

Verified: typecheck clean, full test suite still 233/233 (nothing here touches
`src/shared/*.ts`, so no test changes were needed or expected), production build clean.
Boot-tested a separate packaged instance alongside an already-running dev session (only
the expected disk-cache warnings), then killed only that instance's PIDs and confirmed the
process list returned to exactly what was running beforehand.

### Board ease-of-use: a stuck-drag bug and highlighting cluster nesting (2026-09-08)

Bug: clusters sometimes wouldn't move — cursor turned into a "no-drop" forbidden icon, and
the box snapped back to where it started. Hard to reproduce on demand, so this is a
diagnosis-and-fix rather than a confirmed root cause. `ClusterFrame`'s draggable header
(and `BoardItemCard`'s card) move via a custom mousedown/mousemove/mouseup implementation,
not native HTML5 drag-and-drop — but the header's content is plain text (the cluster name,
an emoji), and neither element had `select-none`. A mousedown-then-move gesture that lands
on that text can be interpreted by the browser as "drag this selected text" instead of (or
racing) the app's own drag: the OS shows exactly the reported forbidden cursor, and —
worse — a native drag swallows the `mouseup` event the app's `window` listener is waiting
for, so the move never commits. Since nothing ever actually changed in the store, the
cluster's next render draws it right back at its stored position: the reported "reverts to
its original position." Matches the "hard to reproduce" symptom too, since it depends on
exactly where the mousedown lands relative to the text, not on any particular cluster or
action. Fixed by adding `select-none` to both `ClusterFrame`'s frame/header and
`BoardItemCard`, plus `onDragStart={(e) => e.preventDefault()}` on both as a backstop for
a selection that already existed before the mousedown.

Second: a visual highlight for board nesting, in both directions.

- **Dragging an existing cluster onto another** already showed a dashed ghost of how much
  the destination would need to grow, but that ghost stays hidden whenever the destination
  is already roomy enough — leaving no signal at all that a drop right there would nest
  into it. Split the old `resizePreview` computation into `dragNestTarget` (the target
  cluster, always known while hovering over one) and an optional `growSize` (only when a
  ghost is actually useful), and added `isNestTarget` to `ClusterFrame`: a solid highlight
  ring in the destination's own color, plus a small "Drop to nest here" badge.
- **Resizing a cluster to enclose other existing ones** — a "draw a box around them"
  motion — previously did nothing beyond the resize itself; there was no way to
  batch-nest several existing clusters at once, only one at a time via the drag-to-nest
  above. Added `findClustersEnclosedBy` (boardOps.ts): the clusters fully contained by a
  given box, excluding a given set of category ids (the resizing cluster itself, and
  anything already nested under it — already correct, not newly enclosed). Wired into
  `BoardView.tsx` two ways: a live `resizeEnclosedCategoryIds` set drives a matching
  highlight (a blue ring + "Will become a child" badge, a fixed accent independent of
  either cluster's own color so it reads consistently) on every cluster currently inside
  the growing frame, and `handleMouseUp`'s resize branch re-runs the identical containment
  check against the final size and calls `reparentCategory` on each one — so what got
  highlighted during the drag is exactly what ends up nested, never a surprise either way.

Verified: typecheck clean, full test suite 236/236 (three new `findClustersEnclosedBy`
cases: only fully-contained clusters count, not merely-overlapping ones; excluded
category ids are still excluded even if geometrically enclosed; an exact size match
counts as contained). Production build clean. Boot-tested a separate packaged instance
alongside an already-running dev session, confirmed no errors beyond the expected
disk-cache warnings, killed only that instance and confirmed the process list returned to
its prior state. The stuck-drag fix still needs hands-on confirmation next time the
underlying trigger recurs, since it couldn't be reproduced directly.

### Phase 7: cross-case comparison (2026-09-08)

The plan called for a Kaufmann-style contrastive view across interviews and an IPA-style
Group Experiential Themes (GECT) table (themes × cases) — flagged as "an upgrade of Phase
5's retrieval view into a matrix." Implemented as a new Analysis > Compare cases tab.

No separate case/participant concept exists in the data model, so a "case" is simply one
document — matches how documents are already used everywhere else (one transcript per
import). Added `comparison.ts` (`getCases`: every document as a case, oldest-imported first;
`getCodeCaseMatrix`: count of coded passages per code per case, reusing the already-tested
`retrieveByCode` rather than re-deriving the same segment/coding/document joins a second
time) plus a new component, `ComparisonView.tsx`, with two linked sub-views:

- **Themes × cases**: a table, codes down the rows (indented by depth, same list source as
  the plain retrieval view) and cases across the columns, each cell the count of coded
  passages — the GECT table, using the existing code hierarchy as the theming structure (a
  parent code as a superordinate theme, its children as sub-themes) rather than inventing a
  second, category-based rollup alongside it. A "Roll up sub-codes" toggle matches the
  plain retrieval view's equivalent option. Clicking a non-zero cell jumps straight to the
  contrast view below, already filtered to that code.
- **Contrast one code**: pick a code, see every case's instances of it in its own
  side-by-side column, including a case with zero instances (shown as "No instances in this
  case" rather than omitted) — this is the Kaufmann-style reading, where whether a case
  addresses something at all is as analytically meaningful as what it says when it does.
  Each quote has a "Go to passage" link, reusing the same navigate-to-source-text pattern
  already used by the plain retrieval view.

Verified: typecheck clean, full suite 242/242 (six new `comparison.ts` tests: cases sorted
by import date, per-code-per-case counts, descendant roll-up on/off, zero-count cells
omitted rather than carried as explicit zeros, multiple codes counted independently).
Production build clean. Boot-tested a fresh packaged instance (no other instance running,
so no shared-user-data-dir warnings either — a clean launch with no errors at all), then
killed it and confirmed no electron process was left running.

### A large synthetic test project, and what using it surfaced (2026-09-08)

Generated `LargeProjectTest.qdaproj` (untracked, matches the existing `*.qdaproj` gitignore
rule) to usability-test a big hierarchy: 500 codes, 30 clusters, 5 superordinate clusters,
nothing else — deliberately minimal so opening the Board immediately exercises the
auto-layout at that scale. Verified end-to-end through the app's own logic before use
(unzip -> parse -> `normalizeProjectData` -> `getVisibleBoardClusters`/
`getVisibleBoardItems`).

Using it surfaced two real issues, plus two follow-on improvements once the grid idea
proved out.

**Ctrl/Cmd+wheel zoom silently did nothing on a freshly opened project.** The wheel
listener effect had an empty dependency array, attached once to
`scrollContainerRef.current` on mount. But the scrollable container only exists once
`currentBoard` resolves to a real board — on a fresh mount `currentBoard` is still `null`
on the very first render (the effect that fixes a stale/empty `selectedBoardId` hasn't run
yet), so the listener attached to a still-`null` ref and never got a second chance once the
container actually appeared. Not specific to a large project at all — reproducible on
*any* fresh Board-tab mount — just more consistently hit while opening a brand new project
for the first time. Fixed by depending on `currentBoard` instead of `[]`, so the effect
re-attaches once the container exists.

**Clusters defaulted to a single column.** `getVisibleBoardClusters`'s root-level
auto-layout stacked every root category in one column, sized to content — safe (no
fixed-size grid cell could work when height varies this much with descendant count) but,
at 5 superordinates each containing a stack of sub-clusters, produced an extremely tall,
narrow board. Rewrote it as a multi-column masonry pack: `packGridColumnCount` picks a
near-square column count (`ceil(sqrt(n))`, capped at 6) from however many siblings there
are, and each next root goes into whichever column currently has the least height used so
far — same overlap-proof guarantee a single column always had (a column only ever grows
from its own real content), just spread across the board's width instead of stacked into
one strip.

Two follow-on improvements, extending the same idea further:

- **Sub-clusters inside a superordinate, gridded too** — not just the root level. This
  needed more than reusing the column-packing loop: since a grid's *width* need depends on
  its children (unlike a single column, which just took whatever width its parent handed
  down), sizing had to become genuinely bottom-up. Replaced the old top-down-width/
  bottom-up-height split (`computeHeight` + `placeCategory`) with `computeSize` (bottom-up,
  determines a virtual category's width *and* height from a grid of its own children) +
  `placeCategory` (top-down, now just places using sizes `computeSize` already settled,
  re-deriving the identical grid assignment deterministically so the two can never
  disagree). An explicit (frozen) category's own size is still never recomputed, same rule
  as always — its children still get gridded, just within whatever room the frozen box
  actually gives them.
- **Codes/notes inside a cluster, gridded too** — the member cards themselves, not just
  the cluster shapes containing them. Added `ownMemberGridSize` (only codes/notes factor
  in; a segment/quote filed directly under a category always keeps its own explicit
  position, unaffected either way) using the same `packGridColumnCount` heuristic, folded
  into both `computeSize` (a cluster's own box now widens/shortens to fit a grid of its
  member cards, not just a grid of its nested children) and `getVisibleBoardItems`'s
  per-cluster positioning (so cards actually land in the grid the box was sized for, never
  overflowing it).

One heuristic (`packGridColumnCount`) now drives every grid-packing decision in this file —
root clusters on the board, a cluster's nested children, and a cluster's own member
cards — so there's one column-count rule to reason about instead of three.

**"Reset placement" button.** With sizing now driven by three different grids at three
different levels, a fast way to discard whatever's been dragged/resized and see the
current auto-layout fresh became worth having on its own, not just as a side effect of a
membership change. Added `resetBoardLayout` (projectStore.ts) — a thin wrapper around the
already-existing `resetDefaultBoardClusterLayout`, guarded to only ever act on the actual
default board (that op doesn't check `board.isDefault` itself; running it against a
non-default board — which has no auto-layout to fall back to — would just empty it out).
The button only renders when the current board *is* the default one, and confirms first
("Any positions you've dragged or resized here will be lost — the underlying codes, notes,
and clusters themselves are not affected") since it's a real, if easily-avoidable, loss of
manual arrangement.

Verified: typecheck clean, full suite 250/250 (13 new tests: multi-column root packing
including a 40-cluster no-overlap sweep and a 100-cluster column cap; a superordinate's
children gridded and its box widening to fit them; member cards gridded inside a cluster,
still fully contained, still non-overlapping; a 12-member cluster ending up wider and much
shorter than 12 stacked rows would need). Re-verified against the actual
`LargeProjectTest.qdaproj` after each change (not just synthetic fixtures) — confirmed
sub-clusters actually grid inside their superordinates with zero overlap, and the whole
500-code/35-cluster layout still computes in ~1ms. Production build clean. Boot-tested a
fresh packaged instance after every change in this batch, no errors beyond (when another
instance happened to be running) the expected shared-user-data-dir cache warnings.

### Phase 8: exporters (2026-09-08)

Phase 8 scope, revised from the original plan's one-liner (Excel-import-as-cases +
`.xlsx` reports): a board PDF export, a codebook export, a notes export showing which
clusters they're filed under, a codebook+verbatim variant, a notes+clusters+verbatim
variant, a configurable words-of-context option, and doc/docx/odt/html/pdf formats.

Format choice: legacy binary `.doc` has no viable JS writer and nothing modern needs it
(dropped, `.docx` already covers "Word doc"); native `.odt` has no mature JS library
either, and OpenOffice/LibreOffice already open `.docx` natively (dropped, matching the
original plan's own reasoning for deferring it); landed on **docx/html/pdf**. Also added: a
code-frequency table, and exporting the cross-case comparison (Phase 7) matrix.

Built as one flexible report rather than four fixed report types, since the four listed
variants (codebook / codebook+verbatim / notes+clusters / notes+clusters+verbatim) are all
just checkbox combinations of the same underlying content:

- **`reportModel.ts`** (shared): a tiny format-agnostic document model — headings,
  paragraphs (with `quote`/`meta` styling), tables — plus `renderReportToHtml`. Every
  format renders the *same* Report, so the actual content logic is written once.
- **`reportBuilders.ts`** (renderer/src/lib, since it needs `buildClusterTree` from that
  same directory): `buildProjectReport(data, options)` assembles one Report from whichever
  sections are checked — codes (with hierarchy + definitions), notes (walked through the
  cluster tree, a question-cluster labeled with curly quotes matching the app's existing
  AQA convention, plus an "Unfiled notes" section), cross-case comparison (the codes ×
  cases matrix), each optionally with verbatim quotes and N words of surrounding context
  (reusing `getSurroundingWords`, the same mechanism the code-info window already used —
  configurable in the dialog, defaulting to 15), plus an independent code-frequency table
  toggle.
- **`docxRenderer.ts`** (main process, via the new `docx` package dependency) and the
  PDF path — a real PDF-generation library turned out to be unnecessary: Electron's own
  `webContents.printToPDF` renders a hidden window's HTML straight to PDF, so `pdfRenderer.ts`
  is just "write the HTML to a temp file, load it in a `show:false` window, print it."
  A custom `pageSize` (in inches, converted from the content's actual CSS pixel dimensions)
  produces one page sized exactly to fit — used for the board export below; report PDFs
  print at a normal A4 page and paginate naturally.
- New **Export** tab (`ExportView.tsx`) with the checkboxes described above and a
  format picker, wired through `window.api.export.report` (shared/api.ts, preload,
  main/index.ts IPC handlers).

**Board PDF** works differently, and lives in `BoardView.tsx` itself rather than the
Export tab: rather than reconstructing the board's visual layout as a second HTML
generator (risking it drifting from what the board actually looks like), it clones the
*live* canvas DOM directly (`canvasRef`), forces its zoom transform back to `none` and
resizes it to the board's actual full content bounding box (not the current viewport —
always the whole board regardless of what zoom the user happens to be at), and copies the
app's own already-parsed stylesheets (`document.styleSheets`) inline so the exported page
looks the same without needing to locate the compiled CSS bundle on disk. Sent over IPC as
one HTML string to `window.api.export.boardPdf`, which prints it at a custom page size
matching that bounding box — one page, the whole board, actual size.

One real bug caught along the way: `pdfRenderer.ts`'s hidden `BrowserWindow` was first
written with `webPreferences.offscreen: true`, which switches Chromium to a separate
off-screen-rendering pipeline (meant for continuously capturing frames, e.g. video) —
manual testing hit real GPU-state errors from it. Removed; a plain `show: false` window
still renders normally through the standard compositor without ever showing an OS window,
and is what `printToPDF` is actually meant to be used against.

Also added `NoteInfoModal.tsx` — the code-info window (double-click a code anywhere to see
its usage + verbatim instances) had no equivalent for notes. Wired to the same double-click
convention (a note card in the Workspace notes tree, or a note card on the board) via a new
`inspectedNoteId` UI-store flag mirroring `inspectedCodeId`. Simpler than the code version —
a note has at most one verbatim quote (the segment it's attached to, if any), not a list of
instances — and adds what a note card's inline preview doesn't have room for: its full tag
list and which cluster(s) it's filed under, plus the same word-of-context toggle.

Verified: typecheck clean, full suite 269/269 (13 new `reportBuilders.ts` tests covering
every section and combination; 4 new `reportModel.ts` HTML-rendering tests including HTML-
escaping of user content; 2 new `docxRenderer.ts` tests, actually checking the produced
buffer starts with the ZIP magic bytes a real `.docx` always has — genuine verification,
not just "didn't throw"). `pdfRenderer.ts` itself isn't unit-tested (needs a real
`BrowserWindow`, not just Node) — a standalone Electron-script smoke test of the
`printToPDF` call outside the full app is what caught the `offscreen` bug above, though a
fully conclusive independent re-run of that same standalone script proved unreliable in
this sandboxed environment afterward. End-to-end verified instead against the real
`LargeProjectTest.qdaproj`: a report export (`Large Test Project (500 codes).html`,
correctly walking the notes/cluster hierarchy, including three sub-clusters dragged into
root position during earlier board testing, each rendered as their own top-level section
rather than nested) and a board PDF export (`Main board.pdf`, valid `%PDF-1.4`, ~2.3MB for
the full 500-code board) both produced valid, substantial files. Production build clean
throughout.

### Board info window: right-click instead of double-click (2026-09-08)

Surfaced while using the multi-case test project's board: with two code/note cards sitting
close together (common with the auto-grid layout, or a tightly-packed cluster),
double-clicking to open the info window would sometimes link the two cards together
instead. Root cause: a card's `onMouseDown` always starts a drag-and-possibly-snap gesture,
and `findSnapTarget` has no minimum drag distance — so the *first* click of an attempted
double-click can itself register as a completed "drag" landing within snap range of the
neighboring card, linking them, before the second click (which was supposed to complete the
double-click) ever arrives. Double-click and the drag/snap gesture both listen on the same
`onMouseDown`, so they can't be told apart once cards are close enough.

Right-click doesn't go through `onMouseDown`/drag/snap at all, so it can't conflict with
it by construction — swapped `BoardItemCard.tsx`'s trigger from `onDoubleClick` to
`onContextMenu` (with `preventDefault()` to suppress the native OS context menu). Only the
board's trigger changed; double-click still opens the info window from the source text and
the Workspace codebook/notes trees, where there's no drag gesture on the same element to
conflict with. Updated the board's own on-screen hint text and the relevant code comments
(`CodeInfoModal.tsx`, `NoteInfoModal.tsx`, `workspaceUiStore.ts`) so both now correctly
describe a mixed double-click/right-click convention instead of double-click everywhere.

Verified: typecheck clean, full suite still 269/269 (no shared/pure logic touched — this
is purely a DOM event binding change), production build clean, boot-tested cleanly.

### Right-click was still leaking into the left-click drag/link/move (2026-09-08)

The right-click fix above moved the info-window *trigger* to `onContextMenu`, but left one
gap standing: `onMouseDown` fires for every mouse button by default, not just the left one
— so a right-click was *still* starting the same drag-and-possibly-snap gesture underneath
it. Moving the info window off `onDoubleClick` stopped a double-click's first click from
linking two cards; it did nothing to stop a bare right-click from doing the same thing,
since that mousedown was never checking which button was pressed either.

Added `if (e.button !== 0) return` to every mousedown handler that starts a board drag —
`BoardItemCard.tsx`'s item drag, and `ClusterFrame.tsx`'s both cluster-move (the header) and
cluster-resize (the corner handle). Only left-button mousedowns start a drag/link/move now;
a right-click reaches only `onContextMenu`. Also corrected `BoardItemCard.tsx`'s own comment,
which had claimed right-click "never enters that mousedown/drag/snap path at all" — true
only once this second fix was in, not before it.

Verified: typecheck clean, full suite still 269/269 (again a pure DOM event binding change),
production build clean, boot-tested cleanly.

### Dock/undock the Workspace right sidebar (2026-09-08)

Two possible implementations considered: a floating panel within the same OS window (no
new plumbing — same React tree, same store), or a genuinely separate `BrowserWindow`
(needed for true multi-monitor placement, but requires syncing project state across two
renderer processes — undo/redo, every edit, window lifecycle, all of it). The floating-panel
version was built as the right first step, since "more space to think" doesn't itself need
a second monitor — a true separate window stays a bigger, separate undertaking if
multi-monitor turns out to matter later.

`RightSidebar.tsx` now renders one of two ways depending on `sidebarDocked`
(`workspaceUiStore.ts`, persisted to localStorage alongside the existing `sidebarWidth`
preference — a window-layout choice, not project data): docked is the unchanged fixed
column; undocked is a `position: fixed` panel with its own draggable title bar and a
resize handle, positioned/sized from `sidebarFloatPosition`/`sidebarFloatSize` (also
persisted). Undocking needed no changes anywhere else — a `position: fixed` element
contributes no space to its flex container, so the reader/board simply reclaims the width
the sidebar used to occupy the moment it floats, with zero coordination required from
`ProjectShell.tsx`. The move/resize drags reuse the same mousedown/mousemove/mouseup
pattern already established for board dragging (including the left-button-only guard from
the fix above, applied here too since the same right-click-leaking-into-drag risk exists
anywhere a mousedown starts a drag). The floating position is clamped on every move so a
grabbable corner always stays on-screen — otherwise the panel's own "Dock" button, the only
way back, could end up unreachable off-screen with no other way to recover it.

Verified: typecheck clean, full suite still 269/269 (no shared/pure logic touched — this is
a self-contained UI/store change), production build clean, boot-tested cleanly.

### Methodology check-in, and a real gap: themes had no definition field (2026-09-08)

Methodology check against the app's four target methods (Reflexive TA, IPA, AQA, Kaufmann's
comprehensive interview analysis), before starting Phase 9. Verdict: usable for all four,
and better-aligned than expected — AQA and Kaufmann especially, since the default note
categories (Descriptive/Linguistique/Conceptuelle) already mirror both Kaufmann's own
three-fold remark scheme and IPA's "initial noting," and Phase 7/8's cross-case comparison
work maps closely onto a Group Experiential Themes table. The Board's spatial clustering
matches Reflexive TA's own recommended mind-map-style candidate-theme sorting.

One real gap, not just a nice-to-have: `CategoryRecord` (a theme/cluster) had no
`definition` field, while `CodeNode` did. Reflexive TA treats a written theme definition as
a required deliverable, not optional, and IPA's superordinate themes need the same
write-up — the only way to attach one before this was a workaround (a separate Note
attached to the category), not a first-class field shown inline where the theme itself
lives.

Added `CategoryRecord.definition: string` (mirroring `CodeNode.definition` exactly),
`setCategoryDefinition` (categoryOps.ts) and its store action, and surfaced it everywhere a
code's own definition already shows: a "Def" toggle + inline textarea in `ClusterRowShell.tsx`
(shared by the codebook and notes trees' cluster rows, so both got it from one change), an
always-visible textarea in `ClustersView.tsx`'s expanded cluster cards, and in the notes
export section (`reportBuilders.ts`) right after a cluster's heading, same placement as a
code's definition in the codebook export section. Also fixed a related small gap: a code's
own definition previously didn't appear in `CodeInfoModal.tsx` at all — now shown right
under the header.

Verified: typecheck clean, full suite 271/271 (2 new tests: `setCategoryDefinition` only
touches its target, `createCategory` accepts an explicit definition at creation; extended
the existing `normalizeProjectData` category-backfill tests to cover `definition` too; a
new `reportBuilders.ts` test confirming a cluster's definition shows in the notes export
when present and is omitted — not an empty paragraph — when it isn't). Re-verified backward
compatibility directly against `LargeProjectTest.qdaproj` and `MultiCaseTest.qdaproj`, both
genuinely pre-dating this field (confirmed `'definition' in category` was `false` on the
raw parsed JSON before normalizing) — both load cleanly with `definition` backfilled to
`''`. Production build clean, boot-tested cleanly.

### Phase 9: packaging (icon, Windows/macOS/Linux via CI) (2026-09-08)

Scope extended to include Linux alongside the original plan's Windows+macOS. Constraint:
installation has to stay simple for non-technical end users — this is meant for possibly
dozens of people downloading it, not just one developer.

**Icon**: the app had none — every build used Electron's own default icon. Designed one in
plain SVG (`build/icon-source.svg`, rasterized to `build/icon.png` at 1024×1024 via a
one-time `sharp` devDependency): a dashed circle — the same cluster-boundary motif the
board draws around a theme — containing a handful of connected, differently-colored dots in
the app's own code-color palette, echoing the board's own linked-cards visual. Checked it
down to a 64×64 render to confirm it still reads clearly at taskbar size, not just at full
resolution. `electron-builder` auto-generates the platform-specific `.ico`/`.icns` from this
one PNG — confirmed the `.ico` path works (see below); `.icns` generation itself can only be
confirmed on the macOS CI runner, not locally.

**Windows packaging hit a real, well-known environmental limitation**: `electron-builder`
unconditionally downloads and extracts a `winCodeSign` helper archive for *any* Windows
target (installer or portable, with or without actual code-signing configured), and that
archive contains macOS-only symlinked files. Extracting them needs either Administrator
rights or Windows "Developer Mode" enabled — neither available in this environment — so
both `nsis` and `portable` targets fail at that one step. The app itself still packages
successfully up to that point, though: confirmed `release/win-unpacked/Cadenza.exe` builds
correctly (icon included) and actually launches as a real packaged app (not a dev-mode run)
with no errors beyond the usual benign shared-cache warnings. Real installer builds moved to
CI rather than a local Developer-Mode change, since CI was already required for macOS
regardless (a `.dmg` genuinely cannot be produced outside macOS — Apple's own tooling is
required) and produces more reliable Linux output than cross-building from Windows.

**Added GitHub Actions**, two workflows:
- `.github/workflows/ci.yml` — typecheck + the full test suite on every push/PR to `main`.
  Fast, one Linux runner, since nothing it checks is platform-specific.
- `.github/workflows/release.yml` — triggered by pushing a version tag (`git tag v0.1.0 &&
  git push origin v0.1.0`) or manually. Runs the test suite first (`needs: test`), then
  builds on a 3-way matrix — `windows-latest`/`macos-latest`/`ubuntu-latest`, each running
  `electron-builder`'s own platform flag — so every OS builds and packages on its own native
  platform, sidestepping the winCodeSign issue and the "can't build mac from Windows"
  limitation at once, rather than fighting cross-compilation. `electron-builder --publish
  always` (electron-builder's own built-in GitHub-release publishing, configured via a new
  `publish` block in `package.json`'s `build` config) uploads each platform's output
  straight to a GitHub Release for that tag, created automatically if it doesn't exist yet
  — so getting the app, for anyone, is just "download the file for your OS from the
  Releases page," no build step on their end. `package.json` also gained a `build:linux`
  script (`nsis`/`dmg`+`zip` already existed for win/mac) and a `linux` block in the build
  config (`AppImage` — the most portable single Linux format, picked as the safe first
  target rather than also adding `deb`/`rpm` speculatively before even one Linux build had
  actually been confirmed to work).

Verified: typecheck clean, full suite still 271/271 (no application code touched — this
entire phase is build configuration, CI workflows, and one new icon asset), production
`electron-vite build` clean. Confirmed locally, as far as environment allows: the Windows
unpacked app builds correctly with the new icon and boot-tests cleanly as a real packaged
(non-dev) run; adding the `publish` config didn't change or break the local unpacked build
(no network publish attempt without an explicit `--publish` flag, confirmed by re-running
it). Not yet confirmed at this point: an actual installer file for any of the three
platforms, and the release workflow itself end-to-end — both needed a real tag push to
observe.

### The release pipeline worked first try — the binaries were just invisible (2026-09-08)

A real tag push (`v0.1.0`) and a manual workflow run both exercised the full pipeline
end-to-end. Checked the results via the GitHub API (no `gh` CLI available in this
environment; public, unauthenticated REST calls were enough): both runs' `test` job and all
three `build` matrix legs (windows-latest/macos-latest/ubuntu-latest) came back `success` —
the whole three-platform pipeline, including the Windows packaging step that couldn't be
verified locally, worked on the first real attempt.

But `GET /repos/seelebrn/cadenza/releases` came back empty — no binaries visible anywhere.
Root cause: electron-builder's GitHub publisher defaults `releaseType` to `"draft"`
(confirmed in `builder-util-runtime`'s own type definitions, `@default draft`) — a draft
release is invisible on the public Releases page and to any unauthenticated request,
visible only to the repository owner while logged in. The releases were sitting there the
whole time, just not published. Added `"releaseType": "release"` to `package.json`'s
`publish` block so every future tag push (or manual run) publishes immediately with no
extra manual step — the existing `v0.1.0` draft still needed a one-time manual "Publish
release" click on GitHub (already had the real, working binaries from the successful runs —
no need to rebuild it) since this config change only affects releases created *after* it.

Verified: package.json still valid JSON, typecheck clean — this is a one-line publish
config change, no application code or workflow logic touched.

### Documented, not fixed: macOS/Windows flag the unsigned build (2026-09-08)

Symptom: the v0.1.0 macOS build got flagged as malware by Gatekeeper. Expected, not a real
detection: since macOS Catalina, any app distributed outside the App Store without both an
Apple Developer ID signature *and* Apple notarization gets exactly this "may be malware"
treatment, regardless of what the app does — Windows SmartScreen does a milder version of
the same thing for unsigned `.exe`s. Actually fixing it needs enrolling in the Apple
Developer Program ($99/year, tied to a personal Apple ID) and wiring real code-signing +
notarization into the release workflow, storing the certificate and an app-specific
password as GitHub secrets.

Decision: stay free and document the bypass rather than pay for signing/notarization —
the normal state of affairs for small unsigned software.

Added a "Before you tell anyone to download it" section to the release runbook (the page
published for the "how do I publish a build" tutorial): what each OS's warning actually says,
the exact click-through to open it anyway (right-click → Open on macOS, or `xattr -cr` in
Terminal; "More info" → "Run anyway" on Windows SmartScreen), and a ready-to-copy blurb sized
for pasting straight into a GitHub release description, so people seeing the warning read an
explanation *before* they worry rather than after.

Verified: visual review of the new section's markup and styling (reuses the runbook's
existing token system and copy-button mechanism, generalized to also cover the new
non-terminal "paste this into your release notes" block, not just shell commands).

### macOS wasn't just warning, it was auto-trashing the app — root-caused via `log show` (2026-09-10)

Symptom: worse than a Gatekeeper warning — right-click → Open didn't help, the app got
deleted from disk outright. A clean VirusTotal scan (0/70 engines) ruled out a real
malware-signature match. Diagnosed via a macOS unified-log capture:

```
log show --last 2h --predicate 'eventMessage CONTAINS[c] "Cadenza"'
```

Two lines told the whole story:

```
syspolicyd: [com.apple.syspolicy.exec:default] Attempting to move malware to trash:
  PST: ... (team: (null)), (id: Electron), (bundle_id: com.seelebrn.cadenza)
kernel: (AppleMobileFileIntegrity) AMFI: '.../Cadenza' has no CMS blob?
```

`syspolicyd`'s exec-time policy check (not XProtect, not a real scan) was killing and trashing
the *running process*, ~38 seconds after launch — which is why right-click → Open (a Finder-
level override) didn't help: the app had already been allowed to open, then got shot down at
the OS level regardless.

The `(id: Electron)` field was the key detail. Without a paid signing identity,
electron-builder doesn't re-sign the packaged app, so it keeps whatever ad-hoc signature the
*prebuilt* Electron binary already shipped with — an identity literally called `"Electron"`,
generic to every unsigned Electron app, unrelated to Cadenza's own bundle id. Cross-checked
against QualCoder, a comparable unsigned open-source QDA tool: confirmed via its official
install docs that it's genuinely unsigned too, but built with py2app, not Electron, so it
never carries that shared "Electron" identity — and its own docs describe only the older
"click Open Anyway" flow, not active deletion. Working theory: Apple's Gatekeeper policy
data treats that specific generic identity with more suspicion, plausibly because it's the
one carried by a lot of real unsigned-Electron malware in the wild — consistent with the
clean VirusTotal result (an identity-reputation policy decision, not a signature match on
Cadenza's actual file).

Fix attempted (before reaching for paid notarization): added `build/afterPack.cjs`, an
electron-builder `afterPack` hook that runs `codesign --force --deep --sign -` on the packed
`.app` on macOS only, after electron-builder assembles it but before it's wrapped into a
`.dmg`/`.zip`. This recomputes the ad-hoc signature against the app's actual, current
`CFBundleIdentifier` (`com.seelebrn.cadenza`), replacing the stale generic `"Electron"` identity
with one specific to Cadenza. Still not a trusted signature — Gatekeeper still calls it
unidentified — but it stops the bundle from sharing an identity with every other unsigned
Electron app. Bumped to v0.1.1 and re-released for testing on real hardware.

Verified so far (at release time): local `npm test`/`typecheck` unaffected (hook only
touches the macOS CI build step); the actual Gatekeeper behavior change could only be
verified on real hardware.

**Confirmed fixed** (tested on real hardware, same day): the re-signed build is no longer
auto-trashed. It now shows the ordinary "Apple could not verify… may contain malware"
warning and refuses to launch by default, resolved with the standard one-time System Settings →
Privacy & Security → "Open Anyway" — exactly the flow QualCoder's own docs describe, not the
active-deletion behavior seen on v0.1.0. Confirms the `(id: Electron)` shared-identity theory
was the actual root cause, not a red herring. Updated the release runbook's macOS section to
match: it previously suggested right-click → Open / `xattr -cr` (the old-style bypass, no longer
the reliable path on current macOS); now leads with System Settings → Privacy & Security, which
is what actually works. Landed at the same place QualCoder and comparable unsigned open-source
tools sit — a normal, well-documented, one-time warning — without spending anything on Apple
Developer Program enrollment.

### Results draft export (2026-09-11)

A second export mode alongside the existing report inventory: reorganizes already-coded
material into a write-up skeleton along an explicit axis — by theme (Reflexive TA/IPA), by
case (Kaufmann), or by question (AQA) — chosen by the user rather than inferred from the
project, since which axis fits is itself a methodological call.

Two rules keep it from doing the analytic work for the writer: it never generates prose
(only rearranges quotes and the writer's own notes), and raw quotes always render under a
separate "Excerpts" heading, apart from the writer's own "My analytic notes" — data and
interpretation stay visually distinct rather than blended. Each section ends with a
bracketed interpretation prompt (e.g. "[Interpretation to write — what does this theme
contribute to the research question?]") so the exported document reads as a draft, not a
finished result. A plain "N excerpts · M cases" count is available per section, presented
as a volume marker only — not a claim about validity or agreement.

Scope: intentionally does not include inter-rater/double-coding comparison tooling
(agreement scores, Cohen's kappa) — out of scope by design, not an oversight.

Implementation: reuses the existing `Report`/`ReportBlock` model (`reportModel.ts`)
unchanged — no renderer changes needed, since headings/quote-paragraphs/meta-paragraphs
already covered everything this needed. Added `buildResultsDraftReport` next to the
existing `buildProjectReport` in `reportBuilders.ts` as a separate builder rather than more
checkboxes on the existing one — the existing export is an inventory of everything filed
under whatever's checked; this is a fundamentally different per-axis reorganization.
`ExportView.tsx` now opens on a "Standard report" vs. "Results draft" mode toggle instead of
a single checkbox list.

Verified: 13 new tests in `reportBuilders.test.ts` (all three axes — empty-state messaging,
quote gathering from both member codes and raw segments, notes shown separately from
excerpts, the descriptive count line, question-cluster filtering, per-case code scoping),
full suite green (280/280), typecheck clean, production build clean.

### Cluster links + thematic-map layouts (2026-09-11)

A gap distinct from the results draft above but raised in the same conversation: students
writing an article or poster often get stuck specifically on producing a figure — a
Braun & Clarke-style thematic map (clusters/themes connected by labeled relationships) is a
named deliverable of Reflexive TA, not an optional nice-to-have, and nothing in the app
produced one.

Scoped down from an initial "new visualization view" idea to reuse what already existed:
a curated (non-default) board already *is* a named, freely-arranged subset of clusters —
building a figure is just creating one and adding only the clusters that belong in it, no
new view needed. The one genuinely missing primitive was a labeled relationship between two
clusters; item-to-item `BoardLink`s already exist (a plain unlabeled snap-connection,
per-board) but nothing connected clusters themselves, and nothing carried a label at all.

Added `ClusterLink` (types.ts): `fromCategoryId`, `toCategoryId`, a free-text `label` (not a
fixed vocabulary — same reasoning as `CategoryRecord.definition`, the app doesn't assume
which relationship types matter for a given method), and `directed`. Deliberately
project-wide, not per-board like `BoardLink` — a relationship between two themes is an
analytic claim, not a visual arrangement choice specific to one board, so it's the same fact
regardless of which board happens to be showing it. `getVisibleClusterLinks` (boardOps.ts)
is the only board-specific part: a link only draws on a board that currently shows both its
endpoint clusters.

**Creating a link** needed its own interaction mode rather than a drag gesture: dragging one
cluster onto another already means "nest it" (an existing, established gesture), so a
drag-to-connect motion for links would collide with that. Added a "Link clusters" toggle in
the board toolbar (non-default boards only) — while active, a cluster's header mousedown
picks it as an endpoint (`ClusterFrame`'s `onPick`) instead of starting the normal move,
click a second cluster, type a label in a prompt, done. Rendered as an SVG line (with an
arrowhead marker when directed) plus the label on a small background rect, reusing the same
SVG-overlay mechanism the existing item `BoardLink` lines already used — confirmed that
mechanism was real and working (not dead/unwired code) before building on it.

**Two alternate layouts**, one-click re-arrangements of a board's existing clusters (never
creating/removing one, never touching links) — `computeTreeLayout` and `computeRadialLayout`
(boardOps.ts), applied via `applyClusterPositions`:
- **Tree**: a top-down hierarchical layout driven by `parentCategoryId` — bottom-up subtree-
  width calculation so a parent centers over its children (rather than just starting at the
  leftmost one), a category whose parent isn't also on this board treated as its own root.
- **Radial**: one focus cluster (first cluster by default) stays put, everything else spreads
  around it in a single ring at equal angular spacing.

Both are explicitly scoped to non-default boards — the default board has its own auto-layout
already (`getVisibleBoardClusters`), including "virtual" not-yet-materialized cluster shapes
these functions aren't designed to handle, and isn't a target for this feature; a curated
figure-board only ever has real `BoardCluster` records to begin with. Manual dragging
afterward is unaffected (same non-destructive contract as the existing "Reset placement"
button) — these are starting points, not a lock-in.

Verified: 15 new tests (categoryOps.test.ts: link CRUD including the A→B/B→A-are-distinct
case and no-op-on-duplicate; the existing `deleteCategory` now cleans up any link naming the
deleted category; boardOps.test.ts: visibility filtering, both layouts including a
wide-subtree-doesn't-overlap-its-sibling tree case and an equidistant-from-hub radial case),
full suite green (296/296), typecheck clean, production build clean. Boot-tested a packaged
instance (`npx electron .`) — confirmed via `tasklist` that the process actually launched (8
electron.exe processes, normal multi-process Electron shape), no errors beyond the expected
shared-cache warnings, then killed every PID and confirmed none remained.

**Bug, caught by real use the same day**: the second click of a link never did anything.
Cause — the label step used `window.prompt()`, which Electron's renderer doesn't implement
(unlike `alert()`/`confirm()`, which do work and are already used elsewhere on this same
board): it returns `null` immediately with no dialog ever shown, so the code's `label !==
null` check always failed silently — the picked cluster's highlight just cleared with
nothing visibly happening, which is exactly the reported "doesn't do anything on click."
Fixed by replacing it with a plain inline input (a small bar under the toolbar, Enter to
confirm, Escape or a Cancel button to back out) — the same kind of toolbar text input this
file already uses for naming a new board/cluster, rather than a browser dialog API that was
never going to work in this runtime. Re-verified: typecheck, full suite (296/296), and
production build all still clean; boot-tested again the same way (8 electron.exe processes,
no new errors), confirmed cleanly killed afterward.

### Radial layout could push a cluster off the negative edge of the canvas (2026-09-11)

Reported from real use: after clicking "Radial," one cluster ended up somewhere unreachable
— couldn't be selected or dragged back, only fixed by undo. Root cause: the board's canvas is
a fixed-size div inside a scrolling container; overflowing its *positive* edge is harmless
(the container can always scroll further right/down to reach it), but a cluster placed at a
*negative* x/y sits somewhere no scroll position can ever reach — invisible and unclickable
by construction, not a rendering glitch. `computeRadialLayout` had no floor: a focus cluster
starting near the canvas origin (a common case — it's roughly where a newly placed cluster
lands) plus the layout's own radius could easily push a sibling's computed position negative.

Fixed with `keepPositionsOnBoard`: after either layout computes its positions, shifts the
*entire* set uniformly (preserving the relative arrangement exactly) so the minimum x/y is
never below the canvas's own origin margin. Applied to both `computeTreeLayout` (safe by
construction today, but guarded defensively against future changes) and
`computeRadialLayout` (where the bug actually lived).

Verified: 1 new dedicated test reproducing the exact reported scenario (a focus cluster near
the origin, several others around it, asserting no resulting position goes negative) — it
failed against the pre-fix code, confirming it actually catches the bug rather than just
exercising already-correct behavior. Two existing radial tests had to move their fixtures
further from the origin, since they were incidentally relying on positions the new floor now
legitimately shifts (not a sign either test's real intent was wrong — the floor is exactly the
new behavior). Full suite green (297/297), typecheck clean.

### Alignment + distribution smart guides for dragging clusters (2026-09-11)

Requested as a quality-of-life follow-up to the thematic-map work: PowerPoint/Figma-style
guides while dragging a cluster — snapping into alignment with another cluster's edge/center,
and highlighting when the gap to two others on either side is equal.

Two independent, single-axis mechanisms in boardOps.ts, since they answer different questions
and a drag can want either, both, or neither:
- **`findAlignmentSnap`** — snaps a tentative position to the nearest edge/center match
  (left/center/right on x, top/center/bottom on y) with any other cluster on the board,
  independently per axis, the same idea as `findSnapTarget`'s existing card-to-card snapping
  just against a box's edges/centers instead of whole-card proximity. Reports every guide
  actually worth drawing (re-checked against the already-snapped position), not just whichever
  one happened to win — several clusters sharing the same alignment all get a guide line.
- **`findDistributionSnap`** — for a pair of other clusters that already roughly straddle the
  dragged one on an axis, snaps its center to the exact midpoint (equal spacing on both sides).
  Only considers a pair "the same row/column" when both sit within a generous band of the
  dragged cluster's center on the *other* axis — otherwise two unrelated clusters elsewhere on
  the board could suggest a spacing relationship that doesn't visually read as one.

Combined in `computeClusterMoveSnap` (BoardView.tsx): alignment runs first, distribution only
fills in whichever axis alignment didn't already claim. A plain function, not a hook, so it
can be called identically from the live-drag preview (fed the in-progress delta) and from
`handleMouseUp` (fed the final delta) — the same "recompute fresh at drop time against the
same logic that drove the live highlight" pattern already used for nest-targets and
resize-enclosure elsewhere in this file, so a snap shown mid-drag is never subtly different
from where the cluster (and everything nested/clustered under it) actually ends up. Every
place that already tracked a moving cluster's live delta (member items, cluster-link lines,
`ClusterFrame` itself) now reads this snapped delta instead of the raw mouse delta, so nothing
visually detaches from its frame during a snap adjustment. Rendered as dashed guide lines
(full-canvas-spanning for alignment, matching Figma/PowerPoint convention) plus tick marks at
each of the three centers for a distribution match, in a dedicated accent color distinct from
every other highlight already used on the board (nest-target, enclosed-by-resize).

Verified: 9 new tests (findAlignmentSnap: edge and center matches, independent per-axis
snapping, no-match case, multiple clusters sharing one alignment each getting their own guide;
findDistributionSnap: exact-midpoint snapping, the row/column band correctly excluding an
unrelated pair, a too-far-to-snap case, x and y handled independently without cross-
contamination). Full suite green (306/306), typecheck clean, production build clean.
Boot-tested a packaged instance (no errors, confirmed via `tasklist` and cleanly killed).

### v0.2.0 released; a delete-button bug on the default board reported right after (2026-09-11)

Bumped to v0.2.0 and tagged — all three platform builds published cleanly (results-draft
export, cluster links + tree/radial layouts, and smart guides are the headline additions
since v0.1.1).

Reported immediately after: a cluster's × ("remove from board") button does nothing on the
default board, though it works fine on any other board. Root cause is the default board's own
core design (`getVisibleBoardClusters`): *every* category always shows there automatically,
whether or not it has an explicit `BoardCluster` shape yet — a category never individually
moved/resized is drawn from a synthesized "virtual" fallback with an id like
`virtual:cluster:<categoryId>`, which doesn't exist in `data.boardClusters` for `deleteCluster`
to find and remove. Worse, even a cluster that *is* materialized can't be meaningfully removed
from the default board either way: deleting its `BoardCluster` row just makes it fall back to
the same virtual auto-shown state, not disappear — the default board has no concept of "hidden"
category, by design. So the button was never going to work there, virtual or not.

Fixed by disabling the button on the default board instead of leaving it silently broken —
`ClusterFrame` takes a new `canDelete` prop (`!currentBoard.isDefault`), disabled state shown
with an explanatory tooltip pointing at the actual ways to reduce clutter there (curate a
different board, or delete the cluster/category itself from the Workspace/Analysis tab).

Also added, requested in the same report: a confirmation dialog (`window.confirm`, not
`window.prompt` — see the earlier fix in this log for why that distinction matters in
Electron) before removing a cluster from a board where it's actually possible, naming the
cluster and reiterating that only the board shape is removed, not the cluster/category itself.

Separately asked what happens deleting a *superordinate* cluster (one with nested children) —
already handled correctly and already tested: `deleteCategory` promotes its direct children to
its own parent (or to root, if it had none) rather than deleting them — nesting collapses one
level, every child keeps its own codes/notes/quotes intact. Also cleans up anything that would
otherwise point at the deleted category: notes attached directly to it fall back to a
project-level attachment, its `BoardCluster` shape on every board is removed, and (new since
the cluster-links work above) any `ClusterLink` naming it as either endpoint is removed too.

Verified: no shared/pure logic changed (this is a UI prop + a confirm dialog), typecheck
clean, full suite still 306/306, production build clean, boot-tested (no errors, cleanly
killed).

### "Add all clusters" on a secondary board never got the masonry-layout rework (2026-09-11)

Reported from real use on the 500-code/35-category test project: on a secondary (non-default)
board, "+ Add all clusters" produced a broken layout — none of the non-overlapping masonry
packing the default board gets, codes spilling out of their cluster's frame or reading as
belonging to the wrong one.

Root cause: the "large synthetic test project" rework earlier in this log ("Clusters defaulted
to a single column... Rewrote it as a multi-column masonry pack") only ever touched
`getVisibleBoardClusters` — the default board's own *live, per-render* computation. It never
touched `addAllClustersToBoard`, the bulk-add action used on every other board, which still ran
its original, much cruder logic: a fixed 4-column/240px-row grid (`computeClusterGridPosition`)
with no idea how tall a cluster's real content actually was, plus single-column member stacking.
`computeClusterSize` did scale a cluster's own height with its member count — a cluster with,
say, 15 members needed roughly 15 × 72px ≈ 1080px, nowhere near the fixed 240px row height — so
the *next* row's cluster box started well inside the previous, oversized one's footprint. Every
code was still correctly filed under its real category the whole time (a pure layout bug, not
a data one), but visually it looked exactly like the report: codes spilling into, or reading as
members of, whichever cluster's box happened to now overlap theirs.

Fixed by extracting the masonry-packed, nesting-aware, member-grid-sized algorithm out of
`getVisibleBoardClusters` into a standalone `computeCategoryLayout(categories, explicitOverrides)`
— a pure refactor first (verified byte-for-byte behavior-preserving: every one of
`getVisibleBoardClusters`' existing tests, covering the specific overlap/containment/grid-column
guarantees from that earlier rework, passed unchanged against the extracted version before
anything else changed). `getVisibleBoardClusters` now just calls it and wraps the result back
into real-or-virtual `BoardCluster`s; `addAllClustersToBoard` calls the same function to compute
real, materializable positions/sizes for whatever it's about to place — same visual quality as
the default board, not a separate, drifted-out-of-sync reimplementation. `explicitOverrides` is
new: whatever's already really on the target board gets passed in and respected, so bulk-adding
the *remaining* clusters to a partially-populated board lays them out relative to what's actually
there rather than a fresh, disconnected layout. `computeClusterGridPosition` and `computeClusterSize`
(the old fixed-grid helpers) are now dead and removed rather than left behind unused.

Segments (raw quotes filed directly under a category) are deliberately no longer auto-placed by
this action — matching `getVisibleBoardItems`' own established convention that a segment always
keeps its own explicit position rather than being auto-homed into a cluster's grid; the old code
tried to stack them into the single column too, inconsistently with how they're treated
everywhere else.

Verified: 3 new `addAllClustersToBoard` tests (8 clusters × 15 members apiece — the exact
reported scale — asserting zero cluster-cluster overlap and every member genuinely inside its
own cluster's bounds; near-square member grid confirmed via distinct-column count instead of a
single column; a bulk-add onto a board with one cluster already real correctly lays out around
it) plus 3 new direct `computeCategoryLayout` tests. Re-verified end-to-end against the actual
`LargeProjectTest.qdaproj` (500 codes, 35 categories including 5 superordinates) via a
standalone esbuild-bundled script (bundle deleted after): zero genuine sibling/unrelated
overlaps, and every parent-child "overlap" the geometry check initially flagged was confirmed to
be legitimate containment, not a bug, once cross-checked against the real ancestor relationships.
Full suite green (312/312), typecheck clean, production build clean, boot-tested (no errors,
cleanly killed).

**Caught by CI, not locally**: the v0.2.1 tag's first push failed CI's typecheck step, despite
`npm run typecheck` having been run clean locally right before committing. Cause: two of the new
tests above called the existing `rectContains`/`rectsOverlap` test helpers (typed against
`BoardCluster`) with `ComputedClusterLayout` values instead, which are missing `id`/`boardId`/
`createdAt` — `npm test` (Vitest, via esbuild) doesn't type-check at all, so it ran and passed
regardless; only `tsc --noEmit` catches this, and it hadn't been re-run after that specific
addition. Fixed by padding the two `ComputedClusterLayout` values into full `BoardCluster` shapes
before calling the shared helpers, rather than widening those helpers' types for everyone else's
already-passing 90+ call sites. Re-verified clean this time, retagged.

### Three more board gaps, found while testing this same fix (2026-09-11)

Reported in the same sitting, testing the "Add all clusters" fix above:

- **No way to delete a board at all.** `deleteBoard` (boardOps.ts) already existed and was
  already wired into the store — just never had a button anywhere. Added one next to the board
  picker, confirming first and explaining that only the board's own layout is removed (the
  underlying codes/notes/clusters are untouched); deleting the *default* board is allowed too
  (matching what the op already supported — auto-promotes another board), with the confirm
  dialog saying so explicitly.
- **"+ Add all clusters" always added member items too**, with no way to place just the empty
  frames — exactly what the earlier thematic-map work actually wants for a clean figure board
  (add clusters only, arrange them, never bring codes/notes onto that board at all). Added an
  `includeMembers` parameter (default `true`, unchanged behavior) to `addAllClustersToBoard`,
  and split the one button into two: "+ Add all clusters" (frames only) and "+ Add all clusters
  and items" (the original combined behavior). A cluster's frame is still sized as if its members
  were there either way, so it's already the right size if they get added later.
- **The real bug**: following the workflow "Add all clusters → Link → Radial/Tree," clusters
  visibly reorganized but their codes didn't move with them — reading as if they'd been unlinked
  from their cluster. Cause: `applyTreeLayout`/`applyRadialLayout` only ever called
  `applyClusterPositions`, which (by design — see its own doc comment) touches `boardClusters`
  only, never `boardItems`. A manual cluster drag already carries member items along
  (`getClusterMemberItems` in `BoardView`'s mousedown handler); the one-click layouts never got
  the equivalent treatment. Added `applyClusterLayoutWithMembers`: computes each repositioned
  cluster's delta (by *category*, since that's what a member actually belongs to — a ref in more
  than one moving category homes on the first, matching the existing multi-membership rule) and
  shifts every member code/note/segment on that board by the same amount. `applyTreeLayout`/
  `applyRadialLayout` now call this instead of the bare position-only version.

Verified: 7 new tests (`applyClusterLayoutWithMembers`: members move by the cluster's exact
delta — the reported scenario directly; items on a different board or unrelated cluster
untouched; a cluster that didn't move leaves its members alone too; `addAllClustersToBoard`
with `includeMembers: false` places only frames, still correctly sized). Full suite green
(316/316), typecheck clean, production build clean, boot-tested (no errors, cleanly killed).

### Radial was flattening nested clusters into its ring — real export caught it (2026-09-11)

Reported with an actual exported PDF: "Add all clusters" (frames only) → Radial → export, on
the 500-code/35-category test project (5 superordinates, 30 clusters). The result was a
crown of massively overlapping, oddly stretched bars — not remotely the intended thematic-map
layout.

Root cause, visible directly in the image: `computeRadialLayout` treated *every* cluster on the
board — nested ones included — as an independent point on one flat ring around a single focus.
A superordinate's nested children got scattered into the same ring as the superordinates
themselves, discarding the nesting entirely (their `↰` label still showed correctly — the
underlying data was never wrong, only the layout). Worse, superordinate boxes are often very
wide (sized by `computeCategoryLayout` to fit their own nested-children grid), and the ring
spacing only ever accounted for the *focus*'s size, not each satellite's — so wide boxes
landing near each other in the ring overlapped heavily on top of being in the wrong place at
all.

Fixed in two parts:
- `computeRadialLayout` now takes `categories` (matching `computeTreeLayout`'s existing
  signature) and only ever arranges *root* clusters in the ring — a category whose parent isn't
  also on this board, same root definition Tree already uses. Nested clusters are left out of
  the returned positions entirely.
- `applyClusterLayoutWithMembers` now cascades a moved root's delta down its *whole* descendant
  subtree — not just member codes/notes as before, but nested `BoardCluster` shapes too — so a
  sub-cluster (and everything filed under it) moves rigidly together with its ancestor,
  preserving whatever containment it already had rather than trying to recompute it. A category
  not directly in `positions` (true for every nested one under Radial; never true under Tree,
  which still positions all of them individually — a genuine branching-tree diagram is supposed
  to, unlike hub-and-spoke) inherits its nearest positioned ancestor's delta, resolved
  recursively through however many nesting levels sit in between.

Getting the ring's radius genuinely overlap-free took two attempts. The first fix (radius
accounting for the single largest satellite) still left 2 overlapping pairs on the real project
— because equal *angular* spacing doesn't guarantee equal *physical* spacing once satellite
sizes vary a lot: two large satellites can still land at adjacent angles. The actual fix solves
for the chord length between two *adjacent* ring points (`2r·sin(π/N)`) against the two largest
satellites' combined half-widths, the genuine worst case regardless of where in the ring they
end up — confirmed by re-running the same real-project check after each attempt rather than
assuming the first, more intuitive fix was sufficient.

Verified: 4 new `computeRadialLayout` tests (a nested cluster excluded from the ring entirely —
the reported bug directly; a category whose parent isn't on the board treated as its own root,
matching `computeTreeLayout`; the ring radius clearing a single large satellite; existing tests
updated to pass `categories`) plus 2 new `applyClusterLayoutWithMembers` tests (cascading a
root's delta to a nested cluster not itself in `positions`; cascading transitively through
multiple nesting levels). Re-verified end-to-end against the real `LargeProjectTest.qdaproj`
after each attempt, via a standalone bundled script (deleted after): the exact reported
workflow (`addAllClustersToBoard` frames-only → `computeRadialLayout` → `applyClusterLayoutWithMembers`)
now produces zero genuine root-vs-root overlaps, zero broken parent-child containment, and no
negative coordinates. Full suite green (321/321), typecheck clean, production build clean,
boot-tested (no errors, cleanly killed).

### Tree had the same "wrong size assumption" bug, found by checking a real project instead of moving on (2026-09-11)

Asked, before any further release, to hold off and look at three real exports side by side
(Standard / Tree / Radial) from an actual project — 6 root clusters (one, "Thèmes de codes",
containing 17 themed sub-clusters; another, "Catégories de notes", containing 2 note-type
sub-clusters with 33 and 35 notes each). Standard and Radial checked out clean against the
real category structure. Tree didn't: a parent's own child row visibly ran straight through
the parent's still-large body.

Root cause, found by reproducing the exact numbers from the real project rather than guessing
from the image: `computeTreeLayout` spaced rows using a *fixed* `TREE_LEVEL_HEIGHT` (220px),
which assumed every node was roughly leaf-sized. A cluster arriving into Tree mode keeps
whatever size it already had — for a parent with its own nested children (sized by
`computeCategoryLayout`/the default board to *contain* them), that can be far taller than
220px. "Catégories de notes" was 568px tall; its child row landed only 220px below its *top*,
so the child sat well inside the still-568px-tall parent instead of below it. This never
surfaced in this file's own unit tests because every one of them used same-size synthetic
fixtures (100×100) — exactly the case a fixed row height can't distinguish from a real,
non-uniform, containment-sized one. `computeRadialLayout`'s equivalent real-project check
(added for the previous fix) is what caught *that* bug; Tree had gone unchecked against real
data the same way until this report.

Fixed by making each depth's row start dynamic: computed as the previous row's start plus the
*tallest* node found anywhere at that previous depth (across every branch, not just its own),
plus a gap — rather than a constant multiplied by depth. `TREE_LEVEL_HEIGHT` is gone, replaced
by `TREE_ROW_GAP` (the gap between a row and the tallest node above it, not the row height
itself). Sibling branches of very different shapes still land in the same shared horizontal
rows, matching the existing (unchanged) side-by-side column placement — only the vertical
spacing calculation changed.

Verified: 2 new tests reproducing the exact numbers from the real project (a 568px-tall parent
with a 500px child — asserts the child's row clears the parent's actual bottom edge, not a
fixed offset from its top) and confirming the shared-row guarantee across branches of very
different heights. Re-verified end-to-end against *both* real test projects this time (not
just the one that surfaced the bug) via the same standalone bundled-script approach: zero
overlaps for Tree and Radial on both. Full suite green (323/323), typecheck clean, production
build clean, boot-tested (no errors, cleanly killed). Releases paused per instruction until
this was resolved — not yet re-tagged.

### "Delete board" left the New-board input unresponsive for close to a minute (2026-09-11)

Reported: after deleting a board, the "New board name…" text field wouldn't take a cursor or
accept typing for nearly a minute afterward — not visibly disabled, just unresponsive.

Investigated rather than guessed: timed `getVisibleBoardClusters`/`getVisibleBoardItems`/a
full project `JSON.stringify` against the 500-code test project — all sub-millisecond, ruling
out "the project is just big enough to be slow" as an explanation. Searched the codebase for
anything resembling a ~60-second timer — none exists (the only timer anywhere is the 1.5s
autosave debounce). With both of those ruled out, the leading remaining suspect is
`window.confirm()` itself: this session already found `window.prompt()` silently doesn't work
in Electron's renderer (a real, confirmed bug fixed earlier in this log), and `confirm()`/
`alert()` are the same category of synchronous native-dialog API, with their own documented
Windows/Electron focus-restoration quirks after the dialog closes — a plausible, if not
independently reproducible from this environment, explanation for input focus specifically
misbehaving right after a `confirm()` prompt.

Replaced "Delete board"'s `window.confirm()` with the same plain inline confirmation bar
already used for the cluster-link labeling fix (an explicit `confirmingDeleteBoard` state, a
red confirm bar with Delete/Cancel buttons, reset when the selected board changes) — removing
the one concrete suspect regardless of whether the exact mechanism is fully confirmed.
Deliberately scoped to just this one dialog rather than converting every `window.confirm()` in
the app pre-emptively (`Reset placement` on the default board, category deletion in
`ClusterRowShell.tsx` also use it) — asked the user to report whether those show the same
freeze, which would confirm it's `confirm()` itself at fault rather than something specific to
the delete-board code path, before touching call sites with no reported problem.

Verified: no shared/pure logic touched (this is a UI-only change), typecheck clean, full suite
still 323/323, production build clean, boot-tested (no errors, cleanly killed). The actual fix
still needs the user's own hands-on confirmation that the freeze is gone, since the trigger
couldn't be reproduced directly in this environment.

### A bundled example project for first-time users (2026-09-14)

Cadenza had zero onboarding: a first-time user landed on an empty project-creation screen with
no sample data, no glossary, nothing to explore before committing to their own material — a
real gap for the target audience of nursing/medical students who may never have used a QDA
tool at all, alongside trained sociologists who have.

Built a complete fictional example project rather than a toy: 3 interview transcripts (newly
qualified nurses in different settings — general ward, emergency department, care home),
coded into 195 codes and 105 analytic notes, organized into 15 clusters grouped under 3
superclusters (`Vécu émotionnel et psychologique`, `Construction de l'identité
professionnelle`, `Environnement et organisation du travail`). 3 of the 15 clusters are
`kind: 'question'` categories, demonstrating the AQA workflow (a question as the category
itself, with notes filed under it read as answers) alongside the theme-based clusters. Every
supercluster and cluster carries a real `definition`. A second board, `Carte thématique`,
lays out all 18 categories via the same `computeCategoryLayout` algorithm the app itself uses
and adds 4 labeled `ClusterLink`s, so the thematic-map feature is visible in the example too,
not just describable.

Generated programmatically (a one-off Node script, not checked into the app) rather than
hand-built line by line, given the scale: sentences from the three transcripts are extracted
into a flat pool and assigned round-robin to codes/notes as verbatim-anchored segments, so
every one of the 300 segments has a real, correctly-offset quote rather than a placeholder.
Verified referentially before shipping it: every segment's `start:end` slice matches its
stored `text`, every coding/category/note/board reference resolves, no code is orphaned or
double-owned, zero errors — and separately opened through the app's own
`readProjectFile`/`normalizeProjectData` path (not just re-parsed by the generator's own
checker) to confirm it loads exactly as a real user's file would.

Wired in as a genuine feature, not just a committed file: the project ships from
`resources/sample-projects/example.qdaproj`, copied into the packaged app's `resources/`
folder via electron-builder's `extraResources` (and read straight from the repo in dev mode).
A new "Explore an example project" link on the project-creation screen triggers a save-dialog
copy of the bundled file to a location the user owns — the shipped copy stays a clean
template every time, edits go to the user's own copy — then opens it exactly like any other
project. `.gitignore`'s blanket `*.qdaproj` rule got a `!resources/sample-projects/*.qdaproj`
exception so the file is actually tracked.

Verified: typecheck clean, full suite green (323/323, unchanged — this added no shared logic
of its own beyond the generator script), production build clean, boot-tested (no errors,
cleanly killed).

### Removing a stale entry from Recent Projects (2026-09-14)

Reported: after renaming the working folder (`Sandbox7` → `cadenza`), every entry in Recent
Projects pointed at a path that no longer existed, and there was no way to clear them out
short of manually editing the underlying JSON file.

Added a `removeRecentProject` operation (filters the entry out of the same
`recent-projects.json` the existing `add`/`get` operations already use, no new storage), a
`project:remove-recent` IPC handler, and a small "✕" button that appears on hover next to each
row in the Recent Projects list — clicking it drops just that entry, without touching (or
needing) the file it pointed to.

Verified: typecheck clean, full suite green (323/323), production build clean, boot-tested (no
errors, cleanly killed).

### Tree layout visually orphaned nested clusters from their superordinate (2026-09-14)

Reported: after clicking "Tree", a cluster nested under a superordinate cluster looked
completely disconnected from it — nothing on screen still showed the relationship.

Root cause, once traced through: nesting in Cadenza is normally shown purely by geometric
containment — a child cluster's box is drawn *inside* its parent's box, with no line needed,
which is exactly how the default board and Radial (which deliberately cascades a moved root's
delta down its whole subtree to preserve this) both display it. Tree's own layout deliberately
breaks that containment on purpose: it lays parent and children out as separate, non-
overlapping boxes in a top-down organizational-chart arrangement — itself an earlier fix (see
the Tree row-spacing entry above), since a tall parent's box used to run straight through its
own child row. Once children could no longer overlap their parent, nothing else on the board
was left showing they still belonged to it — the hierarchy became genuinely illegible, not
just differently drawn.

Added `getStructuralNestingEdges` (`boardOps.ts`): for every parent/child cluster pair present
on a board, checks whether the child's rectangle is still contained in the parent's; if not,
emits an edge to draw. Rendered as a dashed, muted line distinct from a manually-authored
`ClusterLink` (a labeled analytic relationship, not "this literally is a sub-theme of that
one") — automatic, and silent wherever containment already shows the relationship (the default
board, Radial), so it adds nothing where nothing was missing.

Verified against the real `MultiCaseTest.qdaproj` (25 categories, 19 real parent/child pairs
on a curated board): 0 edges before Tree (still contained, as expected), exactly 19 after —
one per pair, matching the project's actual nesting exactly, with zero cluster overlaps.
4 new unit tests added (no relationship when contained; an edge once laid out beside instead
of inside — the exact reported bug; a category whose parent isn't on the board at all; a
three-generation chain). Full suite green (327/327), typecheck clean, production build clean,
boot-tested (no errors, cleanly killed).

### The nesting-edge line wasn't visible enough to actually fix the reported bug (2026-09-14)

Reported again after the fix above shipped (confirmed via a fresh `npm run dev` restart, so
not a stale build): sub-clusters still looked separated/unlinked in Tree, and specifically not
in Radial — ruling out both a stale build and a design misunderstanding, and pointing at the
new connector itself.

Two real problems, found by actually measuring against `MultiCaseTest.qdaproj` rather than
guessing: the line was drawn **center-to-center** between the two cluster boxes, and — since
the connector layer paints *behind* the cards — most of that line's length was hidden behind
the boxes themselves; sampling the real project's 19 edges densely, one was over 94% covered
this way, and the styling (`#cbd5e1`, thin, dashed) made even the visible fraction easy to
miss on the rest.

Fixed both: added `boxExitPoint` (clips each end of the line to where a ray from a box's own
center toward the other box actually crosses that box's boundary, instead of running the line
all the way to the center) so the whole segment sits in the open gap between the two clusters,
never behind either one; and switched the line itself from a thin dashed `#cbd5e1` to a solid
2px `#64748b` with an arrowhead pointing at the child — unambiguous at a glance, while staying
visually distinct from a labeled, user-authored `ClusterLink` (which keeps its own arrow style
and still connects box centers, since a link is a claim about two specific points, not a
boundary-to-boundary structural edge).

Verified by simulating both the old and new line against the real project's 19 edges (dense
point sampling along each segment, checking whether it falls inside any cluster box other than
its own two endpoints): the old center-to-center line was up to 94% hidden on the worst edge;
the new clipped line is 0% hidden behind a third-party box on all 19. Full suite still green
(327/327, no shared-logic tests needed changing — this was a rendering-only fix), typecheck
clean, production build clean, boot-tested (no errors, cleanly killed).

### The real Tree bug: a parent kept its whole contains-children size once its children left it (2026-09-14)

Reported a third time, with two exported PDFs (`Carte thématique - avant/après Tree.pdf`) from
the bundled example project's own thematic-map board — the actual pixels made the real problem
obvious in a way "it looks separated" hadn't yet: after Tree, the 3 supercluster boxes stayed
their full original size (each ~2956×820, sized to *contain* 5 children in the pre-Tree
containment layout) while their 15 children moved into a thin row far beneath — three
huge, nearly empty rectangles sitting far above a sliver of tiny boxes. No connector line,
however visible, reads as "these belong together" across so disproportionate a gap. The
previous two fixes (the edge existing at all, then its clipped/arrowed visibility) were
both real improvements, but neither one touched the actual cause.

Root cause: `computeTreeLayout` never resizes a cluster (a deliberate choice from the original
row-spacing fix), so a parent's box kept whatever size `computeCategoryLayout` had given it to
*contain* its children in a normal (non-Tree) layout — a size that stops meaning anything the
moment Tree lays those same children out separately instead.

Fixed by giving a Tree "parent" node (one with a child also on the board) a resized box: its
own header plus a grid of only its *own* directly-held codes/notes, via a newly extracted
`computeOwnClusterSize` (the same formula `computeCategoryLayout` already used for a plain
leaf, now shared rather than duplicated). A leaf (no children on the board) keeps its real,
unchanged size, exactly as before. `ClusterPosition` gained optional `width`/`height` fields,
applied by `applyClusterPositions` when present — Radial never sets them, so it's unaffected.

Verified against the shipped example project's own `Carte thématique` board (the exact one in
the reported PDFs): each supercluster shrank from 2956×820 to 280×200 (its true size — none of
the 3 hold codes/notes directly, only nested clusters do), total canvas height dropped from
1720 to 636, zero cluster overlaps, and all 15 structural nesting edges still draw correctly
between the now-correctly-sized parents and their children. Also re-verified against
`MultiCaseTest.qdaproj` (2 parent nodes, both shrank, 0 overlaps, all 19 edges intact). 2 of
the existing `computeTreeLayout` tests were rewritten (their premise — a parent's *given* huge
size stays load-bearing for row spacing — was exactly the assumption this fix corrects) and 3
new ones added (a parent with no own content shrinks to a bare header; a parent that *does*
hold its own codes/notes resizes to fit those, not to an empty minimum; a leaf is left
untouched). Full suite green (329/329), typecheck clean, production build clean, boot-tested
(no errors, cleanly killed).

### The actual remaining cause: the connector SVG's drawing surface was a fixed 2400x1600 (2026-09-14)

Reported a fourth time, with a fresh exported PDF from the same board: after the resize fix
above, the 3 supercluster boxes were correctly small — but only some of the leftmost
supercluster's connector lines were visible, and none at all for the other two.

Traced by reading the user's own saved project file directly rather than guessing again: every
one of the 15 structural nesting edges computed correctly (verified their exact coordinates,
none degenerate), so the edges themselves were never the problem this time. The board's
connector layer — the `<svg>` drawing every line on the board (structural nesting edges,
`ClusterLink`s, item links, smart guides) plus the div wrapping the whole canvas — had always
been sized to a fixed `CANVAS_WIDTH`/`CANVAS_HEIGHT` of 2400×1600, regardless of how far the
actual content extended. Cluster frames are plain, absolutely-positioned divs, unaffected by
their container's declared size, so they rendered fine anywhere; but an `<svg>` element clips
anything drawn past its own declared width/height by default. A Tree layout with several
children in one shared row easily exceeds that — the reported board's real content extent was
14880×636, and 12 of its 15 children sat entirely beyond x=2400, so every connector touching
them (their structural nesting edge included) was silently invisible from the very start,
independent of any of the three previous fixes.

Fixed by computing the canvas size dynamically from the actual bounding box of every cluster
and item on the board (the same box computation `handleFitToView`/the PDF exporter already
used), with `CANVAS_WIDTH`/`CANVAS_HEIGHT` kept only as the floor for a small or empty board —
applied to the wrapper div, the `<svg>` itself, the smart-guide line spans, and the unlink-
button overlay, the four places that had hardcoded the fixed size.

Verified against the user's own saved file: actual content extent 14880×636 now yields a
14940×1600 canvas (comfortably covering everything, versus the old fixed 2400×1600 that
clipped 12 of 15 children's own boxes). No shared-logic changes this time — purely a
BoardView.tsx rendering fix — so no new unit tests; full suite still green (329/329, unchanged),
typecheck clean, production build clean, boot-tested (no errors, cleanly killed).

### "Reset placement" now works on any board — the actual missing piece, not another Tree bug (2026-09-14)

Reported a fifth time — but this one wasn't actually about Tree being wrong: shown a concrete
example ("Vécu émotionnel et psychologique" containing other clusters in the default view;
after Tree, its clusters sit outside its box, uncontained), asked directly which behavior was
actually wanted: keep Tree's node-link diagram (parent and children as separate, connected
boxes — the textbook meaning of "hierarchical tree", what's shipped) or switch to always
showing nesting as containment (boxes inside boxes, Cadenza's own convention everywhere else).
The answer: keep the node-link diagram — the real gap was that **nothing on a curated board
could ever put clusters back into a contained arrangement** once Tree, Radial, or manual
dragging had moved them there; Radial's own delta-cascade only *preserves* whatever
containment already existed; nothing *restores* it.

"Reset placement" already did exactly this for the default board (recompute its automatic
layout from scratch), but was hard-guarded to no-op on every other board, because the default
board's reset works by *dropping* every explicit cluster shape and relying on
`getVisibleBoardClusters`'s default-board-only fallback to recompute one — a curated board has
no such fallback, so dropping shapes there would just empty it out.

Added `computeNestedLayout`: every cluster already on a (curated) board gets a completely
fresh position/size from `computeCategoryLayout` — the same nesting-aware masonry pack the
default board and "+ Add all clusters" both use, where a nested cluster's box is placed
genuinely *inside* its parent's. "Reset placement" now branches on `board.isDefault`: the
default board keeps its existing drop-and-recompute behavior unchanged; any other board gets
this new nested reflow instead of being a no-op, and the button (previously hidden entirely
on non-default boards) now always shows.

Verified against the user's own saved file: computed a fresh nested layout for its 18 real
categories and confirmed every one of the 15 parent/child pairs is genuinely contained (child's
rectangle fully inside its parent's) with zero non-containment overlaps between siblings. 3 new
tests added, including one reproducing the exact reported scenario (a supercluster with no
codes of its own, holding clusters that were left separated by Tree, restored to full
containment by `computeNestedLayout`). Full suite green (332/332), typecheck clean, production
build clean, boot-tested (no errors, cleanly killed).

### Example project: codes were thematically unrelated to their quotes (2026-09-14)

Reported with a concrete example: the segment "Il faut prendre des décisions cliniques très
vite, souvent avec des informations incomplètes, et ça, ça m'a terrifié au début" — a nurse
describing the terror of fast clinical decisions under incomplete information — was coded as
"Plaisir de la relation de confiance" ("pleasure of the trust relationship"). Not a bug, but a
real quality problem: the whole point of a bundled example is to model good coding practice for
a first-time user, and a code with no real relationship to its quote actively works against
that.

Root cause: the generator (a one-off Node script, not part of the app) originally drew every
code/note's verbatim anchor from a single flat pool of sentences extracted from the three
transcripts in document order, assigned round-robin across all 195 codes regardless of which
cluster they belonged to — a purely positional assignment with zero regard for content, so a
sentence about clinical terror could land on any code in the codebook by coincidence of where
it fell in the pool.

Fixed by replacing the flat pool with an explicit, hand-picked quote list *per cluster* —
roughly 3-10 real sentences per cluster, chosen by actually reading the transcripts for what
each one discusses — with codes and notes *within* a cluster still cycling round-robin, but
only ever drawing from that cluster's own on-theme pool (92 distinct quotes total across the 15
clusters, verified to exist verbatim in the transcripts — the generator throws immediately on
any quote that doesn't literally match, which caught one typo before it shipped). A quote
naturally ends up carrying more than one code/note this way, which is realistic — a rich
passage in a real interview commonly earns several codes — rather than a defect.

Verified: the exact reported segment now codes as "Sentiment de dépassement" ("feeling
overwhelmed"), a genuine fit, in its correct cluster ("Stress et charge mentale"); spot-checked
a broader sample every 20th coding across the full set and confirmed every one lands on a
thematically coherent cluster. Re-verified referential integrity (0 errors) and reopened
through the app's own `readProjectFile`/`normalizeProjectData` path. No app source changed —
this only touched the generator script and its output file
(`resources/sample-projects/example.qdaproj`) — so the existing suite is unaffected: still
332/332, typecheck clean.

### The cluster-level fix wasn't enough either — full audit, explicit per-code mapping (2026-09-14)

Followed up: "it's better but there are still a lot of hiccups... could you run a few checks?
It's important since it's the demo project." Right — cycling *within* the correct cluster
still isn't the same as matching the specific code: dumped every one of the 300 code/note-to-
quote pairings and read them individually rather than spot-checking. Real problems turned up
immediately — e.g. "Charge mentale des transmissions" landing on a sentence about handling a
cardiac arrest (same cluster, wrong code), and, worse, several codes ("Soutien familial",
"Soutien du conjoint", "Confidence à un ancien camarade d'école", "Écoute d'un cadre
bienveillant") describing things the three transcripts never actually mentioned at all — no
family, no partner, no manager, no school friend anywhere in the original interviews, so no
quote could ever have matched them well.

Fixed properly this time: extended the transcripts with new paragraphs (append-only, so no
existing verified offset shifts) specifically covering the previously-unsupported material —
a colleague conflict, a formal medication double-check routine, family/partner/manager support,
material shortages, communication-channel specifics, and more — then replaced the per-cluster
round-robin entirely with an explicit `codeQuotes` map: all 195 codes individually paired with
the real sentence chosen by reading what that code means and what the sentence says, not by
cycling position. A quote still legitimately supports more than one code where they're near-
synonyms (realistic multi-coding), but every pairing is now a deliberate choice. Notes draw
from each cluster's own deduplicated set of quotes already assigned to its codes.

Verified by dumping and re-reading the *entire* mapping a second time (not sampling) — all 195
code pairings and a spot-check of notes across 4 clusters now read as genuine, specific
matches. Referential integrity re-checked (0 errors), reopened through the app's own
`readProjectFile` path. Generator + output file only; existing suite unaffected (332/332),
typecheck clean, production build clean, boot-tested (no errors, cleanly killed).

### Cluster-link arrows and labels were hidden behind code/note cards on the default board (2026-09-14)

Asked directly, not reported as a broken bug: on the default board, some `ClusterLink` arrows
were now visible (the earlier fixed-canvas clip was gone) but routinely disappeared behind
code/note cards — and whether that was intentional.

It wasn't, on inspection: the delete ("×") button for a cluster link had already been moved to
render *after* every card specifically so it stayed clickable over them (an existing, correctly
reasoned choice) — but the line and its label were left in the earlier, behind-everything
layer. A `ClusterLink` typically spans a whole cluster's width, so it routinely crosses straight
through however many code/note cards happen to sit in its path — unlike a plain item-to-item
link (kept behind on purpose, short and local by nature) or a Tree structural edge (usually on
a frames-only curated board with no cards to cross), a cluster link's label is the actual
analytic content of the relationship, not decoration, and losing it under a card defeated the
existing "stays legible over whatever it crosses" design intent for it.

Fixed by moving the cluster-link line + label into their own layer rendered after every card,
mirroring the reasoning already applied to its delete button. Item-to-item links and Tree's
structural nesting edges are unaffected — left in their original behind-cards layer, since
that placement's rationale (keep cards fully legible; these lines are short/local or off a
cards-free board) still holds for them.

Verified: rendering-only change (a JSX reorder, one marker def duplicated into the new layer),
no shared logic touched — full suite still green (332/332, unchanged), typecheck clean,
production build clean, boot-tested (no errors, cleanly killed).

### ClusterLink arrows clipped to cluster edges, not drawn straight through their interiors (2026-09-14)

Suggested, not reported as broken: a `ClusterLink` (the labeled thematic-map relationship,
distinct from the automatic structural nesting edges) still connected cluster *centers*, same
as before any of the connector work this session — meaning its line, and the arrowhead at its
end, visibly cut across the inside of both boxes rather than stopping at their edges. The
structural nesting edges got exactly this fix earlier (`boxExitPoint`, clipping a line to where
a ray from a box's own center toward the other box crosses that box's boundary); `ClusterLink`
had simply never been updated to use it.

Fixed by reusing `boxExitPoint` for `clusterLinkGeometries` too: both endpoints now clip to
each cluster's own edge, and the label's midpoint is recomputed from the *clipped* segment
(not the full center-to-center span), so it lands in the actual gap between two clusters
instead of potentially inside one of them.

(Also confirmed, not a bug: an arrow without a head is a `ClusterLink` explicitly marked
un-directed — the link-creation UI defaults to a directed arrow but has its own toggle for a
plain undirected line, since a named relationship like "contrasts with" doesn't always read
one-way.)

Verified: rendering-only change reusing an already-tested function; full suite still green
(332/332, unchanged), typecheck clean, production build clean, boot-tested (no errors, cleanly
killed).

### Thematic-map polish: curved edges around obstructions, parallel-link offsets, undirected dashing, cluster focus (2026-09-14)

Follow-up brainstorm from the arrow-clipping fix above, worked through as a set: undirected
`ClusterLink`s having no arrowhead was confirmed as intended (there's a UI toggle for it), and
three real ideas turned into features —

**Curved edges around an unrelated cluster.** A `ClusterLink`'s straight, edge-clipped path
could still cut straight through some *third* cluster's box that has nothing to do with the
relationship — the previous fix only stopped it from cutting through its own two endpoints.
Added `computeClusterLinkPath` (`boardOps.ts`): detects whether the straight path intersects
any other cluster on the board (`segmentIntersectsBox`, a standard segment-vs-rectangle test)
and, if so, bows the line into a quadratic Bézier curve, offset away from the obstruction by
enough to clear it. Checked against the shipped example project's own `Carte thématique` board:
all 5 real `ClusterLink`s there turn out to already cross at least one other cluster in its
current masonry layout, confirmed by running the actual detection against it rather than
assuming — every one of them now curves.

**Parallel-link spreading.** Two different `ClusterLink`s between the very same pair of
clusters would previously draw as one indistinguishable line. `computeClusterLinkPath` also
takes a stable index/count within its own pair's group and offsets each parallel link to a
different side, symmetric around the straight line — obstruction avoidance always wins over
this smaller cosmetic offset when a link needs both. Demonstrated in the example project by
adding a second, undirected relationship ("coexiste avec") between the same two clusters the
existing "aggrave" link already connects.

**Dashed undirected links.** A `ClusterLink` with no arrowhead now also draws dashed, so "this
relationship is deliberately non-directional" reads as a positive design choice rather than
something that just looks like a missing feature.

**Cluster focus.** Hovering a cluster's header now dims every other cluster frame and every
`ClusterLink` that doesn't directly touch it, leaving just that cluster and its own
relationships at full opacity — a fade (`ClusterFrame`'s new `isDimmed` prop, `transition-
opacity`), not a hide, so the rest of the map stays visible as context. Scoped to clusters and
cluster links only, not the (much busier) item-card layer, and hover-only for now — the
header's mousedown already starts a move-drag, so reliably distinguishing a plain click for a
click-to-pin variant would need its own gesture tracking, left as a possible follow-up rather
than built speculatively.

Verified: 12 new unit tests for `segmentIntersectsBox`/`computeClusterLinkPath` (straight when
nothing obstructs; bows around a real obstruction; ignores one the path never actually
crosses; symmetric parallel offsets; obstruction avoidance overriding a smaller parallel
offset; a same-position degenerate case never produces `NaN`) plus re-verification against the
real, regenerated example project (all 5 `ClusterLink`s resolve to `curved: true`, matching
independently-confirmed geometry; the new pair resolves to a 2-member parallel group). Full
suite green (342/342), typecheck clean, production build clean, boot-tested (no errors,
cleanly killed).

### A curved ClusterLink could bow off the top of the canvas (2026-09-14)

Reported right after the curve feature above shipped: on the example project's own thematic
map, some arrows were cut off — invisible above the top of the visible board.

Root cause: a curve's bow is a signed offset with no ceiling relative to the canvas's own
edges — it only had to be big enough to clear an obstruction, never checked whether that took
it past y=0 (or x=0), where there's nothing to render into (no negative scroll position, and
an `<svg>` with explicit width/height clips anything before its own origin). A link near the
top row of a board — not a rare case, since there's naturally little headroom above whatever's
already at the top — needing to bow *up* to clear an obstruction had nowhere to bow into.
Checked directly against the shipped example project: 3 of its 5 real links were computing a
negative control-point Y before this fix, an exact match for the report.

Fixed with a floor: `computeClusterLinkPath` now clamps its control point to never go below a
small margin (20px) on either axis — trading a slightly tighter curve right at the very edge
of the board for the curve always actually being visible, which matters far more than the
last few pixels of ideal clearance. Also moved `canvasSize`'s computation (which grows the
drawing surface to fit real content — see the earlier fixed-2400×1600-canvas entry) to run
*after* the cluster-link geometry and include every curve's own points, so a curve bowing
outward on the opposite (high/right) side now grows the canvas to fit it too, the same
protection the low/left side gets from the clamp.

Verified: re-ran the exact computation against the real example project — the 3 previously-
negative control points now clamp to y=20, and the whole board's connector geometry (including
every curve) stays within non-negative bounds. One existing test relocated away from the
canvas origin (it was about curving in general, not the edge case) and a new dedicated
regression test added reproducing the exact reported scenario. Full suite green (343/343),
typecheck clean, production build clean, boot-tested (no errors, cleanly killed).

### PDF export was cloning interactive UI chrome into the figure (2026-09-14)

Asked for a design/readability review of an exported thematic map, not a bug report — but one
turned up on inspection: `handleExportBoardPdf` clones `canvasRef.current` verbatim
(`cloneNode(true)`), which is the *live, interactive* canvas — every cluster's delete "×",
its color-swatch `<input type="color">`, its resize handle, every `ClusterLink`'s own delete
"×", and an item card's remove "×" all rode along into what's meant to be a clean, printable
figure.

Fixed by giving each of those a `board-export-hide` class and injecting a `.board-export-hide
{ display: none !important; }` rule into the *exported* HTML only — the live, interactive
board is completely unchanged; the rule only exists in the cloned snapshot handed to the PDF
renderer.

Also bumped the `ClusterLink` label's legibility while looking at the same figure: 11px,
default-weight text in a thin pale-bordered pill reads fine at 100% on screen, but a board
spanning several thousand px (ordinary once more than a couple of superclusters are on it)
gets shrunk a lot to fit one exported page, and a label that small all but disappears at that
scale. Bumped to 13px/semibold with a darker, slightly thicker rect border.

Verified: every intended element confirmed to carry the new class (`grep` across the three
components involved); the export path itself needs a live `BrowserWindow` to fully re-render
(Electron's `printToPDF`, not reproducible standalone the way this session's other geometry
fixes were), so this relied on the established boot-test + build discipline rather than a
full re-export. Full suite green (343/343, unchanged — no shared logic touched), typecheck
clean, production build clean, boot-tested (no errors, cleanly killed).

### Curved-vs-straight ClusterLinks as a per-board choice, and compact frames-only sizing (2026-09-14)

Two follow-ups from the design review above, both requested directly: "I can see the appeal
of curved arrows, but it can also make the whole thing harder to read" — asked for a way to
choose — plus a straight yes to the compact-sizing idea floated in that same review.

**Curved vs. straight, per board.** Added `BoardRecord.clusterLinkStyle: 'curved' | 'straight'`
(optional; missing = `'curved'`, so every existing board keeps today's behavior unless changed).
`computeClusterLinkPath` takes the style as its last argument — `'straight'` skips all
obstruction-avoidance and parallel-offset logic and always returns a plain edge-to-edge line,
accepting that a crossing or an overlapping parallel pair can happen, in exchange for a
simpler figure to read at a glance. A `Curved | Straight` segmented toggle sits next to Tree/
Radial in the toolbar, next to a new `setClusterLinkStyle` store action.

**Compact frames-only sizing.** `computeCategoryLayout` gained a `compact` parameter: every
category's own member-card space is ignored regardless of how many codes/notes it actually
holds, so a leaf sizes down to just its header (`COMPACT_LEAF_WIDTH`/`HEIGHT`, 220×48) instead
of the item-reserving default (280×200) — directly answering the review's observation that a
frames-only board's boxes read as large and mostly empty. `addAllClustersToBoard` takes a
matching `compact` argument (only meaningful alongside `includeMembers: false`), and "+ Add
all clusters" now has a "Compact" checkbox next to it, on by default. Writing the test for
this caught a real bug in the same commit: `placeCategory`'s own inner-child positioning was
still calling the non-compact `ownMemberGridSize` directly, so a compact parent's box shrank
but its children were still placed as if it hadn't — fixed the same way `computeSize` already
was.

**Test project**: the example project's `Carte thématique` board now ships with
`clusterLinkStyle: 'straight'` (all 5 links verified to resolve `curved: false`) and compact
cluster sizing (every leaf cluster confirmed 220×48, down from 950×356; each supercluster
760×204, down from 2956×820) — demonstrating both new options directly rather than just
shipping the code for them unused.

Verified: 2 new `computeCategoryLayout` compact tests, 2 new `computeClusterLinkPath` style
tests, 1 new `setBoardClusterLinkStyle` test (all passing, one catching the `placeCategory`
bug above before it shipped). Regenerated example project re-verified for referential
integrity (0 errors) and reopened through the app's own `readProjectFile`/
`normalizeProjectData` path, confirming `clusterLinkStyle` survives normalization intact. Full
suite green (348/348), typecheck clean, production build clean, boot-tested (no errors,
cleanly killed).

### Compact/Full made live, and Link clusters/Curved-Straight unhidden on the default board (2026-09-14)

Two follow-ups. First: "the Compact tick box would allow to resize on the fly... possible to
resize/return to normal size by ticking the checkbox" — the checkbox from the previous entry
only affected *future* "+ Add all clusters" clicks, doing nothing for clusters already on the
board. Replaced it with a persisted `BoardRecord.clusterFrameSize: 'compact' | 'full'` (a
`Compact | Full` toggle, matching `Curved | Straight`'s own style) — switching it now also
re-lays-out (via `computeNestedLayout`, now itself taking a `compact` parameter) and resizes
every cluster already on the board, the same way "Reset placement" already resets a curated
board's arrangement. Round-tripped Full→Compact→Full against the real example project's own
board: sizes changed exactly as expected both directions, zero unwanted overlaps either way.

Second: "the button controls for arrows aren't here [on the main board]... is that normal?" —
first pass only un-hid the `Curved | Straight` display toggle there; the user then clarified
they meant the *whole* group, "the possibility to link clusters" included. On inspection,
`createClusterLink` never had any board-type restriction at all — `ClusterLink` is a
project-wide relationship between categories (not a per-board thing), so there was never a
real reason "Link clusters" mode had to be hidden on the default board, only that it happened
to live inside the same gated toolbar block as Tree/Radial. Un-gated "Link clusters" (+ its
"Arrow" directed toggle) alongside `Curved | Straight`; left Tree/Radial gated to non-default
boards, since those *do* have a real reason — their own store actions no-op on the default
board's own automatic layout, unlike this pair.

Verified: 1 new `computeNestedLayout` compact-resize test, 1 new `setBoardClusterFrameSize`
test. Full suite green (350/350), typecheck clean, production build clean, boot-tested (no
errors, cleanly killed).

### Project backup / version history (2026-09-14)

Reflecting on "what's still missing" (asked after the user said they were happy with
v0.3.0), the gap that stood out most was: nothing protects against a bad autosave or a
mistaken overwrite. In-session undo/redo doesn't survive closing the app, and both autosave
and an explicit Save silently replace whatever was on disk. The user agreed this was worth
building ("3. could be an important addition, though" → "Sounds good, let's go!").

Built as: automatic, silent backups taken right before every save (autosave and explicit
Save both funnel through the same `writeProjectFile`, so one call site covers both), stored
under Electron's own `userData/backups/<projectId>/` — not next to the `.qdaproj` file,
where a folder of backup copies would look like clutter and could get deleted along with a
renamed/moved project. Keyed by the project's own `id` (stable across renames/moves), not
its file path. Throttled to once per 5 minutes and capped at 20 backups per project, oldest
pruned first, so rapid autosave churn doesn't fill the disk. A backup's timestamp is always
read from the file's own `mtime` at list time, never parsed back out of the filename (the
filename is just a sortable, cross-platform-safe label for a human browsing the folder).

Split the logic the same way `recentProjects.ts` already established as this codebase's
pattern for Electron-API-touching main-process modules: pure decision logic in
`shared/backupOps.ts` (`shouldCreateBackup`, `pickBackupsToPrune` — both unit-testable, no
Electron dependency) plus thin, untested glue in `main/backups.ts` (`listBackups`,
`createBackupIfDue`, actual fs calls). `writeProjectFile` calls `createBackupIfDue` wrapped
in `.catch()` — a failed backup (disk full, permissions) logs a warning but never blocks the
actual save the user is waiting on.

Restoring a backup deliberately does *not* silently overwrite the file it came from: the new
`project:restore-backup` IPC handler returns `filePath: null`, so the restored project comes
back into the store as dirty/unsaved (`ProjectStore.restoreBackup`), the same state as a
brand new project — the user has to explicitly Save As to keep it, same discipline as
`openExample`'s "copy first, never touch the original" pattern. Added a `RestoreBackupResult`
type alongside the existing `OpenProjectResult` in `shared/api.ts` since the latter's
`filePath: string` is non-nullable and doesn't fit this case.

New "History" button on `ProjectShell`'s toolbar (next to Save/Save As/Close) opens
`VersionHistoryModal`, listing backups newest-first with a human timestamp and size, each
with an inline "Restore" → "Yes, restore"/"Cancel" confirmation (no `window.confirm`) that
warns explicitly when there are unsaved changes about to be discarded from the working copy.

Verified: 9 new `backupOps.test.ts` unit tests (both interval- and pruning-edge cases: null/
under/at/past the minimum interval; under-cap/exact-excess/order-independence/zero-cap/empty-
list pruning). Full suite green (359/359), typecheck clean, production build clean,
boot-tested (no errors, cleanly killed).

### Remaining window.confirm()/alert() calls, and a real "text fields frozen" report (2026-09-14)

User report: "After deleting a code, I can't use the Create new Code, or Notes text fields for
1-2 minutes" — then, on follow-up, clarified it's actually *every* free-text field, not just
those two. CPU idle throughout; nothing else in the app is affected (buttons, scrolling, etc.
all still work).

This is the same bug BoardView's `confirmingDeleteBoard` was already introduced for (see its
own comment, from earlier in this project): a native `window.confirm()`/`alert()`/`prompt()`
dialog's known Windows/Electron focus-restoration quirk — closing one of these doesn't always
hand keyboard focus back to the web contents properly, and text inputs across the whole
window stop accepting keystrokes for a while afterward. That fix, though, only ever covered
board deletion. A grep turned up six more call sites still using the native dialog directly:
deleting a code (`CodebookPanel`) — exactly what the user hit — deleting a category from
either tree view (`ClusterRowShell`, `ClustersView`), removing a cluster from a board
(`ClusterFrame`), deleting a note category (`NotesPanel`), and "Reset placement"
(`BoardView`), plus two `window.alert()` info messages on PDF export (also native dialogs,
also worth converting even though they don't gate anything).

Converted all seven to the same inline-bar pattern `confirmingDeleteBoard` established:
a small local `isConfirming...` boolean that swaps the destructive button for an inline
Delete/Cancel (or, for `ClusterFrame`'s cramped header, a ✓/✕ pair) bar instead of firing a
dialog — same explanatory copy, just rendered in the page instead of a native window. The PDF
export messages became a dismissible banner (`exportMessage`) near the board toolbar rather
than a blocking alert. No native dialog calls should remain anywhere in the renderer now
(confirmed by grep — only comments referencing the old pattern remain).

Verified: full suite green (359/359 — this was a UI-only change, no new logic to unit-test),
typecheck clean, production build clean, boot-tested (no errors, cleanly killed). Could not
reproduce the freeze interactively (no way to drive the Electron UI from this environment),
so this is a strong-fit diagnosis based on the codebase's own prior documented instance of the
exact same symptom, not a confirmed root-cause fix — worth the user confirming it's actually
gone next time they delete something.

User confirmed afterward: "Everything works perfectly now" — the freeze is gone.

### Item/cluster delete on the default board looked broken, but only there (2026-09-14)

Two follow-up reports, both on the Main (default) board: deleting a board item just reset it
to its default position instead of removing it; the cluster frame's × looked hoverable but
did nothing on click.

Both trace to the same structural fact, already documented for clusters but not for items:
the default board always auto-shows every code, note, and category (see
`getVisibleBoardItems`/`getVisibleBoardClusters` in boardOps.ts) — there's no "not on this
board" state to fall into there. `ClusterFrame` already accounted for this (`canDelete`,
disabled with an explanatory tooltip on the default board), which is exactly what the user
hit — not a regression, just a dim, easy-to-miss disabled state with a `cursor-not-allowed`
missing, read as "unreachable." `BoardItemCard`'s own × had no such gating at all: on the
default board, clicking it deletes the item's *explicit* BoardItem row, which the board
then immediately re-derives as a virtual (auto-positioned) item again — from the outside,
indistinguishable from "did nothing but reset the position," since the card never actually
disappears.

Fixed `BoardItemCard` to compute the same kind of `canDelete` (`!isDefaultBoard`) ClusterFrame
already had, disabling the × with a matching explanatory tooltip there instead of letting the
click silently do something other than what "Remove from board" claims. Added
`cursor-not-allowed` to both components' disabled state so it reads as deliberately disabled
rather than broken.

Verified: typecheck clean, full suite green (359/359 — UI-only, nothing new to unit-test),
production build clean, boot-tested.

### Question-cluster creation was stuck to the board and Analysis tab only (2026-09-14)

User asked whether creating an AQA-style question-cluster is board-only, since typing into
Notes' own "Analytic question" field just makes a more structured note, not a question-
cluster. Checked: Analysis > Clusters already has the same theme/question selector the board
does, so it wasn't actually board-only — but two other creation spots really were stuck to
`'theme'`: the Workspace sidebar's "+ New Cluster" (`CodebookPanel`) and Notes' own inline
"+ Add cluster" (`NotesPanel`), both hardcoded `createCategory(name, 'theme', ...)`. Also
missing: notes already have "Promote to code" (turns a note's own suggested name into a new
code, applied to the note's segment) but nothing equivalent for the other half of AQA —
turning a note's own question into a formal question-Category.

Added a Theme/Question `<select>` to both hardcoded creation forms, matching Analysis >
Clusters' own wording and tooltip. Added "Promote to question-cluster" next to "Promote to
code" on each note: creates a `kind: 'question'` category named from the note's own question
(falling back to the start of its answer, same fallback "Promote to code" already uses) and
files the note under it as its first piece of evidence — shown whenever the note has a
question or an answer to name it from, unlike "Promote to code" which needs a segment
attachment (a project/document-level note has no passage to apply a code to, but can still
pose a question).

Verified: typecheck clean, full suite green (359/359 — UI-only), production build clean,
boot-tested.

### The Main board's × becomes a real, project-wide delete (2026-09-14)

Follow-up to the previous "default board delete looked broken" fix: the user's actual goal
was to be able to delete things from the board itself and have it reflect in the Workspace —
disabling the × there (the previous fix) solved the misleading-no-op problem but not what the
user actually wanted to do.

Reused the exact delete actions the Workspace panels already call (`deleteCode`, `deleteNote`,
`deleteCategory` — all pre-existing, all full project-wide deletes) and wired the Main board's
× to them instead of disabling it: on the default board, an item's × deletes the underlying
code/note from the whole project (not just this board), and a cluster's × deletes the
category itself (its codes/notes are kept, just unfiled — `deleteCategory` never touched
`data.codes`/`data.notes`, confirmed by reading it). A raw quote (segment) item keeps the
plain "remove from board" behavior even there, since it has no project-wide delete to offer
and, unlike codes/notes, was never virtualized on the default board anyway — removing it
there already worked correctly before this change.

Given this is a materially bigger action on the Main board than a plain "remove from this
board's layout" elsewhere, both confirms were redesigned as a below-the-element popover
(replacing ClusterFrame's cramped ✓/✕ header icons) with full explanatory text, and the
Main-board version is styled distinctly (red border/background, "Delete cluster"/"Delete"
button) from the plain, non-destructive removal confirm used everywhere else (slate/white).

Verified: typecheck clean, full suite green (359/359 — UI-only), production build clean,
boot-tested.

### Picking up an item on the default board could snap-link it before any drag (2026-09-15)

User report: clicking an item card on the Main board to start moving it made the card
immediately shift to the side — still draggable afterward, but "doesn't feel well." Only on
the default board's auto-packed grid layout, and never once an item had already been dragged
elsewhere. The user's own diagnosis (snap distance, items already close together at rest) was
exactly right.

`findSnapTarget` (the drag-to-link mechanic) was evaluated in both the live drag preview and
the final `handleMouseUp` commit using the *raw* delta from mousedown with no minimum — at the
very start of a drag, that delta is `{0, 0}`, so if any neighboring card already sat within
`SNAP_DISTANCE` (70px) of the grabbed one's resting position (routine in the default board's
tightly packed grid, per `computeGridPosition`), the snap fired immediately against the
original position, before the mouse had moved at all. Worse than a visual glitch: since
`handleMouseUp` ran the identical check, a plain click with zero mouse movement could commit
that snap for real — moving the item to the snapped position *and* creating a permanent
`BoardLink` to the neighbor — from what looked like an innocent click. This was actually
already flagged, if obliquely, in a comment on `CodeInfoModal` explaining why board cards use
right-click instead of double-click for their info window ("no minimum drag distance").

Added `MIN_DRAG_DISTANCE_FOR_SNAP = 4` (canvas pixels) and gated both the `displayPositions`
live-preview snap check and `handleMouseUp`'s commit-time one on having moved at least that
far since mousedown — a plain click is now a true no-op for snapping in both places (kept in
sync, since this codebase already treats "what the preview showed is exactly what commits" as
a hard invariant for drag gestures). Updated the now-slightly-stale `CodeInfoModal` comment
to reflect the small deadzone rather than claiming there's still no minimum at all.

Verified: typecheck clean, full suite green (359/359 — UI-interaction fix, not unit-testable
per this codebase's existing vitest scope), production build clean, boot-tested. Could not
drive the actual drag gesture from this environment, so — same caveat as the earlier freeze
fix — this is a well-evidenced diagnosis (the code matched the reported symptom exactly, down
to "only on the default board" and "not once already dragged"), not a confirmed fix; worth the
user checking it's actually gone.

### A different item jumping onto the one just clicked, inside a cluster (2026-09-15)

Immediate follow-up report: clicking an item *inside a cluster* on the Main board made a
*different* item jump onto the one being clicked — the clicked one was still draggable, but
another sibling had moved on top of it.

Root cause, in `getVisibleBoardItems`: a cluster's still-virtual (never-dragged) members get
their grid slot from `nextPositionInCluster`, a counter that only incremented when actually
called — and `placeRef` only calls it for members that are still virtual, short-circuiting to
the member's own stored position the moment it's explicit. Clicking a virtual item on the
board materializes it into a real `BoardItem` at its own current position (`BoardItemCard`'s
mousedown handler, from the earlier session's work) — on the very next render, `placeRef`
takes the explicit branch for that member and never calls the counter for it, so every OTHER
still-virtual sibling that comes after it in iteration order (project-wide code order, then
note order) gets a slot number one lower than before — the second member drops straight into
the first member's slot, landing exactly on top of it.

Replaced the live, order-dependent counter with a slot precomputed for every member of a
cluster up front, independent of which ones happen to already be explicit — a member's slot
number in the grid no longer depends on how many of its siblings have or haven't been touched
yet. Added a regression test (`materializing one member does not move its still-virtual
siblings onto each other`) that reproduces this exactly: verified it fails against the old
implementation (reverted it briefly to confirm — `expected 60 to be 248`, i.e. the sibling
dropped into slot 0) and passes with the fix.

Verified: 1 new test (360/360 total), typecheck clean, production build clean, boot-tested.

### Snap-linked codes inside a cluster: hanging links, reflowing siblings, vanishing unlink controls (2026-09-15)

Immediate follow-up, three symptoms at once: (1) snap-linked codes inside a cluster
"don't move harmoniously" — one snaps into place, the others stay "linked but hanging",
drawing a messy tangle of lines; (2) dragging a linked group can move *other*, unrelated
items in the same cluster; (3) a link's unlink "×" sometimes just disappears. The user's own
read on (1) — "only one code gets autosnapped, leaving the others hanging" — pointed straight
at it.

**Root cause of (1) and (3):** `findSnapTarget`'s candidate pool is every *visible* item on
the default board, virtual ones included — so dragging item A onto still-virtual item B and
releasing creates a `BoardLink` whose `itemBId` is literally the string `"virtual:code:<id>"`,
not a real, persisted `BoardItem` id (`linkItems` in boardOps.ts stores whatever id it's
given, no validation). Two things follow from that: until B is ever touched on its own, its
rendered position comes from the cluster's own auto-grid slot — nothing to do with "stay next
to what it's linked to" — so the line drawn between A and B stretches wherever the grid
happens to place B, not a snapped pair (symptom 1). And the moment B *is* later dragged on its
own, it materializes under a brand-new real id (a fresh `nanoid()`), silently orphaning the
old link: `linkGeometries` in BoardView.tsx looks up both endpoints in the current item list
and returns `null` — skipping rendering entirely — the instant either one fails to resolve
(`if (!a || !b) return null`), so the connector line *and* its unlink control both just vanish
(symptom 3).

Fixed at the point a link is created (`handleMouseUp`'s item-drag branch): if the snap target
is still virtual, materialize it (`addItemToBoard`, at its own current position) before
linking, so `linkItemsAction` only ever receives two real ids. Every link created from now on
has stable endpoints; this doesn't retroactively repair links already broken in an existing
project (unlink and re-link those once the fix is live).

**Root cause of (2):** a `BoardLink`'s member list (`getLinkedGroup`) can include a
still-virtual id too, and moving the whole group calls `moveItem(memberId, …)` for each one —
but `moveItem` just maps over `data.boardItems` looking for a matching id, and a virtual item
was never added there, so the call is a silent no-op for it. That member simply doesn't move
with the rest of the group — the actual mechanism behind "hanging" in symptom 1. (The link-
creation fix above prevents this going forward, same as symptom 3, since a link's members are
never virtual once created under the fix.)

Separately, real (2): a linked group crossing into a cluster it wasn't already a member of
grows that cluster's total membership (`assignItemToCluster`), which changed its packed-grid
column count (`packGridColumnCount`) and therefore reflowed every *other*, untouched virtual
member's position — purely as a side effect of a drag the user never meant to apply to them.
Root-caused in `getVisibleBoardItems`: the column count was based on every declared member of
the category, when only still-virtual ones actually occupy a grid slot (an explicit member
renders at its own stored position regardless). Changed it to count virtual members only, so
an explicit member joining or leaving a cluster's membership no longer perturbs its siblings.
The cluster's own box size (`getVisibleBoardClusters`) still sizes off total membership, so
this is always safe against overflow (virtual-only count is never larger).

Verified: 2 new regression tests, each confirmed to fail against the pre-fix code before
passing with it (`expected 436 to be 60` for the column-count one). Full suite green
(361/361), typecheck clean, production build clean, boot-tested. As with the last two
board-interaction fixes, this environment can't drive the actual mouse gestures, so this is a
well-evidenced diagnosis (every symptom traced to code that matches it exactly) rather than an
interactively confirmed fix.

### Reverting the column-count fix: it traded a reflow bug for an overflow bug (2026-09-15)

The previous entry's "virtual-only count" fix for goal (2) — stopping a cluster's column
count from reacting to explicit members joining/leaving — turned out unsound, caught almost
immediately: "on simply clicking a code, another code (not linked) in the same cluster can
move in a seemingly random position, even out-of-cluster."

The claim that it was "always safe against overflow… since virtual-only count is never
larger [than total]" was wrong — it only guarantees enough *width*, not enough *height*. A
member's slot number (from the same-day `memberSlotByRef` fix) is stable and sparse: it can
be as large as `total member count - 1` for that cluster, regardless of how many members are
still virtual. Dividing a slot that large by a column count sized for only the *virtual*
members (much smaller once most of a cluster's members are explicit) sends `row = slot /
columnCount` far past what the cluster's own box was ever sized for — a virtual member with a
late slot number renders many rows below the cluster, reads as "random" or "out-of-cluster".

Reverted the column count back to every declared member (explicit included) — the same value
`ownMemberGridSize` uses to size the cluster's own box, so a slot number that can range up to
`total - 1` always maps back into a row the box actually has room for. This restores
correctness (no overflow, no collision) but reopens goal (2) from two fixes ago: a linked
group crossing into a cluster can still reflow its other, untouched members. A genuinely
sound fix for that needs the auto-layout to remember which members it already committed to a
slot rather than recomputing purely from current state each render — a bigger change than
warranted for a same-day follow-up; left as a known, milder limitation rather than risking
another unsound quick fix.

Replaced the (now half-false) "does not repack its still-virtual siblings" test with one that
asserts the property that actually matters: a virtual member stays inside its cluster's own
box even once most of its siblings are explicit. Confirmed it fails against the reverted
code and passes with the fix. Full suite green (361/361), typecheck clean, production build
clean, boot-tested.

### Keeping a linked group in one cluster together (2026-09-15)

User's own proposed fix for the reopened "dragging a group into a cluster can leave it split"
limitation from the last entry: "make sure linked items stay in the same cluster, even if the
list of items spills to another cluster — take the top item as an indicator."

The per-member cluster-reassignment loop in `handleMouseUp` checked each group member's own
final position against cluster bounds independently. A snapped-together list of linked items
is wide/tall enough (each member offset from the last by a card width or height, per the snap
gap) that a trailing member can land outside the cluster the group otherwise reads as
"entering" — or even inside a *different* cluster — while the item at the top of the list sits
clearly inside it. Checking each member independently could then genuinely split one linked
group's membership across two categories from a single drag.

Extracted a new pure function, `resolveGroupClusterReassignment` (boardOps.ts): picks the
topmost group member by start `y`, and decides old/new cluster membership for the *entire*
group off that one member's start/final position, rather than letting each member vote for
itself. `handleMouseUp` now applies that single verdict uniformly to every member of the
group. Chose "topmost" specifically because a rigid group's relative vertical order is
preserved for the whole drag (same delta applied to everyone), so it's a stable, unambiguous
reference regardless of which member was actually grabbed.

Verified: 4 new unit tests for the extracted function (empty group; a trailing member landing
inside a *different* cluster than the top member — the concrete split scenario reported;
leaving a cluster; no-op when the reference member's cluster doesn't change). Full suite green
(365/365), typecheck clean, production build clean, boot-tested.

### Full review of the snap/link/auto-sort logic (2026-09-15)

Requested review, after a run of fixes today, of the whole item-in-cluster
snap/link/auto-layout system for soundness. Re-read `getVisibleBoardItems`'s slot/column-
count math, `findSnapTarget`, `getLinkedGroup`/`linkItems`/`unlinkItems`, the whole drag
lifecycle in BoardView.tsx (`onStartDrag`, the live preview, `handleMouseUp`), the delete
flows, and `categoryOps`' membership helpers — confirming the day's fixes compose correctly
together and worked out the safety argument for the current column-count formula precisely
(it's provably bounded by the same total every member's stable slot number can range across,
matching `ownMemberGridSize`'s own box-sizing formula exactly — including the multi-membership
edge case, where a ref homed elsewhere still can't push a slot number past that same total).
Also confirmed `assignItemToCluster`/`materializeCluster`'s dedup is safe to call once per
group member within one batch (each read fresh store state synchronously, so a second call
in the same batch finds the cluster the first call just created rather than duplicating it).

Two things came out of the read:

1. A stray, now-inaccurate comment in `BoardItemCard.tsx` still said "findSnapTarget has no
   minimum drag distance" — the identical comment in `CodeInfoModal.tsx` was updated for the
   `MIN_DRAG_DISTANCE_FOR_SNAP` deadzone earlier today, but this duplicate copy was missed.
   Reworded to match.

2. A real gap: cluster-move (dragging a cluster frame) already materializes every member item
   up front before moving them, specifically because a still-virtual member has nothing in
   `data.boardItems` for `moveItem` to find — established, working precedent for exactly the
   "moveItem is a silent no-op for a virtual id" problem diagnosed twice today. Item-group
   drags (`onStartDrag` for a snap-linked group) never got the same treatment: it materializes
   only the directly-grabbed card. Today's link-creation fix guarantees a link made from now
   on always connects two real items, so a *freshly* linked group can't contain a virtual id
   — but a link left over from *before* that fix still could, and dragging it would silently
   fail to move that member (the same "hanging" symptom from two entries back, just for a
   legacy link instead of a brand-new one). Made item-group drags materialize every member up
   front too, matching cluster-move's own pattern, so a group drag no longer depends on every
   link in it having been created after today's fix.

Verified: typecheck clean, full suite green (365/365 — both changes are comment/UI-interaction
only, nothing new to unit-test), production build clean, boot-tested. No other unsoundness
found in this pass; the remaining known limitation (a linked group entering a cluster can
still reflow that cluster's other, untouched virtual members — see two entries back) stands
as a deliberate, documented tradeoff rather than an oversight.

### A freshly-snapped code wasn't actually joining the cluster it snapped onto (2026-09-15)

Follow-up report, a day after "top item decides the whole group's cluster": codes that
snap-linked to a cluster member and visually overflowed the cluster's edge stayed "outside"
it through Reset Placement — meaning they were never actually added as members of that
category, only visually parked next to one.

Root cause: `resolveGroupClusterReassignment` (yesterday's fix) runs against
`state.groupItemIds`, which comes from `getLinkedGroup(links, draggedId)` — the group as it
existed *before* this drag. The very first time two codes snap together, the link that would
make them a "group" doesn't exist yet; `linkItemsAction` creates it further down in the same
handler, *after* the cluster-membership decision had already run using only the dragged item
by itself. So the freshly-snapped target's own final position (not the dragged item's) decided
whether it individually happened to still be inside the cluster — the "top item decides for the
whole group" rule never got a chance to apply to it, because it wasn't recognized as part of
the group yet.

Reordered `handleMouseUp`: resolve (and materialize, if virtual) the snap target *before* the
cluster-membership decision, and fold it into the group `resolveGroupClusterReassignment` sees
— using the target's own current position as both its "start" and "final" position, since it
doesn't move during this drag. The reassignment (and subsequent membership calls) now applies
uniformly across the dragged group *and* whatever it just snapped onto, so a code snapped onto
an existing cluster member is immediately recognized as belonging to that cluster too, not just
the next time the pair happens to get dragged together again.

Verified: typecheck clean, full suite green (365/365 — this is BoardView-side orchestration
of the already-tested `resolveGroupClusterReassignment`, not new pure logic of its own),
production build clean, boot-tested.

### Reassignment left stale multi-membership behind, confirmed via before/after PDF export (2026-09-15)

Not fully fixed: the user attached "Before"/"After Reset Placement" PDF exports of the Main
board showing linked codes still landing outside their cluster after reset — some even in a
*different* cluster entirely. Text-extracted the PDFs first (labels came through, but not
spatial layout, so that alone wasn't enough to diagnose) before re-reading the reassignment
code with the specific "ends up in another cluster" detail in hand.

Root cause, in the reassignment loop added two entries back: it only ever unassigned a member
from `reassignment.oldCluster` — the *reference* (topmost) member's own old cluster — before
assigning everyone to the new one. But a group can easily contain a member that was already in
a *different* category than the reference member (linked in from elsewhere, or already sorted
into another cluster) — unassigning it only from the reference member's old cluster left it
still listed under its own real previous category too. Multi-membership was never a supported
state for a board ref (it occupies one spatial position), so nothing crashed — it just meant
Reset Placement (which derives a ref's cluster purely from category membership, not visual
position) picked whichever category happened to come first in the project's own `categories`
array order, not necessarily the one it visually sat in. Explains both symptoms at once: an
overflowing code reads as "outside" when its stale category isn't shown clustered at all
(already reset out of it), or as "in the wrong cluster" when its stale category happens to sort
before the correct one.

Given this is the second bug found in the same reassignment code in two days, extracted the
fix into a proper tested pure function rather than another inline patch: `categoryOps.ts` gains
`reconcileSoleCategoryMembership(data, refType, refId, targetCategoryId)` — removes a ref from
every category except the target (or every category, if the target is null) — with its own
store action, replacing the ad-hoc per-member category scan that was inline in `handleMouseUp`.
Every ref in the reassigned group now gets reconciled against *every* category it's actually a
member of, not just the reference member's own old one.

This doesn't retroactively repair a project's already-existing stale multi-memberships from
before this fix — those clear up the next time that specific code is involved in a drag that
triggers a reassignment (touching it at all is enough; it doesn't need to actually move).

Verified: 4 new unit tests for `reconcileSoleCategoryMembership` (drops every other category,
keeping only the target; drops from every category when the target is null; no-op when already
sole-member; refType isolation — a code and a note sharing an id in different categories don't
cross-contaminate). Full suite green (369/369), typecheck clean, production build clean,
boot-tested.

### Cluster auto-layout: a materialize-first-touch fix for reflow, plus ancestor/self growth (2026-09-15)

Three more reports at once: (1) dropping an item into an already-placed cluster that's too
small lets its existing member cards spill outside the box, instead of the box growing to fit;
(2) resizing a nested cluster leaves its superordinate frozen at its old size, even once the
child no longer fits inside it; (3) resizing (or moving) one cluster can shove a completely
different, untouched cluster into overlapping a third one. Confirmed directly against the
user's own repro for (3): three clusters nested inside a superordinate, one on the first row,
two on the row below — resizing the first one moved the third one on top of the second.

**Root cause of (3), the deep one:** `computeCategoryLayout`'s auto-layout for any category
without an explicit `BoardCluster` shape packs it via a masonry algorithm — each column tracks
its own running bottom edge, and every category goes into whichever column is currently
shortest. That makes a still-virtual category's computed position depend on the sizes of every
sibling processed before it *in that same pass* — so between two renders, pinning (or just
resizing) one sibling changes what the algorithm hands back for the others, even though nothing
about them was touched. Reproduced directly as a new test in `getVisibleBoardClusters`: pinning
one of three root categories to a much taller height moves a third, completely untouched
sibling's own computed position, purely as a side effect. This is the exact same root-cause
*category* (a live-recomputed auto-layout reacting to unrelated state changes) as two earlier
fixes this session (item cluster-slots, item cluster-membership) — this time at the cluster
level, and for children of *any* parent (root-level or nested), since the masonry algorithm is
identical at every level.

Fixed with the same strategy as those earlier fixes, generalized: the moment any cluster in a
packing group is about to be individually resized or moved — about to become explicit, if it
isn't already — snapshot the *whole* group (every sibling sharing its `parentCategoryId`, root
or nested) into real, pinned shapes at wherever the auto-layout currently has them. New pure
function `materializeSiblingClusters` (boardOps.ts) does this; once pinned, `computeCategoryLayout`
always trusts an explicit shape over recomputing it, so every member of a stabilized group
becomes permanently immune to future reflow from anything else in the group.

**Fixes for (1) and (2):** two more new pure functions. `growClusterToFitOwnMembers` grows
(materializing, if still virtual) a cluster's own box to fit a grid of its current membership,
if it isn't already big enough — called after a board drag assigns a new member into a cluster.
`growAncestorClustersToFit` walks up a cluster's parent chain, growing (and materializing) each
ancestor just enough to keep containing it, transitively — called after any operation that can
grow a nested cluster's own size (a manual resize, or growClusterToFitOwnMembers itself).
Wired `materializeSiblingClusters` + `growAncestorClustersToFit` into both the cluster-resize
and cluster-move commit handlers (replacing the old resize handler's bare `resizeCluster` call,
and the move handler's old immediate-parent-only accommodate logic — `growAncestorClustersToFit`
propagates further up too); wired `growClusterToFitOwnMembers` + `growAncestorClustersToFit`
into the item-drag cluster-reassignment commit.

One padding-convention subtlety surfaced writing the tests: `computeAccommodatingSize` (already
used for the "cluster dropped into another" case) assumes a child's position could be anywhere
relative to its destination, so it pads both edges; `computeCategoryLayout`'s own nested-child
placement already reserves padding on one side via a fixed inner offset. Reusing
`computeAccommodatingSize` for `growAncestorClustersToFit` means a freshly-computed, already
"just barely fits" parent/child pair isn't a byte-exact no-op — it'll grow by one extra padding
amount the first time. Harmless (marginally roomier than the bare minimum, only on first
growth) but worth noting for anyone touching this code later; two of the new tests had to be
adjusted to use a deliberately generous fixture rather than relying on that exact match.

Verified: 11 new unit tests across `materializeSiblingClusters`, `growClusterToFitOwnMembers`,
and `growAncestorClustersToFit` (including the reproduced reflow-instability documentation
test), plus 1 in `getVisibleBoardClusters` itself. Full suite green (381/381), typecheck clean,
production build clean, boot-tested. As with other board-interaction fixes this session, this
environment can't drive the actual mouse gestures — worth the user confirming against their own
repro (the three-clusters-in-a-superordinate case) once it's live.

### The same reflow class, one level down: item slots within a cluster (2026-09-15)

Immediate follow-up, same day: "I move a code from cluster 1 to cluster 2 and link it with a
code from cluster 2. I release my click. A code from cluster 1 or 2 will jump right onto
another code from the same cluster." Exactly the cluster-level reflow bug just fixed, one
layer down — `getVisibleBoardItems`' *member* grid (a cluster's own codes/notes, not the
cluster boxes themselves) uses the identical "slot number = rank in a fixed project-wide
order among currently-homed members" scheme. A member's own virtual→explicit transition can't
shift that ranking anymore (this morning's fix), but a member actually *joining or leaving* the
counted set absolutely still can — every other still-virtual member's rank (and therefore
pixel position) shifts to fill the gap or make room, and if a sibling is already explicit
(frozen at an old rank's position), a reflowed one can land exactly on it.

Confirmed by brute-force search rather than by hand: hand-derived scenarios kept landing on
non-colliding configurations (slot numbers are provably unique within one computation, so a
direct collision needs a specific coincidence between the departure/arrival point, which
member is explicit, and how the resulting slot+column-count maps back to pixels) — fuzzed
member counts, which member is explicit, and the joining ref's position in the project's code
order against the *un-fixed* reassignment logic, and it turned up real collisions quickly (a
2-member cluster with one member explicit, the incoming ref ordered before both, reliably
lands the virtual one exactly on the explicit one).

Same fix strategy as the cluster-level one, one level down: new `materializeClusterMemberItems`
(boardOps.ts) pins every still-virtual code/note member of a category to a real BoardItem at
its current computed slot position — called for a category right *before* its membership is
about to change. New `reassignRefCategoryMembership` composes this with the existing
`reconcileSoleCategoryMembership`: stabilizes every category a ref is about to leave, reconciles
membership, stabilizes the category it's about to join, then adds it. Replaced BoardView's
former two-call sequence (`reconcileSoleCategoryMembership` + `assignItemToCluster`) with this
single call, and folded its own explanatory comment into the new call site.

Verified: 5 new unit tests (`materializeClusterMemberItems` pins every virtual member at its
current position / skips already-explicit ones / no-ops for an unknown board or category;
`reassignRefCategoryMembership` moves membership correctly / unclusters when the target is
null), plus the fuzzed collision reproduction as a 6th, confirmed to fail against the
un-stabilized `reconcileSoleCategoryMembership` + `addMemberByRefType` sequence before passing
with the fix. Full suite green (387/387), typecheck clean, production build clean,
boot-tested.

### Pinning a cluster's members without pinning the cluster itself (2026-09-15)

Immediate follow-up to the item-slot fix above: "I moved an item from a cluster to another,
the source cluster (with 1 item less) autoresized but left the rightmost item outside of the
newly resized cluster, even though it still belongs to it." The very fix from the previous
entry caused this one: `materializeClusterMemberItems` pins a cluster's *members* at their
current positions before a membership change, but left the cluster's own *box* alone. A
still-virtual box's size is `computeOwnClusterSize(category)`, recomputed fresh from the live
membership count on every render — the instant a member actually leaves, the box shrinks to
fit the smaller count, with no idea that the remaining member's card was just pinned for the
grid the box had a moment ago, before it shrank.

Fixed by having `materializeClusterMemberItems` pin the cluster's own box too, at its current
(pre-change) size, right alongside its members, if it isn't already explicit. From that point
the box can only grow (via the existing `growClusterToFitOwnMembers`/`growAncestorClustersToFit`),
never shrink out from under members that were just frozen relative to it — keeping the box and
its pinned members permanently consistent with each other.

Verified: 1 new regression test (moving a member out of a 2-member cluster keeps the source
box at its original size and the remaining member fully contained in it), confirmed to fail
without the box-pinning addition before passing with it. Full suite green (388/388), typecheck
clean, production build clean, boot-tested.

### Un-nesting a cluster never stabilized the group it rejoined (2026-09-16)

User attached before/after PDF exports of the Main board: "I just moved the Note Thematique
cluster out of its superordinate cluster and what happened is a disaster. Arrows appeared
seemingly out of nowhere and clusters jumped one on another."

Root cause, in the cluster-move commit handler: the stabilization call added for the
"resizing/moving one cluster reflows an unrelated one" fix was gated behind `if (target && …)`
— only running when the drag landed the cluster *onto* a new parent. Dropping it on empty
space (or shift-dragging it, the explicit un-nest gesture) sets `target`/`newParentId` to
`null`, skipping the gate entirely — so un-nesting a cluster rejoined the board's root-level
masonry-packed group without ever stabilizing the other, still-virtual clusters already in it.
Every other root cluster's grid slot was free to reflow as a result — some landing on top of
each other (the "clusters jumped one on another"), and if a reflowed cluster's own EXPLICIT
child (frozen at its old position, from before the reflow) no longer sat inside its parent's
NEW computed box, `getStructuralNestingEdges` started drawing a connector line for that
completely unrelated pair — a structural nesting edge that's normally invisible (the child sits
properly inside its parent) suddenly appearing once reflow broke that containment, read as
"arrows out of nowhere."

Consolidated the shift-key (explicit un-nest) and normal (drop-to-target) reparent branches
into one decision, and moved the stabilization + ancestor-growth calls outside the `if
(target)` gate so they run whenever the parent actually changes — *to* a new cluster's children
group, or *to* the board's own root-level group when un-nested — not just the nest-into-
something case. `growAncestorClustersToFit` already no-ops gracefully when the new parent is
null (nothing to grow), so this required no changes to either pure function, only to when
BoardView calls them.

No new pure-function logic (the two functions this composes are already tested); verified via
the full suite, typecheck, production build, and boot-test. Reviewed every remaining
materializeSiblingClusters/growAncestorClustersToFit/growClusterToFitOwnMembers call site in
BoardView.tsx afterward to confirm none of the others have the same "only gated for one
direction of a two-way transition" shape.

### Resizing a cluster to enclose several others at once (2026-09-16)

User attached before/after PDF exports again: "The only thing I did is resizing the large
superordinate cluster so it now encapsulates 'Note Thématique', 'Convivialité', and
'Reconnaissance'. The result is messed up clusters inside (overlapping positions) and
clusters being forced out the supercluster and linked with previously unexisting arrows."

Different code path from the last two fixes: resizing a cluster large enough to fully enclose
several others (`findClustersEnclosedBy`, "draw a box around them") nests each one with a bare
`reparentCategory` call, once per enclosed cluster — no stabilization step exists for this
path at all (unlike single-cluster nesting via drag-onto-another, which already pins the
destination). Each newly-enclosed cluster keeps whatever absolute position it had *before*
joining this parent, which has nothing to do with the parent's own children-grid layout. A
cluster that gets enclosed by a resize has almost always been individually touched already (it
had to exist somewhere on the board first) — reproduced directly: with one of three enclosed
clusters already explicit at a position far outside the new parent's box, `getVisibleBoardClusters`
left it exactly there after reparenting (`rectContains` against the parent: false) while the
other two, still virtual, packed fresh into the parent's own top-left grid slots — not
necessarily colliding with the far-away one, but absolutely escaping the supercluster's own
bounds ("clusters being forced out"), and — since a child no longer spatially contained in its
parent is exactly what `getStructuralNestingEdges` draws a connector for — surfacing as a
"previously unexisting arrow" between that stray child and its new parent.

New `renestClustersCleanly` (boardOps.ts): for a batch of clusters newly nested into the same
parent at once, drops each one's own explicit shape first, then pins the parent's *entire*
children set — new arrivals and whatever was already there — one at a time through the fresh
children-grid computation (same "each later one accounts for what's already been pinned"
mechanism `materializeSiblingClusters` uses), so the whole group ends up as a clean,
non-overlapping grid, fully contained in the parent, and immediately stable. Finishes by
growing the parent (and its own ancestors) to fit via the already-tested
`growAncestorClustersToFit`. Wired into the resize-commit handler's enclosure loop, replacing
the bare `reparentCategory` calls.

Verified: 3 new unit tests (packs a mix of explicit/virtual newly-enclosed clusters into a
clean, contained, non-overlapping grid; grows an undersized parent to fit; leaves an
already-correctly-placed sibling that wasn't part of this batch untouched) — confirmed the
first scenario really would have escaped the parent's bounds under the old bare-reparent
approach before writing the fix (no inter-sibling overlap in that particular synthetic case,
but a clear containment failure, matching "forced out of the supercluster"). Full suite green
(391/391), typecheck clean, production build clean, boot-tested.

### The reverse of enclosing: shrinking a cluster below an existing child (2026-09-16)

Same PDF-attached repro pattern, immediate follow-up: "I just resized the superordinate to
exclude the rightmost cluster it previously enclosed... A stray arrow appeared, although I
would have expected the cluster to just be detached from its enclosing supercluster."

The mirror image of the previous fix, and just as unhandled: the resize-commit handler had
logic for a cluster *growing* to newly enclose others (`findClustersEnclosedBy` +
`renestClustersCleanly`), but nothing for the reverse — a cluster *shrinking* below an
*existing* child it already contained. That child's `parentCategoryId` stayed exactly as it
was; only the spatial containment broke. Since `getStructuralNestingEdges` draws a connector
line specifically whenever a child isn't spatially contained in its parent (originally added
so Tree layout could show a nesting relationship without literal containment), the previously-
invisible edge for this pair suddenly appeared the moment the resize broke containment — the
"stray arrow."

New `detachOrphanedChildren` (boardOps.ts): after any resize, checks every *existing* direct
child of the resized cluster against its new box; any that's no longer contained gets
un-nested (`reparentCategory` to null) — not moved at all, since it's already sitting exactly
where it visually is, only the data-model relationship changes to match. Reuses
`materializeSiblingClusters` to stabilize whatever group (another cluster's children, or the
board's own root level) each detached child rejoins, same as any other parent change this
session. Wired in as an unconditional call right after the existing "enclose new children"
handling in the resize commit — a safe no-op when a resize only grew the box and nothing was
orphaned.

Verified: 4 new unit tests (detaches a child that no longer fits without moving it; leaves one
that still fits nested, a true no-op by reference equality; detaches every orphaned child in
one resize, not just one; no-ops for an unknown board/category). Full suite green (395/395),
typecheck clean, production build clean, boot-tested.

### Enclosing several clusters at once could still leave one looking vanished (2026-09-16)

Next report, same PDF-pair pattern, on the very fix from the previous two entries: "Now, when
I expand the supercluster to enclose the four clusters to the right, look what happens. One
cluster totally just vanishes along with its items. One behaves fine. Two have the items stay
in place, but the cluster disappears."

Root-caused by re-deriving `renestClustersCleanly`'s exact sequence for a category with
already-individually-dragged member items. It correctly drops each newly-enclosed category's
own *frame* and repacks it fresh into the parent's children grid — but a member card that was
already explicit (dragged individually at some earlier point, independent of ever touching the
cluster's own frame) has its position computed once, at pin time, directly from its cluster's
box coordinates (`positionForSlot` in `getVisibleBoardItems`) — it never moves again on its
own. Re-nesting relocates the frame (from wherever it rendered before — usually a root-level
position, packed among unrelated siblings — to a fresh spot inside the parent) without
touching `boardItems` at all, so any already-pinned member is left stranded at its old,
now-unrelated coordinates: the frame reappears (correctly) inside the supercluster, empty,
while its item sits alone somewhere else with no frame around it — exactly "items stay in
place, cluster disappears." A category with *no* individually-dragged members (still fully
virtual) doesn't hit this at all, since virtual items recompute their position from their
cluster's *current* box on every read — matching "one behaves fine."

Fix: `renestClustersCleanly` now also drops the `boardItems` entries for every
newly-nested category's own codes/notes, alongside dropping the cluster frames themselves, so
they fall back to virtual and recompute fresh against the frame's new position — the same
"reset so it recomputes consistently" pattern `resetDefaultBoardClusterLayout` already used for
a full-board reset, just scoped to only the categories actually being relocated by this resize.

Verified: new regression test pins a code explicitly at an arbitrary far-away position, nests
its (virtual-frame) category under a resized supercluster via `renestClustersCleanly`, and
confirms the item ends up positioned inside the category's new frame instead of stranded at the
old coordinates — confirmed to fail (item still at the stale position) with the fix reverted,
passes with it restored. Full suite green (396/396), typecheck clean, production build clean,
boot-tested.

The reported "one cluster totally vanishes along with its items" (as opposed to just the frame)
wasn't independently reproduced — it's most likely the same mechanism, just for a category
whose *frame* also happened to be explicit and far away (rather than virtual), which the fix
above covers identically since the frame-drop already existed; kept in mind as the first thing
to re-check if a variant of this is reported again after this fix.

### The masonry packer's real bug: overrides only "worked" by iteration-order luck (2026-09-16)

Immediate follow-up, on the very fix above: "it works better now, BUT now the clusters don't
disappear, they're dropped right into another existing cluster within the superordinate one...
make sure clusters don't end up piling one into the other. If there's already a cluster
present, use the neighboring space in the inner grid."

Went looking for the root cause directly this time instead of reasoning about it purely from
the report, since the previous several rounds had each turned up a *different* bug in the same
area — wrote a throwaway test reproducing "one pre-existing explicit sibling + several
newly-enclosed virtual ones" and printed the actual output. Found it immediately: `old` and one
of the new arrivals landed at the *exact same* (x, y).

The real bug, buried in `computeCategoryLayout`'s masonry packer (`placeCategory`) itself, not
in `renestClustersCleanly`: the shortest-column-first loop updates its `columnBottoms`
bookkeeping using whatever position a child actually gets placed at — for an explicit override,
that's its own frozen (x, y), completely disconnected from the column/slot the loop nominally
"assigned" it. That only produces a correct, collision-free result if the override happens to
be the *first* child the loop processes in whichever column the heuristic would put it in —
every previous fix in this whole arc (`materializeSiblingClusters`, `renestClustersCleanly`,
etc.) worked by engineering exactly that lucky ordering for the specific case each one covered,
never fixing the underlying assumption. The moment a virtual sibling gets processed *before* an
unrelated override that happens to physically overlap the slot the virtual one is computed into
(pure category-array order, nothing the user controls), they land on top of each other — this
is order-dependent in a way that has nothing to do with which cluster the user actually touched.

Fix: split each parent's children-packing loop (and the equivalent root-level one) into two
passes. First, every already-explicit child in that group reserves whichever grid columns its
*actual* footprint overlaps (an X-range test against each column, independent of processing
order) — raising that column's running bottom past it. Only then does the second pass hand out
slots to the remaining still-virtual children, using bookkeeping that already accounts for
every override in the group, regardless of where either one sits in the array. An override
whose real position doesn't land inside any recognized column (dragged somewhere unrelated to
the grid entirely) simply doesn't reserve anything — matching the prior best-effort behavior for
that edge case rather than making it worse.

This also directly answers the "the SO cluster wasn't even resized, and it didn't need to be"
half of the report: packing around the existing occupant, instead of overlapping it, uses space
that was already free inside the parent's current box — no growth required, exactly what was
expected. `growAncestorClustersToFit` still runs afterward, unchanged, for the (now much rarer)
case where the free space genuinely isn't enough.

Verified: new `computeCategoryLayout` test constructs the exact failing shape directly
(processing order: two virtual siblings, then the override, then a third virtual one) and
asserts no pair of the four resulting boxes overlaps — confirmed to fail (two land on the exact
same coordinates) with the fix reverted, passes with it restored. A second, end-to-end test
through `renestClustersCleanly` covers the same scenario via the actual resize-to-enclose path.
Full suite green (398/398), typecheck clean, production build clean, boot-tested.

### Board interaction audit: snap/link, cluster move/resize, nest/un-nest, grid (2026-09-16)

After v0.4.3 shipped, asked to review the whole interaction pipeline for soundness rather than
wait for the next report. Read every commit branch in `BoardView`'s mouseup handler
(item drag, cluster move, cluster resize) and every pure function they call, specifically
hunting the two failure classes this whole arc kept producing: an explicit position left
stale after the thing it was computed against moved, and a packing result that depends on
processing order. Wrote throwaway diagnostics for each suspect before believing it. Seven
findings, six fixed, one left as a design question:

1. **Snapping a code onto a target *below* it never re-clustered it.** The group-membership
   decision (`resolveGroupClusterReassignment`) picks its reference member as the topmost by
   start position, and the freshly snapped target was folded into the candidates — but the
   target didn't move (start = final), so whenever it sat above the dragged card it became the
   reference, read as "old cluster = new cluster", and the whole reassignment was skipped. Half
   the snaps (from below) silently left the dragged code a member of the cluster it came from
   while sitting inside another. Confirmed with a diagnostic; the reference is now chosen from
   the members that actually moved, and the target still receives the group's decision.

2. **Nudging a nested cluster partway past its parent's edge drew a stray connector.** The
   ancestor-growth after a cluster move only ran on a parent *change*; a move that kept the
   center inside its parent (so it stayed nested) but poked the frame out past the edge did
   nothing — exactly the condition `getStructuralNestingEdges` draws for. Growth now runs after
   every cluster move (a no-op when it already fits).

3. **Joining a group reflowed the untouched members already in it.** `materializeSiblingClusters`
   was called *after* the reparent, so it froze the destination's virtual siblings at positions
   already recomputed with the newcomer counted in (column count and width both follow from the
   full membership). New `materializeChildClusters(parentCategoryId | null)` pins a group *before*
   anything joins it — used by cluster-move (both nesting and un-nesting), resize-to-enclose
   (the resizing cluster's pre-existing children), and `detachOrphanedChildren` (the roots).
   The regression test asserts both directions: pin-first leaves every existing child where it
   was; pin-after demonstrably moves one.

4. **Detaching a still-virtual child made it jump to the root grid.** "Detached where it is"
   only held for a child that already had an explicit shape; a virtual one recomputed from
   scratch as a root the moment its parent link was cleared — diagnostic showed it moving from
   (520, 548) to (40, 40). It's now pinned at its current box first.

5. **Resize-to-enclose flattened hierarchies, and could reset an ancestor.** Enclosing a cluster
   that has its own sub-clusters reparented every level directly under the resizing one; and a
   nested cluster resized from its parent's exact corner to bigger than the parent "enclosed"
   the parent, which `reparentCategory` correctly refused (cycle) but `renestClustersCleanly`
   still reset the parent's shape and items as if it had gone through. New
   `resolveResizeEnclosure` (shared by the live highlight and the commit) excludes ancestors and
   any enclosed cluster whose own ancestor is also enclosed — a sub-tree nests as one unit.
   `renestClustersCleanly` now only touches ids that actually became children, and takes each
   relocating cluster's whole subtree along (their shapes and members reset with it, for the same
   stranded-position reason as its own member cards — the test confirms the sub-cluster ends up
   inside the relocated cluster, which it did not before).

6. **A hand-dropped card could hang past its cluster's edge.** `growClusterToFitOwnMembers` only
   sized for the auto grid; a card released against the bottom/right edge (center inside, so it
   joined) stuck out by up to half a card. It now also fits every explicit member's actual rect,
   and runs on any drop inside a cluster, not only on a membership change.

7. **Not changed — a design question:** a cluster-move's nest target is whichever cluster
   contains the dropped frame's *center* (smallest first), with no size check. Dragging a big
   superordinate so its center crosses a small leaf nests the big one into the small one, which
   then grows to swallow it. A "target must be at least as large as what's being dropped" rule
   (or "the dropped frame must be mostly inside the target") would prevent it; left for the user
   to decide, since it changes what a deliberate drop means.

Also reviewed and found sound: `findClusterAtPoint` preferring the smallest containing frame
(so a drop into a nested cluster picks the nested one); the item-drag materialize-before-link
sequence; the unlink-on-distance loop; `getVisibleBoardItems`' slot stability; the two-pass
reservation from the previous entry (the pre-existing tests that pinned exact positions all
still pass, so pinning a cluster in its natural slot no longer changes anything else).

Verified: 10 new unit tests across `resolveResizeEnclosure`, `materializeChildClusters`,
`renestClustersCleanly`, `detachOrphanedChildren`, `growClusterToFitOwnMembers`; the two whose
old behavior wasn't already demonstrated by a diagnostic were confirmed to fail with just that
fix toggled off. Full suite green (408/408), typecheck clean, production build clean,
boot-tested. Findings 1 and 2 live in `BoardView`'s handler ordering, outside the pure layer, so
they're covered by reasoning and the diagnostic rather than a unit test.

### Nothing gets silently covered: sibling overlap resolution (2026-09-16)

Asked mid-audit: "on resizing a SO cluster to include/exclude clusters, make sure a neighboring
unconcerned cluster won't be moved behind / hidden behind another cluster — generally, make sure
items and clusters aren't silently placed on top of / behind an existing similar object."

The remaining way that could still happen after the audit above: a box *growing*. A
superordinate grown to fit newly enclosed clusters (`growAncestorClustersToFit`), a cluster grown
to fit a new member (`growClusterToFitOwnMembers`), or a frame the user resized/dropped so it
partly covers a neighbor without enclosing it — none of these touched the neighbor, which was
left sitting under (or over, depending on paint order) the grown frame. Still-virtual siblings
were already safe, since `computeCategoryLayout`'s reservation pass packs them around every
explicit footprint on each read; explicit ones had nothing.

New `resolveSiblingOverlaps(boardId, categoryId)`: the changed cluster stays exactly where it is
(the user or the fit logic just put it there); every explicit sibling in its group that it now
overlaps is pushed to the nearest free spot — down / right / left / up, whichever is the
smallest move that lands clear of everything already settled, never to negative coordinates
(those are unreachable on the canvas). Siblings the anchor overlaps settle first, then the rest
in reading order, so a push ripples predictably: a pushed cluster that would land on a third
pushes that one along. A pushed sibling carries its whole subtree and its member cards with it
(`translateClusterSubtree`), then has its own ancestors grown to keep containing it — and that
growth resolves overlaps at *its* level in turn. Wired into `growAncestorClustersToFit` (after
each ancestor grows), `growClusterToFitOwnMembers`, `detachOrphanedChildren` (the detached child
rejoining the roots), and both the resize and cluster-move commits in `BoardView`, so every path
that changes a box ends with "and nothing is under it."

Items: the one silent case found was the flat (unclustered) grid — its origin sits just below
the lowest cluster, so it moves whenever clusters above it grow, and an auto-placed card's slot
could then land exactly on a card someone had already dragged there by hand. Auto-placed cards
now skip any slot a hand-placed card covers. A card dropped by hand partly onto another card is
left alone: that's the user's own placement, visible as it happens, and the snap already handles
the close case by placing them edge-to-edge.

Verified: 7 new tests (push direction is the smaller move and the anchor is untouched; a pushed
sibling's sub-cluster and member cards move by the same delta; true no-op by reference equality
when nothing overlaps or the anchor is virtual; ripple through a third cluster leaves no pair
overlapping; no negative coordinates; growing a parent pushes the parent's own neighbor; flat-
grid slot skipping) — six confirmed to fail with the two fixes toggled off (the seventh is the
no-op case). Full suite green (415/415), typecheck clean, production build clean, boot-tested.

### Cards never stack: dropping into a full cluster (2026-09-16)

"What happens if I want to drag an item to an already full cluster, meaning I have to drag it
to an existing item. The new item will stack with an existing one, right? This should be
avoided. If needed, resize the cluster to accommodate the new item. Generally, items should not
be stacked either."

Correct — it stacked. A dropped card stayed exactly where it was released, and the only thing
that changed was the box (`growClusterToFitOwnMembers` grows it to fit the bigger grid and the
dropped card's own rect). Nothing moved the card that was already sitting there. With a snap
(release within 70px of a card's center) it was subtly worse: the drop was placed edge-to-edge
beside the target at a 12px gap, while the grid packs cards at an 8px gap — so the snapped card
landed almost entirely on top of the *next* card in the row instead.

New `resolveItemOverlaps(boardId, anchorItemIds)`, the card counterpart of the cluster-level
`resolveSiblingOverlaps` from the previous entry: the dropped cards (the whole linked group, plus
a freshly snapped target, since that pair belongs together) stay exactly where they were
released; every other explicit card on the board they now cover is pushed to the nearest free
spot — down/right/left/up, whichever is the smallest move that lands clear of everything already
settled — rippling through a third card if the push lands on one. A pushed card that belongs to
a cluster then has that cluster grown to keep containing it (`growClusterToFitOwnMembers` already
fits explicit member rects), and its ancestors after that — which is the "resize the cluster to
accommodate the new item" half of the request, just with the *displaced* card as the thing being
accommodated, so the user's own drop position is honored. Every card in the destination cluster
is explicit by the time this runs (`reassignRefCategoryMembership` materializes them all), so
the whole grid takes part; a still-virtual card elsewhere is left to its slot.

Not changed, worth knowing: dropping onto a card in a full cluster is, by construction, a drop
within snap range of that card, so it also *links* the two (that's the existing snap-to-link
gesture). The card no longer stacks, but the link is created; if "drop into a full cluster
without linking" turns out to be a common need, the snap could be gated further.

Verified: 4 new tests (the already-present card moves, the dropped one doesn't; a drop onto the
middle of a packed row leaves no pair stacked; a pushed card's cluster grows to keep containing
it; true no-op by reference equality when nothing overlaps) — the first three confirmed to fail
with the resolver toggled off. Full suite green (419/419), typecheck clean, production build
clean, boot-tested.

### A superordinate grew for the cluster that changed, not for the ones it displaced (2026-09-16)

PDF pair "Before / After drag and drop": "I just dragged a code from a cluster to another so the
destination cluster has to be resized. The superordinate cluster didn't resize vertically (it
did horizontally) and two clusters within it, at the bottom, were dragged out of the SO cluster,
with arrowless lines connecting it to it. The intended behaviour would have been that the
superordinate cluster resizes, right?"

Right. Reproduced in a unit test straight from the description (a nested cluster growing to fit
12 codes, two never-touched siblings beside/below it in the same superordinate): after
`growClusterToFitOwnMembers` + `growAncestorClustersToFit`, the two siblings sat outside the
superordinate. Two things combined:

- The two clusters at the bottom had never been touched, so they were still virtual — and a
  virtual sibling is repacked around every explicit footprint on each read (the reservation
  pass). When the destination cluster's box grew, the packer's next free column for them moved
  down, straight past the superordinate's frozen bottom edge. Nothing pinned them first: the
  item-drop path grew the destination cluster without the "pin the packing group before one of
  them changes" step that cluster move/resize already do.
- `growAncestorClustersToFit` only ever fit the *one* child it was called for. The superordinate
  grew horizontally for the destination cluster (which is what the user saw) and never learned
  that two other children had just been pushed out its bottom.

Fix, both halves: `growClusterToFitOwnMembers` and `growAncestorClustersToFit` now pin the
changing cluster's siblings (`materializeSiblingClusters`) *before* resizing it — so a sibling
in the way is pushed the minimal distance by `resolveSiblingOverlaps`, with its ancestors grown,
instead of silently repacked — and `growAncestorClustersToFit` fits *every* child of each
ancestor it visits, not just the one it started from, so a superordinate can never be left
short of any of its own children regardless of how they got where they are.

Verified: the new test fails before the fix (two children outside the superordinate) and
passes after, also asserting no pair of the three children overlaps. Full suite green
(420/420), typecheck clean, production build clean, boot-tested.

### Linking is now an explicit gesture: Shift+drag (2026-09-16)

Offered alongside the never-stack fix: dropping onto a card in a full cluster is by definition a
drop within snap range, so it also created a link. "Yes, I also would very much like that. Tbh,
I think now that items linking should only occur if the user presses and holds Shift or
something like that."

Agreed, and it's the better model regardless of the full-cluster case: a link is an analytic
claim ("these belong together"), and it was being created as a side effect of *placement* —
any drag that happened to end within 70px of another card. Snap-linking now requires Shift,
read live from each pointer event (not once at mousedown), so pressing it partway through a
drag brings up the snap preview immediately and releasing it turns the drop back into a plain
move. Both the live preview and the commit check the same thing, as before. The existing
4px drag deadzone stays (a Shift+click without moving still isn't a snap).

Shift was previously the item-drag escape hatch ("move just this one card, ignoring what it's
linked to"); that moved to Ctrl/Cmd+drag. Shift+drag on a *cluster* (pull it out of its
superordinate) is untouched — different object, no conflict. Auto-unlink when a linked pair is
dragged far apart is unchanged too. Updated the board's hint line, the drag-state type comment,
and the README.

Verified: typecheck clean, full suite green (420/420 — this lives entirely in `BoardView`'s
pointer handling, no pure-function change), production build clean, boot-tested.

### Clustered cards live on the grid, full stop (2026-09-16)

"Could we make it so on dragging a card to a cluster, the cards are rearranged in a grid
automatically, rather than just floating in sometimes awkward places? That means the cluster
may have to autoresize too. Is it a good design decision in your opinion? I'm hesitating,
because it may have consequences, but sometimes, the cluster doesn't resize and the other cards
are 'pushed' in some directions, resulting in a card effectively leaving the cluster on pressing
'Reset placement'."

Recommended yes, and this is the change that retires the whole bug family this log has been
documenting for two days. Every one of those bugs came from one root: a card inside a cluster
had *two* sources of truth for where it is — its stored free-form position and the cluster's
grid — and every operation (drop, membership change, cluster move/resize/nest, growth, reset)
had to keep them consistent by hand, one transition at a time. The "card leaves the cluster on
Reset" symptom is that disagreement made visible: a card sitting in a cluster's area without
being a member (nothing grew for it, nothing moved it), until Reset showed where it really
belonged. Agreed with the user: linked cards kept adjacent; otherwise codebook order.

The rule now, on the default board: **a clustered card always renders at its grid slot.** In
`getVisibleBoardItems`, a card that's a member of some category takes its slot position whether
or not it has a stored `BoardItem` — an explicit one keeps only its *identity* (so links and
drags keep resolving it) and its stored x/y is ignored. Slots are assigned per cluster in
codebook order, except that a member's Shift-linked partners in the same cluster take the slots
right after it (breadth-first, partners in codebook order), so a linked pair still reads as a
pair. `getVisibleBoardItems` takes the board's links for that. Free placement — and the
overlap-pushing from the previous entries — now applies only to cards that are in no cluster
(`resolveItemOverlaps` skips clustered refs entirely).

The cluster side of the same rule: an explicit box is a *floor*, never a ceiling on its own
cards. `computeCategoryLayout` shows a stored shape at no less than its own member grid's size
(`ownMemberMinSize`; zero for an empty cluster, so an empty box stays exactly what the user
drew), and `getVisibleBoardClusters` returns that shown size on the explicit shape — so a box
shrunk by hand, or sized before more cards were dropped in, simply shows at the grid's size
instead of letting cards hang out. Every containment/overlap computation already runs off the
shown boxes (`resolveSiblingOverlaps` was the one that read stored sizes; fixed to use shown).
`growClusterToFitOwnMembers` now grows the *stored* box to match (keeping stored and shown in
step for anything else that reads it); a virtual cluster never needs it.

What got simpler as a result: `reassignRefCategoryMembership` no longer pins every member of
the categories being left/joined first (`materializeClusterMemberItems`) — that existed purely
to keep a renumbered slot from landing on a hand-placed card, which can no longer happen;
`growClusterToFitOwnMembers` no longer fits hand-placed rects (there are none inside a cluster).
What stays: all the cluster-level work (pin-before-change, overlap pushing, ancestor growth,
enclosure/detach) — clusters still have real stored positions, so that machinery is still what
keeps *them* honest.

The consequence the user was hesitant about, stated plainly: you can't hand-arrange cards
*within* a cluster anymore — a drag inside a cluster returns the card to its slot. Spatial
sub-grouping is what sub-clusters (and links) are for.

Verified: 3 new tests (an explicit clustered card renders at its slot with its id kept; linked
members get consecutive slots even when codebook order separates them; an explicit box smaller
than its grid is shown at the grid's size with every card inside, and an empty box is left as
drawn), two existing tests rewritten to the new contract (the old "an explicit item keeps its
position regardless of membership" now asserts the opposite, plus a new one that an unclustered
explicit item *does* keep it), one obsolete test removed each from `growClusterToFitOwnMembers`
and `resolveItemOverlaps`. Full suite green (423/423), typecheck clean, production build clean,
boot-tested.

### The same rule one level up: nested clusters live on the superordinate's grid (2026-09-16)

"Can the same be done for clusters within a superordinate cluster? I noticed two things. 1) On
rearranging clusters inside an SO, some clusters can be pushed outside the SO and become linked
with the SO with arrowless lines. 2) On dragging a cluster from an SO to another SO, another
cluster in the destination SO can be pushed out of its SO and become an orphan on pressing
'Reset placement'." And shortly after: "On just clicking a cluster, sometimes, other clusters in
the vicinity will become pushed out of their shared SO and be linked by arrowless lines."

All three are the cluster-level twin of the card problem the previous entry closed: a nested
cluster had a stored free-form position *and* a slot in its parent's grid, and the parent's
stored size was a frozen ceiling its children had to be kept inside by hand (grow-to-fit,
pin-before-change, push-on-overlap, detach-when-outside). The click report is that machinery
running on a zero-distance "drag": a click was a full move-commit — re-evaluate the parent, pin
the group, grow ancestors, resolve overlaps — and any of it reflowing a neighbor read as "I just
clicked and things moved."

The rule now, in `computeCategoryLayout`:

- **A nested category always sits at its slot in its parent's children grid.** Its stored x/y
  is ignored (`placeCategory` only honors a stored position for a root); its stored size still
  counts, as a floor. `getVisibleBoardClusters` returns the shown position for an explicit shape
  as well as the shown size. So the two failure modes can't be expressed anymore: nothing can be
  pushed out of a superordinate, and a stored position can never disagree with the nesting it's
  actually in — hence no structural edge on the default board, ever, and nothing for a reset to
  "reveal."
- **A stored size is a floor on the whole contents, not just the cards.** `computeSize` is
  `max(stored, natural)` where natural is the full bottom-up size (own card grid + children
  grid) — the previous entry's floor only covered the category's own cards, leaving a stored
  parent frozen around its sub-clusters. An *empty* cluster (no cards, no sub-clusters) keeps
  its stored size exactly, even below the default, so a deliberately tiny box stays tiny.
- The two-pass "reserve every explicit child's footprint first" from the masonry fix is gone
  for children (there are no explicit child *positions* to reserve anymore); it stays for the
  root level, where free placement still exists.

What that made redundant, and was removed or reduced to the root level:
`detachOrphanedChildren` (containment can't break; deleted with its store action and tests —
which also means *shrinking* a superordinate no longer detaches anything: to take a cluster
out, drag it out or shift+drag it), `materializeSiblingClusters` / `materializeChildClusters` /
`resolveSiblingOverlaps` (early-return for anything nested — inside a superordinate, children
rearrange by design), `renestClustersCleanly`'s pin loop (it now just resets the relocating
subtrees' shapes and cards and lets the grid place them). `growAncestorClustersToFit` was
rewritten: containment needs no fixing, so it now only brings each ancestor's *stored* size up
to its *shown* size (so stored never lags the picture) and then runs the overlap push at the
root, since a root that just grew to fit its contents can overlap a free-placed neighbor.

And a plain click is now a true no-op: `handleMouseUp` returns before the commit pipeline when
the pointer moved less than the existing 4px snap deadzone, for every drag kind.

Verified: rewrote the ten tests that encoded the old contract (stored positions of nested
clusters, pinning of nested children, containment repair) to assert on *shown* boxes; added
tests that a nested category is placed at its slot regardless of a stray stored position, that
an explicit parent is shown big enough for its children grid, that a stored ancestor shape is
brought up to its shown size with the root's neighbor pushed clear, and the two user scenarios
end to end — a cluster moved from one superordinate into another leaves every child of the
destination inside it, non-overlapping, still nested, with no structural edge, before *and*
after `resetDefaultBoardClusterLayout`; and arbitrary stray stored positions for nested clusters
produce no structural edge at all. `materializeClusterMemberItems` — the "pin every card
before a membership change" helper — turned out to have no remaining caller after the previous
entry and was deleted with its tests. Full suite green (420/420), typecheck clean, production
build clean, boot-tested.

### Resize-to-exclude, restored on top of the grid model (2026-09-16)

"Now I can't resize a SO cluster to exclude some clusters from it. It instantly goes back to its
previous size."

Expected given the previous entry — a box is never shown smaller than its contents, so a shrink
that still contained everything simply bounced — but the previous entry also dropped the
resize-to-exclude gesture entirely, and the user wants it. Restored, in the form that fits the
grid model: shrinking is a statement about *membership*, not size. On release, every nested
cluster that no longer fully fits inside the box the user drew is taken out first
(`resolveResizeExclusion` — the mirror of `resolveResizeEnclosure`, judged against where each
child is actually shown, i.e. its grid slot), and only then does the superordinate settle at
`max(drawn, what remains)` — so it genuinely shrinks. `detachClustersFrom` pins each excluded
cluster as a top-level cluster exactly where it was being shown (its sub-clusters and cards
follow, being on its grid), pins the root group before they join (the usual rule), and runs the
overlap push from the shrunk superordinate so a partly-covered cluster ends up beside it rather
than under its edge. Exclusion is decided before enclosure in the same commit, from the
pre-resize picture, so a cluster the same resize newly encloses can't be judged against a box
its own arrival reshapes.

The live feedback mirrors enclosure: while shrinking, a nested cluster that would be taken out
gets an amber "Will be taken out" badge (`isExcludedByResize` on `ClusterFrame`), from the same
function the commit uses, so what's highlighted is exactly what detaches.

Verified: 3 new tests (the exclusion set is exactly the children cut by the drawn box; after
detaching, the excluded ones are top-level and pinned near where they were, the superordinate is
shown at the drawn size with the remaining child inside, nothing overlaps and no structural edge
exists; a non-child id and an empty list are left alone). Full suite green (423/423), typecheck clean,
production build clean, boot-tested.

### Edge-case pass after v0.4.4, with a fuzz test to keep it honest (2026-09-16)

"Could you check for more edge cases? I tested everything I could think of."

Went through the interaction matrix (each drag kind × each modifier × root/nested/virtual/
explicit × where it lands) on paper, checked the things that had to be checked in code rather
than assumed, and then wrote a seeded fuzz test so the reasoning isn't the only line of defense.
Verified sound as-is: Tree/Radial layouts and the Compact/Full frame toggle are only offered on
curated boards (they set free positions/sizes the default board would now override); deleting a
category re-homes its children to its own parent; dropping a cluster can't target itself or a
descendant, and enclosure can't capture an ancestor; Shift on a cluster (un-nest) and Shift on a
card (snap-link) don't collide; a linked pair across two clusters moves as one unit into wherever
the dragged member lands (by design — the earlier "whole group follows" rule), and dragging a
member *within* its own cluster changes nothing.

Found and fixed, from reasoning:

- **A container kept a grown size forever.** `growAncestorClustersToFit` and
  `growClusterToFitOwnMembers` wrote the shown size back to the stored shape, so a superordinate
  grown to fit a dropped-in cluster stayed that big after the cluster left again. Neither writes
  anything back now: a stored size is the user's own floor, so a container grows with its
  contents and shrinks back to what the user last drew when they leave. Both functions reduce to
  "clear the top-level ancestor's neighbors out of its way," which is the only part that was ever
  visible. Test: nest a big cluster, un-nest it, the superordinate is back at its drawn size.
- **Excluding a cluster from a *nested* superordinate stranded it.** `detachClustersFrom` always
  made the excluded cluster top-level, pinned where it was shown — which, for a superordinate
  that is itself nested, is *inside the grandparent*: a top-level cluster sitting in another's
  box, belonging to nothing, and the overlap push couldn't help (the shrunk superordinate isn't
  top-level, so it had no free-placed siblings to push). An excluded cluster now moves out by
  exactly one level — it becomes a child of the superordinate's own parent, on that grid — and
  only becomes top-level when the superordinate was. Test covers the nested case: the excluded
  cluster is the grandparent's child, inside it, clear of its former parent, no stray edge.
- **A drop past the canvas's top/left edge landed at negative coordinates**, which the canvas
  never grows to reach (it only grows right/down) — the item or cluster was effectively lost.
  Both drop commits now clamp to ≥ 0; a linked group shifts as a whole so it stays rigid.
- **A category whose parent no longer exists was silently never drawn** — the layout walks down
  from the roots, and such a category is reachable from none. Could only come from an older file
  or a bug elsewhere, but the cost of an invisible cluster with no error is high;
  `normalizeProjectData` now clears a dangling `parentCategoryId` on load (test added).

The fuzz: five seeded runs of 120 random operations each over 8 clusters and 14 codes — nest /
un-nest a cluster (onto another or onto empty space), resize a cluster (enclosing and excluding,
exactly as the resize commit sequences it), drop a code into a cluster or onto empty space, move
a top-level cluster, reset placement — checking after every step that every category is drawn,
every nested cluster is inside its parent, no two siblings (top-level included) overlap, there is
no structural edge, every clustered card is inside its cluster, no two cards that share a home
stack, and nothing sits at negative coordinates. All five seeds pass. It runs as part of the
normal suite (deterministic, ~1s), so any future change to the layout core that breaks an
invariant fails loudly with the seed, step and operation in the message.

Still a design question, not changed: a cluster-move's nest target is whatever cluster contains
the dropped frame's *center*, smallest first, with no size check — dragging a big superordinate
so its center crosses a small leaf nests the big one into the small one (which then grows around
it). Harmless under the grid model, but surprising; a "target must be at least as large as what's
dropped" rule is a one-line change if wanted.

Full suite green (431/431), typecheck clean, production build clean, boot-tested.

### No unnecessary movement: deleting a superordinate, and the Workspace-tree paths (2026-09-16)

"When deleting a SO cluster, and maybe in other cases, the orphan clusters are moved in remote
places, which do not seem necessary (or is it?). Could you do a few more checks to fix
unnecessary movements?"

Not necessary — and "maybe in other cases" was right. Every parent or membership change that
doesn't come from a board drag went through code written before the grid model, and each one
moved things it had no reason to move:

- **Deleting a superordinate** (from the board, the Workspace tree, or Analysis > Clusters)
  promotes its children one level, which is right — but when that level is the top, each child's
  stored position suddenly applies again. While nested it sat on the parent's grid and its
  stored x/y was ignored, so that stored position is typically stale (wherever it was before it
  was ever nested); a never-touched child got a fresh masonry slot instead. Either way: a jump to
  somewhere remote. New `deleteCategoryOnBoard`: when the deleted cluster is top-level, its
  children are first pinned at exactly where they're shown (`pinClustersAtShownPositions`, the
  same "stay where it is" the resize-exclusion already used, now shared) and the top-level group
  is pinned too, so nothing else repacks; then the ordinary delete runs. When the deleted cluster
  is itself nested, its children just join the grandparent's grid (automatic).
- **Nesting / un-nesting from the Workspace tree** did a *full board reset* — every cluster
  reflowed for one tree drag. That was the honest answer back when a stored position could be
  stranded by its parent moving; it can't anymore. New `reparentCategoryOnBoard`: into a target,
  the cluster simply takes its slot in the target's grid (the top-level group is pinned first so
  the root it left doesn't make the others repack); out to the top level, it's pinned where it
  was shown and then pushed clear of the superordinate it just left (which still surrounds that
  spot). A refused reparent (a cycle) changes nothing.
- **Adding / removing a code or note in a cluster from the tree** also did a full board reset.
  Adding now needs nothing at all (the card takes its grid slot; the box sizes itself); removing
  forgets the card's stale stored position (`forgetItemPositionIfUnclustered`, only once it's in
  no cluster) so it lands in the flat unclustered area rather than wherever it sat before it was
  ever clustered. The `...AndReflowBoard` action names are kept (they're what the tree components
  call); `reflowDefaultBoard` itself is gone.

Verified: 6 new tests — deleting a top-level superordinate leaves every child (and an unrelated
top-level cluster) at exactly its previous shown position, top-level, non-overlapping; deleting
a nested one hands its children to the grandparent's grid; tree un-nesting pins the cluster where
it was, pushes it just clear of its former superordinate (not somewhere remote), moves no other
top-level cluster, and leaves no structural edge; tree nesting puts the cluster on the target grid
and moves no other top-level cluster; a refused reparent is a strict no-op; the forget-position
helper only acts once the card is in no cluster. The fuzz still passes. Full suite green (437/437),
typecheck clean, production build clean, boot-tested.

### Working zoomed out: readable cluster headers, zoom-to-cluster (2026-09-16)

"For a large project with 200+ items, I find myself working mainly at 30% zoom, which isn't easy
since the cluster labels become illegible at that size. Can you think of something or is it just
an 'it is what it is' situation?"

Not "it is what it is" — this is what map labels do. Two small things, both agreed:

- **Zoom-compensated cluster headers.** `ClusterFrame` gets the board's `zoom` and counter-scales
  the header's contents (name, kind badge, color swatch, ×) by `min(3.5, 1/zoom)`, so on screen
  the name stays its normal size where at 30% it was an 8px smudge — and the buttons stay
  clickable. Deliberately done *inside* the existing 28px header bar rather than by making the
  bar taller: the layout below it is computed from `CLUSTER_HEADER_HEIGHT`, so a zoom-dependent
  header height would make layout depend on zoom. The bar keeps its layout height (`h-7`); the
  scaled contents sit in an absolutely-positioned wrapper centered on it and overhang it a little
  (at 30%: ~6 canvas px above and below), still well clear of the first row of cards at 48. The
  wrapper's width is the frame width divided by the scale, so a long name truncates at the frame's
  edge rather than spilling across a neighbor (full name in the tooltip). The one catch was PDF
  export, which clones the live DOM: a PDF taken while zoomed out would have had giant headers.
  The wrapper carries a `data-board-zoom-label` marker and its frame width; the export undoes the
  scale on the clone.
- **Double-click a cluster's empty area to zoom to it.** "Fit view"'s math was extracted into
  `fitViewToBounds(minX, minY, maxX, maxY)` (same zoom-anchor mechanism as wheel zoom), called with
  a cluster's bounds from a double-click on the frame's own background — `e.target ===
  e.currentTarget`, so a double-click on a card, on the header (where double-clicking the name
  renames, as before), or on a nested frame (which zooms to *itself*) doesn't also fire it. A
  double-click is two mousedowns, i.e. two zero-distance drags; the click guard from earlier today
  makes those no-ops, so nothing is committed by it.

Cards themselves can't be helped the same way (54×19 screen px at 30%; nothing legible fits), so
zoomed-out work is cluster-level navigation — which is the point of the second change.

Verified: typecheck clean, production build clean, boot-tested; not visually verified in a running
board from this session (no interactive Electron here) — what to look for: at 30% the header text
should read at normal size and truncate at the frame edge; at 100% nothing should look different;
a PDF exported while zoomed out should have normal headers; double-clicking empty cluster space
should zoom to that cluster and "Fit view" should bring the board back.

### Aiming at a full superordinate (2026-09-16)

"I wanted to add a cluster to a SO cluster, but I couldn't since it didn't have enough free
space. I could only make my moving cluster a child of a cluster that's already inside. We have a
highlight-to-resize-SO-cluster mechanic, but there it didn't work since it didn't allow for
enough space to the moving cluster to be placed in the SO."

Not a space problem — under the grid model a superordinate grows to hold whatever joins it. It
was a *targeting* problem: a dropped cluster nested into whatever cluster its frame's **center**
landed on, smallest first. A full superordinate's interior is almost entirely covered by its own
sub-clusters (the rest is gaps narrower than any frame's half-width), so every drop landed on a
sub-cluster and nested one level too deep. The superordinate itself was unreachable.

New `findNestTarget`: if the **pointer** is on a cluster's header band, that cluster is the
target (smallest, if several); otherwise the old center rule. The header is the one part of a
superordinate never covered by its children, and it's where the "Drop to nest here" badge
already appears. To know the pointer's canvas position during a cluster drag, the drag state now
records where on the frame it was grabbed (`grabOffsetX/Y`, canvas units); the pointer is the
frame's live position plus that. The band's height grows with zoom-out by the same factor as the
counter-scaled header contents from the previous entry, since that's what the user sees and
aims at. The live highlight and the drop commit call the same function.

The grow preview ("highlight-to-resize") was also still the pre-grid estimate — grow the target
just enough to contain the dropped frame *where it currently is* — which is the "didn't allow
enough space" the user saw: it has nothing to do with the size the target actually takes once
the cluster lands in its grid. On the default board the preview now lays the board out as if the
drop had already happened and shows the target's real resulting size; curated boards (free
placement, no grid) keep the old estimate. The preview also now follows the smart-guide-snapped
delta and the edge clamp, like the drop does.

Verified: 4 new tests — the reported scenario (a superordinate with four sub-clusters: center-only
targeting lands on a child; the same center with the pointer on the superordinate's header
targets the superordinate; after nesting it, all five children are inside and non-overlapping), a
nested cluster's header targets the nested cluster, center fallback and empty space, and the
header band widening with `headerReach`. Three confirmed to fail with the header rule toggled off.
Full suite green (441/441), typecheck clean, production build clean, boot-tested.

### A click after "Reset placement" made neighbors jump (2026-09-16)

"Sometimes, after resetting the default placement, a click on a cluster will make neighboring
clusters jump to other locations. What could cause this? Is the default placement not snapping
to the grid well? Or is it an unintended interaction?"

An unintended interaction — the reset's placement itself is fine. After a reset, no top-level
cluster has a stored position: they're all auto-packed together, masonry-style, so each one's
spot depends on every cluster packed before it. The cluster-move and resize handlers created a
stored shape for the grabbed cluster **on mousedown** (so that a later `moveCluster`/
`resizeCluster` had a real id to find). That one stored shape takes the cluster out of the
packing — its footprint is reserved first — and every auto-placed cluster that used to be packed
in its column repacks around it. The click guard added earlier only stops the *mouseup* from
committing; the damage was done on press. Double-click (two mousedowns) and grabbing the resize
handle did it too. The cluster-move handler also materialized every card of the grabbed cluster
on mousedown, a leftover from before cards sat on the grid.

Two new tests pin down the mechanism before changing anything: on a reset board with varied
cluster sizes, giving any one top-level cluster a stored shape at its own shown position moves
at least one neighbor; pinning the whole top level first moves nothing, whichever cluster is
touched.

Fix: mousedown writes nothing. The drag state records the ids currently shown (virtual ones
included) purely to draw the live drag. At commit — past the click guard — new
`ensureClusterShape` creates the dragged cluster's shape, pinning the whole top-level group at
its current positions first if the cluster has no shape yet (a no-op otherwise), and the move or
resize applies to that. The commit now only moves the dragged cluster itself: its sub-clusters
and cards are on its grid and follow on their own, so the old loops moving each descendant and
card were dead weight. `materializeCluster` is gone.

Same root cause, found while checking every other place a top-level cluster can gain a stored
shape or the top level can change size:

- **Creating a top-level cluster** changes how many columns the top level packs into
  (`ceil(sqrt(n))`: 9 clusters → 3 columns, 10 → 4), repacking every auto-placed one. Test
  confirms it. The `createCategory` store action (Workspace and board alike) now pins the top
  level on the default board first when the new category is top-level; the new one then lands in
  free space. Test: after a reset with nine clusters, adding a tenth leaves all nine in place and
  the new one overlaps none of them.
- **"+ New cluster" on the Main board** placed the new cluster at a fixed diagonal spot
  `(60 + 30n, 60 + 30n)` with a stored shape — on a full board, typically on top of an existing
  cluster. On the default board it now just creates the category (through the same pinning
  store action), which the board shows in free space. Curated boards keep the old behavior,
  where nothing is auto-placed.

Full suite green (446/446), typecheck clean, production build clean, boot-tested.

### Creative stress pass: probes for stability, locality, damaged data and scale (2026-09-17)

"I can't find any more issues with the board logic. Could you run a few tests on your side, be
creative, to make sure it's ok?"

Wrote a throwaway probe suite aimed at what the existing tests and fuzz don't check — not "is the
picture valid" but "does the picture stay put when it should," plus inputs no UI path produces:

- **P2 — changes that must change nothing on screen**, on 15 scrambled boards (random moves and
  resizes after a reset): pinning the top level; `ensureClusterShape` for every single cluster;
  a save/reload round-trip (JSON + `normalizeProjectData`); resetting twice vs once. All clean.
- **P5 — merging two codes filed in different clusters.** The merged code ends up in both (by
  design: membership is many-to-many in the Workspace; the board homes it in the first); drawn
  once, nothing overlaps, no stray edge. Fine.
- **P6 — scale**: 415 clusters (300 top-level, nested sub-clusters), 2026 codes. A full render
  (clusters + cards) and a move commit (pin, move, overlap push) both run in tens of
  milliseconds. Fine for the 200-item projects in actual use, with a wide margin.

Three real findings:

- **P1 — growth after a reset repacked the whole top level.** After "Reset placement", no
  top-level cluster has a stored position; they're packed together live, each spot depending on
  every other cluster's size. Dropping cards into one made it grow, and everything packed after it
  repacked: across 20 random reset boards, dropping six cards into one cluster moved up to 14 of
  the other 15, with 184 sideways column jumps in total. The previous entry fixed the *click*
  version of this at the one place it happened; this is the same cause reached through a size
  change instead, which can come from many places (a board drop, the Workspace tree, deleting or
  merging a code). So it's fixed at the source rather than at each path: the top level simply
  never stays auto-placed. The store's `resetBoardLayout` pins it immediately after the reset
  (which, as P2 shows, moves nothing), and `normalizeProjectData` pins it when a project is
  opened, covering projects whose clusters were never touched. With that, the same measurement:
  at most 8 others moved, and **every** one had been run into by the grown cluster or by a cluster
  it pushed (largest shift 188px). Kept as two permanent tests: the unpinned repacking (so the
  mechanism stays documented) and the pinned locality property over 20 seeds.
- **P3 — a cluster nested inside itself vanished.** A cycle (A in B in A) or a self-parent is
  reachable from no top-level cluster, and layout walks down from those, so the clusters were just
  never drawn. The UI can't create one (`reparentCategory` refuses), but a damaged file can, and
  silently vanishing is the worst way for that to fail. `normalizeProjectData` now cuts each cycle
  at one point (that cluster becomes top-level; the rest of the chain keeps its nesting).
- **P4 — duplicate stored shapes made a drag do nothing.** With two stored shapes for one cluster
  (possible in older files), the board drew the last one but a drag moved the first. Load now
  keeps one stored shape per cluster per board — and one stored card per ref per board, for the
  same reason — keeping the one that was drawn.

Tests: the three normalize migration tests counted stored shapes across every board; with no
boards in their fixtures, load creates a default board and now pins there, so they're scoped to
the fixture's own board (what they were actually checking). New: cycle breaking, duplicate
removal, load-time pinning moves nothing, and the two locality tests. The probe file itself is
deleted. Full suite green (451/451), typecheck clean, production build clean, boot-tested.

### README restructure, and release pages with real descriptions (2026-09-17)

The README's introduction was one wall of text. It's now short sections: what the app is for,
the board (grouped by gesture: nesting, automatic arrangement, linking, large boards), import
and export, install, development, status, project history. Two inaccuracies were corrected on
the way: it claimed Excel import/export (there's none — import is `.docx`/`.odt`/`.txt`, export
is reports as `.docx`/`.html`/`.pdf` plus boards as PDF), and it pointed to a planning file that
only ever existed locally, not in the repository.

The user also noticed a link to the development conversation on the GitHub release pages. It
came from commit messages, not release notes: electron-builder publishes each release with an
empty description, so GitHub shows the tagged commit's message instead — including its
`Claude-Session` line, a link to a private conversation that is dead for anyone else. Agreed
fix, in three parts:

- New `scripts/release-notes.mjs` prints one version's section of `CHANGELOG.md`, rejoining the
  file's hard-wrapped lines (GitHub renders every single line break in a release description).
- New `.github/workflows/release-notes.yml` sets every published release's description from
  it. It runs after each release build (called from `release.yml`, even if one platform's build
  failed), whenever `CHANGELOG.md` changes on `main` — so fixing a changelog entry fixes the
  published release — and on demand. Pushing it backfills all existing releases. Verified
  locally that every tag from v0.1.0 to v0.4.6 has a section and extracts cleanly.
- Commits keep the standard `Co-Authored-By` trailer but no longer carry the session link.

### Feature: full-text search (2026-09-17)

First of five gaps identified against comparable QDA tools (search, case attributes,
co-occurrence, PDF import, REFI-QDA exchange), agreed in that order; the user's one condition is
that Cadenza stays lightweight. This one adds no dependency at all.

`src/shared/search.ts` — pure, tested. `searchDocuments(data, query, options)` walks every
paragraph of every document (optionally a subset) and returns each occurrence as a `SearchHit`:
the match as **global offsets into the document's joined text** (the same coordinates
`Segment.start/end` use, so a hit can become the reader's active span or a coded segment with no
conversion), the paragraph, context either side (80 chars, with "was clipped" flags), the codes
already on any passage overlapping it, and the *sentence* containing it — a more useful unit to
code than a lone word (`sentenceAround`: previous/next sentence punctuation *followed by
whitespace*, so "3.5 fois" doesn't split).

Matching is done with a regex built from the escaped query (so "what?" is literal) with the
`u` flag, case-insensitive unless asked, and whole-word via `\p{L}\p{N}` lookarounds. The
interesting part is **accent-insensitivity, on by default** — "reunion" finds "réunion" and the
reverse — which matters for French transcripts and is where offsets get subtle: stripping
combining marks (NFD, drop `\p{M}`) shortens the text, so a match position in the folded text
can't be used on the original. `foldAccents` returns the folded string plus a table mapping every
folded character position back to its original index (each original character contributes its
folded length worth of entries), and hits are mapped back through it. Tests assert, for every
hit, that slicing the *original* joined text at the reported offsets gives exactly the match.

`SearchView` is a fourth Analysis tab. Hits are grouped by document with counts; each shows the
context with the match highlighted and colored badges for codes already on it. Two actions per
hit: **Go to →** (opens the document with the match as the active span, codes tab ready — the
same hand-off Retrieval's "Go to passage" uses) and **Code sentence** with a code picked in a bar
above; plus **Code all N sentences** for the whole result set in one `withBatch` (one undo step).
That last one is what other tools call auto-coding. `applyCodeToSelection` already refuses to
double-code the same span, so re-running is safe; a hit already carrying the picked code shows
"Coded" and is disabled.

Verified: 11 unit tests (offsets index the original text; case/accent defaults and their opt-outs;
an accented query finds unaccented text; whole word; sentence extraction incl. the decimal case;
existing codes reported; context clipping; document filter, literal regex chars, empty query;
`foldAccents`' index map). Full suite green (462/462), typecheck clean, production build clean,
boot-tested; the tab itself not exercised by hand here.

### Feature: case attributes (2026-09-17)

Second of the five. A document was only a title, so "what do the nurses say vs. the managers"
had to be done by eye across columns. Now `DocumentRecord.attributes` is a name → value map of
free text (role, site, age band, date…); the project's attribute "columns" are simply the union of
names across documents (`getAttributeNames`, first-seen order), with no separate schema to
maintain. `normalizeProjectData` backfills `{}` for older files; the importer sets it.

Ops in `documentOps.ts` (tested): set / remove on one document (names and values trimmed; an
empty value still creates the attribute so the column exists to fill in), rename everywhere
(merging into an existing name keeps each document's own value), delete everywhere,
`getAttributeValues` (distinct, non-empty, numeric-aware sort). Store actions mirror them.

In the reader, `CaseAttributes` sits under the title as "Name: value" chips: click a value to
edit it, × to drop it from this document, "+ attribute" to add one — with datalists of names and
values already used elsewhere in the project so the same attribute is spelled the same way on
every case (the add row pre-fills the first attribute other cases have that this one lacks).

In Compare, a "Group cases by" select lists the attributes. Grouped, both sub-views get one
column per attribute value instead of per case (`getCaseGroups`: sorted numeric-aware, cases
without the attribute or with it empty collected last under "(not set)" so no case silently
drops out). The matrix cell shows passages *and* "in how many of the group's cases" — 2 (1/5)
reads very differently from 5 (5/5) — via `getCodeGroupMatrix`; the contrast columns pool the
group's quotes with the document title above each. Ungrouped, nothing changed.

Verified: 5 new tests (attribute ops incl. trim/empty-name/empty-value, names union and value
sort, remove/rename-merge/delete; case groups incl. the unset bucket and a missing attribute;
group matrix counts). Every test fixture that builds a `DocumentRecord` gained `attributes: {}`.
Full suite green (467/467), typecheck clean, production build clean, boot-tested; the chips and
the grouped views not exercised by hand here.

### Feature: code co-occurrence (2026-09-17)

Third of the five. `src/shared/cooccurrence.ts`, pure and tested: two codes co-occur wherever a
passage coded with one *overlaps* a passage coded with the other in the same document — the
very same selection, or two selections that share a stretch. Each overlapping pair of passages
counts once, so the measure is symmetric (A-with-B is B-with-A) and a matrix cell is stored once
for the unordered pair. Touching passages (one ends exactly where the other starts) don't
count. The diagonal is each code's own distinct-passage count — the "n" its row is read
against — and codes never applied are omitted entirely rather than shown as all-zero rows.
`getCooccurringPassages` drills into one cell: every overlapping pair, document by document in
reading order, with the shared stretch of text (and both full selections, since they can
differ). Both honor the usual "roll up sub-codes" toggle.

New Analysis tab "Co-occurrence": the matrix with rotated column headers, cells shaded by count
relative to the largest off-diagonal value (the diagonal is neutral), a tooltip spelling the cell
out ("A and B share 3 passages in 2 documents"), "hide codes never applied" on by default, and a
click opens the shared passages below with "Go to passage →" on the overlap — the reader then
shows both codes' highlights around it. The report export gains a "Code co-occurrence" checkbox
(same codes-actually-used filter; the diagonal explained in its caption).

Verified: 5 unit tests on a two-document fixture with overlapping, identical and merely touching
spans (symmetric counts and document counts, diagonal, descendant roll-up on/off, unused code
omitted, drill-down order and symmetry) plus a report test for the table. Full suite green
(473/473), typecheck clean, production build clean, boot-tested; the tab not exercised by hand.

### Feature: PDF import (2026-09-17)

Fourth of the five, and the one the user asked about specifically ("for OCRized ones"). The only
new dependency in this batch: `pdfjs-dist` (Mozilla's pdf.js, pure JS, no native module). Its
"legacy" build runs in the main process under Node with no DOM; with no worker configured it
parses on the main thread, fine for a one-off import, and it's `import()`ed lazily so nothing is
paid until a PDF is actually opened. The package is 35 MB on disk, most of it build variants,
source maps, the viewer, image decoders and rendering fonts — none of which text extraction
touches — so `package.json`'s `build.files` excludes them from the packaged app, keeping the
legacy build, its worker and the CMap tables (needed to read text in CJK/CID-encoded fonts;
`cMapUrl` points at the package's own `cmaps/`). Net cost in the installer: a few MB.

A PDF has no paragraphs, only runs of text at (x, y) positions — and an OCR'd scan's text layer
is whatever the OCR engine emitted (often one run per word, uneven spacing). The part that's
actually ours is `pdfText.ts`, pure and tested on synthetic runs: group runs into lines by
baseline (with a tolerance of half a line for OCR jitter and superscripts), order left to right
and join with a space unless pdf.js already spaced them, then break paragraphs where the vertical
gap between lines clearly exceeds the page's own ordinary line spacing (×1.7). That "ordinary
spacing" is the page's *smallest* plausible gap, not the median — on a short page of two
paragraphs half the gaps are breaks, and a median hides them (the first end-to-end probe came
back as one paragraph for exactly that reason; the fixture is now a unit test). Every page ends a
paragraph; "inter-" at a line end followed by a lowercase line start is re-joined.

`extractPdfParagraphs` in `pdf.ts` is the thin pdf.js wrapper. An import that yields no text at
all — a scan that was never OCR'd — is refused with a message saying so and suggesting OCR
first, rather than creating an empty document. End-to-end, on two hand-built PDFs (one with three
lines in two paragraphs, one with only a drawn rectangle): correct paragraphs and `[]`, ~250 ms
including the library load. vitest's include list now covers `src/main/import`.

Verified: 7 unit tests for the reconstruction (line joining, jitter, hyphenation and page ends,
pre-spaced runs, the threshold scaling to double-spaced text, the short-page case, no text). Full
suite green, typecheck clean, production build clean, boot-tested. The packaged-size exclusions
are exercised by the next CI release build rather than locally (Windows packaging needs a
privilege the dev machine lacks — see release.yml).

### Feature: REFI-QDA exchange (2026-09-17)

Fifth and last of the batch, and the largest: `.qdpx` in and out. REFI-QDA is the project
exchange format the commercial tools and QualCoder share, and what journals and data
repositories increasingly ask for; without it a Cadenza project could neither leave nor arrive.
No new dependency — the format is a zip (`jszip`, already used for `.qdaproj`) holding a
`project.qde` XML (`fast-xml-parser`, already used for `.odt`) and a `sources/` folder of plain
texts.

`src/shared/refiQda.ts` is the pure core. **Export** (`buildQdpx`): codes as a nested CodeBook
with color and description; each document as a TextSource whose plain text is exactly
`joinParagraphs(paragraphs)`, so every Segment's offsets are already the right PlainTextSelection
positions; codings as Coding/CodeRef under their selection; notes as Notes with NoteRefs from
the passage, document, code or project they belong to (a cluster note goes to the project level
with "[Cluster: …]" in front, Sets carrying no notes in the standard); case attributes as
Variables (Text) plus one Case per document; clusters as Sets with their code and note members,
nesting and question-kind noted in the description as text. Codes of kind "item" are listed in a
Set named `Cadenza: items`, which a Cadenza→Cadenza round trip recognizes.

GUIDs are the awkward part: the standard wants UUIDs, Cadenza ids are nanoids. `toGuid` is a
deterministic hash mapping (the same id always gives the same GUID, across exports), and an id
that already is a UUID — one that arrived through import — is kept, so another tool's GUIDs
survive a round trip through Cadenza.

**Import** (`parseQdpx`): codes recursively, TextSources (from the referenced `sources/` file or
inline `PlainTextContent`), PDFSources through their plain-text Representation, selections →
segments with codings, notes attached where their NoteRef appeared, Cases/Variables → document
attributes (any value type, as text), Sets → clusters. Picture/audio/video sources are skipped
and named in the import report; so is a source whose text isn't in the file. Two things needed
care: numeric character references (`&#13;`, how other tools write carriage returns) come
through the parser undecoded, so they're decoded on read; and source text is normalized to
Cadenza's shape (CR removed, runs of blank lines collapsed, trimmed) while **every selection's
offsets are mapped through those edits** (`normalizeSourceText` returns the text and an
offset-mapping function over the dropped ranges), so a passage still points at the same words —
the test checks exactly that against a CRLF, blank-run-laden fixture. The result goes through
`normalizeProjectData` (default board, pinning) and opens as a new, unsaved project.

Main process: two IPC handlers (save dialog + zip write; open dialog + zip read, tolerant of a
`.qdpx` whose files sit in a subfolder). UI: an "Export as REFI-QDA project" section at the
bottom of the Export tab that says plainly what stays behind, and an "Import a REFI-QDA project"
line on the home screen that shows a summary of what came in and what was skipped.

Verified: 13 unit tests — GUID determinism/shape/UUID passthrough; a full round trip (sources
written verbatim, XML escaping, documents with attributes, code tree with colors/definitions/item
kinds, every passage still pointing at the same words with its codings, notes with their
question attached where they were, clusters with members, GUID stability on a second export);
a hand-written file in another tool's style (CRLF, blank runs, inline content, a PDF source with
a text representation, an audio source, an integer variable) with every selection intact; the
offset mapper on its own. Full suite green (493/493), typecheck clean, production build clean,
boot-tested. Not yet tried against a real NVivo/MAXQDA export — worth doing with one if you have
access to any; the format has tool-specific quirks the spec doesn't mention.

### A third card appeared where a linked card was dropped (2026-09-17)

"I dragged a code and held Shift to link it to another code. On a few occasions, dragging the
code next to another led to ANOTHER code taking the place of the link destination. I drag 1 next
to 2 to link them; on release, another code, 3, takes the place of 2 and is instantly linked
with 1."

The link itself was right. The grid was wrong about *where* to put a linked pair. Clustered cards
sit in codebook order, with linked cards on consecutive slots, and the group was placed where its
**codebook-earliest** member sat. Whenever the dragged card came before the target in the
codebook (same cluster, or dragged in from another), the target was pulled back beside the
dragged card's position, every card in between shifted, and a third card slid into the exact
spot the user had dropped onto — reading as "3 took 2's place and got linked." Hence "on a few
occasions": it depended only on codebook order.

Fix, in `getVisibleBoardItems`: a linked group is anchored on the card that was **aimed at**. A
link already records direction — the dragged card as `itemA`, the card dropped on as `itemB` — so
the anchor is the group's member that's never a link source within the cluster (codebook-earliest
if several, or if a cycle leaves none); the group takes consecutive slots where the anchor would
be, anchor first, the rest breadth-first. So the aimed-at card keeps its slot and the dragged card
lands right after it; if the dragged card came from earlier in the same cluster, the target moves
back by exactly one slot and the dragged card lands in the target's old spot — where it was
dropped. No third card ever takes it. A chain (1 onto 5, then 2 onto 1) keeps growing from 5.

Separately, a Shift-drag only ringed the card being held; the card the drop would link to wasn't
marked, and in a packed grid the nearest card isn't always the one being looked at. The snap
target now gets the same ring during the drag.

Verified: three new tests — every dragged/target pair in a six-card cluster (the target's old
spot holds the target or the dragged card, never a third, and the pair is adjacent); a card
dragged in from another cluster onto each target (the target and every card before it keep their
spots); a chain keeps its anchor. All three failed before the fix (first case: dragging c1 onto
c3 put c2 in c3's spot). One older test that encoded the codebook-earliest anchor was updated to
the new rule. Full suite green (496/496), typecheck clean, production build clean, boot-tested.

### Linking, second attempt: touching, not consecutive (2026-09-17)

"This fix doesn't work properly. I have 4 codes in a small cluster, I hold click on 1, press
Shift, drag 1 around, see 3 (just below) highlighted, release the click, and then 2 and 3 get
linked, not 1 and 3."

The previous entry's fix was built on a wrong idea of "together". Linked cards were given
*consecutive slots*, anchored on the target — but consecutive slots aren't adjacent in a grid:
the slot after the end of a row is the start of the next one. In the reported 2×2 cluster
(`1 2 / 3 4`, 3 directly below 1) the link 1 → 3 made 1 leave slot 0 and follow 3, which
re-packed three cards into `2 3 / 1 4`: the real pair diagonal, and 2 and 3 now side by side.
The link stored was 1–3 all along; the arrangement made it read as 2–3. And in this case nothing
needed to move at all — 1 and 3 already touched. The previous tests passed because they checked
slot *numbers* ("adjacent" = slots differ by one), which is exactly the wrong notion.

New rule in `getVisibleBoardItems`: cards keep their plain codebook-order slots; then links are
applied in the order they were made, each moving as little as possible. If the two cards already
touch (same row and neighboring columns, or same column and neighboring rows), nothing moves.
Otherwise the target never moves: the dragged card (`itemA`) swaps places with the first
neighbor of the target — right, left, below, above, within the grid — that isn't part of any
link, so exactly two cards move and an earlier pair isn't broken to make a later one. Grid spots
are only ever swapped, so nothing can stack or overflow the box. (A neighbor that is itself
linked is never chosen; if every neighbor is, the pair is left as is — only possible with a
target surrounded by linked cards.)

Tests now check geometry, not slot numbers: the reported case moves nothing; for every
dragged/target pair in a 2×3 cluster, the target never moves, at most one other card moves, the
pair touches on screen, and every card still has its own spot; a chain keeps each earlier pair
touching and its first target fixed; a card dragged in from another cluster ends up touching its
target. All four failed on the previous version (the reported case first). The previous entry's
tests, which encoded consecutive slots, were removed, and the older "consecutive slots" test was
rewritten as a touching test. Full suite green (497/497), typecheck clean, production build
clean, boot-tested.

### Linking picks the card under the pointer (2026-09-17)

"If I click and hold/drag 1 around, it can only connect to 3. If I want to connect it to 2 from
the side, it's impossible. Could the mouse position near/on another code be used as a way to
guess which code the user wants to connect?"

Yes — and the cause was geometric. The snap target was the card whose *center* came within
70px of the dragged card's center. Cards are 180×64 with an 8px grid gap, so a card's
neighbor below has its center 72px away (just reachable by drifting a little) while its
neighbor beside is 188px away: to link sideways, the dragged card had to sit almost entirely on
top of the target. Vertical links worked, horizontal ones effectively never did.

New `findPointerSnapTarget` (replacing `findSnapTarget`, now removed with its tests): the target
is the card under the pointer, or the nearest card whose edge is within 16 screen pixels of it
(so pointing into the gap between two cards still picks the closer one; divided by zoom to get
canvas units). Which side of the target the dragged card snaps to follows where the pointer sits
on it, measured relative to the card's own width and height — so on a wide card, "the left part"
means left rather than being swamped by the vertical offset. The pointer's canvas position comes
from the grab offset recorded at mousedown (same approach as cluster drags) plus the live drag
delta. The live preview (ring on the target) and the commit use the same call.

Verified: 4 new tests on a 2×2 grid of real card sizes — the cards beside, below and diagonal
are each reachable by pointing at them; the side follows the pointer's position on the target;
in a gap the nearer card wins and nothing is picked beyond reach; the dragged card is never its
own target. Full suite green (497/497), typecheck clean, production build clean, boot-tested.

### REFI-QDA import, against a real QualCoder export (2026-09-17)

"I tried to import a REFI-QDA project, but categories were imported as codes and nested codes
rather than clusters." With the file itself (QualCoder 3.8.2, 22 interviews, 437 codebook
entries, 1,303 coded passages) — the first real export the importer had seen, which the previous
entry flagged as the thing to try. It found three problems, not one.

1. **Categories.** QualCoder doesn't use REFI Sets; it writes each category as a `<Code>` with
   `isCodable="false"`, nested as deep as its category tree (here 57 of them, up to 4 levels, with
   367 codes inside and 13 at the top level; no coding ever points at one). NVivo folders and
   MAXQDA code groups are exported the same way. The importer ignored the flag. Now a non-codable
   code becomes a cluster, nested under the nearest grouping above it; a codable code directly
   inside a grouping is a top-level code filed under that cluster; codable codes under codable
   codes keep their hierarchy; a note attached to a grouping attaches to the cluster; a coding
   pointing at a grouping (not allowed by the spec, but possible) is reported as skipped.

2. **No documents at all.** Measuring the real import showed all 22 sources refused with "its text
   is not in the file". The texts were there: QualCoder names the folder `Sources/`, the importer
   looked for `sources/` exactly. The main process now matches zip paths case-insensitively.

3. **Every passage shifted.** QualCoder records each selection's text in its `name` attribute, so
   the import could be checked word for word: all 1,303 passages were a few characters early.
   Probing the first source showed why — its positions are relative to the text **without its
   UTF-8 BOM and without carriage returns** (QualCoder reads files in universal-newline mode, so
   "\r\n" is one character); with both removed, positions matched exactly. The importer counted
   the BOM and subtracted the carriage returns a second time. The spec says neither, and other
   tools may count raw file content, so rather than hardcode one convention: the BOM is never
   counted, and `chooseSourceReading` maps a source's positions both ways (carriage returns
   counted or not) and keeps the reading under which more selections cover exactly their recorded
   text, defaulting to not counting them when there's no evidence. While in there, positions are
   now converted between REFI's characters (code points) and JavaScript's UTF-16 code units in
   both directions, so an emoji early in a transcript can't shift every later passage by one.

Result on the real file: 22 documents, 380 codes, 57 clusters with the same 7 top-level ones as
in QualCoder, 1,303 codings, nothing skipped, no structural edge on the board; of 1,303 passages,
925 identical to QualCoder's recorded text and 378 identical apart from whitespace (blank-line
runs inside a passage collapse on import), 0 different. ~75 ms.

Tests: QualCoder-shaped codebook (nested non-codable codes with hex character references in
names, codes inside, a code under a code, a note on a category, a coding on a category); the two
line-ending conventions with and without recorded passage text, starting from a BOM (the
QualCoder cases confirmed to fail with the old counting); code point conversion both ways and an
emoji round trip. The earlier "other tool" fixture now records its passages' text, so its
carriage-return counting is detected rather than assumed. Full suite green (505/505), typecheck
clean, production build clean, boot-tested; the real-file check was run as a temporary test
against the user's export, not committed.

### REFI-QDA export that QualCoder can open, with its categories (2026-09-17)

Reported: importing a Cadenza `.qdpx` into QualCoder failed with `ParseError: not well-formed
(invalid token): line 8, column 105`, and the user asked for clusters to arrive in QualCoder as
categories rather than being lost.

1. **Not well-formed XML.** A temporary test exported every local project and ran it through
   fast-xml-parser's validator: all failed at line 8 with "boolean attribute 'isCodable' is not
   allowed". fast-xml-parser's builder writes an attribute whose value is `true` as a bare name
   (`isCodable`) unless `suppressBooleanAttributes: false`; Cadenza's own lenient parser had
   accepted it, Python's ElementTree does not. Fixed, and characters XML 1.0 forbids outright
   (control characters, lone surrogates, U+FFFE/FFFF) are now stripped from every attribute and
   text value (`stripIllegalXmlChars`), since one pasted vertical tab would fail the same way.
   Verified: validator ok and ElementTree parses all seven local projects.

2. **Clusters as categories.** QualCoder (like NVivo folders and MAXQDA code groups) writes
   categories as `<Code isCodable="false">` with their codes nested inside. Clusters are now
   written into the CodeBook that way: sub-clusters, then the top-level codes whose first cluster
   it is (a code sits in one place in a tree), with color, definition, and notes attached. The
   Sets stay, for what a tree can't carry (a code in several clusters, filed notes, question
   kind), now with their own GUID plus a `Cadenza: cluster <guid>` line so the import merges each
   Set into its grouping instead of making a second cluster. Read against QualCoder's current
   `refi.py`: non-codable codes become `code_cat` rows with their nesting, codable codes under a
   code become sub-codes, Sets without MemberSource are ignored.

3. **Then: `UNIQUE constraint failed: annotation.fid, annotation.pos0, annotation.pos1,
   annotation.owner`.** From `refi.py`: a `PlainTextSelection` without a `Coding` becomes an
   annotation, and the table allows one per range; `code_text` allows one coding per code per
   range; `source`, `code_name`, `code_cat` and `journal` require unique names (a repeated source
   name makes its codings crash, a repeated code or category silently merges, and the journal
   fallback `randint(100-999)` would itself raise). The export now groups passages by range into
   one selection with the union of codes (each once) and notes, drops passages with neither
   (quotes filed under clusters don't travel anyway), and suffixes repeated names per kind
   (`uniqueNames`). Notes also get a `plainTextPath` file so QualCoder imports them as journals,
   and a passage's notes go in the selection's Description, which QualCoder shows as its memo;
   Cadenza's import now falls back to that file when a note has no inline text (how QualCoder
   exports journals).

Tests: well-formedness (validator, every attribute valued, forbidden characters gone); the
codebook shape (root clusters then unfiled codes, sub-cluster before codes, sub-code under its
code, no code repeated); a Cadenza round trip with nesting, question kind, definitions, colors,
multi-cluster membership, filed and cluster-attached notes, and exactly one cluster per category;
an older Set-only export still importing; ranges merged, codes once, empty passages dropped,
repeated names suffixed, merged passages keeping all codes and notes on re-import; journal text
read from its file. A Python script then checked the seven local exports against QualCoder's
unique constraints: none violated. Full suite green (513/513), typecheck clean, production build
clean, boot-tested.

### Filtered retrieval and Excel export of passages (2026-09-18)

Asked for after comparing Cadenza with NVivo, QualCoder and Taguette: what's missing without
leaving Cadenza's scope. Two picks: reading the passages behind a combined question, and getting
them out as a spreadsheet.

**Query.** `queryPassages(data, query)` in `shared/retrieval.ts` replaces the single-code
retrieval in the Retrieval view (`retrieveByCode` stays for the comparison and report code). A
query holds codes with a match mode (any/all), excluded codes, documents, and case-attribute
values, and a sub-codes toggle. "Meeting" is defined as in `cooccurrence.ts`, where two codes
co-occur on the same passage or on overlapping ones, so an AND here reads the same passages a
co-occurrence cell drills into, and EXCEPT drops a passage when an excluded code sits on it or on
anything overlapping it. Results are one entry per passage, not per coding (a passage coded with
a parent and its child used to show twice), with all its codes. No codes selected means every
coded passage, so the view doubles as a browser and the export can cover everything. Attribute
values compare trimmed, like `getAttributeValues`, which fills the filter's choices. On the real
QualCoder project (1,303 passages): all passages in ~3 ms, an AND of 40 codes with 2 exclusions in
~4 ms.

**UI.** Chip rows for Codes (with an Any/All toggle once there are two), Except, Documents and
Cases (one row of value toggles per chosen attribute), a result count, "Clear filters", and
passages rendered 200 at a time.

**Spreadsheet.** No spreadsheet library in the dependencies, and one table didn't justify one,
so `shared/spreadsheet.ts` writes SpreadsheetML by hand (inline strings, 3 cell styles, frozen
bold header, autoFilter plus the hidden `_FilterDatabase` name Excel writes itself, column widths,
wrapped long text, text capped at Excel's 32,767 characters per cell, tab names made legal and
unique) and the main process zips it (`export:spreadsheet`). `buildPassageSheet` gives one row per
passage (document, one column per case attribute, passage, codes as paths, clusters, notes), and
`buildQuerySheet` adds a tab recording the query. `stripIllegalXmlChars` moved to `text.ts`, where
the renderer can use it without pulling in the REFI module's XML parser, and `refiQda.ts`
re-exports it. The Export tab gained "Export coded passages (.xlsx)" and an up-to-date REFI
description.

Verified: files generated from the example project and from the real QualCoder import were read
back with openpyxl, an independent reader. Sheets, header, frozen pane, filter range, bold header,
wrapped passages, accents and the query tab all came back as written. Tests: query semantics
(every coded passage, one entry per passage with codes in codebook order, OR with and without
sub-codes, AND on the same or overlapping passages and not on adjacent ones, EXCEPT, documents,
attributes including several values, empty value lists and documents lacking the attribute, unused
codes), the passage and query sheets, and the package (parts well-formed, escaping, forbidden
characters, number cells, empty cells skipped, styles, freeze and filter, legal unique tab names,
no filter on a plain sheet). Full suite green (526/526), typecheck clean, production build clean,
boot-tested.

### Retrieval keeps its filters across tabs (2026-09-18)

Asked for while testing the filtered retrieval: leaving the Retrieval tab, for the Workspace say,
and coming back reset every filter, because they were component state and the view unmounts on a
tab change. The mode, the passage query and the note filters now live in `workspaceUiStore`,
which already held the other per-session UI state and resets with `resetForProjectSwitch`. Kept
filters are cleaned against the current project before use: codes, documents and attributes
deleted in the meantime are dropped, and a vanished note category falls back to "all", so a
stale filter can't silently match nothing. The list's scroll position and how many passages were
revealed are kept in a module-level record keyed by project and by the query object's identity.
Coming back to the same query lands on the same spot (the "Go to passage" round trip), and any
change to the query starts again at the top. Typecheck, 526 tests, build and boot all clean. The
round trip itself was not clicked through here.
