# FormTxt

Documents in the form family: an open, local-first Word and Google Docs alternative. Vanilla TypeScript and Vite frontend (`frontend/`, port 5199), Python FastAPI engine (`backend/`, port 8199), Tauri 2 shell (`src-tauri/`).

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

## Commands

`./formtxt_oc_install`, then `./formtxt` boots both sides. With the window open, `./formtxt cli list` reads the command catalogue and `./formtxt cli run <id> key=value` runs a command in the window through the `/api/live` bridge (`POST /api/commands/<id>` and `/api/commands/batch` do the same over HTTP).
