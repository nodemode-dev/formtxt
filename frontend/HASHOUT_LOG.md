# HASHOUT_LOG · frontend · formtxt

Living log of comment content, rationale and removed code for the frontend. Source files stay comment-free; read this first, then edit surgically.

Current build version: v0.30.4
Last updated: 2026-10-31 · no frontend change in 0.30.4 (Windows MIME types and Linux media packages, see backend log). Before: no frontend change in 0.30.3

- v0.30.2 (ledger FB-161): `public/splash.html` centred its logo, line and bar as three flex items of the body, so a paint that landed after the logo but before the rest centred the logo alone and moved it when the line and bar arrived (layout shift 1.05e-4 when the page is sent in two parts 1 s apart, found by the F7 window smoke on `/splash.html`; about 1 load in 6 to 10 on a real load). The three now sit in `.stack`, fixed at 180 by 127 px, with the line at a fixed 16 px height, so the logo's place no longer depends on later siblings. Checked: the two-part server gives shift 0 after the change.
- v0.29.5: `src/styles/doc-fonts.css` imports `./full-fonts.css` where the twelve Fontsource imports of Playfair Display, Lora and Merriweather were. That sheet declares a normal and an italic face per family over the file's weight range (Playfair 400 to 900, Lora 400 to 700, Merriweather 300 to 900), pointing at the unmodified upstream variable TTFs in `public/fonts/full` (google/fonts e7db6ca, each folder with OFL.txt). The three `@fontsource` packages are uninstalled. Reason: those families declare a Reserved Font Name, and a subset may not keep it. Checked: tsc clean, vite build copies the three folders to `dist/fonts/full` and the built CSS points at them.

---

## Org-navi-map

