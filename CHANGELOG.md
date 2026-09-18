# Changelog

All notable changes to Cadenza are documented here, most recent first. This is the
short, user-facing version — see `DEVLOG.md` for the full narrated development log
(what was reported, why each fix happened, and how it was verified).

## [Unreleased]

### Added
- **Filter box in the Notes tab**, like the one in Codes & items: finds notes by their question,
  text or tags, and clusters by name, ignoring accents and case ("reunion" finds "réunion").
  A matching note shows inside its clusters; a cluster whose name matches shows with everything
  in it. Escape clears it. It sits in the existing filter row, next to "This doc / All" and the
  note category, so the tab gains no extra line.

### Changed
- **Large projects are much faster** (measured on 5 interviews, 500 codes, 500 notes, 1,300
  passages):
  - Opening the Workspace: 1.5 s → 0.1 s. Every code in the codebook carried a hidden "Merge
    into…" list of all the other codes (320,000 hidden entries for 500 codes); a code's action
    buttons now exist only while the pointer is on it.
  - Co-occurrence: opens in 0.1 s instead of 0.8 s, scrolls at ~22 ms a frame instead of 185 ms,
    and its checkboxes answer in ~70 ms instead of 0.5–0.9 s. Only the rows and columns in view
    are drawn, and the matrix is computed from the overlapping passages instead of comparing
    every pair of codes.
  - Compare cases: opens in 20 ms instead of 250 ms (rows drawn as they scroll into view, counts
    computed in one pass). The code column now has a fixed width; long names are cut with the
    full name on hover.
  - Search: typing no longer freezes on a short query with thousands of hits (1.4 s → 60 ms a
    keystroke). Hits are listed 200 at a time with "Show more", and the search itself is about
    ten times faster. Each document's total and "Code all N sentences" still count every hit.

### Fixed
- In a window of the default size, the "unsaved changes" note under the project name squeezed the
  buttons at the top (Undo, Redo, Save…) onto two lines as soon as something changed. The
  buttons now keep their place at any window size; the project name and file name are cut with
  "…" when space runs out (full text on hover), and "unsaved changes" stays visible. The line
  under the name shows the file's name, with the full path on hover.
- "Go to passage" (Retrieval, Search, Compare cases, Co-occurrence) opened the right document and
  marked the passage, but didn't scroll to it: a passage further down an interview stayed off
  screen. The reader now brings it to the middle of the view. Same for "Promote to code" from a
  note.
- Clicking a cell in Analysis → Co-occurrence seemed to do nothing: the shared passages were
  listed below the whole matrix, thousands of pixels down in a large codebook. They now open in a
  panel beside the matrix. The matrix also draws only the rows in view, so a codebook of a few
  hundred codes opens in under a second instead of several, and clicks respond at once.

### Added
- **Filtered retrieval** (Analysis → Retrieval): combine several codes, either *any* of them or
  *all* of them meeting on a passage (the passage itself or an overlapping one, as in the
  co-occurrence table), leave out passages where some other code meets, and narrow to some
  documents or to cases with given attribute values: "the nurses' passages coded Workload but not
  Support". Each passage is listed once with all its codes, the ones asked for highlighted. With
  no code chosen, every coded passage is listed.
- **Excel export of passages**: what the Retrieval view lists, or every coded passage (Export
  tab), as an .xlsx table, with one row per passage and columns for the document, each case
  attribute, the passage, its codes (sub-codes as "Parent › Child"), the clusters they're in, and
  the notes on it. The header row is frozen with filter buttons, and a second tab records the
  query behind the table. Opens in Excel, LibreOffice and Numbers.
- The Retrieval view keeps its filters, its mode (by code or by note) and your place in the list
  when you leave it: "Go to passage", read it in the Workspace, come back, and you're where you
  were. Filters naming something deleted since are dropped; opening another project starts fresh.

## [0.5.0] - 2026-09-17

### Added
- **Full-text search** (Analysis → Search): find every occurrence of a word or phrase across all
  documents, shown in context and grouped by document, with the codes already on each passage.
  Ignores case and accents by default ("reunion" finds "réunion"); whole-word and match-case
  options; can be limited to one document. From a hit, jump to it in the reader, code the
  sentence it sits in, or code every hit's sentence at once (one undo step).
- **Case attributes**: record facts about each case (interviewee role, site, age band, date…)
  under a document's title in the Workspace. Compare cases can then group by an attribute —
  one column per value instead of per case, with passage and case counts — in both the
  themes × cases table and the side-by-side contrast of one code.
