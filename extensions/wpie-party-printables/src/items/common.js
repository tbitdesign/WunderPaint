/**
 * What every item shares: shapes (path plus a polygon for masks), the
 * piece background, patterns kept inside a shape, motifs, cut outlines,
 * holes and fitted labels. Everything in millimetres; the sheet renderer
 * scales pieces to px.
 */
import { r } from '../engine/units.js';
import { pattern, PATTERNS } from '../engine/patterns.js';
import { motif, MOTIFS } from '../engine/motifs.js';
import { textEl } from '../engine/svg.js';
import { fitLine, layoutText, measureOf } from '../engine/text.js';

const AREA_PATTERNS = new Set( [ 'stripes', 'check', 'chevron', 'waves' ] );

/* --------------------------------- shapes --------------------------------- */

const poly = ( pts ) =>
	'M' + pts.map( ( p ) => r( p[ 0 ] ) + ' ' + r( p[ 1 ] ) ).join( 'L' ) + 'Z';
const arcPts = ( cx, cy, rad, a0, a1, n ) => {
	const out = [];
	for ( let i = 0; i <= n; i++ ) {
		const a = a0 + ( ( a1 - a0 ) * i ) / n;
		out.push( [ cx + Math.cos( a ) * rad, cy + Math.sin( a ) * rad ] );
	}
	return out;
};