```
frontend/
├── index.html               pre-paint theme, font preloads, style links
├── vite.config.ts           5210 and 5310, host false, proxy to 8210
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
- [Vendor feature names out of the UI](#vendor-names)
- [Equation gallery: Common equations](#equation-gallery)

---

## Equation gallery: Common equations {#equation-gallery}

- refers-to: src/ui/shell/controls-b/slots-eq.ts :: EQUATIONS, q.equation popHead; src/ui/shell/controls/panels-insert.ts :: EQUATIONS, the equation panel's heading
- kind: rationale
- logged: v0.29.3 · 2026-10-23

The owner's copyright plan (C6, approved 2026-10-23). Both galleries had Word's built-in equation list, with Word's names, order and "Built-In" heading. They now share one FormTxt set of twelve in its own order and sentence-case names under "Common equations": Pythagorean theorem, Quadratic formula, Area of a circle, Binomial theorem, Binomial series, Euler's identity, Exponential series, Pythagorean identity, Fourier series, Mass-energy equivalence, Compound interest, Normal distribution. Word's sum-to-product "Trig Identity" is dropped; Euler's identity, compound interest and the normal distribution are added to the ribbon panel. Bug fixed on the way: panels-insert.ts had the binomial formulas swapped (the series under "Binomial Theorem" and the summation under "Expansion of a Sum"); both lists now put the summation under Binomial theorem and the series under Binomial series. The formulas are standard mathematics written here; keep the names and set FormTxt's own.

---

## Vendor feature names out of the UI {#vendor-names}

- refers-to: src/editor/register.ts :: insert.wordArt, shape.properties, shape.wordArt, insert.diagram; src/editor/shape.ts :: SHAPE_LABELS.wordArt; src/editor/dialogs.ts :: shape notes, shapePropertiesDialog; src/editor/editor.ts :: Insert toolbar titles; src/app.ts :: file.open description; src/ui/shell/word-menus.ts :: Insert menu; src/ui/shell/word-tabs.ts :: Insert tab, Shape Format, IntelligentArt Design; src/ui/shell/controls/panels-insert.ts :: diagram and Text Art panels; src/ui/shell/controls-b/slots-shape.ts, slots-chart.ts :: style galleries
- kind: rationale
- logged: v0.29.3 · 2026-10-23

The owner's trademark plan (rename table approved 2026-10-23) takes Microsoft's feature names out of FormTxt's own labels: WordArt is Text Art, SmartArt is IntelligentArt, Backstage is the View Stager. Only visible labels and descriptions changed. Command ids (`insert.wordArt`, `shape.wordArt`, `insert.diagram`), slot ids (`s.wordart`, `d.styles`), ribbon ids (`wordart`, `smartart`, `smartart-design`), the `wordArt` shape kind, the `WORDART` and `SMARTART` lists and the `Backstage` class keep their names, so saved documents, shortcuts, QAT entries and agent scripts still work. Do not bring the vendor names back into labels; they may appear only where FormTxt says a .docx object is read or written.

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

### pictures · one inline node, six wraps
- refers-to: src/editor/schema.ts :: image; src/editor/picture.ts :: PictureView; styles/editor.css .ft-pic
- kind: rationale
- logged: v0.9.0 · 2026-10-21
- Every picture is an inline atom anchored where it sits in the text, like Word's anchor. Wrapping is CSS on the same node: inline-block for inline, float for square and tight (tight adds `shape-outside` from the picture's alpha), a shrink-wrapped block for top and bottom, and absolute positioning from the paragraph (paragraphs are `position: relative`) for behind and in front. `.ft-pm-root` is `isolation: isolate`, so `--z-behind` puts a picture under the text but still above the page sheet; a selected behind-text picture is raised so it can be dragged. Floats and inline pictures take part in line measuring, so the paginator never splits a page through one.

### pictures · edits without re-rendering
- refers-to: src/editor/picture.ts :: down(), move(), commit()
- kind: rationale
- logged: v0.9.0 · 2026-10-21
- Resize handles and moving a free picture change only inline styles while the pointer is down, then commit one `setNodeMarkup` on release; `update()` patches styles in place, so the image element is never replaced and never reloads. Pointer distances are divided by the ratio of the picture box's on-screen width to its layout width, which covers zoom; the ratio comes from the outer box because a rotated frame's bounding box is wider than its layout box (a throttled run caught a rotated picture moving 18 percent short). Crop shows the picture inside a clipped frame sized to the cropped area. Corner handles keep proportions unless Shift is held.

### pictures · media
- refers-to: src/editor/editor.ts :: insertPictures(); src/editor/schema.ts :: mediaUrl()
- kind: warning-context
- logged: v0.9.0 · 2026-10-21
- Files go to `POST /api/documents/{id}/media` first and come back named by content hash; the editor reads the natural size, records metadata in `doc.media` and inserts the picture fitted to the page body. Paste and drop of image files use the same path. Pictures copied between two documents are copied across on paste (see "pictures · pasting between documents", v0.10.0). Media is never pruned when a picture is deleted, so Undo always works; compacting the package is later work.

### charts · Form.md's renderer, FormTxt's data
- refers-to: src/editor/chart/chartdraw.ts, chartkinds.ts (ported), chart/chart.ts :: toResult(), ChartView
- kind: rationale
- logged: v0.10.0 · 2026-10-21
- The two drawing files are Form.md's, kept as close to the original as possible (double quotes and all) so fixes can travel between the repos. They draw into an SVG by keyed element reuse, so a chart edit patches marks in place rather than rebuilding the SVG. Form.md feeds them query results; FormTxt keeps a chart's own table (`categories` by `series`) in the node and `toResult` turns it into the same shape: the first series' aggregate is the big number, `dots` treats each series as a group of points, and `calendar` keys categories by date. Notes carried over from the original comments: `fitText` tries the full value then the compact one at the largest size that fits; axis day labels drop the current year; legends wrap onto more rows and shrink to 10 then 9 px instead of dropping items, never clipping an item's value tail; the doughnut and gauge totals are sized to the hole's chord at the text's cap height; data labels fall back from full to compact values, then drop the smaller of each colliding pair, and stay inside the chart box.

### charts · locale
- refers-to: src/editor/chart/types.ts :: locale()
- kind: warning-context
- logged: v0.10.0 · 2026-10-21
- `navigator.language` can be a POSIX-style tag such as `en-US@posix` (the headless test browser reports exactly that), which `Intl.NumberFormat` rejects; inserting a chart then threw. The locale is canonicalised once, with `en-US` as the fallback.

### charts · colours on paper
- refers-to: styles/editor.css figure.ft-chart
- kind: rationale
- logged: v0.10.0 · 2026-10-21
- Chart colours are fixed light-theme values scoped to `figure.ft-chart`, not app tokens, because the page is paper in both themes and an exported chart must look the same as the page. The first series takes the document's template accent.

### pictures · pasting between documents
- refers-to: src/editor/schema.ts :: image parseDOM, from; src/editor/editor.ts :: adoptForeignMedia()
- kind: explainer
- logged: v0.10.0 · 2026-10-21
- Copied pictures carry their source document in the image URL, which parsing turns into a transient `from` attribute (never saved). While `from` is set the picture shows from the source document; after a paste or drop the editor fetches the file, uploads it here (the content-hash name stays the same), records its metadata and clears `from` outside undo history. Crop, rotation and adjustments travel in `data-pic`.

### shapes · one node for shapes, text boxes and WordArt
- refers-to: src/editor/shape.ts :: shapePath(), ShapeView; styles/editor.css .ft-shape
- kind: rationale
- logged: v0.11.0 · 2026-10-21
- Shapes reuse the picture model: an inline atom anchored in its paragraph, the same wrap modes (minus tight) and the same handle, drag and commit-on-release maths, with the ratio taken from the outer box so zoom and rotation do not skew distances. Outlines are SVG paths generated for the current size (the stroke is inset by half its width so it never clips); text is an HTML layer on top so it wraps and takes document fonts. Text is plain, typed in place after a double-click (`plaintext-only`, Ctrl+Enter or leaving saves, Esc cancels); rich paragraphs inside text boxes would need nested editors and are later work. WordArt is the same node with no outline and a style class; its colours come from CSS variables, so the inline text colour is not set for WordArt (a throttled run caught the fill style rendering black when it was).

### equations · KaTeX
- refers-to: src/editor/math.ts :: MathView, loadMathFonts(); styles/doc-fonts.css
- kind: rationale
- logged: v0.11.0 · 2026-10-21
- Equations store LaTeX and render with KaTeX (`throwOnError: false`, so bad input shows its source in red instead of throwing). The view re-renders only when the source or display flag changes. KaTeX's fonts load before a document containing equations is shown, and the equation dialog loads them while the preview is open, so an inserted equation never reflows when its font arrives. Inserting while an equation, shape or picture is selected replaces it, as in Word; the dialog edits the selected equation in place.

### shapes · icons and ink are paths, not new node types
- refers-to: src/editor/shape.ts :: ShapeView.apply(); src/editor/icons-dialog.ts; src/editor/ink.ts :: InkTool
- kind: rationale
- logged: v0.12.0 · 2026-10-21
- Icons and ink strokes are shape runs with a stored `path`, so they get wrapping, handles, rotation, dragging and the properties dialog for free. Icons keep Tabler's 24 by 24 box with `preserveAspectRatio` meet and its stroke of 2 box units, so the line weight scales with the icon as in the library; ink keeps the drawn box stretched (`none`) with `vector-effect: non-scaling-stroke`, so a resized stroke keeps its pen width. The icon library (1.6 MB) is fetched only when the picker or `insert.icon` first needs it, and the picker draws at most 240 matches.
- Ink: Draw mode lays a transparent layer over the pages (stacked at `--z-chrome` inside `.ft-pages`), draws the live stroke in that layer, and on release anchors a shape to the paragraph under the stroke's top left with `x` and `y` measured from that paragraph, so the stroke lands where it was drawn (a throttled run matched to the pixel). Points closer than 1.5 screen pixels are skipped.

### pictures and shapes · rotation handle and effects
- refers-to: src/editor/picture.ts, src/editor/shape.ts :: angleOf()
- kind: explainer
- logged: v0.12.0 · 2026-10-21
- The round handle above a selected picture or shape rotates it by the angle swept around the box centre from where the drag started, added to the current rotation (so grabbing a rotated object never makes it jump); Shift snaps to 15 degrees. Picture borders are an inset box shadow on a `::after` layer so they sit over the image without changing its size; rounded corners clip through the frame's `overflow: hidden`. Shape gradients are a per-view `linearGradient` with a random id.

### diagrams · FormDeck's layouts, FormTxt's renderer
- refers-to: src/editor/diagram.ts :: generate(), renderDiagram(), DiagramView
- kind: rationale
- logged: v0.13.0 · 2026-10-21
- The 12 layout functions are FormDeck's, kept line for line where possible. FormDeck emits slide shapes with theme colour references; here each layout emits plain boxes (geometry, frame, hex colours, text lines), drawn as SVG paths with a positioned HTML text layer so text wraps and fits like FormDeck's shrink-on-overflow (the same size search). Colours: colourful cycles the document accent and five fixed hues; the shade schemes darken then lighten one hue across the items, as FormDeck's lumMod and lumOff do. Items are a plain tree with no ids; text is edited as indented lines. The view redraws only when layout, items, style, colours, size or the accent change.

### pictures · cropping on the picture
- refers-to: src/editor/picture.ts :: cropMode(), cropDown(), paintCrop()
- kind: explainer
- logged: v0.14.0 · 2026-10-21
- Crop mode keeps the image element where it is (it already sits at the uncropped size, offset by the crop) and lets the frame overflow, then lays a box over the whole image with a window for the kept area; the window's huge white box shadow, clipped by the box, dims what will be cut. Handles move the window's edges (at least 5 percent stays, at most 90 percent is removed per axis), dragging inside moves the window, and pointer distances are turned into the picture's own axes so rotated pictures crop along their edges. Nothing is written to the document until the mode ends: Enter, clicking elsewhere or deselecting applies one `setNodeMarkup` with the new crop and a size that keeps the image's scale; Esc discards. While cropping the view ignores attribute updates and PM ignores its pointer events.

### pictures and shapes · fixed to the page
- refers-to: src/editor/editor.ts :: placePageAnchored(); picture.ts and shape.ts apply()
- kind: rationale
- logged: v0.14.0 · 2026-10-21
- An object stays a run in its paragraph, so it moves between pages with the text that anchors it; with `relative: page` its offset is measured from that page instead. After every layout the editor finds each page-anchored object's paragraph, which page it is on, and writes the paragraph-to-page offset into `data-ox` and `data-oy`; the views add those offsets to `x` and `y`, and a drag subtracts them before saving. The objects are absolutely positioned, so placing them never changes the flow and cannot loop the paginator.

### shapes · formatted text in a nested editor
- refers-to: src/editor/shape.ts :: edit(), finish(), renderText(), shapeEditing; src/editor/editor.ts :: run()
- kind: rationale
- logged: v0.15.0 · 2026-10-21
- A shape stays an inline atom, so its text cannot be ordinary document content. Double-clicking mounts a second ProseMirror view with the same schema inside the shape (history, Ctrl+B, I and U, base keys); finishing turns its doc into paragraph blocks with `fromPM` and stores them in `content`, plus the plain text in `text`. Text with no formatting is stored as plain `text` only, so simple boxes stay simple. While a box is open, `DocEditor.run` sends commands to the nested view first, so the toolbar and palette format inside the box; focus moving to the toolbar (a select takes focus) does not close the box, anything else does. Outside editing the box shows a static DOMSerializer copy, rebuilt only when `content` changes. Normal-style paragraphs inside boxes inherit the shape's font, size, colour and alignment; other styles keep their own.

### shapes · connectors follow layout
- refers-to: src/editor/shape.ts :: placeConnectors(), edgePoint(), ShapeView.placeConnector()
- kind: warning-context
- logged: v0.15.0 · 2026-10-21
- A connector is a shape run that names two shape ids; it is placed after every layout (and live while a connected shape is dragged or resized) from the two shapes' frames, between the facing edge midpoints, relative to the connector's own paragraph. A connector whose shape is missing is hidden; a hidden element has no `offsetParent`, so the placer falls back to the connector's paragraph, otherwise an Undo that restores the shape left the connector hidden for good (caught by a throttled delete-and-undo run). Shapes get ids when inserted, and older shapes get one the first time they are connected.

### pages · atom blocks at a page break
- refers-to: src/editor/pages.ts :: layout() posOf()
- kind: warning-context
- logged: v0.13.0 · 2026-10-21
- `posAtDOM(element, 0)` returns the position inside a node with content but the position before an atom block such as a chart or diagram, so `- 1` put the page break before the previous block: a chart or diagram that did not fit pushed the block above it to the next page as well (present since charts arrived in 0.10.0, seen in a diagram screenshot). `posOf` now checks `nodeDOM` and only steps back for nodes with content.

### app · word count on open
- refers-to: src/app.ts :: openDocument()
- kind: warning-context
- logged: v0.11.0 · 2026-10-21
- The recent-card word count read `r.text` on every run, so any document with a tab, picture, shape or equation run raised "Cannot read properties of undefined (reading 'split')" in a toast on open (since 0.7.0; the document still opened). Only text runs are counted now.

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

### fields · recalculation
- refers-to: src/editor/fields.ts :: updateFields(); src/editor/editor.ts :: scheduleFields()
- kind: rationale
- logged: v0.16.0 · 2026-10-21
- Formula fields are plain inline atoms rendered by `toDOM`; only their `result` attr changes, so a recalculation swaps one text node and nothing reflows beyond the cell. Any document change (other than the paginator's and the fields' own) schedules a 400 ms debounced pass; opening a document runs one at once, and F9 or `fields.update` forces one. A pass sends every formula with its table grid in one request and repeats up to three times so a formula that reads another formula's cell settles. Result updates skip the undo history, and a pass whose document changed under it is dropped and left to the next one.

### fields · grid text
- refers-to: src/editor/fields.ts :: gridOf()
- kind: explainer
- logged: v0.16.0 · 2026-10-21
- The grid is built from `TableMap`, so merged cells report their text at their top-left slot and blanks elsewhere, and a cell that holds a field contributes the field's last result, which is what lets `=SUM(ABOVE)` see a subtotal formula above it.

### fields · dialog preview
- refers-to: src/editor/dialogs.ts :: formulaDialog()
- kind: explainer
- logged: v0.16.0 · 2026-10-21
- The preview places a probe field at the selection in a throwaway transaction to learn its table cell, then asks the engine for the result, so the dialog shows exactly what Insert will produce, including syntax errors and their message.

### tables · cell borders
- refers-to: src/editor/table.ts :: setCellBorders(); src/editor/schema.ts :: bordersAttr
- kind: rationale
- logged: v0.17.0 · 2026-10-21
- Borders live per cell and per side and are written as inline `border-*` styles, which beat the table look's class rules, so a look still draws every edge nobody set. Outside and inside are measured from the selected rectangle, not each cell, as Word does. Tables use collapsed borders, so `none` is drawn as `hidden`, which also removes the neighbour's shared line; a removed edge then stays gone whichever cell set it. Double lines need at least 3 px to show both strokes, so narrower double borders are drawn at 3 px.

### lists · number formats
- refers-to: src/editor/schema.ts :: paraAttrs() listFmt; src/styles/editor.css :: data-fmt rules
- kind: rationale
- logged: v0.17.0 · 2026-10-21
- CSS `counter()` cannot take its style from a variable, so each level has one rule per number style keyed on `data-fmt` (54 rules), while the text before and after the number travels as `--ft-num-pre` and `--ft-num-suf` custom properties set inline on the paragraph, which `::before` content can read. A restart is an inline `counter-reset` on the item itself (start minus one, since the item's own increment runs after it) that also resets the deeper levels. Enter copies the format to the new item but drops `start`, so only the item that was restarted restarts. Long markers widen the marker box through `--ft-num-w` instead of wrapping.

### styles · style sets
- refers-to: src/editor/stylesets.ts :: applyStyleSet(); src/editor/editor.ts :: applyStyleSet()
- kind: rationale
- logged: v0.17.0 · 2026-10-21
- A style set patches font, size, colour and spacing on Normal, Title, Subtitle, Quote and Heading1 to Heading9 and leaves every other key (keep with next, outline level, indents) alone. The set's fonts are loaded before the style sheet is swapped, so the page restyles once in its final fonts rather than reflowing again when a web font arrives; the gallery waits for all nine sets' fonts before it opens for the same reason. Like other style edits, applying a set is not in the undo history; Standard restores the defaults.

### chips · the @ menu
- refers-to: src/editor/chips.ts :: chipPlugin, ChipMenu
- kind: rationale
- logged: v0.18.0 · 2026-10-21
- Typing @ at the start of a paragraph or after a space or bracket opens the menu; after a letter it does not, so email addresses typed as text stay text. The plugin state is only `{active, from, query}`, mapped through every transaction and dropped when the cursor leaves the paragraph, the query grows past 40 characters or holds two spaces, or the @ is deleted. The menu is created once in `#overlay-root` and patched by key on every keystroke, so filtering never rebuilds it. The plugin sits ahead of the keymaps in the plugin list so Enter, Tab and the arrows reach the menu before they split paragraphs or indent.

