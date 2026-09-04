/**
 * Hundred square and dot fields: `field 100 | 20 | 10`, `mark 7 14 21
 * [#color]` tints cells (one colour per line), `hide 5 6` empties cells,
 * `dots 13` draws dots instead of numbers, coloured in fives. The 20 and
 * 10 fields get a wider gap after the fifth column.
 */
import { textEl, r } from './svg.js';

const PALETTE = [ null, '#1f6feb', '#2e8b57', '#e08a00', '#8e44ad' ];

const normHex = ( c ) => {
	const s = String( c || '' )
		.trim()
		.toLowerCase();
	if ( /^#[0-9a-f]{6}$/.test( s ) ) {
		return s;
	}
	const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec( s );
	return m ? '#' + m[ 1 ] + m[ 1 ] + m[ 2 ] + m[ 2 ] + m[ 3 ] + m[ 3 ] : null;
};

export function parseHundred( text ) {
	const spec = { field: 100, marks: [], hide: new Set(), dots: null };
	const errors = [];
	String( text || '' )
		.split( '\n' )
		.forEach( ( raw, i ) => {
			const line = raw.trim();
			if ( ! line ) {
				return;
			}
			const [ cmd, ...rest ] = line.split( /\s+/ );
			const nums = rest
				.filter( ( tk ) => /^\d+$/.test( tk ) )
				.map( Number );
			const color = rest.map( normHex ).find( Boolean ) || null;
			switch ( cmd.toLowerCase() ) {
				case 'field':
					if (
						1 === nums.length &&
						[ 10, 20, 100 ].includes( nums[ 0 ] )
					) {
						spec.field = nums[ 0 ];
					} else {
						errors.push( {
							line: i + 1,
							message: 'field takes 10, 20 or 100',
						} );
					}
					break;
				case 'mark':
					if ( nums.length ) {
						spec.marks.push( { nums, color } );
					} else {
						errors.push( {
							line: i + 1,
							message: 'mark needs numbers',
						} );
					}
					break;
				case 'hide':
					nums.forEach( ( n ) => spec.hide.add( n ) );
					break;
				case 'dots':
					if ( 1 === nums.length ) {
						spec.dots = nums[ 0 ];
					} else {
						errors.push( {
							line: i + 1,
							message: 'dots needs one number',
						} );
					}
					break;
				default:
					errors.push( {
						line: i + 1,
						message: 'Commands: field, mark, hide, dots',
					} );
			}
		} );
	return { spec, errors };
}

export function renderHundred( spec, o ) {
	const scale = o.scale || 1;
	const width = o.width || 1000;
	const ink = o.ink || '#000';
	const accent = o.accent || ink;
	const bg = o.bg || '#ffffff';
	const font = o.font || 'Arial';
	const field = spec.field || 100;
	const rows = field / 10;
	const split = field < 100;
	const cell = Math.min( width / ( split ? 10.5 : 10 ), 70 * scale );
	const gap5 = split ? cell * 0.5 : 0;
	const fs = cell * 0.36;
	const showNumbers = false !== o.numbers && null === spec.dots;
	const tint = new Map();
	spec.marks.forEach( ( m, i ) => {
		const color = m.color || PALETTE[ i % PALETTE.length ] || accent;
		m.nums.forEach( ( n ) => tint.set( n, color ) );
	} );
	const parts = [];
	for ( let n = 1; n <= field; n++ ) {
		const row = Math.floor( ( n - 1 ) / 10 );
		const col = ( n - 1 ) % 10;
		const x = col * cell + ( split && col >= 5 ? gap5 : 0 );
		const y = row * cell;
		parts.push(
			`<rect x="${ r( x ) }" y="${ r( y ) }" width="${ r(
				cell
			) }" height="${ r(
				cell
			) }" fill="${ bg }" stroke="${ ink }" stroke-width="${ r(
				1.2 * scale
			) }"/>`
		);
		if ( tint.has( n ) ) {
			parts.push(
				`<rect x="${ r( x ) }" y="${ r( y ) }" width="${ r(
					cell
				) }" height="${ r( cell ) }" fill="${ tint.get(
					n
				) }" fill-opacity="0.35"/>`
			);
		}
		if ( null !== spec.dots ) {
			if ( n <= spec.dots ) {
				parts.push(
					`<circle cx="${ r( x + cell / 2 ) }" cy="${ r(
						y + cell / 2
					) }" r="${ r( cell * 0.32 ) }" fill="${
						col < 5 ? accent : '#1f6feb'
					}"/>`
				);
			}
		} else if ( showNumbers && ! spec.hide.has( n ) ) {
			parts.push(
				textEl( x + cell / 2, y + cell / 2 + fs * 0.35, String( n ), {
					size: r( fs ),
					font,
					fill: ink,
					anchor: 'middle',
				} )
			);
		}
	}
	return {
		inner: parts.join( '' ),
		w: r( 10 * cell + gap5 ),
		h: r( rows * cell ),
		warnings: [],
	};
}