- **Code co-occurrence** (Analysis → Co-occurrence): a codes × codes table of how often two
  codes land on the same passage, shaded by frequency, with each code's own passage count on
  the diagonal. Click a cell to see the shared passages and jump to any of them. Also available
  as a table in the report export.
- **PDF import**: born-digital PDFs and OCR'd scans (their text layer) import as paragraphs,
  with paragraph breaks inferred from the page's own line spacing and hyphenated line ends
  re-joined. A scan with no text layer is refused with a clear message instead of importing
  empty.
- **REFI-QDA exchange (.qdpx)**: export a project in the standard format NVivo, MAXQDA, ATLAS.ti,
  QualCoder and data repositories accept (Export tab), and open a .qdpx from another tool as a
  new project (home screen). Documents, codes with their hierarchy, coded passages and codings,
  notes, case attributes and clusters travel. Clusters are written as categories in the codebook,
  the way QualCoder, NVivo and MAXQDA write theirs, with their nesting, colors and codes inside;
  a code filed in several clusters appears under the first one elsewhere, while re-importing into
  Cadenza restores every membership, analytic questions and filed notes. Notes reach QualCoder
  as journal entries, and a passage's notes as its memo. Categories from other tools come back as
  clusters, and passages land on exactly the words they covered, whatever line endings the
  source used. Imports report what was brought in and what had to be skipped (audio/video
  sources). Tested against QualCoder in both directions. Boards, cluster links, quotes filed
  directly under a cluster, and note tags have no equivalent in the standard and stay in the
  Cadenza project; passages with neither a code nor a note aren't exported, and names shared by
  two documents, codes, clusters or notes get a " (2)" suffix, since QualCoder requires them
  to be unique.

### Fixed
- Shift-dragging a code onto another to link them could rearrange the cluster so that two
  *other* codes ended up side by side and looked like the linked pair. Linking now moves as
  little as possible: if the two codes already touch, nothing moves; otherwise the code you aimed
  at stays put and the dragged code swaps places with one of its neighbors, so the pair always
  ends up side by side or one above the other. While Shift-dragging, the code the drop will link
  to is now highlighted too.
- Shift-dragging a code could link it to the code *below* but never to the one *beside* it. The
  link target is now the code under the pointer (or right next to it), whichever direction it
  is in; where the pointer sits on that code decides which side the dragged code snaps to.

## [0.4.7] - 2026-09-17

### Fixed
- After "Reset placement" (or in a project whose clusters had never been moved), a cluster growing
  or shrinking — a card dropped in or taken out — rearranged the whole top level, sometimes
  sending clusters into other columns. Now only a cluster it actually runs into moves, and just
  far enough to make room.
- A cluster nested inside itself (only possible in a damaged project file) silently vanished from
  the board. It's now shown, with the loop cut.
- In some older project files, dragging a cluster did nothing visible (the project held two stored
  positions for it). Duplicates are cleaned up when the project is opened.

## [0.4.6] - 2026-09-16

### Added
- Cluster names (and the header's buttons) stay readable and clickable when the board is
  zoomed far out — the header counter-scales with the zoom, so a large board can actually be
  worked at 30%. Long names truncate to the frame's width at low zoom (full name on hover).
  PDF export is unaffected.
- Double-click a cluster's empty space to zoom the board to fit it; "Fit view" brings the whole
  board back. Double-clicking the name still renames it.

### Fixed
- A superordinate already full of clusters couldn't take another one: wherever you dropped it,
  it landed on one of the sub-clusters and nested *there* instead. Dropping a cluster with the
  pointer on another cluster's header now always puts it directly in that cluster (which grows
  to hold it), and the preview outline shows the size it will really grow to.
- After "Reset placement", simply clicking a cluster (or double-clicking it, or grabbing its
  resize handle without dragging) could make neighboring clusters jump elsewhere. Clicking now
  changes nothing, and a real move or resize leaves the other clusters where they are.
- Creating a new top-level cluster (from the board or the Workspace) could rearrange the
  auto-placed clusters, and "+ New cluster" on the Main board could land on top of an existing
  one. The new cluster now goes into free space and nothing else moves.

## [0.4.5] - 2026-09-16

### Fixed
- A superordinate that had grown to hold a cluster (or a cluster that had grown to hold a card)
  kept that size after the cluster/card left. Containers now shrink back to the size you last
  drew once their contents leave.
- Shrinking a superordinate that is itself nested inside another, to take a cluster out, made
  that cluster top-level while still sitting inside the outer superordinate. It now moves out by
  one level and becomes the outer superordinate's child.