### chips · data loading
- refers-to: src/editor/chips.ts :: loadDocs(), loadAuthor(), peopleIn()
- kind: explainer
- logged: v0.18.0 · 2026-10-21
- The document list (cached 30 s) and the author name load when @ is typed; the menu first shows dates, people and dropdowns and the documents group appears when the list arrives. People come from person chips already in the document plus the author preference; there is no contacts directory.

### chips · class name
- refers-to: src/editor/schema.ts :: chip toDOM
- kind: gotcha
- logged: v0.18.0 · 2026-10-21
- The in-document chip is `.ft-smart-chip`, not `.ft-chip`: Home's filter chips already own `.ft-chip` in `components.css`, and sharing it gave every smart chip Home's border.

### chips · click actions
- refers-to: src/editor/chips.ts :: chipActions(), openChipActions()
- kind: explainer
- logged: v0.18.0 · 2026-10-21
- Clicking a chip selects it and opens the same menu in actions mode at the chip: options for a dropdown, Today, Change date or Turn into text for a date, Email and Copy email for a person, Open document for a document chip. Edits replace the chip's attrs in one transaction, so Undo restores the previous value.

### fields · class name
- refers-to: src/editor/schema.ts :: field toDOM
- kind: gotcha
- logged: v0.19.0 · 2026-10-21
- The in-document field is `.ft-docfield`. From 0.16.0 to 0.18.0 it was `.ft-field`, which the dialogs' form rows own in `components.css` (`display: grid` and a top margin), so formula results drew as blocks; variables made it obvious. Like `.ft-smart-chip`, document node classes avoid names the chrome already uses.

