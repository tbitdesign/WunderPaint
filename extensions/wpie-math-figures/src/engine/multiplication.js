/**
 * Multiplication: `table 1..10` (a full square), `row 7` or `rows 6 7 8`
 * (vertical lists of facts), `hide 3x4 5x6` empties table cells, `hide 3
 * 5` the answers of those facts in a list, `hide all` every answer.
 */
import { textEl, r } from './svg.js';

export function parseMultiplication( text ) {
	const spec = {
		mode: 'table',
		from: 1,
		to: 10,
		rows: [],
		hide: [],
		hideAll: false,
	};
	const errors = [];
	String( text || '' )
		.split( '\n' )
		.forEach( ( raw, i ) => {
			const line = raw.trim();
			if ( ! line ) {
				return;
			}
			const [ cmd, ...rest ] = line.split( /\s+/ );
			switch ( cmd.toLowerCase() ) {
				case 'table': {
					const m = /^(\d+)\.\.(\d+)$/.exec( rest[ 0 ] || '1..10' );
					if ( ! m || +m[ 2 ] < +m[ 1 ] || +m[ 2 ] - +m[ 1 ] > 19 ) {
						errors.push( {
							line: i + 1,
							message: 'table takes a range like 1..10',
						} );
					} else {
						spec.mode = 'table';
						spec.from = +m[ 1 ];
						spec.to = +m[ 2 ];
					}
					break;
				}
				case 'row':
				case 'rows': {
					const nums = rest
						.filter( ( tk ) => /^\d+$/.test( tk ) )
						.map( Number );
					if ( ! nums.length ) {
						errors.push( {
							line: i + 1,
							message: 'row needs a number',
						} );
					} else {
						spec.mode = 'rows';
						spec.rows = nums;
					}
					break;
				}
				case 'hide':
					if ( rest.some( ( tk ) => 'all' === tk.toLowerCase() ) ) {
						spec.hideAll = true;
					}
					spec.hide.push(
						...rest
							.filter( ( tk ) => /^\d+(x\d+)?$/i.test( tk ) )
							.map( ( tk ) => tk.toLowerCase() )
					);
					break;
				default:
					errors.push( {
						line: i + 1,
						message:
							'Commands: table 1..10, row 7, rows 6 7 8, hide 3x4, hide all',
					} );
			}
		} );
	return { spec, errors };
}

export function renderMultiplication( spec, o ) {
	const scale = o.scale || 1;
	const width = o.width || 1000;
	const ink = o.ink || '#000';
	const accent = o.accent || ink;
	const bg = o.bg || '#ffffff';
	const font = o.font || 'Arial';
	const parts = [];
	if ( 'rows' === spec.mode ) {
		const fs = ( o.size || 22 ) * 1.15;
		const lineH = fs * 1.5;
		const colW = Math.min( width / spec.rows.length, fs * 12 );
		const hidden = new Set( spec.hide );
		spec.rows.forEach( ( n, c ) => {
			for ( let k = 1; k <= 10; k++ ) {
				const open = spec.hideAll || hidden.has( String( k ) );
				parts.push(
					textEl(
						c * colW,
						k * lineH,
						`${ n } · ${ k } =` + ( open ? '' : ` ${ n * k }` ),
						{ size: r( fs ), font, fill: ink }
					)
				);
			}
		} );
		return {
			inner: parts.join( '' ),
			w: r( Math.min( width, spec.rows.length * colW ) ),
			h: r( 10 * lineH + fs * 0.4 ),
			warnings: [],
		};
	}
	const n = spec.to - spec.from + 1;
	const cell = Math.min( width / ( n + 1 ), 64 * scale );
	const fs = cell * 0.38;
	const hidden = new Set( spec.hide );
	const cellAt = ( i, j, txt, head ) => {
		const x = j * cell;
		const y = i * cell;
		parts.push(
			`<rect x="${ r( x ) }" y="${ r( y ) }" width="${ r(
				cell
			) }" height="${ r( cell ) }" fill="${ head ? accent : bg }"${
				head ? ' fill-opacity="0.18"' : ''
			} stroke="${ ink }" stroke-width="${ head ? 1.4 : 0.8 }"/>`
		);
		if ( txt ) {
			parts.push(
				textEl( x + cell / 2, y + cell / 2 + fs * 0.35, txt, {
					size: r( fs ),
					font,
					fill: ink,
					weight: head ? 700 : 400,
					anchor: 'middle',
				} )
			);
		}
	};
	cellAt( 0, 0, '×', true );
	for ( let j = 1; j <= n; j++ ) {
		cellAt( 0, j, String( spec.from + j - 1 ), true );
	}
	for ( let i = 1; i <= n; i++ ) {
		const a = spec.from + i - 1;
		cellAt( i, 0, String( a ), true );
		for ( let j = 1; j <= n; j++ ) {
			const b = spec.from + j - 1;
			const open = spec.hideAll || hidden.has( a + 'x' + b );
			cellAt( i, j, open ? '' : String( a * b ), false );
		}
	}
	return {
		inner: parts.join( '' ),
		w: r( ( n + 1 ) * cell ),
		h: r( ( n + 1 ) * cell ),
		warnings: [],
	};
}
