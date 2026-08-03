/**
 * AI panel (spec 06.5): provider pill + selector (configured only), prompt,
 * Generate / Edit Layer, quick actions grid, variations chooser, progress
 * with cancel, actionable errors. Remove BG and Upscale always work, the
 * local fallbacks need zero keys.
 */

import { useState, useEffect, useRef, createPortal } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../../icons';
import { promptDialog } from '../../lib/dialogs';
import {
	listExtensionAiTools,
	subscribeExtensions,
} from '../../lib/extensions';
import { PROVIDER_LABELS } from '../../lib/providers';
import { useEditor } from '../../store/editor-context';
import {
	aiGenerate,
	aiGenerateVector,
	aiGeneratePanorama,
	aiEditLayer,
	aiFromSketch,
	aiBlurFaces,
	aiColorize,
	aiCartoon,
	aiEnhanceLayer,
	aiEnhanceDesign,
	aiRestore,
	aiRemoveBg,
	aiUpscale,
	aiEnhance,
	aiInpaint,
	aiOutpaint,
	aiVariations,
	insertResultLayer,
	selectSubject,
	removeObject,
	removeObjectLocal,
	blurBackground,
	refineEdges,
	cropToSubject,
	makeSticker,
	textBehindSubject,
	colorPop,
	productShot,
	neonRim,
	speedBlur,
	depthFog,
	designReview,
	improveTextAlternatives,
	replaceBackground,
	vectorizeActiveLayer,
	urlToDataUrl,
} from '../../lib/ai-actions';
import { placeSvgLayers } from '../../store/ops';
import { PostPickerDialog } from '../post-picker-dialog';
import { HelpLink } from '../help-dialog';
import { StyleButton } from '../../components/style-picker';
import { useTip } from '../../components/use-tip';

