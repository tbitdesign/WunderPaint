# shared/glyphs

Glyph outlines for studios that draw type themselves (Type Flow Studio;
the 3D Text Studio migrates here in a bump of its own).

`fonts.js` imports nothing but relative paths (the rule of `shared/`, see
`shared/three3d/README.md`): the consumer calls `bindOpentype(opentype)` once
with its own opentype.js module, then `parseFont(arrayBuffer)` works.
It also exports `faceCatalog()` (every
same-origin `@font-face` the editor page declares, grouped by family with
its weights and URLs), `faceKey(family, weight)` / `parseFaceKey(key)`, and
`createFontLoader({ bundled, baseUrl, woff2Global, woff2File })`, which
returns `{ loadFont(key), fontSpec(key) }`. Keys are either a bundled key
(`'anton'`) or a library face (`'face:Archivo|900'`).

The extension that uses it ships its own `woff2.js` (built with the
3D Text Studio's `tools/build-woff2.mjs`, global renamed) and its own
`fonts/` folder with WOFF1 files. Google CDN faces are never fetched.

## woff2.js: the helper is built, not copied

`woff2-build.mjs` turns the wawoff2 decompress binding into a studio's
`woff2.js`: wrapped so its global exists before the runtime boots, rid of
the two Embind spots that compile code from strings (a Content-Security-
Policy without `'unsafe-eval'`, as on wunderpaint.com, killed the helper at
start-up and every woff2 face with it), and stamped with its content hash
in `src/woff2-stamp.js`, which the loaders append to the helper URL. The
build proves the point by running the result under
`node --disallow-code-generation-from-strings` (`woff2-check.mjs`). Each
package's `tools/build-woff2.mjs` is a thin call into it.
