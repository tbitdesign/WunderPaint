/**
 * Background Studio (v1.105.0, more styles and looks in v1.433.0):
 * deterministic background generator (mesh gradient, organic, geometric,
 * low-poly, topographic, halftone, rings, confetti, gradient, glow,
 * aurora, bokeh) with ready-made looks, a color strip fed by brand kits /
 * saved swatch sets / chance, a seed dice and a grain overlay. Inserts a full-document raster layer at the bottom of
 * the stack; all parameters live on the layer, so Edit Background in the
 * context menus reopens the studio with the exact settings.
 */

import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { SwatchButton } from '../components/color-popover';
import { makeImage } from '../store/document';
import {
	BG_DEFAULTS,
	encodeBackground,
	renderBackground,
} from '../lib/backgrounds';
import { BACKGROUND_LOOKS, lookParams } from '../lib/background-looks';
import { promptDialog } from '../lib/dialogs';
import { savePattern } from '../lib/user-patterns';
import { registerUserTile, renderToCanvas } from '../lib/raster';
import { extractPalette } from '../lib/palette';
import { buildScheme, randomSchemeInput } from '../lib/color-scheme';
import '../styles/editor/background-studio.css';

const STYLES = () => [
	[ 'mesh', __( 'Mesh Gradient', 'wunderpaint' ) ],
	[ 'organic', __( 'Organic', 'wunderpaint' ) ],
	[ 'geo', __( 'Geometric', 'wunderpaint' ) ],
	[ 'poly', __( 'Low-Poly', 'wunderpaint' ) ],
	[ 'topo', __( 'Topographic', 'wunderpaint' ) ],
	[ 'halftone', __( 'Halftone', 'wunderpaint' ) ],
	[ 'rings', __( 'Rings', 'wunderpaint' ) ],
	[ 'confetti', __( 'Confetti', 'wunderpaint' ) ],
	[ 'gradient', __( 'Gradient', 'wunderpaint' ) ],
	[ 'glow', __( 'Glow', 'wunderpaint' ) ],
	[ 'aurora', __( 'Aurora', 'wunderpaint' ) ],
	[ 'bokeh', __( 'Bokeh', 'wunderpaint' ) ],
	[ 'stars', __( 'Starfield', 'wunderpaint' ) ],
	[ 'terrazzo', __( 'Terrazzo', 'wunderpaint' ) ],
	[ 'plaid', __( 'Plaid', 'wunderpaint' ) ],
	[ 'scales', __( 'Scales', 'wunderpaint' ) ],
];

const styleName = ( style ) => {
	const entry = STYLES().find( ( [ key ] ) => key === style );
	return entry ? entry[ 1 ] : style;
};

/** One line about each style, inside its card in the list (20.10.2026). */
const styleBlurb = ( style ) =>
	( {
		mesh: __(
			'Soft color fields that melt into each other.',
			'wunderpaint'
		),
		organic: __(
			'Flowing blobs or waves, layered like paper.',
			'wunderpaint'
		),
		geo: __(
			'Dots, grids, stripes or rays in clean lines.',
			'wunderpaint'
		),
		poly: __(
			'Faceted triangles catching light and shade.',
			'wunderpaint'
		),
		topo: __( 'Contour lines like a hiking map.', 'wunderpaint' ),
		halftone: __( 'A printed dot screen at any angle.', 'wunderpaint' ),
		rings: __( 'Concentric rings with a gentle warp.', 'wunderpaint' ),
		confetti: __( 'Scattered shapes, festive and playful.', 'wunderpaint' ),
		gradient: __( 'A smooth blend, linear or radial.', 'wunderpaint' ),
		glow: __( 'A soft light that fades out from a point.', 'wunderpaint' ),
		aurora: __( 'Glowing ribbons like northern lights.', 'wunderpaint' ),
		bokeh: __( 'Out-of-focus discs of light.', 'wunderpaint' ),
		stars: __( 'A night sky with stars and a nebula.', 'wunderpaint' ),
		terrazzo: __( 'Stone chips set in a smooth floor.', 'wunderpaint' ),
		plaid: __( 'Woven bands crossing like tartan.', 'wunderpaint' ),
		scales: __(
			'Overlapping scales like a fish or a roof.',
			'wunderpaint'
		),
	} )[ style ] || '';

function Slider( { label, value, min, max, onChange } ) {
	return (
		<div className="dsm-sliderrow">
			<div className="dsm-sliderrow-head">
				<span data-number-label>{ label }</span>
				<span className="dsm-sliderrow-val" data-number-value>
					{ value }
				</span>
			</div>
			<input
				type="range"
				className="dsm-range"
				min={ min }
				max={ max }
				value={ value }
				aria-label={ label }
				onChange={ ( e ) => onChange( +e.target.value ) }
			/>
		</div>
	);
}

