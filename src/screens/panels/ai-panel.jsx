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
import { guardedRun } from '../../lib/run-guard';
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
	selectByText,
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
import {
	builtinAiButtons,
	resolveAiButtons,
	runAiButton,
} from '../../lib/ai-buttons';
import { PostPickerDialog } from '../post-picker-dialog';
import { HelpLink } from '../help-dialog';
import { StyleButton } from '../../components/style-picker';
import { useTip } from '../../components/use-tip';

/**
 * Quick actions the standalone studio cannot perform.
 *
 * The studio talks to the visitor's own key through src/standalone/byok.js,
 * and that only knows generate, edit and complete. Inpaint, Outpaint and
 * Variations have no route there at all: pressing them answered "This AI
 * feature is not wired up in the standalone studio yet". What the studio
 * cannot do it hides rather than offering it broken, so they are dropped from
 * the grid below.
 *
 * Hidden HERE and not in src/standalone/trim-ui.js, which is otherwise the
 * place for this: that file matches the VISIBLE label, so each entry needs its
 * translation shipped alongside, while this rule holds in all seven languages.
 * The plugin is untouched by it - window.WPIE.standalone is only ever true in
 * the studio build.
 *
 * The cloud "Remove Object" deliberately stays: it catches the missing
 * provider and falls back to the local onion-peel fill (ai-actions.js), so in
 * the studio it does its job without a key.
 */
const STANDALONE_DEAD_ACTIONS = [ 'inpaint', 'outpaint', 'variations' ];

// Block C (Thomas, 16.09.2026): every built-in button is an icon tile
// sized like the library tray's cards; the caption wraps, it is never cut.
// One glyph per id; an extension tool without one gets the wand.
const TOOL_GLYPH = {
	selectSubject:
		'M4 4h4M16 4h4M4 20h4M16 20h4M4 4v4M4 16v4M20 4v4M20 16v4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
	selectByText:
		'M4 4h4M16 4h4M4 20h4M16 20h4M4 4v4M4 16v4M20 4v4M20 16v4M9 10h6M12 10v5',
	removeObjectLocal: 'M3 17l9-9 5 5-6 6H7zM13 21h8',
	removeObject:
		'M3 17l9-9 5 5-6 6H7zM13 21h5M18 3l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z',
	enhanceLayer:
		'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 17l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6z',
	enhanceDesign:
		'M4 5h16v14H4zM4 11h16M10 11v8M15 6.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z',
	designReview:
		'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
	improveText: 'M5 6h14M12 6v14M8 20h8',
	removeBg:
		'M6 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM20 4L8.5 15.5M20 20L8.5 8.5',
	blurBg: 'M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20a7 7 0 0 1 14 0M3 6h2M19 6h2M3 10h2M19 10h2',
	depthBlur: 'M3 18c3-5 6-5 9 0s6 5 9 0M3 12c3-5 6-5 9 0s6 5 9 0M12 3v4',
	blurfaces:
		'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 10h2v2H8zM14 10h2v2h-2zM9 16h6',
	vectorize: 'M4 20c4-8 8-12 16-16M4 20l4-1-3-3zM14 6l4 4',
	upscale: 'M4 10V4h6M20 14v6h-6M4 4l6 6M20 20l-6-6',
	inpaint: 'M4 4h16v16H4zM8 16c0-3 2-4 4-6l2 2c-2 2-3 4-6 4z',
	outpaint:
		'M8 8h8v8H8zM4 12H2M22 12h-2M12 4V2M12 22v-2M4 4l2 2M20 4l-2 2M4 20l2-2M20 20l-2-2',
	enhance:
		'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
	colorize:
		'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11zM9 14a3 3 0 0 0 3 3',
	cartoon: 'M4 5h16v11H9l-5 4zM9 9h.01M12 9h.01M15 9h.01',
	restore:
		'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M14 7l1 1.5L16.5 9 15 9.5 14 11l-1-1.5L11.5 9l1.5-.5z',
	replaceBg:
		'M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 20a6 6 0 0 1 12 0M3 3l3 3-3 3M21 21l-3-3 3-3',
	refineEdges:
		'M6 6h12v12H6zM6 3v1M18 3v1M6 20v1M18 20v1M3 6h1M3 18h1M20 6h1M20 18h1',
	cropSubject: 'M6 2v16h16M2 6h16v16',
	sticker:
		'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
	textBehind:
		'M4 5h10M9 5v8M15 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM9 21a6 6 0 0 1 12 0',
	colorPop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11zM12 3v17',
	productShot: 'M7 7h10v8H7zM4 19h16M9 15v4M15 15v4',
	neonRim:
		'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v3M12 19v3M2 12h3M19 12h3',
	speedBlur: 'M14 6l4 6-4 6M3 8h8M2 12h9M3 16h8',
	depthFog: 'M3 20c3-6 6-6 9 0s6 6 9 0M3 14h5M10 14h4M17 14h4M5 9h4M14 9h5',
	variations: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
};
const WAND =
	'M4 20l10-10M13 3l1 3 3 1-3 1-1 3-1-3-3-1 3-1zM19 13l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z';

