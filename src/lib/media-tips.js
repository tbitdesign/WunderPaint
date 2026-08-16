/**
 * MEDIA BRUSHES: three tuned tips per paint style, built the way real
 * brush engines build theirs: an ORGANIC mask bitmap, stamped densely
 * (2-6% spacing), rotated INTO the stroke direction, edges broken by
 * texture. Two of those three legs already exist here - the stamped
 * renderer and, better than a texture gate, the wet engines' physics
 * (fibre edge, tooth gate, ridge grain). What was missing is exactly what
 * this module adds: masks that look like a loaded brush instead of a
 * geometry lesson, and marks that follow the hand.
 *
 * The masks are PROCEDURAL and deterministic (hash dice, no Math.random):
 * no shipped bitmaps, no third-party assets, no payload, and every size
 * renders crisp.
 *
 * A mask is a COVERAGE bitmap: drawn black once per size bucket, then
 * baked per stroke colour (same reasoning as tip-mask.js: recolouring a
 * shared scratch would repaint other strokes). Cache capped by entries;
 * buckets keep it bounded.
 */

import { __ } from '@wordpress/i18n';

import { createCanvas } from './raster/env';

/* ------------------------------ die Wuerfel ------------------------------ */

/** Deterministic dice, one sequence per mask id - same tip, same look. */
function dice( seed ) {
	let h = 2166136261 >>> 0;
	for ( let i = 0; i < seed.length; i++ ) {
		h = Math.imul( h ^ seed.charCodeAt( i ), 16777619 );
	}
	return () => {
		h = Math.imul( h ^ ( h >>> 15 ), 2246822519 );
		h = Math.imul( h ^ ( h >>> 13 ), 3266489917 );
		return ( ( h ^= h >>> 16 ) >>> 0 ) / 4294967296;
	};
}

/* --------------------------- die Mal-Grundformen -------------------------- */

/** A soft round dab: radial gradient, alpha 1 at heart, 0 at rim. */
function dab( ctx, x, y, r, alpha, hart ) {
	if ( r < 0.6 ) {
		return;
	}
	if ( hart ) {
		ctx.globalAlpha = alpha;
		ctx.beginPath();
		ctx.arc( x, y, r, 0, 2 * Math.PI );
		ctx.fill();
		ctx.globalAlpha = 1;
		return;
	}
	const g = ctx.createRadialGradient( x, y, 0, x, y, r );
	g.addColorStop( 0, `rgba(0,0,0,${ alpha })` );
	g.addColorStop( 0.6, `rgba(0,0,0,${ alpha * 0.7 })` );
	g.addColorStop( 1, 'rgba(0,0,0,0)' );
	ctx.fillStyle = g;
	ctx.fillRect( x - r, y - r, 2 * r, 2 * r );
	ctx.fillStyle = '#000';
}

/**
 * BRISTLE BUNDLE, seen in cross-section. Stamped densely along the path
 * (followDir), the dots trace continuous grooves - the bristle streaks a
 * flat or round hog brush leaves. `breite`/`hoehe` shape the ferrule.
 */
function genBorsten( ctx, S, o, rnd ) {
	const bx = ( o.breite ?? 0.9 ) * S * 0.5;
	const by = ( o.hoehe ?? 0.55 ) * S * 0.5;
	const cx = S / 2;
	const cy = S / 2;
	// The film that holds the bundle together - without it the streaks
	// read as confetti, with too much they read as a plain ellipse.
	if ( o.film ?? 0.25 ) {
		ctx.save();
		ctx.translate( cx, cy );
		ctx.scale( bx / S, by / S );
		dab( ctx, 0, 0, S, o.film ?? 0.25, false );
		ctx.restore();
	}
	// A COMB, not a cloud: bristles sit in fixed slots across the ferrule
	// with real gaps between them. Stamped at 3-5% spacing only the
	// vertical profile of the mask survives in the stroke body - the
	// slots ARE the grooves, a random cloud averages to a solid bar.
	const slots = Math.max( 5, Math.round( ( o.dichte ?? 22 ) / 2.6 ) );
	const pitch = ( 2 * by ) / slots;
	for ( let i = 0; i < slots; i++ ) {
		if ( rnd() < ( o.luecken ?? 0.18 ) ) {
			continue; // a missing bristle - the groove that stays open
		}
		const ty = -by + ( i + 0.5 ) * pitch + ( rnd() - 0.5 ) * pitch * 0.5;
		// Round ferrules taper the outer bristles.
		const huell = Math.sqrt(
			Math.max( 0.15, 1 - ( ty / by ) * ( ty / by ) )
		);
		const tx = ( rnd() + rnd() - 1 ) * bx * 0.8;
		const r =
			Math.max(
				S * ( o.punktMin ?? 0.03 ),
				pitch * ( 0.32 + rnd() * 0.3 )
			) * huell;
		dab(
			ctx,
			cx + tx,
			cy + ty,
			r,
			0.55 + 0.45 * rnd(),
			rnd() < ( o.hart ?? 0.5 )
		);
	}
}

