# HASHOUT_LOG · backend · formtxt

Living log of comment content, rationale and removed code for the engine. Source files stay comment-free; read this first, then edit surgically.

Current build version: v0.30.7
Last updated: 2026-11-12 · the v0.30.7 review fixes (section below). Before: 2026-10-31 · .js, .mjs and .css keep their types on Windows; the Linux packages pull in the media plugins. Before: macOS engine signed for notarization

---

## v0.30.7 · review fixes (2026-11-12)

Each line names the file and symbol, then what changed and why. The commit of the same subject carries the full reasoning and what was run.

Engine, routers and stores:

- services/package.py :: `unpack`, services/collab/addins.py, services/tabular.py, services/objects_fonts.py · the declared uncompressed size is checked before any entry is inflated (WOFF inflate is capped); a one megabyte `.ftxt` inflated to a gigabyte.
- routers/documents.py, exchange.py, printing.py, data.py, objects.py · imports, PDF opening, media uploads and table parsing run in a thread (`asyncio.to_thread`); they blocked every route, the live bridge and collab sockets while they ran.
- routers/documents.py, exchange.py :: `import_files` · one unreadable file is reported per file instead of failing the batch after earlier files were stored.
- routers/documents.py, printing.py, collab.py, objects.py · Content-Disposition carries an ASCII `filename` and an RFC 5987 `filename*`; a title with any non-Latin-1 letter answered 500. A follow-up commit keeps the plain name last, as the older header had it.
- routers/printing.py :: `_pdf` · `LayoutError` answers 422.
- services/collab/hub.py :: `_join` · only an edit peer's document can seed a session; a view or comment link could set the base the owner's window then adopted.
- services/objects_files.py :: `member` · reads through `store.media_file`, so media in a password-protected document is served when unlocked and answers 423 when locked.
- services/store.py :: `save`, `restore`, routers/documents.py · a save to a trashed id is refused and restore answers 409 when a newer copy exists.
- services/bridge.py :: `detach`, `call` · futures sent to a window are failed when it disconnects; callers waited the full 60 s.
- routers/versions.py :: `set_password`, `remove_password` · the document is read after the slow key work, so an autosave during it is kept.
- services/formula.py :: `Evaluator.ev` · range loops are clamped to the grid.
- core/ids.py, services/review.py, services/versions_docs.py · generated blocks get `t_`, `c_`, `g_` or `p_` by type, as docs/FORMAT.md names them.
- services/ai/translate.py · break and tab runs are kept and the target language is recorded.
- services/review.py :: `diff_paragraph`, routers/review.py · removed and added non-text runs carry `del` and `ins` marks, and media brought in by suggest and combine is added to the base document.

Exchange and printing:

