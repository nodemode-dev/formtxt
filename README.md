# FormTxt

Documents in the form family. An open, local-first alternative to Microsoft Word and Google Docs: paginated and pageless documents, .docx and .odt round trips, and Claude Code, Codex or Cursor drafting and editing live through the same commands a person uses.

Version 0.8.0 · Apache-2.0 · macOS, Windows, Linux (browser or Tauri desktop, planned)

## Status

Phase 1 of the plan: the home screen. Home has Start (open a file, a blank document, a dropzone for Markdown and text files, Paste text), Recent documents (pin, duplicate, save as template, delete with Undo), 39 original templates in 11 categories with search and a preview, and a Trash with restore and permanent delete. Phase 2 adds the editor: styles (Normal, Title, Subtitle, Quote, Heading 1 to 9), fonts and sizes, bold, italic, underline, strikethrough, superscript, subscript, colour and highlight, alignment, indents, line spacing, bulleted, numbered and checklist lists with nine levels, links, code blocks, page breaks, clear formatting, undo and redo, find and replace with match case and regular expressions, an outline of headings, Markdown-style shortcuts (`# `, `- `, `1. `, `[ ] `, `> `, three backticks), Word and Google Docs keyboard shortcuts, a live word count and autosave. It also has document tabs, collapsible headings, a style editor (modify a style, create one from it, or update it to match the selection), paragraph settings (indents and hanging indents, spacing, borders, shading, tab stops, keep with next, keep lines together, widow and orphan control), Format Painter, change case, underline styles, character spacing, a word count dialog, Find a Command (Ctrl+Shift+P) and keyboard shortcuts you can change (Ctrl+/). Phase 3 adds pages: documents lay out on real pages (paper size, orientation and margins from Page setup), paragraphs split across pages line by line with widow and orphan control, keep with next and keep lines together, page breaks, headers and footers with page numbers in five formats, a different first page and odd and even pages, page colour, page borders, a watermark, a pageless mode, and zoom from 25 to 300 percent. A ruler shows the margins, indents and tab stops of the current paragraph and its indent markers drag; line numbers run continuously or restart each page; Insert > Cover page adds a title page; Print layout, Draft, Read mode and Focus mode views; and double-clicking a header or footer lets you type in it on the page (Enter saves, Esc cancels). The Tab key inserts a tab that lines up with the paragraph's tab stops (left, centre, right or decimal, with dot, dash or underline leaders) or with the default stop every half inch. Section breaks start a new section on the next page with its own headers, footers and different first page, and page numbering in a section can restart or continue. Phase 4 starts with tables: insert one at the page width, Tab moves between cells and adds a row at the end, drag across cells to select them, drag a column edge to resize it, and right-click a cell to insert or delete rows and columns, merge and split cells or turn the header row on and off. Table properties set the look (grid, plain, rows only, banded, accent header), centring, repeating header rows on every page, cell shading and vertical alignment, and can distribute columns evenly or sort rows by a column. Text separated by tabs, commas, semicolons or pipes converts to a table and back, Markdown files with pipe tables open as tables, and long tables split between rows across pages.

With the window open, every command also runs from a terminal: `./formtxt cli run tools.stats`, `./formtxt cli run edit.replaceAll find=draft replace=final`, `./formtxt cli run tabs.add title=Appendix`. The roadmap is `DEV_PLAN.md` in the planning sidecar, and the research baseline (199 Word and Google Docs capabilities, each with its vendor source) is the FormTxt page of the FormAI Parity Tracker.

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
