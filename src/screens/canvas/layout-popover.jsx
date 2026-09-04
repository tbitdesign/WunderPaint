/**
 * Layout popover (Text Looks, v1.430): the Layouts button opens this
 * fixed-anchored panel with every classic look, four seeded rolls and,
 * on request, cloud suggestions. Each tile renders the look on the
 * layer's OWN box through the real pipeline, on the document's ground,
 * with its name underneath. Clicking a tile puts the look on the layer
 * (Fluid Text goes on with it); × takes the look off again.
 */

import { useState, useEffect, useRef, useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { renderToCanvas, sharedImageCache } from '../../lib/raster';
import { ensureFontsForLayers } from '../../lib/font-manager';
import { hasTextProvider } from '../../lib/providers';
import {
	CLASSIC_LOOKS,
	cleanTextLook,
	splitSegments,
} from '../../lib/text-look';
import { generateTextLook, lookFontPool } from '../../lib/text-look-generator';
import { sourceTextOf, clearTextLayoutOp } from '../../lib/text-layouts';
import { applyTextLookOp, clearTextLookOp } from '../../lib/text-fit-ops';
import { ai } from '../../lib/api';
import { salienceAvailable, wordSalience } from '../../lib/text-salience';

const TILE_W = 148;
const TILE_H_MAX = 110;
const TILE_H_MIN = 44;

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
	const text = layer
		? layer.textLayout
			? sourceTextOf( layer )
			: layer.text
		: '';
	const segments = useMemo( () => splitSegments( text ), [ text ] );
	const [ seeds, setSeeds ] = useState( () =>
		Array.from(
			{ length: 4 },
			( _, i ) => ( Date.now() % 100000 ) + i * 7919
		)
	);
	const [ previews, setPreviews ] = useState( {} );
	const doneRef = useRef( { key: '', set: new Set() } );
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
			...CLASSIC_LOOKS.map( ( c ) => ( {
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

	const docBg = state.doc?.bg || '#ffffff';
	const transparent = ! docBg || 'transparent' === docBg;
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
	const renderKey = layer
		? `${ layer.id }|${ text }|${ layer.w }x${ layer.h }|${ layer.color }|${
				layer.spans ? JSON.stringify( layer.spans ) : ''
		  }`
		: '';
	useEffect( () => {
		if ( ! layer ) {
			return undefined;
		}
		if ( doneRef.current.key !== renderKey ) {
			doneRef.current = { key: renderKey, set: new Set() };
			setPreviews( {} );
		}
		let cancelled = false;
		( async () => {
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
					const scale = Math.min(
						TILE_W / Math.max( 1, layer.w ),
						tileH / Math.max( 1, layer.h ),
						1
					);
					const canvas = await renderToCanvas(
						{
							w: layer.w,
							h: layer.h,
							bg: transparent ? 'transparent' : docBg,
						},
						[ pl ],
						{
							viewport: { x: 0, y: 0, w: layer.w, h: layer.h },
							scale,
							cache: sharedImageCache,
						}
					);
					const url = canvas?.toDataURL?.() || null;
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
	}, [ entries, renderKey ] );

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
				n: 4,
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
				.filter( Boolean );
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
	const remove = () => {
		if ( layer.textLook ) {
			clearTextLookOp( editor );
		} else if ( layer.textLayout ) {
			clearTextLayoutOp( editor );
		}
	};

	const left = Math.max(
		8,
		Math.min( anchor.left, window.innerWidth - ( TILE_W * 3 + 44 ) )
	);
	const top = Math.min( anchor.top, window.innerHeight - 300 );

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
						className={
							'layout-tile-img' +
							( transparent ? ' checker' : '' )
						}
						style={ { height: tileH } }
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
				{ ( !! layer.textLook || !! layer.textLayout ) && (
					<button
						className="ai-btn secondary"
						title={ __( 'Remove layout', 'wunderpaint' ) }
						onClick={ remove }
					>
						×
					</button>
				) }
			</div>
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
