/**
 * Create-new dialog (spec 07.1), preset sidebar, blank/AI tabs, live
 * preview, unit conversion; ported 1:1 from the prototype and fully wired.
 */

import { useState, useEffect, useRef, useId } from '@wordpress/element';
import { HelpLink } from './help-dialog';
import { useEscape } from '../components/use-escape';
import { SwatchButton } from '../components/color-popover';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { PRESETS } from '../store/constants';
import {
	createBlankDoc,
	makeImage,
	loadImage,
	hydrateLayers,
} from '../store/document';
import { useEditor } from '../store/editor-context';
import { ai, templates as templatesApi } from '../lib/api';
import { PROVIDER_LABELS } from '../lib/providers';
import { useTemplates } from '../content/use-content';
import { StarterPreview, TemplateFilterBar } from './library-dialog';
import { filterTemplates } from '../content/template-filter';
import { mergeTemplateCategories } from '../content/template-categories';
import { useExtensionTemplatePacks } from '../components/use-extension-packs';

const UNITS = { px: 1, in: null, cm: null }; // converted via DPI

const toPx = ( value, unit, dpi ) =>
	'in' === unit
		? value * dpi
		: 'cm' === unit
		? ( value * dpi ) / 2.54
		: value;
const fromPx = ( px, unit, dpi ) =>
	'in' === unit ? px / dpi : 'cm' === unit ? ( px * 2.54 ) / dpi : px;

const STYLE_CHIPS = [
	'Photorealistic',
	'Minimal',
	'Vintage',
	'3D Render',
	'Watercolor',
	'Flat Illustration',
	'Cinematic',
];

// Browser canvas limits: ~16384 px per side in Chromium/Firefox, less in
// Safari. Block before the stage silently breaks; warn earlier because
// full-resolution editing gets slow long before the hard wall.
const WARN_DOC_DIM = 8000;
const MAX_DOC_DIM = 16000;

