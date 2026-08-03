/**
 * Unified library-asset insertion (v1.15): one JSON-serializable asset
 * descriptor covers tray clicks, canvas drag&drop and the "Recent" strip.
 * Kinds: combo, element, icon, emoji, upload, photo, bg-gradient, bg-solid.
 * `point` (doc coords) centers the asset there; null = document center.
 */

import { __, sprintf } from '@wordpress/i18n';

import {
	makeShape,
	makeText,
	makeGradient,
	makeImage,
	makeGroup,
	loadImage,
} from '../store/document';
import { scalePathD } from '../store/doc-ops';
import { scalePathD as scaleElementPath } from './path';
import { comboToLayers } from './content-io';
import { loadCombos, loadElements, loadGradients } from '../content';
import { stock } from './api';
import { createCanvas } from './raster';

const RECENT_KEY = 'wpie-recent-assets';
const RECENT_MAX = 20;

/** Recently inserted assets (newest first, deduped by kind+identity). */
export function listRecentAssets() {
	try {
		const list = JSON.parse(
			window.localStorage.getItem( RECENT_KEY ) || '[]'
		);
		return Array.isArray( list ) ? list : [];
	} catch ( e ) {
		return [];
	}
}

const assetKey = ( asset ) =>
	`${ asset.kind }:${
		asset.id || asset.name || asset.c || asset.color || ''
	}`;

export function rememberAsset( asset ) {
	try {
		const list = listRecentAssets().filter(
			( entry ) => assetKey( entry ) !== assetKey( asset )
		);
		list.unshift( asset );
		window.localStorage.setItem(
			RECENT_KEY,
			JSON.stringify( list.slice( 0, RECENT_MAX ) )
		);
	} catch ( e ) {
		// localStorage full/blocked, recents are best-effort.
	}
}

/** Center a w×h box on `point` (or the document center), clamped inside. */
const placeRect = ( doc, point, w, h ) => {
	const cx = point ? point.x : doc.w / 2;
	const cy = point ? point.y : doc.h / 2;
	return {
		x: Math.round( Math.min( doc.w - 8, Math.max( 8 - w, cx - w / 2 ) ) ),
		y: Math.round( Math.min( doc.h - 8, Math.max( 8 - h, cy - h / 2 ) ) ),
		w,
		h,
	};
};

/**
 * Load a swap/frame image source into a self-contained data URL plus
 * its natural size (v1.115.0/v1.116.0). Sources: { file } from an OS
 * drop, or { asset } from the tray (kind photo via the CORS-safe proxy,
 * kind upload via its same-origin URL). Long edge capped at 3000px.
 *
 * @param {Object} source { file } | { asset }.
 * @return {Promise<{src: string, w: number, h: number}|null>} Image.
 */
async function loadDroppedImage( source ) {
	let img;
	let mime = 'image/png';
	if ( source.file ) {
		mime = 'image/jpeg' === source.file.type ? 'image/jpeg' : 'image/png';
		const url = URL.createObjectURL( source.file );
		try {
			img = await loadImage( url );
		} finally {
			URL.revokeObjectURL( url );
		}
	} else if ( 'photo' === source.asset?.kind ) {
		const { dataUrl } = await stock.fetch( source.asset.full );
		mime = dataUrl.startsWith( 'data:image/png' )
			? 'image/png'
			: 'image/jpeg';
		img = await loadImage( dataUrl );
	} else if ( 'upload' === source.asset?.kind ) {
		const srcUrl = source.asset.fullUrl || source.asset.url;
		mime = /\.png($|\?)/i.test( srcUrl ) ? 'image/png' : 'image/jpeg';
		img = await loadImage( srcUrl );
	} else {
		return null;
	}
	const iw = img.naturalWidth || img.width;
	const ih = img.naturalHeight || img.height;
	const cap = Math.min( 1, 3000 / Math.max( iw, ih ) );
	const canvas = createCanvas(
		Math.max( 1, Math.round( iw * cap ) ),
		Math.max( 1, Math.round( ih * cap ) )
	);
	canvas
		.getContext( '2d' )
		.drawImage( img, 0, 0, canvas.width, canvas.height );
	return {
		src: canvas.toDataURL( mime, 0.92 ),
		w: canvas.width,
		h: canvas.height,
	};
}

