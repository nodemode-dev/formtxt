---
name: formtxt-driving
description: Edit documents in FormTxt, the local-first document editor, through its MCP tools. Use whenever the person wants to write, format, restyle, insert into, review, print or export the document open in FormTxt, list or open their FormTxt documents, or run any FormTxt command, and formtxt tools are available or FormTxt is mentioned. Explains how the server starts, the list, describe and run loop over the editor's command catalogue, consent, and what to do when a call fails. Not for changing FormTxt's own source code (use formtxt-harness).
---

# formtxt-driving

FormTxt runs on this computer as an engine (127.0.0.1:8210) with a window. The engine owns the documents; every action the person can take in the window is a command in one catalogue, and the same catalogue feeds the command palette, `./formtxt cli` and the MCP server named `formtxt`. `./formtxt mcp` is a stdio bridge to the engine's `/mcp`, and it starts the engine when none is running. `./formtxt mcp --where` prints the address and a client config.

## Tools

| Tool | What it does |
| --- | --- |
| `list_commands` | The catalogue: `id`, `label`, `group`, `description`, `keys`, `params`. Filter with `text` (every word must appear) or `group` |
| `describe_command` | One command with its parameters |
| `run_command` | Runs `id` with `params` in the open window, on the open document. The person sees it happen and Undo reverses it |

Commands with `"windowOnly": true` (the terminal, Claude Code and chat commands such as `view.terminal` and `agent.chat`) are the person's own: `run_command` refuses them. Do not retry them.

## The loop

1. `list_commands` with a word or two (`text: "heading"`, `text: "table"`, `group: "File"`). Do not guess ids.
2. `describe_command` on the id you picked; pass only the parameters it lists, with the types it gives.
3. `run_command`. Read the result; when it carries data (a document list, a template list, the word at the caret), use it for the next step.
4. One command is one Undo step. For a long change, run small steps and check the result of each.
5. A result with `isError` holds a plain sentence. Say it to the person and change course; do not repeat the same call.

Useful starting points: `file.list` (documents and their ids), `file.open` with `id`, `file.new` with `title`, `templates.list` then `file.newFromTemplate`, `print.exportPdf`, `exchange.download` (a .docx or other copy), `tools.thesaurus` with `word`.

## Consent

Outside agents are off until the person allows them. The first `run_command` asks the person once, in the FormTxt window; until they answer it waits up to three minutes. A refusal holds for ten minutes; the person can turn on Allow outside agents in Preferences at any time. `list_commands` and `describe_command` never ask. `GET http://127.0.0.1:8210/api/mcp/status` reports `live` (a window is connected) and `allowed`.

The Claude Code the person starts in FormTxt's own terminal dock is the window's own and is not asked.

## When a call fails

| Message | Do this |
| --- | --- |
| The catalogue is empty | The window has not opened yet. Ask the person to open FormTxt (`./formtxt`, or the desktop app), wait a few seconds, list again |
| No FormTxt window is open | Same: the engine runs but no window is connected |
| The engine is not running and could not be started | Ask the person to run `./formtxt` in the formtxt folder |
| did not allow outside agents | Ask them to allow it in the window or in Preferences, then retry once |
| No command has the id | Search again with `list_commands` |
| did not answer the command within 60 seconds | The window is busy (a large import, a print); wait, then retry once |

## Sub-skills

- `sub-skills/terminal/SUB-SKILL.md`: the terminal dock, Claude Code tabs and the shell commands the person may need.
