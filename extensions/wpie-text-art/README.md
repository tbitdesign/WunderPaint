
## Drawn with lines (3.2.0)
Four cards that rebuild the picture from INK instead of from glyphs or
tiles: an engraving (straight across or following the form), contour
lines, stipple, and one single continuous line through every dot.
`src/lineart.js` holds the whole engine, and it is pure: everything reads
from ONE field of tone and returns polylines, so `npm test` can check on
pictures built by hand what a line did.

These four are the only cards here that can leave as **vector paths**
instead of pixels ("Insert as vector paths"). The geometry is drawn at
working size and then SCALED, because the spacing of an engraving is a
decision in the drawing, not in the document: at four times the size it
should be the same drawing, larger, not four times as many lines. A
swelling line leaves as a filled OUTLINE, never as a stroke - a stroke
can only have one width along its whole length, and the swelling is how
an engraving carries tone at all.

Bug classes met on the way:

- **A picture with no tonal range must not be stretched.** Dividing by a
  span of nothing turned an empty white canvas into solid black, and
  every pen then drew furiously across a page that had nothing on it. The
  QA stage's own document is exactly that white page, which is how it
  came out.
- **A form-following line needs a calm field.** At photographic detail it
  follows every pore and curls into noodles: the direction comes from a
  blurred field, the swelling still from the sharp one.
- **Empty paper gets no dots.** Without that floor the relaxation spreads
  stipple into the background as evenly as into the face, and the drawing
  becomes a texture instead of a portrait.
- **The QA measured ink as "dark pixels".** On a dark ground every empty
  pixel counted, so an empty drawing reported ninety-seven per cent ink.
  It counts what differs from the paper now.
- **The dialog QA was already failing before any of this**, and quietly:
  the baseline sweep sets the source to an image, which opens the media
  picker, and its overlay then ate the click on Insert - so the run timed
  out instead of failing, and the studio looked green from a distance.
  The sweep no longer presses Insert; the insert is checked afterwards,
  with the picker put away first, once as pixels and once as paths.

**Bug class, 30 August: the vector way had its own idea of size.** The
baked modes fill the canvas when the drawing has the canvas' proportions
and are fit centred at 92 % otherwise. `insertVector()` only knew the
second half of that rule, so a drawing of the canvas - the default source -
always arrived inset. Where two ways out of the same studio exist, the
placement rule has to live in both. A re-edited drawing now also keeps the
size the user gave it, because the path lives in the layer's coordinates.


## Continuous-line variants (dev, 23 September 2026)

Choose **One Line**, then use the six preview cards in **Line style**:
Spiral, Spiral waves, Meander, Waves, Labyrinth, and the existing Free line.
The five new patterns encode source brightness through varying line width.
Density, maximum/minimum width, and the wave controls affect the same
geometry in the preview, raster output and vector insertion. Labyrinth and
Free line also have **New path**. Pattern settings reopen with the layer.
Recipes saved before this addition reopen as Free line, preserving the old
algorithm. New One Line artwork starts with Spiral.

Spirals draw within an ellipse matching the source aspect. Meander, Waves
and Labyrinth cover a rectangular field. The photo is never stretched to a
square. The minimum width may be zero to leave white highlights empty;
its default keeps the continuous line faintly visible through highlights.
Raster exports have the selected paper; vector insertion preserves the
existing Text Art behavior of inserting only the ink as editable outlines.

`src/continuous-line.js` adapts the source field and simplifies geometry
with a width-aware error bound. `src/vendor/spiralist/` contains unchanged
upstream geometry/tone modules plus attribution comments, from
https://github.com/winchxyz/spiralist at
`7903271c9f475f7734c12f6293c9bb3c217d5cc9`, MIT, copyright 2026 winch.
The complete applicable license ships in `assets/licenses/spiralist.txt`.
No upstream UI, film renderer, external fonts or network calls are included.

Validation:
- `npm test`: 24 geometry tests, including 10 new integration cases.
- Core Jest: the existing engine, typography and QR files pass 22 tests.
- `node tools/qa-continuous.mjs`: focused single-browser QA using the real
  UI kit and a mocked editor boundary. Uses a tonal fixture; an optional
  local photo can be supplied through `WPIE_LINE_PHOTO`.
- Screenshots: `dist/qa-continuous-dark.png`, `dist/qa-continuous-light.png`,
  and `dist/line-*.png`. Artifacts stay out of the deployed package.

The focused QA builds the existing shared bridge mock with the real local
React dependencies. The older shared stage builder currently aliases
WordPress element to a stub without the required hooks, so it fails before
opening this dialog; shared tooling was deliberately left untouched.

`npm run build` still creates `extension.js` for the existing tools and
also fingerprints the entry and stylesheet under `assets/`. The manifest
uses those names so dev updates do not need a release-version bump.


## Sharp at any size, faster, four more cards (3.5.0)

**Output at the document's own size.** Every card used to be drawn at a
fixed working size (ASCII art about 560 pixels across, the mosaics about
1100) and stretched to the document on insert. A card now lays itself out
at working size and is drawn again `outScale` times larger
(`outSheet()` in the engine), up to 4096 pixels a side: the same picture,
only the pixels grow. Shadow blur and shadow offsets are device pixels, so
they are the one thing that has to be scaled by hand.

**Shadows and glows that cost nothing per stone.** A canvas shadow is a
Gaussian blur of every single fill. The drop shadows of the bottle caps,
coins, buttons, sticky notes and stamps are now drawn once per card
(`shadowStamp()`) and placed under each stone; the glow of the LED wall
and the marquee is a radial gradient whose stops are the blurred disc
itself (`discBlur()`, sigma = shadowBlur / 2 as the spec defines it).
Measured against the old drawing: identical at scale one for every card
without a glow, the shadows within a fraction of a level, three to five
times faster.

**Handling.** The cards' previews come from a small copy of the picture,
with big stones, one after the other and the chosen one first - they used
to be rendered from the full picture and froze the dialog for seconds. A
control being dragged now updates the preview at half resolution while it
moves (cards that take longer than a frame still wait for the pause). The
shelf stands in four groups: from characters, mosaics from things, drawn
with ink, without a photo.

**Video frame by frame.** The reveal is encoded as H.264 in the browser
(WebCodecs + mp4-muxer, `src/video.js`), every frame the moment it names;
where there is no encoder the real-time recording remains.

**New cards** (picked from a proof sheet on real photographs): string art
(one thread wound greedily from nail to nail, `stringArt()`; highlights
repel the thread and winding stops when no chord serves more darkness than
it spoils), a Morse portrait (`morseLines()`: the message spelled in dots
and dashes that swell with the tone), playing cards (the pack's real
tones, measured on the sprites, deal the picture; picture cards and backs
carry the dark end) and push pins on cork. String art and Morse are pens:
they leave as vector paths like the other ink drawings. A contour-text card
was tried and dropped - contour lines show form, not tone, and the picture
did not read.
