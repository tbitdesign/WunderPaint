/**
 * Statistics for the classroom: `data 3, 5, 5, 7, 8, 12` (or words for
 * categories) and `label "Points"`; drawn as a dot plot, a bar chart of
 * the frequencies, a histogram or a box plot, with optional mean and
 * median markers and counts on the bars.
 */
import { textEl, r } from './svg.js';

const fmt = ( n ) => String( Math.round( n * 100 ) / 100 );

export function parseStats( text ) {
	const spec = { values: [], categories: null, label: '' };
	const errors = [];
	String( text || '' )
		.split( '\n' )
		.forEach( ( raw, i ) => {
			const line = raw.trim();
			if ( ! line ) {
				return;
			}
			const lab =
				/^label\s+"([^"]*)"$/i.exec( line ) ||
				/^label\s+(.+)$/i.exec( line );
			if ( lab ) {
				spec.label = lab[ 1 ].trim();
				return;
			}
			const body = line.replace( /^data\s*/i, '' );
			if ( body === line && ! /^[-\d]/.test( line ) ) {
				errors.push( {
					line: i + 1,
					message:
						'Commands: data 3, 5, 5, 7 (or words), label "Points"',
				} );
				return;
			}
			const toks = body.split( /[\s,;]+/ ).filter( Boolean );
			if ( ! toks.length ) {
				errors.push( { line: i + 1, message: 'data needs values' } );
				return;
			}
			if ( toks.every( ( tk ) => /^-?\d+(?:[.,]\d+)?$/.test( tk ) ) ) {
				spec.values.push(
					...toks.map( ( tk ) =>
						parseFloat( tk.replace( ',', '.' ) )
					)
				);
			} else {
				spec.categories = ( spec.categories || [] ).concat( toks );
			}
		} );
	return { spec, errors };
}

const median = ( sorted ) => {
	const n = sorted.length;
	if ( ! n ) {
		return NaN;
	}
	return n % 2
		? sorted[ ( n - 1 ) / 2 ]
		: ( sorted[ n / 2 - 1 ] + sorted[ n / 2 ] ) / 2;
};

export function quartiles( values ) {
	const s = [ ...values ].sort( ( a, b ) => a - b );
	const n = s.length;
	const lower = s.slice( 0, Math.floor( n / 2 ) );
	const upper = s.slice( Math.ceil( n / 2 ) );
	return {
		min: s[ 0 ],
		q1: median( lower ),
		median: median( s ),
		q3: median( upper ),
		max: s[ n - 1 ],
	};
}

const niceStep = ( span, target ) => {
	const raw = span / Math.max( 1, target );
	const p = Math.pow( 10, Math.floor( Math.log10( raw || 1 ) ) );
	for ( const m of [ 1, 2, 2.5, 5, 10 ] ) {
		if ( m * p >= raw ) {
			return m * p;
		}
	}
	return 10 * p;
};

