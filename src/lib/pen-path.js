/**
 * Editable pen centerlines and bounded, synchronous variable-width geometry.
 * The visible path is ordinary vector geometry. The small penPath record keeps
 * its centerline/profile in a reference box, so affine resizing stays exact.
 */
import { smoothPenPath } from './pen-edit';
import { PEN_EXTRA_PRESETS } from './pen-presets-extra';
import { PEN_ART_PRESETS } from './pen-presets-art';
import {
	trimPenPath,
	nibFactor,
	motionWidthAt,
	cleanPenColors,
	penMotion,
	penSymmetryCopies,
} from './pen-creative';
import { offsetPenPath } from './pen-operations';
import {
	penEnding,
	penEndingSize,
	trimPenSamples,
	samplePenDistance,
} from './pen-endings';
import { __, _x } from '@wordpress/i18n';
import { normalizePathD, offsetPathD, scalePathD } from './path';
import { flattenPathD } from './text-path';
import { buildPathD, parsePathAnchors, pathBounds } from './path-edit';
const clamp = ( n, lo, hi ) =>
	Math.max( lo, Math.min( hi, Number.isFinite( +n ) ? +n : lo ) );
const fmt = ( n ) => Math.round( n * 1000 ) / 1000;
const dist = ( a, b ) => Math.hypot( b.x - a.x, b.y - a.y );
const mix = ( a, b, t ) => ( {
	x: a.x + ( b.x - a.x ) * t,
	y: a.y + ( b.y - a.y ) * t,
} );
const outlineCache = new Map();
export const PEN_DEFAULT_STYLE = {
	width: 18,
	start: 0,
	end: 0,
	inLength: 22,
	outLength: 35,
	ease: 'smooth',
	cap: 'round',
	bias: 0,
	belly: 0,
	peak: 50,
	kind: 'solid',
	dash: 24,
	gap: 14,
	arrowStart: false,
	arrowEnd: false,
	arrowSize: 2.5,
	headFollow: 'curve',
	parallelCount: 0,
	parallelGap: 24,
	markers: [],
};
export function cleanPenStyle( value = {} ) {
	const p = {
		...PEN_DEFAULT_STYLE,
		...value,
	};
	const forms = [
		'none',
		'arrow',
		'open',
		'needle',
		'circle',
		'diamond',
		'bar',
	];
	const startHead = forms.includes( p.startHead )
		? p.startHead
		: p.arrowStart
		? 'arrow'
		: 'none';
	const endHead = forms.includes( p.endHead )
		? p.endHead
		: p.arrowEnd
		? 'arrow'
		: 'none';
	return {
		startHead,
		endHead,
		trimStart: clamp( p.trimStart || 0, 0, 99.9 ),
		trimEnd: clamp(
			p.trimEnd ?? 100,
			clamp( p.trimStart || 0, 0, 99.9 ) + 0.1,
			100
		),
		nib: !! p.nib,
		nibAngle: clamp( p.nibAngle ?? 45, 0, 180 ),
		nibRoundness: clamp( p.nibRoundness ?? 15, 5, 100 ),
		dynamics: [ 'pressure', 'speed' ].includes( p.dynamics )
			? p.dynamics
			: 'none',
		motionStrength: clamp( p.motionStrength ?? 100, 0, 100 ),
		motionMin: clamp( p.motionMin ?? 15, 1, 100 ),
		motion: ( Array.isArray( p.motion ) ? p.motion : [] )
			.slice( 0, 96 )
			.filter( ( q ) => q && typeof q === 'object' )
			.map( ( q ) => ( {
				t: clamp( q.t, 0, 1 ),
				value: clamp( q.value, 0, 1 ),
			} ) )
			.sort( ( a, b ) => a.t - b.t ),
		patternFit: p.patternFit !== false,
		symmetry: [
			'vertical',
			'horizontal',
			'both',
			'radial',
			'kaleido',
		].includes( p.symmetry )
			? p.symmetry
			: 'off',
		symmetryAxis: clamp( p.symmetryAxis ?? 0, -1000000, 1000000 ),
		// The centre of 'both', 'radial' and 'kaleido', and their count.
		symmetryX: clamp( p.symmetryX ?? 0, -1000000, 1000000 ),
		symmetryY: clamp( p.symmetryY ?? 0, -1000000, 1000000 ),
		symmetryCount: Math.round( clamp( p.symmetryCount ?? 6, 2, 16 ) ),
		colorMode: p.colorMode === 'path' ? 'path' : 'solid',
		colors: cleanPenColors( p.colors ),
		headFollow: p.headFollow === 'straight' ? 'straight' : 'curve',
		headLength: clamp( p.headLength ?? p.arrowSize, 0.5, 10 ),
		headWidth: clamp( p.headWidth ?? p.arrowSize, 0.5, 10 ),
		parallelCount: Math.round( clamp( p.parallelCount, 0, 6 ) ),
		parallelGap: clamp( p.parallelGap, -300, 300 ),
		width: clamp( p.width, 0.25, 800 ),
		smoothing: clamp( p.smoothing || 0, 0, 100 ),
		start: clamp( p.start, 0, 200 ),
		end: clamp( p.end, 0, 200 ),
		inLength: clamp( p.inLength, 0, 100 ),
		outLength: clamp( p.outLength, 0, 100 ),
		ease: [ 'linear', 'smooth', 'sharp' ].includes( p.ease )
			? p.ease
			: 'smooth',
		cap: [ 'round', 'flat' ].includes( p.cap ) ? p.cap : 'round',
		bias: clamp( p.bias, -90, 90 ),
		belly: clamp( p.belly, -90, 200 ),
		peak: clamp( p.peak, 5, 95 ),
		kind: [
			'solid',
			'dashed',
			'dotted',
			'double',
			'fill',
			'bristle',
			'sketch',
			'ribbon',
		].includes( p.kind )
			? p.kind
			: 'solid',
		// Art strokes (19.10.2026): dryness / looseness / twists, the
		// number of strands, a ragged edge and the seed of their texture.
		texture: clamp( p.texture ?? 50, 0, 100 ),
		strands: Math.round( clamp( p.strands ?? 9, 3, 24 ) ),
		rough: clamp( p.rough ?? 0, 0, 100 ),
		seed: Math.round( clamp( p.seed ?? 7, 1, 9999 ) ),
		dash: clamp( p.dash, 1, 500 ),
		gap: clamp( p.gap, 1, 500 ),
		arrowStart: startHead !== 'none',
		arrowEnd: endHead !== 'none',
		arrowSize: clamp( p.arrowSize, 1, 6 ),
		markers: ( Array.isArray( p.markers ) ? p.markers : [] )
			.slice( 0, 32 )
			.map( ( m ) => ( {
				t: clamp( m.t, 0.005, 0.995 ),
				value: clamp( m.value, 0.02, 3 ),
			} ) )
			.sort( ( a, b ) => a.t - b.t ),
	};
}
export const PEN_PRESETS = [
	{
		id: 'plain',
		name: () => __( 'Uniform', 'wunderpaint' ),
		style: {
			width: 5,
			start: 100,
			end: 100,
		},
	},
	{
		id: 'taper',
		name: () => __( 'Tapered', 'wunderpaint' ),
		style: {
			width: 18,
			start: 100,
			end: 0,
			outLength: 70,
		},
	},
	{
		id: 'both',
		name: () => __( 'Double taper', 'wunderpaint' ),
		style: {
			width: 20,
			start: 0,
			end: 0,
			inLength: 40,
			outLength: 40,
		},
	},
	{
		id: 'spindle',
		name: () => __( 'Spindle', 'wunderpaint' ),
		style: {
			width: 26,
			start: 0,
			end: 0,
			inLength: 50,
			outLength: 50,
		},
	},
	{
		id: 'drop',
		name: () => __( 'Teardrop', 'wunderpaint' ),
		style: {
			width: 32,
			start: 100,
			end: 0,
			inLength: 0,
			outLength: 95,
			ease: 'linear',
		},
	},
	{
		id: 'swell',
		name: () => __( 'Swell', 'wunderpaint' ),
		style: {
			width: 18,
			start: 0,
			end: 0,
			belly: 95,
			peak: 60,
		},
	},
	{
		id: 'long',
		name: () => __( 'Long tip', 'wunderpaint' ),
		style: {
			width: 20,
			start: 45,
			end: 0,
			outLength: 85,
			ease: 'sharp',
		},
	},
	{
		id: 'ribbon',
		name: () => _x( 'Ribbon', 'pen tool', 'wunderpaint' ),
		style: {
			width: 36,
			start: 100,
			end: 100,
			cap: 'flat',
		},
	},
	{
		id: 'arrow',
		name: () => __( 'Flowing arrow', 'wunderpaint' ),
		style: {
			width: 10,
			start: 0,
			end: 100,
			inLength: 60,
			arrowEnd: true,
		},
	},
	{
		id: 'double-arrow',
		name: () => __( 'Double arrow', 'wunderpaint' ),
		style: {
			width: 7,
			start: 100,
			end: 100,
			arrowStart: true,
			arrowEnd: true,
		},
	},
	{
		id: 'dash',
		name: () => __( 'Dashes', 'wunderpaint' ),
		style: {
			width: 8,
			start: 100,
			end: 100,
			kind: 'dashed',
			dash: 20,
			gap: 12,
		},
	},
	{
		id: 'dots',
		name: () => __( 'Dots', 'wunderpaint' ),
		style: {
			width: 9,
			start: 100,
			end: 100,
			kind: 'dotted',
			gap: 12,
		},
	},
	{
		id: 'double',
		name: () => __( 'Double line', 'wunderpaint' ),
		style: {
			width: 18,
			start: 100,
			end: 100,
			kind: 'double',
		},
	},
	{
		id: 'asymmetric',
		name: () => __( 'Asymmetric', 'wunderpaint' ),
		style: {
			width: 30,
			start: 0,
			end: 0,
			bias: 65,
			belly: 50,
			peak: 35,
		},
	},
	{
		id: 'fine',
		name: () => __( 'Fine line', 'wunderpaint' ),
		group: 'basic',
		style: { width: 3, start: 100, end: 100 },
	},
	{
		id: 'bold',
		name: () => __( 'Bold line', 'wunderpaint' ),
		group: 'basic',
		style: { width: 22, start: 100, end: 100 },
	},
	{
		id: 'bar',
		name: () => __( 'Flat band', 'wunderpaint' ),
		group: 'basic',
		style: { width: 22, start: 100, end: 100, cap: 'flat' },
	},
	{
		id: 'marker',
		name: () => __( 'Wide marker', 'wunderpaint' ),
		group: 'basic',
		style: { width: 48, start: 100, end: 100, cap: 'flat', bias: 30 },
	},
	{
		id: 'needle',
		name: () => __( 'Needle', 'wunderpaint' ),
		group: 'taper',
		style: {
			width: 14,
			start: 10,
			end: 0,
			inLength: 12,
			outLength: 88,
			ease: 'linear',
		},
	},
	{
		id: 'brush-tip',
		name: () => __( 'Brush tip', 'wunderpaint' ),
		group: 'taper',
		style: {
			width: 40,
			start: 100,
			end: 0,
			outLength: 52,
			belly: 20,
			peak: 32,
		},
	},
	{
		id: 'comet',
		name: () => __( 'Comet', 'wunderpaint' ),
		group: 'taper',
		style: {
			width: 30,
			start: 110,
			end: 0,
			inLength: 0,
			outLength: 95,
			ease: 'sharp',
		},
	},
	{
		id: 'spear',
		name: () => __( 'Spear', 'wunderpaint' ),
		group: 'taper',
		style: {
			width: 32,
			start: 0,
			end: 0,
			inLength: 75,
			outLength: 25,
			ease: 'linear',
		},
	},
	{
		id: 'lens',
		name: () => __( 'Lens', 'wunderpaint' ),
		group: 'taper',
		style: {
			width: 36,
			start: 0,
			end: 0,
			inLength: 50,
			outLength: 50,
			ease: 'linear',
		},
	},
	{
		id: 'saber',
		name: () => __( 'Saber', 'wunderpaint' ),
		group: 'taper',
		style: {
			width: 38,
			start: 0,
			end: 0,
			inLength: 15,
			outLength: 85,
			bias: 75,
		},
	},
	{
		id: 'waist',
		name: () => __( 'Waist', 'wunderpaint' ),
		group: 'profile',
		style: {
			width: 26,
			start: 100,
			end: 100,
			markers: [ { t: 0.5, value: 0.25 } ],
		},
	},
	{
		id: 'soft-waist',
		name: () => __( 'Soft waist', 'wunderpaint' ),
		group: 'profile',
		style: {
			width: 26,
			start: 100,
			end: 100,
			markers: [ { t: 0.5, value: 0.6 } ],
		},
	},
	{
		id: 'single-wave',
		name: () => __( 'Single swell', 'wunderpaint' ),
		group: 'profile',
		style: {
			width: 14,
			start: 50,
			end: 50,
			markers: [ { t: 0.5, value: 2.7 } ],
		},
	},
	{
		id: 'double-swell',
		name: () => __( 'Double swell', 'wunderpaint' ),
		group: 'profile',
		style: {
			width: 14,
			start: 0,
			end: 0,
			markers: [
				{ t: 0.25, value: 2.1 },
				{ t: 0.5, value: 0.5 },
				{ t: 0.75, value: 2.1 },
			],
		},
	},
	{
		id: 'triple-swell',
		name: () => __( 'Triple swell', 'wunderpaint' ),
		group: 'profile',
		style: {
			width: 12,
			start: 0,
			end: 0,
			markers: [
				{ t: 0.17, value: 2 },
				{ t: 0.33, value: 0.35 },
				{ t: 0.5, value: 2 },
				{ t: 0.67, value: 0.35 },
				{ t: 0.83, value: 2 },
			],
		},
	},
	{
		id: 'rising',
		name: () => __( 'Rising', 'wunderpaint' ),
		group: 'profile',
		style: {
			width: 24,
			start: 5,
			end: 150,
			inLength: 95,
			outLength: 0,
			markers: [
				{ t: 0.3, value: 0.45 },
				{ t: 0.7, value: 1.3 },
			],
		},
	},
	{
		id: 'pinch',
		name: () => __( 'Pinch', 'wunderpaint' ),
		group: 'profile',
		style: {
			width: 24,
			start: 0,
			end: 0,
			inLength: 15,
			outLength: 15,
			markers: [
				{ t: 0.4, value: 1.4 },
				{ t: 0.6, value: 0.2 },
				{ t: 0.8, value: 1.2 },
			],
		},
	},
	{
		id: 'bold-arrow',
		name: () => __( 'Bold arrow', 'wunderpaint' ),
		group: 'arrow',
		style: {
			width: 24,
			start: 100,
			end: 100,
			arrowEnd: true,
			arrowSize: 2.4,
		},
	},
	{
		id: 'fine-arrow',
		name: () => __( 'Fine arrow', 'wunderpaint' ),
		group: 'arrow',
		style: { width: 4, start: 100, end: 100, arrowEnd: true, arrowSize: 5 },
	},
	{
		id: 'tail-arrow',
		name: () => __( 'Tailed arrow', 'wunderpaint' ),
		group: 'arrow',
		style: {
			width: 14,
			start: 0,
			end: 100,
			inLength: 80,
			arrowEnd: true,
			arrowSize: 3.5,
		},
	},
	{
		id: 'dash-arrow',
		name: () => __( 'Dashed arrow', 'wunderpaint' ),
		group: 'arrow',
		style: {
			width: 7,
			start: 100,
			end: 100,
			kind: 'dashed',
			dash: 18,
			gap: 10,
			arrowEnd: true,
			arrowSize: 4,
		},
	},
	{
		id: 'short-dash',
		name: () => __( 'Short dashes', 'wunderpaint' ),
		group: 'pattern',
		style: {
			width: 8,
			start: 100,
			end: 100,
			kind: 'dashed',
			dash: 8,
			gap: 15,
		},
	},
	{
		id: 'long-dash',
		name: () => __( 'Long dashes', 'wunderpaint' ),
		group: 'pattern',
		style: {
			width: 10,
			start: 100,
			end: 100,
			kind: 'dashed',
			dash: 38,
			gap: 20,
			cap: 'flat',
		},
	},
	{
		id: 'bold-dots',
		name: () => __( 'Bold dots', 'wunderpaint' ),
		group: 'pattern',
		style: { width: 20, start: 100, end: 100, kind: 'dotted', gap: 14 },
	},
	{
		id: 'taper-dots',
		name: () => __( 'Tapered dots', 'wunderpaint' ),
		group: 'pattern',
		style: {
			width: 20,
			start: 100,
			end: 0,
			outLength: 90,
			kind: 'dotted',
			gap: 8,
		},
	},
	{
		id: 'twin-taper',
		name: () => __( 'Twin taper', 'wunderpaint' ),
		group: 'pattern',
		style: { width: 24, start: 100, end: 0, outLength: 75, kind: 'double' },
	},
	...PEN_EXTRA_PRESETS,
	...PEN_ART_PRESETS,
];
export function penPresetStyle( preset ) {
	return cleanPenStyle( {
		...PEN_DEFAULT_STYLE,
		...preset.style,
	} );
}
const easing = ( t, ease ) =>
	ease === 'linear' ? t : ease === 'sharp' ? t * t : t * t * ( 3 - 2 * t );