/**
 * A choice inside the settings card: two or three words as a segmented
 * control, anything longer as the option grid - the studio rule (one
 * segment that wraps reads as one big button).
 *
 * @param {Object}   props          Props.
 * @param {Array}    props.options  [ key, label ] pairs.
 * @param {string}   props.value    The chosen key.
 * @param {Function} props.onChange Gets the new key.
 */
function Seg( { options, value, onChange } ) {
	const segment = options.length <= 3;
	return (
		<div className={ segment ? 'dsm-seg' : 'dsm-opts' }>
			{ options.map( ( [ key, label ] ) => (
				<button
					key={ key }
					type="button"
					className={
						( segment ? '' : 'dsm-opt ' ) +
						( value === key ? 'active' : '' )
					}
					aria-pressed={ value === key }
					onClick={ () => onChange( key ) }
				>
					{ label }
				</button>
			) ) }
		</div>
	);
}

/**
 * Distinct colors visible in the current document, feeding the strip from the
 * whole design. Generated background layers (they carry `bg`) and the layer
 * currently being edited are skipped, so the new background harmonises with
 * the CONTENT rather than the fill it is about to replace. Rendered on a
 * transparent canvas at a small size, then run through the same vibrancy
 * weighted picker every other "colors from image" path uses.
 *
 * @param {Object} doc    Current document.
 * @param {Array}  layers Current layers.
 * @param {string} skipId Layer id to exclude (the background being edited).
 * @return {Promise<string[]>} Up to five hex colors, most important first.
 */
async function documentColors( doc, layers, skipId ) {
	const content = layers.filter(
		( l ) => l.visible && ! l.bg && l.id !== skipId
	);
	if ( ! content.length ) {
		return [];
	}
	const scale = Math.min( 1, 256 / Math.max( doc.w, doc.h, 1 ) );
	const canvas = await renderToCanvas(
		{ ...doc, bg: 'transparent' },
		content,
		{ scale }
	);
	return extractPalette( canvas, 5 );
}

