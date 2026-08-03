/**
 * Templates and starters, plus the three openers that turn a stored document
 * into the live one. The openers are the only part of this file other
 * screens import directly.
 *
 * Split out of library-dialog.jsx in v1.344.0, which had grown to 2828 lines
 * over thirteen sections that share no state - the shell keeps two pieces of
 * state and renders one section at a time.
 */

import { useState, useRef, useEffect } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { I } from '../../icons';
import { hydrateLayers } from '../../store/document';
import { confirmDialog } from '../../lib/dialogs';
import {
	templates as templatesApi,
	designs as designsApi,
} from '../../lib/api';
import { renderToCanvas, sharedImageCache } from '../../lib/raster';
import { ensureFontsForLayers } from '../../lib/font-manager';
import { useTemplates } from '../../content/use-content';
import {
	TEMPLATE_CATEGORIES,
	mergeTemplateCategories,
} from '../../content/template-categories';
import { filterTemplates } from '../../content/template-filter';
import { useExtensionTemplatePacks } from '../../components/use-extension-packs';

/* ------------------------------ templates ------------------------------ */

// Rendered starter previews, cached for the session (v1.7).
const starterPreviewCache = new Map();

export function StarterPreview( { template } ) {
	const [ url, setUrl ] = useState(
		() => starterPreviewCache.get( template.id ) || null
	);
	// Previews render on demand (v1.254.0): every tile used to kick off a
	// full-fidelity render the moment it mounted, so opening the dialog
	// rasterized the complete template set at once. Now a tile waits until
	// it scrolls near the viewport.
	const [ visible, setVisible ] = useState( false );
	const boxRef = useRef( null );
	useEffect( () => {
		if ( url || visible ) {
			return;
		}
		const el = boxRef.current;
		if ( ! el || 'undefined' === typeof IntersectionObserver ) {
			setVisible( true );
			return;
		}
		const io = new IntersectionObserver(
			( entries ) => {
				if ( entries.some( ( entry ) => entry.isIntersecting ) ) {
					setVisible( true );
					io.disconnect();
				}
			},
			{ rootMargin: '300px' }
		);
		io.observe( el );
		return () => io.disconnect();
	}, [ url, visible ] );
	useEffect( () => {
		if ( url || ! visible ) {
			return;
		}
		let cancelled = false;
		// build() is sync for builder templates and async (hydration) for
		// bundled JSON templates, Promise.resolve unifies both.
		Promise.resolve( template.build() )
			.then( ( { doc, layers } ) =>
				ensureFontsForLayers( layers ).then( () => {
					const scale = Math.min( 240 / doc.w, 240 / doc.h );
					return renderToCanvas( doc, layers, {
						scale,
						cache: sharedImageCache,
					} );
				} )
			)
			.then( ( canvas ) => {
				if ( ! cancelled && canvas.toDataURL ) {
					const dataUrl = canvas.toDataURL( 'image/png' );
					starterPreviewCache.set( template.id, dataUrl );
					setUrl( dataUrl );
				}
			} )
			.catch( () => {} );
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ template.id, visible ] );
	return url ? (
		<img src={ url } alt="" loading="lazy" />
	) : (
		<div className="library-tpl-empty" ref={ boxRef }>
			{ visible && <span className="spin" /> }
		</div>
	);
}