/** Profile parameter is distance along the path, never a Bezier parameter. */
export function penWidthAt( t, value, closed = false ) {
	const p = value,
		q = clamp( t, 0, 1 ),
		peak = p.peak / 100;
	let width = 1;
	if ( ! closed ) {
		const a = p.inLength / 100,
			b = p.outLength / 100,
			scale = Math.max( 1, a + b ),
			aa = a / scale,
			bb = b / scale;
		if ( aa > 0 && q < aa ) {
			width =
				p.start / 100 +
				( 1 - p.start / 100 ) * easing( q / aa, p.ease );
		}
		if ( bb > 0 && q > 1 - bb ) {
			width =
				p.end / 100 +
				( 1 - p.end / 100 ) * easing( ( 1 - q ) / bb, p.ease );
		}
	}
	const bell =
		Math.sin(
			( Math.PI / 2 ) *
				( q <= peak ? q / peak : ( 1 - q ) / ( 1 - peak ) )
		) ** 2;
	width *= 1 + ( p.belly / 100 ) * bell;
	if ( p.markers.length ) {
		const stops = [
			{
				t: 0,
				value: 1,
			},
			...p.markers,
			{
				t: 1,
				value: 1,
			},
		];
		const i = Math.max(
			1,
			stops.findIndex( ( m ) => m.t >= q )
		);
		const a = stops[ i - 1 ],
			b = stops[ i ];
		width *=
			a.value +
			( b.value - a.value ) *
				easing( ( q - a.t ) / Math.max( 1e-6, b.t - a.t ), 'smooth' );
	}
	return Math.max( 0, p.width * width * motionWidthAt( t, p ) );
}
/** Flatten once, then resample by distance while retaining every corner. */
export function penSamples( d ) {
	const key = 'samples:' + d;
	if ( outlineCache.has( key ) ) {
		return outlineCache.get( key );
	}
	const result = flattenPathD( normalizePathD( d ), 0.6 )
		.map( ( raw, sourceIndex ) => {
			const clean = raw.filter(
				( p, i ) => ! i || dist( raw[ i - 1 ], p ) > 1e-7
			);
			const closed =
				clean.length > 2 &&
				dist( clean[ 0 ], clean[ clean.length - 1 ] ) < 1e-5;
			let total = 0;
			const lengths = [ 0 ];
			for ( let i = 1; i < clean.length; i++ ) {
				total += dist( clean[ i - 1 ], clean[ i ] );
				lengths.push( total );
			}
			const pts = [];
			const step = Math.max( 1, total / 1200 );
			for ( let i = 1; i < clean.length; i++ ) {
				const len = lengths[ i ] - lengths[ i - 1 ],
					n = Math.max( 1, Math.ceil( len / step ) );
				for ( let j = 0; j < n; j++ ) {
					const u = j / n;
					pts.push( {
						...mix( clean[ i - 1 ], clean[ i ], u ),
						t: total ? ( lengths[ i - 1 ] + len * u ) / total : 0,
						s: lengths[ i - 1 ] + len * u,
					} );
				}
			}
			if ( clean.length ) {
				pts.push( {
					...clean[ clean.length - 1 ],
					t: 1,
					s: total,
				} );
			}
			return {
				sourceIndex,
				pts,
				total,
				closed,
			};
		} )
		.filter( ( s ) => s.total > 1e-6 );
	cache( key, result );
	return result;
}
function cache( key, value ) {
	outlineCache.set( key, value );
	if ( outlineCache.size > 96 ) {
		outlineCache.delete( outlineCache.keys().next().value );
	}
}
const normal = ( a, b ) => {
	const len = dist( a, b ) || 1;
	return {
		x: -( b.y - a.y ) / len,
		y: ( b.x - a.x ) / len,
	};
};
export function penPointAt( d, t, subIndex = 0 ) {
	const sub = penSamples( d )[ subIndex ];
	if ( ! sub ) {
		return null;
	}
	const pts = sub.pts;
	const at = clamp( t, 0, 1 );
	let i = pts.findIndex( ( p ) => p.t >= at );
	if ( i < 1 ) {
		i = 1;
	}
	const a = pts[ i - 1 ],
		b = pts[ i ],
		u = ( at - a.t ) / Math.max( 1e-9, b.t - a.t );
	return {
		...mix( a, b, u ),
		normal: normal( a, b ),
		t: at,
	};
}
const area = ( ps ) =>
	ps.reduce( ( sum, p, i ) => {
		const q = ps[ ( i + 1 ) % ps.length ];
		return sum + p.x * q.y - q.x * p.y;
	}, 0 ) / 2;