export function CreateDialog( { onClose, extras, welcome = false } ) {
	// Unique per mounted dialog, so two of them can never share an id.
	const fieldId = useId();
	// Welcome mode is a start screen: no Escape, no backdrop close, no
	// X - the user names the document and picks a size first (v1.107.5).
	useEscape( () => ! welcome && onClose() );
	const editor = useEditor();
	const { dispatch, WPIE } = editor;
	const [ tab, setTab ] = useState( 'blank' );
	const [ preset, setPreset ] = useState( 'ig-square' );
	// Document name (v1.107.2): picking a preset suggests its label until
	// the user types a name of their own.
	const [ docName, setDocName ] = useState( '' );
	const nameTouched = useRef( false );
	const [ w, setW ] = useState( 1080 );
	const [ h, setH ] = useState( 1080 );
	const [ linked, setLinked ] = useState( false );
	const [ unit, setUnit ] = useState( 'px' );
	const [ dpi, setDpi ] = useState( 72 );
	const [ colorMode, setColorMode ] = useState( 'rgb8' );
	const [ bg, setBg ] = useState( 'transparent' );
	const [ customBg, setCustomBg ] = useState( '#f5f1ea' );
	const [ prompt, setPrompt ] = useState( '' );
	const [ provider, setProvider ] = useState(
		WPIE.defaultProvider || 'gemini'
	);
	const [ busy, setBusy ] = useState( false );

	const providers = Object.keys( PROVIDER_LABELS ).filter(
		( id ) => WPIE.providers?.[ id ]
	);
	const aiAvailable = providers.length > 0;

	const selectPreset = ( p ) => {
		setPreset( p.id );
		setW( p.w );
		setH( p.h );
		if ( ! nameTouched.current ) {
			setDocName( p.label );
		}
	};

	const setWidth = ( value ) => {
		const px = Math.max( 1, Math.round( toPx( value, unit, dpi ) ) );
		if ( linked && w ) {
			setH( Math.max( 1, Math.round( ( px * h ) / w ) ) );
		}
		setW( px );
		setPreset( 'custom' );
	};
	const setHeight = ( value ) => {
		const px = Math.max( 1, Math.round( toPx( value, unit, dpi ) ) );
		if ( linked && h ) {
			setW( Math.max( 1, Math.round( ( px * w ) / h ) ) );
		}
		setH( px );
		setPreset( 'custom' );
	};

	// Fit the preview into its 180px wrap: max 130px tall so the card plus
	// the dimension label below never overflow onto the form (bugfix 0.4.2).
	const pvScale = Math.min( 220 / Math.max( 1, w ), 130 / Math.max( 1, h ) );
	const pvW = Math.max( 24, Math.round( w * pvScale ) );
	const pvH = Math.max( 16, Math.round( h * pvScale ) );
	const effectiveBg = 'custom' === bg ? customBg : bg;
	// Guardrails (v1.130.0): beyond ~16k px per side browser canvases
	// fail silently (blank stage, broken exports); warn well before that.
	const big = w > WARN_DOC_DIM || h > WARN_DOC_DIM;
	const tooBig = w > MAX_DOC_DIM || h > MAX_DOC_DIM;

	const create = async () => {
		// Name: typed (or preset label) > AI prompt start > untitled.
		const name =
			docName.trim() ||
			( 'ai' === tab ? prompt.trim().slice( 0, 48 ) : '' ) ||
			'untitled';
		const doc = createBlankDoc( {
			name,
			w,
			h,
			bg: effectiveBg,
			dpi,
			colorMode,
			isNew: true,
		} );
		// The background color lives on doc.bg alone (v1.153.2), no
		// redundant "Background" shape layer anymore.
		let layers = [];

		if ( 'ai' === tab ) {
			if ( ! prompt.trim() ) {
				extras.toasts.error(
					__(
						'Describe the image you want to generate.',
						'wunderpaint'
					)
				);
				return;
			}
			setBusy( true );
			try {
				const result = await ai.generate( {
					prompt,
					provider,
					size: `${ w }x${ h }`,
				} );
				const src = result.images?.[ 0 ];
				if ( ! src ) {
					throw new Error(
						__( 'The provider returned no image.', 'wunderpaint' )
					);
				}
				const img = await loadImage( src );
				layers = [
					...layers,
					makeImage( {
						name: __( 'AI Generation', 'wunderpaint' ),
						x: 0,
						y: 0,
						w,
						h,
						src,
						naturalW: img.naturalWidth,
						naturalH: img.naturalHeight,
					} ),
				];
			} catch ( err ) {
				setBusy( false );
				extras.toasts.error(
					err.message,
					err.isUnconfigured || err.isAuth
						? {
								linkText: __( 'Settings', 'wunderpaint' ),
								linkHref: WPIE.settingsUrl,
						  }
						: {}
				);
				return;
			}
			setBusy( false );
		}

		// With tabs (v1.107.6) ONLY the welcome start screen loads in
		// place - its stub is the one document that was never asked for.
		// Everything else (File > New from any open document, even an
		// empty transparent one) belongs in its own tab.
		const pristine = welcome;
		if ( ! pristine && extras?.openDocInNewTab?.( { doc, layers } ) ) {
			onClose();
			return;
		}
		dispatch( {
			type: 'LOAD_DOCUMENT',
			doc,
			layers,
			label: __( 'New Document', 'wunderpaint' ),
		} );
		onClose();
	};

	return (
		<div
			className="modal-backdrop"
			style={
				// Welcome mode (v1.98.0): the editor opened without an
				// attachment, so nothing useful sits behind the dialog. A
				// solid, theme-aware stage with the brand mark reads as a
				// start screen instead of a broken editor shining through.
				// Theme-aware (v1.194.1) so light mode gets a light stage that
				// matches the (dark) light-mode logo instead of black-on-black.
				welcome ? { background: 'var(--ed-bg)' } : undefined
			}
			onClick={ welcome ? undefined : onClose }
			role="presentation"
		>
			<div
				className="dsm create-dialog"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Create New Image', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Create New Image', 'wunderpaint' ) }
							</span>
							<HelpLink
								article="getting-started"
								extras={ extras }
							/>
						</div>
						<div className="dsm-sub">
							{ __(
								'Pick a size preset or set your own dimensions, then start editing.',
								'wunderpaint'
							) }
						</div>
					</div>
					{ ! welcome && (
						<button
							className="dsm-close"
							onClick={ onClose }
							aria-label={ __( 'Close', 'wunderpaint' ) }
						>
							{ I.close( { size: 17 } ) }
						</button>
					) }
				</div>
				<div className="create-body">
					<div className="create-sidebar">
						{ PRESETS.map( ( group ) => (
							<div key={ group.group }>
								<div className="preset-group">
									{ group.group }
								</div>
								{ group.items.map( ( p ) => {
									const r = p.w / p.h;
									const sw = r >= 1 ? 22 : 22 * r;
									const sh = r >= 1 ? 22 / r : 22;
									return (
										<div
											key={ p.id }
											className={ `preset-item ${
												preset === p.id ? 'active' : ''
											}` }
											role="button"
											tabIndex={ 0 }
											onClick={ () => selectPreset( p ) }
											onKeyDown={ ( e ) =>
												'Enter' === e.key &&
												selectPreset( p )
											}
										>
											<div
												style={ {
													display: 'grid',
													placeItems: 'center',
												} }
											>
												<div
													className="shape"
													style={ {
														width: sw,
														height: sh,
														borderRadius: 2,
													} }
												/>
											</div>
											<div className="label">
												<b>{ p.label }</b>
												<small>
													{ p.w } × { p.h }
												</small>
											</div>
										</div>
									);
								} ) }
							</div>
						) ) }
					</div>
					<div className="create-main">
						<div className="create-tabs">
							<button
								className={ 'blank' === tab ? 'active' : '' }
								onClick={ () => setTab( 'blank' ) }
							>
								{ __( 'Blank Canvas', 'wunderpaint' ) }
							</button>
							<button
								className={ 'ai' === tab ? 'active' : '' }
								onClick={ () => setTab( 'ai' ) }
							>
								{ __( 'Generate with AI', 'wunderpaint' ) }
							</button>
							<button
								className={
									'templates' === tab ? 'active' : ''
								}
								onClick={ () => setTab( 'templates' ) }
							>
								{ __( 'Templates', 'wunderpaint' ) }
							</button>
						</div>
						{ 'templates' === tab ? (
							<CreateTemplatesTab
								editor={ editor }
								extras={ extras }
								onClose={ onClose }
								welcome={ welcome }
							/>
						) : 'blank' === tab ? (
							<div className="create-form">
								<div
									className="create-preview-wrap"
									data-dim={ `${ w } × ${ h } px` }
								>
									<div
										className="preview-card"
										style={ {
											width: pvW,
											height: pvH,
											backgroundColor:
												'transparent' === effectiveBg
													? 'var(--ed-checker-b)'
													: effectiveBg,
											backgroundImage:
												'transparent' === effectiveBg
													? 'linear-gradient(45deg, var(--ed-checker-a) 25%, transparent 25%, transparent 75%, var(--ed-checker-a) 75%), linear-gradient(45deg, var(--ed-checker-a) 25%, transparent 25%, transparent 75%, var(--ed-checker-a) 75%)'
													: 'none',
											backgroundSize: '16px 16px',
											backgroundPosition: '0 0, 8px 8px',
										} }
									/>
								</div>
								<div className="row">
									<label htmlFor={ fieldId + '-name' }>
										{ __( 'Name', 'wunderpaint' ) }
									</label>
									<input
										id={ fieldId + '-name' }
										type="text"
										value={ docName }
										placeholder={ __(
											'e.g. Summer sale banner',
											'wunderpaint'
										) }
										aria-label={ __(
											'Document name',
											'wunderpaint'
										) }
										onChange={ ( e ) => {
											nameTouched.current =
												'' !== e.target.value.trim();
											setDocName( e.target.value );
										} }
									/>
								</div>
								<div className="row">
									<span
										className="dsm-label"
										id={ fieldId + '-dims' }
									>
										{ __( 'Dimensions', 'wunderpaint' ) }
									</span>
									<div
										className="dims"
										role="group"
										aria-labelledby={ fieldId + '-dims' }
									>
										<input
											type="number"
											value={
												Math.round(
													fromPx( w, unit, dpi ) * 100
												) / 100
											}
											onChange={ ( e ) =>
												setWidth( +e.target.value || 0 )
											}
											aria-label={ __(
												'Width',
												'wunderpaint'
											) }
										/>
										<button
											className={ `link-btn ${
												linked ? 'active' : ''
											}` }
											title={ __(
												'Link aspect ratio',
												'wunderpaint'
											) }
											onClick={ () =>
												setLinked( ! linked )
											}
										>
											{ linked
												? I.link( { size: 14 } )
												: I.unlink( { size: 14 } ) }
										</button>
										<input
											type="number"
											value={
												Math.round(
													fromPx( h, unit, dpi ) * 100
												) / 100
											}
											onChange={ ( e ) =>
												setHeight(
													+e.target.value || 0
												)
											}
											aria-label={ __(
												'Height',
												'wunderpaint'
											) }
										/>
										<select
											className="dsm-select lg"
											value={ unit }
											style={ { width: 60 } }
											onChange={ ( e ) =>
												setUnit( e.target.value )
											}
										>
											{ Object.keys( UNITS ).map(
												( u ) => (
													<option
														key={ u }
														value={ u }
													>
														{ u }
													</option>
												)
											) }
										</select>
									</div>
								</div>
								<div className="row">
									<label htmlFor={ fieldId + '-dpi' }>
										{ __( 'Resolution', 'wunderpaint' ) }
									</label>
									<select
										id={ fieldId + '-dpi' }
										className="dsm-select lg"
										value={ dpi }
										style={ { width: 160 } }
										onChange={ ( e ) =>
											setDpi( +e.target.value )
										}
									>
										<option value={ 72 }>
											{ __(
												'72 DPI (Screen)',
												'wunderpaint'
											) }
										</option>
										<option value={ 150 }>150 DPI</option>
										<option value={ 300 }>
											{ __(
												'300 DPI (Print)',
												'wunderpaint'
											) }
										</option>
									</select>
								</div>
								<div className="row">
									<label htmlFor={ fieldId + '-mode' }>
										{ __( 'Color Mode', 'wunderpaint' ) }
									</label>
									<select
										id={ fieldId + '-mode' }
										className="dsm-select lg"
										value={ colorMode }
										style={ { width: 160 } }
										onChange={ ( e ) =>
											setColorMode( e.target.value )
										}
									>
										<option value="rgb8">RGB 8-bit</option>
										<option value="rgb16">
											RGB 16-bit
										</option>
										<option value="cmyk8">
											CMYK 8-bit
										</option>
									</select>
								</div>
								<div className="row">
									<span
										className="dsm-label"
										id={ fieldId + '-bg' }
									>
										{ __( 'Background', 'wunderpaint' ) }
									</span>
									<div
										role="group"
										aria-labelledby={ fieldId + '-bg' }
										style={ {
											display: 'flex',
											gap: 6,
											alignItems: 'center',
										} }
									>
										{ [
											[
												'transparent',
												__(
													'Transparent',
													'wunderpaint'
												),
											],
											[
												'#ffffff',
												__( 'White', 'wunderpaint' ),
											],
											[
												'#000000',
												__( 'Black', 'wunderpaint' ),
											],
											[
												'custom',
												__( 'Custom', 'wunderpaint' ),
											],
										].map( ( [ value, label ] ) => (
											<button
												key={ value }
												onClick={ () => setBg( value ) }
												style={ {
													padding: '6px 10px',
													fontSize: 12,
													border: `1px solid ${
														bg === value
															? 'var(--accent)'
															: 'var(--ed-border-strong)'
													}`,
													background:
														bg === value
															? 'var(--accent-soft)'
															: 'var(--ed-panel-alt)',
													color:
														bg === value
															? 'var(--accent)'
															: 'var(--ed-text)',
													borderRadius: 4,
												} }
											>
												{ label }
											</button>
										) ) }
										{ 'custom' === bg && (
											<SwatchButton
												color={ customBg }
												size={ 30 }
												title={ __(
													'Custom background color',
													'wunderpaint'
												) }
												onChange={ ( v ) =>
													setCustomBg(
														v.slice( 0, 7 )
													)
												}
											/>
										) }
									</div>
								</div>
							</div>
						) : (
							<div className="create-ai">
								<div
									className="row"
									style={ {
										margin: '10px 0',
										display: 'grid',
										gridTemplateColumns: '100px 1fr',
										gap: 12,
										alignItems: 'center',
									} }
								>
									<span
										className="dsm-label"
										id={ fieldId + '-model' }
									>
										{ __( 'Model', 'wunderpaint' ) }
									</span>
									<div
										role="group"
										aria-labelledby={ fieldId + '-model' }
										style={ {
											display: 'flex',
											gap: 6,
											flexWrap: 'wrap',
										} }
									>
										{ providers.length ? (
											providers.map( ( id ) => (
												<button
													key={ id }
													className={
														'ai-provider-pill' +
														( provider === id
															? ' active'
															: '' )
													}
													onClick={ () =>
														setProvider( id )
													}
												>
													<span className="dot" />
													{ PROVIDER_LABELS[ id ] }
												</button>
											) )
										) : (
											<span
												style={ {
													fontSize: 12,
													color: 'var(--ed-text-muted)',
												} }
											>
												{ __(
													'No provider configured.',
													'wunderpaint'
												) }{ ' ' }
												<a
													href={ WPIE.settingsUrl }
													target="_blank"
													rel="noreferrer"
													style={ {
														color: 'var(--accent)',
													} }
												>
													{ __(
														'Open Settings',
														'wunderpaint'
													) }
												</a>
											</span>
										) }
									</div>
								</div>
								<textarea
									placeholder={ __(
										'Describe the image you want to create… e.g., “minimal product photo of white sneakers on cream background, soft shadow, studio lighting”',
										'wunderpaint'
									) }
									value={ prompt }
									onChange={ ( e ) =>
										setPrompt( e.target.value )
									}
								/>
								<div className="chips">
									<span
										style={ {
											fontSize: 11,
											color: 'var(--ed-text-muted)',
											alignSelf: 'center',
										} }
									>
										{ __( 'Styles:', 'wunderpaint' ) }
									</span>
									{ STYLE_CHIPS.map( ( style ) => (
										<button
											key={ style }
											onClick={ () =>
												setPrompt( ( p ) =>
													p
														? `${ p }, ${ style.toLowerCase() }`
														: style
												)
											}
										>
											{ style }
										</button>
									) ) }
								</div>
							</div>
						) }
					</div>
				</div>
				<div className="dsm-foot">
					<span className="dsm-mono">
						{ tooBig ? (
							<span style={ { color: 'var(--danger)' } }>
								{ sprintf(
									/* translators: %d: maximum dimension in px. */
									__(
										'Too large: browsers cannot handle canvases beyond %d px per side.',
										'wunderpaint'
									),
									MAX_DOC_DIM
								) }
							</span>
						) : big ? (
							<span
								style={ { color: 'var(--warning, #dba617)' } }
							>
								{ sprintf(
									/* translators: 1: width, 2: height, 3: megabytes. */
									__(
										'Very large canvas: %1$d × %2$d px · ~%3$s MB in memory, editing may get slow.',
										'wunderpaint'
									),
									w,
									h,
									( ( w * h * 4 ) / 1024 / 1024 ).toFixed( 1 )
								) }
							</span>
						) : (
							sprintf(
								/* translators: 1: width, 2: height, 3: megabytes. */
								__(
									'Canvas: %1$d × %2$d px · ~%3$s MB in memory',
									'wunderpaint'
								),
								w,
								h,
								( ( w * h * 4 ) / 1024 / 1024 ).toFixed( 1 )
							)
						) }
					</span>
					<div className="dsm-actions">
						<button className="ai-btn ghost" onClick={ onClose }>
							{ __( 'Cancel', 'wunderpaint' ) }
						</button>
						<button
							className="ai-btn primary"
							disabled={
								busy ||
								tooBig ||
								( 'ai' === tab && ! aiAvailable ) ||
								( 'blank' === tab && ! docName.trim() )
							}
							onClick={ create }
						>
							{ busy && <span className="spin" /> }
							{ 'ai' === tab
								? __( 'Generate & Edit', 'wunderpaint' )
								: __( 'Create & Edit', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function CreateTemplatesTab( { editor, extras, onClose, welcome } ) {
	const STARTER_TEMPLATES = useTemplates();
	// Extension template packs (v1.167.1): the tray and the library
	// modal merge them, the create dialog was the missing surface.
	const packs = useExtensionTemplatePacks();
	const [ list, setList ] = useState( null );
	const [ busy, setBusy ] = useState( false );
	const [ query, setQuery ] = useState( '' );
	const [ cat, setCat ] = useState( '' );

	useEffect( () => {
		templatesApi
			.list()
			.then( setList )
			.catch( () => setList( [] ) );
	}, [] );

	const openStarter = async ( template ) => {
		setBusy( true );
		try {
			const { doc, layers } = await template.build();
			if ( welcome || ! extras?.openDocInNewTab?.( { doc, layers } ) ) {
				editor.dispatch( {
					type: 'LOAD_DOCUMENT',
					doc,
					layers,
					label: __( 'From Template', 'wunderpaint' ),
				} );
			}
			onClose();
		} catch ( err ) {
			extras.toasts.error( err.message );
		}
		setBusy( false );
	};

	const openSaved = async ( t ) => {
		setBusy( true );
		try {
			const project = await templatesApi.load( t.id );
			const layers = await hydrateLayers( project.layers || [] );
			const doc = {
				...project.doc,
				// templateId/templateName: File → Save as Template can
				// then offer updating this template in place (v1.69.3).
				source: {
					...project.doc.source,
					attachmentId: 0,
					isNew: true,
					templateId: t.id,
					templateName: t.name,
				},
			};
			if ( welcome || ! extras?.openDocInNewTab?.( { doc, layers } ) ) {
				editor.dispatch( {
					type: 'LOAD_DOCUMENT',
					doc,
					layers,
					label: __( 'From Template', 'wunderpaint' ),
				} );
			}
			onClose();
		} catch ( err ) {
			extras.toasts.error( err.message );
		}
		setBusy( false );
	};

	// Same filters as the library modal: search over name/copy/palette
	// plus the category dropdown.
	const filters = { q: query, cat };
	const starters = filterTemplates( STARTER_TEMPLATES, filters );
	const packGroups = packs
		.map( ( pack ) => ( {
			...pack,
			templates: filterTemplates( pack.templates, filters ),
		} ) )
		.filter( ( pack ) => pack.templates.length );

	const grid = ( templates ) => (
		<div className="library-tpl-grid">
			{ templates.map( ( template ) => (
				<div key={ template.id } className="library-tpl">
					<button
						className="library-tpl-open"
						onClick={ () => openStarter( template ) }
						disabled={ busy }
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

	return (
		<div
			style={ {
				minHeight: 120,
				display: 'grid',
				gap: 10,
				alignContent: 'start',
			} }
		>
			<div className="library-subhead">
				{ __( 'Starter templates', 'wunderpaint' ) }
			</div>
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
				<div key={ pack.id } style={ { display: 'grid', gap: 10 } }>
					<div className="library-subhead">{ pack.label }</div>
					{ grid( pack.templates ) }
				</div>
			) ) }
			<div className="library-subhead">
				{ __( 'Your templates', 'wunderpaint' ) }
			</div>
			{ null === list && (
				<div
					style={ {
						display: 'flex',
						gap: 8,
						alignItems: 'center',
						color: 'var(--ed-text-muted)',
						fontSize: 12,
					} }
				>
					<span className="spin" />{ ' ' }
					{ __( 'Loading templates…', 'wunderpaint' ) }
				</div>
			) }
			{ list && 0 === list.length && (
				<p
					style={ {
						color: 'var(--ed-text-muted)',
						fontSize: 12,
						margin: 0,
					} }
				>
					{ __(
						'No templates yet. In the editor, use File → “Save as Dynamic Template” to add one.',
						'wunderpaint'
					) }
				</p>
			) }
			{ list && list.length > 0 && (
				<div className="library-tpl-grid">
					{ list.map( ( t ) => (
						<div key={ t.id } className="library-tpl">
							<button
								className="library-tpl-open"
								onClick={ () => openSaved( t ) }
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
										{ __( 'No preview', 'wunderpaint' ) }
									</div>
								) }
								<span className="library-tpl-name">
									{ t.name }
								</span>
							</button>
							<button
								className="library-tpl-del"
								title={ __( 'Delete template', 'wunderpaint' ) }
								aria-label={ __(
									'Delete template',
									'wunderpaint'
								) }
								onClick={ async () => {
									await templatesApi
										.remove( t.id )
										.catch( () => {} );
									setList(
										list.filter( ( x ) => x.id !== t.id )
									);
								} }
							>
								{ I.close( { size: 12 } ) }
							</button>
						</div>
					) ) }
				</div>
			) }
		</div>
	);
}
