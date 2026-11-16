/** Portable vector diagrams. Marching triangles avoid ambiguous saddle cells; no masks or raster tiles. */
import { compile, parse, evaluate, variablesOf } from './expr.js';
import { renderPlot, clipSegment, PALETTE, mix } from './plot.js';
import { textEl, r } from './svg.js';
import { formatNumber } from './shared.js';

const finite = ( f, x, y ) => {
	try {
		const v = f( { x, y, a: 1, b: 1, c: 1 } );
		return Number.isFinite( v ) ? v : NaN;
	} catch {
		return NaN;
	}
};
const expression = ( s ) => {
	const f = compile( s );
	if (
		[ ...variablesOf( f.ast ) ].some(
			( k ) => ! [ 'x', 'y' ].includes( k )
		)
	)
		throw new Error( 'Use x and y.' );
	return f;
};
const cleanLines = ( s ) =>
	String( s || '' )
		.split( /\r?\n/ )
		.map( ( v ) => v.replace( /\s\/\/.*$/, '' ).trim() )
		.filter( ( v ) => v && ! v.startsWith( '#' ) );
export function relation( s, inequality = false ) {
	const m = /^(.*?)\s*(<=|>=|≤|≥|<|>|=)\s*(.*?)$/.exec( s );
	if ( inequality && ( ! m || m[ 2 ] === '=' ) )
		throw new Error( 'Use <, >, <= or >=.' );
	const f = expression( m ? `(${ m[ 1 ] })-(${ m[ 3 ] })` : s );
	return {
		f,
		sign: m && [ '>', '>=', '≥' ].includes( m[ 2 ] ) ? -1 : 1,
		strict: m && [ '<', '>' ].includes( m[ 2 ] ),
	};
}
const pathSegment = ( a, b ) =>
	`M${ r( a[ 0 ] ) } ${ r( a[ 1 ] ) }L${ r( b[ 0 ] ) } ${ r( b[ 1 ] ) }`;