function polygon( ps, positive = true ) {
	if ( ps.length < 3 ) {
		return '';
	}
	const points = area( ps ) >= 0 === positive ? ps : ps.slice().reverse();
	return (
		'M' +
		points.map( ( p ) => `${ fmt( p.x ) },${ fmt( p.y ) }` ).join( 'L' ) +
		'Z'
	);
}
function circle( p, r ) {
	return polygon(
		Array.from(
			{
				length: 32,
			},
			( _, i ) => ( {
				x: p.x + r * Math.cos( ( i * Math.PI ) / 16 ),
				y: p.y + r * Math.sin( ( i * Math.PI ) / 16 ),
			} )
		)
	);
}
/* ------------------------------ art strokes ------------------------------ */

// Smooth seeded 1-D noise in [0, 1] - the same value for the same seed and
// distance, so a stroke keeps its texture through every redraw.
const hash1 = ( n ) => {
	const x = Math.sin( n * 127.1 + 311.7 ) * 43758.5453;
	return x - Math.floor( x );
};
const noise1 = ( x, seed ) => {
	const i = Math.floor( x );
	const f = x - i;
	const u = f * f * ( 3 - 2 * f );
	const k = seed * 57.31;
	return hash1( i + k ) * ( 1 - u ) + hash1( i + 1 + k ) * u;
};
// Unit normals of a sampled centerline (from the neighbours).
function sampleNormals( pts ) {
	return pts.map( ( q, i ) => {
		const a = pts[ Math.max( 0, i - 1 ) ];
		const b = pts[ Math.min( pts.length - 1, i + 1 ) ];
		const len = dist( a, b ) || 1;
		return { x: -( b.y - a.y ) / len, y: ( b.x - a.x ) / len };
	} );
}
const shifted = ( pts, normals, by ) =>
	pts.map( ( q, i ) => {
		const o = by( q, i );
		return {
			...q,
			x: q.x + normals[ i ].x * o,
			y: q.y + normals[ i ].y * o,
		};
	} );

