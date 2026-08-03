/**
 * Import and export: PSD, smart objects, portable .wpie projects, SVG,
 * contact sheets, plus the transform ops that sit next to them.
 *
 * Holds every lazy import in ops (svg-io, jszip), so keeping it in one file
 * keeps the webpack chunk boundaries where they were.
 *
 * Split out of src/store/ops.js in v1.338.0, which had grown to 2944 lines.
 * ops.js stays as the barrel over these modules - the same shape src/lib/raster.js
 * uses - so every existing `from './ops'` import is unchanged.
 */

import { __, sprintf } from '@wordpress/i18n';
import {
	makeGroup,
	makeSmart,
	makeImage,
	loadImage,
	serializeLayers,
	hydrateLayers,
} from '../document';
import { activeLayerOf, expandGroupIds } from '../editor-context';
import * as DocOps from '../doc-ops';
import {
	renderToCanvas,
	sharedImageCache,
	layerOvershoot,
} from '../../lib/raster';
import { applyEffectToLayer, rasterizeActiveLayer } from '../effect-ops';
import { promptDialog } from '../../lib/dialogs';
import { parseCube, encodeLutTable } from '../../lib/cube-lut';
import { getPsdImporter } from '../../lib/psd-registry';
import { documentToPsd } from '../../lib/psd';
import { downloadBlob } from '../../lib/download';
import { hydrateTemplate, TEMPLATE_FORMAT } from '../../lib/template-io';

export function ungroupOp( editor ) {
	const { state, dispatch, commit } = editor;
	const layer = activeLayerOf( state );
	if ( ! layer || 'group' !== layer.type ) {
		return;
	}
	const children = new Set( layer.children || [] );
	const layers = state.layers
		.filter( ( l ) => l.id !== layer.id )
		.map( ( l ) =>
			children.has( l.id ) ? { ...l, parent: layer.parent || null } : l
		);
	dispatch( { type: 'SET_LAYERS', layers } );
	commit( __( 'Ungroup', 'wunderpaint' ) );
}

// Task 27: pixel effects (store/effect-ops.js).
export function applyEffectOp( editor, extras, effectId, params = null ) {
	applyEffectToLayer( editor, effectId, params ).catch( () => {
		extras?.toasts?.error?.(
			__( 'Could not apply the effect.', 'wunderpaint' )
		);
	} );
}

/** Edit → Free Transform (v0.7): distort a pixel layer via corner quad. */
export function freeTransformOp( editor, extras ) {
	const { state, dispatch, commit } = editor;
	const layer = activeLayerOf( state );
	if ( ! layer ) {
		return;
	}
	if (
		! [ 'image', 'raster', 'smart', 'text', 'shape', 'gradient' ].includes(
			layer.type
		)
	) {
		extras?.toasts?.toast?.(
			__(
				'Free Transform is not available for this layer type.',
				'wunderpaint'
			)
		);
		return;
	}
	if ( ! layer.quad ) {
		// Seed from the current bbox incl. rotation (rot folds into the quad).
		const cx = layer.x + layer.w / 2;
		const cy = layer.y + layer.h / 2;
		const rad = ( ( layer.rot || 0 ) * Math.PI ) / 180;
		const rot = ( px, py ) => ( {
			x:
				cx +
				( px - cx ) * Math.cos( rad ) -
				( py - cy ) * Math.sin( rad ),
			y:
				cy +
				( px - cx ) * Math.sin( rad ) +
				( py - cy ) * Math.cos( rad ),
		} );
		dispatch( {
			type: 'UPDATE_LAYER',
			id: layer.id,
			patch: {
				rot: 0,
				quad: {
					tl: rot( layer.x, layer.y ),
					tr: rot( layer.x + layer.w, layer.y ),
					br: rot( layer.x + layer.w, layer.y + layer.h ),
					bl: rot( layer.x, layer.y + layer.h ),
				},
			},
		} );
	}
	// Esc must restore the state at session start - an imported PSD
	// Distort/Perspective placement would otherwise be destroyed (and a
	// folded-in rotation lost) by the old quad:null reset (spec 13.6).
	dispatch( {
		type: 'SET_FREE_TRANSFORM',
		id: layer.id,
		entry: { quad: layer.quad || null, rot: layer.rot || 0 },
	} );
	commit( __( 'Free Transform', 'wunderpaint' ) );
}

