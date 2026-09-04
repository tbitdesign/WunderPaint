/** SVG builders: chord diagram, fretboard map, keyboard. Strings only, attributes only. */
import { escapeXml, r } from './svg.js';
import { noteToMidi } from './voicings.js';
import { spell, NOTE_NAMES_SHARP } from './chords.js';
import { intervalLabel } from './scales.js';

const circle = ( cx, cy, rad, fill, extra = '' ) =>
	`<circle cx="${ r( cx ) }" cy="${ r( cy ) }" r="${ r(
		rad
	) }" fill="${ fill }"${ extra }/>`;
const line = ( x1, y1, x2, y2, stroke, w ) =>
	`<line x1="${ r( x1 ) }" y1="${ r( y1 ) }" x2="${ r( x2 ) }" y2="${ r(
		y2
	) }" stroke="${ stroke }" stroke-width="${ r(
		w
	) }" stroke-linecap="round"/>`;
const text = ( x, y, s, size, fill, font, weight = 400, anchor = 'middle' ) =>
	`<text x="${ r( x ) }" y="${ r( y ) }" font-family="${ escapeXml(
		font
	) }" font-size="${ size }" font-weight="${ weight }" fill="${ fill }" text-anchor="${ anchor }">${ escapeXml(
		s
	) }</text>`;

/** Contrast text colour for a dot. */
const onDot = ( fill ) => {
	const n = parseInt( String( fill ).replace( '#', '' ), 16 );
	const l =
		0.299 * ( ( n >> 16 ) & 255 ) +
		0.587 * ( ( n >> 8 ) & 255 ) +
		0.114 * ( n & 255 );
	return l > 150 ? '#111111' : '#ffffff';
};

/**
 * One chord diagram: nut or base fret, five frets, dots with fingers,
 * open and muted marks above, the name on top. Returns an svg string of
 * `size` x `size * 1.3`.
 */
export function svgChordDiagram(
	sh,
	{
		name = '',
		strings,
		size = 180,
		ink = '#111',
		accent = '#8d1436',
		font = 'Arial',
		showFingers = true,
		bg = null,
	} = {}
) {
	const n = strings || sh.frets.length;
	const W = size;
	const H = size * 1.3;
	const top = size * 0.34;
	const left = size * 0.16;
	const right = size * 0.9;
	const gridW = right - left;
	const fretH = ( H - top - size * 0.1 ) / 5;
	const sx = ( i ) => left + ( gridW * i ) / ( n - 1 );
	const fretted = sh.frets.filter( ( f ) => f > 0 );
	const maxF = fretted.length ? Math.max( ...fretted ) : 0;
	const minF = fretted.length ? Math.min( ...fretted ) : 1;
	const base = maxF <= 5 ? 1 : minF;
	const out = [];
	if ( bg ) {
		out.push(
			`<rect x="0" y="0" width="${ W }" height="${ H }" fill="${ bg }"/>`
		);
	}
	out.push( text( W / 2, size * 0.16, name, size * 0.13, ink, font, 700 ) );
	// Frets and strings.
	for ( let f = 0; f <= 5; f++ ) {
		const y = top + f * fretH;
		const nut = 0 === f && 1 === base;
		out.push(
			line( left, y, right, y, ink, nut ? size * 0.028 : size * 0.008 )
		);
	}
	for ( let i = 0; i < n; i++ ) {
		out.push(
			line( sx( i ), top, sx( i ), top + 5 * fretH, ink, size * 0.008 )
		);
	}
	if ( base > 1 ) {
		out.push(
			text(
				right + size * 0.04,
				top + fretH * 0.62,
				base + 'fr',
				size * 0.085,
				ink,
				font,
				400,
				'start'
			)
		);
	}
	// Barre.
	if ( sh.barre ) {
		const fy = top + ( sh.barre.fret - base + 0.5 ) * fretH;
		out.push(
			`<rect x="${ r( sx( sh.barre.from ) - size * 0.05 ) }" y="${ r(
				fy - size * 0.05
			) }" width="${ r(
				sx( sh.barre.to ) - sx( sh.barre.from ) + size * 0.1
			) }" height="${ r( size * 0.1 ) }" rx="${ r(
				size * 0.05
			) }" fill="${ accent }"/>`
		);
	}
	// Dots, open and muted marks.
	sh.frets.forEach( ( f, i ) => {
		const x = sx( i );
		if ( f < 0 ) {
			const s = size * 0.035;
			const y = top - size * 0.07;
			out.push(
				line( x - s, y - s, x + s, y + s, ink, size * 0.012 ) +
					line( x - s, y + s, x + s, y - s, ink, size * 0.012 )
			);
		} else if ( 0 === f ) {
			out.push(
				`<circle cx="${ r( x ) }" cy="${ r(
					top - size * 0.07
				) }" r="${ r(
					size * 0.035
				) }" fill="none" stroke="${ ink }" stroke-width="${ r(
					size * 0.012
				) }"/>`
			);
		} else {
			const y = top + ( f - base + 0.5 ) * fretH;
			const inBarre =
				sh.barre &&
				f === sh.barre.fret &&
				i >= sh.barre.from &&
				i <= sh.barre.to;
			if ( ! inBarre ) {
				out.push( circle( x, y, size * 0.055, accent ) );
			}
			const fi = sh.fingers && sh.fingers[ i ];
			if ( showFingers && fi ) {
				out.push(
					text(
						x,
						y + size * 0.028,
						String( fi ),
						size * 0.075,
						onDot( accent ),
						font,
						700
					)
				);
			}
		}
	} );
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${ W }" height="${ r(
		H
	) }" viewBox="0 0 ${ W } ${ r( H ) }">${ out.join( '' ) }</svg>`;
}