export function BackgroundStudioDialog( { onClose, extras, layerId = null } ) {
	useEscape( onClose );
	const editor = useEditor();
	const { state, dispatch, commit } = editor;
	const editLayer = layerId
		? state.layers.find( ( l ) => l.id === layerId ) || null
		: null;

	const kits = ( window.WPIE?.brandKits || [] ).filter(
		( k ) => k?.name && ( k.colors || [] ).length > 1
	);
	const sets = ( window.WPIE?.palettes || [] ).filter(
		( p ) => ( p.colors || [] ).length > 1
	);
	// Whole-document colors are offered whenever there is any content layer to
	// sample from (a generated background alone does not count as content).
	const hasDocColors = state.layers.some(
		( l ) => l.visible && ! l.bg && ( ! editLayer || l.id !== editLayer.id )
	);

	const [ params, setParams ] = useState( () => {
		if ( editLayer?.bg ) {
			return { ...BG_DEFAULTS, ...editLayer.bg };
		}
		const kitColors = ( kits[ 0 ]?.colors || [] ).slice( 0, 5 );
		return {
			...BG_DEFAULTS,
			colors: kitColors.length > 1 ? kitColors : BG_DEFAULTS.colors,
			seed: 1 + Math.floor( Math.random() * 1e9 ),
		};
	} );
	const [ preview, setPreview ] = useState( null );
	const [ busy, setBusy ] = useState( false );

	const patch = ( changes ) => setParams( ( p ) => ( { ...p, ...changes } ) );
	const patchStyleOpts = ( changes ) =>
		setParams( ( p ) => ( {
			...p,
			[ p.style ]: {
				...BG_DEFAULTS[ p.style ],
				...p[ p.style ],
				...changes,
			},
		} ) );

	// "New variation" used to throw the seed away: a good variation was gone
	// with the next click. The last ones stay reachable (19.10.2026).
	const [ seeds, setSeeds ] = useState( [] );
	const reseed = () => {
		setSeeds( ( list ) => [ ...list, params.seed ].slice( -20 ) );
		patch( { seed: 1 + Math.floor( Math.random() * 1e9 ) } );
	};
	const previousSeed = () => {
		if ( ! seeds.length ) {
			return;
		}
		patch( { seed: seeds[ seeds.length - 1 ] } );
		setSeeds( ( list ) => list.slice( 0, -1 ) );
	};

	const randomColors = () => {
		const input = randomSchemeInput();
		patch( { colors: buildScheme( input ).slice( 0, 4 ) } );
	};

	const applySource = async ( value ) => {
		if ( ! value ) {
			return;
		}
		const [ kind, id ] = value.split( ':' );
		if ( 'doc' === kind ) {
			setBusy( true );
			try {
				const colors = await documentColors(
					state.doc,
					state.layers,
					editLayer?.id
				);
				if ( colors.length ) {
					patch( { colors } );
				}
			} finally {
				setBusy( false );
			}
			return;
		}
		const source =
			'kit' === kind
				? kits.find( ( k ) => k.id === id )
				: sets.find( ( s ) => s.id === id );
		const colors = ( source?.colors || [] ).slice( 0, 5 );
		if ( colors.length > 1 ) {
			patch( { colors } );
		}
	};

	const setColor = ( i, color ) =>
		patch( {
			colors: params.colors.map( ( c, j ) => ( j === i ? color : c ) ),
		} );
	const addColor = () =>
		params.colors.length < 5 &&
		patch( { colors: [ ...params.colors, '#ffffff' ] } );
	const removeColor = () =>
		params.colors.length > 2 &&
		patch( { colors: params.colors.slice( 0, -1 ) } );

	// Live preview at document aspect (identical geometry to the final
	// render: the engine works in relative units).
	// Small previews of every style in the current colors, seed and
	// settings, rendered a few at a time so the dialog never stalls. A card
	// is drawn again only when something it shows changed: the shared
	// colors, seed or grain, or its own settings - a slider of one style
	// used to redraw all sixteen (19.10.2026).
	const [ thumbs, setThumbs ] = useState( {} );
	const drawn = useRef( {} );
	const cardKey = ( key ) =>
		JSON.stringify( [
			params.colors,
			params.seed,
			params.grain,
			params[ key ] || null,
		] );
	const thumbKey = STYLES()
		.map( ( [ key ] ) => cardKey( key ) )
		.join( '|' );
	useEffect( () => {
		const list = STYLES().filter(
			( [ key ] ) => drawn.current[ key ] !== cardKey( key )
		);
		let i = 0;
		let timer = 0;
		const step = () => {
			const batch = {};
			for ( const end = Math.min( list.length, i + 3 ); i < end; i++ ) {
				const key = list[ i ][ 0 ];
				try {
					batch[ key ] = renderBackground(
						{ ...params, style: key },
						156,
						108
					).toDataURL( 'image/jpeg', 0.85 );
					drawn.current[ key ] = cardKey( key );
				} catch ( e ) {
					// A card that cannot render keeps its placeholder.
				}
			}
			setThumbs( ( prev ) => ( { ...prev, ...batch } ) );
			if ( i < list.length ) {
				timer = setTimeout( step, 0 );
			}
		};
		if ( list.length ) {
			timer = setTimeout( step, 150 );
		}
		return () => clearTimeout( timer );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ thumbKey ] );

	const paramsKey = JSON.stringify( params );
	useEffect( () => {
		const t = setTimeout( () => {
			const aspect = state.doc.w / state.doc.h || 1;
			// The stage in the middle column is about this big.
			const pw = aspect >= 1 ? 640 : Math.round( 640 * aspect );
			const ph = aspect >= 1 ? Math.round( 640 / aspect ) : 640;
			try {
				setPreview( renderBackground( params, pw, ph ).toDataURL() );
			} catch ( e ) {
				setPreview( null );
			}
		}, 120 );
		return () => clearTimeout( t );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ paramsKey ] );

	// Inserting renders the picture at full document size and encodes it.
	// Both used to run in one go on the main thread - at twelve megapixels
	// with grain about two seconds of a frozen editor in which the button
	// could not even show that it was working. Now the button says so
	// first, and the encoding runs off the main thread (19.10.2026).
	const mounted = useRef( true );
	useEffect(
		() => () => {
			mounted.current = false;
		},
		[]
	);
	const submit = async () => {
		if ( busy ) {
			return;
		}
		setBusy( true );
		await new Promise( ( resolve ) =>
			requestAnimationFrame( () => setTimeout( resolve, 0 ) )
		);
		try {
			const canvas = renderBackground( params, state.doc.w, state.doc.h );
			const dataUrl = await encodeBackground( canvas, params );
			if ( ! mounted.current ) {
				return;
			}
			// In the editor's language (19.10.2026); a name it gave itself -
			// English from before, or this one - follows the style.
			const name = sprintf(
				/* translators: %s: background style name. */
				__( 'Background: %s', 'wunderpaint' ),
				styleName( params.style )
			);
			const ownName = ( n ) =>
				/^Background\b/.test( n ) ||
				n.startsWith(
					sprintf(
						/* translators: %s: background style name. */
						__( 'Background: %s', 'wunderpaint' ),
						''
					)
				);
			if ( editLayer ) {
				dispatch( {
					type: 'UPDATE_LAYER',
					id: editLayer.id,
					patch: {
						src: dataUrl,
						naturalW: canvas.width,
						naturalH: canvas.height,
						x: 0,
						y: 0,
						w: state.doc.w,
						h: state.doc.h,
						bg: { ...params },
						...( ownName( editLayer.name || '' ) ? { name } : {} ),
					},
				} );
				commit( __( 'Edit background', 'wunderpaint' ) );
			} else {
				dispatch( {
					type: 'ADD_LAYER',
					layer: {
						...makeImage( {
							name,
							x: 0,
							y: 0,
							w: state.doc.w,
							h: state.doc.h,
							src: dataUrl,
							naturalW: canvas.width,
							naturalH: canvas.height,
						} ),
						bg: { ...params },
					},
					index: 0,
				} );
				commit( __( 'Insert background', 'wunderpaint' ) );
			}
			onClose();
		} catch ( e ) {
			extras?.toasts?.error?.(
				__( 'The background could not be generated.', 'wunderpaint' )
			);
		} finally {
			if ( mounted.current ) {
				setBusy( false );
			}
		}
	};

	const style = params.style;
	const opts = { ...BG_DEFAULTS[ style ], ...params[ style ] };

	// Seamless pattern export (v1.110.0): mesh, blobs and the straight
	// geo lattices tile cleanly; waves/rays/poly cannot.
	//
	// Of the four styles added in v1.389.0 three do: the topographic field
	// is built from whole numbers of periods so it meets itself, halftone
	// swings its ramp back with a cosine in tile mode, and confetti stamps
	// every piece at the eight neighbouring offsets. Rings radiate from one
	// centre and cannot repeat, so they stay out.
	const canTile =
		'mesh' === style ||
		'topo' === style ||
		'halftone' === style ||
		'confetti' === style ||
		'terrazzo' === style ||
		'plaid' === style ||
		'scales' === style ||
		( 'organic' === style && 'blobs' === opts.variant ) ||
		( 'geo' === style && 'rays' !== opts.variant );
	const saveAsPattern = async () => {
		const name = await promptDialog( {
			title: __( 'Save as Pattern', 'wunderpaint' ),
			label: __( 'Pattern name', 'wunderpaint' ),
			defaultValue: styleName( style ).slice( 0, 24 ),
		} );
		if ( ! name ) {
			return;
		}
		try {
			const tileCanvas = renderBackground(
				'geo' === style
					? { ...params, geo: { ...params.geo, angle: 0 } }
					: params,
				512,
				512,
				{ tile: true }
			);
			const dataUrl = tileCanvas.toDataURL( 'image/png' );
			await registerUserTile( dataUrl );
			await savePattern( name, dataUrl );
			extras?.toasts?.success?.(
				__(
					'Seamless pattern saved, find it in the Asset Library under Patterns.',
					'wunderpaint'
				)
			);
		} catch ( e ) {
			extras?.toasts?.error?.(
				e?.message ||
					__( 'The pattern could not be saved.', 'wunderpaint' )
			);
		}
	};

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="dsm bgs"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-modal="true"
				aria-label={ __( 'Background Studio', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Background Studio', 'wunderpaint' ) }
							</span>
							<HelpLink
								article="design-tools"
								extras={ extras }
							/>
						</div>
						<div className="dsm-sub">
							{ __(
								'Generative backgrounds with sliders and a seed, no cloud involved.',
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

				<div className="bgs-body">
					{ /* --------------------- styles, as cards --------------------- */ }
					<div className="bgs-left">
						<section className="dsm-card">
							<div className="dsm-card-head">
								{ I.grid( { size: 14 } ) }
								<span>{ __( 'Style', 'wunderpaint' ) }</span>
							</div>
							<div className="dsm-picklist">
								{ STYLES().map( ( [ key, label ] ) => (
									<button
										key={ key }
										type="button"
										className="dsm-pickrow bgs-type"
										aria-pressed={ style === key }
										onClick={ () =>
											patch( { style: key } )
										}
									>
										<span className="dsm-pickrow-icon">
											{ thumbs[ key ] && (
												<img
													src={ thumbs[ key ] }
													alt=""
												/>
											) }
										</span>
										<span className="dsm-pickrow-text">
											<b>{ label }</b>
											<small>{ styleBlurb( key ) }</small>
										</span>
									</button>
								) ) }
							</div>
						</section>
					</div>

					{ /* ------------------------- preview ------------------------- */ }
					<div className="bgs-main">
						<div className="bgs-stage">
							{ preview && (
								<img
									src={ preview }
									alt={ __(
										'Background preview',
										'wunderpaint'
									) }
								/>
							) }
						</div>
						<p className="bgs-note">
							{ __(
								'Rendered at full document size on insert. Same settings, same picture.',
								'wunderpaint'
							) }
						</p>
					</div>

					{ /* ------------------ colors, settings, looks ------------------ */ }
					<div className="bgs-right">
						<section className="dsm-card">
							<div className="dsm-card-head">
								{ I.palette( { size: 14 } ) }
								<span>{ __( 'Colors', 'wunderpaint' ) }</span>
							</div>
							<div className="dsm-card-body">
								<div
									style={ {
										display: 'flex',
										gap: 6,
										alignItems: 'center',
										flexWrap: 'wrap',
									} }
								>
									{ params.colors.map( ( c, i ) => (
										<SwatchButton
											key={ i }
											color={ c }
											size={ 26 }
											title={ __(
												'Color',
												'wunderpaint'
											) }
											onChange={ ( v ) =>
												setColor( i, v )
											}
										/>
									) ) }
									<button
										className="ai-btn secondary"
										style={ { padding: '3px 9px' } }
										disabled={ params.colors.length >= 5 }
										onClick={ addColor }
									>
										+
									</button>
									<button
										className="ai-btn secondary"
										style={ { padding: '3px 9px' } }
										disabled={ params.colors.length <= 2 }
										onClick={ removeColor }
									>
										−
									</button>
								</div>
								<div
									style={ {
										display: 'flex',
										gap: 6,
										alignItems: 'center',
										flexWrap: 'wrap',
									} }
								>
									{ ( hasDocColors ||
										kits.length > 0 ||
										sets.length > 0 ) && (
										<select
											className="dsm-select"
											value=""
											onChange={ ( e ) =>
												applySource( e.target.value )
											}
										>
											<option value="">
												{ __(
													'Colors from…',
													'wunderpaint'
												) }
											</option>
											{ hasDocColors && (
												<option value="doc:all">
													{ __(
														'Colors from document',
														'wunderpaint'
													) }
												</option>
											) }
											{ kits.map( ( k ) => (
												<option
													key={ k.id }
													value={ 'kit:' + k.id }
												>
													{ __(
														'Brand Kit',
														'wunderpaint'
													) +
														': ' +
														k.name }
												</option>
											) ) }
											{ sets.map( ( s ) => (
												<option
													key={ s.id }
													value={ 'set:' + s.id }
												>
													{ __(
														'Swatch set',
														'wunderpaint'
													) +
														': ' +
														s.name }
												</option>
											) ) }
										</select>
									) }
									<button
										className="ai-btn secondary"
										onClick={ randomColors }
									>
										{ __( 'Random colors', 'wunderpaint' ) }
									</button>
									<button
										className="ai-btn secondary"
										style={ {
											display: 'flex',
											alignItems: 'center',
											padding: '3px 9px',
										} }
										title={ __(
											'Previous variation',
											'wunderpaint'
										) }
										aria-label={ __(
											'Previous variation',
											'wunderpaint'
										) }
										disabled={ ! seeds.length }
										onClick={ previousSeed }
									>
										{ I.undo( { size: 13 } ) }
									</button>
									<button
										className="ai-btn secondary"
										style={ {
											display: 'flex',
											gap: 6,
											alignItems: 'center',
										} }
										title={ __(
											'New variation with the same settings',
											'wunderpaint'
										) }
										onClick={ reseed }
									>
										{ I.rotateCw( { size: 13 } ) }
										{ __( 'New variation', 'wunderpaint' ) }
									</button>
								</div>
							</div>
						</section>
						<section className="dsm-card">
							<div className="dsm-card-head">
								{ I.sliders( { size: 14 } ) }
								<span>{ styleName( style ) }</span>
							</div>
							<div className="dsm-card-body">
								{ 'mesh' === style && (
									<div
										style={ {
											display: 'grid',
											gridTemplateColumns: '1fr',
											gap: 12,
										} }
									>
										<Slider
											label={ __(
												'Color points',
												'wunderpaint'
											) }
											value={ opts.points }
											min={ 2 }
											max={ 8 }
											onChange={ ( v ) =>
												patchStyleOpts( { points: v } )
											}
										/>
										<Slider
											label={ __(
												'Softness',
												'wunderpaint'
											) }
											value={ opts.softness }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( {
													softness: v,
												} )
											}
										/>
									</div>
								) }
								{ 'organic' === style && (
									<div style={ { display: 'grid', gap: 12 } }>
										<Seg
											options={ [
												[
													'blobs',
													__(
														'Blobs',
														'wunderpaint'
													),
												],
												[
													'waves',
													__(
														'Waves',
														'wunderpaint'
													),
												],
											] }
											value={ opts.variant }
											onChange={ ( v ) =>
												patchStyleOpts( { variant: v } )
											}
										/>
										<div
											style={ {
												display: 'grid',
												gridTemplateColumns: '1fr',
												gap: 12,
											} }
										>
											<Slider
												label={
													'waves' === opts.variant
														? __(
																'Bands',
																'wunderpaint'
														  )
														: __(
																'Count',
																'wunderpaint'
														  )
												}
												value={ opts.count }
												min={ 2 }
												max={
													'waves' === opts.variant
														? 8
														: 12
												}
												onChange={ ( v ) =>
													patchStyleOpts( {
														count: v,
													} )
												}
											/>
											<Slider
												label={
													'waves' === opts.variant
														? __(
																'Amplitude',
																'wunderpaint'
														  )
														: __(
																'Roundness',
																'wunderpaint'
														  )
												}
												value={ opts.shape }
												min={ 0 }
												max={ 100 }
												onChange={ ( v ) =>
													patchStyleOpts( {
														shape: v,
													} )
												}
											/>
										</div>
									</div>
								) }
								{ 'geo' === style && (
									<div style={ { display: 'grid', gap: 12 } }>
										<Seg
											options={ [
												[
													'dots',
													__( 'Dots', 'wunderpaint' ),
												],
												[
													'grid',
													__( 'Grid', 'wunderpaint' ),
												],
												[
													'stripes',
													__(
														'Stripes',
														'wunderpaint'
													),
												],
												[
													'rays',
													__( 'Rays', 'wunderpaint' ),
												],
											] }
											value={ opts.variant }
											onChange={ ( v ) =>
												patchStyleOpts( { variant: v } )
											}
										/>
										<div
											style={ {
												display: 'grid',
												gridTemplateColumns: '1fr',
												gap: 12,
											} }
										>
											<Slider
												label={ __(
													'Size',
													'wunderpaint'
												) }
												value={ opts.size }
												min={ 0 }
												max={ 100 }
												onChange={ ( v ) =>
													patchStyleOpts( {
														size: v,
													} )
												}
											/>
											<Slider
												label={ __(
													'Spacing',
													'wunderpaint'
												) }
												value={ opts.gap }
												min={ 0 }
												max={ 100 }
												onChange={ ( v ) =>
													patchStyleOpts( { gap: v } )
												}
											/>
											<Slider
												label={ __(
													'Angle',
													'wunderpaint'
												) }
												value={ opts.angle }
												min={ 0 }
												max={ 360 }
												onChange={ ( v ) =>
													patchStyleOpts( {
														angle: v,
													} )
												}
											/>
										</div>
									</div>
								) }
								{ 'poly' === style && (
									<div
										style={ {
											display: 'grid',
											gridTemplateColumns: '1fr',
											gap: 12,
										} }
									>
										<Slider
											label={ __(
												'Cell size',
												'wunderpaint'
											) }
											value={ opts.cell }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { cell: v } )
											}
										/>
										<Slider
											label={ __(
												'Variance',
												'wunderpaint'
											) }
											value={ opts.variance }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( {
													variance: v,
												} )
											}
										/>
									</div>
								) }

								{ 'topo' === style && (
									<div
										style={ {
											display: 'grid',
											gridTemplateColumns: '1fr',
											gap: 12,
										} }
									>
										<Slider
											label={ __(
												'Lines',
												'wunderpaint'
											) }
											value={ opts.lines }
											min={ 3 }
											max={ 24 }
											onChange={ ( v ) =>
												patchStyleOpts( { lines: v } )
											}
										/>
										<Slider
											label={ __(
												'Line weight',
												'wunderpaint'
											) }
											value={ opts.weight }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { weight: v } )
											}
										/>
										<Slider
											label={ __(
												'Roughness',
												'wunderpaint'
											) }
											value={ opts.rough }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { rough: v } )
											}
										/>
									</div>
								) }

								{ 'halftone' === style && (
									<div
										style={ {
											display: 'grid',
											gridTemplateColumns: '1fr',
											gap: 12,
										} }
									>
										<Slider
											label={ __(
												'Dot size',
												'wunderpaint'
											) }
											value={ opts.size }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { size: v } )
											}
										/>
										<Slider
											label={ __(
												'Spacing',
												'wunderpaint'
											) }
											value={ opts.gap }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { gap: v } )
											}
										/>
										<Slider
											label={ __(
												'Angle',
												'wunderpaint'
											) }
											value={ opts.angle }
											min={ 0 }
											max={ 180 }
											onChange={ ( v ) =>
												patchStyleOpts( { angle: v } )
											}
										/>
									</div>
								) }

								{ 'rings' === style && (
									<div
										style={ {
											display: 'grid',
											gridTemplateColumns: '1fr',
											gap: 12,
										} }
									>
										<Slider
											label={ __(
												'Spacing',
												'wunderpaint'
											) }
											value={ opts.gap }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { gap: v } )
											}
										/>
										<Slider
											label={ __(
												'Line weight',
												'wunderpaint'
											) }
											value={ opts.weight }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { weight: v } )
											}
										/>
										<Slider
											label={ __(
												'Warp',
												'wunderpaint'
											) }
											value={ opts.warp }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { warp: v } )
											}
										/>
									</div>
								) }

								{ 'confetti' === style && (
									<div
										style={ {
											display: 'grid',
											gridTemplateColumns: '1fr',
											gap: 12,
										} }
									>
										<Slider
											label={ __(
												'Count',
												'wunderpaint'
											) }
											value={ opts.count }
											min={ 8 }
											max={ 300 }
											onChange={ ( v ) =>
												patchStyleOpts( { count: v } )
											}
										/>
										<Slider
											label={ __(
												'Size',
												'wunderpaint'
											) }
											value={ opts.size }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { size: v } )
											}
										/>
										<Slider
											label={ __(
												'Shape mix',
												'wunderpaint'
											) }
											value={ opts.mix }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { mix: v } )
											}
										/>
									</div>
								) }

								{ 'gradient' === style && (
									<div style={ { display: 'grid', gap: 12 } }>
										<Seg
											options={ [
												[
													'linear',
													__(
														'Linear',
														'wunderpaint'
													),
												],
												[
													'radial',
													__(
														'Radial',
														'wunderpaint'
													),
												],
											] }
											value={ opts.kind }
											onChange={ ( v ) =>
												patchStyleOpts( { kind: v } )
											}
										/>
										{ 'radial' === opts.kind ? (
											<div
												style={ {
													display: 'grid',
													gridTemplateColumns: '1fr',
													gap: 12,
												} }
											>
												<Slider
													label={ __(
														'Center X',
														'wunderpaint'
													) }
													value={ opts.x }
													min={ 0 }
													max={ 100 }
													onChange={ ( v ) =>
														patchStyleOpts( {
															x: v,
														} )
													}
												/>
												<Slider
													label={ __(
														'Center Y',
														'wunderpaint'
													) }
													value={ opts.y }
													min={ 0 }
													max={ 100 }
													onChange={ ( v ) =>
														patchStyleOpts( {
															y: v,
														} )
													}
												/>
											</div>
										) : (
											<Slider
												label={ __(
													'Angle',
													'wunderpaint'
												) }
												value={ opts.angle }
												min={ 0 }
												max={ 360 }
												onChange={ ( v ) =>
													patchStyleOpts( {
														angle: v,
													} )
												}
											/>
										) }
									</div>
								) }

								{ 'glow' === style && (
									<div
										style={ {
											display: 'grid',
											gridTemplateColumns: '1fr',
											gap: 12,
										} }
									>
										<Slider
											label={ __(
												'Center X',
												'wunderpaint'
											) }
											value={ opts.x }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { x: v } )
											}
										/>
										<Slider
											label={ __(
												'Center Y',
												'wunderpaint'
											) }
											value={ opts.y }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { y: v } )
											}
										/>
										<Slider
											label={ __(
												'Size',
												'wunderpaint'
											) }
											value={ opts.size }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { size: v } )
											}
										/>
									</div>
								) }

								{ 'aurora' === style && (
									<div
										style={ {
											display: 'grid',
											gridTemplateColumns: '1fr',
											gap: 12,
										} }
									>
										<Slider
											label={ __(
												'Bands',
												'wunderpaint'
											) }
											value={ opts.bands }
											min={ 1 }
											max={ 6 }
											onChange={ ( v ) =>
												patchStyleOpts( { bands: v } )
											}
										/>
										<Slider
											label={ __(
												'Thickness',
												'wunderpaint'
											) }
											value={ opts.width }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { width: v } )
											}
										/>
										<Slider
											label={ __(
												'Height',
												'wunderpaint'
											) }
											value={ opts.height }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { height: v } )
											}
										/>
									</div>
								) }

								{ 'bokeh' === style && (
									<div
										style={ {
											display: 'grid',
											gridTemplateColumns: '1fr',
											gap: 12,
										} }
									>
										<Slider
											label={ __(
												'Count',
												'wunderpaint'
											) }
											value={ opts.count }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { count: v } )
											}
										/>
										<Slider
											label={ __(
												'Size',
												'wunderpaint'
											) }
											value={ opts.size }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { size: v } )
											}
										/>
										<Slider
											label={ __(
												'Blur',
												'wunderpaint'
											) }
											value={ opts.blur }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { blur: v } )
											}
										/>
									</div>
								) }

								{ 'stars' === style && (
									<div
										style={ {
											display: 'grid',
											gridTemplateColumns: '1fr',
											gap: 12,
										} }
									>
										<Slider
											label={ __(
												'Stars',
												'wunderpaint'
											) }
											value={ opts.count }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { count: v } )
											}
										/>
										<Slider
											label={ __(
												'Size',
												'wunderpaint'
											) }
											value={ opts.size }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { size: v } )
											}
										/>
										<Slider
											label={ __(
												'Nebula',
												'wunderpaint'
											) }
											value={ opts.glow }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { glow: v } )
											}
										/>
									</div>
								) }

								{ 'terrazzo' === style && (
									<div
										style={ {
											display: 'grid',
											gridTemplateColumns: '1fr',
											gap: 12,
										} }
									>
										<Slider
											label={ __(
												'Count',
												'wunderpaint'
											) }
											value={ opts.count }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { count: v } )
											}
										/>
										<Slider
											label={ __(
												'Size',
												'wunderpaint'
											) }
											value={ opts.size }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { size: v } )
											}
										/>
										<Slider
											label={ __( 'Mix', 'wunderpaint' ) }
											value={ opts.mix }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { mix: v } )
											}
										/>
									</div>
								) }

								{ 'plaid' === style && (
									<div
										style={ {
											display: 'grid',
											gridTemplateColumns: '1fr',
											gap: 12,
										} }
									>
										<Slider
											label={ __(
												'Size',
												'wunderpaint'
											) }
											value={ opts.size }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { size: v } )
											}
										/>
										<Slider
											label={ __(
												'Bands',
												'wunderpaint'
											) }
											value={ opts.bands }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { bands: v } )
											}
										/>
										<Slider
											label={ __(
												'Weave',
												'wunderpaint'
											) }
											value={ opts.weave }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { weave: v } )
											}
										/>
									</div>
								) }

								{ 'scales' === style && (
									<div
										style={ {
											display: 'grid',
											gridTemplateColumns: '1fr',
											gap: 12,
										} }
									>
										<Slider
											label={ __(
												'Size',
												'wunderpaint'
											) }
											value={ opts.size }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { size: v } )
											}
										/>
										<Slider
											label={ __(
												'Rings',
												'wunderpaint'
											) }
											value={ opts.rings }
											min={ 2 }
											max={ 8 }
											onChange={ ( v ) =>
												patchStyleOpts( { rings: v } )
											}
										/>
										<Slider
											label={ __(
												'Line weight',
												'wunderpaint'
											) }
											value={ opts.weight }
											min={ 0 }
											max={ 100 }
											onChange={ ( v ) =>
												patchStyleOpts( { weight: v } )
											}
										/>
									</div>
								) }

								<Slider
									label={ __( 'Grain', 'wunderpaint' ) }
									value={ params.grain }
									min={ 0 }
									max={ 100 }
									onChange={ ( v ) => patch( { grain: v } ) }
								/>
							</div>
						</section>
						<section className="dsm-card">
							<div className="dsm-card-head">
								{ I.sparkles( { size: 14 } ) }
								<span>{ __( 'Looks', 'wunderpaint' ) }</span>
							</div>
							<div className="dsm-opts">
								{ BACKGROUND_LOOKS().map( ( look ) => (
									<button
										key={ look.id }
										type="button"
										className="dsm-opt"
										title={ look.label }
										onClick={ () =>
											setParams( lookParams( look ) )
										}
									>
										{ look.label }
									</button>
								) ) }
							</div>
						</section>
					</div>
				</div>

				<div className="dsm-foot">
					<div className="dsm-hint">
						{ I.layers ? I.layers( { size: 14 } ) : null }
						{ __(
							'Lands as the bottom layer, editable any time via Edit Background.',
							'wunderpaint'
						) }
					</div>
					<div style={ { display: 'flex', gap: 8 } }>
						{ canTile && (
							<button
								className="ai-btn secondary"
								title={ __(
									'Save the current look as a seamless, repeatable tile.',
									'wunderpaint'
								) }
								onClick={ saveAsPattern }
							>
								{ __( 'Save as pattern', 'wunderpaint' ) }
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
							onClick={ submit }
						>
							{ busy
								? __( 'Rendering…', 'wunderpaint' )
								: editLayer
								? __( 'Update background', 'wunderpaint' )
								: __( 'Insert background', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
