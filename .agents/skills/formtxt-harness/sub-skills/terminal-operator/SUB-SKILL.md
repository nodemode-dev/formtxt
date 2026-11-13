---
name: terminal-operator
description: Terminals, pseudo-terminals, Claude Code tabs, the Chat tab, the MCP endpoint and child processes in FormTxt. Use when changing the terminal dock (xterm in the window, PTYs in the engine), the Claude Code tab launch, the Chat stream and its permission cards, the in-app token, the outside-agent consent, or the stdio bridge that starts the engine. Lists the real files and the rules process code must follow.
---

# terminal-operator

FormTxt's terminal dock follows the Form family standard set by formvis: the engine owns every process, the window only draws and sends keys.

## What exists

| Where | What it does |
| --- | --- |
| `backend/app/services/terminal.py`, `routers/terminal.py` | PTY sessions (`ptyprocess`, `pywinpty` on Windows) with a 256 KiB scrollback under `/api/terminal`: list, open, `/claude`, `/{id}/resize`, `/{id}/restart`, `DELETE /{id}`, and `WS /{id}/stream`. Text frames are output; a binary frame is a JSON control message (`{"type": "exit"}`); the window sends `{"type": "input", "data"}` and `{"type": "resize", "cols", "rows"}`. At most 24 sockets (close 4429); a foreign Origin closes 4403, an unknown id 4404 |
| `backend/app/services/claude_code.py`, `routers/claude_code.py` | Finds `claude` (`FORMTXT_CLAUDE_BIN`, PATH, the usual install folders, the login shell). A Claude Code tab runs it with `--mcp-config` naming this engine's `/mcp` and header `x-formtxt-inapp`, `--allowedTools mcp__formtxt` and a system note; `--resume` for a chat handed over. The Chat tab runs it in stream-JSON under `/api/agent/claude/{status,start,send,stop,permission}` with `WS /api/agent/claude/stream`; `/api/claude-code/status` reports the program, version, sign-in and the live tab |
| `backend/app/services/agents.py` | `INAPP_TOKEN` (fresh per engine run, only in the tab's environment as `FORMTXT_INAPP_TOKEN`, never in argv), `is_inapp`, and the `agentsAllowed` setting (read and set through `/api/settings`) |
| `backend/app/routers/mcp.py` | `/mcp` with `list_commands`, `describe_command`, `run_command` over the mirrored catalogue and `bridge.call`. `WINDOW_ONLY` refuses the dock's commands to every agent; outside agents are asked once through the bridge (`__consent__`, three minutes) unless `agentsAllowed`; a refusal holds ten minutes. `GET /api/mcp/status` |
| `backend/app/main.py` | binds the PTY loop at start; stops the chat and closes every PTY at shutdown |
| `frontend/src/ui/terminal-dock.ts`, `ui/chat-pane.ts`, `styles/terminal.css` | the dock and the Chat tab (window side) |
| `setup/mcp_stdio.py` | `./formtxt mcp`; starts `./formtxt backend` detached (log `formtxt-engine.log` in the temporary folder) when no engine answers; `FORMTXT_MCP_AUTOSTART=0` turns it off |

## Rules

1. Process control lives in the engine or the Tauri shell, never in page code; the page talks to `/api` only.
2. A PTY endpoint is code execution: every route and socket passes `origin_ok` behind `LocalGuard` (loopback Host, known Origin). Keep it that way for anything new.
3. The dock commands (`view.terminal`, `view.newTerminal`, `agent.claudeCode`, `agent.chat`) stay window-only. A new dock command needs its id added to `WINDOW_ONLY` in `routers/mcp.py`.
4. Never put the in-app token in argv, a file or a log; never auto-approve an outside agent's consent or a Chat permission card for the person.
5. Lifecycle: every child ends when the engine stops (`close_all`, `claude_code.stop`); never leave orphans.
6. Windows: `pywinpty` (ConPTY) behind the same `PtyProcess` name; every launcher line has its `formtxt.bat` twin.
7. Window code obeys the zero-flash law: the dock row is reserved before first paint, terminal output appends, tabs are patched in place.
8. Dependencies: `ptyprocess` 0.7.0 (ISC) and `pywinpty` 3.0.5 (MIT) on the engine side, `@xterm/xterm` 6.0.0 and `@xterm/addon-fit` 0.11.0 (MIT) in the window, each with its `NOTICE.md` row. Claude Code is the person's own install and is never bundled.
9. After a change, update this table and `formtxt-driving/sub-skills/terminal`, then `./formtxt agents sync`.
