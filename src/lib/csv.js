/**
 * Minimal RFC-4180-style CSV parsing (v1.0 mail merge): quoted fields,
 * commas/newlines inside quotes, doubled quotes, CRLF. First row = headers.
 */

/**
 * Parse CSV text into headers + row objects.
 *
 * @param {string} text CSV source.
 * @return {{headers: string[], rows: Object[]}} Parsed table.
 */
export function parseCsv( text ) {
	const records = [];
	let field = '';
	let record = [];
	let inQuotes = false;
	const src = String( text || '' );

	const endField = () => {
		record.push( field );
		field = '';
	};
	const endRecord = () => {
		endField();
		// Skip fully empty lines.
		if ( record.some( ( f ) => '' !== f ) ) {
			records.push( record );
		}
		record = [];
	};

	for ( let i = 0; i < src.length; i++ ) {
		const c = src[ i ];
		if ( inQuotes ) {
			if ( '"' === c ) {
				if ( '"' === src[ i + 1 ] ) {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += c;
			}
		} else if ( '"' === c && '' === field ) {
			inQuotes = true;
		} else if ( ',' === c ) {
			endField();
		} else if ( '\n' === c ) {
			endRecord();
		} else if ( '\r' !== c ) {
			field += c;
		}
	}
	if ( field || record.length ) {
		endRecord();
	}

	if ( ! records.length ) {
		return { headers: [], rows: [] };
	}
	// Duplicate column names get a suffix instead of overwriting each other,
	// and rows have no prototype: a column called __proto__ or constructor
	// used to hand back Object.prototype's members as cell values.
	const seen = new Map();
	const headers = records[ 0 ].map( ( h ) => {
		let name = h.trim();
		const n = seen.get( name ) || 0;
		seen.set( name, n + 1 );
		if ( n ) {
			name = `${ name }_${ n + 1 }`;
		}
		return name;
	} );
	const rows = records.slice( 1 ).map( ( rec ) => {
		const row = Object.create( null );
		headers.forEach( ( h, i ) => {
			row[ h ] = rec[ i ] ?? '';
		} );
		return row;
	} );
	return { headers, rows };
}
