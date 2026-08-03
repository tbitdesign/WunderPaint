=== WunderPaint ===
Contributors: tbitdesign
Tags: image editor, design, media library, templates, image optimization
Requires at least: 6.4
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 1.384.1
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

The dynamic design and automation studio: create graphics, edit photos, automate your images.

== Description ==

WunderPaint is the dynamic design and automation studio: a complete, layer-based editor where you create graphics, edit photos and automate your images. Design once, and your templates fill themselves with real content.

https://www.youtube.com/watch?v=qGz4buxKaaI

**See it live:** [Try the demo](https://demo.wp-image-editor.com) | [Docs & FAQs](https://help.wp-image-editor.com) | [Website](https://wp-image-editor.com)

= A complete design studio =

Open any image, or start on a blank canvas, and work the way you would in a professional desktop editor: paint, retouch, select, mask, and build layouts from layers and groups. Easy Mode keeps the surface calm and simple; the full depth is one click away, on the very same document.

= Design once, it fills itself in =

Templates are alive in WunderPaint. Point text and image layers at your posts, products, prices and custom fields, preview against real content while you design, and set the result as a featured image. Come back any time: every design stays fully editable, with versions and rollback.

= Features =

* **Layers, groups and masks** with blend modes, non-destructive layer styles and adjustment layers.
* **Real typography**: style single letters, bend text on arcs, run it along any path, fill it with gradients and patterns, or start from designed headline and badge lockups.
* **Filters and effects** from classic photo looks to Duotone, Halftone, Glitch and Glow, plus color LUTs and one-click enhance.
* **Charts and tables** built from your data, editable as layers.
* **360° panoramas**: generate a seamless AI sphere, repair the seam, add linked hotspots and copy a self-contained embed your visitors can walk through.
* **Collage & Photo Grid**: grids, mosaics, polaroids, filmstrips and contact sheets from your own photos - inserted as editable layers, not a flat image.
* **Templates, icons, emoji, shapes and seamless patterns** ready to drop in, plus QR-code layers with your logo.
* **Brand kit**: set your colors, fonts and logo once and meet them again in every picker.
* **PSD, SVG and animation**: import and export PSD including Smart Objects, edit SVGs as vectors, export animated GIF, APNG and WebM.
* **A tidy library**: real folders and tags, drag-and-drop organizing, bulk actions.
* **Semantic search**: find images by what they show, powered by a local model.
* **Housekeeping**: duplicate finder, smart folders for missing alt text and unused images, an alt-text assistant for the whole library, and per-size thumbnail recropping with subject-aware auto-framing.
* **Optimized uploads**: images are converted to WebP and scaled in your browser, with no external service and no quota.
* **AI on your terms**: generate, edit, inpaint and outpaint with your own API key (Google Gemini, OpenAI), or sketch something rough and let a curated style finish it.
* **Local helpers, no key needed**: background removal, smart select, depth blur, upscaling, text behind subject and alt text run in your browser after a one-time model download - plus one-click looks: color pop, product shot, neon rim, speed blur and depth fog.
* **An in-editor handbook**, guided tours and searchable help, in English, German, Spanish, French, Portuguese and Italian.

= Private by design =

Everything runs on your own server: no telemetry, no tracking, self-hosted fonts. Cloud AI only runs when you trigger it, with a key you own, and every service a feature can reach is listed under External Services below.

= WunderPaint Pro =

The free editor is complete, and yours to use on as many sites as you like. [WunderPaint Pro](https://wp-image-editor.com) adds scale and automation on top: featured images generated across whole archives, WooCommerce catalog graphics, series from a CSV file, batch runs over your existing library, dynamic images that refresh themselves on the front end (blocks, shortcodes and native Elementor widgets), live badges, personalized per-visitor images, and one-click extension studios for 3D mockups, 3D text, patterns, cinematic loops and more.

= Requirements =

A current desktop browser (Chrome, Edge, Firefox or Safari). Works with Gutenberg, Elementor, Bricks, Divi and any plugin that uses the media picker.

== Frequently Asked Questions ==

= Do I need to be a designer? =

No. You start from templates and drag things into place, and it already looks designed. The depth is there when you want it, not before.

= Where do my images go? =

They stay in your media library. The editor runs on your own server and the local tools work inside your browser, so nothing is uploaded for them. Cloud AI only runs when you trigger it, with your own key; the full list of services any feature can reach is under External Services below.

= Do I need AI API keys? =

No. The whole editor, including background removal, upscaling and semantic search, works without any key. A key (Settings, WunderPaint) additionally enables text-to-image generation, prompt-based editing, inpainting/outpainting and AI alt text.

= Where are my API keys stored? =

Obfuscated in the WordPress database, or preferably as constants in wp-config.php (WPIE_GEMINI_KEY, WPIE_OPENAI_KEY, WPIE_ANTHROPIC_KEY, WPIE_PEXELS_KEY, WPIE_PIXABAY_KEY, WPIE_UNSPLASH_KEY). They are only ever read server-side and never sent to the browser.

= Does it work with my page builder? =

Gutenberg, Elementor, Bricks, Divi and any media picker: every image gets an Edit Image button that opens the full editor over your layout and drops the result straight back.

= Can I open Photoshop files? =

Yes. PSD files open as layered, editable documents (including Smart Objects), and you can export your work back to PSD. Round-tripping keeps the layer structure as far as the two formats allow.

= Will it slow my site down? =

No. The editor only loads in wp-admin when you open it. Your visitors just receive normal, optimized images.

= What if I deactivate the plugin one day? =

Nothing dramatic. Exported images are ordinary files in your Media Library and stay exactly where they are. Folders and tags are stored as regular WordPress taxonomies. Your layered projects wait in the uploads folder for the day you come back.

= Is it available in my language? =

The editor ships in English, German, Spanish, French, Portuguese and Italian.

= What are the system requirements? =

A current desktop browser: Chrome or Edge 110+, Firefox 115+, Safari 16.4+. Some 3D extension studios additionally need WebGL2 with hardware graphics, which every current desktop browser on a normal machine provides; Help, System Status shows exactly what your device offers.

= Where do I get help? =

The handbook lives right inside the editor (press ?), the built-in help assistant answers questions and builds little guided tours, and https://help.wp-image-editor.com covers every feature down to the single control.

== Screenshots ==

1. The editor: a full layer-based design and automation studio inside the WordPress Media Library.
2. Hundreds of starter templates - open one, swap the words, done.
3. The Media Library Manager: folders, tags, semantic search and bulk tools.
4. Semantic search finds images by what they show - locally, no cloud.
5. AI Studio: a rough sketch becomes a finished graphic with one style click.
6. Dynamic templates: layers bound to post title, prices and fields, previewed against real content.
7. Charts and tables built from your data, editable as layers.
8. Per-letter typography, curved text and WordArt lockups.
9. Easy Mode: the same document, reduced to the essentials.
10. Image optimization in the browser: WebP conversion with no external service.

== External Services ==

This plugin can talk to the following external services — each one only when you actively use the corresponding feature. Fonts are self-hosted by default; see the Google Fonts entry below for the two optional cases in which Google is contacted.

* **WunderPaint extension catalog** (delivery.wp-image-editor.com): when an editor user opens the Extensions manager, the plugin fetches a catalog file (catalog.json) server-side that lists the available extensions with their versions and descriptions, and caches it on your site for an hour. This is a metadata request only: no personal data is sent, and the free plugin never downloads or runs extension code from it — installing or updating an extension is a ZIP you upload yourself. See https://wp-image-editor.com/privacy/
* **Pexels** (api.pexels.com / images.pexels.com): searched server-side when you use Assets → Stock Images with a Pexels API key. Your search query is sent to Pexels. See https://www.pexels.com/terms-of-service/
* **Pixabay** (pixabay.com): searched server-side when you use Assets → Stock Images with a Pixabay API key. Your search query is sent to Pixabay. See https://pixabay.com/service/terms/
* **Unsplash** (api.unsplash.com / images.unsplash.com): searched server-side when you use Assets → Stock Images with an Unsplash Access Key. Your search query is sent to Unsplash. See https://unsplash.com/terms
* **AI providers** (Google Gemini, OpenAI, Anthropic): only when configured with an API key and an AI action is triggered; the prompt and (for edits) the image are sent server-side to the selected provider.
* **OpenStreetMap Nominatim** (nominatim.openstreetmap.org): only when an editor user searches for a place inside a map extension (such as Map Posters). The search text is sent server-side; results are cached on your server. No API key needed. See https://osmfoundation.org/wiki/Privacy_Policy
* **OpenStreetMap Overpass API** (overpass-api.de and the mirrors overpass.kumi.systems, overpass.private.coffee and overpass.osm.jp): only when a map extension renders a map. The requested map area (coordinates, no personal data) is sent server-side; the street/water/park geometry is cached on your server. Map data © OpenStreetMap contributors, ODbL. See https://osmfoundation.org/wiki/Privacy_Policy
* **Meshy** (api.meshy.ai): only when configured with an API key and a 3D model is generated from a prompt or an image in the 3D Objects studio; the prompt or image is sent server-side to Meshy and the finished model is downloaded to your own site. See https://www.meshy.ai/legal/privacy-policy
* **Hugging Face** (huggingface.co): only when an administrator downloads a local AI model under Settings → Local AI Models (a one-time, server-to-server download); the models are then served from your own site.
* **Google Fonts** (fonts.googleapis.com / fonts.gstatic.com): the plugin bundles 10 font families and loads nothing from a font CDN by default. Google is contacted only in two optional cases you choose. (a) An administrator downloads the full font library under Settings → Fonts: a one-time, server-to-server download, after which the fonts are served from your own site and no visitor browser ever contacts Google. (b) An administrator enables the Google Fonts CDN option: the editor then loads font stylesheets from fonts.googleapis.com while people work, which transmits their IP address to Google. Exported images are unaffected (text is rendered to pixels). See https://policies.google.com/privacy
The local AI runtime (ONNX WebAssembly and transformers.js) ships inside the plugin, so a local AI feature (Background Removal, Smart Select, Depth Blur, local alt text) runs entirely in your browser and your images never leave it. The only external touch is the optional one-time model download above.

== Bundled Libraries ==

WunderPaint is licensed GPL-2.0-or-later (see license.txt). Every bundled component is under a GPL-compatible license; full attributions are in third-party-licenses.txt.

* ag-psd — MIT License (PSD read/write)
* Tabler Icons — MIT License (icon library)
* qrcode — MIT License (QR-code generation)
* jsQR — Apache License 2.0 (the in-dialog scan check that decodes the rendered code)
* jszip — MIT License (ZIP reading and writing for project files and exports; dual-licensed MIT or GPL-3.0-or-later, used here under MIT)
* vtracer-wasm — MIT License (colour image vectorization; a WebAssembly build of VTracer by Vision Cortex, also MIT)
* imagetracerjs — The Unlicense (vectorization fallback where WebAssembly is unavailable)
* gifenc — MIT License (animated GIF encoding)
* upng-js — MIT License (APNG encoding)
* unicode-emoji-json — MIT License (emoji metadata)
* onnxruntime-web — MIT License (local inference runtime; its WebAssembly build includes Apache-2.0 and BSD-3-Clause components; the CPU build ships inside the plugin under assets/ort/)
* @huggingface/transformers (transformers.js) — Apache License 2.0 (in-browser runtime for the local AI features, bundled from npm; formerly published as @xenova/transformers)
* U²-Netp model — Apache License 2.0 (Xuebin Qin et al., U²-Net). See assets/models/NOTICE.txt.
* Fonts — 10 self-hosted families ship with the plugin (Roboto, Open Sans, Inter, Montserrat, Poppins, Oswald, Bebas Neue, Anton, Playfair Display, Lora); a larger catalog can be downloaded to your own server under Settings → Fonts. All ten are under the SIL Open Font License 1.1. See assets/fonts/OFL.txt. Sourced from the @fontsource project / Google Fonts.

Apache-2.0 components are compatible with this plugin via the "or later" clause of GPL-2.0-or-later (Apache-2.0 is compatible with GPLv3).

All AI cloud calls are proxied server-side; API keys never reach the browser. Background removal and upscaling run fully locally in your browser and no data leaves your site for those; the runtime ships inside the plugin, so nothing has to be downloaded first.

== Development ==

The free plugin is open source (GPL-2.0-or-later). The human-readable
source is published at https://github.com/tbitdesign/WunderPaint and
build instructions are in BUILD.md there.

== Changelog ==

= 1.384.1 =
* Media library items in the Asset Library now carry their title under the preview, in the tray and in the modal, like every other card.
* The AI Studio checkbox for vector output reads "Turn into editable vector" and looks like the other option rows instead of standing out.
* The Reveal Off-Canvas button in the status bar keeps the normal grey of its neighbours when it is on, instead of turning blue.

= 1.384.0 =
* Housekeeping before release: trimmed an experiment that was not ready to ship.

= 1.380.2 =
* Reveal Off-Canvas: the eye next to the zoom control (or View → Reveal Off-Canvas) makes everything parked outside the document frame visible - an instant scratch space around your canvas. Export still crops to the frame, so nothing parked ever ships.

= 1.379.0 =
* The 360° panorama went premium. Both viewers: eased camera flights, auto-rotate with an on/off control that pauses while you interact, a compass that flies back to the start view, fullscreen, pinch and double-tap zoom. The embed now opens as a light blurred poster with a 360° badge and boots WebGL only when visible or clicked - and on phones a gyro button lets visitors look around by moving the device.
* Hotspots leveled up: icon markers (pin, info, arrow, play) with hover labels, optional info cards that open in the view, and everything still carries into the embed. Plus a Horizon slider for tilted AI horizons and "Logo on the floor", which covers the distorted nadir zone with your Brand Kit logo.

= 1.378.4 =
* The panorama side panel is tidy now: clear sections for Create with AI, Source, Seam, Hotspots and Embed instead of a pile of buttons, and the library button reads "From Media Library".

= 1.378.3 =
* The panorama footer is the proper house footer now (hint left, actions right, real padding). Provider choice and the style picker in Create with AI look exactly like the AI panel, and Show seam turns the view straight to the wrap edge - Fix seam then faces its own result.

= 1.378.2 =
* The 360° Panorama tool wears the standard footer: status hints on the left (look-around, placing, generating), Cancel and Copy embed HTML on the right - and the sphere no longer renders upside down.
* Hotspots grew formatting: each one has its own color, size and a Move mode to re-place it with a click; all of it carries into the embed. The AI provider for panorama creation is pickable right in the tool.

= 1.378.1 =
* The 360° Panorama tool now creates panoramas itself: describe a scene and generate a fresh sphere, or rebuild the current source photo as a full panorama of the same place - that was the point of the whole thing.
* Design Review reads like a review now: a clear verdict up front, then tidy area cards with issue and suggestion, no raw formatting leaking through.
* The Design Review and Improve Text dialogs wear the standard modal header (brand badge, title, description) like every other dialog.

= 1.378.0 =
* 360° Panorama (Tools menu): walk through any equirectangular image, repair the AI wrap seam, place linked hotspots and copy a fully self-contained HTML embed - the tiny viewer ships inline, no plugin needed on the page. The AI panel's new 360° format generates matching spheres.
* Editable vector (paths): the image model draws flat artwork and the local tracer turns it into real, editable shape layers.
* Design Review: an art director's verdict on your current design - one overall take plus the few changes with the biggest impact, answered in your editor language.
* Improve Text: five stronger alternatives for the selected text layer, same language and length - pick one and it swaps in.