/**
 * Insert a dropped image as a NEW layer at a layer-panel position
 * (v1.364.0): the panel's reorder indicator is a real drop target for
 * image tiles from the tray and for OS files. `target` mirrors the
 * indicator ({ layer, mode: 'above'|'below'|'into' }); null lands on top.
 *
 * @param {Object}      editor Editor context.
 * @param {Object}      extras Toasts etc.
 * @param {Object}      source { file } | { asset }.
 * @param {Object|null} target { layer, mode } from the drop indicator.
 * @return {Promise<boolean>} Handled?
 */
export async function insertImageAtRow( editor, extras, source, target ) {
	let img = null;
	try {
		img = await loadDroppedImage( source );
	} catch ( e ) {
		img = null;
	}
	if ( ! img ) {
		extras.toasts?.error(
			__( 'That file could not be read.', 'wunderpaint' )
		);
		return false;
	}
	const { state, dispatch, commit } = editor;
	const scale = Math.min(
		1,
		( state.doc.w * 0.9 ) / img.w,
		( state.doc.h * 0.9 ) / img.h
	);
	const w = Math.max( 1, Math.round( img.w * scale ) );
	const h = Math.max( 1, Math.round( img.h * scale ) );
	const name = source.file
		? source.file.name.replace( /\.[^.]+$/, '' )
		: source.asset?.name || __( 'Image', 'wunderpaint' );
	const layer = makeImage( {
		name,
		...placeRect( state.doc, null, w, h ),
		src: img.src,
		naturalW: img.w,
		naturalH: img.h,
	} );
	const flatIndex = ( id ) => state.layers.findIndex( ( l ) => l.id === id );
	let index;
	if ( target && 'into' === target.mode && 'group' === target.layer.type ) {
		// Same flat placement as the reorder path: members sit BEFORE
		// their group entry in the array.
		layer.parent = target.layer.id;
		index = flatIndex( target.layer.id );
	} else if ( target ) {
		layer.parent = target.layer.parent || null;
		const t = flatIndex( target.layer.id );
		// Above in UI = later in paint order.
		index = 'above' === target.mode ? t + 1 : t;
	}
	dispatch( { type: 'ADD_LAYER', layer, index } );
	commit(
		sprintf(
			/* translators: %s: file name. */ __( 'Place “%s”', 'wunderpaint' ),
			name
		)
	);
	return true;
}

/**
 * Canva-style swap (v1.115.0, v1.116.0 keeps the FULL image): drop an
 * image ONTO a placed image layer and it replaces the picture INSIDE
 * the existing bounding box. The full source stays on the layer with
 * imageFit cover, so the crop can be repositioned any time
 * (double-click the layer on the canvas).
 *
 * @param {Object} editor  Editor context.
 * @param {Object} extras  Toasts etc.
 * @param {string} layerId Target image layer id.
 * @param {Object} source  { file } | { asset }.
 * @return {Promise<boolean>} Handled?
 */
export async function replaceImageOnLayer( editor, extras, layerId, source ) {
	const layer = editor.state.layers.find( ( l ) => l.id === layerId );
	if ( ! layer ) {
		return false;
	}
	try {
		const loaded = await loadDroppedImage( source );
		if ( ! loaded ) {
			return false;
		}
		editor.dispatch( {
			type: 'UPDATE_LAYER',
			id: layer.id,
			patch: {
				src: loaded.src,
				naturalW: loaded.w,
				naturalH: loaded.h,
				imageFit: { mode: 'cover', ax: 0.5, ay: 0.5 },
			},
		} );
		editor.commit( __( 'Replace image', 'wunderpaint' ) );
		extras?.toasts?.success?.(
			__(
				'Image replaced. Double-click it to reposition, Alt-drop inserts as a new layer.',
				'wunderpaint'
			)
		);
		return true;
	} catch ( e ) {
		extras?.toasts?.error?.(
			__( 'The image could not be replaced.', 'wunderpaint' )
		);
		return true; // handled: do not fall through to a stray insert
	}
}

