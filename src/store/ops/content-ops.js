/**
 * Filters, brand kits, templates and the user library: ops that put stored
 * or generated content into the document, or take it back out.
 *
 * Split out of src/store/ops.js in v1.338.0, which had grown to 2944 lines.
 * ops.js stays as the barrel over these modules - the same shape src/lib/raster.js
 * uses - so every existing `from './ops'` import is unchanged.
 */

import { __, sprintf } from '@wordpress/i18n';
import { doAction } from '@wordpress/hooks';
import { makeGroup, serializeLayers, hydrateLayers } from '../document';
import { activeLayerOf, expandGroupIds } from '../editor-context';
import * as DocOps from '../doc-ops';
import { renderToDataURL, sharedImageCache } from '../../lib/raster';
import { invalidateTemplate } from '../../lib/template-cache';
import { recordStep } from '../../lib/macro-recorder';
import { promptDialog, confirmDialog } from '../../lib/dialogs';
import { unitRoots } from '../../lib/selection-units';
import {
	saveUserItem,
	ensureCategories,
	getCategories,
	mutateCategory,
} from '../../lib/user-content';
import { templates } from '../../lib/api';

/* -------------------------------- Filters ------------------------------ */

export function applyPresetFilterOp( editor, filterId ) {
	const { state, dispatch, commit } = editor;
	const layer = activeLayerOf( state );
	if ( ! layer ) {
		return;
	}
	recordStep( 'applyFilter', { id: filterId } );
	dispatch( {
		type: 'UPDATE_LAYER',
		id: layer.id,
		patch: { filter: filterId },
	} );
	commit(
		sprintf(
			/* translators: %s: filter name */ __(
				'Filter: %s',
				'wunderpaint'
			),
			filterId
		)
	);
}

/**
 * Assign a brand kit to the DOCUMENT (v1.251.0): one shared op behind
 * every kit switcher (properties panel, variable picker, post-preview
 * dialog). The kit is a run/preview input like the post - this sets the
 * document's default. A running post preview re-resolves immediately
 * (the ctx was built once at post-pick time; a fresh ctx object also
 * invalidates the per-ctx resolve memos).
 *
 * @param {Object} editor {state, dispatch, commit}.
 * @param {string} kitId  Brand kit id.
 */
export function assignBrandKitOp( editor, kitId ) {
	const { state, dispatch, commit } = editor;
	dispatch( { type: 'SET_DOC', doc: { brandKitId: kitId } } );
	if ( state.previewPost?.ctx ) {
		const kits = window.WPIE?.brandKits || [];
		dispatch( {
			type: 'SET_PREVIEW_POST',
			post: {
				...state.previewPost,
				ctx: {
					...state.previewPost.ctx,
					brand: kits.find( ( k ) => k.id === kitId ) || {},
				},
			},
		} );
	}
	commit( __( 'Assign Brand Kit', 'wunderpaint' ) );
}

/* ------------------------------ templates ------------------------------- */

/**
 * File → Save as Template (v0.2, update-in-place v1.69.3): stores the
 * layered project + preview. A document opened FROM a saved template
 * (doc.source.templateId) offers to update that template instead of
 * always creating a new one.
 */
/** The template store payload for the current document. */
async function templatePayload( state, brandKitId ) {
	return {
		projectJson: JSON.stringify( {
			doc: { ...state.doc, brandKitId },
			layers: serializeLayers( state.layers ),
		} ),
		preview: await renderToDataURL( state.doc, state.layers, {
			scale: Math.min( 320 / state.doc.w, 320 / state.doc.h, 1 ),
			format: 'jpeg',
			quality: 70,
			cache: sharedImageCache,
		} ),
	};
}

/**
 * Direct template update (v1.160.0): Cmd+S and the primary button of a
 * document opened FROM a dynamic template write it back without the
 * save-as dialog dance. Docs without template identity fall through to
 * the regular Save-as-Template flow.
 *
 * @param {Object} editor Editor context.
 * @param {Object} extras Editor extras (toasts).
 */
export async function updateTemplateOp( editor, extras ) {
	const { state, dispatch } = editor;
	const src = state.doc.source || {};
	if ( ! src.templateId ) {
		return saveAsTemplateOp( editor, extras );
	}
	try {
		await templates.update(
			src.templateId,
			await templatePayload( state, state.doc.brandKitId || '' )
		);
		invalidateTemplate( src.templateId );
		dispatch( { type: 'MARK_SAVED' } );
		extras?.toasts?.success?.(
			sprintf(
				/* translators: %s: template name. */
				__( 'Template “%s” updated.', 'wunderpaint' ),
				src.templateName || state.doc.name || ''
			)
		);
		fireTemplateSaved( editor, extras, src.templateId, src.templateName );
	} catch ( err ) {
		extras?.toasts?.error?.( err.message );
	}
}

