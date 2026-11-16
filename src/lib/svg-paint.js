/** SVG paint servers for the same object-local fill and stroke used by Canvas. */
import { __ } from '@wordpress/i18n';
import { layerPaint } from './layer-paint';
import { gradientAxis } from './gradient-axis';
import { expandedGradientStops } from './gradient-ramp';
import { gradientFillFor } from './raster/patterns';
import { createCanvas } from './raster/env';
import { parseColor, toHexColor } from './color';

const number = ( value ) => ( Number.isFinite( +value ) ? +value : 0 );

export function objectPaintToSvg( layer, side, defs, transform = '' ) {
	const paint = layerPaint( layer, side );
	if ( paint.type !== 'gradient' || ! paint.stops.length ) {
		return paint.color;
	}
	const id = `wpie-paint-${ defs.items.length + 1 }`;
	const gradientTransform = transform
		? ` gradientTransform="${ transform }"`
		: '';
	const patternTransform = transform
		? ` patternTransform="${ transform }"`
		: '';
	const stops = expandedGradientStops( paint.stops )
		.map( ( stop ) => {
			const c = parseColor( stop.color );
			return `<stop offset="${ number(
				stop.at * 100
			) }%" stop-color="${ toHexColor(
				c.r,
				c.g,
				c.b
			) }" stop-opacity="${ number( c.a ) }"/>`;
		} )
		.join( '' );
	const w = Math.max( 1, number( layer.w ) ),
		h = Math.max( 1, number( layer.h ) );
	if ( paint.kind === 'angle' ) {
		const pad = Math.ceil(
			Math.max( number( layer.strokeW || layer.outlineW ), 2 ) * 2
		);
		const pw = w + pad * 2,
			ph = h + pad * 2;
		const scale = Math.min(
			1,
			4096 / Math.max( pw, ph ),
			Math.sqrt( 4194304 / ( pw * ph ) )
		);
		const canvas = createCanvas(
			Math.max( 1, Math.ceil( pw * scale ) ),
			Math.max( 1, Math.ceil( ph * scale ) )
		);
		const ctx = canvas.getContext( '2d' );
		ctx.scale( canvas.width / pw, canvas.height / ph );
		ctx.translate( pad, pad );
		ctx.fillStyle = gradientFillFor(
			ctx,
			w,
			h,
			paint.stops,
			paint.angle,
			paint.kind
		);
		ctx.fillRect( -pad, -pad, pw, ph );
		defs.items.push(
			`<pattern id="${ id }" patternUnits="userSpaceOnUse"${ patternTransform } x="${ -pad }" y="${ -pad }" width="${ pw }" height="${ ph }"><image href="${ canvas.toDataURL(
				'image/png'
			) }" width="${ pw }" height="${ ph }" preserveAspectRatio="none"/></pattern>`
		);
		const warning = __(
			'Angle paint is embedded as an image in SVG; its shape stays vector and its stops remain editable in the project.',
			'wunderpaint'
		);
		if ( ! defs.warnings.includes( warning ) ) {
			defs.warnings.push( warning );
		}
	} else if ( paint.kind === 'radial' ) {
		defs.items.push(
			`<radialGradient id="${ id }" gradientUnits="userSpaceOnUse"${ gradientTransform } cx="${
				w / 2
			}" cy="${ h / 2 }" r="${
				Math.max( w, h ) / 2
			}">${ stops }</radialGradient>`
		);
	} else {
		const { a, b } = gradientAxis( {
			w,
			h,
			gradientAngle: number( paint.angle ),
		} );
		defs.items.push(
			`<linearGradient id="${ id }" gradientUnits="userSpaceOnUse"${ gradientTransform } x1="${ number(
				a.x
			) }" y1="${ number( a.y ) }" x2="${ number( b.x ) }" y2="${ number(
				b.y
			) }">${ stops }</linearGradient>`
		);
	}
	return `url(#${ id })`;
}
