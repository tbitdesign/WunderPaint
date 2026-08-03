/**
 * Generate src/ui-icons.json from the curated Tabler SVGs in
 * assets/ui-icons/ (MIT, tabler.io — picked by hand for the editor UI).
 * UI_ICON_MAP maps our icon registry ids (src/icons.jsx `I`) to SVG
 * files; icons.jsx overrides the hand-drawn originals with these path
 * sets at module load. Add a mapping + rerun `npm run build` to swap
 * more icons.
 */

const fs = require( 'fs' );
const path = require( 'path' );

const SRC = path.join( __dirname, '..', 'assets', 'ui-icons' );
const OUT = path.join( __dirname, '..', 'src', 'ui-icons.json' );

// Wave 1 (v1.51): the tool rail. Wave 2 (v1.52): everything else — tabs,
// panels, menubar, text styling, align/distribute, layer chrome.
const UI_ICON_MAP = {
	// Canvas grips (v1.372): the text spacing grips carry their meaning
	// as a glyph, because a bar on an edge cannot say WHICH spacing.
	letterSpacing: 'letter-spacing.svg',
	lineSpacing: 'arrows-vertical.svg',
	textWidth: 'arrow-autofit-width.svg',
	// Tool rail.
	move: 'move.svg',
	marquee: 'marquee.svg',
	lasso: 'lasso-select.svg',
	wand: 'magic-wand.svg',
	crop: 'crop.svg',
	brush: 'brush.svg',
	pencil: 'pencil.svg',
	eraser: 'eraser.svg',
	bucket: 'paint-bucket.svg',
	gradient: 'gradient.svg',
	stamp: 'clone-stamp.svg',
	fxbrush: 'blur-sharpen.svg',
	text: 'text.svg',
	shape: 'shape.svg',
	pen: 'pen-tool.svg',
	eyedropper: 'eyedropper.svg',
	hand: 'hand.svg',
	zoom: 'zoom-in.svg',
	smartselect: 'smart-select.svg',
	sparkAI: 'ai.svg',
	// Right-panel tabs.
	layers: 'layers.svg',
	sliders: 'properties.svg',
	adjust: 'adjust.svg',
	fx: 'effects.svg',
	history: 'history.svg',
	sparkles: 'ai-generate.svg',
	// Text styling + alignment.
	bold: 'bold.svg',
	italic: 'italic.svg',
	underline: 'underline.svg',
	alignL: 'left.svg',
	alignC: 'center.svg',
	alignR: 'right.svg',
	objAlignL: 'align-left.svg',
	objAlignCH: 'align-center.svg',
	objAlignR: 'align-right.svg',
	objAlignT: 'align-top.svg',
	objAlignM: 'align-middle.svg',
	objAlignB: 'align-bottom.svg',
	distributeH: 'distribute-horizontal.svg',
	distributeV: 'distribute-vertical.svg',
	textLayout: 'layout.svg',
	// Layer chrome + panel actions.
	eye: 'compare.svg',
	eyeOff: 'eye-off.svg',
	lock: 'lock-closed.svg',
	unlock: 'lock-open.svg',
	plus: 'plus.svg',
	minus: 'minus.svg',
	trash: 'delete.svg',
	duplicate: 'duplicate.svg',
	folder: 'folder.svg',
	mask: 'add-mask.svg',
	removebg: 'remove-background.svg',
	arrUp: 'move-up.svg',
	arrDown: 'move-down.svg',
	// Menubar / titlebar / misc chrome.
	undo: 'undo.svg',
	redo: 'redo.svg',
	save: 'save.svg',
	download: 'quick-export.svg',
	close: 'x.svg',
	check: 'check.svg',
	sun: 'light-mode.svg',
	moon: 'dark-mode.svg',
	camera: 'camera.svg',
	link: 'link.svg',
	unlink: 'link-off.svg',
	swap: 'switch-horizontal.svg',
	chevDown: 'chevron-down.svg',
	chevRight: 'chevron-right.svg',
	flipH: 'flip-h.svg',
	flipV: 'flip-v.svg',
	rotateCw: 'rotate-clockwise.svg',
	rotateCcw: 'rotate.svg',
	// Image fit cycle in the canvas context bar (v1.250): one arrow
	// family so the three states read as one control.
	fitStretch: 'arrows-diagonal.svg',
	fitCover: 'arrows-maximize.svg',
	fitContain: 'arrows-minimize.svg',
};

function pathsOf( file ) {
	const svg = fs.readFileSync( path.join( SRC, file ), 'utf8' );
	const ds = [];
	const re = /<path[^>]*\sd="([^"]+)"[^>]*\/?>/g;
	let m;
	while ( ( m = re.exec( svg ) ) ) {
		// Tabler's first path is the transparent 24x24 backdrop — skip it.
		if (
			'M0 0h24v24H0z' ===
			m[ 1 ].replace( /\s+/g, '' ).replace( /z$/i, 'z' )
		) {
			continue;
		}
		if ( /stroke="none"/.test( m[ 0 ] ) && /fill="none"/.test( m[ 0 ] ) ) {
			continue;
		}
		ds.push( m[ 1 ] );
	}
	if ( ! ds.length ) {
		throw new Error( 'no paths in ' + file );
	}
	return ds;
}

const out = {};
for ( const [ id, file ] of Object.entries( UI_ICON_MAP ) ) {
	out[ id ] = pathsOf( file );
}
fs.writeFileSync( OUT, JSON.stringify( out, null, '\t' ) + '\n' );
// eslint-disable-next-line no-console
console.log(
	'ui-icons: ' + Object.keys( out ).length + ' icons -> src/ui-icons.json'
);
