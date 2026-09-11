import { SCHOOLS } from './schools.js';

export const ENSEMBLE_ID = 'custom-ensemble';
export const DEFAULT_ENSEMBLE = [ 'bauhaus', 'sumi', 'fauvism' ];

/** Two or three different schools make a visitor's ensemble. */
export function ensembleSchools( ids ) {
	const schools = [ ...new Set( Array.isArray( ids ) ? ids : [] ) ]
		.map( ( id ) => SCHOOLS.find( ( school ) => school.id === id ) )
		.filter( Boolean )
		.slice( 0, 3 );
	return schools.length >= 2 ? schools : [];
}
