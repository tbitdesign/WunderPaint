/** Library illustrations use the scene renderer, but their own framing and paper colors. */
import { PaperEngine } from './engine.js';
import {
	cleanParams,
	defaultParams,
	defaultObject,
	defaultLayer,
} from '../core/model.js';
import { placedStamps } from '../core/scene.js';

const WIDTH = 336;
const HEIGHT = 224;
const PAGE_KINDS = new Set( [
	'backdrop',
	'terrain',
	'border',
	'frame',
	'branch',
] );

function boundsOf( object, ctx ) {
	let x0 = Infinity,
		y0 = Infinity,
		x1 = -Infinity,
		y1 = -Infinity;
	for ( const stamp of placedStamps( object, ctx ) )
		for ( const ring of stamp )
			for ( const [ x, y ] of ring ) {
				x0 = Math.min( x0, x );
				y0 = Math.min( y0, y );
				x1 = Math.max( x1, x );
				y1 = Math.max( y1, y );
			}
	return Number.isFinite( x0 ) && x1 > x0 && y1 > y0
		? { x0, y0, x1, y1 }
		: null;
}

/** Fit before rasterization, so no already-clipped image is mistaken for the whole object. */
export function fitPreviewObject( original, ctx ) {
	const object = { ...original, cut: false };
	if ( object.kind === 'trees' || object.kind === 'plants' ) {
		object.count =
			object.kind === 'trees' ? 1 : Math.min( object.count, 3 );
		object.vary = 0;
		object.spread = object.count > 1 ? 45 : 0;
	}
	const bounds = boundsOf( object, ctx );
	if ( ! bounds ) return object;
	const padding = Math.min( ctx.w, ctx.h ) * 0.09;
	const fit = Math.min(
		( ctx.w - padding * 2 ) / ( bounds.x1 - bounds.x0 ),
		( ctx.h - padding * 2 ) / ( bounds.y1 - bounds.y0 )
	);
	const scale = Math.max( 3, Math.min( 140, object.scale * fit ) );
	if ( Number.isFinite( object.spread ) )
		object.spread *= scale / object.scale;
	object.scale = scale;
	const fitted = boundsOf( object, ctx );
	object.x += ( ctx.w / 2 - ( fitted.x0 + fitted.x1 ) / 2 ) / ctx.w;
	object.y += ( ctx.h / 2 - ( fitted.y0 + fitted.y1 ) / 2 ) / ctx.h;
	return object;
}

export function createLibraryPreview() {
	const engine = new PaperEngine( document.createElement( 'canvas' ) );
	engine.setSize( WIDTH, HEIGHT );
	const draw = ( params ) => {
		engine.build( params );
		engine.render();
		return engine.canvas.toDataURL( 'image/png' );
	};
	return {
		elements( layers, extra = {} ) {
			const params = cleanParams( {
				...defaultParams(),
				...extra,
				layers,
				look: 'midnight',
				colorSource: 'palette',
				grain: 0,
				glow: 0,
				shadow: 32,
				soft: 25,
				detail: 85,
				photo: { source: 'none' },
			} );
			const focus = params.layers
				.flatMap( ( layer ) => layer.objects )
				.filter( ( object ) => ! PAGE_KINDS.has( object.kind ) );
			if ( focus.length === 1 ) {
				const object = fitPreviewObject(
					focus[ 0 ],
					engine.buildCtx( WIDTH, HEIGHT, params )
				);
				// In the old thumbnails sky objects shared the backdrop's paper and
				// disappeared into it. Their own layer also preserves text counters.
				params.layers = [
					defaultLayer( {
						objects: [ defaultObject( 'backdrop' ) ],
					} ),
					defaultLayer( { objects: [ object ] } ),
				];
			}
			return draw( params );
		},
		preset( preset ) {
			const params = cleanParams( {
				...defaultParams(),
				...preset.patch(),
				photo: { source: 'none' },
				grain: 0,
				detail: 75,
			} );
			return draw( params );
		},
	};
}
