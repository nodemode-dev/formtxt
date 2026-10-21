# The .ftxt format

Version 1. This file is the contract: when the code and this file disagree, this file wins and the code is fixed.

## Package

A `.ftxt` file is a zip archive.

| Entry | Compression | Content |
| --- | --- | --- |
| `mimetype` | stored, first entry | the ASCII text `application/x-formtxt` |
| `document.json` | deflated | the document, UTF-8 JSON |
| `media/[name]` | stored | pictures and other binary parts, referenced from `document.json` by name |

Readers refuse a package whose `mimetype` differs, that lacks `document.json`, or whose `formatVersion` is newer than they know. Media names never contain `..`.

## Units and ids

Lengths are points (1/72 inch). Colours are `#rrggbb`. Ids are a prefix plus 4 to 40 lowercase letters or digits: `d_` document, `sec_` section, `tab_` document tab, `p_` paragraph, `t_` table, `c_` chart, `g_` diagram.

## document.json

| Key | Type | Meaning |
| --- | --- | --- |
| `format` | `"ftxt"` | fixed marker |
| `formatVersion` | integer | 1 |
| `id` | string | document id, also the library file name |
| `title` | string | up to 200 characters |
| `meta` | object | `author`, `created`, `modified` (Unix seconds), `subject`, `keywords`, `language` (BCP-47) |
| `settings` | object | `pageless`, `defaultTab` (points), `trackChanges`; optional `template` (`id`, `layout`, `accent`) recording the template a document came from, and `userTemplate` on saved templates |
| `styles` | object | style id to style (below) |
| `numbering` | object | list definitions, keyed by id (Phase 2) |
| `sections` | array | at least one section (below) |
| `tabs` | array | at least one document tab, each `id`, `title`, `parent` (tab id or null) and `body`; every tab shares the document's styles and sections |
| `notes` | object | `footnotes` and `endnotes`, keyed by id (Phase 5) |
| `comments` | object | keyed by id (Phase 6) |
| `variables` | object | optional document variables: name (up to 40 characters) to text value (up to 500); `variable` fields show them |
| `media` | object | media name to metadata: `type` (MIME type), `bytes`, optional `source` (the original file name) and `width` and `height` (pixels). The name is the first 20 hex digits of the file's SHA-256 plus its extension, so the same picture is stored once. Editors may keep media no run uses (so Undo can bring a picture back); downloads and copies drop it. A stock picture also carries `credit`: `source` (`openverse` or `pexels`), `id`, `title`, `creator`, `creatorUrl`, `license`, `licenseUrl`, `sourceUrl`, `provider` and `text` (the credit line as written under the picture) |

### Style

`type` (`paragraph`, `character`, `table` or `numbering`), `name` (display name), `basedOn` (style id or null), `next` (style id for the following paragraph), `run` (font, size, color, bold, italic, and later run properties) and `para` (spaceBefore, spaceAfter, lineSpacing as a multiple, align, indentLeft, indentRight, keepWithNext, outlineLevel). Style ids match WordprocessingML style ids, so `Heading1` maps to `w:styleId="Heading1"`. A `table` style has `table` instead of `run` and `para`: `look`, `align`, `repeatHeader`, and `header`, `firstCol`, `body` and `band` (each `{shading, valign, borders}` as on a table cell, or null when that part follows `body`); applying it sets the table's own attributes and every cell's shading, vertical alignment and borders by position (first row when it is a header row, first column, body, and every second body row for `band`).

### Section