export function applyLutOp( editor, extras ) {
	const input = document.createElement( 'input' );
	input.type = 'file';
	input.accept = '.cube,.CUBE';
	input.onchange = async () => {
		const file = input.files?.[ 0 ];
		if ( ! file ) {
			return;
		}
		try {
			const table = encodeLutTable( parseCube( await file.text() ) );
			await applyEffectToLayer( editor, 'lut-3d', {
				table,
				intensity: 100,
			} );
			extras?.toasts?.success?.(
				sprintf(
					/* translators: %s: LUT name. */
					__( 'LUT “%s” applied.', 'wunderpaint' ),
					table.title || file.name
				)
			);
		} catch ( err ) {
			extras?.toasts?.error?.(
				__( 'Could not read the LUT file:', 'wunderpaint' ) +
					err.message
			);
		}
	};
	input.click();
}

export function rasterizeLayerOp( editor ) {
	rasterizeActiveLayer( editor );
}

// Task 33: PSD import (lib/psd.js via the registry).
export function importPsdOp( editor, extras ) {
	const importer = getPsdImporter();
	if ( ! importer ) {
		extras?.toasts?.error?.(
			__( 'PSD support failed to load.', 'wunderpaint' )
		);
		return;
	}
	const input = document.createElement( 'input' );
	input.type = 'file';
	input.accept = '.psd,image/vnd.adobe.photoshop';
	input.onchange = async () => {
		const file = input.files?.[ 0 ];
		if ( file ) {
			await importPsdFileOp( editor, extras, file );
		}
	};
	input.click();
}

/** Import a PSD File object as the current document (13.1). */
export async function importPsdFileOp( editor, extras, file ) {
	const importer = getPsdImporter();
	if ( ! importer ) {
		extras?.toasts?.error?.(
			__( 'PSD support failed to load.', 'wunderpaint' )
		);
		return;
	}
	try {
		const buffer = await file.arrayBuffer();
		const { doc, layers, notes } = await importer(
			buffer,
			file.name.replace( /\.psd$/i, '' )
		);
		editor.dispatch( {
			type: 'LOAD_DOCUMENT',
			doc,
			layers,
			label: __( 'Import PSD', 'wunderpaint' ),
		} );
		if ( notes?.length ) {
			extras?.toasts?.toast?.(
				__( 'PSD imported with notes:', 'wunderpaint' ) +
					' ' +
					notes.slice( 0, 3 ).join( ' ' ) +
					( notes.length > 3 ? ' …' : '' ),
				{ duration: 10000 }
			);
		} else {
			extras?.toasts?.success?.( __( 'PSD imported.', 'wunderpaint' ) );
		}
	} catch ( err ) {
		extras?.toasts?.error?.(
			__( 'Could not read the PSD:', 'wunderpaint' ) + ' ' + err.message
		);
	}
}

// Task 34: PSD export (download; sidecar handled by the Export dialog).
export async function exportPsdOp( editor, extras ) {
	try {
		const { buffer, notes } = await documentToPsd(
			editor.state.doc,
			editor.state.layers
		);
		downloadBlob(
			new window.Blob( [ buffer ], {
				type: 'image/vnd.adobe.photoshop',
			} ),
			( editor.state.doc.name || 'image' ) + '.psd'
		);
		if ( notes?.length ) {
			extras?.toasts?.toast?.(
				__( 'Flattened on export:', 'wunderpaint' ) +
					' ' +
					notes.slice( 0, 3 ).join( ' ' ),
				{ duration: 10000 }
			);
		}
	} catch ( err ) {
		extras?.toasts?.error?.(
			__( 'PSD export failed:', 'wunderpaint' ) + ' ' + err.message
		);
	}
}