/**
 * The art kinds (19.10.2026), all ordinary filled geometry:
 * - bristle: a dry brush - strands across the width, each its own breadth,
 *   breaking off where the brush runs dry (more at the edges);
 * - sketch: a few thin lines that wander around the stroke, pencil-like;
 * - ribbon: a band that twists - the front filled, the back shown by its
 *   two edges, so it reads in depth in a single colour.
 *
 * @param {Array}   pts    Samples of one sub-path.
 * @param {Object}  p      Clean style.
 * @param {boolean} closed Closed sub-path.
 * @return {string} Path data.
 */
function artStroke( pts, p, closed ) {
	const normals = sampleNormals( pts );
	const W = ( q ) => penWidthAt( q.t, p, closed );
	let out = '';
	if ( 'bristle' === p.kind ) {
		const K = p.strands;
		const dry = p.texture / 100;
		const freq = 1 / Math.max( 6, p.width * 1.2 );
		for ( let j = 0; j < K; j++ ) {
			const rel =
				( K > 1 ? j / ( K - 1 ) - 0.5 : 0 ) * 0.86 +
				( hash1( j * 13 + p.seed ) - 0.5 ) * 0.08;
			const wf =
				( 1.3 / K ) * ( 0.65 + 0.7 * hash1( j * 7 + p.seed * 3 ) );
			const line = shifted( pts, normals, ( q ) => rel * W( q ) );
			const thr = dry * ( 0.3 + 0.55 * Math.abs( rel ) * 2 );
			let run = [];
			const flush = () => {
				if ( run.length > 1 ) {
					out += strip( run, p, false, 0, wf );
				}
				run = [];
			};
			for ( const q of line ) {
				if ( noise1( q.s * freq, p.seed + j * 1.7 ) >= thr ) {
					run.push( q );
				} else {
					flush();
				}
			}
			flush();
		}
		return out;
	}
	if ( 'sketch' === p.kind ) {
		const K = Math.max( 2, Math.min( 5, Math.round( p.strands / 3 ) ) );
		const loose = p.texture / 100;
		const freq = 1 / Math.max( 18, p.width * 3 );
		for ( let j = 0; j < K; j++ ) {
			const lane = ( j - ( K - 1 ) / 2 ) * 0.14;
			const line = shifted(
				pts,
				normals,
				( q ) =>
					W( q ) *
					( lane +
						( noise1( q.s * freq + j * 10, p.seed + j ) - 0.5 ) *
							0.9 *
							loose )
			);
			out += strip(
				line,
				p,
				closed,
				0,
				0.14 + 0.08 * hash1( j * 5 + p.seed )
			);
		}
		return out;
	}
	// Ribbon: |cos| gives the visible breadth, its sign the side.
	const twists = 1 + Math.round( ( p.texture / 100 ) * 7 );
	const phase = hash1( p.seed ) * Math.PI;
	const cosAt = ( q ) => Math.cos( Math.PI * twists * q.t + phase );
	const edge = ( q, i, side ) => {
		const h = ( W( q ) / 2 ) * Math.abs( cosAt( q ) );
		return {
			...q,
			x: q.x + normals[ i ].x * h * side,
			y: q.y + normals[ i ].y * h * side,
		};
	};
	let seg = [];
	let front = cosAt( pts[ 0 ] ) >= 0;
	const flushSeg = () => {
		if ( seg.length > 1 ) {
			const left = seg.map( ( [ q, i ] ) => edge( q, i, 1 ) );
			const right = seg.map( ( [ q, i ] ) => edge( q, i, -1 ) );
			out += front
				? polygon( [ ...left, ...right.reverse() ] )
				: strip( left, p, false, 0, 0.07 ) +
				  strip( right, p, false, 0, 0.07 );
		}
	};
	pts.forEach( ( q, i ) => {
		const now = cosAt( q ) >= 0;
		if ( now !== front && seg.length ) {
			seg.push( [ q, i ] );
			flushSeg();
			seg = [];
			front = now;
		}
		seg.push( [ q, i ] );
	} );
	flushSeg();
	return out;
}

