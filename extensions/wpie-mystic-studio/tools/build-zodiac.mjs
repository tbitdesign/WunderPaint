/**
 * Extract the 12 zodiac constellations (figure lines + nearby stars) from
 * the Star Map catalog into src/zodiac.json. Run from the extension root:
 *   node tools/build-zodiac.mjs
 *
 * Output per constellation: { segs: [[[ra,dec],...]], stars: [[ra,dec,mag]] }
 * with stars limited to the padded bounding box of the figure and mag <= 5.6.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const starMapSrc = path.join( here, '..', '..', 'wpie-star-map', 'src' );
const stars = JSON.parse(
	fs.readFileSync( path.join( starMapSrc, 'stars.json' ), 'utf8' )
);
const lines = JSON.parse(
	fs.readFileSync( path.join( starMapSrc, 'lines.json' ), 'utf8' )
);

const ZODIAC = [
	'Ari',
	'Tau',
	'Gem',
	'Cnc',
	'Leo',
	'Vir',
	'Lib',
	'Sco',
	'Sgr',
	'Cap',
	'Aqr',
	'Psc',
];

const PAD = 6; // degrees around the figure box
const MAG_LIMIT = 5.6;

/** Unwrap an RA near a reference so boxes never straddle 0/360. */
const near = ( ra, ref ) => {
	let v = ra;
	while ( v - ref > 180 ) {
		v -= 360;
	}
	while ( v - ref < -180 ) {
		v += 360;
	}
	return v;
};

const out = {};
for ( const code of ZODIAC ) {
	const entry = Object.values( lines ).find( ( l ) => l.c === code );
	if ( ! entry ) {
		throw new Error( 'missing constellation ' + code );
	}
	const ref = entry.segs[ 0 ][ 0 ][ 0 ];
	let raMin = Infinity;
	let raMax = -Infinity;
	let decMin = Infinity;
	let decMax = -Infinity;
	const segs = entry.segs.map( ( seg ) =>
		seg.map( ( [ ra, dec ] ) => {
			const r = near( ra, ref );
			raMin = Math.min( raMin, r );
			raMax = Math.max( raMax, r );
			decMin = Math.min( decMin, dec );
			decMax = Math.max( decMax, dec );
			return [ Math.round( r * 100 ) / 100, dec ];
		} )
	);
	const picked = [];
	for ( const [ ra, dec, mag ] of stars ) {
		if ( mag > MAG_LIMIT ) {
			continue;
		}
		const r = near( ra, ref );
		if (
			r >= raMin - PAD &&
			r <= raMax + PAD &&
			dec >= decMin - PAD &&
			dec <= decMax + PAD
		) {
			picked.push( [
				Math.round( r * 100 ) / 100,
				dec,
				Math.round( mag * 10 ) / 10,
			] );
		}
	}
	out[ code ] = { segs, stars: picked };
}

const target = path.join( here, '..', 'src', 'zodiac.json' );
fs.writeFileSync( target, JSON.stringify( out ) );
const kb = ( fs.statSync( target ).size / 1024 ).toFixed( 1 );
console.log(
	'zodiac.json written:',
	Object.keys( out )
		.map( ( c ) => `${ c }:${ out[ c ].stars.length }` )
		.join( ' ' ),
	`(${ kb } KB)`
);
