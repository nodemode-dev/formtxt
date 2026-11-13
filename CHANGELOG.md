# Changelog

## 0.32.0 · 2026-11-13

- The three demos also open as offline browser pages (`demo/index.html`, `demos/paper/index.html`, `demos/newsletter/index.html`) that run the real FormTxt window from `file://`; the README has a Demo section for them.
- Read mode shows the document again, and keeps footnotes at the foot of each page.
- The title bar and the About dialog draw the same inline formtxt mark as Home instead of loading the PNG logo.
- The sparkle ban covers the icons and emoji a document can insert, and `./formtxt icons --check` fails if one returns.

## 0.31.0 · 2026-11-13

FormTxt joins the Form family standard for Home, agents and demos.

- Home: the side panel can be resized or collapsed, the brand block draws the mark inline, and an Agents group lists Claude Code, Chat and Terminal.
- Terminal dock: Ctrl+J opens a dock with shell tabs, Claude Code tabs and a Chat tab, run by the engine; title bar buttons light while the dock shows them. Claude Code is your own install; FormTxt does not bundle it.
- Agents: the engine answers MCP at `/mcp` and runs commands in the open window. `./formtxt mcp`, `./formtxt agents` and `./formtxt mcpb`, the MCP configs, the plugin and two skills connect Claude Code, Codex and Cursor. Outside agents are off until you allow them in Preferences, and FormTxt asks once when one first calls.
- Demos: three demo documents (a report under review, a paper with references, a newsletter) open from Home, Help > Demos or the `demo.review`, `demo.paper` and `demo.newsletter` commands.
- Icons: the family agent, chat, terminal and send glyphs; What's new draws a page with a new-item dot instead of a sparkle.

## 0.30.8 · 2026-11-13

Fixes from a full review; nothing new.

- Ribbon: drop-down menus work from the keyboard; the font, size and style boxes follow the caret at once; a malformed saved ribbon setup is skipped instead of blanking the window; Quick Access and the Breaks menu name only commands that exist.
- Editing: closing the browser tab right after an edit keeps it; clear formatting and the format painter keep tracked changes, comments and language; notes, citations and cross-references go after a selection instead of replacing it; a blank page inserted mid-paragraph lands at the cursor; Page setup keeps a custom page size.
- Proofing and review: a spelling fix applies only where the word still is, and a failed spelling request no longer marks words correct; pictures brought in by suggested edits and combine stay in the document's media; live co-editing puts unsent edits back after a reconnect.
- Safety: password-protected documents keep no unencrypted copy in browser storage; the Mermaid sanitiser drops risky style sheets and checks every attribute; document colours reach CSS only as `#rrggbb`.
- Scripts: stopping `./formtxt` stops the engine and the dev server on older bash; `./formtxt cli` runs on Python 3.9; `./formtxt desktop dev` starts on a fresh checkout; `formtxt.bat` keeps `cli run` arguments and builds the desktop app itself; the desktop engine writes its real port to `engine.json`.

## 0.30.7 · 2026-11-12

A review of file exchange, printing and the engine. Fixes only.

- Opening files safely: damaged, password-protected or tiny crafted Word and OpenDocument files are refused with a message instead of failing or exhausting memory; packages, add-ins and workbooks that inflate past the size limit are refused; an RTF file with a negative binary length no longer freezes the engine; a style id from an opened document can no longer inject markup into the Styles gallery.
- Word, OpenDocument and RTF: RTF text in Japanese, Chinese, Korean, Cyrillic and Mac code pages reads correctly; nested tables, content controls, right-to-left runs, footnotes and header tables survive import and export; lists that start below level one and text with control characters export.
- PDF: Cyrillic, Greek and Vietnamese text prints, headers and footers included; long table rows, bordered paragraphs, tall pictures and tab-stop paragraphs no longer break the export.
- The engine: imports, PDF opening and uploads no longer freeze it; one unreadable file in a batch is reported instead of failing the batch; documents with non-Latin titles download again; restoring from Trash can no longer overwrite a newer copy.
- Review and sharing: compare and suggest mark pictures, chips and other runs as removed or added; view and comment links can no longer replace the document a live session starts from; comments-only and read-only documents hold against review commands.

## 0.30.0 to 0.30.4 · 2026-10-25 to 2026-10-31

- 0.30.0 is 0.29.10 renumbered, so that a patch number never reaches two digits.
- FormTxt has its own dev ports, 5210 and 8210.
- CI gained the test and window jobs and `npm audit`; the first backend tests and the window smoke test landed.
- Desktop: the macOS engine is signed for notarization, the Windows window keeps its script types, the Linux packages pull in the media plugins, and Windows scripts check out with CRLF.

## 0.29.0 to 0.29.10 · 2026-10-22 to 2026-10-25

- The ribbon's tabs gained their pickers, galleries and controls; the font box lists every font on the computer with previews.
- Dark Page, a dark page with light text separate from the app theme.
- Basic CI on `main`, pull requests and compile branches.
- Trademark, copyright and licence rules: FormTxt's own names (Text Art, IntelligentArt, View Stager, Common equations), its own gallery names, the trademark notice, full Reserved Font Name font families, and the copyright holder NodeAgentc, Inc.
- The engine answers only this computer's own window and agents, and refuses cross-site requests.

## 0.1.0 to 0.28.0 · 2026-10-21 to 2026-10-22

The editor was built up in these releases: the `.ftxt` model and library, the command catalogue and `./formtxt cli`, Home with templates and Trash, the ProseMirror editor, paginated and pageless layout with sections, headers, footers and columns, tables with formulas, pictures, shapes, text boxes, charts, diagrams, equations, icons and ink, smart chips, building blocks, Mermaid diagrams, stock picture search, compare and combine, PDF export, print settings, grammar checking and the thesaurus, and Word files that keep comments, tracked changes, bookmarks and fields.

## 0.0.1 · 2026-10-21

- The repository starts with the Apache-2.0 licence and a README.
