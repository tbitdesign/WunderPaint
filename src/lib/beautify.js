/**
 * Screenshot Beautifier engine (v1.106.0, extended in v1.433.0): pure
 * geometry. Given the screenshot size and the params it returns the grown
 * document size and plain layer SPECS (shapes/text) for card, frame
 * chrome, deco elements and an optional caption - in paint order, with
 * clipping flags. The dialog turns the specs into real layers; keeping
 * this pure makes every measurement contract-testable.
 *
 * v1.433.0: an app window and a glass frame, rounded device screens (a
 * "Screen" shape the shot is clipped to, so the bezel stays opaque around
 * it), three layouts (centered, rising from the bottom edge, running into
 * the corner), a tilt that turns the whole framed shot around its center,
 * a caption above it, and the 4:5 and 9:16 formats.
 *
 * Paint order for the dialog: below, card, bezel, screen, shot, overlays;
 * the caption sits on top, outside the screenshot group.
 */

import { __, _x, sprintf } from '@wordpress/i18n';

import { mulberry32 } from './backgrounds';

/**
 * The framed screenshot keeps its recipe on its group (20.10.2026), so
 * "Edit" reopens the Beautifier on it - another frame, layout or backdrop -
 * and replaces it in place.
 */
export const BEAUTIFY_GENERATOR_ID = 'wpie-core/beautify';

export const BEAUTIFY_DEFAULTS = {
	frame: 'browser', // none|browser|window|app|phone|tablet|glass|deco
	dark: false,
	url: 'wp-image-editor.com',
	padding: 14, // % of card size
	aspect: 'original', // original|16:9|4:3|1:1|4:5|9:16|og
	layout: 'center', // center|rise|corner
	tilt: 0, // degrees, -20..20
	radius: 35, // 0-100
	shadow: 55, // 0-100
	border: 0, // 0-100 card border
	deco: { variant: 'offset', width: 40, angle: 6, seed: 1 },
	colors: [ '#3b66ff', '#8b5cf6' ],
	title: '',
	sub: '',
	captionColor: '#111318',
};

export const BEAUTIFY_ASPECTS = {
	'16:9': 16 / 9,
	'4:3': 4 / 3,
	'1:1': 1,
	'4:5': 4 / 5,
	'9:16': 9 / 16,
	og: 1.91,
};

const shape = ( props ) => ( { kind: 'shape', shape: 'rect', ...props } );
const clamp = ( v, lo, hi ) => Math.min( hi, Math.max( lo, v ) );

/** Axis-aligned box of a rect turned by `deg` around its own center. */
function turnedBox( x, y, w, h, deg ) {
	const r = ( ( deg || 0 ) * Math.PI ) / 180;
	const ex =
		( Math.abs( w * Math.cos( r ) ) + Math.abs( h * Math.sin( r ) ) ) / 2;
	const ey =
		( Math.abs( w * Math.sin( r ) ) + Math.abs( h * Math.cos( r ) ) ) / 2;
	return {
		x0: x + w / 2 - ex,
		y0: y + h / 2 - ey,
		x1: x + w / 2 + ex,
		y1: y + h / 2 + ey,
	};
}

/** Turn a spec around (cx, cy): its center moves, its rotation adds up. */
function turnSpec( spec, cx, cy, deg ) {
	const r = ( deg * Math.PI ) / 180;
	const mx = spec.x + spec.w / 2 - cx;
	const my = spec.y + spec.h / 2 - cy;
	const nx = cx + mx * Math.cos( r ) - my * Math.sin( r );
	const ny = cy + mx * Math.sin( r ) + my * Math.cos( r );
	return {
		...spec,
		x: Math.round( nx - spec.w / 2 ),
		y: Math.round( ny - spec.h / 2 ),
		rot: Math.round( ( ( spec.rot || 0 ) + deg ) * 100 ) / 100,
	};
}

/** Rough line count of a caption line at a font size (no text metrics). */
const linesFor = ( text, width, size, max ) =>
	text
		? clamp(
				Math.ceil(
					text.length /
						Math.max( 6, Math.floor( width / ( size * 0.55 ) ) )
				),
				1,
				max
		  )
		: 0;

