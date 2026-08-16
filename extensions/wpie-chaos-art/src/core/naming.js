/**
 * The steckbrief: a piece names itself and tells its life.
 *
 * Nothing here is invented - the title is written from the piece's own
 * chronicle, palette and fashion, by rules. Titles stay in English the
 * way artwork titles do; the biography comes back as FACTS, and the
 * dialog renders them in the visitor's language.
 */

import { hexRgb } from './palette.js';

const HUE_WORDS = [
	[ 15, 'Crimson' ],
	[ 40, 'Ochre' ],
	[ 65, 'Golden' ],
	[ 100, 'Verdant' ],
	[ 160, 'Emerald' ],
	[ 200, 'Cerulean' ],
	[ 250, 'Ultramarine' ],
	[ 290, 'Violet' ],
	[ 330, 'Magenta' ],
	[ 361, 'Crimson' ],
];

const FORM_WORDS = {
	arc: 'Arcs',
	slash: 'Slashes',
	zigzag: 'Serrations',
	spiral: 'Spirals',
	loop: 'Loops',
	scurve: 'Currents',
	hook: 'Hooks',
	blob: 'Islands',
	volley: 'Scatter',
};

/** The palette's voice: a color word from its middle tones. */
function colorWord( colors ) {
	if ( ! Array.isArray( colors ) || ! colors.length ) {
		return 'Ashen';
	}
	let best = null;
	let bestSat = -1;
	for ( const hx of colors ) {
		const [ r, g, b ] = hexRgb( hx );
		const mx = Math.max( r, g, b );
		const mn = Math.min( r, g, b );
		const sat = mx - mn;
		if ( sat > bestSat ) {
			bestSat = sat;
			best = [ r, g, b, mx, mn ];
		}
	}
	if ( bestSat < 0.08 ) {
		return best && best[ 3 ] < 0.35 ? 'Nocturnal' : 'Ashen';
	}
	const [ r, g, b, mx, mn ] = best;
	const d = mx - mn;
	let h;
	if ( mx === r ) {
		h = 60 * ( ( ( g - b ) / d ) % 6 );
	} else if ( mx === g ) {
		h = 60 * ( ( b - r ) / d + 2 );
	} else {
		h = 60 * ( ( r - g ) / d + 4 );
	}
	h = ( ( h % 360 ) + 360 ) % 360;
	for ( const [ lim, word ] of HUE_WORDS ) {
		if ( h < lim ) {
			return word;
		}
	}
	return 'Ashen';
}

/** The fashion's voice: the form the piece painted most. */
function formWord( world ) {
	const counts = {};
	for ( const m of world.memes || [] ) {
		counts[ m.kind ] = ( counts[ m.kind ] || 0 ) + 1;
	}
	let best = null;
	let bn = 0;
	for ( const k in counts ) {
		if ( counts[ k ] > bn ) {
			bn = counts[ k ];
			best = k;
		}
	}
	return FORM_WORDS[ best ] || 'Gestures';
}

/**
 * Title and facts for a finished (or paused) piece.
 *
 * @param {Object} world The world that painted it.
 * @return {Object} { title, facts }.
 */
export function describePiece( world ) {
	const chron = world.chronicle || [];
	const born = chron.find( ( c ) => 'born' === c.e ) || {};
	const schools = chron.filter( ( c ) => 'school' === c.e );
	const upheavals = chron.filter( ( c ) => 'upheaval' === c.e );
	const moves = upheavals.filter( ( c ) => c.moved ).length;
	const palettes = chron.filter( ( c ) => 'palette' === c.e ).length;
	const facts = {
		style: born.style || 'ink',
		school: born.school || 'free',
		endSchool: schools.length
			? schools[ schools.length - 1 ].id
			: born.school || 'free',
		medium: born.medium || 'sculpt',
		upheavals: upheavals.length,
		moves,
		palettes,
		marks: world.segments || 0,
		minutes: Math.max( 1, Math.round( ( world.time || 0 ) / 60 ) ),
	};
	const c = colorWord( world.params && world.params.colors );
	const f = formWord( world );
	const rng = world.rng || ( () => 0.5 );
	const pick = rng();
	let title;
	if ( facts.upheavals > 1 && pick < 0.3 ) {
		title = `What the Upheavals Left in ${ c }`;
	} else if ( facts.moves > 0 && pick < 0.5 ) {
		title = `${ f } After the Move`;
	} else if ( pick < 0.7 ) {
		title = `${ c } ${ f }`;
	} else if ( pick < 0.85 ) {
		title = `The ${ f } of ${ c }`;
	} else {
		title = `Study in ${ c }, No. ${ 1 + Math.floor( rng() * 98 ) }`;
	}
	return { title, facts };
}
