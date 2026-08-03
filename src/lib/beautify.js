/**
 * Screenshot Beautifier engine (v1.106.0): pure geometry. Given the
 * screenshot size and the params it returns the grown document size and
 * plain layer SPECS (shapes/text) for card, frame chrome and deco
 * elements - in paint order, with clipping flags. The dialog turns the
 * specs into real layers; keeping this pure makes every measurement
 * contract-testable.
 */

import { mulberry32 } from './backgrounds';

export const BEAUTIFY_DEFAULTS = {
	frame: 'browser', // none|browser|window|phone|tablet|deco
	dark: false,
	url: 'wp-image-editor.com',
	padding: 14, // % of card size
	aspect: 'original', // original|16:9|4:3|1:1|og
	radius: 35, // 0-100
	shadow: 55, // 0-100
	border: 0, // 0-100 card border
	deco: { variant: 'offset', width: 40, angle: 6, seed: 1 },
	colors: [ '#3b66ff', '#8b5cf6' ],
};

const ASPECTS = {
	'16:9': 16 / 9,
	'4:3': 4 / 3,
	'1:1': 1,
	og: 1.91,
};

const shape = ( props ) => ( { kind: 'shape', shape: 'rect', ...props } );

/**
 * Build the layout + layer specs.
 *
 * @param {Object} shot   { w, h } of the screenshot as displayed.
 * @param {Object} params See BEAUTIFY_DEFAULTS.
 * @return {Object} { doc, shotRect, below, card, overlays }.
 */