// Task 35: Convert to Smart Object, wraps the selected layer(s), keeping
// them embedded so transforms/filters stay non-destructive (13.3).
export async function convertToSmartOp( editor ) {
	const { state, dispatch, commit } = editor;
	const ids = state.selectedIds.length
		? state.selectedIds
		: state.activeId
		? [ state.activeId ]
		: [];
	// Groups convert with their whole subtree (v1.4.1), the group object
	// itself has no real bbox and its children only resolve by id.
	const memberIds = expandGroupIds( state.layers, ids );
	const memberSet = new Set( memberIds );
	const members = state.layers.filter( ( l ) => memberSet.has( l.id ) );
	// Bounds come from the drawable leaves; group containers carry
	// meaningless placeholder geometry.
	const leaves = members.filter( ( l ) => 'group' !== l.type );
	if ( ! leaves.length ) {
		return;
	}
	// Grow by each leaf's visual overshoot (stroke, styles, effects, text)
	// so a stroked/shadowed shape isn't clipped at the crop bounds (v1.24.5).
	const minX = Math.floor(
		Math.min( ...leaves.map( ( l ) => l.x - layerOvershoot( l ) ) )
	);
	const minY = Math.floor(
		Math.min( ...leaves.map( ( l ) => l.y - layerOvershoot( l ) ) )
	);
	const maxX = Math.ceil(
		Math.max( ...leaves.map( ( l ) => l.x + l.w + layerOvershoot( l ) ) )
	);
	const maxY = Math.ceil(
		Math.max( ...leaves.map( ( l ) => l.y + l.h + layerOvershoot( l ) ) )
	);
	const bounds = {
		x: minX,
		y: minY,
		w: Math.max( 1, maxX - minX ),
		h: Math.max( 1, maxY - minY ),
	};

	// Only the subtree roots go top-level; children keep their parent
	// links so groups inside the selection still resolve and re-edit.
	// previewEffect is a transient live-preview and must never be baked
	// into the preview PNG or the embedded content (v1.153.4).
	const subtree = members.map( ( l ) => ( {
		...l,
		previewEffect: null,
		parent: memberSet.has( l.parent ) ? l.parent : null,
	} ) );
	await sharedImageCache.warm( members );
	const preview = await renderToCanvas(
		{ ...state.doc, bg: 'transparent' },
		subtree,
		{ viewport: bounds, cache: sharedImageCache }
	);

	const root = state.layers.find( ( l ) => l.id === ids[ 0 ] );
	const smart = makeSmart( {
		name:
			1 === ids.length && root
				? root.name
				: __( 'Smart Object', 'wunderpaint' ),
		x: bounds.x,
		y: bounds.y,
		w: bounds.w,
		h: bounds.h,
		src: preview.toDataURL( 'image/png' ),
		srcW: bounds.w,
		srcH: bounds.h,
		embedded: {
			kind: 'layers',
			bytes: null,
			layers: serializeLayers(
				subtree.map( ( l ) => ( {
					...l,
					x: l.x - bounds.x,
					y: l.y - bounds.y,
				} ) )
			),
			doc: { w: bounds.w, h: bounds.h, bg: 'transparent' },
		},
	} );
	// A converted group child / nested group stays inside its parent
	// (base() pins parent to null, so set it after the factory).
	smart.parent = ( 1 === ids.length && root?.parent ) || null;

	const insertAt = state.layers.findIndex(
		( l ) => l.id === members[ 0 ].id
	);
	dispatch( { type: 'REMOVE_LAYERS', ids } );
	dispatch( {
		type: 'ADD_LAYER',
		layer: smart,
		index: Math.min( insertAt, editor.state.layers.length ),
	} );
	commit( __( 'Convert to Smart Object', 'wunderpaint' ) );
	// Callers (apply-effect-to-group) need the fresh layer: editor.state
	// is a render snapshot and does NOT see the dispatches above.
	return smart;
}

/**
 * Save the current document as a pattern tile (v1.110.0, Photoshop's
 * "Define Pattern"): rendered with transparency, stored in the server
 * user library, immediately usable as shape fill / Pattern Overlay.
 */
export async function saveAsPatternOp( editor, extras ) {
	const { state } = editor;
	const name = await promptDialog( {
		title: __( 'Save as Pattern', 'wunderpaint' ),
		label: __( 'Pattern name', 'wunderpaint' ),
		defaultValue: ( state.doc.name || 'Pattern' ).slice( 0, 24 ),
	} );
	if ( ! name ) {
		return;
	}
	try {
		const scale = Math.min( 1, 512 / Math.max( state.doc.w, state.doc.h ) );
		const canvas = await renderToCanvas( state.doc, state.layers, {
			scale,
			cache: sharedImageCache,
		} );
		const dataUrl = canvas.toDataURL( 'image/png' );
		const { registerUserTile } = await import( '../../lib/raster' );
		await registerUserTile( dataUrl );
		const { savePattern } = await import( '../../lib/user-patterns' );
		await savePattern( name, dataUrl );
		extras?.toasts?.success?.(
			__(
				'Pattern saved, find it in the Asset Library under Patterns.',
				'wunderpaint'
			)
		);
	} catch ( e ) {
		extras?.toasts?.error?.(
			e?.message || __( 'The pattern could not be saved.', 'wunderpaint' )
		);
	}
}

/** Open the QR code studio (v1.102, was a bare URL prompt). */
export function insertQrOp( editor, extras ) {
	extras?.openQr?.();
}

