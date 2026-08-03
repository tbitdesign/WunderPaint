/**
 * Fill and texture layers, mockup frames, palettes, saved designs, photo
 * frames and page handling: the ops behind the asset-facing menus.
 *
 * Split out of src/store/ops.js in v1.338.0, which had grown to 2944 lines.
 * ops.js stays as the barrel over these modules - the same shape src/lib/raster.js
 * uses - so every existing `from './ops'` import is unchanged.
 */

import { __ } from '@wordpress/i18n';
import {
	makeRaster,
	makeGroup,
	makeShape,
	makeGradient,
	serializeLayers,
} from '../document';
import { activeLayerOf } from '../editor-context';
import {
	renderToCanvas,
	renderToDataURL,
	createCanvas,
	sharedImageCache,
} from '../../lib/raster';
import { promptDialog, confirmDialog } from '../../lib/dialogs';
import { shapeToPathD } from '../../lib/shape-path';

/* --------------------- Fill / texture layers (v1.8) --------------------- */

/**
 * Full-canvas fill layer: solid, gradient or pattern, plain layers, so
 * every property stays editable afterwards.
 *
 * @param {Object} editor Editor context.
 * @param {string} kind   'solid' | 'gradient' | 'pattern'.
 */
export function newFillLayerOp( editor, kind ) {
	const { state, dispatch, commit } = editor;
	const full = { x: 0, y: 0, w: state.doc.w, h: state.doc.h };
	let layer;
	if ( 'gradient' === kind ) {
		layer = makeGradient( {
			...full,
			name: __( 'Gradient Fill', 'wunderpaint' ),
			stops: [
				{ color: state.fgColor || '#3b66ff', at: 0 },
				{ color: state.bgColor || '#ffffff', at: 1 },
			],
			from: { x: 0, y: 0 },
			to: { x: 0, y: state.doc.h },
		} );
	} else if ( 'pattern' === kind ) {
		layer = makeShape( {
			...full,
			name: __( 'Pattern Fill', 'wunderpaint' ),
			fill: state.fgColor || '#1a1d21',
			pattern: 'dots',
		} );
	} else {
		layer = makeShape( {
			...full,
			name: __( 'Color Fill', 'wunderpaint' ),
			fill: state.fgColor || '#3b66ff',
		} );
	}
	dispatch( { type: 'ADD_LAYER', layer } );
	commit( __( 'New Fill Layer', 'wunderpaint' ) );
}

/**
 * Procedural texture overlay layer (grain/paper/noise/scanlines) with a
 * fitting blend mode, instant organic finish (v1.8).
 *
 * @param {Object} editor Editor context.
 * @param {string} kind   'grain' | 'paper' | 'noise' | 'scanlines'.
 */
