/**
 * Scene builder: sheets with objects -> proven-cuttable rings.
 *
 * Two things come back per sheet: the finished paper rings, and the
 * SHAPE of every object on it. The shapes are what the stage hit-tests
 * against, which is why a click grabs the deer and not the whole sheet.
 *
 * Pure module: photo pixels arrive as a luminance array, glyphs as
 * raster callbacks (canvas in the browser, stubs in node tests).
 */

import { simplify, smoothRing } from './geom.js';
import { makeGrid, fillPolys, cuttable } from './mask.js';
import {
	profileLine,
	profileAt,
	sheetPolys,
	cloudCluster,
	moundStamp,
	treeCluster,
	plantCluster,
	silhouetteStamp,
	flockStamps,
	moonPunch,
	sunPunch,
	branchStamps,
	frameWindow,
} from './generators.js';
import { bandMask } from './photo.js';
import { lookById, sheetColor, isCutObject, isStanding } from './model.js';

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

const PROFILE_BASES = [ 'ridge', 'hills', 'dunes', 'waves', 'city' ];

/**
 * The stamps of one object, in pixel space.
 *
 * @param {Object} obj Clean object.
 * @param {Object} ctx Build context.
 * @param {Array}  ys  The sheet's profile, or null.
 * @return {Array} Stamps.
 */
/**
 * Turn a stamp set around a pivot. Rotation happens on the polygons,
 * before rasterizing, so the cuttability engine sees a normal shape
 * and every guarantee still holds.
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

export function objectStamps( obj, ctx, ys ) {
	const { w, h } = ctx;
	// Standing objects follow the sheet's profile, so an animal is never
	// in the air and never buried - that is what makes a placed object
	// feel placed.
	const groundY = isStanding( obj ) && ys ? profileAt( ys, obj.x ) : obj.y;
	const size = obj.scale / 100;
	if ( 'animal' === obj.kind ) {
		return silhouetteStamp(
			obj.species,
			{ x: obj.x, y: groundY + 0.004, size, flip: obj.flip },
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
				y: groundY,
				spread: obj.spread / 100,
				count: obj.count,
				size,
			},
			w,
			h,
			ys
		);
	}
	if ( 'plants' === obj.kind ) {
		return plantCluster(
			{
				species: obj.species,
				seed: obj.seed,
				x: obj.x,
				y: groundY,
				spread: obj.spread / 100,
				count: obj.count,
				size,
			},
			w,
			h,
			ys
		);
	}
	if ( 'cloud' === obj.kind ) {
		return cloudCluster( { seed: obj.seed, x: obj.x, y: obj.y, size }, w, h );
	}
	if ( 'orb' === obj.kind ) {
		return 'sun' === obj.variant
			? sunPunch( { x: obj.x, y: obj.y, size }, w, h )
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
 * An object's stamps, rotated the way the user set it. Things that
 * stand turn on their feet; free things turn around their middle.
 *
 * @param {Object} obj Clean object.
 * @param {Object} ctx Build context.
 * @param {Array}  ys  Profile, or null.
 * @return {Array} Stamps.
 */
export function placedStamps( obj, ctx, ys ) {
	const stamps = objectStamps( obj, ctx, ys );
	if ( ! obj.rot || ! stamps.length ) {
		return stamps;
	}
	const bb = bboxOf( stamps );
	if ( ! bb ) {
		return stamps;
	}
	const cx = ( bb.x0 + bb.x1 ) / 2;
	const cy = isStanding( obj ) ? bb.y1 : ( bb.y0 + bb.y1 ) / 2;
	const turned = rotateStamps( stamps, obj.rot, cx, cy );
	if ( ! isStanding( obj ) ) {
		return turned;
	}
	// A tilted tree must still touch the ground: turning a wide shape
	// on its base swings one side below the horizon, so seat it back
	// down on the line it stood on.
	const nb = bboxOf( turned );
	const lift = nb ? bb.y1 - nb.y1 : 0;
	if ( ! lift ) {
		return turned;
	}
	return turned.map( ( stamp ) =>
		stamp.map( ( ring ) => ring.map( ( [ x, y ] ) => [ x, y + lift ] ) )
	);
}

