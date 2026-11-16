/**
 * Repeat ops (v1.431): create, adjust, bake and remove Repeat layers.
 *
 * The Repeat layer's own box, parent and z position are derived by the
 * store (repeat-sync.js); the ops here only have to put a plausible layer
 * into the list and let the sync settle it.
 */
import { __ } from '@wordpress/i18n';
import { makeRepeat, makeGroup } from '../document';
import { unitBoxOf } from '../repeat-sync';
import { expandRepeat } from '../../lib/repeat-expand';
import {
	defaultRule,
	defaultProgression,
	repeatOfSource,
	isRepeatSource,
	sourceOf,
} from '../../lib/repeat-layer';

const select = ( dispatch, id ) => dispatch( { type: 'SET_ACTIVE', id } );

/**
 * The Repeat layer for a source, created when missing, selected either way.
 *
 * @param {Object} editor Editor context.
 * @param {Object} source The layer to repeat.
 * @return {string|null} The Repeat layer id.
 */
export function ensureRepeatFor( editor, source ) {
	const { state, dispatch, commit } = editor;
	if ( ! isRepeatSource( source ) ) {
		return null;
	}
	const existing = repeatOfSource( state.layers, source.id );
	if ( existing ) {
		select( dispatch, existing.id );
		return existing.id;
	}
	const box = unitBoxOf( state.layers, source );
	const layer = makeRepeat( {
		name: __( 'Copies', 'wunderpaint' ),
		sourceId: source.id,
		rule: defaultRule( box, state.doc ),
		progression: defaultProgression(),
		x: box.x,
		y: box.y,
		w: box.w,
		h: box.h,
	} );
	let layers = [ ...state.layers ];
	// The source and its copies live in one group (Thomas, 18.09.): the
	// Layers panel shows one unit, and moving or aligning the group takes
	// the copies along. A wrapper that already exists is reused.
	const parentGroup = layers.find( ( l ) => l.id === source.parent );
	let wrapperId;
	if ( parentGroup && parentGroup.repeatGroup ) {
		wrapperId = parentGroup.id;
	} else {
		const group = makeGroup( {
			name: __( 'Repeat', 'wunderpaint' ),
			x: box.x,
			y: box.y,
			w: box.w,
			h: box.h,
		} );
		group.repeatGroup = true;
		group.parent = source.parent || null;
		group.children = [ source.id ];
		const at = layers.findIndex( ( l ) => l.id === source.id );
		layers.splice( Math.max( 0, at ), 0, group );
		layers = layers.map( ( l ) => {
			if ( l.id === source.id ) {
				return { ...l, parent: group.id };
			}
			if ( group.parent && l.id === group.parent && 'group' === l.type ) {
				return {
					...l,
					children: ( l.children || [] ).map( ( id ) =>
						id === source.id ? group.id : id
					),
				};
			}
			return l;
		} );
		wrapperId = group.id;
	}
	layer.parent = wrapperId;
	const at = layers.findIndex( ( l ) => l.id === source.id );
	layers.splice( Math.max( 0, at ), 0, layer );
	layers = layers.map( ( g ) =>
		g.id === wrapperId
			? { ...g, children: [ ...( g.children || [] ), layer.id ] }
			: g
	);
	dispatch( { type: 'SET_LAYERS', layers } );
	select( dispatch, layer.id );
	commit( __( 'Repeat', 'wunderpaint' ) );
	return layer.id;
}

/**
 * Patch a Repeat layer; commit when a label is given (drag end, click).
 *
 * @param {Object}      editor Editor context.
 * @param {string}      id     Repeat layer id.
 * @param {Object}      patch  Layer patch.
 * @param {string|null} label  History label, or null while dragging.
 */
export function updateRepeat( editor, id, patch, label = null ) {
	editor.dispatch( { type: 'UPDATE_LAYER', id, patch } );
	if ( label ) {
		editor.commit( label );
	}
}

/** Patch the rule of a Repeat layer. */
export function setRepeatRule( editor, id, rulePatch, label = null ) {
	const layer = editor.state.layers.find( ( l ) => l.id === id );
	if ( ! layer ) {
		return;
	}
	updateRepeat(
		editor,
		id,
		{ rule: { ...layer.rule, ...rulePatch } },
		label
	);
}

/** Patch one progression target of a Repeat layer. */
export function setRepeatProgression( editor, id, key, patch, label = null ) {
	const layer = editor.state.layers.find( ( l ) => l.id === id );
	if ( ! layer ) {
		return;
	}
	const progression = { ...( layer.progression || defaultProgression() ) };
	progression[ key ] = { ...( progression[ key ] || {} ), ...patch };
	updateRepeat( editor, id, { progression }, label );
}