export function newTextureLayerOp( editor, kind ) {
	const { state, dispatch, commit } = editor;
	const w = state.doc.w;
	const h = state.doc.h;
	const canvas = createCanvas( w, h );
	const ctx = canvas.getContext( '2d' );
	const rnd = ( seed ) => {
		// Tiny deterministic PRNG, texture layers serialize/replay stably.
		let s = seed;
		return () => {
			s = ( s * 1664525 + 1013904223 ) % 4294967296;
			return s / 4294967296;
		};
	};
	const SEEDS = {
		grain: 3,
		paper: 5,
		scanlines: 7,
		canvas: 11,
		crosshatch: 13,
		concrete: 17,
		fibers: 19,
		noise: 23,
	};
	const rand = rnd( SEEDS[ kind ] || 3 );
	if ( 'scanlines' === kind ) {
		ctx.fillStyle = 'rgba(0,0,0,0.55)';
		for ( let y = 0; y < h; y += 4 ) {
			ctx.fillRect( 0, y, w, 1 );
		}
	} else if ( 'canvas' === kind ) {
		// Woven linen: fine dark warp + a light weft one pixel below, plus a
		// dark vertical thread, so the weave reads from any distance.
		ctx.lineWidth = 1;
		for ( let y = 0.5; y < h; y += 3 ) {
			ctx.strokeStyle = 'rgba(0,0,0,0.06)';
			ctx.beginPath();
			ctx.moveTo( 0, y );
			ctx.lineTo( w, y );
			ctx.stroke();
			ctx.strokeStyle = 'rgba(255,255,255,0.05)';
			ctx.beginPath();
			ctx.moveTo( 0, y + 1 );
			ctx.lineTo( w, y + 1 );
			ctx.stroke();
		}
		ctx.strokeStyle = 'rgba(0,0,0,0.05)';
		for ( let x = 0.5; x < w; x += 3 ) {
			ctx.beginPath();
			ctx.moveTo( x, 0 );
			ctx.lineTo( x, h );
			ctx.stroke();
		}
	} else if ( 'crosshatch' === kind ) {
		// Pen-style hatching in both diagonals.
		ctx.lineWidth = 1;
		ctx.strokeStyle = 'rgba(0,0,0,0.08)';
		for ( let d = -h; d < w; d += 5 ) {
			ctx.beginPath();
			ctx.moveTo( d, 0 );
			ctx.lineTo( d + h, h );
			ctx.stroke();
		}
		for ( let d = 0; d < w + h; d += 5 ) {
			ctx.beginPath();
			ctx.moveTo( d, 0 );
			ctx.lineTo( d - h, h );
			ctx.stroke();
		}
	} else if ( 'concrete' === kind ) {
		// Low-resolution value noise, smoothly upscaled = soft mottled stone.
		const step = Math.max( 2, Math.round( Math.min( w, h ) / 42 ) );
		const sw = Math.max( 2, Math.ceil( w / step ) );
		const sh = Math.max( 2, Math.ceil( h / step ) );
		const small = createCanvas( sw, sh );
		const sctx = small.getContext( '2d' );
		const simg = sctx.createImageData( sw, sh );
		for ( let i = 0; i < simg.data.length; i += 4 ) {
			const v = 120 + rand() * 135;
			simg.data[ i ] = v;
			simg.data[ i + 1 ] = v;
			simg.data[ i + 2 ] = v;
			simg.data[ i + 3 ] = 255;
		}
		sctx.putImageData( simg, 0, 0 );
		ctx.imageSmoothingEnabled = true;
		ctx.drawImage( small, 0, 0, sw, sh, 0, 0, w, h );
	} else if ( 'fibers' === kind ) {
		// Many faint short strokes = handmade-paper fibers.
		ctx.lineWidth = 1;
		const count = Math.round( ( w * h ) / 450 );
		for ( let n = 0; n < count; n++ ) {
			const x = rand() * w;
			const y = rand() * h;
			const len = 5 + rand() * 26;
			const ang = ( rand() - 0.5 ) * 0.7;
			ctx.strokeStyle =
				rand() > 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)';
			ctx.beginPath();
			ctx.moveTo( x, y );
			ctx.lineTo( x + Math.cos( ang ) * len, y + Math.sin( ang ) * len );
			ctx.stroke();
		}
	} else {
		const img = ctx.createImageData( w, h );
		const mono = 'noise' !== kind;
		for ( let i = 0; i < img.data.length; i += 4 ) {
			const v = rand() * 255;
			img.data[ i ] = v;
			img.data[ i + 1 ] = mono ? v : rand() * 255;
			img.data[ i + 2 ] = mono ? v : rand() * 255;
			// Paper is sparse fibers; grain/noise are dense speckle.
			img.data[ i + 3 ] =
				'paper' === kind ? ( rand() > 0.82 ? 90 : 0 ) : 255;
		}
		ctx.putImageData( img, 0, 0 );
	}
	const names = {
		grain: __( 'Grain', 'wunderpaint' ),
		paper: __( 'Paper', 'wunderpaint' ),
		noise: __( 'Color Noise', 'wunderpaint' ),
		scanlines: __( 'Scanlines', 'wunderpaint' ),
		canvas: __( 'Canvas Weave', 'wunderpaint' ),
		crosshatch: __( 'Cross-hatch', 'wunderpaint' ),
		concrete: __( 'Concrete', 'wunderpaint' ),
		fibers: __( 'Fibers', 'wunderpaint' ),
	};
	const MULTIPLY = [ 'scanlines', 'paper', 'crosshatch' ];
	const OPACITY = {
		noise: 0.18,
		crosshatch: 0.5,
		fibers: 0.5,
		concrete: 0.5,
		canvas: 0.6,
	};
	const layer = makeRaster( {
		name: names[ kind ] || names.grain,
		x: 0,
		y: 0,
		w,
		h,
		canvas,
	} );
	layer.blend = MULTIPLY.includes( kind ) ? 'multiply' : 'soft-light';
	layer.opacity = OPACITY[ kind ] ?? 0.35;
	dispatch( { type: 'ADD_LAYER', layer } );
	commit( __( 'New Texture Layer', 'wunderpaint' ) );
}

