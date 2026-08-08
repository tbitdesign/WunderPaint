# Map Studio (WPIE extension)

Poster-style maps from OpenStreetMap data, rendered live in the editor.

- **Search any place** (Nominatim, proxied server-side by the editor core,
  Extension API 2.4), pan by dragging, zoom with the wheel.
- **10 design themes** (Minimal, Midnight, Blueprint, Terracotta, Forest,
  Neon, Vintage, Golden, Rose, Ocean) plus custom color overrides; a
  single "Roads" color spreads into a full hierarchy automatically.
- **Real cartography**: road classes with poster-style weights, water
  bodies and rivers, sea fill stitched from OSM coastlines, parks,
  beaches, railways with cross-tie dashes, optional building footprints
  close up. Tunnels and rail yards are filtered out server-side.
- **Geocoded pins** with labels, straight or curved route lines and a
  total-distance pill.
- **Shape masks**: square, rounded, circle, heart, hexagon.
- **Text block**: classic poster layout (title, divider, subtitle,
  coordinates line) or corner layout, inserted as real, editable text
  layers; the required "© OpenStreetMap contributors" attribution is
  added automatically.
- The baked map layer stores `layer.generator = { id, params }`:
  right-click → **Edit Map Studio** reopens the exact same spot (data is
  re-fetched, the server caches it).

## Build

```
npm install
npm run build   # esbuild src/main.js → extension.js
```

Install: ZIP `manifest.json`, `extension.js`, `style.css` and
`oldenburg.json`, then use Help → Manage Extensions → "Install from
ZIP" in the editor.

## Bundled seed

`oldenburg.json` is the map excerpt for the default place (Oldenburg,
radius 4500 m): a fresh studio session renders from this file with no
network round trip at all. It holds the exact fetch box a fresh open
would request plus the geo proxy's payload for it (OSM data, ODbL -
the automatically inserted attribution line covers it). Regenerate
after changing the default place or the fetch math:

```
node tools/build-seed.mjs   # prints { bbox, detail }
wp eval 'echo \WPImageEditor\Geo::map_payload( <south>, <west>, <north>, <east>, <detail>, false );'
# combine both into oldenburg.json as { bbox, detail, data }
```

## Dev tool

`node tools/contact-sheet.mjs <fixture.json> <out.png> [pins]` renders a
geo-proxy fixture in all themes for visual QA (see the header comment
for the fixture shape).

Map data © OpenStreetMap contributors, ODbL.
