/**
 * Brush tip types (v1.21, expanded v1.22), a data-driven gallery of
 * Photoshop-style brush tips. `render:'round'` tips are continuous strokes
 * with a soft-edge amount; `render:'stamp'` tips stamp a shape along the
 * stroke's sampled points (in document coordinates, so they scale with
 * zoom). Strokes store only the tip id; params are resolved here at render.
 */

import { __ } from '@wordpress/i18n';

export const BRUSH_TIPS = [
	// Round family (continuous stroke, soft = feather amount).
	{
		id: 'round',
		label: __( 'Hard Round', 'wunderpaint' ),
		render: 'round',
		soft: 0,
	},
	{
		id: 'soft',
		label: __( 'Soft Round', 'wunderpaint' ),
		render: 'round',
		soft: 1,
	},
	{
		id: 'medium',
		label: __( 'Medium', 'wunderpaint' ),
		render: 'round',
		soft: 0.5,
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
];

export const BRUSH_TIP_MAP = BRUSH_TIPS.reduce( ( map, tip ) => {
	map[ tip.id ] = tip;
	return map;
}, {} );

/** Resolve a tip id to its definition (falls back to Hard Round). */
export const getTip = ( id ) => BRUSH_TIP_MAP[ id ] || BRUSH_TIPS[ 0 ];

/** Whether a tip is stamped along points (vs. a continuous round stroke). */
export const isStampTip = ( id ) => 'stamp' === getTip( id ).render;

/**
 * Resample a polyline to roughly even spacing so stamps are evenly spread.
 *
 * @param {Array}  pts  Points [{x,y}].
 * @param {number} step Spacing in document px.
 * @return {Array} Evenly spaced points.
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
	return out;
}

/** Mirror a point list across the document axes (symmetry twins). */
export function mirrorPts( pts, docW, docH, mirror ) {
	return ( pts || [] ).map( ( p ) => ( {
		x: 'x' === mirror || 'xy' === mirror ? docW - p.x : p.x,
		y: 'y' === mirror || 'xy' === mirror ? docH - p.y : p.y,
	} ) );
}

// Deterministic PRNG so a stroke re-renders identically.
const lcg = ( seed ) => () => {
	seed = ( seed * 1103515245 + 12345 ) & 0x7fffffff;
	return seed / 0x7fffffff;
};

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

function drawMark( ctx, x, y, size, tip, rnd ) {
	const jitter = tip.sizeJitter ? 1 - tip.sizeJitter * rnd() : 1;
	const s = Math.max( 0.5, size * ( tip.markSize || 1 ) * jitter );
	const shape = tip.shape || 'circle';
	// Random per-mark rotation (v1.123): true = free spin, number = the
	// fraction of a half turn each mark may deviate.
	const rot =
		( ( tip.angle || 0 ) * Math.PI ) / 180 +
		( tip.rotJitter
			? ( rnd() - 0.5 ) *
			  2 *
			  Math.PI *
			  ( true === tip.rotJitter ? 1 : tip.rotJitter )
			: 0 );
	if ( 'square' === shape ) {
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
 * Stamp a non-round tip along a stroke's sampled points into `ctx`
 * (document-coordinate space). Used by the renderer and the tip previews.
 *
 * @param {CanvasRenderingContext2D} ctx  Target context.
 * @param {Object}                   path Stroke path { pts, tip, size, color, opacity }.
 */
export function stampTipStroke( ctx, path ) {
	const tip = getTip( path.tip );
	const pts = path.pts || [];
	if ( ! pts.length ) {
		return;
	}
	const size = path.size || 1;
	// Stamped tips already work per stamp, so flow simply scales each
	// stamp's alpha (v1.129.0) - overlaps darken like an airbrush.
	const opacity = ( path.opacity ?? 1 ) * ( path.flow ?? 1 );
	const step = Math.max( 0.5, size * ( tip.spacing || 0.22 ) );
	const samples = resamplePts( pts, step );
	const rnd = lcg( samples.length * 131 + Math.round( size * 7 ) + 1 );
	const count = tip.count || 1;

	ctx.save();
	ctx.fillStyle = path.color || '#000';
	for ( const p of samples ) {
		for ( let i = 0; i < count; i++ ) {
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
			drawMark( ctx, x, y, size, tip, rnd );
		}
	}
	ctx.restore();
}
