/**
 * Drawing glyph outlines onto a canvas.
 *
 * Every preview in the extension shows the real outline rather than a
 * stroked approximation of it. That matters more than it sounds: the
 * gap between what a pen stroke looks like and what its filled outline
 * looks like is where hand-made fonts usually surprise their author,
 * and showing the outline everywhere removes the surprise.
 */

import { buildOutline } from '../core/outline.js';
import { placeGlyph, edgeProfile } from '../core/metrics.js';
import { sideFor, densify } from '../core/build.js';
import { manualKern } from '../core/spacing.js';

/**
 * Turn quadratic contours into a path the canvas can fill.
 *
 * @param {Array} contours Contours of `{ x, y, on }`.
 * @return {Path2D} Path in font units with y still pointing up.
 */
export function contoursToPath( contours ) {
	const path = new Path2D();
	for ( const ring of contours || [] ) {
		if ( ring.length < 2 ) {
			continue;
		}
		const start = ring.findIndex( ( p ) => p.on );
		const from = start < 0 ? 0 : start;
		const at = ( i ) => ring[ ( i + ring.length ) % ring.length ];
		path.moveTo( at( from ).x, at( from ).y );
		let i = from + 1;
		const end = from + ring.length;
		while ( i <= end ) {
			const p = at( i );
			if ( p.on ) {
				path.lineTo( p.x, p.y );
				i++;
				continue;
			}
			const next = at( i + 1 );
			if ( next.on ) {
				path.quadraticCurveTo( p.x, p.y, next.x, next.y );
				i += 2;
			} else {
				// Two controls in a row imply an on-curve point between them.
				path.quadraticCurveTo( p.x, p.y, ( p.x + next.x ) / 2, ( p.y + next.y ) / 2 );
				i++;
			}
		}
		path.closePath();
	}
	return path;
}

/**
 * A cache of traced outlines, keyed by glyph and invalidated by hand.
 *
 * Tracing is the expensive step, and the overview alone would repeat it
 * a hundred times per keystroke without this.
 */
export class OutlineCache {
	constructor() {
		this.map = new Map();
	}
	get( key, glyph, opts ) {
		const stamp = glyph ? glyph.rev || 0 : -1;
		const hit = this.map.get( key );
		if ( hit && hit.stamp === stamp && hit.sig === opts.sig ) {
			return hit.contours;
		}
		const contours = glyph ? buildOutline( densify( glyph ), opts ) : [];
		this.map.set( key, { stamp, sig: opts.sig, contours } );
		return contours;
	}
	drop( key ) {
		this.map.delete( key );
	}
	clear() {
		this.map.clear();
	}
}

/**
 * Silhouettes, remembered per outline.
 *
 * The preview repaints while a slider moves, and measuring every letter
 * again on every frame is the one thing in it expensive enough to feel.
 * Placement only slides an outline sideways, so the measurement holds
 * and only needs the shift added.
 */
const profiles = new WeakMap();

function profileFor( contours, metrics ) {
	let hit = profiles.get( contours );
	if ( ! hit ) {
		hit = edgeProfile( contours, metrics );
		profiles.set( contours, hit );
	}
	return hit;
}

/**
 * Work out where every letter of a string lands, in font units.
 *
 * Everything that shows text asks this: the running preview, and the
 * spacing bench where the numbers are edited. One layout means the bench
 * cannot show you something the preview disagrees with.
 *
 * @param {Object} project Project.
 * @param {string} text    Text to lay out.
 * @param {Object} opts    `{ cache, maxWidth }` (maxWidth in font units).
 * @return {Object} `{ items, width }`.
 */
export function layoutText( project, text, opts ) {
	const { cache, maxWidth = Infinity } = opts;
	const metrics = project.metrics;
	const o = project.options || {};
	const side = sideFor( metrics, o.pen || 62, 1 );
	const traceOpts = outlineOpts( project );
	const auto = false !== o.kerning && ! o.cursive;
	const target = Math.round( side * 1.55 );
	const limit = Math.round( metrics.unitsPerEm * 0.12 );
	const minAbs = Math.max( 8, Math.round( metrics.unitsPerEm * 0.012 ) );

	const items = [];
	let cursor = 0;
	let prev = null;
	for ( const ch of Array.from( text ) ) {
		if ( ' ' === ch ) {
			const advance = Math.round( metrics.unitsPerEm * 0.3 );
			items.push( { ch, x: cursor, advance, kern: 0, contours: [], space: true } );
			cursor += advance;
			prev = null;
			continue;
		}
		const glyph = project.glyphs[ ch ];
		if ( ! glyph ) {
			prev = null;
			continue;
		}
		const contours = cache.get( ch, glyph, traceOpts );
		if ( ! contours.length ) {
			prev = null;
			continue;
		}
		const placed = placeGlyph( contours, {
			side,
			tracking: o.tracking || 0,
			cursive: !! o.cursive,
			overlap: o.overlap ?? 24,
			nudgeL: glyph.nudgeL || 0,
			nudgeR: glyph.nudgeR || 0,
		} );
		const here = {
			ch,
			advance: placed.advance,
			profile: profileFor( contours, metrics ),
			dx: placed.dx,
		};
		// A hand-made correction replaces the automatic one outright.
		let kern = 0;
		if ( prev ) {
			const byHand = manualKern( project, prev.ch, ch );
			kern =
				null !== byHand
					? byHand
					: auto
					? kernBetween( prev, here, { target, limit, minAbs } )
					: 0;
			cursor += kern;
		}
		if ( cursor + placed.advance > maxWidth ) {
			break;
		}
		items.push( {
			ch,
			x: cursor,
			advance: placed.advance,
			kern,
			contours: placed.contours,
			glyph,
		} );
		cursor += placed.advance;
		prev = here;
	}
	return { items, width: cursor };
}

