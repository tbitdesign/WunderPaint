/**
 * Applying pixel Effects to layers (spec 06.3): destructive on raster
 * layers (any other type rasterizes first through the shared pipeline),
 * non-destructive Smart Filters on smart objects.
 */

import { recordStep } from '../lib/macro-recorder';
import { __, sprintf } from '@wordpress/i18n';

import { uid, makeRaster } from './document';
import {
	effectById,
	defaultParamsFor,
	applyEffectToCanvas,
} from '../lib/effects';
import {
	renderToCanvas,
	createCanvas,
	sharedImageCache,
	effectReach,
} from '../lib/raster';
import { activeLayerOf, withDescendants } from './editor-context';
import { promptDialog } from '../lib/dialogs';

/**
 * Apply an effect to the active layer (or add a Smart Filter).
 *
 * @param {Object} editor   Editor context value.
 * @param {string} effectId Effect id (spec 02.4).
 * @param {Object} [params] Effect params (defaults when omitted).
 * @param {Object} [opts]   { groupMode: 'smart'|'flatten' } skips the
 *                          group question (macro replays stay silent).
 * @return {Promise<boolean>} Whether anything was applied.
 */
export async function applyEffectToLayer(
	editor,
	effectId,
	params = null,
	opts = {}
) {
	const { state, dispatch, commit } = editor;
	const layer = activeLayerOf( state );
	const effect = effectById( effectId );
	if ( ! layer || ! effect ) {
		return false;
	}
	// Editable content (text, shapes, generator layers like 3D text, QR
	// codes) gets a question below, exactly like groups - record only
	// AFTER a decision so a cancel records nothing.
	const editable =
		'text' === layer.type ||
		'shape' === layer.type ||
		!! ( layer.generator && layer.generator.id ) ||
		!! layer.qr;
	if ( 'group' !== layer.type && ! editable ) {
		recordStep( 'applyEffect', { id: effectId, params } );
	}
	const effectParams = params || defaultParamsFor( effectId );
	const label = sprintf(
		/* translators: %s: effect name. */ __( 'Effect: %s', 'wunderpaint' ),
		effect.label
	);

	// Smart objects: non-destructive Smart Filter (spec 13.3).
	if ( 'smart' === layer.type ) {
		dispatch( {
			type: 'UPDATE_LAYER',
			id: layer.id,
			patch: {
				previewEffect: null,
				smartFilters: [
					...( layer.smartFilters || [] ),
					{
						id: effectId,
						params: effectParams,
						enabled: true,
						uid: uid(),
					},
				],
			},
		} );
		commit( label );
		return true;
	}

	// Raster with a live canvas: apply in place. Blurs bleed outside the
	// pixels, grow the canvas by the effect's reach first (v1.15.2).
	if ( 'raster' === layer.type && layer.canvas ) {
		const reach = effectReach( effectParams );
		if ( reach > 0 ) {
			const grown = createCanvas(
				layer.canvas.width + 2 * reach,
				layer.canvas.height + 2 * reach
			);
			grown.getContext( '2d' ).drawImage( layer.canvas, reach, reach );
			applyEffectToCanvas( grown, effectId, effectParams );
			dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: {
					canvas: grown,
					dataUrl: null,
					x: layer.x - reach,
					y: layer.y - reach,
					w: layer.w + 2 * reach,
					h: layer.h + 2 * reach,
					previewEffect: null,
				},
			} );
		} else {
			applyEffectToCanvas( layer.canvas, effectId, effectParams );
			dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: { previewEffect: null },
			} );
		}
		commit( label );
		return true;
	}

	// Groups (v1.153.3): ask whether to keep things non-destructive via a
	// Smart Object (the effect lands as a Smart Filter, the group stays
	// editable inside) or to flatten to pixels. Macro replays and the
	// smart re-entry pass opts.groupMode instead of asking.
	if ( 'group' === layer.type ) {
		let mode = opts.groupMode;
		if ( ! mode ) {
			const smartLabel = __(
				'Convert to Smart Object (non-destructive)',
				'wunderpaint'
			);
			const flattenLabel = __( 'Flatten group to pixels', 'wunderpaint' );
			const picked = await promptDialog( {
				title: sprintf(
					/* translators: %s: effect name. */ __(
						'Apply %s to group',
						'wunderpaint'
					),
					effect.label
				),
				label: __(
					'How should the group take the effect?',
					'wunderpaint'
				),
				options: [ smartLabel, flattenLabel ],
				confirmLabel: __( 'Apply', 'wunderpaint' ),
			} );
			if ( ! picked ) {
				return false;
			}
			mode = picked === smartLabel ? 'smart' : 'flatten';
		}
		if ( 'smart' === mode ) {
			// Dynamic import: ops.js imports this module (cycle).
			const { convertToSmartOp } = await import( './ops' );
			const smart = await convertToSmartOp( editor );
			if ( ! smart ) {
				return false;
			}
			// Attach the Smart Filter DIRECTLY to the returned layer: a
			// re-entry would read editor.state, which is a stale render
			// snapshot that still contains the group - flattening it
			// clobbered the freshly converted Smart Object (v1.153.4).
			recordStep( 'applyEffect', { id: effectId, params } );
			dispatch( {
				type: 'UPDATE_LAYER',
				id: smart.id,
				patch: {
					previewEffect: null,
					smartFilters: [
						...( smart.smartFilters || [] ),
						{
							id: effectId,
							params: effectParams,
							enabled: true,
							uid: uid(),
						},
					],
				},
			} );
			commit( label );
			return true;
		}
		recordStep( 'applyEffect', { id: effectId, params } );

		// Flatten to one raster: render the composite WITH the children
		// and replace the whole subtree - the old path rendered the group
		// alone (empty) and left the children orphaned (v1.153.1).
		const ids = withDescendants( state.layers, [ layer.id ] );
		const subtree = state.layers.filter( ( l ) => ids.has( l.id ) );
		const leaves = subtree.filter(
			( l ) =>
				'group' !== l.type &&
				'adjustment' !== l.type &&
				false !== l.visible
		);
		if ( ! leaves.length ) {
			return false;
		}
		// Axis-aligned bounds of each leaf, honoring rotation.
		const leafBox = ( l ) => {
			if ( ! l.rot ) {
				return { x1: l.x, y1: l.y, x2: l.x + l.w, y2: l.y + l.h };
			}
			const cx = l.x + l.w / 2;
			const cy = l.y + l.h / 2;
			const a = ( l.rot * Math.PI ) / 180;
			const hw =
				( l.w * Math.abs( Math.cos( a ) ) +
					l.h * Math.abs( Math.sin( a ) ) ) /
				2;
			const hh =
				( l.w * Math.abs( Math.sin( a ) ) +
					l.h * Math.abs( Math.cos( a ) ) ) /
				2;
			return { x1: cx - hw, y1: cy - hh, x2: cx + hw, y2: cy + hh };
		};
		const boxes = leaves.map( leafBox );
		const pad = effectReach( effectParams );
		const x1 =
			Math.floor( Math.min( ...boxes.map( ( b ) => b.x1 ) ) ) - pad;
		const y1 =
			Math.floor( Math.min( ...boxes.map( ( b ) => b.y1 ) ) ) - pad;
		const bounds = {
			x: x1,
			y: y1,
			w:
				Math.ceil( Math.max( ...boxes.map( ( b ) => b.x2 ) ) ) +
				pad -
				x1,
			h:
				Math.ceil( Math.max( ...boxes.map( ( b ) => b.y2 ) ) ) +
				pad -
				y1,
		};
		await sharedImageCache.warm( subtree );
		const rendered = await renderToCanvas(
			{ ...state.doc, bg: 'transparent' },
			subtree.map( ( l ) =>
				l.id === layer.id
					? {
							...l,
							parent: null,
							opacity: 1,
							blend: 'normal',
							previewEffect: null,
					  }
					: l
			),
			{ viewport: bounds, cache: sharedImageCache }
		);
		const canvas = createCanvas( rendered.width, rendered.height );
		canvas.getContext( '2d' ).drawImage( rendered, 0, 0 );
		applyEffectToCanvas( canvas, effectId, effectParams );
		const raster = makeRaster( {
			name: layer.name,
			x: bounds.x,
			y: bounds.y,
			w: bounds.w,
			h: bounds.h,
			canvas,
		} );
		raster.id = layer.id;
		raster.opacity = layer.opacity;
		raster.blend = layer.blend;
		raster.parent = layer.parent;
		dispatch( {
			type: 'SET_LAYERS',
			layers: state.layers.flatMap( ( l ) => {
				if ( l.id === layer.id ) {
					return [ raster ];
				}
				return ids.has( l.id ) ? [] : [ l ];
			} ),
		} );
		commit( label );
		return true;
	}

	// Editable content is about to be baked to pixels (v1.253.3, user
	// request): ask first - convert to a Smart Object (the effect lands
	// as a non-destructive Smart Filter, the content stays editable),
	// bake, or cancel. Macro replays pass groupMode and stay silent.
	if ( editable ) {
		let mode =
			opts.bakeMode ||
			( 'flatten' === opts.groupMode ? 'bake' : '' ) ||
			( 'smart' === opts.groupMode ? 'smart' : '' );
		if ( ! mode ) {
			const warn =
				'text' === layer.type
					? __(
							'This bakes the layer to pixels - the text will no longer be editable.',
							'wunderpaint'
					  )
					: 'shape' === layer.type
					? __(
							'This bakes the layer to pixels - the shape loses its editable fill, stroke and corners.',
							'wunderpaint'
					  )
					: layer.qr
					? __(
							'This bakes the layer to pixels - the QR code will no longer be editable.',
							'wunderpaint'
					  )
					: __(
							'This bakes the layer to pixels - it can no longer be reopened in its studio for editing.',
							'wunderpaint'
					  );
			const smartLabel = __(
				'Convert to Smart Object (stays editable)',
				'wunderpaint'
			);
			const bakeLabel = __(
				'Apply to pixels (loses editability)',
				'wunderpaint'
			);
			const picked = await promptDialog( {
				title: sprintf(
					/* translators: %s: effect name. */ __(
						'Apply %s',
						'wunderpaint'
					),
					effect.label
				),
				label: warn,
				options: [ smartLabel, bakeLabel ],
				confirmLabel: __( 'Apply', 'wunderpaint' ),
			} );
			if ( ! picked ) {
				return false;
			}
			mode = picked === smartLabel ? 'smart' : 'bake';
		}
		recordStep( 'applyEffect', { id: effectId, params } );
		if ( 'smart' === mode ) {
			// Dynamic import: ops.js imports this module (cycle). The
			// filter attaches DIRECTLY to the returned layer - editor.state
			// is a stale snapshot after the conversion (v1.153.4 rule).
			const { convertToSmartOp } = await import( './ops' );
			const smart = await convertToSmartOp( editor );
			if ( ! smart ) {
				return false;
			}
			dispatch( {
				type: 'UPDATE_LAYER',
				id: smart.id,
				patch: {
					previewEffect: null,
					smartFilters: [
						...( smart.smartFilters || [] ),
						{
							id: effectId,
							params: effectParams,
							enabled: true,
							uid: uid(),
						},
					],
				},
			} );
			commit( label );
			return true;
		}
	}

	// Everything else rasterizes first (rasterize-on-first-edit, 02.2),
	// rendered through the shared pipeline so what you saw is what you get.
	await sharedImageCache.warm( [ layer ] );
	const pad = effectReach( effectParams );
	const bounds = {
		x: layer.x - pad,
		y: layer.y - pad,
		w: Math.max( 1, layer.w ) + 2 * pad,
		h: Math.max( 1, layer.h ) + 2 * pad,
	};
	const rendered = await renderToCanvas(
		{ ...state.doc, bg: 'transparent' },
		[
			{
				...layer,
				parent: null,
				opacity: 1,
				blend: 'normal',
				previewEffect: null,
			},
		],
		{ viewport: bounds, cache: sharedImageCache }
	);
	const canvas = createCanvas( rendered.width, rendered.height );
	canvas.getContext( '2d' ).drawImage( rendered, 0, 0 );
	applyEffectToCanvas( canvas, effectId, effectParams );

	const raster = makeRaster( {
		name: layer.name,
		x: bounds.x,
		y: bounds.y,
		w: bounds.w,
		h: bounds.h,
		canvas,
	} );
	raster.id = layer.id;
	raster.opacity = layer.opacity;
	raster.blend = layer.blend;
	raster.parent = layer.parent;
	raster.mask = layer.mask;
	dispatch( {
		type: 'SET_LAYERS',
		layers: state.layers.map( ( l ) => ( l.id === layer.id ? raster : l ) ),
	} );
	commit( label );
	return true;
}

