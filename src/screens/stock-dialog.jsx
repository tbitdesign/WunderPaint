/**
 * Stock image search (v0.3): Pexels/Pixabay via the server proxy.
 * Results insert as image layers (data URL, nothing touches the media
 * library until save), fitted and centered like File → Open/Place.
 */

import {
	useState,
	useRef,
	useEffect,
	createInterpolateElement,
} from '@wordpress/element';
import { HelpLink } from './help-dialog';
import { useEscape } from '../components/use-escape';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { makeImage, loadImage } from '../store/document';
import { useEditor } from '../store/editor-context';
import { stock } from '../lib/api';
import { PHOTO_CATEGORIES, usePhotoCatThumbs } from '../lib/stock-categories';

const FALLBACK_LABELS = { pexels: 'Pexels', pixabay: 'Pixabay' };

/**
 * Where the provider half of a credit links to.
 *
 * Unsplash wants every link back to carry its referral marker; the server
 * already appends it to the two links it hands out, and this one is built
 * here, so it does the same. An unknown provider gets no link at all rather
 * than a guessed address.
 *
 * @param {string} id Provider slug.
 * @return {string} Absolute URL, empty for an unknown provider.
 */
const providerHome = ( id ) => {
	if ( 'unsplash' === id ) {
		return 'https://unsplash.com/?utm_source=wunderpaint&utm_medium=referral';
	}
	if ( 'pexels' === id ) {
		return 'https://www.pexels.com/';
	}
	if ( 'pixabay' === id ) {
		return 'https://pixabay.com/';
	}
	return '';
};

