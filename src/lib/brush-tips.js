/**
 * Brush tip types (v1.21, expanded v1.22), a data-driven gallery of
 * Photoshop-style brush tips. `render:'round'` tips are continuous strokes
 * with a soft-edge amount; `render:'stamp'` tips stamp a shape along the
 * stroke's sampled points (in document coordinates, so they scale with
 * zoom). Strokes store only the tip id; params are resolved here at render.
 */

import { __ } from '@wordpress/i18n';

import { tipMask, clearTipMasks } from './tip-mask';
import { markColour } from './mark-colour';
import { MEDIA_TIPS, mediaMask } from './media-tips';

export const BRUSH_TIPS = [
	// Round family (continuous stroke, soft = feather amount).
	// `shape` and `spacing` are not decoration here. The round family lays
	// dabs too (drawSoftRoundStroke), so it has a real spacing - 0.18 was
	// hard-coded in the renderer, and a panel reading the tip table would
	// have shown 0 while 0.18 was in force. `circle` is what those dabs
	// are, which is what stampMaxReach needs to size the scratch window.
	{
		id: 'round',
		label: __( 'Hard Round', 'wunderpaint' ),
		render: 'round',
		soft: 0,
		shape: 'circle',
		spacing: 0.18,
	},
	{
		id: 'soft',
		label: __( 'Soft Round', 'wunderpaint' ),
		render: 'round',
		soft: 1,
		shape: 'circle',
		spacing: 0.18,
	},
	{
		id: 'medium',
		label: __( 'Medium', 'wunderpaint' ),
		render: 'round',
		soft: 0.5,
		shape: 'circle',
		spacing: 0.18,
	},

	// Flat / marker.
	{
		id: 'flat',
		label: __( 'Flat', 'wunderpaint' ),
		render: 'stamp',
		shape: 'square',
		spacing: 0.22,
	},
	{
		id: 'marker',
		label: __( 'Marker', 'wunderpaint' ),
		render: 'stamp',
		shape: 'square',
		spacing: 0.12,
		markSize: 0.92,
	},
	{
		id: 'square-dash',
		label: __( 'Square Dash', 'wunderpaint' ),
		render: 'stamp',
		shape: 'square',
		spacing: 1.1,
		markSize: 0.8,
	},

	// Calligraphy nibs (fixed-angle ellipse → thick/thin by direction).
	{
		id: 'calligraphy',
		label: __( 'Calligraphy', 'wunderpaint' ),
		render: 'stamp',
		shape: 'ellipse',
		angle: -45,
		ew: 0.62,
		eh: 0.16,
		spacing: 0.14,
	},
	{
		id: 'calligraphy-flat',
		label: __( 'Flat Nib', 'wunderpaint' ),
		render: 'stamp',
		shape: 'ellipse',
		angle: 0,
		ew: 0.6,
		eh: 0.18,
		spacing: 0.14,
	},
	{
		id: 'calligraphy-steep',
		label: __( 'Steep Nib', 'wunderpaint' ),
		render: 'stamp',
		shape: 'ellipse',
		angle: -72,
		ew: 0.6,
		eh: 0.15,
		spacing: 0.14,
	},

	// Textured / dry media.
	{
		id: 'chalk',
		label: __( 'Chalk', 'wunderpaint' ),
		render: 'stamp',
		shape: 'circle',
		spacing: 0.16,
		alphaJitter: 0.5,
		sizeJitter: 0.3,
		scatter: 0.08,
		count: 2,
	},
	{
		id: 'charcoal',
		label: __( 'Charcoal', 'wunderpaint' ),
		render: 'stamp',
		shape: 'circle',
		spacing: 0.14,
		alphaJitter: 0.6,
		sizeJitter: 0.4,
		scatter: 0.15,
		count: 3,
	},
	{
		id: 'crayon',
		label: __( 'Crayon', 'wunderpaint' ),
		render: 'stamp',
		shape: 'circle',
		spacing: 0.16,
		alphaJitter: 0.35,
		sizeJitter: 0.25,
	},
	{
		id: 'grain',
		label: __( 'Grain', 'wunderpaint' ),
		render: 'stamp',
		shape: 'circle',
		markSize: 0.18,
		spacing: 0.1,
		count: 6,
		scatter: 0.5,
		alphaJitter: 0.4,
	},
	{
		id: 'rough',
		label: __( 'Rough', 'wunderpaint' ),
		render: 'stamp',
		shape: 'square',
		spacing: 0.2,
		sizeJitter: 0.4,
		scatter: 0.12,
	},

	// Spray / airbrush.
	{
		id: 'spray',
		label: __( 'Spray', 'wunderpaint' ),
		render: 'stamp',
		shape: 'circle',
		markSize: 0.14,
		spacing: 0.4,
		count: 10,
		scatter: 0.65,
	},
	{
		id: 'fine-spray',
		label: __( 'Fine Spray', 'wunderpaint' ),
		render: 'stamp',
		shape: 'circle',
		markSize: 0.09,
		spacing: 0.5,
		count: 8,
		scatter: 0.8,
	},
	{
		id: 'heavy-spray',
		label: __( 'Heavy Spray', 'wunderpaint' ),
		render: 'stamp',
		shape: 'circle',
		markSize: 0.18,
		spacing: 0.3,
		count: 14,
		scatter: 0.6,
	},
	{
		id: 'speckle',
		label: __( 'Speckle', 'wunderpaint' ),
		render: 'stamp',
		shape: 'circle',
		markSize: 0.16,
		spacing: 0.45,
		count: 6,
		scatter: 0.55,
		sizeJitter: 0.5,
	},
	{
		id: 'stipple',
		label: __( 'Stipple', 'wunderpaint' ),
		render: 'stamp',
		shape: 'circle',
		markSize: 0.2,
		spacing: 0.6,
		count: 4,
		scatter: 0.5,
	},

	// Dots / patterns.
	{
		id: 'dots',
		label: __( 'Dots', 'wunderpaint' ),
		render: 'stamp',
		shape: 'circle',
		spacing: 1.4,
		markSize: 0.9,
	},
	{
		id: 'fine-dots',
		label: __( 'Fine Dots', 'wunderpaint' ),
		render: 'stamp',
		shape: 'circle',
		spacing: 0.9,
		markSize: 0.5,
	},
	{
		id: 'halftone',
		label: __( 'Halftone', 'wunderpaint' ),
		render: 'stamp',
		shape: 'circle',
		spacing: 1.0,
		markSize: 0.8,
	},

	// Shapes.
	{
		id: 'stars',
		label: __( 'Stars', 'wunderpaint' ),
		render: 'stamp',
		shape: 'star',
		points: 5,
		markSize: 0.95,
		spacing: 1.3,
		scatter: 0.2,
	},
	{
		id: 'sparkle',
		label: __( 'Sparkle', 'wunderpaint' ),
		render: 'stamp',
		shape: 'star',
		points: 4,
		markSize: 0.85,
		spacing: 1.2,
		scatter: 0.3,
		sizeJitter: 0.4,
	},
	{
		id: 'confetti',
		label: __( 'Confetti', 'wunderpaint' ),
		render: 'stamp',
		shape: 'square',
		markSize: 0.42,
		spacing: 0.7,
		count: 3,
		scatter: 0.6,
		sizeJitter: 0.5,
	},
	{
		id: 'diamonds',
		label: __( 'Diamonds', 'wunderpaint' ),
		render: 'stamp',
		shape: 'diamond',
		markSize: 0.9,
		spacing: 1.2,
		scatter: 0.15,
	},

	// Expanded set (v1.123, user wish: more brushes).
	{
		id: 'ink-pen',
		label: __( 'Ink Pen', 'wunderpaint' ),
		render: 'stamp',
		shape: 'ellipse',
		angle: -30,
		ew: 0.4,
		eh: 0.1,
		spacing: 0.07,
	},
	{
		id: 'pixel',
		label: __( 'Pixel', 'wunderpaint' ),
		render: 'stamp',
		shape: 'square',
		markSize: 1,
		spacing: 0.95,
	},
	{
		id: 'splatter',
		label: __( 'Splatter', 'wunderpaint' ),
		render: 'stamp',
		shape: 'circle',
		markSize: 0.4,
		spacing: 0.5,
		count: 5,
		scatter: 0.9,
		sizeJitter: 0.75,
		alphaJitter: 0.3,
	},
	{
		id: 'snow',
		label: __( 'Snow', 'wunderpaint' ),
		render: 'stamp',
		shape: 'circle',
		markSize: 0.22,
		spacing: 0.55,
		count: 5,
		scatter: 0.85,
		sizeJitter: 0.55,
		alphaJitter: 0.45,
	},
	{
		id: 'glitter',
		label: __( 'Glitter', 'wunderpaint' ),
		render: 'stamp',
		shape: 'star',
		points: 4,
		markSize: 0.3,
		spacing: 0.5,
		count: 5,
		scatter: 0.75,
		sizeJitter: 0.6,
		alphaJitter: 0.35,
		rotJitter: true,
	},
	{
		id: 'rings',
		label: __( 'Rings', 'wunderpaint' ),
		render: 'stamp',
		shape: 'ring',
		markSize: 0.9,
		spacing: 1.25,
	},
	{
		id: 'bubbles',
		label: __( 'Bubbles', 'wunderpaint' ),
		render: 'stamp',
		shape: 'ring',
		markSize: 0.6,
		spacing: 0.8,
		count: 3,
		scatter: 0.6,
		sizeJitter: 0.6,
		alphaJitter: 0.3,
	},
	{
		id: 'hearts',
		label: __( 'Hearts', 'wunderpaint' ),
		render: 'stamp',
		shape: 'heart',
		markSize: 0.85,
		spacing: 1.25,
		scatter: 0.2,
		rotJitter: 0.35,
	},
	{
		id: 'triangles',
		label: __( 'Triangles', 'wunderpaint' ),
		render: 'stamp',
		shape: 'triangle',
		markSize: 0.8,
		spacing: 1.1,
		scatter: 0.25,
		rotJitter: true,
		sizeJitter: 0.3,
	},
	{
		id: 'crosses',
		label: __( 'Crosses', 'wunderpaint' ),
		render: 'stamp',
		shape: 'cross',
		markSize: 0.8,
		spacing: 1.2,
		scatter: 0.2,
		rotJitter: 0.3,
	},
	{
		id: 'petals',
		label: __( 'Petals', 'wunderpaint' ),
		render: 'stamp',
		shape: 'ellipse',
		ew: 0.34,
		eh: 0.14,
		spacing: 0.75,
		count: 2,
		scatter: 0.55,
		rotJitter: true,
		alphaJitter: 0.3,
	},

	// MEDIA BRUSHES: three tuned tips per paint style - organic masks,
	// direction-following, tight spacing. Built in lib/media-tips.js.
	...MEDIA_TIPS,
];

