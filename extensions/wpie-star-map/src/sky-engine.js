/**
 * Star Map Posters render engine: the bundled catalog (Yale Bright Star
 * Catalogue, public domain) and constellation lines (d3-celestial,
 * BSD-3) drawn as a poster-style circular sky chart. Pure module,
 * unit-testable in node-canvas.
 */

import { altAz, projectSky } from './astro.js';

/* -------------------------------- themes --------------------------------- */

export const THEMES = [
	{
		id: 'midnight',
		label: 'Midnight',
		bg: '#0b1220',
		star: '#f8fafc',
		line: '#6d84ad',
		grid: '#22304a',
		text: '#f8fafc',
	},
	{
		id: 'black',
		label: 'Black',
		bg: '#050608',
		star: '#ffffff',
		line: '#5c6672',
		grid: '#1d2126',
		text: '#ffffff',
	},
	{
		id: 'violet',
		label: 'Violet',
		bg: '#150a2e',
		star: '#f1e9ff',
		line: '#7d63b8',
		grid: '#2b1c52',
		text: '#f1e9ff',
	},
	{
		id: 'forest',
		label: 'Forest',
		bg: '#0c1f16',
		star: '#eef7e9',
		line: '#4f7c57',
		grid: '#1c3a29',
		text: '#eef7e9',
	},
	{
		id: 'ocean',
		label: 'Ocean',
		bg: '#08222e',
		star: '#dff2fa',
		line: '#3d7d8c',
		grid: '#12394a',
		text: '#dff2fa',
	},
	{
		id: 'golden',
		label: 'Golden',
		bg: '#101010',
		star: '#f5c76b',
		line: '#8a6f3a',
		grid: '#241d10',
		text: '#f5c76b',
	},
	{
		id: 'paper',
		label: 'Paper',
		bg: '#f7f3ea',
		star: '#1a1d21',
		line: '#8a8577',
		grid: '#e2dccb',
		text: '#1a1d21',
	},
	{
		id: 'blush',
		label: 'Blush',
		bg: '#fdf2f4',
		star: '#6d2136',
		line: '#c98da0',
		grid: '#f2dbe1',
		text: '#6d2136',
	},
];

/**
 * Effective palette: theme + user overrides (bg, star, line).
 *
 * @param {Object} theme     Theme entry.
 * @param {Object} overrides { bg?, star?, line? }.
 * @return {Object} Same shape as a theme.
 */
export function skyPalette( theme, overrides = {} ) {
	return {
		...theme,
		bg: overrides.bg || theme.bg,
		star: overrides.star || theme.star,
		line: overrides.line || theme.line,
	};
}

// B-V color index to a display tint (hot blue-white to cool orange).
const BV_TINTS = [
	[ -10, '#aabfff' ],
	[ 0.0, '#e8f0ff' ],
	[ 0.4, '#ffffff' ],
	[ 0.8, '#fff2dd' ],
	[ 1.4, '#ffe3b8' ],
	[ 99, '#ffd39b' ],
];

function bvTint( bv ) {
	for ( let i = 1; i < BV_TINTS.length; i++ ) {
		if ( bv < BV_TINTS[ i ][ 0 ] ) {
			return BV_TINTS[ i - 1 ][ 1 ];
		}
	}
	return BV_TINTS[ BV_TINTS.length - 1 ][ 1 ];
}

/* ------------------------------- gradients -------------------------------- */

/**
 * Curated line gradients (v2.0) - the poster-family vocabulary from
 * Soundwave Art. `metallic` entries fake a foil: dark rim, hot gloss
 * band, dark rim - the gold-on-black birth-sky classic.
 */
