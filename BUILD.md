# Building WunderPaint

This repository is the human-readable source of the free WunderPaint plugin.
Everything the released plugin loads in minified form is generated from what
is here, with the commands below.

## Requirements

Node.js 20 or newer, with npm. Nothing else: no bundler to install by hand,
no build service, no network fetch beyond `npm ci`.

## Build

    npm ci
    npm run build

`npm ci` installs the exact dependency versions from `package-lock.json`.
`npm run build` runs the asset generators and then webpack over the entry
points in `src/`, and writes `build/`.

## Where every generated file comes from

The released plugin contains four kinds of generated file. This is the whole
list; nothing else in the package is compiled, minified or otherwise
unreadable.

| In the released plugin | Built from | Command |
| --- | --- | --- |
| `build/*.js`, `build/*.css` | `src/` | `npm run build` (webpack, [wp-scripts](https://www.npmjs.com/package/@wordpress/scripts)) |
| `build/vtracer.<hash>.wasm` | not built here: the npm package `vtracer-wasm`, copied verbatim | see "Files copied from npm" below |
| `build/ort.wasm.min.<hash>.mjs` | not built here: the npm package `onnxruntime-web`, copied verbatim | see "Files copied from npm" below |
| `bundled-extensions/<slug>/extension.js` | `extensions/<slug>/src/` | `bash tools/bundle-free-extensions.sh` |
| `languages/*.mo`, `languages/*-<hash>.json` | `languages/*.po` | `wp i18n make-mo languages languages` and `wp i18n make-json languages` |

`npm run build` is a chain, and each link writes something a reader may
otherwise wonder about:

    node tools/sync-ort.js            copies the CPU onnxruntime-web build into assets/ort/
    node tools/build-content.js       turns assets/content sources into the shipped packs
    node tools/build-ui-icons.js      generates the icon module in src/
    node tools/build-license-texts.mjs collects dependency licences into src/lib/
    wp-scripts build                  webpack: src/ -> build/
    node tools/scrub-cdn.js           fails the build if any CDN URL survived

### The bundled extension studios

The free studios ship as ordinary plugin files under `bundled-extensions/`.
Each one is a folder in `extensions/` in this repository, and each folder
builds itself with esbuild:

    cd extensions/wpie-papercut-art
    npm ci
    npm run build          # esbuild src/main.js --bundle --format=iife --minify --outfile=extension.js

`bash tools/bundle-free-extensions.sh` does that for all of them and copies
the result into `bundled-extensions/`, which is why that folder is build
output and is not tracked here.

Premium studios and the Pro plugin are separate products and are not part of
this repository. Everything the free plugin ships is.

### Files copied from npm

Two files under `build/` are not compiled during this build and are not ours.
Webpack copies them out of their npm packages and gives them a content-hashed
name; the name in front of the hash says which package.

`build/vtracer.<hash>.wasm` is the vectorizer behind the editor's "Vectorize"
command, which turns a bitmap into paths in the browser.

* npm package: <https://www.npmjs.com/package/vtracer-wasm>, MIT
* wrapper source: <https://github.com/jsscheller/vtracer-wasm>
* the Rust program it is built from: <https://github.com/visioncortex/vtracer>, MIT

`build/ort.wasm.min.<hash>.mjs` is the CPU build of onnxruntime-web, the
runtime that carries the local AI features (background removal, smart select,
depth blur, local alt text) inside the browser.

* npm package: <https://www.npmjs.com/package/onnxruntime-web>, MIT
* source: <https://github.com/microsoft/onnxruntime>, MIT

Its WebAssembly half lives in `assets/ort/` in the full release and is put
there by `tools/sync-ort.js`, from the same npm package.

## What makes up the installable plugin

The repository root is the plugin. After a build it contains everything
WordPress loads:

| Path | Role |
| --- | --- |
| `wunderpaint.php` | Plugin header and bootstrap |
| `includes/` | REST endpoints, settings, integrations, uninstall |
| `build/` | The compiled editor, from `src/` |
| `bundled-extensions/` | The free studios, from `extensions/` |
| `assets/` | Fonts, icons and content packs |
| `languages/` | Compiled translations that WordPress loads at runtime |

## Other scripts

    npm run test:unit      Jest suite
    npm run test:ext       The extension studios' own tests
    npm run lint:js        ESLint
    npm run lint:css       Stylelint
