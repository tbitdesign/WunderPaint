/**
 * Chart & Table Studio grid model (v1.269.0): ONE plain data structure
 * for the dialog's spreadsheet editor and both render engines. A grid is
 * { headers: string[], rows: string[][], cols: Array<{align, format,
 * decimals}|undefined> } - cols is sparse, per column index. Every
 * operation is pure and returns a fresh grid.
 */

export const DEFAULT_COL = { align: 'auto', format: 'auto', decimals: null };

export const emptyGrid = () => ( { headers: [], rows: [], cols: [] } );

const splitLine = ( line ) =>
	( line.includes( '\t' ) ? line.split( '\t' ) : line.split( ',' ) ).map(
		( c ) => c.trim()
	);

const clone = ( g ) => ( {
	headers: [ ...g.headers ],
	rows: g.rows.map( ( r ) => [ ...r ] ),
	cols: [ ...( g.cols || [] ) ],
} );

/** Pad/trim body rows to the header length. */
export function normalizeGrid( grid ) {
	const headers = ( grid?.headers || [] ).map( ( h ) => String( h ?? '' ) );
	const rows = ( grid?.rows || [] ).map( ( r ) =>
		headers.map( ( _, i ) => String( r[ i ] ?? '' ) )
	);
	return {
		headers,
		rows,
		cols: ( grid?.cols || [] ).slice( 0, headers.length ),
	};
}

/** "Header\nrow\nrow" (tabs from Excel welcome) → grid. */
export function gridFromText( text ) {
	const lines = String( text || '' )
		.replace( /\r/g, '' )
		.split( '\n' )
		.filter( ( l ) => '' !== l.trim() );
	if ( ! lines.length ) {
		return emptyGrid();
	}
	const headers = splitLine( lines[ 0 ] );
	const rows = lines.slice( 1 ).map( ( l ) => {
		const cells = splitLine( l );
		return headers.map( ( _, i ) => cells[ i ] ?? '' );
	} );
	return { headers, rows, cols: [] };
}

