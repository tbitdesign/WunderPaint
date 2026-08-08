# Star Map Studio (WPIE extension)

The night sky over any place at any date, rendered live in the editor -
the classic circular star chart poster ("the sky the night we met").

- **Search any place** (via the editor core's geo proxy, Extension API
  2.4), pick date and time; the chart recomputes instantly, fully
  locally - no external service is involved beyond the place search.
- **8 themes** (Midnight, Black, Violet, Forest, Ocean, Golden, Paper,
  Blush) plus custom background/star/line colors via the editor's own
  color picker.
- **Real astronomy**: 8,404 stars (all naked-eye stars to magnitude
  6.5), dot size by brightness with halos on the brightest, optional
  B-V color tints, 88 constellations as line figures, altitude grid and
  cardinal directions; azimuthal projection from the zenith with north
  up and east left ("looking up" convention). Verified in tests against
  reference values (Polaris altitude = latitude, Sirius seasons, the
  Southern Cross, GMST at J2000).
- **Shapes**: circle (classic), square, rounded, heart, hexagon.
- **Text block**: classic poster layout (title, divider, subtitle,
  localized date + coordinates line) or on-chart layout, inserted as
  real, editable text layers; live WYSIWYG preview in the document's
  aspect ratio.
- The chart layer stores `layer.generator = { id, params }`:
  right-click → **Edit Star Map Studio** reopens the same sky.

Time is interpreted as mean solar time at the location (UTC offset =
longitude / 15) - a few minutes off civil clock time, invisible at
poster scale, and it keeps a timezone database out of the pack.

## Data

- Stars: Yale Bright Star Catalogue 5 (public domain), fields RA/Dec
  (J2000), V magnitude, B-V.
- Constellation lines: d3-celestial by Olaf Frohn (BSD-3-Clause).

`node tools/build-catalog.mjs <bsc5.dat> <constellations.lines.json>`
regenerates `src/stars.json` and `src/lines.json`.

## Build

```
npm install
npm run build   # esbuild src/main.js → extension.js
```

Install: ZIP `manifest.json`, `extension.js` and `style.css`, then use
Help → Extensions → "Install from ZIP" in the editor.

## Dev tool

`node tools/contact-sheet.mjs <out.png>` renders the Hamburg winter sky
in every theme for visual QA.
