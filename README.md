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
| `languages/` | Translations for German, Spanish, French, Italian and Portuguese |
| `tools/` | Build scripts for icons, fonts and content packs |

Pro features and the extension studios are separate products and live
outside this repository.

## Links

- [Website](https://wp-image-editor.com)
- [Docs and FAQs](https://help.wp-image-editor.com)
- [For developers](https://developers.wp-image-editor.com)

## License

GPL-2.0-or-later, see [license.txt](license.txt). The licenses of the
bundled third-party libraries are listed in
[third-party-licenses.txt](third-party-licenses.txt).

By [TBIT DESIGN - Thomas Breher](https://tbitdesign.com).