export const GRADIENTS = [
	{ id: 'sunset', label: 'Sunset', stops: [ '#ffd27a', '#ff7e5f', '#c2427b' ] },
	{ id: 'aurora', label: 'Aurora', stops: [ '#5ef7c3', '#38bdf8', '#a78bfa' ] },
	{ id: 'ocean', label: 'Ocean', stops: [ '#7fd8f0', '#38bdf8', '#4f46e5' ] },
	{ id: 'candy', label: 'Candy', stops: [ '#f9a8d4', '#e879f9', '#818cf8' ] },
	{ id: 'ember', label: 'Ember', stops: [ '#fde68a', '#fb923c', '#ef4444' ] },
	{ id: 'lime', label: 'Lime', stops: [ '#d9f99d', '#4ade80', '#22d3ee' ] },
	{ id: 'spectrum', label: 'Spectrum', stops: [ '#f87171', '#facc15', '#4ade80', '#38bdf8', '#a78bfa' ] },
	{ id: 'goldfoil', label: 'Gold foil', metallic: true, stops: [ '#7a4a12', '#d9a441', '#fff3d0', '#e3b34c', '#8a5a1c' ] },
	{ id: 'copper', label: 'Copper', metallic: true, stops: [ '#4f2513', '#b9743f', '#ffd9b8', '#c07f4b', '#5e2f18' ] },
	{ id: 'chrome', label: 'Chrome', metallic: true, stops: [ '#5c6670', '#eef3f8', '#7e8ea0', '#ffffff', '#4c565f' ] },
];

export const gradientById = ( id ) =>
	GRADIENTS.find( ( g ) => g.id === id ) || null;

const hexRgb = ( hex ) => {
	const s = String( hex ).replace( '#', '' );
	return [
		parseInt( s.slice( 0, 2 ), 16 ) || 0,
		parseInt( s.slice( 2, 4 ), 16 ) || 0,
		parseInt( s.slice( 4, 6 ), 16 ) || 0,
	];
};

const rgba = ( hex, a ) => {
	const [ r, g, b ] = hexRgb( hex );
	return `rgba(${ r },${ g },${ b },${ a })`;
};

export const mixHex = ( a, b, u ) => {
	const A = hexRgb( a );
	const B = hexRgb( b );
	const c = A.map( ( v, i ) => Math.round( v + ( B[ i ] - v ) * u ) );
	return `rgb(${ c[ 0 ] },${ c[ 1 ] },${ c[ 2 ] })`;
};

/* ------------------------------- milky way -------------------------------- */

// J2000 galactic frame: north galactic pole and the node angle.
const NGP_RA = 192.859508;
const NGP_DEC = 27.128336;
const L_NCP = 122.932;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Galactic (l, b) degrees to equatorial [raDeg, decDeg] (J2000). */
export function galacticToEq( l, b ) {
	const bR = b * D2R;
	const dG = NGP_DEC * D2R;
	const dl = ( L_NCP - l ) * D2R;
	const sinDec =
		Math.sin( bR ) * Math.sin( dG ) +
		Math.cos( bR ) * Math.cos( dG ) * Math.cos( dl );
	const dec = Math.asin( Math.max( -1, Math.min( 1, sinDec ) ) );
	const y = Math.cos( bR ) * Math.sin( dl );
	const x =
		Math.sin( bR ) * Math.cos( dG ) -
		Math.cos( bR ) * Math.sin( dG ) * Math.cos( dl );
	const ra = ( ( NGP_RA + Math.atan2( y, x ) * R2D ) % 360 + 360 ) % 360;
	return [ ra, dec * R2D ];
}

/* --------------------------------- masks ---------------------------------- */

