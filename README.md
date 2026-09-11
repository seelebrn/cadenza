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

Runs on Windows, macOS, and Linux. See `\plans\humble-herding-pike.md` for the
full design/phase plan.

## Download & install

Grab the latest build from the **[Releases page](https://github.com/seelebrn/cadenza/releases/latest)** — no account, no build step, just download and run.

| OS | File to download | How to run it |
|---|---|---|
| **Windows** | `Cadenza-Setup-<version>.exe` | Run it, follow the installer. (Or `Cadenza-<version>.exe` — same app, portable, no install.) |
| **macOS** (Apple Silicon) | `Cadenza-<version>-arm64.dmg` | Open the `.dmg`, drag Cadenza into Applications. |
| **Linux** | `Cadenza-<version>.AppImage` | Make it executable (`chmod +x Cadenza-*.AppImage`), then double-click or run it — no install step. |

Cadenza isn't signed by Apple or Microsoft — that costs money and isn't set up for this
project — so Windows and macOS both show a one-time security warning the first time you open
it. This is expected and not a sign anything's wrong; it's the same warning any small
unsigned app shows (comparable open-source QDA tools like QualCoder hit the exact same thing).

- **Windows** — "Windows protected your PC" (SmartScreen): click **More info**, then **Run anyway**.
- **macOS** — "Apple could not verify 'Cadenza' is free of malware…": open **System Settings → Privacy & Security**, scroll down to the line about Cadenza being blocked, and click **Open Anyway**. (On older macOS versions, right-click the app → **Open** → **Open** again works instead.)
- **Linux** — AppImages typically run without any warning.

Either way, it's a one-time step per computer — Cadenza opens normally after that.

Maintainers publishing a new release: see `release-runbook.html` in this repo for the full
step-by-step (open it in a browser).

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
npm run build:linux # build + package a Linux AppImage
```

In practice, real installers are built by CI (`.github/workflows/release.yml`), one native
runner per OS — see the Download & install section above for what end users actually get.

## Status

All nine planned phases are built and shipping:

- [x] Persistence — `.qdaproj` create/open/save, autosave
- [x] Document import — .docx/.odt/.txt, paragraph reader pane
- [x] Coding — select text → code/item, codebook hierarchy, merge
- [x] Notes/AQA — question+answer memos, attach-anywhere, promote-to-code
- [x] Retrieval + clusters — by-code/by-note browsing, theme/question cluster management
- [x] Visual board — drag-and-drop clustering of codes/notes/quotes, plus labeled
  cluster-to-cluster links and tree/radial layouts for a thematic-map figure
- [x] Cross-case comparison — Kaufmann contrastive view, IPA-style GECT table
- [x] Exporters — codebook/notes/comparison reports and the results-draft writing aid (docx/html/pdf)
- [x] Packaging — Windows/macOS/Linux builds, auto-published to GitHub Releases via CI

Excel import (spreadsheet row = case) was scoped out of Phase 8 in favor of the document-report
exporter and stays a backlog item. See the dated entries below for the technical detail behind
each round of work, and `\plans\humble-herding-pike.md` for the original phase plan.

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
