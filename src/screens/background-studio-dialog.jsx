/**
 * Background Studio (v1.105.0): deterministic background generator with
 * four styles (mesh gradient, organic, geometric, low-poly), a color
 * strip fed by brand kits / saved swatch sets / chance, a seed dice and
 * a grain overlay. Inserts a full-document raster layer at the bottom of
 * the stack; all parameters live on the layer, so Edit Background in the
 * context menus reopens the studio with the exact settings.
 */

import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { SwatchButton } from '../components/color-popover';
import { makeImage } from '../store/document';
import { BG_DEFAULTS, renderBackground } from '../lib/backgrounds';
import { promptDialog } from '../lib/dialogs';
import { savePattern } from '../lib/user-patterns';
import { registerUserTile, renderToCanvas } from '../lib/raster';
import { extractPalette } from '../lib/palette';
import { buildScheme, randomSchemeInput } from '../lib/color-scheme';

const STYLES = () => [
	[ 'mesh', __( 'Mesh Gradient', 'wunderpaint' ) ],
	[ 'organic', __( 'Organic', 'wunderpaint' ) ],
	[ 'geo', __( 'Geometric', 'wunderpaint' ) ],
	[ 'poly', __( 'Low-Poly', 'wunderpaint' ) ],
];

const styleName = ( style ) => {
	const entry = STYLES().find( ( [ key ] ) => key === style );
	return entry ? entry[ 1 ] : style;
};

function Slider( { label, value, min, max, onChange } ) {
	return (
		<label style={ { display: 'grid', gap: 4, fontSize: 12 } }>
			<span className="dsm-label">
				{ label } { value }
			</span>
			<input
				type="range"
				min={ min }
				max={ max }
				value={ value }
				onChange={ ( e ) => onChange( +e.target.value ) }
			/>
		</label>
	);
}