/** Mask outline path in a w×h box (same family as Map Posters). */
export function maskPathOn( ctx, mask, w, h ) {
	const cx = w / 2;
	const cy = h / 2;
	const r = Math.min( w, h ) / 2;
	ctx.beginPath();
	if ( 'circle' === mask ) {
		ctx.arc( cx, cy, r, 0, Math.PI * 2 );
	} else if ( 'heart' === mask ) {
		const s = Math.min( w, h );
		const X = ( u ) => cx - s / 2 + u * s;
		const Y = ( v ) => cy - s / 2 + v * s;
		ctx.moveTo( X( 0.5 ), Y( 0.91 ) );
		ctx.bezierCurveTo(
			X( 0.24 ),
			Y( 0.66 ),
			X( 0.1 ),
			Y( 0.52 ),
			X( 0.1 ),
			Y( 0.36 )
		);
		ctx.bezierCurveTo(
			X( 0.1 ),
			Y( 0.23 ),
			X( 0.2 ),
			Y( 0.13 ),
			X( 0.33 ),
			Y( 0.13 )
		);
		ctx.bezierCurveTo(
			X( 0.41 ),
			Y( 0.13 ),
			X( 0.47 ),
			Y( 0.17 ),
			X( 0.5 ),
			Y( 0.25 )
		);
		ctx.bezierCurveTo(
			X( 0.53 ),
			Y( 0.17 ),
			X( 0.59 ),
			Y( 0.13 ),
			X( 0.67 ),
			Y( 0.13 )
		);
		ctx.bezierCurveTo(
			X( 0.8 ),
			Y( 0.13 ),
			X( 0.9 ),
			Y( 0.23 ),
			X( 0.9 ),
			Y( 0.36 )
		);
		ctx.bezierCurveTo(
			X( 0.9 ),
			Y( 0.52 ),
			X( 0.76 ),
			Y( 0.66 ),
			X( 0.5 ),
			Y( 0.91 )
		);
		ctx.closePath();
	} else if ( 'hex' === mask ) {
		for ( let i = 0; i < 6; i++ ) {
			const a = ( Math.PI / 3 ) * i - Math.PI / 2;
			if ( i ) {
				ctx.lineTo( cx + r * Math.cos( a ), cy + r * Math.sin( a ) );
			} else {
				ctx.moveTo( cx + r * Math.cos( a ), cy + r * Math.sin( a ) );
			}
		}
		ctx.closePath();
	} else if ( 'squircle' === mask ) {
		const rad = Math.min( w, h ) * 0.18;
		if ( 'function' === typeof ctx.roundRect ) {
			ctx.roundRect( 0, 0, w, h, rad );
		} else {
			ctx.moveTo( rad, 0 );
			ctx.arcTo( w, 0, w, h, rad );
			ctx.arcTo( w, h, 0, h, rad );
			ctx.arcTo( 0, h, 0, 0, rad );
			ctx.arcTo( 0, 0, w, 0, rad );
			ctx.closePath();
		}
	} else if ( 'diamond' === mask ) {
		ctx.moveTo( cx, 0 );
		ctx.lineTo( w, cy );
		ctx.lineTo( cx, h );
		ctx.lineTo( 0, cy );
		ctx.closePath();
	} else if ( 'triangle' === mask ) {
		ctx.moveTo( cx, 0 );
		ctx.lineTo( w, h );
		ctx.lineTo( 0, h );
		ctx.closePath();
	} else if ( 'arch' === mask ) {
		const top = Math.min( cx, cy );
		ctx.moveTo( 0, h );
		ctx.lineTo( 0, top );
		ctx.arc( cx, top, cx, Math.PI, 0, false );
		ctx.lineTo( w, h );
		ctx.closePath();
	} else if ( 'star' === mask ) {
		const spikes = 5;
		const outer = r;
		const inner = r * 0.42;
		let rot = -Math.PI / 2;
		ctx.moveTo( cx + Math.cos( rot ) * outer, cy + Math.sin( rot ) * outer );
		for ( let i = 0; i < spikes; i++ ) {
			rot += Math.PI / spikes;
			ctx.lineTo( cx + Math.cos( rot ) * inner, cy + Math.sin( rot ) * inner );
			rot += Math.PI / spikes;
			ctx.lineTo( cx + Math.cos( rot ) * outer, cy + Math.sin( rot ) * outer );
		}
		ctx.closePath();
	} else if ( 'pentagon' === mask ) {
		for ( let i = 0; i < 5; i++ ) {
			const a = ( Math.PI * 2 * i ) / 5 - Math.PI / 2;
			const x = cx + r * Math.cos( a );
			const y = cy + r * Math.sin( a );
			if ( i ) {
				ctx.lineTo( x, y );
			} else {
				ctx.moveTo( x, y );
			}
		}
		ctx.closePath();
	} else {
		ctx.rect( 0, 0, w, h );
	}
}

/* -------------------------------- drawing -------------------------------- */

