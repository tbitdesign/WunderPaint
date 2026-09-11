/**
 * Design Generator (v1.12, named Design Assistant until v1.303, studio
 * layout v1.430): brief in, three finished editable designs out.
 *
 * Three columns like the extension studios: brief, presets and options on
 * the left, the model's designs in the middle, the selected design's
 * checks and direction dials on the right. The model composes in Design
 * Markup (src/lib/design-markup), the compiler builds and checks the
 * layers, and nothing lands on the canvas until the user inserts a card.
 */

import { siteStorage } from '../lib/local-storage';
import { useState, useEffect, useReducer, useRef } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import {
	prepareDesignVariants,
	insertDesignVariant,
	configuredStockProviders,
} from '../lib/design-assistant';
import { kitBrandContext } from '../lib/ai-templates';
import { ensureFontsForLayers } from '../lib/font-manager';
import { renderToCanvas, sharedImageCache } from '../lib/raster';
import { FONT_PAIRINGS } from '../lib/layout-generator';
import { PROVIDER_LABELS } from '../lib/providers';
import {
	tab,
	PRESET_GROUPS,
	EXAMPLE_IDS,
	presetById,
	FORMATS,
	designName,
	designChecks,
} from './design-presets';

// Dynamic-template variables (v1.223.0): each maps a text/image ROLE the
// model produces to a post-field binding. Enabled ones are wired onto the
// composed layers so the design updates per post.
const DYN_VARS = () => [
	{
		key: 'title',
		role: 'headline',
		binding: 'post.title',
		label: __( 'Post title', 'wunderpaint' ),
	},
	{
		key: 'excerpt',
		role: 'subhead',
		binding: 'post.excerpt',
		label: __( 'Post excerpt', 'wunderpaint' ),
	},
	{
		key: 'featured',
		role: 'image',
		binding: 'post.featured',
		label: __( 'Featured image', 'wunderpaint' ),
	},
	{
		key: 'category',
		role: 'kicker',
		binding: 'post.category',
		label: __( 'Category', 'wunderpaint' ),
	},
	{
		key: 'date',
		role: 'meta',
		binding: 'post.date',
		label: __( 'Publish date', 'wunderpaint' ),
	},
];

// Palette intents the compiler knows (design-markup/catalog MOODS), as
// user words. '' keeps what the model chose.
const INTENTS = () => [
	[ 'warm', __( 'Warm', 'wunderpaint' ) ],
	[ 'cool', __( 'Cool', 'wunderpaint' ) ],
	[ 'earthy', __( 'Earthy', 'wunderpaint' ) ],
	[ 'vibrant', __( 'Vibrant', 'wunderpaint' ) ],
	[ 'pastel', __( 'Pastel', 'wunderpaint' ) ],
	[ 'dark', __( 'Dark', 'wunderpaint' ) ],
	[ 'mono', __( 'Monochrome', 'wunderpaint' ) ],
];

// Text providers the design tier can run on, in the server's fallback
// order (AI_Provider::resolve_text_provider). The pick is remembered per
// browser like the AI panel's.
const TEXT_PROVIDERS = [ 'anthropic', 'openai', 'gemini' ];
const PROVIDER_KEY = 'wpie-design-provider';
// Provider names only, never a model id: the model behind each provider
// is set in Settings and changes faster than any label would (Thomas,
// 06.09.2026).
const TEXT_PROVIDER_LABELS = { anthropic: 'Anthropic', ...PROVIDER_LABELS };

// Card previews are rendered once at this size (long side) and reused by
// the history strip; the large view renders again at 1600.
const PREVIEW_PX = 640;
const HISTORY_MAX = 8;

async function previewOf( doc, layers, px ) {
	await ensureFontsForLayers( layers ).catch( () => {} );
	const canvas = await renderToCanvas( doc, layers, {
		scale: Math.min( 1, px / Math.max( doc.w, doc.h ) ),
		cache: sharedImageCache,
	} );
	return canvas.toDataURL( 'image/jpeg', 0.86 );
}

// Collapsible option block; native <details> so it needs no state.
function Fold( { icon, title, open, extra, children } ) {
	return (
		<details className="dgs-fold" open={ open }>
			<summary>
				{ tab( icon, 14 ) }
				<span>{ title }</span>
				{ extra }
				<span className="chev">{ I.chevDown( { size: 12 } ) }</span>
			</summary>
			<div className="dgs-fold-body">{ children }</div>
		</details>
	);
}

