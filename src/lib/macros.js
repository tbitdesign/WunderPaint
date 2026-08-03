/**
 * Macros / Actions (v0.4): declarative, replayable op sequences.
 *
 * A macro is `{ id, name, kind: 'macro'|'look', steps: [{op, params}] }`.
 * Steps replay against any editor context, the live one or a headless
 * editor built on the real reducer (used by batch processing). Looks are
 * macros derived from a layer's current filter + adjustments.
 */

import { __ } from '@wordpress/i18n';

import { reducer, initialState, activeLayerOf } from '../store/editor-context';
import { applyEffectToLayer } from '../store/effect-ops';
import * as DocOps from '../store/doc-ops';
import { BUNDLED_ACTIONS } from './bundled-actions';

/* ------------------------------ op registry ----------------------------- */

/**
 * Replayable ops. `run( editor, params )` may be async. Params are
 * JSON-safe so macros survive export/import.
 */
export const MACRO_OPS = {
	applyEffect: {
		label: ( p ) => `${ __( 'Effect', 'wunderpaint' ) }: ${ p.id }`,
		// Replays stay non-interactive: groups flatten without asking.
		run: ( editor, p ) =>
			applyEffectToLayer( editor, p.id, p.params, {
				groupMode: 'flatten',
			} ),
	},
	applyFilter: {
		label: ( p ) => `${ __( 'Filter', 'wunderpaint' ) }: ${ p.id }`,
		run: ( editor, p ) => {
			const layer = activeLayerOf( editor.state );
			if ( layer ) {
				editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: { filter: p.id },
				} );
				editor.commit( __( 'Filter', 'wunderpaint' ) );
			}
		},
	},
	setAdjustments: {
		label: () => __( 'Adjustments', 'wunderpaint' ),
		run: ( editor, p ) => {
			const layer = activeLayerOf( editor.state );
			if ( layer ) {
				editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: { adjust: { ...p.adjust } },
				} );
				editor.commit( __( 'Adjustments', 'wunderpaint' ) );
			}
		},
	},
	resizeImage: {
		label: ( p ) =>
			`${ __( 'Resize', 'wunderpaint' ) } ${
				p.maxW ? `≤${ p.maxW }px` : `${ p.w }×${ p.h }`
			}`,
		run: ( editor, p ) => {
			const { doc } = editor.state;
			let w = p.w;
			let h = p.h;
			if ( p.maxW ) {
				// Scale-to-fit longest side, resolution-independent recipes.
				const scale = Math.min( 1, p.maxW / Math.max( doc.w, doc.h ) );
				w = Math.max( 1, Math.round( doc.w * scale ) );
				h = Math.max( 1, Math.round( doc.h * scale ) );
			}
			if ( w && h && ( w !== doc.w || h !== doc.h ) ) {
				return DocOps.scaleDoc( editor, w, h );
			}
		},
	},
	rotate90: {
		label: ( p ) =>
			`${ __( 'Rotate 90°', 'wunderpaint' ) } ${ p.cw ? 'CW' : 'CCW' }`,
		run: ( editor, p ) => DocOps.rotateDoc( editor, !! p.cw ),
	},
	flip: {
		label: ( p ) =>
			p.horizontal
				? __( 'Flip Horizontal', 'wunderpaint' )
				: __( 'Flip Vertical', 'wunderpaint' ),
		run: ( editor, p ) => DocOps.flipDoc( editor, !! p.horizontal ),
	},
	flatten: {
		label: () => __( 'Flatten', 'wunderpaint' ),
		run: ( editor ) => DocOps.flattenDoc( editor ),
	},
	resizePercent: {
		label: ( p ) => `${ __( 'Resize', 'wunderpaint' ) } ${ p.percent }%`,
		run: ( editor, p ) => {
			const { doc } = editor.state;
			const f = Math.max( 1, Number( p.percent ) || 100 ) / 100;
			const w = Math.max( 1, Math.round( doc.w * f ) );
			const h = Math.max( 1, Math.round( doc.h * f ) );
			if ( w !== doc.w || h !== doc.h ) {
				return DocOps.scaleDoc( editor, w, h );
			}
		},
	},
	// Centered cover-crop to an aspect ratio, optionally followed by an
	// exact resize - the social-format building block (v1.246).
	cropAspect: {
		label: ( p ) =>
			`${ __( 'Crop', 'wunderpaint' ) } ${ p.ratio }${
				p.w ? ` → ${ p.w }×${ p.h }` : ''
			}`,
		run: async ( editor, p ) => {
			const parts = String( p.ratio || '1:1' ).split( ':' );
			const rw = Number( parts[ 0 ] );
			const rh = Number( parts[ 1 ] );
			if ( ! ( rw > 0 && rh > 0 ) ) {
				return;
			}
			const { doc } = editor.state;
			const target = rw / rh;
			if ( Math.abs( doc.w / doc.h - target ) > 0.001 ) {
				let w = doc.w;
				let h = doc.h;
				if ( doc.w / doc.h > target ) {
					w = Math.max( 1, Math.round( doc.h * target ) );
				} else {
					h = Math.max( 1, Math.round( doc.w / target ) );
				}
				await DocOps.cropDoc( editor, {
					x: Math.round( ( doc.w - w ) / 2 ),
					y: Math.round( ( doc.h - h ) / 2 ),
					w,
					h,
				} );
			}
			if ( p.w > 0 && p.h > 0 ) {
				const d = editor.state.doc;
				if ( d.w !== p.w || d.h !== p.h ) {
					await DocOps.scaleDoc( editor, p.w, p.h );
				}
			}
		},
	},
	// Local AI steps (v1.246). Lazily imported: ai-actions is not
	// Jest-importable (transitive import.meta), macros.js must stay a leaf.
	removeBackground: {
		label: () => __( 'Remove Background', 'wunderpaint' ),
		run: async ( editor ) => {
			const { aiRemoveBg } = await import( './ai-actions' );
			return aiRemoveBg( editor );
		},
	},
	upscale2x: {
		label: () => __( '2× Upscale', 'wunderpaint' ),
		run: async ( editor ) => {
			const { aiUpscale } = await import( './ai-actions' );
			return aiUpscale( editor, 2 );
		},
	},
	blurFaces: {
		label: () => __( 'Blur Faces', 'wunderpaint' ),
		run: async ( editor ) => {
			const { aiBlurFaces } = await import( './ai-actions' );
			return aiBlurFaces( editor );
		},
	},
};

