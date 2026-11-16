/** CPU color grades shared by previews, editor and export, with unchanged alpha. */
import { FILTER_COLLECTION } from './filter-collection';
const grades = new Map( FILTER_COLLECTION.map( ( f ) => [ f.id, f.grade ] ) );
const prepared = new WeakMap();
const clamp = ( v, a = 0, b = 1 ) => Math.max( a, Math.min( b, v ) );
const rgb = ( hex ) =>
	[ 1, 3, 5 ].map( ( i ) => parseInt( hex.slice( i, i + 2 ), 16 ) );
export const hasColorGrade = ( id ) => grades.has( id );

export function applyColorGrade( image, id, intensity = 100 ) {
	const grade = grades.get( id );
	if ( ! grade ) {
		return image;
	}
	const amount = clamp(
		Number.isFinite( +intensity ) ? +intensity / 100 : 1
	);
	if ( ! amount ) {
		return image;
	}
	let table = prepared.get( grade );
	if ( ! table ) {
		const colors = [ grade.shadow, grade.middle, grade.highlight ].map(
			rgb
		);
		table = Array.from( { length: 256 }, ( _, i ) => {
			const t = i / 255,
				side = t < 0.5 ? 0 : 1,
				u = side ? t * 2 - 1 : t * 2;
			return colors[ side ].map(
				( c, k ) => c + ( colors[ side + 1 ][ k ] - c ) * u
			);
		} );
		prepared.set( grade, table );
	}
	const d = image.data;
	for ( let i = 0; i < d.length; i += 4 ) {
		if ( ! d[ i + 3 ] ) {
			continue;
		}
		const l =
			( d[ i ] * 0.2126 + d[ i + 1 ] * 0.7152 + d[ i + 2 ] * 0.0722 ) /
			255;
		const tone = clamp(
			grade.lift +
				Math.pow(
					clamp( ( l - 0.5 ) * grade.contrast + 0.5 ),
					1 / grade.gamma
				) *
					( 1 - grade.lift )
		);
		const map = table[ Math.round( tone * 255 ) ];
		for ( let k = 0; k < 3; k++ ) {
			const colored =
				clamp( tone + ( d[ i + k ] / 255 - l ) * grade.saturation ) *
				255;
			const next = colored * ( 1 - grade.mix ) + map[ k ] * grade.mix;
			d[ i + k ] += ( next - d[ i + k ] ) * amount;
		}
	}
	return image;
}

export function gradeCanvas( canvas, layer ) {
	if ( ! hasColorGrade( layer.filter ) || layer.filterAmount === 0 ) {
		return canvas;
	}
	const g = canvas.getContext( '2d' ),
		im = g.getImageData( 0, 0, canvas.width, canvas.height );
	applyColorGrade( im, layer.filter, layer.filterAmount ?? 100 );
	g.putImageData( im, 0, 0 );
	return canvas;
}
