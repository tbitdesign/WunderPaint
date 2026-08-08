/**
 * Dev tool: build the bundled star catalog and constellation lines.
 *
 *   node tools/build-catalog.mjs <bsc5.dat> <constellations.lines.json> [constellations.json]
 *
 * Pass '-' as <bsc5.dat> to skip the star catalog and only rebuild the
 * line data (v1.8: lines gained constellation ids for the highlight).
 *
 * Sources:
 * - Yale Bright Star Catalogue 5 (public domain): fixed-width bsc5.dat,
 *   J2000 RA bytes 76-83, Dec 84-90, Vmag 103-107, B-V 110-114.
 * - d3-celestial constellation lines (BSD-3, (c) Olaf Frohn): GeoJSON
 *   MultiLineStrings with [raDeg(-180..180), decDeg] coordinates and
 *   the IAU abbreviation as feature id; constellations.json adds the
 *   full Latin names.
 *
 * Output: src/stars.json  [ [raDeg, decDeg, vmag, bv], ... ]
 *         src/lines.json  [ { c: 'And', segs: [ [ [ra, dec], ... ] ] } ]
 *         src/constellation-names.json { And: 'Andromeda', ... }
 */

import { readFileSync, writeFileSync } from 'node:fs';

const [ , , bscPath, linesPath, namesPath ] = process.argv;

const stars = [];
for ( const line of '-' === bscPath
	? []
	: readFileSync( bscPath, 'latin1' ).split( '\n' ) ) {
	if ( line.length < 114 ) {
		continue;
	}
	const raH = parseFloat( line.slice( 75, 77 ) );
	const raM = parseFloat( line.slice( 77, 79 ) );
	const raS = parseFloat( line.slice( 79, 83 ) );
	const decSign = line[ 83 ] === '-' ? -1 : 1;
	const decD = parseFloat( line.slice( 84, 86 ) );
	const decM = parseFloat( line.slice( 86, 88 ) );
	const decS = parseFloat( line.slice( 88, 90 ) );
	const mag = parseFloat( line.slice( 102, 107 ) );
	const bv = parseFloat( line.slice( 109, 114 ) );
	if ( [ raH, raM, raS, decD, decM, decS, mag ].some( Number.isNaN ) ) {
		continue; // novae/non-stellar entries without coordinates
	}
	if ( mag > 6.5 ) {
		continue;
	}
	const ra = ( raH + raM / 60 + raS / 3600 ) * 15;
	const dec = decSign * ( decD + decM / 60 + decS / 3600 );
	stars.push( [
		Math.round( ra * 1000 ) / 1000,
		Math.round( dec * 1000 ) / 1000,
		mag,
		Number.isNaN( bv ) ? 0 : bv,
	] );
}
stars.sort( ( a, b ) => a[ 2 ] - b[ 2 ] );

const geo = JSON.parse( readFileSync( linesPath, 'utf8' ) );
const lines = [];
let segCount = 0;
for ( const f of geo.features ) {
	const segs = [];
	for ( const seg of f.geometry.coordinates ) {
		segs.push(
			seg.map( ( [ ra, dec ] ) => [
				Math.round( ( ( ra + 360 ) % 360 ) * 100 ) / 100,
				Math.round( dec * 100 ) / 100,
			] )
		);
		segCount++;
	}
	lines.push( { c: String( f.id || '' ), segs } );
}

if ( stars.length ) {
	writeFileSync(
		new URL( '../src/stars.json', import.meta.url ),
		JSON.stringify( stars )
	);
}
writeFileSync(
	new URL( '../src/lines.json', import.meta.url ),
	JSON.stringify( lines )
);
if ( namesPath ) {
	const namesGeo = JSON.parse( readFileSync( namesPath, 'utf8' ) );
	const names = {};
	for ( const f of namesGeo.features ) {
		if ( f.id && f.properties && f.properties.name ) {
			names[ String( f.id ) ] = String( f.properties.name );
		}
	}
	writeFileSync(
		new URL( '../src/constellation-names.json', import.meta.url ),
		JSON.stringify( names )
	);
	process.stdout.write( `names: ${ Object.keys( names ).length }\n` );
}
process.stdout.write(
	`stars: ${ stars.length }, constellations: ${ lines.length }, segments: ${ segCount }\n`
);
