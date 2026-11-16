/**
 * Left column of the Color Schemer (v1.432.0): where a palette comes from
 * and where it is kept. Sources (an image from the Media Library Manager,
 * the document), the saved palettes - load, rename, duplicate, reorder by
 * dragging, delete with Undo - and the Brand Kits, which can take the
 * palette as their colors.
 */

import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../../icons';
import { useEscape } from '../../components/use-escape';
import { useReorder } from '../../components/use-reorder';

export function Strip( { colors } ) {
	return (
		<span className="csd-strip" aria-hidden="true">
			{ colors.slice( 0, 12 ).map( ( c, i ) => (
				<i key={ i } style={ { background: c } } />
			) ) }
		</span>
	);
}

function SetRow( {
	set,
	index,
	active,
	renaming,
	manage,
	sortable,
	reorder,
	onLoad,
	onStartRename,
	onRename,
	onCancelRename,
	onDuplicate,
	onDelete,
} ) {
	const [ draft, setDraft ] = useState( set.name );
	const over = reorder.drag?.over;
	const from = reorder.drag?.from;
	const gap = over !== undefined && over !== from && over !== from + 1;
	return (
		<div
			data-reorder-index={ index }
			style={ { '--csd-actions': manage ? 3 : 1 } }
			className={ [
				'csd-set',
				active && 'is-on',
				from === index && 'is-dragging',
				gap && over === index && 'is-drop-before',
			]
				.filter( Boolean )
				.join( ' ' ) }
			onPointerDown={ ( e ) => {
				if (
					sortable &&
					! renaming &&
					! e.target.closest( '.dsm-mini' )
				) {
					reorder.start( index, e );
				}
			} }
		>
			{ renaming ? (
				<input
					className="dsm-input csd-set-name-input"
					value={ draft }
					aria-label={ __( 'Palette name', 'wunderpaint' ) }
					// eslint-disable-next-line jsx-a11y/no-autofocus
					autoFocus
					onChange={ ( e ) => setDraft( e.target.value ) }
					onFocus={ ( e ) => e.target.select() }
					onKeyDown={ ( e ) => {
						if ( 'Enter' === e.key ) {
							e.preventDefault();
							onRename( draft );
						}
					} }
					onBlur={ () =>
						draft.trim() && draft !== set.name
							? onRename( draft )
							: onCancelRename()
					}
				/>
			) : (
				<button
					type="button"
					className="csd-set-load"
					aria-pressed={ active }
					title={ __( 'Load into the palette', 'wunderpaint' ) }
					onClick={ () => ! reorder.wasDrag() && onLoad() }
				>
					<span className="csd-set-name">{ set.name }</span>
					<Strip colors={ set.colors } />
				</button>
			) }
			{ ! renaming && (
				<span className="csd-set-actions">
					{ manage && (
						<button
							type="button"
							className="dsm-mini"
							aria-label={ __( 'Rename', 'wunderpaint' ) }
							title={ __( 'Rename', 'wunderpaint' ) }
							onClick={ () => {
								setDraft( set.name );
								onStartRename();
							} }
						>
							{ I.pencil( { size: 13 } ) }
						</button>
					) }
					<button
						type="button"
						className="dsm-mini"
						aria-label={ __( 'Duplicate', 'wunderpaint' ) }
						title={ __( 'Duplicate', 'wunderpaint' ) }
						onClick={ onDuplicate }
					>
						{ I.duplicate( { size: 13 } ) }
					</button>
					{ manage && (
						<button
							type="button"
							className="dsm-mini danger"
							aria-label={ __( 'Delete', 'wunderpaint' ) }
							title={ __( 'Delete', 'wunderpaint' ) }
							onClick={ onDelete }
						>
							{ I.trash( { size: 13 } ) }
						</button>
					) }
				</span>
			) }
		</div>
	);
}