/**
 * Build the layout + layer specs.
 *
 * @param {Object} shot   { w, h } of the screenshot as displayed.
 * @param {Object} params See BEAUTIFY_DEFAULTS.
 * @return {Object} { doc, shotRect, shotRadius, below, card, bezel,
 *                  screen, overlays, caption }.
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
	const isBar = 'browser' === frame || 'window' === frame || 'app' === frame;
	const isDevice = 'phone' === frame || 'tablet' === frame;
	const isGlass = 'glass' === frame;

	const borderPx = Math.round( ( p.border / 100 ) * unit * 0.08 );
	const radiusPx = Math.round(
		( p.radius / 100 ) * Math.min( sw, sh ) * 0.12
	);
	const chromeH = isBar
		? Math.max( 24, Math.min( 76, Math.round( sw * 0.055 ) ) )
		: 0;
	// Uniform bezel (device body or glass rim around the screenshot).
	const bezel =
		'phone' === frame
			? Math.max( 8, Math.round( sw * 0.032 ) )
			: 'tablet' === frame
			? Math.max( 12, Math.round( sw * 0.05 ) )
			: isGlass
			? Math.max( 10, Math.round( sw * 0.035 ) )
			: 0;
	const inset = isDevice || isGlass ? bezel : borderPx;

	// Everything below is laid out with the card at the origin first and
	// moved into place once the layout knows where the card goes.
	const cardW = sw + 2 * inset;
	const cardH =
		isDevice || isGlass ? sh + 2 * bezel : sh + 2 * borderPx + chromeH;
	const shotLocal = {
		x: inset,
		y: isDevice || isGlass ? bezel : borderPx + chromeH,
		w: sw,
		h: sh,
	};

	const cardRadius =
		'phone' === frame
			? Math.round( bezel * 2.6 )
			: 'tablet' === frame
			? Math.round( bezel * 1.5 )
			: isGlass
			? radiusPx + bezel
			: radiusPx;
	const shotRadius =
		'phone' === frame
			? Math.max( 0, cardRadius - Math.round( bezel * 0.55 ) )
			: 'tablet' === frame
			? Math.max( 0, cardRadius - Math.round( bezel * 0.5 ) )
			: isGlass
			? radiusPx
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
			: isGlass
			? dark
				? 'rgba(18,20,26,0.42)'
				: 'rgba(255,255,255,0.3)'
			: dark
			? '#1f2126'
			: '#ffffff';

	let card = shape( {
		name: __( 'Card', 'wunderpaint' ),
		x: 0,
		y: 0,
		w: cardW,
		h: cardH,
		radius: cardRadius,
		fill: cardFill,
		styles,
		...( isGlass
			? {
					stroke: dark
						? 'rgba(255,255,255,0.16)'
						: 'rgba(255,255,255,0.65)',
					strokeW: Math.max( 1, Math.round( bezel * 0.08 ) ),
			  }
			: {} ),
	} );

	/* --------------------------- deco (below) -------------------------- */
	let below = [];
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
					name: __( 'Ring', 'wunderpaint' ),
					x: -gapPx,
					y: -gapPx,
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
						name: __( 'Ring 2', 'wunderpaint' ),
						x: -g2,
						y: -g2,
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
			const bracket = ( x, y, hw, hh, i ) =>
				below.push(
					shape( {
						// translators: %d: number of the corner.
						name: sprintf( __( 'Corner %d', 'wunderpaint' ), i ),
						x,
						y,
						w: hw,
						h: hh,
						fill: i % 2 ? c1 : c0,
					} )
				);
			// Two strokes per corner, alternating the palette.
			bracket( -g, -g, len, t, 0 );
			bracket( -g, -g, t, len, 0 );
			bracket( cardW + g - len, -g, len, t, 1 );
			bracket( cardW + g - t, -g, t, len, 1 );
			bracket( -g, cardH + g - t, len, t, 1 );
			bracket( -g, cardH + g - len, t, len, 1 );
			bracket( cardW + g - len, cardH + g - t, len, t, 0 );
			bracket( cardW + g - t, cardH + g - len, t, len, 0 );
		} else {
			// Offset backdrops: two card-sized panes, slightly rotated.
			const off = Math.round( unit * ( 0.02 + 0.06 * wf ) );
			const jitter = () => ( rand() - 0.5 ) * 1.5;
			below.push(
				shape( {
					name: __( 'Backdrop 2', 'wunderpaint' ),
					x: -off,
					y: off,
					w: cardW,
					h: cardH,
					radius: cardRadius,
					fill: c1,
					rot: -( deco.angle || 0 ) + jitter(),
				} ),
				shape( {
					name: __( 'Backdrop 1', 'wunderpaint' ),
					x: off,
					y: -off,
					w: cardW,
					h: cardH,
					radius: cardRadius,
					fill: c0,
					rot: ( deco.angle || 0 ) + jitter(),
				} )
			);
		}
	}

	/* -------------------- bezel, screen and overlays ------------------- */
	let bezelParts = [];
	let screen = null;
	let overlays = [];
	if ( isDevice || isGlass ) {
		// The shot is clipped to its own rounded screen, not to the card:
		// the bezel keeps its shape and a glass rim stays see-through.
		screen = shape( {
			name: _x( 'Screen', 'device display', 'wunderpaint' ),
			x: shotLocal.x,
			y: shotLocal.y,
			w: sw,
			h: sh,
			radius: shotRadius,
			fill: '#000000',
		} );
	}
	if ( isBar ) {
		overlays.push(
			shape( {
				name: __( 'Chrome', 'wunderpaint' ),
				x: 0,
				y: 0,
				w: cardW,
				h: chromeH + borderPx,
				fill: dark ? '#2b2e35' : '#f1f2f4',
				clipped: true,
			} )
		);
		const midY = Math.round( ( chromeH + borderPx ) / 2 );
		if ( 'app' === frame ) {
			// Window controls on the right: minimize, maximize, close.
			const g = Math.max( 6, Math.round( chromeH * 0.28 ) );
			const line = Math.max( 1, Math.round( g * 0.12 ) );
			const ink = dark ? '#d5d8dd' : '#2f3237';
			const at = ( i ) =>
				cardW - Math.round( chromeH * ( 0.75 + i * 1.1 ) );
			const glyph = ( props ) =>
				overlays.push(
					shape( { fill: ink, clipped: true, ...props } )
				);
			glyph( {
				name: __( 'Minimize', 'wunderpaint' ),
				x: at( 2 ) - Math.round( g / 2 ),
				y: midY - Math.round( line / 2 ),
				w: g,
				h: line,
			} );
			glyph( {
				name: __( 'Maximize', 'wunderpaint' ),
				x: at( 1 ) - Math.round( g / 2 ),
				y: midY - Math.round( g / 2 ),
				w: g,
				h: g,
				fill: 'rgba(0,0,0,0)',
				stroke: ink,
				strokeW: line,
				radius: Math.round( g * 0.12 ),
			} );
			const cross = Math.round( g * 1.3 );
			for ( const [ i, rot ] of [
				[ 1, 45 ],
				[ 2, -45 ],
			] ) {
				glyph( {
					// translators: %d: number of the window button.
					name: sprintf( __( 'Close %d', 'wunderpaint' ), i ),
					x: at( 0 ) - Math.round( cross / 2 ),
					y: midY - Math.round( line / 2 ),
					w: cross,
					h: line,
					rot,
				} );
			}
		} else {
			const dotR = Math.round( chromeH * 0.16 );
			[ '#ff5f57', '#febc2e', '#28c840' ].forEach( ( fill, i ) =>
				overlays.push( {
					kind: 'shape',
					shape: 'ellipse',
					// translators: %d: number of the window dot.
					name: sprintf( __( 'Dot %d', 'wunderpaint' ), i + 1 ),
					x: Math.round( chromeH * 0.55 ) + i * dotR * 3,
					y: midY - dotR,
					w: dotR * 2,
					h: dotR * 2,
					fill,
					clipped: true,
				} )
			);
		}
		if ( 'browser' === p.frame ) {
			const pillH = Math.round( chromeH * 0.58 );
			const pillX = Math.round( chromeH * 2.2 );
			const pillW = cardW - pillX - Math.round( chromeH * 0.6 );
			const pillY = Math.round( ( chromeH + borderPx - pillH ) / 2 );
			overlays.push(
				shape( {
					name: __( 'Address bar', 'wunderpaint' ),
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
				name: __( 'URL', 'wunderpaint' ),
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
				name: __( 'Island', 'wunderpaint' ),
				x: shotLocal.x + Math.round( ( sw - islW ) / 2 ),
				y: shotLocal.y + Math.round( bezel * 0.5 ),
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
				name: __( 'Home indicator', 'wunderpaint' ),
				x: shotLocal.x + Math.round( ( sw - hiW ) / 2 ),
				y: shotLocal.y + sh - hiH - Math.round( bezel * 0.45 ),
				w: hiW,
				h: hiH,
				radius: hiH,
				fill: 'rgba(255,255,255,0.85)',
				clipped: true,
			} )
		);
	} else if ( 'tablet' === frame ) {
		// The camera sits on the bezel, so it clips to the card, before
		// the screen takes over as the clipping base.
		const camR = Math.max( 3, Math.round( bezel * 0.16 ) );
		bezelParts.push( {
			kind: 'shape',
			shape: 'ellipse',
			name: __( 'Camera', 'wunderpaint' ),
			x: Math.round( ( cardW - camR * 2 ) / 2 ),
			y: Math.round( ( bezel - camR * 2 ) / 2 ),
			w: camR * 2,
			h: camR * 2,
			fill: '#2a2d33',
			clipped: true,
		} );
		const hiW = Math.round( sw * 0.26 );
		const hiH = Math.max( 4, Math.round( bezel * 0.22 ) );
		overlays.push(
			shape( {
				name: __( 'Home indicator', 'wunderpaint' ),
				x: shotLocal.x + Math.round( ( sw - hiW ) / 2 ),
				y: shotLocal.y + sh - hiH - Math.round( bezel * 0.4 ),
				w: hiW,
				h: hiH,
				radius: hiH,
				fill: 'rgba(255,255,255,0.8)',
				clipped: true,
			} )
		);
	}

	/* ------------------------------ layout ----------------------------- */
	// The outline of the framed shot, deco included, turned by the tilt
	// around the card center: that is what the layout has to place.
	const tilt = clamp( Number( p.tilt ) || 0, -20, 20 );
	const ccx = cardW / 2;
	const ccy = cardH / 2;
	let fx0 = Infinity;
	let fy0 = Infinity;
	let fx1 = -Infinity;
	let fy1 = -Infinity;
	for ( const part of [ card, ...below ] ) {
		const t = tilt ? turnSpec( part, ccx, ccy, tilt ) : part;
		const b = turnedBox( t.x, t.y, t.w, t.h, t.rot );
		fx0 = Math.min( fx0, b.x0 );
		fy0 = Math.min( fy0, b.y0 );
		fx1 = Math.max( fx1, b.x1 );
		fy1 = Math.max( fy1, b.y1 );
	}
	const fw = Math.round( fx1 - fx0 );
	const fh = Math.round( fy1 - fy0 );

	const pad = Math.round( ( p.padding / 100 ) * Math.max( cardW, cardH ) );
	const layout = [ 'rise', 'corner' ].includes( p.layout )
		? p.layout
		: 'center';

	// Caption: sized from the card, so it scales with the screenshot.
	const title = String( p.title || '' ).trim();
	const sub = String( p.sub || '' ).trim();
	const hasCaption = !! ( title || sub );
	const U = Math.max( cardW, cardH );
	const ft = Math.max( 12, Math.round( U * 0.056 ) );
	const fs = Math.max( 10, Math.round( U * 0.03 ) );
	const gap = hasCaption ? Math.max( Math.round( U * 0.05 ), pad >> 1 ) : 0;
	const captionHeight = ( w ) => {
		const tl = linesFor( title, w, ft, 3 );
		const sl = linesFor( sub, w, fs, 4 );
		return Math.round(
			tl * ft * 1.15 +
				( sl ? ( tl ? ft * 0.45 : 0 ) + sl * fs * 1.35 : 0 )
		);
	};

	let docW;
	let docH;
	let capW = 0;
	let capH = 0;
	const visW = Math.round( fw * 0.8 );
	const visH = Math.round( fh * 0.8 );
	if ( 'center' === layout ) {
		capW = hasCaption ? Math.round( Math.max( fw, U * 0.8 ) ) : 0;
		capH = hasCaption ? captionHeight( capW ) : 0;
		docW = Math.max( fw, capW ) + 2 * pad;
		docH = fh + ( hasCaption ? capH + gap : 0 ) + 2 * pad;
	} else if ( 'rise' === layout ) {
		capW = hasCaption ? Math.round( Math.max( fw, U * 0.8 ) ) : 0;
		capH = hasCaption ? captionHeight( capW ) : 0;
		docW = Math.max( fw, capW ) + 2 * pad;
		docH = pad + ( hasCaption ? capH + gap : 0 ) + visH;
	} else {
		docW = pad + visW;
		capW = hasCaption ? Math.round( docW - 2 * pad ) : 0;
		capH = hasCaption ? captionHeight( capW ) : 0;
		docH = pad + ( hasCaption ? capH + gap : 0 ) + visH;
	}
	const ratio = BEAUTIFY_ASPECTS[ p.aspect ];
	if ( ratio ) {
		if ( docW / docH < ratio ) {
			docW = Math.round( docH * ratio );
		} else {
			docH = Math.round( docW / ratio );
		}
	}
	docW = Math.round( docW );
	docH = Math.round( docH );

	// Where the outline goes, and the caption with it.
	let boxX;
	let boxY;
	let capX = 0;
	let capY = 0;
	let align = 'center';
	if ( 'center' === layout ) {
		const blockH = fh + ( hasCaption ? capH + gap : 0 );
		const top = Math.round( ( docH - blockH ) / 2 );
		boxX = Math.round( ( docW - fw ) / 2 );
		boxY = top + ( hasCaption ? capH + gap : 0 );
		capX = Math.round( ( docW - capW ) / 2 );
		capY = top;
	} else if ( 'rise' === layout ) {
		boxX = Math.round( ( docW - fw ) / 2 );
		boxY = docH - visH;
		capX = Math.round( ( docW - capW ) / 2 );
		capY = Math.round( ( boxY - gap - capH ) / 2 );
	} else {
		boxX = docW - visW;
		boxY = docH - visH;
		capW = hasCaption ? Math.round( docW - 2 * pad ) : 0;
		capX = pad;
		capY = Math.round( ( boxY - gap - capH ) / 2 );
		align = 'left';
	}
	const cardX = Math.round( boxX - fx0 );
	const cardY = Math.round( boxY - fy0 );

	/* ------------------------ move, then turn ------------------------- */
	const cx = cardX + ccx;
	const cy = cardY + ccy;
	const place = ( spec ) => {
		const moved = { ...spec, x: spec.x + cardX, y: spec.y + cardY };
		return tilt ? turnSpec( moved, cx, cy, tilt ) : moved;
	};
	card = place( card );
	below = below.map( place );
	bezelParts = bezelParts.map( place );
	screen = screen && place( screen );
	overlays = overlays.map( place );
	const placedShot = place( { ...shotLocal } );
	const shotRect = {
		x: placedShot.x,
		y: placedShot.y,
		w: sw,
		h: sh,
		...( tilt ? { rot: placedShot.rot } : {} ),
	};

	const caption = [];
	if ( hasCaption ) {
		const color = /^#[0-9a-f]{6}$/i.test( p.captionColor )
			? p.captionColor
			: BEAUTIFY_DEFAULTS.captionColor;
		let y = capY;
		if ( title ) {
			const h = Math.round( linesFor( title, capW, ft, 3 ) * ft * 1.15 );
			caption.push( {
				kind: 'text',
				name: __( 'Title', 'wunderpaint' ),
				text: title,
				x: capX,
				y,
				w: capW,
				h,
				fontSize: ft,
				weight: 800,
				lineHeight: 1.1,
				color,
				align,
				fixedWidth: true,
			} );
			y += h + Math.round( ft * 0.45 );
		}
		if ( sub ) {
			caption.push( {
				kind: 'text',
				name: __( 'Subtitle', 'wunderpaint' ),
				text: sub,
				x: capX,
				y,
				w: capW,
				h: Math.round( linesFor( sub, capW, fs, 4 ) * fs * 1.35 ),
				fontSize: fs,
				weight: 400,
				lineHeight: 1.3,
				color: color + 'c0',
				align,
				fixedWidth: true,
			} );
		}
	}

	return {
		doc: { w: docW, h: docH },
		shotRect,
		shotRadius,
		below,
		card,
		bezel: bezelParts,
		screen,
		overlays,
		caption,
	};
}

