# shared/three3d

Two modules the three.js studios had carried as byte-identical copies:

| module | was in | lines |
|---|---|---:|
| `spin-export.js` | 3d-text-studio, 3d-mockup-studio, 3d-gallery-studio | 213 |
| `trim.js` | 3d-text-studio, 3d-mockup-studio, 3d-objects-studio | 77 |

Identical by md5, not merely similar, which is why merging them needed no
decisions - only the confidence that they really were the same file.

## Why `text3d.js` and `fonts.js` are NOT here

They were the bigger prize (517 and 232 lines, two copies each) and the first
attempt moved them too. It does not work, and the reason is worth writing down
so nobody tries again on a slow afternoon: esbuild resolves a bare specifier
from the directory of the file that writes it, not from the entry point.
`text3d.js` imports `three` and `fonts.js` imports `opentype.js`; from
`extensions/shared/three3d/` there is no `node_modules` above it that carries
either, so the build fails outright.

The ways out are all worse than the duplication:

* an `--alias:` per package and per dependency - grows with every new import,
  and silently wrong the day someone forgets one;
* a `node_modules` of its own next to `shared/` - a second copy of three.js
  on disk to avoid a second copy of a 517-line file;
* injecting `THREE` and `opentype` as parameters, the way the fx `motifs.js`
  fork does. That is the right end state, but it is an API change across six
  call sites in two packages, so it is a refactor with its own risk budget,
  not a de-duplication.

So the rule for this folder: **a module belongs here only if it imports
nothing but relative paths.**

## What this is

BUILD-TIME code. esbuild inlines it, so each `extension.js` stays as
self-contained as before and nothing about packaging, `requiresApi` or the
runtime bridge changes. Same arrangement as `shared/qa-kit/`, which 24
packages already use.

The catch, same as for the qa-kit: an extension folder copied out of this tree
on its own will no longer build, because `../../shared/` is gone.
