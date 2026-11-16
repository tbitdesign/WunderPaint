import { parseFunctions, renderPlot } from './engine/plot.js';
import { evaluate, parse } from './engine/expr.js';
import {
	roots,
	extrema,
	derivative,
	areaBetween,
	finiteValue,
} from './engine/analysis.js';
import { renderAdvanced } from './engine/advanced.js';
import { formatNumber as fmt } from './engine/shared.js';
import { layoutText } from './engine/text.js';
import { r } from './engine/svg.js';

const strip = ( svg ) =>
	svg.replace( /^<svg[^>]*>/, '' ).replace( /<\/svg>\s*$/, '' );
function resultsBelow( res, lines, ctx, env ) {
	let inner = strip( res.svg ),
		h = res.height;
	if ( lines.length ) {
		const text = layoutText(
			lines.join( '\n\n' ),
			{
				width: ctx.blockWidth - 24,
				size: 19 * ctx.scale,
				font: ctx.style.textFont,
				color: ctx.style.ink,
			},
			env
		);
		inner += `<g transform="translate(12 ${ h + 12 })">${ text.inner }</g>`;
		h += text.h + 24;
	}
	return { inner, w: res.width, h, warnings: res.warnings };
}
function renderAnalysis( b, ctx, env ) {
	const { t } = ctx,
		warnings = [],
		result = [];
	const params = { a: b.pa, b: b.pb, c: b.pc, k: 1 };
	const parsed = parseFunctions( b.functions, params );
	parsed.errors.forEach( ( e ) =>
		warnings.push( t( 'Line' ) + ' ' + e.line + ': ' + e.message )
	);
	const items = [ ...parsed.items ],
		fs = items.filter( ( i ) => i.kind === 'y' );
	const first =
		b.source && b.source !== '*'
			? fs.find( ( i ) => i.name === b.source )
			: fs[ 0 ];
	const second = b.other ? fs.find( ( i ) => i.name === b.other ) : fs[ 1 ];
	const f = ( x ) =>
		first ? evaluate( first.ast, { ...params, x } ) : NaN;
	const g = ( x ) =>
		second ? evaluate( second.ast, { ...params, x } ) : 0;
	const lo = Number( b.from ),
		hi = Number( b.to ),
		at = Number( b.at );
	const valid = Number.isFinite( lo ) && Number.isFinite( hi ) && hi > lo;
	if ( ! valid )
		warnings.push(
			t( 'The interval end must be greater than its start.' )
		);
	if ( ! first )
		warnings.push( t( 'Choose a shared function or enter f(x).' ) );
	const addPoint = ( x, y, label, color = '#be185d' ) => {
		if ( Number.isFinite( y ) )
			items.push( { kind: 'point', x, y, label, color } );
	};
	let area = null,
		verticalNormal = false;
	if ( valid && first ) {
		if ( b.roots ) {
			const found = roots( f, lo, hi );
			result.push(
				t( 'Roots' ) +
					': ' +
					( found.length
						? found.map( ( x ) => 'x ≈ ' + fmt( x ) ).join( ', ' )
						: t( 'None found in this interval.' ) )
			);
			found.forEach( ( x, i ) => addPoint( x, 0, 'R' + ( i + 1 ) ) );
		}
		if ( b.extrema ) {
			const found = extrema( f, lo, hi );
			result.push(
				t( 'Extrema' ) +
					': ' +
					( found.length
						? found
								.map(
									( p ) =>
										`${
											p.kind === 'min'
												? t( 'Minimum' )
												: t( 'Maximum' )
										} ≈ (${ fmt( p.x ) }, ${ fmt( p.y ) })`
								)
								.join( '; ' )
						: t( 'None found in this interval.' ) )
			);
			found.forEach( ( p, i ) => addPoint( p.x, p.y, 'E' + ( i + 1 ) ) );
		}
		if ( b.intersections ) {
			if ( ! second )
				warnings.push(
					t( 'Select a second function for intersections.' )
				);
			else {
				const found = roots( ( x ) => f( x ) - g( x ), lo, hi );
				result.push(
					t( 'Intersections' ) +
						': ' +
						( found.length
							? found
									.map(
										( x ) =>
											`(${ fmt( x ) }, ${ fmt(
												finiteValue( f, x )
											) })`
									)
									.join( '; ' )
							: t( 'None found in this interval.' ) )
				);
				found.forEach( ( x, i ) =>
					addPoint(
						x,
						finiteValue( f, x ),
						'I' + ( i + 1 ),
						'#16a34a'
					)
				);
			}
		}
		if ( b.tangent || b.normal ) {
			const y = finiteValue( f, at ),
				slope = derivative( f, at );
			if ( ! Number.isFinite( slope ) || ! Number.isFinite( y ) )
				warnings.push( t( 'No stable derivative at this position.' ) );
			else {
				addPoint( at, y, 'P', '#ea580c' );
				const line = ( s, name, color ) =>
					items.push( {
						kind: 'y',
						name,
						ast: parse( `(${ s })*(x-(${ at }))+(${ y })` ),
						color,
					} );
				if ( b.tangent ) {
					line( slope, 'T', '#ea580c' );
					result.push(
						t( 'Tangent' ) +
							`: y ≈ (${ fmt( slope ) })(x − ${ fmt(
								at
							) }) + ${ fmt( y ) }`
					);
				}
				if ( b.normal ) {
					verticalNormal = Math.abs( slope ) < 1e-10;
					if ( ! verticalNormal ) line( -1 / slope, 'N', '#9333ea' );
					result.push(
						t( 'Normal' ) +
							( verticalNormal
								? `: x = ${ fmt( at ) }`
								: `: y ≈ (${ fmt( -1 / slope ) })(x − ${ fmt(
										at
								  ) }) + ${ fmt( y ) }` )
					);
				}
			}
		}
		if ( b.area && ( ! b.other || second ) ) {
			area = areaBetween( f, g, lo, hi );
			if ( area === null )
				warnings.push(
					t( 'The area is undefined or did not converge.' )
				);
			else
				result.push(
					t( 'Area between curves' ) +
						` [${ fmt( lo ) }, ${ fmt( hi ) }] ≈ ${ fmt( area ) }` +
						( second ? '' : ' · ' + t( 'relative to the x-axis' ) )
				);
		}
	}
	const res = renderPlot( items, {
		width: ctx.blockWidth,
		xmin: b.xmin,
		xmax: b.xmax,
		ymin: b.ymin,
		ymax: b.ymax,
		equal: b.equal,
		grid: b.grid,
		ticks: b.ticks,
		legend: false,
		ink: ctx.style.ink,
		bg: ctx.style.bg || '#ffffff',
		font: ctx.style.textFont,
		fontSize: 18 * ctx.scale,
		params,
		underlay: ( v ) => {
			let d = '';
			if ( area !== null ) {
				const from = Math.max( lo, v.xmin ),
					to = Math.min( hi, v.xmax );
				const n = Math.ceil(
					Math.max( 0, v.X( to ) - v.X( from ) ) / 6
				);
				for ( let i = 0; i <= n && n > 0; i++ ) {
					const x = from + ( ( to - from ) * i ) / n,
						a = finiteValue( f, x ),
						b = finiteValue( g, x );
					if ( ! [ a, b ].every( Number.isFinite ) ) continue;
					const lower = Math.max( v.ymin, Math.min( a, b ) ),
						upper = Math.min( v.ymax, Math.max( a, b ) );
					if ( lower < upper )
						d += `M${ r( v.X( x ) ) } ${ r( v.Y( lower ) ) }V${ r(
							v.Y( upper )
						) }`;
				}
			}
			let s = `<path d="${ d }" fill="none" stroke="#0891b2" stroke-width="1.2" opacity="0.4"/>`;
			if ( verticalNormal && at >= v.xmin && at <= v.xmax )
				s += `<path d="M${ r( v.X( at ) ) } ${ r( v.rect.y0 ) }V${ r(
					v.rect.y1
				) }" fill="none" stroke="#9333ea" stroke-width="2"/>`;
			return s;
		},
	} );
	result.push(
		t(
			'Numerical estimates in the selected interval. Very narrow features may be missed.'
		)
	);
	return resultsBelow( { ...res, warnings }, result, ctx, env );
}
function advanced( b, ctx, env ) {
	const res = renderAdvanced( b, ctx );
	return resultsBelow( res, res.readouts || [], ctx, env );
}
const common = { group: 'graphs', needsEngine: () => false, render: advanced };
export const PREMIUM_BLOCKS = {
	analysis: {
		label: 'Function analysis',
		hint: 'Roots, extrema, intersections, tangents, normals and areas.',
		note: 'Choose shared functions or enter f(x) and g(x). Results are numerical estimates in the selected interval.',
		placeholder: 'f(x) = x^2 - 2x - 3\ng(x) = x - 3',
		group: 'graphs',
		needsEngine: () => false,
		render: renderAnalysis,
	},
	implicit: {
		...common,
		label: 'Implicit curves',
		hint: 'Equations in two variables as contour curves.',
		note: 'One equation per line, for example x^2 + y^2 = 9.',
		placeholder: 'x^2 + y^2 = 9',
	},
	inequality: {
		...common,
		label: 'Inequality regions',
		hint: 'The common solution region of several inequalities.',
		note: 'One inequality per line. All conditions apply together: y >= x^2, y <= 4.',
		placeholder: 'y >= x^2\ny <= 4',
	},
	vectorfield: {
		...common,
		label: 'Vector field',
		hint: 'Direction and strength of a two-dimensional vector field.',
		note: 'Horizontal and vertical components separated by a semicolon: -y; x.',
		placeholder: '-y; x',
	},
	slopefield: {
		...common,
		label: 'Slope field',
		hint: 'Direction segments for a differential equation.',
		note: 'Enter dy/dx as a function of x and y, for example x - y.',
		placeholder: 'x - y',
	},
	contours: {
		...common,
		label: 'Contour map',
		hint: 'Level curves of a scalar field with value labels.',
		note: 'Enter a scalar expression in x and y. Set the contour levels in the options.',
		placeholder: 'x^2 + 2y^2',
	},
	complex: {
		...common,
		label: 'Complex plane',
		hint: 'Complex numbers, conjugates and roots of unity.',
		note: 'z = (2, 1), polar w 3 60, conjugate u z, or roots 5. Polar angles use degrees.',
		placeholder: 'z = (2, 1)\nconjugate w z',
	},
};
