/** Validated, portable local style sets. No paths or tablet recordings in presets. */
import { cleanPenStyle } from './pen-path';
export function portablePenStyle( value ) {
	return {
		...cleanPenStyle( value ),
		motion: [],
		trimStart: 0,
		trimEnd: 100,
		symmetryAxis: 0,
		symmetryX: 0,
		symmetryY: 0,
	};
}
export function cleanPenStyleSet( value ) {
	if (
		! value ||
		value.format !== 'wunderpaint-pen-styles' ||
		value.version !== 1 ||
		! Array.isArray( value.styles ) ||
		value.styles.length > 100
	) {
		throw new Error( 'Invalid pen style set' );
	}
	return value.styles.map( ( item, index ) => {
		if (
			! item ||
			typeof item.name !== 'string' ||
			! item.style ||
			typeof item.style !== 'object' ||
			Array.isArray( item.style )
		) {
			throw new Error( 'Invalid pen style' );
		}
		return {
			id: `style-${ index }-${ String( item.id || index )
				.replace( /[^a-zA-Z0-9_-]/g, '' )
				.slice( 0, 60 ) }`,
			name: item.name.trim().slice( 0, 80 ) || `Style ${ index + 1 }`,
			favorite: !! item.favorite,
			style: portablePenStyle( item.style ),
		};
	} );
}
export function penStyleSet( styles ) {
	return {
		format: 'wunderpaint-pen-styles',
		version: 1,
		styles: styles.map( ( item ) => ( {
			...item,
			style: portablePenStyle( item.style ),
		} ) ),
	};
}
