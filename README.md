# Cadenza

A local, single-user qualitative data analysis desktop app (Electron + React + TypeScript).

Coding is one lens among several, not the privileged one: codes, lightweight inventory
"items", and freeform notes/memos (optionally structured as an AQA-style question+answer,
per Paillé & Mucchielli) are all first-class ways to work with a segment of text, and a
Category can itself *be* an analytic question rather than just a theme label. Whenever text
is coded, memoed, or itemized, the verbatim quote is captured on the spot, so it survives
even if the source document is later edited. A freeform drag-and-drop grouping board and
import/export with Word (.docx), OpenOffice (.odt), and Excel (.xlsx/.xls) round it out.

Runs on Windows and macOS. See `C:\Users\charb\.claude\plans\humble-herding-pike.md` for the
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
- [ ] Phase 3 — Coding engine (select text → code, codebook hierarchy, merge)
- [ ] Phase 4 — Notes/AQA system (question+answer memos, attach-anywhere, promote-to-code)
- [ ] Phase 5 — Visual grouping board (drag-and-drop clustering of codes/notes)
- [ ] Phase 6 — Retrieval/matrix view (frequency, code×document co-occurrence)
- [ ] Phase 7 — Excel import (row=case) + exporters (annotated .docx, .xlsx reports, backup)
- [ ] Phase 8 — Packaging polish (icons, verified Windows + macOS builds)
