# Changelog

All notable changes to Cadenza are documented here, most recent first. This is the
short, user-facing version — see `DEVLOG.md` for the full narrated development log
(what was reported, why each fix happened, and how it was verified).

## [Unreleased]

### Fixed
- All text fields could become briefly unresponsive (1-2 minutes) after confirming a
  delete or a "Reset placement" — replaced every remaining native confirm/alert dialog
  with an in-page confirmation bar.
- On the default board, removing an item just reset its position instead of doing
  anything visible; a cluster's own remove button is disabled there for the same
  reason (every code/note/cluster always shows on that board) but now says so more
  clearly instead of looking broken.

### Added
- A theme/question choice when creating a cluster from the Workspace sidebar or from
  Notes' own "+ Add cluster" (previously theme-only there; the board and Analysis >
  Clusters already had it).
- "Promote to question-cluster" on each note, next to "Promote to code" — turns the
  note's own analytic question into a formal question-cluster and files the note
  under it.

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
