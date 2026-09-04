# Party Printables (wpie-party-printables)

Printable party items on a real sheet, in one theme, inserted as a
300 dpi picture per sheet (further sheets become pages). Sixty-nine items in four groups (cards
and stationery, gifts and favors, decor, games with puzzles and awards),
sixteen occasions, thirty palettes, fifteen patterns, forty-one motifs,
156 starters. Free, category
print. Spec: `docs/superpowers/specs/2026-09-04-party-printables-3-design.md`,
plans next to it under plans/ (3.0 foundation, 3.1/3.2 items, 3.3 games,
puzzles and awards). 3.0
replaced the 2.x raster engine; 2.x groups still open (`normalizeParams()`
migrates them).

## Scripts

- `npm run build`  esbuild -> extension.js (~130 KB)
- `npm test`       node tests: sheet, theme, text, model, common, helpers, items, cards, gifts, decor, games, starters, i18n
- `npm run qa`     dialog QA on the shared mock (one headless browser, ~60 checks)
- `npm run proof`  one sheet per item -> dist/proof/*.png; `PROOF_STARTERS=1`
  every starter, `PROOF_CONTACT=1` adds dist/proof/contact.png, `PROOF_PREVIEW=1`
  writes preview.jpg, `PROOF_JOBS='[{"id","params"}]'` renders your own

## How it is built

- Everything is millimetres. `src/engine/units.js` has `PX_PER_MM`
  (300 dpi) and the sheet formats; `src/engine/sheet.js` imposes pieces on
  the sheet (`impose()` centred grid, `cutMarks()`, `foldLine()`).
- `src/engine/theme.js`: `OCCASIONS` (palette, pattern, motif, fonts per
  occasion), `PALETTES`, `resolveTheme( theme, kits )` -> colours, pattern,
  motif, fonts. A palette is an id, `'brand'` (the brand kit) or an object
  of five colours.
- `src/engine/patterns.js`: fifteen procedural area patterns, masked to a
  shape with a bbox-minus-polygon path (no clipPath: the importer knows
  none). `src/engine/motifs.js`: hand-authored path sets in a 100 x 100
  box with colour roles, remapped to stay visible on the fill they land on.
- `src/items/*.js` and `src/items/{cards,gifts,decor,games}/*.js`: one
  module per item, `ITEM = { id, label, hint, group, uses, sizes, repeat,
  textLabel?, placeholder?, photoBox?, render( item, ctx, env ) ->
  { pieces, warnings } }`; a piece is `{ inner, w, h, folds? }` in mm.
  `uses.text` is `true` (one text) or `'lines'` (one entry per line);
  `uses.photo` is `'none' | 'optional' | 'many'` (memory, quartet get
  `ctx.photos`). `repeat` may be a function of the item (address labels
  repeat a single block, decks and memory repeat their backs).
  `common.js` has the shapes, `patternIn()`, `motifAt()`, `label()`,
  `paragraph()`, and the 3.1 card helpers `cardFrame()`, `textStack()`
  (roles title / subtitle / strong / line / small / gap fitted into a
  box), `arrow()`, `dashed()`, `checkbox()`, `writeLine()`, `serial()`,
  the `SUITS` and `CHESS` glyphs.
- Cards share `cards/listcard.js` (menu, drinks, program), the games
  share `games/cards.js` (scavenger, questions, headbands). `games/bingo.js`
  `bingoCards()` draws unique cards from a seed; `games/chess.js` parses
  FEN, square names, arrows and marks (draughts and go from piece lists);
  `games/tactics.js` parses the player / run / pass / ball lines and draws
  five fields.
- 3.3: `games/boardgame.js` (serpentine fields, seeded event fields),
  `dice.js` (cube net, `PIPS` from common.js), `domino.js` (28 tiles, pips
  as motifs), `secretcode.js` (`codeKey( seed )` letter to motif),
  `fortuneteller.js` (fold template, fortunes upright), `bracket.js`,
  `guessphoto.js` (picture cards + answer cards), `wordsearch.js`
  (`wordSearch( words, n, seed )` in eight directions), `maze.js`
  (`maze( cols, rows, seed )` recursive backtracker with a BFS solution,
  `drawMaze()` reused by the place mat), `sudoku.js` (`sudoku( n, level,
  seed )` backtracking with a seeded order, holes by level; no
  uniqueness check, the solution sheet is the answer), `coloring.js`
  (`outlineMotif()` strokes the motif's paths), `placemat.js`,
  `playmoney.js`, `cards/certificate.js`, `decor/medals.js`. Puzzles
  return the puzzle and, with `item.solution`, a solution piece of the
  same size (two pages). Wide items (bracket, certificate, place mat)
  turn the sheet to landscape when chosen from the picker.
- `src/items.js`: `renderSheet( params, env )` -> `{ svg, width, height,
  warnings, count, pages, page }`. Repeat items fill the sheet by cycling
  their pieces; items with distinct pieces (place cards, guest-named tags,
  letters, props) spread over pages.
- `src/model.js`: params v3 `{ sheet, theme, event, photo, item }`,
  defaults, the 2.x migration.
- Dialog: `src/main.js` (state, photos cut to the item's box through a
  canvas clip, insert: every sheet rasterized at 300 dpi with the web
  fonts embedded (`src/engine/fonts-embed.js` collects the @font-face
  sources of a family, from the page's own rules or the Google
  stylesheet, and writes them into the SVG as data URLs), sheet one into
  the open document (SET_DOC to the sheet size unless the option is off),
  every further sheet a page of its own through SET_PAGES; editing
  replaces the picture of the sheet the layer holds; resolve for dynamic
  content),
  `src/ui/left.js` (item + picker, starters by occasion),
  `src/ui/material.js` (text, guest names, photo source under the sheet),
  `src/ui/side.js` (Sheet, Theme, Event, Item), `src/ui/view.js`.

## Bug classes met while building

- **A shape's outline and its pattern mask must agree.** The mask is the
  bbox minus the shape polygon with the winding reversed; a shape without
  `pts` gets no pattern at all.
- **Motifs vanish on their own colour.** `colorsOn()` swaps a role that
  equals the fill for the ink; every motif call names the fill it sits on.
- **The wrapper band is an arch, not a bowl.** Outer arc on top, bumps
  centred ON the arc and drawn before the band so the band covers their
  inner halves; the piece box grows by the bump radius.
- **Defaults must fit A4.** The first sizes gave one pennant per sheet;
  every item now has a size preset that says how many fit.
- **Guest names are distinct pieces.** A repeat item cycles its pieces to
  fill the sheet; with `textFrom: 'names'` that gave some guests two tags.
- **The importer cannot rotate, and it lost the baseline of scaled
  text.** The 3.0 to 3.2 vector insert put every text a line too low
  (Thomas, 04.09.): the core importer subtracted the scaled ascent
  before scaling again (fixed in svg-io.js with a test). Party Printables
  inserts pictures since 3.2.1: what the preview shows is what prints,
  and a sticker sheet is one layer instead of two hundred. Editing stays
  in the dialog, which the picture reopens.
- **An SVG in an `<img>` sees no web font.** The preview and the insert
  embed the faces as data URLs; the first render of a family fetches its
  files once.
- **The QA mock runs in German.** Compare state, not button labels.
- **Loading a starter keeps the typed event data**, so a QA that types a
  title and then loads a starter sees its own title, not the starter's.
- **A dialog without a height grows and shrinks with its cards**: the
  `.wpiepp-dialog` class carries `height: min(900px, 94vh)`.
- **Patterns rotated with `transform="rotate()"`** reached the editor
  axis-aligned; leaves and confetti are rotated by their points now.
- **A single-piece postcard must repeat** (two invitations per A4), a
  folded card must not; `repeat` became a function of the item.
- **Sizes must fit A4 portrait** with the 8 mm margin: 220 mm bands,
  190 + 15 mm crown halves and 100 mm wide tent toppers did not.
- **"Round" meant two things** (a shape and a game round); the shape is
  "Circle" everywhere, the scoreboard keeps "Round".
- **Guest-name lines without blank lines** made one seating table; every
  "Name: guests" line is its own table now.
- **The proof lied about text.** It measured text as 0.55 em per glyph
  and drew the SVG through an `<img>`, which sees no web font; script
  faces like Great Vibes are far wider. The proof now loads the occasions'
  fonts, measures every glyph once in the page and inlines the SVG, and
  only that showed the placement faults Thomas saw (04.09.).
- **A long line that shrinks a lot is two lines.** `label()` breaks a
  single line into two balanced lines when it had to fall under 55 % of
  its size (`wrap: false` opts out); menus and programs scale their type
  to the card instead of leaving the lower half empty.
- **Ink on a dark fill is invisible.** Text on a coloured piece takes
  `readableOn( fill )`, never the theme ink.