export function StockDialog( { onClose, extras } ) {
	useEscape( onClose );
	const editor = useEditor();
	const { state, dispatch, commit, WPIE } = editor;
	const labelFor = ( id ) =>
		WPIE.stockLabels?.[ id ] || FALLBACK_LABELS[ id ] || id;
	const configured = Object.keys( WPIE.stock || {} ).filter(
		( id ) => WPIE.stock[ id ]
	);
	const [ provider, setProvider ] = useState( configured[ 0 ] || 'pexels' );
	// Pixabay also serves illustrations and vector graphics (v1.109.0).
	const [ type, setType ] = useState( 'photo' );
	const [ query, setQuery ] = useState( '' );
	const [ results, setResults ] = useState( [] );
	const [ total, setTotal ] = useState( 0 );
	const [ page, setPage ] = useState( 1 );
	const [ busy, setBusy ] = useState( false );
	const [ inserting, setInserting ] = useState( null );
	const inputRef = useRef( null );
	// The scrolling results grid; the auto-fill effect below reads it.
	// v1.63.1 shipped that effect WITHOUT this ref - a ReferenceError that
	// crashed the whole dialog the moment it mounted.
	const gridRef = useRef( null );

	useEffect( () => inputRef.current?.focus(), [] );

	// Category cards fill the empty state so the dialog is not bare on open;
	// a card runs the search for its term (v1.291.5). The thumbnail cache is
	// shared with the tray's Photos section.
	const catThumbs = usePhotoCatThumbs(
		configured.length && ! query.trim() ? provider : null,
		'pixabay' === provider ? type : 'photo'
	);
	const runSearch = async ( nextPage = 1, term = query ) => {
		const q = ( term || '' ).trim();
		if ( ! q || busy ) {
			return;
		}
		setBusy( true );
		try {
			const data = await stock.search(
				provider,
				q,
				nextPage,
				'pixabay' === provider ? type : 'photo'
			);
			setResults(
				1 === nextPage
					? data.results
					: ( prev ) => [ ...prev, ...data.results ]
			);
			setTotal( data.total );
			setPage( nextPage );
		} catch ( err ) {
			extras.toasts.error(
				err.message,
				err.status === 409
					? {
							linkText: __( 'Settings', 'wunderpaint' ),
							linkHref: WPIE.settingsUrl,
					  }
					: {}
			);
		}
		setBusy( false );
	};

	// Auto-fill (v1.63.1): on tall monitors the first page may not overflow
	// the grid, so scrolling (and with it infinite loading) never starts.
	useEffect( () => {
		const el = gridRef.current;
		if (
			el &&
			! busy &&
			results.length > 0 &&
			results.length < total &&
			el.scrollHeight <= el.clientHeight + 40
		) {
			runSearch( page + 1 );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ results ] );

	const insert = async ( item ) => {
		if ( inserting ) {
			return;
		}
		setInserting( item.id );
		try {
			// Putting a photo on the canvas is what Unsplash calls a
			// download, and their guidelines require the event. Sent before
			// the picture is fetched and never awaited: the count is their
			// business, the picture is the visitor's, and one must not wait
			// on the other.
			stock.countDownload( item.downloadLocation );
			const { dataUrl } = await stock.fetch( item.full );
			// crossOrigin always, and it is not a WordPress-versus-studio
			// distinction: in WordPress this is a data URL and the flag is
			// ignored, in the studio it is the provider's own URL and the
			// flag is what keeps the canvas readable. Without it an export
			// would fail later, far away from here, with a security error.
			const img = await loadImage( dataUrl, true );
			const scale = Math.min(
				1,
				( state.doc.w * 0.9 ) / img.naturalWidth,
				( state.doc.h * 0.9 ) / img.naturalHeight
			);
			const w = Math.max( 1, Math.round( img.naturalWidth * scale ) );
			const h = Math.max( 1, Math.round( img.naturalHeight * scale ) );
			const layer = makeImage( {
				name: sprintf(
					/* translators: 1: provider, 2: author. */
					__( '%1$s, %2$s', 'wunderpaint' ),
					labelFor( provider ),
					item.author || 'stock'
				),
				x: Math.round( state.doc.w / 2 - w / 2 ),
				y: Math.round( state.doc.h / 2 - h / 2 ),
				w,
				h,
				src: dataUrl,
				naturalW: img.naturalWidth,
				naturalH: img.naturalHeight,
			} );
			dispatch( { type: 'ADD_LAYER', layer } );
			commit( __( 'Insert stock image', 'wunderpaint' ) );
			onClose();
		} catch ( err ) {
			extras.toasts.error( err.message );
		}
		setInserting( null );
	};

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="stock-dialog"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Stock Images', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Stock Images', 'wunderpaint' ) }
							</span>
							<HelpLink article="stock" extras={ extras } />
						</div>
						<div className="dsm-sub">
							{ sprintf(
								/* translators: %s: list of configured stock providers. */
								__(
									'Free photos from %s, inserted as layers.',
									'wunderpaint'
								),
								( configured.length
									? configured
									: [ 'pexels', 'pixabay', 'unsplash' ]
								)
									.map( labelFor )
									.join( ' · ' )
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

				{ 0 === configured.length ? (
					<div className="stock-empty">
						<p>
							{ __(
								'No stock provider is configured yet. Add a free Pexels or Pixabay API key in the plugin settings.',
								'wunderpaint'
							) }
						</p>
						{ WPIE.canManage && (
							<a
								className="ai-btn primary"
								href={ WPIE.settingsUrl }
								target="_blank"
								rel="noreferrer"
							>
								{ __( 'Open Settings', 'wunderpaint' ) }
							</a>
						) }
					</div>
				) : (
					<>
						<div className="stock-toolbar">
							<div className="seg">
								{ configured.map( ( id ) => (
									<button
										key={ id }
										className={
											provider === id ? 'active' : ''
										}
										onClick={ () => {
											setProvider( id );
											setResults( [] );
											setTotal( 0 );
										} }
									>
										{ labelFor( id ) }
									</button>
								) ) }
							</div>
							{ 'pixabay' === provider && (
								<div className="seg">
									{ [
										[
											'photo',
											__( 'Photos', 'wunderpaint' ),
										],
										[
											'illustration',
											__(
												'Illustrations',
												'wunderpaint'
											),
										],
										[
											'vector',
											__( 'Vectors', 'wunderpaint' ),
										],
									].map( ( [ id, label ] ) => (
										<button
											key={ id }
											className={
												type === id ? 'active' : ''
											}
											onClick={ () => {
												setType( id );
												setResults( [] );
												setTotal( 0 );
											} }
										>
											{ label }
										</button>
									) ) }
								</div>
							) }
							<input
								ref={ inputRef }
								type="search"
								placeholder={ __(
									'Search free photos…',
									'wunderpaint'
								) }
								value={ query }
								onChange={ ( e ) => setQuery( e.target.value ) }
								onKeyDown={ ( e ) =>
									'Enter' === e.key && runSearch( 1 )
								}
							/>
							<button
								className="ai-btn primary"
								disabled={ busy || ! query.trim() }
								onClick={ () => runSearch( 1 ) }
							>
								{ busy
									? __( 'Searching…', 'wunderpaint' )
									: __( 'Search', 'wunderpaint' ) }
							</button>
						</div>

						<div
							className="stock-grid-wrap"
							ref={ gridRef }
							onScroll={ ( e ) => {
								const el = e.currentTarget;
								if (
									! busy &&
									results.length > 0 &&
									results.length < total &&
									el.scrollTop + el.clientHeight >
										el.scrollHeight - 400
								) {
									runSearch( page + 1 );
								}
							} }
						>
							{ 0 === results.length &&
								! busy &&
								( query.trim() ? (
									<div className="stock-empty">
										<p>
											{ __(
												'No results. Try another search term.',
												'wunderpaint'
											) }
										</p>
									</div>
								) : (
									<div className="stock-cats">
										{ PHOTO_CATEGORIES.map( ( c ) => (
											<button
												key={ c.q }
												type="button"
												className="stock-cat"
												onClick={ () => {
													setQuery( c.q );
													runSearch( 1, c.q );
												} }
											>
												{ catThumbs[ c.q ] ? (
													<img
														src={ catThumbs[ c.q ] }
														alt=""
														loading="lazy"
													/>
												) : (
													<span className="stock-cat-ph" />
												) }
												<span className="stock-cat-name">
													{ c.label }
												</span>
											</button>
										) ) }
									</div>
								) ) }
							<div className="stock-grid">
								{ results.map( ( item ) => (
									<figure
										key={ item.id }
										className={
											inserting === item.id
												? 'inserting'
												: ''
										}
									>
										<button
											onClick={ () => insert( item ) }
											disabled={ !! inserting }
											title={ __(
												'Insert as layer',
												'wunderpaint'
											) }
										>
											<img
												src={ item.thumb }
												alt={ item.author }
												loading="lazy"
											/>
										</button>
										{ /* "Photo by <name> on <provider>", both
										     parts linked. Unsplash asks for
										     exactly this and for the name to
										     lead to the photographer's
										     PROFILE, not to the picture;
										     Pexels asks for the same credit.
										     authorUrl falls back to the photo
										     page for anything that has no
										     profile to point at. */ }
										<figcaption>
											{ createInterpolateElement(
												sprintf(
													/* translators: 1: photographer, 2: provider name. */
													__(
														'Photo by <a>%1$s</a> on <p>%2$s</p>',
														'wunderpaint'
													),
													item.author ||
														__(
															'an unnamed photographer',
															'wunderpaint'
														),
													labelFor( provider )
												),
												{
													/* Both anchors are empty on
													   purpose: they are the
													   templates that
													   createInterpolateElement
													   fills with the name and
													   the provider. The rule
													   below cannot see that
													   and reports them as
													   contentless links. */
													a: (
														// eslint-disable-next-line jsx-a11y/anchor-has-content
														<a
															href={
																item.authorUrl ||
																item.link
															}
															target="_blank"
															rel="noreferrer"
														/>
													),
													p: (
														// eslint-disable-next-line jsx-a11y/anchor-has-content
														<a
															href={ providerHome(
																provider
															) }
															target="_blank"
															rel="noreferrer"
														/>
													),
												}
											) }
										</figcaption>
									</figure>
								) ) }
							</div>
							{ results.length > 0 && results.length < total && (
								<div className="stock-more">
									<button
										className="ai-btn secondary"
										disabled={ busy }
										onClick={ () => runSearch( page + 1 ) }
									>
										{ busy
											? __( 'Loading…', 'wunderpaint' )
											: __( 'Load more', 'wunderpaint' ) }
									</button>
								</div>
							) }
						</div>
					</>
				) }
			</div>
		</div>
	);
}