export const stepLabel = ( step ) =>
	MACRO_OPS[ step.op ]
		? MACRO_OPS[ step.op ].label( step.params || {} )
		: step.op;

/**
 * Replay steps sequentially against an editor context.
 *
 * @param {Object} editor Editor (live or headless).
 * @param {Array}  steps  [{op, params}].
 * @return {Promise<number>} Steps executed (unknown ops are skipped).
 */
export async function runMacro( editor, steps ) {
	// The context value is a render snapshot; multi-step actions MUST
	// read fresh state between steps (scale then sharpen, crop then
	// resize). The provider's live facade does exactly that (v1.246.3);
	// headless editors are live by construction.
	const target = editor?.live || editor;
	let ran = 0;
	for ( const step of steps || [] ) {
		const op = MACRO_OPS[ step.op ];
		if ( ! op ) {
			// eslint-disable-next-line no-console
			console.warn( 'WPIE macro: unknown op skipped:', step.op );
			continue;
		}
		await op.run( target, step.params || {} );
		ran++;
	}
	return ran;
}

/* ---------------------------- headless editor --------------------------- */

/**
 * A minimal editor context on the real reducer, lets macros run against
 * documents that are not open in the UI (batch processing).
 *
 * @param {Object} doc    Document.
 * @param {Array}  layers Layers.
 * @param {Object} WPIE   Bootstrap payload (defaults to window.WPIE).
 * @return {Object} Editor-compatible context.
 */
