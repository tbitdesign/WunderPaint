# Mystic Studio

Pro extension: computed birth charts, moon phases and zodiac posters as
editable layers. Phase 1 of the spec in `SPEC.md`.

- `src/astro.js` - geocentric ephemeris (JPL Kepler elements + truncated
  Meeus lunar series), ascendant/MC, Placidus houses with Whole Sign
  fallback, aspects, moon phase, retrograde flags. `astro.test.js` pins it
  against equinoxes, syzygies and a Mercury retrograde window.
- `src/tz.js` - birth time to UTC: bundled tz-lookup (coordinates to IANA
  zone) + the browser's Intl history for the offset, manual override.
- `src/wheel.js`, `src/mooncard.js`, `src/zodiaccard.js` - the three card
  renderers; `src/glyphs.js` procedural planet/sign glyphs; `src/themes.js`
  the four looks.
- `src/zodiac.json` - built by `node tools/build-zodiac.mjs` from the Star
  Map catalog (12 zodiac constellations).
- Assets and licences: `TEXTURES.md`.

Build: `npm run build` (esbuild IIFE -> `extension.js`). Tests run from the
repo root: `npx jest extensions/wpie-mystic-studio`. Deploy:
`extensions/deploy.sh wpie-mystic-studio`.
