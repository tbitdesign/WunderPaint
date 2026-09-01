
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