/* ------------------------- Mockup frames (v1.8) ------------------------- */

export async function extractColorsOp( editor, extras ) {
	const { state } = editor;
	const layer = activeLayerOf( state );
	if ( ! layer || ! [ 'image', 'raster', 'smart' ].includes( layer.type ) ) {
		extras.toasts.error(
			__( 'Select an image layer first.', 'wunderpaint' )
		);
		return;
	}
	const { extractPalette } = await import( '../../lib/palette' );
	const canvas = await renderToCanvas(
		{ ...state.doc, bg: 'transparent' },
		[ { ...layer, parent: null } ],
		{
			viewport: {
				x: layer.x,
				y: layer.y,
				w: Math.max( 1, layer.w ),
				h: Math.max( 1, layer.h ),
			},
			scale: Math.min( 1, 256 / Math.max( 1, layer.w ) ),
			cache: sharedImageCache,
		}
	);
	const palette = extractPalette( canvas, 12 );
	if ( ! palette.length ) {
		extras.toasts.error(
			__( 'Could not extract colors from this layer.', 'wunderpaint' )
		);
		return;
	}
	const { setExtractedColors } = await import( '../../lib/extracted-colors' );
	setExtractedColors( palette );
	extras.toasts.success(
		__(
			'Colors extracted. They are now in the colour picker.',
			'wunderpaint'
		)
	);
}

/**
 * Remap every color in the document onto a palette, instant rebranding.
 * Each color snaps to the perceptually nearest palette entry; alpha is
 * preserved.
 *
 * @param {Object} editor Editor context.
 * @param {Object} extras Editor extras (toasts).
 * @param {string} source 'brand' (settings colors) or 'image' (active layer).
 */