/**
 * Ragged edge: every outline vertex nudged along its normal by noise.
 *
 * @param {string} d Outline of one open stroke.
 * @param {Object} p Clean style.
 * @return {string} Path data.
 */
function roughen( d, p ) {
	const amp =
		( p.rough / 100 ) * Math.max( 0.6, Math.min( p.width * 0.2, 8 ) );
	const freq = 1 / Math.max( 3, p.width * 0.45 );
	const subs = parsePathAnchors( d ) || [];
	for ( const sub of subs ) {
		const a = sub.anchors;
		const n = a.length;
		if ( n < 3 ) {
			continue;
		}
		let s = 0;
		sub.anchors = a.map( ( q, i ) => {
			if ( i ) {
				s += dist( a[ i - 1 ], q );
			}
			const prev = a[ ( i - 1 + n ) % n ];
			const next = a[ ( i + 1 ) % n ];
			const len = dist( prev, next ) || 1;
			const nx = -( next.y - prev.y ) / len;
			const ny = ( next.x - prev.x ) / len;
			const o =
				( noise1( s * freq, p.seed + 3 ) - 0.5 ) * 2 * amp +
				( noise1( s * freq * 4, p.seed + 9 ) - 0.5 ) * 0.6 * amp;
			const dx = nx * o;
			const dy = ny * o;
			const move = ( h ) => ( h ? { x: h.x + dx, y: h.y + dy } : null );
			return {
				...q,
				x: q.x + dx,
				y: q.y + dy,
				hIn: move( q.hIn ),
				hOut: move( q.hOut ),
			};
		} );
	}
	return buildPathD( subs );
}

