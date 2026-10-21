# HASHOUT_LOG · frontend · formtxt

Living log of comment content, rationale and removed code for the frontend. Source files stay comment-free; read this first, then edit surgically.

Current build version: v0.6.0
Last updated: 2026-10-21 · app icon; Phase 3b ruler, views, line numbers, cover page, header and footer editing

---

## Org-navi-map

```
frontend/
├── index.html               pre-paint theme, font preloads, style links
├── vite.config.ts           5199 and 5299, host false, proxy to 8199
├── package.json             formtxt 0.1.0
└── src/
    ├── main.ts              boots app.ts
    ├── app.ts               shell mount, first commands, engine status
    ├── version.ts           VERSION, read by ./formtxt help
    ├── engine/model.ts      .ftxt types mirrored from the engine
    ├── engine/registry.ts   the command registry
    ├── automation/catalogue.ts  mirrors the registry to /api/commands
    ├── io/api.ts            fetch helpers and EngineError
    ├── ui/dom.ts            patch helpers (from FormDeck)
    ├── ui/icons.ts          inline currentColor SVG icons
    ├── ui/home.ts           Home: Start, Recent, Templates, Trash, template preview
    ├── editor/schema.ts     ProseMirror schema shaped like WordprocessingML
    ├── editor/convert.ts    .ftxt body to and from the ProseMirror document
    ├── editor/commands.ts   styles, lists, indents, alignment, marks, page break, links
    ├── editor/plugins.ts    input rules, unique ids, find and replace
    ├── editor/editor.ts     DocEditor: toolbar, page, outline, find panel, autosave hooks
    ├── editor/register.ts   editor commands in the registry, toolbar wiring
    ├── editor/dialogs.ts    paragraph settings, style editor, page setup, header and footer, word count
    ├── editor/pages.ts      Paginator: page sheets, spacer decorations, page number formats, line numbers
    ├── editor/ruler.ts      the ruler: margins, indent markers, tab stops
    ├── automation/bridge.ts WebSocket to /api/live so the CLI runs commands in the window
    ├── ui/palette.ts        Find a Command
    ├── ui/shortcuts.ts      custom and global shortcuts, the shortcuts dialog
    ├── ui/dialog.ts         modal dialog in #overlay-root
    ├── ui/toast.ts          toasts and the undo toast in #toast-root
    └── styles/              fonts, tokens (with the z scale), light mode, shell, components, home, reader
```

---

## Table of contents

