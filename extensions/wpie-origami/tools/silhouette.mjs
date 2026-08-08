/**
 * Looking at the folded shapes without a browser: every figure, every
 * step, as an ASCII silhouette seen from above. Cheap eyes for the
 * authoring loop - if the heart does not look like a heart here, no
 * amount of lighting will save it later.
 *
 *   node tools/silhouette.mjs [figureId]
 */
import { FIGURES } from '../src/core/figures/index.js';
import { foldState, mapPoint, foldBounds } from '../src/core/fold.js';

const COLS = 56;
const ROWS = 28;

function inPoly( px, py, pts ) {
	let hit = false;
	for ( let i = 0, j = pts.length - 1; i < pts.length; j = i++ ) {
		const [ xi, yi ] = pts[ i ];
		const [ xj, yj ] = pts[ j ];
		if (
			yi > py !== yj > py &&
			px < ( ( xj - xi ) * ( py - yi ) ) / ( yj - yi ) + xi
		) {
			hit = ! hit;
		}
	}
	return hit;
}

function draw( fig, at ) {
	const { transforms } = foldState( fig, at );
	const { lo, hi } = foldBounds( fig, transforms );
	const span = Math.max( hi[ 0 ] - lo[ 0 ], hi[ 2 ] - lo[ 2 ] ) || 1;
	const cx = ( lo[ 0 ] + hi[ 0 ] ) / 2;
	const cz = ( lo[ 2 ] + hi[ 2 ] ) / 2;
	// Every face becomes a polygon in the XZ plane.
	const flats = fig.faces.map( ( pts, f ) =>
		pts.map( ( pt ) => {
			const p = mapPoint( transforms, f, pt );
			return [ p[ 0 ], p[ 2 ] ];
		} )
	);
	const rows = [];
	for ( let r = 0; r < ROWS; r++ ) {
		let line = '';
		for ( let c = 0; c < COLS; c++ ) {
			const x = cx + ( ( c + 0.5 ) / COLS - 0.5 ) * span * 1.1;
			const z = cz + ( ( r + 0.5 ) / ROWS - 0.5 ) * span * 1.1;
			line += flats.some( ( poly ) => inPoly( x, z, poly ) )
				? '#'
				: '.';
		}
		rows.push( line );
	}
	const size = `${ ( hi[ 0 ] - lo[ 0 ] ).toFixed( 2 ) } x ${ (
		hi[ 2 ] - lo[ 2 ]
	).toFixed( 2 ) }, height ${ ( hi[ 1 ] - lo[ 1 ] ).toFixed( 3 ) }`;
	console.log( `\n== ${ fig.id } at ${ at } (${ size }) ==` );
	console.log( rows.join( '\n' ) );
}

const only = process.argv[ 2 ];
for ( const fig of FIGURES ) {
	if ( only && fig.id !== only ) {
		continue;
	}
	for ( let k = 0; k <= fig.steps.length; k++ ) {
		draw( fig, k );
	}
}
