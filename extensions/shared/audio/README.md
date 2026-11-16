# shared/audio

A song read for pictures, local and pure: no library, no service, nothing
leaves the browser. Bundled into each studio that imports it (esbuild), never
shipped on its own.

| module | what it does | used by |
|---|---|---|
| `beats.js` | beat grid: onset envelope, tempo by autocorrelation, phase | Motion Graphics (via `src/beats.js`), `song.js` |
| `song.js` | curves over time (loud, low, air, bright, busy), accents, sections, the character of the whole song | Chaos Art |
| `decode.js` | browser only: a media URL into mono samples at 22050 Hz, length checked from the metadata first | Chaos Art |

`beats.js` moved here from Motion Graphics unchanged (Chaos Art 1.12); the
studio keeps a one-line re-export so its imports and tests stay where they
were.

## Numbers that were measured, not guessed

* **Accent floor** (`FLUX_FLOOR` 0.6, log magnitude per bin, bands averaged):
  a held chord breathes at 0.12 at most, a hi-hat strikes at 1.7 and more, a
  kick at 3 and more. Summed over all bins instead of averaged per band, the
  hi-hats drowned every kick - and the kick is the beat.
* **Pulse** (`PULSE` 0.2 beat confidence): acid techno 0.28, a pop song 0.49,
  two Bach preludes on the piano 0.03 and 0.09. Motion Graphics asks 0.3 of
  its reels and reads `beats.js` directly.
* **Brightness scale** (spectral centroid, 300 Hz to 3000 Hz on a log scale):
  with 600 to 4000 Hz every acoustic recording read as dark.

## Why Soundwave Art and Image Synth keep their own

Both read audio for a different picture - Soundwave Art compact peak
profiles for a waveform, Image Synth a spectrogram image as a signal - and
both are finished and tested. Moving them onto `song.js` would be a rebuild
of two studios for no visible change. The next studio that needs to *follow*
a song starts here.