/**
 * Announce a successful dynamic-template save so listeners can refresh
 * derived embeds - Pro re-bakes a live badge with the same uid, keeping
 * front-end badges in sync with template updates.
 *
 * @param {Object} editor     Editor context.
 * @param {Object} extras     Editor extras (toasts).
 * @param {string} templateId Saved template id.
 * @param {string} name       Template name (badge uids derive from it).
 */
function fireTemplateSaved( editor, extras, templateId, name ) {
	doAction( 'wpie.templateSaved', {
		editor,
		extras,
		templateId: templateId || '',
		name: name || editor.state.doc.name || '',
	} );
}

export async function saveAsTemplateOp( editor, extras ) {
	const { state, dispatch } = editor;
	// Kit assignment (v1.97.0): the Asset Library groups dynamic templates
	// per brand kit; the save flow asks which kit this one belongs to.
	let brandKitId = state.doc.brandKitId || '';
	const payload = () => templatePayload( state, brandKitId );
	const src = state.doc.source || {};
	if ( src.templateId ) {
		const update = await confirmDialog( {
			title: __( 'Save as Dynamic Template', 'wunderpaint' ),
			message: sprintf(
				/* translators: %s: template name. */
				__(
					'This design came from the template “%s”. Update that template, or save a new one?',
					'wunderpaint'
				),
				src.templateName || __( 'Untitled', 'wunderpaint' )
			),
			confirmLabel: __( 'Update template', 'wunderpaint' ),
			cancelLabel: __( 'Save as new', 'wunderpaint' ),
		} );
		if ( update ) {
			try {
				await templates.update( src.templateId, await payload() );
				invalidateTemplate( src.templateId );
				extras?.toasts?.success?.(
					sprintf(
						/* translators: %s: template name. */
						__( 'Template “%s” updated.', 'wunderpaint' ),
						src.templateName || ''
					)
				);
				fireTemplateSaved(
					editor,
					extras,
					src.templateId,
					src.templateName
				);
			} catch ( err ) {
				extras?.toasts?.error?.( err.message );
			}
			return;
		}
	}
	const name = await promptDialog( {
		title: __( 'Save as Dynamic Template', 'wunderpaint' ),
		label: __( 'Template name', 'wunderpaint' ),
		defaultValue: state.doc.name || __( 'My Template', 'wunderpaint' ),
	} );
	if ( ! name ) {
		return;
	}
	const kits = window.WPIE?.brandKits || [];
	if ( kits.length ) {
		const noKit = __( 'No Brand Kit', 'wunderpaint' );
		const current = kits.find( ( k ) => k.id === brandKitId );
		const choice = await promptDialog( {
			title: __( 'Save as Dynamic Template', 'wunderpaint' ),
			label: __( 'Brand Kit', 'wunderpaint' ),
			options: [ noKit, ...kits.map( ( k ) => k.name ) ],
			defaultValue: current ? current.name : noKit,
		} );
		if ( null === choice ) {
			return;
		}
		brandKitId = kits.find( ( k ) => k.name === choice )?.id || '';
	}
	try {
		const record = await templates.create( {
			name,
			...( await payload() ),
		} );
		// Remember where this document now lives (and take the template's
		// name, v1.160.0), so the title shows it and Cmd+S updates it.
		if ( record?.id ) {
			dispatch( {
				type: 'SET_DOC',
				doc: {
					brandKitId,
					name: record.name || name,
					source: {
						...state.doc.source,
						templateId: record.id,
						templateName: record.name || name,
					},
				},
			} );
		}
		extras?.toasts?.success?.(
			__(
				'Dynamic template saved, find it under Assets → Asset Library.',
				'wunderpaint'
			)
		);
		fireTemplateSaved( editor, extras, record?.id, record?.name || name );
	} catch ( err ) {
		extras?.toasts?.error?.( err.message );
	}
}

/* ------------------------- Save to my library --------------------------- */
/*
 * Save the selection straight into the user's library (localStorage) so it
 * appears in the tray/library right away — no JSON file to deal with (v1.32).
 * Reuses the same content-io descriptors as the "Export for Library" ops.
 */

/**
 * File → Save as Asset (v1.74): the current selection (whole units,
 * groups included) becomes ONE reusable asset in a user-chosen category.
 * Replaces the fixed Save Text/Shape/Background entries.
 */
