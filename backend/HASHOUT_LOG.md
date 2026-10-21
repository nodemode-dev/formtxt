# HASHOUT_LOG · backend · formtxt

Living log of comment content, rationale and removed code for the engine. Source files stay comment-free; read this first, then edit surgically.

Current build version: v0.4.0
Last updated: 2026-10-21 · Phase 2b window bridge, keys in settings

---

## Org-navi-map

```
backend/
├── formtxt_engine.py        frozen-engine entry for the Tauri sidecar (Phase 11)
├── requirements.txt         pinned, Linux and Windows
├── requirements_macos.txt   unpinned, macOS wheels
├── oc_install(.bat)         venv plus requirements
├── boot_backend(.bat)       uvicorn on 127.0.0.1:8199
└── app/
    ├── main.py              FastAPI app, discovery file, routers
    ├── core/config.py       FORMTXT_ env, ports, data folders
    ├── core/ids.py          prefixed random ids
    ├── routers/system.py    health, version, capabilities, settings
    ├── routers/documents.py library: create, read, save, download, trash, restore
    ├── routers/commands.py  command catalogue mirror and search
    ├── routers/templates.py template catalogue, previews, save as template, instantiate
    ├── routers/live.py      WebSocket /api/live for the window bridge
    ├── services/bridge.py   relays a command to the open window and waits for its answer
    ├── services/model.py    .ftxt document model, default styles and sections
    ├── services/package.py  .ftxt zip pack and unpack
    ├── services/store.py    the library on disk: trash, purge, duplicate, adopt
    ├── services/thumbs.py   SVG wireframe thumbnails of a document's first page
    ├── services/intake.py   .md and .txt to a document
    └── services/templates/
        ├── catalog.py       the 39 templates and 11 categories
        ├── samples.py       original sample text per category
        ├── generator.py     template to .ftxt document (styles, fonts, accent)
        └── user.py          templates saved from documents (category Yours)
```

---

## Table of contents