export const SHAPES = {
	rect: ( w, h, o = {} ) => {
		const rx = o.rx || 0;
		const d = rx
			? `M${ r( rx ) } 0H${ r( w - rx ) }A${ r( rx ) } ${ r(
					rx
			  ) } 0 0 1 ${ r( w ) } ${ r( rx ) }V${ r( h - rx ) }A${ r(
					rx
			  ) } ${ r( rx ) } 0 0 1 ${ r( w - rx ) } ${ r( h ) }H${ r(
					rx
			  ) }A${ r( rx ) } ${ r( rx ) } 0 0 1 0 ${ r( h - rx ) }V${ r(
					rx
			  ) }A${ r( rx ) } ${ r( rx ) } 0 0 1 ${ r( rx ) } 0Z`
			: poly( [
					[ 0, 0 ],
					[ w, 0 ],
					[ w, h ],
					[ 0, h ],
			  ] );
		return {
			d,
			pts: [
				[ 0, 0 ],
				[ w, 0 ],
				[ w, h ],
				[ 0, h ],
			],
			w,
			h,
		};
	},
	circle: ( d ) => {
		const rad = d / 2;
		return {
			d: `M0 ${ r( rad ) }A${ r( rad ) } ${ r( rad ) } 0 1 1 ${ r(
				d
			) } ${ r( rad ) }A${ r( rad ) } ${ r( rad ) } 0 1 1 0 ${ r(
				rad
			) }Z`,
			pts: arcPts( rad, rad, rad, 0, 2 * Math.PI, 48 ).slice( 0, 48 ),
			w: d,
			h: d,
		};
	},
	triangle: ( w, h ) => {
		const pts = [
			[ 0, 0 ],
			[ w, 0 ],
			[ w / 2, h ],
		];
		return { d: poly( pts ), pts, w, h };
	},
	swallowtail: ( w, h ) => {
		const pts = [
			[ 0, 0 ],
			[ w, 0 ],
			[ w, h ],
			[ w / 2, h * 0.72 ],
			[ 0, h ],
		];
		return { d: poly( pts ), pts, w, h };
	},
	flag: ( w, h ) => {
		const pts = [
			[ 0, 0 ],
			[ w, 0 ],
			[ w, h * 0.78 ],
			[ w / 2, h ],
			[ 0, h * 0.78 ],
		];
		return { d: poly( pts ), pts, w, h };
	},
	scallop: ( w, h ) => {
		// A pennant with a scalloped bottom edge.
		const n = 4;
		const seg = w / n;
		let d = `M0 0H${ r( w ) }V${ r( h * 0.7 ) }`;
		const pts = [
			[ 0, 0 ],
			[ w, 0 ],
			[ w, h * 0.7 ],
		];
		for ( let i = n; i > 0; i-- ) {
			const x = ( i - 0.5 ) * seg;
			d += `A${ r( seg / 2 ) } ${ r( seg / 2 ) } 0 0 1 ${ r(
				( i - 1 ) * seg
			) } ${ r( h * 0.7 ) }`;
			pts.push(
				...arcPts( x, h * 0.7, seg / 2, 0, Math.PI, 8 ).slice( 1 )
			);
		}
		return { d: d + 'Z', pts, w, h: h * 0.7 + seg / 2 };
	},
	tag: ( w, h ) => {
		const cut = w * 0.22;
		const pts = [
			[ cut, 0 ],
			[ w - cut, 0 ],
			[ w, cut ],
			[ w, h ],
			[ 0, h ],
			[ 0, cut ],
		];
		return { d: poly( pts ), pts, w, h };
	},
	heart: ( w, h ) => {
		const s = Math.min( w, h );
		const cx = w / 2;
		const cy = h * 0.42;
		const d = `M${ r( cx ) } ${ r( cy + s * 0.55 ) }C${ r( cx - s ) } ${ r(
			cy - s * 0.1
		) } ${ r( cx - s * 0.65 ) } ${ r( cy - s * 0.75 ) } ${ r( cx ) } ${ r(
			cy - s * 0.3
		) }C${ r( cx + s * 0.65 ) } ${ r( cy - s * 0.75 ) } ${ r(
			cx + s
		) } ${ r( cy - s * 0.1 ) } ${ r( cx ) } ${ r( cy + s * 0.55 ) }Z`;
		const pts = [];
		for ( let i = 0; i < 40; i++ ) {
			const t = ( i / 40 ) * 2 * Math.PI;
			pts.push( [
				cx + s * 0.5 * Math.pow( Math.sin( t ), 3 ),
				cy -
					s *
						0.4 *
						( 0.8125 * Math.cos( t ) -
							0.3125 * Math.cos( 2 * t ) -
							0.125 * Math.cos( 3 * t ) -
							0.0625 * Math.cos( 4 * t ) ) +
					s * 0.05,
			] );
		}
		return { d, pts, w, h };
	},
	star: ( d ) => {
		const R = d / 2;
		const pts = [];
		for ( let i = 0; i < 10; i++ ) {
			const a = ( i * Math.PI ) / 5 - Math.PI / 2;
			const rad = i % 2 ? R * 0.5 : R;
			pts.push( [ R + Math.cos( a ) * rad, R + Math.sin( a ) * rad ] );
		}
		return { d: poly( pts ), pts, w: d, h: d };
	},
	scallopCircle: ( d, n = 12 ) => {
		const R = d / 2;
		const bump = ( Math.PI * R ) / n / 2;
		const rad = R - bump;
		let out = '';
		const pts = [];
		for ( let i = 0; i < n; i++ ) {
			const a0 = ( i * 2 * Math.PI ) / n;
			const a1 = ( ( i + 1 ) * 2 * Math.PI ) / n;
			const p0 = [ R + Math.cos( a0 ) * rad, R + Math.sin( a0 ) * rad ];
			const p1 = [ R + Math.cos( a1 ) * rad, R + Math.sin( a1 ) * rad ];
			out +=
				( i ? '' : `M${ r( p0[ 0 ] ) } ${ r( p0[ 1 ] ) }` ) +
				`A${ r( bump ) } ${ r( bump ) } 0 0 1 ${ r( p1[ 0 ] ) } ${ r(
					p1[ 1 ]
				) }`;
			pts.push(
				...arcPts(
					( p0[ 0 ] + p1[ 0 ] ) / 2,
					( p0[ 1 ] + p1[ 1 ] ) / 2,
					bump,
					a0 + Math.PI / n - Math.PI / 2,
					a0 + Math.PI / n + Math.PI / 2,
					6
				)
			);
		}
		return { d: out + 'Z', pts, w: d, h: d };
	},
	oval: ( w, h ) => {
		const rx = w / 2;
		const ry = h / 2;
		const pts = [];
		for ( let i = 0; i < 48; i++ ) {
			const a = ( i / 48 ) * 2 * Math.PI;
			pts.push( [ rx + Math.cos( a ) * rx, ry + Math.sin( a ) * ry ] );
		}
		return {
			d: `M0 ${ r( ry ) }A${ r( rx ) } ${ r( ry ) } 0 1 1 ${ r(
				w
			) } ${ r( ry ) }A${ r( rx ) } ${ r( ry ) } 0 1 1 0 ${ r( ry ) }Z`,
			pts,
			w,
			h,
		};
	},
	hexagon: ( d ) => {
		const R = d / 2;
		const pts = [];
		for ( let i = 0; i < 6; i++ ) {
			const a = ( i * Math.PI ) / 3;
			pts.push( [ R + Math.cos( a ) * R, R + Math.sin( a ) * R ] );
		}
		return { d: poly( pts ), pts, w: d, h: d };
	},
	sector: ( R, sweep ) => {
		// A cone net: apex at the top centre, arc below; sweep in radians.
		const a0 = Math.PI / 2 - sweep / 2;
		const a1 = Math.PI / 2 + sweep / 2;
		const w = 2 * R * Math.sin( sweep / 2 );
		const cx = w / 2;
		const p0 = [ cx + Math.cos( a0 ) * R, Math.sin( a0 ) * R ];
		const p1 = [ cx + Math.cos( a1 ) * R, Math.sin( a1 ) * R ];
		const d = `M${ r( cx ) } 0L${ r( p0[ 0 ] ) } ${ r( p0[ 1 ] ) }A${ r(
			R
		) } ${ r( R ) } 0 ${ sweep > Math.PI ? 1 : 0 } 1 ${ r( p1[ 0 ] ) } ${ r(
			p1[ 1 ]
		) }Z`;
		const pts = [ [ cx, 0 ], ...arcPts( cx, 0, R, a0, a1, 24 ) ];
		return { d, pts, w, h: R };
	},
	band: ( R1, R2, sweep ) => {
		// An arc band (cupcake wrapper): the wide outer arc on top, the inner arc below, centre under the piece.
		const a0 = -Math.PI / 2 - sweep / 2;
		const a1 = -Math.PI / 2 + sweep / 2;
		const w = 2 * R1 * Math.sin( sweep / 2 );
		const cx = w / 2;
		const cy = R1;
		const o0 = [ cx + Math.cos( a0 ) * R1, cy + Math.sin( a0 ) * R1 ];
		const o1 = [ cx + Math.cos( a1 ) * R1, cy + Math.sin( a1 ) * R1 ];
		const i0 = [ cx + Math.cos( a0 ) * R2, cy + Math.sin( a0 ) * R2 ];
		const i1 = [ cx + Math.cos( a1 ) * R2, cy + Math.sin( a1 ) * R2 ];
		const d = `M${ r( o0[ 0 ] ) } ${ r( o0[ 1 ] ) }A${ r( R1 ) } ${ r(
			R1
		) } 0 0 1 ${ r( o1[ 0 ] ) } ${ r( o1[ 1 ] ) }L${ r( i1[ 0 ] ) } ${ r(
			i1[ 1 ]
		) }A${ r( R2 ) } ${ r( R2 ) } 0 0 0 ${ r( i0[ 0 ] ) } ${ r(
			i0[ 1 ]
		) }Z`;
		const inner = `M${ r( i0[ 0 ] ) } ${ r( i0[ 1 ] ) }L${ r(
			o0[ 0 ]
		) } ${ r( o0[ 1 ] ) }M${ r( o1[ 0 ] ) } ${ r( o1[ 1 ] ) }L${ r(
			i1[ 0 ]
		) } ${ r( i1[ 1 ] ) }A${ r( R2 ) } ${ r( R2 ) } 0 0 0 ${ r(
			i0[ 0 ]
		) } ${ r( i0[ 1 ] ) }`;
		const pts = [
			...arcPts( cx, cy, R1, a0, a1, 24 ),
			...arcPts( cx, cy, R2, a1, a0, 24 ),
		];
		return {
			d,
			pts,
			w,
			h: R1 - R2 * Math.cos( sweep / 2 ),
			cx,
			cy,
			a0,
			a1,
			innerAndSides: inner,
		};
	},
};

