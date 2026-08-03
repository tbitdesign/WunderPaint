/**
 * CSV/TSV file import (v1.269.0): FileReader + the existing parsers. No
 * new dependencies - quoted CSV goes through parseCsv (RFC 4180),
 * tab-separated content through the simple grid splitter.
 */

import { parseCsv } from '../../lib/csv';
import { gridFromText, normalizeGrid } from '../../lib/grid-model';

export function acceptsFile( file ) {
	if ( ! file ) {
		return false;
	}
	if ( /^text\//.test( file.type || '' ) ) {
		return true;
	}
	return /\.(csv|tsv|txt)$/i.test( file.name || '' );
}

export function gridFromCsvText( text ) {
	const src = String( text || '' );
	if ( src.includes( '\t' ) || ! src.includes( '"' ) ) {
		return gridFromText( src );
	}
	const { headers, rows } = parseCsv( src );
	return normalizeGrid( {
		headers,
		rows: rows.map( ( row ) => headers.map( ( h ) => row[ h ] ?? '' ) ),
		cols: [],
	} );
}

export function readGridFromFile( file ) {
	return new Promise( ( resolve, reject ) => {
		const reader = new window.FileReader();
		reader.onerror = () => reject( new Error( 'read failed' ) );
		reader.onload = () =>
			resolve( gridFromCsvText( String( reader.result || '' ) ) );
		reader.readAsText( file );
	} );
}
