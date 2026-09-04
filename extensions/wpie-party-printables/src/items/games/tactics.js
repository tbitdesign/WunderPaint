/**
 * Tactics board: a field per sport with players, runs, passes and the
 * ball from the lines, coordinates in percent of the field:
 *   X 20 50      home player (X7 20 50 numbers it)
 *   O 60 40      opponent
 *   > 20 50 40 30   run (solid arrow)
 *   ~ 20 50 60 50   pass (dashed arrow)
 *   * 50 50      ball
 */
import { SHAPES, bg, outline, arrow, label } from '../common.js';
import { textEl } from '../../engine/svg.js';

export const SPORTS = [
	{ value: 'football', label: 'Football (soccer)' },
	{ value: 'basketball', label: 'Basketball' },
	{ value: 'handball', label: 'Handball' },
	{ value: 'hockey', label: 'Hockey' },
	{ value: 'volleyball', label: 'Volleyball' },
];

export function parseTactics( text ) {
	const out = { players: [], runs: [], passes: [], balls: [], errors: [] };
	for ( const raw of String( text || '' ).split( '\n' ) ) {
		const line = raw.trim();
		if ( ! line || line.startsWith( '#' ) ) {
			continue;
		}
		const p = line.match(
			/^([XO])(\d{0,2})\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/i
		);
		if ( p ) {
			out.players.push( {
				side: p[ 1 ].toUpperCase(),
				number: p[ 2 ],
				x: +p[ 3 ],
				y: +p[ 4 ],
			} );
			continue;
		}
		const a = line.match(
			/^([>~])\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/
		);
		if ( a ) {
			( '>' === a[ 1 ] ? out.runs : out.passes ).push( [
				+a[ 2 ],
				+a[ 3 ],
				+a[ 4 ],
				+a[ 5 ],
			] );
			continue;
		}
		const b = line.match( /^\*\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/ );
		if ( b ) {
			out.balls.push( [ +b[ 1 ], +b[ 2 ] ] );
			continue;
		}
		out.errors.push( line );
	}
	return out;
}

