# Seamless Patterns

A deterministic, layered pattern generator for WunderPaint. Generator ID and
slug remain `wpie-pattern-generator/pattern` and `wpie-pattern-generator`.

Includes 48 motif builders, 40 vector motif sets and 200 presets. The preset
gallery is separate from the controls and has search, categories and named
favorites. Thumbnails render as they enter the gallery viewport.

Up to four independently colored pattern layers share a repeat layout,
cell aspect and background. The highest row is the topmost painted layer.
Eight repeat layouts include third/quarter drops and alternating rotations.
Scatter and Terrazzo elements can be moved across boundaries, resized,
rotated, recolored, duplicated, removed and locked. History stores complete
recipes without duplicating immutable bitmap strings; slider gestures coalesce.
All panel sections use the shared kit's icon headers. Random Pattern is directly
available in the preview toolbar; Random Layer, Random Colors and New Seed sit
in a persistent Variations section above the property tabs. Pattern rolls build
complete compositions, layer rolls preserve the other layers and common repeat,
and color rolls preserve geometry. Locks retain colors, motifs or arrangement,
including seed. Captured stamps and locked elements survive randomization.

The additional collection includes 80 vector drawings: ginkgo, eucalyptus,
olive branches, roses, tulips, succulents, orchard fruit, teaware, dragonflies,
songbirds, fish, sea stars, sailboats, suns/moons, bows and snowflakes. Its 80
presets include ordered repeats, mixed bouquets and three-layer compositions.
Gallery search also finds motif sets contained within layered presets.

Stamps use the editor's actual raster bridge and can capture up to six source
layers per pattern layer, including group descendants. Captured images travel
inside generator parameters, so editing does not depend on the source layers
remaining in the document. PNG and SVG export share the same geometry, repeat
transforms and wrapping bounds. SVG embeds captured bitmap stamps.

Named favorites use the existing per-user extension store (32 KB limit).
Image-stamp designs are saved in the document or as library pattern tiles;
the UI explains that they cannot be stored as small favorite recipes.
Legacy recipes and favorite entries are normalized when opened.

## Checks

```sh
npm run build
npm test
npm run qa
```

The browser check builds a local host with the real editor reducer, dialog kit,
color editor and raster bridge. Persistence is in memory; HTTP requests are
blocked. It checks both themes, presets, layers, element edits, randomizer
locks, captured stamps, downloads, insert/edit and Canvas/SVG pixel agreement.
Only one headless browser runs, with Swiftshader. Artifacts are written to `/tmp`.
It does not exercise an authenticated WordPress REST write.
