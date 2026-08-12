/**
 * Scene builder: layers with objects -> paper rings.
 *
 * Two things come back per layer: the finished paper rings, and the
 * SHAPE of every object on it. The shapes are what the stage hit-tests
 * against, which is why a click grabs the deer and not the whole layer.
 *
 * Pure module: photo pixels arrive as a luminance or depth array, glyphs
 * as raster callbacks (canvas in the browser, stubs in node tests).
 *
 * What this file no longer does, since 9 August 2026: prove anything.
 * There is no minimum feature width, no component hunt, no automatic
 * bridge, no mound slipped under a standing object so the sheet holds
 * together, and no rule that a hole may only be punched into a backdrop.
 * A layer is whatever its objects paint.
 */

import { simplify, smoothRing } from './geom.js';
import { makeGrid, fillPolys, outline } from './mask.js';
import {
	profileLine,
	sheetPolys,
	cloudCluster,
	treeCluster,
	plantCluster,
	silhouetteStamp,
	flockStamps,
	moonPunch,
	sunPunch,
	branchStamps,
	frameWindow,
	starWindow,
	ringWindow,
	twinRingWindow,
} from './generators.js';
import { bandMask } from './photo.js';
import { lookById, sheetColor, isCutObject } from './model.js';

/** Paint stamps: one even-odd pass each, so overlaps union. */
function paintStamps( g, stamps, value = 1 ) {
	for ( const stamp of stamps ) {
		fillPolys( g, stamp, value );
	}
}

const bboxOf = ( stamps ) => {
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for ( const stamp of stamps ) {
		for ( const ring of stamp ) {
			for ( const [ x, y ] of ring ) {
				x0 = Math.min( x0, x );
				y0 = Math.min( y0, y );
				x1 = Math.max( x1, x );
				y1 = Math.max( y1, y );
			}
		}
	}
	return Number.isFinite( x0 ) ? { x0, y0, x1, y1 } : null;
};

/** Objects that cover the page by definition and never rotate. */
const FULL_PAGE = [ 'backdrop', 'terrain', 'border', 'frame' ];

/**
 * The window a frame object punches, as stamps.
 *
 * @param {Object} obj Clean frame object.
 * @param {Object} ctx Build context (for the letter rasterizer).
 * @param {number} w   Sheet width.
 * @param {number} h   Sheet height.
 * @return {Array} Stamps, or [] for a letter (handled as a mask).
 */
export function windowStamps( obj, ctx, w, h ) {
	const inset = obj.inset / 100;
	const cx = w / 2;
	const cy = h / 2;
	const rx = w * ( 0.5 - inset );
	const ry = h * ( 0.5 - inset );
	if ( 'star' === obj.window ) {
		return starWindow( cx, cy, rx, ry, obj.points, obj.sharp / 100 );
	}
	if ( 'ring' === obj.window ) {
		return ringWindow( cx, cy, rx, ry, obj.width / 100, obj.tilt );
	}
	if ( 'twinring' === obj.window ) {
		return twinRingWindow(
			cx,
			cy,
			Math.min( rx, ry ),
			obj.width / 100,
			obj.gap / 100
		);
	}
	if ( 'rect' === obj.window ) {
		return [
			[
				[
					[ cx - rx, cy - ry ],
					[ cx + rx, cy - ry ],
					[ cx + rx, cy + ry ],
					[ cx - rx, cy + ry ],
				],
			],
		];
	}
	const win = frameWindow( obj.window, w, h, inset );
	return win ? [ win ] : [];
}

/**
 * Turn a stamp set around a pivot. Rotation happens on the polygons,
 * before rasterizing, so the shape stays a shape.
 *
 * @param {Array}  stamps Stamps.
 * @param {number} deg    Degrees, clockwise.
 * @param {number} cx     Pivot x in px.
 * @param {number} cy     Pivot y in px.
 * @return {Array} Rotated stamps.
 */
function rotateStamps( stamps, deg, cx, cy ) {
	if ( ! deg ) {
		return stamps;
	}
	const a = ( deg * Math.PI ) / 180;
	const cos = Math.cos( a );
	const sin = Math.sin( a );
	return stamps.map( ( stamp ) =>
		stamp.map( ( ring ) =>
			ring.map( ( [ x, y ] ) => {
				const dx = x - cx;
				const dy = y - cy;
				return [ cx + dx * cos - dy * sin, cy + dx * sin + dy * cos ];
			} )
		)
	);
}