export const BRUSH_TIP_MAP = BRUSH_TIPS.reduce( ( map, tip ) => {
	map[ tip.id ] = tip;
	return map;
}, {} );

/**
 * Tips the user drew, keyed by id.
 *
 * These are NOT in the table above, because the table is the shipped
 * gallery and these belong to a document. The document registers them
 * before its layers are drawn, which matters more than it looks: a stroke
 * stores only its tip's id, and `getTip` falls back to Hard Round for an
 * id it does not know. Register too late and every stroke made with a
 * drawn tip quietly comes back as a plain round one.
 */
const drawnTips = new Map();

/**
 * Replace the set of drawn tips.
 *
 * @param {Array} tips [{ id, label, doc, rev, ...tip params }]
 */
export function setDrawnTips( tips ) {
	drawnTips.clear();
	for ( const t of tips || [] ) {
		if ( t && t.id && t.doc ) {
			drawnTips.set( t.id, {
				render: 'stamp',
				shape: 'mask',
				spacing: 0.22,
				count: 1,
				...t,
			} );
		}
	}
	// A recipe may have changed under an id it already had.
	clearTipMasks();
}

/** Every drawn tip, in registration order. */
export const listDrawnTips = () => Array.from( drawnTips.values() );

/** Resolve a tip id to its definition (falls back to Hard Round). */
export const getTip = ( id ) =>
	drawnTips.get( id ) || BRUSH_TIP_MAP[ id ] || BRUSH_TIPS[ 0 ];

