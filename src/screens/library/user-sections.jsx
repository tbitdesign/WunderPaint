/**
 * The sections over the user's own material: uploads, saved designs and the
 * asset library.
 *
 * Split out of library-dialog.jsx in v1.344.0, which had grown to 2828 lines
 * over thirteen sections that share no state - the shell keeps two pieces of
 * state and renders one section at a time.
 */

import { useState, useRef, useEffect } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { I } from '../../icons';
import { confirmDialog, promptDialog } from '../../lib/dialogs';
import { designs as designsApi, listMediaPage } from '../../lib/api';
import { insertAsset } from '../../lib/asset-insert';
import { SearchIndexHint } from '../../components/search-index-hint';
import {
	useUserItems,
	removeUserItem,
	updateUserItem,
	useCategories,
	mutateCategory,
} from '../../lib/user-content';
import * as Ops from '../../store/ops';
import { openDesignDocument } from './template-sections';

/* -------------------------------- uploads ------------------------------ */

export function UploadsSection( { editor, extras, onClose } ) {
	const [ items, setItems ] = useState( null );
	const [ page, setPage ] = useState( 1 );
	const [ hasMore, setHasMore ] = useState( false );
	const loadingRef = useRef( false );
	const contentRef = useRef( null );

	useEffect( () => {
		loadingRef.current = true;
		listMediaPage( page )
			.then( ( result ) => {
				setItems( ( prev ) => [ ...( prev || [] ), ...result.items ] );
				setHasMore( result.hasMore );
			} )
			.catch( () => setItems( [] ) )
			.finally( () => {
				loadingRef.current = false;
			} );
	}, [ page ] );

	// Auto-fill (v1.63.1): keep loading while the page does not overflow
	// the panel, otherwise no scroll event ever triggers the next page.
	useEffect( () => {
		const el = contentRef.current;
		if (
			el &&
			hasMore &&
			! loadingRef.current &&
			el.scrollHeight <= el.clientHeight + 40
		) {
			setPage( ( p ) => p + 1 );
		}
	}, [ items, hasMore ] );

	const insert = async ( item ) => {
		if (
			false !==
			( await insertAsset( editor, extras, {
				kind: 'upload',
				fullUrl: item.fullUrl || item.url,
				title: item.title,
			} ) )
		) {
			onClose();
		}
	};

	return (
		<div
			className="library-content"
			ref={ contentRef }
			onScroll={ ( e ) => {
				const el = e.currentTarget;
				if (
					hasMore &&
					! loadingRef.current &&
					el.scrollTop + el.clientHeight > el.scrollHeight - 400
				) {
					setPage( ( p ) => p + 1 );
				}
			} }
		>
			<SearchIndexHint />
			{ null === items && (
				<div className="library-hint">
					<span className="spin" />{ ' ' }
					{ __( 'Loading images…', 'wunderpaint' ) }
				</div>
			) }
			{ items && 0 === items.length && (
				<div className="library-hint">
					{ __(
						'No images in the media library yet.',
						'wunderpaint'
					) }
				</div>
			) }
			{ items && items.length > 0 && (
				<div className="library-tpl-grid uploads-grid">
					{ items.map( ( item ) => (
						<button
							key={ item.id }
							className="uploads-tile"
							title={ item.title }
							onClick={ () => insert( item ) }
						>
							<img src={ item.url } alt="" loading="lazy" />
							<span className="library-tpl-name">
								{ item.title ||
									__( 'Untitled', 'wunderpaint' ) }
							</span>
						</button>
					) ) }
				</div>
			) }
			{ hasMore && (
				<div className="stock-more">
					<button
						className="button"
						onClick={ () => setPage( ( p ) => p + 1 ) }
					>
						{ __( 'Load more', 'wunderpaint' ) }
					</button>
				</div>
			) }
		</div>
	);
}

/* ------------------------------- designs ------------------------------- */