- A card or cluster dropped past the board's top/left edge landed at coordinates the canvas
  never reaches. Drops now stop at the edge.
- A cluster whose superordinate no longer existed (possible in an older project file) was
  silently never drawn; it's now shown as a top-level cluster.
- Deleting a superordinate cluster sent its sub-clusters to remote places on the board. They now
  stay exactly where they were.
- Nesting or un-nesting a cluster, or adding/removing a code or note in a cluster, from the
  Workspace tree used to rearrange the whole board. Now only the cluster or card concerned
  moves: into the destination's grid, or — when pulled out to the top level — kept right where
  it was (a card taken out of its last cluster goes to the unclustered area).

## [0.4.4] - 2026-09-16

### Fixed
- Snapping a code onto a code in another cluster from *below* it left the dragged code a member
  of the cluster it came from, even though it now sat inside the other one (snapping from above
  worked). It now joins the cluster it was dropped in either way.
- Nudging a nested cluster partway past its superordinate's edge (without moving it out) drew a
  stray connector line instead of growing the superordinate to keep containing it.
- Nesting or un-nesting a cluster could shift the other clusters already in the group it joined
  (a superordinate's existing sub-clusters, or the board's top level). They now stay put.
- Shrinking a superordinate so that a never-touched sub-cluster no longer fit detached it but
  made it jump to the board's top-left grid instead of staying where it was.
- Resizing a cluster to enclose one that has its own sub-clusters flattened the whole hierarchy
  into direct children; it now nests that cluster as one unit, sub-clusters kept inside it. A
  nested cluster resized bigger than its own superordinate could also reset the superordinate's
  position.
- A code dropped against the bottom/right edge of a cluster could hang partly outside it; the
  cluster now grows to fit it.
- A cluster growing into a neighbor — a superordinate grown to fit what it just enclosed, a
  cluster grown to fit a new member, or a frame resized/dropped so it partly covers one — left
  that neighbor silently hidden underneath. The neighbor is now pushed to the nearest free
  space instead (taking its own sub-clusters and cards with it), so nothing ends up behind
  another cluster.
- An auto-placed card in the unclustered area could land exactly on top of a card you had
  dragged there by hand; it now takes the next free slot.
- Dropping a code into a cluster with no free space left stacked it on top of the card it was
  released over (or, when it snapped, on top of the next card along). The card that was already
  there now moves over to free space and the cluster grows to fit — the dropped card stays where
  you put it. Cards never stack anywhere on the board after a drop.
- Dropping a code into a cluster nested in a superordinate grew the superordinate for that one
  cluster only — two of its other, untouched clusters could be pushed out past its bottom edge
  (with connector lines back to it) and it never grew to keep them. A superordinate now always
  grows to keep containing every cluster inside it.

### Changed
- Clusters nested inside a superordinate are now always arranged in a grid automatically too, and
  the superordinate sizes itself to hold them — so nothing can be pushed out of it (no more
  stray connector lines from a cluster to the superordinate it's supposedly in), a click on a
  cluster can't rearrange its neighbors, and "Reset placement" can no longer leave a nested
  cluster orphaned. Free placement, and resizing a cluster around others to nest them, are for
  the board's top level. To take a cluster out of its superordinate, drag it out (or shift+drag
  it), or shrink the superordinate so the cluster no longer fits inside the box you draw — it's
  highlighted amber while you drag ("Will be taken out"), detached in place on release, and
  the superordinate then shrinks to what's left.
- Cards inside a cluster are now always arranged in a grid automatically, and the cluster sizes
  itself to hold them — dropping a card into a cluster files it at its place in the grid rather
  than leaving it wherever it was released, so nothing can end up stranded, stacked, or pushed
  out, and "Reset placement" can no longer change where a clustered card sits. Grid order follows
  the codebook; Shift-linked cards sit side by side. Free placement still applies to cards that
  aren't in any cluster. (Hand-arranging cards *within* a cluster is no longer possible — use
  sub-clusters for that.)
- Linking two cards on the board is now an explicit gesture: hold **Shift** while dragging a card
  near another to snap-link them. A plain drop never creates a link anymore (it used to whenever
  the drop happened to land near another card — which also made it impossible to drop a code
  into a full cluster without linking it to whatever was underneath). Shift can be pressed or
  released partway through a drag; the snap preview follows it.
- Moving a single card out of its linked group is now **Ctrl/Cmd**+drag (was Shift+drag).
  Shift+drag on a *cluster* still pulls it out of its superordinate, as before.

