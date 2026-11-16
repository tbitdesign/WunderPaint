/**
 * The medallion every reading card is built from: a disc with a little
 * depth, a double ring in foil, and an optional badge on top that names
 * what the medallion stands for (a planet glyph, 'AC', a number).
 * Transparent everywhere it can be, so it sits on any backdrop.
 */

import { drawGlyph } from './glyphs.js';
import { rgba, mix } from './themes.js';

const TAU = Math.PI * 2;

/**
 * Draw a medallion.
 *
 * @param {CanvasRenderingContext2D} ctx   Context.
 * @param {number} x     Centre x.
 * @param {number} y     Centre y.
 * @param {number} r     Radius.
 * @param {Object} theme Resolved theme.
 * @param {string|CanvasGradient} foil Showpiece stroke style.
 * @param {Object} [opts] { dashed, glow }.
 */
export function medallion( ctx, x, y, r, theme, foil, opts = {} ) {
	const { dashed = false, glow = true } = opts;
	ctx.save();
	if ( glow ) {
		const g = ctx.createRadialGradient( x, y - r * 0.3, r * 0.1, x, y, r );
		g.addColorStop( 0, rgba( theme.accent, theme.dark ? 0.16 : 0.12 ) );
		g.addColorStop( 1, rgba( theme.accent, 0.02 ) );
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.arc( x, y, r, 0, TAU );
		ctx.fill();
	}
	ctx.strokeStyle = foil;
	ctx.lineWidth = Math.max( 1.4, r * 0.035 );
	if ( dashed ) {
		ctx.setLineDash( [ r * 0.09, r * 0.07 ] );
	}
	ctx.beginPath();
	ctx.arc( x, y, r, 0, TAU );
	ctx.stroke();
	ctx.lineWidth = Math.max( 1, r * 0.014 );
	ctx.beginPath();
	ctx.arc( x, y, r * 0.9, 0, TAU );
	ctx.stroke();
	ctx.setLineDash( [] );
	// Quiet ticks between the rings.
	ctx.strokeStyle = theme.faint;
	ctx.lineWidth = Math.max( 0.8, r * 0.01 );
	ctx.beginPath();
	for ( let d = 0; d < 360; d += 10 ) {
		const a = ( d * Math.PI ) / 180;
		ctx.moveTo( x + Math.cos( a ) * r * 0.9, y + Math.sin( a ) * r * 0.9 );
		ctx.lineTo(
			x + Math.cos( a ) * r * ( 0 === d % 30 ? 0.83 : 0.86 ),
			y + Math.sin( a ) * r * ( 0 === d % 30 ? 0.83 : 0.86 )
		);
	}
	ctx.stroke();
	ctx.restore();
}

/**
 * The badge on top of a medallion: a filled accent disc with a glyph or a
 * short text in the backdrop tone.
 *
 * @param {CanvasRenderingContext2D} ctx   Context.
 * @param {number} x     Badge centre x.
 * @param {number} y     Badge centre y.
 * @param {number} r     Badge radius.
 * @param {Object} theme Resolved theme.
 * @param {Object} what  { glyph } or { text, family }.
 */
export function badge( ctx, x, y, r, theme, what ) {
	const ink = theme.dark ? mix( theme.bg[ 0 ], '#000000', 0.2 ) : '#ffffff';
	ctx.save();
	ctx.fillStyle = theme.accent;
	ctx.beginPath();
	ctx.arc( x, y, r, 0, TAU );
	ctx.fill();
	ctx.strokeStyle = rgba( theme.accent, 0.35 );
	ctx.lineWidth = Math.max( 1, r * 0.12 );
	ctx.beginPath();
	ctx.arc( x, y, r * 1.28, 0, TAU );
	ctx.stroke();
	if ( what.glyph ) {
		drawGlyph( ctx, what.glyph, x, y, r * 1.15, ink );
	} else if ( what.text ) {
		ctx.fillStyle = ink;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = `700 ${ Math.round( r * 0.95 ) }px ${
			what.family || "'Inter', system-ui, sans-serif"
		}`;
		ctx.fillText( what.text, x, y + r * 0.04 );
	}
	ctx.restore();
}

/** Alchemical element triangles: fire, earth, air, water. */
export function elementSymbol( ctx, index, x, y, s, color ) {
	const up = 0 === index || 2 === index;
	const hh = s * 0.5;
	const hw = s * 0.52;
	ctx.save();
	ctx.strokeStyle = color;
	ctx.lineWidth = Math.max( 1.2, s * 0.08 );
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';
	ctx.beginPath();
	if ( up ) {
		ctx.moveTo( x, y - hh );
		ctx.lineTo( x + hw, y + hh );
		ctx.lineTo( x - hw, y + hh );
	} else {
		ctx.moveTo( x, y + hh );
		ctx.lineTo( x + hw, y - hh );
		ctx.lineTo( x - hw, y - hh );
	}
	ctx.closePath();
	ctx.stroke();
	if ( 1 === index || 2 === index ) {
		// Earth and air carry the bar across.
		const by = up ? y + hh * 0.05 : y - hh * 0.05;
		ctx.beginPath();
		ctx.moveTo( x - hw * 0.78, by );
		ctx.lineTo( x + hw * 0.78, by );
		ctx.stroke();
	}
	ctx.restore();
}

/** The element colors of a theme: fire, earth, air, water. */
export function elementColors( theme ) {
	return [
		theme.hard,
		mix( theme.accent, theme.hard, 0.45 ),
		theme.accent,
		theme.soft,
	];
}