/** The horizon line of a terrain object. */
export function terrainProfile( obj ) {
	if ( 'flat' === obj.profile ) {
		return new Float32Array( 513 ).fill( obj.yBase / 100 );
	}
	return profileLine( obj.profile, {
		seed: obj.seed,
		height: obj.height / 100,
		jag: obj.jag / 100,
		yBase: obj.yBase / 100,
	} );
}

/**
 * The stamps of one object, in pixel space.
 *
 * Every object sits exactly where its x and y say. In v2 anything that
 * "stands" was snapped onto the sheet's horizon and could not be lifted
 * off it at all; that rule existed so no paper would float, and it is
 * the reason dragging a deer upwards moved the landscape instead.
 *
 * @param {Object} obj Clean object.
 * @param {Object} ctx Build context.
 * @return {Array} Stamps.
 */
export function objectStamps( obj, ctx ) {
	const { w, h } = ctx;
	const size = obj.scale / 100;
	if ( 'backdrop' === obj.kind ) {
		return [
			[
				[
					[ 0, 0 ],
					[ w, 0 ],
					[ w, h ],
					[ 0, h ],
				],
			],
		];
	}
	if ( 'terrain' === obj.kind ) {
		return [ sheetPolys( terrainProfile( obj ), w, h, 'bottom' ) ];
	}
	if ( 'frame' === obj.kind ) {
		// A full sheet, with the window taken out of it. The letter is a
		// glyph, so it arrives as a mask rather than as polygons and is
		// handled by the layer builder.
		return [
			[
				[
					[ 0, 0 ],
					[ w, 0 ],
					[ w, h ],
					[ 0, h ],
				],
			],
		];
	}
	if ( 'border' === obj.kind ) {
		// Outer rect and inner rect in ONE stamp: even-odd leaves the
		// frame standing and the middle open.
		const b = ( obj.border / 100 ) * Math.min( w, h );
		return [
			[
				[
					[ 0, 0 ],
					[ w, 0 ],
					[ w, h ],
					[ 0, h ],
				],
				[
					[ b, b ],
					[ w - b, b ],
					[ w - b, h - b ],
					[ b, h - b ],
				],
			],
		];
	}
	if ( 'animal' === obj.kind ) {
		return silhouetteStamp(
			obj.species,
			{ x: obj.x, y: obj.y, size, flip: obj.flip },
			w,
			h
		);
	}
	if ( 'trees' === obj.kind ) {
		return treeCluster(
			{
				species: obj.species,
				seed: obj.seed,
				x: obj.x,
				y: obj.y,
				spread: obj.spread / 100,
				count: obj.count,
				size,
				vary: ( obj.vary ?? 50 ) / 100,
			},
			w,
			h,
			null
		);
	}
	if ( 'plants' === obj.kind ) {
		return plantCluster(
			{
				species: obj.species,
				seed: obj.seed,
				x: obj.x,
				y: obj.y,
				spread: obj.spread / 100,
				count: obj.count,
				size,
				vary: ( obj.vary ?? 50 ) / 100,
			},
			w,
			h,
			null
		);
	}
	if ( 'cloud' === obj.kind ) {
		return cloudCluster(
			{
				seed: obj.seed,
				x: obj.x,
				y: obj.y,
				size,
				wide: !! obj.wide,
				puff: ( obj.puff ?? 50 ) / 100,
				wisp: ( obj.wisp ?? 35 ) / 100,
			},
			w,
			h
		);
	}
	if ( 'orb' === obj.kind ) {
		return 'sun' === obj.variant
			? sunPunch(
					{ x: obj.x, y: obj.y, size, rays: obj.rays ?? 12 },
					w,
					h
			  )
			: moonPunch(
					{
						x: obj.x,
						y: obj.y,
						size,
						crescent: 'crescent' === obj.variant,
					},
					w,
					h
			  );
	}
	if ( 'flyer' === obj.kind ) {
		return silhouetteStamp(
			obj.species,
			{ x: obj.x, y: obj.y + size / 2, size, flip: obj.flip },
			w,
			h
		);
	}
	if ( 'flock' === obj.kind ) {
		return flockStamps(
			{
				seed: obj.seed,
				species: obj.species,
				x: obj.x,
				y: obj.y,
				spread: obj.spread / 100,
				count: obj.count,
				size,
			},
			w,
			h
		);
	}
	if ( 'branch' === obj.kind ) {
		return branchStamps(
			{
				seed: obj.seed,
				corner: obj.corner,
				reach: obj.reach / 100,
				leaf: obj.scale / 100,
			},
			w,
			h
		);
	}
	if ( 'text' === obj.kind ) {
		return ctx.textStamps ? ctx.textStamps( obj, w, h ) : [];
	}
	return [];
}

