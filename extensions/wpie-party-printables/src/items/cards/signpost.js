/** Signpost: arrow-shaped signs, one per line of text, pointing left or right. */
import { cardFrame, label, motifAt, outline, patternIn } from '../common.js';
import { r } from '../../engine/units.js';

export const SIGN_DIRECTIONS = [
	{ value: 'right', label: 'Pointing right' },
	{ value: 'left', label: 'Pointing left' },
	{ value: 'both', label: 'Alternating' },
];

function arrowShape( w, h, dir ) {
	const tip = h / 2;
	const pts =
		'left' === dir
			? [
					[ tip, 0 ],
					[ w, 0 ],
					[ w, h ],
					[ tip, h ],
					[ 0, h / 2 ],
			  ]
			: [
					[ 0, 0 ],
					[ w - tip, 0 ],
					[ w, h / 2 ],
					[ w - tip, h ],
					[ 0, h ],
			  ];
	return {
		d:
			'M' +
			pts.map( ( p ) => r( p[ 0 ] ) + ' ' + r( p[ 1 ] ) ).join( 'L' ) +
			'Z',
		pts,
		w,
		h,
	};
}

export const ITEM = {
	id: 'signpost',
	label: 'Signpost',
	hint: 'Arrow signs that point the way: one sign per line, pointing left or right.',
	group: 'cards',
	uses: { text: 'lines', names: false, photo: 'none', event: [] },
	textLabel: 'One sign per line',
	placeholder: 'Party\nRestrooms\nParking\nPhoto corner',
	sizes: [
		{ label: '190 x 70 mm (3 per A4)', w: 190, h: 70 },
		{ label: '270 x 90 mm (A3 or A4 landscape)', w: 270, h: 90 },
		{ label: '140 x 50 mm', w: 140, h: 50 },
	],
	repeat: false,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const w = item.w || 190;
		const h = item.h || 70;
		const lines = String( item.text || '' )
			.split( '\n' )
			.map( ( s ) => s.trim() )
			.filter( Boolean );
		const pieces = ( lines.length ? lines : [ 'Party' ] ).map(
			( text, i ) => {
				const dir =
					'both' === item.direction
						? i % 2
							? 'left'
							: 'right'
						: item.direction || 'right';
				const shape = arrowShape( w, h, dir );
				const parts = [ cardFrame( shape, theme, {} ) ];
				parts.push(
					`<path d="${ shape.d }" fill="${ theme.colors.primary }"/>`
				);
				if ( false !== item.pattern ) {
					parts.push(
						patternIn( shape, theme, {
							seed: 40 + i,
							opacity: 0.2,
							scale: 0.7,
						} )
					);
				}
				const tip = h / 2;
				const x0 = 'left' === dir ? tip + w * 0.04 : w * 0.04;
				let tw = w - tip - w * 0.08;
				if ( false !== item.motif && theme.motif ) {
					const size = h * 0.5;
					parts.push(
						motifAt(
							theme.motif,
							'left' === dir ? w - size - w * 0.04 : x0,
							h * 0.25,
							size,
							theme,
							{ on: theme.colors.primary }
						)
					);
					tw -= size + w * 0.02;
				}
				const textX =
					'left' === dir
						? x0
						: x0 +
						  ( false !== item.motif && theme.motif
								? h * 0.5 + w * 0.02
								: 0 );
				parts.push(
					label(
						text,
						{ x: textX, y: h * 0.2, w: tw, h: h * 0.6 },
						{
							font: theme.displayFont,
							weight: 700,
							color: theme.colors.bg,
							maxSize: h * 0.42,
						},
						env
					)
				);
				parts.push( outline( shape, theme.colors.ink, 0.25 ) );
				return { inner: parts.join( '' ), w, h };
			}
		);
		return { pieces, warnings: [] };
	},
};
