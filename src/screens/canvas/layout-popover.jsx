/**
 * Layout popover (Text Looks, v1.430): the Layouts button opens this
 * movable panel with nine classic looks, three seeded rolls and,
 * on request, cloud suggestions. Each tile renders the look on the
 * layer's OWN box through the real pipeline, on the document's ground,
 * with its name underneath. Clicking a tile puts the look on the layer
 * (Fluid Text goes on with it); closing the panel keeps the applied look.
 */

import {
	useState,
	useEffect,
	useLayoutEffect,
	useRef,
	useMemo,
	createPortal,
} from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../../icons';
import { FloatPanel } from '../panels/float-panel';
import { parseColor } from '../../lib/color';
import { contrastRatio } from '../../lib/contrast-check';

import { renderToCanvas, sharedImageCache } from '../../lib/raster';
import { ensureFontsForLayers } from '../../lib/font-manager';
import { hasTextProvider } from '../../lib/providers';
import {
	CLASSIC_LOOKS,
	cleanTextLook,
	splitSegments,
} from '../../lib/text-look';
import { generateTextLook, lookFontPool } from '../../lib/text-look-generator';
import { sourceTextOf } from '../../lib/text-layouts';
import { applyTextLookOp } from '../../lib/text-fit-ops';
import { ai } from '../../lib/api';
import { salienceAvailable, wordSalience } from '../../lib/text-salience';

const TILE_W = 148;
const TILE_H_MAX = 110;
const TILE_H_MIN = 44;
const CLASSIC_COUNT = 9;
const GENERATED_COUNT = 3;
const EDGE = 8;

// The shared float panel keeps its head reachable; this chooser keeps the
// entire measured window visible, including after resizing its contents.
function fitPanel( pos, panel ) {
	const rect = panel?.getBoundingClientRect();
	return {
		x: Math.max(
			EDGE,
			Math.min( pos.x, window.innerWidth - ( rect?.width || 480 ) - EDGE )
		),
		y: Math.max(
			EDGE,
			Math.min( pos.y, window.innerHeight - ( rect?.height || 0 ) - EDGE )
		),
	};
}

function previewGround( layer ) {
	const ink = parseColor( layer?.color ) || { r: 0, g: 0, b: 0 };
	const dark = '#252a34';
	const light = '#f5f5f0';
	return contrastRatio( ink, parseColor( dark ) ) >
		contrastRatio( ink, parseColor( light ) )
		? dark
		: light;
}

const keyOf = ( look ) => look.source + ':' + look.id;

// The layer as a look sees it: a legacy baked layout gives its source
// text back, everything positional is stripped for the tile.
function previewLayer( layer, look ) {
	const legacy = !! layer.textLayout;
	return {
		...layer,
		x: 0,
		y: 0,
		rot: 0,
		quad: null,
		textFX: null,
		filter: null,
		adjust: null,
		parent: null,
		text: legacy ? sourceTextOf( layer ) : layer.text,
		spans: legacy ? null : layer.spans,
		lineStyles: null,
		textLayout: null,
		textFit: 'fluid',
		textLook: look,
		align: 'center',
	};
}

// A throwaway layer naming every face the look uses, for the font loader.
function fontProbe( look ) {
	const runs = Object.values( look.roles ).map( ( r ) => ( {
		text: 'x',
		s: { family: r.family, weight: r.weight },
	} ) );
	if ( look.emph?.style?.family ) {
		runs.push( {
			text: 'x',
			s: {
				family: look.emph.style.family,
				weight: look.emph.style.weight || 400,
			},
		} );
	}
	return { type: 'text', fontFamily: 'Inter', spans: runs };
}