/** Whether a tip is stamped along points (vs. a continuous round stroke). */
export const isStampTip = ( id ) => 'stamp' === getTip( id ).render;

/**
 * Resample a polyline to roughly even spacing so stamps are evenly spread.
 *
 * The walk below only emits a point every FULL `step` of accumulated
 * length, so whatever is left over after the last full step (up to just
 * under `step`) was silently dropped - the resampled list stopped short of
 * `pts`'s own last point. While the stroke is still being drawn this is
 * invisible: `resamplePts` runs again on every pointer move, and the next
 * call's walk starts fresh over the whole (longer) `pts` and picks up that
 * leftover bit anyway. On the FINAL call for a finished stroke there is no
 * next call, so that trailing bit of path - up to a whole `step` of it,
 * i.e. up to ~36px for a size-200 default brush - never got a
 * stamp/gradient at all. That is the "ends short of the pointer" defect
 * for every tip that renders from `pts` (round-family `soft`/`flow`
 * strokes and every stamped tip); `path.d` had its own, separate fix
 * (`closeStroke`) that this does not touch.
 *
 * Always landing the last sample exactly on the real endpoint means a
 * widely-spaced stamped tip (spacing well over 1, e.g. Dots) can get a
 * final dab closer to the previous one than its usual spacing - the two
 * overlap more than neighbouring dabs do. That is not a new failure mode:
 * every dab already overlaps its neighbours by construction for any tip
 * with spacing < 2 (the default gallery tops out at 1.4), and a rounded,
 * slightly denser end cap is what every other paint tool does when the
 * hand stops mid-step - the alternative (leaving the pointer's actual
 * position unpainted) is worse.
 *
 * @param {Array}  pts  Points [{x,y}].
 * @param {number} step Spacing in document px.
 * @return {Array} Evenly spaced points, always ending on `pts`'s own last point.
 */
