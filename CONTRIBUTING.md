# Contributing to FormTxt

Thank you for helping. FormTxt is the word processor of the Form family: real pages
or pageless, a full ribbon, .docx and .odt round trips, review, references and
charts, local-first with no account. It gets better through real use and real
contributions.

## Where to start

- **Use it and report what goes wrong.** A clear bug report, with steps, the version
  and your platform, is one of the most useful things you can give. A document that
  opens or saves wrongly helps most when you can share a small file that shows it.
- **Look at the open issues.** Comment on one before starting larger work, so nobody
  builds the same thing twice.

## Setting up

Clone the repository, run `./formtxt_oc_install` once, then `./formtxt` (on Windows,
`formtxt_oc_install.bat` then `formtxt.bat`). It starts the engine on
127.0.0.1:8210 and the window at http://localhost:5210. `./formtxt desktop dev` opens
the desktop window instead. The README's "Run it from source" section has the
requirements (Python 3.12 or newer, Node 20.19 or newer).

The code lives in:

| Folder | What is there |
| --- | --- |
| `backend/app` | the engine (Python, FastAPI): the `.ftxt` model, file exchange, proofing, printing and exports, versions, live co-editing, MCP |
| `backend/tests` | the engine and family layer tests |
| `frontend/src` | the window (TypeScript, Vite, ProseMirror): editor, page layout, ribbon, Home |
| `frontend/tests/window` | the window smoke test (Playwright) |
| `src-tauri` | the desktop shell (Rust, Tauri 2) |
| `setup` | install, boot, build, agents and icon check scripts |
| `scripts` | the script that generates the demo documents |
| `demo`, `demos` | the offline browser demos |
| `docs` | `FORMAT.md`, the `.ftxt` contract, and the README images |
| `.claude/skills` | the agent skills, mirrored to `.agents/skills` |

`CLAUDE.md` and `AGENTS.md` hold the repository's rules; they apply to people as
well as agents.

## Before you open a pull request

Run the same checks CI runs:

```sh
(cd frontend && npm ci && npm audit --audit-level=low && npm run typecheck && npm run build)
(cd backend && python -m compileall -q app formtxt_engine.py && python formtxt_engine.py --selfcheck)
(cd backend && pip install -r requirements.txt -r requirements-test.txt && python -m pytest tests -q -p no:cacheprovider)
python -m pytest frontend/tests/window -q -p no:cacheprovider
./formtxt agents check
./formtxt mcpb check
python3 -B setup/icon_rules.py
```

The window test needs `pytest` and `playwright` with Chromium installed and the
window built. CI also boots the engine and probes `/api/health`, checks the shell
scripts with `bash -n`, and fails any tracked Markdown file that holds an em dash or
an emoji.

- Keep each pull request to one change, with tests for what it adds or fixes. Tests
  live in `tests/` folders and use no network.
- Write commit subjects the way the history does: `type(scope): what is now true (x.y.z)`,
  for example `fix(exchange): ...`, `feat(demos): ...`, `docs(readme): ...`, ending
  with the version in parentheses.
- Every user action is a command in `frontend/src/engine/registry.ts`, so the window,
  `./formtxt cli` and agents reach the same thing.
- `docs/FORMAT.md` is the `.ftxt` contract and wins over the code. A change to the
  format changes that file first.
- No comments in source: notes go in `frontend/HASHOUT_LOG.md` and
  `backend/HASHOUT_LOG.md`.
- Icons are inline `currentColor` SVG in `frontend/src/ui/icons.ts`; no icon
  libraries and no emoji in the interface. The sparkle icon is banned in every form,
  and `./formtxt icons --check` fails if one returns.

## How changes land

Only the maintainers push to `main`. Everyone else forks the repository and opens a pull request into `main`. A pull request merges when the five checks (`frontend`, `backend`, `test`, `window` and `scripts`) pass and a maintainer has approved it. Other branches run no checks until they are proposed for `main`.

## Releases

A release is a version, and only the maintainers make one: the version is bumped on
`main` with a `release: x.y.z` commit, and every platform is built and published from
[FormCompiler](https://github.com/nodemode-dev/formcompiler), which releases a commit
only when CI passed on that exact commit. No pull request here starts a release, and
packaging stays in FormCompiler.

## Licensing

FormTxt is licensed under the Apache License 2.0. By contributing, you agree that
your contribution is licensed under the same terms. Only add code you have the right
to contribute, and name any third-party code and its licence in the pull request.

## Patents and other people's IP

Some features are deliberately not built, or were taken out, because they come too close to someone else's patent, trademark, copyright or design. The maintainers hold that line with counsel; contributors do not decide it, and nobody here redesigns a feature on their own reading of a patent. This is engineering diligence, not legal advice.

### Features this project will not implement

- Partial ribbon overflow. Ribbon groups collapse whole: a group steps through its own sizes and last becomes one popup button that holds all its controls. No part of a group's controls moves into an overflow pane, menu or "more" button while the rest stay in the ribbon, and individual controls are never ranked for overflow; priority stays at group level.
- Content-aware dark pages. Dark Page stays one global whole-page filter: it never parses the page into objects, measures a contrast ratio, compares text and background colours against a threshold, or fixes colours per object, per text size or per region.

A pull request that adds one of these, under any name, through any dependency, plug-in, model, template, agent tool or plain code, is closed with a link to this section. Lifting a decline needs the maintainers' written decision after a review, recorded here first.

### Rules for every contribution

- Patents: do not add a feature, or a dependency that provides one, that reproduces a method you know to be patented. If you are unsure, open an issue that describes what the feature does, not which patent it resembles. Patent numbers stay out of code, commits, comments, logs and changelogs.
- Trademarks: other vendors' product and feature names appear only to name a file format, a key set or compatibility ("Word document (.docx)", "for use with"). No command, menu, ribbon tab, group, gallery, template, theme or agent tool takes another product's feature name, and no text says "like X", "X's" or "the way X does it". FormTxt's own names are Text Art, IntelligentArt, View Stager and Common equations. Describe what the feature does.
- Copyright: never copy another product's help, tooltip, dialog or documentation text (link to it instead); never trace or import vendor icons; never bundle vendor templates, building blocks, themes, galleries, fonts, sample files or stock images, and never reuse vendor building-block or gallery names. Proofing rules and AutoCorrect lists stay in FormTxt's own words. Test fixtures come from this repository's own scripts.
- Licences: every new dependency, binary, model, font, dictionary or data file gets a row in `NOTICE.md` before it is used. GPL stays outside the distributed bundle, AGPL nowhere, LGPL dynamically linked and replaceable, MPL files unedited. CC BY credited, CC BY-SA only unmodified, CC NC and ND never.

## Conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Security
problems go through [SECURITY.md](SECURITY.md), never a public issue.
