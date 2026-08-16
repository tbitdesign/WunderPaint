/**
 * Export / Save dialog (spec 07.2): modes save | saveAs | export, live
 * flattened preview, PNG/JPEG/WebP (+PSD via plan task 34), quality/scale,
 * metadata with AI alt text, sidecar project file, real save pipeline.
 */

import {
	useState,
	useEffect,
	useMemo,
	Fragment,
	useId,
} from '@wordpress/element';
import { HelpLink } from './help-dialog';
import { hasTextProvider } from '../lib/providers';
import { useEscape } from '../components/use-escape';
import { __, _n, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { serializeLayers, hydrateLayers, loadImage } from '../store/document';
import { applyWatermark } from '../lib/watermark';
import {
	MOTIFS,
	VARIANTS,
	motif as aiMotif,
	labelUrl,
	applyAiLabel,
} from '../lib/eu-ai-labels';
import { SUPPORTED_MIME, blobWithSourceType } from '../lib/image-metadata';
import { promptDialog as promptDialogRef } from '../lib/dialogs';
import {
	renderToBlob,
	renderToDataURL,
	renderToCanvas as renderToCanvasHelper,
	sharedImageCache,
} from '../lib/raster';
import { resolveBindings } from '../lib/dynamic-content';
import {
	prepareGeneratorLayers,
	needsGeneratorPrepare,
} from '../lib/generator-resolve';
import {
	saveToLibrary,
	saveAsNew,
	buildFormData,
	getMediaMeta,
	ai,
	request,
} from '../lib/api';
import {
	isEmbedded,
	isLibraryEmbed,
	embedHostLabel,
	postApplied,
} from '../lib/embed-host';
import { downloadBlob } from '../lib/download';
import { canRecordWebm } from '../lib/canvas-record';
import { getPsdExporter } from '../lib/psd-registry';
import { buildFaviconZip, buildPdf, buildPdfPages } from '../lib/favicon-pdf';
import { PRESETS } from '../store/constants';
import { batchExport } from '../lib/batch-export';
import {
	exportGif,
	exportApng,
	exportWebM,
	gifFrameLayers,
} from '../lib/gif-export';
import { listExtensionExportFormats } from '../lib/extensions';
import { runWetFlush } from '../lib/wet-hooks';
import { SwatchButton } from '../components/color-popover';
import {
	listExportPresets,
	saveExportPreset,
	deleteExportPreset,
} from '../lib/export-presets';

export function ExportDialog( { mode, onClose, extras } ) {
	// Unique per mounted dialog, so two of them can never share an id.
	const fieldId = useId();
	useEscape( onClose );
	const editor = useEditor();
	const { state, dispatch, WPIE } = editor;
	const { doc } = state;

	// Saving and exporting both come through this dialog: a wet watercolour
	// wash dries into its layer NOW, or the file would silently miss it.
	useEffect( () => {
		runWetFlush();
	}, [] );

	// Dynamic templates (v1.79.2): with a post preview active, export and
	// save render what the canvas shows — the resolved bindings — instead
	// of the raw placeholder values. The project JSON stays untouched, so
	// the template itself keeps its placeholders.
	// Generator layers (API 2.3) prepare asynchronously; the tick re-runs
	// the memo once their re-baked pixels are ready.
	const [ generatorTick, setGeneratorTick ] = useState( 0 );
	useEffect( () => {
		if (
			! state.previewPost?.ctx ||
			! needsGeneratorPrepare( state.layers )
		) {
			return undefined;
		}
		let alive = true;
		prepareGeneratorLayers( state.layers, state.previewPost.ctx ).then(
			() => {
				if ( alive ) {
					setGeneratorTick( ( t ) => t + 1 );
				}
			}
		);
		return () => {
			alive = false;
		};
	}, [ state.layers, state.previewPost ] );
	const layers = useMemo( () => {
		void generatorTick;
		return state.previewPost?.ctx
			? resolveBindings( state.layers, state.previewPost.ctx )
			: state.layers;
	}, [ state.layers, state.previewPost, generatorTick ] );

	const [ format, setFormat ] = useState( 'png' );
	const [ quality, setQuality ] = useState( 92 );
	// JPEG/PDF cannot store transparency; without flattening, transparent
	// pixels turn BLACK in the encoder (v1.130.0). User-pickable backdrop.
	const [ flattenBg, setFlattenBg ] = useState( '#ffffff' );
	const transparentDoc = ! doc.bg || 'transparent' === doc.bg;
	const needsFlatten =
		transparentDoc && ( 'jpeg' === format || 'pdf' === format );
	const outDoc = needsFlatten ? { ...doc, bg: flattenBg } : doc;
	const [ scale, setScale ] = useState( 1 );
	// Multi-page designs (v1.11) download in one go: raster pages as a
	// ZIP, PDF as ONE multi-page file. The exotic encoders (PSD,
	// animations, favicon sets, extension formats) stay single-page.
	const [ allPages, setAllPages ] = useState( false );
	const pageList = state.pages?.list || null;
	const canAllPages =
		'export' === mode &&
		!! pageList &&
		pageList.length > 1 &&
		[ 'png', 'jpeg', 'webp', 'avif', 'pdf' ].includes( format );
	const [ preview, setPreview ] = useState( null );
	const [ busy, setBusy ] = useState( false );
	const [ captionBusy, setCaptionBusy ] = useState( false );
	const [ keepProject, setKeepProject ] = useState( true );
	// Apply-to-element target (v1.305): copy (default) or overwrite the
	// original attachment; `usage` is the best-effort other-uses count.
	const [ applyTarget, setApplyTarget ] = useState( 'copy' );
	const [ usage, setUsage ] = useState( null );
	const [ versionNote, setVersionNote ] = useState( '' );
	const [ batchSizes, setBatchSizes ] = useState( [] ); // preset ids
	const [ batchBusy, setBatchBusy ] = useState( false );
	const [ gifDelay, setGifDelay ] = useState( 500 ); // v1.0
	// Watermark sources (v1.135.2): the Brand Kit watermarks, plus the
	// legacy Settings watermark as a fallback entry while old data exists.
	// Placement (position, size, opacity, margin) follows the last used
	// Batch Watermark settings, so export and batch stay consistent.
	const wmSources = useMemo( () => {
		const kits = ( window.WPIE?.brandKits || [] )
			.filter( ( k ) => k.watermarkUrl )
			.map( ( k ) => ( {
				id: 'kit-' + k.id,
				name: k.name,
				url: k.watermarkUrl,
			} ) );
		const legacy = WPIE.watermark?.url
			? [
					{
						id: 'legacy',
						name: __( 'Default', 'wunderpaint' ),
						url: WPIE.watermark.url,
					},
			  ]
			: [];
		return [ ...kits, ...legacy ];
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );
	const wmPlacement = useMemo( () => {
		try {
			const stored = JSON.parse(
				window.localStorage.getItem( 'wpie-batch-watermark' ) || 'null'
			);
			if ( stored?.pos ) {
				return stored;
			}
		} catch ( e ) {}
		const legacy = WPIE.watermark;
		return {
			pos: legacy?.pos || 'br',
			scale: legacy?.scale || 20,
			opacity: legacy?.opacity ?? 70,
			margin: legacy?.margin ?? 16,
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );
	const [ wmId, setWmId ] = useState( () =>
		'export' === mode && wmSources[ 0 ] ? wmSources[ 0 ].id : ''
	);
	const wm = wmSources.find( ( src ) => src.id === wmId ) || null;
	const applyWm = !! wm;
	const [ wmImg, setWmImg ] = useState( null );
	// EU AI-labelling emblems (v1.400.0). Purely opt-in: no motif is
	// preselected, nothing inspects the document, and with `aiLabel` empty
	// this whole block is inert. See the header of lib/eu-ai-labels.js for
	// why there is deliberately no detection and no suggestion.
	const [ aiLabel, setAiLabel ] = useState( '' );
	const [ aiVariant, setAiVariant ] = useState( 'black' );
	const [ aiPos, setAiPos ] = useState( 'br' );
	const [ aiScale, setAiScale ] = useState( null );
	const [ aiMeta, setAiMeta ] = useState( false );
	const [ aiImg, setAiImg ] = useState( null );
	// Derived, never stored: a source type kept in its own state would go on
	// claiming "fully AI-generated" after the user switched to another motif.
	const aiSourceType = aiLabel && aiMeta ? aiMotif( aiLabel ).sourceType : '';
	const [ exportPresets, setExportPresets ] = useState( listExportPresets );
	const [ meta, setMeta ] = useState( {
		filename: doc.name || 'untitled',
		alt: '',
		title: doc.name || '',
		caption: '',
		description: '',
	} );

	// Watermark image (v0.3), loaded once when configured.
	useEffect( () => {
		if ( wm?.url ) {
			loadImage( wm.url )
				.then( setWmImg )
				.catch( () => setWmImg( null ) );
		}
	}, [ wm?.url ] );
	// The emblem files carry a viewBox and NO width/height, which would decode
	// at naturalWidth 0 and make applyWatermark() bail out without drawing.
	// loadImage() already routes SVG sources through sizedSvgUrl() and revokes
	// the temporary copy itself (document.js), so nothing extra is needed here.
	useEffect( () => {
		if ( ! aiLabel ) {
			setAiImg( null );
			return undefined;
		}
		let alive = true;
		loadImage( labelUrl( aiLabel, aiVariant ) )
			.then( ( img ) => alive && setAiImg( img ) )
			.catch( () => alive && setAiImg( null ) );
		return () => {
			alive = false;
		};
	}, [ aiLabel, aiVariant ] );

	// Watermark and emblem are independent, so both can apply to one export.
	// Built once here rather than at the eight call sites that pass it on.
	const postProcess = ( () => {
		const steps = [];
		if ( applyWm && wmImg ) {
			steps.push( ( canvas ) =>
				applyWatermark( canvas, wmImg, wmPlacement )
			);
		}
		if ( aiLabel && aiImg ) {
			steps.push( ( canvas ) =>
				applyAiLabel( canvas, aiImg, {
					pos: aiPos,
					scale: aiScale ?? aiMotif( aiLabel ).scale,
				} )
			);
		}
		if ( ! steps.length ) {
			return undefined;
		}
		return ( canvas ) => {
			steps.forEach( ( step ) => step( canvas ) );
			return canvas;
		};
	} )();

	const psdExporter = getPsdExporter();
	// Element-bound embeds (builders, insert flows) reach saveAs through the
	// "Apply" button, so the dialog carries that name (v1.236) - same save,
	// clearer connection to the button that opened it.
	const applyEmbed = 'saveAs' === mode && isEmbedded() && ! isLibraryEmbed();
	useEffect( () => {
		if (
			applyEmbed &&
			'overwrite' === applyTarget &&
			null === usage &&
			WPIE.attachmentId
		) {
			request( {
				path: `/media/usage?attachmentId=${ WPIE.attachmentId }`,
			} )
				.then( ( r ) => setUsage( r || { count: 0 } ) )
				.catch( () => setUsage( { count: 0 } ) );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ applyEmbed, applyTarget ] );
	const title =
		'save' === mode
			? __( 'Save to Media Library', 'wunderpaint' )
			: 'saveAs' === mode
			? applyEmbed
				? embedHostLabel()
					? sprintf(
							/* translators: %s: page builder name, e.g. Elementor. */
							__( 'Apply to %s', 'wunderpaint' ),
							embedHostLabel()
					  )
					: __( 'Apply', 'wunderpaint' )
				: __( 'Save as New Attachment', 'wunderpaint' )
			: __( 'Export', 'wunderpaint' );

	/*
	 * Two effects stood here until v1.342.0: an AVIF support probe and a
	 * debounced full re-encode of the document that produced realSize and
	 * encodedUrl. Nothing read any of the three. So every change of format,
	 * quality or scale rendered the WHOLE document to a blob 400ms later,
	 * for a number that was never shown, and each run created an object URL
	 * that only the NEXT run revoked - the last one leaked until reload.
	 * Found by turning the linter on for .jsx; it had reported the state as
	 * unused since whenever it stopped being displayed.
	 */

	// Live preview of the flattened result (shared pipeline, spec 07.2).
	//
	// The preview shows the stamps too (v1.400.0). Without that, corner and
	// size are picked blind and only the saved file reveals where the emblem
	// actually landed. Margins are PIXEL values, so they have to shrink with
	// the preview or a 16px inset reads as a huge gap at thumbnail size.
	useEffect( () => {
		let cancelled = false;
		const previewScale = Math.min( 220 / doc.w, 220 / doc.h, 1 );
		const inset = ( px ) => Math.max( 1, Math.round( px * previewScale ) );
		const steps = [];
		if ( applyWm && wmImg ) {
			steps.push( ( canvas ) =>
				applyWatermark( canvas, wmImg, {
					...wmPlacement,
					margin: inset( wmPlacement.margin ?? 16 ),
				} )
			);
		}
		if ( aiLabel && aiImg ) {
			steps.push( ( canvas ) =>
				applyAiLabel( canvas, aiImg, {
					pos: aiPos,
					scale: aiScale ?? aiMotif( aiLabel ).scale,
					margin: inset( 16 ),
				} )
			);
		}
		renderToCanvasHelper( doc, layers, {
			scale: previewScale,
			cache: sharedImageCache,
		} )
			.then( ( canvas ) => {
				steps.forEach( ( step ) => step( canvas ) );
				return canvas.toDataURL( 'image/png' );
			} )
			.then( ( url ) => ! cancelled && setPreview( url ) )
			.catch( () => {} );
		return () => {
			cancelled = true;
		};
	}, [
		doc,
		layers,
		applyWm,
		wmImg,
		wmPlacement,
		aiLabel,
		aiImg,
		aiPos,
		aiScale,
	] );

	// Prefill metadata from the attachment (save/saveAs on an existing image).
	useEffect( () => {
		if ( 'export' !== mode && WPIE.attachmentId ) {
			getMediaMeta( WPIE.attachmentId ).then( ( m ) => {
				if ( m ) {
					setMeta( ( prev ) => ( {
						...prev,
						alt: m.alt || prev.alt,
						title: m.title || prev.title,
						caption: m.caption || prev.caption,
						description: m.description || prev.description,
					} ) );
				}
			} );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	const estimatedMb = (
		( ( doc.w * scale * doc.h * scale * 4 ) / 1024 / 1024 ) *
		( 'png' === format
			? 0.15
			: 'jpeg' === format
			? quality / 900
			: quality / 1100 )
	).toFixed( 2 );

	const generateAltText = async () => {
		setCaptionBusy( true );
		try {
			const image = await renderToDataURL( doc, layers, {
				scale: Math.min( 1024 / doc.w, 1024 / doc.h, 1 ),
				format: 'jpeg',
				quality: 80,
				cache: sharedImageCache,
			} );
			const result = await ai.caption( { image } );
			setMeta( ( prev ) => ( {
				...prev,
				alt: result.altText || prev.alt,
				caption: result.caption || prev.caption,
				description: result.description || prev.description,
			} ) );
		} catch ( err ) {
			extras.toasts.error(
				err.message,
				err.isUnconfigured
					? {
							linkText: __( 'Settings', 'wunderpaint' ),
							linkHref: WPIE.settingsUrl,
					  }
					: {}
			);
		}
		setCaptionBusy( false );
	};

	const renderRaw = async () => {
		if ( [ 'gif', 'apng', 'webm' ].includes( format ) ) {
			const animOpts = {
				delay: gifDelay,
				maxSize: Math.round( Math.max( doc.w, doc.h ) * scale ),
			};
			if ( 'apng' === format ) {
				return exportApng( doc, layers, animOpts );
			}
			if ( 'webm' === format ) {
				return exportWebM( doc, layers, animOpts );
			}
			return exportGif( doc, layers, animOpts );
		}
		if ( 'psd' === format ) {
			const bytes = await psdExporter( doc, layers );
			return new window.Blob( [ bytes ], {
				type: 'image/vnd.adobe.photoshop',
			} );
		}
		if ( 'pdf' === format ) {
			const jpegBlob = await renderToBlob( outDoc, layers, {
				scale,
				format: 'jpeg',
				quality,
				cache: sharedImageCache,
				postProcess,
			} );
			const bytes = new Uint8Array( await jpegBlob.arrayBuffer() );
			return buildPdf(
				bytes,
				Math.round( doc.w * scale ),
				Math.round( doc.h * scale )
			);
		}
		const extFormat = extFormatById( format );
		if ( extFormat ) {
			return extFormat.encode( {
				doc,
				layers,
				scale,
				quality,
				render: ( opts = {} ) =>
					renderToCanvasHelper( doc, layers, {
						scale,
						cache: sharedImageCache,
						...opts,
					} ),
			} );
		}
		return renderToBlob( outDoc, layers, {
			scale,
			format,
			quality,
			cache: sharedImageCache,
			postProcess,
		} );
	};

	// Metadata rides on the finished FILE, not on the canvas, so it cannot go
	// through postProcess. Every download and every save funnels through here,
	// which keeps it to one place. Untouched unless the user picked a type.
	const renderOutput = async () => {
		const blob = await renderRaw();
		return aiSourceType ? blobWithSourceType( blob, aiSourceType ) : blob;
	};

	const projectFields = async () => {
		if ( ! keepProject || 'export' === mode ) {
			return {};
		}
		// Always the RAW layers: the sidecar keeps the template's binding
		// placeholders even when the pixels ship a resolved post preview.
		const fields = {
			projectJson: JSON.stringify( {
				doc,
				layers: serializeLayers( state.layers ),
			} ),
		};
		return fields;
	};

	// Every page as {doc, layers}, ready to render: the OPEN document is
	// the current page (live, bindings already resolved above); parked
	// pages hydrate from their snapshots and get the same binding pass
	// and JPEG/PDF flatten treatment.
	const collectPages = async () => {
		const cur = state.pages.current;
		const out = [];
		for ( let i = 0; i < pageList.length; i++ ) {
			if ( i === cur ) {
				out.push( { doc: outDoc, layers } );
				continue;
			}
			const snap = pageList[ i ];
			let pageLayers = await hydrateLayers(
				JSON.parse( JSON.stringify( snap.layers || [] ) )
			);
			if ( state.previewPost?.ctx ) {
				pageLayers = resolveBindings(
					pageLayers,
					state.previewPost.ctx
				);
			}
			const pageTransparent =
				! snap.doc.bg || 'transparent' === snap.doc.bg;
			const pageDoc =
				pageTransparent && ( 'jpeg' === format || 'pdf' === format )
					? { ...snap.doc, bg: flattenBg }
					: snap.doc;
			out.push( { doc: pageDoc, layers: pageLayers } );
		}
		return out;
	};

	const runAllPages = async () => {
		const pages = await collectPages();
		const base = meta.filename || 'image';
		if ( 'pdf' === format ) {
			const rendered = [];
			for ( const page of pages ) {
				const jpegBlob = await renderToBlob( page.doc, page.layers, {
					scale,
					format: 'jpeg',
					quality,
					cache: sharedImageCache,
					postProcess,
				} );
				rendered.push( {
					jpegBytes: new Uint8Array( await jpegBlob.arrayBuffer() ),
					w: Math.round( page.doc.w * scale ),
					h: Math.round( page.doc.h * scale ),
				} );
			}
			downloadBlob( buildPdfPages( rendered ), `${ base }.pdf` );
			return;
		}
		const { default: JSZip } = await import(
			/* webpackChunkName: "jszip" */ 'jszip'
		);
		const zip = new JSZip();
		const ext = 'jpeg' === format ? 'jpg' : format;
		for ( let i = 0; i < pages.length; i++ ) {
			const blob = await renderToBlob(
				pages[ i ].doc,
				pages[ i ].layers,
				{
					scale,
					format,
					quality,
					cache: sharedImageCache,
					postProcess,
				}
			);
			zip.file(
				`${ base }-page-${ String( i + 1 ).padStart(
					2,
					'0'
				) }.${ ext }`,
				blob
			);
		}
		downloadBlob(
			await zip.generateAsync( { type: 'blob' } ),
			`${ base }-pages.zip`
		);
	};

	const run = async () => {
		setBusy( true );
		try {
			// Remember settings for the titlebar quick export (v0.7).
			try {
				window.localStorage?.setItem(
					'wpie-last-export',
					JSON.stringify( { format, quality, scale } )
				);
			} catch ( e ) {}
			if ( allPages && canAllPages ) {
				await runAllPages();
				onClose();
				return;
			}
			const blob = await renderOutput();
			if ( 'export' === mode ) {
				const ext =
					extFormatById( format )?.ext ||
					( 'jpeg' === format ? 'jpg' : format );
				downloadBlob( blob, `${ meta.filename || 'image' }.${ ext }` );
				onClose();
				return;
			}

			const common = {
				format,
				quality,
				note: versionNote || undefined,
				alt: meta.alt,
				title: meta.title,
				caption: meta.caption,
				description: meta.description,
				...( await projectFields() ),
			};

			if ( 'save' === mode ) {
				const response = await saveToLibrary(
					buildFormData(
						{ file: blob },
						{ ...common, attachmentId: WPIE.attachmentId }
					)
				);
				dispatch( { type: 'MARK_SAVED' } );
				// Edit-in-place: hand the overwritten image back to the host
				// builder so it refreshes the element (v1.180.0).
				if ( isEmbedded() ) {
					postApplied( {
						attachmentId: WPIE.attachmentId,
						url: response.url,
						width: doc.w,
						height: doc.h,
						alt: meta.alt,
					} );
				}
				// Cache-busted URL refreshes the in-editor source (spec 07.2);
				// layers that still point at the old (now versioned-away)
				// file follow along so thumbnails/reloads don't 404.
				if ( response.url && doc.source?.originalUrl ) {
					const oldUrl = doc.source.originalUrl;
					dispatch( {
						type: 'SET_DOC',
						doc: {
							source: {
								...doc.source,
								originalUrl: response.url,
							},
						},
					} );
					layers
						.filter(
							( l ) => 'image' === l.type && l.src === oldUrl
						)
						.forEach( ( l ) =>
							dispatch( {
								type: 'UPDATE_LAYER',
								id: l.id,
								patch: { src: response.url },
							} )
						);
				}
				extras.toasts.success(
					__( 'Saved to library.', 'wunderpaint' ),
					WPIE.returnUrl
						? {
								linkText: __( 'Back to Post', 'wunderpaint' ),
								linkHref: WPIE.returnUrl,
						  }
						: {
								linkText: __(
									'View attachment',
									'wunderpaint'
								),
								linkHref: response.url,
						  }
				);
			} else if (
				applyEmbed &&
				'overwrite' === applyTarget &&
				WPIE.attachmentId
			) {
				// Overwrite-in-place (v1.305): the element keeps its attachment
				// id, every other use of the image follows along, the previous
				// file lands in the version history.
				const response = await saveToLibrary(
					buildFormData(
						{ file: blob },
						{ ...common, attachmentId: WPIE.attachmentId }
					)
				);
				dispatch( { type: 'MARK_SAVED' } );
				postApplied( {
					attachmentId: WPIE.attachmentId,
					url: response.url,
					width: doc.w,
					height: doc.h,
					alt: meta.alt,
				} );
				if ( response.url && doc.source?.originalUrl ) {
					const oldUrl = doc.source.originalUrl;
					dispatch( {
						type: 'SET_DOC',
						doc: {
							source: {
								...doc.source,
								originalUrl: response.url,
							},
						},
					} );
					layers
						.filter(
							( l ) => 'image' === l.type && l.src === oldUrl
						)
						.forEach( ( l ) =>
							dispatch( {
								type: 'UPDATE_LAYER',
								id: l.id,
								patch: { src: response.url },
							} )
						);
				}
				extras.toasts.success(
					__( 'Saved to library.', 'wunderpaint' )
				);
			} else {
				const response = await saveAsNew(
					buildFormData(
						{ file: blob },
						{ ...common, filename: meta.filename || 'wpie-image' }
					)
				);
				dispatch( { type: 'MARK_SAVED' } );
				// Edit-in-place: the bound copy becomes the element's new image
				// in the host builder (v1.180.0).
				if ( isEmbedded() ) {
					postApplied( {
						attachmentId: response.id,
						url: response.url,
						width: doc.w,
						height: doc.h,
						alt: meta.alt,
					} );
				}
				extras.toasts.success(
					__( 'New attachment created.', 'wunderpaint' ),
					{
						linkText: __( 'Open new attachment', 'wunderpaint' ),
						linkHref: response.editUrl,
					}
				);
				extras.openUseImage?.( {
					id: response.id,
					url: response.url,
					name: meta.filename || doc.name || '',
				} );
			}
			onClose();
		} catch ( err ) {
			extras.toasts.error(
				err.message || __( 'Saving failed.', 'wunderpaint' )
			);
		}
		setBusy( false );
	};

	const extFormats = 'export' === mode ? listExtensionExportFormats() : [];
	const extFormatById = ( id ) => extFormats.find( ( f ) => f.id === id );
	const formats = [
		'png',
		'jpeg',
		'webp',
		...( 'export' === mode && gifFrameLayers( layers ).length >= 2
			? [
					'gif',
					'apng',
					// Having a MediaRecorder is not the same as being able
					// to encode with it: Safari has one and records MP4
					// only, so the plain existence check offered a WebM
					// export that threw on click.
					...( canRecordWebm() ? [ 'webm' ] : [] ),
			  ]
			: [] ),
		// PSD is download-only (v1.4.2): the media library can't display
		// PSDs, and re-editing is covered by the .wpie project sidecar.
		...( 'export' === mode && psdExporter && layers.length
			? [ 'psd' ]
			: [] ),
		...( 'export' === mode ? [ 'pdf' ] : [] ),
		...extFormats.map( ( f ) => f.id ),
	];

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="export-dialog"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ title }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">{ title }</span>
							<HelpLink article="saving" extras={ extras } />
						</div>
						<div className="dsm-sub">
							{ applyEmbed
								? 'overwrite' === applyTarget
									? __(
											'Overwrites the original image and applies it to the element; the previous file stays restorable as a version.',
											'wunderpaint'
									  )
									: __(
											'Saves a copy as a new attachment and applies it to the element; the original image stays untouched.',
											'wunderpaint'
									  )
								: __(
										'Format, size and destination for your image.',
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
				<div className="export-preview">
					{ preview ? (
						<img
							src={ preview }
							alt=""
							style={ {
								maxWidth: 220,
								maxHeight: 160,
								boxShadow: '0 4px 16px rgba(0,0,0,.3)',
							} }
						/>
					) : (
						<span className="spin" />
					) }
				</div>
				<div
					className="export-body"
					style={ { maxHeight: '60vh', overflowY: 'auto' } }
				>
					{ applyEmbed && !! WPIE.attachmentId && (
						<div>
							<div
								style={ {
									fontSize: 11,
									color: 'var(--ed-text-muted)',
									textTransform: 'uppercase',
									letterSpacing: 0.5,
									marginBottom: 6,
								} }
							>
								{ __( 'Destination', 'wunderpaint' ) }
							</div>
							<label
								style={ {
									display: 'flex',
									gap: 8,
									alignItems: 'baseline',
									marginBottom: 6,
									cursor: 'pointer',
								} }
							>
								<input
									type="radio"
									name="wpie-apply-target"
									checked={ 'copy' === applyTarget }
									onChange={ () => setApplyTarget( 'copy' ) }
								/>
								<span>
									{ __(
										'Apply as a new copy',
										'wunderpaint'
									) }
									<span
										style={ {
											display: 'block',
											fontSize: 11,
											color: 'var(--ed-text-muted)',
										} }
									>
										{ __(
											'Only this element gets the edited image; the original stays untouched.',
											'wunderpaint'
										) }
									</span>
								</span>
							</label>
							<label
								style={ {
									display: 'flex',
									gap: 8,
									alignItems: 'baseline',
									cursor: 'pointer',
								} }
							>
								<input
									type="radio"
									name="wpie-apply-target"
									checked={ 'overwrite' === applyTarget }
									onChange={ () =>
										setApplyTarget( 'overwrite' )
									}
								/>
								<span>
									{ __(
										'Overwrite the original',
										'wunderpaint'
									) }
									<span
										style={ {
											display: 'block',
											fontSize: 11,
											color: 'var(--ed-text-muted)',
										} }
									>
										{ __(
											'Every post and element that uses this image shows the edit; the previous file stays restorable as a version.',
											'wunderpaint'
										) }
									</span>
									{ 'overwrite' === applyTarget &&
										null !== usage && (
											<span
												style={ {
													display: 'block',
													fontSize: 11,
													color: 'var(--accent)',
													marginTop: 2,
												} }
											>
												{ usage.count
													? sprintf(
															/* translators: %d: number of other posts/elements. */
															_n(
																'Used in %d other place on this site.',
																'Used in %d other places on this site.',
																usage.count,
																'wunderpaint'
															),
															usage.count
													  )
													: __(
															'A quick scan found no other use on this site.',
															'wunderpaint'
													  ) }
											</span>
										) }
								</span>
							</label>
						</div>
					) }
					<div>
						<div
							style={ {
								fontSize: 11,
								color: 'var(--ed-text-muted)',
								textTransform: 'uppercase',
								letterSpacing: 0.5,
								marginBottom: 6,
							} }
						>
							{ __( 'Format', 'wunderpaint' ) }
						</div>
						<div className="seg-row">
							{ formats.map( ( f ) => (
								<button
									key={ f }
									className={ format === f ? 'active' : '' }
									onClick={ () => setFormat( f ) }
								>
									{ f.includes( '/' )
										? extFormatById( f )?.label || f
										: f.toUpperCase() }
								</button>
							) ) }
						</div>
					</div>
					{ ( 'jpeg' === format ||
						'webp' === format ||
						'avif' === format ||
						'pdf' === format ) && (
						<div
							className="slider-row"
							style={ { gridTemplateColumns: '70px 1fr 40px' } }
						>
							<label htmlFor={ fieldId + '-quality' }>
								{ __( 'Quality', 'wunderpaint' ) }
							</label>
							<input
								id={ fieldId + '-quality' }
								type="range"
								min="10"
								max="100"
								value={ quality }
								onChange={ ( e ) =>
									setQuality( +e.target.value )
								}
							/>
							<span className="val">{ quality }</span>
						</div>
					) }
					{ needsFlatten && (
						<div
							className="slider-row"
							style={ {
								gridTemplateColumns: '70px auto 1fr',
								alignItems: 'center',
							} }
						>
							<label htmlFor={ fieldId + '-flatbg' }>
								{ __( 'Background', 'wunderpaint' ) }
							</label>
							<SwatchButton
								id={ fieldId + '-flatbg' }
								size={ 22 }
								color={ flattenBg }
								onChange={ setFlattenBg }
							/>
							<span
								style={ {
									fontSize: 11,
									color: 'var(--ed-text-muted)',
								} }
							>
								{ __(
									'This format has no transparency, transparent areas get this color.',
									'wunderpaint'
								) }
							</span>
						</div>
					) }
					{ [ 'gif', 'apng', 'webm' ].includes( format ) && (
						<div
							className="slider-row"
							style={ { gridTemplateColumns: '70px 1fr 40px' } }
						>
							<label htmlFor={ fieldId + '-delay' }>
								{ __( 'Frame delay', 'wunderpaint' ) }
							</label>
							<input
								id={ fieldId + '-delay' }
								type="range"
								min="100"
								max="3000"
								step="100"
								value={ gifDelay }
								onChange={ ( e ) =>
									setGifDelay( +e.target.value )
								}
							/>
							<span className="val">
								{ ( gifDelay / 1000 ).toFixed( 1 ) }s
							</span>
						</div>
					) }
					{ [ 'gif', 'apng', 'webm' ].includes( format ) && (
						<div
							style={ {
								fontSize: 11,
								color: 'var(--ed-text-muted)',
							} }
						>
							{ sprintf(
								/* translators: %d: frame count. */
								__(
									'Each visible top-level layer becomes a frame, %d frames.',
									'wunderpaint'
								),
								gifFrameLayers( layers ).length
							) }
						</div>
					) }
					{ 'psd' !== format && (
						<div
							className="slider-row"
							style={ { gridTemplateColumns: '70px 1fr 40px' } }
						>
							<label htmlFor={ fieldId + '-scale' }>
								{ __( 'Scale', 'wunderpaint' ) }
							</label>
							<input
								id={ fieldId + '-scale' }
								type="range"
								min="0.25"
								max="2"
								step="0.25"
								value={ scale }
								onChange={ ( e ) =>
									setScale( +e.target.value )
								}
							/>
							<span className="val">{ scale }×</span>
						</div>
					) }
					{ canAllPages && (
						<label
							style={ {
								display: 'inline-flex',
								gap: 6,
								alignItems: 'center',
								fontSize: 12,
							} }
						>
							<input
								type="checkbox"
								checked={ allPages }
								onChange={ ( e ) =>
									setAllPages( e.target.checked )
								}
							/>
							{ 'pdf' === format
								? sprintf(
										/* translators: %d: number of pages. */
										__(
											'All %d pages in one PDF',
											'wunderpaint'
										),
										pageList.length
								  )
								: sprintf(
										/* translators: %d: number of pages. */
										__(
											'All %d pages (ZIP)',
											'wunderpaint'
										),
										pageList.length
								  ) }
						</label>
					) }
					<div className="file-size">
						<span>
							{ __( 'Output:', 'wunderpaint' ) }{ ' ' }
							{ Math.round( doc.w * scale ) } ×{ ' ' }
							{ Math.round( doc.h * scale ) } px
						</span>
						<span>
							{ sprintf(
								/* translators: %s: megabytes. */ __(
									'Est. size: ~%s MB',
									'wunderpaint'
								),
								estimatedMb
							) }
						</span>
					</div>
					{ 'export' === mode && 'psd' !== format && (
						<div
							style={ {
								borderTop: '1px solid var(--ed-border)',
								paddingTop: 10,
							} }
						>
							<div
								style={ {
									fontSize: 11,
									color: 'var(--ed-text-muted)',
									textTransform: 'uppercase',
									letterSpacing: 0.5,
									marginBottom: 6,
								} }
							>
								{ __( 'Batch sizes (ZIP)', 'wunderpaint' ) }
							</div>
							<div
								style={ {
									display: 'flex',
									flexWrap: 'wrap',
									gap: 6,
								} }
							>
								{ PRESETS.flatMap( ( g ) => g.items )
									.filter( ( p ) => 'custom' !== p.id )
									.map( ( p ) => (
										<label
											key={ p.id }
											style={ {
												display: 'inline-flex',
												gap: 4,
												alignItems: 'center',
												fontSize: 11,
												border: '1px solid var(--ed-border-strong)',
												borderRadius: 12,
												padding: '3px 8px',
												color: 'var(--ed-text-dim)',
											} }
										>
											<input
												type="checkbox"
												checked={ batchSizes.includes(
													p.id
												) }
												onChange={ () =>
													setBatchSizes( ( prev ) =>
														prev.includes( p.id )
															? prev.filter(
																	( x ) =>
																		x !==
																		p.id
															  )
															: [ ...prev, p.id ]
													)
												}
											/>
											{ p.label } ({ p.w }×{ p.h })
										</label>
									) ) }
							</div>
							<button
								className="ai-btn secondary"
								style={ { marginTop: 8 } }
								disabled={ ! batchSizes.length || batchBusy }
								onClick={ async () => {
									setBatchBusy( true );
									try {
										const sizes = PRESETS.flatMap(
											( g ) => g.items
										).filter( ( p ) =>
											batchSizes.includes( p.id )
										);
										const zip = await batchExport(
											outDoc,
											layers,
											sizes,
											{
												format,
												quality,
												baseName:
													meta.filename || 'export',
												postProcess,
											}
										);
										downloadBlob(
											zip,
											`${
												meta.filename || 'export'
											}-sizes.zip`
										);
									} catch ( err ) {
										extras.toasts.error( err.message );
									}
									setBatchBusy( false );
								} }
							>
								{ batchBusy ? <span className="spin" /> : '⇩' }{ ' ' }
								{ __( 'Download ZIP', 'wunderpaint' ) } (
								{ batchSizes.length })
							</button>
						</div>
					) }
					{ 'export' === mode && (
						<div
							style={ {
								display: 'flex',
								gap: 4,
								flexWrap: 'wrap',
								alignItems: 'center',
							} }
						>
							<span
								style={ {
									fontSize: 11,
									color: 'var(--ed-text-muted)',
								} }
							>
								{ __( 'Presets:', 'wunderpaint' ) }
							</span>
							{ exportPresets.map( ( preset ) => (
								<button
									key={ preset.name }
									className="preset-chip"
									title={ `${ preset.format.toUpperCase() } · ${
										preset.quality
									}% · ${ preset.scale }×, ${ __(
										'Alt-click removes',
										'wunderpaint'
									) }` }
									onClick={ ( e ) => {
										if ( e.altKey ) {
											setExportPresets(
												deleteExportPreset(
													preset.name
												)
											);
											return;
										}
										setFormat( preset.format );
										setQuality( preset.quality );
										setScale( preset.scale );
									} }
								>
									{ preset.name }
								</button>
							) ) }
							<button
								className="preset-chip add"
								title={ __(
									'Save current settings as preset',
									'wunderpaint'
								) }
								onClick={ async () => {
									const name = await promptDialogRef( {
										title: __(
											'Save Export Preset',
											'wunderpaint'
										),
										label: __( 'Name', 'wunderpaint' ),
										defaultValue: `${ format.toUpperCase() } ${ quality }%`,
									} );
									if ( name ) {
										setExportPresets(
											saveExportPreset( name, {
												format,
												quality,
												scale,
											} )
										);
									}
								} }
							>
								＋
							</button>
						</div>
					) }
					{ 'export' === mode && (
						<div>
							<button
								className="ai-btn secondary"
								disabled={ busy }
								title={ __(
									'favicon.ico + PNG set (16–512px) + HTML snippet as ZIP',
									'wunderpaint'
								) }
								onClick={ async () => {
									try {
										const canvas =
											await renderToCanvasHelper(
												doc,
												layers,
												{
													cache: sharedImageCache,
													postProcess,
												}
											);
										const zip =
											await buildFaviconZip( canvas );
										downloadBlob(
											zip,
											`${
												meta.filename || 'favicon'
											}-favicons.zip`
										);
									} catch ( err ) {
										extras.toasts.error( err.message );
									}
								} }
							>
								⇩ { __( 'Favicon set (ZIP)', 'wunderpaint' ) }
							</button>
						</div>
					) }
					{ wmSources.length > 0 && 'psd' !== format && (
						<label
							style={ {
								display: 'flex',
								alignItems: 'center',
								gap: 6,
								fontSize: 12,
								color: 'var(--ed-text-dim)',
							} }
						>
							{ __( 'Watermark', 'wunderpaint' ) }
							<select
								value={ wmId }
								onChange={ ( e ) => setWmId( e.target.value ) }
								style={ { flex: 1 } }
							>
								<option value="">
									{ __( 'None', 'wunderpaint' ) }
								</option>
								{ wmSources.map( ( src ) => (
									<option key={ src.id } value={ src.id }>
										{ src.name }
									</option>
								) ) }
							</select>
							{ ! wmImg && applyWm && <span className="spin" /> }
						</label>
					) }
					{ ! [ 'gif', 'apng', 'webm', 'psd' ].includes( format ) && (
						<Fragment>
							<label
								style={ {
									display: 'flex',
									alignItems: 'center',
									gap: 6,
									fontSize: 12,
									color: 'var(--ed-text-dim)',
								} }
							>
								{ __( 'EU AI label', 'wunderpaint' ) }
								<select
									value={ aiLabel }
									onChange={ ( e ) => {
										setAiLabel( e.target.value );
										setAiScale( null );
									} }
									style={ { flex: 1 } }
								>
									<option value="">
										{ __( 'None', 'wunderpaint' ) }
									</option>
									{ MOTIFS.map( ( m ) => (
										<option key={ m.id } value={ m.id }>
											{ m.label() }
										</option>
									) ) }
								</select>
								{ aiLabel && ! aiImg && (
									<span className="spin" />
								) }
							</label>
							{ !! aiLabel && (
								<Fragment>
									<div
										style={ {
											fontSize: 11,
											lineHeight: 1.4,
											color: 'var(--ed-text-dim)',
											opacity: 0.85,
										} }
									>
										{ aiMotif( aiLabel ).hint() }
									</div>
									<div
										style={ {
											display: 'flex',
											gap: 6,
											alignItems: 'center',
										} }
									>
										<select
											aria-label={ __(
												'Emblem color',
												'wunderpaint'
											) }
											value={ aiVariant }
											onChange={ ( e ) =>
												setAiVariant( e.target.value )
											}
											style={ { flex: 2, minWidth: 0 } }
										>
											{ VARIANTS.map( ( v ) => (
												<option
													key={ v.id }
													value={ v.id }
												>
													{ v.label() }
												</option>
											) ) }
										</select>
										<select
											aria-label={ __(
												'Emblem position',
												'wunderpaint'
											) }
											value={ aiPos }
											onChange={ ( e ) =>
												setAiPos( e.target.value )
											}
											style={ { flex: 1, minWidth: 0 } }
										>
											<option value="tl">
												{ __(
													'Top left',
													'wunderpaint'
												) }
											</option>
											<option value="tr">
												{ __(
													'Top right',
													'wunderpaint'
												) }
											</option>
											<option value="bl">
												{ __(
													'Bottom left',
													'wunderpaint'
												) }
											</option>
											<option value="br">
												{ __(
													'Bottom right',
													'wunderpaint'
												) }
											</option>
											<option value="center">
												{ __(
													'Center',
													'wunderpaint'
												) }
											</option>
										</select>
										<input
											type="number"
											aria-label={ __(
												'Emblem size, percent of width',
												'wunderpaint'
											) }
											min="2"
											max="60"
											value={
												aiScale ??
												aiMotif( aiLabel ).scale
											}
											onChange={ ( e ) =>
												setAiScale(
													Number( e.target.value ) ||
														null
												)
											}
											style={ { width: 56 } }
										/>
									</div>
									{ SUPPORTED_MIME.includes(
										'image/' +
											( 'jpg' === format
												? 'jpeg'
												: format )
									) && (
										<label
											style={ {
												display: 'flex',
												alignItems: 'flex-start',
												gap: 6,
												fontSize: 11,
												lineHeight: 1.4,
												color: 'var(--ed-text-dim)',
											} }
										>
											<input
												type="checkbox"
												checked={ aiMeta }
												onChange={ ( e ) =>
													setAiMeta(
														e.target.checked
													)
												}
												style={ { marginTop: 2 } }
											/>
											<span>
												{ __(
													'Also record it in the file metadata (IPTC), for image search and stock agencies',
													'wunderpaint'
												) }
											</span>
										</label>
									) }
								</Fragment>
							) }
						</Fragment>
					) }
					{ 'export' !== mode && (
						<Fragment>
							<div
								style={ {
									height: 1,
									background: 'var(--ed-border)',
									margin: '2px 0',
								} }
							/>
							{ [
								[ 'filename', __( 'Filename', 'wunderpaint' ) ],
								[ 'alt', __( 'Alt Text', 'wunderpaint' ) ],
								[ 'title', __( 'Title', 'wunderpaint' ) ],
								[ 'caption', __( 'Caption', 'wunderpaint' ) ],
							].map( ( [ key, label ] ) => (
								<div className="field" key={ key }>
									<label
										htmlFor={ fieldId + '-meta-' + key }
										style={ {
											fontSize: 12,
											color: 'var(--ed-text-dim)',
										} }
									>
										{ label }
									</label>
									<input
										id={ fieldId + '-meta-' + key }
										type="text"
										value={ meta[ key ] }
										onChange={ ( e ) =>
											setMeta( {
												...meta,
												[ key ]: e.target.value,
											} )
										}
										style={ {
											width: '100%',
											height: 30,
											padding: '0 8px',
											border: '1px solid var(--ed-border-strong)',
											borderRadius: 4,
											background: 'var(--ed-panel-alt)',
											color: 'var(--ed-text)',
										} }
									/>
								</div>
							) ) }
							<div className="field">
								<label
									htmlFor={ fieldId + '-meta-desc' }
									style={ {
										fontSize: 12,
										color: 'var(--ed-text-dim)',
									} }
								>
									{ __( 'Description', 'wunderpaint' ) }
								</label>
								<textarea
									id={ fieldId + '-meta-desc' }
									value={ meta.description }
									placeholder={ __(
										'Optional description…',
										'wunderpaint'
									) }
									onChange={ ( e ) =>
										setMeta( {
											...meta,
											description: e.target.value,
										} )
									}
									style={ {
										width: '100%',
										minHeight: 50,
										padding: 8,
										border: '1px solid var(--ed-border-strong)',
										borderRadius: 4,
										background: 'var(--ed-panel-alt)',
										color: 'var(--ed-text)',
										fontFamily: 'var(--font-ui)',
										fontSize: 13,
										resize: 'vertical',
									} }
								/>
							</div>
							<div>
								<button
									className="ai-btn secondary"
									disabled={
										captionBusy ||
										! hasTextProvider( WPIE.providers )
									}
									title={
										hasTextProvider( WPIE.providers )
											? undefined
											: __(
													'Requires an AI text provider key (Anthropic, OpenAI or Gemini)',
													'wunderpaint'
											  )
									}
									onClick={ generateAltText }
								>
									{ /* Element↔element swap (v1.235): the old bare '✨' TEXT node
									   broke React reconciliation when browser translation wrapped
									   it in a <font> tag (removeChild NotFoundError). */ }
									{ captionBusy ? (
										<span className="spin" />
									) : (
										I.sparkles( { size: 13 } )
									) }{ ' ' }
									{ __( 'Generate alt text', 'wunderpaint' ) }
								</button>
								{ ! hasTextProvider( WPIE.providers ) && (
									<a
										href={ WPIE.settingsUrl }
										target="_blank"
										rel="noreferrer"
										style={ {
											fontSize: 11,
											color: 'var(--accent)',
											marginLeft: 8,
										} }
									>
										{ __(
											'Configure in Settings',
											'wunderpaint'
										) }
									</a>
								) }
							</div>
						</Fragment>
					) }
					{ 'save' === mode && (
						<div className="field">
							<label
								htmlFor={ fieldId + '-versionnote' }
								style={ {
									fontSize: 12,
									color: 'var(--ed-text-dim)',
								} }
							>
								{ __( 'Version note', 'wunderpaint' ) }
							</label>
							<input
								id={ fieldId + '-versionnote' }
								type="text"
								value={ versionNote }
								placeholder={ __(
									'What changed? (optional, shown in the Versions panel)',
									'wunderpaint'
								) }
								onChange={ ( e ) =>
									setVersionNote( e.target.value )
								}
								style={ {
									width: '100%',
									height: 30,
									padding: '0 8px',
									border: '1px solid var(--ed-border-strong)',
									borderRadius: 4,
									background: 'var(--ed-panel-alt)',
									color: 'var(--ed-text)',
								} }
							/>
						</div>
					) }
					{ 'save' === mode && (
						<div
							style={ {
								padding: 10,
								background: 'rgba(219,166,23,.1)',
								border: '1px solid rgba(219,166,23,.3)',
								borderRadius: 4,
								fontSize: 11,
								color: 'var(--ed-text-dim)',
								display: 'flex',
								gap: 8,
							} }
						>
							<span
								style={ {
									color: 'var(--warning)',
									display: 'inline-flex',
									flexShrink: 0,
								} }
							>
								{ I.alert( { size: 14 } ) }
							</span>
							<div>
								<b style={ { color: 'var(--ed-text)' } }>
									{ __(
										'Overwrites original',
										'wunderpaint'
									) }
								</b>
								<br />
								{ __(
									'The previous version is kept in the Versions panel.',
									'wunderpaint'
								) }
							</div>
						</div>
					) }
				</div>
				<div className="create-foot">
					<div
						style={ {
							fontSize: 11,
							color: 'var(--ed-text-muted)',
							display: 'flex',
							alignItems: 'center',
							gap: 6,
						} }
					>
						{ 'export' !== mode && (
							<label
								style={ {
									display: 'flex',
									alignItems: 'center',
									gap: 6,
								} }
							>
								<input
									type="checkbox"
									checked={ keepProject }
									onChange={ ( e ) =>
										setKeepProject( e.target.checked )
									}
								/>
								{ __(
									'Keep editable project file',
									'wunderpaint'
								) }
							</label>
						) }
					</div>
					<div style={ { display: 'flex', gap: 8 } }>
						{ 'export' === mode &&
							navigator.clipboard?.write &&
							'psd' !== format && (
								<button
									className="ai-btn secondary"
									disabled={ busy }
									title={ __(
										'Copy the rendered image (PNG) to the clipboard',
										'wunderpaint'
									) }
									onClick={ async () => {
										try {
											const canvas =
												await renderToCanvasHelper(
													doc,
													layers,
													{
														scale,
														cache: sharedImageCache,
														postProcess,
													}
												);
											const blob = await new Promise(
												( resolve ) =>
													canvas.toBlob(
														resolve,
														'image/png'
													)
											);
											await navigator.clipboard.write( [
												new window.ClipboardItem( {
													'image/png': blob,
												} ),
											] );
											extras.toasts.success(
												__(
													'Copied to clipboard.',
													'wunderpaint'
												)
											);
										} catch ( err ) {
											extras.toasts.error(
												__(
													'Clipboard copy failed.',
													'wunderpaint'
												)
											);
										}
									} }
								>
									{ __( 'Copy to clipboard', 'wunderpaint' ) }
								</button>
							) }
						<button
							className="ai-btn secondary"
							onClick={ onClose }
						>
							{ __( 'Cancel', 'wunderpaint' ) }
						</button>
						<button
							className="ai-btn primary"
							disabled={ busy }
							onClick={ run }
						>
							{ busy && <span className="spin" /> }
							{ 'save' === mode
								? __( 'Save to Media Library', 'wunderpaint' )
								: 'saveAs' === mode
								? __( 'Create Attachment', 'wunderpaint' )
								: __( 'Download', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
