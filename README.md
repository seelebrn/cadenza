# Cadenza

A local, single-user qualitative data analysis desktop app (Electron + React + TypeScript).

Coding is one lens among several, not the privileged one: codes, lightweight inventory
"items", and freeform notes/memos (optionally structured as an AQA-style question+answer,
per Paillé & Mucchielli) are all first-class ways to work with a segment of text, and a
Cluster can itself *be* an analytic question rather than just a theme label. Whenever text
is coded, memoed, or itemized, the verbatim quote is captured on the spot, so it survives
even if the source document is later edited — and it can be: a per-paragraph inline editor
lets you fix transcription errors or redact names after import, re-anchoring every existing
coding/note automatically. Clusters (a code/note/quote grouping — or itself an analytic
question) are the same data everywhere they appear: the board, the Workspace sidebar's
Clusters tab, and Analysis's Clusters tab are three views onto one list, not three copies to
keep in sync. Every code and note appears on the default board automatically, and clusters
can nest into superordinate groups (drag one into another; shift+drag to pull one back out).
Import/export with Word (.docx), OpenOffice (.odt), and Excel (.xlsx/.xls) rounds it out.

Runs on Windows and macOS. See `\plans\humble-herding-pike.md` for the
full design/phase plan.

## Development

```
npm install
npm run dev        # launches the app with hot reload
npm run typecheck  # type-checks main + renderer
npm test           # runs the pure-logic test suite (src/shared, renderer/src/lib)
npm run test:watch # same, in watch mode
npm run build      # production build to ./out
npm run build:win  # build + package a Windows installer/portable exe
npm run build:mac  # build + package a macOS dmg/zip (run this on a Mac)
```

## Status

- [x] Phase 0 — Electron + Vite + React + TS scaffold, boots on dev and production build
- [x] Phase 1 — Project persistence (`.qdaproj` create/open/save, autosave)
- [x] Phase 2 — Document import (.docx/.odt/.txt) + reader pane
- [x] Phase 3 — Coding engine (select text → code, codebook hierarchy, merge)
- [x] Phase 4 — Notes/AQA system (question+answer memos, attach-anywhere, promote-to-code)
- [x] Phase 5 — Retrieval (by code/note) + Cluster management (AQA question log)
- [x] Phase 6 — Visual grouping board (drag-and-drop clustering of codes/notes/quotes)
- [x] Phase 7 — Cross-case comparison (Kaufmann contrastive view, IPA-style GECT table)
- [ ] Phase 8 — Excel import (row=case) + exporters (annotated .docx, .xlsx reports, backup)
- [ ] Phase 9 — Packaging polish (icons, verified Windows + macOS builds)

### Methodology reality-check (2026-09-07)

The app's actual analytic targets are Kaufmann's comprehensive interview analysis, IPA,
Reflexive Thematic Analysis, and AQA. None of the four run end-to-end yet — Phase 5 closes
the two most foundational shared gaps (retrieval, real Category CRUD), but cross-case
comparison (Phase 7) still matters a lot for IPA/RTA specifically, and export/write-up
(Phase 8) matters for all four eventually.

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

