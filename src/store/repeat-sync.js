/**
 * Repeat layers keep no geometry of their own (v1.431): their box is the
 * union of the copies, their parent is the source's parent, and they sit
 * right behind (or in front of) the source in z order. All of that follows
 * the source and the rule, so it is DERIVED here after every reducer step
 * instead of being patched by hand at every place a layer can change -
 * moves, group drops, undo, document loads.
 *
 * `syncRepeatLayers` returns the very same array when nothing changes, so
 * React and the history see no phantom edits. A Repeat layer whose source
 * is gone (or is itself a Repeat layer) is dropped.
 *
 * Deliberately no import from the store or the units helpers: this module
 * wraps the reducer, and a cycle through selection-units would evaluate
 * half-initialised.
 */
import {
	footprintOf,
	repeatPlacements,
	repeatBounds,
} from '../lib/repeat-layout';

/** Ids of a layer and every descendant, in flat order. */
function descendantIds( layers, rootId ) {
	const ids = new Set( [ rootId ] );
	let grew = true;
	while ( grew ) {
		grew = false;
		for ( const l of layers ) {
			if ( l.parent && ids.has( l.parent ) && ! ids.has( l.id ) ) {
				ids.add( l.id );
				grew = true;
			}
		}
	}
	return ids;
}

/** Footprint of a layer or of every leaf under a group. */
export function unitBoxOf( layers, root ) {
	const ids = descendantIds( layers, root.id );
	const leaves = layers.filter(
		( l ) => ids.has( l.id ) && 'group' !== l.type
	);
	const parts = ( leaves.length ? leaves : [ root ] ).map( ( l ) =>
		footprintOf(
			{ x: l.x || 0, y: l.y || 0, w: l.w || 0, h: l.h || 0 },
			l.rot
		)
	);
	const x = Math.min( ...parts.map( ( p ) => p.x ) );
	const y = Math.min( ...parts.map( ( p ) => p.y ) );
	return {
		x,
		y,
		w: Math.max( ...parts.map( ( p ) => p.x + p.w ) ) - x,
		h: Math.max( ...parts.map( ( p ) => p.y + p.h ) ) - y,
	};
}

/** Where a Repeat layer belongs in the flat list: behind the source, or after its last descendant. */
function desiredIndex( layers, repeat, source ) {
	if ( 'front' === repeat.stack ) {
		const ids = descendantIds( layers, source.id );
		let last = -1;
		layers.forEach( ( l, i ) => {
			if ( ids.has( l.id ) ) {
				last = i;
			}
		} );
		return last + 1;
	}
	return layers.findIndex( ( l ) => l.id === source.id );
}

const same = ( a, b ) => Math.abs( a - b ) < 1e-6;

/**
 * Derive box, parent and z position of every Repeat layer.
 *
 * @param {Array} layers Flat layer list.
 * @return {Array} The same array when nothing changed, else a new one.
 */
export function syncRepeatLayers( layers ) {
	if ( ! layers || ! layers.some( ( l ) => 'repeat' === l.type ) ) {
		return layers;
	}
	let out = layers;
	const byId = new Map( layers.map( ( l ) => [ l.id, l ] ) );
	const drop = new Set();
	for ( const l of layers ) {
		if ( 'repeat' !== l.type ) {
			continue;
		}
		const src = byId.get( l.sourceId );
		if ( ! src || 'repeat' === src.type ) {
			drop.add( l.id );
		}
	}
	if ( drop.size ) {
		out = layers
			.filter( ( l ) => ! drop.has( l.id ) )
			.map( ( l ) =>
				'group' === l.type &&
				( l.children || [] ).some( ( id ) => drop.has( id ) )
					? {
							...l,
							children: l.children.filter(
								( id ) => ! drop.has( id )
							),
					  }
					: l
			);
	}
	// Box and parent.
	for ( let i = 0; i < out.length; i++ ) {
		const l = out[ i ];
		if ( 'repeat' !== l.type ) {
			continue;
		}
		const src = out.find( ( c ) => c.id === l.sourceId );
		const box = unitBoxOf( out, src );
		// The path frame travels with its source: the anchor is the source
		// centre the frame was placed for, any difference is a move.
		let rule = l.rule;
		const path = rule?.path;
		if ( path?.frame ) {
			const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
			const anchor = path.anchor;
			if ( ! anchor ) {
				rule = { ...rule, path: { ...path, anchor: centre } };
			} else if (
				! same( anchor.x, centre.x ) ||
				! same( anchor.y, centre.y )
			) {
				rule = {
					...rule,
					path: {
						...path,
						anchor: centre,
						frame: {
							...path.frame,
							x: path.frame.x + ( centre.x - anchor.x ),
							y: path.frame.y + ( centre.y - anchor.y ),
						},
					},
				};
			}
		}
		const b = repeatBounds(
			box,
			repeatPlacements( box, rule, l.progression )
		) || {
			x: box.x + box.w / 2,
			y: box.y + box.h / 2,
			w: 0,
			h: 0,
		};
		const parent = src.parent || null;
		if (
			rule !== l.rule ||
			! same( l.x, b.x ) ||
			! same( l.y, b.y ) ||
			! same( l.w, b.w ) ||
			! same( l.h, b.h ) ||
			( l.parent || null ) !== parent
		) {
			if ( out === layers ) {
				out = [ ...layers ];
			}
			out[ i ] = { ...l, rule, x: b.x, y: b.y, w: b.w, h: b.h, parent };
			if ( ( l.parent || null ) !== parent ) {
				out = out.map( ( g ) => {
					if ( 'group' !== g.type ) {
						return g;
					}
					const has = ( g.children || [] ).includes( l.id );
					if ( g.id === parent && ! has ) {
						return {
							...g,
							children: [ ...( g.children || [] ), l.id ],
						};
					}
					if ( g.id !== parent && has ) {
						return {
							...g,
							children: g.children.filter(
								( id ) => id !== l.id
							),
						};
					}
					return g;
				} );
			}
		}
	}
	// Z order: keep each Repeat layer glued to its source.
	for ( const l of out.filter( ( c ) => 'repeat' === c.type ) ) {
		const from = out.findIndex( ( c ) => c.id === l.id );
		const src = out.find( ( c ) => c.id === l.sourceId );
		const without = out.filter( ( c ) => c.id !== l.id );
		const to = desiredIndex( without, l, src );
		if ( from !== to ) {
			without.splice( to, 0, l );
			out = without;
		}
	}
	return out;
}

/**
 * Wrap a reducer so every state it returns has its Repeat layers derived.
 *
 * @param {Function} reducer The editor reducer.
 * @return {Function} A reducer with the same signature.
 */
export function withRepeatSync( reducer ) {
	return ( state, action ) => {
		const next = reducer( state, action );
		if ( ! next || ! next.layers || next.layers === state?.layers ) {
			return next;
		}
		const layers = syncRepeatLayers( next.layers );
		return layers === next.layers ? next : { ...next, layers };
	};
}
