/**
 * The natal chart wheel: zodiac band with glyphs and degree ticks, house
 * cusps with numbers, ASC/MC axes, planets at their true longitudes with
 * a collision-spread, and the aspect web in the hub. Pure drawing - the
 * chart data comes from astro.js, all captions outside the wheel are
 * editable text layers built in main.js.
 */

import { drawGlyph, SIGN_KEYS } from './glyphs.js';
import { paintBackground, paintStarDust, foilStyle } from './themes.js';
import { wrap180, norm360, signOf } from './astro.js';

const DEG = Math.PI / 180;

/**
 * Screen position for an ecliptic longitude: the chart turns so lambda0
 * sits on the left (the ascendant, or 0 Aries without houses), longitudes
 * grow counterclockwise.
 */
function pointAt( cx, cy, r, lambda, lambda0 ) {
	const a = ( 180 + ( lambda - lambda0 ) ) * DEG;
	return {
		x: cx + r * Math.cos( a ),
		y: cy - r * Math.sin( a ),
		a,
	};
}

/** Spread crowded planets so glyphs never overlap (min separation deg). */
export function spreadLongitudes( lons, minSep = 7 ) {
	const order = lons
		.map( ( lon, i ) => ( { lon, i } ) )
		.sort( ( a, b ) => a.lon - b.lon );
	const out = order.map( ( o ) => ( { ...o } ) );
	for ( let pass = 0; pass < 24; pass++ ) {
		let moved = false;
		for ( let k = 0; k < out.length; k++ ) {
			const a = out[ k ];
			const b = out[ ( k + 1 ) % out.length ];
			const gap =
				k === out.length - 1
					? norm360( b.lon + 360 - a.lon )
					: b.lon - a.lon;
			if ( gap < minSep ) {
				const push = ( minSep - gap ) / 2;
				a.lon -= push;
				b.lon += push;
				moved = true;
			}
		}
		if ( ! moved ) {
			break;
		}
	}
	const spread = new Array( lons.length );
	for ( const o of out ) {
		spread[ o.i ] = norm360( o.lon );
	}
	return spread;
}

/**
 * Draw the wheel, centred, spanning the square canvas.
 *
 * @param {CanvasRenderingContext2D} ctx  Context.
 * @param {number} size   Canvas size (square).
 * @param {Object} chart  From computeChart().
 * @param {Object} opts   { theme, showHouses, showAspects, showDegrees,
 *   fontFamily, transparent }.
 */
