# Shared extension QA kit

One WPIE bridge mock + one stage builder for all extension dialog QA,
replacing the eleven per-extension `tools/preview/dialog-mock.js` copies
that drifted independently (the Diagram Studio harness was silently dead
from 1.4 to 1.7 because its private mock lagged behind the 2.10 pickers).

Key idea: `bridge.ui` is NOT mocked - the kit bundles the editor's REAL
`src/lib/ext-ui.js` into the stage. Mirror, don't approximate.

## Files

- `mock-entry.js` - browser side; defines `window.__installWpieMock(opts)`
  covering locale, brand kits, documents factories, raster stubs, storage
  (in-memory), iconsLib, fonts, components (color button + 2.10 pickers),
  throwing ai stubs, generator capture, editor dispatch capture, auto-run.
- `stage.mjs` - node side; `buildStage({root})` bundles the mock (esbuild,
  real editor src via @ed), copies editor.css/style.css/extension.js plus
  the extension's `tools/preview/setup.js`, writes index.html.
  `launchQA({stage})` starts Chromium and returns
  `{ page, check, shot, failures, finish }`.
- `doc-preview-qa.mjs <key> [new]` - "Show document" for one studio: the
  layer above the studio's layer must lie in front of the preview, for an
  edited layer or (`new`) a new one inserted above the background.
- `doc-preview-all.mjs [key ...]` - the same for every studio in BOTH
  cases, one run after the other. Run it after any change to
  `shared/doc-preview.js`, to where the editor inserts new layers, or to a
  studio's preview code. Until 20.10.2026 only the editing case was run,
  and Solar shipped a preview that dropped the layers above a new image.

## Per-extension usage

`tools/preview/setup.js` (loaded after the mock bundle):

    window.__installWpieMock( {
        iconClassPrefix: 'wpiedg',   // your CSS prefix for picker classes
        doc: { w: 1600, h: 1000 },
        patch: ( WPIE, editor ) => { /* extension-specific extras */ },
    } );

`tools/qa-dialog.mjs`:

    import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';
    const stage = await buildStage( { root } );
    const qa = await launchQA( { stage, shotDir } );
    // qa.check( cond, msg ), qa.shot( 'name.png' ), your assertions...
    process.exit( await qa.finish() );

## Rules

- When the bridge API grows, extend `mock-entry.js` HERE - never fork a
  per-extension copy again. Added since: `bridge.shapes` (2.18), wired to
  the editor's real `shapeToPathD` (Type Flow Studio turns document layers
  into lanes, so a stub would have tested nothing). Anything truly extension-specific goes into
  that extension's `setup.js` via `patch`.
- Migrated so far: **wpie-diagram-studio** (full 60-check suite green),
  **wpie-3d-effects-studio** (qa-dialog, sheet, verify-globals; 20.10.2026).
  The remaining extensions migrate incrementally: replace the stage/mock
  boilerplate in their qa-dialog.mjs, move mock extras into setup.js,
  run their QA to prove parity, delete the old dialog-mock.js.