`page` (`size` name, `width`, `height`, `orientation`), `margins` (`top`, `right`, `bottom`, `left`, `header`, `footer`, `gutter`), `columns` (`count`, `gap`), `headers` and `footers` (keyed `default`, `first`, `even`, each `{text, align}` where `{PAGE}` and `{NUMPAGES}` are fields), `titlePage` (different first page), `start` (`nextPage`, `continuous`, `evenPage`, `oddPage`), optional `pageNumberStart` (the number of the section's first page; when absent, numbering continues from the previous section), `pageNumberFormat` (`decimal`, `lowerRoman`, `upperRoman`, `lowerLetter`, `upperLetter`), `pageColor` and `pageBorder` (`thin`, `double`, `accent`). Each page is laid out with the `page` and `margins` of the section that owns it, so orientation, paper size and margins can change from one section to the next, and each section uses its own headers, footers, `titlePage` and numbering. `start` says where a section after the first begins: `nextPage` (default), `continuous` (on the same page; its left and right margins apply at once, its page size and top and bottom margins from the next page), `oddPage` or `evenPage` (a blank page is added when needed; odd and even count physical pages). `columns` sets text columns for the section's pages: `count` 1 to 4 (absent or 1 is one column) and `gap` the space between columns in points (default 36); text runs down each column and continues at the top of the next, and a paragraph can break between columns. A `continuous` section's columns start where it starts, below everything already on the page; a section with columns that is followed by a `continuous` section has its columns balanced to about the same height on that page. Document `settings` add `evenOdd` (different odd and even pages), `watermark` (text), `pageless` and `lineNumbers` (`continuous`, `page` or empty).

### Blocks

Each body entry has `type` and `id`. Version 1 defines:

| Block | Keys |
| --- | --- |
| `paragraph` | `style` (paragraph style id; headings are paragraphs styled `Heading1` to `Heading9`, as in Word), `section`, optional `props` (direct formatting: `align`, `indent`, `indentRight` and `indentFirst` in points with a negative first line hanging, `spaceBefore`, `spaceAfter`, `lineSpacing` as a multiple, `keepNext`, `keepLines`, `widowControl`, `border` of `box`, `top`, `bottom`, `left` or `right`, `shading` as `#rrggbb`, `tabs` as a list of `pos` in points, `align` of `left`, `center`, `right` or `decimal` and `leader` of `none`, `dot`, `dash` or `underline`, and `collapsed` on a heading folded in the editor), optional `list` (`kind` of `bullet`, `number` or `check`, `level` 0 to 8, `checked` for checklists, and for bullet and number lists optional `format` (`decimal`, `decimal-leading-zero`, `lower-alpha`, `upper-alpha`, `lower-roman` or `upper-roman`; absent cycles decimal, lower-alpha, lower-roman by level), `prefix` and `suffix` (text around the number, suffix `.` when absent), `start` (this item restarts its level at that number; later items continue from it) and `bullet` (one character replacing the level's bullet)), and `content` |
| `code` | `text`, the block's plain text |
| `pageBreak` | nothing else |
| `columnBreak` | nothing else; the next block starts at the top of the next column, or of the next page in a section's last column or in a one-column section |
| `sectionBreak` | `next`, the id of the section that starts after the break; blocks before the first break belong to `sections[0]` |
| `chart` | `kind` (`bar`, `hbar`, `line`, `area`, `donut`, `radial`, `number`, `gauge`, `histogram`, `dots`, `compare`, `heatmap` or `calendar`), `width` and `height` (points), `data` (`categories`, a list of labels, and `series`, each `{name, values}` with one number or null per category and an optional `color` of `orange`, `blue`, `teal`, `amber`, `rose`, `green`, `cyan`, `pink`, `violet` or `gray`), and optional `title`, `align` (`left` or `right`; absent is centred) and `options` (`labels`, `legend`, `smooth`, `stacked` as booleans, `fn` of `sum`, `average`, `min`, `max` or `count` for the number a `number`, `gauge` or doughnut shows, and `target`). A `calendar` chart reads its categories as `YYYY-MM-DD` dates. Charts are drawn from this data by the editor; nothing else is stored |
| `mermaid` | `code` (Mermaid source text, the truth), `svg` (the last drawing, sanitised SVG with no scripts, event attributes, foreignObject or outside links, so readers without Mermaid still show it), `w` and `h` (the drawing's natural size in CSS pixels), optional `width` (points shown; 0 or absent for the natural size, capped at the body width), `align` (`left`, `center` default, `right`), `alt` (alt text) and `error` (the parser message when `code` does not draw; `svg` then holds the last good drawing or is empty). Writers redraw from `code` whenever it changes |
| `diagram` | `layout` (`list-block`, `list-vertical`, `process-basic`, `process-chevron`, `cycle-basic`, `cycle-radial`, `hier-org`, `hier-horizontal`, `rel-venn`, `matrix-basic`, `pyramid-basic` or `timeline-basic`), `items` (a tree of `{text, children?}`), `width` and `height` (points), and optional `style` (`flat` default, `outline` or `shadow`), `colors` (`colorful` default, `accent1` to `accent6` for shades of one colour, or `dark`) and `align`. A SmartArt-style diagram is drawn from its items by the editor; only the items and settings are stored |
| `table` | `columns` (column widths in points, 0 for automatic), `rows` (each `{cells}`), optional `look` (`grid`, `plain`, `rows`, `banded` or `accent`; default `grid`), `repeatHeader` (repeat the leading rows made only of header cells on each page the table continues on; in pageless view the first header row stays pinned while scrolling), `rowSplit` (`false` keeps each row on one page; absent or `true` lets a row that does not fit continue on the next page, as Word's "Allow row to break across pages"), `style` (the id of a table style in `styles` that formatted it) and `align` (`center`, or absent for left) |

A table cell is `{body}` with optional `header` (`true` for a header cell), `colspan` and `rowspan` (default 1), `shading` (`#rrggbb`), `valign` (`middle` or `bottom`; absent is top) and `borders` (any of `top`, `right`, `bottom` and `left`, each `{style, width, color}` with `style` `solid`, `dashed`, `dotted`, `double` or `none`, `width` in points from 0.25 to 6 and `color` `#rrggbb`; a side that is present replaces the table look's line on that edge, `none` removes it, including the neighbour's shared line, and an absent side keeps the look). `body` is a list of blocks: paragraphs, code blocks, charts, diagrams and nested tables, never page or section breaks. A cell covered by another cell's span is not written, as in HTML; every row covers the same number of columns. Rows do not split across pages; a row taller than a page runs past its bottom margin.

Inline nodes in `content` are `text` (`text`, optional `marks`), `break` (a line break inside a paragraph), `image`, `shape`, `math` and `field` (below) and `tab` (a tab character, advanced to the paragraph's next tab stop or to the next multiple of `settings.defaultTab`, 36 points when unset). `marks` keys: `bold`, `italic`, `strike`, `superscript`, `subscript`, `smallCaps`, `allCaps`, `code` (each `true`), `underline` (`true` for single, or `double`, `dotted`, `dash`, `wavy`), `font` (family name), `size` (points), `spacing` (character spacing in points), `color` and `highlight` (`#rrggbb`), and `link` (address). Later phases add shapes, charts and the rest as new block and inline types; readers keep unknown types intact on save.

An `image` run is a picture anchored at its place in the paragraph: `media` (a name in `media/`), `width` and `height` (points, the size shown after cropping), and optional `alt` (alt text), `crop` (`t`, `r`, `b`, `l`, each the fraction of that edge removed, 0 to 0.9), `rotate` (degrees clockwise; the picture turns in place and keeps its layout box), `brightness`, `contrast` and `saturation` (percent, 100 unchanged, saturation 0 is greyscale), `transparency` (0 to 100), `wrap` (`inline` default, `square`, `tight`, `topBottom`, `behind` or `front`), `side` (`left` default, `right`, or `center` for `topBottom`) and `x` and `y` (points from the top left of the anchoring paragraph, used by `behind` and `front`), `border` (`#rrggbb`) and `borderWidth` (points) for a frame drawn inside the edge, `radius` (corner radius in points), `shadow` (a soft drop shadow) and `relative` (`paragraph` default, or `page`: for `behind` and `front`, `x` and `y` are measured from the top left of the page the anchoring paragraph is on, so the picture stays put while text moves). `square` and `tight` float the picture to `side` with text flowing around it; `tight` follows the picture's transparent edges when it has no crop or rotation.

A `shape` run is a drawing anchored in the paragraph like a picture: `kind` (`rect`, `roundRect`, `ellipse`, `triangle`, `rightTriangle`, `diamond`, `pentagon`, `hexagon`, `octagon`, `star`, `arrowRight`, `arrowLeft`, `arrowUp`, `arrowDown`, `chevron`, `callout`, `cloud`, `heart`, `plus`, `line`, `textBox` or `wordArt`), `width` and `height` (points), and optional `fill` and `stroke` (`#rrggbb`, empty for none), `strokeWidth` (points), `rotate`, `text` (plain text, `\n` between lines; always present so readers without rich text still show the words), `content` (optional formatted text: a list of paragraph blocks as in a table cell; when present it wins over `text`), `id` (`s_` plus letters and digits, so connectors can name the shape), `color`, `size` (points), `bold`, `font`, `align` (`left`, `center` default, `right`), `valign` (`top`, `middle` default, `bottom`), `wordart` (for `wordArt`: `fill`, `outline`, `shadow`, `gradient`, `glow` or `retro`, drawn with `fill` as the accent), `wrap` (`inline`, `square`, `topBottom`, `behind`, `front` default), `side`, `x`, `y` and `relative` as for pictures, `arrowStart` and `arrowEnd` (arrowheads on a `line` or `connector`), `shadow` (a soft drop shadow) and `gradient` (a second `#rrggbb`; the fill fades from `fill` at the top to it at the bottom). A `textBox` is a rectangle whose text starts top left. Two kinds draw a stored path instead of a generated outline: `icon` (`path` in a 24 by 24 box, `stroke` for outline icons or `fill` for filled ones, `alt` for screen readers) and `ink` (a freehand stroke: `path` in a `box` of `[width, height]` units stretched to the run's size, `stroke` and `strokeWidth` in points, which stays constant when resized). A `connector` joins two shapes: `from` and `to` are their ids, the line runs between the facing edge midpoints of the two shapes wherever they are laid out, and its own size and offsets are ignored; a connector whose shape is missing is not drawn. A `textBox` may have `next`, the id of another text box its text continues in: the chain's text is stored only in its first box (the one no other box names), later boxes keep empty `text` and `content`, and the text flows box by box at each box's width, each box ending at the last line that fits whole; text beyond the last box is clipped. A `next` naming a missing box, a box that is not a text box, or a box already in the chain ends the chain there. Any shape may have `opacity` (0 to 1, default 1); highlighter strokes are `ink` shapes with `wrap` `behind` and `opacity` 0.45.

A `math` run is an equation: `latex` (the source, in the LaTeX subset KaTeX renders) and optional `display` (`true` to show it centred on its own line). Word export writes it as OMML (Phase 7).

A `field` run is a computed value: `kind` (`formula` or `variable`), `code` (the formula, starting with `=`, or for `variable` the variable's name, whose value from the top-level `variables` is copied into `result`, or `!name` with an `error` when the variable is missing), optional `format` (a number picture), and `result` (the last computed text, always written so readers that do not calculate still show the value) and `error` (the message when the formula failed; `result` then starts with `!`). A formula combines numbers, quoted text, `TRUE` and `FALSE` with `+ - * / ^`, `%` (remainder), `&` (joins text), comparisons (`= <> < <= > >=`) and functions (`SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `PRODUCT`, `MEDIAN`, `IF`, `AND`, `OR`, `NOT`, `ABS`, `INT`, `ROUND`, `MOD`, `POWER`, `SQRT`, `SIGN`, `CONCAT`, `UPPER`, `LOWER`, `LEN` and the rest listed in the engine), with `,` or `;` between arguments. Inside a table it can name cells as `A1` (column letter, row number from the top of the table, merged cells read from their top left), ranges as `B2:B5`, and `ABOVE`, `BELOW`, `LEFT` and `RIGHT` for the run of numbers next to its cell in that direction. Cell text is read as a number when it is one, allowing `$`, thousands commas, a trailing `%` and brackets for negatives. `format` follows Word's number pictures: `0` and `#` digits, `,` grouping, `.` decimals, a literal prefix or suffix such as `$`, and a trailing `%` to show a percentage. Writers recalculate on open and whenever the table changes; Word export writes the field as `= code \# "format"` with `result` as its cached value (Phase 7).

A `chip` run is a smart chip: `kind` and its data, plus `text` (the label as last shown, written so readers without chips still show it). `date` has `date` (`YYYY-MM-DD`) and `format` (`short`, `long`, `numeric` or `iso`; shown in the reader's locale). `person` has `name` and `email` (either may be empty, not both). `dropdown` has `options` (up to 30 of `{label, color}`, `color` `#rrggbb` or empty) and `value` (one of the labels, or empty for none chosen). `placeholder` has `name` (up to 60 characters; filling in a name replaces every placeholder with that name by plain text). `doc` has `doc` (the id of another document in the same library) and `title` (its title when linked; the link follows the id, so it still opens after a rename, while the chip keeps showing the stored title until it is changed). Word export writes dates and people as text, dropdowns as a dropdown content control and document links as hyperlinks (Phase 7).

## References

Generated blocks, notes, bookmarks, captions, cross-references, the index, citations and link chips. Ids of generated blocks use the prefix `r_` and 4 to 40 lowercase letters or digits. Every generated value is stored as plain text next to its data, so a reader without FormTxt still shows the words.

### Generated blocks

Four blocks share one shape: `title` (the heading shown above the entries), `entries` and optional `opts`. An entry is `{text}` with optional `level` (indent, 0 to 8), `page` (the page label as text, in the section's page number format; absent in pageless view), `target` (what the entry jumps to), `n` (a leading number or label such as `3` or `[2]`), `heading` (`true` for an index letter heading, `text` is the letter) and `em` (substrings of `text` shown in italics). A `target` is the `id` of a paragraph, `bm:` plus a bookmark name, or `note:` plus a note id. Writers recompute entries on command (Update references, F9) and on open for notes; readers keep stored entries as written.

| Block | Keys |
| --- | --- |
| `toc` | table of contents. `opts`: `from` and `to` (heading levels, default 1 and 3), `pages` and `links` (booleans, default true). Entries are the headings in range, `level` counted from `from` |
| `tableOfFigures` | `opts.label` (the caption label, default `Figure`). Entries are the captions with that label, `text` the whole caption such as `Figure 1: Sales` |
| `index` | entries from `indexEntry` runs, alphabetical with letter headings; a subentry has `level` 1; `page` lists the pages joined by `, ` |
| `bibliography` | `opts.scope` (`cited` default, or `all`) and `opts.style` (the citation style it was written in). Entries are the formatted sources, ordered by the style (author and year for `apa`, `mla` and `chicago`, order of first citation for `ieee`, which also sets `n` to `[1]`) |
| `notes` | `opts.kind` (`footnote` or `endnote`). Entries are `n` (the note's number, `1, 2, 3` or `i, ii, iii`), `text` and `target` (`note:` plus the note id). FormTxt keeps one block per kind at the end of the document, footnotes first |

### Inline runs

| Run | Keys |
| --- | --- |
| `noteRef` | `id` (`n_` plus letters and digits), `kind` (`footnote` or `endnote`), `n` (the shown number), `note` (the note text, plain), `text` (the shown number). Deleting the run deletes the note; numbers follow the order of the runs in the document |
| `bookmark` | `name` (a letter, then letters, digits or underscores, up to 40; unique in the document), optional `covers` (the text selected when it was added, shown by cross-references), `text` (empty). A bookmark is a point |
| `sequence` | a caption number: `label` (`Figure`, `Table`, `Equation` or any word), `n` (the running number for that label, from 1, in document order), `text` (`Figure 1`). A caption is a paragraph styled `Caption` that holds a `sequence` run and then its text |
| `crossRef` | `kind` (`heading`, `bookmark`, `caption` or `note`), `target` (the paragraph id for `heading` and `caption`, the bookmark name, or the note id), `what` (`text`, `page`, `label` or `number`), `text` (the last computed result, empty when the target is missing) |
| `indexEntry` | `main` and optional `sub`; `text` is empty. Shown on screen as a small tag and not printed |
| `citation` | `items` (a list of `{id, locator}`: a source id from the top-level `sources` and an optional page or locator), `text` (the citation as formatted in the document's style) |
| `linkChip` | a link shown as a chip: `href` (http or https), `title` (page title, or the host name when the title was not fetched), `site` (site name or host), optional `desc` (the page's description, up to 300 characters, shown in the preview card), `text` (the title) |

A link mark whose address starts with `#` points inside the document: `#` plus a paragraph id (a heading) or `#bm:` plus a bookmark name.

### Sources and citation style

The document's top-level `sources` is a list of `{id, type, authors, title, year, month, day, container, publisher, place, edition, volume, issue, pages, number, url, doi, accessed}`. `id` is `s_` plus letters and digits; `type` is `book`, `article`, `website` or `report`; `authors` is a list of `{family, given}` (an organisation is one `family` with an empty `given`); all other values are text. `container` is the journal or the website name. `settings.citationStyle` is `apa` (APA 7), `mla` (MLA 9), `chicago` (Chicago author-date) or `ieee`; absent means `apa`. Writers keep unknown keys of a source.

## Review

Three text marks carry review data. `comment` is a list of comment ids (a single id string is also read) and tints the run; ranges may overlap, so one run can belong to several comments. `ins` and `del` are tracked changes: each is `{id, author, time}` where `id` is `r_` plus letters and digits (runs with the same id and kind form one change), `author` is the name of the person or agent, and `time` is Unix seconds. An `ins` run is text that was added and is drawn underlined in the author's colour; a `del` run is text still in the document that is proposed for removal and is drawn struck through. A run may carry both when someone deletes text another person inserted. Accepting an `ins` removes the mark; accepting a `del` removes the run; rejecting does the opposite. Readers that do not track changes show every run as plain text.

`settings.trackChanges` is `true` when the document is in Suggesting mode, so new edits are recorded as `ins` and `del` marks; Editing and Viewing are `false` (Viewing is a per-session read-only view and is not stored).

The top-level `comments` object is keyed by comment id (`c_` plus letters and digits). Each comment is:

| Field | Type | Meaning |
|---|---|---|
| `id` | string | the key |
| `author`, `time` | string, number | who wrote it and when (Unix seconds) |
| `text` | string | the comment, up to 8000 characters; `@Name` mentions a person; empty for a reaction-only comment on highlighted text |
| `quote` | string | the commented text when the comment was made (up to 240 characters), kept so the thread reads even if the text changes |
| `resolved` | boolean | resolved threads are hidden by default and their text is not tinted |
| `assignee` | string | name the thread is assigned to, empty when unassigned |
| `mentions` | array | names mentioned in the thread |
| `reactions` | object | reaction to the list of names who gave it; the key is one of `like`, `love`, `agree`, `celebrate`, `question`, or an emoji character |
| `replies` | array | in order, each `{id, author, time, text, reactions}` with `id` starting `r_` |

A comment whose id is on no run is kept in the file but is not listed. Editing or deleting a comment or reply is limited to its author. A link to a comment is the app address with `?doc=<document id>&comment=<comment id>`; opening it opens the document and selects the comment.

Compare, suggest and combine (engine: `POST /api/review/compare`) diff two documents paragraph by paragraph and word by word and write the differences as `ins` and `del` marks attributed to the other document's author (its `meta.author`, or a name passed in the request). Combine also copies the other document's comments, giving them new ids, and keeps its own tracked changes.

## Versions and protection

Versions, activity and recovery copies live beside the library, never inside the `.ftxt` package. Everything below is optional; readers that ignore it still open the document.

### Document properties

`meta` keeps `author`, `subject`, `keywords` (a list of strings), `created` and `modified` (seconds since the epoch), and adds `category` (up to 200 characters) and `comments` (up to 2000). `title` is the top-level title. Word count is computed, not stored.

### Settings

| Key in `settings` | Value |
| --- | --- |
| `protection` | `{mode, salt, hash}`. `mode` is `readonly`, `comments`, `tracked` or `forms`; `salt` and `hash` (PBKDF2 with SHA-256, 100000 rounds, as hex) are present only when a password is needed to turn the restriction off. This is a restriction the editor enforces, not encryption |
| `approval` | `{status, note, due, requestedAt, people}`. `people` is a list of `{name, status, comment, at}` with `status` of `pending`, `approved` or `rejected`; `status` overall is `rejected` when anyone rejected, `approved` when everyone approved, else `pending`. An approved document is read only until the `approval` key is removed |
| `mailMerge` | `{source, columns, rows}`: the data file name, the column names (up to 60) and the records (up to 2000, each a list of text in column order) used by `mergefield` runs |

### Inline runs

A `control` run is a content control: `kind` (`text`, `richtext`, `checkbox`, `date` or `dropdown`), `title`, `text` (the value as last shown, empty when the placeholder is showing), and optional `tag` (a name for automation), `placeholder`, `options` (the items of a `dropdown`), `format` (a date picture for `date`, such as `MMMM d, yyyy`), `checked` (for `checkbox`) and `content` (the value as text runs with marks, written only when formatted). A document restricted to `forms` accepts edits only inside `text` and `richtext` controls and to the value of the other kinds.

A `mergefield` run is a mail merge field: `name` (a column of `settings.mailMerge`) and optional `marks` (bold, italic, underline, strike, color, font, size, highlight). Finishing a merge replaces it with the record's value.

A `field` run (see Blocks) also has `kind` `info`: `code` is `DATE`, `TIME`, `CREATEDATE`, `SAVEDATE`, `AUTHOR`, `FILENAME`, `TITLE`, `SUBJECT`, `NUMWORDS` or `NUMPAGES`, `format` is a picture (`M/d/yyyy`, `MMMM d, yyyy`, `h:mm AM/PM`, `HH:mm`, with `yyyy yy MMMM MMM MM M dddd ddd dd d HH H hh h mm ss AM/PM`) for dates and times, `upper`, `lower` or `title` for text, and `#,##0` or `0` for counts. `result` is the last computed text; writers update it when the document opens and when it changes.

### Blocks

A `signatureLine` block is a place to sign: `id`, `signer`, optional `title` and `instructions`. It draws an X, a rule, the signer name, the title and the instructions.

### Encryption at rest

A password-protected document is stored as one encrypted envelope instead of the zip: the 8 bytes `FTXTENC1`, a 4 byte big-endian length, a JSON header (`v`, `id`, `title`, `created`, `modified`, `kdf` of `pbkdf2-sha256`, `iter` of 600000, `salt` in base64), a 12 byte nonce and the AES-256-GCM ciphertext of the ordinary `.ftxt` package, with the header as authenticated data. The title and times stay readable so the library can list the document as locked. Saved versions of a protected document are sealed the same way.

### Engine sidecars

`Versions/<document id>/` holds `index.json` and one `v_<milliseconds>.ftxt` snapshot per version (`id`, `ts`, `name`, `auto`, `author`, `words`, `bytes`, `reason`). A snapshot is taken at most every five minutes while a document is saved, and when the document is opened and has changed since the last one. Automatic versions are thinned (all in the last hour, one per hour for a day, one per day after, at most 100); named versions are kept (up to 200). `Activity/<document id>.json` lists opens and saves with the person or `Agent` (edits that arrive within a few seconds of a command run through the command line or live bridge). The `cloudFolder` setting names a folder that receives a copy of every save.

## Exchange

Other file formats are converted at the edge; the `.ftxt` stays the only stored form.

`settings.compatMode` (string, optional) is `word97` on a document read from a Word 97-2003 `.doc` file. The editor shows "Compatibility Mode" in the status bar while it is set; the command `exchange.convertCompat` removes the key. Nothing else changes in the document.

Engine endpoints. `GET /api/documents/{id}/export?format=` returns the saved document as `docx`, `dotx`, `odt`, `rtf`, `txt`, `html`, `md` or `epub`. `POST /api/documents/{id}/export?format=` takes the open (possibly unsaved) document JSON as the body and uses the saved media. `POST /api/exchange/import` and `POST /api/documents/import` accept `.docx .dotx .docm .odt .ott .rtf .html .htm .xhtml .doc .dot .md .markdown` (and `.txt`, `.ftxt` where they already worked) and add the result to the library.

Mapping rules shared by every writer:

- Lengths are points. Chart, mermaid and diagram blocks are written as a data table, a code block or a bullet list. Generated blocks (`toc`, `tableOfFigures`, `index`, `bibliography`) are written as their stored entries under the title; the `notes` block is not written.
- Runs `sequence`, `crossRef` and `citation` are written as their `text`; `linkChip` as a link; `bookmark` and `indexEntry` are left out. `noteRef` becomes a native footnote or endnote in `docx`, `odt` and `rtf`, a numbered list at the end in `html` and `epub`, a `[^f1]` or `[^e1]` definition in `md`, and a `[1]` list in `txt`. Readers of those formats make `noteRef` runs again, with `note` as plain text.
- Several tabs are written as one file with each tab title as a heading (a heading level below its parent); `epub` writes one chapter per top-level heading, or per tab when there are several.
- A page break is written as page-break-before on the next paragraph. A section break starts a new section with its own page size, margins, columns, headers and footers. `{PAGE}` and `{NUMPAGES}` in header and footer text are written as page fields.
- Lists keep kind, level, start number and number format; a check list is a checkbox control in `docx`, a leading glyph in `rtf` and `odt`, and `data-check` in `html`.
- Pictures are embedded (`docx`, `odt`, `rtf`, `epub`) or written as data URIs (`html`, `md`). An `svg` or `webp` picture is written as PNG where the format needs it. Math is written as OMML in `docx`, as `$...$` in `md`, and as the LaTeX text elsewhere.
- Readers keep named styles, direct character and paragraph formatting, tables with merged cells and shading, headers and footers, sections, hyperlinks and pictures. Unknown content is dropped, never turned into an error. The `.doc` reader recovers text, character and paragraph formatting, headings, tables, section page setup, header and footer text and page fields; pictures, merged cells and note text are not read.
- Markdown import reads headings, lists, check lists, quotes, fenced code (a `mermaid` fence becomes a `mermaid` block), pipe tables, footnotes, `$` math and images given as data URIs. The first level one heading becomes the title.

## Print

Printing and PDF add no blocks, runs or marks. They read the fields above, and one field is written when a PDF is opened as a document.

| Where | Key | Meaning |
| --- | --- | --- |
| `settings` | `importedFrom` | `pdf` on a document made by File > Open a PDF; absent otherwise. Readers may ignore it. |
| section `page` | `size` | `custom` when a section made from a PDF page has dimensions that match no named paper size; `width` and `height` still give the size. |

PDF export (File > Export to PDF, `GET /api/documents/{id}/export.pdf`) writes every tab's body in tab order. Each section sets the page size, orientation, margins, gutter, text columns (a `columnBreak` moves to the next column), page colour and page border of its pages; `headers` and `footers` are drawn per page with `{PAGE}` and `{NUMPAGES}` filled in, honouring `titlePage`, `evenOdd`, `pageNumberStart` and `pageNumberFormat`; `watermark` is drawn on every page. A section that starts `continuous` with the same page size, margins and columns as the one before continues on the same page; one with a different layout starts a new page. `oddPage` and `evenPage` add a blank page when needed. Paragraph styles resolve through `basedOn`, then the paragraph's `props` apply on top. Runs keep bold, italic, underline, strike, superscript, subscript, small caps, all caps, code, colour, highlight, size, font and links; lists, tab stops with leaders, paragraph shading and borders, tables (column widths, spans, shading, per-edge borders, `look`, `repeatHeader`), pictures from `media` (crop, rotation, brightness, contrast, saturation, transparency and border are applied; pictures are always placed in line) and charts of kind `bar`, `hbar`, `line`, `area` and `donut` are written. Fonts: the bundled document font families are embedded when their files are reachable; any other family name is mapped to a bundled or standard font of the same kind. Drawn shapes, Mermaid and diagram blocks, line numbers and the remaining chart kinds are not drawn; the export reports what it left out.

Accessibility: the PDF carries the document `title`, `meta.language`, `meta.author`, subject and keywords; an outline built from paragraphs whose style has an `outlineLevel`; tagged structure for headings (`H1` to `H6`), paragraphs, lists (`L`, `LI`, `LBody`), tables (`Table`, `TR`, `TH`, `TD`) and figures with the picture's `alt` text; headers, footers, page colour, borders and watermarks are marked as artifacts.

Open a PDF (File > Open a PDF, `POST /api/print/open-pdf`) creates a new document: one section per run of equal page sizes, margins estimated from the text, headers and footers recovered from lines that repeat across pages (a number equal to the page number becomes `{PAGE}`), headings from font sizes, lists from bullet and number markers, tables from ruled tables, monospaced lines as `code` blocks, links from link annotations, and pictures cropped from the page into `media`. Page breaks, columns and floating objects are not kept.

## Proofing and language

Proofing adds one text mark, two paragraph properties and two document settings, and no new block or run. Spelling, grammar, AutoCorrect and dictation results are ordinary text; nothing about a check is stored in the document.

| Where | Key | Meaning |
|---|---|---|
| text mark in `marks` | `lang` | A BCP 47 language tag such as `en-GB` or `fr-FR` for that run. A run without it uses the document language. The tag `zxx` means "do not check spelling or grammar" for that run. Readers that do not proof keep it as is. |
| `meta` | `language` | The document language, the default for every run without a `lang` mark. Default `en-US`. It is also the language of the page for hyphenation and for the browser's `lang` attribute. |
| `settings` | `hyphenate` | `true` turns automatic hyphenation on for the whole document, using the language of each run. Absent or `false` is off. |
| paragraph `props` | `dir` | `rtl` makes the paragraph read right to left. Absent means left to right. Alignment is stored relative to the direction the way Word stores it, so switching direction swaps an explicit `left` and `right`; indents (`indentLeft`, `indentRight` in styles, `indent` and `indentRight` in props) and list markers are mirrored on screen. |
| paragraph `props` | `noHyphen` | `true` keeps the paragraph from being hyphenated automatically. |

An optional hyphen is the character U+00AD inside a text run. JSON writers may write it as `­`. It shows only where the word breaks at the end of a line, and spelling checks ignore it.

A chart's `options` object may carry `alt`, a plain description of the chart for screen readers and the accessibility checker.

The personal dictionary, the AutoCorrect list and the spelling and grammar switches are not part of a document. The engine keeps them in `proofing.json` in its data folder and serves them at `GET` and `PUT /api/proofing/prefs`. AutoCorrect keeps the user's own `entries` (text to replacement), the built-in entries the user `removed`, entries switched off (`disabled`) and the rule switches (`rules`: `list`, `smartQuotes`, `dashes`, `symbols`, `arrows`, `fractions`, `capitalize`, `ellipsis`). Spelling uses the SCOWL based English dictionaries (en-US, en-GB, en-AU, en-CA) bundled with the engine; `POST /api/proofing/spell` takes a language and a list of words and returns the ones it does not know, and `POST /api/proofing/suggest` returns replacements for one word.

## AI

AI features add one paragraph property and no new block, run or mark. Everything the assistant writes is stored as ordinary paragraphs, headings, lists, tables, text runs and pictures, so a document written with AI opens the same everywhere. Nothing about a provider, a model, a key or a prompt is written into the document.

| Property | Where | Meaning |
| --- | --- | --- |
| `aiBlock` | a paragraph's `props` | `"summary"` marks the paragraphs of a Summary block: a `Heading2` paragraph reading "Summary" followed by the summary's paragraphs and list items, kept together at the top of the document (after a `Title` paragraph when there is one). Editors draw the run of consecutive paragraphs that carry it as one tinted block with an accent rule. Refreshing the summary replaces exactly that run; with no marked paragraph a new block is added at the top. Readers that do not know the property show the paragraphs as normal text |

A picture made by the image endpoint is stored like any picture: the file under `media/`, a `media` entry with `type`, `bytes`, `width`, `height` and `source` set to `AI generated`, and an `image` run. A banner is an `image` run alone in the first paragraph of the document with `width` equal to the body width, a `crop` of `t` and `b` (or `l` and `r`) that gives it a 3 to 1 shape, followed by an optional `Title` paragraph.

A translated document is a new document with its own id: the same tabs, sections, styles, tables and pictures, every paragraph's text replaced by its translation (the marks of the paragraph's first text run apply to the whole translated text; runs other than text, such as pictures and chips, stay), `title` extended with the language in brackets and `meta.language` set to the language code.

Copying a format from another document needs no AI: the `styles` of the other document are laid over this document's `styles` by id, and the first section's `page`, `margins` and `columns` (and `settings.defaultTab`) are copied onto every section of this document.

Engine settings for AI live in the engine's data folder, apart from `document.json`: `enabled` (off by default), `provider` (`anthropic` or `openai`), `model`, `baseUrl`, `key`, `effort` (`fast`, `balanced` or `thorough`), and `imageBaseUrl`, `imageKey` and `imageModel` for an OpenAI-compatible images endpoint. Keys are never returned by any endpoint and are never part of a document.

## Objects, fields and forms

### Typography marks

Four more keys in a text run's `marks`, written only when set:

| Key | Value | Meaning |
| --- | --- | --- |
| `kerning` | number, points | Kern text at this size and above (`0` kerns every size). Smaller text is not kerned. |
| `scale` | number, percent 20 to 600 | Horizontal scale of the letters, as Word's Advanced font tab. `100` is not written. |
| `position` | number, points | Raised (positive) or lowered (negative) from the baseline; `0` is not written. |
| `features` | object | OpenType settings: `ligatures` (`none`, `standard`, `contextual`, `discretionary` or `all`), `numberForm` (`lining` or `oldstyle`), `numberSpacing` (`proportional` or `tabular`) and `stylisticSet` (1 to 20). An absent member leaves the font's default. Readers whose font lacks a feature ignore it. |

`spacing` (character spacing) is unchanged. A scaled run is drawn as one unit and does not wrap inside the run.

### Paragraph props

Two more keys in a paragraph's `props`, written only when set. `dropCap` is `{mode, lines, distance, font}`: `mode` is `dropped` (the enlarged first letter sits in the text) or `margin` (it hangs in the left margin), `lines` is 1 to 10 lines the letter spans, `distance` is the space after it in points, and `font` is an optional family. `multilevel` (`legal`, `outline` or `article`) numbers a numbered list paragraph by its `list.level`: `legal` writes 1, 1.1, 1.1.1; `outline` writes I., A., 1., a., (1), (a), (i); `article` writes Article I., Section 1.01, (a), (i). The `list.format`, `prefix` and `suffix` of such a paragraph are ignored. Document `settings.headingNumbers` (`true`) numbers Heading1 to Heading3 paragraphs that are not list items as 1, 1.1 and 1.1.1 throughout.

### Fonts

Fonts added to the library live in the library's `Fonts` folder, outside any document. Document `settings.embedFonts` (`true`) asks the editor to store the added fonts the document uses inside the package, and `settings.embeddedFonts` lists them: each `{family, weight, style, media, bytes}`, where `media` names a `.ttf`, `.otf`, `.woff` or `.woff2` file in `media/`. Readers register each listed font under its `family` before showing the text, so the document looks the same where the font is not installed. Embedded font files are kept by downloads and copies while listed.

### Media objects

Four inline runs, each anchored in the paragraph like a picture. Common keys: `width` and `height` (points), and optional `wrap` (`square` floats the object to `side`, `left` or `right`; absent is in the line).

| Run | Keys |
| --- | --- |
| `video` | `media` (a name in `media/`: `.mp4`, `.m4v`, `.mov`, `.webm` or `.ogv`), `name` (the file name shown), `bytes`, `mime`. Shown with native controls. |
| `audio` | as `video` for `.mp3`, `.wav`, `.ogg`, `.oga`, `.opus`, `.m4a`, `.aac` or `.flac`. |
| `embed` | `media` (any file in `media/`), `name`, `bytes`, `mime`, and optional `thumb` (a picture name in `media/`, the first page of a PDF), `pages` and `rows` (the first up to 7 rows by 6 columns of a `.csv`, `.tsv` or `.xlsx` file as lists of strings, shown as a table preview). Shown as a card with its name and size; opening it downloads the file. |
| `onlineVideo` | `provider` (`youtube` or `vimeo`), `id` (the video id), optional `hash` (a Vimeo unlisted key), `link` (the page address), `title`, `author`, and `poster` (a picture name in `media/`, fetched once when the video was inserted). The provider's player loads only when a reader presses play, in a sandboxed frame using `youtube-nocookie.com` or `player.vimeo.com` with tracking off. Without a network the poster, title and link still show. |

Names in `media/` follow the picture rule (SHA-256 prefix and extension). Downloads and copies keep the files that `video`, `audio`, `embed` (`media` and `thumb`), `onlineVideo` (`poster`) runs and `settings.embeddedFonts` name, and drop the rest. The `doc.media` map describes them as it does pictures (`type`, `bytes`, `source`).

### Linked chart data

A `chart` block's `options.source` links it to a data file: `{path, sheet, mtime, name}`. `path` is an absolute path on the computer, or `library:` plus the name of a `.csv`, `.tsv`, `.txt` or `.xlsx` file in the library's `Library` folder; `sheet` names the worksheet of an `.xlsx` file (the first when empty); `mtime` is the file's modification time when the numbers in `data` were read. On open, and when the window regains focus, the editor rereads a linked file whose modification time differs, rebuilds `data` from its rows (the first row is the series names, the first column the categories, series colours are kept by name) and writes the new `mtime`. A file that cannot be read leaves `data` as it was. Other readers show `data` and may ignore `source`.

## Live and views

### Live editing and components

Co-editing, share links, publishing, macros and add-ins keep their state in the engine's data folder (`Collab/` and `Add-ins/`), not inside a `.ftxt` file. The only addition to `document.json` is the `component` block.

A `component` block is a synced block: a copy of a component kept in the library (`Collab/components.json`, served at `/api/collab/components`). Keys: `id`, `component` (the library id, `cmp_` plus letters and digits), `name` (shown above the block), `rev` (the revision of the component when this copy was last updated), optional `source` (the id of the document whose pictures the content names), and `content`, a list of blocks as in a table cell (paragraphs, code blocks and tables, never another component). `content` is always written, so readers that know nothing about components show it as ordinary blocks. Editors replace `content` with the library's current blocks when a document opens and, while documents are open, whenever another document changes the component. Readers may treat a `component` block as its `content`; a component that no longer exists leaves the copy as written.

Live editing uses `/api/collab/{docId}` over a WebSocket. Per open document tab the engine keeps a version, a base document in ProseMirror JSON and the list of steps since that base, in memory only; the first window to join sets the base, and the engine drops the session when the last window leaves. Windows persist through the ordinary document save.