export async function applyPaletteOp( editor, extras, source ) {
	const { state, dispatch, commit } = editor;
	let palette = [];
	if ( 'brand' === source ) {
		palette = editor.WPIE?.brand?.colors || [];
		if ( ! palette.length ) {
			extras.toasts.error(
				__(
					'No brand colors configured, add them in Settings → Brand Kit.',
					'wunderpaint'
				),
				{
					linkText: __( 'Settings', 'wunderpaint' ),
					linkHref: editor.WPIE.settingsUrl,
				}
			);
			return;
		}
	} else {
		const layer = activeLayerOf( state );
		if (
			! layer ||
			! [ 'image', 'raster', 'smart' ].includes( layer.type )
		) {
			extras.toasts.error(
				__( 'Select an image layer first.', 'wunderpaint' )
			);
			return;
		}
		const { renderToCanvas: renderFull, sharedImageCache: cache } =
			await import( '../../lib/raster' );
		const flat = await renderFull(
			{ ...state.doc, bg: 'transparent' },
			[ { ...layer, parent: null } ],
			{
				viewport: {
					x: layer.x,
					y: layer.y,
					w: Math.max( 1, layer.w ),
					h: Math.max( 1, layer.h ),
				},
				scale: Math.min( 1, 256 / layer.w ),
				cache,
			}
		);
		const { extractPalette } = await import( '../../lib/palette' );
		palette = extractPalette( flat, 6 );
		if ( ! palette.length ) {
			extras.toasts.error(
				__(
					'Could not extract a palette from this layer.',
					'wunderpaint'
				)
			);
			return;
		}
	}

	const { parseColor, toHexColor } = await import( '../../lib/color' );
	const paletteRgb = palette
		.map( ( c ) => parseColor( c ) )
		.filter( Boolean );
	if ( ! paletteRgb.length ) {
		return;
	}
	const nearest = ( str ) => {
		const c = parseColor( str );
		if ( ! c ) {
			return str;
		}
		let best = paletteRgb[ 0 ];
		let bd = Infinity;
		for ( const p of paletteRgb ) {
			const d =
				3 * ( p.r - c.r ) * ( p.r - c.r ) +
				4 * ( p.g - c.g ) * ( p.g - c.g ) +
				2 * ( p.b - c.b ) * ( p.b - c.b );
			if ( d < bd ) {
				bd = d;
				best = p;
			}
		}
		return toHexColor( best.r, best.g, best.b, c.a ?? 1 );
	};
	const remapStops = ( stops ) =>
		stops?.map( ( s ) => ( { ...s, color: nearest( s.color ) } ) ) || null;

	dispatch( {
		type: 'SET_LAYERS',
		layers: state.layers.map( ( l ) => {
			const patch = { ...l };
			for ( const field of [
				'fill',
				'stroke',
				'color',
				'outlineColor',
				'shadowColor',
				'bgColor',
			] ) {
				if ( patch[ field ] && 'transparent' !== patch[ field ] ) {
					patch[ field ] = nearest( patch[ field ] );
				}
			}
			if ( patch.stops ) {
				patch.stops = remapStops( patch.stops );
			}
			if ( patch.gradientStops ) {
				patch.gradientStops = remapStops( patch.gradientStops );
			}
			return patch;
		} ),
	} );
	if ( state.doc.bg && 'transparent' !== state.doc.bg ) {
		dispatch( { type: 'SET_DOC', doc: { bg: nearest( state.doc.bg ) } } );
	}
	commit( __( 'Apply Palette', 'wunderpaint' ) );
}

/* ------------------------ Batch watermark (v1.8) ------------------------ */

/* -------------------------- My Designs (v1.10) -------------------------- */

/**
 * Save the current document as a design (layered, server-side). Updates
 * the existing design when the doc is bound to one; `saveAs` forces a new
 * design under a new name.
 *
 * @param {Object}  editor Editor context.
 * @param {Object}  extras Editor extras (toasts).
 * @param {boolean} saveAs Always create a new design.
 */
export async function saveDesignOp( editor, extras, saveAs = false ) {
	const { state, dispatch } = editor;
	const existingId = ! saveAs && state.doc.source?.designId;
	let name = state.doc.name || '';
	if ( ! existingId ) {
		name = await promptDialog( {
			title: saveAs
				? __( 'Save Editable Design As', 'wunderpaint' )
				: __( 'Save Editable Design', 'wunderpaint' ),
			label: __( 'Design name', 'wunderpaint' ),
			defaultValue: state.doc.name || __( 'My Design', 'wunderpaint' ),
		} );
		if ( ! name ) {
			return;
		}
	}
	try {
		const { designs } = await import( '../../lib/api' );
		const preview = await renderToDataURL( state.doc, state.layers, {
			scale: Math.min( 320 / state.doc.w, 320 / state.doc.h, 1 ),
			format: 'jpeg',
			quality: 70,
			cache: sharedImageCache,
		} );
		// Multi-page designs (v1.11): the open document is the current page.
		let pages = null;
		if ( state.pages ) {
			pages = [ ...state.pages.list ];
			pages[ state.pages.current ] = {
				doc: { ...state.doc },
				layers: serializeLayers( state.layers ),
			};
		}
		const projectJson = JSON.stringify( {
			doc: { ...state.doc, name },
			layers: serializeLayers( state.layers ),
			...( pages ? { pages, currentPage: state.pages.current } : {} ),
		} );
		let id = existingId;
		if ( existingId ) {
			await designs.update( existingId, { projectJson, preview } );
		} else {
			const created = await designs.create( {
				name,
				projectJson,
				preview,
			} );
			id = created.id;
		}
		dispatch( {
			type: 'SET_DOC',
			doc: { name, source: { ...state.doc.source, designId: id } },
		} );
		dispatch( { type: 'MARK_SAVED' } );
		extras?.toasts?.success?.(
			__(
				'Design saved, find it under Assets → Asset Library → Designs.',
				'wunderpaint'
			)
		);
	} catch ( err ) {
		extras?.toasts?.error?.( err.message );
	}
}