/** Grid → CSV text; quotes only where needed. Used for sample compares. */
export function gridToText( grid ) {
	const esc = ( c ) =>
		/[",\n]/.test( c ) ? '"' + c.replace( /"/g, '""' ) + '"' : c;
	const g = normalizeGrid( grid );
	return [ g.headers, ...g.rows ]
		.map( ( r ) => r.map( esc ).join( ', ' ) )
		.join( '\n' );
}

/** Locale-tolerant numeric parse: "1.234,5", "1,234.5", "42 %", "€ 9". */
export function toNumber( raw ) {
	let s = String( raw ?? '' )
		.trim()
		.replace( /[^\d.,\-+]/g, '' );
	if ( ! s || ! /\d/.test( s ) ) {
		return NaN;
	}
	const lastDot = s.lastIndexOf( '.' );
	const lastComma = s.lastIndexOf( ',' );
	if ( lastDot > -1 && lastComma > -1 ) {
		s =
			lastDot > lastComma
				? s.replace( /,/g, '' )
				: s.replace( /\./g, '' ).replace( ',', '.' );
	} else if ( lastComma > -1 ) {
		s = /^[-+]?\d{1,3}(,\d{3})+$/.test( s )
			? s.replace( /,/g, '' )
			: s.replace( ',', '.' );
	} else if ( lastDot > -1 && /^[-+]?\d{1,3}(\.\d{3})+$/.test( s ) ) {
		s = s.replace( /\./g, '' );
	}
	const v = parseFloat( s );
	return Number.isFinite( v ) ? v : NaN;
}

/** >= 60% of the non-empty body cells parse as numbers. */
export function colIsNumeric( grid, ci ) {
	const vals = ( grid.rows || [] )
		.map( ( r ) => String( r[ ci ] ?? '' ).trim() )
		.filter( Boolean );
	if ( ! vals.length ) {
		return false;
	}
	return (
		vals.filter( ( v ) => ! Number.isNaN( toNumber( v ) ) ).length >=
		vals.length * 0.6
	);
}

/**
 * Grid → { labels, series } for buildChart. Mirrors the legacy
 * parseChartData: a numeric second header treats the header row as data
 * (unnamed series); rows without a single numeric cell are skipped.
 *
 * @param {Object}  grid                Grid.
 * @param {Object}  opts                Options.
 * @param {boolean} opts.keepNegative   Keep negative values (waterfall).
 * @return {{labels: string[], series: Array}} Chart data.
 */
export function chartDataFromGrid( grid, { keepNegative = false } = {} ) {
	const g = normalizeGrid( grid );
	if ( ! g.headers.length ) {
		return { labels: [], series: [] };
	}
	// Single numeric column (v1.302): raw value lists - the histogram's
	// native input - become ONE series with index labels instead of
	// being swallowed as a label-only grid.
	if ( 1 === g.headers.length ) {
		const values = g.rows
			.map( ( r ) => toNumber( r[ 0 ] ) )
			.filter( Number.isFinite )
			.map( ( n ) => ( keepNegative ? n : Math.max( 0, n ) ) );
		if ( values.length ) {
			return {
				labels: values.map( ( _, i ) => String( i + 1 ) ),
				series: [
					{
						name: String( g.headers[ 0 ] ?? '' ).trim(),
						values,
					},
				],
			};
		}
		return { labels: [], series: [] };
	}
	// Headers count as a data row only when the LABEL cell is empty or
	// numeric too - "Product, 2025, 2026" is a header with year columns,
	// not data (v1.302: dumbbell/slope collapsed because the year row
	// entered the scale).
	const firstHeader = String( g.headers[ 0 ] ?? '' ).trim();
	const headerNumeric =
		g.headers.length >= 2 &&
		! Number.isNaN( toNumber( g.headers[ 1 ] ) ) &&
		( '' === firstHeader ||
			! Number.isNaN( toNumber( firstHeader ) ) ||
			// Legacy: a two-column "Jan, 42" paste has no header row at
			// all. With three or more columns, "Product, 2025, 2026" is
			// a header whose series are simply named after years.
			2 === g.headers.length );
	const all = [ ...( headerNumeric ? [ g.headers ] : [] ), ...g.rows ];
	const labels = [];
	const series = Array.from(
		{ length: Math.max( 0, g.headers.length - 1 ) },
		( _, si ) => ( {
			name: headerNumeric
				? ''
				: String( g.headers[ si + 1 ] ?? '' ).trim(),
			values: [],
		} )
	);
	for ( const cells of all ) {
		const vals = cells.slice( 1 ).map( toNumber );
		if ( ! vals.some( Number.isFinite ) ) {
			continue;
		}
		labels.push( String( cells[ 0 ] ?? '' ).trim() );
		vals.forEach( ( v, si ) => {
			if ( ! series[ si ] ) {
				return;
			}
			const n = Number.isFinite( v ) ? v : 0;
			series[ si ].values.push( keepNegative ? n : Math.max( 0, n ) );
		} );
	}
	return {
		labels,
		series: series.filter( ( s ) => s.values.some( ( v ) => 0 !== v ) ),
	};
}

export function sortGrid( grid, ci, dir = 1 ) {
	const g = clone( normalizeGrid( grid ) );
	const numeric = colIsNumeric( g, ci );
	g.rows.sort( ( a, b ) => {
		const av = a[ ci ] ?? '';
		const bv = b[ ci ] ?? '';
		const cmp = numeric
			? ( toNumber( av ) || 0 ) - ( toNumber( bv ) || 0 )
			: String( av ).localeCompare( String( bv ) );
		return cmp * dir;
	} );
	return g;
}

export function transposeGrid( grid ) {
	const g = normalizeGrid( grid );
	const headers = [
		g.headers[ 0 ] ?? '',
		...g.rows.map( ( r ) => r[ 0 ] ?? '' ),
	];
	const rows = g.headers
		.slice( 1 )
		.map( ( h, i ) => [ h, ...g.rows.map( ( r ) => r[ i + 1 ] ?? '' ) ] );
	return { headers, rows, cols: [] };
}

export function insertRow( grid, at ) {
	const g = clone( normalizeGrid( grid ) );
	g.rows.splice(
		at,
		0,
		g.headers.map( () => '' )
	);
	return g;
}

export function removeRow( grid, at ) {
	const g = clone( normalizeGrid( grid ) );
	g.rows.splice( at, 1 );
	return g;
}

export function moveRow( grid, from, to ) {
	const g = clone( normalizeGrid( grid ) );
	const [ r ] = g.rows.splice( from, 1 );
	g.rows.splice( to, 0, r );
	return g;
}

export function insertCol( grid, at ) {
	const g = clone( normalizeGrid( grid ) );
	g.headers.splice( at, 0, '' );
	g.rows.forEach( ( r ) => r.splice( at, 0, '' ) );
	g.cols.splice( at, 0, undefined );
	return g;
}

export function removeCol( grid, at ) {
	const g = clone( normalizeGrid( grid ) );
	g.headers.splice( at, 1 );
	g.rows.forEach( ( r ) => r.splice( at, 1 ) );
	g.cols.splice( at, 1 );
	return g;
}

export function moveCol( grid, from, to ) {
	const g = clone( normalizeGrid( grid ) );
	const move = ( arr ) => {
		const [ v ] = arr.splice( from, 1 );
		arr.splice( to, 0, v );
	};
	move( g.headers );
	g.rows.forEach( move );
	move( g.cols );
	return g;
}

export function setCell( grid, r, c, value ) {
	const g = clone( normalizeGrid( grid ) );
	if ( g.rows[ r ] ) {
		g.rows[ r ][ c ] = String( value ?? '' );
	}
	return g;
}

export function setHeader( grid, c, value ) {
	const g = clone( normalizeGrid( grid ) );
	g.headers[ c ] = String( value ?? '' );
	return g;
}

export function setColMeta( grid, c, patch ) {
	const g = clone( normalizeGrid( grid ) );
	g.cols[ c ] = { ...DEFAULT_COL, ...( g.cols[ c ] || {} ), ...patch };
	return g;
}

/** Paste a tab/comma block at (row, col); row -1 targets the header row. */
export function pasteAt( grid, r, c, text ) {
	const lines = String( text || '' )
		.replace( /\r/g, '' )
		.split( '\n' )
		.filter( ( l ) => '' !== l.trim() );
	if ( ! lines.length ) {
		return normalizeGrid( grid );
	}
	const g = clone( normalizeGrid( grid ) );
	lines.forEach( ( line, li ) => {
		const cells = splitLine( line );
		const rr = r + li;
		cells.forEach( ( cell, off ) => {
			const cc = c + off;
			while ( g.headers.length <= cc ) {
				g.headers.push( '' );
				g.rows.forEach( ( row ) => row.push( '' ) );
			}
			if ( rr < 0 ) {
				g.headers[ cc ] = cell;
				return;
			}
			while ( g.rows.length <= rr ) {
				g.rows.push( g.headers.map( () => '' ) );
			}
			g.rows[ rr ][ cc ] = cell;
		} );
	} );
	return g;
}

/** Thousands/decimal separators from the editor locale. */
export function numberSeps() {
	const loc = String(
		( typeof window !== 'undefined' && window.WPIE?.locale ) || ''
	).toLowerCase();
	return /^(de|at)/.test( loc )
		? { group: '.', dec: ',' }
		: { group: ',', dec: '.' };
}

/**
 * Format one cell for display according to its column meta. The percent
 * format does NOT multiply - cells already hold percent values.
 *
 * @param {string} raw  Raw cell value.
 * @param {Object} meta Column meta {align, format, decimals}.
 * @param {Object} seps Separators {group, dec}.
 * @return {string} Display string.
 */
export function fmtCell( raw, meta, seps = numberSeps() ) {
	const m = { ...DEFAULT_COL, ...( meta || {} ) };
	if ( 'text' === m.format ) {
		return String( raw ?? '' );
	}
	const v = toNumber( raw );
	if ( Number.isNaN( v ) ) {
		return String( raw ?? '' );
	}
	if ( 'auto' === m.format && null === m.decimals ) {
		return String( raw ?? '' );
	}
	const dec =
		null !== m.decimals
			? m.decimals
			: 'currency' === m.format
			? 2
			: Number.isInteger( v )
			? 0
			: 1;
	const neg = v < 0 ? '-' : '';
	const parts = Math.abs( v ).toFixed( dec ).split( '.' );
	let int = parts[ 0 ];
	if ( 'percent' !== m.format ) {
		int = int.replace( /\B(?=(\d{3})+(?!\d))/g, seps.group );
	}
	return (
		neg +
		int +
		( parts[ 1 ] ? seps.dec + parts[ 1 ] : '' ) +
		( 'percent' === m.format ? ' %' : '' )
	);
}

/** /posts/table response → grid (labels fall back to raw field ids). */
export function gridFromPostsTable( fields, labels, rows ) {
	return {
		headers: fields.map( ( f, i ) => labels[ i ] || f ),
		rows: ( rows || [] ).map( ( r ) =>
			r.map( ( c ) => String( c ?? '' ) )
		),
		cols: [],
	};
}
