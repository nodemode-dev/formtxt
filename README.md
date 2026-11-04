<p align="center">
  <img src="assets/app-icon/formtxt-256.png" width="128" height="128" alt="FormTxt icon: the Form family document mark">
</p>

<h1 align="center">FormTxt</h1>

<p align="center">
  <b>Word processing; the word processor of the Form family.</b><br>
  Real pages or pageless, a full ribbon, .docx and .odt round trips,<br>
  review, references and charts. Local-first, no account, and yours.
</p>

<p align="center">
  <img alt="version 0.30.6" src="https://img.shields.io/badge/version-0.30.6-eef0f4?style=flat-square">
  <img alt="TypeScript and Vite" src="https://img.shields.io/badge/TypeScript%20%2B%20Vite-3178c6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Python and FastAPI" src="https://img.shields.io/badge/Python%20%2B%20FastAPI-009688?style=flat-square">
  <img alt="macOS, Windows, Linux" src="https://img.shields.io/badge/macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-native-2f7bf5?style=flat-square">
  <img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-3a3a3a?style=flat-square">
  <img alt="Status: in development" src="https://img.shields.io/badge/status-in%20development-d69e2e?style=flat-square">
</p>

<p align="center">
  <a href="https://formtxt.formai.studio/"><b>Download FormTxt on formai.studio</b></a> ·
  <a href="#run-it-from-source">Run it from source</a> ·
  <a href="#the-form-family">All Form apps</a>
</p>

<br>

<p align="center">
  <img src="docs/images/formtxt-hero.png" alt="FormTxt showing the built-in Annual Report template on a dark page: the ribbon, an outline of headings, a harbour photo and a bar chart of revenue by quarter" width="100%">
  <br>
  <sub>The Annual Report template with a photo and a chart added, shown with the Dark Page view option.</sub>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#everything-in-the-box">In the box</a> ·
  <a href="#built-for-agents">Agents</a> ·
  <a href="#under-the-hood">Under the hood</a> ·
  <a href="#download">Download</a> ·
  <a href="#run-it-from-source">Run from source</a> ·
  <a href="#the-form-family">Form family</a>
</p>

<br>

<table>
  <tr>
    <td width="25%" valign="top"><h3>Real pages</h3>Paper size, margins, headers, footers, columns and sections lay out line by line, or switch to a pageless view.</td>
    <td width="25%" valign="top"><h3>Word compatible</h3>Open and save .docx, .dotx, .odt, .rtf, .html and Markdown, keeping comments and tracked changes.</td>
    <td width="25%" valign="top"><h3>Local-first</h3>Documents live in a folder on your computer. The engine listens on this machine only, and no account is needed.</td>
    <td width="25%" valign="top"><h3>Agent-ready</h3>Every editor command also runs from a terminal with <code>./formtxt cli</code>, the same commands a person uses.</td>
  </tr>
</table>

## Features

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/images/formtxt-tables.png" alt="A table of five meadow plants with an accent header row and the table design and layout tabs open" width="100%">
      <br><sub>A table with an accent header, banded rows and table tabs.</sub>
      <h3>Tables that behave</h3>
      Merge and split cells, repeat header rows across pages, sort, and use formulas such as <code>=SUM(ABOVE)</code>.
    </td>
    <td width="50%" valign="top">
      <img src="docs/images/formtxt-charts.png" alt="A bar chart of flowering stems per square metre below a bulleted packing list and a tracked insertion" width="100%">
      <br><sub>A chart, a list and a suggested edit on page two.</sub>
      <h3>Charts, diagrams and equations</h3>
      Insert charts with live data, IntelligentArt diagrams, Mermaid diagrams and LaTeX equations.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/images/formtxt-review.png" alt="The Review pane beside the page showing a comment thread on the sentence about closing the gate" width="100%">
      <br><sub>The Review pane with a comment thread on the page.</sub>
      <h3>Review with others</h3>
      Comments with replies and reactions, suggesting mode that tracks every edit, and compare and combine.
    </td>
    <td width="50%" valign="top">
      <h3>Ribbon and keyboard</h3>
      The ribbon has tabs, contextual tabs, Alt key tips and a command search (Alt+Q). Shortcuts follow Word and Google Docs and can be changed.
      <h3>References</h3>
      Tables of contents, footnotes, citations with a bibliography, captions, cross-references and an index.
    </td>
  </tr>
