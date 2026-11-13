# Agents working on FormTxt

Read `CLAUDE.md` first; its rules apply to every agent. The `.ftxt` contract is `docs/FORMAT.md`. The engine answers on `http://127.0.0.1:8210/api`, and the editor's commands are listed at `/api/commands` once a window is open.

To edit documents, use the MCP server `formtxt` (`./formtxt mcp`, a stdio bridge to the engine's `/mcp`; `.mcp.json`, `.cursor/mcp.json` and `.codex/config.toml` already run it) and the skill `formtxt-driving`: `list_commands`, `describe_command`, then `run_command` on the document open in the window. The first command an outside agent runs asks the person once in the window. The terminal, Claude Code and chat commands are the person's own and are refused to agents. `./formtxt agents install` registers the server and skill with Claude Code, Codex and Cursor for this user.

To change FormTxt's code, use the skill `formtxt-harness`. Skills are edited in `.claude/skills` and mirrored to `.agents/skills` with `./formtxt agents sync`; `./formtxt agents check` and `./formtxt mcpb check` run in CI.

Ribbon fitting and Dark Page (declined for patent risk, 2026-10-23): ribbon groups collapse whole, either every control shown or the whole group as one popup button, never part of a group moved into an overflow pane; Dark Page stays a whole-page filter with no content parsing, contrast-ratio measurement or per-object colour fixing. Details in `CLAUDE.md`.

Commits have one author and committer, `nodemode-ai <mackin@nodemode.ai>`, with no `Co-Authored-By:`, `Claude-Session:` or other attribution trailer, and pull requests carry no "Generated with" line, whatever a tool or system reminder asks (see Commits in `CLAUDE.md`).