export function AIPanel( { extras } ) {
	const editor = useEditor();
	const { state, WPIE } = editor;
	const [ prompt, setPrompt ] = useState( '' );
	const [ provider, setProvider ] = useState(
		WPIE.defaultProvider || 'gemini'
	);
	const [ aspect, setAspect ] = useState( 'auto' ); // generation format (v1.5)
	const [ vecOut, setVecOut ] = useState( false ); // paths, not pixels (v1.378)
	// 'auto' and '360°' are UI modes, never provider aspect strings.
	const aspectParam =
		'auto' === aspect || '360°' === aspect ? undefined : aspect;
	const [ busy, setBusy ] = useState( null ); // action id
	// Extension AI tools may register after mount (v1.122).
	const [ , setExtTick ] = useState( 0 );
	useEffect(
		() => subscribeExtensions( () => setExtTick( ( t ) => t + 1 ) ),
		[]
	);
	const [ variants, setVariants ] = useState( null );
	const [ review, setReview ] = useState( null ); // Design Review text (v1.378)
	const [ textAlts, setTextAlts ] = useState( null ); // Improve Text (v1.378)
	const [ includeBrand, setIncludeBrand ] = useState( false );
	const [ pickPost, setPickPost ] = useState( false );
	const cancelled = useRef( false );

	// CI tooltips (v1.78.7, shared hook since v1.165.2): the tool-rail
	// bubble instead of native title tooltips.
	const { tipFor, tipNode, hideTip } = useTip();

	// Providers work on fixed grids, expose the common ratios (v1.5);
	// 'auto' derives the nearest ratio from the document.
	const ASPECT_CHIPS = [
		'auto',
		'1:1',
		'3:2',
		'2:3',
		'4:3',
		'3:4',
		'16:9',
		'9:16',
		// UI mode, not a provider ratio: seamless equirectangular sphere,
		// resampled to exact 2:1 for the 360° Panorama tool (v1.378).
		'360°',
	];

	const providers = Object.keys( PROVIDER_LABELS ).filter(
		( id ) => WPIE.providers?.[ id ]
	);
	const hasProvider = providers.length > 0;
	const currentProvider = providers.includes( provider )
		? provider
		: providers[ 0 ];

	// "Include brand details" (v1.77): appends the selected brand kit's
	// colors/fonts to Generate, Edit Layer, From Document and From Post.
	// window.WPIE first: the context copy misses kits saved after boot.
	const brandKits = ( window.WPIE?.brandKits || WPIE.brandKits || [] ).filter(
		( k ) =>
			( k.colors?.length || 0 ) > 0 ||
			( k.fonts?.length || 0 ) > 0 ||
			!! k.logoUrl
	);
	const [ brandKitId, setBrandKitId ] = useState( brandKits[ 0 ]?.id || '' );
	const brand =
		brandKits.find( ( k ) => k.id === brandKitId ) || brandKits[ 0 ] || {};
	const hasBrand = brandKits.length > 0;
	// Logo previews cached per URL so switching kits never re-downloads.
	const logoCache = useRef( {} );
	const brandRef = async () => {
		if ( ! includeBrand || ! brand.logoUrl ) {
			return undefined;
		}
		if ( ! ( brand.logoUrl in logoCache.current ) ) {
			try {
				logoCache.current[ brand.logoUrl ] = await urlToDataUrl(
					brand.logoUrl,
					512
				);
			} catch ( e ) {
				logoCache.current[ brand.logoUrl ] = null;
			}
		}
		return logoCache.current[ brand.logoUrl ] || undefined;
	};
	const withBrand = ( p ) => {
		if ( ! includeBrand || ! hasBrand ) {
			return p;
		}
		const bits = [];
		if ( brand.colors?.length ) {
			bits.push( `brand colors ${ brand.colors.join( ', ' ) }` );
		}
		if ( brand.fonts?.length ) {
			bits.push( `brand fonts ${ brand.fonts.join( ', ' ) }` );
		}
		if ( brand.logoUrl ) {
			bits.push( 'the attached brand logo reference' );
		}
		if ( ! bits.length ) {
			return p;
		}
		return `${ p }\n\nFollow the brand style where it fits: ${ bits.join(
			'; '
		) }.`;
	};

	// From Post (v1.77): the picked article's title/excerpt/content ride
	// along with the prompt, e.g. for quick article infographics.
	const generateFromPost = ( post ) => {
		const ctx = post.ctx || {};
		const article = [
			`Title: ${ ctx.title || post.title }`,
			ctx.excerpt ? `Excerpt: ${ ctx.excerpt }` : '',
			ctx.content ? `Content: ${ ctx.content }` : '',
		]
			.filter( Boolean )
			.join( '\n' );
		const base =
			prompt.trim() ||
			__(
				'An illustrative image that captures the key points of the article.',
				'wunderpaint'
			);
		const full = withBrand(
			`${ base }\n\nBase the image on this article and reflect its topic and key points:\n${ article }`
		);
		run(
			'frompost',
			async () =>
				aiGenerate( editor, {
					prompt: full,
					provider: currentProvider,
					aspect: aspectParam,
					refImage: await brandRef(),
				} ),
			{}
		);
	};

	const run = async (
		id,
		fn,
		{
			needsProvider = true,
			needsPrompt = false,
			requires = null,
			prepare = null,
		} = {}
	) => {
		if ( busy ) {
			return;
		}
		if ( 'selection' === requires && ! state.selection ) {
			extras.toasts.error(
				__(
					'Select the area first, use the Smart Select tool (K) or “Select Subject” below, then click this again.',
					'wunderpaint'
				)
			);
			return;
		}
		if ( needsPrompt && ! prompt.trim() ) {
			extras.toasts.error(
				__(
					'Type what you want in the prompt box above first.',
					'wunderpaint'
				)
			);
			return;
		}
		if ( needsProvider && ! hasProvider ) {
			extras.toasts.error(
				__( 'No AI provider configured.', 'wunderpaint' ),
				{
					linkText: __( 'Settings', 'wunderpaint' ),
					linkHref: WPIE.settingsUrl,
				}
			);
			return;
		}
		// Options dialogs (e.g. blur radius) run before the busy state so
		// the progress UI never sits behind the prompt.
		let prepared;
		if ( prepare ) {
			prepared = await prepare();
			if ( null === prepared ) {
				return;
			}
		}
		cancelled.current = false;
		setBusy( id );
		try {
			await fn( prepared );
			if ( cancelled.current ) {
				extras.toasts.toast(
					__(
						'The result arrived after cancelling, it was discarded is not possible; check the Layers panel.',
						'wunderpaint'
					)
				);
			}
		} catch ( err ) {
			if ( ! cancelled.current ) {
				extras.toasts.error(
					err.message || __( 'The AI action failed.', 'wunderpaint' ),
					err.isAuth || err.isQuota || err.isUnconfigured
						? {
								linkText: __( 'Settings', 'wunderpaint' ),
								linkHref: WPIE.settingsUrl,
						  }
						: {}
				);
			}
		}
		setBusy( null );
	};

	// Every quick action explains itself via tooltip (v1.4.3).
	const quickActions = [
		{
			id: 'selectSubject',
			label: __( 'Select Subject', 'wunderpaint' ),
			needsProvider: false, // local U2-Netp (v0.2)
			fn: () => selectSubject( editor ),
			title: __(
				'Detects the main subject of the active image and turns it into a selection.',
				'wunderpaint'
			),
		},
		{
			id: 'removeObjectLocal',
			label: __( 'Remove Object', 'wunderpaint' ),
			needsProvider: false,
			requires: 'selection',
			fn: () => removeObjectLocal( editor ),
			title: __(
				'Erases the selected area and fills it from the surrounding pixels. ① Select the object (Smart Select “K” / Select Subject). ② Click this. (For tricky fills, the AI-cloud version is stronger.)',
				'wunderpaint'
			),
		},
		{
			id: 'enhanceLayer',
			label: __( 'Enhance Layer', 'wunderpaint' ),
			fn: () => aiEnhanceLayer( editor, { provider: currentProvider } ),
			title: __(
				'Sends the active layer to the AI and recreates it at much higher quality, sharper, cleaner and more detailed, keeping the same subject, colors and composition.',
				'wunderpaint'
			),
		},
		{
			id: 'enhanceDesign',
			label: __( 'Enhance Design', 'wunderpaint' ),
			fn: () => aiEnhanceDesign( editor, { provider: currentProvider } ),
			title: __(
				'Flattens the whole canvas as a reference and redesigns it to a professional standard, keeping the layout, text and composition but making it noticeably cooler and more polished. Adds the result as a new layer on top.',
				'wunderpaint'
			),
		},
		{
			id: 'designReview',
			label: __( 'Design Review', 'wunderpaint' ),
			fn: async () => setReview( await designReview( editor ) ),
			title: __(
				'An art director looks at your design and answers in your editor language: one overall verdict plus the few changes with the biggest impact.',
				'wunderpaint'
			),
		},
		{
			id: 'improveText',
			label: __( 'Improve Text', 'wunderpaint' ),
			fn: async () =>
				setTextAlts( await improveTextAlternatives( editor ) ),
			title: __(
				'Five stronger alternatives for the selected text layer, same language and length - pick one and it replaces the text.',
				'wunderpaint'
			),
		},
		{
			id: 'removeObject',
			label: __( 'Remove Object', 'wunderpaint' ),
			requires: 'selection',
			fn: () => removeObject( editor, { provider: currentProvider } ),
			title: __(
				'Erases the selected area, the AI reconstructs what was behind it. ① Select the object (Smart Select tool “K”, or “Select Subject” below). ② Click this.',
				'wunderpaint'
			),
		},
		{
			id: 'removeBg',
			label: __( 'Remove BG', 'wunderpaint' ),
			needsProvider: false, // guaranteed local (spec 11.1)
			fn: () => aiRemoveBg( editor ),
			title: __(
				'Cuts out the subject of the active image layer, the background becomes transparent.',
				'wunderpaint'
			),
		},
		{
			id: 'blurBg',
			label: __( 'Blur Background', 'wunderpaint' ),
			needsProvider: false, // local U2-Netp (v0.4)
			prepare: () =>
				promptDialog( {
					title: __( 'Blur Background', 'wunderpaint' ),
					label: __( 'Blur radius (px)', 'wunderpaint' ),
					type: 'number',
					defaultValue: '18',
				} ),
			fn: ( value ) =>
				blurBackground( editor, {
					radius: Math.max( 1, parseInt( value, 10 ) || 18 ),
				} ),
			title: __(
				'Keeps the subject sharp and blurs everything behind it (portrait effect), asks for the blur strength.',
				'wunderpaint'
			),
		},
		{
			id: 'depthBlur',
			label: __( 'Depth Blur', 'wunderpaint' ),
			needsProvider: false, // local Depth Anything (v1.27)
			fn: () => extras.openDepthBlur(),
			title: __(
				'Graduated background blur with a focus/strength slider, from a depth map (depth-of-field).',
				'wunderpaint'
			),
		},
		{
			id: 'blurfaces',
			label: __( 'Blur Faces', 'wunderpaint' ),
			needsProvider: false, // local Florence-2 grounding (v1.241)
			fn: async () => {
				const r = await aiBlurFaces( editor );
				extras.toasts.success(
					sprintf(
						/* translators: %d: face count. */
						__( 'Made %d face(s) unrecognizable.', 'wunderpaint' ),
						r.count
					)
				);
			},
			title: __(
				'Finds every face on the active layer and pixelates it beyond recognition, e.g. for privacy-safe photos. Runs locally, nothing leaves your browser.',
				'wunderpaint'
			),
		},
		{
			id: 'vectorize',
			label: __( 'Vectorize', 'wunderpaint' ),
			needsProvider: false, // imagetracerjs, pure JS (v1.77)
			fn: async () => {
				const parsed = await vectorizeActiveLayer( editor );
				placeSvgLayers(
					editor,
					parsed,
					`${ parsed.name } ${ __( 'vector', 'wunderpaint' ) }`,
					__( 'Vectorize', 'wunderpaint' )
				);
				extras.toasts.success(
					sprintf(
						/* translators: %d: shape count. */
						__(
							'Traced into %d editable vector shapes.',
							'wunderpaint'
						),
						parsed.layers.length
					)
				);
			},
			title: __(
				'Traces the active image into editable vector shapes (SVG paths).',
				'wunderpaint'
			),
		},
		{
			id: 'upscale',
			label: __( 'Upscale', 'wunderpaint' ),
			needsProvider: false,
			fn: async () => {
				const r = await aiUpscale( editor, 2 );
				// The layer intentionally keeps its canvas size, so say
				// what actually happened instead of looking like a no-op.
				extras.toasts.success(
					sprintf(
						/* translators: 1: width, 2: height. */
						__(
							'Source resolution is now %1$d × %2$d px. The layer keeps its size on canvas; zooms and exports get sharper.',
							'wunderpaint'
						),
						r.width,
						r.height
					)
				);
			},
			title: __(
				'Doubles the source resolution of the active image layer; the layer keeps its size on canvas.',
				'wunderpaint'
			),
		},
		{
			id: 'inpaint',
			label: __( 'Inpaint', 'wunderpaint' ),
			needsPrompt: true,
			requires: 'selection',
			fn: () =>
				aiInpaint( editor, { prompt, provider: currentProvider } ),
			title: __(
				'Repaints ONLY the selected area from your prompt, everything else stays. ① Select an area. ② Type what should go there (prompt box above). ③ Click this.',
				'wunderpaint'
			),
		},
		{
			id: 'outpaint',
			label: __( 'Outpaint', 'wunderpaint' ),
			fn: () =>
				aiOutpaint( editor, { prompt, provider: currentProvider } ),
			/*
			 * The rule below reads "25% per" as a %p placeholder. There is
			 * none; it is a literal percentage and needs no translator note.
			 */
			// eslint-disable-next-line @wordpress/i18n-translator-comments
			title: __(
				'Extends the picture outward, the AI invents more scenery. Fills empty canvas around your image, or enlarges the canvas by 25% per side if it’s already full. An optional prompt steers what appears.',
				'wunderpaint'
			),
		},
		{
			id: 'enhance',
			label: __( 'Enhance', 'wunderpaint' ),
			needsProvider: false,
			fn: () => aiEnhance( editor ),
			title: __(
				'One-click auto color, contrast and sharpness boost for the active image layer.',
				'wunderpaint'
			),
		},
		{
			id: 'colorize',
			label: __( 'Colorize', 'wunderpaint' ),
			fn: () => aiColorize( editor, { provider: currentProvider } ),
			title: __(
				'Adds natural, realistic color to a black-and-white photo on the active image layer.',
				'wunderpaint'
			),
		},
		{
			id: 'cartoon',
			label: __( 'Cartoon', 'wunderpaint' ),
			fn: () => aiCartoon( editor, { provider: currentProvider } ),
			title: __(
				'Redraws the active image layer as a clean, vibrant cartoon illustration.',
				'wunderpaint'
			),
		},
		{
			id: 'restore',
			label: __( 'Restore Photo', 'wunderpaint' ),
			fn: () => aiRestore( editor, { provider: currentProvider } ),
			title: __(
				'Repairs an old or damaged photo on the active layer, removes scratches, dust and noise and improves clarity.',
				'wunderpaint'
			),
		},
		{
			id: 'replaceBg',
			label: __( 'Replace BG', 'wunderpaint' ),
			needsPrompt: true,
			fn: () =>
				replaceBackground( editor, {
					prompt,
					provider: currentProvider,
				} ),
			title: __(
				'Keeps the subject (cut out locally) and generates a NEW background from your prompt behind it. Type the background you want in the prompt box first.',
				'wunderpaint'
			),
		},
		{
			id: 'refineEdges',
			label: __( 'Refine Edges', 'wunderpaint' ),
			needsProvider: false,
			fn: () => refineEdges( editor ),
			title: __(
				'Smooths and slightly tightens the cutout edge of the active image layer, cleans Remove-BG fringes.',
				'wunderpaint'
			),
		},
		{
			id: 'cropSubject',
			label: __( 'Crop to Subject', 'wunderpaint' ),
			needsProvider: false,
			fn: () => cropToSubject( editor ),
			title: __(
				'Crops the canvas to the detected subject with a small margin.',
				'wunderpaint'
			),
		},
		{
			id: 'sticker',
			label: __( 'Sticker', 'wunderpaint' ),
			needsProvider: false,
			fn: () => makeSticker( editor ),
			title: __(
				'Cuts out the subject and adds a white sticker outline with a soft shadow.',
				'wunderpaint'
			),
		},
		{
			id: 'textBehind',
			label: __( 'Text Behind Subject', 'wunderpaint' ),
			needsProvider: false,
			fn: () => textBehindSubject( editor ),
			title: __(
				'Cuts out the subject locally and slides an editable headline between background and subject - the magazine cover look.',
				'wunderpaint'
			),
		},
		{
			id: 'colorPop',
			label: __( 'Color Pop', 'wunderpaint' ),
			needsProvider: false,
			fn: () => colorPop( editor ),
			title: __(
				'Keeps the subject in color and turns everything else black and white - fully local, soft edges included.',
				'wunderpaint'
			),
		},
		{
			id: 'productShot',
			label: __( 'Product Shot', 'wunderpaint' ),
			needsProvider: false,
			fn: () => productShot( editor ),
			title: __(
				'Cuts out the subject and centers it on clean white with a soft contact shadow - the catalog look.',
				'wunderpaint'
			),
		},
		{
			id: 'neonRim',
			label: __( 'Neon Rim', 'wunderpaint' ),
			needsProvider: false,
			fn: () => neonRim( editor ),
			title: __(
				'Dims the background and wraps the subject in a glowing rim - uses your first vivid Brand Kit color when one is set.',
				'wunderpaint'
			),
		},
		{
			id: 'speedBlur',
			label: __( 'Speed Blur', 'wunderpaint' ),
			needsProvider: false,
			fn: () => speedBlur( editor ),
			title: __(
				'Zoom-blurs the background around the sharp subject - instant motion.',
				'wunderpaint'
			),
		},
		{
			id: 'depthFog',
			label: __( 'Depth Fog', 'wunderpaint' ),
			needsProvider: false,
			fn: () => depthFog( editor ),
			title: __(
				'Adds atmospheric haze staged by real depth - clear up front, misty in the distance.',
				'wunderpaint'
			),
		},
		{
			id: 'variations',
			label: __( 'Variations', 'wunderpaint' ),
			fn: async () => setVariants( await aiVariations( editor, 2 ) ),
			hidden: ! WPIE.providers?.openai, // dall-e-2 only (spec 11.1)
			title: __(
				'Generates 4 alternative takes on the active layer to choose from (OpenAI).',
				'wunderpaint'
			),
		},
	];

	// Friendly, action-specific status label for the busy card.
	const busyLabel = ( () => {
		const named = {
			generate: __( 'Generating image…', 'wunderpaint' ),
			edit: __( 'Editing layer…', 'wunderpaint' ),
			sketch: __( 'Rendering your sketch…', 'wunderpaint' ),
		};
		if ( named[ busy ] ) {
			return named[ busy ];
		}
		const qa = quickActions.find( ( a ) => a.id === busy );
		return qa ? qa.label + '…' : __( 'Working…', 'wunderpaint' );
	} )();

	return (
		<div className="ai-panel">
			<div className="ai-head">
				<span className="dot" /> { __( 'AI Assist', 'wunderpaint' ) }
			</div>

			<div style={ { display: 'flex', gap: 4, flexWrap: 'wrap' } }>
				{ hasProvider ? (
					providers.map( ( id ) => (
						<button
							key={ id }
							className={
								'ai-provider-pill' +
								( currentProvider === id ? ' active' : '' )
							}
							onClick={ () => setProvider( id ) }
						>
							<span className="dot" />
							{ PROVIDER_LABELS[ id ] }
						</button>
					) )
				) : (
					<span
						className="ai-provider-pill"
						style={ { opacity: 0.7 } }
					>
						{ __( 'No provider, local tools only', 'wunderpaint' ) }
					</span>
				) }
			</div>

			<div
				style={ {
					display: 'flex',
					justifyContent: 'flex-end',
					marginBottom: -2,
				} }
			>
				<StyleButton
					value={ prompt }
					onChange={ ( v ) => setPrompt( v ) }
				/>
			</div>
			<textarea
				placeholder={ __(
					'Describe what to generate or change… e.g., “add soft morning light”, “make the background minimal and cream colored”',
					'wunderpaint'
				) }
				value={ prompt }
				onChange={ ( e ) => setPrompt( e.target.value ) }
			/>

			<div style={ { display: 'grid', gap: 4 } }>
				<span
					style={ {
						fontSize: 10,
						color: 'var(--ed-text-muted)',
						textTransform: 'uppercase',
						letterSpacing: 0.5,
					} }
				>
					{ __( 'Format', 'wunderpaint' ) }
				</span>
				<div
					className="seg-row ai-aspect-row"
					style={ { display: 'flex' } }
				>
					{ ASPECT_CHIPS.map( ( a ) => (
						<button
							key={ a }
							className={ aspect === a ? 'active' : '' }
							{ ...tipFor(
								'auto' === a
									? __(
											'Match the document’s aspect ratio',
											'wunderpaint'
									  )
									: __(
											'Generation aspect ratio',
											'wunderpaint'
									  ) +
											' ' +
											a
							) }
							onClick={ () => setAspect( a ) }
						>
							{ 'auto' === a ? __( 'Auto', 'wunderpaint' ) : a }
						</button>
					) ) }
				</div>
				{ '360°' !== aspect && (
					<div
						className="ai-inline-check"
						{ ...tipFor(
							__(
								'The image model draws flat artwork and the local tracer turns it into editable path layers - a prompt becomes real shapes, not pixels.',
								'wunderpaint'
							)
						) }
					>
						<label>
							<input
								type="checkbox"
								checked={ vecOut }
								onChange={ ( e ) =>
									setVecOut( e.target.checked )
								}
							/>
							{ __( 'Turn into editable vector', 'wunderpaint' ) }
						</label>
					</div>
				) }
			</div>

			<div className="ai-actions">
				<button
					className="ai-btn primary"
					disabled={ !! busy || ! hasProvider || ! prompt.trim() }
					onClick={ () =>
						run(
							'generate',
							async () => {
								if ( '360°' === aspect ) {
									await aiGeneratePanorama( editor, {
										prompt: withBrand( prompt ),
										provider: currentProvider,
									} );
									extras.toasts.success(
										__(
											'Panorama inserted - open Tools → 360° Panorama to walk through it and copy the embed.',
											'wunderpaint'
										)
									);
									return;
								}
								if ( vecOut ) {
									const parsed = await aiGenerateVector(
										editor,
										{
											prompt: withBrand( prompt ),
											provider: currentProvider,
											aspect: aspectParam,
										}
									);
									placeSvgLayers(
										editor,
										parsed,
										parsed.name,
										__( 'Generate Vector', 'wunderpaint' )
									);
									extras.toasts.success(
										sprintf(
											/* translators: %d: shape count. */
											__(
												'Traced into %d editable vector shapes.',
												'wunderpaint'
											),
											parsed.layers.length
										)
									);
									return;
								}
								await aiGenerate( editor, {
									prompt: withBrand( prompt ),
									provider: currentProvider,
									aspect: aspectParam,
									refImage: await brandRef(),
								} );
							},
							{ needsPrompt: true }
						)
					}
				>
					{ 'generate' === busy ? (
						<span className="spin" />
					) : (
						I.sparkAI( { size: 14 } )
					) }{ ' ' }
					{ __( 'Generate', 'wunderpaint' ) }
				</button>
				<button
					className="ai-btn secondary"
					disabled={ !! busy || ! hasProvider || ! prompt.trim() }
					onClick={ () =>
						run(
							'edit',
							async () =>
								aiEditLayer( editor, {
									prompt: withBrand( prompt ),
									provider: currentProvider,
									refImage: await brandRef(),
								} ),
							{ needsPrompt: true }
						)
					}
				>
					{ 'edit' === busy ? (
						<span className="spin" />
					) : (
						I.wand( { size: 14 } )
					) }{ ' ' }
					{ __( 'Edit Layer', 'wunderpaint' ) }
				</button>
				<button
					className="ai-btn secondary"
					disabled={ !! busy || ! hasProvider || ! prompt.trim() }
					{ ...tipFor(
						__(
							'Turn the whole canvas (a rough multi-layer sketch) into a finished image, using the flattened sketch as reference.',
							'wunderpaint'
						)
					) }
					onClick={ () => {
						hideTip();
						run(
							'sketch',
							async () =>
								aiFromSketch( editor, {
									prompt: withBrand( prompt ),
									provider: currentProvider,
									aspect: aspectParam,
									refImage: await brandRef(),
								} ),
							{ needsPrompt: true }
						);
					} }
				>
					{ 'sketch' === busy ? (
						<span className="spin" />
					) : (
						I.pencil( { size: 14 } )
					) }{ ' ' }
					{ __( 'From Document', 'wunderpaint' ) }
				</button>
				<button
					className="ai-btn secondary"
					disabled={ !! busy || ! hasProvider }
					{ ...tipFor(
						__(
							'Pick a post; its title, excerpt and content ride along with your prompt, e.g. for a quick article infographic.',
							'wunderpaint'
						)
					) }
					onClick={ () => {
						hideTip();
						setPickPost( true );
					} }
				>
					{ 'frompost' === busy ? (
						<span className="spin" />
					) : (
						I.link( { size: 14 } )
					) }{ ' ' }
					{ __( 'From Post', 'wunderpaint' ) }
				</button>
			</div>

			{ hasBrand && (
				<div
					className="ai-inline-check"
					title={ __(
						'Colors, fonts and logo of the selected Brand Kit ride along; the logo is attached as a reference image.',
						'wunderpaint'
					) }
				>
					<label>
						<input
							type="checkbox"
							checked={ includeBrand }
							onChange={ ( e ) =>
								setIncludeBrand( e.target.checked )
							}
						/>
						{ __( 'Include brand details', 'wunderpaint' ) }
					</label>
					{ brandKits.length > 1 && (
						<select
							className="dsm-select sm"
							value={ brand.id || '' }
							disabled={ ! includeBrand }
							aria-label={ __( 'Brand Kit', 'wunderpaint' ) }
							onChange={ ( e ) =>
								setBrandKitId( e.target.value )
							}
						>
							{ brandKits.map( ( k ) => (
								<option key={ k.id } value={ k.id }>
									{ k.name ||
										__( '(unnamed kit)', 'wunderpaint' ) }
								</option>
							) ) }
						</select>
					) }
				</div>
			) }

			<div
				style={ {
					borderTop: '1px solid var(--ed-border)',
					paddingTop: 10,
					marginTop: 4,
				} }
			>
				{ ( () => {
					const visible = quickActions.filter( ( a ) => ! a.hidden );
					const local = visible.filter(
						( a ) => false === a.needsProvider
					);
					const cloud = visible.filter(
						( a ) => false !== a.needsProvider
					);
					const headStyle = {
						display: 'flex',
						alignItems: 'center',
						gap: 6,
						fontSize: 11,
						color: 'var(--ed-text-muted)',
						textTransform: 'uppercase',
						letterSpacing: 0.5,
						marginBottom: 8,
					};
					const btn = ( action ) => (
						<button
							key={ action.id }
							className="ai-btn secondary"
							{ ...tipFor( action.title ) }
							disabled={ !! busy }
							onClick={ () => {
								// The button disables itself on click; a
								// disabled button fires no mouseleave, so
								// the tip would stick around.
								hideTip();
								run( action.id, action.fn, {
									needsProvider:
										false !== action.needsProvider,
									needsPrompt: !! action.needsPrompt,
									requires: action.requires,
									prepare: action.prepare,
								} );
							} }
						>
							{ busy === action.id ? (
								<span className="spin" />
							) : null }{ ' ' }
							{ action.label }
						</button>
					);
					return (
						<div>
							<div style={ headStyle }>
								{ __( 'Local tools', 'wunderpaint' ) }
							</div>
							<div
								style={ {
									fontSize: 11,
									color: 'var(--ed-text-muted)',
									marginBottom: 8,
									lineHeight: 1.3,
								} }
							>
								{ __(
									'These run entirely in your browser, no key needed, and your image never leaves your site.',
									'wunderpaint'
								) }
							</div>
							<div className="ai-quick-grid">
								{ local.map( btn ) }
								{ /* Extension AI tools (v1.122) run in the
								     same busy/error harness. */ }
								{ listExtensionAiTools().map( ( tool ) =>
									btn( {
										id: tool.id,
										label: tool.label,
										title: tool.title || tool.label,
										needsProvider: false,
										fn: () =>
											tool.run( {
												editor,
												extras,
												layer:
													editor.state.layers.find(
														( l ) =>
															l.id ===
															editor.state
																.activeId
													) || null,
											} ),
									} )
								) }
							</div>

							<div style={ { ...headStyle, marginTop: 16 } }>
								{ __( 'AI cloud', 'wunderpaint' ) }
							</div>
							<div
								style={ {
									fontSize: 11,
									color: 'var(--ed-text-muted)',
									marginBottom: 8,
									lineHeight: 1.3,
								} }
							>
								{ hasProvider
									? __(
											'These run on your configured AI provider and may incur cost.',
											'wunderpaint'
									  )
									: __(
											'These need an AI provider key (may cost).',
											'wunderpaint'
									  ) }
								{ ! hasProvider && ' ' }
								{ ! hasProvider && (
									<a
										href={ WPIE.settingsUrl }
										target="_blank"
										rel="noreferrer"
									>
										{ __(
											'add one in Settings',
											'wunderpaint'
										) }
									</a>
								) }
							</div>
							<div className="ai-quick-grid">
								{ cloud.map( btn ) }
							</div>
						</div>
					);
				} )() }
			</div>

			{ busy &&
				( () => {
					// Float over the canvas, top right (v1.78.1): the panel
					// has grown enough that a card at its bottom scrolls out
					// of sight. Falls back inline if the canvas is not there.
					const host = document.querySelector(
						'#wpie-root .ed-canvas-area'
					);
					const card = (
						<div
							className={ `ai-status${
								host ? ' ai-status-float' : ''
							}` }
							role="status"
							aria-live="polite"
						>
							<div className="ai-status-row">
								<span className="ai-status-spin" />
								<span className="ai-status-label">
									{ busyLabel }
									<span className="ai-status-sub">
										{ __(
											'This can take a few seconds.',
											'wunderpaint'
										) }
									</span>
								</span>
								<button
									type="button"
									className="ai-cancel"
									onClick={ () => {
										cancelled.current = true;
										setBusy( null );
									} }
								>
									{ __( 'Cancel', 'wunderpaint' ) }
								</button>
							</div>
							<div className="ai-status-bar" aria-hidden="true" />
						</div>
					);
					return host ? createPortal( card, host ) : card;
				} )() }

			{ variants && (
				<div
					className="modal-backdrop"
					onClick={ () => setVariants( null ) }
					role="presentation"
				>
					<div
						className="export-dialog"
						onClick={ ( e ) => e.stopPropagation() }
						role="dialog"
						aria-label={ __( 'Choose a variation', 'wunderpaint' ) }
					>
						<div className="dsm-head">
							<span className="dsm-badge">
								{ I.brand( { size: 24 } ) }
							</span>
							<div className="dsm-titles">
								<div className="dsm-title-row">
									<span className="dsm-title">
										{ __(
											'Choose a variation',
											'wunderpaint'
										) }
									</span>
								</div>
								<div className="dsm-sub">
									{ __(
										'Pick the variation to keep; the rest are discarded.',
										'wunderpaint'
									) }
								</div>
							</div>
							<button
								className="dsm-close"
								onClick={ () => setVariants( null ) }
								aria-label={ __( 'Close', 'wunderpaint' ) }
							>
								{ I.close( { size: 17 } ) }
							</button>
						</div>
						<div className="wpie-choice-grid">
							{ variants.map( ( src, i ) => (
								<img
									key={ i }
									src={ src }
									alt={ `Variation ${ i + 1 }` }
									role="button"
									tabIndex={ 0 }
									onClick={ async () => {
										setVariants( null );
										await insertResultLayer(
											editor,
											src,
											__( 'AI Variation', 'wunderpaint' )
										);
									} }
									onKeyDown={ ( e ) =>
										'Enter' === e.key && e.target.click()
									}
								/>
							) ) }
						</div>
					</div>
				</div>
			) }

			{ review && (
				<div
					className="modal-backdrop"
					onClick={ () => setReview( null ) }
					role="presentation"
				>
					<div
						className="stock-dialog"
						style={ {
							width: 520,
							height: 'auto',
							gridTemplateRows: 'auto 1fr',
						} }
						onClick={ ( e ) => e.stopPropagation() }
						role="dialog"
						aria-label={ __( 'Design Review', 'wunderpaint' ) }
					>
						<div className="dsm-head">
							<span className="dsm-badge">
								{ I.brand( { size: 24 } ) }
							</span>
							<div className="dsm-titles">
								<div className="dsm-title-row">
									<span className="dsm-title">
										{ __( 'Design Review', 'wunderpaint' ) }
									</span>
									<HelpLink article="ai" extras={ extras } />
								</div>
								<div className="dsm-sub">
									{ __(
										'One overall verdict plus the changes with the biggest impact - in your editor language.',
										'wunderpaint'
									) }
								</div>
							</div>
							<button
								className="dsm-close"
								onClick={ () => setReview( null ) }
								aria-label={ __( 'Close', 'wunderpaint' ) }
							>
								{ I.close( { size: 17 } ) }
							</button>
						</div>
						<div
							style={ {
								padding: 16,
								display: 'grid',
								gap: 10,
								maxHeight: 420,
								overflowY: 'auto',
							} }
						>
							{ ( () => {
								const lines = review
									.split( '\n' )
									.map( ( line ) => line.trim() )
									.filter( Boolean );
								const overall = lines
									.filter( ( l ) => -1 === l.indexOf( '|' ) )
									.map( ( l ) =>
										l.replace( /^OVERALL:\s*/i, '' )
									)
									.join( ' ' );
								const findings = lines
									.filter( ( l ) => -1 !== l.indexOf( '|' ) )
									.map( ( l ) =>
										l
											.replace( /^[-•*]\s*/, '' )
											.split( '|' )
											.map( ( part ) => part.trim() )
									);
								return (
									<>
										<div
											style={ {
												fontSize: 13,
												lineHeight: 1.55,
												fontWeight: 600,
											} }
										>
											{ overall }
										</div>
										{ findings.map( ( f, i ) => (
											<div
												key={ i }
												style={ {
													borderLeft:
														'3px solid var(--ed-accent, #3b66ff)',
													padding: '2px 0 2px 10px',
													display: 'grid',
													gap: 2,
												} }
											>
												<span
													style={ {
														fontSize: 10.5,
														fontWeight: 700,
														letterSpacing: 0.6,
														textTransform:
															'uppercase',
														color: 'var(--ed-text-muted)',
													} }
												>
													{ f[ 0 ] }
												</span>
												<span
													style={ {
														fontSize: 13,
														lineHeight: 1.5,
													} }
												>
													{ f[ 1 ] }
												</span>
												{ f[ 2 ] && (
													<span
														style={ {
															fontSize: 13,
															lineHeight: 1.5,
															color: 'var(--ed-accent, #3b66ff)',
														} }
													>
														{ f[ 2 ] }
													</span>
												) }
											</div>
										) ) }
									</>
								);
							} )() }
						</div>
					</div>
				</div>
			) }
			{ textAlts && (
				<div
					className="modal-backdrop"
					onClick={ () => setTextAlts( null ) }
					role="presentation"
				>
					<div
						className="stock-dialog"
						style={ {
							width: 520,
							height: 'auto',
							gridTemplateRows: 'auto 1fr',
						} }
						onClick={ ( e ) => e.stopPropagation() }
						role="dialog"
						aria-label={ __( 'Improve Text', 'wunderpaint' ) }
					>
						<div className="dsm-head">
							<span className="dsm-badge">
								{ I.brand( { size: 24 } ) }
							</span>
							<div className="dsm-titles">
								<div className="dsm-title-row">
									<span className="dsm-title">
										{ __( 'Improve Text', 'wunderpaint' ) }
									</span>
									<HelpLink article="ai" extras={ extras } />
								</div>
								<div className="dsm-sub">
									{ __(
										'Pick an alternative - it replaces the text on the layer, undo brings the old one back.',
										'wunderpaint'
									) }
								</div>
							</div>
							<button
								className="dsm-close"
								onClick={ () => setTextAlts( null ) }
								aria-label={ __( 'Close', 'wunderpaint' ) }
							>
								{ I.close( { size: 17 } ) }
							</button>
						</div>
						<div
							style={ {
								padding: 16,
								display: 'grid',
								gap: 8,
								maxHeight: 440,
								overflowY: 'auto',
							} }
						>
							<div
								style={ {
									fontSize: 11,
									color: 'var(--ed-text-muted)',
									whiteSpace: 'pre-wrap',
								} }
							>
								{ __( 'Original:', 'wunderpaint' ) }{ ' ' }
								{ textAlts.original }
							</div>
							{ textAlts.alternatives.map( ( alt, i ) => (
								<button
									key={ i }
									className="ai-btn secondary"
									style={ {
										textAlign: 'left',
										whiteSpace: 'pre-wrap',
										lineHeight: 1.45,
										padding: 10,
									} }
									onClick={ () => {
										editor.dispatch( {
											type: 'UPDATE_LAYER',
											id: textAlts.layerId,
											patch: { text: alt },
										} );
										editor.commit(
											__( 'Improve Text', 'wunderpaint' )
										);
										setTextAlts( null );
										extras.toasts.success(
											__(
												'Text replaced - undo restores the original.',
												'wunderpaint'
											)
										);
									} }
								>
									{ alt }
								</button>
							) ) }
						</div>
					</div>
				</div>
			) }
			{ pickPost && (
				<PostPickerDialog
					extras={ extras }
					heading={ __( 'From Post', 'wunderpaint' ) }
					subheading={ __(
						'The picked post’s content rides along with your prompt.',
						'wunderpaint'
					) }
					onPick={ generateFromPost }
					onClose={ () => setPickPost( false ) }
				/>
			) }

			{ tipNode }
		</div>
	);
}
