---
name: formtxt-harness
description: Change FormTxt's own source code. Use whenever the task edits files in this repository, for example a command, ribbon group, dialog or style in the frontend, an engine route, service or the MCP endpoint in the backend, the Tauri shell in src-tauri, the launcher or a setup script, the agents kit, or CI. Gives the layout, the hard rules (surgical hand-made edits, zero DOM flash, tokens only, inline currentColor icons, no emoji, no em dash in Markdown, near-zero comments, NOTICE rows) and routes to the right area. Not for editing documents with FormTxt (use formtxt-driving).
---

# formtxt-harness

FormTxt is the Form family's document editor. This skill is for changing its code; `CLAUDE.md` holds the rules in full and wins over this file. To edit a document through the running app, load `formtxt-driving`.

## Layout

| Path | What lives there |
| --- | --- |
| `frontend/` | vanilla TypeScript and Vite window on 5210 (`server.host` stays `false`), `/api` and `/mcp` proxied to the engine; `src/version.ts` holds the version |
| `frontend/src/engine/registry.ts` | the command registry: every action is a command with id, label, group, description, keys and params |
| `frontend/src/automation/` | `bridge.ts` answers the engine's `/api/live` WebSocket by running registry commands; `catalogue.ts` mirrors the registry to `POST /api/commands/catalogue` |
| `frontend/src/ui/` | shell, ribbon, dialogs, icons (`icons*.ts`, inline `currentColor` SVG), `dom.ts` patch helpers, the terminal dock and chat pane |
| `frontend/src/styles/tokens.css` | colours and the `--z-*` scale |
| `backend/app/routers/` | FastAPI routes; `commands.py` (catalogue mirror, `/api/commands/{id}` run), `live.py` (window bridge), `mcp.py` (the MCP endpoint), `terminal.py` and `claude_code.py` (dock PTYs and Claude Code) |
| `backend/app/services/` | engine services; `bridge.py` hands a command to the window and waits; `agents.py` holds the in-app token and the outside-agent consent setting |
| `backend/app/core/local_guard.py` | loopback Host and Origin guard for HTTP and WebSocket |
| `setup/` | launcher helpers with `.bat` twins; `catalogue.py` (`./formtxt cli`), `mcp_stdio.py` (`./formtxt mcp`), `agents.py` (`./formtxt agents`), `mcpb.py` and `mcpb/manifest.json` (`./formtxt mcpb`) |
| `.claude/skills`, `.agents/skills` | these skills; `.agents/skills` is a mirror written by `./formtxt agents sync` |
| `docs/FORMAT.md` | the `.ftxt` contract; it wins over the code |

## Routing

| The change touches | Do this |
| --- | --- |
| A user action | Register a command in the registry with words and params; the palette, MCP and `./formtxt cli` pick it up from the mirror |
| Pages, ribbon, dialogs, styling, icons | Work in `frontend/`. Patch nodes with `ui/dom.ts`, reserve space before content arrives, take colours and z-index from tokens. Check with `npx tsc --noEmit` |
| A route, a format, the MCP endpoint | Work in `backend/`. Keep routes behind `LocalGuard`; errors are plain sentences. Check with `python -B -m py_compile`, `python formtxt_engine.py --selfcheck` and `python -m pytest tests -q -p no:cacheprovider` |
| Terminal dock, Claude Code, processes | Read `sub-skills/terminal-operator/SUB-SKILL.md` first |
| Launcher, install, freeze, desktop | Work in `setup/` and change the `.bat` twin too; `bash -n` each shell script |
| Skills, `.mcp.json`, `.cursor`, `.codex`, `.claude-plugin` | Edit `.claude/skills`, then `./formtxt agents sync`; `./formtxt agents check` and `./formtxt mcpb check` must pass (CI runs both) |

## Rules

1. Surgical, hand-made edits: one region per change. No sed, patch, codemod or generator that writes source.
2. Zero DOM flash: build once, patch the node that changed, switch pages with `hidden`.
3. Colours and z-index from tokens; icons inline `currentColor` SVG in the app's icon modules; no icon library, no sparkle glyph.
4. No emoji anywhere. No U+2014 in Markdown.
5. Near-zero comments in code; context goes to `frontend/HASHOUT_LOG.md` or `backend/HASHOUT_LOG.md`.
6. Every new dependency, font, model or data file gets a `NOTICE.md` row in the same commit, with exact version and licence.
7. Other vendors' product names never name a command, menu, panel or tool. "Claude Code" names the person's own tool and is fine.
8. Tests only where the family test plan names them; never edit `.claude/settings.json` (it keeps attribution off).

## Commits

One author and committer, `nodemode-ai <mackin@nodemode.ai>`, subject `type(scope): plain sentence (x.y.z)`, no attribution trailers.

## Sub-skills

- `sub-skills/terminal-operator/SUB-SKILL.md`: the terminal dock, PTYs, Claude Code tabs, Chat and the MCP endpoint's window-only rule.