/**
 * Bake: the copies become real layers in a group where the Repeat layer
 * stood, the Repeat layer goes.
 *
 * @param {Object} editor Editor context.
 * @param {string} id     Repeat layer id.
 * @param {Object} [opts] Passed to expandRepeat ({ tintPixels }).
 * @return {string|null} The new group's id.
 */
export function bakeRepeat( editor, id, opts = {} ) {
	const { state, dispatch, commit } = editor;
	const rep = state.layers.find(
		( l ) => l.id === id && 'repeat' === l.type
	);
	const source = sourceOf( state.layers, rep );
	if ( ! rep || ! source ) {
		return null;
	}
	const { copies, rootIds } = expandRepeat( state.layers, rep, opts );
	if ( ! copies.length ) {
		return null;
	}
	const wrapper = state.layers.find(
		( l ) => l.id === source.parent && l.repeatGroup
	);
	// Into the wrapper group when there is one; else into a new group where
	// the Repeat layer stood.
	const group =
		wrapper ||
		( () => {
			const g = makeGroup( { name: __( 'Repeat', 'wunderpaint' ) } );
			g.parent = source.parent || null;
			g.children = [];
			return g;
		} )();
	const members = copies.map( ( l ) =>
		rootIds.includes( l.id ) ? { ...l, parent: group.id } : l
	);
	const without = state.layers.filter( ( l ) => l.id !== rep.id );
	let insertAt = without.findIndex( ( l ) => l.id === source.id );
	if ( 'front' === rep.stack ) {
		const ids = new Set( [ source.id ] );
		let grew = true;
		while ( grew ) {
			grew = false;
			for ( const l of without ) {
				if ( l.parent && ids.has( l.parent ) && ! ids.has( l.id ) ) {
					ids.add( l.id );
					grew = true;
				}
			}
		}
		without.forEach( ( l, i ) => {
			if ( ids.has( l.id ) ) {
				insertAt = i + 1;
			}
		} );
	}
	if ( wrapper ) {
		without.splice( insertAt, 0, ...members );
	} else {
		without.splice( insertAt, 0, group, ...members );
	}
	const layers = without.map( ( g ) => {
		if ( 'group' !== g.type ) {
			return g;
		}
		let children = g.children || [];
		if ( children.includes( rep.id ) ) {
			children = children.filter( ( c ) => c !== rep.id );
		}
		if ( g.id === group.id ) {
			children = [
				...children,
				...rootIds.filter( ( r ) => ! children.includes( r ) ),
			];
		} else if (
			! wrapper &&
			g.id === group.parent &&
			! children.includes( group.id )
		) {
			children = [ ...children, group.id ];
		}
		return children === g.children ? g : { ...g, children };
	} );
	dispatch( { type: 'SET_LAYERS', layers } );
	select( dispatch, group.id );
	// A baked group wants moving next, not another repeat; an empty Repeat
	// panel would otherwise be all that is left on screen (Thomas, 18.09.).
	dispatch( { type: 'SET_TOOL', tool: 'move' } );
	commit( __( 'Bake repeat', 'wunderpaint' ) );
	return group.id;
}

/** Remove a Repeat layer; the source stays, an empty wrapper group dissolves. */
export function removeRepeat( editor, id ) {
	const rep = editor.state.layers.find( ( l ) => l.id === id );
	if ( ! rep ) {
		return;
	}
	editor.dispatch( { type: 'REMOVE_LAYERS', ids: [ id ] } );
	const st = editor.state;
	const wrapper = st.layers.find(
		( l ) => l.id === rep.parent && l.repeatGroup
	);
	if ( wrapper && 1 === ( wrapper.children || [] ).length ) {
		const child = wrapper.children[ 0 ];
		const grand = wrapper.parent || null;
		const layers = st.layers
			.filter( ( l ) => l.id !== wrapper.id )
			.map( ( l ) => {
				if ( l.id === child ) {
					return { ...l, parent: grand };
				}
				if ( grand && l.id === grand && 'group' === l.type ) {
					return {
						...l,
						children: ( l.children || [] ).map( ( c ) =>
							c === wrapper.id ? child : c
						),
					};
				}
				return l;
			} );
		editor.dispatch( { type: 'SET_LAYERS', layers } );
	}
	if ( rep.sourceId ) {
		select( editor.dispatch, rep.sourceId );
	}
	editor.commit( __( 'Remove repeat', 'wunderpaint' ) );
}

/**
 * What a click with the Repeat tool does to a layer: a Repeat layer is
 * selected, a plain layer gets (or shows) its Repeat layer.
 *
 * @param {Object} editor Editor context.
 * @param {Object} layer  The clicked layer.
 * @return {string|null} The Repeat layer id in play.
 */
export function repeatToolClick( editor, layer ) {
	if ( ! layer ) {
		return null;
	}
	if ( 'repeat' === layer.type ) {
		select( editor.dispatch, layer.id );
		return layer.id;
	}
	return ensureRepeatFor( editor, layer );
}
