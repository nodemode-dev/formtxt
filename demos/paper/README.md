# FormTxt demo: A paper with references

The second of FormTxt's three offline demo pages (the others are `demo/` and `demos/newsletter/`). It runs in a browser with no engine, no desktop shell and no network: double-click `index.html`, or serve the repository with a static server and open `/demos/paper/`.

## What it shows

The real FormTxt window, which opens the "A paper with references" demo as Home > Demos does in the app (the `demo.paper` command, which also runs References > Update all). "How fast mud settles on the north shore flats" is a lab working paper: a title page, a table of contents, numbered headings, inline and display equations, a chart and a table with numbered captions and cross-references, three footnotes, APA citations and a bibliography. Type in it, insert an equation, add a citation or update the fields.

## How the page works and how to rebuild it

See `demo/README.md`: the three pages share `demo/src` and `frontend/vite.demo.config.ts`, the document lives in the page for this tab only, every request the engine would answer reads "This needs the FormTxt engine", and `npm run demo` in `frontend/` rebuilds all three. This folder holds only the page, its script and its style; the fonts, covers and icon data are read from `demo/assets`. Credits are in `CREDITS.md`.
