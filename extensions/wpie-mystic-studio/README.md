# Mystic Studio

Free extension: computed birth charts, moon phases, zodiac, numerology and
couple cards, composed as a full poster in the shape of the document.
1.0 is the poster rebuild; the original phase plan is in `SPEC.md`.

## How a poster is built

- `src/cards.js` - the card registry: which inputs a card reads, its
  transparent art (`drawArt`) and its texts (`cardTexts`). `cardData()`
  computes charts lazily and once per render.
- `src/looks.js` - curated looks (theme, backdrop, stars, frame, title
  face) and `shuffleLook()` for Surprise me.
- `src/backdrop.js` / `src/frames.js` - the sheet behind the art: six
  backdrop styles with a seeded star field, nine vector frames. Frames
  report their insets (`frameMetrics`); gaps in a frame line are clipped,
  never painted over, so every backdrop shows through.
- `src/layout.js` - where art and text blocks go for any sheet (auto,
  classic, framed, minimal, side by side, no text). The wrap mirrors the
  editor's own (greedy on spaces, tracking per gap) and block heights are
  the editor's box floor, so inserted text layers never re-flow.
- `src/poster.js` - the text roles (title, subtitle, keywords, meaning,
  message, chart data), their type styles and the layer props. Every
  managed text layer carries `mystic: { role, auto }`; on Edit,
  `keepEdits()` keeps what the user changed by hand and `planUpdate()`
  patches, adds and removes layers by role.
- `src/main.js` - the studio: preview at the document aspect (text drawn
  by the editor's renderer), cards and looks on the left, inputs and
  design on the right, insert as a grouped poster or as art only.

## Engines

- `src/astro.js` - geocentric ephemeris (JPL Kepler elements + truncated
  Meeus lunar series), ascendant/MC, Placidus houses with Whole Sign
  fallback, aspects, moon phase, retrograde flags. `astro.test.js` pins it
  against equinoxes, syzygies and a Mercury retrograde window.
- `src/tz.js` - birth time to UTC: bundled tz-lookup (coordinates to IANA
  zone) + the browser's Intl history for the offset, manual override.
- `src/analysis.js` - Big Three, weighted element and modality balance,
  percentages that always add up to 100.
- `src/numerology.js` - life path, name numbers, couple number, personal
  year.
- Card art: `wheel.js` (three wheel styles, synastry), `mooncard.js`,
  `zodiaccard.js`, `chinesecard.js`, `numbercard.js`, `couplecard.js`,
  `readingcards.js` (Big Three, elements, profile), `medallion.js`.
- `src/zodiac.json` - built by `node tools/build-zodiac.mjs` from the Star
  Map catalog (12 zodiac constellations).
- Translations: `src/dict.js` (UI strings), `src/i18n.js` (index-keyed
  chart content) in seven languages. Assets and licences: `TEXTURES.md`.

Build: `npm run build` (esbuild IIFE -> `extension.js`). Tests run from the
repo root: `npx jest extensions/wpie-mystic-studio` (engines, renderers,
layout, update planning, translations, and a jsdom smoke test of the studio
with the core kit). Deploy: `extensions/deploy.sh wpie-mystic-studio`.