/** The profile line of a sheet, or null if it has none. */
export function sheetProfile( sheet ) {
	if ( PROFILE_BASES.includes( sheet.base ) ) {
		return profileLine( sheet.base, {
			seed: sheet.seed,
			height: sheet.height / 100,
			jag: sheet.jag / 100,
			yBase: sheet.yBase / 100,
		} );
	}
	if ( 'ground' === sheet.base ) {
		return new Float32Array( 513 ).fill( sheet.yBase / 100 );
	}
	return null;
}

/**
 * Build every sheet of the scene.
 *
 * A sheet is only recomputed when something about IT changed: the
 * optional cache is keyed by the sheet's own data plus everything
 * global that reaches it. Dragging one object then costs one sheet
 * instead of the whole stack - the proof chain (morphology, connected
 * components, tracing) is what makes a rebuild expensive, and it runs
 * per sheet.
 *
 * @param {Object} params Clean params.
 * @param {Object} ctx    `{ w, h, photo, subject, textStamps, rasterLetter, cache }`.
 * @return {Object} `{ sheets, frame, look, bridgePx }`.
 */
export function buildScene( params, ctx ) {
	const { w, h } = ctx;
	const look = lookById( params.look );
	const pxPerMm = w / ( params.cutWidth * 10 );
	const bridgePx = Math.max( 2, Math.round( params.minBridge * pxPerMm ) );
	const minAreaPx = Math.max( 24, bridgePx * bridgePx * 4 );
	const win = Math.round( 3 + ( ( 100 - params.detail ) / 100 ) * 5 );
	const finish = ( rings ) =>
		rings.map( ( ring ) =>
			simplify(
				smoothRing(
					ring,
					Math.min( win, Math.max( 1, Math.floor( ring.length / 48 ) ) )
				),
				0.35,
				true
			)
		);

	const list = params.sheets;
	const total = list.length + ( 'none' !== params.frame ? 1 : 0 );
	const out = [];
	const cache = ctx.cache || null;
	// Everything outside a sheet that still changes its paper.
	const globalKey =
		w +
		'x' +
		h +
		':' +
		bridgePx +
		':' +
		minAreaPx +
		':' +
		win +
		':' +
		( ctx.photoKey || '' );

	list.forEach( ( sheet, index ) => {
		const key = globalKey + '|' + JSON.stringify( sheet );
		const hit = cache && cache.get( sheet.id );
		if ( hit && hit.key === key ) {
			out.push( {
				...hit.value,
				index,
				color: sheet.color || sheetColor( look, index, total ),
			} );
			return;
		}
		const g = makeGrid( w, h );
		const base = sheet.base;
		const ys = sheetProfile( sheet );

		if ( PROFILE_BASES.includes( base ) || 'ground' === base ) {
			fillPolys( g, sheetPolys( ys, w, h, 'bottom' ) );
		} else if ( 'top' === base ) {
			fillPolys( g, [
				[
					[ -w * 0.1, -h * 0.2 ],
					[ w * 1.1, -h * 0.2 ],
					[ w * 1.1, ( sheet.yBase / 100 ) * h ],
					[ -w * 0.1, ( sheet.yBase / 100 ) * h ],
				],
			] );
			// The cloud bank's lobes hang off that strip.
			paintStamps(
				g,
				cloudCluster(
					{
						seed: sheet.seed,
						x: 0.5,
						y: sheet.yBase / 100,
						size: sheet.height / 100,
						wide: true,
					},
					w,
					h
				)
			);
		} else if ( 'edge' === base ) {
			// A border frame: paper only along the edges, so corner
			// branches hang from something real.
			const b = ( sheet.border / 100 ) * Math.min( w, h );
			fillPolys( g, [
				[
					[ 0, 0 ],
					[ w, 0 ],
					[ w, h ],
					[ 0, h ],
				],
			] );
			fillPolys(
				g,
				[
					[
						[ b, b ],
						[ w - b, b ],
						[ w - b, h - b ],
						[ b, h - b ],
					],
				],
				0
			);
		} else if ( 'full' === base ) {
			g.data.fill( 1 );
		} else if ( 'photo' === base ) {
			if ( ctx.photo ) {
				const t = params.photo.thresholds;
				if ( sheet.band >= t.length ) {
					g.data.fill( 1 );
				} else {
					g.data.set(
						bandMask(
							ctx.photo.luma,
							w,
							h,
							t,
							sheet.band,
							params.photo.invert
						)
					);
				}
			}
		} else if ( 'subject' === base ) {
			if ( ctx.subject ) {
				g.data.set( ctx.subject );
			}
		}

		// Paper objects first, holes second: a bird cut into the sky
		// must not be filled again by a cloud added afterwards.
		const shapes = [];
		const paperObjs = sheet.objects.filter( ( o ) => ! isCutObject( o ) );
		const cutObjs = sheet.objects.filter( isCutObject );
		for ( const obj of paperObjs ) {
			const stamps = placedStamps( obj, ctx, ys );
			if ( ! stamps.length ) {
				continue;
			}
			const bb = bboxOf( stamps );
			// Anything standing above a flat horizon gets a soft mound,
			// so nothing floats and the sheet stays one piece.
			if (
				isStanding( obj ) &&
				'ground' === base &&
				bb &&
				bb.y1 < ( sheet.yBase / 100 ) * h - 1
			) {
				paintStamps(
					g,
					moundStamp( bb, ( sheet.yBase / 100 ) * h, obj.seed )
				);
			}
			paintStamps( g, stamps );
			shapes.push( { id: obj.id, stamps, bbox: bb } );
		}
		for ( const obj of cutObjs ) {
			const stamps = placedStamps( obj, ctx, ys );
			if ( ! stamps.length ) {
				continue;
			}
			paintStamps( g, stamps, 0 );
			shapes.push( { id: obj.id, stamps, bbox: bboxOf( stamps ) } );
		}

		const empty = ! g.data.some( ( v ) => v );
		const res = empty ? null : cuttable( g, { bridgePx, minAreaPx } );
		const built = {
			sheet,
			index,
			rings: res ? finish( res.rings ) : [],
			shapes,
			bridges: res ? res.bridges : [],
			pieces: res ? res.pieces : 0,
			color: sheet.color || sheetColor( look, index, total ),
		};
		if ( cache ) {
			cache.set( sheet.id, { key, value: built } );
		}
		out.push( built );
	} );

	if ( cache ) {
		// Sheets that are gone must not hold memory forever.
		const live = new Set( list.map( ( s ) => s.id ) );
		for ( const id of [ ...cache.keys() ] ) {
			if ( ! live.has( id ) && '__frame' !== id ) {
				cache.delete( id );
			}
		}
	}

	let frame = null;
	if ( 'none' !== params.frame ) {
		const fkey =
			globalKey +
			'|frame:' +
			params.frame +
			params.frameLetter +
			params.frameInset;
		const fhit = cache && cache.get( '__frame' );
		if ( fhit && fhit.key === fkey ) {
			return {
				sheets: out,
				frame: {
					...fhit.value,
					index: total - 1,
					color: sheetColor( look, total - 1, total ),
				},
				look,
				bridgePx,
			};
		}
		const g = makeGrid( w, h );
		g.data.fill( 1 );
		if ( 'letter' === params.frame ) {
			const glyph = ctx.rasterLetter
				? ctx.rasterLetter( params.frameLetter, w, h )
				: null;
			if ( glyph ) {
				for ( let i = 0; i < g.data.length; i++ ) {
					if ( glyph[ i ] ) {
						g.data[ i ] = 0;
					}
				}
			}
		} else {
			const windows = frameWindow(
				params.frame,
				w,
				h,
				params.frameInset / 100
			);
			if ( windows ) {
				fillPolys( g, windows, 0 );
			}
		}
		const res = cuttable( g, { bridgePx, minAreaPx } );
		frame = {
			sheet: {
				id: '__frame',
				base: 'frame',
				color: '',
				dx: 0,
				dy: 0,
				objects: [],
			},
			index: total - 1,
			rings: finish( res.rings ),
			shapes: [],
			bridges: res.bridges,
			pieces: res.pieces,
			color: sheetColor( look, total - 1, total ),
		};
		if ( cache ) {
			cache.set( '__frame', { key: fkey, value: frame } );
		}
	}

	return { sheets: out, frame, look, bridgePx };
}