/* ------------------------------ point in shape ---------------------------- */

const insidePoly = ( pts, x, y ) => {
	let inside = false;
	for ( let i = 0, j = pts.length - 1; i < pts.length; j = i++ ) {
		const [ xi, yi ] = pts[ i ];
		const [ xj, yj ] = pts[ j ];
		if (
			yi > y !== yj > y &&
			x < ( ( xj - xi ) * ( y - yi ) ) / ( yj - yi ) + xi
		) {
			inside = ! inside;
		}
	}
	return inside;
};
/** A disc of radius rad around (x, y) lies inside the polygon: centre and four compass points. */
export const insideShape = ( shape, x, y, rad ) =>
	[
		[ x, y ],
		[ x - rad, y ],
		[ x + rad, y ],
		[ x, y - rad ],
		[ x, y + rad ],
	].every( ( p ) => insidePoly( shape.pts, p[ 0 ], p[ 1 ] ) );

const signedArea = ( pts ) =>
	pts.reduce(
		( s, p, i ) =>
			s +
			p[ 0 ] * pts[ ( i + 1 ) % pts.length ][ 1 ] -
			pts[ ( i + 1 ) % pts.length ][ 0 ] * p[ 1 ],
		0
	) / 2;

/** A ring (bounding box minus the shape) in the sheet colour: masks area patterns without clipPath. */
export function maskOutside( shape, fill ) {
	const pts =
		signedArea( shape.pts ) > 0 ? [ ...shape.pts ].reverse() : shape.pts;
	const b = { x0: -0.5, y0: -0.5, x1: shape.w + 0.5, y1: shape.h + 0.5 };
	const outer = `M${ b.x0 } ${ b.y0 }H${ r( b.x1 ) }V${ r( b.y1 ) }H${
		b.x0
	}Z`;
	return `<path d="${ outer }${ poly(
		pts
	) }" fill="${ fill }" fill-rule="evenodd"/>`;
}

