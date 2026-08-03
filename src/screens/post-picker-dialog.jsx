/**
 * Post picker for View → "Preview with Post…" (dynamic templates E1): live
 * title search over published posts; picking one fetches its context and
 * turns on the non-destructive binding preview on the canvas.
 */

import { useState, useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { posts } from '../lib/api';
import { I } from '../icons';
import { collectMetaKeys } from '../lib/dynamic-content';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { assignBrandKitOp } from '../store/ops';

export function PostPickerDialog( {
	onClose,
	extras,
	onPick,
	heading,
	subheading,
} ) {
	const editor = useEditor();
	const [ q, setQ ] = useState( '' );
	const [ type, setType ] = useState( 'post' );
	const [ types, setTypes ] = useState( [] );
	const [ items, setItems ] = useState( null ); // null = loading
	const [ busy, setBusy ] = useState( 0 );
	const timer = useRef( null );
	useEscape( onClose );
	// Which kit resolves brand.* in this preview (v1.251.0): visible and
	// switchable right where the preview starts; the choice IS the
	// document's kit assignment (one concept, not a per-preview override).
	const kitList = window.WPIE?.brandKits || [];
	const docKit =
		kitList.find( ( k ) => k.id === editor.state.doc.brandKitId ) ||
		kitList[ 0 ] ||
		null;

	useEffect( () => {
		posts
			.types()
			.then( ( res ) => setTypes( res?.items || [] ) )
			.catch( () => {} );
	}, [] );

	useEffect( () => {
		let cancelled = false;
		window.clearTimeout( timer.current );
		timer.current = window.setTimeout(
			() => {
				posts
					.search( { search: q, type } )
					.then(
						( res ) => ! cancelled && setItems( res?.items || [] )
					)
					.catch( () => ! cancelled && setItems( [] ) );
			},
			q ? 250 : 0
		);
		return () => {
			cancelled = true;
			window.clearTimeout( timer.current );
		};
	}, [ q, type ] );

	const pick = async ( item ) => {
		if ( busy ) {
			return;
		}
		setBusy( item.id );
		try {
			const ctx = await posts.context(
				item.id,
				collectMetaKeys( editor.state.layers )
			);
			// Brand rides along so brand.* bindings resolve like post
			// fields; the document's assigned kit wins (v1.91.0).
			// window.WPIE first (v1.250.2): the context's WPIE is a per-tab
			// snapshot - kits created or edited after boot only live on
			// window.WPIE (the kits dialog reassigns that property).
			const kits = window.WPIE?.brandKits || editor.WPIE?.brandKits || [];
			ctx.brand =
				kits.find( ( k ) => k.id === editor.state.doc.brandKitId ) ||
				editor.WPIE?.brand ||
				{};
			if ( onPick ) {
				// Picker mode (v1.77): the caller consumes the post, no
				// preview state is touched.
				onPick( { id: item.id, title: item.title, ctx } );
			} else {
				editor.dispatch( {
					type: 'SET_PREVIEW_POST',
					post: { id: item.id, title: item.title, ctx },
				} );
			}
			onClose();
		} catch ( err ) {
			extras?.toasts?.error(
				err?.message || __( 'Could not load the post.', 'wunderpaint' )
			);
			setBusy( 0 );
		}
	};

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="stock-dialog post-picker"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Preview with Post', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ heading ||
									__( 'Preview with Post', 'wunderpaint' ) }
							</span>
							<HelpLink
								article="dynamic-templates"
								extras={ extras }
							/>
						</div>
						<div className="dsm-sub">
							{ subheading ||
								__(
									'Previews the design with a real post; nothing is changed.',
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
				<div className="dsm-body">
					{ kitList.length > 1 && (
						<div className="post-picker-kitrow">
							<span className="dsm-label">
								{ __( 'Brand Kit', 'wunderpaint' ) }
							</span>
							<select
								className="dsm-select"
								value={ docKit?.id || '' }
								onChange={ ( e ) =>
									assignBrandKitOp( editor, e.target.value )
								}
							>
								{ kitList.map( ( k ) => (
									<option key={ k.id } value={ k.id }>
										{ k.name }
									</option>
								) ) }
							</select>
						</div>
					) }
					{ types.length > 1 && (
						<select
							className="dsm-select"
							value={ type }
							onChange={ ( e ) => setType( e.target.value ) }
						>
							{ types.map( ( t ) => (
								<option key={ t.id } value={ t.id }>
									{ t.label }
								</option>
							) ) }
						</select>
					) }
					<input
						type="search"
						className="dsm-input post-picker-search"
						// eslint-disable-next-line jsx-a11y/no-autofocus
						autoFocus
						placeholder={ __(
							'Search posts by title…',
							'wunderpaint'
						) }
						value={ q }
						onChange={ ( e ) => setQ( e.target.value ) }
						onKeyDown={ ( e ) => {
							e.stopPropagation();
							if ( 'Enter' === e.key && items?.length ) {
								pick( items[ 0 ] );
							}
						} }
					/>
					<div className="post-picker-list">
						{ null === items && (
							<div className="post-picker-empty">
								{ __( 'Loading…', 'wunderpaint' ) }
							</div>
						) }
						{ items && ! items.length && (
							<div className="post-picker-empty">
								{ __( 'No posts found.', 'wunderpaint' ) }
							</div>
						) }
						{ ( items || [] ).map( ( item ) => (
							<button
								key={ item.id }
								className="post-picker-row"
								disabled={ !! busy }
								onClick={ () => pick( item ) }
							>
								{ item.thumb ? (
									<img src={ item.thumb } alt="" />
								) : (
									<span className="post-picker-thumb" />
								) }
								<span className="post-picker-title">
									{ item.title ||
										__( '(no title)', 'wunderpaint' ) }
								</span>
								<span className="post-picker-meta">
									{ [ item.date, ( item.cats || [] )[ 0 ] ]
										.filter( Boolean )
										.join( ' · ' ) }
								</span>
							</button>
						) ) }
					</div>
				</div>
			</div>
		</div>
	);
}
