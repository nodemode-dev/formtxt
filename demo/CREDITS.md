# Demo credits

Nothing in this demo is third-party media. There are no photographs, stock pictures, templates or sample files. "Kestrel Harbour Trust: Annual Report 2026" (`frontend/public/demos/harbour-trust-annual-report.ftxt`) was made for the demo by `scripts/demo-docs.py` with the engine's own document model; the Trust, Iris Fenwick, Maya Okafor, Tomas Lindqvist and every name, date and figure are invented. The covers on Home > Demos (`review.webp`, `paper.webp`, `newsletter.webp`) are FormTxt's own window photographed with each demo open.

`assets` also holds the files the three pages share, all third-party works the app already ships and lists in `NOTICE.md`:

| Files | Work | Licence |
| --- | --- | --- |
| `inter-*.woff2` | Inter, via @fontsource/inter | SIL Open Font License 1.1 |
| `source-serif-4-*`, `libre-baskerville-*`, `work-sans-*`, `ibm-plex-sans-*`, `ibm-plex-serif-*`, `space-grotesk-*` (`.woff2`) | the document fonts, via their @fontsource packages | SIL Open Font License 1.1 (fonts); MIT (packaging) |
| `Lora_wght_.ttf`, `Lora-Italic_wght_.ttf`, `Merriweather_opsz_wdth_wght_.ttf`, `Merriweather-Italic_opsz_wdth_wght_.ttf`, `PlayfairDisplay_wght_.ttf`, `PlayfairDisplay-Italic_wght_.ttf` | Lora, Merriweather and Playfair Display, the unmodified upstream variable fonts from `frontend/public/fonts/full` (the build only renames the files; the font names inside are untouched) | SIL Open Font License 1.1, with Reserved Font Names |
| `KaTeX_*.woff2` | the KaTeX fonts | SIL Open Font License 1.1 |
| `tabler-icons.js` | Tabler Icons 3.49.0, the data in `frontend/src/data/tabler-icons.json` wrapped in one line of script | MIT |

The script `assets/demo.js` bundles the app's own code with ProseMirror, KaTeX, Mermaid and its dependencies (with elkjs, EPL-2.0), emojibase-data and xterm.js, as listed in `NOTICE.md`.

The app opens the same demo from Home > Demos, Help > Demos and the `demo.review` command, from the same file, so this note covers it too.
