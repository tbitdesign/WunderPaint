/**
 * Design Generator dialog (v1.12, named Design Assistant until v1.303):
 * brief in, finished editable design
 * out, layout via Anthropic, image via the configured image provider.
 */

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

// Style starting points (the design's preset cards); picking one seeds
// the brief, which stays fully editable.
const PRESETS = () => [
	{
		name: __( 'Bold Promo', 'wunderpaint' ),
		desc: __( 'Big headline, punchy call to action', 'wunderpaint' ),
		swatch: 'linear-gradient(135deg, #3b66ff, #2743b0)',
		brief: 'A bold product promotion built around one oversized headline, a single short supporting line and a clear call-to-action button. Confident, high-contrast, modern sans-serif type on a solid or gently graded background.',
	},
	{
		name: __( 'Minimal Quote', 'wunderpaint' ),
		desc: __( 'Elegant, lots of whitespace', 'wunderpaint' ),
		swatch: 'linear-gradient(135deg, #f3f5f7, #a8acae)',
		brief: 'An elegant, minimal quote layout with generous whitespace. A large serif headline set as a memorable quote sits centre stage, with a small attribution line beneath and nothing else competing for attention.',
	},
	{
		name: __( 'Energetic Sale', 'wunderpaint' ),
		desc: __( 'Strong colors, big numbers', 'wunderpaint' ),
		swatch: 'linear-gradient(135deg, #ef4444, #f5a524)',
		brief: 'A high-energy sale announcement built around a huge discount number. Strong warm colours, a short urgent headline, a small terms line and a prominent shop-now button.',
	},
	{
		name: __( 'Editorial Hero', 'wunderpaint' ),
		desc: __( 'Calm photographic backdrop', 'wunderpaint' ),
		swatch: 'linear-gradient(135deg, #718ca4, #16181c)',
		brief: 'A calm editorial hero with a soft full-bleed photographic backdrop, a refined serif headline, a thin kicker label above it and plenty of breathing room so the image carries the mood.',
	},
	{
		name: __( 'Event Invite', 'wunderpaint' ),
		desc: __( 'Name, date and venue', 'wunderpaint' ),
		swatch: 'linear-gradient(135deg, #16a34a, #0f766e)',
		brief: 'A stylish event invitation with the event name as the hero, the date, time and venue as clean supporting details, a tasteful accent shape and a single call to action to save the date.',
	},
	{
		name: __( 'Retro Poster', 'wunderpaint' ),
		desc: __( 'Warm vintage, chunky type', 'wunderpaint' ),
		swatch: 'linear-gradient(135deg, #b45309, #7c2d12)',
		brief: 'A retro-inspired poster with warm vintage colours, chunky condensed display type, a subtle grain feel and a strong centred composition that reads like a print piece.',
	},
	{
		name: __( 'Tech Launch', 'wunderpaint' ),
		desc: __( 'Sleek, dark, glowing accent', 'wunderpaint' ),
		swatch: 'linear-gradient(135deg, #0b1220, #3b66ff)',
		brief: 'A sleek product or feature launch on a dark background with a crisp headline, a one-line benefit statement, a soft glowing accent and a modern geometric feel.',
	},
	{
		name: __( 'Soft Pastel', 'wunderpaint' ),
		desc: __( 'Gentle tones, friendly', 'wunderpaint' ),
		swatch: 'linear-gradient(135deg, #fbcfe8, #bfdbfe)',
		brief: 'A soft, friendly layout in gentle pastel tones with a rounded, approachable headline, a short caption and a calm, uncluttered arrangement that feels warm and welcoming.',
	},
];

// Dynamic-template variables (v1.223.0): each maps a text/image ROLE the
// recipes produce to a post-field binding. Enabled ones are wired onto the
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