## [0.4.3] - 2026-09-16

### Fixed
- Dropping an item into an already-placed cluster that was too small let existing member
  cards spill outside its box, instead of the cluster growing to fit.
- Resizing a nested cluster left its superordinate cluster frozen at its old size, even once
  the resized cluster no longer fit inside it. Superordinate clusters now grow to keep
  containing what's nested in them.
- Resizing or moving one cluster could shove a completely different, untouched cluster into
  overlapping another one — including when moving a cluster *out* of its superordinate
  (dropping it on empty space, or un-nesting it), which could also make a stray connector
  line appear between an unrelated, uninvolved parent/child pair. Clusters now stay put
  unless you move or resize them directly.
- Moving a code between clusters while snap-linking it to a code already in the destination
  could land a different code from that cluster exactly on top of another one, or leave the
  cluster it left behind auto-resized smaller with its remaining item poking outside it.
- Resizing a cluster to enclose several others at once left them overlapping or pushed
  outside its bounds instead of packed into a clean grid, and could make a stray connector
  line appear between one of them and the cluster it just joined.
- Shrinking a cluster below a child it already contained left that child still marked as
  nested (with a stray connector line to show for it) instead of being detached.
- Resizing a cluster to enclose several others at once could leave one of them looking like it
  vanished — its items sitting in place with no frame around them, and its (correctly
  repositioned) empty frame showing up elsewhere — if that cluster had any individually-dragged
  member cards. Members now relocate together with their cluster when it's newly nested.
- The default board's auto-packed grid could land two clusters exactly on top of each other
  whenever one of them already had a fixed position and a still-unplaced one was packed around
  it — including resizing a cluster to enclose several others, which could drop one of the
  newly-enclosed clusters right onto a neighbor already nested inside it. Clusters now always
  pack into genuinely free space in the grid.

## [0.4.2] - 2026-09-15

### Fixed
- Snapping a code onto an existing cluster member didn't actually add it to that cluster —
  only the *next* time that pair was dragged together did it properly join. Now it joins
  immediately, the first time it snaps.
- A group's cluster reassignment could leave a member still listed under its real previous
  category too, alongside the new one — surfacing as a linked code landing outside its
  cluster, or in the wrong one entirely, after Reset Placement. Reassignment now cleans up
  every category a member actually belongs to, not just the one the group as a whole was
  leaving.

## [0.4.1] - 2026-09-15

### Fixed
- On the Main board's auto-packed grid layout, picking up an item that was already close
  to a neighbor could immediately snap/link it before any dragging happened — and in the
  worst case, a plain click with no movement at all could silently move the item and
  create a link. Snapping now only kicks in once you've actually started dragging.
- Clicking an item inside a cluster on the Main board could make a *different* item jump
  on top of it. A member's position in the cluster's grid no longer shifts depending on
  which of its siblings have already been clicked/dragged.
- Snap-linking two items where one had never been individually touched could leave them
  visually "hanging apart" instead of snapped together, could leave other cluster members
  unable to move along with a dragged group, and could make the unlink "×" vanish later.
  Links now always start with two fully real, stable items.
- Dragging a linked group of items into a cluster could split it — some members joining the
  cluster, others left behind or landing in a different one — if the group was wide/tall
  enough for a trailing member to fall outside the cluster the group otherwise reads as
  entering. The whole group's membership now follows its topmost item.
- A group linked before the fixes above could have a member silently fail to move along
  with the rest of the group on drag.

## [0.4.0] - 2026-09-14

### Changed
- On the Main board, deleting an item or cluster now actually deletes the underlying
  code/note/cluster from the whole project (same as deleting it from the Workspace),
  rather than only ever affecting this board's own layout — a clearly distinct (red)
  confirmation explains what will happen before it does.

### Added
- A theme/question choice when creating a cluster from the Workspace sidebar or from
  Notes' own "+ Add cluster" (previously theme-only there; the board and Analysis >
  Clusters already had it).
- "Promote to question-cluster" on each note, next to "Promote to code" — turns the
  note's own analytic question into a formal question-cluster and files the note
  under it.

### Fixed
- All text fields could become briefly unresponsive (1-2 minutes) after confirming a
  delete or a "Reset placement" — replaced every remaining native confirm/alert dialog
  with an in-page confirmation bar.

## [0.3.1] - 2026-09-14

### Added
- Automatic project backups: a silent snapshot is kept before every save (autosave and
  explicit Save alike), throttled and capped so it never bloats the disk. A new "History"
  button lets you browse and restore one as a copy — it never silently overwrites your file.