/**
 * Render the sky chart.
 *
 * @param {CanvasRenderingContext2D} ctx  Target context.
 * @param {number}                   w    Width in px.
 * @param {number}                   h    Height in px.
 * @param {Object}                   opts Options:
 *   stars        Catalog [ [raDeg, decDeg, mag, bv], ... ].
 *   lines        Constellation polylines [ [ [ra, dec], ... ], ... ].
 *   lat, lon     Observer (degrees).
 *   jd           Julian date of the moment.
 *   theme        Theme entry (see THEMES).
 *   overrides    { bg?, star?, line? }.
 *   show         { lines: true, grid: false, cardinals: false }.
 *   colorStars   Tint stars by their B-V color index.
 *   starScale    Dot size multiplier (default 1).
 *   mask         'circle' (default) | 'none' | 'squircle' | 'heart' | 'hex'.
 *   cardinalLabels [ 'N', 'E', 'S', 'W' ] (pre-translated).
 *   lineGradientId v2.0: '' = theme line color, else a GRADIENTS id -
 *                the constellation lines and horizon ring take the
 *                gradient (gold foil on black = the birth-sky classic).
 *   glow         v2.0: 0..1 neon glow for lines and star halos.
 *   glints       v2.0: diffraction spikes on the brightest stars.
 *   milkyway     v2.0: soft band along the real galactic plane.
 *   highlight    v2.0: IAU abbreviation ('Ori') - that constellation is
 *                drawn bold and glowing while the rest step back. Lines
 *                must be the grouped format [{ c, segs }] for this.
 */
