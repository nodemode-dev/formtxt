# HASHOUT_LOG · backend · formtxt

Living log of comment content, rationale and removed code for the engine. Source files stay comment-free; read this first, then edit surgically.

Current build version: v0.34.0
Last updated: 2026-11-19 · v0.34.0: database merge data, list reports and report run, changes only from the window, the outside-agent question with Allow once and Block all agents, Codex and Cursor tabs (sections below, headed "v0.34.0, not released yet" as they were written). Before: 2026-11-17 · v0.33.0 has no change in the engine; the AMOLED Black theme is in the frontend log. Before: 2026-11-14 · v0.32.1: the macOS freeze keeps the Python library loadable inside the app bundle (section below). Before: 2026-11-13 · v0.32.0 has no change in the engine; `setup/icon_rules.py` also checks the insertable icon and emoji data (frontend log). Before: 2026-11-13 · v0.31.0: MCP, terminals and Claude Code in the engine, the agent kit (section below). Before: 2026-11-13 · the v0.30.8 fixes to the engine entry and scripts (section below). Before: 2026-11-12 · the v0.30.7 review fixes. Before: 2026-10-31 · .js, .mjs and .css keep their types on Windows; the Linux packages pull in the media plugins. Before: macOS engine signed for notarization

---

## after v0.34.0 · the supported agent programs are named as four (2026-11-19)

