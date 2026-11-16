# Soundwave Studio (WPIE extension)

The waveform of any audio file as a poster - the third member of the
poster family next to Map Studio and Star Map Studio ("soundwave art":
the wedding song, a heartbeat, a voice message, a podcast episode).

- **Pick audio from the media library** (wp.media, audio only); the
  file is decoded locally with the Web Audio API - nothing leaves the
  browser. Only compact 4096-bucket profiles are kept in memory
  (mono + per-channel peaks and a zero-crossing brightness track).
- **Sources (v2.5)**: audio OR video files (the sound is taken from
  the film), and the microphone right in the studio - the recording is
  saved to the media library as a WAV when the picture is inserted, so
  it can be reopened. A fresh studio opens on an example sound that is
  synthesised in code (`src/demo.js`, no file shipped).
- **14 styles**: bars, line, filled, dots, pulse, LED, circle,
  ridgeline (stacked mountain lines), spiral (the whole song in one
  winding), sunburst (concentric rings), heartbeat (bars along a
  heart contour), hexagon contour, and since v2.5 two drawn from the
  FREQUENCIES (`src/spectrum.js`, a plain FFT): the spectrogram and the
  sound mandala (time as rings from the centre, frequencies mirrored
  into petals; Density sets the petals).
- **Video (v2.5)**: made frame by frame as an MP4 with its sound
  (WebCodecs H.264 + AAC, or Opus in the MP4; `src/encode.js`). The
  equalizer reads an analyser worked out from the samples
  (`offlineAnalyser`), so nothing plays in real time. Where the browser
  cannot encode, the old real-time recorder is the fallback. Formats
  1:1, 4:5, 16:9, 9:16.
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
