/**
 * Layout popover (E1 of the dynamic-layouts design): the Layout button
 * opens this fixed-anchored panel with SIX rendered preview tiles of the
 * user's own text — two classics plus four seeded rolls from the
 * generative engine. Clicking a tile applies it (one history step, the
 * panel stays open for browsing), "Shuffle" rolls fresh seeds, × removes
 * the layout. E2 adds the cloud "AI suggestions" section below the grid.
 */

import { useState, useEffect, useRef, useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { renderToCanvas, sharedImageCache } from '../../lib/raster';
import { ensureFontsForLayers } from '../../lib/font-manager';
import { hasTextProvider } from '../../lib/providers';
import {
	TEXT_LAYOUTS,
	classicSpec,
	splitLayoutLines,
	sourceTextOf,
	clearTextLayoutOp,
} from '../../lib/text-layouts';
import { generateLayoutSpec } from '../../lib/layout-generator';
import {
	specPatch,
	applyLayoutSpec,
	cleanLayoutSpec,
} from '../../lib/layout-spec';
import { ai } from '../../lib/api';
import { salienceAvailable, wordSalience } from '../../lib/text-salience';

const TILE_W = 148;
const TILE_H = 96;

const specKey = ( spec ) =>
	'classic' === spec.source
		? 'c:' + spec.id
		: 'ai' === spec.source
		? 'a:' + spec.id
		: 's:' + spec.seed;

// `extras` was missing from this list until v1.342.0 although context-bar has
// always passed it: the AI error path below reads extras?.toasts, and optional
// chaining does not save an undefined VARIABLE - the catch block threw a
// ReferenceError instead of showing the message. Nothing caught it, because
// .jsx was not linted.
export function LayoutPopover( { editor, extras, anchor, onClose } ) {
	const { state } = editor;
	const layer = state.layers.find( ( l ) => l.id === state.activeId );
	const ref = useRef( null );

	// The source lines are captured once per open: applying a layout
	// changes layer.text, but the lockup keeps describing the same words.
	const lines = useMemo(
		() => ( layer ? splitLayoutLines( sourceTextOf( layer ) ) : [] ),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[ layer?.id ]
	);
	const baseIdx = layer?.textLayout?.idx ?? -1;
	const [ seeds, setSeeds ] = useState( () =>
		Array.from(
			{ length: 4 },
			( _, i ) => ( Date.now() % 100000 ) + i * 7919
		)
	);
	const [ previews, setPreviews ] = useState( {} );
	const [ appliedKey, setAppliedKey ] = useState( null );
	// Cloud suggestions (E2): explicit button only — costs per call.
	const [ aiSpecs, setAiSpecs ] = useState( [] );
	const [ aiStyle, setAiStyle ] = useState( '' );
	const [ aiBusy, setAiBusy ] = useState( false );
	const hasCloud = hasTextProvider( editor.WPIE?.providers );
	// Local semantics (E3): when the salience model is installed, score the
	// words once and let the generator accent the MEANINGFUL word.
	const [ salience, setSalience ] = useState( null );
	useEffect( () => {
		let cancelled = false;
		if ( layer && salienceAvailable() ) {
			wordSalience( sourceTextOf( layer ) )
				.then( ( map ) => {
					if ( ! cancelled && map ) {
						setSalience( map );
					}
				} )
				.catch( () => {} );
		}
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ layer?.id ] );

	const specs = useMemo( () => {
		if ( ! layer || lines.length < 2 ) {
			return [];
		}
		const ctx = { color: layer.color || '#1a1d21', salience };
		const classics = [ 1, 2 ].map( ( off ) =>
			classicSpec(
				TEXT_LAYOUTS[
					( baseIdx + off + TEXT_LAYOUTS.length ) %
						TEXT_LAYOUTS.length
				].id,
				lines,
				ctx
			)
		);
		const rolled = seeds.map( ( seed ) =>
			generateLayoutSpec( lines, ctx, seed )
		);
		return [ ...classics, ...rolled, ...aiSpecs ].filter( Boolean );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ layer?.id, lines, seeds, aiSpecs, salience ] );

	// Render the preview tiles through the real pipeline, fonts first.
	useEffect( () => {
		if ( ! layer || ! specs.length ) {
			return;
		}
		let cancelled = false;
		const ctx = {
			accent: editor.WPIE?.brand?.colors?.[ 0 ] || '#3b66ff',
			color: layer.color || '#1a1d21',
		};
		Promise.all(
			specs.map( async ( spec ) => {
				const key = specKey( spec );
				try {
					// Load every family the spec uses before measuring.
					const probe = {
						type: 'text',
						fontFamily: 'Inter',
						spans: spec.lines.flatMap( ( l ) => [
							{
								text: 'x',
								s: {
									family: l.fontFamily,
									weight: l.weight,
								},
							},
							...( l.emph?.style?.family
								? [
										{
											text: 'x',
											s: {
												family: l.emph.style.family,
												weight:
													l.emph.style.weight || 400,
											},
										},
								  ]
								: [] ),
						] ),
					};
					await ensureFontsForLayers( [ probe ] );
					const patch = specPatch( layer, spec, ctx );
					const preview = {
						...layer,
						...patch,
						x: 0,
						y: 0,
						rot: 0,
						quad: null,
						textFX: null,
						filter: null,
						adjust: null,
						parent: null,
					};
					const scale = Math.min(
						( TILE_W - 8 ) / Math.max( 1, layer.w ),
						( TILE_H - 8 ) / Math.max( 1, patch.h ),
						1
					);
					const canvas = await renderToCanvas(
						{
							w: layer.w,
							h: patch.h,
							bg: '#f0f0f1',
						},
						[ preview ],
						{
							viewport: {
								x: 0,
								y: 0,
								w: layer.w,
								h: patch.h,
							},
							scale,
							cache: sharedImageCache,
						}
					);
					return [ key, canvas?.toDataURL?.() || null ];
				} catch ( e ) {
					return [ key, null ];
				}
			} )
		).then( ( pairs ) => {
			if ( ! cancelled ) {
				setPreviews( ( prev ) => ( {
					...prev,
					...Object.fromEntries( pairs.filter( ( p ) => p[ 1 ] ) ),
				} ) );
			}
		} );
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ specs ] );

	// Close on outside pointerdown / Escape.
	useEffect( () => {
		const onDown = ( e ) => {
			if ( ref.current && ! ref.current.contains( e.target ) ) {
				onClose();
			}
		};
		const onKey = ( e ) => {
			if ( 'Escape' === e.key ) {
				e.stopPropagation();
				onClose();
			}
		};
		document.addEventListener( 'pointerdown', onDown, true );
		document.addEventListener( 'keydown', onKey, true );
		return () => {
			document.removeEventListener( 'pointerdown', onDown, true );
			document.removeEventListener( 'keydown', onKey, true );
		};
	}, [ onClose ] );

	if ( ! layer || 'text' !== layer.type || lines.length < 2 ) {
		return null;
	}

	const src = sourceTextOf( layer );
	const fetchAi = async () => {
		if ( aiBusy ) {
			return;
		}
		setAiBusy( true );
		try {
			const res = await ai.layout( {
				text: src,
				style: aiStyle,
				w: Math.round( layer.w ),
				h: Math.round( layer.h ),
				n: 4,
			} );
			const stamp = Date.now();
			const cleaned = ( res?.items || [] )
				.map( ( it, i ) =>
					cleanLayoutSpec( {
						...it,
						source: 'ai',
						id: 'ai-' + stamp + '-' + i,
					} )
				)
				.filter( Boolean );
			if ( ! cleaned.length ) {
				throw new Error(
					__(
						'No usable suggestions returned. Please try again.',
						'wunderpaint'
					)
				);
			}
			setAiSpecs( cleaned );
		} catch ( err ) {
			extras?.toasts?.error( err.message );
		} finally {
			setAiBusy( false );
		}
	};
	const apply = async ( spec ) => {
		const idx =
			'classic' === spec.source
				? TEXT_LAYOUTS.findIndex( ( l ) => l.id === spec.id )
				: undefined;
		await applyLayoutSpec( editor, spec, { src, idx } );
		setAppliedKey( specKey( spec ) );
	};

	const left = Math.max(
		8,
		Math.min( anchor.left, window.innerWidth - ( TILE_W * 3 + 44 ) )
	);
	const top = Math.min( anchor.top, window.innerHeight - 300 );

	return (
		<div
			ref={ ref }
			className="layout-popover"
			style={ { position: 'fixed', left, top } }
			onPointerDown={ ( e ) => e.stopPropagation() }
			onMouseDown={ ( e ) => e.stopPropagation() }
			role="dialog"
			aria-label={ __( 'Layouts', 'wunderpaint' ) }
		>
			<div className="layout-pop-head">
				<span>{ __( 'Layouts', 'wunderpaint' ) }</span>
				<button
					className="ai-btn secondary"
					onClick={ () =>
						setSeeds(
							seeds.map(
								( s, i ) =>
									( s * 31 +
										( Date.now() % 9973 ) +
										i * 101 ) %
									2147483647
							)
						)
					}
				>
					{ __( 'Shuffle', 'wunderpaint' ) }
				</button>
				{ !! layer.textLayout && (
					<button
						className="ai-btn secondary"
						title={ __( 'Remove layout', 'wunderpaint' ) }
						onClick={ () => {
							clearTextLayoutOp( editor );
							setAppliedKey( null );
						} }
					>
						×
					</button>
				) }
			</div>
			<div className="layout-tiles">
				{ specs.map( ( spec ) => {
					const key = specKey( spec );
					return (
						<button
							key={ key }
							className={
								'layout-tile' +
								( appliedKey === key ? ' active' : '' )
							}
							title={
								'classic' === spec.source
									? TEXT_LAYOUTS.find(
											( l ) => l.id === spec.id
									  )?.name
									: 'ai' === spec.source
									? __( 'Suggestion', 'wunderpaint' )
									: __( 'Generated', 'wunderpaint' )
							}
							onClick={ () => apply( spec ) }
						>
							{ previews[ key ] ? (
								<img src={ previews[ key ] } alt="" />
							) : (
								<span className="layout-tile-loading" />
							) }
						</button>
					);
				} ) }
			</div>
			{ hasCloud && (
				<div className="layout-pop-ai">
					<div className="layout-pop-ai-head">
						{ __( 'New Suggestions', 'wunderpaint' ) }
					</div>
					<div className="layout-pop-ai-row">
						<input
							type="text"
							value={ aiStyle }
							placeholder={ __(
								'Style, e.g. elegant, loud, playful…',
								'wunderpaint'
							) }
							onChange={ ( e ) => setAiStyle( e.target.value ) }
							onKeyDown={ ( e ) => {
								e.stopPropagation();
								if ( 'Enter' === e.key ) {
									fetchAi();
								}
							} }
						/>
						<button
							className="ai-btn primary"
							disabled={ aiBusy }
							onClick={ fetchAi }
						>
							{ aiBusy
								? __( 'Generating…', 'wunderpaint' )
								: __( 'Generate with AI', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			) }
		</div>
	);
}