export function TemplatesSection( { editor, extras, onClose } ) {
	const [ list, setList ] = useState( null );
	const [ busy, setBusy ] = useState( false );

	useEffect( () => {
		templatesApi
			.list()
			.then( setList )
			.catch( () => setList( [] ) );
	}, [] );

	const open = async ( t ) => {
		setBusy( true );
		try {
			if ( await openTemplateDocument( editor, t, extras ) ) {
				onClose();
			}
		} catch ( err ) {
			extras.toasts.error( err.message );
		}
		setBusy( false );
	};

	// Group user templates per brand kit (v1.97.0): one section per kit,
	// unassigned ones (and kits deleted meanwhile) under "Without brand kit".
	const kits = window.WPIE?.brandKits || [];
	const groups = [
		...kits.map( ( k ) => ( {
			key: k.id,
			label: k.name,
			items: ( list || [] ).filter( ( t ) => t.brandKit === k.id ),
		} ) ),
		{
			key: '',
			label: __( 'Without Brand Kit', 'wunderpaint' ),
			items: ( list || [] ).filter(
				( t ) =>
					! t.brandKit || ! kits.some( ( k ) => k.id === t.brandKit )
			),
		},
	].filter( ( g ) => g.items.length );

	return (
		<div className="library-content">
			{ null === list && (
				<div className="library-hint">
					<span className="spin" />{ ' ' }
					{ __( 'Loading templates…', 'wunderpaint' ) }
				</div>
			) }
			{ list && 0 === list.length && (
				<div className="library-hint">
					{ __(
						'No templates yet. Design something, then use File → “Save as Dynamic Template”, it will appear here with a preview.',
						'wunderpaint'
					) }
				</div>
			) }
			{ list &&
				list.length > 0 &&
				groups.map( ( group ) => (
					<div key={ group.key || 'none' }>
						<div className="library-subhead">{ group.label }</div>
						<div className="library-tpl-grid">
							{ group.items.map( ( t ) => (
								<div key={ t.id } className="library-tpl">
									<button
										className="library-tpl-open"
										onClick={ () => open( t ) }
										disabled={ busy }
										title={ __(
											'Open as new document',
											'wunderpaint'
										) }
									>
										{ t.preview ? (
											<img
												src={ t.preview }
												alt=""
												loading="lazy"
											/>
										) : (
											<div className="library-tpl-empty">
												{ __(
													'No preview',
													'wunderpaint'
												) }
											</div>
										) }
										<span className="library-tpl-name">
											{ t.name }
										</span>
									</button>
									<button
										className="library-tpl-del"
										title={ __(
											'Delete template',
											'wunderpaint'
										) }
										aria-label={ __(
											'Delete template',
											'wunderpaint'
										) }
										onClick={ async () => {
											if (
												await confirmDialog( {
													title: __(
														'Delete template',
														'wunderpaint'
													),
													message: sprintf(
														/* translators: %s: template name. */
														__(
															'Delete “%s”?',
															'wunderpaint'
														),
														t.name
													),
													confirmLabel: __(
														'Delete',
														'wunderpaint'
													),
													danger: true,
												} )
											) {
												await templatesApi
													.remove( t.id )
													.catch( () => {} );
												setList(
													list.filter(
														( x ) => x.id !== t.id
													)
												);
											}
										} }
									>
										{ I.close( { size: 12 } ) }
									</button>
								</div>
							) ) }
						</div>
					</div>
				) ) }
		</div>
	);
}

/**
 * Starter templates (v1.97.0): static, fully editable starting points that
 * ship with the plugin. Their own Asset Library section, they are not
 * dynamic templates.
 */
/**
 * Open a saved dynamic template as the current document (v1.98.0, shared
 * by the Asset Library dialog and the tray). Confirms unsaved changes.
 *
 * @param {Object} editor Editor context.
 * @param {Object} t      Template index record { id, name }.
 * @return {Promise<boolean>} Opened?
 */
export async function openTemplateDocument( editor, t, extras ) {
	if (
		! extras?.openDocInNewTab &&
		editor.dirty &&
		! ( await confirmDialog( {
			title: __( 'Unsaved changes', 'wunderpaint' ),
			message: __(
				'Opening a template replaces the current document. Discard unsaved changes?',
				'wunderpaint'
			),
			confirmLabel: __( 'Open template', 'wunderpaint' ),
			danger: true,
		} ) )
	) {
		return false;
	}
	const project = await templatesApi.load( t.id );
	const layers = await hydrateLayers( project.layers || [] );
	const doc = {
		...project.doc,
		// The template's own name, not the stored doc name (v1.160.0):
		// templates usually get saved from "untitled" documents.
		name: t.name || project.doc.name,
		source: {
			...project.doc.source,
			attachmentId: 0,
			isNew: true,
			templateId: t.id,
			templateName: t.name,
		},
	};
	if ( extras?.openDocInNewTab?.( { doc, layers, name: t.name } ) ) {
		return true;
	}
	editor.dispatch( {
		type: 'LOAD_DOCUMENT',
		doc,
		layers,
		label: __( 'From Template', 'wunderpaint' ),
	} );
	return true;
}

/**
 * Open a saved design as a document: shared by the library modal and
 * the tray strip. With document tabs the design opens NEXT TO the
 * current work; the discard prompt is only needed for the in-place
 * fallback.
 *
 * @param {Object} editor Editor context.
 * @param {Object} design Design list record ({id, name, ...}).
 * @param {Object} extras Editor extras (tabs, toasts).
 * @return {Promise<boolean>} Opened?
 */
export async function openDesignDocument( editor, design, extras ) {
	const canTab = !! extras?.openDocInNewTab;
	if (
		! canTab &&
		editor.dirty &&
		! ( await confirmDialog( {
			title: __( 'Unsaved changes', 'wunderpaint' ),
			message: __(
				'Opening a design replaces the current document. Discard unsaved changes?',
				'wunderpaint'
			),
			confirmLabel: __( 'Open design', 'wunderpaint' ),
			danger: true,
		} ) )
	) {
		return false;
	}
	const project = await designsApi.load( design.id );
	const pageIndex = project.pages
		? Math.min( project.currentPage || 0, project.pages.length - 1 )
		: 0;
	const pageDoc = project.pages
		? project.pages[ pageIndex ].doc
		: project.doc;
	const pageLayers = project.pages
		? project.pages[ pageIndex ].layers
		: project.layers;
	const layers = await hydrateLayers( pageLayers || [] );
	const doc = {
		...pageDoc,
		name: design.name,
		source: {
			...pageDoc.source,
			attachmentId: 0,
			isNew: true,
			designId: design.id,
		},
	};
	const setPages = ( target ) =>
		project.pages &&
		target.dispatch( {
			type: 'SET_PAGES',
			pages: project.pages,
			current: pageIndex,
		} );
	if (
		! extras?.openDocInNewTab?.( {
			doc,
			layers,
			name: design.name,
			afterMount: setPages,
		} )
	) {
		editor.dispatch( {
			type: 'LOAD_DOCUMENT',
			doc,
			layers,
			label: __( 'Open Design', 'wunderpaint' ),
		} );
		setPages( editor );
	}
	return true;
}