/** Rasterize the active layer in place (Layer menu / context menu). */
export async function rasterizeActiveLayer( editor ) {
	const { state, dispatch, commit } = editor;
	const layer = activeLayerOf( state );
	if (
		! layer ||
		'raster' === layer.type ||
		'group' === layer.type ||
		'adjustment' === layer.type
	) {
		return false;
	}
	await sharedImageCache.warm( [ layer ] );
	const bounds = {
		x: layer.x,
		y: layer.y,
		w: Math.max( 1, layer.w ),
		h: Math.max( 1, layer.h ),
	};
	const rendered = await renderToCanvas(
		{ ...state.doc, bg: 'transparent' },
		[ { ...layer, parent: null, opacity: 1, blend: 'normal', rot: 0 } ],
		{ viewport: bounds, cache: sharedImageCache }
	);
	const raster = makeRaster( {
		name: layer.name,
		x: bounds.x,
		y: bounds.y,
		w: bounds.w,
		h: bounds.h,
		canvas: rendered,
	} );
	raster.id = layer.id;
	raster.opacity = layer.opacity;
	raster.blend = layer.blend;
	raster.rot = layer.rot;
	raster.parent = layer.parent;
	raster.mask = layer.mask;
	dispatch( {
		type: 'SET_LAYERS',
		layers: state.layers.map( ( l ) => ( l.id === layer.id ? raster : l ) ),
	} );
	commit( __( 'Rasterize layer', 'wunderpaint' ) );
	return true;
}
