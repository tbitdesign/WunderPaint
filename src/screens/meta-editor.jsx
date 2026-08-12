/**
 * Per-image detail editor (v1.192.0), shared by the Alt Text Assistant and the
 * Media Library Manager. A wide two-column modal: the left column shows the
 * preview plus every read-only detail the library knows about the file
 * (dimensions, size, format, upload date, colors, URL); the right column edits
 * what can be edited (title, alt, caption, description and tags), by hand or
 * with a single AI suggestion. Text saves via the core REST media endpoint,
 * tags via the manager assign endpoint (creating new tags on the fly).
 */

import { useState, useEffect } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEscape } from '../components/use-escape';
import { useEditor } from '../store/editor-context';
import { isModelInstalled } from '../lib/ml';
import { updateMedia, getMediaMeta } from '../lib/api';
import { FIELD_DEFS, toDataUrl, captionOne } from '../lib/caption-fields';
import { mediaLib, ensureTagIds } from '../lib/media-library';
import { COLOR_SWATCH } from '../lib/image-colors';
import { UsagePanel, CreditsPanel } from './usage-panel';
import { MetadataPanel } from './metadata-panel';
import { ReplaceDialog } from './replace-dialog';
import { RecropDialog } from './recrop-dialog';

/** Human-readable byte size. */
function fmtSize( b ) {
	if ( ! b ) {
		return '';
	}
	if ( b >= 1048576 ) {
		return ( b / 1048576 ).toFixed( 1 ) + ' MB';
	}
	if ( b >= 1024 ) {
		return Math.round( b / 1024 ) + ' KB';
	}
	return b + ' B';
}

/** Localized date from an ISO string. */
function fmtDate( iso ) {
	if ( ! iso ) {
		return '';
	}
	try {
		return new Date( iso ).toLocaleString();
	} catch ( e ) {
		return iso;
	}
}

