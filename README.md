# FormTxt

Documents in the form family. An open, local-first alternative to Microsoft Word and Google Docs: paginated and pageless documents, .docx and .odt round trips, and Claude Code, Codex or Cursor drafting and editing live through the same commands a person uses.

Version 0.3.0 · Apache-2.0 · macOS, Windows, Linux (browser or Tauri desktop, planned)

## Status

Phase 1 of the plan: the home screen. Home has Start (open a file, a blank document, a dropzone for Markdown and text files, Paste text), Recent documents (pin, duplicate, save as template, delete with Undo), 39 original templates in 11 categories with search and a preview, and a Trash with restore and permanent delete. Phase 2 adds the editor: styles (Normal, Title, Subtitle, Quote, Heading 1 to 9), fonts and sizes, bold, italic, underline, strikethrough, superscript, subscript, colour and highlight, alignment, indents, line spacing, bulleted, numbered and checklist lists with nine levels, links, code blocks, page breaks, clear formatting, undo and redo, find and replace with match case and regular expressions, an outline of headings, Markdown-style shortcuts (`# `, `- `, `1. `, `[ ] `, `> `, three backticks), Word and Google Docs keyboard shortcuts, a live word count and autosave. Pages and page layout arrive in Phase 3. The roadmap is `DEV_PLAN.md` in the planning sidecar, and the research baseline (199 Word and Google Docs capabilities, each with its vendor source) is the FormTxt page of the FormAI Parity Tracker.

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
