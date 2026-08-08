# Soundwave Studio (WPIE extension)

The waveform of any audio file as a poster - the third member of the
poster family next to Map Studio and Star Map Studio ("soundwave art":
the wedding song, a heartbeat, a voice message, a podcast episode).

- **Pick audio from the media library** (wp.media, audio only); the
  file is decoded locally with the Web Audio API - nothing leaves the
  browser. Only compact 4096-bucket profiles are kept in memory
  (mono + per-channel peaks and a zero-crossing brightness track).
- **12 styles**: bars, line, filled, dots, pulse, LED, circle,
  ridgeline (stacked mountain lines), spiral (the whole song in one
  winding), sunburst (concentric rings), heartbeat (bars along a
  heart contour) and hexagon contour.
- **Color modes** (v2.0): solid, curated gradients (incl. gold,
  copper and chrome foils; along the wave or mapped to loudness), or
  spectral - the sound picks the color via zero-crossing brightness.
  Plus neon glow passes, a fading mirror reflection, and a stereo
  L/R split with a second color.
- **Controls**: density (40-240 bars), amplitude, start/end trim with
  time readouts, wave height, rounded caps, transparent background.
- **8 themes** matching the poster family, custom background/wave
  colors via the editor's own color picker, shape masks (square,
  rounded, circle, heart, hexagon).
- **Text layouts**: classic poster (title, subtitle, duration) or the
  music player card (progress bar, dot, elapsed/total timestamps) -
  inserted as real, editable text and shape layers with live WYSIWYG
  preview in the document's aspect ratio.
- The wave layer stores `layer.generator = { id, params }`:
  right-click → **Edit Soundwave Studio** reopens the same track and
  settings (the audio is re-analyzed from the stored attachment URL).

## Build

```
npm install
npm run build   # esbuild src/main.js → extension.js
```

Install: ZIP `manifest.json`, `extension.js` and `style.css`, then use
Help → Extensions → "Install from ZIP" in the editor.

## Dev tool

`node tools/contact-sheet.mjs <out.png>` renders a synthetic track in
every theme and style for visual QA.
