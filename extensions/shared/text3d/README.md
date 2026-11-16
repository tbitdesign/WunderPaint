# shared/text3d

The 3D text engine of the 3D Text Studio and Motion Graphics, one copy since
20.10.2026: glyph layout, extrusion with smooth rounds and sharp corners, the
material presets and the design system (shapes, profiles, surfaces). The
3D Text Studio's version was a superset of Motion Graphics' older copy; with
the default design (solid, classic, smooth) and without the fine bake it
builds the same geometry and materials, so Motion Graphics' texts look as
before. Motion Graphics keeps offering its own twelve materials.

Each extension keeps one-line forwarders in its `src/` (`export * from
'../../shared/text3d/...'`), so its sources, tests and tools import as before.
`fonts.js` stays per extension: it imports the extension's own woff2 stamp.

## Packages from a shared folder

These modules import `three`, and nothing above `extensions/shared/` holds
it. Everything that builds or runs them points at the extension's own
`node_modules`:

- esbuild CLI: `NODE_PATH=node_modules esbuild ...` (package.json `build`);
- esbuild API: `nodePaths: [ <extension>/node_modules ]`;
- Node (tests, tools): `node --import ../shared/node-resolve.mjs ...`.

So each bundle carries exactly one three.js, the extension's own. Never add a
`node_modules` (or a symlink to one) inside `shared/`: esbuild would take it
before NODE_PATH and bundle a second three.js next to the extension's.
