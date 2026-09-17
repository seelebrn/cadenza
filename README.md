# Cadenza

A qualitative data analysis (QDA) desktop app for Windows, macOS and Linux. It runs locally,
for a single user: no account, no server, your projects stay on your computer.

## What it's for

**Coding is one lens among several, not the privileged one.** Codes, lightweight inventory
"items", and free-form notes are all first-class ways to work with a passage of text. A note
can be structured as a question and its answer, which supports Paillé & Mucchielli's
*analyse par questionnement analytique* (AQA). A cluster can be a theme, or itself an analytic
question.

**Quotes survive edits to the source.** Whenever you code, annotate or itemize a passage, its
exact wording is captured on the spot. You can still correct a transcript after import (fix a
transcription error, redact a name) with a per-paragraph editor, and every existing coding and
note is re-anchored automatically.

**One set of clusters, three views.** A cluster groups codes, notes and quotes. The board, the
Workspace sidebar's Clusters tab and the Analysis Clusters tab all show the same clusters, so
there is never anything to keep in sync.

## The board

The Main board shows every code, note and cluster automatically. It's where you group things
visually and build a thematic map.

**Clusters and nesting**
- Drag a cluster into another to nest it there, or resize a cluster so it encloses others.
- To put a cluster straight into a superordinate cluster — even a full one — drop it with the
  pointer on that cluster's header.
- To take a cluster out, drag it out, Shift+drag it, or shrink its superordinate past it.

**Automatic arrangement**
- Inside a cluster, everything is arranged for you: cards sit in a grid, sub-clusters in a grid
  of their own, and the cluster sizes itself to hold them. What you see is always exactly the
  membership and nesting — there's nothing to tidy up by hand.
- You place things freely only at the top level: top-level clusters, and cards that aren't in
  any cluster. Nothing is ever left hidden behind something else.

**Linking cards**
- Hold **Shift** while dragging a card near another to link them. A plain drop never links.
- Linked cards move together, and sit side by side in their cluster's grid.
- **Ctrl/Cmd**+drag moves a single card out of its linked group.

**Large boards**
- Ctrl/Cmd+scroll to zoom. Cluster names stay readable when zoomed far out.
- Double-click empty space in a cluster to zoom to it; **Fit view** shows the whole board again.

Other boards can be created alongside the Main board, curated by hand, with labeled links
between clusters and one-click tree or radial layouts — useful for building a figure.

## Analysis

- **Search** — find every occurrence of a word or phrase across all documents, in context, with
  the codes already on each passage. Accent- and case-insensitive by default. Jump to a hit in
  the reader, code the sentence around it, or code every hit at once.
- **Retrieval** — every passage coded with a code (optionally its sub-codes), and every note,
  filtered by category, tag, or whether it carries an analytic question.
- **Clusters** — manage clusters and what's filed in them, outside the board.
- **Compare cases** — a themes × cases table (IPA-style group experiential themes) and a
  side-by-side contrast of one code across interviews (Kaufmann). Record **case attributes**
  (role, site, age band…) under a document's title, and both views can group cases by one —
  what do the nurses say vs. the managers.
- **Co-occurrence** — a codes × codes table of how often two codes land on the same passage;
  click a cell to read the shared passages.

## Import and export

- **Import** documents from Word (`.docx`), OpenDocument (`.odt`), plain text (`.txt`) and PDF
  (`.pdf` — born-digital, or a scan that has been OCR'd; a scan with no text layer is refused
  with a message rather than imported empty).
- **Export** reports (codebook, notes, cross-case comparison, results draft) as `.docx`,
  `.html` or `.pdf`, and any board as a PDF figure.

## Download and install

Grab the latest build from the **[Releases page](https://github.com/seelebrn/cadenza/releases/latest)**.
There's nothing to build: download the file for your system and run it.

| System | File to download | How to run it |
|---|---|---|
| **Windows** | `Cadenza-Setup-<version>.exe` | Run it and follow the installer. `Cadenza-<version>.exe` is the same app as a portable version, no install needed. |
| **macOS** (Apple Silicon) | `Cadenza-<version>-arm64.dmg` | Open the `.dmg` and drag Cadenza into Applications. |
| **Linux** | `Cadenza-<version>.AppImage` | Make it executable (`chmod +x Cadenza-*.AppImage`), then double-click it or run it. |

### The first-launch security warning

Cadenza isn't signed by Apple or Microsoft (signing is paid, and isn't set up for this project),
so Windows and macOS show a security warning the first time you open it. This is expected, and
is the same warning any small unsigned app gets — comparable open-source QDA tools such as
QualCoder show it too.

- **Windows** — at "Windows protected your PC", click **More info**, then **Run anyway**.
- **macOS** — at "Apple could not verify 'Cadenza' is free of malware…", open **System Settings
  → Privacy & Security**, scroll to the message about Cadenza, and click **Open Anyway**. On
  older macOS versions, right-click the app → **Open** → **Open** instead.
- **Linux** — AppImages usually run without a warning.

You only need to do this once per computer.

## Development

Cadenza is built with Electron, React and TypeScript.

```
npm install
npm run dev          # launch the app with hot reload
npm run typecheck    # type-check main + renderer
npm test             # run the test suite (src/shared, renderer/src/lib)
npm run test:watch   # same, in watch mode
npm run build        # production build to ./out
npm run build:win    # package a Windows installer and portable exe
npm run build:mac    # package a macOS dmg/zip (on a Mac)
npm run build:linux  # package a Linux AppImage
```

Release installers are built by CI (`.github/workflows/release.yml`), one native runner per
system. Maintainers publishing a release: see `release-runbook.html` (open it in a browser).

## Status

All nine planned phases are built and shipping:

- [x] Persistence — `.qdaproj` create/open/save, autosave
- [x] Document import — `.docx`/`.odt`/`.txt`, paragraph reader pane
- [x] Coding — select text → code/item, codebook hierarchy, merge
- [x] Notes/AQA — question+answer memos, attach anywhere, promote to code
- [x] Retrieval and clusters — browse by code/note, theme/question cluster management
- [x] Visual board — drag-and-drop clustering of codes/notes/quotes, labeled cluster-to-cluster
  links, tree/radial layouts for a thematic-map figure
- [x] Cross-case comparison — Kaufmann contrastive view, IPA-style group experiential themes table
- [x] Exporters — codebook/notes/comparison reports and the results-draft writing aid
- [x] Packaging — Windows/macOS/Linux builds, published to GitHub Releases by CI

Excel import (a spreadsheet row per case) was left out in favor of the report exporters, and
remains on the backlog.

## Project history

- `CHANGELOG.md` — a short, per-release summary of what changed.
- `DEVLOG.md` — the full development log: what was reported, why each change was made, and how
  it was verified.