/**
 * Frame flow (v1.116.0): drop an image onto a layer with a silhouette
 * and it becomes the frame - the image lands directly above it as a
 * cover-fitted layer clipped to it. Works for shapes, and since
 * v1.117.2 also for text, brush strokes and rasterized art (the
 * renderer clips against the base layer's alpha, so any silhouette
 * fills with the picture). Reposition via double-click.
 *
 * @param {Object} editor  Editor context.
 * @param {Object} extras  Toasts etc.
 * @param {string} shapeId Frame layer id (shape, text, stroke, raster).
 * @param {Object} source  { file } | { asset }.
 * @return {Promise<boolean>} Handled?
 */
export async function placeImageIntoShape( editor, extras, shapeId, source ) {
	const shape = editor.state.layers.find( ( l ) => l.id === shapeId );
	if ( ! shape ) {
		return false;
	}
	try {
		const loaded = await loadDroppedImage( source );
		if ( ! loaded ) {
			return false;
		}
		const layer = {
			...makeImage( {
				name:
					source.file?.name?.replace( /\.\w+$/, '' ) ||
					source.asset?.author ||
					'Photo',
				x: shape.x,
				y: shape.y,
				w: shape.w,
				h: shape.h,
				src: loaded.src,
				naturalW: loaded.w,
				naturalH: loaded.h,
			} ),
			rot: shape.rot || 0,
			parent: shape.parent || null,
			clipped: true,
			imageFit: { mode: 'cover', ax: 0.5, ay: 0.5 },
		};
		const idx = editor.state.layers.findIndex( ( l ) => l.id === shape.id );
		let layers = [ ...editor.state.layers ];
		layers.splice( idx + 1, 0, layer );
		if ( shape.parent ) {
			// Frame lives in a group already: the image joins it.
			layer.parent = shape.parent;
			const grp = layers.find( ( l ) => l.id === shape.parent );
			if ( grp?.children ) {
				grp.children = [ ...grp.children, layer.id ];
			}
		} else {
			// Wrap frame + image in a group so they move as one (user
			// request, v1.116.1). Double-click still drills into the image.
			const frameGroup = makeGroup( {
				name: sprintf(
					/* translators: %s: layer name. */
					__( 'Frame: %s', 'wunderpaint' ),
					layer.name
				),
			} );
			const shapeRef = layers.find( ( l ) => l.id === shape.id );
			layers = layers.map( ( l ) =>
				l.id === shape.id ? { ...l, parent: frameGroup.id } : l
			);
			layer.parent = frameGroup.id;
			frameGroup.children = [ shapeRef.id, layer.id ];
			const at = layers.findIndex( ( l ) => l.id === layer.id );
			layers.splice( at + 1, 0, frameGroup );
		}
		editor.dispatch( { type: 'SET_LAYERS', layers } );
		editor.dispatch( { type: 'SET_ACTIVE', id: layer.id } );
		editor.commit( __( 'Place image into frame', 'wunderpaint' ) );
		extras?.toasts?.success?.(
			__(
				'Image placed into the frame. Double-click it to reposition.',
				'wunderpaint'
			)
		);
		return true;
	} catch ( e ) {
		extras?.toasts?.error?.(
			__( 'The image could not be placed.', 'wunderpaint' )
		);
		return true;
	}
}

/**
 * Insert an asset descriptor into the document.
 *
 * @param {Object}      editor Editor context.
 * @param {Object}      extras Editor extras (toasts).
 * @param {Object}      asset  Serializable descriptor (see kinds above).
 * @param {Object|null} point  Doc-space drop point or null (center).
 * @return {Promise<boolean>} True when something was inserted.
 */
