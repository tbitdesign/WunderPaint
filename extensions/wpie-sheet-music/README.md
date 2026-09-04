# Sheet Music (wpie-sheet-music)

Engraved scores, chord sheets, chord diagrams, fretboard or keyboard
maps, and since 0.2 the lesson papeterie (manuscript paper, note cards,
scale sheets) from the user's own material, inserted as an editable vector group
(notes and lines as paths, titles, lyrics and chord names as text layers).
Free, category tools. Spec: `docs/superpowers/specs/2026-09-03-sheet-music-design.md`,
plan: `docs/superpowers/plans/2026-09-03-sheet-music.md`.

## Scripts

- `npm run build`  esbuild bundle -> extension.js (abcjs 6.7, MIT, is bundled: ~590 KB)
- `npm test`       node tests for the DOM-free engine modules and the i18n tables
- `npm run qa`     dialog QA on the shared mock (one headless browser)
- `npm run proof`  every starter rendered by the real engine -> dist/proof/sheet.png (look at it)

## How it is built

- `src/cards.js` holds the seven cards as pure functions `render(params, env)
  -> { svg, width, height, warnings }`. `env` carries what needs a browser:
  `renderScore` (abcjs), `measure` (canvas text widths), `t`, `kits`.
- `src/engine/` is DOM-free except `abc.js` (abcjs draws into a hidden
  element) and `xml2abc.js` (loads the vendored converter on demand).
- Colours and fonts are SVG attributes, never classes: the editor's SVG
  importer (`bridge.svg.importSvg`) reads attributes. `abc.js` strips the
  abcjs classes and styles and inlines the colours.
- The score is engraved in unscaled units; the size dial works through the
  viewBox (and a `<g transform="scale()">` on the paper), which both the
  importer and an `<img>` preview understand.
- `assets/xml2abc.js` is Wim Vree's MusicXML to ABC converter (LGPL-3.0,
  unmodified, licence next to it). It calls jQuery freely; `src/engine/
  xml2abc.js` installs a small jQuery-subset shim over the DOM around the
  call instead of bundling jQuery. `.mxl` is unzipped in the browser with
  DecompressionStream (deflate-raw), the magic bytes decide, not the name.
- Insert: the root `<svg>` is given the target box as width/height (the
  viewBox stays), so the importer scales every layer; the layers get the
  box offset and a group with `generator = { id, params }`. Without an SVG
  importer (older core, or when the import yields nothing) a PNG layer with
  the same params is inserted instead.

- `src/engine/notation.js` (0.2, DOM-free) builds the ABC of the lesson
  cards: `paperAbc()` (invisible rests `x` draw only clef, key, meter and
  bar lines; `%%score {1 2}` for the grand staff; `%%staffsep` for the
  spacing), `flashNotes()` / `flashAbc()` (one whole note per card, the
  ranges as letter and octave tables), `scaleAbc()` (a scale spelled
  against the key signature AND the bar: ABC accidentals hold for the
  bar, so a natural after a raised note is written `=`; diatonic scales
  ride on `K:root mode`, the rest carry explicit accidentals) and the
  standard piano fingerings as annotations `"^1"` (right) and `"_5"`
  (left). The cards hand the ABC to `env.renderScore` like the score.

## Bug classes met while building

- **`t( cond ? 'A' : 'B' )` is invisible to the i18n test.** Write
  `cond ? t( 'A' ) : t( 'B' )`.
- **Twelve scale systems on a fixed page overflow.** The twelve-key
  starters use the line format, which grows with the content.

- **abcjs `staffwidth` and `scale` are in different units.** Rendering with
  `scale > 1` and then rewriting width/height from `getBBox()` silently
  drops the scale (the SVG coordinates are unscaled). Engrave at scale 1
  and apply the factor through the viewBox.
- **`svg.outerHTML` of an inline SVG has no xmlns** and does not load as an
  image. Serialize with `XMLSerializer` and add the namespace if missing.
- **`%%score (1 2)` merges voices onto ONE staff**; a piano system needs
  the brace: `%%score {1 2}`.
- **xml2abc needs `$`**: without jQuery it returns an empty result and puts
  "ReferenceError: $ is not defined" into its info string. The shim covers
  find, text, attr, children, each, map, eq, add, get, first, filter, prop
  and `$.parseXML`.
- **Only allow-listed files ship** (`extensions/pkg-contents.sh`): a file
  next to extension.js that is not in `PKG_FILES` is silently left out of
  every deploy. Extra runtime files belong in `assets/`.
- **Tile labels in six languages do not fit 62 px on one line**; the name
  wraps to two lines at 9 px instead of being cut.
- **A dialog without a height grows and shrinks with its cards.** The `.wpiesm-dialog` class first set only a width; the columns were capped at 72vh and the body had a min-height, so every tile click resized the modal (Thomas, 04.09.). The dialog class now carries `height: min(900px, 94vh)` as a flex column, the body is `flex: 1; min-height: 0` and the columns scroll at `max-height: 100%`. The dialog QA measures the height across all cards.