### fields · variables
- refers-to: src/editor/fields.ts :: syncVariables(), insertVariable(); src/editor/editor.ts :: setVariables()
- kind: rationale
- logged: v0.19.0 · 2026-10-21
- Variables live on the document (`variables`) and are shown by `field` runs of kind `variable`; the value is copied into the run's `result` so other readers show it. Changing a value rewrites the affected fields in one transaction outside the undo history, like formula results; inserting a variable writes its value straight into the new field so it never appears empty first. A field naming a missing variable shows `!name` in the error colour.

### chips · placeholders
- refers-to: src/editor/chips.ts :: fillPlaceholders(), placeholderNames()
- kind: explainer
- logged: v0.19.0 · 2026-10-21
- A placeholder is a chip kind whose only data is a name. Typing @ and any text offers "Placeholder: text"; names already in the document are listed first. Filling replaces each matching chip with plain text carrying the marks at its position, in one undoable transaction, last match first so positions stay valid.

### blocks · building blocks
- refers-to: src/editor/blocks.ts :: builtInBlocks(), insertBlock(), selectionBlocks()
- kind: rationale
- logged: v0.19.0 · 2026-10-21
- Built-in blocks are written as `.ftxt` block JSON and go through the same `blocksToNodes` as an opened document, so they use chips, placeholders, lists and tables exactly as saved files do; table columns are sized from the current body width when inserted. Saved blocks are the selection's blocks with ids and sections stripped (so inserting one twice cannot duplicate ids) and pictures removed by the engine, since media belongs to one document's package. Inserting into an empty paragraph replaces it rather than leaving a blank line above. Built-in blocks also appear in the @ menu, as in Google Docs.

### pages · rows breaking across pages
- refers-to: src/editor/pages.ts :: splitRow(), maskSplitTables()
- kind: rationale
- logged: v0.20.0 · 2026-10-21
- A row that crosses the page bottom is split when at least one line of one cell fits on the current page; otherwise the row moves whole, as before. Each cell is cut independently: its paragraphs' lines (and any other blocks as whole units) are walked, and the first unit that crosses the body bottom gets the same spacer widget paragraphs use (inline between lines, a block before a paragraph or other block), sized to land on the next page body top plus 6 px of cell padding; the existing spacer correction pass then trims it to the pixel. The row grows by the largest cell's push, and later rows follow on from there. Header rows never split. The cells still draw borders and shading through the bottom margin, gap and next top margin, so a split table gets a CSS mask whose transparent bands cover body bottom to next body top on every page it crosses; the mask is cleared in pageless view and when the table no longer splits. Repeated header rows are not inserted inside a split row (Word does repeat them), and the split edges have no closing border line.

