/**
 * Procedural background patterns in a box, as plain shapes (no <pattern>
 * element: the editor's importer knows rect, circle, path, polygon, line).
 * Only shapes fully inside the box are drawn, so a piece stays clean at
 * its edges. Deterministic per seed.
 */
import { seeded } from './rng.js';
import { r } from './units.js';

const star = ( cx, cy, R, fill, rot = 0 ) => {
	const pts = [];
	for ( let i = 0; i < 10; i++ ) {
		const a = rot + ( i * Math.PI ) / 5 - Math.PI / 2;
		const rad = i % 2 ? R * 0.42 : R;
		pts.push(
			r( cx + Math.cos( a ) * rad ) + ',' + r( cy + Math.sin( a ) * rad )
		);
	}
	return `<polygon points="${ pts.join( ' ' ) }" fill="${ fill }"/>`;
};
const heart = ( cx, cy, s, fill ) =>
	`<path d="M${ r( cx ) } ${ r( cy + s * 0.5 ) }C${ r( cx - s * 0.9 ) } ${ r(
		cy - s * 0.1
	) } ${ r( cx - s * 0.6 ) } ${ r( cy - s * 0.7 ) } ${ r( cx ) } ${ r(
		cy - s * 0.25
	) }C${ r( cx + s * 0.6 ) } ${ r( cy - s * 0.7 ) } ${ r(
		cx + s * 0.9
	) } ${ r( cy - s * 0.1 ) } ${ r( cx ) } ${ r(
		cy + s * 0.5
	) }Z" fill="${ fill }"/>`;
/* A leaf rotated by rot degrees: the control points are rotated, no transform (the importer knows no rotate). */
const leaf = ( cx, cy, s, fill, rot ) => {
	const a = ( rot * Math.PI ) / 180;
	const cos = Math.cos( a );
	const sin = Math.sin( a );
	const P = ( x, y ) =>
		r( cx + x * cos - y * sin ) + ' ' + r( cy + x * sin + y * cos );
	return `<path d="M${ P( 0, s ) }C${ P( -s * 0.6, s * 0.2 ) } ${ P(
		-s * 0.4,
		-s * 0.8
	) } ${ P( 0, -s ) }C${ P( s * 0.4, -s * 0.8 ) } ${ P(
		s * 0.6,
		s * 0.2
	) } ${ P( 0, s ) }Z" fill="${ fill }"/>`;
};
/* A rotated rectangle as a polygon. */
const rotRect = ( cx, cy, w, h, deg ) => {
	const a = ( deg * Math.PI ) / 180;
	const cos = Math.cos( a );
	const sin = Math.sin( a );
	return [
		[ -w / 2, -h / 2 ],
		[ w / 2, -h / 2 ],
		[ w / 2, h / 2 ],
		[ -w / 2, h / 2 ],
	]
		.map(
			( [ x, y ] ) =>
				r( cx + x * cos - y * sin ) + ',' + r( cy + x * sin + y * cos )
		)
		.join( ' ' );
};
const egg = ( cx, cy, s, fill, stripe ) =>
	`<path d="M${ r( cx ) } ${ r( cy - s ) }C${ r( cx + s * 0.75 ) } ${ r(
		cy - s
	) } ${ r( cx + s * 0.8 ) } ${ r( cy + s * 0.9 ) } ${ r( cx ) } ${ r(
		cy + s * 0.9
	) }C${ r( cx - s * 0.8 ) } ${ r( cy + s * 0.9 ) } ${ r(
		cx - s * 0.75
	) } ${ r( cy - s ) } ${ r( cx ) } ${ r(
		cy - s
	) }Z" fill="${ fill }"/><rect x="${ r( cx - s * 0.55 ) }" y="${ r(
		cy - s * 0.1
	) }" width="${ r( s * 1.1 ) }" height="${ r(
		s * 0.22
	) }" fill="${ stripe }"/>`;