/**
 * An object's stamps, rotated the way the user set it, around its own
 * middle. Page-covering objects ignore rotation.
 *
 * @param {Object} obj Clean object.
 * @param {Object} ctx Build context.
 * @return {Array} Stamps.
 */
export function placedStamps( obj, ctx ) {
	const stamps = objectStamps( obj, ctx );
	if ( ! obj.rot || ! stamps.length || FULL_PAGE.includes( obj.kind ) ) {
		return stamps;
	}
	const bb = bboxOf( stamps );
	if ( ! bb ) {
		return stamps;
	}
	return rotateStamps(
		stamps,
		obj.rot,
		( bb.x0 + bb.x1 ) / 2,
		( bb.y0 + bb.y1 ) / 2
	);
}

/**
 * Build every layer of the scene.
 *
 * A layer is only recomputed when something about IT changed: the
 * optional cache is keyed by the layer's own data plus everything
 * global that reaches it. Dragging one object then costs one layer
 * instead of the whole stack.
 *
 * @param {Object} params Clean params.
 * @param {Object} ctx    `{ w, h, photo, depth, subject, textStamps, rasterLetter, cache }`.
 * @return {Object} `{ layers, frame, look }`.
 */
export function buildScene( params, ctx ) {
	const { w, h } = ctx;
	const look = lookById( params.look );
	// The only tidying left is cosmetic, and the detail dial drives it:
	// a low setting smooths harder and denoises a pixel more.
	const win = Math.round( 3 + ( ( 100 - params.detail ) / 100 ) * 5 );
	const denoise = params.detail < 34 ? 2 : 1;
	const finish = ( rings ) =>
		rings.map( ( ring ) =>
			simplify(
				smoothRing(
					ring,
					Math.min(
						win,
						Math.max( 1, Math.floor( ring.length / 48 ) )
					)
				),
				0.35,
				true
			)
		);

	const list = params.layers;
	const total = list.length;
	const out = [];
	const cache = ctx.cache || null;
	// Everything outside a layer that still changes its paper.
	const globalKey =
		w +
		'x' +
		h +
		':' +
		params.detail +
		':' +
		params.look +
		':' +
		total +
		':' +
		( ctx.photoKey || '' );

	/**
	 * Whose claim on a layer's colour is strongest: the user's own pick,
	 * then the photo's own colour for that depth band, then the look's
	 * tonal ramp.
	 *
	 * @param {Object} layer The layer.
	 * @param {number} index Its place in the stack.
	 * @return {string} A hex colour.
	 */
	const colorFor = ( layer, index ) => {
		if ( layer.color ) {
			return layer.color;
		}
		if ( 'photo' === layer.source && ctx.bandColors ) {
			const c =
				ctx.bandColors[
					Math.min( layer.band, ctx.bandColors.length - 1 )
				];
			if ( c ) {
				return c;
			}
		}
		return sheetColor( look, index, total );
	};

	/**
	 * Does this layer bring paper of its own?
	 *
	 * Structural, not rasterized, because the answer is needed BEFORE
	 * anything is built: it decides where a hole goes, and therefore what
	 * belongs in a layer's cache key.
	 *
	 * @param {Object} l A layer.
	 * @return {boolean} True if anything on it adds paper.
	 */
	const hasOwnPaper = ( l ) =>
		'elements' !== l.source ||
		l.objects.some( ( o ) => ! isCutObject( o ) );

	// A hole needs paper around it. A layer carrying ONLY cut objects -
	// the normal case, since a new object arrives on a layer of its own -
	// hands its holes to the layer BEHIND, which is what "punch it out of
	// the paper" means to anyone looking at the picture. Cutting into
	// nothing is what made a freshly added sun invisible.
	const incoming = list.map( () => [] );
	list.forEach( ( l, i ) => {
		if ( hasOwnPaper( l ) || 0 === i ) {
			return;
		}
		for ( const o of l.objects ) {
			if ( isCutObject( o ) ) {
				incoming[ i - 1 ].push( o );
			}
		}
	} );

	list.forEach( ( layer, index ) => {
		const key =
			globalKey +
			'|' +
			JSON.stringify( layer ) +
			'|cuts:' +
			JSON.stringify( incoming[ index ] );
		const hit = cache && cache.get( layer.id );
		if ( hit && hit.key === key ) {
			out.push( {
				...hit.value,
				index,
				color: colorFor( layer, index ),
			} );
			return;
		}
		const g = makeGrid( w, h );

		if ( 'photo' === layer.source && ctx.bands ) {
			const band =
				ctx.bands[ Math.min( layer.band, ctx.bands.length - 1 ) ];
			if ( band ) {
				g.data.set( band );
			}
		} else if ( 'photo' === layer.source && ctx.photo ) {
			const t = params.photo.thresholds;
			if ( layer.band >= t.length ) {
				g.data.fill( 1 );
			} else {
				g.data.set(
					bandMask(
						ctx.photo.luma,
						w,
						h,
						t,
						layer.band,
						params.photo.invert
					)
				);
			}
		} else if ( 'subject' === layer.source && ctx.subject ) {
			g.data.set( ctx.subject );
		}

		// Paper first, holes second: a bird punched into the sky must
		// not be filled again by a cloud added afterwards.
		const shapes = [];
		const paint = ( obj, value ) => {
			const stamps = placedStamps( obj, ctx );
			if ( ! stamps.length ) {
				return;
			}
			paintStamps( g, stamps, value );
			shapes.push( {
				id: obj.id,
				kind: obj.kind,
				stamps,
				bbox: bboxOf( stamps ),
			} );
		};
		const own = hasOwnPaper( layer );
		// A passepartout goes down FIRST and its window is taken out
		// straight away, so anything else on the same sheet - a bird
		// reaching into the opening, a word - stays whole instead of
		// being cut away by the window it is supposed to sit in.
		for ( const obj of layer.objects ) {
			if ( 'frame' === obj.kind ) {
				paint( obj, 1 );
			}
		}
		for ( const obj of layer.objects ) {
			if ( 'frame' !== obj.kind ) {
				continue;
			}
			if ( 'letter' === obj.window ) {
				const glyph = ctx.rasterLetter
					? ctx.rasterLetter( obj.letter, w, h )
					: null;
				if ( glyph ) {
					for ( let i = 0; i < g.data.length; i++ ) {
						if ( glyph[ i ] ) {
							g.data[ i ] = 0;
						}
					}
				}
				continue;
			}
			paintStamps( g, windowStamps( obj, ctx, w, h ), 0 );
		}
		for ( const obj of layer.objects ) {
			// With nothing behind it and no paper of its own, a hole has
			// nowhere to go - so the backmost layer draws its cut objects
			// as paper rather than swallowing them.
			if (
				'frame' !== obj.kind &&
				( ! isCutObject( obj ) || ( ! own && 0 === index ) )
			) {
				paint( obj, 1 );
			}
		}
		for ( const obj of layer.objects ) {
			if ( ! isCutObject( obj ) || ( ! own && 0 === index ) ) {
				continue;
			}
			if ( own ) {
				paint( obj, 0 );
				continue;
			}
			// The hole belongs to the layer behind; here it only needs to
			// stay pickable, so the shape is reported without painting.
			const stamps = placedStamps( obj, ctx );
			if ( stamps.length ) {
				shapes.push( {
					id: obj.id,
					kind: obj.kind,
					stamps,
					bbox: bboxOf( stamps ),
				} );
			}
		}
		// Holes handed down from the layer in front.
		for ( const obj of incoming[ index ] ) {
			paintStamps( g, placedStamps( obj, ctx ), 0 );
		}

		const empty = ! g.data.some( ( v ) => v );
		const res = empty ? null : outline( g, { denoise } );
		const built = {
			layer,
			index,
			rings: res ? finish( res.rings ) : [],
			shapes,
			color: colorFor( layer, index ),
		};
		if ( cache ) {
			cache.set( layer.id, { key, value: built } );
		}
		out.push( built );
	} );

	if ( cache ) {
		// Layers that are gone must not hold memory forever.
		const live = new Set( list.map( ( s ) => s.id ) );
		for ( const id of [ ...cache.keys() ] ) {
			if ( ! live.has( id ) && '__frame' !== id ) {
				cache.delete( id );
			}
		}
	}

	return { layers: out, frame: null, look };
}