export function LibraryColumn( {
	sets,
	canSave,
	activeId,
	canManageSet,
	onLoadSet,
	onRenameSet,
	onDuplicateSet,
	onDeleteSet,
	onMoveSet,
	kits,
	canManageKits,
	onLoadKit,
	onKitColors,
	canPickImage,
	picking,
	onFromImage,
	hasDocument,
	onFromDocument,
} ) {
	const [ renaming, setRenaming ] = useState( null );
	const reorder = useReorder( { axis: 'y', onMove: onMoveSet } );
	// The server puts palettes the caller may not manage first, whatever
	// order it receives; sorting is offered where it can hold.
	const sortable = sets.length > 1 && sets.every( canManageSet );
	// Escape ends a rename, not the whole dialog.
	useEscape( () => setRenaming( null ), !! renaming );

	return (
		<div className="csd-left">
			<section className="dsm-card">
				<div className="dsm-card-head">
					{ I.eyedropper( { size: 14 } ) }
					<span>{ __( 'Start from', 'wunderpaint' ) }</span>
				</div>
				<div className="dsm-picklist">
					{ canPickImage && (
						<button
							type="button"
							className="dsm-pickrow dsm-pickrow-sm"
							disabled={ picking }
							onClick={ onFromImage }
						>
							<span className="dsm-pickrow-icon">
								{ I.image( { size: 16 } ) }
							</span>
							<b>{ __( 'An image', 'wunderpaint' ) }</b>
						</button>
					) }
					<button
						type="button"
						className="dsm-pickrow dsm-pickrow-sm"
						disabled={ ! hasDocument }
						onClick={ onFromDocument }
					>
						<span className="dsm-pickrow-icon">
							{ I.layers( { size: 16 } ) }
						</span>
						<b>{ __( 'This document', 'wunderpaint' ) }</b>
					</button>
				</div>
			</section>

			{ canSave && (
				<section className="dsm-card">
					<div className="dsm-card-head">
						{ I.save( { size: 14 } ) }
						<span>{ __( 'Saved palettes', 'wunderpaint' ) }</span>
					</div>
					{ sets.length ? (
						<div className="csd-sets" data-reorder-list="">
							{ sets.map( ( set, i ) => (
								<SetRow
									key={ set.id }
									set={ set }
									index={ i }
									active={ set.id === activeId }
									renaming={ renaming === set.id }
									manage={ canManageSet( set ) }
									sortable={ sortable }
									reorder={ reorder }
									onLoad={ () => onLoadSet( set ) }
									onStartRename={ () =>
										setRenaming( set.id )
									}
									onRename={ ( name ) => {
										setRenaming( null );
										onRenameSet( set.id, name );
									} }
									onCancelRename={ () => setRenaming( null ) }
									onDuplicate={ () =>
										onDuplicateSet( set.id )
									}
									onDelete={ () => onDeleteSet( set.id ) }
								/>
							) ) }
							{ reorder.drag &&
								reorder.drag.over === sets.length &&
								reorder.drag.from !== sets.length - 1 && (
									<span className="csd-set-end" />
								) }
						</div>
					) : (
						<p className="csd-note">
							{ __(
								'A saved palette shows up here and in every color picker.',
								'wunderpaint'
							) }
						</p>
					) }
				</section>
			) }

			{ kits.length > 0 && (
				<section className="dsm-card">
					<div className="dsm-card-head">
						{ I.folder( { size: 14 } ) }
						<span>{ __( 'Brand Kits', 'wunderpaint' ) }</span>
					</div>
					<div className="csd-sets">
						{ kits.map( ( kit ) => (
							<div
								key={ kit.id }
								className="csd-set"
								style={ {
									'--csd-actions': canManageKits ? 1 : 0,
								} }
							>
								<button
									type="button"
									className="csd-set-load"
									title={ __(
										'Load into the palette',
										'wunderpaint'
									) }
									disabled={ ! kit.colors?.length }
									onClick={ () => onLoadKit( kit ) }
								>
									<span className="csd-set-name">
										{ kit.name }
									</span>
									<Strip colors={ kit.colors || [] } />
								</button>
								{ canManageKits && (
									<span className="csd-set-actions">
										<button
											type="button"
											className="dsm-mini"
											aria-label={ __(
												'Use the palette as this kit’s colors',
												'wunderpaint'
											) }
											title={ __(
												'Use the palette as this kit’s colors',
												'wunderpaint'
											) }
											onClick={ () => onKitColors( kit ) }
										>
											{ I.check( { size: 13 } ) }
										</button>
									</span>
								) }
							</div>
						) ) }
					</div>
				</section>
			) }
		</div>
	);
}