- exchange/rtf_in.py · a negative `\bin` no longer loops; Word's repeated `\trowd` keeps the cells already read; consecutive `\'xx` bytes decode together, `\ansicpg` is validated and `\fcharset` sets a code page per font; footnote fields stay in the note and header tables stay in the header; info keys and ungrouped font tables are read correctly; an unpaired `\u` surrogate becomes U+FFFD. Removed line in `begin_row`: `self.row_cells = []`.
- exchange/common.py :: `check_zip`, `xml_safe` (new), exchange/docx_in.py, odt_in.py, exchange/__init__.py · archives over the size limits are refused, ODF repeats are capped, and characters XML forbids are stripped once before any writer.
- exchange/odt_out.py, rtf_out.py, html_out.py, docx_in.py · a list with no level 0, or a level below zero, exports; skipped HTML levels get their own `li`.
- exchange/odt_in.py :: `table` · only the table's own columns are counted, so a nested table no longer adds columns on each round trip.
- exchange/docx_in.py :: `table`, `segments.walk`, `styles` · rows and cells inside content controls and `w:dir`/`w:bdo` runs import; styles without an id are skipped; an id with characters outside `[A-Za-z0-9 _.-]` is mapped to a clean key everywhere it is referenced (a crafted id reached the window's markup).
- exchange/docx_out.py :: `emit_table` · a table inside a cell no longer gains an empty paragraph on every export.
- exchange/odt_in.py, docx_in.py :: `read` · damaged or encrypted files raise `Unsupported` with a message.
- printing/writer.py · tables split inside a row, pictures scale to the frame height, tab-stop paragraphs that do not fit wrap, and headers and footers draw through the same per-character font fallback. Removed: the cp1252 re-encode and the `drawString` calls in `on_page`.
- printing/fonts.py :: `family` · the Cyrillic, Greek and Vietnamese Fontsource subsets are registered as fallbacks, and uncovered characters are reported.

Open, recorded and not changed in 0.30.7:

- core/local_guard.py refuses every non-loopback Host, so network share links cannot work as offered; the owner decides whether to drop the option or admit the LAN address for share routes.
- services/versions.py keeps fewer versions than docs/FORMAT.md states (noted before in v0.30.2).
- setup and shell: `formtxt.bat cli run` drops `key=value`; `./formtxt desktop dev` needs placeholder sidecars on a fresh checkout; the desktop engine writes port 0 to `engine.json`; the Windows onefile engine leaves its temp folder on quit.

## v0.30.4 · the Linux packages pull in the media plugins (2026-10-31)

- refers-to: src-tauri/tauri.conf.json :: bundle.linux (deb.recommends, rpm.recommends, appimage.bundleMediaFramework); formcompiler apps/formtxt.json :: toolchain.linux_packages

Video objects in a document (`frontend/src/editor/ext/objects/media.ts`) play in WebKitGTK on Linux, which decodes with GStreamer. The config now follows formdeck: the deb recommends `gstreamer1.0-plugins-base`, `gstreamer1.0-plugins-good` and `gstreamer1.0-libav`, the rpm recommends `gstreamer1-plugins-base` and `gstreamer1-plugins-good`, and the AppImage bundles the media framework. formcompiler installs the base and good sets on the Linux runner so the AppImage step finds them. apt and dnf install recommends by default; `dpkg -i` and `--no-install-recommends` skip them. On Ubuntu 24.04 `libwebkit2gtk-4.1-0` already depends on base and good but only suggests `gstreamer1.0-libav` (the H.264 and AAC decoders), so the deb recommends it. The AppImage carries base and good only, since libav would copy the runner's own FFmpeg into the app. Checked: the config parses and formcompiler's `registry.py check` passes; no Linux build was run here.

## v0.30.4 · .js, .mjs and .css keep their types on Windows (2026-10-31)

- refers-to: app/main.py :: the three mimetypes.add_type calls after the last import

Python's `mimetypes` takes file types from the Windows registry (`HKEY_CLASSES_ROOT\.js`, value `Content Type`) over its own table, and some installers and editors set `.js` to `text/plain`. On those PCs the engine served the built window's scripts as `text/plain`, WebView2 refused every module script under strict MIME checking, and the desktop window stayed blank; macOS, Linux, dev mode (Vite serves the page) and Windows PCs with the default value never showed it. The three calls pin `.js` and `.mjs` to `text/javascript` and `.css` to `text/css`, which covers `StaticFiles`, `FileResponse` and any direct `guess_type`. They sit after the last import, not above the imports: a module that re-reads the registry while importing cannot undo them, and no import follows a statement (E402). They look redundant off Windows; keep them. Repro on a Windows PC: `reg add "HKCU\Software\Classes\.js" /v "Content Type" /d "text/plain" /f`, then launch the rebuilt app; restore with `/d "text/javascript"`. Checked here: with the table poisoned to `text/plain` for js, mjs and css through `mimetypes.init(files=...)`, the three calls return `text/javascript`, `text/javascript` and `text/css`; `py_compile` passes. Not yet run on a Windows PC.

## v0.30.3 · macOS engine signed for notarization (2026-10-30)

- Family builds audit (2026-10-30, formcompiler planning sidecar v0.5.0), formtxt row: `setup/freeze_backend` passed `--osx-entitlements-file src-tauri/entitlements.plist` to PyInstaller whenever `APPLE_SIGNING_IDENTITY` was set, and that file did not exist, so a signed macOS build stopped at the freeze. `src-tauri/entitlements.plist` (new) holds only what the frozen Python runtime needs under the hardened runtime: `com.apple.security.cs.disable-library-validation` (Python's native libraries are not all signed with the app's team) and `com.apple.security.cs.allow-unsigned-executable-memory` (onnxruntime and ctypes write executable pages). The plist stays comment-free; this entry is its comment. `tauri.conf.json` `bundle.macOS` sets `hardenedRuntime` and `entitlements` so the app's own binary is signed with the same file.
- Tauri signs `externalBin` sidecars but not `resources`, and on macOS the engine is the PyInstaller onedir shipped as resource `engine` (`tauri.macos.conf.json`). So after the copy to `src-tauri/engine` and before `--selfcheck`, when `APPLE_SIGNING_IDENTITY` is set, the freeze re-signs every Mach-O file in the folder (found with `file`, symlinks skipped by `-type f`) with `codesign --force --options runtime --timestamp --entitlements src-tauri/entitlements.plist`, then any `.framework` or `.app` folder deepest first, then `formtxt-engine` itself last, and checks it with `codesign --verify --strict`. PyInstaller's own signing is kept but not relied on: files it collects as data (onnxruntime, pdfium dylibs) may miss it, and notarization rejects any unsigned or untimestamped Mach-O. With no identity nothing changes: PyInstaller's ad hoc signature stays.
- Runtime lookup unchanged: `src-tauri/src/packaged.rs` `engine_folder()` tries `<exe dir>/../Resources/engine/formtxt-engine` (Contents/MacOS to Contents/Resources) before `<exe dir>/engine`, and `main.rs` falls back to the sidecar only when neither exists.

## v0.30.2 · Family test suite and .ftxt import (2026-10-26)

- Ledger FB-160. `docs/FORMAT.md` (Exchange) says `POST /api/exchange/import` and `POST /api/documents/import` accept `.ftxt`, and the window's file chooser lists `.ftxt` (`transfer.ts` ACCEPT), but neither route did: `exchange.READABLE` had no `.ftxt`, so a package from Download or "Send a copy" answered 415 "this file type is not one of them" and could not be opened again. `exchange.read` now maps `.ftxt` to `package.unpack` and returns the document as stored (its own title and media), turning a bad package into `Unsupported` so both routes answer 415 and add nothing. The contract wins, so the code was fixed.
- Noticed, not changed (owner): `docs/FORMAT.md` says a snapshot is taken at most every five minutes, autos are kept one per hour for a day then one per day, at most 100, and named versions up to 200; `versions.py` uses a 10 minute default (2 to 240, a setting), keeps all autos for 24 hours, hourly for 7 days, daily for 30, with 600 autos and 500 named. The tests do not pin these numbers.
- `backend/tests` (new): the family layers F1 guard, F4 version sites, F5 boot, F9 release profiles, and per-app files for the `.ftxt` contract (F6), versions and password envelope, library, exchange (docx read with python-docx) and the command catalogue. Everything runs against a temporary data folder and HOME set in `conftest.py` before the app is imported. F1 differs from the template in one place: `/api/live` accepts a window and keeps the socket open, so the test treats a successful connect as "not refused" and a close with 4403 as refused. `requirements-test.txt` is development only. Not tested on purpose: proofing, AutoCorrect, AI, stock pictures, share links, WebDAV copies (plan section 0 and P2); the window side of the command registry is TypeScript with no unit tests, so only the engine's mirror and bridge are covered.

## v0.30.1 · Own dev ports 5210, 5310 and 8210 (2026-10-25)

- The family agent-stack standard, section 9 (`AGENT_STACK_STANDARD.md` v0.2.0, owner decision D3, ledger FB-018, formai_dev sidecar). FormTxt's dev defaults 5199, 5299 and 8199 collided with formcel's. They are now window 5210, preview 5310 and engine 8210. `core/local_guard.py` needed no change: `window_origins()` reads `FRONTEND_PORT` and `PREVIEW_PORT` from `app/core/config.py`, so the guard admits the new dev and preview origins and refuses the old 5199.
- Moved: `app/core/config.py`, `frontend/vite.config.ts` (the `FORMTXT_UI_PORT` and `FORMTXT_ENGINE_PORT` overrides keep working), `boot_backend(.bat)`, `formtxt_engine.py` (the fallback when neither port variable nor an argument is given; the packaged shell still passes its own free port), `setup/boot_all(.bat)`, `setup/catalogue.py`, the `formtxt` usage text, `src-tauri/tauri.conf.json` `devUrl`, the share panel's initial state in `frontend/src/editor/ext/collab/share.ts` (replaced by the engine's answer once it loads), the CI probe, README, CLAUDE.md, AGENTS.md and the listings in both HASHOUT logs. Earlier entries keep the old numbers on purpose: they record what was true then.
- Checked: `./formtxt` with no environment variables binds 5210 and 8210 only. `/api/health` with `Origin: http://localhost:5210`, `http://localhost:5310` and `http://127.0.0.1:5210` 200, no Origin 200, `Sec-Fetch-Site: same-site` 200, through the Vite proxy 200; `Origin: http://localhost:5199`, `http://evil.example`, `http://localhost.evil.com`, `null`, `Host: evil.example` and no Origin with `Sec-Fetch-Site: cross-site` 403. FormTxt has no MCP server or skills yet (AGENTS.md says Phase 9), so there is no stdio check. The dev window on `http://localhost:5210/` and the built window (engine on 9147 with `FORMTXT_DIST`) under 4x CPU and slow network, two shift runs and one throttle run each: layout shift 0, no errors, no failed requests, and the engine log has 6 refusals from the dev run (all probes) and none from the built window.

