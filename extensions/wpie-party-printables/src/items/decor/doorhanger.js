/** Door hanger: a tall card with a hole for the handle, a message on it. */
import {
	bg,
	outline,
	patternIn,
	motifAt,
	label,
	cardFrame,
} from '../common.js';
import { r } from '../../engine/units.js';

export const ITEM = {
	id: 'doorhanger',
	label: 'Door hanger',
	hint: 'A hanger for the door handle with a message: party inside, do not disturb, the birthday kid sleeps here.',
	group: 'decor',
	uses: { text: 'lines', names: false, photo: 'none', event: [] },
	textLabel: 'The message, one line each',
	placeholder: 'Party\nin progress',
	sizes: [
		{ label: '90 x 230 mm (2 per A4)', w: 90, h: 230 },
		{ label: '100 x 260 mm', w: 100, h: 260 },
		{ label: '75 x 200 mm', w: 75, h: 200 },
	],
	repeat: true,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const w = item.w || 90;
		const h = item.h || 230;
		const n = Math.max( 1, item.count || 2 );
		const holeD = Math.min( 40, w * 0.5 );
		const pieces = [ ...Array( n ) ].map( ( _, i ) => {
			const rx = w * 0.15;
			const d = `M${ r( rx ) } 0H${ r( w - rx ) }A${ r( rx ) } ${ r(
				rx
			) } 0 0 1 ${ r( w ) } ${ r( rx ) }V${ r( h - rx ) }A${ r(
				rx
			) } ${ r( rx ) } 0 0 1 ${ r( w - rx ) } ${ r( h ) }H${ r(
				rx
			) }A${ r( rx ) } ${ r( rx ) } 0 0 1 0 ${ r( h - rx ) }V${ r(
				rx
			) }A${ r( rx ) } ${ r( rx ) } 0 0 1 ${ r( rx ) } 0Z`;
			const shape = {
				d,
				pts: [
					[ 0, 0 ],
					[ w, 0 ],
					[ w, h ],
					[ 0, h ],
				],
				w,
				h,
			};
			const parts = [
				cardFrame( shape, theme, {
					band: 'bottom',
					bandSize: h * 0.16,
					seed: 230 + i,
				} ),
			];
			// The handle hole with a slit to the top edge.
			const cy = holeD * 0.55 + w * 0.12;
			parts.push(
				`<circle cx="${ r( w / 2 ) }" cy="${ r( cy ) }" r="${ r(
					holeD / 2
				) }" fill="#ffffff" stroke="${
					theme.colors.ink
				}" stroke-width="0.3"/>`
			);
			parts.push(
				`<line x1="${ r( w / 2 ) }" y1="0" x2="${ r(
					w / 2
				) }" y2="${ r( cy - holeD / 2 ) }" stroke="${
					theme.colors.ink
				}" stroke-width="0.3"/>`
			);
			let y = cy + holeD / 2 + h * 0.03;
			if ( false !== item.motif && theme.motif ) {
				const size = w * 0.4;
				parts.push(
					motifAt( theme.motif, w / 2 - size / 2, y, size, theme )
				);
				y += size + h * 0.02;
			}
			parts.push(
				label(
					item.text || '',
					{ x: w * 0.1, y, w: w * 0.8, h: h * 0.8 - y },
					{
						font: theme.displayFont,
						weight: 700,
						color: theme.colors.ink,
						maxSize: w * 0.22,
					},
					env
				)
			);
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return { inner: parts.join( '' ), w, h };
		} );
		void bg;
		void patternIn;
		return { pieces, warnings: [] };
	},
};