function strip( pts, p, closed = false, offset = 0, widthFactor = 1 ) {
	if ( pts.length < 2 ) {
		return '';
	}
	const count = pts.length - ( closed ? 1 : 0 ),
		left = [],
		right = [];
	for ( let i = 0; i < count; i++ ) {
		const at = pts[ i ],
			prev = pts[ i === 0 ? ( closed ? count - 1 : 0 ) : i - 1 ],
			next = pts[ i === count - 1 ? ( closed ? 0 : i ) : i + 1 ];
		let n0 = normal( prev, at ),
			n1 = normal( at, next );
		if ( ! closed && i === 0 ) {
			n0 = n1;
		}
		if ( ! closed && i === count - 1 ) {
			n1 = n0;
		}
		const dot = n0.x * n1.x + n0.y * n1.y,
			den = Math.max( 0.5, 1 + dot );
		const nx = ( n0.x + n1.x ) / den,
			ny = ( n0.y + n1.y ) / den;
		const length =
			pts[ pts.length - 1 ].s / Math.max( 1e-8, pts[ pts.length - 1 ].t );
		const endZone = Math.min(
			0.5,
			( p.width * 0.8 ) / Math.max( 1, length )
		);
		const arrowFactor = closed
			? 1
			: Math.min(
					p.arrowStart ? at.t / endZone : 1,
					p.arrowEnd ? ( 1 - at.t ) / endZone : 1,
					1
			  );
		const w =
				penWidthAt( at.t, p, closed ) *
				widthFactor *
				arrowFactor *
				nibFactor( { x: nx, y: ny }, p ),
			shift = ( ( p.bias / 100 ) * w ) / 2 + offset;
		left.push( {
			x: at.x + nx * ( w / 2 + shift ),
			y: at.y + ny * ( w / 2 + shift ),
		} );
		right.push( {
			x: at.x + nx * ( -w / 2 + shift ),
			y: at.y + ny * ( -w / 2 + shift ),
		} );
	}
	if ( closed ) {
		// Positive pieces form a union under the renderer's nonzero fill.
		// A reversed inner ring would create cracks at variable-width corners
		// and false holes once a contour grows wider than its interior.
		return left
			.map( ( a, i ) => {
				const j = ( i + 1 ) % count;
				return (
					polygon( [ a, left[ j ], right[ j ] ] ) +
					polygon( [ a, right[ j ], right[ i ] ] )
				);
			} )
			.join( '' );
	}
	const ring = [ ...left ],
		end = pts[ count - 1 ],
		first = pts[ 0 ];
	const cap = ( point, last, a, b ) => {
		const n = normal( a, b ),
			w = penWidthAt( point.t, p ) * widthFactor * nibFactor( n, p ),
			r = w / 2,
			shift = ( p.bias / 100 ) * r + offset;
		const center = {
			x: point.x + n.x * shift,
			y: point.y + n.y * shift,
		};
		const ang = Math.atan2( n.y, n.x ) + ( last ? 0 : Math.PI );
		for ( let j = 1; j < 16; j++ ) {
			const theta = ang - ( Math.PI * j ) / 16;
			ring.push( {
				x: center.x + r * Math.cos( theta ),
				y: center.y + r * Math.sin( theta ),
			} );
		}
	};
	if ( p.cap === 'round' && ! ( p.arrowEnd && end.t > 0.9999 ) ) {
		cap( end, true, pts[ count - 2 ], end );
	}
	ring.push( ...right.reverse() );
	if ( p.cap === 'round' && ! ( p.arrowStart && first.t < 0.0001 ) ) {
		cap( first, false, first, pts[ 1 ] );
	}
	return polygon( ring );
}
/** Filled, ordinary SVG path, suitable for every existing renderer/exporter. */
export function penOutline( d, value = {} ) {
	const p = cleanPenStyle( value ),
		key = 'outline:' + d + '|' + JSON.stringify( p );
	if ( outlineCache.has( key ) ) {
		return outlineCache.get( key );
	}
	if ( p.symmetry !== 'off' ) {
		const original = penOutline( d, { ...p, symmetry: 'off' } );
		const result = original + penSymmetryCopies( original, p );
		cache( key, result );
		return result;
	}
	if ( ( p.trimStart > 0 || p.trimEnd < 100 ) && p.kind !== 'fill' ) {
		const result = penOutline( trimPenPath( d, p.trimStart, p.trimEnd ), {
			...p,
			trimStart: 0,
			trimEnd: 100,
		} );
		cache( key, result );
		return result;
	}
	if ( p.parallelCount && p.kind !== 'fill' ) {
		const single = { ...p, parallelCount: 0 };
		let result = penOutline( d, single );
		for ( let i = 1; i <= p.parallelCount; i++ ) {
			result += penOutline(
				offsetPenPath( d, p.parallelGap * i ),
				single
			);
		}
		cache( key, result );
		return result;
	}
	const subs = penSamples( d );
	const native = parsePathAnchors( normalizePathD( d ) ) || [];
	let out = '';
	if ( p.kind === 'fill' ) {
		out = buildPathD(
			( parsePathAnchors( d ) || [] ).map( ( s ) => ( {
				...s,
				closed: s.anchors.length > 2,
			} ) )
		);
	} else {
		for ( const sub of subs ) {
			const { total, closed } = sub;
			const pts = closed
				? sub.pts
				: trimPenSamples(
						sub,
						penEndingSize(
							sub,
							p,
							false,
							native[ sub.sourceIndex ]
						).cut,
						penEndingSize( sub, p, true, native[ sub.sourceIndex ] )
							.cut
				  );
			let piece = '';
			if ( [ 'bristle', 'sketch', 'ribbon' ].includes( p.kind ) ) {
				piece += artStroke( pts, p, closed );
			} else if ( p.kind === 'double' ) {
				piece +=
					strip( pts, p, closed, -p.width * 0.32, 0.3 ) +
					strip( pts, p, closed, p.width * 0.32, 0.3 );
			} else if ( p.kind === 'dotted' ) {
				const start = pts[ 0 ].s,
					length = pts.at( -1 ).s - start,
					desired = Math.max( p.gap + p.width, total / 800 ),
					count = Math.max(
						1,
						Math.min( 800, Math.round( length / desired ) )
					),
					step = p.patternFit ? length / count : desired;
				for ( let i = 0; i <= 800; i++ ) {
					const atS = start + i * step;
					if (
						( closed
							? atS >= start + length
							: atS > start + length + 1e-6 ) ||
						step < 1e-8
					) {
						break;
					}
					const at = samplePenDistance( sub, atS );
					piece += circle( at, penWidthAt( at.t, p, closed ) / 2 );
				}
			} else if ( p.kind === 'dashed' ) {
				const start = pts[ 0 ].s,
					length = pts.at( -1 ).s - start,
					desired = Math.max( p.dash + p.gap, total / 800 ),
					count = Math.max(
						1,
						Math.min(
							800,
							Math.round(
								( length + ( closed ? 0 : p.gap ) ) / desired
							)
						)
					),
					scale = p.patternFit
						? length /
						  ( count * p.dash +
								( closed ? count : count - 1 ) * p.gap )
						: 1,
					dash = p.dash * scale,
					period = p.patternFit
						? ( p.dash + p.gap ) * scale
						: desired;
				for ( let i = 0; i < 800; i++ ) {
					const from = start + i * period,
						to = Math.min( start + length, from + dash );
					if ( from >= start + length ) {
						break;
					}
					const part = [
						samplePenDistance( sub, from ),
						...pts.filter( ( q ) => q.s > from && q.s < to ),
						samplePenDistance( sub, to ),
					];
					piece += strip( part, p );
				}
			} else {
				piece += strip( pts, p, closed );
			}
			if ( ! closed ) {
				piece +=
					penEnding( sub, native[ sub.sourceIndex ], p, false ) +
					penEnding( sub, native[ sub.sourceIndex ], p, true );
			}
			// A ragged edge on open strokes. Closed outlines are a union
			// of small triangles, which roughening would crack apart.
			out += p.rough > 0 && ! closed ? roughen( piece, p ) : piece;
		}
	}
	cache( key, out );
	return out;
}
/*
 * Live ink for the freehand pen (Pen Tool round, 19.10.2026). The overlay
 * used to rebuild the outline of the WHOLE stroke on every pointer move,
 * so the cost per move grew with the stroke: at the end of a long
 * scribble 2.5 ms (solid) to 10 ms (three parallels) per move in node,
 * plus the browser repainting a huge path - long strokes stuttered.
 *
 * Short strokes keep the exact preview. Longer ones are inked in pieces:
 * every finished piece is outlined once and frozen, only the tail is
 * recomputed, so a move costs the same however long the stroke gets. The
 * pieces share their seam point and carry no tapers, heads or width
 * profile in the middle - the release fits and outlines the whole stroke
 * anyway, exactly as before.
 */