/* ------------------------------- piece parts ------------------------------ */

export const bg = ( shape, fill ) =>
	`<path d="${ shape.d }" fill="${ fill }"/>`;
export const outline = ( shape, ink, width = 0.3 ) =>
	`<path d="${ shape.d }" fill="none" stroke="${ ink }" stroke-width="${ width }"/>`;
export const hole = ( x, y, rad, ink ) =>
	`<circle cx="${ r( x ) }" cy="${ r( y ) }" r="${ r(
		rad
	) }" fill="#ffffff" stroke="${ ink }" stroke-width="0.25"/>`;

/** The theme pattern inside a shape: discrete patterns are culled per shape, area patterns masked. */
export function patternIn( shape, theme, o = {} ) {
	const id = o.id || theme.pattern.id;
	if ( ! id || 'none' === id || ! PATTERNS[ id ] ) {
		return '';
	}
	const colors = theme.colors;
	const opts = {
		w: shape.w,
		h: shape.h,
		colors,
		seed: o.seed || 1,
		scale: ( theme.pattern.scale || 1 ) * ( o.scale || 1 ),
		opacity: undefined === o.opacity ? theme.pattern.opacity : o.opacity,
		unit: 1,
	};
	if ( AREA_PATTERNS.has( id ) ) {
		const isRect =
			4 === shape.pts.length &&
			shape.pts.every(
				( p, i ) =>
					0 === i ||
					p[ 0 ] === shape.pts[ 0 ][ 0 ] ||
					p[ 1 ] === shape.pts[ 0 ][ 1 ] ||
					p[ 0 ] === shape.pts[ 2 ][ 0 ] ||
					p[ 1 ] === shape.pts[ 2 ][ 1 ]
			);
		return (
			pattern( id, opts ) +
			( isRect ? '' : maskOutside( shape, o.sheetBg || '#ffffff' ) )
		);
	}
	return pattern( id, {
		...opts,
		inside: ( x, y, rad ) => insideShape( shape, x, y, rad ),
	} );
}

/** Colours for a motif drawn ON a fill: every role equal to that fill takes the next role that differs. */
export function colorsOn( colors, fill ) {
	if ( ! fill ) {
		return colors;
	}
	const f = String( fill ).toLowerCase();
	const order = [ 'secondary', 'accent', 'primary', 'ink', 'bg' ];
	const out = { ...colors };
	for ( const role of Object.keys( colors ) ) {
		if ( String( colors[ role ] ).toLowerCase() === f ) {
			out[ role ] =
				colors[
					order.find(
						( k ) => String( colors[ k ] ).toLowerCase() !== f
					)
				] || colors.ink;
		}
	}
	return out;
}