const pumpkin = ( cx, cy, s, fill, stem ) =>
	`<path d="M${ r( cx - s ) } ${ r( cy ) }C${ r( cx - s ) } ${ r(
		cy - s * 0.9
	) } ${ r( cx + s ) } ${ r( cy - s * 0.9 ) } ${ r( cx + s ) } ${ r(
		cy
	) }C${ r( cx + s ) } ${ r( cy + s * 0.9 ) } ${ r( cx - s ) } ${ r(
		cy + s * 0.9
	) } ${ r( cx - s ) } ${ r( cy ) }Z" fill="${ fill }"/><rect x="${ r(
		cx - s * 0.12
	) }" y="${ r( cy - s * 0.95 ) }" width="${ r( s * 0.24 ) }" height="${ r(
		s * 0.35
	) }" fill="${ stem }"/>`;
const bloom = ( cx, cy, s, fill, center ) => {
	let out = '';
	for ( let i = 0; i < 5; i++ ) {
		const a = ( i * 2 * Math.PI ) / 5;
		out += `<circle cx="${ r( cx + Math.cos( a ) * s * 0.55 ) }" cy="${ r(
			cy + Math.sin( a ) * s * 0.55
		) }" r="${ r( s * 0.42 ) }" fill="${ fill }"/>`;
	}
	return (
		out +
		`<circle cx="${ r( cx ) }" cy="${ r( cy ) }" r="${ r(
			s * 0.3
		) }" fill="${ center }"/>`
	);
};
const flake = ( cx, cy, s, stroke ) => {
	let out = '';
	for ( let i = 0; i < 6; i++ ) {
		const a = ( i * Math.PI ) / 3;
		const x2 = cx + Math.cos( a ) * s;
		const y2 = cy + Math.sin( a ) * s;
		out += `<line x1="${ r( cx ) }" y1="${ r( cy ) }" x2="${ r(
			x2
		) }" y2="${ r( y2 ) }" stroke="${ stroke }" stroke-width="${ r(
			s * 0.16
		) }" stroke-linecap="round"/>`;
		const bx = cx + Math.cos( a ) * s * 0.6;
		const by = cy + Math.sin( a ) * s * 0.6;
		for ( const d of [ -1, 1 ] ) {
			const b = a + ( d * Math.PI ) / 3;
			out += `<line x1="${ r( bx ) }" y1="${ r( by ) }" x2="${ r(
				bx + Math.cos( b ) * s * 0.3
			) }" y2="${ r(
				by + Math.sin( b ) * s * 0.3
			) }" stroke="${ stroke }" stroke-width="${ r(
				s * 0.14
			) }" stroke-linecap="round"/>`;
		}
	}
	return out;
};

/** Grid helper: calls draw(cx, cy, i) for every cell whose shape of radius rad lies inside the box. */
let INSIDE = null;
function grid( w, h, step, rad, draw, stagger = false ) {
	let out = '';
	let i = 0;
	for ( let y = step / 2, row = 0; y <= h - rad; y += step, row++ ) {
		const off = stagger && row % 2 ? step / 2 : 0;
		for ( let x = step / 2 + off; x <= w - rad; x += step ) {
			if (
				x - rad >= 0 &&
				y - rad >= 0 &&
				( ! INSIDE || INSIDE( x, y, rad ) )
			) {
				out += draw( x, y, i++ );
			}
		}
	}
	return out;
}