- [app/core/config.py](#config)
- [app/services/model.py](#model)
- [app/services/package.py](#package)
- [app/services/store.py](#store)
- [app/routers/commands.py](#commands)
- [app/services/templates/](#templates)
- [app/services/thumbs.py](#thumbs)
- [app/services/intake.py](#intake)

---

## app/core/config.py {#config}

### config · ports and env
- refers-to: app/core/config.py :: FRONTEND_PORT, BACKEND_PORT, port()
- kind: rationale
- logged: v0.1.0 · 2026-10-21
- 5199 and 8199 avoid FormDesign (5196/8196), FormDeck (5197/8197, 5297) and Form.md (5750/8750). `FORMTXT_ENGINE_PORT` wins over `FORMTXT_PORT`, matching the frontend's `vite.config.ts`.

### config · data folder
- refers-to: app/core/config.py :: data_dir()
- kind: explainer
- logged: v0.1.0 · 2026-10-21
- The library lives in `~/FormTxt` (Documents, Trash, Templates, settings.json, engine.json); `FORMTXT_DATA_DIR` moves it, which is also how a throwaway library is used for checks.

## app/services/model.py {#model}

### model · style ids
- refers-to: app/services/model.py :: DEFAULT_STYLES
- kind: rationale
- logged: v0.1.0 · 2026-10-21
- Style ids equal WordprocessingML style ids (`Normal`, `Heading1`..`Heading9`, `Title`, `Subtitle`, `Quote`) so the Phase 7 .docx writer maps them 1:1.

### model · tabs and sections
- refers-to: app/services/model.py :: new_document()
- kind: explainer
- logged: v0.1.0 · 2026-10-21
- Every document has at least one section and one document tab from the start, so Phase 2 tabs and Phase 3 sections never need a migration.

## app/services/package.py {#package}

### package · mimetype first and stored
- refers-to: app/services/package.py :: pack()
- kind: rationale
- logged: v0.1.0 · 2026-10-21
- Same convention as ODF and EPUB: an uncompressed `mimetype` first lets file sniffers identify the package without unzipping.

## app/services/store.py {#store}

### store · atomic writes
- refers-to: app/services/store.py :: _write()
- kind: rationale
- logged: v0.1.0 · 2026-10-21
- Write to `.ftxt.tmp` then `replace`, so a crash mid-save never leaves a half-written document.

### store · save keeps media
- refers-to: app/services/store.py :: save()
- kind: explainer
- logged: v0.1.0 · 2026-10-21
- A save without media re-reads the media already in the package, so JSON-only saves from the editor never drop pictures.

## app/routers/commands.py {#commands}

### commands · Phase 0 scope (closed in v0.4.0)
- refers-to: app/routers/commands.py :: router
- kind: explainer
- logged: v0.1.0 · 2026-10-21, updated v0.4.0
- Mirror, list and describe since 0.1.0; since 0.4.0 `POST /api/commands/<id>` and `/batch` run commands in the open window through `services/bridge.py` and `routers/live.py` (WebSocket `/api/live`, loopback only). An unknown id is refused before the window is asked; with no window open the answer says how to open one. Simpler than FormDeck's bridge: no per-deck routing, the newest window answers.

## app/services/templates/ {#templates}

### templates · generated, not stored
- refers-to: app/services/templates/catalog.py :: TEMPLATES; generator.py :: build()
- kind: rationale
- logged: v0.2.0 · 2026-10-21
- The 39 built-in templates (owner's count) are generated in code on request, as FormDeck's are: one catalogue row per template (layout, accent, heading and body fonts, page size) plus category sample text. Nothing Microsoft or Google is bundled; every sample sentence is original.

### templates · fonts named, not yet bundled
- refers-to: app/services/templates/catalog.py :: SANS, SERIF, CLASSIC, MODERN, HUMANIST, PLEX, EDITORIAL, MERRI
- kind: warning-context
- logged: v0.2.0 · 2026-10-21
- The templates name OFL families (Source Serif 4, Libre Baskerville, Space Grotesk, Work Sans, IBM Plex, Playfair Display, Lora, Merriweather). Only Inter ships today; the reader falls back to Georgia or Inter until the fonts are bundled with the editor in Phase 2.

### templates · user templates
- refers-to: app/services/templates/user.py
- kind: explainer
- logged: v0.2.0 · 2026-10-21
- Saved templates are `.ftxt` packages named `t_[id].ftxt` in `~/FormTxt/Templates`, listed under the category Yours; built-in ids are refused by DELETE.

## app/services/thumbs.py {#thumbs}

### thumbs · wireframes instead of text
- refers-to: app/services/thumbs.py :: render()
- kind: rationale
- logged: v0.2.0 · 2026-10-21
- Cards show a wireframe of the first page (bars sized from text length, accent from the template) in a fixed 612 by 792 viewBox, so previews need no fonts, render identically everywhere, and never reflow when fonts load. Real page renders replace them once the Phase 3 layout exists.

## app/services/intake.py {#intake}

### intake · scope today
- refers-to: app/services/intake.py :: to_document()
- kind: todo
- logged: v0.2.0 · 2026-10-21
- `.md`, `.markdown` and `.txt` only; headings, quotes, list lines (kept as text in List Paragraph until lists land in Phase 2), bold, italic, code and links. Every other format answers 415 naming Phase 7.

### intake · Markdown pipe tables
- refers-to: app/services/intake.py :: _table(), _cells()
- kind: explainer
- logged: v0.8.0 · 2026-10-21
- Consecutive lines that start with `|` become one table block. A `|---|` second line makes the first row header cells and the table repeats it on each page; `:---:` and `---:` set centre and right alignment on that column's paragraphs; `\|` is a literal pipe. Columns share the page body width less 0.75 pt, so the collapsed outer border never makes the table one pixel wider than the body.

### documents · picture media
- refers-to: app/routers/documents.py :: add_media(), media(), _sniff(); app/services/store.py :: add_media(), media_file()
- kind: warning-context
- logged: v0.9.0 · 2026-10-21
- Uploads are identified by their first bytes, not the file name or the browser's type: PNG, JPEG, GIF, WebP, BMP and SVG, up to 40 MB each. They are named by the first 20 hex digits of their SHA-256, so the same picture is stored once and the name can be cached forever. Adding media rewrites the package under the store lock and leaves `document.json` alone, so it never races the editor's autosave. Media responses carry `content-security-policy: default-src 'none'; sandbox` and `nosniff`, so an SVG opened directly cannot run script on the app's origin. Each request unpacks the package; a cache is later work if large documents need it.

### data · reading .csv and .xlsx for charts
- refers-to: app/services/tabular.py :: parse(), _xlsx(); app/routers/data.py
- kind: rationale
- logged: v0.10.0 · 2026-10-21
- `POST /api/data/parse` turns an uploaded .csv, .tsv or .xlsx into rows of strings for the chart editor; nothing is stored. Workbooks are read with the standard library (zip plus XML): shared strings, inline strings, booleans and cached formula values, the first sheet unless one is named, up to 5,000 rows and 60 columns, with floating-point noise such as 0.30000000000000004 rounded to six places. CSV dialects are sniffed among comma, semicolon, tab and pipe. A live link that refreshes from a file on disk needs the desktop shell and is later work.

### model · walking blocks
- refers-to: app/services/model.py :: iter_runs(); app/services/thumbs.py :: render()
- kind: explainer
- logged: v0.8.0 · 2026-10-21
- Text now lives inside table cells as well as top-level paragraphs, so `iter_runs` walks cell bodies recursively; word counts use it and thumbnails draw a table as ruled rows with a shaded header row.
