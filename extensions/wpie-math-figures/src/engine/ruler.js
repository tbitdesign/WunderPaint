/**
 * A ruler: `ruler 0..12 cm` (units cm with millimetres, mm, in with
 * quarters, or plain tenths), `mark 2.5..7 "4,5 cm"` draws a measured
 * span above it with end caps and a label, `mark 3 "P"` a point.
 */
import { textEl, r } from './svg.js';

export function parseRuler( text ) {
	const spec = { from: 0, to: 10, unit: 'cm', marks: [] };
	const errors = [];
	String( text || '' )
		.split( '\n' )
		.forEach( ( raw, i ) => {
			const line = raw.trim();
			if ( ! line ) {
				return;
			}
			let m =
				/^ruler\s+(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)\s*([a-z]*)$/i.exec(
					line
				);
			if ( m ) {
				const from = parseFloat( m[ 1 ] );
				const to = parseFloat( m[ 2 ] );
				if ( ! ( to > from ) || to - from > 100 ) {
					errors.push( {
						line: i + 1,
						message:
							'ruler takes a range like 0..12 with at most 100 units',
					} );
				} else {
					spec.from = from;
					spec.to = to;
					spec.unit = ( m[ 3 ] || 'cm' ).toLowerCase();
				}
				return;
			}
			m =
				/^mark\s+(-?\d+(?:\.\d+)?)(?:\s*\.\.\s*(-?\d+(?:\.\d+)?))?\s*(?:"([^"]*)")?$/i.exec(
					line
				);
			if ( m ) {
				const from = parseFloat( m[ 1 ] );
				const to = m[ 2 ] ? parseFloat( m[ 2 ] ) : from;
				spec.marks.push( {
					from: Math.min( from, to ),
					to: Math.max( from, to ),
					label: m[ 3 ] || '',
				} );
				return;
			}
			errors.push( {
				line: i + 1,
				message:
					'Commands: ruler 0..12 cm, mark 2.5..7 "4,5 cm", mark 3 "P"',
			} );
		} );
	return { spec, errors };
}

const fmt = ( v ) => String( Math.round( v * 100 ) / 100 );

export function renderRuler( spec, o ) {
	const scale = o.scale || 1;
	const width = o.width || 1200;
	const ink = o.ink || '#000';
	const accent = o.accent || ink;
	const bg = o.bg || '#ffffff';
	const font = o.font || 'Arial';
	const fs = ( o.size || 22 ) * 0.9;
	const units = spec.to - spec.from;
	const bodyH = 70 * scale;
	const padX = 24 * scale;
	const unitW = fs * 1.8;
	const innerW = width - 2 * padX - unitW;
	const px = ( v ) => padX + ( ( v - spec.from ) / units ) * innerW;
	const rows = spec.marks.length ? Math.max( 1, spec.marks.length ) : 0;
	const markRowH = fs * 1.9;
	const top = rows ? rows * markRowH + fs * 0.6 : 0;
	const parts = [];
	parts.push(
		`<rect x="0" y="${ r( top ) }" width="${ r( width ) }" height="${ r(
			bodyH
		) }" rx="${ r(
			6 * scale
		) }" fill="${ bg }" stroke="${ ink }" stroke-width="${ r(
			2 * scale
		) }"/>`
	);
	const sub = 'in' === spec.unit ? 4 : 'mm' === spec.unit ? 1 : 10;
	const minorLen = bodyH * 0.22;
	const midLen = bodyH * 0.34;
	const majorLen = bodyH * 0.5;
	const total = Math.round( units * sub );
	for ( let k = 0; k <= total; k++ ) {
		const v = spec.from + k / sub;
		const x = px( v );
		const major = 0 === k % sub;
		const mid = ! major && 10 === sub && 0 === k % 5;
		const len = major ? majorLen : mid ? midLen : minorLen;
		parts.push(
			`<line x1="${ r( x ) }" y1="${ r( top ) }" x2="${ r(
				x
			) }" y2="${ r( top + len ) }" stroke="${ ink }" stroke-width="${ r(
				( major ? 2 : mid ? 1.4 : 1 ) * scale
			) }"/>`
		);
		if ( major ) {
			parts.push(
				textEl( x, top + bodyH - fs * 0.35, fmt( v ), {
					size: r( fs ),
					font,
					fill: ink,
					anchor: 'middle',
				} )
			);
		}
	}
	parts.push(
		textEl( px( spec.to ) + fs * 0.9, top + bodyH - fs * 0.35, spec.unit, {
			size: r( fs * 0.85 ),
			font,
			fill: ink,
		} )
	);
	spec.marks.forEach( ( m, i ) => {
		const y = top - fs * 0.6 - i * markRowH - fs * 0.5;
		const x1 = px( m.from );
		const x2 = px( m.to );
		if ( m.to > m.from ) {
			parts.push(
				`<line x1="${ r( x1 ) }" y1="${ r( y ) }" x2="${ r(
					x2
				) }" y2="${ r( y ) }" stroke="${ accent }" stroke-width="${ r(
					2.5 * scale
				) }"/>`
			);
			for ( const x of [ x1, x2 ] ) {
				parts.push(
					`<line x1="${ r( x ) }" y1="${ r(
						y - fs * 0.45
					) }" x2="${ r( x ) }" y2="${ r(
						y + fs * 0.45
					) }" stroke="${ accent }" stroke-width="${ r(
						2.5 * scale
					) }"/>`
				);
			}
			if ( m.label ) {
				parts.push(
					textEl( ( x1 + x2 ) / 2, y - fs * 0.6, m.label, {
						size: r( fs ),
						font,
						fill: accent,
						anchor: 'middle',
					} )
				);
			}
		} else {
			parts.push(
				`<circle cx="${ r( x1 ) }" cy="${ r( y ) }" r="${ r(
					fs * 0.28
				) }" fill="${ accent }"/>`
			);
			parts.push(
				`<line x1="${ r( x1 ) }" y1="${ r( y ) }" x2="${ r(
					x1
				) }" y2="${ r( top ) }" stroke="${ accent }" stroke-width="${ r(
					1.5 * scale
				) }" stroke-dasharray="4 3"/>`
			);
			if ( m.label ) {
				parts.push(
					textEl( x1, y - fs * 0.6, m.label, {
						size: r( fs ),
						font,
						fill: accent,
						anchor: 'middle',
					} )
				);
			}
		}
	} );
	return {
		inner: parts.join( '' ),
		w: r( width ),
		h: r( top + bodyH ),
		warnings: [],
	};
}
