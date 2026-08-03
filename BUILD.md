# Building WunderPaint

The editor ships as a compiled bundle under `build/`, generated from the
sources in `src/`. Rebuilding it takes two commands.

## Requirements

Node.js 20 or newer, with npm.

## Build

    npm ci
    npm run build

`npm ci` installs the exact dependency versions from `package-lock.json`.
`npm run build` runs webpack over the entry points in `src/` and writes
`build/`.

## What makes up the installable plugin

The repository root is the plugin. After a build it contains everything
WordPress loads:

| Path | Role |
| --- | --- |
| `wunderpaint.php` | Plugin header and bootstrap |
| `includes/` | REST endpoints, settings, integrations, uninstall |
| `build/` | The compiled editor, from `src/` |
| `assets/` | Fonts, icons and content packs |
| `languages/` | Compiled translations that WordPress loads at runtime |

## Other scripts

    npm run test:unit      Jest suite
    npm run lint:js        ESLint
    npm run lint:css       Stylelint

Pro features and the extension studios are separate products and live
outside this repository.
