/**
 * Continuous, tone-modulated ribbons for Text Art. Spiral and maze tracing
 * use the MIT-licensed Spiralist geometry; source pixels and editor paths
 * stay in Text Art's own coordinate system. No remote code or drawing UI.
 */
import { buildSpiral, lineWidths, STRIDE } from './vendor/spiralist/spiral.js';
import { buildMaze } from './vendor/spiralist/maze.js';
import { sampleField } from './vendor/spiralist/tone.js';

export const LINE_STYLES = [
	{ id: 'spiral', label: 'Spiral' },
	{ id: 'spiral-wave', label: 'Spiral waves' },
	{ id: 'sweep', label: 'Meander' },
	{ id: 'wave', label: 'Waves' },
	{ id: 'maze', label: 'Labyrinth' },
	{ id: 'tour', label: 'Free line' },
];
export const ONE_LINE_DEFAULTS = {
	oneLine: 'spiral',
	oneDensity: 60,
	oneWeight: 88,
	oneHairline: 3,
	oneWave: 85,
	oneFrequency: 120,
};
const limit = ( value, min, max, fallback ) => {
	const n = Number( value );
	return Number.isFinite( n )
		? Math.max( min, Math.min( max, n ) )
		: fallback;
};
export function cleanOneLine( params = {}, legacy = false ) {
	return {
		oneLine: LINE_STYLES.some( ( s ) => s.id === params.oneLine )
			? params.oneLine
			: legacy
			? 'tour'
			: 'spiral',
		oneDensity: Math.round( limit( params.oneDensity, 16, 100, 60 ) ),
		oneWeight: limit( params.oneWeight, 10, 96, 88 ),
		oneHairline: limit( params.oneHairline, 0, 20, 3 ),
		oneWave: limit( params.oneWave, 0, 100, 85 ),
		oneFrequency: limit( params.oneFrequency, 40, 240, 120 ),
	};
}

// Resample the complete rectangular source to a normalized field, then
// map both geometry and tone back to its original aspect. No square crop.
function normalizedField( field ) {
	const { w, h, v } = field;
	const G = Math.max( 32, Math.min( 768, Math.max( w, h ) ) );
	const D = new Float32Array( G * G );
	for ( let j = 0; j < G; j++ ) {
		const y = Math.max(
			0,
			Math.min( h - 1, ( ( j + 0.5 ) * h ) / G - 0.5 )
		);
		const y0 = Math.floor( y ),
			y1 = Math.min( h - 1, y0 + 1 ),
			fy = y - y0;
		for ( let i = 0; i < G; i++ ) {
			const x = Math.max(
				0,
				Math.min( w - 1, ( ( i + 0.5 ) * w ) / G - 0.5 )
			);
			const x0 = Math.floor( x ),
				x1 = Math.min( w - 1, x0 + 1 ),
				fx = x - x0;
			const a = v[ y0 * w + x0 ],
				b = v[ y0 * w + x1 ];
			const c = v[ y1 * w + x0 ],
				d = v[ y1 * w + x1 ];
			D[ j * G + i ] =
				1 -
				( a +
					( b - a ) * fx +
					( c + ( d - c ) * fx - a - ( b - a ) * fx ) * fy );
		}
	}
	return { G, D };
}

/** A single serpentine: rows join through semicircles, never pen lifts. */
function meander( field, line ) {
	const count = line.rings * 2;
	const gap = 2 / count;
	const radius = gap / 2;
	const left = -1 + gap,
		right = 1 - gap;
	const W = lineWidths( line, gap );
	const wavelength = ( gap * 0.9 ) / line.frequency;
	const step = Math.min(
		1.8 / field.G,
		gap / 4,
		W.useWave ? wavelength / 12 : gap
	);
	const pts = [],
		widths = [];
	let phase = 0,
		px = left,
		py = -1 + radius;
	function push( x, y, nx, ny, waveFade = 1 ) {
		const ink = sampleField( field, x, y );
		phase +=
			( ( Math.hypot( x - px, y - py ) * Math.PI * 2 ) / wavelength ) *
			( 1 + 0.7 * ink );
		const offset = W.useWave
			? W.aMax * ink * Math.sin( phase ) * waveFade
			: 0;
		pts.push( [ x + nx * offset, y + ny * offset ] );
		widths.push( W.wMin + ( W.wMax - W.wMin ) * ink );
		px = x;
		py = y;
	}
	const across = Math.ceil( ( right - left ) / step );
	const around = Math.max( 8, Math.ceil( ( Math.PI * radius ) / step ) );
	for ( let row = 0; row < count; row++ ) {
		const direction = row % 2 ? -1 : 1;
		const y = -1 + radius + row * gap;
		const xStart = direction === 1 ? left : right;
		for ( let i = row ? 1 : 0; i <= across; i++ ) {
			const x = xStart + ( direction * ( right - left ) * i ) / across;
			const fade = Math.min( 1, ( x - left ) / gap, ( right - x ) / gap );
			push( x, y, 0, 1, Math.max( 0, fade ) );
		}
		if ( row === count - 1 ) break;
		const edge = direction === 1 ? right : left;
		for ( let i = 1; i <= around; i++ ) {
			const a = -Math.PI / 2 + ( i / around ) * Math.PI;
			push(
				edge + direction * Math.cos( a ) * radius,
				y + radius + Math.sin( a ) * radius,
				0,
				0,
				0
			);
		}
	}
	return { pts, widths };
}

