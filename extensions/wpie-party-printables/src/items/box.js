/** Gift box: a cube dieline with glue flaps; artwork per face or across the net. */
import { SHAPES, patternIn, motifAt, image, label } from './common.js';

export const ITEM = {
	id: 'box',
	label: 'Gift box',
	hint: 'A cube box to cut, fold and glue, with the pattern or a photo on the faces.',
	group: 'gifts',
	uses: { text: true, names: false, photo: 'optional', event: [ 'title' ] },
	sizes: [
		{ label: '40 mm cube (A4)', size: 40 },
		{ label: '55 mm cube (A4 landscape)', size: 55 },
		{ label: '80 mm cube (A3)', size: 80 },
	],
	repeat: false,
	photoBox( item ) {
		const F = item.size || 40;
		return 'net' === item.span ? { w: 4 * F, h: 3 * F } : { w: F, h: F };
	},
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const F = item.size || 40;
		const flap = F * 0.2;
		const W = F * 4 + flap * 2;
		const H = F * 3 + flap * 2;
		const ox = flap;
		const oy = flap;
		const faces = [
			[ 1, 0 ],
			[ 0, 1 ],
			[ 1, 1 ],
			[ 2, 1 ],
			[ 3, 1 ],
			[ 1, 2 ],
		];
		const parts = [];
		const folds = [];
		const faceShape = SHAPES.rect( F, F );
		faces.forEach( ( [ fx, fy ], i ) => {
			const x = ox + fx * F;
			const y = oy + fy * F;
			let inner = `<path d="${ faceShape.d }" fill="${
				i % 2 ? theme.colors.secondary : theme.colors.primary
			}" fill-opacity="0.35"/>`;
			if ( ctx.photo && 'net' !== item.span ) {
				inner += image( ctx.photo, 0, 0, F, F );
			} else if ( false !== item.pattern ) {
				inner += patternIn( faceShape, theme, {
					seed: i + 21,
					opacity: 0.35,
					scale: 0.7,
				} );
			}
			parts.push(
				`<g transform="translate(${ x.toFixed( 2 ) } ${ y.toFixed(
					2
				) })">${ inner }</g>`
			);
		} );
		if ( ctx.photo && 'net' === item.span ) {
			// One picture across the whole cross of faces (wrapping-paper style), drawn face by face.
			faces.forEach( ( [ fx, fy ] ) => {
				const x = ox + fx * F;
				const y = oy + fy * F;
				parts.push(
					`<g transform="translate(${ x.toFixed( 2 ) } ${ y.toFixed(
						2
					) })">${ image(
						ctx.photo,
						-fx * F,
						-fy * F,
						4 * F,
						3 * F
					) }</g>`
				);
			} );
		}
		if ( item.ribbon ) {
			const rw = F * 0.14;
			parts.push(
				`<rect x="${ ( ox + F + F / 2 - rw / 2 ).toFixed(
					2
				) }" y="${ oy.toFixed( 2 ) }" width="${ rw.toFixed(
					2
				) }" height="${ ( 3 * F ).toFixed( 2 ) }" fill="${
					theme.colors.accent
				}" fill-opacity="0.85"/>`
			);
			parts.push(
				`<rect x="${ ox.toFixed( 2 ) }" y="${ (
					oy +
					F +
					F / 2 -
					rw / 2
				).toFixed( 2 ) }" width="${ ( 4 * F ).toFixed(
					2
				) }" height="${ rw.toFixed( 2 ) }" fill="${
					theme.colors.accent
				}" fill-opacity="0.85"/>`
			);
		}
		// The front face carries the motif and the text, on top of the ribbon.
		{
			const x = ox + F;
			const y = oy + F;
			let inner = '';
			if ( theme.motif && false !== item.motif ) {
				inner += motifAt(
					theme.motif,
					F * 0.25,
					F * 0.16,
					F * 0.5,
					theme,
					{ on: item.ribbon ? theme.colors.accent : null }
				);
			}
			if ( item.text ) {
				inner += `<rect x="${ ( F * 0.1 ).toFixed( 2 ) }" y="${ (
					F * 0.7
				).toFixed( 2 ) }" width="${ ( F * 0.8 ).toFixed(
					2
				) }" height="${ ( F * 0.22 ).toFixed( 2 ) }" rx="${ (
					F * 0.04
				).toFixed( 2 ) }" fill="${
					theme.colors.bg
				}" fill-opacity="0.85"/>`;
				inner += label(
					item.text,
					{ x: F * 0.12, y: F * 0.72, w: F * 0.76, h: F * 0.18 },
					{
						font: theme.displayFont,
						weight: 700,
						color: theme.colors.ink,
						maxSize: F * 0.15,
					},
					env
				);
			}
			parts.push(
				`<g transform="translate(${ x.toFixed( 2 ) } ${ y.toFixed(
					2
				) })">${ inner }</g>`
			);
		}
		// Glue flaps: top and bottom of the side faces, right end of the back face.
		const flapPath = ( x, y, w, h, dir ) => {
			const k = flap * 0.35;
			const pts =
				'up' === dir
					? [
							[ x, y + h ],
							[ x + k, y ],
							[ x + w - k, y ],
							[ x + w, y + h ],
					  ]
					: 'down' === dir
					? [
							[ x, y ],
							[ x + w, y ],
							[ x + w - k, y + h ],
							[ x + k, y + h ],
					  ]
					: [
							[ x, y ],
							[ x + w, y + k ],
							[ x + w, y + h - k ],
							[ x, y + h ],
					  ];
			return `<path d="M${ pts
				.map( ( p ) => p[ 0 ].toFixed( 2 ) + ' ' + p[ 1 ].toFixed( 2 ) )
				.join( 'L' ) }Z" fill="${ theme.colors.bg }" stroke="${
				theme.colors.ink
			}" stroke-width="0.25"/>`;
		};
		for ( const fx of [ 0, 2, 3 ] ) {
			parts.push( flapPath( ox + fx * F, oy + F - flap, F, flap, 'up' ) );
			parts.push( flapPath( ox + fx * F, oy + 2 * F, F, flap, 'down' ) );
			folds.push(
				[ ox + fx * F, oy + F, ox + fx * F + F, oy + F ],
				[ ox + fx * F, oy + 2 * F, ox + fx * F + F, oy + 2 * F ]
			);
		}
		parts.push( flapPath( ox + 4 * F, oy + F, flap, F, 'right' ) );
		folds.push( [ ox + 4 * F, oy + F, ox + 4 * F, oy + 2 * F ] );
		// Folds between the faces of the strip and around the top and bottom faces.
		for ( const fx of [ 1, 2, 3 ] ) {
			folds.push( [ ox + fx * F, oy + F, ox + fx * F, oy + 2 * F ] );
		}
		folds.push(
			[ ox + F, oy + F, ox + 2 * F, oy + F ],
			[ ox + F, oy + 2 * F, ox + 2 * F, oy + 2 * F ]
		);
		// Cut contour of the net (faces only; flaps carry their own outline).
		const c = [
			[ ox + F, oy ],
			[ ox + 2 * F, oy ],
			[ ox + 2 * F, oy + F ],
			[ ox + 4 * F, oy + F ],
			[ ox + 4 * F, oy + 2 * F ],
			[ ox + 2 * F, oy + 2 * F ],
			[ ox + 2 * F, oy + 3 * F ],
			[ ox + F, oy + 3 * F ],
			[ ox + F, oy + 2 * F ],
			[ ox, oy + 2 * F ],
			[ ox, oy + F ],
			[ ox + F, oy + F ],
		];
		parts.push(
			`<path d="M${ c
				.map( ( p ) => p[ 0 ].toFixed( 2 ) + ' ' + p[ 1 ].toFixed( 2 ) )
				.join( 'L' ) }Z" fill="none" stroke="${
				theme.colors.ink
			}" stroke-width="0.3"/>`
		);
		return {
			pieces: [ { inner: parts.join( '' ), w: W, h: H, folds } ],
			warnings: [],
		};
	},
};