const liveMemo = new WeakMap();
const LIVE_EXACT = 160;
const LIVE_PIECE = 80;
const rawPathD = ( pts ) =>
	'M' + pts.map( ( q ) => `${ q.x } ${ q.y }` ).join( 'L' );

/**
 * @param {Array}  points The freehand samples so far (the same array for
 *                        the whole stroke, appended in place).
 * @param {Object} style  Pen style.
 * @return {string[]} Outline paths; draw them together.
 */
export function penLiveOutline( points, style = {} ) {
	const ink = ( pts, extra = {} ) =>
		penOutline( rawPathD( pts ), {
			...style,
			...extra,
			motion: penMotion( pts, style?.dynamics ),
		} );
	if ( points.length <= LIVE_EXACT ) {
		return [ ink( points ) ];
	}
	const key = JSON.stringify( style || {} );
	let memo = liveMemo.get( points );
	if ( ! memo || memo.key !== key ) {
		memo = { key, pieces: [], upto: 0 };
		liveMemo.set( points, memo );
	}
	const flat = { belly: 0, markers: [], trimStart: 0, trimEnd: 100 };
	const noStart = { inLength: 0, startHead: 'none', arrowStart: false };
	const noEnd = { outLength: 0, endHead: 'none', arrowEnd: false };
	while ( points.length - memo.upto > LIVE_PIECE * 2 ) {
		const first = 0 === memo.upto;
		const piece = points.slice(
			Math.max( 0, memo.upto - 1 ),
			memo.upto + LIVE_PIECE + 1
		);
		memo.pieces.push(
			ink( piece, { ...flat, ...noEnd, ...( first ? {} : noStart ) } )
		);
		memo.upto += LIVE_PIECE;
	}
	const tail = points.slice( Math.max( 0, memo.upto - 1 ) );
	return [ ...memo.pieces, ink( tail, { ...flat, ...noStart } ) ];
}