export function drawWheel( ctx, size, chart, opts ) {
	const {
		theme,
		showHouses = true,
		showAspects = true,
		showDegrees = true,
		fontFamily = 'Inter',
		transparent = false,
	} = opts;
	const cx = size / 2;
	const cy = size / 2;
	const R = size * 0.445; // zodiac band outer
	const R2 = size * 0.375; // zodiac band inner
	const Rp = size * 0.325; // planet glyph ring
	const Rhub = size * 0.26; // aspect hub
	const Rnum = size * 0.155; // house numbers
	const stack = `${ fontFamily }, 'Inter', system-ui, sans-serif`;

	if ( ! transparent ) {
		paintBackground( ctx, size, size, theme );
		paintStarDust( ctx, size, size, theme );
	}

	const houses = showHouses && chart.houses ? chart.houses : null;
	const lambda0 = houses ? houses.asc : 0;
	const foil = foilStyle( ctx, size, size, theme );

	/* Zodiac band. */
	ctx.lineWidth = Math.max( 1.4, size * 0.0035 );
	ctx.strokeStyle = foil;
	for ( const r of [ R, R2, Rhub ] ) {
		ctx.beginPath();
		ctx.arc( cx, cy, r, 0, 2 * Math.PI );
		ctx.stroke();
	}
	for ( let s = 0; s < 12; s++ ) {
		const b = pointAt( cx, cy, R, s * 30, lambda0 );
		const b2 = pointAt( cx, cy, R2, s * 30, lambda0 );
		ctx.beginPath();
		ctx.moveTo( b.x, b.y );
		ctx.lineTo( b2.x, b2.y );
		ctx.stroke();
		const g = pointAt( cx, cy, ( R + R2 ) / 2, s * 30 + 15, lambda0 );
		drawGlyph( ctx, SIGN_KEYS[ s ], g.x, g.y, size * 0.032, theme.ink );
	}

	/* Degree ticks on the band's inner edge. */
	ctx.strokeStyle = theme.dim;
	ctx.lineWidth = Math.max( 1, size * 0.0016 );
	for ( let d = 0; d < 360; d += 5 ) {
		const len = d % 10 === 0 ? 0.014 : 0.008;
		const t1 = pointAt( cx, cy, R2, d, lambda0 );
		const t2 = pointAt( cx, cy, R2 - size * len, d, lambda0 );
		ctx.beginPath();
		ctx.moveTo( t1.x, t1.y );
		ctx.lineTo( t2.x, t2.y );
		ctx.stroke();
	}

	/* Houses. */
	if ( houses ) {
		for ( let i = 0; i < 12; i++ ) {
			const axis = 0 === i % 3;
			const c1 = pointAt( cx, cy, Rhub, houses.cusps[ i ], lambda0 );
			const c2 = pointAt( cx, cy, R2, houses.cusps[ i ], lambda0 );
			ctx.beginPath();
			ctx.moveTo( c1.x, c1.y );
			ctx.lineTo( c2.x, c2.y );
			ctx.strokeStyle = axis ? theme.accent : theme.faint;
			ctx.lineWidth = axis
				? Math.max( 1.6, size * 0.003 )
				: Math.max( 1, size * 0.0016 );
			ctx.stroke();
			// Number in the middle of the house span, close to the hub.
			const next = houses.cusps[ ( i + 1 ) % 12 ];
			const span = norm360( next - houses.cusps[ i ] );
			const mid = houses.cusps[ i ] + span / 2;
			const n = pointAt( cx, cy, Rnum, mid, lambda0 );
			ctx.fillStyle = theme.dim;
			ctx.font = `500 ${ Math.round( size * 0.02 ) }px ${ stack }`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText( String( i + 1 ), n.x, n.y );
		}
		// AC / MC labels just outside the ring.
		ctx.fillStyle = theme.accent;
		ctx.font = `600 ${ Math.round( size * 0.022 ) }px ${ stack }`;
		const ac = pointAt( cx, cy, R + size * 0.032, houses.asc, lambda0 );
		ctx.fillText( 'AC', ac.x, ac.y );
		const mc = pointAt( cx, cy, R + size * 0.032, houses.mc, lambda0 );
		ctx.fillText( 'MC', mc.x, mc.y );
	}

	/* Aspect web. */
	if ( showAspects && chart.aspects ) {
		const lonOf = {};
		for ( const p of chart.positions ) {
			lonOf[ p.body ] = p.lon;
		}
		ctx.lineWidth = Math.max( 1, size * 0.0018 );
		for ( const asp of chart.aspects ) {
			if ( 'conjunction' === asp.key ) {
				continue; // neighbours on the ring, a chord says nothing
			}
			const p1 = pointAt( cx, cy, Rhub, lonOf[ asp.a ], lambda0 );
			const p2 = pointAt( cx, cy, Rhub, lonOf[ asp.b ], lambda0 );
			ctx.strokeStyle = 'soft' === asp.kind ? theme.soft : theme.hard;
			ctx.globalAlpha = 0.85 - Math.min( 0.45, asp.exact * 0.07 );
			ctx.beginPath();
			ctx.moveTo( p1.x, p1.y );
			ctx.lineTo( p2.x, p2.y );
			ctx.stroke();
		}
		ctx.globalAlpha = 1;
	}

	/* Planets: exact markers plus spread glyphs. */
	const lons = chart.positions.map( ( p ) => p.lon );
	const spread = spreadLongitudes( lons );
	chart.positions.forEach( ( p, i ) => {
		const mark = pointAt( cx, cy, Rhub, p.lon, lambda0 );
		ctx.fillStyle = theme.accent;
		ctx.beginPath();
		ctx.arc( mark.x, mark.y, Math.max( 2, size * 0.004 ), 0, 2 * Math.PI );
		ctx.fill();
		const tick = pointAt( cx, cy, R2, p.lon, lambda0 );
		const tick2 = pointAt( cx, cy, R2 - size * 0.02, p.lon, lambda0 );
		ctx.strokeStyle = theme.accent;
		ctx.lineWidth = Math.max( 1.2, size * 0.0022 );
		ctx.beginPath();
		ctx.moveTo( tick.x, tick.y );
		ctx.lineTo( tick2.x, tick2.y );
		ctx.stroke();

		const g = pointAt( cx, cy, Rp, spread[ i ], lambda0 );
		// Faint leader from the glyph to its exact mark when spread moved it.
		if ( Math.abs( wrap180( spread[ i ] - p.lon ) ) > 0.5 ) {
			ctx.strokeStyle = theme.faint;
			ctx.lineWidth = Math.max( 1, size * 0.0012 );
			ctx.beginPath();
			ctx.moveTo( g.x, g.y );
			ctx.lineTo( mark.x, mark.y );
			ctx.stroke();
		}
		drawGlyph( ctx, p.body, g.x, g.y, size * 0.034, theme.ink );
		if ( p.retro ) {
			ctx.fillStyle = theme.dim;
			ctx.font = `600 ${ Math.round( size * 0.016 ) }px ${ stack }`;
			ctx.textAlign = 'left';
			ctx.textBaseline = 'top';
			ctx.fillText( 'R', g.x + size * 0.02, g.y + size * 0.012 );
		}
		if ( showDegrees ) {
			const { degree } = signOf( p.lon );
			const whole = Math.floor( degree );
			const min = Math.floor( ( degree - whole ) * 60 );
			const label = pointAt(
				cx,
				cy,
				Rp - size * 0.042,
				spread[ i ],
				lambda0
			);
			ctx.fillStyle = theme.dim;
			ctx.font = `500 ${ Math.round( size * 0.014 ) }px ${ stack }`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(
				`${ whole }°${ String( min ).padStart( 2, '0' ) }`,
				label.x,
				label.y
			);
		}
	} );
}