const ToolGlyph = ( { id } ) => (
	<svg
		width="22"
		height="22"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.7"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d={ TOOL_GLYPH[ id ] || WAND } />
	</svg>
);

export function AIPanel( { extras } ) {
	const editor = useEditor();
	const { state, WPIE } = editor;
	const [ prompt, setPrompt ] = useState( '' );
	const [ provider, setProvider ] = useState(
		WPIE.defaultProvider || 'gemini'
	);
	const [ aspect, setAspect ] = useState( 'auto' ); // generation format (v1.5)
	const [ vecOut, setVecOut ] = useState( false ); // paths, not pixels (v1.378)
	// P10: output format and transparency live at the action, not in a
	// settings page. PNG stays the default (lossless, exactly the old
	// behaviour); JPEG is the small-and-fast choice for photographic
	// results. Transparency is a GPT-image capability - Gemini has none,
	// so the checkbox greys out there instead of hiding.
	const [ outFormat, setOutFormat ] = useState( 'png' );
	const [ outTransparent, setOutTransparent ] = useState( false );
	// 'auto' and '360°' are UI modes, never provider aspect strings.
	const aspectParam =
		'auto' === aspect || '360°' === aspect ? undefined : aspect;
	const [ busy, setBusy ] = useState( null ); // action id
	// A running action's own progress line (AI upscale: "part 3 of 12").
	const [ busyNote, setBusyNote ] = useState( null );
	// Stops actions that can stop between steps (AI upscale) on Cancel.
	const abortRun = useRef( null );
	// Extension AI tools may register after mount (v1.122).
	const [ , setExtTick ] = useState( 0 );
	useEffect(
		() => subscribeExtensions( () => setExtTick( ( t ) => t + 1 ) ),
		[]
	);
	const [ variants, setVariants ] = useState( null );
	const [ review, setReview ] = useState( null ); // Design Review text (v1.378)
	const [ textAlts, setTextAlts ] = useState( null ); // Improve Text (v1.378)
	// AI Studio Buttons (spec 2026-09-16): the dialog saves the site option
	// and says so; the sections are rebuilt from window.WPIE on the next
	// render, which this tick provokes.
	const [ , setButtonsTick ] = useState( 0 );
	useEffect( () => {
		const bump = () => setButtonsTick( ( t ) => t + 1 );
		window.addEventListener( 'wpie:ai-buttons-updated', bump );
		return () =>
			window.removeEventListener( 'wpie:ai-buttons-updated', bump );
	}, [] );
	const [ includeBrand, setIncludeBrand ] = useState( false );
	const [ pickPost, setPickPost ] = useState( false );
	const cancelled = useRef( false );
	const runGuard = useRef( null );

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
	// What the two buttons hand to the actions; transparency only ever
	// rides when it can work (PNG on an OpenAI image model).
	const outputParams = {
		format: outFormat,
		transparent:
			'png' === outFormat &&
			'openai' === currentProvider &&
			outTransparent
				? true
				: undefined,
	};

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
			// ( _p, ed ): the revocable view of THIS run, not the outer editor.
			// run() hands it in as guard.editor and the thirty-odd quickActions
			// all take it. The four big buttons closed over `editor` instead, so
			// Cancel revoked a view nobody wrote through and a late result still
			// dispatched UPDATE_LAYER and commit() - exactly the damage
			// src/lib/run-guard.js was built against, and it hit only the slow
			// actions, the ones it was built for.
			async ( _p, ed ) =>
				aiGenerate( ed, {
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
		// One editor view per run. Cancel revokes THIS view, so a result that
		// comes back late cannot write into the document any more - the flag
		// alone could not do that: the next run reset it, and the late write
		// of the run before sailed through onto the same layer.
		const guard = guardedRun( editor );
		runGuard.current = guard;
		abortRun.current = new window.AbortController();
		setBusyNote( null );
		setBusy( id );
		try {
			await fn( prepared, guard.editor );
			if ( guard.revoked() ) {
				extras.toasts.toast(
					__(
						'Canceled. The result arrived afterwards and was discarded.',
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
		abortRun.current = null;
		setBusyNote( null );
		setBusy( null );
	};

	// Every quick action explains itself via tooltip (v1.4.3).
	// The runnable side of every built-in button: id plus closure. Label,
	// tooltip, kind and order come from the table in lib/ai-buttons.js, own
	// buttons and hiding from the site option (spec 2026-09-16).
	const quickActions = [
		{
			id: 'selectSubject',
			needsProvider: false, // local subject model (v0.2)
			fn: ( _p, ed ) => selectSubject( ed ),
		},
		{
			// Florence-2 finds it, SlimSAM cuts it (20.10.2026).
			id: 'selectByText',
			needsProvider: false,
			needsPrompt: true,
			fn: ( _p, ed ) => selectByText( ed, prompt ),
		},
		{
			id: 'removeObjectLocal',
			needsProvider: false,
			requires: 'selection',
			fn: ( _p, ed ) => removeObjectLocal( ed ),
		},
		{
			id: 'enhanceLayer',
			fn: ( _p, ed ) =>
				aiEnhanceLayer( ed, { provider: currentProvider } ),
		},
		{
			id: 'enhanceDesign',
			fn: ( _p, ed ) =>
				aiEnhanceDesign( ed, { provider: currentProvider } ),
		},
		{
			id: 'designReview',
			fn: async ( _p, ed ) => setReview( await designReview( ed ) ),
		},
		{
			id: 'improveText',
			fn: async ( _p, ed ) =>
				setTextAlts( await improveTextAlternatives( ed ) ),
		},
		{
			id: 'removeObject',
			requires: 'selection',
			fn: ( _p, ed ) => removeObject( ed, { provider: currentProvider } ),
		},
		{
			id: 'removeBg',
			needsProvider: false, // guaranteed local (spec 11.1)
			fn: ( _p, ed ) => aiRemoveBg( ed ),
		},
		{
			id: 'blurBg',
			needsProvider: false, // local subject model (v0.4)
			prepare: () =>
				promptDialog( {
					title: __( 'Blur Background', 'wunderpaint' ),
					label: __( 'Blur radius (px)', 'wunderpaint' ),
					type: 'number',
					defaultValue: '18',
				} ),
			fn: ( value, ed ) =>
				blurBackground( ed, {
					radius: Math.max( 1, parseInt( value, 10 ) || 18 ),
				} ),
		},
		{
			id: 'depthBlur',
			needsProvider: false, // local Depth Anything (v1.27)
			fn: () => extras.openDepthBlur(),
		},
		{
			id: 'blurfaces',
			needsProvider: false, // bundled face finder, Florence-2 adds (20.10.2026)
			fn: async ( _p, ed ) => {
				const r = await aiBlurFaces( ed );
				extras.toasts.success(
					sprintf(
						/* translators: %d: face count. */
						__( 'Made %d face(s) unrecognizable.', 'wunderpaint' ),
						r.count
					)
				);
			},
		},
		{
			id: 'vectorize',
			needsProvider: false, // imagetracerjs, pure JS (v1.77)
			fn: async ( _p, ed ) => {
				const parsed = await vectorizeActiveLayer( ed );
				placeSvgLayers(
					ed,
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
		},
		{
			id: 'upscale',
			needsProvider: false,
			fn: async ( _p, ed ) => {
				const r = await aiUpscale( ed, 2, {
					signal: abortRun.current?.signal,
					onProgress: ( done, total ) =>
						setBusyNote(
							sprintf(
								/* translators: 1: finished part, 2: all parts. */
								__(
									'Adding detail with AI: part %1$d of %2$d.',
									'wunderpaint'
								),
								done,
								total
							)
						),
				} );
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
					) +
						( r.ai
							? ''
							: ' ' +
							  __(
									'This picture is too large for the AI upscaler, so it was enlarged without added detail.',
									'wunderpaint'
							  ) )
				);
			},
		},
		{
			id: 'inpaint',
			needsPrompt: true,
			requires: 'selection',
			fn: ( _p, ed ) =>
				aiInpaint( ed, { prompt, provider: currentProvider } ),
		},
		{
			id: 'outpaint',
			fn: ( _p, ed ) =>
				aiOutpaint( ed, { prompt, provider: currentProvider } ),
		},
		{
			id: 'enhance',
			needsProvider: false,
			fn: ( _p, ed ) => aiEnhance( ed ),
		},
		{
			id: 'colorize',
			fn: ( _p, ed ) => aiColorize( ed, { provider: currentProvider } ),
		},
		{
			id: 'cartoon',
			fn: ( _p, ed ) => aiCartoon( ed, { provider: currentProvider } ),
		},
		{
			id: 'restore',
			fn: ( _p, ed ) => aiRestore( ed, { provider: currentProvider } ),
		},
		{
			id: 'replaceBg',
			needsPrompt: true,
			fn: ( _p, ed ) =>
				replaceBackground( ed, {
					prompt,
					provider: currentProvider,
				} ),
		},
		{
			id: 'refineEdges',
			needsProvider: false,
			fn: ( _p, ed ) => refineEdges( ed ),
		},
		{
			id: 'cropSubject',
			needsProvider: false,
			fn: ( _p, ed ) => cropToSubject( ed ),
		},
		{
			id: 'sticker',
			needsProvider: false,
			fn: ( _p, ed ) => makeSticker( ed ),
		},
		{
			id: 'textBehind',
			needsProvider: false,
			fn: ( _p, ed ) => textBehindSubject( ed ),
		},
		{
			id: 'colorPop',
			needsProvider: false,
			fn: ( _p, ed ) => colorPop( ed ),
		},
		{
			id: 'productShot',
			needsProvider: false,
			fn: ( _p, ed ) => productShot( ed ),
		},
		{
			id: 'neonRim',
			needsProvider: false,
			fn: ( _p, ed ) => neonRim( ed ),
		},
		{
			id: 'speedBlur',
			needsProvider: false,
			fn: ( _p, ed ) => speedBlur( ed ),
		},
		{
			id: 'depthFog',
			needsProvider: false,
			fn: ( _p, ed ) => depthFog( ed ),
		},
		{
			id: 'variations',
			fn: async ( _p, ed ) => setVariants( await aiVariations( ed, 2 ) ),
			hidden: ! WPIE.providers?.openai, // dall-e-2 only (spec 11.1)
		},
	];

	const fnById = Object.fromEntries(
		quickActions.map( ( a ) => [ a.id, a ] )
	);
	const sections = resolveAiButtons(
		window.WPIE?.aiButtons || null,
		builtinAiButtons()
	);
	const toAction = ( row ) => {
		if ( row.custom ) {
			return {
				id: row.id,
				label: row.label,
				title: row.title,
				custom: row.custom,
				fn: async ( _p, ed ) => {
					const r = await runAiButton( ed, row.custom, {
						provider: currentProvider,
					} );
					if ( 'alternatives' === r.kind ) {
						setTextAlts( r );
					}
				},
			};
		}
		const a = fnById[ row.id ];
		return a ? { ...a, label: row.label, title: row.title } : null;
	};
	const localActions = sections.local.map( toAction ).filter( Boolean );
	const cloudActions = sections.cloud.map( toAction ).filter( Boolean );

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
		const qa = [ ...localActions, ...cloudActions ].find(
			( a ) => a.id === busy
		);
		return qa ? qa.label + '…' : __( 'Working…', 'wunderpaint' );
	} )();

	return (
		<div className="ai-panel">
			<div
				style={ {
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					marginBottom: -2,
				} }
			>
				<span
					style={ {
						fontSize: 11,
						fontWeight: 600,
						color: 'var(--ed-text)',
						textTransform: 'uppercase',
						letterSpacing: 0.5,
					} }
				>
					{ __( 'Prompt', 'wunderpaint' ) }
				</span>
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
						fontSize: 11,
						fontWeight: 600,
						color: 'var(--ed-text)',
						textTransform: 'uppercase',
						letterSpacing: 0.5,
					} }
				>
					{ __( 'AI Image Provider', 'wunderpaint' ) }
				</span>
				{ hasProvider ? (
					<select
						className="dsm-select"
						value={ currentProvider }
						onChange={ ( e ) => setProvider( e.target.value ) }
						aria-label={ __( 'AI Image Provider', 'wunderpaint' ) }
					>
						{ providers.map( ( id ) => (
							<option key={ id } value={ id }>
								{ PROVIDER_LABELS[ id ] }
							</option>
						) ) }
					</select>
				) : (
					<span className="ai-local-note">
						{ __( 'No provider, local tools only', 'wunderpaint' ) }
					</span>
				) }
			</div>

			<div style={ { display: 'grid', gap: 4 } }>
				<span
					style={ {
						fontSize: 11,
						fontWeight: 600,
						color: 'var(--ed-text)',
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
				<div className="ai-inline-check">
					<label
						{ ...tipFor(
							__(
								'PNG is lossless; JPEG is a fraction of the size and fine for photographic results.',
								'wunderpaint'
							)
						) }
					>
						{ __( 'Format', 'wunderpaint' ) }{ ' ' }
						<select
							value={ outFormat }
							onChange={ ( e ) => setOutFormat( e.target.value ) }
						>
							<option value="png">PNG</option>
							<option value="jpeg">JPEG</option>
						</select>
					</label>
					{ 'png' === outFormat && (
						<label
							{ ...tipFor(
								'openai' === currentProvider
									? __(
											'The model leaves the background out - a real alpha channel, not a checkerboard.',
											'wunderpaint'
									  )
									: __(
											'Only the OpenAI image models can return real transparency.',
											'wunderpaint'
									  )
							) }
						>
							<input
								type="checkbox"
								disabled={ 'openai' !== currentProvider }
								checked={
									'openai' === currentProvider &&
									outTransparent
								}
								onChange={ ( e ) =>
									setOutTransparent( e.target.checked )
								}
							/>
							{ __( 'Transparent background', 'wunderpaint' ) }
						</label>
					) }
				</div>
			</div>

			<div className="ai-actions">
				<button
					className="ai-btn primary"
					disabled={ !! busy || ! hasProvider || ! prompt.trim() }
					onClick={ () =>
						run(
							'generate',
							async ( _p, ed ) => {
								if ( '360°' === aspect ) {
									await aiGeneratePanorama( ed, {
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
									const parsed = await aiGenerateVector( ed, {
										prompt: withBrand( prompt ),
										provider: currentProvider,
										aspect: aspectParam,
									} );
									placeSvgLayers(
										ed,
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
								await aiGenerate( ed, {
									prompt: withBrand( prompt ),
									provider: currentProvider,
									aspect: aspectParam,
									refImage: await brandRef(),
									...outputParams,
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
							async ( _p, ed ) =>
								aiEditLayer( ed, {
									prompt: withBrand( prompt ),
									provider: currentProvider,
									refImage: await brandRef(),
									...outputParams,
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
							async ( _p, ed ) =>
								aiFromSketch( ed, {
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
					const usable = ( a ) =>
						! a.hidden &&
						! (
							window.WPIE?.standalone &&
							STANDALONE_DEAD_ACTIONS.includes( a.id )
						);
					const local = localActions.filter( usable );
					const cloud = cloudActions.filter(
						( a ) => usable( a ) && ! a.custom
					);
					// AI Presets (spec 2026-09-16, block C try-out): the
					// site's own presets sit at the top as list cards with
					// the reference image, title and description; admins
					// (the browser's owner in the studio) get the manager
					// link here and, without presets yet, a first-step card.
					const own = cloudActions.filter(
						( a ) => usable( a ) && a.custom
					);
					const canManage =
						!! (
							window.WPIE?.canManage || window.WPIE?.standalone
						) && !! extras?.openAiButtons;
					const headStyle = {
						display: 'flex',
						alignItems: 'center',
						gap: 6,
						fontSize: 11,
						fontWeight: 600,
						color: 'var(--ed-text)',
						textTransform: 'uppercase',
						letterSpacing: 0.5,
						marginBottom: 8,
					};
					const tile = ( action ) => (
						<button
							key={ action.id }
							type="button"
							className="ai-tile"
							{ ...tipFor( action.title ) }
							disabled={ !! busy }
							onClick={ () => {
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
							<span className="ai-tile-icon">
								{ busy === action.id ? (
									<span className="spin" />
								) : (
									<ToolGlyph id={ action.id } />
								) }
							</span>
							<span className="ai-tile-name">
								{ action.label }
							</span>
						</button>
					);
					const presetCard = ( action ) => {
						const c = action.custom;
						const thumb = c.refThumbUrl || c.refImageUrl || '';
						return (
							<button
								key={ action.id }
								type="button"
								className="ai-preset"
								{ ...tipFor( action.title ) }
								disabled={ !! busy }
								onClick={ () => {
									hideTip();
									run( action.id, action.fn, {
										needsProvider: true,
									} );
								} }
							>
								<span className="ai-preset-thumb">
									{ thumb ? (
										<img src={ thumb } alt="" />
									) : 'text' === c.input ? (
										I.pencil( { size: 15 } )
									) : (
										I.image( { size: 15 } )
									) }
								</span>
								<span className="ai-preset-text">
									<b>{ action.label }</b>
									<small>{ c.description || c.prompt }</small>
								</span>
								{ busy === action.id ? (
									<span className="spin" />
								) : null }
							</button>
						);
					};
					return (
						<div>
							{ ( own.length > 0 || canManage ) && (
								<div className="ai-presets-sect">
									<div
										style={ headStyle }
										className="ai-presets-head"
									>
										<span>
											{ __(
												'Your presets',
												'wunderpaint'
											) }
										</span>
										{ canManage && (
											<button
												type="button"
												className="ai-panel-link"
												onClick={ () =>
													extras.openAiButtons()
												}
											>
												{ __(
													'Manage',
													'wunderpaint'
												) }
											</button>
										) }
									</div>
									<div className="ai-presets">
										{ own.map( presetCard ) }
										{ ! own.length && canManage && (
											<button
												type="button"
												className="ai-preset ai-preset-add"
												onClick={ () =>
													extras.openAiButtons()
												}
											>
												<span className="ai-preset-thumb">
													{ I.plus( { size: 15 } ) }
												</span>
												<span className="ai-preset-text">
													<b>
														{ __(
															'Add your first preset',
															'wunderpaint'
														) }
													</b>
													<small>
														{ __(
															'Your own prompt, one click away.',
															'wunderpaint'
														) }
													</small>
												</span>
											</button>
										) }
									</div>
								</div>
							) }
							<div style={ headStyle }>
								{ __( 'Local tools', 'wunderpaint' ) }
							</div>
							<div
								style={ {
									fontSize: 11,
									color: 'var(--ed-text-muted)',
									marginTop: -5,
									marginBottom: 8,
									lineHeight: 1.3,
								} }
							>
								{ __(
									'These run entirely in your browser, no key needed, and your image never leaves your site.',
									'wunderpaint'
								) }
							</div>
							<div className="ai-tiles">
								{ local.map( tile ) }
								{ /* Extension AI tools (v1.122) run in the
								     same busy/error harness. */ }
								{ listExtensionAiTools().map( ( tool ) =>
									tile( {
										id: tool.id,
										label: tool.label,
										title: tool.title || tool.label,
										needsProvider: false,
										fn: ( _p, ed ) =>
											tool.run( {
												editor: ed,
												extras,
												layer:
													ed.state.layers.find(
														( l ) =>
															l.id ===
															ed.state.activeId
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
									marginTop: -5,
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
							</div>
							<div className="ai-tiles">
								{ cloud.map( tile ) }
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
										{ busyNote ||
											__(
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
										if ( runGuard.current ) {
											runGuard.current.revoke();
										}
										abortRun.current?.abort();
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
						aria-modal="true"
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
						aria-modal="true"
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
						aria-modal="true"
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
