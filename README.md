# FormTxt

Documents in the form family. An open, local-first alternative to Microsoft Word and Google Docs: paginated and pageless documents, .docx and .odt round trips, and Claude Code, Codex or Cursor drafting and editing live through the same commands a person uses.

Version 0.0.1 · Apache-2.0 · macOS, Windows, Linux (browser or Tauri desktop, planned)

## Status

Planning. No application code exists yet. The roadmap is `DEV_PLAN.md` in the planning sidecar, and the research baseline (199 Word and Google Docs capabilities, each with its vendor source) is the FormTxt page of the FormAI Parity Tracker.

## Planned stack

| Side | Choice | Port |
| --- | --- | --- |
| Frontend | Vanilla TypeScript and Vite, ProseMirror editing, own page layout | 5199 |
| Engine | Python 3.12 and FastAPI, owns the `.ftxt` model, exchange and exports | 8199 |
| Desktop | Tauri 2 with the frozen engine as a sidecar | |

## Family

FormTxt reuses Form.md's ProseMirror editor, FormDeck's home screen, command catalogue, agents and OOXML plumbing, and FormDesign's long-document features.

## Licence

Apache-2.0. See `LICENSE`. Copyright 2026 nodemode-ai.
