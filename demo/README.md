# FormTxt demo: A report under review

An offline demo of the FormTxt word processor that runs in a browser with no engine, no desktop shell, no network and no CDN. There are three pages; the other two are `demos/paper` (A paper with references) and `demos/newsletter` (A two-column newsletter), and on a window 1600 px wide or more each page links to the others from the status bar.

## Open it

- Double-click `demo/index.html` (it works from `file://`), or
- serve the repository with any static server, for example `python3 -m http.server 8000`, and open `/demo/`.

Every script, style, font and picture is local to the repository: this folder holds them, and the two pages under `demos/` load the same files from `demo/assets` instead of keeping copies.

## What it shows

The page is the real FormTxt window, not a look-alike: `frontend/index.html` and the application's own entry (`frontend/src/main.ts`, then `app.ts` and every module under `editor/`, `ui/`, `engine/` and `io/`) are bundled as they are. When the window is ready the page clicks the "A report under review" card on Home > Demos, so the demo opens through the same code the app uses (`frontend/src/demos/index.ts`, the `demo.review` command), while `html[data-demo]` keeps the window hidden; the page shows it once, with the document open.

"Kestrel Harbour Trust: Annual Report 2026" is an annual report in Suggesting mode: tracked insertions, deletions and a formatting change by two reviewers, Maya Okafor and Tomas Lindqvist, three comments, one with two replies, a native bar chart, a table of income and spending, a process diagram and outline headings. Everything is editable: type, accept or reject a change from the Review tab, reply to a comment, change the chart, or switch to Editing.

## What stands in for the engine

FormTxt keeps its documents in the engine's library. The page has no engine, so `src/shim/api.ts` answers the window's `/api` requests inside the page:

- Live in the page: the library holds the documents opened in this tab. Opening a demo reads its `.ftxt` package in the page (`src/shim/ftxt.ts` unpacks it, `src/shim/library.ts` gives it a new id, as the engine's import does), the document is read and saved there, and its pictures are served from memory. Saving works, but only for this tab: a reload starts again from the demo. Opening another `.ftxt` file from Home works the same way.
- Every other request answers with the app's own message that it needs the FormTxt engine: new documents and templates, opening other formats (Word, OpenDocument, PDF and the rest), export and print to PDF, proofing, versions, sharing, the assistant, Claude Code and the terminal. The status bar reads "Engine offline", as the app does without its engine, and Home lists no templates because the engine makes them.
- Sockets to the engine (the live command bridge, co-editing) close quietly.
- Pictures the engine would draw, such as the thumbnails on Home's recent documents, are left blank.
- The Tabler icon data behind Insert > Icons is loaded as `assets/tabler-icons.js` by a script tag when the picker first opens, because `file://` cannot fetch it.

## Rebuild

The built files in this folder and in `demos/` are committed. After changing the app or `demo/src`:

```sh
cd frontend
npm ci
npm run demo
```

`npm run demo` runs `vite build --config vite.demo.config.ts` three times, with `--mode review`, `paper` and `newsletter`, writing `demo/`, `demos/paper/` and `demos/newsletter/`. The three pages share `demo/src`; the mode only chooses the demo and the folder. The `review` build writes the fonts, covers and icon data to `demo/assets`, and the other two point at them there. `npx tsc --noEmit -p ../demo` type-checks the page code.

## Licences

The bundle contains the app's own code (Apache-2.0) and the third-party works the app already ships, all in `frontend/package-lock.json` or `frontend/public` and listed in `NOTICE.md`. See `CREDITS.md`.