/* -------------------------- Photo frames (v1.11) ------------------------ */

/**
 * Insert a styled text combination (v1.13): the combo's layers land as a
 * named group, centered on the document, every part stays editable.
 *
 * @param {Object} editor Editor context.
 * @param {Object} combo  Entry from TEXT_COMBOS.
 */
export function insertTextComboOp( editor, combo ) {
	const { state, dispatch, commit } = editor;
	const accent = editor.WPIE?.brand?.colors?.[ 0 ] || null;
	const parts = combo.build( state.doc, accent ? { accent } : {} );
	const group = makeGroup( { name: combo.label } );
	dispatch( { type: 'ADD_LAYER', layer: group } );
	for ( const part of parts ) {
		part.parent = group.id;
		dispatch( { type: 'ADD_LAYER', layer: part } );
	}
	dispatch( { type: 'SET_ACTIVE', id: group.id } );
	commit( __( 'Insert Text Combination', 'wunderpaint' ) );
}

/**
 * Insert a frame shape, drop a photo above it and use "Fit into Frame".
 *
 * @param {Object} editor Editor context.
 * @param {string} kind   circle|rounded|arch|hexagon|star|heart.
 */
export function insertFrameOp( editor, kind ) {
	const { state, dispatch, commit } = editor;
	const size = Math.round( Math.min( state.doc.w, state.doc.h ) * 0.45 );
	const base = {
		name: __( 'Frame', 'wunderpaint' ),
		x: Math.round( ( state.doc.w - size ) / 2 ),
		y: Math.round( ( state.doc.h - size ) / 2 ),
		w: size,
		h: size,
		fill: '#dfe5ee',
	};
	let layer;
	if ( 'circle' === kind ) {
		layer = makeShape( { ...base, shape: 'ellipse' } );
	} else if ( 'rounded' === kind ) {
		layer = makeShape( { ...base, radius: Math.round( size * 0.12 ) } );
	} else if ( 'hexagon' === kind ) {
		layer = makeShape( { ...base, shape: 'polygon', sides: 6 } );
	} else if ( 'star' === kind ) {
		layer = makeShape( { ...base, shape: 'star', sides: 5 } );
	} else if ( 'heart' === kind ) {
		layer = makeShape( { ...base, shape: 'heart' } );
	} else {
		// Arch: straight sides, semicircular top (pathD in layer space).
		const r = size / 2;
		layer = makeShape( {
			...base,
			pathD: `M 0 ${ size } L 0 ${ r } A ${ r } ${ r } 0 0 1 ${ size } ${ r } L ${ size } ${ size } Z`,
		} );
	}
	dispatch( { type: 'ADD_LAYER', layer } );
	commit( __( 'Insert Frame', 'wunderpaint' ) );
}

/**
 * Expand a parametric shape (ellipse/star/polygon/heart...) into an editable
 * path (v1.210.0), so ANY inserted shape gains anchor editing like a pen
 * stroke. The geometry mirrors drawShape exactly, so the look is unchanged;
 * the renderer already prefers `pathD` when present. No-op for shapes that are
 * already paths or have no area (line).
 *
 * @param {Object} editor Editor context.
 * @param {string} id     Shape layer id.
 * @return {boolean} Whether the shape was converted.
 */
