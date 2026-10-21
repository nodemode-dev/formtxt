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

Lengths are points (1/72 inch). Colours are `#rrggbb`. Ids are a prefix plus 4 to 40 lowercase letters or digits: `d_` document, `sec_` section, `tab_` document tab, `p_` paragraph, `t_` table.

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
| `media` | object | media name to metadata (Phase 4) |

### Style

`type` (`paragraph`, `character`, `table` or `numbering`), `name` (display name), `basedOn` (style id or null), `next` (style id for the following paragraph), `run` (font, size, color, bold, italic, and later run properties) and `para` (spaceBefore, spaceAfter, lineSpacing as a multiple, align, indentLeft, indentRight, keepWithNext, outlineLevel). Style ids match WordprocessingML style ids, so `Heading1` maps to `w:styleId="Heading1"`.

### Section

`page` (`size` name, `width`, `height`, `orientation`), `margins` (`top`, `right`, `bottom`, `left`, `header`, `footer`, `gutter`), `columns` (`count`, `gap`), `headers` and `footers` (keyed `default`, `first`, `even`, each `{text, align}` where `{PAGE}` and `{NUMPAGES}` are fields), `titlePage` (different first page), `start` (`nextPage`, `continuous`, `evenPage`, `oddPage`), optional `pageNumberStart` (the number of the section's first page; when absent, numbering continues from the previous section), `pageNumberFormat` (`decimal`, `lowerRoman`, `upperRoman`, `lowerLetter`, `upperLetter`), `pageColor` and `pageBorder` (`thin`, `double`, `accent`). Version 1 editors lay out every page with the first section's `page` and `margins`; later sections keep their own values for exchange, and use their own headers, footers, `titlePage` and numbering. Document `settings` add `evenOdd` (different odd and even pages), `watermark` (text), `pageless` and `lineNumbers` (`continuous`, `page` or empty).

### Blocks

Each body entry has `type` and `id`. Version 1 defines:

| Block | Keys |
| --- | --- |
| `paragraph` | `style` (paragraph style id; headings are paragraphs styled `Heading1` to `Heading9`, as in Word), `section`, optional `props` (direct formatting: `align`, `indent`, `indentRight` and `indentFirst` in points with a negative first line hanging, `spaceBefore`, `spaceAfter`, `lineSpacing` as a multiple, `keepNext`, `keepLines`, `widowControl`, `border` of `box`, `top`, `bottom`, `left` or `right`, `shading` as `#rrggbb`, `tabs` as a list of `pos` in points, `align` of `left`, `center`, `right` or `decimal` and `leader` of `none`, `dot`, `dash` or `underline`, and `collapsed` on a heading folded in the editor), optional `list` (`kind` of `bullet`, `number` or `check`, `level` 0 to 8, `checked` for checklists), and `content` |
| `code` | `text`, the block's plain text |
| `pageBreak` | nothing else |
| `sectionBreak` | `next`, the id of the section that starts after the break; blocks before the first break belong to `sections[0]` |
| `table` | `columns` (column widths in points, 0 for automatic), `rows` (each `{cells}`), optional `look` (`grid`, `plain`, `rows`, `banded` or `accent`; default `grid`), `repeatHeader` (repeat the leading rows made only of header cells on each page the table continues on) and `align` (`center`, or absent for left) |

A table cell is `{body}` with optional `header` (`true` for a header cell), `colspan` and `rowspan` (default 1), `shading` (`#rrggbb`) and `valign` (`middle` or `bottom`; absent is top). `body` is a list of blocks: paragraphs, code blocks and nested tables, never page or section breaks. A cell covered by another cell's span is not written, as in HTML; every row covers the same number of columns. Rows do not split across pages; a row taller than a page runs past its bottom margin.

Inline nodes in `content` are `text` (`text`, optional `marks`) , `break` (a line break inside a paragraph) and `tab` (a tab character, advanced to the paragraph's next tab stop or to the next multiple of `settings.defaultTab`, 36 points when unset). `marks` keys: `bold`, `italic`, `strike`, `superscript`, `subscript`, `smallCaps`, `allCaps`, `code` (each `true`), `underline` (`true` for single, or `double`, `dotted`, `dash`, `wavy`), `font` (family name), `size` (points), `spacing` (character spacing in points), `color` and `highlight` (`#rrggbb`), and `link` (address). Later phases add tables, pictures and the rest as new block and inline types; readers keep unknown types intact on save.