- [index.html](#index)
- [src/app.ts](#app)
- [src/styles/tokens.css](#tokens)
- [src/ui/home.ts](#home)
- [src/ui/reader.ts](#reader)
- [src/editor/](#editor)
- [App icon and brand glyph](#app-icon)
- [src/ui/palette.ts, shortcuts.ts, automation/bridge.ts](#commands-ui)

---

## App icon and brand glyph {#app-icon}

### app icon · the form family icon (owner's design)
- refers-to: public/favicon.svg; src/ui/icons.ts `brand`; ../src-tauri/icons/ (icon.icns, icon.ico, icon.png, 32x32.png, 128x128.png); ../src-tauri/tauri.conf.json `bundle.icon`
- kind: rationale
- logged: v0.5.1 · 2026-10-21 (designed by the owner on branch feat/app-icon-redesign at e26a2c3, re-made here by hand on main)
- The orange T tile becomes the form family icon: the dark tile with bloom, rim and drop shadow; a dark glass page with its own edge and shadow; a raised pilcrow in one diagonal spectrum gradient (#3A7BFF, #9A5CFF, #FF4F7A, #FFAE2B) with gloss, a soft blurred highlight and a light inset rim; two typed lines sunk into the page and a glowing text caret after the second. favicon.svg is the vector source. The macOS .icns uses the 824 px tile in a 1024 canvas with a 100 px margin; .ico and the PNGs are full bleed, and icon.png is a 1024 px master. icon.icns and icon.ico are new and listed in `bundle.icon` so macOS and Windows bundles use them instead of converting the PNG. The `brand` glyph keeps its filled currentColor tile with the pilcrow knocked out in `--bg-secondary`.

## src/ui/palette.ts, src/ui/shortcuts.ts, src/automation/bridge.ts {#commands-ui}

### palette · only commands without values
- refers-to: src/ui/palette.ts :: render()
- kind: rationale
- logged: v0.4.0 · 2026-10-21
- Find a Command lists commands that run without parameters; value commands (font, size, colour, style) stay on the toolbar and in the CLI, so the palette never runs one with a missing value.

### shortcuts · custom keys first
- refers-to: src/ui/shortcuts.ts :: constructor keydown capture
- kind: rationale
- logged: v0.4.0 · 2026-10-21
- A capture-phase listener runs custom bindings (saved as `keys` in settings) and a few global ones (palette, shortcuts, word count, Format Painter) before ProseMirror sees the key, so a rebinding wins; the editor's built-in keymap still answers everything else.

### bridge · the window runs commands for the CLI
- refers-to: src/automation/bridge.ts :: connectBridge()
- kind: explainer
- logged: v0.4.0 · 2026-10-21
- The window keeps a WebSocket to `/api/live` (reconnecting with backoff up to 10 s) and answers `run` messages with the registry's result, so `./formtxt cli run` and `POST /api/commands/<id>` act on exactly what the person sees.

## src/ui/home.ts {#home}

### home · ported from FormDeck
- refers-to: src/ui/home.ts :: class Home
- kind: explainer
- logged: v0.2.0 · 2026-10-21
- Structure, nav, hero dropzone, card grids, context menu, inline confirm bar, multi-select and the undo toast follow FormDeck 0.23.0's `ui/home.ts`, renamed `ft-` and pointed at documents.

### home · no shift on list changes
- refers-to: src/ui/home.ts :: trashDocs(), restore(), upsert()
- kind: rationale
- logged: v0.2.0 · 2026-10-21
- Delete and Undo update the grid at the click, before the engine answers, so the cards move inside the browser's input window instead of a second later. Opening or creating a document calls `upsert` while Home is hidden, so reopening Home never inserts a card under the pointer. Verified: zero layout-shift entries over the whole throttled run.

### home · recent grid and the empty card
- refers-to: src/ui/home.ts :: renderDocs()
- kind: explainer
- logged: v0.2.0 · 2026-10-21
- The skeleton card holds the first row until the library loads; the empty card lives in its own grid so `patchList` never removes and re-adds it.

### home · first paint
- refers-to: src/app.ts :: startApp() Promise.all before revealApp
- kind: rationale
- logged: v0.2.0 · 2026-10-21
- The app is revealed after the library and templates load (capped at 1.5 s) and fonts are ready, so Home appears complete.

## src/ui/reader.ts {#reader}

### reader · removed in v0.3.0
- refers-to: src/ui/reader.ts (deleted)
- kind: removed-code
- logged: v0.3.0 · 2026-10-21
- The read-only page view (class Reader: one continuous sheet, styles resolved through `basedOn` into inline CSS per block) was replaced by `src/editor/editor.ts`. Its page styling lives on in `styles/reader.css` (`.ft-page` and the template layout rules), which the editor uses.

## src/editor/ {#editor}

### editor · a Word-shaped schema, not Form.md's
- refers-to: src/editor/schema.ts :: nodes, marks
- kind: rationale
- logged: v0.3.0 · 2026-10-21
- Form.md's schema is block-tree and Notion-shaped. FormTxt's mirrors WordprocessingML instead: a heading is a paragraph with a heading style, a list item is a paragraph with list kind and level (Word's numbering), and direct formatting lives in paragraph attributes and marks. That keeps `.docx` mapping 1:1 in Phase 7. The ProseMirror plumbing (history, input rules, keymaps) follows Form.md's usage.

### editor · styles as one stylesheet
- refers-to: src/editor/editor.ts :: styleSheet(), load()
- kind: rationale
- logged: v0.3.0 · 2026-10-21
- Paragraph styles become one `<style id="ft-doc-styles">` keyed on `p[data-style]`, rewritten only when a document loads, so restyling never touches paragraph nodes. Direct formatting rides on the paragraph's inline style and wins.

### editor · fonts before the document shows
- refers-to: src/editor/editor.ts :: loadFonts()
- kind: rationale
- logged: v0.3.0 · 2026-10-21
- Every font a document names is loaded (regular and bold, capped at 1.5 s) before its content is mounted, so text never reflows after it appears.

### editor · lists drawn with CSS counters
- refers-to: src/styles/editor.css :: p[data-list]
- kind: explainer
- logged: v0.3.0 · 2026-10-21
- Numbers count with CSS counters l0 to l8 that reset on any non-numbered block; bullets cycle disc, circle, square by level; a checklist box is the paragraph's ::before and a mousedown inside it toggles `checked`.

### editor · Enter and next style
- refers-to: src/editor/commands.ts :: splitWithNextStyle()
- kind: explainer
- logged: v0.3.0 · 2026-10-21
- Enter at the end of a paragraph gives the new one the style's `next` (a heading is followed by Normal); Enter on an empty list item leaves the list, as Word and Docs do. Duplicate ids from splits are renumbered by the `uniqueIds` plugin outside history.

### editor · autosave
- refers-to: src/app.ts :: flush(), DocEditor hooks.changed
- kind: explainer
- logged: v0.3.0 · 2026-10-21
- Saves 700 ms after the last change with a full PUT of the document, serialised through one promise chain so saves never overlap; leaving for Home, opening another document or closing the window flushes first.

### editor · document tabs
- refers-to: src/editor/editor.ts :: states, selectTab(), addTab(), current()
- kind: rationale
- logged: v0.4.0 · 2026-10-21
- One EditorView, one EditorState per tab kept in a map, swapped with `updateState`, so each tab keeps its own undo history and switching never remounts the page. `current()` serialises every tab that has a state; untouched tabs pass through as loaded.

### editor · collapsible headings
- refers-to: src/editor/plugins.ts :: collapsePlugin; editor.ts mousedown left of a heading
- kind: explainer
- logged: v0.4.0 · 2026-10-21
- `collapsed` is a paragraph attribute (saved, like Docs keeps the default per document); the plugin adds `ft-folded` node decorations from a folded heading to the next heading of the same or a higher level. The caret is the heading's ::after in the left margin, and a mousedown left of the heading box toggles it.

### editor · Format Painter
- refers-to: src/editor/editor.ts :: togglePainter(), applyPainter()
- kind: explainer
- logged: v0.4.0 · 2026-10-21
- One-shot: copies the marks at the cursor and the paragraph's style and direct formatting; the next mouseup in the page applies them (marks only to a non-empty selection), as Word's single click does.

### editor · styles outside undo
- refers-to: src/editor/editor.ts :: setStyles(); src/editor/dialogs.ts :: stylesDialog()
- kind: warning-context
- logged: v0.4.0 · 2026-10-21
- Style edits change `doc.styles` and rewrite the stylesheet; they are saved but not part of ProseMirror's undo history. Revisit when the engine owns operations with attributed turns.

### editor · pagination options stored ahead of layout
- refers-to: src/editor/dialogs.ts :: paragraphDialog()
- kind: todo
- logged: v0.4.0 · 2026-10-21
- keepNext, keepLines, widowControl and tab stop positions are saved and shown in the dialog; they only change rendering once Phase 3 lays out pages. Tab stops today set the paragraph's `tab-size` from the first stop.

### pages · one flow, spacers between pages
- refers-to: src/editor/pages.ts :: Paginator.layout()
- kind: rationale
- logged: v0.5.0 · 2026-10-21
- The document stays one contenteditable flow. After each change, in one animation frame and before paint, the paginator clears its decorations, measures every block and every line in natural flow, then places spacer widgets: a block spacer to move a whole paragraph (or a keep-with-next chain of up to five) to the next page, or an inline block-display spacer at a line start to split a paragraph, honouring widow and orphan control and keep lines together. The page sheets (background, header, footer, watermark) are absolutely positioned behind the flow and patched per page.

### pages · measuring traps found and fixed
- refers-to: src/editor/pages.ts :: layout(); styles/editor.css .ft-pm-root display flow-root
- kind: warning-context
- logged: v0.5.0 · 2026-10-21
- Three traps, each found by a throttled run that checked every line against its page body: the first paragraph's margin collapsed through the editor root and offset every coordinate (fixed with `display: flow-root`); the paged-mode CSS (page breaks lose their margins) was applied after measuring on the first pass (the mode is now set before measuring); and CSS `zoom` changed line wrapping, so zoom is now a transform that never alters layout. Spacer heights get a correction pass against their target page tops, which absorbs margin collapse and line-box rounding.

### pages · margins and scroll anchoring (v0.6.0)
- refers-to: src/editor/pages.ts :: layout() force and block breaks, lineStart(); styles/editor.css .ft-scroll overflow-anchor
- kind: warning-context
- logged: v0.6.0 · 2026-10-21
- Two more traps, both found by the per-line check. A moved block's own top margin (a cover title has 220 pt before it) sits between the spacer and the block, so the running offset is now set from where the block actually lands (next page top plus its top margin), and a page-top test subtracts that margin so a tall block can never loop. And CSS scroll anchoring moved the scroll position while spacer heights were being corrected, which shifted every later measurement whenever the view was scrolled; the scroll area turns anchoring off and each correction re-reads the root's position. Line starts are found from text ranges, not screen coordinates, so splits work for paragraphs scrolled out of view.

### ruler and views
- refers-to: src/editor/ruler.ts; src/editor/editor.ts :: setView(), insertCover()
- kind: explainer
- logged: v0.6.0 · 2026-10-21
- The ruler is sticky above the pages and patched from the selection (ticks rebuilt only when page width, margins or zoom change); dragging a marker sets the paragraph's indent, first-line indent or right indent on release, snapped to 4.5 pt. Views are not saved: Draft lays out like pageless with no sheets, Read mode turns editing off, Focus hides the chrome; Esc returns to Print layout. Line numbers are measured after pagination and drawn on the sheets, so they never affect the flow.

### tabs · widths set before pagination
- refers-to: src/editor/tabs.ts :: layoutTabs(); src/editor/pages.ts :: beforeMeasure
- kind: rationale
- logged: v0.7.0 · 2026-10-21
- A tab is an atom span whose width is set from the paragraph's stops. Widths change line wrapping, so the paginator calls `layoutTabs` after clearing its spacers and before measuring; every tab is reset to zero first and measured left to right from the page margin. Right, centre and decimal stops measure the text up to the next tab (decimal up to the first `.`). Past the last custom stop it falls back to the default stop every 36 pt, as Word does.

### sections · one geometry, many sections
- refers-to: src/editor/pages.ts :: sectionStarts, paint() plan; src/editor/editor.ts :: insertSectionBreak(), updateSectionById()
- kind: warning-context
- logged: v0.7.0 · 2026-10-21
- A section break forces a new page and records which page its section starts on; painting then picks each sheet's section, its first, even or default header and footer, and its page number (restarting where `pageNumberStart` is set, continuing otherwise). Page size, orientation, margins and columns still come from the first section, because the whole tab is one flow with one width. Mixed orientation and columns need blocks positioned per page, which is a later phase. Deleting a break leaves its section entry in `sections`; it is harmless and dropped by nothing yet.

### header and footer · typed on the page
- refers-to: src/editor/register.ts :: dblclick handler
- kind: explainer
- logged: v0.7.0 · 2026-10-21
- Double-click turns the sheet's header or footer `contenteditable="plaintext-only"`; Enter or leaving it saves through `updateSectionById` for that sheet's section and which part (first, even or default), Esc puts the text back. Painting skips a header that is being edited so a relayout never overwrites typing.

### tables · prosemirror-tables with a Word-shaped file
- refers-to: src/editor/schema.ts :: table nodes; src/editor/table.ts; src/editor/convert.ts :: tableToPM(), tableFromPM()
- kind: rationale
- logged: v0.8.0 · 2026-10-21
- Cell selection, merging, splitting, column resizing and keeping rows rectangular come from prosemirror-tables (MIT), the same model Word uses (spans, a column grid). The editor keeps widths per cell in pixels (`colwidth`); the file keeps one `columns` list in points, rebuilt from the table map on save. Table nodes are declared after `paragraph` in the schema because ProseMirror fills `block+` with the first block type, and a new document must start with a paragraph. `FtTableView` extends the library's view only to mirror look, repeat and alignment onto the `<table>` element by attribute, so a change never rebuilds the table.

### tables · rows split across pages
- refers-to: src/editor/pages.ts :: layout() table branch, rowSpacer(), repeatRow()
- kind: warning-context
- logged: v0.8.0 · 2026-10-21
- A table that crosses the page bottom gets a spacer `<tr>` widget before the first row that does not fit, then a clone of each header row (when `repeatHeader` is on and those rows are all `<th>`). Both are widgets inside the table body, so the rows around them are never re-rendered; the clones are `contenteditable=false`, `aria-hidden` and keyed by a hash of their HTML so an edited header refreshes them. The header and first body row stay together: if they cannot fit, the whole table moves. A row taller than a page is not split, matching Word with "allow row to break across pages" off. Borders belong to cells, not the `<table>`, so the spacer row draws no side lines across the page gap.

### tables · toolbar kept short
- refers-to: src/editor/editor.ts :: toolbar; src/editor/register.ts :: table context menu
- kind: rationale
- logged: v0.8.0 · 2026-10-21
- Only Insert table and Table properties sit on the toolbar (properties is disabled outside a table, by attribute, so the toolbar never changes width). Row, column, merge and header actions live in a right-click menu on cells, rendered in `#overlay-root`, and every action is also a `table.*` command for the palette and CLI.

### pages · cost
- refers-to: src/editor/pages.ts :: layout()
- kind: todo
- logged: v0.5.0 · 2026-10-21
- Every layout measures the whole tab, so very long documents cost a forced layout per change (26 pages stays smooth under 4x CPU throttling). Starting from the first changed page moves to a later phase.

### toolbar · focus
- refers-to: src/editor/register.ts :: registerEditorCommands() mousedown
- kind: rationale
- logged: v0.3.0 · 2026-10-21
- Toolbar buttons cancel mousedown so the selection never leaves the page; selects and colour inputs run their command on change with the chosen value.

## index.html {#index}

### index · theme before first paint
- refers-to: index.html :: inline script in head
- kind: rationale
- logged: v0.1.0 · 2026-10-21
- `data-theme` is set on `html` from `localStorage['formtxt.theme']` before any stylesheet applies, and light-mode tokens hang off `:root[data-theme="light"]`, so a reload in light never paints dark first. `#app` stays hidden until `revealApp`.

### index · font preloads
- refers-to: index.html :: link rel=preload
- kind: warning-context
- logged: v0.1.0 · 2026-10-21
- The preload hrefs point into `node_modules`, which the dev server serves; in a production build they 404 harmlessly (FormDeck has the same pattern). Revisit when `./formtxt serve` lands.

## src/app.ts {#app}

### app · mount once, patch after
- refers-to: src/app.ts :: startApp()
- kind: rationale
- logged: v0.1.0 · 2026-10-21
- The shell is mounted once into an empty `#app`; afterwards only the document name, engine text, status dot and theme button icon are patched. Their slots are reserved in CSS (fixed docname height, 220px engine min-width, tabular numerals), so nothing around them moves.

### app · engine status
- refers-to: src/app.ts :: startApp() delayedIndicator
- kind: explainer
- logged: v0.1.0 · 2026-10-21
- "Connecting to the engine" appears only if the health check takes over 300 ms, so a fast engine never flashes it.

### app · reveal after fonts
- refers-to: src/app.ts :: fontsReady()
- kind: rationale
- logged: v0.1.0 · 2026-10-21
- The app is revealed after `document.fonts.ready` (capped at 1.5 s) so Inter never swaps in after first paint.

## src/styles/tokens.css {#tokens}

### tokens · stacking scale
- refers-to: src/styles/tokens.css :: --z-*
- kind: rationale
- logged: v0.1.0 · 2026-10-21
- The one declared scale, a subset of FormDeck's: base, raised, chrome, menu, modal, context, toast, home, home-modal, overlay. Anything that must escape its container renders into `#overlay-root`, a direct child of `body`.
