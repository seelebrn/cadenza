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
can nest into superordinate groups (drag one into another, or resize one around others; drag it
out, shift+drag it, or shrink the superordinate past it, to pull it back out). Inside a cluster, everything is arranged automatically: its cards sit in a grid and
its nested sub-clusters in a grid of their own, and the cluster sizes itself to hold them all —
so the picture is always exactly the membership and nesting, never something to tidy up by hand.
Free placement is for the board's top level: top-level clusters and cards outside any cluster. Codes and notes link into rigid
little groups only when you ask: hold Shift while dragging a card near another to snap-link them
(a plain drop never links; linked cards sit side by side in their cluster's grid); Ctrl/Cmd+drag
moves one card out of its group on its own.
Import/export with Word (.docx), OpenOffice (.odt), and Excel (.xlsx/.xls) rounds it out.

Runs on Windows, macOS, and Linux. See `CHANGELOG.md` for a short, per-release version
history, `DEVLOG.md` for the full narrated development log, and `\plans\humble-herding-pike.md`
for the original design/phase plan.

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
exporter and stays a backlog item.

For a short, per-release summary of what shipped, see `CHANGELOG.md`. For the full narrated
development log — what was reported, why each fix happened, how it was verified — see
`DEVLOG.md`. `\plans\humble-herding-pike.md` has the original phase plan.