/** Download the whole document as a portable .wpie project file (v1.0). */
export function downloadProjectOp( editor ) {
	const { doc, layers } = editor.state;
	const payload = {
		wpie: 2,
		name: doc.name || 'untitled',
		doc: { ...doc },
		layers: serializeLayers( layers ),
	};
	const blob = new window.Blob( [ JSON.stringify( payload ) ], {
		type: 'application/json',
	} );
	downloadBlob( blob, `${ doc.name || 'untitled' }.wpie` );
}

/** Open a portable .wpie project file as the current document (v1.0). */
export function openProjectOp( editor, extras ) {
	const input = document.createElement( 'input' );
	input.type = 'file';
	input.accept = '.wpie,.json,application/json';
	input.onchange = async () => {
		const file = input.files?.[ 0 ];
		if ( ! file ) {
			return;
		}
		try {
			const data = JSON.parse( await file.text() );
			// Template file (exported via File → Export as Template): open as
			// a fresh, fully editable document with new ids.
			if ( data?.format === TEMPLATE_FORMAT ) {
				const { doc, layers } = await hydrateTemplate( data );
				editor.dispatch( {
					type: 'LOAD_DOCUMENT',
					doc,
					layers,
					label: __( 'From Template', 'wunderpaint' ),
				} );
				extras?.toasts?.success?.(
					__( 'Template opened.', 'wunderpaint' )
				);
				return;
			}
			if (
				! data?.wpie ||
				! data.doc ||
				! Array.isArray( data.layers )
			) {
				throw new Error(
					__( 'Not a WunderPaint project file.', 'wunderpaint' )
				);
			}
			const layers = await hydrateLayers( data.layers );
			editor.dispatch( {
				type: 'LOAD_DOCUMENT',
				doc: {
					...data.doc,
					name: data.name || data.doc.name || 'untitled',
					source: { isNew: true },
				},
				layers,
				label: __( 'Open project', 'wunderpaint' ),
			} );
			extras?.toasts?.success?.( __( 'Project opened.', 'wunderpaint' ) );
		} catch ( err ) {
			extras?.toasts?.error?.(
				__( 'Could not open the project:', 'wunderpaint' ) +
					' ' +
					err.message
			);
		}
	};
	input.click();
}

/** Insert the brand-kit logo as a layer (v1.1). */
export async function insertLogoOp( editor, extras, logoUrl = '' ) {
	const url = logoUrl || editor.WPIE?.brand?.logoUrl;
	if ( ! url ) {
		extras?.toasts?.error?.(
			__(
				'No brand logo configured (Settings → Brand Kit).',
				'wunderpaint'
			)
		);
		return;
	}
	try {
		const { state, dispatch, commit } = editor;
		const img = await loadImage( url );
		const w = Math.max( 1, Math.round( state.doc.w * 0.25 ) );
		const h = Math.max(
			1,
			Math.round( ( w / img.naturalWidth ) * img.naturalHeight )
		);
		dispatch( {
			type: 'ADD_LAYER',
			layer: makeImage( {
				name: 'Logo',
				x: Math.round( state.doc.w / 2 - w / 2 ),
				y: Math.round( state.doc.h / 2 - h / 2 ),
				w,
				h,
				src: url,
				naturalW: img.naturalWidth,
				naturalH: img.naturalHeight,
			} ),
		} );
		commit( __( 'Insert logo', 'wunderpaint' ) );
	} catch ( e ) {
		extras?.toasts?.error?.(
			__( 'Could not load the brand logo.', 'wunderpaint' )
		);
	}
}

/**
 * Place imported SVG layers as one centered group, scaled into the doc
 * (shared by File → Import SVG and AI illustrations, v1.71).
 *
 * @param {Object} editor Editor context.
 * @param {Object} parsed { layers, width, height } from importSvg().
 * @param {string} name   Group name.
 * @param {string} label  History label.
 */
export function placeSvgLayers( editor, parsed, name, label ) {
	const { layers, width, height } = parsed;
	const { state, dispatch, commit } = editor;
	const scale = Math.min(
		1,
		( state.doc.w * 0.9 ) / width,
		( state.doc.h * 0.9 ) / height
	);
	const group = makeGroup( { name } );
	const members = layers.map( ( layer ) => {
		const scaled =
			1 === scale
				? layer
				: {
						...layer,
						x: Math.round( layer.x * scale ),
						y: Math.round( layer.y * scale ),
						w: Math.max( 1, Math.round( layer.w * scale ) ),
						h: Math.max( 1, Math.round( layer.h * scale ) ),
						fontSize: layer.fontSize
							? Math.max(
									4,
									Math.round( layer.fontSize * scale )
							  )
							: layer.fontSize,
						pathD: layer.pathD
							? DocOps.scalePathD( layer.pathD, scale, scale )
							: layer.pathD,
				  };
		return { ...scaled, parent: group.id };
	} );
	group.children = members.map( ( l ) => l.id );
	const dx = Math.round( ( state.doc.w - width * scale ) / 2 );
	const dy = Math.round( ( state.doc.h - height * scale ) / 2 );
	const moved = members.map( ( l ) => DocOps.offsetLayer( l, dx, dy ) );
	dispatch( {
		type: 'SET_LAYERS',
		layers: [ ...state.layers, ...moved, group ],
	} );
	dispatch( { type: 'SET_ACTIVE', id: group.id } );
	commit( label || __( 'Import SVG', 'wunderpaint' ) );
}