export function LayoutPopover( { editor, extras, anchor, onClose } ) {
	const { state } = editor;
	const layer = state.layers.find( ( l ) => l.id === state.activeId );
	const ref = useRef( null );
	const [ pos, setPos ] = useState( () => ( {
		x: anchor.left,
		y: anchor.top,
	} ) );
	useLayoutEffect( () => {
		const panel = ref.current?.querySelector( '.ed-float-panel' );
		if ( ! panel ) {
			return undefined;
		}
		const fit = () =>
			setPos( ( current ) => {
				const next = fitPanel( current, panel );
				return next.x === current.x && next.y === current.y
					? current
					: next;
			} );
		fit();
		const observer = new ResizeObserver( fit );
		observer.observe( panel );
		window.addEventListener( 'resize', fit );
		return () => {
			observer.disconnect();
			window.removeEventListener( 'resize', fit );
		};
	}, [] );
	const text = layer
		? layer.textLayout
			? sourceTextOf( layer )
			: layer.text
		: '';
	const segments = useMemo( () => splitSegments( text ), [ text ] );
	const [ seeds, setSeeds ] = useState( () =>
		Array.from(
			{ length: GENERATED_COUNT },
			( _, i ) => ( Date.now() % 100000 ) + i * 7919
		)
	);
	const [ previews, setPreviews ] = useState( {} );
	const doneRef = useRef( { source: null, set: new Set() } );
	// Cloud suggestions: explicit button only, costs per call.
	const [ aiLooks, setAiLooks ] = useState( [] );
	const [ aiStyle, setAiStyle ] = useState( '' );
	const [ aiBusy, setAiBusy ] = useState( false );
	const hasCloud = hasTextProvider( editor.WPIE?.providers );
	// Local semantics: when the salience model is installed, score the
	// words once so the generator accents the MEANINGFUL word.
	const [ salience, setSalience ] = useState( null );
	useEffect( () => {
		let cancelled = false;
		if ( layer && salienceAvailable() ) {
			wordSalience( text )
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

	// The families this site can show; the rolls and the cloud draw from
	// them, so a tile never promises a face the canvas cannot paint.
	const pool = useMemo( () => lookFontPool(), [] );
	const generated = useMemo(
		() =>
			seeds
				.map( ( seed ) =>
					generateTextLook( segments, { salience, pool }, seed )
				)
				.filter( Boolean ),
		[ segments, seeds, salience, pool ]
	);
	const entries = useMemo(
		() => [
			...CLASSIC_LOOKS.slice( 0, CLASSIC_COUNT ).map( ( c ) => ( {
				key: keyOf( c.look ),
				name: c.name,
				look: c.look,
				group: 'classic',
			} ) ),
			...generated.map( ( g ) => ( {
				key: keyOf( g ),
				name: __( 'Generated', 'wunderpaint' ),
				look: g,
				group: 'generated',
			} ) ),
			...aiLooks.map( ( l ) => ( {
				key: keyOf( l ),
				name: __( 'Suggestion', 'wunderpaint' ),
				look: l,
				group: 'ai',
			} ) ),
		],
		[ generated, aiLooks ]
	);

	const ground = previewGround( layer );
	const previewSource = useMemo(
		() => ( { layer, doc: state.doc, layers: state.layers } ),
		[ layer, state.doc, state.layers ]
	);
	const tileH = layer
		? Math.max(
				TILE_H_MIN,
				Math.min(
					TILE_H_MAX,
					Math.round( ( TILE_W * layer.h ) / Math.max( 1, layer.w ) )
				)
		  )
		: TILE_H_MIN;

	// Render the tiles one after another through the real pipeline, fonts
	// first; a new text, box or colour starts the set over.
	useEffect( () => {
		if ( ! layer ) {
			return undefined;
		}
		if ( doneRef.current.source !== previewSource ) {
			doneRef.current = { source: previewSource, set: new Set() };
			setPreviews( {} );
		}
		let cancelled = false;
		( async () => {
			const scale = Math.min(
				TILE_W / Math.max( 1, layer.w ),
				tileH / Math.max( 1, layer.h ),
				1
			);
			let backdrop = null;
			try {
				// Same document renderer and crop as the canvas, with only the
				// chosen text hidden. Keeping the layer preserves group/clip links.
				backdrop = await renderToCanvas(
					state.doc,
					state.layers.map( ( l ) =>
						l.id === layer.id ? { ...l, visible: false } : l
					),
					{
						viewport: {
							x: layer.x,
							y: layer.y,
							w: layer.w,
							h: layer.h,
						},
						scale,
						cache: sharedImageCache,
					}
				);
				// A cross-origin image must not taint every thumbnail. In that
				// case, use the light/dark ground selected from the text color.
				backdrop.toDataURL();
			} catch ( e ) {
				backdrop = null;
			}
			for ( const entry of entries ) {
				if ( cancelled ) {
					return;
				}
				if ( doneRef.current.set.has( entry.key ) ) {
					continue;
				}
				try {
					await ensureFontsForLayers( [ fontProbe( entry.look ) ] );
					const pl = previewLayer( layer, entry.look );
					const canvas = await renderToCanvas(
						{
							w: layer.w,
							h: layer.h,
							bg: 'transparent',
						},
						[ pl ],
						{
							viewport: { x: 0, y: 0, w: layer.w, h: layer.h },
							scale,
							cache: sharedImageCache,
						}
					);
					const ctx = canvas.getContext( '2d' );
					ctx.save();
					ctx.globalCompositeOperation = 'destination-over';
					if ( backdrop ) {
						ctx.drawImage(
							backdrop,
							0,
							0,
							canvas.width,
							canvas.height
						);
					}
					// Also fills genuinely transparent portions of the document.
					ctx.fillStyle = ground;
					ctx.fillRect( 0, 0, canvas.width, canvas.height );
					ctx.restore();
					const url = canvas.toDataURL();
					if ( cancelled ) {
						return;
					}
					doneRef.current.set.add( entry.key );
					if ( url ) {
						setPreviews( ( prev ) => ( {
							...prev,
							[ entry.key ]: url,
						} ) );
					}
				} catch ( e ) {
					// The tile keeps its spinner; the look still applies.
				}
			}
		} )();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ entries, previewSource, tileH, ground ] );

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

	if ( ! layer || 'text' !== layer.type || ! segments.length ) {
		return null;
	}

	const activeKey = layer.textLook ? keyOf( layer.textLook ) : null;
	const fetchAi = async () => {
		if ( aiBusy ) {
			return;
		}
		setAiBusy( true );
		try {
			const res = await ai.layout( {
				text,
				segments: segments.map( ( s ) => s.text ),
				fonts: pool,
				style: aiStyle,
				w: Math.round( layer.w ),
				h: Math.round( layer.h ),
				n: GENERATED_COUNT,
			} );
			const stamp = Date.now();
			const cleaned = ( res?.items || [] )
				.map( ( it, i ) =>
					cleanTextLook( {
						...it,
						source: 'ai',
						id: 'ai-' + stamp + '-' + i,
					} )
				)
				.filter( Boolean )
				.slice( 0, GENERATED_COUNT );
			if ( ! cleaned.length ) {
				throw new Error(
					__(
						'No usable suggestions returned. Please try again.',
						'wunderpaint'
					)
				);
			}
			setAiLooks( cleaned );
		} catch ( err ) {
			extras?.toasts?.error( err.message );
		} finally {
			setAiBusy( false );
		}
	};

	const tiles = ( group ) =>
		entries
			.filter( ( e ) => e.group === group )
			.map( ( entry ) => (
				<button
					key={ entry.key }
					className={
						'layout-tile' +
						( activeKey === entry.key ? ' active' : '' )
					}
					title={ entry.name }
					onClick={ () => applyTextLookOp( editor, entry.look ) }
				>
					<span
						className="layout-tile-img"
						style={ { height: tileH, background: ground } }
					>
						{ previews[ entry.key ] ? (
							<img src={ previews[ entry.key ] } alt="" />
						) : (
							<span className="layout-tile-loading" />
						) }
					</span>
					<span className="layout-tile-name">{ entry.name }</span>
				</button>
			) );

	// Leave the context bar's stacking context so other canvas overlays
	// cannot cover the chooser. Keep the portal inside the editor theme root.
	return createPortal(
		<div
			ref={ ref }
			className="layout-popover"
			role="presentation"
			onMouseDown={ ( e ) => e.stopPropagation() }
		>
			<FloatPanel
				title={ __( 'Layouts', 'wunderpaint' ) }
				icon={ I.brand( { size: 15 } ) }
				width={ 480 }
				pos={ pos }
				onMove={ ( next ) =>
					setPos(
						fitPanel(
							next,
							ref.current?.querySelector( '.ed-float-panel' )
						)
					)
				}
				onClose={ onClose }
			>
				<div className="layout-pop-section">
					<span>{ __( 'Classics', 'wunderpaint' ) }</span>
				</div>
				<div className="layout-tiles">{ tiles( 'classic' ) }</div>
				<div className="layout-pop-section">
					<span>{ __( 'Generated', 'wunderpaint' ) }</span>
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
				</div>
				<div className="layout-tiles">{ tiles( 'generated' ) }</div>
				{ aiLooks.length > 0 && (
					<>
						<div className="layout-pop-section">
							<span>{ __( 'Suggestions', 'wunderpaint' ) }</span>
						</div>
						<div className="layout-tiles">{ tiles( 'ai' ) }</div>
					</>
				) }
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
								onChange={ ( e ) =>
									setAiStyle( e.target.value )
								}
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
			</FloatPanel>
		</div>,
		document.getElementById( 'wpie-root' )
	);
}