</table>

## Everything in the box

<table>
  <tr>
    <td width="33%" valign="top"><h4>39 templates in 11 categories</h4>Recent documents · Pin and duplicate · Trash with restore · Building blocks</td>
    <td width="33%" valign="top"><h4>13 chart types, 12 diagram layouts</h4>Column · Line · Doughnut · Gauge · Heat map · Process · Cycle · Venn</td>
    <td width="33%" valign="top"><h4>Formats</h4>Opens: .docx, .dotx, .odt, .rtf, .html, Markdown, .doc, PDF · Saves: .docx, .odt, .rtf, .html, Markdown, EPUB, PDF · Native: <code>.ftxt</code></td>
  </tr>
</table>

## Built for agents

The editor's commands live in one catalogue, and the window and the terminal call the same ones.

```sh
./formtxt cli list                                                  # the command catalogue
./formtxt cli describe tools.stats                                  # one command and its arguments
./formtxt cli run edit.replaceAll find=draft replace=final          # run a command in the open window
```

The commands need the window open. See [`AGENTS.md`](AGENTS.md) and [`CLAUDE.md`](CLAUDE.md).

## Under the hood

- **Frontend:** vanilla TypeScript and Vite, with ProseMirror editing and its own page layout.
- **Engine:** Python and FastAPI own the `.ftxt` model, file exchange, proofing and exports.
- **Desktop:** a Tauri 2 shell around the same UI, with the engine frozen as a sidecar.
- **Format:** `.ftxt` is a zip of `document.json` and `media/`; the contract is [`docs/FORMAT.md`](docs/FORMAT.md).
- **Tested:** backend tests in `backend/tests` (library, exchange, versions, format, boot) and a window test in `frontend/tests/window`.

## Download

