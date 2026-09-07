# Cadenza

A local, single-user qualitative data analysis desktop app (Electron + React + TypeScript).

Coding is one lens among several, not the privileged one: codes, lightweight inventory
"items", and freeform notes/memos (optionally structured as an AQA-style question+answer,
per Paillé & Mucchielli) are all first-class ways to work with a segment of text, and a
Category can itself *be* an analytic question rather than just a theme label. Whenever text
is coded, memoed, or itemized, the verbatim quote is captured on the spot, so it survives
even if the source document is later edited — and it can be: a per-paragraph inline editor
lets you fix transcription errors or redact names after import, re-anchoring every existing
coding/note automatically. A freeform drag-and-drop grouping board and import/export with
Word (.docx), OpenOffice (.odt), and Excel (.xlsx/.xls) round it out.

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
- [x] Phase 5 — Retrieval (by code/note) + Category management (AQA question log)
- [ ] Phase 6 — Visual grouping board (drag-and-drop clustering of codes/notes/quotes)
- [ ] Phase 7 — Cross-case comparison (Kaufmann contrastive view, IPA-style GECT table)
- [ ] Phase 8 — Excel import (row=case) + exporters (annotated .docx, .xlsx reports, backup)
- [ ] Phase 9 — Packaging polish (icons, verified Windows + macOS builds)

### Methodology reality-check (2026-09-07)

The app's actual analytic targets are Kaufmann's comprehensive interview analysis, IPA,
Reflexive Thematic Analysis, and AQA. None of the four run end-to-end yet — Phase 5 closes
the two most foundational shared gaps (retrieval, real Category CRUD), but cross-case
comparison (Phase 7) and the clustering board (Phase 6) still matter a lot for IPA/RTA
specifically, and export/write-up (Phase 8) matters for all four eventually.