export const PATTERNS = {
	confetti( { w, h, s, c, rnd, op } ) {
		const cols = [ c.primary, c.secondary, c.accent ];
		let out = '';
		const n = Math.round( ( w * h ) / ( s * s * 22 ) );
		for ( let i = 0; i < n; i++ ) {
			const x = rnd() * w;
			const y = rnd() * h;
			const size = s * ( 0.7 + rnd() * 0.8 );
			if (
				x - size < 0 ||
				y - size < 0 ||
				x + size > w ||
				y + size > h ||
				( INSIDE && ! INSIDE( x, y, size ) )
			) {
				continue;
			}
			const fill = cols[ i % 3 ];
			if ( i % 4 === 0 ) {
				out += `<circle cx="${ r( x ) }" cy="${ r( y ) }" r="${ r(
					size * 0.45
				) }" fill="${ fill }" fill-opacity="${ op }"/>`;
			} else {
				out += `<polygon points="${ rotRect(
					x,
					y,
					size * 0.9,
					size * 0.5,
					rnd() * 180
				) }" fill="${ fill }" fill-opacity="${ op }"/>`;
			}
		}
		return out;
	},
	stripes( { w, h, s, c, op } ) {
		let out = '';
		const step = s * 2.2;
		for ( let y = 0, i = 0; y + step * 0.5 <= h; y += step, i++ ) {
			out += `<rect x="0" y="${ r( y ) }" width="${ r(
				w
			) }" height="${ r( step * 0.5 ) }" fill="${
				i % 2 ? c.secondary : c.primary
			}" fill-opacity="${ op }"/>`;
		}
		return out;
	},
	dots( { w, h, s, c, op } ) {
		return grid(
			w,
			h,
			s * 1.8,
			s * 0.35,
			( x, y ) =>
				`<circle cx="${ r( x ) }" cy="${ r( y ) }" r="${ r(
					s * 0.35
				) }" fill="${ c.primary }" fill-opacity="${ op }"/>`,
			true
		);
	},
	stars( { w, h, s, c, op } ) {
		return grid(
			w,
			h,
			s * 2.4,
			s * 0.6,
			( x, y, i ) =>
				`<g fill-opacity="${ op }">${ star(
					x,
					y,
					s * 0.6,
					i % 3 ? c.accent : c.primary
				) }</g>`,
			true
		);
	},
	hearts( { w, h, s, c, op } ) {
		return grid(
			w,
			h,
			s * 2.2,
			s * 0.6,
			( x, y, i ) =>
				`<g fill-opacity="${ op }">${ heart(
					x,
					y,
					s * 0.55,
					i % 2 ? c.primary : c.secondary
				) }</g>`,
			true
		);
	},
	check( { w, h, s, c, op } ) {
		let out = '';
		const step = s * 1.6;
		for ( let y = 0, row = 0; y + step <= h + 0.001; y += step, row++ ) {
			for (
				let x = 0, col = 0;
				x + step <= w + 0.001;
				x += step, col++
			) {
				if ( ( row + col ) % 2 ) {
					out += `<rect x="${ r( x ) }" y="${ r( y ) }" width="${ r(
						step
					) }" height="${ r( step ) }" fill="${
						c.primary
					}" fill-opacity="${ op }"/>`;
				}
			}
		}
		return out;
	},
	chevron( { w, h, s, c, op } ) {
		let out = '';
		const amp = s * 1.2;
		const period = s * 4;
		const band = s * 1.1;
		for ( let y = amp, i = 0; y + amp + band <= h; y += band * 2, i++ ) {
			let d = '';
			for ( let x = 0; x <= w + 0.001; x += period / 2 ) {
				const yy =
					y + ( Math.round( x / ( period / 2 ) ) % 2 ? -amp : amp );
				d += ( d ? 'L' : 'M' ) + r( Math.min( x, w ) ) + ' ' + r( yy );
			}
			out += `<path d="${ d }" fill="none" stroke="${
				i % 2 ? c.secondary : c.primary
			}" stroke-width="${ r(
				band
			) }" stroke-opacity="${ op }" stroke-linejoin="round"/>`;
		}
		return out;
	},
	leaves( { w, h, s, c, op } ) {
		return grid(
			w,
			h,
			s * 2.4,
			s * 0.9,
			( x, y, i ) =>
				`<g fill-opacity="${ op }">${ leaf(
					x,
					y,
					s * 0.8,
					i % 2 ? c.secondary : c.primary,
					( ( i * 37 ) % 180 ) - 90
				) }</g>`,
			true
		);
	},
	snowflakes( { w, h, s, c, op } ) {
		return grid(
			w,
			h,
			s * 2.8,
			s * 0.8,
			( x, y ) =>
				`<g stroke-opacity="${ op }">${ flake(
					x,
					y,
					s * 0.7,
					c.primary
				) }</g>`,
			true
		);
	},
	pumpkins( { w, h, s, c, op } ) {
		return grid(
			w,
			h,
			s * 2.6,
			s * 0.9,
			( x, y ) =>
				`<g fill-opacity="${ op }">${ pumpkin(
					x,
					y,
					s * 0.7,
					c.primary,
					c.secondary
				) }</g>`,
			true
		);
	},
	eggs( { w, h, s, c, op } ) {
		return grid(
			w,
			h,
			s * 2.4,
			s * 0.8,
			( x, y, i ) =>
				`<g fill-opacity="${ op }">${ egg(
					x,
					y,
					s * 0.65,
					i % 2 ? c.primary : c.secondary,
					c.accent
				) }</g>`,
			true
		);
	},
	rings( { w, h, s, c, op } ) {
		return grid(
			w,
			h,
			s * 2.2,
			s * 0.75,
			( x, y ) =>
				`<circle cx="${ r( x ) }" cy="${ r( y ) }" r="${ r(
					s * 0.6
				) }" fill="none" stroke="${ c.primary }" stroke-width="${ r(
					s * 0.16
				) }" stroke-opacity="${ op }"/>`,
			true
		);
	},
	blooms( { w, h, s, c, op } ) {
		return grid(
			w,
			h,
			s * 3,
			s * 1.1,
			( x, y, i ) =>
				`<g fill-opacity="${ op }">${ bloom(
					x,
					y,
					s * 0.9,
					i % 2 ? c.primary : c.secondary,
					c.accent
				) }</g>`,
			true
		);
	},
	waves( { w, h, s, c, op } ) {
		let out = '';
		const amp = s * 0.6;
		const period = s * 4;
		for ( let y = amp * 1.5, i = 0; y + amp <= h; y += s * 2, i++ ) {
			let d = `M0 ${ r( y ) }`;
			for ( let x = 0; x < w; x += period ) {
				const x1 = Math.min( x + period / 2, w );
				const x2 = Math.min( x + period, w );
				d += `Q${ r( x + period / 4 ) } ${ r( y - amp ) } ${ r(
					x1
				) } ${ r( y ) }Q${ r( x + ( 3 * period ) / 4 ) } ${ r(
					y + amp
				) } ${ r( x2 ) } ${ r( y ) }`;
			}
			out += `<path d="${ d }" fill="none" stroke="${
				i % 2 ? c.secondary : c.primary
			}" stroke-width="${ r( s * 0.18 ) }" stroke-opacity="${ op }"/>`;
		}
		return out;
	},
	diamonds( { w, h, s, c, op } ) {
		return grid(
			w,
			h,
			s * 2,
			s * 0.7,
			( x, y, i ) =>
				`<polygon points="${ r( x ) },${ r( y - s * 0.7 ) } ${ r(
					x + s * 0.45
				) },${ r( y ) } ${ r( x ) },${ r( y + s * 0.7 ) } ${ r(
					x - s * 0.45
				) },${ r( y ) }" fill="${
					i % 2 ? c.primary : c.secondary
				}" fill-opacity="${ op }"/>`,
			true
		);
	},
};

export const PATTERN_IDS = [ 'none', ...Object.keys( PATTERNS ) ];

/** A pattern in a w x h box (any unit); s = base size = 6 * scale in that unit. */
export function pattern( id, o ) {
	const fn = PATTERNS[ id ];
	if ( ! fn || 'none' === id ) {
		return '';
	}
	const scale = o.scale || 1;
	const unit = o.unit || 1;
	INSIDE = o.inside || null;
	const out = fn( {
		w: o.w,
		h: o.h,
		s: 6 * scale * unit,
		c: o.colors,
		rnd: seeded( o.seed || 1 ),
		op: undefined === o.opacity ? 0.35 : o.opacity,
	} );
	INSIDE = null;
	return out;
}