User-facing text now says "cluster" everywhere this concept appears (Board, Analysis,
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

The Notes tab got the same treatment (2026-09-07): clusters render as rows in the same tree
as notes there too, with drag-and-drop to file a note under a cluster or pull it back out,
and its own compact "+ New cluster" control. Add Code and Add Note stay separate creation
forms — their fields don't overlap enough to earn a merged form — but the cluster tree
itself is shared code (`renderer/src/lib/clusterTree.ts`), so the Codes tab, the Notes tab,
the board, and Analysis are five views on one `data.categories`, never five copies.

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

Two related requests: on first opening the board for a new project, auto-placed
(non-nested) clusters shouldn't overlap each other by accident, and a code/note that's a
cluster member should actually render *inside* its cluster's box, not scattered in the
separate flat item grid. The old layout put every category and every code/note through two
completely independent fixed-size grids sharing the same origin, with no relationship
between a cluster's box and its own members' positions — clusters could only avoid
overlapping *each other* by coincidence of matching a fixed cell size, and a clustered
item's auto position had nothing to do with where its cluster was drawn.

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
destination's other existing children too, which is a bigger feature than what was asked
for here.

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

The last, biggest item from the QoL list: Ctrl/Cmd+Z to undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y)
to redo, plus header buttons showing enabled/disabled state — up to 50 steps back, skipped
while focus is inside a text field so native in-field undo still wins there. Almost every
store action already funneled through one function, `updateProject`, so history-tracking
lives entirely there rather than needing to touch each of the ~40 individual actions:
`past`/`future` are stacks of whole `ProjectData` snapshots, cheap to keep many of despite
sounding wasteful, since every op already builds its result via `{ ...data, changedField }`
— structural sharing means an undo entry is mostly pointers to the same unchanged sub-trees,
not a deep clone. Assets (imported files' raw bytes) deliberately sit outside the history —
undoing a document import removes the document record but leaves its bytes in memory, a
small accepted trade-off against tracking a second, much larger piece of state per edit.

The harder problem was that a single user gesture — dragging a whole linked group of board
items, moving a cluster together with its nested subtree and re-evaluating membership,
nesting one cluster into another *and* resizing the destination to fit — routes through
several separate store-action calls, which without help would each become their own undo
step (hit undo once after a five-item drag and only one item would move back). Added
`withBatch(fn)`: calls inside `fn` still apply immediately (so a later call in the same
gesture sees an earlier one's result), but only the state from *before* the batch's first
change gets pushed to history, once, when the outermost batch ends — nested batches collapse
into that same one entry. Wrapped it around the board's drag-drop commit and every other
handler that fires more than one store action per user gesture (a code or note crossing
from one cluster into another, creating a cluster while filing the active quote under it).

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

Caught and fixed a bug in my own first pass via the test suite before shipping: an initial
width floor on nested boxes (so they wouldn't shrink to nothing at extreme depth) clamped a
deeply-nested child back up to the same width as its equally-floored parent while still
indenting it — meaning it overflowed the parent's right edge once both hit the floor.
Removed the floor entirely; at any realistic nesting depth width stays comfortably
positive, and the pathological case just renders a very narrow box instead of a crash.
Also investigated the separately-reported "notes don't follow when a cluster moves, unlike
codes" — traced the full move/materialize path end to end and could not find any
code-level asymmetry between refType 'code' and 'note' (three targeted runtime tests,
including one specifically simulating a note that's a member of a *nested* cluster, all
passed against the pre-fix code too). It's possible this was actually the nesting-
integration issue above, now fixed — worth re-testing; flagged in the session as unresolved
rather than claimed fixed, since I couldn't reproduce a distinct bug to point to.

Verified: typecheck and build clean. Unit-tested the new layout extensively (bundled with
esbuild, run with node, then deleted): a nested cluster fully contained inside its real
parent, parent height growing to fit a nested child, three levels of transitive containment,
sibling root clusters and sibling nested children both never overlapping, an explicit
(user-placed) parent still correctly anchoring a virtual child, a later root cluster
clearing a tall nested subtree, non-default boards still auto-showing nothing, a fully
-cyclic pair (unreachable from any root, given the single-parentCategoryId data model)
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
isolation (only touches the target board) and the full end-to-end scenario the user
described (boardOps.ts + categoryOps.ts bundled with esbuild, run with node, then deleted):
two explicit, far-apart sibling clusters; nest one into the other via the Workspace path
(reparent + reset, no board drag) and confirm the child now sits inside the grown parent;
pull it back out and confirm they're visually separated again. Boot-tested a separate
packaged instance (window title "Cadenza", no errors), then killed it and confirmed no
electron process was left running.

### Two follow-up fixes to the reflow above (2026-09-07)

The user tried it and reported two problems. Both real, both fixed:

- **Member items were left outside their (reflowed) cluster.** `resetDefaultBoardClusterLayout`
  deliberately left board *items* untouched, matching the pre-existing rule that an item
  with its own explicit position keeps it regardless of where its cluster's frame moves to
  — reasonable for a manual board drag, wrong here: after a Workspace-driven reflow, *every*
  already-materialized member (which in an actively-used project is most of them) stayed
  frozen at its old absolute spot while its cluster's frame moved out from under it. Fixed
  by having the reset also drop the explicit `BoardItem` position of any code/note/segment
  that's a member of *some* category — same reasoning as the cluster shapes themselves,
  just extended to their contents. Unclustered items are untouched, same as before.
- **The nesting was positionally correct but not visually readable.** Turned out not to be
  a data bug at all — the user confirmed nested clusters *do* move together and stay
  logically linked. The problem was that every cluster frame, root or nested, used the same
  near-transparent (~6% opacity) fill and only a 10px margin, so a box drawn entirely inside
  another one just blended into it — technically contained, not perceptibly so. Added
  `fillOpacityForDepth` (BoardView.tsx): a root cluster keeps that original subtle fill, and
  each nesting level below it gets a visibly more opaque fill of the same color, so a nested
  cluster reads as a distinct layer sitting on top of its parent. Also doubled
  `CLUSTER_PADDING` (10px -> 20px) for a clearer gap around a nested box's edges.

Verified: typecheck and build clean. Unit-tested the item-position reset in isolation
(a clustered item's explicit position on the target board is dropped, an unclustered
item and an item on a *different* board are both left alone) and re-ran the nested-
containment test suite against the larger padding to confirm nothing regressed (still
contained at three levels, siblings still don't overlap, a 15-level chain still places
everything without overflow). Boot-tested a separate packaged instance alongside the
user's own running dev session (window title "Cadenza", no renderer errors — only the
disk-cache warnings expected from two Electron instances sharing a user-data dir), then
killed only that instance's PIDs and confirmed the process list returned to exactly what
was running beforehand.

### A real test suite (2026-09-07)

Every correctness guarantee established across this whole session so far — nested cluster
containment, undo/redo batching, item materialization on drag, auto-layout non-overlap,
drag-and-drop membership transfer, the codebook search filter's ambiguous cases — had only
ever been verified with a throwaway script (bundle with esbuild, run with node, delete).
None of it was protected against a future regression. Added Vitest (pinned to a version
compatible with this project's Vite 5, since latest Vitest requires Vite 6+) and ported
the substance of that ad hoc testing into a permanent suite: `npm test` runs it,
`npm run test:watch` for development. 232 tests across 11 files, all pure-logic (no React,
no Electron, no DOM — a plain node environment), covering every `src/shared/*.ts` module
with actual logic (the two without a test file, `api.ts` and `types.ts`, are pure type
definitions with nothing to run).

Also extracted the Workspace codebook tab's tree-building/search-filter logic
(`buildTree`/`findTreeNode`/`pruneClaimed`/`filterTreeByQuery`/`filterClusterTree`/
`treeHasMatch`) out of `CodebookPanel.tsx` into `renderer/src/lib/codebookTree.ts` —
it was pure logic with real edge cases (a code that's both a subcode of another code AND a
cluster member; a search match needing to keep its whole subtree rather than re-filtering
within an already-matched branch) sitting inert inside a `.tsx` file where it couldn't be
tested at all. Shrunk `CodebookPanel.tsx` by about 90 lines in the process — a small piece
of the "BoardView.tsx and friends are oversized" cleanup flagged in the codebase review,
done as a natural side effect of making this logic testable rather than a separate pass.

### Reflow was still missing for plain membership changes (2026-09-07)

The user reported the same visual symptom again after the two fixes above: codes not
landing inside their cluster's box after joining/splitting clusters, still logically
linked but not positioned right, and suggested larger default cluster boxes might help.

The default sizing was never actually the problem — `getVisibleBoardClusters`'s
`computeHeight` already sizes a cluster dynamically from its real content
(`Math.max(DEFAULT_CLUSTER_HEIGHT, ownContentHeight + childrenHeight)`), so tuning the
constants wouldn't have touched the actual bug. The real gap: the reflow-on-change wiring
added in the two sections above only covered a *cluster's own nesting* changing
(`reparentCategoryAndReflowBoard`, calling `reparentCategory`). It never covered a
*code or note's cluster membership* changing — `addCodeToCategory`, `removeCodeFromCategory`,
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
instance alongside the user's own running dev session (only the expected shared-user-data-
dir disk-cache warnings, no real errors), then killed only that instance's PIDs and
confirmed the process list returned to exactly what was running beforehand.

### Low-risk cleanup: splitting BoardView.tsx and deduping the cluster rows (2026-09-07)

Picked up from the earlier codebase review: `BoardView.tsx` had grown to 1136 lines, and
`CodebookPanel.tsx`/`NotesPanel.tsx` each had their own ~95%-identical cluster-row
component (`ClusterRow`/`NoteClusterRow`) — same header chrome, same drag/drop plumbing,
differing only in which kind of member (code vs. note) they file. Pure extraction, no
behavior change intended anywhere in this pass.

`BoardView.tsx`'s `ClusterFrame` and `BoardItemCard` were already broken out into their
own function components (from earlier session work) but still lived in the same file,
sharing its module-level `DragState` type and `MIN_CLUSTER_WIDTH`/`MIN_CLUSTER_HEIGHT`
constants by closure. Moved both into their own files (`ClusterFrame.tsx`,
`BoardItemCard.tsx`), and factored what they needed out from under `BoardView.tsx` into
two small shared modules rather than importing types back out of the file that imports
them: `boardDragTypes.ts` (the `DragState`/`Position` types) and
`boardLayoutConstants.ts` (the two resize-floor constants). `BoardView.tsx` dropped from
1136 to 872 lines.

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
Boot-tested a separate packaged instance alongside the user's own running dev session
(only the expected disk-cache warnings), then killed only that instance's PIDs and
confirmed the process list returned to exactly what was running beforehand.

### Board ease-of-use: a stuck-drag bug and highlighting cluster nesting (2026-09-08)

Two requests. The first ("clusters sometimes won't move — cursor turns into a 'no-drop'
forbidden icon, and the box snaps back to where it started") was hard for the user to
reproduce on demand, so this is a diagnosis-and-fix rather than a confirmed root cause —
worth saying plainly rather than claiming certainty. `ClusterFrame`'s draggable header
(and `BoardItemCard`'s card) move via a custom mousedown/mousemove/mouseup implementation,
not native HTML5 drag-and-drop — but the header's content is plain text (the cluster name,
an emoji), and neither element had `select-none`. A mousedown-then-move gesture that lands
on that text can be interpreted by the browser as "drag this selected text" instead of (or
racing) the app's own drag: the OS shows exactly the reported forbidden cursor, and —
worse — a native drag swallows the `mouseup` event the app's `window` listener is waiting
for, so the move never commits. Since nothing ever actually changed in the store, the
cluster's next render draws it right back at its stored position: the reported "reverts to
its original position." Matches the "hard to reproduce" complaint too, since it depends on
exactly where the mousedown lands relative to the text, not on any particular cluster or
action. Fixed by adding `select-none` to both `ClusterFrame`'s frame/header and
`BoardItemCard`, plus `onDragStart={(e) => e.preventDefault()}` on both as a backstop for
a selection that already existed before the mousedown. If this turns out not to be the
whole story, the next time it's reproducible, checking whether a text selection was
visible right beforehand would confirm or rule this out.

The second request: a visual highlight for board nesting, in both directions the user
asked for.

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
alongside the user's own running dev session, confirmed no errors beyond the expected
disk-cache warnings, killed only that instance and confirmed the process list returned to
its prior state. The stuck-drag fix specifically still needs the user's own hands-on
confirmation next time it comes up, since the underlying trigger couldn't be reproduced
in this session.

### Phase 7: cross-case comparison (2026-09-08)

The plan called for a Kaufmann-style contrastive view across interviews and an IPA-style
Group Experiential Themes (GECT) table (themes × cases) — flagged as "an upgrade of Phase
5's retrieval view into a matrix." Implemented as a new Analysis > Compare cases tab.

No separate case/participant concept exists in the data model, so a "case" is simply one
document — matches how documents are already used everywhere else (one transcript per
import), confirmed as the right call before building rather than assumed. Added
`comparison.ts` (`getCases`: every document as a case, oldest-imported first; `getCodeCaseMatrix`:
count of coded passages per code per case, reusing the already-tested `retrieveByCode`
rather than re-deriving the same segment/coding/document joins a second time) plus a new
component, `ComparisonView.tsx`, with two linked sub-views:

- **Themes × cases**: a table, codes down the rows (indented by depth, same list source as
  the plain retrieval view) and cases across the columns, each cell the count of coded
  passages — the GECT table, using the existing code hierarchy as the theming structure (a
  parent code as a superordinate theme, its children as sub-themes) rather than inventing a
  second, category-based rollup alongside it. A "Roll up sub-codes" toggle matches the
  plain retrieval view's equivalent option. Clicking a non-zero cell jumps straight to the
  contrast view below, already filtered to that code — a low-cost way to drill from "how
  much" to "what, exactly," without building a separate expansion UI per cell.
- **Contrast one code**: pick a code, see every case's instances of it in its own
  side-by-side column, including a case with zero instances (shown as "No instances in this
  case" rather than omitted) — this is the Kaufmann-style reading, where whether a case
  addresses something at all is as analytically meaningful as what it says when it does.
  Each quote has a "Go to passage" link, reusing the same navigate-to-source-text pattern
  already used by the plain retrieval view.

Verified: typecheck clean, full suite 242/242 (six new `comparison.ts` tests: cases sorted
by import date, per-code-per-case counts, descendant roll-up on/off, zero-count cells
omitted rather than carried as explicit zeros, multiple codes counted independently).
Production build clean. Boot-tested a fresh packaged instance (no other instance was
running this time, so no shared-user-data-dir warnings either — a clean launch with no
errors at all), then killed it and confirmed no electron process was left running.

### A large synthetic test project, and what using it surfaced (2026-09-08)

Generated `LargeProjectTest.qdaproj` (untracked, matches the existing `*.qdaproj` gitignore
rule) to usability-test a big hierarchy: 500 codes, 30 clusters, 5 superordinate clusters,
nothing else — deliberately minimal so opening the Board immediately exercises the
auto-layout at that scale. Verified end-to-end through the app's own logic before handing
it over (unzip -> parse -> `normalizeProjectData` -> `getVisibleBoardClusters`/
`getVisibleBoardItems`) rather than just asserting it would probably work.

Using it surfaced two real issues, plus two follow-on feature requests once the grid idea
proved out.

**Ctrl/Cmd+wheel zoom silently did nothing on a freshly opened project.** The wheel
listener effect had an empty dependency array, attached once to
`scrollContainerRef.current` on mount. But the scrollable container only exists once
`currentBoard` resolves to a real board — on a fresh mount `currentBoard` is still `null`
on the very first render (the effect that fixes a stale/empty `selectedBoardId` hasn't run
yet), so the listener attached to a still-`null` ref and never got a second chance once the
container actually appeared. Not specific to a large project at all — reproducible on
*any* fresh Board-tab mount — just more consistently hit while opening a brand new project
for the first time, which is exactly what surfaced it. Fixed by depending on `currentBoard`
instead of `[]`, so the effect re-attaches once the container exists.

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

Immediately after seeing that, two follow-on requests arrived, both extending the same
idea further:

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
