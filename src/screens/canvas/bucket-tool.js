import { __ } from '@wordpress/i18n';
import { createCanvas, renderSync, blurCanvas } from '../../lib/raster';
import {
	buildRasterCanvas,
	imageToRaster,
	trimRasterPatch,
} from '../../lib/raster-layer';
import { fillBucketCanvas } from '../../lib/bucket-fill';
import { pointInSelection, selectionToMaskCanvas } from '../../store/selection';
import { makeRaster } from '../../store/document';
import { setDocTransform } from './paint-commit';

const pending = new WeakSet();

/** Run the bucket independently from the other pointer tools. */
export async function applyBucket( tc, point, helpers ) {
	const { editor, opts, doc, layers, imageCache } = tc;
	const { dispatch, commit } = editor;
	const hint = ( message ) => tc.extras?.toasts?.toast?.( message );
	if ( point.x < 0 || point.y < 0 || point.x >= doc.w || point.y >= doc.h ) {
		return;
	}
	if (
		tc.selection &&
		! pointInSelection( tc.selection, point.x, point.y )
	) {
		hint(
			__( 'That click was outside the active selection.', 'wunderpaint' )
		);
		return;
	}
	if ( opts.mode === 'object' ) {
		const hit = helpers.topLayerAt( layers, point.x, point.y, {
			pixel: true,
			cache: imageCache,
		} );
		if ( ! hit || ! [ 'shape', 'text', 'stroke' ].includes( hit.type ) ) {
			hint(
				__(
					'Click a shape, text or path to recolor it.',
					'wunderpaint'
				)
			);
			return;
		}
		if ( hit.locked || helpers.ancestorLocked( layers, hit ) ) {
			hint( __( 'Layer is locked', 'wunderpaint' ) );
			return;
		}
		const patch =
			hit.type === 'stroke'
				? {
						paths: hit.paths.map( ( path ) => ( {
							...path,
							color: tc.fg,
						} ) ),
				  }
				: {
						[ hit.type === 'text' ? 'color' : 'fill' ]: tc.fg,
						fillType: 'solid',
				  };
		if ( hit.type === 'text' && Array.isArray( hit.spans ) ) {
			// Recolor the complete object, including explicitly colored text runs.
			patch.spans = hit.spans.map( ( run ) => ( {
				...run,
				s: { ...run.s, color: tc.fg },
			} ) );
		}
		dispatch( { type: 'UPDATE_LAYER', id: hit.id, patch } );
		commit( __( 'Recolor object', 'wunderpaint' ) );
		return;
	}
	if ( pending.has( dispatch ) ) {
		return;
	}
	const active = layers.find( ( l ) => l.id === editor.state.activeId );
	const onCurrent = opts.target === 'current';
	if (
		onCurrent &&
		( ! active ||
			! [ 'image', 'raster' ].includes( active.type ) ||
			active.quad )
	) {
		hint(
			__( 'Choose a pixel layer or fill on a new layer.', 'wunderpaint' )
		);
		return;
	}
	if (
		onCurrent &&
		( active.locked ||
			helpers.ancestorLocked( layers, active ) ||
			active.visible === false ||
			helpers.ancestorHidden( layers, active ) )
	) {
		hint( __( 'Choose a visible, unlocked pixel layer.', 'wunderpaint' ) );
		return;
	}
	if ( opts.source === 'active' && ! active ) {
		hint( __( 'Select a source layer first.', 'wunderpaint' ) );
		return;
	}
	pending.add( dispatch );
	try {
		await imageCache.warm( layers );
		const current = tc.getState?.() || editor.state;
		if (
			current.doc !== doc ||
			current.layers !== layers ||
			current.selection !== tc.selection ||
			current.activeId !== editor.state.activeId ||
			current.tool !== 'bucket'
		) {
			return;
		}
		let target;
		if ( onCurrent ) {
			target =
				active.type === 'image'
					? imageToRaster( active, imageCache.get( active.src ) )
					: {
							...active,
							canvas:
								active.canvas ||
								buildRasterCanvas(
									active,
									active.dataUrl
										? imageCache.get( active.dataUrl )
										: null
								),
					  };
		} else {
			target = makeRaster( {
				name: __( 'Fill', 'wunderpaint' ),
				x: 0,
				y: 0,
				w: doc.w,
				h: doc.h,
				canvas: createCanvas( doc.w, doc.h ),
			} );
		}
		const destination = createCanvas(
			target.canvas.width,
			target.canvas.height
		);
		destination.getContext( '2d' ).drawImage( target.canvas, 0, 0 );
		const mappedCanvas = ( original ) => {
			const mapped = createCanvas(
				destination.width,
				destination.height
			);
			const ctx = mapped.getContext( '2d' );
			setDocTransform( ctx, target );
			ctx.drawImage( original, 0, 0 );
			return mapped;
		};
		let source;
		if ( onCurrent && opts.source === 'active' ) {
			source = target.canvas;
		} else {
			const sampled = createCanvas( doc.w, doc.h );
			const all = opts.source !== 'active';
			renderSync(
				sampled.getContext( '2d' ),
				{ ...doc, bg: all ? doc.bg : 'transparent' },
				all ? layers : [ { ...active, parent: null } ],
				{ cache: imageCache, allLayers: layers }
			);
			source = mappedCanvas( sampled );
		}
		const docMask = tc.selection
			? blurCanvas(
					selectionToMaskCanvas( tc.selection, doc.w, doc.h, {
						feather: 0,
					} ),
					tc.selection.feather || 0
			  )
			: createCanvas( doc.w, doc.h );
		if ( ! tc.selection ) {
			const ctx = docMask.getContext( '2d' );
			ctx.fillStyle = '#fff';
			ctx.fillRect( 0, 0, doc.w, doc.h );
		}
		const mask = mappedCanvas( docMask );
		const probe = destination.getContext( '2d' );
		setDocTransform( probe, target );
		const at = probe.getTransform().transformPoint( point );
		probe.setTransform( 1, 0, 0, 1, 0, 0 );
		const changed = fillBucketCanvas( destination, at.x, at.y, tc.fg, {
			source,
			mask,
			tolerance: opts.tolerance,
			contiguous: opts.contiguous,
			opacity: ( opts.opacity ?? 100 ) / 100,
			gap: opts.gap,
		} );
		if ( ! changed ) {
			return;
		}
		target = { ...target, canvas: destination, dataUrl: null };
		if ( onCurrent ) {
			dispatch( { type: 'UPDATE_LAYER', id: active.id, patch: target } );
		} else {
			dispatch( {
				type: 'ADD_LAYER',
				layer: { ...target, ...trimRasterPatch( target ) },
			} );
		}
		commit( __( 'Flood fill', 'wunderpaint' ) );
		tc.requestRender?.();
	} catch ( error ) {
		hint(
			__(
				'Could not fill this area. Wait for the image to load and try again.',
				'wunderpaint'
			)
		);
	} finally {
		pending.delete( dispatch );
	}
}