/* Field markings per sport, in a w x h box (mm). */
function field( sport, w, h, ink, line ) {
	const L = ( x1, y1, x2, y2, dash ) =>
		`<line x1="${ x1.toFixed( 2 ) }" y1="${ y1.toFixed(
			2
		) }" x2="${ x2.toFixed( 2 ) }" y2="${ y2.toFixed(
			2
		) }" stroke="${ ink }" stroke-width="${ line }"${
			dash ? ' stroke-dasharray="2 1.5"' : ''
		}/>`;
	const R = ( x, y, rw, rh ) =>
		`<rect x="${ x.toFixed( 2 ) }" y="${ y.toFixed(
			2
		) }" width="${ rw.toFixed( 2 ) }" height="${ rh.toFixed(
			2
		) }" fill="none" stroke="${ ink }" stroke-width="${ line }"/>`;
	const C = ( x, y, rad ) =>
		`<circle cx="${ x.toFixed( 2 ) }" cy="${ y.toFixed(
			2
		) }" r="${ rad.toFixed(
			2
		) }" fill="none" stroke="${ ink }" stroke-width="${ line }"/>`;
	const arc = ( cx, cy, rad, a0, a1 ) => {
		const pts = [];
		for ( let k = 0; k <= 24; k++ ) {
			const a = a0 + ( ( a1 - a0 ) * k ) / 24;
			pts.push(
				( cx + Math.cos( a ) * rad ).toFixed( 2 ) +
					' ' +
					( cy + Math.sin( a ) * rad ).toFixed( 2 )
			);
		}
		return `<path d="M${ pts.join(
			'L'
		) }" fill="none" stroke="${ ink }" stroke-width="${ line }"/>`;
	};
	const parts = [ R( 0, 0, w, h ) ];
	if ( 'football' === sport ) {
		parts.push( L( w / 2, 0, w / 2, h ), C( w / 2, h / 2, h * 0.14 ) );
		for ( const side of [ 0, 1 ] ) {
			const x = side ? w : 0;
			const dir = side ? -1 : 1;
			parts.push(
				R( side ? w - w * 0.16 : 0, h * 0.2, w * 0.16, h * 0.6 )
			);
			parts.push(
				R( side ? w - w * 0.055 : 0, h * 0.36, w * 0.055, h * 0.28 )
			);
			parts.push(
				R( side ? w : -w * 0.02, h * 0.44, w * 0.02, h * 0.12 )
			);
			parts.push(
				arc(
					x + dir * w * 0.11,
					h / 2,
					h * 0.14,
					side ? Math.PI * 0.6 : -Math.PI * 0.4,
					side ? Math.PI * 1.4 : Math.PI * 0.4
				)
			);
		}
	} else if ( 'basketball' === sport ) {
		parts.push( L( w / 2, 0, w / 2, h ), C( w / 2, h / 2, h * 0.12 ) );
		for ( const side of [ 0, 1 ] ) {
			const x = side ? w : 0;
			const dir = side ? -1 : 1;
			parts.push(
				R( side ? w - w * 0.2 : 0, h * 0.33, w * 0.2, h * 0.34 )
			);
			parts.push(
				arc(
					x + dir * w * 0.2,
					h / 2,
					h * 0.17,
					side ? Math.PI * 0.5 : -Math.PI * 0.5,
					side ? Math.PI * 1.5 : Math.PI * 0.5
				)
			);
			parts.push(
				arc(
					x + dir * w * 0.055,
					h / 2,
					h * 0.45,
					side ? Math.PI * 0.5 : -Math.PI * 0.5,
					side ? Math.PI * 1.5 : Math.PI * 0.5
				)
			);
			parts.push( C( x + dir * w * 0.055, h / 2, h * 0.02 ) );
		}
	} else if ( 'handball' === sport ) {
		parts.push( L( w / 2, 0, w / 2, h ) );
		for ( const side of [ 0, 1 ] ) {
			const x = side ? w : 0;
			const dir = side ? -1 : 1;
			parts.push(
				R( side ? w : -w * 0.02, h * 0.42, w * 0.02, h * 0.16 )
			);
			parts.push(
				arc(
					x,
					h * 0.42,
					w * 0.15,
					side ? Math.PI * 0.5 : -Math.PI * 0.5,
					side ? Math.PI : 0
				)
			);
			parts.push(
				arc(
					x,
					h * 0.58,
					w * 0.15,
					side ? Math.PI : 0,
					side ? Math.PI * 1.5 : Math.PI * 0.5
				)
			);
			parts.push(
				L( x + dir * w * 0.15, h * 0.42, x + dir * w * 0.15, h * 0.58 )
			);
			parts.push(
				L(
					x + dir * w * 0.225,
					h * 0.3,
					x + dir * w * 0.225,
					h * 0.7,
					true
				)
			);
		}
	} else if ( 'hockey' === sport ) {
		parts.push( L( w / 2, 0, w / 2, h ), C( w / 2, h / 2, h * 0.15 ) );
		for ( const side of [ 0, 1 ] ) {
			const x = side ? w - w * 0.25 : w * 0.25;
			parts.push( L( x, 0, x, h, true ) );
			for ( const y of [ h * 0.25, h * 0.75 ] ) {
				parts.push( C( side ? w - w * 0.16 : w * 0.16, y, h * 0.12 ) );
			}
			parts.push(
				R(
					side ? w - w * 0.05 : w * 0.03,
					h * 0.44,
					w * 0.02,
					h * 0.12
				)
			);
		}
	} else {
		parts.push( L( w / 2, 0, w / 2, h ) );
		parts.push(
			L( w / 3, 0, w / 3, h, true ),
			L( ( 2 * w ) / 3, 0, ( 2 * w ) / 3, h, true )
		);
	}
	return parts.join( '' );
}