export async function saveAssetToLibraryOp( editor, extras ) {
	const { state } = editor;
	const ids = state.selectedIds.length
		? state.selectedIds
		: state.activeId
		? [ state.activeId ]
		: [];
	const roots = unitRoots( state.layers, ids ).map( ( r ) => r.id );
	if ( ! roots.length ) {
		extras?.toasts?.error?.(
			__( 'Select the layers to save first.', 'wunderpaint' )
		);
		return;
	}
	const allIds = expandGroupIds( state.layers, roots );
	const subtree = state.layers.filter( ( l ) => allIds.includes( l.id ) );
	const leaves = subtree.filter( ( l ) => 'group' !== l.type );
	const bounds = {
		x: Math.min( ...leaves.map( ( l ) => l.x ) ),
		y: Math.min( ...leaves.map( ( l ) => l.y ) ),
	};
	bounds.w = Math.max( ...leaves.map( ( l ) => l.x + l.w ) ) - bounds.x;
	bounds.h = Math.max( ...leaves.map( ( l ) => l.y + l.h ) ) - bounds.y;

	// ONE dialog for name + category (v1.266); "+ New category" still asks
	// for the new name in a follow-up prompt.
	await ensureCategories();
	const cats = getCategories();
	const NONE = __( 'Unsorted', 'wunderpaint' );
	const NEW = __( '+ New category', 'wunderpaint' );
	const first = state.layers.find( ( l ) => l.id === roots[ 0 ] );
	const res = await promptDialog( {
		title: __( 'Save as Asset', 'wunderpaint' ),
		label: __( 'Name', 'wunderpaint' ),
		defaultValue: first?.name || __( 'My Asset', 'wunderpaint' ),
		select: {
			label: __( 'Category', 'wunderpaint' ),
			options: [ ...cats, NONE, NEW ],
			defaultValue: cats[ 0 ] || NONE,
		},
	} );
	const label = res && res.value ? res.value.trim() : '';
	if ( ! label ) {
		return;
	}
	let category = '';
	if ( res.select === NEW ) {
		const created = await promptDialog( {
			title: __( 'New category', 'wunderpaint' ),
			label: __( 'Category name', 'wunderpaint' ),
		} );
		if ( null === created ) {
			return;
		}
		category = created.trim();
		if ( category ) {
			await mutateCategory( 'add', category ).catch( () => {} );
		}
	} else if ( res.select !== NONE ) {
		category = res.select;
	}
	try {
		const serialized = serializeLayers( subtree ).map( ( l ) =>
			roots.includes( l.id ) ? { ...l, parent: null } : l
		);
		const item = {
			label,
			category,
			bounds,
			layers: serialized,
			preview: await renderToDataURL( state.doc, state.layers, {
				viewport: bounds,
				scale: Math.min(
					1,
					220 / Math.max( 1, Math.max( bounds.w, bounds.h ) )
				),
				format: 'jpeg',
				quality: 70,
				cache: sharedImageCache,
			} ),
		};
		if ( JSON.stringify( item ).length > 240000 ) {
			extras?.toasts?.error?.(
				__(
					'This selection is too large to save (big pixel layers). Save smaller pieces instead.',
					'wunderpaint'
				)
			);
			return;
		}
		await saveUserItem( 'asset', item );
		extras?.toasts?.success?.(
			__( 'Saved to your library.', 'wunderpaint' )
		);
	} catch ( e ) {
		extras?.toasts?.error?.(
			__( 'Could not save to your library.', 'wunderpaint' )
		);
	}
}

/**
 * Insert a saved asset (layer snapshot) centered in the document with
 * fresh ids; multiple roots arrive as one group (v1.74).
 */
export async function insertLayerSnapshotOp( editor, item, extras ) {
	try {
		const hydrated = await hydrateLayers(
			( item.layers || [] ).map( ( l ) => ( { ...l } ) )
		);
		if ( ! hydrated.length ) {
			return;
		}
		const { state, dispatch, commit } = editor;
		const rootIds = hydrated
			.filter( ( l ) => ! l.parent )
			.map( ( l ) => l.id );
		const { copies: cloned } = DocOps.cloneLayerTree( hydrated, rootIds );
		const leaves = cloned.filter( ( l ) => 'group' !== l.type );
		const bx = Math.min( ...leaves.map( ( l ) => l.x ) );
		const by = Math.min( ...leaves.map( ( l ) => l.y ) );
		const bw = Math.max( ...leaves.map( ( l ) => l.x + l.w ) ) - bx;
		const bh = Math.max( ...leaves.map( ( l ) => l.y + l.h ) ) - by;
		const dx = Math.round( state.doc.w / 2 - ( bx + bw / 2 ) );
		const dy = Math.round( state.doc.h / 2 - ( by + bh / 2 ) );
		let moved = cloned.map( ( l ) =>
			'group' === l.type ? l : DocOps.offsetLayer( l, dx, dy )
		);
		const newRoots = moved.filter( ( l ) => ! l.parent );
		let activeId = newRoots[ 0 ]?.id;
		if ( newRoots.length > 1 ) {
			const group = makeGroup( {
				name: item.label || __( 'Asset', 'wunderpaint' ),
			} );
			group.children = newRoots.map( ( l ) => l.id );
			moved = [
				...moved.map( ( l ) =>
					l.parent ? l : { ...l, parent: group.id }
				),
				group,
			];
			activeId = group.id;
		}
		dispatch( {
			type: 'SET_LAYERS',
			layers: [ ...state.layers, ...moved ],
		} );
		dispatch( { type: 'SET_ACTIVE', id: activeId } );
		commit( __( 'Insert asset', 'wunderpaint' ) );
	} catch ( e ) {
		extras?.toasts?.error?.( e.message );
	}
}