## v0.30.0 · Version renumbered (2026-10-25)

- The owner's versioning rule: a patch number never reaches two digits, so the release after 0.29.9 is 0.30.0. The G4 release below went out as 0.29.10; this release carries the same code under the right number. Nothing in the engine changed. 0.29.10 stays in history (no rewrite) and is superseded.

## v0.29.10 · LocalGuard refuses cross-site requests that carry no Origin (2026-10-25)

- The family agent-stack standard, rule G4 (`AGENT_STACK_STANDARD.md` v0.2.0, owner decision D4, ledger FB-035, formai_dev sidecar; the design of formpdf 0.56.4). The entry below let a request with no Origin through once its Host was local, so a web page could still make the engine answer a GET by pointing an `<img>` or a link at `http://127.0.0.1:<port>/...`: browsers send no Origin on those, and any GET route with a side effect would run.
- Browsers label every request with `Sec-Fetch-Site`, and only a page on another site gets `cross-site`. So `LocalGuard._permitted` now refuses a request with no Origin when that header says `cross-site` (trimmed, case-insensitive). A request that carries an Origin is still decided by the Origin rule alone, and `same-site` is kept on purpose: a dev window on `localhost:5199` loading straight from `localhost:8199` is same-site, and no outside page can be same-site with localhost. The CLI and agents send neither header and pass as before.
- Checked against the running engine: no Origin with `cross-site` 403; `same-site`, `same-origin`, `none`, no header at all, and `cross-site` with the allowed dev Origin 200; foreign Host and an `evil.example` Origin still 403. In Chromium, a page served from `http://127.0.0.2:9901` with an `<img>` and a clicked link pointing at `/api/health` got 403 for both, shown in the engine log. The built window served by the engine (`FORMTXT_DIST`) in Chromium at 4x CPU, 150 ms latency and about 1.6 Mbps, two shift runs and one throttle run: layout shift 0, no errors, 0 refusals from the window in 155 requests. formtxt has no MCP route in this tree, so there is no MCP check.