export const motifAt = ( id, x, y, size, theme, extra = {} ) => {
	const { on, ...rest } = extra;
	return motif( id, {
		x,
		y,
		size,
		colors: colorsOn( theme.colors, on ),
		...rest,
	} );
};

/** One or more lines fitted into a box; lines share the smallest size so a word never dwarfs its neighbour. */
export function label( text, box, o, env ) {
	let lines = String( text || '' )
		.split( '\n' )
		.map( ( s ) => s.trim() )
		.filter( Boolean );
	if ( ! lines.length ) {
		return '';
	}
	const font = o.font || 'Arial';
	const weight = o.weight || 700;
	const lineH = 1.15;
	const maxSize = o.maxSize || 40;
	const fitAll = ( list ) => {
		const perLine = box.h / ( list.length * lineH );
		let size = Math.min( maxSize, perLine );
		for ( const ln of list ) {
			size = Math.min(
				size,
				fitLine(
					ln,
					{
						w: box.w,
						h: perLine * lineH,
						font,
						weight,
						maxSize: size,
						minSize: o.minSize || 3,
					},
					env
				).size
			);
		}
		return size;
	};
	let size = fitAll( lines );
	// One long line that had to shrink a lot reads better as two balanced lines.
	if (
		false !== o.wrap &&
		1 === lines.length &&
		/\s/.test( lines[ 0 ] ) &&
		size < maxSize * 0.55
	) {
		const words = lines[ 0 ].split( /\s+/ );
		let best = null;
		for ( let k = 1; k < words.length; k++ ) {
			const a = words.slice( 0, k ).join( ' ' );
			const b = words.slice( k ).join( ' ' );
			const diff = Math.abs( a.length - b.length );
			if ( ! best || diff < best.diff ) {
				best = { diff, lines: [ a, b ] };
			}
		}
		if ( best ) {
			const two = fitAll( best.lines );
			if ( two > size * 1.15 ) {
				lines = best.lines;
				size = two;
			}
		}
	}
	const total = lines.length * size * lineH;
	const y0 = box.y + ( box.h - total ) / 2 + size * 0.95;
	const anchor = o.align || 'middle';
	const x =
		'start' === anchor
			? box.x
			: 'end' === anchor
			? box.x + box.w
			: box.x + box.w / 2;
	const shadow = o.shadow
		? `<g opacity="0.45">${ lines
				.map( ( ln, i ) =>
					textEl(
						x + size * 0.04,
						y0 + i * size * lineH + size * 0.04,
						ln,
						{
							size: r( size ),
							font,
							fill: '#000000',
							weight,
							anchor,
						}
					)
				)
				.join( '' ) }</g>`
		: '';
	return (
		shadow +
		lines
			.map( ( ln, i ) =>
				textEl( x, y0 + i * size * lineH, ln, {
					size: r( size ),
					font,
					fill: o.color || '#000',
					weight,
					anchor,
					italic: o.italic,
				} )
			)
			.join( '' )
	);
}

/**
 * Words wrapped into as many lines as the box allows, at the largest size
 * that fits (bingo words, list cells). Returns { size, lines }; draw the
 * lines with label( lines.join( '\n' ), box, { maxSize: size, wrap: false } ).
 */
export function fitWrap( text, box, o, env ) {
	const words = String( text || '' )
		.split( /\s+/ )
		.filter( Boolean );
	if ( ! words.length ) {
		return { size: 0, lines: [] };
	}
	const font = o.font || 'Arial';
	const weight = o.weight || 700;
	const lineH = o.lineH || 1.15;
	const maxLines = o.maxLines || 4;
	const minSize = o.minSize || 1.5;
	const width = ( str, size ) =>
		measureOf( env, size, font, weight, o.italic )( str );
	const wrapAt = ( size ) => {
		const lines = [];
		let cur = '';
		for ( const w of words ) {
			const cand = cur ? cur + ' ' + w : w;
			if ( ! cur || width( cand, size ) <= box.w ) {
				cur = cand;
			} else {
				lines.push( cur );
				cur = w;
			}
		}
		lines.push( cur );
		return lines;
	};
	const fits = ( lines, size ) =>
		lines.length <= maxLines &&
		lines.length * size * lineH <= box.h &&
		lines.every( ( ln ) => width( ln, size ) <= box.w );
	let size = o.maxSize || 6;
	let lines = wrapAt( size );
	while ( size > minSize && ! fits( lines, size ) ) {
		size -= Math.max( 0.2, size * 0.06 );
		lines = wrapAt( size );
	}
	return { size: r( size ), lines };
}