export function penDraftAnchors( draft, opts = {} ) {
	const anchors = draft?.anchors || [];
	if ( draft?.mode !== 'curve' ) {
		return anchors;
	}
	const strength = clamp( opts.tension ?? 50, 0, 100 ) / 100;
	return anchors.map( ( a, i ) => {
		if ( a.corner ) {
			return {
				...a,
				hIn: null,
				hOut: null,
			};
		}
		const prev =
				anchors[ i - 1 ] ||
				( draft.closed ? anchors[ anchors.length - 1 ] : a ),
			next = anchors[ i + 1 ] || ( draft.closed ? anchors[ 0 ] : a ),
			len = dist( prev, next ) || 1;
		const ux = ( next.x - prev.x ) / len,
			uy = ( next.y - prev.y ) / len;
		const inLen = dist( prev, a ) * strength * 0.65,
			outLen = dist( a, next ) * strength * 0.65;
		return {
			...a,
			hIn:
				i > 0 || draft.closed
					? {
							x: a.x - ux * inLen,
							y: a.y - uy * inLen,
					  }
					: null,
			hOut:
				i < anchors.length - 1 || draft.closed
					? {
							x: a.x + ux * outLen,
							y: a.y + uy * outLen,
					  }
					: null,
		};
	} );
}
export function penDraftD( draft, opts = {} ) {
	return buildPathD( [
		{
			anchors: penDraftAnchors( draft, opts ),
			closed: !! draft.closed,
		},
	] );
}
export function isPenLayer( layer ) {
	return (
		layer?.type === 'shape' &&
		layer.penPath?.version === 1 &&
		typeof layer.penPath.d === 'string' &&
		Number.isFinite( layer.penPath.w ) &&
		layer.penPath.w > 0 &&
		Number.isFinite( layer.penPath.h ) &&
		layer.penPath.h > 0 &&
		!! layer.penPath.style &&
		! layer.quad
	);
}
export function penSourceD( layer ) {
	const p = layer.penPath;
	return scalePathD( p.d, layer.w / p.w, layer.h / p.h );
}
/** Rebuild in the original coordinate system, preserving an affine resize. */
export function penLayerPatch(
	layer,
	style = layer.penPath.style,
	source = layer.penPath.rawD || layer.penPath.d
) {
	const old = layer.penPath,
		sx = layer.w / old.w,
		sy = layer.h / old.h,
		clean = cleanPenStyle( style ),
		effective = clean.smoothing
			? smoothPenPath( source, 0.15 + clean.smoothing * 0.065 )
			: source,
		outline = penOutline( effective, clean );
	const b = pathBounds(
		parsePathAnchors( outline ) || parsePathAnchors( source ) || [],
		1
	);
	const w = b.w * sx,
		h = b.h * sy,
		lx = ( b.x + b.w / 2 ) * sx - layer.w / 2,
		ly = ( b.y + b.h / 2 ) * sy - layer.h / 2;
	const rad = ( ( layer.rot || 0 ) * Math.PI ) / 180,
		fx = layer.flipX ? -1 : 1,
		fy = layer.flipY ? -1 : 1;
	const cx =
			layer.x +
			layer.w / 2 +
			lx * fx * Math.cos( rad ) -
			ly * fy * Math.sin( rad ),
		cy =
			layer.y +
			layer.h / 2 +
			lx * fx * Math.sin( rad ) +
			ly * fy * Math.cos( rad );
	return {
		x: cx - w / 2,
		y: cy - h / 2,
		w,
		h,
		pathD: scalePathD( offsetPathD( outline, -b.x, -b.y ), sx, sy ),
		penPath: {
			version: 1,
			d: offsetPathD( effective, -b.x, -b.y ),
			...( clean.smoothing
				? {
						rawD: offsetPathD( source, -b.x, -b.y ),
				  }
				: {} ),
			w: b.w,
			h: b.h,
			style: {
				...clean,
				symmetryAxis:
					clean.symmetryAxis -
					( clean.symmetry === 'vertical'
						? b.x
						: clean.symmetry === 'horizontal'
						? b.y
						: 0 ),
				symmetryX: clean.symmetryX - b.x,
				symmetryY: clean.symmetryY - b.y,
			},
		},
	};
}
export function newPenGeometry( d, style ) {
	return penLayerPatch( {
		x: 0,
		y: 0,
		w: 1,
		h: 1,
		penPath: {
			version: 1,
			d,
			w: 1,
			h: 1,
			style: cleanPenStyle( style ),
		},
	} );
}