/**
 * The layer list with an edited framed screenshot in it (20.10.2026): the
 * group (same id) and its parts where the old ones began, the backdrop
 * layers the Beautifier made for it where the old backdrop lay - or right
 * under the group if there was none - and every other layer untouched.
 *
 * @param {Array}  layers   The document's flat layer list.
 * @param {Array}  backdrop The new backdrop layers (bottom to top).
 * @param {Array}  parts    The new child layers of the group.
 * @param {Object} group    The new group, with the old group's id.
 * @return {Array} The new layer list.
 */
export function placeBeautify( layers, backdrop, parts, group ) {
	const oldId = group.id;
	const removed = new Set( [ oldId ] );
	let grew = true;
	while ( grew ) {
		grew = false;
		for ( const l of layers ) {
			if (
				l.parent &&
				removed.has( l.parent ) &&
				! removed.has( l.id )
			) {
				removed.add( l.id );
				grew = true;
			}
		}
	}
	const oldBackdrop = ( l ) =>
		l.beautifyOf === oldId && ! removed.has( l.id );
	const next = [];
	let placedBackdrop = false;
	let placedGroup = false;
	for ( const l of layers ) {
		if ( oldBackdrop( l ) ) {
			if ( ! placedBackdrop ) {
				next.push( ...backdrop );
				placedBackdrop = true;
			}
			continue;
		}
		if ( removed.has( l.id ) ) {
			if ( ! placedGroup ) {
				if ( ! placedBackdrop ) {
					next.push( ...backdrop );
					placedBackdrop = true;
				}
				next.push( ...parts, group );
				placedGroup = true;
			}
			continue;
		}
		next.push( l );
	}
	if ( ! placedGroup ) {
		next.push( ...( placedBackdrop ? [] : backdrop ), ...parts, group );
	}
	return next;
}
