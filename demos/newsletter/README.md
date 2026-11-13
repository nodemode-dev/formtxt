# FormTxt demo: A two-column newsletter

The third of FormTxt's three offline demo pages (the others are `demo/` and `demos/paper/`). It runs in a browser with no engine, no desktop shell and no network: double-click `index.html`, or serve the repository with a static server and open `/demos/newsletter/`.

## What it shows

The real FormTxt window, which opens the "A two-column newsletter" demo as Home > Demos does in the app (the `demo.newsletter` command). "The Riverside Post: Autumn 2026" is a community newsletter: a Text Art masthead in Playfair Display, a full-width cover picture with a caption, then a section in two columns with Lora body text, an IntelligentArt diagram of the repair cafe steps, two charts, a table of events and a second picture. Type in it, move a picture, change the columns from the Layout tab, or restyle the Text Art.

## How the page works and how to rebuild it

See `demo/README.md`: the three pages share `demo/src` and `frontend/vite.demo.config.ts`, the document and its two pictures live in the page for this tab only, every request the engine would answer reads "This needs the FormTxt engine", and `npm run demo` in `frontend/` rebuilds all three. This folder holds only the page, its script and its style; the fonts, covers and icon data are read from `demo/assets`. Credits are in `CREDITS.md`.