## [0.3.0] - 2026-09-14

### Added
- Bundled example project — "Explore an example project" on the home screen opens a
  small fictional study (3 interviews, ~195 codes, ~105 notes, 15 clusters under 3
  superclusters) demonstrating coding, AQA question-clusters, and the thematic map.
- Remove a stale entry from Recent Projects without touching the file it points to.
- Automatic connector lines between a cluster and its superordinate once a layout (Tree)
  separates them, so the relationship stays visible without spatial containment.
- Curved `ClusterLink` routing: a relationship bows around another cluster it would
  otherwise cut through, and spreads apart when more than one link joins the same pair.
- Per-board **Curved / Straight** toggle for how `ClusterLink`s are drawn.
- Per-board **Compact / Full** cluster-frame sizing for a curated board — live: switching
  it resizes whatever's already on the board, not just future additions.
- Cluster "focus": hovering a cluster dims every other cluster and link, leaving it and
  its own relationships at full opacity.
- "Reset placement" now works on any board (previously the default board only).
- "Link clusters" mode and its style controls are available on the default board too,
  not just curated ones.

### Fixed
- Tree layout no longer visually orphans a nested cluster from its superordinate
  (several related causes: the parent kept its old contains-children size, the board
  canvas clipped the connector, the connector itself was invisible or cut off).
- `ClusterLink` arrows and labels no longer hide behind code/note cards, no longer cut
  through a cluster's interior, and no longer bow off the top of the canvas.
- PDF export no longer includes interactive UI chrome (delete buttons, the color
  picker, resize handles) — just the figure itself.
- The example project's codes now genuinely match the transcript excerpts they're
  attached to (previously assigned by position, not content).

### Changed
- `ClusterLink` label legibility improved (larger, bolder, clearer background).

## [0.2.3] - 2026-09-11

### Fixed
- Tree layout row spacing — a tall parent cluster's own row could overlap its
  children's row underneath it.
- "Delete board" now uses an inline confirmation bar instead of `window.confirm()`,
  which could leave the new-board text field unresponsive on Windows/Electron.

## [0.2.2] - 2026-09-11

### Added
- Delete a board.
- "Add all clusters" and "Add all clusters and items" as separate actions.

### Fixed
- Tree and Radial layouts now carry a cluster's codes/notes along with it.
- Radial layout no longer flattens nested clusters into a single ring, discarding
  their nesting.

## [0.2.1] - 2026-09-11

### Fixed
- Deleting a cluster from the default board did nothing; now works, with a
  confirmation prompt.
- "Add all clusters" on a secondary board no longer produces an overlapping layout.

## [0.2.0] - 2026-09-11

### Added
- Results Draft export — reorganizes coded material into a writing aid.
- Labeled cluster-to-cluster links and one-click Tree / Radial layouts, for building a
  thematic-map figure (Braun & Clarke style).
- Alignment and distribution smart guides when dragging clusters on a board.

### Fixed
- Cluster-link labeling — `window.prompt()` is silently non-functional in Electron's
  renderer; replaced with an inline label input.
- Radial layout could push a cluster off the negative edge of the canvas, making it
  permanently unreachable.

## [0.1.1] - 2026-09-10

### Fixed
- GitHub Releases are now auto-published instead of left as drafts.
- macOS build re-signed with a Cadenza-specific ad-hoc identity.

### Documented
- The unsigned-build Gatekeeper (macOS) / SmartScreen (Windows) warning is expected
  for a small unsigned app and not a sign anything is wrong.

## [0.1.0] - 2026-09-08

Initial release — all nine build phases:

- **Persistence** — create/open/save `.qdaproj` projects, autosave.
- **Document import** — `.docx` / `.odt` / `.txt`, paragraph-structured reader pane,
  per-paragraph source editing that re-anchors existing codings.
- **Coding** — select text → apply codes/items, hierarchical codebook, merge codes.
- **Notes / AQA** — question+answer memos attachable anywhere, promote note → code.
- **Retrieval & clusters** — browse every instance of a code/note; nested cluster
  (category) management, including question-kind clusters and note categories
  (Descriptive / Linguistic / Conceptual).
- **Visual board** — freeform drag-and-drop grouping board with automatic layout, a
  code-info window, undo/redo, project rename.
- **Cross-case comparison** — a contrastive view across documents.
- **Exporters** — annotated `.docx`, board PDF, codebook/notes/comparison reports.
- **Packaging** — Windows, macOS, and Linux builds published via CI.
