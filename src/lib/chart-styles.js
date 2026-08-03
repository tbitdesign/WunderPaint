/**
 * Chart design presets (v1.269.0) - the chart-side sibling of
 * TABLE_STYLES in table.js: named style cards plus a deterministic
 * seeded random variant for the shuffle button. A style is a bundle of
 * buildChart options (card, axes, grid, rounding, gradient, outline,
 * typography) and optionally a palette.
 */

import { __ } from '@wordpress/i18n';
import { hueShift } from './table';

/** Mix a hex color toward white (amount 0..1). */
export function tint( hex, amount ) {
	const n = parseInt( String( hex ).replace( '#', '' ), 16 );
	const ch = ( shift ) => {
		const c = ( n >> shift ) & 255;
		return Math.round( c + ( 255 - c ) * amount );
	};
	return (
		'#' +
		[ 16, 8, 0 ]
			.map( ( s ) => ch( s ).toString( 16 ).padStart( 2, '0' ) )
			.join( '' )
	);
}

export const CHART_STYLES = [
	{ id: 'flat', label: __( 'Flat', 'wunderpaint' ) },
	{ id: 'soft', label: __( 'Soft card', 'wunderpaint' ) },
	{ id: 'outline', label: __( 'Outline', 'wunderpaint' ) },
	{ id: 'duotone', label: __( 'Duotone', 'wunderpaint' ) },
	{ id: 'pastel', label: __( 'Pastel', 'wunderpaint' ) },
	{ id: 'dark', label: __( 'Dark', 'wunderpaint' ) },
	{ id: 'gradient', label: __( 'Gradient', 'wunderpaint' ) },
	{ id: 'poster', label: __( 'Poster', 'wunderpaint' ) },
	{ id: 'minimal', label: __( 'Minimal', 'wunderpaint' ) },
	{ id: 'neon', label: __( 'Neon', 'wunderpaint' ) },
];

/** The option bundle a preset applies (colors only where implied). */
export function styleOptions( id, accent = '#3b66ff' ) {
	const base = {
		preset: id,
		card: 'none',
		gridLines: null,
		axes: true,
		rounded: 35,
		gap: 40,
		gradient: false,
		outline: false,
		labelWeight: 400,
		valueWeight: 600,
	};
	switch ( id ) {
		case 'soft':
			return { ...base, card: 'soft', rounded: 55, gap: 45 };
		case 'outline':
			return { ...base, outline: true, rounded: 25 };
		case 'duotone':
			return {
				...base,
				rounded: 45,
				colors: [
					accent,
					hueShift( accent, 40 ),
					tint( accent, 0.55 ),
					'#c9ced6',
				],
			};
		case 'pastel':
			return {
				...base,
				card: 'soft',
				rounded: 65,
				colors: [
					tint( accent, 0.45 ),
					tint( hueShift( accent, 60 ), 0.45 ),
					tint( hueShift( accent, -60 ), 0.45 ),
					tint( hueShift( accent, 150 ), 0.45 ),
				],
			};
		case 'dark':
			return { ...base, card: 'dark' };
		case 'gradient':
			return { ...base, gradient: true, rounded: 50 };
		case 'poster':
			return {
				...base,
				rounded: 0,
				gap: 25,
				labelWeight: 800,
				valueWeight: 800,
			};
		case 'minimal':
			return { ...base, axes: false, gridLines: false };
		case 'neon':
			return {
				...base,
				card: 'dark',
				gradient: true,
				colors: [ '#22d3ee', '#a78bfa', '#f472b6', '#facc15' ],
			};
		default:
			return base;
	}
}

/** Seeded random style for the shuffle tiles (same LCG as table.js). */
export function randomChartStyle( seed, accent = '#3b66ff' ) {
	let s = seed >>> 0;
	const rnd = () => {
		s = ( s * 1103515245 + 12345 ) & 0x7fffffff;
		return s / 0x7fffffff;
	};
	const pick = ( arr ) =>
		arr[ Math.floor( rnd() * arr.length ) % arr.length ];
	return {
		preset: 'custom',
		card: pick( [ 'none', 'none', 'soft', 'dark' ] ),
		gridLines: rnd() > 0.3,
		axes: rnd() > 0.15,
		rounded: Math.round( rnd() * 100 ),
		gap: 20 + Math.round( rnd() * 60 ),
		gradient: rnd() > 0.6,
		outline: rnd() > 0.85,
		labelWeight: pick( [ 400, 400, 600, 800 ] ),
		valueWeight: pick( [ 600, 700, 800 ] ),
		colors: [
			accent,
			hueShift( accent, pick( [ 30, -30, 60, -60, 150 ] ) ),
			tint( accent, 0.4 ),
			hueShift( accent, 180 ),
		],
	};
}