- `formtxt` (the launcher's usage text, the `agents` line), `README.md` (the `./formtxt mcp` line under Built for agents), `CLAUDE.md` (the agents kit line), `.claude/skills/formtxt-driving/sub-skills/terminal/SUB-SKILL.md` and `.claude/skills/formtxt-harness/sub-skills/terminal-operator/SUB-SKILL.md` (mirrored to `.agents/skills` by `./formtxt agents sync`) · where the list was Claude Code, Codex and Cursor it is now Claude Code, Codex, Cursor and Antigravity. The harness page's line about `agent_programs.py` also says the programs are found by the family's finder and where an Antigravity tab runs.
- Left alone: the trademark sentence at the foot of `README.md` and in `NOTICE.md` (it names the owners of three marks; adding a fourth owner is the owner's call), `AGENTS.md` (it names the config files the repository ships, not the programs), CHANGELOG and log history, everything in `frontend/src/dock`.

## after v0.34.0 · the engine starts when it has no output streams (2026-11-19)

- formtxt_engine.py (top of the file, before any import of FormTxt's own) · when `sys.stdin`, `sys.stdout` or `sys.stderr` is `None`, it is replaced by the null device opened as text. A Windows engine built without a console has no streams, and the first `print` or log line then stops it at start; a tester saw that in another Form engine. The way FormWeb's entry does it.
- Seen on Linux: Python started with its three streams closed reports all three as `None`; the entry started that way on port 4742 with its own data folder answered `/api/health` with 200, and before the change the same start gave no answer and exit code 1. Started normally on port 4743 it still printed uvicorn's lines. No test added. Not run on Windows, and not as a frozen engine.

## after v0.34.0 · an Antigravity tab, and agents install adds FormTxt to Antigravity (2026-11-19)

- routers/terminal.py :: `AgentBody.kind` · takes `antigravity` beside `codex` and `cursor`.
- services/agent_programs.py :: `TABS`, `tab_folder`, `_mcp_file`, `_servers`, `_replace`, `write_tab_entry`, `remove_tab_entry`, `open_terminal` · `TABS` is `("codex", "cursor", "antigravity")`. An Antigravity tab starts `agy` the way a Codex or Cursor tab starts: found by the finder, started through `agent_lookup.start_argv`, with the tab's token in `FORMTXT_INAPP_TOKEN`. Antigravity reads its MCP servers from a file, so before the start the entry `formtxt_tab` (`serverUrl` and the header `x-formtxt-inapp` with the tab's token) is written into `.agents/mcp_config.json` of the tab's working folder: everything else in the file is kept, the file is replaced whole at mode 0600, and the entry is taken out when the tab closes if it still carries that tab's token, when the token is also revoked. A file that is not an MCP servers file is left alone and the tab is refused.
- Decision, the working folder. FormTxt's Codex and Cursor tabs run in the open document's folder; the Cursor tab's `.cursor/mcp.json` there names variables, never the token. Antigravity's file has to hold the token itself, so that tab runs in a folder of FormTxt's own, `agent-tabs/antigravity` in the data folder, and a token is never written beside the person's documents. This is FormVis's choice, not what FormTxt does for its Cursor tab.
- setup/agents.py :: `DOCK`, `ours`, `install_antigravity`, `install`, `main` · `./formtxt agents install` takes `antigravity` and includes it when no client is named. It writes FormTxt's MCP server (the launcher with the argument `mcp`) into `~/.gemini/config/mcp_config.json`: the rest of the file is kept, the file is backed up and replaced whole, a second run changes nothing. An entry of its own at another path is brought up to date; a server named `formtxt` that FormTxt did not write, and a file that is not an MCP servers file, are left alone and reported; when only `~/.gemini/antigravity-cli/mcp_config.json` is there, the documented file is written and the result says the older one was seen and left alone. No skill is copied for Antigravity. `DOCK["tabs"]` gains `antigravity`, and `./formtxt agents sync` regenerated `agents/manifest.json`.
- Seen first, on an engine from source (port 4741, its own data folder and home, a stand-in `agy` first on PATH that answers `--version` and prints a banner; a real `agy` was never started): `GET /api/agents/status?fresh=true` gave `antigravity` as `runs`, version 1.2.3, `signedIn` null; `POST /api/terminal/agent` without the window key was 403; with it the record had kind `antigravity`, title Antigravity and the folder above; the stream showed the stand-in's banner; the file held its seeded server and key beside `formtxt_tab` at mode 0600; after `DELETE` the file was exactly as seeded. `agents install antigravity` with a made-up home: dry run, first run, second run, an own entry at another path, a foreign entry, only the older file, a file that is not JSON.
- Tests, added after that: four in `tests/test_agent_programs.py`. `tests/test_agent_lookup.py` expected 422 for an Antigravity tab and `TABS` of two; it now expects the 404 with the finder's sentence and the three, which is the only reason it changed.
- Not run: a real `agy` (whether it reads `serverUrl` and `headers` from the folder's file, whether it wants the folder trusted first), a call to `/mcp` with the tab's token, Windows, macOS.

## after v0.34.0 · no test can start a real agent program (2026-11-19)

- tests/conftest.py :: `AGENT_STAND_INS`, `AGENT_CALLS`, `AGENT_SHELL`, `only_stand_in_agent_programs`, `pytest_sessionfinish`, `pytest_terminal_summary` · before any test module is imported the run gets a PATH of its own stand-ins folder and the system's four folders, a stand-in login shell as `SHELL`, and none of the six folder variables the finder reads. The stand-ins (`claude`, `codex`, `cursor-agent`, `agent`, `agy`) answer `--version`, exit 1 for anything else, and write one line per start to a file in the run's sandbox. The autouse fixture empties the finder's system install folders for every test. The run ends with one line: how many times a stand-in was started, and which. The way FormPath's conftest does it. `dock_start` still narrows this further for the tests that use it.
- Why: a test that reached the lookup with the machine's own PATH and login shell in reach could run the real Claude Code with `--version`.
- Later the same day: the narrowed PATH had also taken `node` away, so the test of the dock's `state.ts` in `tests/test_dock_manifest.py` skipped where it had run. The run now gets a `tools` folder in its sandbox, second on PATH, holding one link to the `node` that was on PATH before it was narrowed; the folder `node` came from, which on this machine also holds a real `claude`, stays off PATH.

## after v0.34.0 · the family's finder at version 1.0.1 (2026-11-19)

- services/agent_lookup.py · replaced whole by the copy from FormVis ddc893ae, VERSION 1.0.1, SHA-256 `62667f9b68b7d101e1896ce617240424e33b7e498c560bc79d45f0ab26c77d51`. Against 1.0.0 two lines differ: the version, and `_last_line`, which no longer takes env's hint line "use -[v]S to pass options" as a program's error line. Nothing in it is edited here.
- setup/agents.py :: `LOOKUP_HASHES` · holds both versions, 1.0.0 and 1.0.1, so the check accepts either file whole and names any other.
- tests/test_dock_manifest.py :: `test_the_check_names_the_shared_finder_edited_in_place_or_missing` · read the version from the file; it had 1.0.0 written in its sentence. `tests/conftest.py` `dock_start` already removes `NPM_CONFIG_PREFIX`, `npm_config_prefix`, `PNPM_HOME`, `VOLTA_HOME`, `BUN_INSTALL` and `NVM_SYMLINK` (`FOLDER_VARS`).

## after v0.34.0 · the engine finds and starts Claude Code, Codex and Cursor through the family's finder, and the status reports Antigravity (2026-11-19)

- Fault: FormTxt started from the Dock, the Finder or the Start menu gets the system's short program path, not the one a Terminal has. `claude_code.cli` asked `shutil.which("claude")`, five folders under the home folder and `command -v claude` in a login shell that was not interactive; `agent_programs.find` asked `shutil.which` and the same shell. A program installed by Homebrew, npm or a version manager was then "not installed", and a program that was found could still fail to start, because its tab and Chat ran with the engine's PATH (a `#!/usr/bin/env node` script with no `node` on it). "Found" also counted as "installed" without the program ever being run.
- services/claude_code.py :: `OVERRIDES`, `SHELL_WAIT`, `CHECK_WAIT`, `OTHERWISE`, `setting`, `located`, `usable`, `said` (new) · `located(kind, fresh)` is the one lookup everything uses: `agent_lookup.find` (override variable, engine PATH, the known install folders, the person's shell PATH read once) and then `agent_lookup.check`, which runs `--version` the way a tab starts the program. `usable(kind)` asks once more, fresh, when the first answer is not `runs`. `said(found)` is the finder's sentence with the program's install line. FormTxt has no path setting for these programs, so `setting()` answers `None` and `OTHERWISE` is empty; none is added here. Override variables: `FORMTXT_CLAUDE_BIN` (as before), and new `FORMTXT_CODEX_BIN`, `FORMTXT_CURSOR_BIN`, `FORMTXT_ANTIGRAVITY_BIN`.
- services/claude_code.py :: `child_env(path)`, `cli`, `_signed_in`, `info`, `start`, `program`, `terminal_env(token, path, extra)`, `terminal_argv`, `open_terminal` · the same names and answers, with bodies that call the finder. `child_env` and `terminal_env` take the program's path and build PATH as the program's own folder, the repository, the shell PATH, the known folders that exist, then the engine's PATH. `info` answers the old fields plus `finding` (`runs`, `broken`, `missing`), `how`, `looked`, `error` and `said`; `installed` is true only when `--version` ran with exit code 0; its 60 s cache stays. Chat (`start`) refuses with `info()["said"]` and starts through `agent_lookup.start_argv` (the login shell, `exec`) with `child_env(path)`. `open_terminal` raises `LookupError(said(found))`. `KEEP_ENV` is the finder's.
- Removed from services/claude_code.py: `_from_login_shell`, `CANDIDATES = (".claude/local/claude", ".local/bin/claude", ".npm-global/bin/claude", ".bun/bin/claude", ".volta/bin/claude")`, `SYSTEM_PATHS = ("/opt/homebrew/bin/claude", "/usr/local/bin/claude", "/usr/bin/claude")` (the finder's table holds these and more), the imports `shlex`, `shutil` and `Path`, and the sentence `Claude Code is not installed. Install it with: <line>` in `start`. `MISSING` is still defined and no longer used by the engine.
- services/agent_programs.py :: `PROGRAMS`, `TABS`, `find`, `status(fresh)`, `version`, `report`, `open_terminal` · `PROGRAMS` gains `antigravity` (Google's `agy`), so both status answers report it like Codex and Cursor: found or not, where it looked, `signedIn` always null because there is no status command. `TABS` is `("codex", "cursor")`: there is no Antigravity tab, label or MCP file, and `POST /api/terminal/agent` still accepts only those two kinds (422 for any other). `status` and `report` answer per program `agent_lookup.answer(...)` plus `signedIn`, `install` and `title`; `report` keeps its 60 s cache. `open_terminal` uses `usable`, `agent_lookup.start_argv` and `claude_code.terminal_env(token, path, {FORMTXT_MCP_URL})`, so a Codex or Cursor tab now also leaves out the `CLAUDE*` variables a Claude Code tab leaves out. Removed: the `shutil.which` and `command -v` lookup in `find`, and `<title> is not installed on this computer.`
- routers/claude_code.py :: `window_status` · passes `fresh` on to `agent_programs.status`, so `GET /api/claude-code/status?fresh=true` asks again for every program.
- Checked on an engine from source (port 4735, its own data folder, started with `env -i`, a made-up home, a stand-in login shell named zsh, PATH exactly `/usr/bin:/bin:/usr/sbin:/sbin`, node-style stand-in programs each with a stand-in `node` beside it): `GET /api/agents/status?fresh=true` and `GET /api/claude-code/status?fresh=true` gave all four as `runs`, `how: folder` (`~/.local/bin` for claude, cursor-agent and agy, `~/.nvm/versions/node/v22.3.0/bin` for codex), version 1.2.3, Claude Code signed in and the others null; moved to a folder named only in the stand-in shell's interactive file, all four `runs`, `how: shell`; removed, `missing` with the list of places and the sentence; a Codex script whose interpreter is missing, `broken` with the error line. Tabs through `POST /api/terminal/agent` (codex, cursor) and `POST /api/terminal/claude`, read over the stream socket: each printed that the stand-in `node` ran it and that its own folder was first on PATH; `antigravity` was 422. Chat through `POST /api/agent/claude/start`: ready, session id read, a sent message answered, the token in the child's environment. With the programs gone the tab routes answered 404 and Chat 409 with the finder's sentence. Not run: the real Claude Code, Codex, Cursor or Antigravity, macOS, Windows, a frozen engine, a real zsh, bash or fish with real rc files.
- Tests. `tests/conftest.py` gains `stand_in` and the `dock_start` fixture (made-up home, stand-in shell, the system's four folders on PATH, no override or folder variables, no system install folders, the caches cleared). `tests/test_agent_programs.py` and `tests/test_agent_status.py` pinned the old lookup and were changed for that reason only: their stand-ins now answer `--version` (a program that does not is `broken`, not installed), the fixture that replaced `terminal.login_shell` is the `dock_start` environment, since the finder asks the shell itself, and the two sets of names include `antigravity`. They also no longer leave the machine's own PATH and login shell in reach of the lookup. `tests/test_agent_lookup.py` is new (five tests, written after the behaviour above was seen). Suite: 195 passed before, 203 after.

## after v0.34.0 · the family's finder for the agent programs, held to its recorded hash (2026-11-19)

- services/agent_lookup.py (new, 443 lines) · the family's one finder for Claude Code, Codex, Cursor and Antigravity, copied whole and byte for byte from FormVis 146dddd1 `backend/app/services/agent_lookup.py`, VERSION 1.0.0, SHA-256 `252ea9bb9419d4990f174f91914f09800497bc69e98f849f5643bbf4217cc3f3`. It uses the standard library only and imports nothing from the app; everything of FormTxt's is passed in as arguments. Nothing in it is edited here, ever: it changes only as a whole new version with a new recorded hash. Its own docstrings stay as they came, since removing them would change the hash.
- setup/agents.py :: `LOOKUP_REL`, `LOOKUP`, `LOOKUP_HASHES`, `lookup_problems`, `sync`, `check` · `lookup_problems()` reads the `VERSION = "..."` line, hashes the file's bytes and answers `backend/app/services/agent_lookup.py: does not match the hash recorded for version X (the shared finder changes only as a whole new version)` or `...: missing (the shared finder for the agent programs)`. `agents check`, `agents sync --check` and `agents sync` all print it and exit 1. The repository already checks files out with LF endings (`.gitattributes`: `* text=auto eol=lf`), which the hash of the bytes relies on. The hash is not in `frontend/src/dock/MANIFEST.json`: that folder belongs to the dock module.
- setup/agents.py :: `lookup`, `install_claude` · `agents install` no longer asks a bare `shutil.which("claude")`, which misses a Claude Code installed by a version manager when the script runs with a short PATH. It loads the finder from its file (no engine needed), finds and checks `claude` (`FORMTXT_CLAUDE_BIN` is the override), and runs `claude mcp get`, `remove` and `add` through the finder's `run` in the finder's child environment. When the program is missing or does not start, the line it prints is the finder's sentence, then "Once it runs: claude mcp add ...". Removed: `the claude command is not installed here; once it is, run: ...`.
- Checked on Linux, Python 3.13: the copied file's SHA-256 is the recorded one; `agents check` and `agents sync --check` clean in the repository; on a copy of the kit, one added newline in the finder gave the "does not match" line and exit 1 from `check` and from `sync`, and the file removed gave the "missing" line and exit 1. `agents install claude` with a made-up home, a stand-in login shell, PATH `/usr/bin:/bin:/usr/sbin:/sbin` and a node-style stand-in `claude` under `~/.local/bin` that records its calls: the dry run called `--version` and `mcp get formtxt` only, the real run then called `mcp add --scope user formtxt -- <launcher> mcp`; with no program anywhere the dry run printed the "was not found. Looked in: ..." sentence. Not run: the real Claude Code, macOS, Windows. Tests in `tests/test_dock_manifest.py` (three, added after the above was seen).

## v0.34.0, not released yet · the Mac engine carries its Python library once, as a plain file, so Apple's notary accepts the app (2026-11-19)

- Fault, seen on FormTools 0.9.0 on 2026-11-19 (the first Mac build with notarization on, formcompiler 0.16.0): Apple's notary answered `Invalid`, "The signature of the binary is invalid", for `engine/_internal/Python.framework/Versions/3.14/Python`. `setup/freeze_backend` here signed the engine with the same steps (the v0.32.1 section below), and FormTxt's Mac builds since then were made while notarization was off, so the notary has not seen a FormTxt engine signed this way. It would refuse it for the same reason.
- Cause: the same library has to be valid in two places and no single signature is. PyInstaller puts it at `_internal/Python.framework/Versions/3.x/Python` and makes `_internal/Python` a link to it. The app bundle carries the link as a second plain file, which is the file the engine loads. The v0.32.1 change signed the library outside its framework so the plain file validates; at the framework path the notary expects a signature bound to the framework and refuses.
- setup/freeze_backend :: `plain_framework_libraries` (new, called before the signing loop) · a link outside a framework that points at a Mach-O inside a `*.framework/` folder of the engine becomes the file itself, its old signature is removed so the loop signs it alone, and that framework folder is deleted. The engine then holds the library once, as `_internal/Python`, with a signature that is right for a plain file. This is the layout FormVis has shipped through the notary.
- setup/freeze_backend :: the new check after `codesign --verify --strict "$out/formtxt-engine"` · a Mach-O still inside a framework folder (one nothing links to from outside) must pass the strict check where it sits, or the build stops with the reason before the compile and the upload to Apple.
- `--selfcheck` still runs after signing, now in the layout the app carries (no link).
- Checked on Linux with stand-in `codesign` and `file` in which a signature holds only in the kind of place it was made for: the script as released leaves a file the stand-in notary refuses at the framework path; this one leaves every Mach-O valid where it sits, no framework folder, `Python` a real file, an ordinary link still a link. `bash -n`. Not run: a macOS build, the real `codesign`, the notary. Only signed Mac builds take this path.

## v0.34.0, not released yet · what the dock's module 2.0.1 needs from the engine: Blocked, a closed tab's token, a question that survives a reload or ends with its caller (2026-11-19)

- services/bridge.py :: `_asks`, `RETURN_SECONDS`, `_closed`, `_unclaimed`, `detach`, `adopt`, `call`; routers/live.py :: `live` · a question waiting when the window reloads is shown again. Before, `detach` answered every request the leaving window held with "The FormTxt window closed before it answered", so a reload while the outside-agent question was open counted as a refusal and started the ten-minute pause. Now a request sent with `withdraw=True` (only the consent call) is kept in `_asks` with its message; when its window leaves, its owner becomes 0 and `_unclaimed` ends it as before only if no window has taken it within `RETURN_SECONDS` (20). `adopt(key)`, called by `/api/live` right after `attach`, sends the unowned questions to the window that just connected, under their old ids, so the answer resolves the same waiting call. Ordinary command runs are answered at once on detach, as before. `mcp.CONSENT_SECONDS` (180) is untouched; FormCel's report calls rely on it.
- routers/mcp.py :: `HUNG_UP`, `attended`, `rpc`; routers/reports.py :: `run` · a caller that hangs up ends its question. FastAPI does not cancel a handler when its client leaves, so the dialog stayed up for a call nobody was waiting for (seen: caller timed out after 7 s, the dialog was still open). `attended(request, work)` runs the work as a task and looks at `request.is_disconnected()` once a second; when the client is gone the task is cancelled, `bridge.call`'s `finally` sends `withdrawn` with reason `gone`, and no refusal pause starts. A single `/mcp` message and `POST /api/reports/run` go through it; a batch of messages does not (left as it was).
- services/agents.py :: `BLOCKED`, `BLOCKED_REPLY`, `blocked`; routers/system.py :: `set_settings`; routers/mcp.py :: `consent`, `call_tool` · Blocked. `agentsBlocked` is a new setting the window writes through `POST /api/settings` (window key, like `agentsAllowed`); setting it clears `agentsAllowed` and the other way round. While it is true `call_tool` refuses every tool, `list_commands` and `describe_command` included, and `consent` refuses before it looks at the in-app token, so FormTxt's own Claude Code, Codex and Cursor tabs and Chat are refused as well as outside agents and report callers, and no question is sent. Terminal routes are not touched: the dock opens and a plain shell is the person's. It is not added to `seal.SEALED`: that would change the digest of every stored seal and reset people who have Allowed, and a change made outside the app can only turn Blocked into Ask (which still asks in the window) or into Blocked.
- services/agents.py :: `CLOSED_REPLY`; routers/mcp.py :: `rpc`; routers/reports.py :: `run` · a closed tab's token is refused. A request that sent `x-formtxt-inapp` with a token the engine no longer holds used to be treated as an outside agent (asked about, or run when outside agents are allowed). It is now answered 401 with "This FormTxt tab has closed, so its access has ended." A request with no such header is an outside agent, as before.
- services/claude_code.py :: `TAB_SERVER`, `inapp_mcp_config`, `terminal_argv` · the MCP entry the engine writes for its own Claude Code tabs and Chat is named `formtxt_tab` (it was `formtxt`), the name Codex and Cursor tabs already use, so it cannot be taken for the `formtxt` entry `./formtxt agents install` registers for outside agents. `--allowedTools` follows: `mcp__formtxt_tab`.
- Checked on an engine from source (port 33811, fresh data folder, a file keyring, stand-in `claude`, `codex`, `cursor-agent` first on its PATH) with the real window in headless Chrome and calls to `/mcp` from a script: Allow once ran the call and the next asked again; with two waiting the first answer left the second shown and its caller waiting; a caller that timed out closed its dialog within 1.2 s and the next call asked (no pause); a reload with a question open showed it again and Allow once ran the waiting call; Always stored `agentsAllowed: true`, `seal: ok`; Block all agents gave `agentsBlocked: true, agentsAllowed: false`, outside `run_command` and `list_commands` and a Claude Code tab's own token were refused with the Blocked sentence and no dialog; unblocked, the tab's token ran with no question; after the tab closed its token got 401; Deny refused and the next call was refused at once; `POST /api/reports/run` asked in the same dialog and Deny gave 403. Suite 190 passed before the tests for this were added.

## v0.34.0, not released yet · agent programs in one call, and how a Codex or Cursor tab reaches the engine (2026-11-19)

- services/agent_programs.py :: `SERVER`, `_cache`, `version`, `report`, `codex_args`, `cursor_config`, `open_terminal`; routers/claude_code.py :: `programs_router`, `GET /api/agents/status`; main.py mounts it · second part of the engine side of the family dock's contract (DOCK_SPEC 2, section D, clauses 10 and 13).
  - One call. The dock's adapter needed two requests to learn which agent programs exist (`GET /api/claude-code/status` twice, once for Claude Code and once for its `agents` field). `GET /api/agents/status` answers `{claude, codex, cursor}`, each `{installed, path, version, signedIn, install, title}`: `install` is always the line a person can paste (the older `agents` field empties it when the program is found, and stays as it is for the present page); `version` is the first word of `<program> --version` that starts with a digit (`codex-cli 0.99.1` gives `0.99.1`), or null; `signedIn` is true, false or null for Claude Code (from `claude_code.info`, which asks `claude auth status`) and always null for Codex and Cursor, because the engine has no way to tell that was checked against the real programs. `?fresh=true` skips the caches (60 s each, the Codex and Cursor one is new and belongs to this route only). Read-only, `require_local` like the other status routes, and nothing in the engine calls it: not start-up, not another route.
  - Codex. The tab's command line gains `-c mcp_servers.formtxt_tab.url="http://127.0.0.1:<port>/mcp"` and `-c mcp_servers.formtxt_tab.env_http_headers={"x-formtxt-inapp"="FORMTXT_INAPP_TOKEN"}`: Codex's own override flag and its documented key that maps a header to the name of an environment variable, so the command line holds the variable's name and the token stays in the child's environment. No file is written and the person's `~/.codex/config.toml` is not touched. The entry is named `formtxt_tab`, not `formtxt`, because `./formtxt agents install` registers `formtxt` there as a stdio server and two overrides laid over that entry would leave it with both a command and an address.
  - Cursor. Cursor reads MCP servers from `.cursor/mcp.json` in the folder it runs in and has no flag for another file, so before a Cursor tab starts `cursor_config` puts `mcpServers.formtxt_tab = {"url": "${env:FORMTXT_MCP_URL}", "headers": {"x-formtxt-inapp": "${env:FORMTXT_INAPP_TOKEN}"}}` into that file in the tab's folder (FormTxt's own Documents folder under the data folder). The file holds only the names of the two variables, is written through a temporary file created with mode 0600 (the folder 0700 when it is made here), keeps every other key and server already in it, is left alone when it is not a JSON object or cannot be read, and a failure to write never stops the tab. The document list globs `d_*.ftxt` in that folder, so the dot folder is not listed.
  - Unchanged: the token is still issued per tab, lives in the child's environment, is revoked by the session's `on_close`, and a plain shell tab gets none. The terminal stream already sends the exit notice as a typed message (`{"type": "exit"}` in a binary frame, output in text frames), so nothing was added there.
  - Checked with stand-in `claude`, `codex` and `cursor-agent` scripts first on the engine's PATH (each prints a version line): the route gave versions 9.9.9, 0.99.1 and 2026.11.01-abc123, Claude Code signed in, the other two null; without them (PATH `/usr/bin:/bin`) Codex and Cursor were `installed: false` with their install lines and `POST /api/terminal/agent` for Codex was 404. Tabs of the three kinds each had their own 43-character token in `/proc/<pid>/environ`, none of the three appeared in `ps -eo args`, the Codex line showed the two overrides, a shell tab had no token, `.cursor/mcp.json` was mode 600 in a 700 folder, a call to `/mcp` carrying the Codex or Cursor tab's token ran under ask with no question, and after the Codex tab was closed the same token was asked about like any outside agent. `cursor_config` on a file with another server and another key kept both; on a file that was not JSON it changed nothing. Not checked, because neither real program is on this machine: that Codex accepts the two overrides and sends the header (an old Codex that does not know `env_http_headers` may refuse to start with them), that `cursor-agent` reads the project file, expands `${env:...}` in `url` and `headers`, and does not ask the person to approve the server first. Tests in `tests/test_agent_status.py`.

## v0.34.0, not released yet · the outside-agent question carries what the family's dialog needs (2026-11-19)

- routers/mcp.py :: `ANSWERS`, `ALWAYS`, `SESSION_HEADER`, `SESSIONS_KEPT`, `_sessions`, `_caller`, `remember`, `question`, `consent(inapp, ask)`, `call_tool`, `end_session`, `rpc`; services/bridge.py :: `tell`, `call(..., withdraw)`; routers/reports.py :: `run` · engine side of the family dock's contract (DOCK_SPEC 2, section D), added before FormTxt's frontend takes the module's consent dialog. Everything is additive: the present window (`frontend/src/automation/bridge.ts`, `ui/agent-confirm.ts`) reads only `t`, `id` and `command` of the event, ignores `params` for `__consent__`, ignores every `t` that is not `run`, and answers `{allowed}`; it behaves as before. What changed:
  - The question. The `/api/live` event `{"t": "run", "id", "command": "__consent__", "params"}` used to carry empty `params`. They now hold `agent` (the name the client announced, or `""`), `tool` (`run_command` or `report`), `what` (plain words that finish "It asked to ...": `run the command Bold (format.bold)`, or `make a report from a template and save it as <out>`; at most 300 characters; caller text, to be shown as text only), `command` (the command id, for `run_command`) or `file` (the `out` path, for a report), `answers` (`["deny", "once", "always"]`), `always` (`"all"`: this engine keeps one choice for every outside agent, `agentsAllowed`, nothing per agent), `seconds` (`CONSENT_SECONDS`, 180) and `expiresAt` (Unix seconds when the engine stops waiting). The event's `id` is the request id and is unique within one engine run.
  - The answers. `{"allowed": false}` and `{"allowed": true}` mean what they meant: refuse and refuse every outside call for `DECLINE_SECONDS`, or store `agentsAllowed` (sealed) and run. New: `{"allowed": true, "once": true}` lets the waiting call run and stores nothing, so the next call asks again. A question that is never answered ends as a refusal with the same ten-minute pause, as before.
  - Withdrawal. `bridge.call(..., withdraw=True)` (only the consent call passes it) sends every connected window `{"t": "withdrawn", "id", "command": "__consent__", "reason"}` when the question is over, whatever ended it: `answered`, `expired`, `closed` (the window that held it went away) or `gone` (the waiting request itself ended). A question that could not be delivered is not withdrawn. The question still goes to the newest window only, as before; with the window key one window holds the socket in practice.
  - The agent's name. `/mcp` kept no sessions, so the only name was the last `clientInfo.name` any client sent (`lastClient` in `GET /api/mcp/status`, still there and unchanged), which is the wrong name as soon as two agents are connected. `initialize` now answers with an `Mcp-Session-Id` header (`secrets.token_urlsafe(18)`), the engine remembers the announced name for the newest 200 ids in memory, and a later request that sends the header back is asked about under that name; `DELETE /mcp` forgets it. An id the engine does not know (after a restart) is not an error: the call is served and the name is empty. `setup/mcp_stdio.py` already forwards the header. The in-app name (`Claude Code in FormTxt`) and `unknown agent` are stored as empty, so no outside client is shown under the app's own name. A caller with no session, and every `/api/reports/run` caller (FormCel's engine and `./formtxt report run` announce nothing), has `agent: ""`.
  - `consent` keeps its one-argument call. `reports.run` passes the question as the second argument; it still calls `consent` before it reads anything, and its replies are unchanged.
  - Not here, for the frontend port: there is no Blocked state in this engine (the stored choice is the sealed boolean `agentsAllowed`), so nothing was added for it.
  - Checked on an engine from source (port 33801, fresh data folder, a memory keyring in place of the system one, a script as the window holding the key on `/api/live`): under ask the event carried the fields above with `agent: "probe-agent"` for a call that sent its session id and `""` without; deny refused and the next call was refused at once; once ran the call, left `agentsAllowed` unset, and the next call asked again; allow without `once` stored `agentsAllowed: true` with `seal: "ok"` and the next call ran with no event; with the limit shortened to 4 s in the launcher the call was refused after 4.0 s and the window received `withdrawn` with `expired`; each answer was followed by `withdrawn` with `answered`. The report route was run before and after the change with the same script (no window: 403; window and Allow: 200 and a 12 KB PDF, then 200 with no `out`; window and Don't Allow: 403; after a refusal: 403 at once) and its replies were the same apart from document ids. The write-route sweep counts 88 operations before and after. Tests in `tests/test_outside_agent_question.py`.

## v0.34.0, not released yet · Codex and Cursor tabs for the family dock (2026-11-19)

- services/agent_programs.py (new) :: `PROGRAMS`, `find`, `status`, `open_terminal`, `MCP_URL_VAR`; routers/terminal.py :: `AgentBody`, `POST /api/terminal/agent`; routers/claude_code.py :: `window_status` adds `agents`; services/terminal.py :: `restart` accepts kinds `codex` and `cursor` · the family dock (DOCK_SPEC 2, module 1.0.0-stage1 from FormVis 38148cba) shows Codex and Cursor as tabs only when their programs are on this computer. The engine looks for `codex` and `cursor-agent` on the PATH the terminals get (`terminal.base_env`) and then by `command -v` in the login shell, as `claude_code.cli` does for `claude`; `GET /api/claude-code/status` reports each as `{installed, path, version: null, signedIn: null, install, title}`, with the install line only when it is missing. `POST /api/terminal/agent` with `kind` `codex` or `cursor` starts the program in a PTY tab of that kind, through the login shell with `exec`, in the documents folder like a Claude Code tab. The tab gets its own in-app token from `agents.issue` in the child's environment (`FORMTXT_INAPP_TOKEN`, with `FORMTXT_MCP_URL` beside it), never on its command line, revoked by the session's `on_close`, the same life as a Claude Code tab's token. A missing program is 404 with a sentence, another kind 422; the route passes `require_local` and is refused without the window key like every other write route (the write-route walking test counts 88 routes now, 87 before). Same behaviour as FormVis's 365d62b2, written in this engine's names. How each program reads the token to reach `/mcp` (Codex's `mcp_servers`, Cursor's `mcp.json`) is not wired, as in FormVis. Checked with stand-in `codex` and `cursor-agent` scripts on the engine's PATH: the status said installed, a Cursor tab started, `/proc/<pid>/environ` of the child held the token and `/proc/<pid>/cmdline` did not, restart answered 200, the token was no longer valid after close, `kind: vim` was 422, and without the key the route answered 403 "Only the FormTxt window can do this". Tests in `tests/test_agent_programs.py`.
- setup/agents.py :: `DOCK`, `DOCK_DIR`, `DOCK_DIR_REL`, `DOCK_MANIFEST`, `check_dock`, `check`, `sync`; agents/manifest.json · `frontend/src/dock/` is the family's shared dock module, copied whole from FormVis and never edited here. `check_dock` hashes every file in it (SHA-256) and compares with the `files` of its `MANIFEST.json`; a changed, missing or extra file is a problem naming it, so `./formtxt agents check`, `sync --check` and `sync` itself exit 1. Unlike FormVis, whose sync writes that `MANIFEST.json` (it is the module's source), this sync only reads it: here a rewritten manifest would bless a local edit. `DOCK` now says `positions: ["bottom", "right"]` and tabs `chat`, `terminal`, `claude-code`, `codex`, `cursor`, `activity` (the read-only tab of an outside agent's commands, PTY kind `agent`, still FormTxt's name for it), in the order the dock shows them; `agents/manifest.json` was rewritten by `./formtxt agents sync` and formadaptor's `scripts/manifest.py --app formtxt check` accepts it. Checked: check clean; in a copy of the repository, one byte appended to `dock.css` and `state.ts` removed made `sync --check` exit 1 naming both. `tests/test_dock_manifest.py` also loads the module's `state.ts` with `node --experimental-strip-types` for the one-time move from `formtxt.terminal` (seen first with the same call).

## v0.34.0, not released yet · database merge data, list reports and report run (2026-11-18)

- services/tabular.py :: `sqlite_rows`, `_sql_open`, `_cell`, `SQL_ROWS`, `SQL_SECONDS`; routers/data.py :: `Query`, `POST /api/data/sqlite` · reads one SELECT (or `WITH ... SELECT`) from a SQLite file for mail merge. The file opens as `file:...?mode=ro` with `PRAGMA query_only = ON`, so nothing can write even when the text check is passed; the path must be absolute and an existing file, and nothing is ever created. More than one statement is refused through the driver's own one-statement rule. A progress handler stops a query after 10 s. The reply has the shape of `/api/data/parse` (`rows` with the header first, `sheets`), with `sheets` holding the tables and views; at most 2000 records and 60 columns, the caps of `settings.mailMerge`. Whole reals come back without `.0` and NULL as empty text. A body with no SQL returns only the table list. Errors are 422 with a sentence. Checked with a live engine and `/tmp/orders-txt.db`; tests in `tests/test_merge_reports.py`.
- services/versions_docs.py :: `_filler`, `_repeat_rows`, `merge(..., mode)`; routers/versions.py :: `Merge.mode` (`pages` default, or `list`) · the old per-record fill closure moved out of the loop into `_filler(record)` unchanged (an empty value still writes no run). `list` writes the body once: every table row with `repeat: true`, in nested tables too, is cloned once per record (up to 2000, the `settings.mailMerge` cap) and filled from it, the clones lose `repeat`, then the rest of the body is filled from the first record. A list merge with no repeating row is refused, because it would only print the first record. `pages` is the old merge, 1000 records, a `pageBreak` between copies; `repeat` is ignored there. A row with cells spanning into the next row is cloned as it is; spans are not adjusted.
- services/versions_docs.py :: `AGGREGATES`, `_number`, `_aggregate`, `_groups`, `_filler(record, group)`, `merge(..., group_by)`; routers/versions.py :: `Merge.groupBy` · in `list` mode `groupBy` splits the records by the column's value, in order of first appearance, and writes the body once per group with a `pageBreak` between; repeating rows take only that group's records and the rest of the body takes the group's first record. A `mergefield` with `agg` totals its column over the group (in a repeating row, over that row's record; in `pages` mode, over every record, so a page can show a grand total). Numbers are read after removing thousands commas; text, NaN and infinity are skipped; results are rounded to 6 places and whole ones lose `.0`, like `tabular._cell`. `groupBy` with `pages` and a column the data does not have are refused.
- routers/reports.py :: `Source`, `Report`, `_records`, `_target`, `_export`, `_write`, `_run`, `POST /api/reports/run`; main.py mounts it with the area routers; setup/report.py and the `report` line of `formtxt` · body `{template, data: {path, sql} or {records}, mode (list default), groupBy, format (pdf default, docx, ftxt), out, overwrite, title}`, reply `{id, title, records, file}`. The merged document is kept in the library like any merge. Consent: the route calls `mcp.consent` before it reads anything, exactly as `run_command` does, so it runs only for the in-app token, or when the person has allowed outside agents, or after they answer Allow in the window; with no window and no saved Allow it is refused (403), which is also what `./formtxt report run` meets with the window closed. The dialog text is the existing one ("run FormTxt commands on the document you have open"); it does not mention files. `out`, decided here because the engine writes it on a caller's word: a full path, ending in `.<format>`, in a folder that exists; a link or a folder there is always refused; an existing file is refused (409) unless `overwrite` is true. A new file is created with exclusive create (`xb`), so a file that appears in between is not replaced; an overwrite writes a temporary file beside it and renames it over, keeping the old file's permission bits. PDF goes through `printing._pdf` (tagged), .docx through `exchange.export`, .ftxt through `package.pack` after `prune`. `setup/report.py` resolves relative `db` and `out` against `FORMTXT_CALLER_DIR`, forwards `FORMTXT_INAPP_TOKEN` as the in-app header when it is set (the same exemption `/mcp` gives Claude Code in FormTxt), and waits 240 s so the 180 s consent question can be answered. `formtxt.bat` gained the matching `report` line (and the word in its usage line) afterwards; it sets `FORMTXT_CALLER_DIR` at the top like the bash launcher. Checked with a live engine: window closed and no Allow, refused; window open, the Allow dialog appeared, Don't Allow refused, Allow wrote the file; window closed after Allow, `./formtxt report run template=<id> db=/tmp/orders-txt.db sql="select * from order_items" out=/tmp/invoice-1001.pdf` wrote 26 KB, and `pdftotext` of the grouped run lists Lamp 80 and Desk 220 with Total 300 under order 1001 and Chair 260 under 1002.
- core/window_key.py :: `KEY`, `WindowKeyGuard`, `claim`, `require`, `socket_window`; main.py adds the guard once, inside `LocalGuard`; routers/system.py :: `POST /api/window/key`, `secondWindowClaim` in `GET /api/settings` · the engine makes a per-launch key (`secrets.token_urlsafe(32)`, memory only, compared with `hmac.compare_digest`). Every request whose method is not GET, HEAD or OPTIONS needs it in `X-Formtxt-Window-Key` unless its path is on `OPEN`: `/mcp` (outside agents, consent applies), `/api/window/key` (the bootstrap) and `/api/reports/run` (FormCel's engine and `./formtxt report run` cannot hold the key; the route is one strict body model, it calls `mcp.consent` before anything else, and the match is on the exact path). A refusal is 403 `Only the FormTxt window can do this`. `GET /api/collab/links` also needs it, because it returns link tokens. Sockets: `/api/live`, the terminal streams, `/api/agent/claude/stream` and a local `/collab/{id}` socket without a share-link token wait up to 10 s for a first message `{"type": "key", "key": ...}` and otherwise close 4403, so a client without the key cannot become a window, answer consent, receive permission ids or type into a shell; the key travels in a message rather than the address so it never reaches the access log. Share-link peers keep their token as before. Packaged: with `FORMTXT_WINDOW_KEY_STDOUT=1` (set by the shell) formtxt_engine.py prints `formtxt-window-key: <key>` once, flushed, before uvicorn starts, and the bootstrap answers 404. From source: the bootstrap gives the key once, then 409 and `secondWindowClaim` true. Sweep of `app.openapi()` write operations with no key: 86 operations, 1 refused before (`/api/ai/test`, by its own check); 87, 83 refused after.
- services/agents.py :: `TOKENS`, `issue`, `revoke`, `is_inapp`; services/claude_code.py :: `Agent.token`, `start`, `stop`, `terminal_env(token)`, `open_terminal`; services/terminal.py :: `Session.on_close`, `close` · the engine-wide in-app token is gone. Each Claude Code tab gets its own token in that child's environment only (never a command line; the `--mcp-config` names `${FORMTXT_INAPP_TOKEN}`), revoked when the tab closes; each Chat run gets one, revoked on stop or the next start. Plain terminals never get one. There is no setting that names the Claude program (only `FORMTXT_CLAUDE_BIN` in the engine's environment), so nothing else to key.
- core/seal.py; core/config.py :: `stored_settings`, `read_settings`, `write_settings` · `settings.json` carries `seal`, an HMAC-SHA256 over `agentsAllowed` with a 32-byte key in the system keychain (`keyring`, service `formtxt`, account `settings-seal`, already a dependency for `secrets.py`). Written when `agentsAllowed` is written, which only the keyed settings route and the window's consent answer do. Seal missing or wrong while `agentsAllowed` is true: read as false, `seal: "broken"`, `sealBroken: true`; a later unrelated write keeps it that way. No keychain (import fails, fail or null backend, priority 0): stored values stand, `seal: "unavailable"`, the engine starts. `keyring` is imported lazily inside a try.
- setup/catalogue.py :: `run_command`, `MCP` · `./formtxt cli run` calls the MCP `run_command` tool instead of `POST /api/commands/{id}`, so it is an outside agent: it follows the stored choice, is asked in the window, cannot reach window-only commands and cannot change the choice. It forwards `FORMTXT_INAPP_TOKEN` when set, like setup/report.py. `list` and `describe` stay on the GET routes.
- routers/mcp.py :: `WINDOW_ONLY` gains `cloud.set`, and the `run_command` description says so · setting cloud storage sends every later save of every document to a WebDAV address or a folder, so only the person sets it, from the window (File > cloud storage, or the command in the palette, which reaches `POST /api/versions/cloud` with the window key). `list_commands` marks it `windowOnly`. Checked on a live engine: `run_command cloud.set` and `./formtxt cli run cloud.set` were refused with the window-only sentence even with outside agents allowed; the same command through the window route with the key reached the window.
- src-tauri/src/main.rs :: the engine-output task in `setup` · after the address line is read, the shell waits at most 10 seconds for the `formtxt-window-key:` line if it has not seen it yet, then takes the existing "The FormTxt engine failed to start" path, so a window that could not write is never opened. The engine prints the key flushed before the address, but the shell reads stdout and stderr as separate events and could see the address first, so a short wait is kept rather than failing at once. The wait polls `rx.try_recv()` with a 20 ms `spawn_blocking` sleep, the pattern FormPath uses, because the crate has no direct tokio dependency and `tauri::async_runtime` has no timeout. `CommandEvent::Stdout` and `Stderr` both carry `Vec<u8>` and `Receiver::try_recv` is tokio's, checked in tauri-plugin-shell 2.5.0 and tauri 2.12.5 (the Cargo.lock pins). The wait for the address itself is unchanged and still ends only at the address or the engine's end. Not compiled: no WebKit here; `rustfmt --check` parsed the file.
- scripts/demo-docs.py :: `start_engine`, `cover`, `main`, `request` · `--covers` used to import each demo into a running engine over `POST /api/documents/import` and delete it again, which the window key now refuses (403) because a script is not the window. It now starts its own engine (`python -m uvicorn app.main:app`) on `FORMTXT_ENGINE_PORT` (default 8210) with `FORMTXT_DATA_DIR` set to a scratch folder, puts each demo into that folder in process with `store.adopt` (the function the import route calls), and removes the engine and the folder at the end. It stops if something already answers on the port, so it never touches an engine of yours. The address after `--covers` is a Vite dev server started with the same `FORMTXT_ENGINE_PORT`; the page in headless Chrome is the window and takes its own key from the scratch engine's bootstrap, so the script never holds a key and no route was opened. Run with Vite on 24801 and the engine on 24802: the three covers came out byte for byte equal to the committed `.webp` files, and the three `.ftxt` files unpacked to the same document and media as the committed ones (the zip bytes differ from the committed ones on this machine, probably the compression library, and are the same from run to run, so they were put back).

- setup/agents.py :: `engine_tools`, `skill_list`, `build_manifest`, `write_manifest`, `check_manifest`, `APP`, `DOCK`, `EXTENSIONS`; agents/manifest.json; routers/mcp.py :: `TOOLS[*].annotations`; tests/test_agents_manifest.py (2026-11-18) · the family spec (formadaptor, "The agent manifest") reads `agents/manifest.json` at each tag. `./formtxt agents sync` now also writes it and `sync --check` (and `agents check`) fails naming `agents/manifest.json` when it differs from what would be written. Nothing in it is typed except two things. From the source: `mcp.tools` and `mcp.read_only` are read with `ast` from the `TOOLS` list in `backend/app/routers/mcp.py` (the list `tools/list` returns; the script cannot import the engine because it runs with plain `python3` and no FastAPI), so a rename or a changed annotation changes the manifest; `mcp.transports` is `stdio` when `setup/mcp_stdio.py` exists and `http` when the router has `@router.post("/mcp")`; `skills` are the folders of `.claude/skills` and the folders under each `sub-skills/` that hold a `SUB-SKILL.md`, sorted. Declared in the script (it cannot be derived from the page's code): `DOCK` (the dock at the bottom of the window only, `positions: ["bottom"]`, set by `frontend/src/ui/terminal-dock.ts` and its mount in `frontend/src/app.ts`, which insert it above the status bar and only resize its height; tabs `terminal` for the shell tabs, `claude-code`, `chat`, and `activity` for the read-only tab that shows what an outside agent ran, the `agent` kind in the same file) and `EXTENSIONS = None` (FormTxt hosts no form.ext extensions). `approval_gated` is every tool that is not read-only, because `call_tool` in the router returns for `list_commands` and `describe_command` before it reaches `consent`, so only `run_command` waits for the person's Allow. The three tools had no annotations, so `read_only` would have been empty; `list_commands` and `describe_command` now send `readOnlyHint: true` and `run_command` `readOnlyHint: false`, which the MCP spec defines as a hint and which changes no behaviour. The documents already name the three tools; no count in them changed. The test runs the sync's check and compares the committed manifest with `mcp.TOOLS`.

## v0.32.1 · the macOS freeze keeps the Python library loadable in the app (2026-11-14)

- Fault (FormTxt 0.32.0 for macOS, the first build formcompiler made): the app showed "The FormTxt engine failed to start" on every launch. Run by hand, the engine printed `Failed to load Python shared library '.../Contents/Resources/engine/_internal/Python'` with `code signature invalid`, and `codesign -vvv` on that file said `invalid Info.plist (plist or signature have been modified)`.
- Cause: the runner's Python is a framework build, so PyInstaller puts the library at `_internal/Python.framework/Versions/3.12/Python` and makes `_internal/Python` a symlink to it. The 0.30.3 loop re-signed every Mach-O in place and then signed each `.framework` folder. `codesign` signs a file that sits in a framework as that framework's main binary, which binds the signature to the framework's `Info.plist`. In the installed app `_internal/Python` is a plain file, not a link (seen with `ls -l` on the 0.32.0 install), and a framework-bound signature does not validate on a plain copy. `--selfcheck` passed because it runs in `src-tauri/engine`, where the link is still a link.
- setup/freeze_backend :: the `APPLE_SIGNING_IDENTITY` block of the onedir branch · Now: (1) a Mach-O under a `*.framework/` folder is always signed as a copy in a temporary folder outside the framework and moved back, so its signature binds to the file alone; (2) any other Mach-O is signed only when `needs_sign` says so (no signature, ad hoc, no hardened runtime or no timestamp), which is FormCel's rule and keeps PyInstaller's own Developer ID signatures; (3) `formtxt-engine` is signed last with the entitlements, as before; (4) a guard copies every symlinked Mach-O with `cp -L` and stops the build when the copy fails `codesign --verify --strict`, which is the fault above caught at build time.
- Removed: the unconditional re-sign and the folder loop.
  ```
  while IFS= read -r -d '' f; do
    file -b "$f" | grep -q 'Mach-O' || continue
    "${sign[@]}" "$f"
  done < <(find "$out" -type f ! -path "$out/formtxt-engine" -print0)
  while IFS= read -r -d '' d; do
    "${sign[@]}" "$d"
  done < <(find "$out" -depth -type d \( -name '*.framework' -o -name '*.app' \) -print0)
  ```
  The engine folder holds no `.app`. A framework folder is no longer sealed as a bundle; nothing reads that seal at run time.
- Checked: `bash -n`, and the block run against a stand-in engine folder with stub `codesign` and `file` (the framework library signed outside its folder, a PyInstaller-signed library kept, ad hoc and unsigned ones signed, the guard stopping on a framework-bound signature). Not run: a macOS build. Apple's notary service has not seen an engine signed this way, because notarization is off while formcompiler's `signing.macos` is `developer-id`.

## v0.31.0 · MCP, terminals and Claude Code in the engine, the agent kit (2026-11-13)

- routers/mcp.py :: `TOOLS`, `call_tool`, `consent`, `WINDOW_ONLY`, `status` · `/mcp` with `list_commands`, `describe_command`, `run_command` over the mirrored catalogue and the existing `bridge.call` (shell ported from formtools). Protocol versions 2025-11-25 down to 2024-11-05. Window-only ids (`view.terminal`, `view.newTerminal`, `agent.claudeCode`, `agent.chat`, and the `terminal.`, `claudecode.`, `chat.` prefixes) are refused to agents and marked in the list. `GET /api/mcp/status`.
- services/agents.py :: `INAPP_TOKEN`, `is_inapp`, `allowed`, `set_allowed`; routers/system.py :: `set_settings` accepts `agentsAllowed` · the first `run_command` from an outside agent sends `__consent__` to the window and waits up to 180 s for `{allowed}`; a refusal holds for 10 minutes; the in-app token (`x-formtxt-inapp`, `FORMTXT_INAPP_TOKEN`) skips consent and names the client "Claude Code in FormTxt".
- services/terminal.py, routers/terminal.py, services/claude_code.py, routers/claude_code.py · formvis's PTY and Claude Code services with the same routes and message formats (`/api/terminal`, `/api/agent/claude`, `/api/claude-code/status`). `document_folder()` is the Documents folder, because the engine does not track the open file. A missing ptyprocess leaves the engine running and the terminal answers with the install line. main.py :: `lifespan` binds the loop and stops processes at shutdown. LocalGuard already covers WebSockets.
- requirements.txt, requirements_macos.txt · ptyprocess 0.7.0 (ISC), pywinpty 3.0.5 (MIT), NOTICE rows, and a row saying Claude Code is the person's own install. The freeze scripts are unchanged: `--collect-submodules app` already picks both up.
- Kit: setup/mcp_stdio.py (finds the engine through `engine.json`, starts `./formtxt backend` if nothing answers), setup/agents.py (sync, check, install), setup/mcpb.py with manifest (version stamped at build from `version.ts`, so it is not a version site), `.mcp.json`, `.cursor/mcp.json`, `.codex/config.toml`, `.claude-plugin/plugin.json`, skills `formtxt-driving` and `formtxt-harness` mirrored to `.agents/skills`, launcher lines `mcp`, `agents`, `mcpb`, `icons`, CI steps. AGENTS.md lost its placeholder sentence: "MCP tools for editing documents arrive in Phase 9 of the plan."
- Open: the stdio bridge has no `--attach` mode; the packaged app has no `mcp` hand-over mode as formvis has.

## v0.30.8 · review fixes, scripts and engine entry (2026-11-13)

- formtxt_engine.py :: `main` · with port 0 the engine binds a throwaway loopback socket to get a free port and sets `FORMTXT_ENGINE_PORT` to it before the app starts, so `engine.json`, `/api/system` and the share panel report the real port; uvicorn used to pick the port itself while `config.port()` still read 0. The "Uvicorn running on" line the shell parses is unchanged. Checked with a live engine.
- formtxt.bat · the argument tail comes from the raw `%*` (`for /f "tokens=1,*"`), because cmd splits `%1` at `=` and `cli run id key=value` lost its values; removed the `:collect` loop. A `:desktop` label handles `desktop build` and `desktop dev`; the old line passed the word `build` on to `tauri build`. Not run: no cmd.exe here.
- setup/desktop_dev · creates an empty sidecar placeholder (or an empty `src-tauri/engine` on macOS) when none exists, since tauri-build checks bundled resources even for a dev build; a real frozen engine is never overwritten.
- setup/catalogue.py · `from __future__ import annotations` for Python 3.9, and a non-JSON reply gives a clean message.
- setup/boot_all · the two subshells `exec` their boot script, so the recorded PID is the server on bash 3.2.
- frontend/boot_frontend · ends with `exec npm run dev`, so stopping the launcher reaches npm instead of the script's bash.
- Open: the Windows onefile engine leaves its temp folder on quit; network share links and version retention await the owner (see v0.30.7 below).

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
