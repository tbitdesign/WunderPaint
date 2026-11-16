/**
 * Real thread, bead and yarn colors for the legend (v2.9).
 *
 * A chart that says "#7a3b52" leaves the stitcher guessing in the shop.
 * Every palette color is matched to the nearest color of a real range -
 * DMC floss for cross-stitch and diamond painting, Hama or Perler for fuse
 * beads, Red Heart for yarn - by CIEDE2000, the color difference the eye
 * sees. Two palette colors that land on the same skein become one, so the
 * legend never lists a thread twice and the chart is stitched with what
 * can actually be bought.
 *
 * Pure: no DOM; tested in node.
 */

import { YARN_DATA } from './yarns.js';

export const YARN_SETS = [
	{ id: 'dmc', label: 'DMC floss', short: 'DMC' },
	{ id: 'hama', label: 'Hama beads', short: 'Hama' },
	{ id: 'perler', label: 'Perler beads', short: 'Perler' },
	{ id: 'redheart', label: 'Red Heart yarn', short: 'Red Heart' },
	{ id: 'delica', label: 'Miyuki Delica beads', short: 'Delica' },
];

/** The range a craft names its colors in by default ('auto'). */
export function yarnFor( mode, choice = 'auto' ) {
	// '' is an answer: colours from the image, no numbers.
	if ( 'auto' !== choice ) {
		return YARN_DATA[ choice ] ? choice : '';
	}
	// Floss is what cross-stitch, drills, string art, blackwork and
	// friendship bracelets are made with.
	if ( [ 'crossstitch', 'diamond', 'stringart', 'blackwork', 'bracelet' ].includes( mode ) ) {
		return 'dmc';
	}
	if ( 'beads' === mode ) {
		return 'hama';
	}
	if ( 'beadweave' === mode ) {
		return 'delica';
	}
	return '';
}

/* ---------------------------- color difference --------------------------- */

const lin = ( c ) => {
	const v = c / 255;
	return v <= 0.04045 ? v / 12.92 : Math.pow( ( v + 0.055 ) / 1.055, 2.4 );
};

/** sRGB [0..255] to CIE Lab (D65). */
export function toLab( rgb ) {
	const r = lin( rgb[ 0 ] );
	const g = lin( rgb[ 1 ] );
	const b = lin( rgb[ 2 ] );
	const f = ( t ) => ( t > 0.008856 ? Math.cbrt( t ) : 7.787 * t + 16 / 116 );
	const x = f( ( r * 0.4124 + g * 0.3576 + b * 0.1805 ) / 0.95047 );
	const y = f( r * 0.2126 + g * 0.7152 + b * 0.0722 );
	const z = f( ( r * 0.0193 + g * 0.1192 + b * 0.9505 ) / 1.08883 );
	return [ 116 * y - 16, 500 * ( x - y ), 200 * ( y - z ) ];
}

const rad = ( d ) => ( d * Math.PI ) / 180;
const deg = ( r ) => ( r * 180 ) / Math.PI;

