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
- [ ] Phase 7 — Cross-case comparison (Kaufmann contrastive view, IPA-style GECT table)
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
