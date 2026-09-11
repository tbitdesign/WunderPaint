import { makeShape, makeGradient, makeImage } from '../../../store/document';
import { renderBackground } from '../../backgrounds';
import { roleColor, applyCommon } from './common';

/** Hintergrund: solid = Rechteck, gradient = Verlaufsebene, sonst Hintergrund-Studio als Bild mit `bg`. */
export function buildBackground( el, rect, ctx ) {
	const palette = ctx.tokens.palette;
	const colors = el.colors.map( ( c ) => roleColor( c, palette ) );
	let layer;
	if ( 'solid' === el.style ) {
		layer = makeShape( {
			name: 'Background',
			...rect,
			shape: 'rect',
			fill: colors[ 0 ] || palette.bg,
		} );
	} else if ( 'gradient' === el.style ) {
		const to =
			'right' === el.direction
				? { x: rect.x + rect.w, y: rect.y }
				: 'diag' === el.direction
				? { x: rect.x + rect.w, y: rect.y + rect.h }
				: { x: rect.x, y: rect.y + rect.h };
		layer = makeGradient( {
			name: 'Background',
			...rect,
			kind: 'linear',
			from: { x: rect.x, y: rect.y },
			to,
			stops: [
				{ color: colors[ 0 ] || palette.bg, at: 0 },
				{ color: colors[ 1 ] || palette.surface, at: 1 },
			],
		} );
	} else {
		const params = {
			style: el.style,
			colors: colors.length
				? colors
				: [ palette.bg, palette.surface, palette.accent ],
			seed: el.seed,
			grain: Math.round( el.grain * 100 ),
		};
		const canvas = renderBackground( params, rect.w, rect.h );
		layer = makeImage( {
			name: 'Background',
			...rect,
			src: canvas.toDataURL( 'image/png' ),
			naturalW: rect.w,
			naturalH: rect.h,
		} );
		layer.bg = { ...params };
	}
	applyCommon( layer, el, 'main', ctx );
	return { layers: [ layer ], parts: { main: layer.id } };
}