/** Returns only real zero crossings, not sign changes across a pole. */
function crossing( a, b, f, level ) {
	let lo = a,
		hi = b,
		fa = finite( f, ...a ) - level;
	const fb = finite( f, ...b ) - level;
	if ( ! [ fa, fb ].every( Number.isFinite ) || fa > 0 === fb > 0 )
		return null;
	const tolerance =
		1e-8 * Math.max( 1, Math.min( Math.abs( fa ), Math.abs( fb ) ) );
	for ( let i = 0; i < 30; i++ ) {
		const m = [ ( lo[ 0 ] + hi[ 0 ] ) / 2, ( lo[ 1 ] + hi[ 1 ] ) / 2 ];
		const fm = finite( f, ...m ) - level;
		if ( ! Number.isFinite( fm ) ) return null;
		if ( Math.abs( fm ) < tolerance ) return m;
		if ( fm > 0 === fa > 0 ) {
			lo = m;
			fa = fm;
		} else hi = m;
	}
	return null;
}
export function contourSegments( f, bounds, level = 0, n = 64 ) {
	const { xmin, xmax, ymin, ymax } = bounds,
		segments = [];
	const grid = Array.from( { length: n + 1 }, ( _, j ) =>
		Array.from( { length: n + 1 }, ( _, i ) => [
			xmin + ( ( xmax - xmin ) * i ) / n,
			ymin + ( ( ymax - ymin ) * j ) / n,
		] )
	);
	for ( let j = 0; j < n; j++ )
		for ( let i = 0; i < n; i++ ) {
			const a = grid[ j ][ i ],
				b = grid[ j ][ i + 1 ],
				c = grid[ j + 1 ][ i + 1 ],
				d = grid[ j + 1 ][ i ];
			for ( const tri of [
				[ a, b, c ],
				[ a, c, d ],
			] ) {
				const hits = [];
				for ( let k = 0; k < 3; k++ ) {
					const p = crossing(
						tri[ k ],
						tri[ ( k + 1 ) % 3 ],
						f,
						level
					);
					if ( p ) hits.push( p );
				}
				if ( hits.length === 2 ) segments.push( hits );
			}
		}
	return segments;
}
export function inequalityPolygons( relations, bounds, n = 48 ) {
	const { xmin, xmax, ymin, ymax } = bounds,
		out = [];
	for ( let j = 0; j < n; j++ )
		for ( let i = 0; i < n; i++ ) {
			const x = xmin + ( ( xmax - xmin ) * i ) / n,
				y = ymin + ( ( ymax - ymin ) * j ) / n,
				dx = ( xmax - xmin ) / n,
				dy = ( ymax - ymin ) / n;
			for ( let poly of [
				[
					[ x, y ],
					[ x + dx, y ],
					[ x + dx, y + dy ],
				],
				[
					[ x, y ],
					[ x + dx, y + dy ],
					[ x, y + dy ],
				],
			] ) {
				for ( const { f, sign } of relations ) {
					const next = [];
					for ( let k = 0; k < poly.length; k++ ) {
						const a = poly[ k ],
							b = poly[ ( k + 1 ) % poly.length ];
						const fa = finite( f, ...a ) * sign,
							fb = finite( f, ...b ) * sign;
						if ( ! [ fa, fb ].every( Number.isFinite ) ) {
							next.length = 0;
							break;
						}
						if ( fa <= 0 ) next.push( a );
						if ( fa <= 0 !== fb <= 0 ) {
							const hit = crossing( a, b, f, 0 );
							if ( hit ) next.push( hit );
							else {
								next.length = 0;
								break;
							}
						}
					}
					poly = next;
					if ( poly.length < 3 ) break;
				}
				if ( poly.length >= 3 ) out.push( poly );
			}
		}
	return out;
}
export function complexPoints( source ) {
	const points = new Map();
	const num = ( s ) => evaluate( parse( s ), {} );
	for ( const line of cleanLines( source ) ) {
		let m;
		if ( ( m = /^([A-Za-z]\w*)\s*=\s*\((.+),(.+)\)$/.exec( line ) ) )
			points.set( m[ 1 ], [ num( m[ 2 ] ), num( m[ 3 ] ) ] );
		else if (
			( m = /^polar\s+([A-Za-z]\w*)\s+(\S+)\s+(\S+)$/.exec( line ) )
		) {
			const rad = num( m[ 2 ] ),
				a = ( num( m[ 3 ] ) * Math.PI ) / 180;
			points.set( m[ 1 ], [ rad * Math.cos( a ), rad * Math.sin( a ) ] );
		} else if (
			( m = /^conjugate\s+([A-Za-z]\w*)\s+([A-Za-z]\w*)$/.exec( line ) )
		) {
			const p = points.get( m[ 2 ] );
			if ( ! p ) throw new Error( 'Unknown complex point: ' + m[ 2 ] );
			points.set( m[ 1 ], [ p[ 0 ], -p[ 1 ] ] );
		} else if ( ( m = /^roots\s+(\d+)$/.exec( line ) ) ) {
			const n = Number( m[ 1 ] );
			if ( n < 1 || n > 32 ) throw new Error( 'Use 1 to 32 roots.' );
			for ( let i = 0; i < n; i++ )
				points.set( 'z' + ( i + 1 ), [
					Math.cos( ( 2 * Math.PI * i ) / n ),
					Math.sin( ( 2 * Math.PI * i ) / n ),
				] );
		} else throw new Error( 'Unknown complex command: ' + line );
	}
	if ( [ ...points.values() ].some( ( p ) => ! p.every( Number.isFinite ) ) )
		throw new Error( 'Undefined complex coordinate.' );
	return points;
}
export function renderAdvanced( block, ctx ) {
	const warnings = [],
		readouts = [],
		{ t, style } = ctx;
	const base = renderPlot( [], {
		width: ctx.blockWidth,
		xmin: block.xmin,
		xmax: block.xmax,
		ymin: block.ymin,
		ymax: block.ymax,
		equal: block.equal,
		grid: block.grid,
		legend: false,
		font: style.textFont,
		fontSize: 18 * ctx.scale,
		ink: style.ink,
		bg: style.bg || '#ffffff',
		xLabel: block.type === 'complex' ? 'Re' : 'x',
		yLabel: block.type === 'complex' ? 'Im' : 'y',
	} );
	const v = base.view,
		p = base.projection;
	const X = ( x ) => p.x + ( ( x - v.xmin ) * p.w ) / ( v.xmax - v.xmin );
	const Y = ( y ) => p.y + ( ( v.ymax - y ) * p.h ) / ( v.ymax - v.ymin );
	const project = ( a ) => [ X( a[ 0 ] ), Y( a[ 1 ] ) ];
	const rect = { x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h };
	const seg = ( a, b ) => {
		const clipped = clipSegment( project( a ), project( b ), rect );
		return clipped ? pathSegment( ...clipped ) : '';
	};
	const parts = [],
		under = [];
	const stroke = ( d, color, dash = false, width = 2 ) =>
		`<path d="${ d }" fill="none" stroke="${ color }" stroke-width="${ width }"${
			dash ? ' stroke-dasharray="6 5"' : ''
		}/>`;
	try {
		const lines = cleanLines( block.content );
		const n = Math.max(
			24,
			Math.min( 100, Number( block.resolution ) || 64 )
		);
		if ( ! lines.length )
			warnings.push( t( 'Enter an expression or choose a starter.' ) );
		if ( [ 'implicit', 'inequality', 'contours' ].includes( block.type ) ) {
			const relations = lines
				.slice( 0, 8 )
				.map( ( s ) => relation( s, block.type === 'inequality' ) );
			if ( block.type === 'inequality' && relations.length ) {
				const d = inequalityPolygons( relations, v, Math.min( n, 64 ) )
					.map(
						( poly ) =>
							'M' +
							poly
								.map( ( a ) =>
									project( a ).map( r ).join( ' ' )
								)
								.join( 'L' ) +
							'Z'
					)
					.join( '' );
				under.push(
					`<path d="${ d }" fill="${ mix(
						style.accent,
						style.bg || '#ffffff',
						0.8
					) }"/>`
				);
			}
			const levels =
				block.type === 'contours'
					? String( block.levels || '0,1,2,4,8' )
							.split( ',' )
							.slice( 0, 16 )
							.map( ( s ) => evaluate( parse( s ), {} ) )
					: [ 0 ];
			if ( ! levels.every( Number.isFinite ) )
				throw new Error(
					t( 'Contour levels must be finite numbers.' )
				);
			relations.forEach( ( rel, i ) =>
				levels.forEach( ( level, j ) => {
					const segments = contourSegments( rel.f, v, level, n );
					const color = PALETTE[ ( i + j ) % PALETTE.length ];
					parts.push(
						stroke(
							segments.map( ( s ) => seg( ...s ) ).join( '' ),
							color,
							rel.strict
						)
					);
					if ( block.type === 'contours' && segments.length ) {
						const at = project(
							segments[ Math.floor( segments.length * 0.3 ) ][ 0 ]
						);
						parts.push(
							textEl(
								at[ 0 ] + 5,
								at[ 1 ] - 5,
								formatNumber( level ),
								{
									size: 16 * ctx.scale,
									fill: color,
									font: style.textFont,
								}
							)
						);
					}
				} )
			);
		} else if (
			[ 'vectorfield', 'slopefield' ].includes( block.type ) &&
			lines.length
		) {
			const fs = lines[ 0 ].split( ';' );
			const fx =
				block.type === 'slopefield' ? () => 1 : expression( fs[ 0 ] );
			const fy = expression(
				block.type === 'slopefield' ? fs[ 0 ] : fs[ 1 ] || '0'
			);
			const count = Math.max(
				7,
				Math.min( 27, Number( block.density ) || 17 )
			);
			const stepX = ( v.xmax - v.xmin ) / count,
				stepY = ( v.ymax - v.ymin ) / count;
			const samples = [];
			for ( let j = 0; j < count; j++ )
				for ( let i = 0; i < count; i++ ) {
					const x = v.xmin + ( i + 0.5 ) * stepX,
						y = v.ymin + ( j + 0.5 ) * stepY;
					const dx = finite( fx, x, y ),
						dy = finite( fy, x, y );
					const mag = Math.hypot( dx, dy );
					if ( Number.isFinite( mag ) && mag > 1e-10 )
						samples.push( { x, y, dx, dy, mag } );
				}
			const max = Math.max( 1e-10, ...samples.map( ( s ) => s.mag ) ),
				buckets = Array( 8 ).fill( '' );
			for ( const s of samples ) {
				const vx = ( s.dx * p.w ) / ( v.xmax - v.xmin ),
					vy = ( -s.dy * p.h ) / ( v.ymax - v.ymin );
				const length =
					( Math.min( p.w, p.h ) / count ) *
					0.7 *
					( block.normalize || block.type === 'slopefield'
						? 1
						: 0.2 + 0.8 * Math.sqrt( s.mag / max ) );
				const ux = vx / Math.hypot( vx, vy ),
					uy = vy / Math.hypot( vx, vy );
				const a = [
						X( s.x ) - ( ux * length ) / 2,
						Y( s.y ) - ( uy * length ) / 2,
					],
					b = [
						X( s.x ) + ( ux * length ) / 2,
						Y( s.y ) + ( uy * length ) / 2,
					];
				let d = pathSegment( a, b );
				if ( block.type === 'vectorfield' ) {
					const head = Math.min( length * 0.35, 6 );
					d +=
						pathSegment(
							[
								b[ 0 ] - ux * head - uy * head * 0.5,
								b[ 1 ] - uy * head + ux * head * 0.5,
							],
							b
						) +
						pathSegment( b, [
							b[ 0 ] - ux * head + uy * head * 0.5,
							b[ 1 ] - uy * head - ux * head * 0.5,
						] );
				}
				buckets[ Math.min( 7, Math.floor( ( s.mag / max ) * 7 ) ) ] +=
					d;
			}
			buckets.forEach( ( d, i ) =>
				parts.push(
					stroke( d, mix( '#2563eb', '#be185d', i / 7 ), false, 1.6 )
				)
			);
		} else if ( block.type === 'complex' ) {
			for ( const [ name, a ] of complexPoints( block.content ) ) {
				parts.push( stroke( seg( [ 0, 0 ], a ), style.accent ) );
				parts.push(
					stroke(
						seg( [ a[ 0 ], 0 ], a ) + seg( [ 0, a[ 1 ] ], a ),
						style.muted,
						true,
						1
					)
				);
				if (
					a[ 0 ] < v.xmin ||
					a[ 0 ] > v.xmax ||
					a[ 1 ] < v.ymin ||
					a[ 1 ] > v.ymax
				)
					continue;
				parts.push(
					`<circle cx="${ r( X( a[ 0 ] ) ) }" cy="${ r(
						Y( a[ 1 ] )
					) }" r="4" fill="${ style.accent }"/>`
				);
				parts.push(
					textEl( X( a[ 0 ] ) + 8, Y( a[ 1 ] ) - 8, name, {
						size: 18 * ctx.scale,
						fill: style.ink,
						font: style.textFont,
					} )
				);
				if ( block.measurements )
					readouts.push(
						`${ name }: |z| ≈ ${ formatNumber(
							Math.hypot( ...a )
						) }, arg ≈ ${
							Math.hypot( ...a ) < 1e-12
								? '?'
								: formatNumber(
										( Math.atan2( a[ 1 ], a[ 0 ] ) * 180 ) /
											Math.PI
								  ) + '°'
						}`
					);
			}
		}
	} catch ( e ) {
		warnings.push( t( e.message ) );
	}
	let svg = base.svg;
	// Put filled solution regions behind the axes, but above the solid paper.
	if ( under.length )
		svg = svg.replace(
			/(<svg[^>]*>(?:<rect[^>]*\/>|))/,
			'$1' + under.join( '' )
		);
	svg = svg.replace( '</svg>', parts.join( '' ) + '</svg>' );
	return { svg, width: base.width, height: base.height, warnings, readouts };
}