/**
 * The synastry bi-wheel: one zodiac band, person A's planets on the
 * outer ring (ink), person B's on the inner ring (accent), the web of
 * INTER-aspects in the hub, houses and angles from person A.
 *
 * @param {CanvasRenderingContext2D} ctx  Context.
 * @param {number} size   Canvas size (square).
 * @param {Object} chartA computeChart() of person A (with houses).
 * @param {Object} chartB computeChart() of person B.
 * @param {Object} opts   { theme, aspects: crossAspects() result,
 *   showHouses, showDegrees, fontFamily, transparent }.
 */
export function drawSynastry( ctx, size, chartA, chartB, opts ) {
	const {
		theme,
		aspects = [],
		showHouses = true,
		fontFamily = 'Inter',
		transparent = false,
	} = opts;
	const cx = size / 2;
	const cy = size / 2;
	const R = size * 0.445;
	const R2 = size * 0.375;
	const RpA = size * 0.33;
	const Rring = size * 0.285;
	const RpB = size * 0.245;
	const Rhub = size * 0.175;
	const stack = `${ fontFamily }, 'Inter', system-ui, sans-serif`;

	if ( ! transparent ) {
		paintBackground( ctx, size, size, theme );
		paintStarDust( ctx, size, size, theme );
	}

	const houses = showHouses && chartA.houses ? chartA.houses : null;
	const lambda0 = houses ? houses.asc : 0;
	const foil = foilStyle( ctx, size, size, theme );

	/* Zodiac band and the three circles. */
	ctx.lineWidth = Math.max( 1.4, size * 0.0035 );
	ctx.strokeStyle = foil;
	for ( const r of [ R, R2, Rhub ] ) {
		ctx.beginPath();
		ctx.arc( cx, cy, r, 0, 2 * Math.PI );
		ctx.stroke();
	}
	ctx.strokeStyle = theme.faint;
	ctx.lineWidth = Math.max( 1, size * 0.0016 );
	ctx.beginPath();
	ctx.arc( cx, cy, Rring, 0, 2 * Math.PI );
	ctx.stroke();

	ctx.strokeStyle = foil;
	ctx.lineWidth = Math.max( 1.4, size * 0.0035 );
	for ( let s = 0; s < 12; s++ ) {
		const b = pointAt( cx, cy, R, s * 30, lambda0 );
		const b2 = pointAt( cx, cy, R2, s * 30, lambda0 );
		ctx.beginPath();
		ctx.moveTo( b.x, b.y );
		ctx.lineTo( b2.x, b2.y );
		ctx.stroke();
		const g = pointAt( cx, cy, ( R + R2 ) / 2, s * 30 + 15, lambda0 );
		drawGlyph( ctx, SIGN_KEYS[ s ], g.x, g.y, size * 0.032, theme.ink );
	}

	/* Houses of person A. */
	if ( houses ) {
		for ( let i = 0; i < 12; i++ ) {
			const axis = 0 === i % 3;
			const c1 = pointAt( cx, cy, Rhub, houses.cusps[ i ], lambda0 );
			const c2 = pointAt( cx, cy, R2, houses.cusps[ i ], lambda0 );
			ctx.beginPath();
			ctx.moveTo( c1.x, c1.y );
			ctx.lineTo( c2.x, c2.y );
			ctx.strokeStyle = axis ? theme.accent : theme.faint;
			ctx.lineWidth = axis
				? Math.max( 1.6, size * 0.003 )
				: Math.max( 1, size * 0.0014 );
			ctx.stroke();
		}
		ctx.fillStyle = theme.accent;
		ctx.font = `600 ${ Math.round( size * 0.022 ) }px ${ stack }`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		const ac = pointAt( cx, cy, R + size * 0.032, houses.asc, lambda0 );
		ctx.fillText( 'AC', ac.x, ac.y );
		const mc = pointAt( cx, cy, R + size * 0.032, houses.mc, lambda0 );
		ctx.fillText( 'MC', mc.x, mc.y );
	}

	/* The inter-aspect web. */
	ctx.lineWidth = Math.max( 1, size * 0.0018 );
	for ( const asp of aspects ) {
		if ( 'conjunction' === asp.key ) {
			continue;
		}
		const p1 = pointAt( cx, cy, Rhub, asp.lonA, lambda0 );
		const p2 = pointAt( cx, cy, Rhub, asp.lonB, lambda0 );
		ctx.strokeStyle = 'soft' === asp.kind ? theme.soft : theme.hard;
		ctx.globalAlpha = 0.85 - Math.min( 0.45, asp.exact * 0.07 );
		ctx.beginPath();
		ctx.moveTo( p1.x, p1.y );
		ctx.lineTo( p2.x, p2.y );
		ctx.stroke();
	}
	ctx.globalAlpha = 1;

	/* Two planet rings: A outside in ink, B inside in accent. */
	const drawRing = ( chart, radius, color, markColor ) => {
		const lons = chart.positions.map( ( p ) => p.lon );
		const spread = spreadLongitudes( lons, 8 );
		chart.positions.forEach( ( p, i ) => {
			const mark = pointAt( cx, cy, Rhub, p.lon, lambda0 );
			ctx.fillStyle = markColor;
			ctx.beginPath();
			ctx.arc(
				mark.x,
				mark.y,
				Math.max( 1.6, size * 0.0035 ),
				0,
				2 * Math.PI
			);
			ctx.fill();
			const g = pointAt( cx, cy, radius, spread[ i ], lambda0 );
			if ( Math.abs( wrap180( spread[ i ] - p.lon ) ) > 0.5 ) {
				ctx.strokeStyle = theme.faint;
				ctx.lineWidth = Math.max( 1, size * 0.001 );
				ctx.beginPath();
				ctx.moveTo( g.x, g.y );
				ctx.lineTo( mark.x, mark.y );
				ctx.stroke();
			}
			drawGlyph( ctx, p.body, g.x, g.y, size * 0.028, color );
			if ( p.retro ) {
				ctx.fillStyle = theme.dim;
				ctx.font = `600 ${ Math.round( size * 0.013 ) }px ${ stack }`;
				ctx.textAlign = 'left';
				ctx.textBaseline = 'top';
				ctx.fillText( 'R', g.x + size * 0.016, g.y + size * 0.01 );
			}
		} );
	};
	drawRing( chartA, RpA, theme.ink, theme.accent );
	drawRing( chartB, RpB, theme.accent, theme.soft );
}