/** A paragraph in a box (wrapping), for lines of text on labels and cards. */
export function paragraph( text, box, o, env ) {
	const res = layoutText(
		text,
		{
			width: box.w,
			size: o.size || 4,
			font: o.font || 'Arial',
			color: o.color || '#000',
			weight: o.weight || 400,
			align: o.align || 'center',
			lineHeight: 1.3,
		},
		env
	);
	const y = box.y + Math.max( 0, ( box.h - res.h ) / 2 );
	return `<g transform="translate(${ r( box.x ) } ${ r( y ) })">${
		res.inner
	}</g>`;
}

export const image = ( href, x, y, w, h ) =>
	`<image href="${ href }" x="${ r( x ) }" y="${ r( y ) }" width="${ r(
		w
	) }" height="${ r( h ) }" preserveAspectRatio="xMidYMid slice"/>`;

/* ------------------------------ card helpers ------------------------------ */

/** Paper, an optional pattern band along one edge, a hairline outline. */
export function cardFrame( shape, theme, o = {} ) {
	const parts = [ bg( shape, theme.colors.bg ) ];
	const band = o.band || 'none';
	if ( 'none' !== band ) {
		const size = o.bandSize || Math.min( shape.w, shape.h ) * 0.18;
		const horizontal = 'top' === band || 'bottom' === band;
		const bw = horizontal ? shape.w : size;
		const bh = horizontal ? size : shape.h;
		const bx = 'right' === band ? shape.w - size : 0;
		const by = 'bottom' === band ? shape.h - size : 0;
		const bandShape = SHAPES.rect( bw, bh );
		parts.push(
			`<g transform="translate(${ r( bx ) } ${ r( by ) })"><path d="${
				bandShape.d
			}" fill="${ o.bandFill || theme.colors.primary }"/>${ patternIn(
				bandShape,
				theme,
				{
					seed: o.seed || 3,
					opacity: undefined === o.bandOpacity ? 0.3 : o.bandOpacity,
					scale: o.bandScale || 0.6,
				}
			) }</g>`
		);
	}
	if ( o.inset ) {
		const i = o.inset;
		parts.push(
			`<rect x="${ r( i ) }" y="${ r( i ) }" width="${ r(
				shape.w - 2 * i
			) }" height="${ r( shape.h - 2 * i ) }" fill="none" stroke="${
				o.insetColor || theme.colors.accent
			}" stroke-width="0.35"/>`
		);
	}
	return parts.join( '' );
}

const ROLES = {
	title: { unit: 1, font: 'displayFont', weight: 700 },
	subtitle: { unit: 0.5, font: 'textFont', weight: 400, italic: true },
	line: { unit: 0.42, font: 'textFont', weight: 400 },
	strong: { unit: 0.55, font: 'textFont', weight: 700 },
	small: { unit: 0.3, font: 'textFont', weight: 400 },
	gap: { unit: 0.25 },
};

/**
 * A stack of lines with roles (title, subtitle, line, strong, small, gap)
 * fitted into a box: one base size for all, every line shrunk to its width.
 */
