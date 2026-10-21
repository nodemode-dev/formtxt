# FormTxt

Documents in the form family. An open, local-first alternative to Microsoft Word and Google Docs: paginated and pageless documents, .docx and .odt round trips, and Claude Code, Codex or Cursor drafting and editing live through the same commands a person uses.

Version 0.1.0 · Apache-2.0 · macOS, Windows, Linux (browser or Tauri desktop, planned)

## Status

Phase 0 of the plan: the scaffold and the engine contract. The engine creates, lists, saves, downloads and trashes `.ftxt` documents in your library, and the window is a themed shell with the first commands. The editor arrives in Phase 2. The roadmap is `DEV_PLAN.md` in the planning sidecar, and the research baseline (199 Word and Google Docs capabilities, each with its vendor source) is the FormTxt page of the FormAI Parity Tracker.

## Quick start

```bash
./formtxt_oc_install      # backend venv and frontend packages
./formtxt                 # engine on 127.0.0.1:8199, app on http://localhost:5199
./formtxt cli list        # the command catalogue, while the window is open
```

Windows: `formtxt_oc_install.bat`, then `formtxt.bat`. Requires Python 3.12 or newer and Node 20.19 or newer.

## Stack and ports

| Side | Choice | Port |
| --- | --- | --- |
| Frontend | Vanilla TypeScript 7 and Vite 8; ProseMirror editing and its own page layout from Phase 2 | 5199 (preview 5299) |
| Engine | Python 3.12 and FastAPI, owns the `.ftxt` model, exchange and exports | 8199 |
| Desktop | Tauri 2 (`./formtxt desktop dev`); the frozen engine sidecar lands in Phase 11 | |

`FORMTXT_UI_PORT`, `FORMTXT_ENGINE_PORT` and `FORMTXT_DATA_DIR` (default `~/FormTxt`) override the defaults. Both servers listen on this computer only.

## Files

`.ftxt` is a zip of `document.json` and `media/`; the contract is `docs/FORMAT.md`.

## Family

FormTxt reuses Form.md's ProseMirror editor, FormDeck's home screen, command catalogue, agents and OOXML plumbing, and FormDesign's long-document features.

## Licence

Apache-2.0. See `LICENSE`. Copyright 2026 nodemode-ai.