function Seg( { options, value, onChange } ) {
	return (
		<div className="seg-row" style={ { display: 'flex' } }>
			{ options.map( ( [ key, label ] ) => (
				<button
					key={ key }
					className={ value === key ? 'active' : '' }
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

	const reseed = () =>
		patch( { seed: 1 + Math.floor( Math.random() * 1e9 ) } );

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
	const paramsKey = JSON.stringify( params );
	useEffect( () => {
		const t = setTimeout( () => {
			const aspect = state.doc.w / state.doc.h || 1;
			const pw = aspect >= 1 ? 420 : Math.round( 420 * aspect );
			const ph = aspect >= 1 ? Math.round( 420 / aspect ) : 420;
			try {
				setPreview( renderBackground( params, pw, ph ).toDataURL() );
			} catch ( e ) {
				setPreview( null );
			}
		}, 120 );
		return () => clearTimeout( t );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ paramsKey ] );

	const submit = () => {
		setBusy( true );
		try {
			const canvas = renderBackground( params, state.doc.w, state.doc.h );
			const dataUrl = canvas.toDataURL( 'image/png' );
			const name = 'Background: ' + styleName( params.style );
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
						...( /^Background\b/.test( editLayer.name || '' )
							? { name }
							: {} ),
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
			setBusy( false );
		}
	};

	const style = params.style;
	const opts = { ...BG_DEFAULTS[ style ], ...params[ style ] };

	// Seamless pattern export (v1.110.0): mesh, blobs and the straight
	// geo lattices tile cleanly; waves/rays/poly cannot.
	const canTile =
		'mesh' === style ||
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
				className="stock-dialog"
				style={ {
					width: 'min(760px, 94vw)',
					height: 'auto',
					maxHeight: '90vh',
					gridTemplateRows: 'auto 1fr auto',
				} }
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
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

				<div
					style={ {
						display: 'flex',
						gap: 16,
						padding: 16,
						overflow: 'hidden',
						minHeight: 0,
					} }
				>
					{ /* ------------------------- controls ------------------------ */ }
					<div
						style={ {
							flex: 1,
							minWidth: 0,
							display: 'grid',
							gap: 12,
							overflowY: 'auto',
							paddingRight: 4,
							alignContent: 'start',
						} }
					>
						<Seg
							options={ STYLES() }
							value={ style }
							onChange={ ( v ) => patch( { style: v } ) }
						/>

						<div style={ { display: 'grid', gap: 6 } }>
							<span className="dsm-label">
								{ __( 'Colors', 'wunderpaint' ) }
							</span>
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
										title={ __( 'Color', 'wunderpaint' ) }
										onChange={ ( v ) => setColor( i, v ) }
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

						{ 'mesh' === style && (
							<div
								style={ {
									display: 'grid',
									gridTemplateColumns: '1fr 1fr',
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
									label={ __( 'Softness', 'wunderpaint' ) }
									value={ opts.softness }
									min={ 0 }
									max={ 100 }
									onChange={ ( v ) =>
										patchStyleOpts( { softness: v } )
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
											__( 'Blobs', 'wunderpaint' ),
										],
										[
											'waves',
											__( 'Waves', 'wunderpaint' ),
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
										gridTemplateColumns: '1fr 1fr',
										gap: 12,
									} }
								>
									<Slider
										label={
											'waves' === opts.variant
												? __( 'Bands', 'wunderpaint' )
												: __( 'Count', 'wunderpaint' )
										}
										value={ opts.count }
										min={ 2 }
										max={
											'waves' === opts.variant ? 8 : 12
										}
										onChange={ ( v ) =>
											patchStyleOpts( { count: v } )
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
											patchStyleOpts( { shape: v } )
										}
									/>
								</div>
							</div>
						) }
						{ 'geo' === style && (
							<div style={ { display: 'grid', gap: 12 } }>
								<Seg
									options={ [
										[ 'dots', __( 'Dots', 'wunderpaint' ) ],
										[ 'grid', __( 'Grid', 'wunderpaint' ) ],
										[
											'stripes',
											__( 'Stripes', 'wunderpaint' ),
										],
										[ 'rays', __( 'Rays', 'wunderpaint' ) ],
									] }
									value={ opts.variant }
									onChange={ ( v ) =>
										patchStyleOpts( { variant: v } )
									}
								/>
								<div
									style={ {
										display: 'grid',
										gridTemplateColumns: '1fr 1fr 1fr',
										gap: 12,
									} }
								>
									<Slider
										label={ __( 'Size', 'wunderpaint' ) }
										value={ opts.size }
										min={ 0 }
										max={ 100 }
										onChange={ ( v ) =>
											patchStyleOpts( { size: v } )
										}
									/>
									<Slider
										label={ __( 'Spacing', 'wunderpaint' ) }
										value={ opts.gap }
										min={ 0 }
										max={ 100 }
										onChange={ ( v ) =>
											patchStyleOpts( { gap: v } )
										}
									/>
									<Slider
										label={ __( 'Angle', 'wunderpaint' ) }
										value={ opts.angle }
										min={ 0 }
										max={ 360 }
										onChange={ ( v ) =>
											patchStyleOpts( { angle: v } )
										}
									/>
								</div>
							</div>
						) }
						{ 'poly' === style && (
							<div
								style={ {
									display: 'grid',
									gridTemplateColumns: '1fr 1fr',
									gap: 12,
								} }
							>
								<Slider
									label={ __( 'Cell size', 'wunderpaint' ) }
									value={ opts.cell }
									min={ 0 }
									max={ 100 }
									onChange={ ( v ) =>
										patchStyleOpts( { cell: v } )
									}
								/>
								<Slider
									label={ __( 'Variance', 'wunderpaint' ) }
									value={ opts.variance }
									min={ 0 }
									max={ 100 }
									onChange={ ( v ) =>
										patchStyleOpts( { variance: v } )
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

					{ /* ------------------------- preview ------------------------- */ }
					<div
						style={ {
							width: 300,
							display: 'grid',
							gap: 8,
							alignContent: 'start',
						} }
					>
						<div
							style={ {
								width: 300,
								borderRadius: 8,
								border: '1px solid var(--ed-border-strong)',
								overflow: 'hidden',
								background: 'var(--ed-panel-alt)',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								minHeight: 200,
							} }
						>
							{ preview && (
								<img
									src={ preview }
									alt={ __(
										'Background preview',
										'wunderpaint'
									) }
									style={ {
										width: '100%',
										display: 'block',
									} }
								/>
							) }
						</div>
						<div
							style={ {
								fontSize: 11,
								color: 'var(--ed-text-muted)',
							} }
						>
							{ __(
								'Rendered at full document size on insert. Same settings, same picture.',
								'wunderpaint'
							) }
						</div>
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
							{ editLayer
								? __( 'Update background', 'wunderpaint' )
								: __( 'Insert background', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