## v0.29.9 · LocalGuard: only this computer's own window and agents reach the engine (2026-10-25)

- Family stabilization plan Phase 3a (`FAMILY_DEV_PLAN.md` v0.4.2, formai_dev sidecar; ledger FB-032). The engine checked neither Host nor Origin, only CORS. `curl -H 'Host: evil.example:8199' http://127.0.0.1:8199/api/health` answered 200, so a DNS-rebinding page (a hostile name that resolves to 127.0.0.1) reached every route as if it were the window: document save, trash and download, the file-writing exchange and printing routes, the AI and settings routes, `/api/commands` and `/api/commands/batch` (run any window command), and the `/api/live` bridge. CORS decides whether a page may read a response, not whether the request runs.
- `core/local_guard.py` (new) is a pure ASGI middleware added in `main.py` after the CORS middleware, so it runs first on every http and websocket request. It refuses a Host that is not 127.0.0.1, localhost or ::1. When an Origin header is present it must be one of `config.cors_origins()` (dev window on 5199, `localhost:5299` preview, `tauri://localhost`, `http://tauri.localhost`, or `FORMTXT_CORS_ORIGINS`) or exactly the engine's own origin, compared on parsed scheme, host and port, never by prefix, so `http://localhost.evil.com` and `null` fail. The desktop window loads from the engine's own `http://127.0.0.1:<port>`, so "own origin" is the request's Host and needs no list entry. Requests with no Origin (the CLI, agents) pass once the Host is local. HTTP refusals answer 403 with a JSON detail naming formtxt; websocket refusals close with 4403 before accept.
- Left for the family standard: a per-launch token on routes that write files or run commands, and a review of GET routes with side effects, which a cross-site page can still trigger without an Origin. formtxt has no MCP entry in this tree (the vite proxy lists `/mcp`, the engine has no such route), so there is no MCP initialize to check.
- Checked against the running engine (built window served through `FORMTXT_DIST`): 403 for `Host: evil.example:8199`, `Origin: http://evil.example`, `Origin: http://localhost.evil.com` and `Origin: null` on `/api/health`; 200 for no Origin, `Origin: http://127.0.0.1:8199`, `Origin: http://localhost:5199` and `Origin: tauri://localhost`. `/api/live`: foreign Origin and rebound Host refused with 403, own origin, dev origin and no Origin open. Built window in Chromium under 4x CPU and network throttling: two shift runs with 0 shifts and no bad nodes, throttle check cls 0 and no errors, and the engine log held 6 lines of 403, all from the probes above (none from the window).