/**
 * Lay a string out from the drawn glyphs and paint it.
 *
 * Missing characters are simply skipped, which is what makes this
 * usable as a running preview: a half-finished alphabet still shows a
 * readable line instead of a row of boxes.
 *
 * @param {Object} ctx     Canvas 2D context.
 * @param {Object} project Project.
 * @param {string} text    Text to show.
 * @param {Object} opts    Options.
 * @return {Object} The layout that was painted.
 */
export function paintText( ctx, project, text, opts ) {
	const { size, x, y, color = '#111', maxWidth = Infinity } = opts;
	const scale = size / project.metrics.unitsPerEm;
	const laid = layoutText( project, text, { ...opts, maxWidth: maxWidth / scale } );
	ctx.save();
	ctx.fillStyle = color;
	for ( const item of laid.items ) {
		if ( ! item.contours.length ) {
			continue;
		}
		ctx.save();
		ctx.translate( x + item.x * scale, y );
		ctx.scale( scale, -scale );
		ctx.fill( contoursToPath( item.contours ), 'nonzero' );
		ctx.restore();
	}
	ctx.restore();
	return laid;
}

/**
 * The correction the font would apply between two glyphs.
 *
 * The same measurement the builder makes: how close the two silhouettes
 * come, band by band, compared with how close they ought to come.
 *
 * @param {Object} a    Left glyph `{ advance, profile }`.
 * @param {Object} b    Right glyph `{ advance, profile }`.
 * @param {Object} opts `{ target, limit, minAbs }`.
 * @return {number} Correction in font units.
 */
export function kernBetween( a, b, opts ) {
	let gap = Infinity;
	for ( let i = 0; i < a.profile.filled.length; i++ ) {
		if ( ! a.profile.filled[ i ] || ! b.profile.filled[ i ] ) {
			continue;
		}
		const d = a.advance + ( b.profile.left[ i ] + b.dx ) - ( a.profile.right[ i ] + a.dx );
		if ( d < gap ) {
			gap = d;
		}
	}
	if ( ! Number.isFinite( gap ) ) {
		return 0;
	}
	let value = Math.round( opts.target - gap );
	if ( value > opts.limit ) {
		value = opts.limit;
	}
	if ( value < -opts.limit ) {
		value = -opts.limit;
	}
	return Math.abs( value ) >= opts.minAbs ? value : 0;
}

/**
 * Everything about a project that changes what an outline looks like.
 *
 * Used as a cache key, so it deliberately leaves out the things that
 * only move a finished outline around, such as tracking.
 *
 * @param {Object} project Project.
 * @return {string} Signature.
 */
export function signatureOf( project ) {
	const o = project.options || {};
	const nib = o.nib || {};
	return [ o.pen, o.influence, o.slant, nib.angle, nib.ratio, project.metrics.unitsPerEm ].join( ':' );
}

/**
 * The tracing options every preview shares, so none of them can drift
 * away from what the font builder will actually do.
 *
 * @param {Object} project Project.
 * @return {Object} Options for the outline cache.
 */
export function outlineOpts( project ) {
	const o = project.options || {};
	return {
		sig: signatureOf( project ),
		influence: o.influence ?? 0.5,
		nib: o.nib || null,
		unitsPerEm: project.metrics.unitsPerEm,
	};
}

/** Fit a canvas to its box at device resolution and return the context. */
export function fitCanvas( canvas ) {
	const dpr = Math.min( 2.5, window.devicePixelRatio || 1 );
	const rect = canvas.getBoundingClientRect();
	const w = Math.max( 1, Math.round( rect.width * dpr ) );
	const h = Math.max( 1, Math.round( rect.height * dpr ) );
	if ( canvas.width !== w || canvas.height !== h ) {
		canvas.width = w;
		canvas.height = h;
	}
	const ctx = canvas.getContext( '2d' );
	ctx.setTransform( 1, 0, 0, 1, 0, 0 );
	ctx.clearRect( 0, 0, w, h );
	return { ctx, w, h, dpr };
}

/** Read a CSS custom property off the editor root, with a fallback. */
export function themeColor( name, fallback ) {
	try {
		const root = document.getElementById( 'wpie-root' ) || document.documentElement;
		const v = getComputedStyle( root ).getPropertyValue( name );
		return v && v.trim() ? v.trim() : fallback;
	} catch ( e ) {
		return fallback;
	}
}
