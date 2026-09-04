/**
 * Clocks: one per line, `7:35`, `19:05:30`, `7:35 "Morning"`. A face with
 * sixty ticks, numbers (arabic, roman, none), hour and minute hands, an
 * optional second hand, an optional digital readout and a label. Several
 * clocks flow in rows at the block's width.
 */
import { textEl, r } from './svg.js';

const ROMAN = [
	'I',
	'II',
	'III',
	'IV',
	'V',
	'VI',
	'VII',
	'VIII',
	'IX',
	'X',
	'XI',
	'XII',
];
const pad2 = ( n ) => String( n ).padStart( 2, '0' );

export function parseClock( text ) {
	const clocks = [];
	const errors = [];
	String( text || '' )
		.split( '\n' )
		.forEach( ( raw, i ) => {
			let line = raw.trim();
			if ( ! line ) {
				return;
			}
			line = line.replace( /^time\s+/i, '' );
			// 7:35, 7.35, 7h35, 7 Uhr 35, 8 Uhr, 19:05:30, each with an optional "label".
			let label = '';
			line = line.replace( /\s*"([^"]*)"\s*$/, ( m, l ) => {
				label = l;
				return '';
			} );
			const m =
				/^(\d{1,2})(?:\s*(?:[:.h]|uhr)\s*(\d{1,2}))?(?:\s*[:.]\s*(\d{1,2}))?\s*(?:uhr|h)?$/i.exec(
					line
				);
			const h = m ? +m[ 1 ] : 99;
			const mi = m && m[ 2 ] ? +m[ 2 ] : 0;
			const sec = m && m[ 3 ] ? +m[ 3 ] : 0;
			if ( ! m || h > 23 || mi > 59 || sec > 59 ) {
				errors.push( {
					line: i + 1,
					message:
						'Expected a time like 7:35 or 19:05:30, optionally "label"',
				} );
				return;
			}
			clocks.push( { h, m: mi, s: sec, label } );
		} );
	return { clocks, errors };
}

export function renderClock( clocks, o ) {
	const scale = o.scale || 1;
	const size = o.clockSize || 220 * scale;
	const gap = 40 * scale;
	const width = o.width || 1200;
	const fs = o.size || 22;
	const font = o.font || 'Arial';
	const ink = o.ink || '#000';
	const accent = o.accent || ink;
	const bg = o.bg || '#ffffff';
	const numbers = o.numbers || 'numbers';
	const hands = false !== o.hands;
	const R = size / 2;
	const parts = [];
	const cols = Math.max( 1, Math.floor( ( width + gap ) / ( size + gap ) ) );
	const under =
		( o.digital ? fs * 1.7 : 0 ) +
		( clocks.some( ( c ) => c.label ) ? fs * 1.5 : 0 );
	const itemH = size + under;
	let usedCols = 0;
	clocks.forEach( ( c, i ) => {
		const col = i % cols;
		const row = Math.floor( i / cols );
		usedCols = Math.max( usedCols, col + 1 );
		const cx = col * ( size + gap ) + R;
		const cy = row * ( itemH + gap ) + R;
		parts.push(
			`<circle cx="${ r( cx ) }" cy="${ r( cy ) }" r="${ r(
				R - 2
			) }" fill="${ bg }" stroke="${ ink }" stroke-width="${ r(
				3 * scale
			) }"/>`
		);
		if ( 'none' !== numbers ) {
			for ( let k = 0; k < 60; k++ ) {
				const a = ( k * 6 * Math.PI ) / 180;
				const big = 0 === k % 5;
				const len = big ? R * 0.12 : R * 0.06;
				const x1 = cx + Math.sin( a ) * ( R * 0.95 );
				const y1 = cy - Math.cos( a ) * ( R * 0.95 );
				const x2 = cx + Math.sin( a ) * ( R * 0.95 - len );
				const y2 = cy - Math.cos( a ) * ( R * 0.95 - len );
				parts.push(
					`<line x1="${ r( x1 ) }" y1="${ r( y1 ) }" x2="${ r(
						x2
					) }" y2="${ r( y2 ) }" stroke="${ ink }" stroke-width="${ r(
						( big ? 3 : 1.5 ) * scale
					) }"/>`
				);
			}
		}
		if ( 'numbers' === numbers || 'roman' === numbers ) {
			const nfs = R * 0.19;
			for ( let n = 1; n <= 12; n++ ) {
				const a = ( n * 30 * Math.PI ) / 180;
				const x = cx + Math.sin( a ) * R * 0.68;
				const y = cy - Math.cos( a ) * R * 0.68 + nfs * 0.35;
				parts.push(
					textEl(
						x,
						y,
						'roman' === numbers ? ROMAN[ n - 1 ] : String( n ),
						{
							size: r( nfs ),
							font,
							fill: ink,
							weight: 700,
							anchor: 'middle',
						}
					)
				);
			}
		}
		if ( hands ) {
			const hand = ( deg, len, w, color ) => {
				const a = ( deg * Math.PI ) / 180;
				parts.push(
					`<line x1="${ r(
						cx - Math.sin( a ) * R * 0.08
					) }" y1="${ r( cy + Math.cos( a ) * R * 0.08 ) }" x2="${ r(
						cx + Math.sin( a ) * len
					) }" y2="${ r(
						cy - Math.cos( a ) * len
					) }" stroke="${ color }" stroke-width="${ r(
						w
					) }" stroke-linecap="round"/>`
				);
			};
			hand(
				( ( c.h % 12 ) + c.m / 60 + c.s / 3600 ) * 30,
				R * 0.52,
				R * 0.07,
				ink
			);
			hand( ( c.m + c.s / 60 ) * 6, R * 0.78, R * 0.045, ink );
			if ( o.seconds ) {
				hand( c.s * 6, R * 0.86, R * 0.018, accent );
			}
			parts.push(
				`<circle cx="${ r( cx ) }" cy="${ r( cy ) }" r="${ r(
					R * 0.05
				) }" fill="${ ink }"/>`
			);
		}
		let y = cy + R;
		if ( o.digital ) {
			y += fs * 1.35;
			const txt =
				pad2( c.h ) +
				':' +
				pad2( c.m ) +
				( o.seconds && c.s ? ':' + pad2( c.s ) : '' );
			parts.push(
				textEl( cx, y, txt, {
					size: r( fs * 1.15 ),
					font,
					fill: ink,
					weight: 700,
					anchor: 'middle',
				} )
			);
			y += fs * 0.35;
		}
		if ( c.label ) {
			y += fs * 1.2;
			parts.push(
				textEl( cx, y, c.label, {
					size: fs,
					font,
					fill: ink,
					anchor: 'middle',
				} )
			);
		}
	} );
	const rows = Math.ceil( clocks.length / cols );
	return {
		inner: parts.join( '' ),
		w: r( usedCols * size + Math.max( 0, usedCols - 1 ) * gap ),
		h: r( Math.max( 0, rows * itemH + ( rows - 1 ) * gap ) ),
		warnings: [],
	};
}