## v0.29.5 · bundle audit fixes (2026-10-23)

- `services/printing/full_fonts.py`: Lora, Merriweather and Playfair Display carry a Reserved Font Name, so their Fontsource subsets are gone. `faces(slug)` finds the full variable TTF (the `DIST` window, the frozen `frontend_dist`, else `frontend/public/fonts/full`) and returns static instances at 400 and 700, normal and italic, every other axis at its default, made with fontTools' instancer (`updateFontNames=True`, falling back without it) and cached. `fonts.family` registers these before trying the Fontsource WOFF files; the full fonts cover latin-ext, so no extension chain is needed. Checked: a PDF with the three families embeds `ft-lora-*`, `ft-merriweather-*` and `ft-playfair-display-*`, with `ő` drawn.
- `setup/freeze_backend` and `.bat`: `--collect-submodules reportlab` replaces `--collect-all reportlab`, so the bundle no longer carries reportlab's `fonts/` folder (the GPL DarkGarden font, its GPL text, and Type 1 files). Checked by rendering the same PDF with that folder moved away: nothing in FormTxt reads it; the standard fonts' metrics are Python modules.
- macOS: the opencv-python binary wheel carries GPL FFmpeg parts (libx264, libx265, rubberband, vidstab, postproc). The macOS freeze now fails if any of them reach `dist-engine`, and names the source install that leaves FFmpeg out. `requirements_macos.txt` and `requirements_desktop_macos.txt` are pinned to the Linux and Windows versions.

## Org-navi-map

