# HASHOUT_LOG · frontend · formtxt

Living log of comment content, rationale and removed code for the frontend. Source files stay comment-free; read this first, then edit surgically.

Current build version: v0.4.0
Last updated: 2026-10-21 · Phase 2b tabs, styles, paragraph settings, palette, shortcuts, bridge

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
    ├── editor/dialogs.ts    paragraph settings, style editor, word count
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
- [src/ui/palette.ts, shortcuts.ts, automation/bridge.ts](#commands-ui)

---

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