export function resamplePts( pts, step ) {
	if ( ! pts || pts.length < 2 ) {
		return pts ? [ ...pts ] : [];
	}
	const out = [ { ...pts[ 0 ] } ];
	const s = Math.max( 0.5, step );
	let acc = 0;
	for ( let i = 1; i < pts.length; i++ ) {
		let a = pts[ i - 1 ];
		const b = pts[ i ];
		let seg = Math.hypot( b.x - a.x, b.y - a.y );
		while ( acc + seg >= s ) {
			const t = ( s - acc ) / seg;
			const np = {
				x: a.x + ( b.x - a.x ) * t,
				y: a.y + ( b.y - a.y ) * t,
			};
			out.push( np );
			a = np;
			seg = Math.hypot( b.x - a.x, b.y - a.y );
			acc = 0;
		}
		acc += seg;
	}
	// Emit the dropped trailing bit as one last sample AT the real endpoint,
	// unless it is already there (the walk above lands there exactly when
	// the path length is a whole multiple of `s`).
	const last = pts[ pts.length - 1 ];
	const lastOut = out[ out.length - 1 ];
	if ( lastOut.x !== last.x || lastOut.y !== last.y ) {
		out.push( { ...last } );
	}
	return out;
}

/** Mirror a point list across the document axes (symmetry twins). */
export function mirrorPts( pts, docW, docH, mirror ) {
	return ( pts || [] ).map( ( p ) => ( {
		x: 'x' === mirror || 'xy' === mirror ? docW - p.x : p.x,
		y: 'y' === mirror || 'xy' === mirror ? docH - p.y : p.y,
	} ) );
}

function drawStar( ctx, x, y, r, points ) {
	ctx.beginPath();
	for ( let i = 0; i < points * 2; i++ ) {
		const rr = i % 2 ? r * 0.45 : r;
		const a = ( i / ( points * 2 ) ) * 2 * Math.PI - Math.PI / 2;
		const px = x + Math.cos( a ) * rr;
		const py = y + Math.sin( a ) * rr;
		if ( i ) {
			ctx.lineTo( px, py );
		} else {
			ctx.moveTo( px, py );
		}
	}
	ctx.closePath();
	ctx.fill();
}

