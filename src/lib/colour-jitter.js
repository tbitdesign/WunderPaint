/**
 * Colour jitter: every mark a shade of its own.
 *
 * Real media never lay the same colour down twice. A loaded brush carries
 * pigment that is not perfectly mixed, chalk picks up what it crosses, and
 * a handful of petals is never one green. One flat colour repeated a
 * thousand times is the single thing that reads as "computer" no matter
 * how good the tip is.
 *
 * THE ONE THING THIS FILE EXISTS FOR IS THE QUANTISATION, and it is not a
 * detail. A drawn tip is stamped from a mask that is cached per colour, so
 * a genuinely fresh colour on every mark would mint a fresh canvas on
 * every mark - a thousand canvases for one stroke. Snapping to a grid
 * bounds that: a stroke uses a few dozen shades, not a thousand, and no
 * eye has ever told those apart on a brush mark.
 *
 * The dice are the caller's, so the same mark rolls the same shade on
 * every re-render. Without that, a stroke layer would look different every
 * time the document was reopened.
 */

/**
 * Grid the jittered colour snaps to.
 *
 * Measured, not chosen by feel: at 36/16/16 a stroke with moderate jitter
 * asked for 395 distinct shades, and a drawn tip caches one canvas per
 * shade. At 16/8/8 the same settings ask for about sixty, which the cache
 * holds comfortably. Nobody has ever told two brush marks apart across
 * one sixteenth of the hue circle.
 */
const HUE_STEPS = 16;
const SAT_STEPS = 8;
const LIT_STEPS = 8;

/**
 * What "Jitter" means before anybody has moved a slider.
 *
 * NOT ZEROES, and for the same reason the gradient does not start empty:
 * a mode you pick and that then does nothing reads as broken. All three
 * amounts started at 0, so choosing Jitter painted a perfectly flat line
 * until you found the sliders underneath it.
 *
 * Weighted towards hue because that is what the eye reads as "not printed
 * by a machine". The grid above is 16 hue steps, so 0.12 either way covers
 * about four of them - plainly a scatter, still plainly the colour you
 * picked. Saturation and brightness ride along at half that; more turns a
 * stroke chalky before it turns it lively.
 */
export const DEFAULT_JITTER = Object.freeze( {
	hueJitter: 0.12,
	satJitter: 0.1,
	litJitter: 0.1,
} );

const clamp01 = ( v ) => ( v < 0 ? 0 : v > 1 ? 1 : v );
const snap = ( v, steps ) => Math.round( v * steps ) / steps;

/**
 * @param {string} hex A #rrggbb colour.
 * @return {Array} [ h, s, l ], each 0..1.
 */
export function hexToHsl( hex ) {
	const ok = /^#[0-9a-f]{6}$/i.test( hex || '' );
	const s = ok ? hex : '#000000';
	const r = parseInt( s.slice( 1, 3 ), 16 ) / 255;
	const g = parseInt( s.slice( 3, 5 ), 16 ) / 255;
	const b = parseInt( s.slice( 5, 7 ), 16 ) / 255;
	const max = Math.max( r, g, b );
	const min = Math.min( r, g, b );
	const l = ( max + min ) / 2;
	const d = max - min;
	if ( ! d ) {
		return [ 0, 0, l ];
	}
	const sat = l > 0.5 ? d / ( 2 - max - min ) : d / ( max + min );
	let h;
	if ( max === r ) {
		h = ( ( g - b ) / d + ( g < b ? 6 : 0 ) ) / 6;
	} else if ( max === g ) {
		h = ( ( b - r ) / d + 2 ) / 6;
	} else {
		h = ( ( r - g ) / d + 4 ) / 6;
	}
	return [ h, sat, l ];
}

const hue2rgb = ( p, q, t ) => {
	let u = t;
	if ( u < 0 ) {
		u += 1;
	}
	if ( u > 1 ) {
		u -= 1;
	}
	if ( u < 1 / 6 ) {
		return p + ( q - p ) * 6 * u;
	}
	if ( u < 1 / 2 ) {
		return q;
	}
	if ( u < 2 / 3 ) {
		return p + ( q - p ) * ( 2 / 3 - u ) * 6;
	}
	return p;
};

/**
 * @param {number} h Hue 0..1.
 * @param {number} s Saturation 0..1.
 * @param {number} l Lightness 0..1.
 * @return {string} A #rrggbb colour.
 */
export function hslToHex( h, s, l ) {
	let r;
	let g;
	let b;
	if ( ! s ) {
		r = l;
		g = l;
		b = l;
	} else {
		const q = l < 0.5 ? l * ( 1 + s ) : l + s - l * s;
		const p = 2 * l - q;
		r = hue2rgb( p, q, h + 1 / 3 );
		g = hue2rgb( p, q, h );
		b = hue2rgb( p, q, h - 1 / 3 );
	}
	const two = ( v ) =>
		Math.round( clamp01( v ) * 255 )
			.toString( 16 )
			.padStart( 2, '0' );
	return '#' + two( r ) + two( g ) + two( b );
}

/**
 * Whether a set of jitter amounts would change anything at all.
 *
 * @param {Object} j { hueJitter, satJitter, litJitter }.
 * @return {boolean} True when at least one is above zero.
 */
export const jitters = ( j ) =>
	!! j && ( j.hueJitter > 0 || j.satJitter > 0 || j.litJitter > 0 );

/**
 * One mark's colour.
 *
 * @param {string}   base Stroke colour, #rrggbb.
 * @param {Object}   j    { hueJitter, satJitter, litJitter }, each 0..1.
 * @param {Function} rnd  The mark's own dice, 0..1.
 * @return {string} A #rrggbb colour, snapped to the grid.
 */
export function jitterColour( base, j, rnd ) {
	if ( ! jitters( j ) ) {
		return base;
	}
	const [ h, s, l ] = hexToHsl( base );
	// Symmetric around the chosen colour: the stroke should scatter about
	// what you picked, not drift away from it.
	const spin = ( a ) => ( rnd() - 0.5 ) * 2 * a;
	// Hue wraps, so it never needs clamping - it just goes round.
	const hh = snap(
		( ( ( h + spin( j.hueJitter || 0 ) ) % 1 ) + 1 ) % 1,
		HUE_STEPS
	);
	const ss = snap( clamp01( s + spin( j.satJitter || 0 ) ), SAT_STEPS );
	const ll = snap( clamp01( l + spin( j.litJitter || 0 ) ), LIT_STEPS );
	return hslToHex( hh, ss, ll );
}