export function textStack( lines, box, o, env ) {
	const theme = o.theme;
	const list = ( lines || [] ).filter(
		( l ) => l && ( 'gap' === l.role || String( l.text || '' ).trim() )
	);
	if ( ! list.length ) {
		return { inner: '', h: 0 };
	}
	const lh = 1.2;
	const units = list.reduce(
		( s, l ) => s + ( ROLES[ l.role ] || ROLES.line ).unit * lh,
		0
	);
	const base = Math.min( o.maxSize || box.h * 0.4, box.h / units );
	const sized = list.map( ( l ) => {
		const role = ROLES[ l.role ] || ROLES.line;
		let size = base * role.unit;
		if ( 'gap' !== l.role ) {
			const font = l.font || theme[ role.font ] || 'Arial';
			size = fitLine(
				String( l.text ),
				{
					w: box.w,
					h: size * lh,
					font,
					weight: role.weight,
					maxSize: size,
					minSize: 2,
				},
				env
			).size;
			return {
				...l,
				size,
				font,
				weight: role.weight,
				italic: !! role.italic,
				color:
					l.color ||
					( 'subtitle' === l.role
						? theme.colors.accent
						: theme.colors.ink ),
			};
		}
		return { ...l, size };
	} );
	const total = sized.reduce( ( s, l ) => s + l.size * lh, 0 );
	let y = box.y + ( o.top ? 0 : Math.max( 0, ( box.h - total ) / 2 ) );
	const anchor = o.align || 'middle';
	const x =
		'start' === anchor
			? box.x
			: 'end' === anchor
			? box.x + box.w
			: box.x + box.w / 2;
	const out = [];
	for ( const l of sized ) {
		if ( 'gap' !== l.role ) {
			out.push(
				textEl( x, y + l.size * 0.95, String( l.text ), {
					size: r( l.size ),
					font: l.font,
					fill: l.color,
					weight: l.weight,
					anchor,
					italic: l.italic,
				} )
			);
		}
		y += l.size * lh;
	}
	return { inner: out.join( '' ), h: total };
}

/** An arrow from (x1,y1) to (x2,y2): a line plus a filled head. */
export function arrow( x1, y1, x2, y2, o = {} ) {
	const w = o.width || 0.8;
	const color = o.color || '#000';
	const dx = x2 - x1;
	const dy = y2 - y1;
	const len = Math.hypot( dx, dy ) || 1;
	const ux = dx / len;
	const uy = dy / len;
	const head = o.head || w * 4;
	const bx = x2 - ux * head;
	const by = y2 - uy * head;
	const px = -uy * head * 0.5;
	const py = ux * head * 0.5;
	const dash = o.dashed
		? ` stroke-dasharray="${ r( w * 3 ) } ${ r( w * 2 ) }"`
		: '';
	return `<line x1="${ r( x1 ) }" y1="${ r( y1 ) }" x2="${ r(
		bx
	) }" y2="${ r( by ) }" stroke="${ color }" stroke-width="${ r(
		w
	) }" stroke-linecap="round"${ dash }/><path d="M${ r( x2 ) } ${ r(
		y2
	) }L${ r( bx + px ) } ${ r( by + py ) }L${ r( bx - px ) } ${ r(
		by - py
	) }Z" fill="${ color }"/>`;
}

/** A dashed tear or fold line. */
export const dashed = ( x1, y1, x2, y2, ink, width = 0.25 ) =>
	`<line x1="${ r( x1 ) }" y1="${ r( y1 ) }" x2="${ r( x2 ) }" y2="${ r(
		y2
	) }" stroke="${ ink }" stroke-width="${ width }" stroke-dasharray="2 1.5" stroke-opacity="0.7"/>`;
/** A line to write on. */
export const writeLine = ( x, y, w, ink ) =>
	`<line x1="${ r( x ) }" y1="${ r( y ) }" x2="${ r( x + w ) }" y2="${ r(
		y
	) }" stroke="${ ink }" stroke-width="0.25" stroke-opacity="0.6"/>`;
/** A box to tick. */
export const checkbox = ( x, y, s, ink ) =>
	`<rect x="${ r( x ) }" y="${ r( y ) }" width="${ r( s ) }" height="${ r(
		s
	) }" fill="none" stroke="${ ink }" stroke-width="0.3"/>`;
/** Zero-padded serial numbers. */
export const serial = ( n, width = 3 ) =>
	String( Math.max( 0, Math.round( n ) ) ).padStart( width, '0' );

