# Math Figures (wpie-math-figures)

One editable vector figure out of blocks: typeset formulas (with marked
parts and labels), function graphs, geometry, number lines, fraction
pictures, text with inline math, worked solutions aligned at the equals
sign, and tables or value tables. A figure has a head (title, subtitle),
stacked blocks, a foot (caption, footnote), typography per element and a
paper. Inserted as ONE vector group (paths and text). Free, category tools.
Specs: `docs/superpowers/specs/2026-09-03-math-figures-design.md` (0.1)
and `docs/superpowers/specs/2026-09-04-math-figures-figure-design.md`
(0.2 figure layer, 0.3 primary school, 0.4 secondary school); plans next
to them under plans/.

## Scripts

- `npm run build`  esbuild -> extension.js (~93 KB) and assets/mathjax.js (~1.6 MB, loaded on first formula)
- `npm test`       node tests for every engine module (MathJax runs in node through the lite adaptor)
- `npm run qa`     dialog QA on the shared mock (one headless browser)
- `npm run proof`  every starter rendered by the real engine -> dist/proof/sheet.png (look at it)

## How it is built

- `src/figure.js`: the figure model and `normalizeParams()`. 0.1 params
  (`card` + fields) migrate to a one-block figure, so older groups open.
  `BLOCK_DEFAULTS`, `TYPO_DEFAULTS`, `newBlock()`, the option lists.
- `src/blocks.js`: the registry `BLOCKS[type] = { label, hint, group,
  note, placeholder, needsEngine, render }`. A block render is a pure
  function `render(block, ctx, env) -> { inner, w, h, warnings }`;
  `renderFigure(params, env)` stacks head, blocks and foot on the paper
  and returns `{ svg, width, height, warnings }`. `env.typeset(latex,
  { size, color, display })` is the MathJax bridge (browser:
  window.__wpieMathJax from assets/mathjax.js; tests: src/mathjax-entry.js
  directly), `env.measure(text, size, font, weight, italic)` the canvas
  text width (tests: 0.55 em per character).
- `src/engine/text.js`: paragraphs, `- ` bullets, `**bold**`, `*italic*`,
  `$math$` in the line; greedy wrap at a width; one `<text>` per run so
  the importer keeps weight and slant.
- `src/engine/steps.js`: `LaTeX | explanation` per line, split at the
  first top-level `=`; left sides right-aligned, `= right side` in one
  column, notes to the right, `(n)` numbers, `<=>` / `=>` arrows.
- `src/engine/annotate.js`: `\mark{key}{...}` in the LaTeX plus notes
  `key "label" above|below #color` become a soft highlight, a leader and
  a label; overlapping labels step down a row.
- `src/engine/table.js`: pipe tables (`---` under the head), cells with
  inline math; `values f(x) = x^2; x = -3..3 step 1 [vertical]` computes a
  value table through expr.js; a wide table is scaled down with a warning.
- Primary school (0.3): `src/engine/clock.js` (faces, hands, digital
  readout), `hundred.js` (hundred square, twenty and ten fields, dots in
  fives), `placevalue.js` (place value chart, decimals, base-ten blocks;
  column labels through t()), `multiplication.js` (table and rows with
  gaps), `wall.js` (number walls with `?` gaps, number triangles),
  `ruler.js` (cm/mm/in with spans and points). Each is `parseX( text ) ->
  { spec | clocks | numbers, errors }` plus `renderX( data, o ) ->
  { inner, w, h, warnings }`, wired through `primaryBlock()` in blocks.js.
- Secondary school (0.4): `stats.js` (dot plot, bar chart, histogram,
  box plot; `quartiles()` by the halves rule), `unitcircle.js` (angles in
  degrees or radians, exact values at the special angles, tangent, marks),
  `sets.js` (two or three sets, `regionsOf()` evaluates ∩ ∪ \ ' not ( )
  into region masks; regions are HATCHED with horizontal lines computed
  from circle membership, so any expression works without clipPath),
  `tree.js` (indented branches, decimals / percent / fractions, path
  probabilities multiplied and reduced, right or down), `solids.js`
  (cabinet projection `project( x, y, z )`, hidden edges dashed, curved
  outlines as sampled paths, dimension labels, cube and cuboid nets).