/**
 * Open a bundled starter template as the current document (v1.98.0).
 *
 * @param {Object} editor   Editor context.
 * @param {Object} template Starter record with build().
 * @return {Promise<boolean>} Opened?
 */
export async function openStarterDocument( editor, template, extras ) {
	if (
		! extras?.openDocInNewTab &&
		editor.dirty &&
		! ( await confirmDialog( {
			title: __( 'Unsaved changes', 'wunderpaint' ),
			message: __(
				'Opening a template replaces the current document. Discard unsaved changes?',
				'wunderpaint'
			),
			confirmLabel: __( 'Open template', 'wunderpaint' ),
			danger: true,
		} ) )
	) {
		return false;
	}
	const { doc, layers } = await template.build();
	if ( extras?.openDocInNewTab?.( { doc, layers } ) ) {
		return true;
	}
	editor.dispatch( {
		type: 'LOAD_DOCUMENT',
		doc,
		layers,
		label: __( 'From Template', 'wunderpaint' ),
	} );
	return true;
}

/**
 * Category dropdown for template galleries (chips until v1.266.x: with
 * 20+ merged categories the chip rows outgrew every dialog). Shared by
 * the library modal and the create dialog so both surfaces filter the
 * same way. The color-bucket dots are gone - color search is an image
 * affordance and never worked against template palettes.
 */
export function TemplateFilterBar( {
	cat,
	setCat,
	cats = TEMPLATE_CATEGORIES,
} ) {
	return (
		<div className="tpl-filterbar">
			<select
				className="dsm-select tpl-catselect"
				value={ cat }
				onChange={ ( e ) => setCat( e.target.value ) }
				aria-label={ __( 'Filter by category', 'wunderpaint' ) }
			>
				<option value="">
					{ __( 'All categories', 'wunderpaint' ) }
				</option>
				{ cats.map( ( c ) => (
					<option key={ c.id } value={ c.id }>
						{ c.label }
					</option>
				) ) }
			</select>
		</div>
	);
}

export function StartersSection( { editor, extras, onClose } ) {
	const STARTER_TEMPLATES = useTemplates();
	// Extension template packs (v1.121), grouped under their pack label.
	const packs = useExtensionTemplatePacks();
	// Filter within the section (v1.254.0): the set grew too large to
	// scan by scrolling alone. The search also matches each template's
	// copy and palette; categories filter via the dropdown.
	const [ query, setQuery ] = useState( '' );
	const [ cat, setCat ] = useState( '' );
	const filters = { q: query, cat };
	const openStarter = async ( template ) => {
		if ( await openStarterDocument( editor, template, extras ) ) {
			onClose();
		}
	};
	const grid = ( templates ) => (
		<div className="library-tpl-grid">
			{ templates.map( ( template ) => (
				<div key={ template.id } className="library-tpl">
					<button
						className="library-tpl-open"
						onClick={ () => openStarter( template ) }
						title={ __( 'Open as new document', 'wunderpaint' ) }
					>
						<StarterPreview template={ template } />
						<span className="library-tpl-name">
							{ template.name }
						</span>
					</button>
				</div>
			) ) }
		</div>
	);

	const starters = filterTemplates( STARTER_TEMPLATES, filters );
	// Pack templates carry category + descriptor (v1.257.0), so the
	// category dropdown and copy search treat them like the bundled set.
	const packGroups = packs
		.map( ( pack ) => ( {
			...pack,
			templates: filterTemplates( pack.templates, filters ),
		} ) )
		.filter( ( pack ) => pack.templates.length );
	return (
		<div className="library-content">
			<div className="library-toolbar">
				<input
					type="search"
					placeholder={ __( 'Search templates…', 'wunderpaint' ) }
					value={ query }
					onChange={ ( e ) => setQuery( e.target.value ) }
					aria-label={ __( 'Search templates', 'wunderpaint' ) }
				/>
				<TemplateFilterBar
					cat={ cat }
					setCat={ setCat }
					cats={ mergeTemplateCategories( packs ) }
				/>
			</div>
			{ grid( starters ) }
			{ packGroups.map( ( pack ) => (
				<div key={ pack.id }>
					<div className="library-subhead">{ pack.label }</div>
					{ grid( pack.templates ) }
				</div>
			) ) }
		</div>
	);
}