```
backend/
├── formtxt_engine.py        frozen-engine entry for the Tauri sidecar (Phase 11)
├── requirements.txt         pinned, Linux and Windows
├── requirements_macos.txt   pinned to the same versions, macOS wheels (opencv from source, see 0.29.5)
├── oc_install(.bat)         venv plus requirements
├── boot_backend(.bat)       uvicorn on 127.0.0.1:8210
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
- [app/services/printing/writer.py](#printing-writer)

---

## app/services/printing/writer.py {#printing-writer}

- refers-to: app/services/printing/writer.py :: the warning for diagrams drawn only from the open window
- kind: rationale
- logged: v0.29.3 · 2026-10-23

The warning says "IntelligentArt diagrams" instead of "SmartArt-style diagrams", per the owner's approved rename table (2026-10-23). The behaviour is unchanged.

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

### package · pruning unused media
- refers-to: app/services/package.py :: referenced(), prune(); app/services/store.py :: adopt(); app/routers/documents.py :: download()
- kind: rationale
- logged: v0.12.0 · 2026-10-21
- The working package keeps every picture ever added, so Undo after a save can still show a deleted picture. Copies (duplicate, new from template, import) and downloads are pruned to the media an `image` run anywhere in the tabs still names, including inside table cells, and `doc.media` metadata is pruned to match.

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

## app/services/formula.py {#formula}

### formula · port of Form.md's parser
- refers-to: app/services/formula.py :: Lexer, Parser
- kind: rationale
- logged: v0.16.0 · 2026-10-21
- The lexer and Pratt parser follow Form.md's `internal/collection/formula/parse.go` token for token, so the two products read the same expressions; additions are cell refs (`A1`), ranges (`A1:B3`), the four directions, `<>`, `&` for joining text and `;` as an argument separator, because Word table formulas use them. `%` stays the remainder operator as in Form.md, not a postfix percent.

### formula · directions
- refers-to: app/services/formula.py :: Table.direction()
- kind: explainer
- logged: v0.16.0 · 2026-10-21
- `ABOVE` and the other directions collect the contiguous numbers next to the formula's cell, skipping a leading blank cell and stopping at the first text cell, which matches what Word sums for a totals row under a header.

### formula · number pictures
- refers-to: app/services/formula.py :: format_value()
- kind: explainer
- logged: v0.16.0 · 2026-10-21
- Pictures read digits (`0` forced, `#` optional), `,` grouping, `.` decimals, a trailing `%` (value times 100) and any literal prefix or suffix. Rounding is half-up, as Word shows it, not Python's banker's rounding.

### formula · eval route
- refers-to: app/routers/formula.py :: eval_formulas()
- kind: rationale
- logged: v0.16.0 · 2026-10-21
- The editor sends every formula in the document in one batch with its table grid, so one round trip recalculates the lot; capped at 2,000 items and 2,000 grid rows. The engine stays the single calculator so the CLI, the window and later exporters agree.

## app/routers/blocks.py {#blocks}

### blocks · library storage
- refers-to: app/routers/blocks.py :: save_block(), _strip_media()
- kind: rationale
- logged: v0.19.0 · 2026-10-21
- Saved building blocks are library-wide, so they live in `blocks.json` beside `settings.json` rather than in any document, written through a temp file and rename like settings. Up to 200 blocks of 2 MB each; saving a name that already exists (ignoring case) replaces that block. Image runs are dropped on save because their media files live inside one document's package.

## app/services/stock.py, app/routers/stock.py {#stock}

### stock · fetching safely
- refers-to: app/services/stock.py :: _public(), _CheckedRedirect, _get()
- kind: rationale
- logged: v0.21.0 · 2026-10-21
- The engine is the only part that goes online, and only for stock pictures. Every address, including each redirect, must resolve to public IPs only (no loopback, private, link-local, reserved or multicast), responses are capped (4 MB JSON, 3 MB thumbnails, 25 MB pictures) and sniffed as PNG, JPEG, GIF, WebP or BMP (SVG refused), and a redirect to another host drops the Authorization header so the Pexels key never leaves api.pexels.com. Downloads accept only ids from recent search results (kept in memory, 2,000 entries), so the window cannot make the engine fetch an arbitrary address. Uses the standard library's urllib, no new dependency.

### stock · keys and switch
- refers-to: app/routers/system.py :: get_settings(), set_settings()
- kind: rationale
- logged: v0.21.0 · 2026-10-21
- The Pexels key lives in settings.json on this computer and is never sent back to the window: GET and POST /api/settings return `pexelsKeySet` instead. `stockImages: false` turns every stock route off with a 403.