/* Card suits and chess pieces, path data in a 100 x 100 box. */
export const SUITS = {
	heart: 'M50 92C50 92 6 62 6 34C6 20 17 10 29 10C38 10 46 16 50 24C54 16 62 10 71 10C83 10 94 20 94 34C94 62 50 92 50 92Z',
	diamond: 'M50 4L94 50L50 96L6 50Z',
	club: 'M50 6a18 18 0 1 1-0.1 0ZM22 40a18 18 0 1 1-0.1 0ZM78 40a18 18 0 1 1-0.1 0ZM46 52H54L60 94H40Z',
	spade: 'M50 4C50 4 8 40 8 62C8 78 26 84 40 74C36 84 32 92 28 96H72C68 92 64 84 60 74C74 84 92 78 92 62C92 40 50 4 50 4Z',
};
export const SUIT_IDS = [ 'spade', 'heart', 'diamond', 'club' ];
export const CHESS = {
	k: 'M46 4H54V12H62V20H54V30H46V20H38V12H46ZM30 32H70L64 70H36ZM26 72H74V92H26Z',
	q: 'M50 4a6 6 0 1 1-0.1 0ZM14 26a6 6 0 1 1-0.1 0ZM86 26a6 6 0 1 1-0.1 0ZM28 14a6 6 0 1 1-0.1 0ZM72 14a6 6 0 1 1-0.1 0ZM18 34L30 20L44 44L50 12L56 44L70 20L82 34L72 70H28ZM24 74H76V92H24Z',
	r: 'M22 12H34V22H44V12H56V22H66V12H78V30L70 38V72L78 80V92H22V80L30 72V38L22 30Z',
	b: 'M50 4a6 6 0 1 1-0.1 0ZM50 14C68 30 72 50 58 64H42C28 50 32 30 50 14ZM40 66H60L64 78H36ZM24 82H76V92H24Z',
	n: 'M30 92H80V80L70 72C82 60 84 40 70 26L66 10L58 16L52 8L46 22C34 30 26 44 24 58L36 54L32 66L40 62L30 80Z',
	p: 'M50 12a13 13 0 1 1-0.1 0ZM38 40H62L58 52L66 78H34L42 52ZM24 80H76V92H24Z',
};

/** A path from a 100 x 100 box placed at x, y with a size. */
export const glyph = ( d, x, y, size, fill, stroke ) =>
	`<path d="${ d }" transform="translate(${ r( x ) } ${ r( y ) }) scale(${ r(
		size / 100
	) })" fill="${ fill }"${
		stroke
			? ` stroke="${ stroke }" stroke-width="${ r( 400 / size / 100 ) }"`
			: ''
	}/>`;

/** The motif as an outline for colouring: every path stroked in ink, the paper parts white. */
export function outlineMotif( id, x, y, size, ink, width = 0.5 ) {
	const paths = MOTIFS[ id ];
	if ( ! paths ) {
		return '';
	}
	const k = size / 100;
	return `<g transform="translate(${ r( x ) } ${ r( y ) }) scale(${ r(
		k
	) })">${ paths
		.map(
			( p ) =>
				`<path d="${ p.d }" fill="${
					'bg' === p.role ? '#ffffff' : 'none'
				}" stroke="${ ink }" stroke-width="${ r(
					width / k
				) }" stroke-linejoin="round" stroke-linecap="round"/>`
		)
		.join( '' ) }</g>`;
}

/** Dice pips: the unit positions of n pips (1..6) in a square. */
export const PIPS = {
	1: [ [ 0.5, 0.5 ] ],
	2: [
		[ 0.27, 0.27 ],
		[ 0.73, 0.73 ],
	],
	3: [
		[ 0.25, 0.25 ],
		[ 0.5, 0.5 ],
		[ 0.75, 0.75 ],
	],
	4: [
		[ 0.27, 0.27 ],
		[ 0.73, 0.27 ],
		[ 0.27, 0.73 ],
		[ 0.73, 0.73 ],
	],
	5: [
		[ 0.25, 0.25 ],
		[ 0.75, 0.25 ],
		[ 0.5, 0.5 ],
		[ 0.25, 0.75 ],
		[ 0.75, 0.75 ],
	],
	6: [
		[ 0.28, 0.22 ],
		[ 0.72, 0.22 ],
		[ 0.28, 0.5 ],
		[ 0.72, 0.5 ],
		[ 0.28, 0.78 ],
		[ 0.72, 0.78 ],
	],
};