function drawMark( ctx, x, y, size, tip, rnd, dir ) {
	const jitter = tip.sizeJitter ? 1 - tip.sizeJitter * rnd() : 1;
	const s = Math.max( 0.5, size * ( tip.markSize || 1 ) * jitter );
	const shape = tip.shape || 'circle';
	// Random per-mark rotation (v1.123): true = free spin, number = the
	// fraction of a half turn each mark may deviate. A tip that FOLLOWS
	// the stroke adds the sampled path direction on top - that turn into
	// the hand's motion is most of the distance between a stamped shape
	// and a brush (the media brushes, v1.411.0).
	const rot =
		( ( tip.angle || 0 ) * Math.PI ) / 180 +
		( tip.followDir ? dir || 0 : 0 ) +
		( tip.rotJitter
			? ( rnd() - 0.5 ) *
			  2 *
			  Math.PI *
			  ( true === tip.rotJitter ? 1 : tip.rotJitter )
			: 0 );
	if ( 'media' === shape ) {
		// Torn variants: at 3-5% spacing overlapping stamps bridge any
		// break INSIDE one mask, so break-up along the stroke has to come
		// from the mask CHANGING stamp to stamp.
		const variant =
			tip.variants > 1 ? Math.floor( rnd() * tip.variants ) : 0;
		const m = mediaMask( tip.id, s, String( ctx.fillStyle ), variant );
		if ( m ) {
			ctx.save();
			ctx.translate( x, y );
			if ( rot ) {
				ctx.rotate( rot );
			}
			ctx.drawImage( m, -s / 2, -s / 2, s, s );
			ctx.restore();
		} else {
			// Off-DOM (a test run): a round mark keeps the brush working.
			ctx.beginPath();
			ctx.arc( x, y, s / 2, 0, 2 * Math.PI );
			ctx.fill();
		}
	} else if ( 'mask' === shape ) {
		// The stroke's colour is already on the context; the mask is baked
		// in that colour, so one drawImage is the whole mark.
		const m = tipMask(
			tip.doc,
			tip.maskKey || tip.id || 'drawn',
			s,
			ctx.fillStyle
		);
		if ( m ) {
			ctx.save();
			ctx.translate( x, y );
			if ( rot ) {
				ctx.rotate( rot );
			}
			ctx.drawImage( m, -s / 2, -s / 2, s, s );
			ctx.restore();
		} else {
			// No canvas to render into (a test run, or an empty recipe).
			// A round mark is a poor tip but a working brush.
			ctx.beginPath();
			ctx.arc( x, y, s / 2, 0, 2 * Math.PI );
			ctx.fill();
		}
	} else if ( 'square' === shape ) {
		if ( rot ) {
			ctx.save();
			ctx.translate( x, y );
			ctx.rotate( rot );
			ctx.fillRect( -s / 2, -s / 2, s, s );
			ctx.restore();
		} else {
			ctx.fillRect( x - s / 2, y - s / 2, s, s );
		}
	} else if ( 'ellipse' === shape ) {
		ctx.save();
		ctx.translate( x, y );
		ctx.rotate( rot );
		ctx.beginPath();
		ctx.ellipse(
			0,
			0,
			size * ( tip.ew || 0.6 ),
			size * ( tip.eh || 0.18 ),
			0,
			0,
			2 * Math.PI
		);
		ctx.fill();
		ctx.restore();
	} else if ( 'star' === shape ) {
		if ( rot ) {
			ctx.save();
			ctx.translate( x, y );
			ctx.rotate( rot );
			drawStar( ctx, 0, 0, s / 2, tip.points || 5 );
			ctx.restore();
		} else {
			drawStar( ctx, x, y, s / 2, tip.points || 5 );
		}
	} else if ( 'diamond' === shape ) {
		ctx.save();
		ctx.translate( x, y );
		ctx.rotate( Math.PI / 4 + rot );
		ctx.fillRect( -s * 0.36, -s * 0.36, s * 0.72, s * 0.72 );
		ctx.restore();
	} else if ( 'ring' === shape ) {
		ctx.save();
		ctx.lineWidth = Math.max( 0.5, s * 0.14 );
		ctx.strokeStyle = ctx.fillStyle;
		ctx.beginPath();
		ctx.arc( x, y, s / 2, 0, 2 * Math.PI );
		ctx.stroke();
		ctx.restore();
	} else if ( 'triangle' === shape ) {
		ctx.save();
		ctx.translate( x, y );
		ctx.rotate( rot );
		ctx.beginPath();
		ctx.moveTo( 0, -s / 2 );
		ctx.lineTo( s * 0.46, s * 0.36 );
		ctx.lineTo( -s * 0.46, s * 0.36 );
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	} else if ( 'cross' === shape ) {
		ctx.save();
		ctx.translate( x, y );
		ctx.rotate( rot );
		const arm = s * 0.34;
		ctx.fillRect( -s / 2, -arm / 2, s, arm );
		ctx.fillRect( -arm / 2, -s / 2, arm, s );
		ctx.restore();
	} else if ( 'heart' === shape ) {
		ctx.save();
		ctx.translate( x, y );
		ctx.rotate( rot );
		const h = s / 2;
		ctx.beginPath();
		ctx.moveTo( 0, h * 0.95 );
		ctx.bezierCurveTo( -h * 1.3, h * 0.15, -h * 0.85, -h, 0, -h * 0.35 );
		ctx.bezierCurveTo( h * 0.85, -h, h * 1.3, h * 0.15, 0, h * 0.95 );
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	} else {
		ctx.beginPath();
		ctx.arc( x, y, s / 2, 0, 2 * Math.PI );
		ctx.fill();
	}
}

/**
 * How far a single mark's OWN farthest pixel sits from ITS OWN centre, as a
 * fraction of `s` (the mark's scaled size - see `drawMark`), one entry per
 * `shape`. Each value is the exact geometry `drawMark` draws for that
 * shape (a rotated square's corner, a triangle's farthest vertex, a ring's
 * outer edge, ...), not a guess - and rotation-invariant by construction:
 * it is each shape's farthest point from centre over ALL rotations, which
 * is exactly the bound a random per-mark rotation (`tip.angle`/
 * `rotJitter`) needs.
 */