- `src/engine/expr.js`: expression parser (implicit multiplication,
  functions, constants), evaluator, LaTeX printer for legends.
- `src/engine/plot.js`: functions, parametric and polar curves, points,
  areas; poles split the curve, segments are clipped to the frame
  (Liang-Barsky), ticks in numbers or multiples of pi, legend typeset.
- `src/engine/geometry.js`: command language and renderer, equal units,
  auto bounds, angle arcs with degrees, right-angle squares, labels
  pushed away from the centroid.
- `src/engine/numberline.js`, `src/engine/fractions.js`: as named.
- `src/engine/mathsvg.js`: MathJax SVG -> flat absolute paths and rects in
  px (translate/scale chains incl. scale(1,-1) baked into coordinates);
  reports `marks` (the box of every `<g id="mk-key">`).
- `src/mathjax-entry.js`: the MathJax bundle with the packages base, ams,
  newcommand, noundefined, color, cancel, boldsymbol, bbox, textmacros,
  unicode, mhchem, html and configmacros; `\mark` is a macro on `\cssId`.
- Dialog: `src/ui/left.js` (block list with move/remove, "Add block"
  picker on the backdrop, starters with a group filter, the selected
  block's material), `src/ui/side.js` (Figure, Text, Typography, Block;
  rebuilt when the selection changes), `src/main.js` (state, engine
  loading on demand, insert as a vector group, resolve for dynamic
  content in every text field).

## Bug classes met while building

- **MathJax SVG comes with transform chains and currentColor.** The
  editor's importer flattens translate/scale, but a negative scale on a
  rect gives a negative height; flatten first, then hand over plain paths.
- **A `#` comment stripper eats `color #ff0000`.** Comments are whole-line
  `#` or trailing `//` only.
- **`text (x, y) "..."` matched the point rule** (`name (x, y)`). Reserved
  commands are checked before the point pattern.
- **Files that ship live in `assets/`** (extensions/pkg-contents.sh);
  assets/mathjax.js is that kind of file.
- **Tick density**: a nice-step aimed at width/(4.5 em) gives 0.5 steps on
  a 10-unit range at 1600 px; aim at width/(7 em).
- **A dialog without a height grows and shrinks with its cards.** The `.wpiemf-dialog` class first set only a width; the columns were capped at 72vh and the body had a min-height, so every tile click resized the modal (Thomas, 04.09.). The dialog class now carries `height: min(900px, 94vh)` as a flex column, the body is `flex: 1; min-height: 0` and the columns scroll at `max-height: 100%`. The dialog QA measures the height across all cards.
- **MathJax's `macros` option needs the `configmacros` package.** Without
  it the option is silently invalid and `\mark` renders as red text.
- **An id on a MathJax node adds an empty `<text data-id-align>`.** The
  flattener skips it; anything else that is `<text>` still warns.
- **`display: flex` on a popover wins over the `hidden` attribute.** The
  picker needs an explicit `[hidden] { display: none }` rule.
- **The i18n test compares raw source text.** Strings that arrive from
  the registry are evaluated, so their backslashes are written back
  (`raw()`) before the lookup; a `t( CONSTANT )` is invisible to the test.
- **Figure numbering and step numbering would double up.** Under figure
  numbering a steps block gets one number and its own row numbers are
  off.
- **A greedy `[\d.]+` swallows `2.5..7`.** Numbers in the block languages
  are `\d+(?:\.\d+)?`, never a character class with the dot.
- **A local named like a module helper trips no-shadow.** `empty()` at
  module level, `isEmpty` inside; the linter catches it, the tests do not.
- **Two paths can share a probability.** R,R and R,B both give 0.15 in
  the two-draw starter; a test that expects a value exactly once is
  wrong, not the tree.
- **The importer knows no clipPath and no ellipse.** Venn regions are
  hatched lines, round solids are sampled paths; both survive the trip
  into the editor as plain layers.
