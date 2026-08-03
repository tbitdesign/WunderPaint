/**
 * Post-save workflow (v1.0): after "Save As New" the fresh attachment can
 * be used right away, as a featured image on an existing post, or inside
 * a brand-new draft.
 */

import { useState, useEffect } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import {
	searchPosts,
	setFeaturedImage,
	createDraftWithImage,
} from '../lib/api';

export function UseImageDialog( { attachment, onClose, extras } ) {
	const { WPIE } = useEditor();
	const [ query, setQuery ] = useState( '' );
	const [ posts, setPosts ] = useState( [] );
	const [ busy, setBusy ] = useState( false );
	const [ working, setWorking ] = useState( null ); // post id | 'draft'
	useEscape( onClose );

	useEffect( () => {
		let stale = false;
		setBusy( true );
		const timer = setTimeout( () => {
			searchPosts( query.trim() )
				.then( ( result ) => {
					if ( ! stale ) {
						setPosts( result );
					}
				} )
				.catch( () => {} )
				.finally( () => ! stale && setBusy( false ) );
		}, 300 );
		return () => {
			stale = true;
			clearTimeout( timer );
		};
	}, [ query ] );

	const editUrl = ( postId ) =>
		WPIE.libraryUrl.replace(
			'upload.php',
			`post.php?post=${ postId }&action=edit`
		);

	const makeFeatured = async ( post ) => {
		setWorking( post.id );
		try {
			await setFeaturedImage( post.id, attachment.id );
			extras.toasts.success(
				sprintf(
					/* translators: %s: post title. */
					__( 'Set as featured image of “%s”.', 'wunderpaint' ),
					post.title
				),
				{
					linkText: __( 'Edit post', 'wunderpaint' ),
					linkHref: editUrl( post.id ),
				}
			);
			onClose();
		} catch ( err ) {
			extras.toasts.error( err.message );
		}
		setWorking( null );
	};

	const makeDraft = async () => {
		setWorking( 'draft' );
		try {
			const draft = await createDraftWithImage(
				attachment.name || '',
				attachment.id,
				attachment.url
			);
			extras.toasts.success(
				__( 'Draft created with the image.', 'wunderpaint' ),
				{
					linkText: __( 'Edit draft', 'wunderpaint' ),
					linkHref: editUrl( draft.id ),
				}
			);
			onClose();
		} catch ( err ) {
			extras.toasts.error( err.message );
		}
		setWorking( null );
	};

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="stock-dialog"
				style={ {
					width: 520,
					height: 'auto',
					maxHeight: '80vh',
					gridTemplateRows: 'auto 1fr',
				} }
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Use image', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Use the new image?', 'wunderpaint' ) }
							</span>
						</div>
						<div className="dsm-sub">
							{ __(
								'Decide where the generated image should go.',
								'wunderpaint'
							) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ onClose }
						aria-label={ __( 'Close', 'wunderpaint' ) }
					>
						{ I.close( { size: 17 } ) }
					</button>
				</div>
				<div
					style={ {
						padding: 16,
						overflowY: 'auto',
						display: 'grid',
						gap: 12,
					} }
				>
					<div
						style={ {
							display: 'flex',
							gap: 10,
							alignItems: 'center',
						} }
					>
						<img
							src={ attachment.url }
							alt=""
							style={ {
								width: 56,
								height: 56,
								objectFit: 'cover',
								borderRadius: 4,
							} }
						/>
						<div
							style={ {
								fontSize: 12,
								color: 'var(--ed-text-muted)',
							} }
						>
							{ __(
								'The image was saved to the library. Use it as a featured image, or start a new draft with it.',
								'wunderpaint'
							) }
						</div>
					</div>
					<input
						type="search"
						placeholder={ __( 'Search posts…', 'wunderpaint' ) }
						value={ query }
						onChange={ ( e ) => setQuery( e.target.value ) }
						aria-label={ __( 'Search posts', 'wunderpaint' ) }
					/>
					<div
						style={ {
							border: '1px solid var(--ed-border)',
							borderRadius: 4,
							maxHeight: 220,
							overflowY: 'auto',
							fontSize: 12,
						} }
					>
						{ busy && (
							<div style={ { padding: 8 } }>
								<span className="spin" />
							</div>
						) }
						{ ! busy &&
							posts.map( ( post ) => (
								<div
									key={ post.id }
									style={ {
										display: 'flex',
										gap: 8,
										padding: '6px 8px',
										borderBottom:
											'1px solid var(--ed-border)',
										alignItems: 'center',
									} }
								>
									<span
										style={ {
											flex: 1,
											overflow: 'hidden',
											textOverflow: 'ellipsis',
											whiteSpace: 'nowrap',
										} }
									>
										{ post.title }
									</span>
									<button
										className="ai-btn secondary"
										disabled={ !! working }
										onClick={ () => makeFeatured( post ) }
									>
										{ working === post.id && (
											<span className="spin" />
										) }
										{ __( 'Set featured', 'wunderpaint' ) }
									</button>
								</div>
							) ) }
						{ ! busy && 0 === posts.length && (
							<div
								style={ {
									padding: 8,
									color: 'var(--ed-text-muted)',
								} }
							>
								{ __( 'No posts found.', 'wunderpaint' ) }
							</div>
						) }
					</div>
					<div
						style={ {
							display: 'flex',
							gap: 8,
							justifyContent: 'flex-end',
						} }
					>
						<button
							className="ai-btn secondary"
							onClick={ onClose }
						>
							{ __( 'Skip', 'wunderpaint' ) }
						</button>
						<button
							className="ai-btn primary"
							disabled={ !! working }
							onClick={ makeDraft }
						>
							{ 'draft' === working && <span className="spin" /> }
							{ __( 'Insert into new draft', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