/** Import an SVG file as editable vector layers (v1.1). */
export function importSvgOp( editor, extras ) {
	const input = document.createElement( 'input' );
	input.type = 'file';
	input.accept = '.svg,image/svg+xml';
	input.onchange = async () => {
		const file = input.files?.[ 0 ];
		if ( ! file ) {
			return;
		}
		try {
			const { importSvg } = await import(
				/* webpackChunkName: "svg-io" */ '../../lib/svg-io'
			);
			const { layers, warnings, width, height } = importSvg(
				await file.text()
			);
			if ( ! layers.length ) {
				throw new Error(
					__( 'No supported elements found.', 'wunderpaint' )
				);
			}
			placeSvgLayers(
				editor,
				{ layers, width, height },
				file.name.replace( /\.svg$/i, '' ),
				__( 'Import SVG', 'wunderpaint' )
			);
			if ( warnings.length ) {
				extras?.toasts?.toast?.(
					__( 'SVG imported with notes:', 'wunderpaint' ) +
						' ' +
						warnings.slice( 0, 2 ).join( ' ' ) +
						( warnings.length > 2 ? ' …' : '' ),
					{ duration: 9000 }
				);
			} else {
				extras?.toasts?.success?.(
					__( 'SVG imported as vector layers.', 'wunderpaint' )
				);
			}
		} catch ( err ) {
			extras?.toasts?.error?.(
				__( 'Could not import the SVG:', 'wunderpaint' ) +
					' ' +
					err.message
			);
		}
	};
	input.click();
}

/** Export the document as an SVG file (v1.1). */
export async function exportSvgOp( editor, extras ) {
	try {
		const { exportSvg } = await import(
			/* webpackChunkName: "svg-io" */ '../../lib/svg-io'
		);
		const { state } = editor;
		const { svg, warnings } = exportSvg( state.doc, state.layers );
		downloadBlob(
			new window.Blob( [ svg ], { type: 'image/svg+xml' } ),
			`${ state.doc.name || 'image' }.svg`
		);
		if ( warnings.length ) {
			extras?.toasts?.toast?.(
				__( 'SVG exported with notes:', 'wunderpaint' ) +
					' ' +
					warnings.slice( 0, 2 ).join( ' ' ),
				{ duration: 9000 }
			);
		}
	} catch ( err ) {
		extras?.toasts?.error?.( err.message );
	}
}

/** Export every layer comp as a PNG inside a ZIP (v1.1). */
export async function exportCompsOp( editor, extras ) {
	const { state } = editor;
	const comps = state.doc.comps || [];
	if ( ! comps.length ) {
		extras?.toasts?.error?.(
			__(
				'No layer comps saved yet (Layers panel → Layer Comps).',
				'wunderpaint'
			)
		);
		return;
	}
	try {
		const [
			{ applyComp },
			{ renderToBlob, sharedImageCache: imageCache },
			{ default: JSZip },
		] = await Promise.all( [
			import( '../../lib/comps' ),
			import( '../../lib/raster' ),
			import( /* webpackChunkName: "jszip" */ 'jszip' ),
		] );
		const zip = new JSZip();
		for ( const comp of comps ) {
			const blob = await renderToBlob(
				state.doc,
				applyComp( state.layers, comp ),
				{ format: 'png', cache: imageCache }
			);
			zip.file(
				`${
					comp.name.replace( /[^\p{L}\p{N} _.-]+/gu, '' ) || 'comp'
				}.png`,
				blob
			);
		}
		const blob = await zip.generateAsync( { type: 'blob' } );
		downloadBlob( blob, `${ state.doc.name || 'comps' }-comps.zip` );
		extras?.toasts?.success?.(
			sprintf(
				/* translators: %d: comp count. */
				__( '%d layer comps exported.', 'wunderpaint' ),
				comps.length
			)
		);
	} catch ( err ) {
		extras?.toasts?.error?.( err.message );
	}
}
