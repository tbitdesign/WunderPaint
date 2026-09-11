# WunderPaint

The dynamic design and automation studio for WordPress: create graphics,
edit photos, automate your images.

WunderPaint is a complete, layer-based editor that runs inside WordPress.
Paint, retouch, select, mask and build layouts from layers and groups,
then point text and image layers at your posts, products, prices and
custom fields so a design fills itself with real content.

This repository holds the source code of the plugin. To install
WunderPaint on a site, get it from
[wordpress.org](https://wordpress.org/plugins/wunderpaint/). To see it
without installing anything, [try the demo](https://demo.wp-image-editor.com).

## Building

Everything under `build/` is compiled from `src/`. With Node.js 20 or
newer:

    npm ci
    npm run build

Full instructions, including what makes up the installable plugin, are in
[BUILD.md](BUILD.md).

## What is where

| Path | Contents |
| --- | --- |
| `src/` | The editor: screens, tools, canvas engine, libraries |
| `includes/` | The WordPress side: REST endpoints, settings, integrations |
| `assets/` | Fonts, icons, content packs and other shipped assets |
| `extensions/` | The free studios (sources); the plugin ships them built, under `bundled-extensions/` |
| `languages/` | Translation sources for German, Spanish, French, Italian, Dutch and Portuguese (the plugin ships none: wordpress.org delivers language packs) |
| `tools/` | Build scripts for icons, fonts and content packs |

Pro features and the premium studios are separate products and live
outside this repository. The free studios are part of it: their sources
sit in `extensions/`, the plugin ships them under `bundled-extensions/`
(see BUILD.md).

## Links

- [Website](https://wp-image-editor.com)
- [Docs and FAQs](https://help.wp-image-editor.com)
- [For developers](https://developers.wp-image-editor.com)

## License

GPL-2.0-or-later, see [license.txt](license.txt). The licenses of the
bundled third-party libraries are listed in
[third-party-licenses.txt](third-party-licenses.txt).

By [TBIT DESIGN - Thomas Breher](https://tbitdesign.com).

The optional 3D Solar System Studio uses maps by Solar System Scope / INOVE
(CC BY 4.0), HYG star data by David Nash / Astronexus (CC BY-SA 4.0), and
constellation figures and names by the Stellarium team and contributors
(CC BY-SA 4.0). Sources, licenses and adaptation notices are in its
[asset attribution](extensions/wpie-solar-system-studio/ATTRIBUTION.md)
and the [plugin readme](readme.txt).