/** Remove redundant samples without losing thin highlights or bends. */
function simplifyRibbon( pts, width, tolerance = 0.07 ) {
	if ( pts.length < 3 ) return { pts, width };
	const keep = new Uint8Array( pts.length );
	keep[ 0 ] = keep[ pts.length - 1 ] = 1;
	const stack = [ 0, pts.length - 1 ];
	while ( stack.length ) {
		const end = stack.pop(),
			start = stack.pop();
		const a = pts[ start ],
			b = pts[ end ];
		const dx = b[ 0 ] - a[ 0 ],
			dy = b[ 1 ] - a[ 1 ];
		const len2 = dx * dx + dy * dy;
		let worst = tolerance,
			at = -1;
		for ( let i = start + 1; i < end; i++ ) {
			const p = pts[ i ];
			const t = len2
				? Math.max(
						0,
						Math.min(
							1,
							( ( p[ 0 ] - a[ 0 ] ) * dx +
								( p[ 1 ] - a[ 1 ] ) * dy ) /
								len2
						)
				  )
				: 0;
			const error =
				Math.hypot(
					p[ 0 ] - a[ 0 ] - dx * t,
					p[ 1 ] - a[ 1 ] - dy * t
				) +
				Math.abs(
					width[ i ] -
						width[ start ] -
						( width[ end ] - width[ start ] ) * t
				);
			if ( error > worst ) {
				worst = error;
				at = i;
			}
		}
		if ( at !== -1 ) {
			keep[ at ] = 1;
			stack.push( start, at, at, end );
		}
	}
	return {
		pts: pts.filter( ( _, i ) => keep[ i ] ),
		width: width.filter( ( _, i ) => keep[ i ] ),
	};
}

export function continuousLine( field, options = {} ) {
	const o = cleanOneLine( options );
	const wave = o.oneLine === 'wave' || o.oneLine === 'spiral-wave';
	const line = {
		rings: o.oneDensity,
		technique: wave ? 'both' : 'thickness',
		weight: o.oneWeight / 100,
		hairline: o.oneHairline / 100,
		penWidth: o.oneHairline / 100,
		amplitude: o.oneWave / 100,
		frequency: o.oneFrequency / 100,
		wobble: 0,
		edgeFade: 0,
		seed: options.seed || 7,
	};
	const tone = normalizedField( field );
	let coords, widths;
	if ( o.oneLine === 'wave' || o.oneLine === 'sweep' ) {
		const result = meander( tone, line );
		coords = result.pts;
		widths = result.widths;
	} else {
		const result =
			o.oneLine === 'maze'
				? buildMaze( tone, line, {
						shape: 'square',
						flow: 0.7,
						seed: line.seed,
				  } )
				: buildSpiral( tone, line );
		coords = new Array( result.n );
		widths = new Array( result.n );
		for ( let i = 0; i < result.n; i++ ) {
			const k = i * STRIDE;
			coords[ i ] = [ result.data[ k ], result.data[ k + 1 ] ];
			widths[ i ] = result.data[ k + 2 ];
		}
	}
	const rx = Math.max(
		0.1,
		field.w / 2 - ( field.w * 0.55 ) / o.oneDensity - 1
	);
	const ry = Math.max(
		0.1,
		field.h / 2 - ( field.h * 0.55 ) / o.oneDensity - 1
	);
	const pts = new Array( coords.length ),
		half = new Array( coords.length );
	for ( let i = 0; i < coords.length; i++ ) {
		const a = coords[ Math.max( 0, i - 1 ) ],
			b = coords[ Math.min( coords.length - 1, i + 1 ) ];
		const dx = b[ 0 ] - a[ 0 ],
			dy = b[ 1 ] - a[ 1 ];
		// Correct perpendicular scale after stretching a circle to an ellipse:
		// equal line coverage in portrait and landscape, no distorted photo.
		const normalScale =
			( rx * ry * Math.hypot( dx, dy ) ) /
			( Math.hypot( rx * dx, ry * dy ) || 1 );
		pts[ i ] = [
			field.w / 2 + coords[ i ][ 0 ] * rx,
			field.h / 2 + coords[ i ][ 1 ] * ry,
		];
		half[ i ] = ( widths[ i ] * normalScale ) / 2;
	}
	return {
		lines: [ simplifyRibbon( pts, half ) ],
		ribbon: true,
		minWidth: 0,
	};
}