export async function insertAsset( editor, extras, asset, point = null ) {
	const { state, dispatch, commit } = editor;
	const doc = state.doc;

	switch ( asset.kind ) {
		case 'combo': {
			const combo = ( await loadCombos() ).find(
				( c ) => c.id === asset.id
			);
			if ( ! combo ) {
				return false;
			}
			const accent = editor.WPIE?.brand?.colors?.[ 0 ] || null;
			const parts = combo.build( doc, accent ? { accent } : {} );
			if ( point ) {
				const dx = Math.round( point.x - doc.w / 2 );
				const dy = Math.round( point.y - doc.h / 2 );
				for ( const part of parts ) {
					part.x += dx;
					part.y += dy;
				}
			}
			const group = makeGroup( { name: combo.label } );
			dispatch( { type: 'ADD_LAYER', layer: group } );
			for ( const part of parts ) {
				part.parent = group.id;
				dispatch( { type: 'ADD_LAYER', layer: part } );
			}
			dispatch( { type: 'SET_ACTIVE', id: group.id } );
			commit( __( 'Insert Text Combination', 'wunderpaint' ) );
			break;
		}

		case 'element': {
			const item = ( await loadElements() )
				.flatMap( ( set ) => set.items )
				.find( ( entry ) => entry.name === asset.name );
			if ( ! item ) {
				return false;
			}
			const size = Math.round( Math.min( doc.w, doc.h ) * 0.3 );
			const layer = makeShape( {
				name: item.name,
				...placeRect( doc, point, size, size ),
				fill: state.fgColor || '#3b66ff',
				shape: item.shape || 'rect',
				sides: item.sides,
				...( item.pathD
					? {
							pathD: scaleElementPath(
								item.pathD,
								size / 100,
								size / 100
							),
					  }
					: {} ),
			} );
			if ( item.flipX ) {
				layer.flipX = true;
			}
			dispatch( { type: 'ADD_LAYER', layer } );
			commit( __( 'Insert Element', 'wunderpaint' ) );
			break;
		}

		case 'icon': {
			const icons = (
				await import(
					/* webpackChunkName: "icons-lib" */ '../icons-lib/tabler.json'
				)
			).default;
			const d = icons?.[ asset.name ];
			if ( ! d ) {
				return false;
			}
			const size = 96;
			const rect = placeRect( doc, point, size, size );
			// Icons are stroke-based 24px paths (v1.0).
			dispatch( {
				type: 'ADD_LAYER',
				layer: makeShape( {
					name: asset.name,
					...rect,
					pathD: scalePathD( d, size / 24, size / 24 ),
					fill: 'transparent',
					stroke: state.fgColor || '#1a1d21',
					strokeW: 8,
				} ),
			} );
			commit(
				sprintf(
					/* translators: %s: icon name. */
					__( 'Insert icon “%s”', 'wunderpaint' ),
					asset.name
				)
			);
			break;
		}

		case 'emoji': {
			const size = 96;
			const rect = placeRect(
				doc,
				point,
				Math.round( size * 1.2 ),
				Math.round( size * 1.1 )
			);
			dispatch( {
				type: 'ADD_LAYER',
				layer: makeText( {
					name: asset.n || 'Emoji',
					text: asset.c,
					...rect,
					fontSize: size,
					align: 'center',
					color: '#000000',
				} ),
			} );
			commit(
				sprintf(
					/* translators: %s: emoji name. */
					__( 'Insert emoji “%s”', 'wunderpaint' ),
					asset.n
				)
			);
			break;
		}

		case 'upload': {
			try {
				const src = asset.fullUrl || asset.url;
				const img = await loadImage( src );
				const scale = Math.min(
					1,
					( doc.w * 0.8 ) / img.naturalWidth,
					( doc.h * 0.8 ) / img.naturalHeight
				);
				const w = Math.max( 1, Math.round( img.naturalWidth * scale ) );
				const h = Math.max(
					1,
					Math.round( img.naturalHeight * scale )
				);
				dispatch( {
					type: 'ADD_LAYER',
					layer: makeImage( {
						name: asset.title || __( 'Image', 'wunderpaint' ),
						...placeRect( doc, point, w, h ),
						src,
						naturalW: img.naturalWidth,
						naturalH: img.naturalHeight,
					} ),
				} );
				commit( __( 'Insert Image', 'wunderpaint' ) );
			} catch ( err ) {
				extras?.toasts?.error(
					__( 'Could not load this image.', 'wunderpaint' )
				);
				return false;
			}
			break;
		}

		case 'photo': {
			try {
				const { dataUrl } = await stock.fetch( asset.full );
				const img = await loadImage( dataUrl );
				const scale = Math.min(
					1,
					( doc.w * 0.9 ) / img.naturalWidth,
					( doc.h * 0.9 ) / img.naturalHeight
				);
				const w = Math.max( 1, Math.round( img.naturalWidth * scale ) );
				const h = Math.max(
					1,
					Math.round( img.naturalHeight * scale )
				);
				dispatch( {
					type: 'ADD_LAYER',
					layer: makeImage( {
						name: asset.author || 'Photo',
						...placeRect( doc, point, w, h ),
						src: dataUrl,
						naturalW: img.naturalWidth,
						naturalH: img.naturalHeight,
					} ),
				} );
				commit( __( 'Insert stock image', 'wunderpaint' ) );
			} catch ( err ) {
				extras?.toasts?.error( err.message );
				return false;
			}
			break;
		}

		case 'bg-gradient': {
			const preset = ( await loadGradients() ).find(
				( entry ) => entry.name === asset.name
			);
			if ( ! preset ) {
				return false;
			}
			const layer = makeGradient( {
				x: 0,
				y: 0,
				w: doc.w,
				h: doc.h,
				kind: preset.kind || 'linear',
				stops: preset.stops.map( ( s ) => ( { ...s } ) ),
				from: { x: 0, y: 0 },
				to: { x: doc.w, y: doc.h },
			} );
			layer.name = __( 'Background', 'wunderpaint' );
			dispatch( { type: 'ADD_LAYER', layer, index: 0 } );
			commit( __( 'Background gradient', 'wunderpaint' ) );
			break;
		}

		case 'bg-solid': {
			const layer = makeShape( {
				x: 0,
				y: 0,
				w: doc.w,
				h: doc.h,
				fill: asset.color,
			} );
			layer.name = __( 'Background', 'wunderpaint' );
			dispatch( { type: 'ADD_LAYER', layer, index: 0 } );
			commit( __( 'Background color', 'wunderpaint' ) );
			break;
		}

		// User-library items carry their full descriptor (no content-pack
		// lookup) so freshly saved items insert instantly (v1.32).
		case 'user-element': {
			const d = asset.descriptor;
			if ( ! d ) {
				return false;
			}
			const size = Math.round( Math.min( doc.w, doc.h ) * 0.3 );
			const layer = makeShape( {
				name: d.name,
				...placeRect( doc, point, size, size ),
				fill: state.fgColor || '#3b66ff',
				shape: d.shape || 'rect',
				sides: d.sides,
				...( d.pathD
					? {
							pathD: scaleElementPath(
								d.pathD,
								size / 100,
								size / 100
							),
					  }
					: {} ),
			} );
			dispatch( { type: 'ADD_LAYER', layer } );
			commit( __( 'Insert Element', 'wunderpaint' ) );
			break;
		}

		case 'user-combo': {
			const d = asset.descriptor;
			if ( ! d ) {
				return false;
			}
			const parts = comboToLayers( d, doc );
			const group = makeGroup( { name: d.label || 'Text' } );
			dispatch( { type: 'ADD_LAYER', layer: group } );
			for ( const part of parts ) {
				part.parent = group.id;
				dispatch( { type: 'ADD_LAYER', layer: part } );
			}
			dispatch( { type: 'SET_ACTIVE', id: group.id } );
			commit( __( 'Insert Text Combination', 'wunderpaint' ) );
			break;
		}

		case 'user-background': {
			const d = asset.descriptor;
			if ( ! d ) {
				return false;
			}
			let layer;
			if ( 'solid' === d.kind ) {
				layer = makeShape( {
					x: 0,
					y: 0,
					w: doc.w,
					h: doc.h,
					fill: d.color,
				} );
			} else {
				layer = makeGradient( {
					x: 0,
					y: 0,
					w: doc.w,
					h: doc.h,
					kind: d.kind || 'linear',
					stops: ( d.stops || [] ).map( ( s ) => ( { ...s } ) ),
					from: { x: 0, y: 0 },
					to:
						'radial' === d.kind
							? { x: doc.w / 2, y: doc.h / 2 }
							: { x: doc.w, y: doc.h },
				} );
			}
			layer.name = __( 'Background', 'wunderpaint' );
			dispatch( { type: 'ADD_LAYER', layer, index: 0 } );
			commit( __( 'Background', 'wunderpaint' ) );
			break;
		}

		default:
			return false;
	}

	// After dropping something on the canvas, switch to Move so it can be
	// positioned right away.
	dispatch( { type: 'SET_TOOL', tool: 'move' } );
	// User-library items have their own sections and carry a bulky descriptor,
	// so keep them out of the Recent strip.
	if ( ! String( asset.kind ).startsWith( 'user-' ) ) {
		rememberAsset( asset );
	}
	return true;
}