/**
 * RAGGED BLOB: a disc whose rim wanders (harmonics, not hash - hash rims
 * read as saw teeth) and whose inside is mottled. The watercolour mop and
 * every "blocking" brush live here.
 */
function genZerklueftet( ctx, S, o, rnd ) {
	const cx = S / 2;
	const cy = S / 2;
	const R = S * 0.44;
	const amp = o.zacken ?? 0.16;
	const ph = [ rnd() * 7, rnd() * 7, rnd() * 7 ];
	const rim = ( t ) =>
		R *
		( 1 -
			amp *
				( 0.55 * ( 0.5 + 0.5 * Math.sin( 3 * t + ph[ 0 ] ) ) +
					0.3 * ( 0.5 + 0.5 * Math.sin( 7 * t + ph[ 1 ] ) ) +
					0.15 * ( 0.5 + 0.5 * Math.sin( 13 * t + ph[ 2 ] ) ) ) );
	ctx.save();
	ctx.beginPath();
	for ( let i = 0; i <= 72; i++ ) {
		const t = ( i / 72 ) * 2 * Math.PI;
		const r = rim( t );
		const x = cx + Math.cos( t ) * r;
		const y = cy + Math.sin( t ) * r;
		if ( i ) {
			ctx.lineTo( x, y );
		} else {
			ctx.moveTo( x, y );
		}
	}
	ctx.closePath();
	ctx.clip();
	dab( ctx, cx, cy, R * 1.15, o.deckung ?? 0.95, ( o.hart ?? 0 ) > 0.5 );
	ctx.restore();
	// Mottling: thin spots INSIDE the body, the way a loaded brush skips.
	const m = Math.round( ( o.flecken ?? 7 ) * ( S / 100 ) );
	ctx.globalCompositeOperation = 'destination-out';
	for ( let i = 0; i < m; i++ ) {
		const a = rnd() * 2 * Math.PI;
		const r = Math.sqrt( rnd() ) * R * 0.7;
		dab(
			ctx,
			cx + Math.cos( a ) * r,
			cy + Math.sin( a ) * r,
			S * ( 0.05 + rnd() * 0.09 ),
			0.12 + rnd() * ( o.fleckTiefe ?? 0.28 ),
			false
		);
	}
	ctx.globalCompositeOperation = 'source-over';
}

/**
 * POINTED ROUND: the classic watercolour/brush-pen head - a belly that
 * tapers to a point along +x (followDir turns it into the stroke).
 */
function genSpitzOval( ctx, S, o, rnd ) {
	const cx = S * 0.42;
	const cy = S / 2;
	const R = S * ( o.bauch ?? 0.3 );
	const len = S * ( o.laenge ?? 0.5 );
	const steps = 14;
	for ( let i = 0; i < steps; i++ ) {
		const t = i / ( steps - 1 );
		// Belly at the heel, taper towards the tip; slight wobble so the
		// point is a hair's, not a compass'.
		const r = R * Math.pow( 1 - t, o.spitzheit ?? 0.7 );
		const wob = ( rnd() - 0.5 ) * S * 0.015;
		dab(
			ctx,
			cx + t * len,
			cy + wob,
			Math.max( r, S * 0.02 ),
			( o.deckung ?? 0.9 ) * ( 0.75 + 0.25 * ( 1 - t ) ),
			( o.hart ?? 0 ) > 0.5
		);
	}
}

