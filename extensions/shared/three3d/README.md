# shared/three3d

Two modules the three.js studios had carried as byte-identical copies:

| module | was in | lines |
|---|---|---:|
| `spin-export.js` | 3d-text-studio, 3d-mockup-studio, 3d-gallery-studio | 213 |
| `trim.js` | 3d-text-studio, 3d-mockup-studio, 3d-objects-studio | 77 |

Identical by md5, not merely similar, which is why merging them needed no
decisions - only the confidence that they really were the same file.

## `text3d.js` moved to `shared/text3d/` (20.10.2026)

The bigger prize was blocked here by one fact: esbuild resolves a bare
specifier from the directory of the file that writes it, and nothing above
`extensions/shared/` holds `three`. It is solved by pointing every build and
every Node run at the extension's own `node_modules` (`NODE_PATH` for the
esbuild CLI, `nodePaths` for the API, `--import ../shared/node-resolve.mjs` for
Node), see `shared/text3d/README.md`. `fonts.js` stays per extension: it
imports the extension's own woff2 stamp.

So the rule for this folder: **a module belongs here only if it imports
nothing but relative paths.**

## What this is

BUILD-TIME code. esbuild inlines it, so each `extension.js` stays as
self-contained as before and nothing about packaging, `requiresApi` or the
runtime bridge changes. Same arrangement as `shared/qa-kit/`, which 24
packages already use.

The catch, same as for the qa-kit: an extension folder copied out of this tree
on its own will no longer build, because `../../shared/` is gone.
