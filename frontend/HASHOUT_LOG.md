# HASHOUT_LOG · frontend · formtxt

Living log of comment content, rationale and removed code for the frontend. Source files stay comment-free; read this first, then edit surgically.

Current build version: v0.1.0
Last updated: 2026-10-21 · Phase 0 shell

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
    └── styles/              fonts, tokens (with the z scale), light mode, shell
```

---

## Table of contents

- [index.html](#index)
- [src/app.ts](#app)
- [src/styles/tokens.css](#tokens)

---

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