export function DesignDialog( { onClose, extras } ) {
	const editor = useEditor();
	const { state } = editor;
	const [ brief, setBrief ] = useState( '' );
	const [ presetId, setPresetId ] = useState( '' );
	const [ details, setDetails ] = useState( {
		brand: '',
		headline: '',
		subhead: '',
		cta: '',
		url: '',
		colors: '',
	} );
	const setField = ( key ) => ( e ) =>
		setDetails( ( d ) => ( { ...d, [ key ]: e.target.value } ) );
	// Re-render (and re-read window.WPIE.brandKits) when the in-editor
	// kit dialog saves (v1.89.0).
	const [ , bumpKits ] = useReducer( ( x ) => x + 1, 0 );
	useEffect( () => {
		window.addEventListener( 'wpie:brand-kits-updated', bumpKits );
		return () =>
			window.removeEventListener( 'wpie:brand-kits-updated', bumpKits );
	}, [] );
	const kits = (
		window.WPIE?.brandKits ||
		state.WPIE?.brandKits ||
		[]
	).filter(
		( k ) => ( k.colors?.length || 0 ) > 0 || ( k.fonts?.length || 0 ) > 0
	);
	const [ kitId, setKitId ] = useState( '' );
	const kit = kits.find( ( k ) => k.id === kitId ) || null;
	const activeLayer = state.layers.find( ( l ) => l.id === state.activeId );
	const canReference =
		activeLayer &&
		[ 'image', 'raster', 'smart' ].includes( activeLayer.type );
	const [ useReference, setUseReference ] = useState( false );
	// Place the kit logo as its own layer after the design (v1.90.0).
	const [ includeLogo, setIncludeLogo ] = useState( true );
	// Image strategy (v1.171.0): placeholder is the free default. When a
	// stock provider is configured, default to real stock photos (v1.198.0)
	// so designs preview with genuine imagery out of the box.
	const stockProviders = configuredStockProviders();
	const [ imageMode, setImageMode ] = useState(
		stockProviders.length ? 'stock' : 'placeholder'
	);
	const [ imagePrompt, setImagePrompt ] = useState( '' );
	// Image-generation providers (OpenAI / Gemini) that are configured.
	const providerFlags = window.WPIE?.providers || state.WPIE?.providers || {};
	const imageProviders = [
		[ 'openai', 'OpenAI' ],
		[ 'gemini', 'Google Gemini' ],
	].filter( ( [ id ] ) => providerFlags[ id ] );
	const [ imgProvider, setImgProvider ] = useState(
		imageProviders[ 0 ]?.[ 0 ] || ''
	);
	// Which model composes (v1.430): '' = the site's default text provider,
	// mirrored here so the option can say which one that is.
	const bootstrap = window.WPIE || state.WPIE || {};
	const textProviders = TEXT_PROVIDERS.filter(
		( id ) => providerFlags[ id ]
	);
	const autoProvider = textProviders.includes( bootstrap.defaultTextProvider )
		? bootstrap.defaultTextProvider
		: textProviders[ 0 ] || '';
	const [ provider, setProvider ] = useState( () => {
		try {
			const v = siteStorage.getItem( PROVIDER_KEY ) || '';
			return textProviders.includes( v ) ? v : '';
		} catch ( e ) {
			return '';
		}
	} );
	const pickProvider = ( id ) => {
		setProvider( id );
		try {
			siteStorage.setItem( PROVIDER_KEY, id );
		} catch ( e ) {
			// Private mode: the pick lives for this dialog only.
		}
	};
	const providerLabel = ( id ) => TEXT_PROVIDER_LABELS[ id ] || id;
	const [ dynamic, setDynamic ] = useState( false );
	const [ dynVars, setDynVars ] = useState( {
		title: true,
		excerpt: true,
		featured: true,
		category: false,
		date: false,
	} );
	const [ status, setStatus ] = useState( null );
	// Generations (v1.430): every run keeps its three designs, the strip
	// under the results switches between them. `variants` is the shown one.
	const [ history, setHistory ] = useState( [] );
	const [ genIdx, setGenIdx ] = useState( -1 );
	const variants = genIdx >= 0 ? history[ genIdx ]?.variants || null : null;
	const [ selected, setSelected ] = useState( 0 );
	const [ zoom, setZoom ] = useState( null );
	// Generation counter (v1.172.2): 0 = first Create (clean, obvious take);
	// each Regenerate increments it and steers the model to a fresh angle.
	const genRef = useRef( 0 );
	const closeOrBack = zoom ? () => setZoom( null ) : onClose;
	useEscape( status ? () => {} : closeOrBack );

	const docEmpty = 0 === state.layers.length;
	const formats = FORMATS();
	const selectFormat = ( f ) => {
		if ( ! docEmpty || status ) {
			return;
		}
		editor.dispatch( { type: 'SET_DOC', doc: { w: f.w, h: f.h } } );
		editor.commit( __( 'Canvas size', 'wunderpaint' ) );
	};

	const pickPreset = ( p ) => {
		setPresetId( p.id );
		setBrief( p.brief );
	};

	const bindingIds = () =>
		dynamic
			? DYN_VARS()
					.filter( ( v ) => dynVars[ v.key ] )
					.map( ( v ) => v.binding )
			: [];

	// Both "Create" and "Regenerate" ask the model for a fresh plan
	// (v1.172.1): every regenerate is a new request, so the copy and the
	// direction genuinely change, not only the composition.
	const run = async () => {
		if ( ! brief.trim() || status ) {
			return;
		}
		const variation = genRef.current;
		genRef.current += 1;
		try {
			let referenceDataUrl;
			if ( useReference && canReference ) {
				const canvas = await renderToCanvas(
					{ ...state.doc, bg: '#ffffff' },
					[ { ...activeLayer, parent: null, opacity: 1 } ],
					{
						viewport: {
							x: activeLayer.x,
							y: activeLayer.y,
							w: Math.max( 1, activeLayer.w ),
							h: Math.max( 1, activeLayer.h ),
						},
						scale: Math.min(
							1,
							768 / Math.max( activeLayer.w, activeLayer.h )
						),
						cache: sharedImageCache,
					}
				);
				referenceDataUrl = canvas.toDataURL( 'image/jpeg', 0.85 );
			}
			const detailParts = [];
			const addDetail = ( label, val ) => {
				const t = String( val || '' ).trim();
				if ( t ) {
					detailParts.push( `${ label }: ${ t }` );
				}
			};
			addDetail( 'Brand', details.brand );
			addDetail( 'Headline', details.headline );
			addDetail( 'Subheadline', details.subhead );
			addDetail( 'Call to action', details.cta );
			addDetail( 'Website', details.url );
			addDetail( 'Brand colours', details.colors );
			const { variants: built } = await prepareDesignVariants(
				editor,
				{
					brief: brief.trim(),
					product: detailParts.join( '. ' ),
					brand: kitBrandContext( kit ),
					kitId: kitId || undefined,
					provider: provider || undefined,
					referenceDataUrl,
					imageMode,
					stockProvider: stockProviders[ 0 ],
					imageProvider: 'ai' === imageMode ? imgProvider : undefined,
					imagePrompt: imagePrompt.trim() || undefined,
					bindings: dynamic
						? DYN_VARS()
								.filter( ( v ) => dynVars[ v.key ] )
								.map( ( v ) => ( {
									role: v.role,
									binding: v.binding,
								} ) )
						: undefined,
					variation,
				},
				setStatus
			);
			setStatus( __( 'Rendering previews…', 'wunderpaint' ) );
			const previews = [];
			for ( const v of built ) {
				previews.push( {
					...v,
					preview: await previewOf( state.doc, v.layers, PREVIEW_PX ),
				} );
			}
			const firstOk = previews.findIndex( ( v ) => 'valid' === v.status );
			setHistory( ( h ) =>
				[ ...h, { brief: brief.trim(), variants: previews } ].slice(
					-HISTORY_MAX
				)
			);
			setGenIdx( ( i ) => Math.min( i + 1, HISTORY_MAX - 1 ) );
			setSelected( Math.max( 0, firstOk ) );
			setStatus( null );
		} catch ( err ) {
			setStatus( null );
			extras.toasts.error(
				err?.message ||
					__(
						'The design assistant failed. Please try again.',
						'wunderpaint'
					)
			);
		}
	};

	const insert = async ( variant ) => {
		if ( status || ! variant ) {
			return;
		}
		try {
			setStatus( __( 'Building layers…', 'wunderpaint' ) );
			const count = await insertDesignVariant( editor, variant.layers, {
				logoUrl: includeLogo && kit?.logoUrl ? kit.logoUrl : undefined,
			} );
			extras.toasts.success(
				dynamic
					? __(
							'Dynamic design created. Bound layers update per post; pick a preview post or save it as a dynamic template.',
							'wunderpaint'
					  )
					: sprintf(
							/* translators: %d: number of layers. */
							__(
								'Design created, %d editable layers added.',
								'wunderpaint'
							),
							count
					  )
			);
			onClose();
		} catch ( err ) {
			setStatus( null );
			extras.toasts.error( err?.message );
		}
	};

	const replaceVariant = ( idx, next ) => {
		setHistory( ( h ) =>
			h.map( ( g, gi ) =>
				gi === genIdx
					? {
							...g,
							variants: g.variants.map( ( x, i ) =>
								i === idx ? next : x
							),
					  }
					: g
			)
		);
	};

	// Direction dials (v1.430): the compiler re-reads the model's markup
	// with a different pairing or palette intent - no model call, a second
	// or two, and the original stays as `source` so "as designed" returns.
	const restyle = async ( patch ) => {
		const v = variants?.[ selected ];
		if ( ! v || status ) {
			return;
		}
		const dir = { ...( v.dir || {} ), ...patch };
		setStatus( __( 'Applying…', 'wunderpaint' ) );
		try {
			const [ { compileDesign }, { contextFromEditor } ] =
				await Promise.all( [
					import(
						/* webpackChunkName: "design-markup" */ '../lib/design-markup/compile'
					),
					import(
						/* webpackChunkName: "design-markup" */ '../lib/design-markup/editor-ctx'
					),
				] );
			const source = v.source || v.markup;
			const tokens = { ...( source.tokens || {} ) };
			if ( dir.intent ) {
				const pal = tokens.palette || {};
				tokens.palette = {
					...pal,
					source: 'custom' === pal.source ? 'intent' : pal.source,
					intent: dir.intent,
				};
			}
			if ( '' !== dir.pairing && undefined !== dir.pairing ) {
				const pairing = FONT_PAIRINGS[ Number( dir.pairing ) ];
				if ( pairing ) {
					tokens.type = { ...( tokens.type || {} ), pairing };
				}
			}
			const markup = { ...source, tokens };
			const ctx = await contextFromEditor( editor, {
				kitId: kitId || undefined,
				bindings: bindingIds().map( ( id ) => ( { id } ) ),
			} );
			const compiled = await compileDesign( markup, ctx );
			const preview = await previewOf(
				state.doc,
				compiled.layers,
				PREVIEW_PX
			);
			replaceVariant( selected, {
				...v,
				source,
				markup,
				layers: compiled.layers,
				status: compiled.status,
				report: compiled.report,
				preview,
				dir,
			} );
		} catch ( err ) {
			extras.toasts.error( err?.message );
		}
		setStatus( null );
	};

	const openZoom = async ( v ) => {
		setZoom( { v, src: v.preview } );
		try {
			const src = await previewOf( state.doc, v.layers, 1600 );
			setZoom( ( z ) => ( z && z.v === v ? { v, src } : z ) );
		} catch ( e ) {
			// The card preview stays as the large view.
		}
	};

	const current = variants?.[ selected ] || null;
	const currentChecks = current ? designChecks( current ) : null;
	const groups = PRESET_GROUPS();
	const examples = EXAMPLE_IDS.map( presetById ).filter( Boolean );
	const busy = !! status;

	const checkRow = ( label, checked, onChange ) => (
		<label className="dgs-checkrow">
			<input
				type="checkbox"
				checked={ checked }
				disabled={ busy }
				onChange={ ( e ) => onChange( e.target.checked ) }
			/>
			{ label }
		</label>
	);

	return (
		<div
			className="modal-backdrop"
			onClick={ busy ? undefined : onClose }
			role="presentation"
		>
			<div
				className="dsm dgs"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-modal="true"
				aria-label={ __( 'Design Generator', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Design Generator', 'wunderpaint' ) }
							</span>
							<HelpLink
								article="design-generator"
								extras={ extras }
							/>
						</div>
						<div className="dsm-sub">
							{ __(
								'Describe what you need; the model composes three designs and every one lands as editable layers.',
								'wunderpaint'
							) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ onClose }
						aria-label={ __( 'Close', 'wunderpaint' ) }
						disabled={ busy }
					>
						{ I.close( { size: 17 } ) }
					</button>
				</div>

				<div className="dgs-body">
					{ /* Left: brief, presets, options. */ }
					<div className="dgs-left">
						<div className="dgs-card">
							<div className="dgs-card-head">
								{ tab( 'file-text', 14 ) }
								<span>{ __( 'Brief', 'wunderpaint' ) }</span>
							</div>
							<div className="dgs-card-body">
								<textarea
									className="gen-prompt dgs-brief"
									value={ brief }
									rows={ 5 }
									placeholder={ __(
										'What is it for, what does it say, how should it feel? e.g. “Instagram post for our summer sale, fresh and modern, 30% off everything”',
										'wunderpaint'
									) }
									aria-label={ __(
										'Design brief',
										'wunderpaint'
									) }
									onChange={ ( e ) => {
										setBrief( e.target.value );
										setPresetId( '' );
									} }
									disabled={ busy }
								/>
								<div className="dgs-prow">
									<span className="dgs-lbl">
										{ __( 'AI provider', 'wunderpaint' ) }
									</span>
									<select
										className="dsm-select"
										value={ provider }
										disabled={ busy }
										onChange={ ( e ) =>
											pickProvider( e.target.value )
										}
										aria-label={ __(
											'AI provider',
											'wunderpaint'
										) }
									>
										<option value="">
											{ autoProvider
												? sprintf(
														/* translators: %s: provider name. */
														__(
															'Automatic (%s)',
															'wunderpaint'
														),
														providerLabel(
															autoProvider
														)
												  )
												: __(
														'Automatic',
														'wunderpaint'
												  ) }
										</option>
										{ textProviders.map( ( id ) => (
											<option key={ id } value={ id }>
												{ providerLabel( id ) }
											</option>
										) ) }
									</select>
								</div>
								<button
									className="ai-btn primary dgs-create"
									disabled={ ! brief.trim() || busy }
									onClick={ run }
								>
									{ busy ? (
										<span className="spin" />
									) : (
										I.sparkles( { size: 15 } )
									) }
									{ status ||
										( variants
											? __(
													'Create 3 New Designs',
													'wunderpaint'
											  )
											: __(
													'Create Designs',
													'wunderpaint'
											  ) ) }
								</button>
							</div>
						</div>

						<Fold
							icon="rectangle"
							title={ __( 'Format', 'wunderpaint' ) }
							open={ docEmpty }
							extra={
								<span className="dgs-fold-val">
									{ state.doc.w } × { state.doc.h }
								</span>
							}
						>
							<div className="dgs-formats">
								{ formats.map( ( f ) => (
									<button
										key={ f.id }
										type="button"
										className={
											'dsm-chip' +
											( f.w === state.doc.w &&
											f.h === state.doc.h
												? ' active'
												: '' )
										}
										disabled={ ! docEmpty || busy }
										onClick={ () => selectFormat( f ) }
										title={ `${ f.w } × ${ f.h }` }
									>
										{ tab( f.icon, 12 ) }
										{ f.name }
									</button>
								) ) }
							</div>
							<small className="dgs-note">
								{ docEmpty
									? __(
											'The document is empty, so the format can still change here.',
											'wunderpaint'
									  )
									: __(
											'The designs follow the size of the open document.',
											'wunderpaint'
									  ) }
							</small>
						</Fold>

						<Fold
							icon="layout-grid"
							title={ __( 'Presets', 'wunderpaint' ) }
							open
						>
							{ groups.map( ( g ) => (
								<div key={ g.id }>
									<div className="dgs-group">{ g.name }</div>
									<div className="dgs-presets">
										{ g.presets.map( ( p ) => (
											<button
												key={ p.id }
												type="button"
												className={
													'dgs-preset' +
													( presetId === p.id
														? ' active'
														: '' )
												}
												title={ p.hint }
												disabled={ busy }
												onClick={ () =>
													pickPreset( p )
												}
											>
												{ tab( p.icon, 20 ) }
												<span>{ p.name }</span>
											</button>
										) ) }
									</div>
								</div>
							) ) }
						</Fold>

						<Fold
							icon="palette"
							title={ __( 'Brand', 'wunderpaint' ) }
						>
							{ kits.length > 0 ? (
								<div className="dgs-prow">
									<select
										className="dsm-select"
										value={ kitId }
										disabled={ busy }
										onChange={ ( e ) =>
											setKitId( e.target.value )
										}
										aria-label={ __(
											'Brand Kit',
											'wunderpaint'
										) }
									>
										<option value="">
											{ __(
												'No Brand Kit',
												'wunderpaint'
											) }
										</option>
										{ kits.map( ( k ) => (
											<option key={ k.id } value={ k.id }>
												{ k.name }
											</option>
										) ) }
									</select>
									{ !! window.WPIE?.openBrandKits && (
										<button
											type="button"
											className="dsm-close"
											onClick={ () =>
												window.WPIE.openBrandKits()
											}
											title={ __(
												'Edit Brand Kits',
												'wunderpaint'
											) }
											aria-label={ __(
												'Edit Brand Kits',
												'wunderpaint'
											) }
										>
											{ I.pencil( { size: 14 } ) }
										</button>
									) }
								</div>
							) : (
								<small className="dgs-note">
									{ __(
										'No Brand Kit yet. Colors and fonts from a kit steer every design.',
										'wunderpaint'
									) }
								</small>
							) }
							{ !! kit?.logoUrl &&
								checkRow(
									__(
										'Include the kit logo as a layer',
										'wunderpaint'
									),
									includeLogo,
									setIncludeLogo
								) }
							{ canReference &&
								checkRow(
									__(
										'Use the active image layer as style reference',
										'wunderpaint'
									),
									useReference,
									setUseReference
								) }
							<div className="dsm-grid2">
								<input
									className="dsm-input"
									value={ details.brand }
									disabled={ busy }
									onChange={ setField( 'brand' ) }
									placeholder={ __(
										'Brand or product name',
										'wunderpaint'
									) }
									aria-label={ __(
										'Brand or product name',
										'wunderpaint'
									) }
								/>
								<input
									className="dsm-input"
									value={ details.colors }
									disabled={ busy }
									onChange={ setField( 'colors' ) }
									placeholder={ __(
										'Brand colors, e.g. #ff5500',
										'wunderpaint'
									) }
									aria-label={ __(
										'Brand colors',
										'wunderpaint'
									) }
								/>
							</div>
						</Fold>

						<Fold
							icon="typography"
							title={ __( 'Wording', 'wunderpaint' ) }
						>
							<small className="dgs-note">
								{ __(
									'Fixed lines the design must carry; leave empty and the model writes them.',
									'wunderpaint'
								) }
							</small>
							<div className="dsm-grid2">
								<input
									className="dsm-input"
									value={ details.headline }
									disabled={ busy }
									onChange={ setField( 'headline' ) }
									placeholder={ __(
										'Headline',
										'wunderpaint'
									) }
									aria-label={ __(
										'Headline',
										'wunderpaint'
									) }
								/>
								<input
									className="dsm-input"
									value={ details.subhead }
									disabled={ busy }
									onChange={ setField( 'subhead' ) }
									placeholder={ __(
										'Subheadline or tagline',
										'wunderpaint'
									) }
									aria-label={ __(
										'Subheadline or tagline',
										'wunderpaint'
									) }
								/>
								<input
									className="dsm-input"
									value={ details.cta }
									disabled={ busy }
									onChange={ setField( 'cta' ) }
									placeholder={ __(
										'Call to action',
										'wunderpaint'
									) }
									aria-label={ __(
										'Call to action',
										'wunderpaint'
									) }
								/>
								<input
									className="dsm-input"
									value={ details.url }
									disabled={ busy }
									onChange={ setField( 'url' ) }
									placeholder={ __(
										'Website or URL',
										'wunderpaint'
									) }
									aria-label={ __(
										'Website or URL',
										'wunderpaint'
									) }
								/>
							</div>
						</Fold>

						<Fold
							icon="photo"
							title={ __( 'Image', 'wunderpaint' ) }
						>
							<select
								className="dsm-select"
								value={ imageMode }
								disabled={ busy }
								onChange={ ( e ) =>
									setImageMode( e.target.value )
								}
								aria-label={ __( 'Image', 'wunderpaint' ) }
							>
								{ stockProviders.length > 0 && (
									<option value="stock">
										{ __( 'Stock photo', 'wunderpaint' ) }
									</option>
								) }
								<option value="placeholder">
									{ __( 'Placeholder image', 'wunderpaint' ) }
								</option>
								{ imageProviders.length > 0 && (
									<option value="ai">
										{ __(
											'Generate with AI',
											'wunderpaint'
										) }
									</option>
								) }
								<option value="none">
									{ __( 'No image', 'wunderpaint' ) }
								</option>
							</select>
							{ 'ai' === imageMode &&
								imageProviders.length > 1 && (
									<select
										className="dsm-select"
										value={ imgProvider }
										disabled={ busy }
										onChange={ ( e ) =>
											setImgProvider( e.target.value )
										}
										aria-label={ __(
											'Image provider',
											'wunderpaint'
										) }
									>
										{ imageProviders.map(
											( [ id, label ] ) => (
												<option key={ id } value={ id }>
													{ label }
												</option>
											)
										) }
									</select>
								) }
							{ ( 'ai' === imageMode ||
								'stock' === imageMode ) && (
								<textarea
									className="gen-prompt"
									rows={ 2 }
									value={ imagePrompt }
									disabled={ busy }
									onChange={ ( e ) =>
										setImagePrompt( e.target.value )
									}
									placeholder={
										'ai' === imageMode
											? __(
													'Describe the look of the image: subject, style, mood, colors…',
													'wunderpaint'
											  )
											: __(
													'Refine what the photo should show…',
													'wunderpaint'
											  )
									}
									aria-label={ __(
										'Image description',
										'wunderpaint'
									) }
								/>
							) }
						</Fold>

						<Fold
							icon="refresh"
							title={ __( 'Dynamic template', 'wunderpaint' ) }
							extra={
								dynamic ? (
									<span className="dgs-fold-val">
										{ __( 'On', 'wunderpaint' ) }
									</span>
								) : null
							}
						>
							{ checkRow(
								<b>
									{ __(
										'Make it a dynamic template',
										'wunderpaint'
									) }
								</b>,
								dynamic,
								setDynamic
							) }
							{ dynamic && (
								<>
									<small className="dgs-note">
										{ __(
											'The chosen fields bind to the post; the copy above stays as the preview placeholder.',
											'wunderpaint'
										) }
									</small>
									<div className="dsm-grid2">
										{ DYN_VARS().map( ( v ) => (
											<label
												key={ v.key }
												className="dgs-checkrow"
											>
												<input
													type="checkbox"
													checked={
														!! dynVars[ v.key ]
													}
													disabled={ busy }
													onChange={ ( e ) =>
														setDynVars( ( d ) => ( {
															...d,
															[ v.key ]:
																e.target
																	.checked,
														} ) )
													}
												/>
												{ v.label }
											</label>
										) ) }
									</div>
								</>
							) }
						</Fold>
					</div>

					{ /* Middle: the designs. */ }
					<div className="dgs-main">
						<div className="dgs-main-head">
							<span>{ __( 'Designs', 'wunderpaint' ) }</span>
							{ variants && (
								<span className="dsm-count">
									{ variants.length }
								</span>
							) }
							<span className="spacer" />
							{ variants && (
								<button
									className="ai-btn sm secondary"
									disabled={ ! brief.trim() || busy }
									onClick={ run }
									title={ __(
										'Ask the model for three fresh designs',
										'wunderpaint'
									) }
								>
									{ I.refresh( { size: 13 } ) }
									{ __( 'Regenerate', 'wunderpaint' ) }
								</button>
							) }
						</div>
						{ ! variants && (
							<div className="dgs-results">
								<div className="dgs-empty">
									{ tab( 'sparkles', 36 ) }
									<p>
										{ __(
											'Describe the design on the left or start from one of these examples.',
											'wunderpaint'
										) }
									</p>
									<div className="dgs-examples">
										{ examples.map( ( p ) => (
											<button
												key={ p.id }
												type="button"
												className="dgs-example"
												disabled={ busy }
												onClick={ () =>
													pickPreset( p )
												}
											>
												{ tab( p.icon, 14 ) }
												<span>
													<b>{ p.name }</b>
													<small>{ p.hint }</small>
												</span>
											</button>
										) ) }
									</div>
								</div>
							</div>
						) }
						{ variants && (
							<div className="dgs-results">
								{ variants.map( ( v, i ) => {
									const checks = designChecks( v );
									return (
										<div
											key={ i }
											className={
												'dgs-result' +
												( i === selected
													? ' active'
													: '' )
											}
											role="button"
											tabIndex={ 0 }
											onClick={ () => setSelected( i ) }
											onDoubleClick={ () => insert( v ) }
											onKeyDown={ ( e ) => {
												if ( 'Enter' === e.key ) {
													insert( v );
												}
											} }
										>
											<div
												className="dgs-result-img"
												style={ {
													aspectRatio: `${ state.doc.w } / ${ state.doc.h }`,
												} }
											>
												<img src={ v.preview } alt="" />
											</div>
											<div className="dgs-result-meta">
												<b>{ designName( v, i ) }</b>
												<span
													className={
														'dgs-status ' +
														( checks.ok
															? 'ok'
															: 'warn' )
													}
												>
													{ checks.ok
														? I.check( {
																size: 12,
														  } )
														: I.alert( {
																size: 12,
														  } ) }
													{ checks.headline }
												</span>
											</div>
											<div className="dgs-result-actions">
												<button
													type="button"
													className="ai-btn sm secondary"
													disabled={ busy }
													onClick={ ( e ) => {
														e.stopPropagation();
														openZoom( v );
													} }
													title={ __(
														'View large',
														'wunderpaint'
													) }
													aria-label={ __(
														'View large',
														'wunderpaint'
													) }
												>
													{ I.zoom( { size: 13 } ) }
												</button>
												<button
													type="button"
													className="ai-btn sm primary"
													disabled={ busy }
													onClick={ ( e ) => {
														e.stopPropagation();
														insert( v );
													} }
												>
													{ __(
														'Insert',
														'wunderpaint'
													) }
												</button>
											</div>
										</div>
									);
								} ) }
							</div>
						) }
						{ history.length > 1 && (
							<div className="dgs-history">
								<span className="dgs-history-lbl">
									{ __( 'History', 'wunderpaint' ) }
								</span>
								{ history.map( ( g, gi ) => (
									<button
										key={ gi }
										type="button"
										className={
											'dgs-gen' +
											( gi === genIdx ? ' active' : '' )
										}
										title={ g.brief }
										disabled={ busy }
										onClick={ () => {
											setGenIdx( gi );
											setSelected( 0 );
										} }
									>
										{ g.variants.map( ( v, i ) => (
											<img
												key={ i }
												src={ v.preview }
												alt=""
											/>
										) ) }
									</button>
								) ) }
							</div>
						) }
					</div>

					{ /* Right: the selected design. */ }
					<div className="dgs-right">
						<div className="dgs-card">
							<div className="dgs-card-head">
								{ tab( 'eye', 14 ) }
								<span>
									{ __( 'Selected design', 'wunderpaint' ) }
								</span>
							</div>
							<div className="dgs-card-body">
								{ ! current && (
									<small className="dgs-note">
										{ variants
											? __(
													'Pick a design in the middle.',
													'wunderpaint'
											  )
											: __(
													'The checks and dials for a design appear here once the model has composed.',
													'wunderpaint'
											  ) }
									</small>
								) }
								{ current && (
									<>
										<b className="dgs-sel-name">
											{ designName( current, selected ) }
										</b>
										<span
											className={
												'dgs-status ' +
												( currentChecks.ok
													? 'ok'
													: 'warn' )
											}
										>
											{ currentChecks.ok
												? I.check( { size: 12 } )
												: I.alert( { size: 12 } ) }
											{ currentChecks.ok
												? __(
														'Passed all checks',
														'wunderpaint'
												  )
												: __(
														'Did not pass every check',
														'wunderpaint'
												  ) }
										</span>
										{ currentChecks.items.length > 0 && (
											<div className="dgs-checks">
												{ currentChecks.items.map(
													( it ) => (
														<span
															key={ it.code }
															className="dgs-check"
														>
															{ I.alert( {
																size: 13,
															} ) }
															{ it.text }
														</span>
													)
												) }
											</div>
										) }
										<small className="dgs-note">
											{ currentChecks.ok
												? __(
														'Contrast, margins, overlaps and text sizes are fine. Insert it, or steer it below.',
														'wunderpaint'
												  )
												: __(
														'You can still insert it and fix the rest on the canvas.',
														'wunderpaint'
												  ) }
										</small>
									</>
								) }
							</div>
						</div>

						<div className="dgs-card">
							<div className="dgs-card-head">
								{ tab( 'adjustments', 14 ) }
								<span>
									{ __( 'Direction', 'wunderpaint' ) }
								</span>
							</div>
							<div className="dgs-card-body">
								<div className="dgs-prow">
									<span className="dgs-lbl">
										{ __( 'Fonts', 'wunderpaint' ) }
									</span>
									<select
										className="dsm-select"
										value={ current?.dir?.pairing ?? '' }
										disabled={ ! current || busy }
										onChange={ ( e ) =>
											restyle( {
												pairing: e.target.value,
											} )
										}
										aria-label={ __(
											'Font pairing',
											'wunderpaint'
										) }
									>
										<option value="">
											{ __(
												'As designed',
												'wunderpaint'
											) }
										</option>
										{ FONT_PAIRINGS.map( ( p, i ) => (
											<option
												key={ i }
												value={ String( i ) }
											>
												{ p.hero[ 0 ] } +{ ' ' }
												{ p.support[ 0 ] }
											</option>
										) ) }
									</select>
								</div>
								<div className="dgs-prow">
									<span className="dgs-lbl">
										{ __( 'Palette', 'wunderpaint' ) }
									</span>
									<select
										className="dsm-select"
										value={ current?.dir?.intent || '' }
										disabled={ ! current || busy }
										onChange={ ( e ) =>
											restyle( {
												intent: e.target.value,
											} )
										}
										aria-label={ __(
											'Palette',
											'wunderpaint'
										) }
									>
										<option value="">
											{ __(
												'As designed',
												'wunderpaint'
											) }
										</option>
										{ INTENTS().map( ( [ id, label ] ) => (
											<option key={ id } value={ id }>
												{ label }
											</option>
										) ) }
									</select>
								</div>
								<small className="dgs-note">
									{ __(
										'Applies to the selected design only; the layout stays, colors and type change.',
										'wunderpaint'
									) }
								</small>
							</div>
						</div>
					</div>
				</div>

				<div className="dsm-foot">
					<div className="dsm-hint">
						{ busy ? (
							<span className="spin" />
						) : (
							I.layers( { size: 14 } )
						) }
						{ status ||
							__( 'Lands as editable layers', 'wunderpaint' ) }
					</div>
					<div className="dsm-actions">
						<button
							className="ai-btn ghost"
							onClick={ onClose }
							disabled={ busy }
						>
							{ __( 'Cancel', 'wunderpaint' ) }
						</button>
						<button
							className="ai-btn primary"
							disabled={ ! current || busy }
							onClick={ () => insert( current ) }
						>
							{ __( 'Insert Design', 'wunderpaint' ) }
						</button>
					</div>
				</div>

				{ zoom && (
					<div
						className="dgs-zoom"
						role="dialog"
						aria-modal="true"
						aria-label={ __( 'View large', 'wunderpaint' ) }
					>
						<div className="dgs-zoom-head">
							<span>
								{ designName(
									zoom.v,
									variants ? variants.indexOf( zoom.v ) : 0
								) }
							</span>
							<span className="spacer" />
							<button
								className="ai-btn sm primary"
								disabled={ busy }
								onClick={ () => insert( zoom.v ) }
							>
								{ __( 'Insert', 'wunderpaint' ) }
							</button>
							<button
								className="dsm-close"
								onClick={ () => setZoom( null ) }
								aria-label={ __( 'Close', 'wunderpaint' ) }
							>
								{ I.close( { size: 17 } ) }
							</button>
						</div>
						<div className="dgs-zoom-body">
							<img src={ zoom.src } alt="" />
						</div>
					</div>
				) }
			</div>
		</div>
	);
}