export function beautifySpec( shot, params = {} ) {
	const p = { ...BEAUTIFY_DEFAULTS, ...params };
	const deco = { ...BEAUTIFY_DEFAULTS.deco, ...( params.deco || {} ) };
	const colors = ( p.colors || [] ).filter( Boolean );
	const c0 = colors[ 0 ] || '#3b66ff';
	const c1 = colors[ 1 ] || c0;
	const sw = Math.max( 8, Math.round( shot.w ) );
	const sh = Math.max( 8, Math.round( shot.h ) );
	const unit = Math.max( sw, sh );
	const dark = !! p.dark;

	const frame = p.frame;
	const isBrowser = 'browser' === frame || 'window' === frame;
	const isDevice = 'phone' === frame || 'tablet' === frame;

	const borderPx = Math.round( ( p.border / 100 ) * unit * 0.08 );
	const radiusPx = Math.round(
		( p.radius / 100 ) * Math.min( sw, sh ) * 0.12
	);
	const chromeH = isBrowser
		? Math.max( 24, Math.min( 76, Math.round( sw * 0.055 ) ) )
		: 0;
	// Uniform device bezel (the screen body inset around the screenshot).
	const bezel =
		'phone' === frame
			? Math.max( 8, Math.round( sw * 0.032 ) )
			: 'tablet' === frame
			? Math.max( 12, Math.round( sw * 0.05 ) )
			: 0;
	const inset = isDevice ? bezel : borderPx;

	const cardW = sw + 2 * inset;
	const cardH = isDevice ? sh + 2 * bezel : sh + 2 * borderPx + chromeH;

	const pad = Math.round( ( p.padding / 100 ) * Math.max( cardW, cardH ) );
	let docW = cardW + 2 * pad;
	let docH = cardH + 2 * pad;
	const ratio = ASPECTS[ p.aspect ];
	if ( ratio ) {
		if ( docW / docH < ratio ) {
			docW = Math.round( docH * ratio );
		} else {
			docH = Math.round( docW / ratio );
		}
	}
	const cardX = Math.round( ( docW - cardW ) / 2 );
	const cardY = Math.round( ( docH - cardH ) / 2 );
	const shotRect = {
		x: cardX + inset,
		y: cardY + ( isDevice ? bezel : borderPx + chromeH ),
		w: sw,
		h: sh,
	};

	const cardRadius =
		'phone' === frame
			? Math.round( bezel * 2.6 )
			: 'tablet' === frame
			? Math.round( bezel * 1.5 )
			: radiusPx;
	const shotRadius =
		'phone' === frame
			? Math.max( 0, cardRadius - Math.round( bezel * 0.55 ) )
			: 'tablet' === frame
			? Math.max( 0, cardRadius - Math.round( bezel * 0.5 ) )
			: cardRadius;

	const s = ( p.shadow || 0 ) / 100;
	const styles =
		s > 0
			? {
					dropShadow: {
						color: '#000000',
						opacity: Math.round( ( 0.2 + 0.3 * s ) * 100 ) / 100,
						angle: 120,
						distance: Math.round( unit * 0.012 * s ),
						blur: Math.round( unit * 0.035 * s ),
						spread: 0,
					},
			  }
			: null;

	const cardFill =
		'phone' === frame
			? '#0b0c0e'
			: 'tablet' === frame
			? '#141518'
			: dark
			? '#1f2126'
			: '#ffffff';

	const card = shape( {
		name: 'Card',
		x: cardX,
		y: cardY,
		w: cardW,
		h: cardH,
		radius: cardRadius,
		fill: cardFill,
		styles,
	} );

	/* --------------------------- deco (below) -------------------------- */
	const below = [];
	if ( 'deco' === p.frame ) {
		const rand = mulberry32( ( Number( deco.seed ) || 1 ) * 747796405 );
		const wf = ( deco.width || 0 ) / 100;
		if ( 'ring' === deco.variant ) {
			const t = Math.max(
				2,
				Math.round( unit * ( 0.008 + 0.028 * wf ) )
			);
			const gapPx = Math.round( unit * 0.018 ) + t;
			below.push(
				shape( {
					name: 'Ring',
					x: cardX - gapPx,
					y: cardY - gapPx,
					w: cardW + 2 * gapPx,
					h: cardH + 2 * gapPx,
					radius: cardRadius + gapPx,
					fill: 'rgba(0,0,0,0)',
					stroke: c0,
					strokeW: t,
				} )
			);
			if ( colors.length > 1 ) {
				const g2 = gapPx + t * 2;
				below.push(
					shape( {
						name: 'Ring 2',
						x: cardX - g2,
						y: cardY - g2,
						w: cardW + 2 * g2,
						h: cardH + 2 * g2,
						radius: cardRadius + g2,
						fill: 'rgba(0,0,0,0)',
						stroke: c1,
						strokeW: Math.max( 1, Math.round( t / 2 ) ),
					} )
				);
			}
		} else if ( 'corners' === deco.variant ) {
			const t = Math.max( 3, Math.round( unit * ( 0.008 + 0.02 * wf ) ) );
			const len = Math.round( unit * 0.12 );
			const g = Math.round( unit * 0.03 );
			const cx2 = cardX + cardW;
			const cy2 = cardY + cardH;
			const bracket = ( x, y, hw, hh, i ) =>
				below.push(
					shape( {
						name: 'Corner ' + i,
						x,
						y,
						w: hw,
						h: hh,
						fill: i % 2 ? c1 : c0,
					} )
				);
			// Two strokes per corner, alternating the palette.
			bracket( cardX - g, cardY - g, len, t, 0 );
			bracket( cardX - g, cardY - g, t, len, 0 );
			bracket( cx2 + g - len, cardY - g, len, t, 1 );
			bracket( cx2 + g - t, cardY - g, t, len, 1 );
			bracket( cardX - g, cy2 + g - t, len, t, 1 );
			bracket( cardX - g, cy2 + g - len, t, len, 1 );
			bracket( cx2 + g - len, cy2 + g - t, len, t, 0 );
			bracket( cx2 + g - t, cy2 + g - len, t, len, 0 );
		} else {
			// Offset backdrops: two card-sized panes, slightly rotated.
			const off = Math.round( unit * ( 0.02 + 0.06 * wf ) );
			const jitter = () => ( rand() - 0.5 ) * 1.5;
			below.push(
				shape( {
					name: 'Backdrop 2',
					x: cardX - off,
					y: cardY + off,
					w: cardW,
					h: cardH,
					radius: cardRadius,
					fill: c1,
					rot: -( deco.angle || 0 ) + jitter(),
				} ),
				shape( {
					name: 'Backdrop 1',
					x: cardX + off,
					y: cardY - off,
					w: cardW,
					h: cardH,
					radius: cardRadius,
					fill: c0,
					rot: ( deco.angle || 0 ) + jitter(),
				} )
			);
		}
	}

	/* ------------------------- chrome (overlays) ----------------------- */
	const overlays = [];
	if ( 'browser' === p.frame || 'window' === p.frame ) {
		overlays.push(
			shape( {
				name: 'Chrome',
				x: cardX,
				y: cardY,
				w: cardW,
				h: chromeH + borderPx,
				fill: dark ? '#2b2e35' : '#f1f2f4',
				clipped: true,
			} )
		);
		const dotR = Math.round( chromeH * 0.16 );
		const dotY = cardY + Math.round( ( chromeH + borderPx ) / 2 ) - dotR;
		[ '#ff5f57', '#febc2e', '#28c840' ].forEach( ( fill, i ) =>
			overlays.push( {
				kind: 'shape',
				shape: 'ellipse',
				name: 'Dot ' + ( i + 1 ),
				x: cardX + Math.round( chromeH * 0.55 ) + i * dotR * 3,
				y: dotY,
				w: dotR * 2,
				h: dotR * 2,
				fill,
				clipped: true,
			} )
		);
		if ( 'browser' === p.frame ) {
			const pillH = Math.round( chromeH * 0.58 );
			const pillX = cardX + Math.round( chromeH * 2.2 );
			const pillW = cardX + cardW - pillX - Math.round( chromeH * 0.6 );
			const pillY =
				cardY + Math.round( ( chromeH + borderPx - pillH ) / 2 );
			overlays.push(
				shape( {
					name: 'Address bar',
					x: pillX,
					y: pillY,
					w: pillW,
					h: pillH,
					radius: Math.round( pillH / 2 ),
					fill: dark ? '#1f2126' : '#ffffff',
					clipped: true,
				} )
			);
			const fontSize = Math.max( 9, Math.round( pillH * 0.48 ) );
			overlays.push( {
				kind: 'text',
				name: 'URL',
				text: String( p.url || '' ),
				x: pillX + Math.round( pillH * 0.6 ),
				y: pillY + Math.round( ( pillH - fontSize * 1.2 ) / 2 ),
				w: Math.max( 40, pillW - pillH ),
				h: Math.round( fontSize * 1.2 ),
				fontSize,
				color: dark ? '#9aa2ad' : '#6b7280',
				weight: 400,
				clipped: true,
			} );
		}
	}
	if ( 'phone' === frame ) {
		// Dynamic island near the top of the screen, home indicator at the base.
		const islW = Math.round( sw * 0.3 );
		const islH = Math.max( 6, Math.round( bezel ) );
		overlays.push(
			shape( {
				name: 'Island',
				x: shotRect.x + Math.round( ( sw - islW ) / 2 ),
				y: shotRect.y + Math.round( bezel * 0.5 ),
				w: islW,
				h: islH,
				radius: islH,
				fill: '#000000',
				clipped: true,
			} )
		);
		const hiW = Math.round( sw * 0.34 );
		const hiH = Math.max( 4, Math.round( bezel * 0.32 ) );
		overlays.push(
			shape( {
				name: 'Home indicator',
				x: shotRect.x + Math.round( ( sw - hiW ) / 2 ),
				y: shotRect.y + sh - hiH - Math.round( bezel * 0.45 ),
				w: hiW,
				h: hiH,
				radius: hiH,
				fill: 'rgba(255,255,255,0.85)',
				clipped: true,
			} )
		);
	} else if ( 'tablet' === frame ) {
		const camR = Math.max( 3, Math.round( bezel * 0.16 ) );
		overlays.push( {
			kind: 'shape',
			shape: 'ellipse',
			name: 'Camera',
			x: cardX + Math.round( ( cardW - camR * 2 ) / 2 ),
			y: cardY + Math.round( ( bezel - camR * 2 ) / 2 ),
			w: camR * 2,
			h: camR * 2,
			fill: '#2a2d33',
			clipped: true,
		} );
		const hiW = Math.round( sw * 0.26 );
		const hiH = Math.max( 4, Math.round( bezel * 0.22 ) );
		overlays.push(
			shape( {
				name: 'Home indicator',
				x: shotRect.x + Math.round( ( sw - hiW ) / 2 ),
				y: shotRect.y + sh - hiH - Math.round( bezel * 0.4 ),
				w: hiW,
				h: hiH,
				radius: hiH,
				fill: 'rgba(255,255,255,0.8)',
				clipped: true,
			} )
		);
	}

	return {
		doc: { w: docW, h: docH },
		shotRect,
		shotRadius,
		below,
		card,
		overlays,
	};
}
