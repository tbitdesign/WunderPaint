# Sheet Music (wpie-sheet-music)

Editable music graphics for teaching materials, song sheets and graphic designs.
The studio combines visual melody entry, engraved notation, instrument diagrams,
rhythm exercises and harmony charts. Output is a vector group with editable text;
the group's generator parameters reopen the original studio configuration.

## Music and design

- Melody Builder: enter pitches on a keyboard, select note values, add rests,
  click directly in the engraved staff, or drag a note to change its pitch.
  Select a phrase with Shift-click, repeat or reverse it, shift pitches and
  scale durations. Set pickups, ties and phrase slurs; notes crossing a bar
  line split into tied notes automatically.
- Rhythm Workshop: seeded rhythm exercises with counting, accents, rests and
  completion bars, plus static strumming, fingerpicking and drum-groove graphics.
- Harmony Atlas: circle of fifths, interval comparisons, chord construction,
  inversions and progressions with scale-degree labels and instrument diagrams.
  Voice-leading charts connect common tones and moving voices with optional
  automatic inversions. Mode comparisons highlight changed notes against a
  reference scale on the staff, keyboard or guitar neck.
- Rhythm graphics: proportional note-value and rest trees, beat strips with
  dotted and triplet subdivisions, and static polyrhythm comparisons.
- Drum Builder: edit percussion lanes, normal/accented/soft hits and hand
  assignments. Show a grid, percussion notation, or both. Reducing the grid
  refuses changes that would discard occupied steps.
- Exercise Sheets: complete scales or measures, construct intervals, add
  accidentals and correct altered notes. A saved variation identifies matching
  question and solution views, which can be inserted separately.
- Guitar Maps: overlapping scale positions, highlighted chord tones, suggested
  finger numbers and ascending practice routes with string/fret references.
- Song Builder: reorder sections with drag and drop or arrows, duplicate
  sections, set repeat labels and attach chords to cursor positions in lyrics.
  Uses the existing chord-sheet layout, transposition and capo support.
- Musical analysis: colored brackets, phrase arcs and numbered callouts on
  melody note ranges or original score measure ranges, with explanatory text.
- Lesson Sheet: notation, keyboard, fretboard and diatonic chords follow the same
  root and scale. Notes, fingering and diagram visibility are configurable.
- Chord Diagrams: select alternative positions, compare fingerings, customize
  frets and finger numbers, or show diagrams with left-handed string order.
- Study cards: notes, intervals, chords, key signatures and rhythm questions,
  with matching answer sides. Answer columns mirror the corresponding fronts.
- Score: ABC entry or MusicXML/MXL import, transposition, tablature, selected
  measures or a voice, and optional emphasis of measures or voices.
- Chord sheets, scale sheets and manuscript paper retain their existing controls.
- Illustrated presets with search and categories, coordinated design looks,
  transparent notation, optional page fitting, preview zoom and panning.

Everything is computed locally in the browser. The extension has no player or
animation timeline. Existing ABC material remains separate from the visual
melody model, so editing a simple melody never rewrites an imported score.

## Building

`npm run build` bundles `src/main.js` with esbuild into `extension.js`.
`npm test` runs the DOM-free engine and translation tests. The optional `qa`
and `proof` scripts use the shared browser fixture and the real engraving engine.

## Architecture

- `src/cards.js`: normalized parameters, layouts, style resolution and renderers.
- `src/engine/workshop.js`: integer musical durations, melody/rhythm generation,
  diatonic spelling, chord inversions and cached voicing alternatives.
- `src/engine/studio.js`: phrase transforms, voice-leading optimization,
  percussion grids, reproducible questions, fretboard routes and song models.
- `src/engine/score-layout.js`: staff geometry from the engraving engine,
  transformed preview hit areas and annotations tied to musical events.
- `src/studio-cards.js`: additional teaching charts and visual song layouts.
- `src/workshop-cards.js`: theory charts, coordinated lessons and study cards,
  composed from the existing SVG, fretboard and abcjs engines.
- `src/engine/excerpt.js`: selections on the parsed score tree, including voice
  data, lyrics and compressed rests. Original source text is retained.
- `src/ui/`: the shared editor UI kit, visual music controls and canvas preview.
  Thumbnail engraving is queued, cached and requested when presets enter view.
- `src/i18n.js`: UI and new preset translations for German, Spanish, French,
  Italian, Dutch and Portuguese, keyed by the American English source strings.
  Additional studio vocabulary is shared through `src/studio-i18n.js`.

The bundled abcjs engine engraves into unscaled coordinates; its SVG is embedded
with the matching scale transform. SVG styling uses explicit attributes for the
editor's importer. Native text anchors are normalized at insertion. A PNG fallback
supports hosts without the SVG importer.

`assets/xml2abc.js` is the vendored MusicXML converter, with its license alongside
it. The import shim and existing MXL decompressor remain local. Extra runtime
files belong under `assets/` and must be versioned when loaded lazily.