export function drawSky( ctx, w, h, opts ) {
	const {
		stars = [],
		lines = [],
		lat = 0,
		lon = 0,
		jd,
		theme = THEMES[ 0 ],
		overrides = {},
		show = {},
		colorStars = false,
		starScale = 1,
		mask = 'circle',
		cardinalLabels = [ 'N', 'E', 'S', 'W' ],
		lineGradientId = '',
		glow = 0,
		glints = false,
		milkyway = false,
		highlight = '',
	} = opts;
	// Lines arrive grouped ([{ c, segs }], v1.8) or as bare segment
	// arrays (pre-1.8 callers and tests) - normalize to groups.
	const lineGroups =
		lines.length && lines[ 0 ] && Array.isArray( lines[ 0 ].segs )
			? lines
			: [ { c: '', segs: lines } ];
	const pal = skyPalette( theme, overrides );
	const cx = w / 2;
	const cy = h / 2;
	// The horizon circle leaves a small margin inside the mask.
	const radius = ( Math.min( w, h ) / 2 ) * ( 'none' === mask ? 0.94 : 0.9 );
	const S = radius / 500;
	const glowAmt = Math.max( 0, Math.min( 1, glow ) );
	const grad = gradientById( lineGradientId );
	// One diagonal gradient across the chart: foil catches the light.
	const linePaint = () => {
		if ( ! grad ) {
			return pal.line;
		}
		const g = ctx.createLinearGradient(
			cx - radius,
			cy - radius,
			cx + radius,
			cy + radius
		);
		grad.stops.forEach( ( s, i ) =>
			g.addColorStop( i / Math.max( 1, grad.stops.length - 1 ), s )
		);
		return g;
	};
	const glowColor = grad
		? grad.stops[ Math.floor( grad.stops.length / 2 ) ]
		: pal.line;

	ctx.save();
	maskPathOn( ctx, mask, w, h );
	ctx.clip();
	ctx.fillStyle = pal.bg;
	ctx.fillRect( 0, 0, w, h );

	// Shaped charts mirror the circle's layout: shape edge, a margin of
	// plain background, then the contour with the sky inside - so the
	// heart line floats inset like the horizon ring does.
	const shaped = 'circle' !== mask && 'none' !== mask;
	const INSET = 0.91;
	const innerPath = () => {
		ctx.save();
		ctx.translate( cx, cy );
		ctx.scale( INSET, INSET );
		ctx.translate( -cx, -cy );
		maskPathOn( ctx, mask, w, h );
		ctx.restore();
	};

	// Everything celestial stays inside the horizon circle (or, on a
	// shaped chart, inside the inset shape).
	ctx.save();
	if ( shaped ) {
		innerPath();
	} else {
		ctx.beginPath();
		ctx.arc( cx, cy, radius, 0, Math.PI * 2 );
	}
	ctx.clip();

	if ( milkyway ) {
		// The real galactic plane over this place and moment: sampled
		// along the galactic equator, drawn as three soft ribbon passes.
		const band = [];
		let run = [];
		for ( let l = 0; l <= 360; l += 2 ) {
			const [ ra, dec ] = galacticToEq( l, 0 );
			const p = altAz( ra, dec, lat, lon, jd );
			if ( p.alt < -4 ) {
				if ( run.length > 1 ) {
					band.push( run );
				}
				run = [];
				continue;
			}
			run.push( projectSky( p.alt, p.az, cx, cy, radius ) );
		}
		if ( run.length > 1 ) {
			band.push( run );
		}
		const mwColor = mixHex( pal.star, pal.bg, 0.45 );
		ctx.save();
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.shadowColor = mwColor;
		for ( const [ width, alpha ] of [
			[ 0.2, 0.05 ],
			[ 0.12, 0.06 ],
			[ 0.06, 0.08 ],
		] ) {
			ctx.strokeStyle = mwColor;
			ctx.globalAlpha = alpha * ( 0.9 + glowAmt * 0.6 );
			ctx.lineWidth = radius * width;
			// Feathered edges: the band is haze, not a ribbon.
			ctx.shadowBlur = radius * width * 0.6;
			for ( const seg of band ) {
				ctx.beginPath();
				seg.forEach( ( [ x, y ], i ) =>
					i ? ctx.lineTo( x, y ) : ctx.moveTo( x, y )
				);
				ctx.stroke();
			}
		}
		ctx.restore();
		ctx.globalAlpha = 1;
	}

	if ( show.grid ) {
		ctx.strokeStyle = pal.grid;
		ctx.lineWidth = 1 * S;
		for ( const altRing of [ 30, 60 ] ) {
			ctx.beginPath();
			ctx.arc(
				cx,
				cy,
				( ( 90 - altRing ) / 90 ) * radius,
				0,
				Math.PI * 2
			);
			ctx.stroke();
		}
		for ( let az = 0; az < 360; az += 45 ) {
			const [ x, y ] = projectSky( 0, az, cx, cy, radius );
			ctx.beginPath();
			ctx.moveTo( cx, cy );
			ctx.lineTo( x, y );
			ctx.stroke();
		}
	}

	if ( false !== show.lines && lines.length ) {
		const traceSegs = ( segs ) => {
			ctx.beginPath();
			for ( const seg of segs ) {
				let pen = false;
				for ( const [ ra, dec ] of seg ) {
					const p = altAz( ra, dec, lat, lon, jd );
					if ( p.alt < -2 ) {
						pen = false;
						continue;
					}
					const [ x, y ] = projectSky( p.alt, p.az, cx, cy, radius );
					if ( pen ) {
						ctx.lineTo( x, y );
					} else {
						ctx.moveTo( x, y );
						pen = true;
					}
				}
			}
			ctx.stroke();
		};
		const hiGroup = highlight
			? lineGroups.find( ( g ) => g.c === highlight )
			: null;
		const baseSegs = [];
		for ( const g of lineGroups ) {
			if ( ! hiGroup || g !== hiGroup ) {
				baseSegs.push( ...g.segs );
			}
		}
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		if ( glowAmt > 0.01 ) {
			// Halo pass under the crisp lines.
			ctx.save();
			ctx.strokeStyle = glowColor;
			ctx.shadowColor = glowColor;
			ctx.shadowBlur = radius * 0.045 * glowAmt;
			ctx.lineWidth = 1.1 * S;
			ctx.globalAlpha = 0.5 * glowAmt * ( hiGroup ? 0.5 : 1 );
			traceSegs( baseSegs );
			ctx.restore();
		}
		// With a highlighted constellation the rest steps back.
		ctx.strokeStyle = linePaint();
		ctx.lineWidth = ( grad ? 1.35 : 1.1 ) * S;
		ctx.globalAlpha = ( grad ? 0.9 : 0.6 ) * ( hiGroup ? 0.45 : 1 );
		traceSegs( baseSegs );
		ctx.globalAlpha = 1;
		if ( hiGroup ) {
			// The chosen constellation: bold, bright, always haloed.
			ctx.save();
			ctx.shadowColor = glowColor;
			ctx.shadowBlur = radius * ( 0.03 + 0.03 * glowAmt );
			ctx.strokeStyle = glowColor;
			ctx.lineWidth = 2.2 * S;
			ctx.globalAlpha = 0.5;
			traceSegs( hiGroup.segs );
			ctx.restore();
			ctx.strokeStyle = linePaint();
			ctx.lineWidth = 2.2 * S;
			ctx.globalAlpha = 1;
			traceSegs( hiGroup.segs );
		}
	}

	// Halo threshold and reach grow with the glow setting.
	const haloMag = 1.2 + glowAmt * 1.8;
	const haloReach = 3.2 + glowAmt * 2.2;
	const haloAlpha = 0.35 + glowAmt * 0.2;
	for ( const [ ra, dec, mag, bv ] of stars ) {
		const p = altAz( ra, dec, lat, lon, jd );
		if ( p.alt < 0 ) {
			continue;
		}
		const [ x, y ] = projectSky( p.alt, p.az, cx, cy, radius );
		const r = Math.max( 0.35 * S, ( 6.7 - mag ) * 0.5 * S * starScale );
		const color = colorStars ? bvTint( bv ) : pal.star;
		if ( mag < haloMag ) {
			// A soft halo makes the bright stars read like a poster print.
			const halo = ctx.createRadialGradient( x, y, 0, x, y, r * haloReach );
			halo.addColorStop( 0, color );
			halo.addColorStop( 1, 'rgba(0, 0, 0, 0)' );
			ctx.globalAlpha = haloAlpha;
			ctx.fillStyle = halo;
			ctx.beginPath();
			ctx.arc( x, y, r * haloReach, 0, Math.PI * 2 );
			ctx.fill();
			ctx.globalAlpha = 1;
		}
		if ( glints && mag < 1.0 ) {
			// Star-filter diffraction spikes on the night's brightest.
			const len = r * ( 5.5 + ( 1.0 - mag ) * 3.5 );
			ctx.save();
			ctx.strokeStyle = color;
			ctx.lineCap = 'round';
			for ( const [ dx, dy, f ] of [
				[ 1, 0, 1 ],
				[ 0, 1, 1 ],
				[ 0.7071, 0.7071, 0.45 ],
				[ -0.7071, 0.7071, 0.45 ],
			] ) {
				const spike = ctx.createLinearGradient(
					x - dx * len * f,
					y - dy * len * f,
					x + dx * len * f,
					y + dy * len * f
				);
				spike.addColorStop( 0, rgba( '#000000', 0 ) );
				spike.addColorStop( 0.5, color );
				spike.addColorStop( 1, rgba( '#000000', 0 ) );
				ctx.strokeStyle = spike;
				ctx.globalAlpha = 0.8 * f;
				ctx.lineWidth = Math.max( 0.6, r * 0.34 );
				ctx.beginPath();
				ctx.moveTo( x - dx * len * f, y - dy * len * f );
				ctx.lineTo( x + dx * len * f, y + dy * len * f );
				ctx.stroke();
			}
			ctx.restore();
			ctx.globalAlpha = 1;
		}
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.arc( x, y, r, 0, Math.PI * 2 );
		ctx.fill();
	}
	ctx.restore();

	// The chart edge: circle and square keep the classic horizon ring;
	// shaped masks stroke the INSET shape contour (fully visible inside
	// the margin, so no width doubling needed).
	const edgePath = () => {
		if ( shaped ) {
			innerPath();
		} else {
			ctx.beginPath();
			ctx.arc( cx, cy, radius, 0, Math.PI * 2 );
		}
	};
	const edgeWidth = 1.6 * S;
	if ( glowAmt > 0.01 ) {
		ctx.save();
		ctx.shadowColor = glowColor;
		ctx.shadowBlur = radius * 0.04 * glowAmt;
		ctx.strokeStyle = glowColor;
		ctx.globalAlpha = 0.5 * glowAmt;
		ctx.lineWidth = edgeWidth;
		edgePath();
		ctx.stroke();
		ctx.restore();
	}
	ctx.strokeStyle = linePaint();
	ctx.lineWidth = edgeWidth;
	edgePath();
	ctx.stroke();

	if ( show.cardinals ) {
		const fs = Math.max( 9, 16 * S );
		ctx.font = `600 ${ fs }px Inter, sans-serif`;
		ctx.fillStyle = pal.text;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		const off = radius + fs * 0.95;
		// Looking up: north top, EAST LEFT.
		ctx.fillText( cardinalLabels[ 0 ], cx, cy - off );
		ctx.fillText( cardinalLabels[ 1 ], cx - off, cy );
		ctx.fillText( cardinalLabels[ 2 ], cx, cy + off );
		ctx.fillText( cardinalLabels[ 3 ], cx + off, cy );
	}

	ctx.restore();
}