export function renderStats( spec, o ) {
	const scale = o.scale || 1;
	const width = o.width || 1000;
	const ink = o.ink || '#000';
	const accent = o.accent || ink;
	const muted = o.muted || ink;
	const bg = o.bg || '#ffffff';
	const font = o.font || 'Arial';
	const fs = ( o.size || 22 ) * 0.85;
	const t = o.t || ( ( s ) => s );
	const chart = spec.categories ? 'bar' : o.chart || 'dotplot';
	const warnings = [];
	const parts = [];
	const H = Math.min(
		width * ( 'boxplot' === chart ? 0.28 : 0.45 ),
		( 'boxplot' === chart ? 260 : 420 ) * scale
	);
	const padL = fs * 1.2;
	const padR = fs * 1.2;
	const padT = fs * 1.2;
	const padB = fs * ( spec.label ? 3.2 : 2 );
	const plotW = width - padL - padR;
	const base = H - padB;
	const plotH = base - padT;
	const axisLine = ( x0, x1 ) =>
		parts.push(
			`<line x1="${ r( x0 ) }" y1="${ r( base ) }" x2="${ r(
				x1
			) }" y2="${ r( base ) }" stroke="${ ink }" stroke-width="${ r(
				1.6 * scale
			) }"/>`
		);
	const tick = ( x, label ) => {
		parts.push(
			`<line x1="${ r( x ) }" y1="${ r( base ) }" x2="${ r(
				x
			) }" y2="${ r(
				base + fs * 0.35
			) }" stroke="${ ink }" stroke-width="${ r( 1.2 * scale ) }"/>`
		);
		parts.push(
			textEl( x, base + fs * 1.35, label, {
				size: r( fs ),
				font,
				fill: ink,
				anchor: 'middle',
			} )
		);
	};
	const countLabel = ( x, y, n ) =>
		parts.push(
			textEl( x, y - fs * 0.35, String( n ), {
				size: r( fs * 0.9 ),
				font,
				fill: ink,
				anchor: 'middle',
			} )
		);

	if ( spec.categories ) {
		const order = [];
		const counts = new Map();
		for ( const c of spec.categories ) {
			if ( ! counts.has( c ) ) {
				order.push( c );
				counts.set( c, 0 );
			}
			counts.set( c, counts.get( c ) + 1 );
		}
		const maxN = Math.max( ...counts.values() );
		const slot = plotW / order.length;
		const bw = slot * 0.6;
		axisLine( padL, padL + plotW );
		order.forEach( ( c, i ) => {
			const n = counts.get( c );
			const h = ( n / maxN ) * plotH;
			const x = padL + i * slot + ( slot - bw ) / 2;
			parts.push(
				`<rect x="${ r( x ) }" y="${ r( base - h ) }" width="${ r(
					bw
				) }" height="${ r(
					h
				) }" fill="${ accent }" fill-opacity="0.75" stroke="${ ink }" stroke-width="1"/>`
			);
			parts.push(
				textEl( x + bw / 2, base + fs * 1.35, c, {
					size: r( fs ),
					font,
					fill: ink,
					anchor: 'middle',
				} )
			);
			if ( false !== o.counts ) {
				countLabel( x + bw / 2, base - h, n );
			}
		} );
	} else {
		const values = spec.values;
		if ( ! values.length ) {
			return { inner: '', w: 0, h: 0, warnings };
		}
		const sorted = [ ...values ].sort( ( a, b ) => a - b );
		const q = quartiles( values );
		const mean = values.reduce( ( a, b ) => a + b, 0 ) / values.length;
		let lo = sorted[ 0 ];
		let hi = sorted[ sorted.length - 1 ];
		let bins = null;
		if ( 'histogram' === chart ) {
			const k =
				o.bins > 0
					? o.bins
					: Math.max(
							3,
							Math.ceil( Math.log2( values.length ) + 1 )
					  );
			const span = hi - lo || 1;
			const bw = niceStep( span, k );
			const start = Math.floor( lo / bw ) * bw;
			const count = Math.max(
				1,
				Math.ceil( ( hi - start ) / bw + 1e-9 )
			);
			bins = { start, bw, counts: Array( count ).fill( 0 ) };
			for ( const v of values ) {
				const idx = Math.min(
					count - 1,
					Math.floor( ( v - start ) / bw + 1e-9 )
				);
				bins.counts[ idx ]++;
			}
			lo = start;
			hi = start + count * bw;
		}
		const step =
			'histogram' === chart ? bins.bw : niceStep( hi - lo || 1, 8 );
		const x0 =
			'histogram' === chart
				? lo
				: Math.floor( lo / step ) * step -
				  ( 'bar' === chart || 'dotplot' === chart ? step : 0 );
		const x1 =
			'histogram' === chart
				? hi
				: Math.ceil( hi / step ) * step +
				  ( 'bar' === chart || 'dotplot' === chart ? step : 0 );
		const px = ( v ) => padL + ( ( v - x0 ) / ( x1 - x0 || 1 ) ) * plotW;
		axisLine( padL, padL + plotW );
		for ( let v = x0; v <= x1 + 1e-9; v += step ) {
			tick( px( v ), fmt( v ) );
		}
		const distinct = [ ...new Set( sorted ) ];
		const counts = new Map(
			distinct.map( ( v ) => [
				v,
				values.filter( ( x ) => x === v ).length,
			] )
		);
		const maxN = Math.max( ...counts.values() );
		if ( 'dotplot' === chart ) {
			const d = Math.min(
				fs * 1.1,
				( plotH * 0.9 ) / Math.max( 1, maxN )
			);
			const rad = d * 0.42;
			for ( const v of distinct ) {
				for ( let i = 0; i < counts.get( v ); i++ ) {
					parts.push(
						`<circle cx="${ r( px( v ) ) }" cy="${ r(
							base - rad - fs * 0.3 - i * d
						) }" r="${ r( rad ) }" fill="${ accent }"/>`
					);
				}
			}
		} else if ( 'bar' === chart ) {
			const bw = Math.min(
				fs * 2.2,
				( plotW / ( ( x1 - x0 ) / step ) ) * 0.6
			);
			for ( const v of distinct ) {
				const h = ( counts.get( v ) / maxN ) * plotH;
				parts.push(
					`<rect x="${ r( px( v ) - bw / 2 ) }" y="${ r(
						base - h
					) }" width="${ r( bw ) }" height="${ r(
						h
					) }" fill="${ accent }" fill-opacity="0.75" stroke="${ ink }" stroke-width="1"/>`
				);
				if ( false !== o.counts ) {
					countLabel( px( v ), base - h, counts.get( v ) );
				}
			}
		} else if ( 'histogram' === chart ) {
			const maxB = Math.max( ...bins.counts );
			bins.counts.forEach( ( n, i ) => {
				const h = ( n / ( maxB || 1 ) ) * plotH;
				const xa = px( bins.start + i * bins.bw );
				const xb = px( bins.start + ( i + 1 ) * bins.bw );
				parts.push(
					`<rect x="${ r( xa ) }" y="${ r( base - h ) }" width="${ r(
						xb - xa
					) }" height="${ r(
						h
					) }" fill="${ accent }" fill-opacity="0.75" stroke="${ ink }" stroke-width="1"/>`
				);
				if ( false !== o.counts && n ) {
					countLabel( ( xa + xb ) / 2, base - h, n );
				}
			} );
		} else if ( 'boxplot' === chart ) {
			const iqr = q.q3 - q.q1;
			const inside = sorted.filter(
				( v ) => v >= q.q1 - 1.5 * iqr && v <= q.q3 + 1.5 * iqr
			);
			const wLo = inside[ 0 ];
			const wHi = inside[ inside.length - 1 ];
			const cy = padT + plotH / 2;
			const bh = Math.min( plotH * 0.5, fs * 4 );
			const sw = r( 1.8 * scale );
			parts.push(
				`<line x1="${ r( px( wLo ) ) }" y1="${ r( cy ) }" x2="${ r(
					px( q.q1 )
				) }" y2="${ r(
					cy
				) }" stroke="${ ink }" stroke-width="${ sw }"/>`
			);
			parts.push(
				`<line x1="${ r( px( q.q3 ) ) }" y1="${ r( cy ) }" x2="${ r(
					px( wHi )
				) }" y2="${ r(
					cy
				) }" stroke="${ ink }" stroke-width="${ sw }"/>`
			);
			for ( const v of [ wLo, wHi ] ) {
				parts.push(
					`<line x1="${ r( px( v ) ) }" y1="${ r(
						cy - bh * 0.3
					) }" x2="${ r( px( v ) ) }" y2="${ r(
						cy + bh * 0.3
					) }" stroke="${ ink }" stroke-width="${ sw }"/>`
				);
			}
			parts.push(
				`<rect x="${ r( px( q.q1 ) ) }" y="${ r(
					cy - bh / 2
				) }" width="${ r( px( q.q3 ) - px( q.q1 ) ) }" height="${ r(
					bh
				) }" fill="${ accent }" fill-opacity="0.35" stroke="${ ink }" stroke-width="${ sw }"/>`
			);
			parts.push(
				`<line x1="${ r( px( q.median ) ) }" y1="${ r(
					cy - bh / 2
				) }" x2="${ r( px( q.median ) ) }" y2="${ r(
					cy + bh / 2
				) }" stroke="${ ink }" stroke-width="${ r( 2.6 * scale ) }"/>`
			);
			for ( const v of sorted ) {
				if ( v < wLo || v > wHi ) {
					parts.push(
						`<circle cx="${ r( px( v ) ) }" cy="${ r(
							cy
						) }" r="${ r(
							fs * 0.25
						) }" fill="${ bg }" stroke="${ ink }" stroke-width="${ sw }"/>`
					);
				}
			}
			for ( const [ v, lab ] of [
				[ q.q1, 'Q1' ],
				[ q.median, t( 'median' ) ],
				[ q.q3, 'Q3' ],
			] ) {
				parts.push(
					textEl(
						px( v ),
						cy - bh / 2 - fs * 0.4,
						lab + ' ' + fmt( v ),
						{
							size: r( fs * 0.8 ),
							font,
							fill: muted,
							anchor: 'middle',
						}
					)
				);
			}
		}
		const marker = ( v, label ) => {
			parts.push(
				`<line x1="${ r( px( v ) ) }" y1="${ r( padT ) }" x2="${ r(
					px( v )
				) }" y2="${ r(
					base
				) }" stroke="${ accent }" stroke-width="${ r(
					1.5 * scale
				) }" stroke-dasharray="6 4"/>`
			);
			parts.push(
				textEl(
					px( v ) + fs * 0.3,
					padT + fs * 0.9,
					label + ' ' + fmt( v ),
					{ size: r( fs * 0.85 ), font, fill: accent }
				)
			);
		};
		if ( o.mean ) {
			marker( mean, t( 'mean' ) );
		}
		if ( o.median && 'boxplot' !== chart ) {
			marker( q.median, t( 'median' ) );
		}
	}
	if ( spec.label ) {
		parts.push(
			textEl( padL + plotW / 2, H - fs * 0.5, spec.label, {
				size: r( fs ),
				font,
				fill: ink,
				anchor: 'middle',
			} )
		);
	}
	return { inner: parts.join( '' ), w: r( width ), h: r( H ), warnings };
}
