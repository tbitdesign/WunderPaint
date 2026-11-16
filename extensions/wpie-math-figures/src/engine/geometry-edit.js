import { parseGeometry } from './geometry.js';
const rounded = ( n ) => Number( n.toFixed( 6 ) );
/** Replace only the coordinate pair. Labels, comments and dependent constructions survive. */
export function movePoint( block, name, x, y ) {
	if ( ! [ x, y ].every( Number.isFinite ) ) return false;
	const p = parseGeometry( block.geometry ).points.get( name );
	if ( ! p || p.derived ) return false;
	const lines = block.geometry.split( /\r?\n/ ),
		raw = lines[ p.line ];
	const start = raw.indexOf( '(' );
	let end = start,
		depth = 0;
	depth = 0;
	for ( end = start; end < raw.length; end++ ) {
		if ( raw[ end ] === '(' ) depth++;
		else if ( raw[ end ] === ')' ) {
			depth--;
			if ( ! depth ) break;
		}
	}
	if ( start < 0 || end >= raw.length ) return false;
	lines[ p.line ] =
		raw.slice( 0, start ) +
		`(${ rounded( x ) }, ${ rounded( y ) })` +
		raw.slice( end + 1 );
	block.geometry = lines.join( '\n' );
	return true;
}
export function setPolarPoint(
	block,
	name,
	anchorName,
	length,
	degrees,
	referenceName = ''
) {
	if (
		! [ length, degrees ].every( Number.isFinite ) ||
		length < 0 ||
		name === anchorName
	)
		return false;
	const fig = parseGeometry( block.geometry ),
		anchor = fig.points.get( anchorName ),
		ref = fig.points.get( referenceName );
	if ( ! anchor ) return false;
	const baseline = ref ? Math.atan2( ref.y - anchor.y, ref.x - anchor.x ) : 0;
	const angle = baseline + ( degrees * Math.PI ) / 180;
	return movePoint(
		block,
		name,
		anchor.x + length * Math.cos( angle ),
		anchor.y + length * Math.sin( angle )
	);
}
export function renameLabel( block, name, label ) {
	if ( ! /^[A-Za-z]\w*$/.test( name ) ) return;
	const clean = String( label ).replace( /["\r\n]/g, '' );
	const lines = block.geometry
		.split( /\r?\n/ )
		.filter(
			( s ) => ! new RegExp( '^\\s*label\\s+' + name + '\\s' ).test( s )
		);
	lines.push( `label ${ name } "${ clean }"` );
	block.geometry = lines.join( '\n' );
}