const MARK_SHAPE_REACH = {
	circle: 0.5, // ctx.arc radius s/2
	mask: Math.hypot( 0.5, 0.5 ), // corner of the square the recipe fills
	media: Math.hypot( 0.5, 0.5 ), // same square, procedurally filled
	square: Math.hypot( 0.5, 0.5 ), // corner of the side-s square
	star: 0.5, // outer points sit at radius s/2
	diamond: Math.hypot( 0.36, 0.36 ), // corner of the rotated 0.72s square
	ring: 0.5 + 0.07, // arc radius 0.5 + half its own 0.14 stroke width
	triangle: Math.hypot( 0.46, 0.36 ), // its farthest of 3 vertices
	cross: Math.hypot( 0.5, 0.17 ), // farthest corner of either arm rect
	// Farthest of the heart path's bezier control points from centre (the
	// curve itself never leaves their convex hull, so this bounds it too).
	// Control points are expressed in units of h = s/2, hence the /2.
	heart:
		Math.max(
			Math.hypot( 0, 0.95 ),
			Math.hypot( 1.3, 0.15 ),
			Math.hypot( 0.85, 1 )
		) / 2,
};
// A shape not in the table above (a future addition) falls back to the
// largest known value instead of guessing.
const MARK_REACH_FALLBACK = Math.max( ...Object.values( MARK_SHAPE_REACH ) );

/**
 * How far from a stroke's sampled path point a single stamped mark's
 * farthest pixel can land, in document px - the real inverse of everything
 * `stampTipStroke` does that moves ink off the path.
 *
 * `tip.scatter`: `Math.sqrt(rnd()) * size * tip.scatter` with `rnd() < 1`,
 * so its own worst case is the full `size * tip.scatter`.
 *
 * The mark's own half-width once drawn: `tip.markSize` scales it, and
 * `tip.sizeJitter` is ignored on purpose - it only ever SHRINKS a mark
 * (`jitter = 1 - sizeJitter * rnd()`, always <= 1), never grows it past
 * `markSize`, so the un-jittered size is already the safe upper bound.
 * `shape: 'ellipse'` is a special case: `drawMark` sizes an ellipse off
 * the raw stroke `size`, not the markSize-scaled mark size, unlike every
 * other shape.
 *
 * `tip.count` draws more marks per path point, each with its own
 * independent scatter draw - it raises how much ink lands off-path, not
 * how FAR any single mark can land, so it does not change this bound.
 *
 * @param {string} tipId Tip id (as stored on a path).
 * @param {number} size  Stroke size in document px.
 * @return {number} Maximum document-px distance a drawn pixel of this tip
 *   can land from the path.
 */
/**
 * A tip's numbers, with per-stroke overrides on top.
 *
 * The tip table is the STARTING POINT, not the last word: until now
 * `spacing`, `scatter` and the two jitters were baked into the table and
 * unreachable, which is most of the distance between "a brush" and "a
 * brush you can shape". A stroke may carry its own value for any of them;
 * anything it does not carry keeps the tip's own.
 *
 * @param {Object} path A stroke path, or just `{ tip }`.
 * @return {Object} The resolved tip settings.
 */
export function tipSettings( path ) {
	const tip = getTip( path.tip );
	const pick = ( key, fallback ) =>
		undefined === path[ key ] || null === path[ key ]
			? tip[ key ] ?? fallback
			: path[ key ];
	return {
		...tip,
		spacing: pick( 'spacing', 0.22 ),
		scatter: pick( 'scatter', 0 ),
		alphaJitter: pick( 'alphaJitter', 0 ),
		sizeJitter: pick( 'sizeJitter', 0 ),
		count: Math.max( 1, Math.round( pick( 'count', 1 ) ) ),
		hueJitter: pick( 'hueJitter', 0 ),
		satJitter: pick( 'satJitter', 0 ),
		litJitter: pick( 'litJitter', 0 ),
		colorMode: pick( 'colorMode', 'solid' ),
		gradientStops: pick( 'gradientStops', null ),
		gradientCycles: pick( 'gradientCycles', 1 ),
	};
}

/**
 * The dice a mark rolls, shared by every renderer that lays marks.
 *
 * EVERY MARK OWNS ITS DICE, KEYED ON WHERE IT SITS ALONG THE STROKE.
 *
 * This used to be one sequence seeded from the number of marks, which
 * meant the seed changed the instant the stroke grew by one - so every
 * scatter offset and every jitter was thrown again on every frame of the
 * drag. That is the shimmering: the stroke boiled while it was drawn and
 * shifted once more on release, when closing the path added the final
 * sample. Only round tips looked right, because they rolled no dice.
 *
 * Keyed on the index, mark 5 rolls the same numbers whether the stroke is
 * six marks long or six hundred. Only the very last mark still moves
 * while the hand moves, which is the live tip of the stroke.
 *
 * `seed` is a method rather than a fresh closure per mark: a long drag
 * lays thousands of them per frame.
 *
 * NOT `Math.imul` in the step below, deliberately, though the plain
 * product does reach 2^61 and lose its lowest bits - the same shape as a
 * real bug fixed in mark-colour.js, where those bits WERE the answer.
 * Here the result is divided down into [0,1), so the lost bits are the
 * last decimals of a jitter amount: measured over 20,000 marks the
 * distribution across ten buckets spans 58, which is inside the noise for
 * that many draws. Switching it would reroll every stamped stroke in
 * every saved document to buy nothing.
 *
 * @param {number} size     Stroke size, which salts the sequence.
 * @param {number} seedBase Offset for renderers that get one SEGMENT at a
 *   time (the eraser), so segments do not repeat in lockstep.
 * @return {Function} rnd() in [0,1), with rnd.seed( index, sub ).
 */