### stock · not verified live here
- refers-to: app/services/stock.py :: search()
- kind: gotcha
- logged: v0.21.0 · 2026-10-21
- From the build sandbox Openverse answered once, then rate-limited (429) and timed out, and Cloudflare refuses Python's default user agent outright (error 1010), which is why requests carry a FormTxt user agent. The window-to-engine-to-service path was checked against a stand-in that returns the services' documented response shapes; a live check against both services is still owed.

## app/routers/{refs,review,versions,exchange,printing,proofing,ai,objects,collab}.py {#areas}

### areas · one router per area
- refers-to: app/main.py :: include_router
- kind: rationale
- logged: v0.27.0 · 2026-10-21
- Each frontend area has its own router under `/api` and its services in `app/services/<area>`, so area work never collided in main.py.

### areas · secrets
- refers-to: app/services/ai, app/services/versions.py :: set_cloud_folder()
- kind: rationale
- logged: v0.27.0 · 2026-10-21
- AI provider keys live in `data/ai.json` and WebDAV credentials in `data/cloud.json`, both mode 600, and no endpoint returns them; `/api/settings` reports only whether they are set.

### printing · drawings from the window
- refers-to: app/services/printing/writer.py :: Ctx.drawing(), shape_key(), figure_image(); app/routers/printing.py :: export_current()
- kind: rationale
- logged: v0.27.0 · 2026-10-21
- `POST /api/print/export.pdf` accepts `_drawings: {blocks, shapes}` of PNG data URLs. Diagram and Mermaid blocks, and chart kinds the writer cannot draw natively, become figure images; shape runs use the shape drawing. A paragraph holding only shapes (or pictures) becomes Image flowables, because an inline `<img valign>` draws upward from the baseline and overlapped the line above.

### printing · OCR
- refers-to: app/services/printing/pdfimport.py :: ocr_paragraphs(), ocr_available()
- kind: rationale
- logged: v0.27.0 · 2026-10-21
- Pages without a text layer are rendered with pypdfium2 and read with RapidOCR (ONNX, no system Tesseract), so opening a scanned PDF needs nothing beyond requirements.txt.

### versions · WebDAV and attribution
- refers-to: app/services/versions.py :: dav_list(), dav_fetch(), copy_out(), editors(), set_editor_hint()
- kind: rationale
- logged: v0.27.0 · 2026-10-21
- Cloud copies are PUT in a background thread so a slow server never blocks a save. The documents PUT takes `?by=` and `set_editor_hint` records it so version history names the person or agent behind each save; `editors()` answers who edited a range.

### review · table compare
- refers-to: app/services/review.py :: same_shape(), diff_table()
- kind: rationale
- logged: v0.27.0 · 2026-10-21
- Tables with the same rows and columns compare cell by cell; otherwise the whole table is one change, as Word does.

### proofing · thesaurus
- refers-to: app/services/proofing/wordnet.py; GET /api/proofing/thesaurus
- kind: rationale
- logged: v0.27.0 · 2026-10-21
- WordNet ships through the wordnet-db npm package data, read offline, so the thesaurus and dictionary work without a network.

## app/services/secrets.py {#secrets}

### secrets · system password store
- refers-to: app/services/secrets.py :: get, put, delete, where
- kind: rationale
- logged: v0.28.0 · 2026-10-21
- Ported from formvis with SERVICE formtxt. Keys and passwords go to the OS keyring when a working backend exists, else to <data>/secrets/<name>.key with mode 600. Legacy plaintext copies in settings.json, cloud.json and ai.json are migrated on first read and blanked. Endpoints return only whether a key is set and its last four characters.

## formtxt_engine.py {#engine-entry}

### engine · port 0
- refers-to: formtxt_engine.py :: main
- kind: rationale
- logged: v0.28.0 · 2026-10-21
- The desktop shell starts the engine with port 0 and reads the real port from the uvicorn line, so the log level stays info. --selfcheck imports the whole app for the freeze script.
