# HASHOUT_LOG · frontend · formtxt

Living log of comment content, rationale and removed code for the frontend. Source files stay comment-free; read this first, then edit surgically.

Current build version: v0.2.0
Last updated: 2026-10-21 · Phase 1 home screen and reader

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
    ├── ui/reader.ts         read-only page view until the Phase 2 editor
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

---

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

### reader · stepping stone
- refers-to: src/ui/reader.ts :: class Reader
- kind: todo
- logged: v0.2.0 · 2026-10-21
- Renders the first document tab as one continuous sheet at the section's page width and margins, with styles resolved through `basedOn`. The ProseMirror editor replaces it in Phase 2, and pagination comes in Phase 3.

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
