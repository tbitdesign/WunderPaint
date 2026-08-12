/**
 * In-editor handbook (v1.304): structured, translatable articles.
 *
 * Articles are grouped into HELP_CATEGORIES. Besides intro paragraphs
 * (`body`) an article can carry a numbered walkthrough (`steps`), tip
 * callouts (`tips`), `actions` = buttons that open the real dialog via
 * `extras`, and `guides` = ids of linked HELP_GUIDES spotlight tours.
 * Search runs over title, body, steps and tips.
 */

import { __ } from '@wordpress/i18n';

export const HELP_CATEGORIES = [
	// "The basics"/"Good to know": 'Basics' and 'Tip' as msgids are taken
	// by the shapes tray and the pen tool (de: Grundformen/Spitze).
	{ id: 'basics', title: __( 'The basics', 'wunderpaint' ) },
	{ id: 'design', title: __( 'Design', 'wunderpaint' ) },
	{ id: 'ai', title: __( 'AI', 'wunderpaint' ) },
	{ id: 'automation', title: __( 'Automation', 'wunderpaint' ) },
	{ id: 'system', title: __( 'Library & system', 'wunderpaint' ) },
];

export const HELP_ARTICLES = [
	/* ------------------------------ basics ------------------------------ */
	{
		id: 'getting-started',
		cat: 'basics',
		title: __( 'Getting started', 'wunderpaint' ),
		body: [
			__(
				'Open any image from the Media Library via "Edit Image", or create a new document with File → New. Everything you do happens on layers, your original file is untouched until you save.',
				'wunderpaint'
			),
			__(
				'"Save to Media Library" overwrites the attachment but keeps the previous file as a restorable version (History panel, bottom section). "Save as New Image" creates a separate attachment. "Export" downloads a file without touching the library.',
				'wunderpaint'
			),
			__(
				'Your work is protected: the editor autosaves in the background and offers to restore an unsaved session when you return.',
				'wunderpaint'
			),
			__(
				'Documents open in tabs along the top: File → New, templates and Asset Library designs open next to your current work instead of replacing it. A dot on a tab marks unsaved changes; the + button starts another document.',
				'wunderpaint'
			),
			__(
				'Prefer a simpler surface? Help → Easy Mode swaps the editor chrome for a beginner shell with just the essentials; "Switch to full editor" brings everything back.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( 'Create a new document', 'wunderpaint' ),
				run: ( extras ) => extras.openCreate(),
			},
			{
				label: __( 'Replay the welcome tour', 'wunderpaint' ),
				run: ( extras ) => extras.openTour(),
			},
		],
	},
	{
		id: 'tools',
		cat: 'basics',
		title: __( 'The tools', 'wunderpaint' ),
		body: [
			__(
				'Move (V) and Select (O) select and arrange layers. Marquee (M), Lasso (L) and Magic Wand (W) make selections; Smart Select (K) selects the object you click with local AI. Crop (C) trims the canvas.',
				'wunderpaint'
			),
			__(
				'Brush (B), Pencil (N) and Eraser (E) paint and erase; the Paint Bucket (G) fills, Gradient (D) draws color ramps. The Clone Stamp (S) copies from an Alt-clicked source; the Blur/Sharpen brush (R) paints local focus changes.',
				'wunderpaint'
			),
			__(
				'Text (T) and Shape (U) add vector layers, the Pen (P) draws paths. Eyedropper (I) picks colors, Hand (H) pans, Zoom (Z) magnifies. Hold Space anytime to pan.',
				'wunderpaint'
			),
			__(
				'Each tool shows its options in the bar above the canvas, size, opacity, symmetry painting, shape type and more.',
				'wunderpaint'
			),
		],
		guides: [ 'crop' ],
	},
	{
		id: 'painting',
		cat: 'basics',
		title: __( 'Painting', 'wunderpaint' ),
		body: [
			__(
				'The Brush paints into the layer you have selected, the way a brush should. Its panel opens with it and floats over the canvas, so every setting is in reach while you work: the tips down the left as real strokes rather than names, and everything else on the right.',
				'wunderpaint'
			),
			__(
				'A style decides how the paint meets what is already there. Normal is plain blending. Watercolor, Gouache, Acrylic and Oil mix pigment instead, so blue over yellow turns green, and they carry what makes a medium recognizable: paint running out along a stroke, the dark rim of a drying wash, grain settling in the paper, thick paint catching the light. Smudge brings no paint of its own and pushes around what it crosses.',
				'wunderpaint'
			),
			__(
				'Color is a choice of three. Solid is the color you picked. Jitter gives every mark a shade of its own, which is what stops a stroke reading as printed by a machine. Gradient runs a ramp along the stroke, from where you set down to where you lift off.',
				'wunderpaint'
			),
		],
		steps: [
			__(
				'Press B for the Brush. Pick a tip from the strip on the left; every preview is a real stroke drawn by the engine that will paint it.',
				'wunderpaint'
			),
			__(
				'Choose a style, then set size, hardness, opacity and flow.',
				'wunderpaint'
			),
			__(
				'Pick a color on the wheel, and under it choose Solid, Jitter or Gradient.',
				'wunderpaint'
			),
			__(
				'Paint. The stroke goes into the selected layer, or onto one of its own if you tick that at the foot of the panel.',
				'wunderpaint'
			),
		],
		tips: [
			__(
				'Draw a brush tip builds your own tip out of shapes, holes included. It is kept as a recipe, so it stays sharp at any size and travels inside the document.',
				'wunderpaint'
			),
			__(
				'The Eraser takes the same tips. Erasing through a texture is a technique, not a curiosity.',
				'wunderpaint'
			),
			__(
				'A right-click on the canvas brings the same settings up as a quick popover, for when you would rather not have the panel on screen.',
				'wunderpaint'
			),
			__(
				'Symmetry in the options bar mirrors every stroke as you draw it, which is how you get a balanced ornament in one pass.',
				'wunderpaint'
			),
		],
	},
	{
		id: 'navigation',
		cat: 'basics',
		title: __( 'Navigation & shortcuts', 'wunderpaint' ),
		body: [
			__(
				'Hold Space to pan, use ⌘/Ctrl +/− to zoom, ⌘0 fits the image, ⌘1 shows 100%. The Navigator (View menu) gives a minimap with a draggable viewport.',
				'wunderpaint'
			),
			__(
				'Hold Alt with the Move tool to measure pixel distances to the canvas edges and other layers. Digit keys set the active layer’s opacity (5 = 50%). Right-click the canvas to pick between overlapping layers.',
				'wunderpaint'
			),
			__(
				'View → Workspace shows and hides whole editor zones - or lets you click the parts you want gone. View → Guides & Grid adds grids, guide lines and snapping for precise layouts.',
				'wunderpaint'
			),
			__(
				'Hold the Compare button (title bar) to see the saved original. Help → Keyboard Shortcuts lists every key.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( 'Keyboard shortcuts', 'wunderpaint' ),
				run: ( extras ) => extras.openShortcutHelp(),
			},
			{
				label: __( 'Workspace', 'wunderpaint' ),
				run: ( extras ) => extras.openWorkspace(),
			},
			{
				label: __( 'Guides & Grid', 'wunderpaint' ),
				run: ( extras ) => extras.openGuides(),
			},
		],
	},
	{
		id: 'layers',
		cat: 'basics',
		title: __( 'Layers, groups & masks', 'wunderpaint' ),
		body: [
			__(
				'The Layers panel lists everything in your document, top to bottom. Drag to reorder, double-click a name to rename, right-click for actions and color labels. The filter box finds layers by name.',
				'wunderpaint'
			),
			__(
				'Each layer has opacity and a blend mode (how it mixes with layers below). Groups organize layers; a clipping mask restricts a layer to the shape of the one beneath it. Right-click offers Copy Styles / Paste Styles to transfer opacity, blend mode, filters and effects onto other layers, even in another tab.',
				'wunderpaint'
			),
			__(
				'A layer mask hides parts of a layer without deleting them: add one via Layer → Add Layer Mask, then paint on the mask with black (hide) or white (show). Click the mask thumbnail to target it.',
				'wunderpaint'
			),
			__(
				'Smart Objects preserve their content: filters applied to them stay editable as Smart Filters, and "Edit Contents" opens the embedded document.',
				'wunderpaint'
			),
		],
	},
	{
		id: 'selections',
		cat: 'basics',
		title: __( 'Selections', 'wunderpaint' ),
		body: [
			__(
				'Selections limit painting, filling and many commands to a region. Marquee drags rectangles, Lasso draws freeform shapes, the Magic Wand selects by color, set its tolerance in the options bar, or disable "Contiguous" to select a color across the whole image.',
				'wunderpaint'
			),
			__(
				'Select → Select Subject finds the main subject automatically (local AI, no key needed). Shift adds to a selection, Alt subtracts.',
				'wunderpaint'
			),
			__(
				'Refine with Select → Feather (soft edges), save selections for later, or invert them. Remove Object fills the selection with reconstructed background.',
				'wunderpaint'
			),
		],
	},
	{
		id: 'resize',
		cat: 'basics',
		title: __( 'Resizing: image, canvas & design', 'wunderpaint' ),
		body: [
			__(
				'Image → Image Size scales the whole document - every layer with it - to new pixel dimensions. Image → Canvas Size changes only the working area: layers keep their size, space is added or removed around them.',
				'wunderpaint'
			),
			__(
				'Image → Resize Design rescales a whole layout to a new format in one step: layers scale and reposition to fit the target size - ideal to turn a wide banner into a square post or a story.',
				'wunderpaint'
			),
		],
		steps: [
			__(
				'For photos: Image → Image Size, enter the new dimensions, confirm.',
				'wunderpaint'
			),
			__(
				'For more room to design: Image → Canvas Size and enlarge the working area.',
				'wunderpaint'
			),
			__(
				'For a new format of a finished layout: Image → Resize Design and pick the target size.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( 'Image Size', 'wunderpaint' ),
				run: ( extras ) => extras.openResize( 'image' ),
			},
			{
				label: __( 'Canvas Size', 'wunderpaint' ),
				run: ( extras ) => extras.openResize( 'canvas' ),
			},
			{
				label: __( 'Resize Design', 'wunderpaint' ),
				run: ( extras ) => extras.openMagicResize(),
			},
		],
	},
	/* ------------------------------ design ------------------------------ */
	{
		id: 'text',
		cat: 'design',
		title: __( 'Text', 'wunderpaint' ),
		body: [
			__(
				'The Text button in the toolbar drops a ready-to-type box in the middle of the canvas. Press T instead to place text yourself: click to start typing at that spot, or drag first for a fixed-size box the text wraps in. Escape cancels, clicking outside commits.',
				'wunderpaint'
			),
			__(
				'With the Text tool armed (T), clicking near a drawn line binds the text to the curve (Text on Path; right-click it later and choose "Edit Path" to bend the curve), and clicking inside a shape flows the text inside its outline (Text in Shape). Both also live in the right-click menu of a path or shape.',
				'wunderpaint'
			),
			__(
				'The Character section (Properties panel) controls font, size, weight, spacing and color. The font picker previews the families that are ready to use, all served from your own site; the rest of the catalogue can be downloaded under Settings, Fonts.',
				'wunderpaint'
			),
			__(
				'Settings → Fonts adds more sources: upload your own woff2, woff, ttf or otf files (house fonts), or enable the optional Google Fonts CDN catalog. Both appear as extra groups in the font picker.',
				'wunderpaint'
			),
			__(
				'For thumbnail-style text add an outline, a hard shadow or a pill background; the Curve slider bends text along an arc.',
				'wunderpaint'
			),
			__(
				'The Effects tab holds one-click Text Styles (Gold, Chrome, Sticker, Comic, Neon sign, Glitch, Slime and more) plus dozens of single effects you can stack: shadows, glows, outlines, bevel, image fill, marker highlights, glitch, drips, confetti, pixelate, motion blur and a set of warp shapes. Everything stays editable text.',
				'wunderpaint'
			),
		],
		guides: [ 'add-text' ],
	},
	{
		id: 'filters',
		cat: 'design',
		title: __( 'Filters & effects', 'wunderpaint' ),
		body: [
			__(
				'The Adjust panel combines one-click preset filters (thumbnails), Auto corrections, pixel effects and manual sliders (brightness, contrast, saturation, temperature and more).',
				'wunderpaint'
			),
			__(
				'Effects like Gaussian Blur, Vignette, Halftone or Glitch permanently change pixel layers, but applied to a Smart Object they become Smart Filters, which you can re-edit, reorder or disable anytime in the Properties panel.',
				'wunderpaint'
			),
			__(
				'Image → Colors → Load LUT applies professional .cube color-grading files. Levels and Curves offer precise tonal control; Auto Levels/Contrast/Color fix common problems in one click.',
				'wunderpaint'
			),
		],
		tips: [
			__(
				'Tools → Vignette & Film opens a small studio for vignettes and film grain: the result is an editable overlay layer that adapts when the design is resized.',
				'wunderpaint'
			),
		],
		guides: [ 'auto-fix' ],
		actions: [
			{
				label: __( 'Vignette & Film', 'wunderpaint' ),
				run: ( extras ) => extras.openVignette?.(),
			},
		],
	},
	{
		id: 'design-tools',
		cat: 'design',
		title: __( 'Design tools', 'wunderpaint' ),
		body: [
			__(
				'The Tools menu bundles small design studios. Color Schemer suggests matching palettes and recolors your document in one click; Background Studio generates gradient, pattern and texture backgrounds, optionally from the colors already in your document.',
				'wunderpaint'
			),
			__(
				'Screenshot Beautifier wraps a screenshot in a rounded card with shadow and optional browser, window or phone chrome; the Mockup Generator puts your design onto a studio-style product mockup (ebook, software box, monitor and more); Chart & Table turns data (pasting from Excel/Sheets works) into chart or table layers that stay editable.',
				'wunderpaint'
			),
			__(
				'View → Check Contrast audits your text layers against WCAG contrast rules and shows which combinations are hard to read.',
				'wunderpaint'
			),
			__(
				'Everything a tool inserts is a normal layer, so you can keep editing with the full toolset afterwards.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( 'Color Schemer', 'wunderpaint' ),
				run: ( extras ) => extras.openColorSchemer(),
			},
			{
				label: __( 'Background Studio', 'wunderpaint' ),
				run: ( extras ) => extras.openBackgroundStudio(),
			},
			{
				label: __( 'Screenshot Beautifier', 'wunderpaint' ),
				run: ( extras ) => extras.openBeautify(),
			},
			{
				label: __( 'Mockup Generator', 'wunderpaint' ),
				run: ( extras ) => extras.openMockup(),
			},
			{
				label: __( 'Chart & Table', 'wunderpaint' ),
				run: ( extras ) => extras.openChart(),
			},
			{
				label: __( 'Contrast Check', 'wunderpaint' ),
				run: ( extras ) => extras.openContrast(),
			},
		],
	},
	{
		id: 'collage',
		cat: 'design',
		title: __( 'Collage & Photo Grid', 'wunderpaint' ),
		body: [
			__(
				'Tools → Collage & Photo Grid arranges a handful of photos from your media library into a collage: a clean grid, a justified mosaic, scattered polaroids with captions, a filmstrip or a contact sheet with file names.',
				'wunderpaint'
			),
			__(
				'The collage lands as an editable group - every photo stays a normal image layer, so you can swap pictures, adjust single frames, add text and apply styles afterwards.',
				'wunderpaint'
			),
		],
		steps: [
			__(
				'Open Tools → Collage & Photo Grid and pick your images.',
				'wunderpaint'
			),
			__(
				'Choose a layout and tune spacing, corners and frames on the live preview; Shuffle re-rolls the arrangement.',
				'wunderpaint'
			),
			__(
				'Insert the collage and keep editing - it is a normal layer group.',
				'wunderpaint'
			),
		],
		tips: [
			__(
				'Polaroid and contact sheet can label every photo with its cleaned-up file name.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( 'Collage & Photo Grid', 'wunderpaint' ),
				run: ( extras ) => extras.openCollage?.(),
			},
		],
	},
	{
		id: 'panorama',
		cat: 'design',
		title: __( '360° Panorama', 'wunderpaint' ),
		body: [
			__(
				'Tools → 360° Panorama walks through any equirectangular (2:1) image: drag to look around, scroll to zoom. Generate one right in the AI panel with the 360° format chip, or open any panorama from a layer or the media library.',
				'wunderpaint'
			),
			__(
				'Create with AI lives right in the tool: describe a scene and generate a fresh 360° sphere, or rebuild the current source photo as a full panorama of the same place.',
				'wunderpaint'
			),
			__(
				'Fix seam repairs the typical AI flaw where the left and right edges do not match: the color drift is blended so the wrap closes, and Apply to layer writes the repaired image back.',
				'wunderpaint'
			),
			__(
				'Add hotspot places labeled markers by clicking in the view; give a hotspot a URL and it becomes a link. Copy embed HTML puts a fully self-contained viewer on the clipboard - paste it into any Custom HTML block, no plugin needed on the page, hotspots included.',
				'wunderpaint'
			),
		],
		tips: [
			__(
				'The embed keeps working even on sites without WunderPaint - it carries its own tiny viewer and only references the image URL.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( '360° Panorama', 'wunderpaint' ),
				run: ( extras ) => extras.openPanorama?.(),
			},
		],
	},
	{
		id: 'templates',
		cat: 'design',
		title: __( 'Templates', 'wunderpaint' ),
		body: [
			__(
				'The Asset Library holds hundreds of ready-made starter templates in categories from social posts to marketing and seasonal designs. Every template opens as a fully editable, layered document in a new tab - your current work stays untouched.',
				'wunderpaint'
			),
			__(
				'Dynamic templates are designs you saved with post bindings (File → Save as Dynamic Template): they live in their own library section, open via File → Open Dynamic Template and power the Featured Images automation and the shortcode and widget embeds.',
				'wunderpaint'
			),
			__(
				'Pro adds themed template packs - from marketing bundles to seasonal sets - that appear as extra categories.',
				'wunderpaint'
			),
		],
		steps: [
			__(
				'Open Assets → Asset Library and browse the Starter Templates section.',
				'wunderpaint'
			),
			__(
				'Click a template: it opens as a new document tab.',
				'wunderpaint'
			),
			__(
				'Swap texts, images and colors - every part is a normal layer.',
				'wunderpaint'
			),
			__(
				'Like the result? Save it as your own template or export it.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( 'Browse starter templates', 'wunderpaint' ),
				run: ( extras ) => extras.openLibrary( 'starters' ),
			},
			{
				label: __( 'My dynamic templates', 'wunderpaint' ),
				run: ( extras ) => extras.openTemplatePicker(),
			},
		],
	},
	{
		id: 'stock',
		cat: 'design',
		title: __( 'Stock photos & library images', 'wunderpaint' ),
		body: [
			__(
				'The Asset Library (Assets menu, ⇧⌘L) places images from your Media Library as layers; its Photos section searches Pexels, Pixabay and Unsplash (free API keys, configured in Settings → Stock Images). Stock results insert as layers and only reach your library when you save. The quick-insert palette (/) offers the same sources.',
				'wunderpaint'
			),
			__(
				'You can also drag image files from your computer straight onto the canvas, or paste them from the clipboard.',
				'wunderpaint'
			),
			__(
				'Tools → QR Code Generator builds QR codes: links, Wi-Fi access, contacts (vCard), email, phone or plain text, with brand-kit colors, styled modules and an optional center logo. QR layers stay editable, right-click one and choose Edit QR Code.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( 'Asset Library', 'wunderpaint' ),
				run: ( extras ) => extras.openLibrary(),
			},
			{
				label: __( 'Stock Images', 'wunderpaint' ),
				run: ( extras ) => extras.openStock(),
			},
			{
				label: __( 'QR Code Generator', 'wunderpaint' ),
				run: ( extras ) => extras.openQr(),
			},
		],
	},
	{
		id: 'brand-kits',
		cat: 'design',
		title: __( 'Brand Kits', 'wunderpaint' ),
		body: [
			__(
				'Assets → Brand Kits stores your visual identity in one place: brand colors, fonts, logos, a watermark and a company profile with your own variables.',
				'wunderpaint'
			),
			__(
				'Brand colors and fonts are offered throughout the editor - in pickers, generators and automations - so everything you produce stays on brand.',
				'wunderpaint'
			),
			__(
				'The profile section (company, industry, description, website and custom variables such as tone or audience) feeds the AI content generator and the brand variables of dynamic templates.',
				'wunderpaint'
			),
		],
		steps: [
			__( 'Open Assets → Brand Kits and create a kit.', 'wunderpaint' ),
			__(
				'Add your colors, pick brand fonts and upload logo and watermark.',
				'wunderpaint'
			),
			__(
				'Fill the profile fields if you use AI content or brand variables.',
				'wunderpaint'
			),
			__(
				'More than one brand? Create additional kits and pick per document.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( 'Open Brand Kits', 'wunderpaint' ),
				run: ( extras ) => extras.openBrandKits(),
			},
		],
	},
	/* -------------------------------- ai -------------------------------- */
	{
		id: 'ai',
		cat: 'ai',
		title: __( 'AI features', 'wunderpaint' ),
		body: [
			__(
				'These work locally in your browser, free, with no API key: Remove Background, Select Subject (plus the Smart Select tool, K), Blur and Depth Blur, Crop to Subject, Refine Edges, Sticker cutouts, 2× Upscale, Enhance, Remove Object (content-aware fill), Vectorize (traces an image into editable shapes), Blur Faces (finds every face and pixelates it beyond recognition), semantic image search and the Metadata Assistant (Florence-2), which writes titles, alt text, captions, descriptions and tags for whole batches. On non-English sites a small extra model translates alt text into your site language.',
				'wunderpaint'
			),
			__(
				'Text Behind Subject (AI panel) builds the magazine look in one click: it cuts out the subject locally and slides an editable headline between background and subject.',
				'wunderpaint'
			),
			__(
				'A whole family of one-click looks builds on the same local models: Color Pop keeps the subject in color on a black-and-white scene, Product Shot centers the cutout on clean white with a soft contact shadow, Neon Rim wraps it in a glowing edge on a dimmed background, Speed Blur rushes the background outward while the subject stays sharp, and Depth Fog stages atmospheric haze on the real depth map.',
				'wunderpaint'
			),
			__(
				'With an API key (Settings → AI Providers) you additionally get text-to-image generation, prompt-based layer editing, inpainting, outpainting, variations, background replacement, Restore Photo, Colorize, Cartoon and From Document. Keys stay on the server, they are never sent to your browser.',
				'wunderpaint'
			),
			__(
				'Four newer cloud helpers: the 360° format chip generates seamless panoramas for the panorama tool, "Turn into editable vector" turns a prompt into real shape layers via the local tracer, Design Review has an art director judge your design in your editor language, and Improve Text offers five stronger alternatives for the selected text layer.',
				'wunderpaint'
			),
			__(
				'The Design Generator (Automation → Design) turns a short brief into a complete, editable design in three variants: it writes the copy, composes the layout and, with a stock provider configured, drops in a real photo. Tick "Make it a dynamic template" to bind the result to post fields right away.',
				'wunderpaint'
			),
			__(
				'A monthly spend limit and per-user rate limits protect your budget.',
				'wunderpaint'
			),
		],
		guides: [ 'remove-bg' ],
		actions: [
			{
				label: __( 'Depth Blur', 'wunderpaint' ),
				run: ( extras ) => extras.openDepthBlur(),
			},
		],
	},
	{
		id: 'design-generator',
		cat: 'ai',
		title: __( 'Design Generator', 'wunderpaint' ),
		body: [
			__(
				'Automation → Design → Design Generator turns a short brief into a complete, editable design: it writes the copy, composes a fitting layout, applies your brand colors and, with a stock provider configured, drops in a real photo.',
				'wunderpaint'
			),
			__(
				'You always get three variants; opening one puts a normal layered document on the canvas - nothing is flattened, everything stays editable.',
				'wunderpaint'
			),
			__(
				'Generation needs a text provider key (Settings → AI Providers).',
				'wunderpaint'
			),
		],
		steps: [
			__(
				'Describe what you need: occasion, audience, message - and pick a format.',
				'wunderpaint'
			),
			__(
				'Choose a Brand Kit so colors and fonts match.',
				'wunderpaint'
			),
			__(
				'Generate, compare the three variants and open your favorite.',
				'wunderpaint'
			),
			__(
				'Fine-tune like any other document - or regenerate with a sharper brief.',
				'wunderpaint'
			),
		],
		tips: [
			__(
				'Tick "Make it a dynamic template" to bind the result to post fields right away - ready for the Featured Images automation.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( 'Open Design Generator', 'wunderpaint' ),
				run: ( extras ) => extras.openDesignAssistant(),
			},
		],
	},
	{
		id: 'asset-generator',
		cat: 'ai',
		title: __( 'Asset Generator', 'wunderpaint' ),
		body: [
			__(
				'Assets → Asset Generator creates new editable layers from a short prompt, in four flavors: color gradients, styled text lockups, vector shapes and AI illustrations.',
				'wunderpaint'
			),
			__(
				'Gradients, text and shapes arrive as fully editable vector layers; Illustration generates a complete image with your image provider. Suggestion chips give you one-tap starting points.',
				'wunderpaint'
			),
		],
		steps: [
			__(
				'Pick the kind: Gradient, Text, Shape or Illustration.',
				'wunderpaint'
			),
			__(
				'Describe what you want - or tap a suggestion chip.',
				'wunderpaint'
			),
			__(
				'Generate, compare the proposals and insert your favorite as a layer.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( 'Open Asset Generator', 'wunderpaint' ),
				run: ( extras ) => extras.openGenerate(),
			},
		],
	},
	{
		id: 'metadata',
		cat: 'ai',
		title: __( 'Metadata Assistant', 'wunderpaint' ),
		body: [
			__(
				'Automation → Images → Metadata Assistant writes titles, alt text, captions, descriptions and tags for your media library - locally in your browser with the bundled AI model, no API key needed.',
				'wunderpaint'
			),
			__(
				'Filter to images with missing metadata, review the suggestions per image or apply them in bulk - and on non-English sites a small extra model translates alt text into your site language.',
				'wunderpaint'
			),
		],
		steps: [
			__(
				'Open the Metadata Assistant and choose the scope: the whole library or just images with gaps.',
				'wunderpaint'
			),
			__(
				'Start the run - analysis happens in your browser, image by image.',
				'wunderpaint'
			),
			__( 'Review and apply: per image or all at once.', 'wunderpaint' ),
		],
		actions: [
			{
				label: __( 'Open Metadata Assistant', 'wunderpaint' ),
				run: ( extras ) => extras.openAltText(),
			},
		],
	},
	/* ---------------------------- automation ---------------------------- */
	{
		id: 'dynamic-templates',
		cat: 'automation',
		title: __( 'Dynamic templates & post automation', 'wunderpaint' ),
		proNote: __(
			'Binding layers to content, Preview with Post and saving a dynamic template are part of the free plugin. The bulk run described at the end, Automation → Images → Featured Images, comes with WunderPaint Pro; without it the menu entry is not there.',
			'wunderpaint'
		),
		body: [
			__(
				'Turn any design into a reusable template that fills itself with real content: select a text or image layer and pick a variable under Properties → Dynamic content. Sources include the post (title, excerpt, content, category, date), the author (name, bio, avatar), the site (name, tagline, domain, logo), WooCommerce products (price, sale price, discount, product image and more), every ACF text or image field, and any custom field via its meta key.',
				'wunderpaint'
			),
			__(
				'Draw the text box the way the design needs it and set a min and max font size: long titles shrink until they fit, and text that still overflows is shortened with an ellipsis. A variable with no value hides its layer, so a discount badge bound to "Discount %" simply disappears on products that are not on sale.',
				'wunderpaint'
			),
			__(
				'Bound image layers get an Image Fit setting under Properties: "Cover" crops the incoming picture to fill the box, "Fit" letterboxes it, and the anchor picks which part survives, so featured images of any size land undistorted. The same setting works on any image layer as a non-destructive crop.',
				'wunderpaint'
			),
			__(
				'Use View → "Preview with Post" to see the design with a real post\'s content while you work, everything stays non-destructive and your dummy text comes back when you exit the preview. Save the design via File → "Save as Dynamic Template".',
				'wunderpaint'
			),
			__(
				'Automation → Images → "Featured Images" runs templates over your content: search and filter posts, pages or products, select them in bulk, pick a template and press Process. For each entry an AI background is generated from its content (with an optional style text or reference image and your brand colors), placeholders resolve, the finished image renders and is set as the featured image. Generated images keep their full layer stack, so they open from the Media Library ready for editing, and "Also save as PDF" stores a print-ready PDF alongside the image.',
				'wunderpaint'
			),
			__(
				'Batches are resumable: progress is stored on the server, so reloading the editor continues where you stopped, and generated images live in the media library with their post, template and prompt. With Yoast SEO or Rank Math active you can also set the image as the social (OG/Twitter) image and generate an SEO title and description per post. Per-category template mapping picks the right template automatically during bulk runs.',
				'wunderpaint'
			),
		],
		guides: [ 'dynamic-template' ],
		actions: [
			{
				label: __( 'Featured Images', 'wunderpaint' ),
				run: ( extras ) => extras.openAutomate(),
			},
			{
				label: __( 'Preview with Post', 'wunderpaint' ),
				run: ( extras ) => extras.openPostPreview(),
			},
		],
	},
	{
		id: 'content-generator',
		cat: 'automation',
		title: __( 'AI content generator', 'wunderpaint' ),
		proNote: __(
			'The content generator is part of WunderPaint Pro. Without it there is no Content submenu under Automation.',
			'wunderpaint'
		),
		body: [
			__(
				'Automation → Content → "Generate Content" writes a complete draft post: the article with SEO title, meta description, slug, tags, FAQ and sources, plus body images, a featured image (optionally rendered from a dynamic design template in your brand), a social/OG crop and an optional infographic. Everything arrives as a WordPress draft, nothing publishes automatically.',
				'wunderpaint'
			),
			__(
				'Content Templates are the recipes behind it: system prompt, image style, output rules, language, thinking budget and web search. The starter templates cover formats from SEO/GEO articles over how-to guides, comparisons and local SEO to news announcements; starters are read-only, saving one creates your editable copy.',
				'wunderpaint'
			),
			__(
				'Company facts come from the brand kit profile (Assets → Brand Kits): company, industry, description, address, website and your custom variables such as tone or audience. "Suggest topics" proposes three article ideas from that profile and avoids topics your recent posts already cover, and the internal-link suggestions find matching posts and pages by relevance.',
				'wunderpaint'
			),
			__(
				'Article generation needs a text provider key (Anthropic, OpenAI or Gemini), images need Gemini or OpenAI. Long generations run as detached server jobs, so webserver timeouts on shared hosting cannot interrupt them; the dialog shows live progress with steps and elapsed time.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( 'Generate Content', 'wunderpaint' ),
				run: ( extras ) => extras.openCreatePost(),
			},
			{
				label: __( 'Content Templates', 'wunderpaint' ),
				run: ( extras ) => extras.openContentTemplates(),
			},
		],
	},
	{
		id: 'actions',
		cat: 'automation',
		title: __( 'Actions & batch processing', 'wunderpaint' ),
		proNote: __(
			'Recording, playing and saving actions is part of the free plugin. The Image Processor, which runs an action over many library images at once, comes with WunderPaint Pro.',
			'wunderpaint'
		),
		body: [
			__(
				'The Actions panel records repeatable sequences: press Record, apply filters, effects, adjustments or image operations, then stop and name the action. Play it on any image straight from the Actions menu, or save a layer’s filter + adjustments directly as a "look".',
				'wunderpaint'
			),
			__(
				'Automation → Images → Image Processor applies an action plus export settings to many library images at once, as new attachments or versioned overwrites, optionally watermarked.',
				'wunderpaint'
			),
			__(
				'Actions export/import as JSON files, so you can share them between sites.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( 'Actions', 'wunderpaint' ),
				run: ( extras ) => extras.openActions(),
			},
			{
				label: __( 'Image Processor', 'wunderpaint' ),
				run: ( extras ) => extras.openBatch(),
			},
		],
	},
	{
		id: 'csv-merge',
		cat: 'automation',
		title: __( 'Generate from CSV', 'wunderpaint' ),
		proNote: __(
			'Generate from CSV is part of WunderPaint Pro. Placeholders in text layers work in the free plugin, the series run does not.',
			'wunderpaint'
		),
		body: [
			__(
				'Automation → Images → Generate from CSV turns one dynamic design into a whole series: every row of a spreadsheet renders the current document once and saves it to the Media Library - name badges, certificates, price tags, event graphics.',
				'wunderpaint'
			),
			__(
				'Mapping is automatic: type placeholders like {{title}} or {{price}} straight into your text layers, then pick a CSV whose column headers carry the same names. The file name of each generated image comes from the column you choose.',
				'wunderpaint'
			),
		],
		steps: [
			__(
				'Put {{placeholders}} into the text layers of your design - any name works.',
				'wunderpaint'
			),
			__(
				'Open Generate from CSV and load your CSV (a sample file is one click away).',
				'wunderpaint'
			),
			__(
				'Choose the file-name column and run: one Media Library image per row.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( 'Open Generate from CSV', 'wunderpaint' ),
				run: ( extras ) => extras.openMerge(),
			},
		],
	},
	{
		id: 'embed',
		cat: 'automation',
		title: __( 'Shortcodes, blocks & Elementor', 'wunderpaint' ),
		proNote: __(
			'Everything in this article is part of WunderPaint Pro: the shortcodes, the blocks, the Elementor widgets and the settings tab that switches them on and off.',
			'wunderpaint'
		),
		body: [
			__(
				'A design does not have to stay a static image. View → Dynamic Template Shortcodes collects everything to embed the current design: a dynamic image that re-renders with its post, a live badge that follows its post without a re-render, and a personalized image that adapts to each visitor.',
				'wunderpaint'
			),
			__(
				'The same features exist as Gutenberg blocks and - with Elementor active - as native Elementor widgets (Dynamic Image, Live Badge, Personalized Image); search for "wpie" in the widget panel. The plugin settings page has a "Widgets & Blocks" tab to switch both integrations on or off.',
				'wunderpaint'
			),
			__(
				"Personalized images render in the visitor's browser: URL parameters fill the template per viewer - a greeting with ?name=Anna, for example - without creating a file per visitor.",
				'wunderpaint'
			),
			__(
				'The three embeds render differently, and that decides which one fits: Dynamic Image is a real image rendered by the editor engine, so it looks exactly like the design. A live badge is vector graphics (SVG) whose bound texts the server fills in as the page is served, so an edit shows up without waiting for a re-render - that costs a little visual fidelity.',
				'wunderpaint'
			),
		],
		tips: [
			__(
				'Use live badges for small, text-driven elements that follow their post: prices, dates, ratings, headlines. Keep the design to text, shapes and gradients - exactly what translates cleanly to SVG.',
				'wunderpaint'
			),
			__(
				'On a site with a page cache, a badge is as current as the page it sits on. Editing the post refreshes both, because the cache drops that page. A value changed without saving its post - a stock count written straight to a custom field, for example - can lag behind until the cached page expires.',
				'wunderpaint'
			),
			__(
				'A live badge is not a pixel-perfect copy of the editor preview: the browser lays out its text, so spacing and line breaks can shift slightly, and complex layer effects are simplified. Pixel layers are embedded as static images.',
				'wunderpaint'
			),
			__(
				'When the embed must look exactly like the editor shows it, choose Dynamic Image instead: it re-bakes on saves and template updates rather than as the page is served, but every pixel matches your design.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( 'Dynamic Template Shortcodes', 'wunderpaint' ),
				run: ( extras ) => extras.openShortcodes?.(),
			},
		],
	},
	/* ------------------------------ system ------------------------------ */
	{
		id: 'library-cleanup',
		cat: 'system',
		title: __( 'Finding and deleting unused images', 'wunderpaint' ),
		body: [
			__(
				'Open any image in the Media Library Manager and the Usage tab lists every place on your site that points at it: post and page content, custom fields and page builder layouts, product galleries, the site logo and other theme settings, category images, and your own saved WunderPaint designs. Each entry links straight to the thing that uses it. This check runs live every time you look, so it is never based on stale information.',
				'wunderpaint'
			),
			__(
				'Media Library Tools → "Clean up the library" applies the same check to the whole library at once and sorts the result into four groups: in use, unused, uploaded recently, and not checked. Only the "unused" group can be cleaned up. Images from the last two weeks are held back on purpose, because an image uploaded on Tuesday has probably just not been placed yet.',
				'wunderpaint'
			),
			__(
				'Nothing is deleted at the moment you ask for it. Images move to the WordPress trash with their file left in place, so every address on your site keeps working even if the check was wrong about one of them. After the retention period a scheduled job looks at each entry a second time, and anything that turns out to be in use by then restores itself. Until that point you can put any of it back from the "Waiting to be deleted" tab.',
				'wunderpaint'
			),
			__(
				'Two more lists sit alongside it. Orphaned files are files in your uploads folder that no library entry points at, usually left behind by imports or removed plugins; WunderPaint\u2019s own folders are always skipped. Oversized originals are images stored much larger than any size your site actually delivers, and they can be handed to the Image Processor already set to the right width.',
				'wunderpaint'
			),
		],
		steps: [
			__(
				'Open Media Library Tools → "Clean up the library" and press "Check the library". The scan works through your content in slices and can be stopped at any time.',
				'wunderpaint'
			),
			__(
				'Read the four numbers before you touch anything. If most of your library is "uploaded recently" or "not checked", there is nothing to clean up yet.',
				'wunderpaint'
			),
			__(
				'On the Unused tab, open anything you are unsure about in the manager first and read its Usage tab. The list is a proposal, not a verdict.',
				'wunderpaint'
			),
			__(
				'Select what you want gone and move it to the holding area. Every image is checked once more at that moment, and anything that turns out to be in use is kept and reported back to you.',
				'wunderpaint'
			),
			__(
				'Check the "Waiting to be deleted" tab before the period runs out if you want anything back.',
				'wunderpaint'
			),
		],
		tips: [
			__(
				'The check reads content, custom fields, options, taxonomy and user meta, and WunderPaint\u2019s own data. It cannot know about a plugin that stores image IDs somewhere of its own invention, or about a hard-coded filename in a theme template. If you use something unusual, spot-check a few images through the Usage tab before trusting a bulk action.',
				'wunderpaint'
			),
			__(
				'If any source fails to read during a scan, the run offers nothing for cleanup at all rather than guessing. That is deliberate: a failed query looks exactly like a source with no references in it.',
				'wunderpaint'
			),
			__(
				'A reference that exists only in a post revision or in a generated cache does not count as usage, because neither is something a visitor sees. A draft or a scheduled post does count.',
				'wunderpaint'
			),
			__(
				'Take a backup before your first bulk cleanup. Not because the tool expects to be wrong, but because that is the right habit for anything that removes files in bulk.',
				'wunderpaint'
			),
			__(
				'Developers: register your own source with the wpie_media_usage_sources filter and your images stop looking unused. The retention period is filterable with wpie_quarantine_days and the grace period with wpie_media_usage_grace_days.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( 'Manage Media Library', 'wunderpaint' ),
				run: ( extras ) => extras.openMediaLibrary?.(),
			},
		],
	},
	{
		id: 'media-library',
		cat: 'system',
		title: __( 'Media Library Manager', 'wunderpaint' ),
		body: [
			__(
				'Assets → "Manage Media Library" opens a full manager for your whole library. Organize with real folders and tags (stored as WordPress taxonomies, so they persist outside the editor too): drag images between folders, multi-select with Shift and Ctrl, and bulk move, tag, set as featured image or delete.',
				'wunderpaint'
			),
			__(
				'Search combines everything: type a phrase for semantic search (finds images by what they show, using the local model) and narrow by color, file type, orientation and size, then sort the results. Smart folders collect Missing alt text, Unused and Reclaim space automatically, and you can save any search as your own smart folder.',
				'wunderpaint'
			),
			__(
				'Media Library Tools (bottom of the sidebar) hold the housekeeping: Suggest folders clusters similar images, Find duplicates groups near-identical ones for review with a keep-or-trash choice per image, plus Regenerate thumbnails, Rename by pattern, Find broken files and Generate Metadata.',
				'wunderpaint'
			),
			__(
				'Uploading is smarter here: dropped files are checked against your library for near-duplicates before import, land straight in the current folder, and can be optimized (WebP, downscaled) and described on the way in. PDFs upload too and show up under the Documents type or the PDF file-type filter.',
				'wunderpaint'
			),
			__(
				'Every image also has a Usage tab showing where it is used, an Origin tab for source, creator and licence, and a Replace button that swaps the file while keeping the library entry. Deleting unused images has its own article, because it deserves to be read before it is used.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( 'Manage Media Library', 'wunderpaint' ),
				run: ( extras ) => extras.openMediaLibrary(),
			},
		],
	},
	{
		id: 'recrop',
		cat: 'system',
		title: __( 'Recrop thumbnails', 'wunderpaint' ),
		body: [
			__(
				'WordPress crops sizes like the thumbnail dead center, which happily beheads portraits in theme grids. Recrop thumbnails lets you place the crop window yourself, per image and per size.',
				'wunderpaint'
			),
			__(
				'Open the detail editor of an image in the Media Library Manager and choose Recrop thumbnails: every cropped size appears with its current window, the box is ratio-locked, and Auto-frame subject places it around the detected subject using the local model.',
				'wunderpaint'
			),
			__(
				'Saving rewrites only the generated size files. File names never change, so published pages simply show the better crop - and the original upload is never touched.',
				'wunderpaint'
			),
		],
		tips: [
			__(
				'Browsers cache thumbnails, so a published page may show the old crop until its cache expires.',
				'wunderpaint'
			),
		],
	},
	{
		id: 'library-file-data',
		cat: 'system',
		title: __( 'What is inside an image file', 'wunderpaint' ),
		body: [
			__(
				'The File data tab in an image detail editor reads what the file itself carries, which is not the same as what the library shows: the camera and lens, the exposure, the software that has touched it, and often the exact spot on earth it was taken at. Phone cameras record all of this by default.',
				'wunderpaint'
			),
			__(
				'Coordinates are turned into a place name and a distance using the place index that ships with the plugin, so working out where a photo was taken never sends anything to an outside service.',
				'wunderpaint'
			),
			__(
				'"Remove location" clears just the coordinates and leaves the camera details in place; "Remove all metadata" clears every embedded block. Both run on the original and on every size generated from it, and neither re-saves the picture, so image quality is unchanged. The previous files are kept as a version you can restore at any time.',
				'wunderpaint'
			),
		],
		tips: [
			__(
				'Location data mostly survives in the original file rather than in the generated sizes, and the original is reachable under its own address.',
				'wunderpaint'
			),
		],
	},
	{
		id: 'saving',
		cat: 'system',
		title: __( 'Saving, versions & export', 'wunderpaint' ),
		body: [
			__(
				'"Save to Media Library" replaces the image and archives the previous file, restore any version from the History panel. Add a version note in the save dialog to remember what changed.',
				'wunderpaint'
			),
			__(
				'"Keep editable project file" stores your layers alongside the image, so reopening restores the full layer stack.',
				'wunderpaint'
			),
			__(
				'Export offers PNG, JPEG, WebP (and AVIF where supported) with a live size preview, export presets, batch sizes as ZIP, watermarking and copy-to-clipboard. The download icon in the title bar quick-exports with your last settings. PSD export keeps layers for Photoshop.',
				'wunderpaint'
			),
			__(
				'"EU AI label" places one of the European Commission\'s official emblems into the picture, in the color, corner and size you pick. It applies only when you choose one, and you can add the matching IPTC entry to the file metadata with the box below it. The same emblems are in the library under Brand Kits if you would rather place one as a layer.',
				'wunderpaint'
			),
		],
		tips: [
			__(
				'File → Export Carousel exports the document as a numbered image sequence - handy for Instagram carousels.',
				'wunderpaint'
			),
			__(
				'Editing an image from a page builder? On apply you pick the destination: a new copy for just that element (default), or overwriting the original so every use of the image follows - the previous file stays restorable as a version.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( 'Export', 'wunderpaint' ),
				run: ( extras ) => extras.openExport( 'export' ),
			},
			{
				label: __( 'Export Carousel', 'wunderpaint' ),
				run: ( extras ) => extras.openCarousel(),
			},
		],
	},
	{
		id: 'extensions',
		cat: 'system',
		title: __( 'Extensions', 'wunderpaint' ),
		body: [
			__(
				'Help → Manage Extensions installs add-ons directly inside the editor: a small ZIP package adds generators, asset packs, template packs, effects, tools or panels. Installed extensions open from the top-level Extensions menu. Extensions never appear in the WordPress plugin list, load only on the editor page and cannot run server code - installing needs administrator rights.',
				'wunderpaint'
			),
			__(
				'Fresh installs are active immediately. Disabling or updating an extension that is already loaded takes effect the next time the editor reloads; the manager shows a note when that is the case, and it also surfaces load errors of broken packages.',
				'wunderpaint'
			),
			__(
				'Asset packs appear as their own chip in the Asset Library tray, generators in the Extensions menu, effects in the Filter menu and the Adjust panel. Everything an extension inserts stays a normal layer - projects still open fine if the extension is removed later.',
				'wunderpaint'
			),
			__(
				'Developers: the ZIP needs just a manifest.json and one JavaScript file. See docs/extending.md in the plugin folder (with two copy-ready examples) for the full API.',
				'wunderpaint'
			),
		],
		tips: [
			__(
				'The 3D and motion studios need WebGL2 with hardware graphics - every current desktop browser has it, but VMs and remote desktops often do not. If a studio reports it cannot run, Help → System Status → Device & graphics shows what your browser provides.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( 'Manage Extensions', 'wunderpaint' ),
				run: ( extras ) => extras.openExtensions(),
			},
		],
	},
	{
		id: 'status',
		cat: 'system',
		title: __( 'System Status', 'wunderpaint' ),
		body: [
			__(
				'Help → System Status shows the whole installation at a glance: active extensions, installed local AI models, the semantic search index with a manage button, content counts, the plugin version, and the device itself - browser, display and whether graphics run hardware-accelerated. Administrators also see a storage overview: how much disk space versions, AI models, extensions and the media library take, and how much is still free.',
				'wunderpaint'
			),
			__(
				'The debug log below records errors, failed requests and model events of the current session. Export log downloads one JSON file to attach to a support request - it contains the status counts, device and graphics facts and the log, never document content, images or API keys.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( 'Open System Status', 'wunderpaint' ),
				run: ( extras ) => extras.openStatus(),
			},
		],
	},
	{
		id: 'settings',
		cat: 'system',
		title: __( 'Settings & automation', 'wunderpaint' ),
		body: [
			__(
				'Settings → WunderPaint (admin) configures AI provider keys, the default canvas size, theme, versioning depth and who may use the editor.',
				'wunderpaint'
			),
			__(
				'Automation → Images → Batch Watermark does everything in one modal: pick a watermark from your Brand Kits or upload one, tune position, size, opacity and margin with a live preview on the first selected image, choose the target images and run. Brand Kits themselves are managed inside the editor under Assets → Brand Kits.',
				'wunderpaint'
			),
			__(
				'Settings → Backup exports one portable ZIP with everything you built: brand kits with logo and watermark files, dynamic templates, designs, library assets, content templates, uploaded custom fonts and installed editor extensions. Local AI models and the search index are left out on purpose, they rebuild themselves.',
				'wunderpaint'
			),
			__(
				'Other plugins can extend the editor with new effects, tools and panels, see docs/extending.md in the plugin folder.',
				'wunderpaint'
			),
		],
		actions: [
			{
				label: __( 'Batch Watermark', 'wunderpaint' ),
				run: ( extras ) => extras.openBatchWatermark(),
			},
		],
	},
];

/**
 * Case-insensitive search over title, body, steps and tips.
 *
 * @param {Array}  articles HELP_ARTICLES.
 * @param {string} query    Search text.
 * @return {Array} Matching articles (all when query is empty).
 */
export function searchArticles( articles, query ) {
	const q = ( query || '' ).trim().toLowerCase();
	if ( ! q ) {
		return articles;
	}
	return articles.filter( ( a ) =>
		[
			a.title,
			...a.body,
			...( a.steps || [] ),
			...( a.tips || [] ),
			// Searchable too, so "Pro" finds the articles that need it.
			...( a.proNote ? [ a.proNote ] : [] ),
		].some( ( p ) => p.toLowerCase().includes( q ) )
	);
}
