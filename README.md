# Cadenza

A local, single-user qualitative data analysis desktop app (Electron + React + TypeScript).

Supports coding text segments, regrouping codes into hierarchies, a generic question/answer
memo system usable for Paillé & Mucchielli's *Analyse par Questionnement Analytique* (and
other non-coding methods), a freeform drag-and-drop grouping board, and import/export with
Word (.docx), OpenOffice (.odt), and Excel (.xlsx/.xls).

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
- [ ] Phase 1 — Project persistence (`.qdaproj` create/open/save, autosave)
- [ ] Phase 2 — Document import (.docx/.odt/.txt) + reader pane
- [ ] Phase 3 — Coding engine (select text → code, codebook hierarchy, merge)
- [ ] Phase 4 — Notes/AQA system (question+answer memos, attach-anywhere, promote-to-code)
- [ ] Phase 5 — Visual grouping board (drag-and-drop clustering of codes/notes)
- [ ] Phase 6 — Retrieval/matrix view (frequency, code×document co-occurrence)
- [ ] Phase 7 — Excel import (row=case) + exporters (annotated .docx, .xlsx reports, backup)
- [ ] Phase 8 — Packaging polish (icons, verified Windows + macOS builds)