**Get the app:** download FormTxt from [formtxt.formai.studio](https://formtxt.formai.studio/). That is the easiest way to install it.

**Keep it updated:** [FormPortal](https://github.com/nodemode-dev/formportal) installs, updates and rolls back every Form app from the same signed catalogue.

| Platform | Builds |
|---|---|
| macOS Apple silicon | `macos-arm64` |
| Linux | `linux-x64` |
| Windows | `windows-x64` |

All FormTxt builds are compiled and released from [`nodemode-dev/formcompiler`](https://github.com/nodemode-dev/formcompiler/releases), not from this repo. This repo holds the source.

## Run it from source

Prefer it in your browser, or want to contribute? Run the web UI straight from this repo.

**Requires:** Python 3.12 or newer and Node 20.19 or newer.

```sh
git clone git@github.com:nodemode-dev/formtxt.git
cd formtxt
./formtxt_oc_install      # backend venv and frontend packages
./formtxt                 # engine on 127.0.0.1:8210, web UI at http://localhost:5210
```

`./formtxt desktop dev` opens the desktop window instead, and `./build_app` builds the installable desktop app.

On Windows use `formtxt_oc_install.bat` then `formtxt.bat`. The engine listens on 127.0.0.1:8210 only; `FORMTXT_UI_PORT`, `FORMTXT_ENGINE_PORT` and `FORMTXT_DATA_DIR` (default `~/FormTxt`) override the ports and the library folder.

> [!IMPORTANT]
> **Status:** in development. Releases are not published yet, so run it from source or watch formai.studio. The planning roadmap lives outside this repo.

**Contributing:** branch from `main`, keep changes to source here, and leave packaging and releases to FormCompiler. See [`AGENTS.md`](AGENTS.md) and [`CLAUDE.md`](CLAUDE.md).

## Repository

`frontend/` is the web UI, `backend/` the FastAPI engine and its tests, `src-tauri/` the desktop shell, `setup/` the install, boot and build scripts, and `docs/` the format contract and images. Agents: [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md).

## The Form family

FormTxt is one of the **Form apps**: native creative tools that install, update and roll back through FormPortal and can all be driven by agents.

| | App | What it's for | Download | Code |
|:-:|---|---|---|---|
| <img src=".github/assets/family/form.md.png" alt="" width="32" height="32"> | **form.md** | Documents, databases and realtime editing together | [formai.studio](https://formmd.formai.studio/) | [GitHub](https://github.com/nodemode-dev/form.md) |
| <img src=".github/assets/family/format.png" alt="" width="32" height="32"> | **FormAT** | Chat and agent workspace on your key | [formai.studio](https://format.formai.studio/) | [GitHub](https://github.com/nodemode-dev/format) |
| <img src=".github/assets/family/formCAD.png" alt="" width="32" height="32"> | **FormCAD** | Drafting, parametric parts and NURBS surfaces | | [GitHub](https://github.com/nodemode-dev/formCAD) |
| <img src=".github/assets/family/formcel.png" alt="" width="32" height="32"> | **FormCel** | Spreadsheets agents can read and edit | [formai.studio](https://formcel.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formcel) |
| <img src=".github/assets/family/formcraft.png" alt="" width="32" height="32"> | **FormCraft** | Generate images, video, audio, 3D and worlds | | [GitHub](https://github.com/nodemode-dev/formcraft) |
| <img src=".github/assets/family/formcut.png" alt="" width="32" height="32"> | **FormCut** | Multi-track video editing with no upload | [formai.studio](https://formcut.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formcut) |
| <img src=".github/assets/family/formDAM.png" alt="" width="32" height="32"> | **FormDAM** | Photo library and asset manager | [formai.studio](https://formdam.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formDAM) |
| <img src=".github/assets/family/formdeck.png" alt="" width="32" height="32"> | **FormDeck** | Presentations and pitch decks | [formai.studio](https://formdeck.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formdeck) |
| <img src=".github/assets/family/formdesign.png" alt="" width="32" height="32"> | **FormDesign** | Page layout for print and the web | [formai.studio](https://formdesign.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formdesign) |
| <img src=".github/assets/family/formencoder.png" alt="" width="32" height="32"> | **FormEncoder** | Media encoding queue with presets | [formai.studio](https://formencoder.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formencoder) |
| <img src=".github/assets/family/formfabric.png" alt="" width="32" height="32"> | **FormFabric** | Sewing patterns draped with cloth simulation | | [GitHub](https://github.com/nodemode-dev/formfabric) |
| <img src=".github/assets/family/formlit.png" alt="" width="32" height="32"> | **FormLit** | Photo library and raw development | [formai.studio](https://formlit.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formlit) |
| <img src=".github/assets/family/formmorpheus.png" alt="" width="32" height="32"> | **FormMorpheus** | Frame-by-frame and performed animation | | [GitHub](https://github.com/nodemode-dev/formmorpheus) |
| <img src=".github/assets/family/formNET.png" alt="" width="32" height="32"> | **FormNET** | See what your computer sends online | | [GitHub](https://github.com/nodemode-dev/formNET) |
| <img src=".github/assets/family/formpath.png" alt="" width="32" height="32"> | **FormPath** | Vector illustration with artboards and type | [formai.studio](https://formpath.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formpath) |
| <img src=".github/assets/family/formpdf.png" alt="" width="32" height="32"> | **FormPDF** | Edit, redact, sign and fill PDFs | [formai.studio](https://formpdf.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formpdf) |
| <img src=".github/assets/family/formpromo.png" alt="" width="32" height="32"> | **FormPromo** | Promo films from your own media | [formai.studio](https://formpromo.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formpromo) |
| <img src=".github/assets/family/formref.png" alt="" width="32" height="32"> | **FormRef** | Reference boards for creative work | [formai.studio](https://formref.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formref) |
| <img src=".github/assets/family/formrig.png" alt="" width="32" height="32"> | **FormRig** | Rig, skin and retarget any mesh | | [GitHub](https://github.com/nodemode-dev/formrig) |
| <img src=".github/assets/family/formsculpt.png" alt="" width="32" height="32"> | **FormSculpt** | 3D sculpting, remeshing and painting | [formai.studio](https://formsculpt.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formsculpt) |
| <img src=".github/assets/family/formsurface.png" alt="" width="32" height="32"> | **FormSurface** | Texture painting with PBR export | [formai.studio](https://formsurface.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formsurface) |
| <img src=".github/assets/family/formtools.png" alt="" width="32" height="32"> | **FormTools** | Viewers, batch tools and file utilities | | [GitHub](https://github.com/nodemode-dev/formtools) |
| <img src=".github/assets/family/formtxt.png" alt="" width="32" height="32"> | **FormTxt** | Word processing with .docx round trips | [formai.studio](https://formtxt.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formtxt) |
| <img src=".github/assets/family/formvfx.png" alt="" width="32" height="32"> | **FormVFX** | Motion graphics and VFX compositing | [formai.studio](https://formvfx.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formvfx) |
| <img src=".github/assets/family/formvis.png" alt="" width="32" height="32"> | **FormVis** | Layered image editing with local AI | [formai.studio](https://formvis.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formvis) |
| <img src=".github/assets/family/formwav.png" alt="" width="32" height="32"> | **FormWav** | Multitrack audio editing and mixing | [formai.studio](https://formwav.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formwav) |
| <img src=".github/assets/family/formweb.png" alt="" width="32" height="32"> | **FormWeb** | Visual website building with a CMS | [formai.studio](https://formweb.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formweb) |
| <img src=".github/assets/family/formportal.png" alt="" width="32" height="32"> | **FormPortal** | Install, update and roll back Form apps | [formai.studio](https://formportal.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formportal) |
| <img src=".github/assets/family/formtray.png" alt="" width="32" height="32"> | **FormTray** | One dock icon for every app | [formai.studio](https://formtray.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formtray) |
| <img src=".github/assets/family/formMCP.png" alt="" width="32" height="32"> | **FormMCP** | One MCP connection to the family | [formai.studio](https://formmcp.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formMCP) |
| <img src=".github/assets/family/formskills.png" alt="" width="32" height="32"> | **FormSkills** | Every app's agent skills in one place | [formai.studio](https://formskill.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formskills) |
| <img src=".github/assets/family/formbench.png" alt="" width="32" height="32"> | **FormBench** | Parity, testing and rankings for the family | [formai.studio](https://formranker.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formbench) |
| <img src=".github/assets/family/formslot.png" alt="" width="32" height="32"> | **FormSlot** | Codebase memory for coding agents | | [GitHub](https://github.com/nodemode-dev/formslot) |
| <img src=".github/assets/family/subform.png" alt="" width="32" height="32"> | **SubForm** | Workbench for parallel Claude Code agents | | [GitHub](https://github.com/nodemode-dev/subform) |
| <img src=".github/assets/family/formcompiler.png" alt="" width="32" height="32"> | **FormCompiler** | Builds, signs and releases every app | [formai.studio](https://formcompiler.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formcompiler) |
| <img src=".github/assets/family/formpipe.png" alt="" width="32" height="32"> | **FormPipe** | Release pipeline and update feeds | | [GitHub](https://github.com/nodemode-dev/formpipe) |

## Maintainers

| Maintainer | Role |
|---|---|
| [@nodemode-ai](https://github.com/nodemode-ai) | Owner |
| [@gbarnai](https://github.com/gbarnai) | Co-owner |

Code owners are set in [`.github/CODEOWNERS`](.github/CODEOWNERS).

## License

FormTxt is licensed under the Apache License 2.0 ([`LICENSE`](LICENSE), SPDX `Apache-2.0`). Copyright 2026 NodeAgentc, Inc. Third-party notices: [`NOTICE.md`](NOTICE.md).

<sub>Screenshot content: a CC0 photo from Poly Haven and an original sample document.</sub>

<sub>Microsoft, Word and Office are trademarks of the Microsoft group of companies. Google Docs is a trademark of Google LLC. FormTxt is not affiliated with or endorsed by Microsoft or Google; the names describe file formats, key sets and compatibility only.</sub>