/**
 * SCRIBBLE NUB: a charcoal stick's tip - short hard strokes crossing at
 * shallow angles, edges that catch and skip.
 */
function genKritzel( ctx, S, o, rnd ) {
	const cx = S / 2;
	const cy = S / 2;
	const n = Math.max( 6, Math.round( ( o.striche ?? 11 ) * ( S / 100 ) ) );
	ctx.lineCap = 'round';
	for ( let i = 0; i < n; i++ ) {
		const a = ( rnd() - 0.5 ) * ( o.winkel ?? 1.2 );
		const len = S * ( 0.16 + rnd() * 0.26 );
		const ox = ( rnd() + rnd() - 1 ) * S * 0.22;
		const oy = ( rnd() + rnd() - 1 ) * S * 0.22;
		ctx.globalAlpha = 0.4 + 0.55 * rnd();
		ctx.lineWidth = S * ( 0.05 + rnd() * ( o.dicke ?? 0.09 ) );
		ctx.beginPath();
		ctx.moveTo(
			cx + ox - ( Math.cos( a ) * len ) / 2,
			cy + oy - ( Math.sin( a ) * len ) / 2
		);
		ctx.lineTo(
			cx + ox + ( Math.cos( a ) * len ) / 2,
			cy + oy + ( Math.sin( a ) * len ) / 2
		);
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
}

/**
 * KNIFE EDGE: a thin slab of paint as the palette knife leaves it -
 * streaks with torn ends, nothing round anywhere.
 */
function genKante( ctx, S, o, rnd ) {
	const cy = S / 2;
	const h = S * ( o.hoehe ?? 0.22 );
	const rows = Math.max( 4, Math.round( ( o.riefen ?? 8 ) * ( S / 128 ) ) );
	const pitch = h / rows;
	for ( let i = 0; i < rows; i++ ) {
		const t = rows === 1 ? 0.5 : i / ( rows - 1 );
		// Crown: outer streaks run shorter than the heart of the slab, and
		// every row wobbles off its lane - straight even bars read as
		// window blinds, not as dragged paint.
		const krone = 1 - 0.5 * Math.pow( Math.abs( t - 0.5 ) * 2, 2 );
		const y = cy + ( t - 0.5 ) * h + ( rnd() - 0.5 ) * pitch * 0.9;
		const rh = pitch * ( 0.4 + rnd() * 0.85 );
		// Each row is 1-3 torn segments, not one bar.
		const teile = 1 + Math.floor( rnd() * 3 );
		let x = S * ( 0.06 + rnd() * ( o.zerrissen ?? 0.14 ) );
		const xEnd =
			S * ( 0.5 + ( 0.44 - rnd() * ( o.zerrissen ?? 0.14 ) ) * krone );
		for ( let k = 0; k < teile && x < xEnd; k++ ) {
			const len =
				( ( xEnd - x ) / ( teile - k ) ) * ( 0.7 + rnd() * 0.5 );
			ctx.globalAlpha = ( o.deckung ?? 0.9 ) * ( 0.55 + 0.45 * rnd() );
			ctx.fillRect( x, y - rh / 2, Math.min( len, xEnd - x ), rh );
			x += len + pitch * rnd() * 1.2;
		}
	}
	ctx.globalAlpha = 1;
}

/**
 * NIB OVAL: the ink family's crisp ellipse - one clean body, a soft
 * single-pixel rim, two tiny nicks so it is a nib and not a vector.
 */
function genFederOval( ctx, S, o, rnd ) {
	const cx = S / 2;
	const cy = S / 2;
	const rx = S * 0.5 * ( o.breite ?? 0.85 );
	const ry = S * 0.5 * ( o.hoehe ?? 0.85 );
	ctx.globalAlpha = o.deckung ?? 1;
	ctx.beginPath();
	ctx.ellipse( cx, cy, rx, ry, 0, 0, 2 * Math.PI );
	ctx.fill();
	ctx.globalAlpha = 1;
	ctx.globalCompositeOperation = 'destination-out';
	const nicks = o.kerben ?? 2;
	for ( let i = 0; i < nicks; i++ ) {
		const a = rnd() * 2 * Math.PI;
		dab(
			ctx,
			cx + Math.cos( a ) * rx * 0.96,
			cy + Math.sin( a ) * ry * 0.96,
			S * 0.05,
			0.5,
			false
		);
	}
	ctx.globalCompositeOperation = 'source-over';
}

const GENERATOREN = {
	borsten: genBorsten,
	zerklueftet: genZerklueftet,
	spitzoval: genSpitzOval,
	kritzel: genKritzel,
	kante: genKante,
	federoval: genFederOval,
};

/* ------------------------------- die Pinsel ------------------------------ */

/**
 * Three brushes per style. Everything a tip may carry is here: `gen` and
 * `genArgs` build the mask, `followDir` turns the mark into the stroke,
 * `spacing` is TIGHT (2-5%; round geometry at 18% was most of the
 * missing feel), jitters stay small - organic masks do the talking,
 * dice only keep them from repeating in lockstep.
 */
export const MEDIA_TIPS = [
	// WATERCOLOUR - soft heads, the physics does the blooming.
	{
		id: 'wash-round',
		label: __( 'Wash Round', 'wunderpaint' ),
		render: 'stamp',
		shape: 'media',
		gen: 'spitzoval',
		genArgs: { bauch: 0.3, laenge: 0.52, spitzheit: 0.65, deckung: 0.85 },
		followDir: true,
		spacing: 0.05,
		markSize: 1.35,
		rotJitter: 0.02,
	},
	{
		id: 'wash-flat',
		label: __( 'Wash Flat', 'wunderpaint' ),
		render: 'stamp',
		shape: 'media',
		gen: 'borsten',
		genArgs: {
			breite: 0.34,
			hoehe: 1,
			dichte: 20,
			hart: 0.15,
			film: 0.55,
			punktMin: 0.05,
			punktVar: 0.06,
		},
		followDir: true,
		spacing: 0.05,
		markSize: 1.2,
	},
	{
		id: 'wash-mop',
		label: __( 'Mop', 'wunderpaint' ),
		render: 'stamp',
		shape: 'media',
		gen: 'zerklueftet',
		genArgs: { zacken: 0.2, flecken: 9, deckung: 0.8, fleckTiefe: 0.35 },
		spacing: 0.08,
		markSize: 1.3,
		rotJitter: true,
	},

	// INK - crisp, direction-true, almost textureless.
	{
		id: 'ink-nib',
		label: __( 'Fine Nib', 'wunderpaint' ),
		render: 'stamp',
		shape: 'media',
		gen: 'federoval',
		genArgs: { breite: 0.9, hoehe: 0.62, kerben: 2 },
		followDir: true,
		spacing: 0.04,
	},
	{
		id: 'ink-brushpen',
		label: __( 'Brush Pen', 'wunderpaint' ),
		render: 'stamp',
		shape: 'media',
		gen: 'spitzoval',
		genArgs: {
			bauch: 0.24,
			laenge: 0.6,
			spitzheit: 0.85,
			deckung: 1,
			hart: 1,
		},
		followDir: true,
		spacing: 0.04,
		markSize: 1.3,
	},
	{
		id: 'ink-broad',
		label: __( 'Broad Nib', 'wunderpaint' ),
		render: 'stamp',
		shape: 'media',
		gen: 'federoval',
		genArgs: { breite: 1, hoehe: 0.3, kerben: 3 },
		angle: -40,
		spacing: 0.03,
	},

	// GOUACHE - velvet body, brush marks visible but soft.
	{
		id: 'gouache-flat',
		label: __( 'Gouache Flat', 'wunderpaint' ),
		render: 'stamp',
		shape: 'media',
		gen: 'borsten',
		genArgs: {
			breite: 0.32,
			hoehe: 0.95,
			dichte: 22,
			hart: 0.4,
			film: 0.5,
		},
		followDir: true,
		spacing: 0.05,
		markSize: 1.2,
	},
	{
		id: 'gouache-round',
		label: __( 'Gouache Round', 'wunderpaint' ),
		render: 'stamp',
		shape: 'media',
		gen: 'borsten',
		genArgs: {
			breite: 0.8,
			hoehe: 0.8,
			dichte: 22,
			hart: 0.3,
			film: 0.55,
		},
		followDir: true,
		spacing: 0.06,
	},
	{
		id: 'gouache-dry',
		label: __( 'Dry Brush', 'wunderpaint' ),
		render: 'stamp',
		shape: 'media',
		gen: 'borsten',
		genArgs: {
			breite: 0.6,
			hoehe: 0.95,
			dichte: 13,
			hart: 0.85,
			film: 0.08,
			punktMin: 0.025,
			punktVar: 0.04,
		},
		variants: 4,
		followDir: true,
		spacing: 0.05,
		alphaJitter: 0.35,
		markSize: 1.25,
	},

	// ACRYLIC - harder bristle, decisive edges.
	{
		id: 'acrylic-flat',
		label: __( 'Acrylic Flat', 'wunderpaint' ),
		render: 'stamp',
		shape: 'media',
		gen: 'borsten',
		genArgs: {
			breite: 0.3,
			hoehe: 1,
			dichte: 23,
			hart: 0.85,
			film: 0.42,
		},
		followDir: true,
		spacing: 0.04,
		markSize: 1.2,
	},
	{
		id: 'acrylic-filbert',
		label: __( 'Filbert', 'wunderpaint' ),
		render: 'stamp',
		shape: 'media',
		gen: 'borsten',
		genArgs: {
			breite: 0.62,
			hoehe: 0.85,
			dichte: 26,
			hart: 0.5,
			film: 0.5,
		},
		followDir: true,
		spacing: 0.05,
	},
	{
		id: 'acrylic-knife',
		label: __( 'Paint Knife', 'wunderpaint' ),
		render: 'stamp',
		shape: 'media',
		gen: 'kante',
		genArgs: { hoehe: 0.26, riefen: 9, zerrissen: 0.16, deckung: 0.95 },
		variants: 4,
		followDir: true,
		spacing: 0.03,
		markSize: 1.3,
	},

	// OIL - the bristle grooves feed the impasto relief directly.
	{
		id: 'oil-bristle',
		label: __( 'Oil Bristle', 'wunderpaint' ),
		render: 'stamp',
		shape: 'media',
		gen: 'borsten',
		genArgs: {
			breite: 0.4,
			hoehe: 1,
			dichte: 16,
			hart: 0.85,
			film: 0.38,
			punktMin: 0.05,
			punktVar: 0.08,
		},
		followDir: true,
		spacing: 0.04,
		markSize: 1.25,
	},
	{
		id: 'oil-filbert',
		label: __( 'Oil Filbert', 'wunderpaint' ),
		render: 'stamp',
		shape: 'media',
		gen: 'borsten',
		genArgs: {
			breite: 0.68,
			hoehe: 0.82,
			dichte: 24,
			hart: 0.4,
			film: 0.55,
		},
		followDir: true,
		spacing: 0.05,
	},
	{
		id: 'oil-knife',
		label: __( 'Oil Knife', 'wunderpaint' ),
		render: 'stamp',
		shape: 'media',
		gen: 'kante',
		genArgs: { hoehe: 0.34, riefen: 7, zerrissen: 0.2, deckung: 1 },
		variants: 4,
		followDir: true,
		spacing: 0.03,
		markSize: 1.35,
	},

	// CHARCOAL - the tooth does the grain; the masks do catch and skip.
	{
		id: 'charcoal-tip',
		label: __( 'Charcoal Tip', 'wunderpaint' ),
		render: 'stamp',
		shape: 'media',
		gen: 'kritzel',
		genArgs: { striche: 12, winkel: 1.1, dicke: 0.08 },
		variants: 4,
		followDir: true,
		spacing: 0.06,
		alphaJitter: 0.35,
		scatter: 0.03,
		markSize: 1.15,
	},
	{
		id: 'charcoal-side',
		label: __( 'Charcoal Side', 'wunderpaint' ),
		render: 'stamp',
		shape: 'media',
		gen: 'kante',
		genArgs: { hoehe: 0.8, riefen: 8, zerrissen: 0.12, deckung: 0.6 },
		variants: 4,
		followDir: true,
		spacing: 0.05,
		alphaJitter: 0.3,
		markSize: 1.2,
	},
	{
		id: 'charcoal-soft',
		label: __( 'Soft Charcoal', 'wunderpaint' ),
		render: 'stamp',
		shape: 'media',
		gen: 'zerklueftet',
		genArgs: { zacken: 0.22, flecken: 10, deckung: 0.6, fleckTiefe: 0.4 },
		spacing: 0.07,
		rotJitter: true,
		alphaJitter: 0.2,
	},
];

/** The three brushes each wet style opens with - brush one is the default. */
export const STYLE_BRUSHES = {
	watercolour: [ 'wash-round', 'wash-flat', 'wash-mop' ],
	// The water brush wets with the same heads the washes use.
	water: [ 'wash-round', 'wash-flat', 'wash-mop' ],
	ink: [ 'ink-nib', 'ink-brushpen', 'ink-broad' ],
	gouache: [ 'gouache-flat', 'gouache-round', 'gouache-dry' ],
	acrylic: [ 'acrylic-flat', 'acrylic-filbert', 'acrylic-knife' ],
	oil: [ 'oil-bristle', 'oil-filbert', 'oil-knife' ],
	// The blender smears with soft heads.
	smudge: [ 'oil-filbert', 'gouache-round', 'wash-mop' ],
	charcoal: [ 'charcoal-tip', 'charcoal-side', 'charcoal-soft' ],
	// Pastel shares the dry heads, softest first.
	pastel: [ 'charcoal-soft', 'charcoal-side', 'charcoal-tip' ],
};

/* ------------------------------- die Masken ------------------------------ */

const BUCKETS = [ 48, 96, 192, 384 ];
const MAX_CACHED = 96;
const cache = new Map();

/**
 * The coloured mask for a media tip, at the smallest bucket at or above
 * `px` (masks scale DOWN well, never up - the tip-mask.js lesson).
 *
 * @param {string} id    Media tip id.
 * @param {number} px    Mark size in device pixels.
 * @param {string} color Stroke colour (any canvas fillStyle string).
 * @return {HTMLCanvasElement|null} The mask, or null off-DOM.
 */
export function mediaMask( id, px, color, variant ) {
	const def = MEDIA_TIPS.find( ( t ) => t.id === id );
	if ( ! def ) {
		return null;
	}
	let S = BUCKETS[ BUCKETS.length - 1 ];
	for ( const b of BUCKETS ) {
		if ( b >= px ) {
			S = b;
			break;
		}
	}
	const v = variant || 0;
	const key = id + '|' + S + '|' + v + '|' + color;
	const hit = cache.get( key );
	if ( hit ) {
		// Refresh recency: Map iterates in insertion order.
		cache.delete( key );
		cache.set( key, hit );
		return hit;
	}
	const c = createCanvas( S, S );
	const ctx = c && c.getContext && c.getContext( '2d' );
	if ( ! ctx ) {
		return null;
	}
	ctx.fillStyle = '#000';
	ctx.strokeStyle = '#000';
	GENERATOREN[ def.gen ]( ctx, S, def.genArgs || {}, dice( id + '#' + v ) );
	// Bake the stroke colour into the coverage (tip-mask.js reasoning).
	ctx.globalCompositeOperation = 'source-in';
	ctx.globalAlpha = 1;
	ctx.fillStyle = color;
	ctx.fillRect( 0, 0, S, S );
	ctx.globalCompositeOperation = 'source-over';
	while ( cache.size >= MAX_CACHED ) {
		cache.delete( cache.keys().next().value );
	}
	cache.set( key, c );
	return c;
}
