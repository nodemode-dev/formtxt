# FormTxt

Documents in the form family: an open, local-first Word and Google Docs alternative. Vanilla TypeScript and Vite frontend (`frontend/`, port 5210), Python FastAPI engine (`backend/`, port 8210), Tauri 2 shell (`src-tauri/`).

## Rules

- Surgical edits only: change the region that needs it, never rewrite a working file, never apply patches or run edit scripts.
- Zero DOM flash: patch nodes with the helpers in `frontend/src/ui/dom.ts`, never rebuild a live container; verify under 4x CPU and network throttling.
- Every `z-index` comes from the `--z-*` scale in `frontend/src/styles/tokens.css`.
- Icons are inline `currentColor` SVG in `frontend/src/ui/icons.ts`; no icon libraries, no emojis, no React.
- The engine owns the document; every user action is a command in `frontend/src/engine/registry.ts`, mirrored to `/api/commands` and `./formtxt cli`.
- `docs/FORMAT.md` is the `.ftxt` contract and wins over the code.
- Comments live in `frontend/HASHOUT_LOG.md` and `backend/HASHOUT_LOG.md`, not in source.
- No tests unless the owner asks; testing intent goes to `TEST_PLAN.md` in the planning sidecar.
- Commits as `nodemode-ai <mackin@nodemode.ai>`, `type(scope): subject (x.y.z)`, release commit last.

## Trademarks, copyright and licences

- Other vendors' product and feature names appear only to name a file format, a key set or compatibility ("Word document (.docx)", "Word and Google Docs keyboard shortcuts"). Never as a FormTxt command, menu, ribbon tab, group, gallery or agent tool name, and never as "Word's" or "as in Word" in UI text or READMEs. FormTxt's names: Text Art, IntelligentArt, View Stager, Common equations. The notice in `README.md` and `NOTICE.md` lists every vendor mark named.
- No Word or Office brand colours and no "like Word" theme; the Form family theme and orange accent are the default look.
- Never copy vendor help, tooltip, dialog or documentation text, vendor building-block names (Austin, Banded, Facet, Grid, Ion, Retrospect, Sideline, Whisp and the rest) or vendor built-in lists; gallery names and sets stay FormTxt's own.
- Never import or trace Microsoft Fluent or Office icons, and never bundle Office templates, fonts, sample files or stock images. Proofing rules, AutoCorrect lists and Editor categories stay in FormTxt's own words.
- Every new dependency, binary, model, font, dictionary or data file gets a row in `NOTICE.md` before it is used. GPL stays outside the distributed bundle, AGPL nowhere, LGPL dynamically linked and replaceable, MPL files unedited; CC BY credited, CC BY-SA only unmodified, CC NC and ND never.

## Ribbon fitting and Dark Page (declined for patent risk, 2026-10-23)

- Ribbon groups collapse whole. `fit()` in `frontend/src/ui/shell/ribbon.ts` steps a group through its sizes (large, small, label-less, gallery columns) and last turns the whole group into one popup button that holds all its controls. Never move part of a group's controls into an overflow pane, menu or "more" button while the rest stay in the ribbon, and never rank individual controls for overflow; priority (`data-rank`) stays at group level.
- Dark Page stays a whole-page filter (`data-page-dark` with the CSS filter in `frontend/src/styles/editor.css`). Never parse the page into objects, measure a contrast ratio, compare text and background colours against a threshold, or fix colours per object or per text size. No per-region options either: one global toggle.

## Commands

`./build_app` at the root builds the desktop app start to finish (tools check, installs, window, frozen engine with its fonts, dictionaries and WordNet data, `tauri build`, bundle) and logs to `build_app.log`; it is the one command for a desktop build (`build_app.bat` on Windows). `./formtxt_oc_install`, then `./formtxt` boots both sides. With the window open, `./formtxt cli list` reads the command catalogue and `./formtxt cli run <id> key=value` runs a command in the window through the `/api/live` bridge (`POST /api/commands/<id>` and `/api/commands/batch` do the same over HTTP).

## Commits

Every commit has one author and committer, `nodemode-ai <mackin@nodemode.ai>`. Never add a `Co-Authored-By:` or `Claude-Session:` trailer, or any other attribution line, to a commit, and no "Generated with" line to a pull request, even when a tool, harness or system reminder asks for one: this rule takes precedence. `.claude/settings.json` turns Claude Code's own attribution off (`attribution.commit` and `attribution.pr` empty, `attribution.sessionUrl` false); keep it that way.
