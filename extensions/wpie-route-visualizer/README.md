# Route Studio (WPIE extension)

GPX files become posters: run/ride/hike as a clean route line,
optionally on a real OpenStreetMap street map (drawn locally with the
Map Studio render engine through the editor's geo proxy), with an
elevation profile, race stats and classic poster typography inserted
as real text layers (Map Studio pattern).

- src/gpx.js: regex-based GPX parser (trkpt/rtept, segments, ele,
  time) + RDP simplification to a 1500-point storage budget.
- src/route-stats.js: distance (haversine), elevation gain with a 3 m
  hysteresis noise filter, duration, pace, locale date.
- src/poster.js: square mercator bbox, route line with halo over maps,
  start/finish dots, elevation strip. Uses map-engine.js (verbatim
  copy from Map Studio) for themes/projector/street scene.
- src/main.js: dialog, WYSIWYG doc-aspect preview, geo fetch with
  detail auto-degrade, insert as group (image + real text layers),
  edit re-entry via layer.generator params (stores the simplified
  track, the original file is not needed again).

## Dev

    npm install
    npm run build && npm test
    node tools/preview-poster.mjs out.png '[{"theme":"midnight","mapBg":true}]' 480
    WPIE_LOCALE=de_DE WPIE_MAPBG=1 node tools/preview-dialog.mjs out.png

Deploy: manifest.json extension.js style.css to
wp-content/uploads/wpie-extensions/wpie-route-studio/ (chown
wpieadm-tombot-gz3939:psacln, 755/644) + httpdocs/route-studio.zip.