export function createHeadlessEditor( doc, layers, WPIE ) {
	const bootstrap =
		WPIE || ( 'undefined' !== typeof window ? window.WPIE : null ) || {};
	let state = initialState( { doc, layers, WPIE: bootstrap } );
	return {
		WPIE: bootstrap,
		get state() {
			return state;
		},
		dispatch( action ) {
			state = reducer( state, action );
		},
		commit() {},
		undo() {},
		redo() {},
		canUndo: false,
		canRedo: false,
	};
}

/* ------------------------------- storage -------------------------------- */

const STORE_KEY = 'wpie-macros';

let storage = null;
try {
	storage = window.localStorage;
} catch ( e ) {
	storage = null;
}

/** Test hook. */
export const __setMacroStorage = ( s ) => {
	storage = s;
};

const readAll = () => {
	try {
		const raw = storage?.getItem( STORE_KEY );
		const list = raw ? JSON.parse( raw ) : [];
		return Array.isArray( list ) ? list : [];
	} catch ( e ) {
		return [];
	}
};

const writeAll = ( list ) => {
	try {
		storage?.setItem( STORE_KEY, JSON.stringify( list ) );
	} catch ( e ) {
		// Quota, non-fatal.
	}
};

export const listMacros = () => readAll();

/**
 * Bundled starter actions + the user's own, for pickers and the Actions
 * dialog. Bundled entries are read-only ({ builtIn: true }); user macros
 * carry no category and group under "My Actions".
 *
 * @return {Array} All actions, bundled first.
 */
export const listActions = () => [ ...BUNDLED_ACTIONS, ...readAll() ];

/**
 * Save a macro (same id overwrites, otherwise appended).
 *
 * @param {Object} macro { name, steps, kind?, id? }.
 * @return {Object} Stored macro with id.
 */
export function saveMacro( macro ) {
	const list = readAll();
	const stored = {
		id:
			macro.id ||
			'm' +
				( list.reduce(
					( max, m ) =>
						Math.max(
							max,
							parseInt( String( m.id ).slice( 1 ), 10 ) || 0
						),
					0
				) +
					1 ),
		name: macro.name || __( 'Untitled action', 'wunderpaint' ),
		kind: macro.kind || 'macro',
		category: macro.category || '',
		steps: macro.steps || [],
	};
	const idx = list.findIndex( ( m ) => m.id === stored.id );
	if ( idx >= 0 ) {
		list[ idx ] = stored;
	} else {
		list.push( stored );
	}
	writeAll( list );
	return stored;
}

export function deleteMacro( id ) {
	writeAll( readAll().filter( ( m ) => m.id !== id ) );
}

/**
 * Steps reproducing a layer's current look (filter + adjustments).
 *
 * @param {Object} layer Source layer.
 * @return {Array} Steps.
 */
export function lookFromLayer( layer ) {
	const steps = [];
	if ( layer?.filter && 'none' !== layer.filter ) {
		steps.push( { op: 'applyFilter', params: { id: layer.filter } } );
	}
	if ( layer?.adjust ) {
		steps.push( {
			op: 'setAdjustments',
			params: { adjust: { ...layer.adjust } },
		} );
	}
	return steps;
}

/* ----------------------------- export/import ---------------------------- */

/** @return {string} JSON of all (or the given) macros for sharing. */
export function exportMacros( macros = null ) {
	return JSON.stringify(
		{ wpieMacros: 1, macros: macros || readAll() },
		null,
		'\t'
	);
}

/**
 * Import macros from an exported JSON string (appended).
 *
 * @param {string} json Exported JSON.
 * @return {number} Number of imported macros.
 * @throws {Error} On malformed input.
 */
export function importMacros( json ) {
	const parsed = JSON.parse( json );
	const incoming = parsed?.macros;
	if ( ! parsed?.wpieMacros || ! Array.isArray( incoming ) ) {
		throw new Error( __( 'Not a WPIE actions file.', 'wunderpaint' ) );
	}
	let count = 0;
	for ( const macro of incoming ) {
		if (
			macro &&
			'string' === typeof macro.name &&
			Array.isArray( macro.steps )
		) {
			saveMacro( {
				name: macro.name,
				kind: macro.kind || 'macro',
				category: macro.category || '',
				steps: macro.steps,
			} );
			count++;
		}
	}
	return count;
}