export function MetaEditor( {
	id,
	engine,
	lang,
	onClose,
	onSaved,
	onTagsChanged,
	onReplaced,
	toasts,
} ) {
	const [ replaceOpen, setReplaceOpen ] = useState( false );
	const [ recropOpen, setRecropOpen ] = useState( false );
	const [ leftTab, setLeftTab ] = useState( 'details' );
	const { WPIE } = useEditor();
	const providers = WPIE.providers || {};
	// Cloud first: the local model only writes descriptive text (no title or
	// tags), so a provider is the better default for "Generate metadata".
	const engineOpts = [
		providers.anthropic && { id: 'anthropic', label: 'Anthropic (Claude)' },
		providers.openai && { id: 'openai', label: 'OpenAI' },
		providers.gemini && { id: 'gemini', label: 'Google Gemini' },
		isModelInstalled( 'caption' ) && {
			id: 'local',
			label: __( 'Local model', 'wunderpaint' ),
		},
	].filter( Boolean );
	const [ chosenEngine, setChosenEngine ] = useState(
		engineOpts[ 0 ]?.id || engine || 'local'
	);

	const [ meta, setMeta ] = useState( null );
	const [ vals, setVals ] = useState( {
		title: '',
		alt: '',
		caption: '',
		description: '',
	} );
	const [ allTags, setAllTags ] = useState( [] );
	const [ tagList, setTagList ] = useState( [] ); // [{ id?, name }]
	const [ origIds, setOrigIds ] = useState( [] );
	const [ colors, setColors ] = useState( [] );
	const [ tagInput, setTagInput ] = useState( '' );
	const [ busy, setBusy ] = useState( true );
	const [ ai0, setAi0 ] = useState( false );
	useEscape( onClose );

	useEffect( () => {
		let cancelled = false;
		( async () => {
			const [ m, list, page ] = await Promise.all( [
				getMediaMeta( id ),
				mediaLib.tags.list().catch( () => ( { items: [] } ) ),
				mediaLib
					.items( { ids: [ id ], per: 1 } )
					.catch( () => ( { items: [] } ) ),
			] );
			if ( cancelled ) {
				return;
			}
			setMeta( m );
			if ( m ) {
				setVals( {
					title: m.title || '',
					alt: m.alt || '',
					caption: m.caption || '',
					description: m.description || '',
				} );
			}
			const tags = list.items || [];
			setAllTags( tags );
			const row = ( page.items && page.items[ 0 ] ) || {};
			setColors( row.colors || [] );
			const mineIds = row.tags || [];
			setOrigIds( mineIds );
			const byId = new Map( tags.map( ( t ) => [ t.id, t.name ] ) );
			setTagList(
				mineIds.map( ( tid ) => ( {
					id: tid,
					name: byId.get( tid ) || String( tid ),
				} ) )
			);
			setBusy( false );
		} )();
		return () => {
			cancelled = true;
		};
	}, [ id ] );

	const addTagFromInput = () => {
		const name = tagInput.trim();
		if ( ! name ) {
			return;
		}
		if (
			tagList.some( ( t ) => t.name.toLowerCase() === name.toLowerCase() )
		) {
			setTagInput( '' );
			return;
		}
		const existing = allTags.find(
			( t ) => t.name.toLowerCase() === name.toLowerCase()
		);
		setTagList( ( prev ) => [
			...prev,
			existing ? { id: existing.id, name: existing.name } : { name },
		] );
		setTagInput( '' );
	};

	const removeTag = ( idx ) =>
		setTagList( ( prev ) => prev.filter( ( _, i ) => i !== idx ) );

	const suggest = async () => {
		if ( ! meta ) {
			return;
		}
		setAi0( true );
		try {
			const dataUrl = await toDataUrl( meta.sourceUrl );
			const r = await captionOne( dataUrl, chosenEngine, lang );
			setVals( ( v ) => ( {
				title: r.title || v.title,
				alt: r.alt || v.alt,
				caption: r.caption || v.caption,
				description: r.description || v.description,
			} ) );
			const names = [ ...( r.tags || [] ) ];
			if ( r.mood ) {
				names.push( r.mood );
			}
			if ( names.length ) {
				setTagList( ( prev ) => {
					const have = new Set(
						prev.map( ( t ) => t.name.toLowerCase() )
					);
					const add = names
						.map( ( n ) => ( n || '' ).trim() )
						.filter( ( n ) => n && ! have.has( n.toLowerCase() ) )
						.map( ( n ) => {
							const ex = allTags.find(
								( t ) =>
									t.name.toLowerCase() === n.toLowerCase()
							);
							return ex
								? { id: ex.id, name: ex.name }
								: { name: n };
						} );
					return [ ...prev, ...add ];
				} );
			}
		} catch ( err ) {
			toasts.error( err.message );
		}
		setAi0( false );
	};

	const save = async () => {
		setBusy( true );
		try {
			await updateMedia( id, vals );
			onSaved( id, vals );
			const withIds = tagList
				.filter( ( t ) => t.id )
				.map( ( t ) => t.id );
			const newNames = tagList
				.filter( ( t ) => ! t.id )
				.map( ( t ) => t.name );
			const created = newNames.length
				? await ensureTagIds( newNames )
				: [];
			const desired = [ ...new Set( [ ...withIds, ...created ] ) ];
			const orig = new Set( origIds );
			const addTags = desired.filter( ( t ) => ! orig.has( t ) );
			const removeTags = origIds.filter(
				( t ) => ! desired.includes( t )
			);
			if ( addTags.length || removeTags.length ) {
				await mediaLib.assign( { ids: [ id ], addTags, removeTags } );
				if ( onTagsChanged ) {
					onTagsChanged();
				}
			}
			onClose();
		} catch ( err ) {
			toasts.error( err.message );
			setBusy( false );
		}
	};

	const copyUrl = () => {
		if ( ! meta?.sourceUrl ) {
			return;
		}
		try {
			window.navigator.clipboard.writeText( meta.sourceUrl );
			toasts.success( __( 'URL copied.', 'wunderpaint' ) );
		} catch ( e ) {}
	};

	const detail = ( label, value ) =>
		value ? (
			<div className="wpie-me-row">
				<dt>{ label }</dt>
				<dd>{ value }</dd>
			</div>
		) : null;

	return (
		<div
			className="wpie-alt-editwrap"
			onClick={ onClose }
			role="presentation"
		>
			<div
				className="wpie-me-modal"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.image( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<span className="dsm-title">
							{ vals.title ||
								sprintf(
									/* translators: %d: id */ __(
										'Image #%d',
										'wunderpaint'
									),
									id
								) }
						</span>
						<div className="dsm-sub">
							{ __(
								'Edit what this image says about itself, see where it is used, and record where it came from.',
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

				{ busy && ! meta ? (
					<div style={ { padding: 40, textAlign: 'center' } }>
						<span className="spin" />
					</div>
				) : (
					<div className="wpie-me-body">
						{ /* ---- left: preview + read-only details ---- */ }
						<div className="wpie-me-left">
							{ meta && (
								<img
									className="wpie-me-preview"
									src={ meta.sourceUrl }
									alt=""
								/>
							) }
							{ meta && (
								<button
									className="wpie-mlm-link-btn wpie-me-replace"
									onClick={ () => setReplaceOpen( true ) }
								>
									{ I.swap( { size: 14 } ) }{ ' ' }
									{ __( 'Replace image', 'wunderpaint' ) }
								</button>
							) }
							{ meta && (
								<button
									className="wpie-mlm-link-btn wpie-me-replace"
									onClick={ () => setRecropOpen( true ) }
								>
									{ I.crop( { size: 14 } ) }{ ' ' }
									{ __( 'Recrop thumbnails', 'wunderpaint' ) }
								</button>
							) }
							<div className="wpie-me-tabs">
								{ [
									[
										'details',
										__( 'Details', 'wunderpaint' ),
									],
									[ 'usage', __( 'Usage', 'wunderpaint' ) ],
									[ 'origin', __( 'Origin', 'wunderpaint' ) ],
									// Details describes the image, this tab
									// describes the FILE (v1.401.0).
									[
										'file',
										__( 'File data', 'wunderpaint' ),
									],
								].map( ( [ key, label ] ) => (
									<button
										key={ key }
										className={
											'wpie-me-tab' +
											( leftTab === key ? ' active' : '' )
										}
										onClick={ () => setLeftTab( key ) }
									>
										{ label }
									</button>
								) ) }
							</div>

							{ 'details' === leftTab && (
								<>
									<dl className="wpie-me-details">
										{ detail(
											__( 'Dimensions', 'wunderpaint' ),
											meta?.width && meta?.height
												? `${ meta.width } x ${ meta.height } px`
												: ''
										) }
										{ detail(
											__( 'File size', 'wunderpaint' ),
											fmtSize( meta?.filesize )
										) }
										{ detail(
											__( 'Format', 'wunderpaint' ),
											( meta?.mime || '' )
												.split( '/' )
												.pop()
												?.replace( '+xml', '' )
												.toUpperCase()
										) }
										{ detail(
											__( 'Uploaded', 'wunderpaint' ),
											fmtDate( meta?.date )
										) }
										{ detail(
											__( 'File name', 'wunderpaint' ),
											meta?.filename
										) }
										{ colors.length > 0 && (
											<div className="wpie-me-row">
												<dt>
													{ __(
														'Colors',
														'wunderpaint'
													) }
												</dt>
												<dd>
													<span className="wpie-me-colors">
														{ colors.map( ( c ) => (
															<span
																key={ c }
																className="sw"
																style={ {
																	background:
																		COLOR_SWATCH[
																			c
																		] ||
																		'#888',
																} }
																title={ c }
															/>
														) ) }
													</span>
												</dd>
											</div>
										) }
									</dl>
									{ meta?.sourceUrl && (
										<div className="wpie-me-url">
											<input
												readOnly
												value={ meta.sourceUrl }
												onFocus={ ( e ) =>
													e.target.select()
												}
											/>
											<button
												className="ai-btn secondary sm"
												onClick={ copyUrl }
											>
												{ __( 'Copy', 'wunderpaint' ) }
											</button>
										</div>
									) }
								</>
							) }

							{ 'usage' === leftTab && (
								<UsagePanel id={ id } bare />
							) }
							{ 'origin' === leftTab && (
								<CreditsPanel id={ id } bare />
							) }
							{ 'file' === leftTab && (
								<MetadataPanel id={ id } bare />
							) }
						</div>

						{ /* ---- right: editable fields + tags ---- */ }
						<div className="wpie-me-right">
							{ FIELD_DEFS.map( ( f ) => (
								<label key={ f.key } className="wpie-alt-field">
									<span>{ f.label }</span>
									{ 'description' === f.key ? (
										<textarea
											rows={ 3 }
											value={ vals[ f.key ] }
											onChange={ ( e ) =>
												setVals( ( v ) => ( {
													...v,
													[ f.key ]: e.target.value,
												} ) )
											}
										/>
									) : (
										<input
											value={ vals[ f.key ] }
											onChange={ ( e ) =>
												setVals( ( v ) => ( {
													...v,
													[ f.key ]: e.target.value,
												} ) )
											}
										/>
									) }
								</label>
							) ) }

							<div className="wpie-alt-field">
								<span>{ __( 'Tags', 'wunderpaint' ) }</span>
								{ tagList.length > 0 && (
									<div className="wpie-me-tags">
										{ tagList.map( ( t, i ) => (
											<span
												key={ t.id || 'n' + i }
												className="wpie-mlm-chip"
											>
												<span className="lbl">
													{ t.name }
												</span>
												<button
													className="x"
													onClick={ () =>
														removeTag( i )
													}
													aria-label={ __(
														'Remove',
														'wunderpaint'
													) }
												>
													{ I.close( { size: 11 } ) }
												</button>
											</span>
										) ) }
									</div>
								) }
								<input
									list="wpie-me-taglist"
									value={ tagInput }
									placeholder={ __(
										'Add a tag and press Enter',
										'wunderpaint'
									) }
									onChange={ ( e ) =>
										setTagInput( e.target.value )
									}
									onKeyDown={ ( e ) => {
										if ( 'Enter' === e.key ) {
											e.preventDefault();
											addTagFromInput();
										}
									} }
								/>
								<datalist id="wpie-me-taglist">
									{ allTags.map( ( t ) => (
										<option key={ t.id } value={ t.name } />
									) ) }
								</datalist>
							</div>
						</div>
					</div>
				) }

				{ !! meta && (
					<div className="dsm-foot">
						<span className="dsm-mono">
							{ meta?.filename || '' }
						</span>
						<div className="dsm-actions">
							{ engineOpts.length > 1 && (
								<select
									className="dsm-select sm"
									value={ chosenEngine }
									onChange={ ( e ) =>
										setChosenEngine( e.target.value )
									}
									title={ __(
										'Engine for Generate metadata',
										'wunderpaint'
									) }
								>
									{ engineOpts.map( ( o ) => (
										<option key={ o.id } value={ o.id }>
											{ o.label }
										</option>
									) ) }
								</select>
							) }
							<button
								className="ai-btn secondary"
								onClick={ suggest }
								disabled={
									ai0 || busy || ! meta || ! engineOpts.length
								}
							>
								{ ai0 && <span className="spin" /> }
								{ __( 'Generate metadata', 'wunderpaint' ) }
							</button>
							<button
								className="ai-btn primary"
								onClick={ save }
								disabled={ busy }
							>
								{ __( 'Save', 'wunderpaint' ) }
							</button>
						</div>
					</div>
				) }
			</div>
			{ recropOpen && meta && (
				<RecropDialog
					id={ id }
					toasts={ toasts }
					onClose={ () => setRecropOpen( false ) }
				/>
			) }
			{ replaceOpen && meta && (
				<ReplaceDialog
					id={ id }
					current={ {
						url: meta.sourceUrl,
						w: meta.width,
						h: meta.height,
						size: meta.filesize,
					} }
					toasts={ toasts }
					onClose={ () => setReplaceOpen( false ) }
					onDone={ () => {
						setReplaceOpen( false );
						onReplaced?.( id );
						onClose?.();
					} }
				/>
			) }
		</div>
	);
}