export function DesignDialog( { onClose, extras } ) {
	const editor = useEditor();
	const { state } = editor;
	const [ brief, setBrief ] = useState( '' );
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
	const [ dynamic, setDynamic ] = useState( false );
	const [ dynVars, setDynVars ] = useState( {
		title: true,
		excerpt: true,
		featured: true,
		category: false,
		date: false,
	} );
	const [ status, setStatus ] = useState( null );
	// Composed variants (v1.169.0): [{ label, layers, preview }] - the
	// user picks one card, only then does anything land on the canvas.
	const [ variants, setVariants ] = useState( null );
	// Generation counter (v1.172.2): 0 = first Create (clean, obvious take);
	// each Regenerate increments it and steers the model to a fresh angle.
	const genRef = useRef( 0 );
	useEscape( status ? () => {} : onClose );

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
				await ensureFontsForLayers( v.layers ).catch( () => {} );
				const canvas = await renderToCanvas( state.doc, v.layers, {
					scale: Math.min(
						1,
						260 / Math.max( state.doc.w, state.doc.h )
					),
					cache: sharedImageCache,
				} );
				previews.push( {
					...v,
					preview: canvas.toDataURL( 'image/jpeg', 0.85 ),
				} );
			}
			setVariants( previews );
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
		if ( status ) {
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

	const presets = PRESETS();

	return (
		<div
			className="modal-backdrop"
			onClick={ status ? undefined : onClose }
			role="presentation"
		>
			<div
				className="dsm"
				style={ { width: 640 } }
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
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
								'Generates a full layout: background, image, shapes and text land as editable layers.',
								'wunderpaint'
							) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ onClose }
						aria-label={ __( 'Close', 'wunderpaint' ) }
						disabled={ !! status }
					>
						{ I.close( { size: 17 } ) }
					</button>
				</div>

				{ variants && (
					<div className="dsm-body">
						<div className="dsm-sect">
							<span className="dsm-label">
								{ __( 'Pick a variant', 'wunderpaint' ) }
							</span>
							<div className="dsm-variants">
								{ variants.map( ( v, i ) => (
									<button
										key={ i }
										className="dsm-variant"
										disabled={ !! status }
										onClick={ () => insert( v ) }
									>
										<img src={ v.preview } alt="" />
										<span>{ v.label }</span>
									</button>
								) ) }
							</div>
							<div
								className="dsm-hint"
								style={ { marginTop: 8 } }
							>
								<span>
									{ __(
										'Click one to insert it as editable layers, or ask the model again for three fresh designs.',
										'wunderpaint'
									) }
								</span>
							</div>
							<div
								style={ {
									display: 'flex',
									gap: 8,
									marginTop: 8,
								} }
							>
								<button
									className="ai-btn primary"
									style={ { flex: 1 } }
									disabled={ !! status }
									onClick={ () => run() }
								>
									{ status ? (
										<span className="spin" />
									) : (
										I.refresh && I.refresh( { size: 15 } )
									) }
									{ __(
										'Regenerate designs',
										'wunderpaint'
									) }
								</button>
								<button
									className="ai-btn secondary"
									disabled={ !! status }
									onClick={ () => {
										genRef.current = 0;
										setVariants( null );
									} }
								>
									{ __( 'Back to the brief', 'wunderpaint' ) }
								</button>
							</div>
						</div>
					</div>
				) }
				{ ! variants && (
					<div className="dsm-body">
						<div className="dsm-row-head">
							<span className="dsm-label">
								{ __( 'Canvas', 'wunderpaint' ) }
							</span>
							<span className="dsm-count">
								{ state.doc.w } × { state.doc.h } px
							</span>
						</div>

						<div className="dsm-sect">
							<span className="dsm-label">
								{ __( 'Describe the Design', 'wunderpaint' ) }
							</span>
							<textarea
								className="gen-prompt"
								value={ brief }
								rows={ 3 }
								placeholder={ __(
									'Describe the design… e.g., “Instagram post announcing our summer sale, fresh and modern, 30% off everything”',
									'wunderpaint'
								) }
								aria-label={ __(
									'Design brief',
									'wunderpaint'
								) }
								onChange={ ( e ) => setBrief( e.target.value ) }
								disabled={ !! status }
							/>
						</div>

						<div className="dsm-sect">
							<span className="dsm-label">
								{ __( 'Start from a Style', 'wunderpaint' ) }
							</span>
							<div
								style={ {
									display: 'grid',
									gridTemplateColumns: 'repeat(2, 1fr)',
									gap: 8,
								} }
							>
								{ presets.map( ( preset ) => (
									<button
										key={ preset.name }
										className={
											'dsm-preset' +
											( brief === preset.brief
												? ' active'
												: '' )
										}
										disabled={ !! status }
										onClick={ () =>
											setBrief( preset.brief )
										}
									>
										<span
											className="swatch"
											style={ {
												background: preset.swatch,
											} }
										/>
										<span style={ { minWidth: 0 } }>
											<b>{ preset.name }</b>
											<small>{ preset.desc }</small>
										</span>
									</button>
								) ) }
							</div>
						</div>

						<div className="dsm-sect">
							<span className="dsm-label">
								{ __( 'Image', 'wunderpaint' ) }
							</span>
							<select
								className="dsm-select"
								value={ imageMode }
								disabled={ !! status }
								onChange={ ( e ) =>
									setImageMode( e.target.value )
								}
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
										style={ { marginTop: 6 } }
										value={ imgProvider }
										disabled={ !! status }
										onChange={ ( e ) =>
											setImgProvider( e.target.value )
										}
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
									style={ { marginTop: 6 } }
									rows={ 2 }
									value={ imagePrompt }
									disabled={ !! status }
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
						</div>

						<div className="dsm-sect">
							<span className="dsm-label">
								{ __( 'Brand & Context', 'wunderpaint' ) }{ ' ' }
								<em>{ __( '(optional)', 'wunderpaint' ) }</em>
							</span>
							<div className="dsm-grid2">
								<input
									className="dsm-input"
									value={ details.brand }
									disabled={ !! status }
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
									value={ details.headline }
									disabled={ !! status }
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
									disabled={ !! status }
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
									disabled={ !! status }
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
									disabled={ !! status }
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
								<input
									className="dsm-input"
									value={ details.colors }
									disabled={ !! status }
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
							{ kits.length > 0 && (
								<div
									style={ {
										display: 'flex',
										flexDirection: 'column',
										gap: 9,
										width: '100%',
									} }
								>
									<span className="dsm-label">
										{ __( 'Brand Kit', 'wunderpaint' ) }
									</span>
									<div
										style={ {
											display: 'flex',
											gap: 6,
											alignItems: 'center',
											width: '100%',
										} }
									>
										<select
											className="dsm-select"
											style={ { flex: 1, width: '100%' } }
											value={ kitId }
											disabled={ !! status }
											onChange={ ( e ) =>
												setKitId( e.target.value )
											}
										>
											<option value="">
												{ __(
													'No Brand Kit',
													'wunderpaint'
												) }
											</option>
											{ kits.map( ( k ) => (
												<option
													key={ k.id }
													value={ k.id }
												>
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
								</div>
							) }
							<div
								style={ {
									display: 'flex',
									gap: 16,
									alignItems: 'center',
									flexWrap: 'wrap',
								} }
							>
								{ canReference && (
									<label
										style={ {
											display: 'flex',
											gap: 8,
											alignItems: 'center',
											fontSize: 12,
										} }
									>
										<input
											type="checkbox"
											checked={ useReference }
											disabled={ !! status }
											onChange={ ( e ) =>
												setUseReference(
													e.target.checked
												)
											}
										/>
										{ __(
											'Use the active image layer as style reference',
											'wunderpaint'
										) }
									</label>
								) }
								{ !! kit?.logoUrl && (
									<label
										style={ {
											display: 'flex',
											gap: 8,
											alignItems: 'center',
											fontSize: 12,
										} }
									>
										<input
											type="checkbox"
											checked={ includeLogo }
											disabled={ !! status }
											onChange={ ( e ) =>
												setIncludeLogo(
													e.target.checked
												)
											}
										/>
										{ __(
											'Include the kit logo as a layer',
											'wunderpaint'
										) }
									</label>
								) }
							</div>
						</div>
						<div className="dsm-sect">
							<label
								style={ {
									display: 'flex',
									gap: 8,
									alignItems: 'center',
									fontSize: 13,
								} }
							>
								<input
									type="checkbox"
									checked={ dynamic }
									disabled={ !! status }
									onChange={ ( e ) =>
										setDynamic( e.target.checked )
									}
								/>
								<b>
									{ __(
										'Make it a dynamic template',
										'wunderpaint'
									) }
								</b>
							</label>
							{ dynamic && (
								<>
									<small
										className="dsm-hint"
										style={ { marginTop: 4 } }
									>
										{ __(
											'The chosen fields bind to the post; the copy above stays as the preview placeholder.',
											'wunderpaint'
										) }
									</small>
									<div
										className="dsm-grid2"
										style={ { marginTop: 6 } }
									>
										{ DYN_VARS().map( ( v ) => (
											<label
												key={ v.key }
												style={ {
													display: 'flex',
													gap: 8,
													alignItems: 'center',
													fontSize: 12,
												} }
											>
												<input
													type="checkbox"
													checked={
														!! dynVars[ v.key ]
													}
													disabled={ !! status }
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
						</div>
					</div>
				) }

				<div className="dsm-foot">
					<div className="dsm-hint">
						{ I.layers ? I.layers( { size: 14 } ) : null }
						{ __( 'Lands as editable layers', 'wunderpaint' ) }
					</div>
					<div className="dsm-actions">
						<button
							className="ai-btn ghost"
							onClick={ onClose }
							disabled={ !! status }
						>
							{ __( 'Cancel', 'wunderpaint' ) }
						</button>
						{ ! variants && (
							<button
								className="ai-btn primary"
								disabled={ ! brief.trim() || !! status }
								onClick={ run }
							>
								{ status && <span className="spin" /> }
								{ status ||
									__( 'Create Design', 'wunderpaint' ) }
							</button>
						) }
						{ variants && !! status && (
							<span className="dsm-hint">
								<span className="spin" /> { status }
							</span>
						) }
					</div>
				</div>
			</div>
		</div>
	);
}