export function convertShapeToPathOp( editor, id ) {
	const { state, dispatch, commit } = editor;
	const layer = state.layers.find( ( l ) => l.id === id );
	if ( ! layer || 'shape' !== layer.type || layer.pathD || layer.quad ) {
		return false;
	}
	const pathD = shapeToPathD( layer );
	if ( ! pathD ) {
		return false;
	}
	dispatch( { type: 'UPDATE_LAYER', id, patch: { pathD } } );
	commit( __( 'Convert to Path', 'wunderpaint' ) );
	return true;
}

/**
 * Fit the active image into the frame shape directly below it: clip it
 * and cover-fit its bounds to the frame (v1.11).
 *
 * @param {Object} editor Editor context.
 * @param {Object} extras Editor extras (toasts).
 */
export function fitIntoFrameOp( editor, extras ) {
	const { state, dispatch, commit } = editor;
	const layer = activeLayerOf( state );
	if ( ! layer || ! [ 'image', 'raster', 'smart' ].includes( layer.type ) ) {
		extras?.toasts?.error?.(
			__( 'Select an image layer first.', 'wunderpaint' )
		);
		return;
	}
	const idx = state.layers.findIndex( ( l ) => l.id === layer.id );
	const frame = state.layers
		.slice( 0, idx )
		.reverse()
		.find( ( l ) => 'shape' === l.type && l.visible );
	if ( ! frame ) {
		extras?.toasts?.error?.(
			__( 'Place the image above a frame shape first.', 'wunderpaint' )
		);
		return;
	}
	// Cover-fit: scale the image bounds so the frame is fully covered.
	const ratio =
		( layer.naturalW || layer.w ) /
		Math.max( 1, layer.naturalH || layer.h );
	let w = frame.w;
	let h = w / ratio;
	if ( h < frame.h ) {
		h = frame.h;
		w = h * ratio;
	}
	dispatch( {
		type: 'UPDATE_LAYER',
		id: layer.id,
		patch: {
			x: frame.x + ( frame.w - w ) / 2,
			y: frame.y + ( frame.h - h ) / 2,
			w,
			h,
			rot: 0,
			clipped: true,
		},
	} );
	commit( __( 'Fit into Frame', 'wunderpaint' ) );
}

/**
 * Share the current design (v1.11): renders a 1280px JPEG, mints the
 * public read-only link and shows it in a copyable prompt.
 *
 * @param {Object} editor Editor context.
 * @param {Object} extras Editor extras (toasts).
 */
export async function shareDesignOp( editor, extras ) {
	const { state } = editor;
	if ( ! state.doc.source?.designId ) {
		extras.toasts.error(
			__(
				'Save the document as a design first (File → Save Design).',
				'wunderpaint'
			)
		);
		return;
	}
	try {
		const { designs } = await import( '../../lib/api' );
		const image = await renderToDataURL( state.doc, state.layers, {
			scale: Math.min( 1280 / state.doc.w, 1280 / state.doc.h, 1 ),
			format: 'jpeg',
			quality: 85,
			cache: sharedImageCache,
		} );
		const { url } = await designs.share( state.doc.source.designId, image );
		await promptDialog( {
			title: __( 'Share Design', 'wunderpaint' ),
			label: __( 'Public read-only link (copy it)', 'wunderpaint' ),
			defaultValue: url,
		} );
	} catch ( err ) {
		extras.toasts.error( err.message );
	}
}

/**
 * Revoke the public link of the current design (v1.324.0): the token IS
 * the capability, so sharing has to be reversible without deleting the
 * design. Drops the token and the rendered JPEG on the server; a later
 * share mints a fresh link.
 *
 * @param {Object} editor Editor context.
 * @param {Object} extras Editor extras (toasts).
 */