/**
 * A horizontal neck from fret `from` to `to`, low string at the bottom,
 * every position of `notes` marked. notes: [{ pc, root?, label? }].
 */
export function svgFretboard(
	notes,
	{
		tuning,
		from = 0,
		to = 12,
		labels = 'names',
		rootPc = null,
		ink = '#111',
		accent = '#8d1436',
		font = 'Arial',
		width = 1400,
		prefer = 'sharp',
		bg = null,
		scaleOrder = null,
	} = {}
) {
	const n = tuning.length;
	const open = tuning.map( ( t ) => noteToMidi( t ) );
	const rowH = Math.round( width / 28 );
	const left = width * 0.05;
	const right = width * 0.98;
	const top = rowH * 1.2;
	const nFrets = to - from;
	const fretW = ( right - left ) / nFrets;
	const H = top + ( n - 1 ) * rowH + rowH * 1.6;
	const sy = ( i ) => top + ( n - 1 - i ) * rowH; // low string bottom
	const out = [];
	if ( bg ) {
		out.push(
			`<rect x="0" y="0" width="${ width }" height="${ r(
				H
			) }" fill="${ bg }"/>`
		);
	}
	// Board and frets.
	out.push(
		`<rect x="${ r( left ) }" y="${ r( top - rowH * 0.5 ) }" width="${ r(
			right - left
		) }" height="${ r(
			( n - 1 ) * rowH + rowH
		) }" fill="none" stroke="${ ink }" stroke-width="2"/>`
	);
	for ( let f = 0; f <= nFrets; f++ ) {
		const x = left + f * fretW;
		const isNut = 0 === from && 0 === f;
		out.push(
			line(
				x,
				top - rowH * 0.5,
				x,
				top + ( n - 0.5 ) * rowH,
				ink,
				isNut ? 8 : 2
			)
		);
	}
	for ( const m of [ 3, 5, 7, 9, 12, 15, 17, 19, 21, 24 ] ) {
		if ( m > from && m <= to ) {
			const x = left + ( m - from - 0.5 ) * fretW;
			const yMid = top + ( ( n - 1 ) * rowH ) / 2;
			if ( 0 === m % 12 ) {
				out.push(
					circle(
						x,
						yMid - rowH,
						rowH * 0.16,
						ink,
						' opacity="0.25"'
					) +
						circle(
							x,
							yMid + rowH,
							rowH * 0.16,
							ink,
							' opacity="0.25"'
						)
				);
			} else {
				out.push(
					circle( x, yMid, rowH * 0.16, ink, ' opacity="0.25"' )
				);
			}
		}
	}
	// String names left of the nut; when the open string is in the set,
	// the dot takes that place (drawn with the notes below).
	const inSet = new Set( notes.map( ( x ) => x.pc ) );
	for ( let i = 0; i < n; i++ ) {
		out.push(
			line( left, sy( i ), right, sy( i ), ink, 1 + ( n - 1 - i ) * 0.5 )
		);
		if ( ! ( 0 === from && inSet.has( open[ i ] % 12 ) ) ) {
			out.push(
				text(
					left - rowH * 0.55,
					sy( i ) + rowH * 0.14,
					spell( open[ i ] % 12, prefer ),
					rowH * 0.42,
					ink,
					font,
					400,
					'middle'
				)
			);
		}
	}
	for ( let f = from; f <= to; f++ ) {
		if ( f > 0 ) {
			out.push(
				text(
					left + ( f - from - 0.5 ) * fretW,
					top + ( n - 0.5 ) * rowH + rowH * 0.7,
					String( f ),
					rowH * 0.38,
					ink,
					font,
					400
				)
			);
		}
	}
	// Notes.
	const byPc = new Map( notes.map( ( x, idx ) => [ x.pc, { ...x, idx } ] ) );
	for ( let i = 0; i < n; i++ ) {
		for ( let f = from; f <= to; f++ ) {
			const pc = ( open[ i ] + f ) % 12;
			const hit = byPc.get( pc );
			if ( ! hit ) {
				continue;
			}
			const x =
				0 === f
					? left - rowH * 0.55
					: left + ( f - from - 0.5 ) * fretW;
			const y = sy( i );
			const isRoot = hit.root || ( rootPc !== null && pc === rootPc );
			const fill = isRoot ? accent : ink;
			let label = hit.label;
			if ( ! label ) {
				if ( 'intervals' === labels && rootPc !== null ) {
					label = intervalLabel( pc - rootPc );
				} else if ( 'degrees' === labels && scaleOrder ) {
					label = String( scaleOrder.indexOf( pc ) + 1 );
				} else {
					label = spell( pc, prefer );
				}
			}
			out.push( circle( x, y, rowH * 0.36, fill ) );
			out.push(
				text(
					x,
					y + rowH * 0.13,
					label,
					rowH * 0.32,
					onDot( fill ),
					font,
					700
				)
			);
		}
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${ width }" height="${ r(
		H
	) }" viewBox="0 0 ${ width } ${ r( H ) }">${ out.join( '' ) }</svg>`;
}

/** A keyboard with the marked keys in accent and their names below. */
export function svgPiano(
	keys,
	{
		width = 800,
		ink = '#111',
		accent = '#8d1436',
		font = 'Arial',
		bg = null,
	} = {}
) {
	const whites = keys.filter( ( k ) => ! k.black );
	const kw = width / whites.length;
	const kh = kw * 4.4;
	const labelH = kw * 0.9;
	const H = kh + labelH + 4;
	const out = [];
	if ( bg ) {
		out.push(
			`<rect x="0" y="0" width="${ width }" height="${ r(
				H
			) }" fill="${ bg }"/>`
		);
	}
	// White keys.
	let wi = 0;
	const whiteX = new Map();
	for ( const k of keys ) {
		if ( k.black ) {
			continue;
		}
		const x = wi * kw;
		whiteX.set( k.midi, x );
		const fill = k.on
			? k.root
				? accent
				: mix( accent, '#ffffff', 0.55 )
			: '#ffffff';
		out.push(
			`<rect x="${ r( x ) }" y="0" width="${ r( kw ) }" height="${ r(
				kh
			) }" fill="${ fill }" stroke="${ ink }" stroke-width="1.5"/>`
		);
		if ( k.on ) {
			out.push(
				text(
					x + kw / 2,
					kh + labelH * 0.75,
					k.label,
					labelH * 0.6,
					ink,
					font,
					700
				)
			);
		}
		wi++;
	}
	// Black keys sit between the white keys before and after them.
	for ( let idx = 0; idx < keys.length; idx++ ) {
		const k = keys[ idx ];
		if ( ! k.black ) {
			continue;
		}
		const prev = keys[ idx - 1 ];
		const x = ( prev ? whiteX.get( prev.midi ) : 0 ) + kw * 0.65;
		const bw = kw * 0.62;
		const fill = k.on ? accent : '#1a1a1a';
		out.push(
			`<rect x="${ r( x ) }" y="0" width="${ r( bw ) }" height="${ r(
				kh * 0.62
			) }" fill="${ fill }" stroke="${ ink }" stroke-width="1"/>`
		);
		if ( k.on ) {
			out.push(
				text(
					x + bw / 2,
					kh * 0.62 - labelH * 0.35,
					k.label,
					labelH * 0.5,
					'#ffffff',
					font,
					700
				)
			);
		}
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${ width }" height="${ r(
		H
	) }" viewBox="0 0 ${ width } ${ r( H ) }">${ out.join( '' ) }</svg>`;
}

function mix( a, b, t ) {
	const pa = parseInt( a.replace( '#', '' ), 16 );
	const pb = parseInt( b.replace( '#', '' ), 16 );
	const c = ( sh ) =>
		Math.round(
			( ( pa >> sh ) & 255 ) * ( 1 - t ) + ( ( pb >> sh ) & 255 ) * t
		);
	return (
		'#' +
		[ 16, 8, 0 ]
			.map( ( sh ) => c( sh ).toString( 16 ).padStart( 2, '0' ) )
			.join( '' )
	);
}

export { NOTE_NAMES_SHARP };