### tables · styles
- refers-to: src/editor/table.ts :: captureTableStyle(), applyTableStyle(); src/editor/dialogs.ts :: saveTableStyle()
- kind: rationale
- logged: v0.20.0 · 2026-10-21
- A table style is a snapshot of four cell roles (header row, first column, body, banded body row) read from the table at the cursor, each kept only when it differs from body, plus the table's look, alignment and repeat-header flag. It lives in the document's `styles` with `type: table`, and styled tables carry its id in `tstyle`, so saving the same name again re-applies it to every table in the open tab that uses it. Like other style edits the definition is outside the undo history, while the cell changes are undoable.

### tables · pinned header in pageless view
- refers-to: src/styles/editor.css :: pageless sticky th
- kind: gotcha
- logged: v0.20.0 · 2026-10-21
- The sticky header cells only stick once the table's `.tableWrapper` stops being a scroll container: its `overflow-x: auto` made it the sticky ancestor, so the header never moved. In pageless view a wrapper holding a repeating-header table gets `overflow: visible` (selected with `:has`), and plain and rows-only looks get the page colour behind the pinned cells so text does not show through.

### mermaid · stored drawing
- refers-to: src/editor/mermaid.ts :: MermaidView, renderMermaid(), sanitizeSvg()
- kind: rationale
- logged: v0.21.0 · 2026-10-21
- The Mermaid library (several MB with d3 and its layout engines) loads only when a diagram is drawn or edited; each block stores its sanitised SVG and natural size, so opening a document shows every diagram at its final size with no library download and no layout shift (checked under 50 kB/s: the module was never fetched). Renders run one at a time through a queue because Mermaid measures text in a shared off-screen node. HTML labels are off (top level and per diagram type) so labels are SVG text: the sanitiser strips foreignObject, scripts, event attributes and outside links, which also makes a stored SVG from someone else's file safe to inline. Inline SVG (not an img) keeps the document's fonts, so text measured by Mermaid fits. Inserting while a block is selected goes after it (`placeBlock`) instead of replacing it.

### mermaid · KaTeX override
- refers-to: package.json :: overrides
- kind: gotcha
- logged: v0.21.0 · 2026-10-21
- Mermaid 12.1.0 bundles KaTeX older than 0.18.2 (a low advisory about prototype pollution bypassing trust); `overrides` pins Mermaid's KaTeX to the 0.19.0 the editor already ships, which clears `npm audit` without taking Mermaid 12.2.0 (eight days old at the time). Mermaid is also in `optimizeDeps.include` so the dev server never re-optimises and reloads the page the first time a diagram is drawn.

### emoji · picker
- refers-to: src/editor/emoji.ts :: emojiDialog(), searchEmoji()
- kind: explainer
- logged: v0.21.0 · 2026-10-21
- Emoji data comes from emojibase-data's compact English set, loaded on first use (about 0.6 MB), so no emoji characters live in FormTxt's own source. Search scores whole-label matches first, then label words, then tags. Skin tone and recently used live in localStorage behind try/catch; a tone only applies to emoji that have all five variants. Under 50 kB/s the first load can outlast the CLI bridge's 60 s wait (the emoji still lands).

### stock · picker
- refers-to: src/editor/stock.ts :: stockDialog(); src/editor/editor.ts :: insertStockPicture()
- kind: rationale
- logged: v0.21.0 · 2026-10-21
- Every request goes to the engine: thumbnails load from `/api/stock/thumb/...`, so the window itself only ever talks to localhost and no third party sees the user's browser. A picked picture is downloaded by the engine into the document's media with its credit, then inserted like an uploaded one; the credit line is a small grey italic paragraph after the picture's paragraph. The key row takes the search row's place on the Pexels tab until a key works, and a refused key brings it back, so the dialog height never changes; More results keeps its space with visibility instead of display.

### shapes · linked text boxes
- refers-to: src/editor/shape.ts :: flowTextBoxes(), overflowUnit(), clipAt(); ShapeView.showFlow()
- kind: rationale
- logged: v0.22.0 · 2026-10-21
- The story lives once, in the chain's first box, so editing, undo and saving stay one node's attrs. After every layout the flow pass walks each chain: the first box shows the whole story; the first character (or atom, or line break) whose bottom passes the box's padding edge is found by binary search over the rendered text, and the next box shows the story cut at that character's position, at its own width, and so on. Characters and inline atoms are counted the same way in the DOM and in the document (text characters one each, chips, fields, tabs and breaks one each), which is what lets a DOM index become a cut position. Each box is clipped with clip-path at the top of the first line that went on, so no half line shows twice. A box only re-renders when its slice changes, so layouts that move nothing repaint nothing. Double-clicking any box edits the first box (deferred one tick so the double-click's own focus handling cannot pull focus back to the page) with its clip lifted and a dashed outline; Ctrl+Home and Ctrl+End stay inside the box editor, because Chrome otherwise moves the caret to the end of the outer page and typing replaces the selected box. Linking requires an empty target and refuses cycles and a box that already continues another. Rotated boxes are measured unrotated.

### pages · page geometry by section
- refers-to: src/editor/pages.ts :: layout() pageTop, bodyTop, bottomOf, secAt, startAt; paint() sheetGeo
- kind: rationale
- logged: v0.23.0 · 2026-10-21
- The paginator no longer assumes one page height: page p's top is the sum of the earlier pages' own heights plus the gaps, measured from page 0's body top (the root's origin), and its body runs from its section's top margin to its bottom margin. A section break records which page the new section owns from (moved one page on when an odd or even start needs a blank page), and the page-top cache is cut back from that page so later pages are recomputed with the new height. Everything that used `page * stride` now asks `bodyTop(page)`, which keeps one code path for single-section documents (the 28-page regression is unchanged). Sheets are drawn at their own size and centred in the widest page, each carrying its section's header and footer insets; page-anchored pictures and shapes measure from their own page's corner.

