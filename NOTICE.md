# Notice

FormTxt. Copyright 2026 nodemode-ai. Licensed under the Apache License 2.0 (`LICENSE`).

## Third-party software

| Component | Licence | Use |
| --- | --- | --- |
| @fontsource/inter (Inter typeface by Rasmus Andersson) | SIL Open Font License 1.1 | interface and document font |
| @fontsource packages for Source Serif 4, Libre Baskerville, Lora, Merriweather, Playfair Display, IBM Plex Sans, IBM Plex Serif, Work Sans and Space Grotesk | SIL Open Font License 1.1 | document fonts used by the templates |
| prosemirror-model, -state, -view, -transform, -commands, -keymap, -history, -inputrules, -dropcursor, -gapcursor | MIT | the editor |
| prosemirror-tables | MIT | table editing, cell selection and column resizing |
| KaTeX (and its fonts) | MIT | equations |
| Mermaid 12.1.0 (https://mermaid.js.org) and its dependencies (d3, dagre-d3-es, cytoscape, DOMPurify, khroma, dayjs and others; all MIT, ISC, BSD or Apache-2.0), with its KaTeX pinned to the 0.19.0 above | MIT | Mermaid diagrams |
| elkjs 0.9.3 (https://github.com/kieler/elkjs), Eclipse Layout Kernel compiled to JavaScript, a dependency of Mermaid for its optional ELK layout; shipped unmodified, source at that address | EPL-2.0 (weak copyleft, applies to elkjs files only) | Mermaid's `layout: elk` diagrams |
| emojibase-data 17.0.0 (https://emojibase.dev), Unicode emoji names and tags from the Unicode CLDR | MIT (data under the Unicode licence) | the emoji picker |
| Tabler Icons 3.49.0 (https://tabler.io/icons), copyright (c) 2020-2026 Paweł Kuna: 4,808 outline and 1,009 filled icons with names, categories and tags, as FormDeck re-encoded them into `frontend/src/data/tabler-icons.json` (copied byte for byte from FormDeck 0.23.0) | MIT | Insert > Icons |
| Vite, TypeScript | MIT, Apache-2.0 | build tools, not shipped |
| @tauri-apps/cli, Tauri | MIT or Apache-2.0 | desktop shell |
| FastAPI, Starlette, Pydantic | MIT | engine |
| Uvicorn | BSD-3-Clause | engine server |
| python-multipart | Apache-2.0 | engine uploads |

## From the form family

`frontend/src/ui/dom.ts` comes from FormDeck (Apache-2.0, same owner). The diagram layouts in `frontend/src/editor/diagram.ts` are ported from FormDeck 0.23.0's `editor/diagram.ts` (same owner): the layout maths is kept, while FormDeck's theme colours and slide shapes are replaced by fixed colours and an SVG renderer. `frontend/src/editor/chart/chartdraw.ts` and `chartkinds.ts` come from Form.md 0.46.0 (`web/src/extensions/database/views/`, Apache-2.0, same owner), with imports pointed at `chart/types.ts`, comments moved to `frontend/HASHOUT_LOG.md` and two em dash fallbacks changed to hyphens.

The table formula engine in `backend/app/services/formula.py` is a Python port of Form.md's `internal/collection/formula/parse.go` (Go, Apache-2.0, same owner): the lexer and Pratt parser are kept, with cell references, ranges, the ABOVE, BELOW, LEFT and RIGHT directions, `<>`, `&` and `;` added for Word-style table formulas, and an evaluator and number-picture formatter written here.

## Online picture services

Insert > Stock images asks the engine to search and download from Openverse (https://openverse.org, openly licensed works; each picture keeps its own Creative Commons or public domain licence, which FormTxt records with the picture and writes as a credit line) and, when you add your own API key, Pexels (https://www.pexels.com, photos under the Pexels License). FormTxt includes no pictures from either service and contacts them only when you search.