export async function unshareDesignOp( editor, extras ) {
	const { state } = editor;
	if ( ! state.doc.source?.designId ) {
		return;
	}
	const ok = await confirmDialog( {
		title: __( 'Stop Sharing', 'wunderpaint' ),
		message: __(
			'The public link stops working right away. Anyone who saved it loses access.',
			'wunderpaint'
		),
		confirmLabel: __( 'Revoke link', 'wunderpaint' ),
		danger: true,
	} );
	if ( ! ok ) {
		return;
	}
	try {
		const { designs } = await import( '../../lib/api' );
		await designs.unshare( state.doc.source.designId );
		extras.toasts.success(
			__( 'The public link has been revoked.', 'wunderpaint' )
		);
	} catch ( err ) {
		extras.toasts.error( err.message );
	}
}

/**
 * Enter pages mode / add a page (v1.11): the open document becomes page 1
 * and an empty page 2 (same format) opens.
 *
 * @param {Object} editor Editor context.
 */
export async function addPageOp( editor ) {
	const { state, dispatch } = editor;
	const current = {
		doc: { ...state.doc },
		layers: serializeLayers( state.layers ),
	};
	const blank = { doc: { ...state.doc }, layers: [] };
	const list = state.pages
		? ( () => {
				const l = [ ...state.pages.list ];
				l[ state.pages.current ] = current;
				l.splice( state.pages.current + 1, 0, blank );
				return l;
		  } )()
		: [ current, blank ];
	const index = state.pages ? state.pages.current + 1 : 1;
	dispatch( {
		type: 'LOAD_DOCUMENT',
		doc: blank.doc,
		layers: [],
		keepPages: true,
		label: __( 'New Page', 'wunderpaint' ),
	} );
	dispatch( { type: 'SET_PAGES', pages: list, current: index } );
}

/**
 * Change the document background color (Image → Colors, v1.153.2): the
 * color lives on doc.bg (rendered and exported by the pipeline), no
 * Background layer involved.
 *
 * @param {Object} editor Editor context value.
 */
export async function changeBackgroundColorOp( editor ) {
	const { state, dispatch, commit } = editor;
	const current = state.doc.bg || 'transparent';
	const CHOICES = [
		[ 'transparent', __( 'Transparent', 'wunderpaint' ) ],
		[ '#ffffff', __( 'White', 'wunderpaint' ) ],
		[ '#000000', __( 'Black', 'wunderpaint' ) ],
		[ 'custom', __( 'Custom', 'wunderpaint' ) ],
	];
	const currentChoice =
		CHOICES.find( ( [ value ] ) => value === current )?.[ 1 ] ||
		( 'transparent' === current ? CHOICES[ 0 ][ 1 ] : CHOICES[ 3 ][ 1 ] );
	const picked = await promptDialog( {
		title: __( 'Background Color', 'wunderpaint' ),
		label: __( 'Canvas background', 'wunderpaint' ),
		options: CHOICES.map( ( [ , label ] ) => label ),
		defaultValue: currentChoice,
		confirmLabel: __( 'Apply', 'wunderpaint' ),
	} );
	if ( ! picked ) {
		return;
	}
	let bg = CHOICES.find( ( [ , label ] ) => label === picked )?.[ 0 ];
	if ( 'custom' === bg ) {
		bg = await promptDialog( {
			title: __( 'Background Color', 'wunderpaint' ),
			label: __( 'Pick a color', 'wunderpaint' ),
			type: 'color',
			defaultValue: /^#[0-9a-f]{6}$/i.test( current )
				? current
				: '#ffffff',
			confirmLabel: __( 'Apply', 'wunderpaint' ),
		} );
		if ( ! bg ) {
			return;
		}
	}
	if ( bg === state.doc.bg ) {
		return;
	}
	dispatch( { type: 'SET_DOC', doc: { bg } } );
	commit( __( 'Background Color', 'wunderpaint' ) );
}