export function markDice( size, seedBase ) {
	const salt = Math.round( size * 7 ) + 1;
	let rs = 0;
	const rnd = () => {
		rs = ( rs * 1103515245 + 12345 ) & 0x7fffffff;
		return rs / 0x7fffffff;
	};
	rnd.seed = ( si, i = 0 ) => {
		rs =
			( Math.imul( si + seedBase, 2654435761 ) + i * 40503 + salt ) &
			0x7fffffff;
	};
	return rnd;
}

/**
 * Does this stroke need marks laid one by one?
 *
 * The round family can be drawn two ways: as one continuous `ctx.stroke()`,
 * which is fast and perfectly smooth, or as a row of dabs. A line has
 * nothing to scatter, thin out or vary in size, so the moment any of those
 * is asked for, the fast way stops being able to answer.
 *
 * Asked of the RESOLVED values: a stroke that carries the keys but leaves
 * them at the tip's own numbers still has nothing to scatter, and keeps
 * the fast line. Spacing counts only when the stroke MOVED it - a row of
 * dabs at the tip's own spacing is what the line already looks like.
 *
 * @param {Object} path A stroke path.
 * @return {boolean} True when the stroke has to be laid as marks.
 */
export function pathIsShaped( path ) {
	const t = tipSettings( path );
	return !! (
		t.scatter ||
		t.alphaJitter ||
		t.sizeJitter ||
		( undefined !== path.spacing &&
			null !== path.spacing &&
			path.spacing !== getTip( path.tip ).spacing )
	);
}

export function stampMaxReach( tipId, size, over ) {
	const tip = tipSettings( { tip: tipId, ...( over || {} ) } );
	const markReach =
		'ellipse' === tip.shape
			? size * Math.max( tip.ew || 0.6, tip.eh || 0.18 )
			: size *
			  ( tip.markSize || 1 ) *
			  ( MARK_SHAPE_REACH[ tip.shape ] ?? MARK_REACH_FALLBACK );
	const scatterReach = size * ( tip.scatter || 0 );
	return scatterReach + markReach;
}

/**
 * Stamp a non-round tip along a stroke's sampled points into `ctx`
 * (document-coordinate space). Used by the renderer and the tip previews.
 *
 * @param {CanvasRenderingContext2D} ctx  Target context.
 * @param {Object}                   path Stroke path { pts, tip, size, color, opacity }.
 */
export function stampTipStroke( ctx, path ) {
	const tip = tipSettings( path );
	const pts = path.pts || [];
	if ( ! pts.length ) {
		return;
	}
	const size = path.size || 1;
	// Stamped tips already work per stamp, so flow simply scales each
	// stamp's alpha (v1.129.0) - overlaps darken like an airbrush.
	const opacity = ( path.opacity ?? 1 ) * ( path.flow ?? 1 );
	// `??`, not `||`. tipSettings has already resolved the spacing, so a
	// zero here means zero - and with `||` it silently became the 0.22
	// default instead, which is why the slider could not be taken all the
	// way down.
	//
	// THE FLOOR SCALES WITH THE MARK. Half a pixel alone is the right
	// limit for a small tip and a trap for a large one: at size 500 and
	// spacing 0 a single drag across the canvas asks for thousands of
	// stamps per frame, each one a mask blit, for marks that overlap fifty
	// deep and cannot be told apart. Two percent of the mark is still far
	// denser than any eye resolves and costs a twentieth of the work.
	const step = Math.max( 0.5, size * 0.02, size * ( tip.spacing ?? 0.22 ) );
	const samples = resamplePts( pts, step );
	const count = tip.count || 1;

	// Per-mark dice, keyed on the index - see markDice for why that matters
	// and what it cost to learn.
	const rnd = markDice( size, path.seedOffset || 0 );

	ctx.save();
	const base = path.color || '#000';
	ctx.fillStyle = base;
	// One decision for every tip that lays marks, soft round ones too.
	const vary = markColour( { ...path, ...tip }, samples.length );
	for ( let si = 0; si < samples.length; si++ ) {
		const p = samples[ si ];
		// The stroke direction at this sample, for tips that follow it.
		// Central difference; a single-sample stroke has no direction.
		let dir = 0;
		if ( tip.followDir && samples.length > 1 ) {
			const q = samples[ Math.min( si + 1, samples.length - 1 ) ];
			const o = samples[ Math.max( si - 1, 0 ) ];
			dir = Math.atan2( q.y - o.y, q.x - o.x );
		}
		for ( let i = 0; i < count; i++ ) {
			rnd.seed( si, i );
			let x = p.x;
			let y = p.y;
			if ( tip.scatter ) {
				const a = rnd() * 2 * Math.PI;
				const r = Math.sqrt( rnd() ) * size * tip.scatter;
				x += Math.cos( a ) * r;
				y += Math.sin( a ) * r;
			}
			ctx.globalAlpha =
				opacity * ( tip.alphaJitter ? 1 - tip.alphaJitter * rnd() : 1 );
			if ( vary ) {
				const shade = vary( si );
				ctx.fillStyle = shade.hex;
				if ( 1 !== shade.alpha ) {
					ctx.globalAlpha *= shade.alpha;
				}
			}
			drawMark( ctx, x, y, size, tip, rnd, dir );
		}
	}
	ctx.restore();
}

