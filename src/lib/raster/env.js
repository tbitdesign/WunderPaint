import { FILTERS } from '../../store/constants';
import { listExtensionFilterPresets } from '../extensions';
import {
	adjustmentsToFilter,
	applyAdjustmentsPixels,
	isNeutralAdjust,
} from '../color';
import { gaussianBlur } from '../effects';

let canvasFactory = ( w, h ) => {
	const canvas = document.createElement( 'canvas' );
	canvas.width = w;
	canvas.height = h;
	return canvas;
};

/**
 * Tests (node-canvas) inject their own factory.
 * @param factory
 */
export const setCanvasFactory = ( factory ) => {
	canvasFactory = factory;
	filterSupport = null;
};

export const createCanvas = ( w, h ) =>
	canvasFactory(
		Math.max( 1, Math.ceil( w ) ),
		Math.max( 1, Math.ceil( h ) )
	);

let filterSupport = null;

/**
 * Feature-detect ctx.filter BEHAVIORALLY (older Safari lacks it, and some
 * environments accept the property without applying it, spec 05.2): render
 * one red pixel through grayscale(1) and check it actually turned gray.
 */
export function supportsCtxFilter() {
	if ( null === filterSupport ) {
		try {
			const src = createCanvas( 1, 1 );
			const sctx = src.getContext( '2d' );
			sctx.fillStyle = '#ff0000';
			sctx.fillRect( 0, 0, 1, 1 );
			const probe = createCanvas( 1, 1 );
			const pctx = probe.getContext( '2d' );
			pctx.filter = 'grayscale(1)';
			pctx.drawImage( src, 0, 0 );
			const [ r, g ] = pctx.getImageData( 0, 0, 1, 1 ).data;
			filterSupport = g > 20 && Math.abs( r - g ) < 20;
		} catch ( e ) {
			filterSupport = false;
		}
	}
	return filterSupport;
}

/**
 * normal→source-over; every other blend mode name matches (spec 02.4).
 * @param blend
 */
export const blendToComposite = ( blend ) =>
	! blend || 'normal' === blend ? 'source-over' : blend;

/* ------------------------------ CSS fallback --------------------------- */

/**
 * Parse a preset-filter css string into ops for the pixel fallback.
 * @param css
 */
export function parseCssFilter( css ) {
	const ops = [];
	const re = /([a-z-]+)\(([^)]*)\)/g;
	let m;
	while ( ( m = re.exec( css || '' ) ) ) {
		ops.push( { fn: m[ 1 ], arg: parseFloat( m[ 2 ] ) } );
	}
	return ops;
}

/**
 * Pixel implementation of the preset-filter primitives (fallback path).
 * @param img
 * @param css
 */
export function cssFilterPixels( img, css ) {
	for ( const { fn, arg } of parseCssFilter( css ) ) {
		switch ( fn ) {
			case 'grayscale':
				applyAdjustmentsPixels( img, {
					saturation: -100 * ( isNaN( arg ) ? 1 : arg ),
				} );
				break;
			case 'sepia': {
				// Reuse the temp approximation at full strength ratio.
				const t = isNaN( arg ) ? 1 : arg;
				applyAdjustmentsPixels( img, {
					temp: ( t / 0.35 ) * 100 > 100 ? 100 : ( t / 0.35 ) * 100,
				} );
				break;
			}
			case 'saturate':
				applyAdjustmentsPixels( img, {
					saturation: ( arg - 1 ) * 100,
				} );
				break;
			case 'contrast':
				applyAdjustmentsPixels( img, { contrast: ( arg - 1 ) * 100 } );
				break;
			case 'brightness':
				applyAdjustmentsPixels( img, {
					brightness: ( arg - 1 ) * 100,
				} );
				break;
			case 'hue-rotate':
				applyAdjustmentsPixels( img, { hue: arg } );
				break;
			case 'blur':
				gaussianBlur( img, { radius: arg } );
				break;
		}
	}
	return img;
}

export const filterCssFor = ( layer ) => {
	const preset =
		FILTERS.find( ( f ) => f.id === ( layer.filter || 'none' ) ) ||
		listExtensionFilterPresets().find( ( f ) => f.id === layer.filter );
	const presetCss = preset && 'none' !== preset.id ? preset.css : '';
	const adjustCss = isNeutralAdjust( layer.adjust )
		? ''
		: adjustmentsToFilter( layer.adjust );
	return [ presetCss, adjustCss ].filter( Boolean ).join( ' ' );
};