export const ITEM = {
	id: 'tactics',
	label: 'Tactics board',
	hint: 'A field for football, basketball, handball, hockey or volleyball with players, runs, passes and the ball from the lines, for team cards and the coach.',
	group: 'games',
	uses: { text: 'lines', names: false, photo: 'none', event: [ 'title' ] },
	textLabel: 'X 20 50 player, O 60 40 opponent, > run, ~ pass, * ball',
	placeholder:
		'X1 6 50\nX4 25 30\nX5 25 70\nX8 45 50\nX9 60 40\nX11 60 60\nO 70 45\nO 75 55\n> 45 50 62 35\n~ 60 40 60 60\n* 60 40',
	sizes: [
		{ label: '180 x 120 mm (2 per A4)', w: 180, h: 120 },
		{ label: '270 x 180 mm (A4 landscape)', w: 270, h: 180 },
		{ label: '120 x 80 mm (4 per A4)', w: 120, h: 80 },
	],
	repeat: false,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const w = item.w || 180;
		const h = item.h || 120;
		const sport = item.sport || 'football';
		const parsed = parseTactics( item.text );
		const warnings = [];
		if ( parsed.errors.length ) {
			warnings.push(
				t( 'Some of the board text was not understood:' ) +
					' ' +
					parsed.errors.slice( 0, 3 ).join( ' / ' )
			);
		}
		const ink = theme.colors.ink;
		const titleH = item.title || ctx.event.title ? h * 0.1 : 0;
		const shape = SHAPES.rect( w, h + titleH );
		const parts = [ bg( shape, theme.colors.bg ) ];
		const pad = w * 0.04;
		const fw = w - 2 * pad;
		const fh = h - 2 * pad;
		const fx = pad;
		const fy = pad + titleH;
		parts.push(
			`<rect x="${ fx.toFixed( 2 ) }" y="${ fy.toFixed(
				2
			) }" width="${ fw.toFixed( 2 ) }" height="${ fh.toFixed(
				2
			) }" fill="${
				'basketball' === sport
					? theme.colors.secondary
					: theme.colors.primary
			}" fill-opacity="0.35"/>`
		);
		parts.push(
			`<g transform="translate(${ fx.toFixed( 2 ) } ${ fy.toFixed(
				2
			) })">${ field( sport, fw, fh, ink, 0.35 ) }</g>`
		);
		const X = ( px ) => fx + ( fw * px ) / 100;
		const Y = ( py ) => fy + ( fh * py ) / 100;
		const rad = Math.min( fw, fh ) * 0.035;
		for ( const run of parsed.runs ) {
			parts.push(
				arrow(
					X( run[ 0 ] ),
					Y( run[ 1 ] ),
					X( run[ 2 ] ),
					Y( run[ 3 ] ),
					{ width: rad * 0.25, color: ink }
				)
			);
		}
		for ( const pass of parsed.passes ) {
			parts.push(
				arrow(
					X( pass[ 0 ] ),
					Y( pass[ 1 ] ),
					X( pass[ 2 ] ),
					Y( pass[ 3 ] ),
					{
						width: rad * 0.22,
						color: theme.colors.accent,
						dashed: true,
					}
				)
			);
		}
		parsed.players.forEach( ( p, i ) => {
			const home = 'X' === p.side;
			parts.push(
				`<circle cx="${ X( p.x ).toFixed( 2 ) }" cy="${ Y(
					p.y
				).toFixed( 2 ) }" r="${ rad.toFixed( 2 ) }" fill="${
					home ? theme.colors.primary : theme.colors.accent
				}" stroke="${ ink }" stroke-width="0.3"/>`
			);
			const num =
				p.number ||
				( home
					? String(
							parsed.players.filter(
								( q, k ) => k <= i && 'X' === q.side
							).length
					  )
					: '' );
			if ( num ) {
				parts.push(
					textEl( X( p.x ), Y( p.y ) + rad * 0.38, num, {
						size: ( rad * 1.1 ).toFixed( 2 ),
						font: theme.textFont,
						weight: 700,
						fill: home ? theme.colors.bg : ink,
						anchor: 'middle',
					} )
				);
			}
		} );
		for ( const b of parsed.balls ) {
			parts.push(
				`<circle cx="${ X( b[ 0 ] ).toFixed( 2 ) }" cy="${ Y(
					b[ 1 ]
				).toFixed( 2 ) }" r="${ ( rad * 0.5 ).toFixed(
					2
				) }" fill="#ffffff" stroke="${ ink }" stroke-width="0.4"/>`
			);
		}
		if ( titleH ) {
			parts.push(
				label(
					item.title || ctx.event.title,
					{ x: pad, y: pad * 0.5, w: fw, h: titleH * 0.8 },
					{
						font: theme.displayFont,
						weight: 700,
						color: ink,
						maxSize: titleH * 0.55,
						align: 'start',
					},
					env
				)
			);
		}
		parts.push( outline( shape, ink, 0.25 ) );
		return {
			pieces: [ { inner: parts.join( '' ), w, h: h + titleH } ],
			warnings,
		};
	},
};