/**
 * The tips, grouped by what they are FOR.
 *
 * Thomas' verdict on the flat list of 37: "die meisten funktionieren
 * sowieso nicht, sind ueberhaupt nicht geeignet, es geht hier um Malen."
 * He is right, and the fix is not to delete them - a confetti tip is
 * genuinely useful for confetti - it is to stop presenting a marker and a
 * heart as the same kind of thing. Painting tips come first; the rest are
 * still one click away, under a heading that says what they are.
 *
 * Any tip not named here still appears, under Other, so adding one to
 * BRUSH_TIPS can never make it vanish from the panel.
 */
export const TIP_GROUPS = [
	{
		id: 'media',
		name: __( 'Media brushes', 'wunderpaint' ),
		tips: MEDIA_TIPS.map( ( t ) => t.id ),
	},
	{
		id: 'paint',
		name: __( 'Paint', 'wunderpaint' ),
		tips: [ 'round', 'soft', 'medium', 'flat', 'marker', 'ink-pen' ],
	},
	{
		id: 'dry',
		name: __( 'Dry media', 'wunderpaint' ),
		tips: [ 'chalk', 'charcoal', 'crayon', 'grain', 'rough', 'pixel' ],
	},
	{
		id: 'calligraphy',
		name: __( 'Calligraphy', 'wunderpaint' ),
		tips: [ 'calligraphy', 'calligraphy-flat', 'calligraphy-steep' ],
	},
	{
		id: 'spray',
		name: __( 'Spray & texture', 'wunderpaint' ),
		tips: [
			'spray',
			'fine-spray',
			'heavy-spray',
			'speckle',
			'stipple',
			'splatter',
		],
	},
	{
		id: 'pattern',
		name: __( 'Dots & pattern', 'wunderpaint' ),
		tips: [ 'dots', 'fine-dots', 'halftone', 'rings', 'square-dash' ],
	},
	{
		id: 'shapes',
		name: __( 'Shapes', 'wunderpaint' ),
		tips: [
			'stars',
			'sparkle',
			'glitter',
			'confetti',
			'diamonds',
			'triangles',
			'crosses',
			'hearts',
			'petals',
			'bubbles',
			'snow',
		],
	},
];

/**
 * The groups with their real tip objects, plus an Other group for anything
 * the table gained since. Nothing can fall out of the panel by omission.
 *
 * @return {Array} [{ id, name, tips: [tip] }]
 */
export function groupedTips() {
	const seen = new Set();
	const out = TIP_GROUPS.map( ( g ) => ( {
		...g,
		tips: g.tips
			.map( ( id ) => {
				seen.add( id );
				return BRUSH_TIP_MAP[ id ];
			} )
			.filter( Boolean ),
	} ) ).filter( ( g ) => g.tips.length );
	const rest = BRUSH_TIPS.filter( ( t ) => ! seen.has( t.id ) );
	if ( rest.length ) {
		out.push( {
			id: 'other',
			name: __( 'Other', 'wunderpaint' ),
			tips: rest,
		} );
	}
	// Drawn tips go FIRST: they belong to this document and are the ones
	// somebody went to the trouble of making.
	const drawn = listDrawnTips();
	if ( drawn.length ) {
		out.unshift( {
			id: 'drawn',
			name: __( 'Your tips', 'wunderpaint' ),
			tips: drawn,
		} );
	}
	return out;
}
