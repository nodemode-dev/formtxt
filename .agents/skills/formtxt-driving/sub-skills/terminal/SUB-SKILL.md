---
name: terminal
description: Terminals, shells and Claude Code in relation to FormTxt when an agent is driving it. Use when the person asks for a terminal inside FormTxt, to run a shell command from FormTxt, to have FormTxt start Claude Code, or how to start, stop or reconnect FormTxt so the MCP tools work. FormTxt has a terminal dock (Mod+J) for the person but no MCP terminal tool; this says what to ask the person to run and how to reconnect.
---

# terminal

The FormTxt window has a terminal dock (View > Terminal, Mod+J) with shell tabs, Claude Code tabs and a Chat tab. They belong to the person. The MCP catalogue has no terminal or shell tool, and `run_command` refuses `view.terminal`, `view.newTerminal`, `agent.claudeCode` and `agent.chat`. Do not claim to run shell commands "inside FormTxt"; drive the document with `list_commands`, `describe_command` and `run_command`.

## What the person may need to run

These run in the formtxt folder. Run them yourself only when you have a shell tool and the person asked.

| Goal | Command |
| --- | --- |
| Start FormTxt (engine and window) for development | `./formtxt` |
| Install or update the engine and window dependencies | `./formtxt install` |
| Connect Claude Code, Codex and Cursor to FormTxt for this user | `./formtxt agents install` (add `--dry-run` first to see the changes) |
| Run the MCP server as a client would (stdio) | `./formtxt mcp` (starts the engine if none is running) |
| Run one command from a shell | `./formtxt cli run <id> key=value` (the window must be open) |
| Windows | the same as `formtxt.bat mcp`, `formtxt.bat agents install` |

Inside the formtxt repository `.mcp.json`, `.cursor/mcp.json` and `.codex/config.toml` already run `./formtxt mcp`, so the tools connect without setup.

## Reconnect checklist

1. Call `list_commands`. A non-empty list means the engine and a window are there.
2. Empty list or "No FormTxt window is open": ask the person to open FormTxt.
3. "The engine is not running and could not be started": ask them to run `./formtxt`; the bridge's log is `formtxt-engine.log` in the temporary folder.
4. No formtxt tools at all: the server is not registered in this client. Ask the person to run `./formtxt agents install`, then restart the client.
5. "did not allow outside agents": the person declined in the window; they can turn on Allow outside agents in Preferences.

## Claude Code inside FormTxt

A Claude Code tab in the dock runs the person's own `claude` program with FormTxt's MCP server already attached and its tools allowed, so it edits the open document without the outside-agent question. A missing program shows the install line in the dock. The Chat tab runs the same program in a panel and can hand its conversation to a Claude Code tab (Continue in Claude Code). FormTxt stores no credential; sign-in is Claude Code's own.