export function DesignsSection( { editor, extras, onClose } ) {
	const [ list, setList ] = useState( null );
	const [ busy, setBusy ] = useState( false );
	const [ folder, setFolder ] = useState( '' ); // '' = all (v1.11)

	const refresh = () =>
		designsApi
			.list()
			.then( setList )
			.catch( () => setList( [] ) );
	useEffect( () => {
		refresh();
	}, [] );

	const open = async ( design ) => {
		setBusy( true );
		try {
			if ( await openDesignDocument( editor, design, extras ) ) {
				onClose();
			}
		} catch ( err ) {
			extras.toasts.error( err.message );
		}
		setBusy( false );
	};

	const when = ( ts ) =>
		new Date( ( ts || 0 ) * 1000 ).toLocaleDateString( undefined, {
			day: '2-digit',
			month: '2-digit',
			year: '2-digit',
		} );

	return (
		<div className="library-content">
			<div className="library-hint" style={ { marginBottom: 8 } }>
				{ __(
					'Layered working files, save the open document here via File → “Save Design”.',
					'wunderpaint'
				) }
			</div>
			{ list && list.some( ( d ) => d.folder ) && (
				<div
					style={ {
						display: 'flex',
						gap: 6,
						alignItems: 'center',
						marginBottom: 10,
					} }
				>
					<span
						style={ {
							fontSize: 11,
							color: 'var(--ed-text-muted)',
						} }
					>
						{ __( 'Folder', 'wunderpaint' ) }
					</span>
					<select
						className="dsm-select"
						value={ folder }
						onChange={ ( e ) => setFolder( e.target.value ) }
						aria-label={ __( 'Folder', 'wunderpaint' ) }
					>
						<option value="">
							{ __( 'All designs', 'wunderpaint' ) }
						</option>
						{ [
							...new Set(
								list.map( ( d ) => d.folder ).filter( Boolean )
							),
						].map( ( f ) => (
							<option key={ f } value={ f }>
								{ f }
							</option>
						) ) }
					</select>
				</div>
			) }
			{ null === list && (
				<div className="library-hint">
					<span className="spin" />{ ' ' }
					{ __( 'Loading designs…', 'wunderpaint' ) }
				</div>
			) }
			{ list && 0 === list.length && (
				<div className="library-hint">
					{ __(
						'No designs yet. Use File → “Save Design” to keep an editable copy of your work here.',
						'wunderpaint'
					) }
				</div>
			) }
			{ list && list.length > 0 && (
				<div className="library-tpl-grid">
					{ list
						.filter( ( d ) => ! folder || d.folder === folder )
						.map( ( design ) => (
							<div key={ design.id } className="library-tpl">
								<button
									className="library-tpl-open"
									onClick={ () => open( design ) }
									disabled={ busy }
									title={ __( 'Open design', 'wunderpaint' ) }
								>
									{ design.preview ? (
										<img
											src={ design.preview }
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
										{ design.name }
										<span className="library-tpl-date">
											{ when( design.modified ) }
										</span>
									</span>
								</button>
								<div className="library-tpl-actions">
									<button
										title={ __(
											'Duplicate design',
											'wunderpaint'
										) }
										aria-label={ __(
											'Duplicate design',
											'wunderpaint'
										) }
										disabled={ busy }
										onClick={ async () => {
											try {
												await designsApi.duplicate(
													design.id
												);
												refresh();
											} catch ( err ) {
												extras.toasts.error(
													err.message
												);
											}
										} }
									>
										{ I.duplicate( { size: 12 } ) }
									</button>
									<button
										title={ __(
											'Move to folder',
											'wunderpaint'
										) }
										aria-label={ __(
											'Move to folder',
											'wunderpaint'
										) }
										disabled={ busy }
										onClick={ async () => {
											const target = await promptDialog( {
												title: __(
													'Move to folder',
													'wunderpaint'
												),
												label: __(
													'Folder (empty removes it)',
													'wunderpaint'
												),
												defaultValue:
													design.folder || '',
											} );
											if ( null !== target ) {
												try {
													await designsApi.update(
														design.id,
														{ folder: target }
													);
													refresh();
												} catch ( err ) {
													extras.toasts.error(
														err.message
													);
												}
											}
										} }
									>
										{ I.folder( { size: 12 } ) }
									</button>
									<button
										title={ __(
											'Rename design',
											'wunderpaint'
										) }
										aria-label={ __(
											'Rename design',
											'wunderpaint'
										) }
										disabled={ busy }
										onClick={ async () => {
											const name = await promptDialog( {
												title: __(
													'Rename design',
													'wunderpaint'
												),
												label: __(
													'Name',
													'wunderpaint'
												),
												defaultValue: design.name,
											} );
											if (
												name &&
												name !== design.name
											) {
												try {
													await designsApi.update(
														design.id,
														{ name }
													);
													refresh();
												} catch ( err ) {
													extras.toasts.error(
														err.message
													);
												}
											}
										} }
									>
										{ I.edit
											? I.edit( { size: 12 } )
											: '✎' }
									</button>
									<button
										title={ __(
											'Delete design',
											'wunderpaint'
										) }
										aria-label={ __(
											'Delete design',
											'wunderpaint'
										) }
										disabled={ busy }
										onClick={ async () => {
											if (
												await confirmDialog( {
													title: __(
														'Delete design',
														'wunderpaint'
													),
													message: sprintf(
														/* translators: %s: design name. */
														__(
															'Delete “%s”?',
															'wunderpaint'
														),
														design.name
													),
													confirmLabel: __(
														'Delete',
														'wunderpaint'
													),
													danger: true,
												} )
											) {
												await designsApi
													.remove( design.id )
													.catch( () => {} );
												refresh();
											}
										} }
									>
										{ I.close( { size: 12 } ) }
									</button>
								</div>
							</div>
						) ) }
				</div>
			) }
		</div>
	);
}

/* ------------------------------- my assets ------------------------------ */

// Drag payload for moving an asset card onto a category chip (v1.266).
const ASSET_DRAG_MIME = 'application/x-wpie-user-asset-id';

/**
 * The user's own asset library (v1.74): anything saved via File → "Save to
 * Library", organised into user-defined categories (create/rename/delete).
 * v1.266: assets are editable (name + category in one dialog), cards drag
 * onto the category chips, chips show counts, deleting asks first.
 */
export function AssetsSection( { editor, extras, onClose } ) {
	const items = useUserItems( 'asset' );
	const categories = useCategories();
	const [ cat, setCat ] = useState( '*' );
	// DnD: which chip a dragged card hovers, and whether a drag is running
	// (the Unsorted chip appears as a drop target during one).
	const [ dropCat, setDropCat ] = useState( null );
	const [ dragging, setDragging ] = useState( false );
	const hasUnsorted = items.some( ( it ) => ! it.category );
	const countFor = ( c ) =>
		items.filter( ( it ) => ( it.category || '' ) === c ).length;
	const visible = items.filter(
		( it ) => '*' === cat || ( it.category || '' ) === cat
	);

	const dropProps = ( c ) => ( {
		onDragOver: ( e ) => {
			if ( e.dataTransfer.types.includes( ASSET_DRAG_MIME ) ) {
				e.preventDefault();
				e.dataTransfer.dropEffect = 'move';
				setDropCat( c );
			}
		},
		onDragLeave: () => setDropCat( ( d ) => ( d === c ? null : d ) ),
		onDrop: ( e ) => {
			const id = e.dataTransfer.getData( ASSET_DRAG_MIME );
			setDropCat( null );
			setDragging( false );
			if ( id ) {
				e.preventDefault();
				updateUserItem( 'asset', id, { category: c } );
			}
		},
	} );

	const editAsset = async ( it ) => {
		const NONE = __( 'Unsorted', 'wunderpaint' );
		const NEW = __( '+ New category', 'wunderpaint' );
		const res = await promptDialog( {
			title: __( 'Edit asset', 'wunderpaint' ),
			label: __( 'Name', 'wunderpaint' ),
			defaultValue: it.label,
			select: {
				label: __( 'Category', 'wunderpaint' ),
				options: [ ...categories, NONE, NEW ],
				defaultValue: it.category || NONE,
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
		await updateUserItem( 'asset', it.id, { label, category } );
	};

	const deleteAsset = async ( it ) => {
		if (
			await confirmDialog( {
				title: __( 'Delete asset', 'wunderpaint' ),
				message: sprintf(
					/* translators: %s: asset name. */
					__( 'Delete “%s”?', 'wunderpaint' ),
					it.label
				),
				confirmLabel: __( 'Delete', 'wunderpaint' ),
				danger: true,
			} )
		) {
			removeUserItem( 'asset', it.id );
		}
	};

	const addCategory = async () => {
		const name = await promptDialog( {
			title: __( 'New category', 'wunderpaint' ),
			label: __( 'Category name', 'wunderpaint' ),
		} );
		if ( name && name.trim() ) {
			await mutateCategory( 'add', name.trim() ).catch( () => {} );
			setCat( name.trim() );
		}
	};
	const renameCategory = async ( name ) => {
		const to = await promptDialog( {
			title: __( 'Rename category', 'wunderpaint' ),
			label: __( 'Category name', 'wunderpaint' ),
			defaultValue: name,
		} );
		if ( to && to.trim() && to.trim() !== name ) {
			await mutateCategory( 'rename', name, to.trim() ).catch( () => {} );
			setCat( to.trim() );
		}
	};
	const deleteCategory = async ( name ) => {
		if (
			await confirmDialog( {
				title: __( 'Delete category', 'wunderpaint' ),
				message: sprintf(
					/* translators: %s: category name. */
					__(
						'Delete the category “%s”? Its assets are kept and move to Unsorted.',
						'wunderpaint'
					),
					name
				),
				confirmLabel: __( 'Delete', 'wunderpaint' ),
				danger: true,
			} )
		) {
			await mutateCategory( 'delete', name ).catch( () => {} );
			setCat( '*' );
		}
	};

	return (
		<div className="library-content">
			<div className="asset-cats">
				<button
					className={ '*' === cat ? 'active' : '' }
					onClick={ () => setCat( '*' ) }
				>
					{ __( 'All', 'wunderpaint' ) } ({ items.length })
				</button>
				{ categories.map( ( c ) => (
					<span
						key={ c }
						className={
							'asset-cat' +
							( cat === c ? ' active' : '' ) +
							( dropCat === c ? ' drop-target' : '' )
						}
						{ ...dropProps( c ) }
					>
						<button onClick={ () => setCat( c ) }>
							{ c } ({ countFor( c ) })
						</button>
						<button
							className="asset-cat-tool"
							title={ __( 'Rename category', 'wunderpaint' ) }
							aria-label={ __(
								'Rename category',
								'wunderpaint'
							) }
							onClick={ () => renameCategory( c ) }
						>
							✎
						</button>
						<button
							className="asset-cat-tool"
							title={ __( 'Delete category', 'wunderpaint' ) }
							aria-label={ __(
								'Delete category',
								'wunderpaint'
							) }
							onClick={ () => deleteCategory( c ) }
						>
							×
						</button>
					</span>
				) ) }
				{ ( hasUnsorted || dragging ) && (
					<button
						className={
							( '' === cat ? 'active' : '' ) +
							( '' === dropCat ? ' drop-target' : '' )
						}
						onClick={ () => setCat( '' ) }
						{ ...dropProps( '' ) }
					>
						{ __( 'Unsorted', 'wunderpaint' ) } ({ countFor( '' ) })
					</button>
				) }
				<button className="asset-cat-add" onClick={ addCategory }>
					{ __( '+ New category', 'wunderpaint' ) }
				</button>
			</div>
			{ dragging && (
				<div className="asset-drop-hint">
					{ __(
						'Drop the asset on a category to move it.',
						'wunderpaint'
					) }
				</div>
			) }
			{ ! visible.length && (
				<div className="library-hint">
					{ __(
						'Nothing here yet. Select layers on the canvas and use File → "Save as Asset" to build your own asset collection.',
						'wunderpaint'
					) }
				</div>
			) }
			{ visible.length > 0 && (
				<div className="library-tpl-grid">
					{ visible.map( ( it ) => (
						<div
							key={ it.id }
							className="library-tpl"
							draggable
							onDragStart={ ( e ) => {
								e.dataTransfer.setData(
									ASSET_DRAG_MIME,
									it.id
								);
								e.dataTransfer.effectAllowed = 'move';
								setDragging( true );
							} }
							onDragEnd={ () => {
								setDragging( false );
								setDropCat( null );
							} }
						>
							<button
								className="library-tpl-open"
								title={ __( 'Insert', 'wunderpaint' ) }
								onClick={ async () => {
									await Ops.insertLayerSnapshotOp(
										editor,
										it,
										extras
									);
									onClose();
								} }
							>
								{ it.preview ? (
									<img
										src={ it.preview }
										alt=""
										loading="lazy"
									/>
								) : (
									<div className="library-tpl-empty">
										{ __( 'No preview', 'wunderpaint' ) }
									</div>
								) }
								<span className="library-tpl-name">
									{ it.label }
									{ it.category ? (
										<small> · { it.category }</small>
									) : null }
								</span>
							</button>
							<div className="library-tpl-actions">
								<button
									title={ __( 'Edit asset', 'wunderpaint' ) }
									aria-label={ __(
										'Edit asset',
										'wunderpaint'
									) }
									onClick={ () => editAsset( it ) }
								>
									{ I.pencil( { size: 12 } ) }
								</button>
								<button
									title={ __(
										'Delete asset',
										'wunderpaint'
									) }
									aria-label={ __(
										'Delete asset',
										'wunderpaint'
									) }
									onClick={ () => deleteAsset( it ) }
								>
									{ I.close( { size: 12 } ) }
								</button>
							</div>
						</div>
					) ) }
				</div>
			) }
		</div>
	);
}