### sections · width and side margins
- refers-to: src/editor/sections.ts :: sectionsPlugin, sectionGeometry()
- kind: rationale
- logged: v0.23.0 · 2026-10-21
- The editable flow is one column sized to the first section's body, centred in the widest page. A later section whose body width or left edge differs gets node decorations on its top-level blocks: `position: relative; left` moves the block to its page's left margin and a `margin-right` adjustment (on top of the paragraph's own right indent) sets its width, which leaves paragraph indents, list markers and alignment untouched. The decorations are rebuilt only when the document or the section geometry changes, so pagination passes never add or remove them. Known gap: centred figures and charts in a different-width section line up from the left edge of the new width; the ruler still shows the first section.

### pages · layout fast path
- refers-to: src/editor/pages.ts :: scheduleEdit(), unchanged(), remember(); src/editor/editor.ts :: dispatchTransaction
- kind: rationale
- logged: v0.24.0 · 2026-10-21
- A full pagination pass clears the spacer decorations, measures every block and places them again, which costs about 85 to 137 ms per keystroke on the 28-page document at 4x CPU. Most keystrokes change no block's height. An edit now records which top-level blocks its steps touched; the next frame skips the pass when the block count is the same and every touched block is still the same element, holds no spacer, repeated header row or split-table mask, and has the height cached at the end of the last full pass (within half a pixel). The spacer decorations need no work in that case because the pages plugin maps them through the edit. Anything else (a structural change, a height change, a transaction a plugin appended to, a call to `schedule()` from geometry, zoom or tab changes) runs the full pass. Keystroke to second frame dropped to about 21 to 34 ms at 4x CPU, and the spacers after a run of fast-path edits match a forced full pass exactly.

### pages · text columns
- refers-to: src/editor/pages.ts :: layout() column branch, jumpEl(), cloneEl(), cloneHit(), selectionMoved(); src/editor/sections.ts :: columnsOf(), sectionGeometry()
- kind: rationale
- logged: v0.25.0 · 2026-10-21
- The editable flow stays one column of blocks, so editing, the caret and undo are untouched; layout moves blocks into columns. A column section's blocks are sized to the column width through the section decorations. The paginator walks slots (page, column) instead of pages: a block that does not fit moves to the next column through a jump widget, a zero-height spacer whose negative bottom margin lifts the next block to the column's top, corrected after rendering against the next block's measured top (live, in document order, so earlier corrections are seen by later ones). Blocks in column 1 and on are moved sideways with `translate`, which leaves the flow and the measurements alone. Flow coordinates still equal screen coordinates, so sheets, line numbers, page-anchored objects and the fast path keep working unchanged.
- A paragraph cannot be in two places, so a paragraph that breaks between columns is drawn twice: the real paragraph in one column, clipped with clip-path to its lines there, and an `aria-hidden` copy (taken during measuring, keyed by a hash of its HTML so it refreshes when the text changes) in the other column, showing the remaining lines. The real paragraph sits where the caret is: a selection that crosses into the copied part triggers a layout that swaps them, and a mouse press on a copy is mapped to the same text node and offset in the real paragraph by its child-index path. Splits use the widow and orphan rules; tables and rows move whole between columns. The 0.24.0 design note planned windows onto the flow with no copies; CSS cannot draw one element twice, so copies are the only way and the note is corrected.

### pages · column bands, balancing and column breaks
- refers-to: src/editor/pages.ts :: layout() curCols, band, slotTop(), limitOf(), balanceFrom(), pendingBand, colForce
- kind: rationale
- logged: v0.26.0 · 2026-10-21
- The column count follows the flow, not the page: it changes at every section break, so a continuous section starts a band on the same page. A band's top is the lowest point anything reached on the page so far (`bandMax`); when the previous band had columns, the first block of the new one gets a jump to that point, and columns in the band jump back to the band's top, not the page's. A band that ends at a continuous break is balanced: its blocks' total measured height divided by the column count (plus 2 px) caps every column but the last on the page where it starts, so the columns come out about even and the last column takes any remainder; a band longer than the page is not balanced. A column break sets a flag that moves the next block to the next column's top, or acts as a page break in the last column or a one-column band. `atTop` measures against the band's top in a column band, but the first column of a band starting mid-page is not treated as being at the top, so a block that does not fit there still moves on.

### editor · split window
- refers-to: src/editor/editor.ts :: toggleSplit(), splitState(), splitDispatch(), forwardToSplit(), reseedSplit(), nodeViews()
- kind: rationale
- logged: v0.24.0 · 2026-10-21
- The lower pane is a second EditorView with its own state (own selection and scroll) over the same document, shown as draft view without pagination. The two docs are kept identical by forwarding steps: an edit in the pane is applied there (with anything its table plugins append), then its steps are dispatched to the main view marked `fromSplit`, so history, saving, fields and pagination all run in one place; every transaction the main view applies, including appended ones such as new block ids, is forwarded back except the one that came from the pane. A step that fails to apply reseeds the pane from the main doc, as do loading a document and switching tabs. Undo and redo in the pane run the main view's history. The pane has no chip menu, collapse or find plugins, so those stay main-pane features. Main paragraphs are patched, not recreated, while typing in the pane (0 block removals under 4x CPU).

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
- The one declared scale, a subset of FormDeck's: behind (-1, added in v0.9.0 for pictures behind text, only meaningful inside the isolated `.ft-pm-root`), base, raised, chrome, menu, modal, context, toast, home, home-modal, overlay. Anything that must escape its container renders into `#overlay-root`, a direct child of `body`.

## src/editor/ext/ {#ext}

### ext · area seams
- refers-to: src/editor/ext/index.ts, specs.ts, codecs.ts, ui.ts, plugins.ts
- kind: rationale
- logged: v0.27.0 · 2026-10-21
- Phases 5 to 11 were built as nine areas (refs, review, versions, exchange, print, proofing, ai, objects, collab) plus views, so parallel work never touched the same file. Each area owns `<area>-spec.ts` (nodes, marks, paraAttrs with `dom()`), `<area>-codec.ts` (inline, block and mark codecs) and `<area>.ts` exporting `register(reg, ed)`. schema.ts merges EXT_NODES, EXT_MARKS and EXT_PARA_ATTRS; convert.ts asks the codecs before its own fallbacks; editor.ts spreads EXT_PLUGINS and EXT_NODE_VIEWS and runs EXT_LOADED after every load. ui.ts owns the menu bar order (File, Insert, Format, References, Review, Tools, AI, View, Share) and the one side panel (`openPanel`, `togglePanel`, `panelOpen`, `closePanel`), so two areas cannot open overlapping panels.

### ext · views
- refers-to: src/editor/ext/views.ts :: view.multiPage, view.onePage, view.gridlines
- kind: rationale
- logged: v0.27.0 · 2026-10-21
- Multiple pages uses CSS multicol on `.ft-pages[data-multi="on"]` with one column per page pitch, and generated nth-child rules translate the sheets. Multicol is switched off in `beforeMeasure` and back on in `onLayout` so the paginator always measures one column; no node is rebuilt, which keeps the toggle flash-free under 4x CPU.

### ext · review tracking
- refers-to: src/editor/ext/review/track.ts :: suggestAs(), fmt mark, rvSplit, rvJoin
- kind: rationale
- logged: v0.27.0 · 2026-10-21
- `suggestAs(author, fn)` records every change made inside `fn` under that name, which is how AI document edits arrive as tracked suggestions. Formatting changes are a `fmt` mark holding the previous marks; paragraph splits and joins are the `rvSplit` and `rvJoin` paraAttrs so reject can rejoin or split back. Appended transactions that only change attributes (uniqueIds) keep the size, so the tracker tolerates them (`sizeKept`); without this Enter was never tracked.
- kind: gotcha
- `editorsWithHistory()` merges editors named in version history with marks in the text; the engine answers `GET /api/versions/{id}/editors`.

### ext · footnotes at the page foot
- refers-to: src/editor/pages.ts :: reserve; src/editor/ext/refs/footnotes.ts
- kind: rationale
- logged: v0.27.0 · 2026-10-21
- The paginator takes `reserve(page)`, subtracted in `bottomOf`, so each page leaves room for the notes referenced on it; footnotes.ts measures the note block per page and draws it in the reserved band. Endnotes keep the refs block with `data-which`.

### ext · ink tools
- refers-to: src/editor/ink.ts; register.ts :: view.draw
- kind: rationale
- logged: v0.27.0 · 2026-10-21
- `view.draw tool=pen|highlighter|eraser`. Highlighter strokes are ink shapes with `wrap: 'behind'` and `opacity: 0.45` (the shape attr `opacity` is new in 0.27.0), so they sit under the text like a marker. The `.ft-ink-bar` toolbar picks colour and width.

### ext · PDF drawings
- refers-to: src/editor/ext/print/raster.ts :: rasterize(), shapeKey(), drawings()
- kind: rationale
- logged: v0.27.0 · 2026-10-21
- The engine cannot draw shapes, diagrams, Mermaid or every chart kind, so the window rasterizes them (foreignObject SVG with inlined computed styles, at 2x) and posts them as `_drawings` with the document. Blocks are keyed by id; shapes by `shapeKey`, which the engine computes the same way (`writer.py shape_key`). Pictures inside a drawing are removed before rasterizing because a tainted canvas cannot export.

### ext · agents and actors
- refers-to: src/automation/actor.ts :: asAgent(), noteEdit(), takeEditor()
- kind: rationale
- logged: v0.27.0 · 2026-10-21
- Commands that arrive over the live bridge run inside `asAgent`, so the next save carries `?by=agent:<name>` and Activity names the agent rather than the person.

### ext · keystroke budget
- refers-to: src/editor/editor.ts :: makeState
- kind: gotcha
- logged: v0.27.0 · 2026-10-21
- With all area plugins loaded, a keystroke on a 400-paragraph document at 4x CPU takes 40 to 57 ms (23 to 37 ms at 0.26.0). The proofing and review plugins are the largest share; moving their scans to idle time is the next step.

## src/shell.ts, src/ui/shell/ {#shell}

### shell · why a facade over the registry
- refers-to: src/ui/shell/cmd.ts :: Commands, setCmdState, cmdStateChanged
- kind: rationale
- logged: v0.28.0 · 2026-10-21
- FormDeck's ribbon, menus and QAT expect a Commands object with label, keys, icon, enabled and checked. FormTxt's registry has none of the UI fields, so cmd.ts wraps it and keeps a per-id state table; the editor and shell fill icons and checked tests there, and every change calls cmdStateChanged so the ribbon, native menus and status bar patch together.

### shell · the old toolbar stays as a hidden state source
- refers-to: src/shell.ts :: checkedFromToolbar; styles/word-shell.css
- kind: rationale
- logged: v0.28.0 · 2026-10-21
- editor.ts already computes bold, alignment, list, style, font and size for its toolbar on every selection change. Rather than duplicate that logic, the toolbar is kept in the DOM with display none and the ribbon's checked tests and the Styles, font and size slots read it. Removing the toolbar means moving syncToolbar's results into the state table first.

### shell · mount order
- refers-to: src/app.ts :: mountShell
- kind: gotcha
- logged: v0.28.0 · 2026-10-21
- The ribbon builds every tab once and skips commands that are not registered at that moment, so mountShell runs after the last commands.register in app.ts. A command registered later never appears in the ribbon or menus.

### shell · class collision
- refers-to: src/ui/shell/menu.ts, styles/ribbon.css :: .ft-popm
- kind: gotcha
- logged: v0.28.0 · 2026-10-21
- The ported menus first used .ft-pm, which is also the class of the document's ProseMirror mount, so the page took the menu's dark panel style. Menus use .ft-popm; never reuse .ft-pm.

### shell · keys
- refers-to: src/ui/shortcuts.ts :: declaredMatch; src/editor/editor.ts keymap
- kind: rationale
- logged: v0.28.0 · 2026-10-21
- Declared command keys run from a bubble-phase listener gated on defaultPrevented, so ProseMirror and word-commands win and nothing runs twice. Subscript and superscript follow Word (Ctrl+= and Ctrl+Shift+=) so Ctrl+, can be Preferences as on macOS; zoom moved to Ctrl+Alt+= and Ctrl+Alt+-.

### shell · ribbon fitting
- refers-to: src/ui/shell/ribbon.ts :: fit, candidates
- kind: rationale
- logged: v0.28.0 · 2026-10-21
- Word collapses the Styles gallery first and then whole groups from the right into one labelled drop-down. The icon-only intermediate level FormDeck uses was dropped. The ResizeObserver fits in the same frame so the first visible ribbon is already final.

### shell · boot
- refers-to: src/ui/dom.ts :: revealApp; public/splash.html; src-tauri/src/reveal.rs
- kind: rationale
- logged: v0.28.0 · 2026-10-21
- Ported unchanged from formvis 1.96.4 so the family opens the same way: splash at least 2.6 s, main window concealed (alpha 0 on macOS, because a hidden web view stops animation frames) until the page calls app_ready two frames after app-ready, 20 s fallback.

## src/editor/word-commands.ts {#word-commands}

### word-commands · marks without layout change
- refers-to: src/editor/word-commands.ts :: view.formattingMarks; styles/word-commands.css
- kind: rationale
- logged: v0.28.0 · 2026-10-21
- Paragraph marks are a zero-width inline-block ::after, spaces become dots through a direct decorations prop (capped at 30000), so turning marks on never changes line breaks or pagination.

### word-commands · AutoFit to contents
- refers-to: src/editor/word-commands.ts :: table.autofit
- kind: rationale
- logged: v0.28.0 · 2026-10-21
- Measures by switching the table to auto layout with the colgroup hidden, reads the widths and restores in the same tick, so nothing paints in between; widths go into the existing colwidth attribute.

## src/ui/shell/controls/, controls-b/ {#ribbon-controls}

### controls · panels built once
- refers-to: src/ui/shell/controls/index.ts :: registerPanel, openPanel; controls-b/kit.ts
- kind: rationale
- logged: v0.29.0 · 2026-10-22
- Every picker is a panel registered by id, portaled into #overlay-root at startup, hidden, and patched on open from DOM state and read-only commands (layout.sections, styles.list), so opening never rebuilds and reading never fires cmdStateChanged. mousedown is prevented so the editor keeps focus. Recents (colours, fonts, symbols, pens) live in formtxt.* localStorage keys.

### fonts · system fonts
- refers-to: src/ui/system-fonts.ts; src-tauri/src/main.rs :: system_fonts
- kind: rationale
- logged: v0.29.0 · 2026-10-22
- Installed fonts come from fontdb in the desktop app (an async command, so thousands of faces never block the main thread) and from the Local Font Access API in a browser. They load the first time the font box opens, because the browser API asks permission. The PDF writer embeds only bundled faces, so a system font falls back in PDF.

## build_app {#build-app}

### desktop · what the frozen engine must carry
- refers-to: setup/freeze_backend
- kind: gotcha
- logged: v0.29.0 · 2026-10-22
- The engine reads files at run time: proofing/data dictionaries, @fontsource faces for PDF, WordNet for the thesaurus and grammar lexicon. --collect-data app did not pick up the dictionaries, so each is an explicit --add-data. Check a new data file is listed there or the built app silently loses the feature.

### desktop · engine lifetime
- refers-to: backend/formtxt_engine.py :: watch_parent
- kind: rationale
- logged: v0.29.0 · 2026-10-22
- The shell passes FORMTXT_PARENT_PID; the engine exits when that process is gone, so a crashed or force-quit app never leaves the onefile bootloader and engine running.

## branding {#branding}

### logo · one image, many sizes
- refers-to: frontend/public/formtxt-logo.png, assets/formtxt_icon.png, src-tauri/icons
- kind: rationale
- logged: v0.29.1 · 2026-10-22
- assets/formtxt_icon.png is the 1024 source; tauri icon regenerates src-tauri/icons from it. The web side uses formtxt-logo.png (256, preloaded in index.html) with fixed width and height on every img so nothing shifts when it loads. .ft-logo sets pointer-events none so the title bar logo never blocks the drag region.

## dark page {#dark-page}

### view.darkPage · invert instead of recolour
- refers-to: frontend/src/editor/word-commands.ts :: view.darkPage, frontend/src/styles/editor.css :: data-page-dark
- kind: rationale
- logged: v0.29.1 · 2026-10-22
- Documents carry inline colours from .docx and styles, so swapping tokens would miss them. A screen-only invert(0.9) hue-rotate(180deg) on .ft-pages and the split page turns black ink light and white paper dark while hues survive; img, video, canvas, iframe and picture get invert(1) hue-rotate(180deg) back. It is per viewer (localStorage formtxt.darkPage), set in the index.html boot script before first paint, and under @media screen so print and exports are untouched.

### ruler · theme tokens
- refers-to: frontend/src/styles/tokens.css :: --ruler-*, frontend/src/styles/light-mode.css
- kind: rationale
- logged: v0.29.1 · 2026-10-22
- The ruler used to take the document page colour with hard-coded greys. It now uses --ruler-* tokens derived from each theme's own variables, so every dark and light theme gets a matching ruler without per-theme entries.

## gallery names {#gallery-names}

### built-in galleries · FormTxt's own names and sets
- refers-to: frontend/src/ui/shell/controls-b/slots-refs.ts :: TOC items, controls-b/slots-table.ts :: presets, controls/panels-insert.ts :: textbox, editor/word-commands.ts, controls/panels-design.ts, word-tabs.ts :: WATERMARKS
- kind: rationale
- logged: v0.29.4 · 2026-10-23
- The family IP review's originality check (C5) compared FormTxt's galleries with the other suite's built-in building blocks. Five names were exact matches and are now FormTxt's own: the contents gallery is Linked Contents, Linked Table of Contents and Typed Contents; the text box gallery's first tile is Plain Text Box; the table looks Full Grid and No Borders. The watermark presets were the other suite's six in its order; they are now Draft, Confidential, Internal, Review, Do Not Copy and Sample. Ids (`auto1`, `auto2`, `manual`, `look:grid`, `look:plain`) are unchanged, so saved documents and agent calls that name a variant keep working; a `design.watermark` preset of ASAP or Urgent is now refused with the new list, and `text` still takes any wording. Cover pages, headers and footers, style sets, the bibliography headings (common academic terms) and the document templates were checked and are FormTxt's own.

## dev dependencies {#dev-dependencies}

### vite 8.3.5 · the dev server's launch-editor advisories
- refers-to: frontend/package.json :: devDependencies.vite, frontend/package-lock.json :: node_modules/vite
- kind: dependency
- logged: v0.29.8 · 2026-10-25
- Family rule from `FAMILY_DEV_PLAN.md` v0.4.x Phase 2b (formai_dev sidecar): every frontend installs with zero `npm audit` findings. Vite 8.3.0 carries a `launch-editor` with two command-injection advisories in the dev server (ledger FB-004); 8.3.5 clears them. Dev dependency only, nothing in the shipped bundle changed; the pin stays exact. Checked: `npm install` then `npm audit` reports 0 vulnerabilities; `npm run typecheck` passes; `vite build` succeeds into an outDir outside the repo; `vite` dev starts as v8.3.5 on localhost:5199 only (no Network address) and answers 200.
