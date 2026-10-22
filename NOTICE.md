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
| @tauri-apps/api 2.12.1 | MIT or Apache-2.0 | the macOS menu bar (loaded only in the desktop app) |
| tauri-plugin-shell, tauri-plugin-dialog, regex, serde, serde_json, objc2, objc2-app-kit, objc2-foundation (Rust crates) | MIT or Apache-2.0 | desktop shell: engine process, error dialog, window and title bar on macOS |
| keyring 25.7.0 | MIT or Apache-2.0 | engine: keys and passwords in the system password store |
| FastAPI, Starlette, Pydantic | MIT | engine |
| Uvicorn | BSD-3-Clause | engine server |
| python-multipart | Apache-2.0 | engine uploads |
| prosemirror-collab 1.3.1 | MIT | live co-editing |
| wordnet-db 3.1.14 (WordNet 3.0 database, Copyright 2006 by Princeton University; used under the WordNet License, which permits use, copying and distribution with this notice; the database is provided as is, without warranties) | MIT package, WordNet License data | Tools > Thesaurus and dictionary (read by the engine from `frontend/node_modules`) |
| SCOWL-derived hunspell dictionaries for en-US, en-GB, en-AU and en-CA, from dictionary-en 4.0.0, dictionary-en-gb, -au and -ca 3.0.0 (licence file in `backend/app/services/proofing/data/`) | MIT AND BSD | spelling |
| python-docx 1.2.0 | MIT | .docx reading and writing |
| lxml 6.1.3 | BSD-3-Clause | .odt, .docx and EPUB XML |
| reportlab 5.0.1 | BSD | PDF export |
| pypdf 6.21.2 | BSD-3-Clause | PDF tags and reading |
| pdfplumber 0.11.10 (with pdfminer.six) | MIT | opening PDFs |
| pypdfium2 5.14.0 (PDFium) | Apache-2.0 or BSD-3-Clause | PDF page rendering |
| olefile 0.47 | BSD-2-Clause | Word 97-2003 .doc reading |
| Pillow 13.0.0 | MIT-CMU (HPND) | pictures |
| openpyxl 3.1.5 | MIT | spreadsheet data |
| cryptography 50.0.2 | Apache-2.0 or BSD-3-Clause | password protection |
| rapidocr-onnxruntime 1.2.3 with onnxruntime 1.31.0, opencv-python, numpy, shapely and pyclipper | Apache-2.0, MIT, Apache-2.0, BSD-3-Clause, BSD-3-Clause, MIT | OCR of scanned PDF pages, engine only |

## From the form family

`frontend/src/ui/dom.ts` comes from FormDeck (Apache-2.0, same owner). The diagram layouts in `frontend/src/editor/diagram.ts` are ported from FormDeck 0.23.0's `editor/diagram.ts` (same owner): the layout maths is kept, while FormDeck's theme colours and slide shapes are replaced by fixed colours and an SVG renderer. `frontend/src/editor/chart/chartdraw.ts` and `chartkinds.ts` come from Form.md 0.46.0 (`web/src/extensions/database/views/`, Apache-2.0, same owner), with imports pointed at `chart/types.ts`, comments moved to `frontend/HASHOUT_LOG.md` and two em dash fallbacks changed to hyphens.

The table formula engine in `backend/app/services/formula.py` is a Python port of Form.md's `internal/collection/formula/parse.go` (Go, Apache-2.0, same owner): the lexer and Pratt parser are kept, with cell references, ranges, the ABOVE, BELOW, LEFT and RIGHT directions, `<>`, `&` and `;` added for Word-style table formulas, and an evaluator and number-picture formatter written here.

## Online picture services

Insert > Stock images asks the engine to search and download from Openverse (https://openverse.org, openly licensed works; each picture keeps its own Creative Commons or public domain licence, which FormTxt records with the picture and writes as a credit line) and, when you add your own API key, Pexels (https://www.pexels.com, photos under the Pexels License). FormTxt includes no pictures from either service and contacts them only when you search.