/** CIEDE2000 between two Lab colors. */
export function deltaE( a, b ) {
	const [ L1, a1, b1 ] = a;
	const [ L2, a2, b2 ] = b;
	const C1 = Math.hypot( a1, b1 );
	const C2 = Math.hypot( a2, b2 );
	const Cm = ( C1 + C2 ) / 2;
	const G = 0.5 * ( 1 - Math.sqrt( Cm ** 7 / ( Cm ** 7 + 25 ** 7 ) ) );
	const a1p = a1 * ( 1 + G );
	const a2p = a2 * ( 1 + G );
	const C1p = Math.hypot( a1p, b1 );
	const C2p = Math.hypot( a2p, b2 );
	const h = ( x, y ) => {
		const v = deg( Math.atan2( y, x ) );
		return v < 0 ? v + 360 : v;
	};
	const h1 = C1p ? h( a1p, b1 ) : 0;
	const h2 = C2p ? h( a2p, b2 ) : 0;
	const dL = L2 - L1;
	const dC = C2p - C1p;
	let dh = 0;
	if ( C1p * C2p ) {
		dh = h2 - h1;
		if ( dh > 180 ) {
			dh -= 360;
		} else if ( dh < -180 ) {
			dh += 360;
		}
	}
	const dH = 2 * Math.sqrt( C1p * C2p ) * Math.sin( rad( dh / 2 ) );
	const Lm = ( L1 + L2 ) / 2;
	const Cmp = ( C1p + C2p ) / 2;
	let hm = h1 + h2;
	if ( C1p * C2p ) {
		if ( Math.abs( h1 - h2 ) > 180 ) {
			hm += h1 + h2 < 360 ? 360 : -360;
		}
		hm /= 2;
	}
	const T =
		1 -
		0.17 * Math.cos( rad( hm - 30 ) ) +
		0.24 * Math.cos( rad( 2 * hm ) ) +
		0.32 * Math.cos( rad( 3 * hm + 6 ) ) -
		0.2 * Math.cos( rad( 4 * hm - 63 ) );
	const dTheta = 30 * Math.exp( -( ( ( hm - 275 ) / 25 ) ** 2 ) );
	const Rc = 2 * Math.sqrt( Cmp ** 7 / ( Cmp ** 7 + 25 ** 7 ) );
	const Sl = 1 + ( 0.015 * ( Lm - 50 ) ** 2 ) / Math.sqrt( 20 + ( Lm - 50 ) ** 2 );
	const Sc = 1 + 0.045 * Cmp;
	const Sh = 1 + 0.015 * Cmp * T;
	const Rt = -Math.sin( rad( 2 * dTheta ) ) * Rc;
	return Math.sqrt(
		( dL / Sl ) ** 2 +
			( dC / Sc ) ** 2 +
			( dH / Sh ) ** 2 +
			Rt * ( dC / Sc ) * ( dH / Sh )
	);
}

const labCache = new Map();
function rangeLab( id ) {
	if ( ! labCache.has( id ) ) {
		labCache.set(
			id,
			( YARN_DATA[ id ]?.colors || [] ).map( ( c ) => toLab( [ c[ 2 ], c[ 3 ], c[ 4 ] ] ) )
		);
	}
	return labCache.get( id );
}

/**
 * The nearest color of a range.
 *
 * @param {number[]} rgb Color.
 * @param {string}   id  Range id.
 * @return {{ code, name, rgb, de }|null}
 */
export function nearestYarn( rgb, id ) {
	const range = YARN_DATA[ id ];
	if ( ! range ) {
		return null;
	}
	const labs = rangeLab( id );
	const lab = toLab( rgb );
	let best = -1;
	let bestD = Infinity;
	for ( let i = 0; i < labs.length; i++ ) {
		const d = deltaE( lab, labs[ i ] );
		if ( d < bestD ) {
			bestD = d;
			best = i;
		}
	}
	const c = range.colors[ best ];
	return { code: c[ 0 ], name: c[ 1 ], rgb: [ c[ 2 ], c[ 3 ], c[ 4 ] ], de: bestD };
}

/**
 * Snap a palette to a range: every color becomes its nearest real one,
 * and colors that meet on the same number merge.
 *
 * @param {Array}  palette [ [r,g,b], ... ].
 * @param {string} id      Range id ('' = leave as it is).
 * @return {{ palette, codes, remap }} codes: [{ brand, code, name }] per
 *         new entry; remap: old index -> new index.
 */
export function snapPalette( palette, id ) {
	if ( ! YARN_DATA[ id ] ) {
		return { palette, codes: null, remap: palette.map( ( _, i ) => i ) };
	}
	const out = [];
	const codes = [];
	const seen = new Map();
	const remap = [];
	for ( const p of palette ) {
		const y = nearestYarn( p, id );
		if ( ! seen.has( y.code ) ) {
			seen.set( y.code, out.length );
			out.push( y.rgb );
			codes.push( { brand: YARN_DATA[ id ].brand, code: y.code, name: y.name } );
		}
		remap.push( seen.get( y.code ) );
	}
	return { palette: out, codes, remap };
}

/** "DMC 310 Black" */
export const yarnLabel = ( c ) => ( c ? `${ c.brand } ${ c.code } ${ c.name }` : '' );
