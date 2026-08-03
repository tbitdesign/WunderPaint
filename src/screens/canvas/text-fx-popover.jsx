/**
 * Floating text-effect settings card (v1.142.0): opens top-right over the
 * canvas when an effect tile is clicked in the Effects panel, so the
 * sliders sit next to the text they change instead of below 30 tiles.
 * Same placement family as the Smart Select refine card.
 */

import { useState, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../../icons';
import { TEXT_FX, FX_PARAMS } from '../../lib/text-fx-defs';
import { SwatchButton } from '../../components/color-popover';
import { MediaPicker } from '../../components/media-picker';

export function TextFxPopover( { editor, layer, fxId, onClose } ) {
	const { dispatch, commit } = editor;
	const [ picking, setPicking ] = useState( false );
	// Warp is stored as textFX.warp = { type, bend } (not textFX[id]); it
	// shares this same closeable card as every other text effect (v1.174.1).
	const isWarp = 'warp' === fxId;
	const def = isWarp
		? { label: __( 'Warp', 'wunderpaint' ), def: { bend: 50 } }
		: TEXT_FX.find( ( t ) => t.id === fxId );
	const cur = isWarp ? layer?.textFX?.warp : layer?.textFX?.[ fxId ];
	const gone = ! def || ! cur || ( isWarp && ! cur.type );

	// The effect vanished (preset applied, undo, layer switch): close.
	useEffect( () => {
		if ( gone ) {
			onClose();
		}
	}, [ gone, onClose ] );
	if ( gone ) {
		return null;
	}

	const key = isWarp ? 'warp' : fxId;
	const setPart = ( part ) => {
		dispatch( {
			type: 'UPDATE_LAYER',
			id: layer.id,
			patch: {
				textFX: {
					...( layer.textFX || {} ),
					[ key ]: { ...cur, ...part },
				},
			},
		} );
		commit( __( 'Text effect', 'wunderpaint' ) );
	};
	const remove = () => {
		dispatch( {
			type: 'UPDATE_LAYER',
			id: layer.id,
			patch: { textFX: { ...( layer.textFX || {} ), [ key ]: null } },
		} );
		commit( __( 'Text effect', 'wunderpaint' ) );
		onClose();
	};

	return (
		// Shield the canvas: without this the first pointer-down bubbles
		// into the stage handlers, deselects the layer and unmounts the
		// card mid-drag (same guard as the context bar).
		<div
			className="textfx-pop"
			role="dialog"
			aria-label={ def.label }
			onPointerDown={ ( e ) => e.stopPropagation() }
			onMouseDown={ ( e ) => e.stopPropagation() }
			onClick={ ( e ) => e.stopPropagation() }
		>
			<div className="smart-refine-head">
				<span className="smart-refine-title">
					{ I.sparkles ? I.sparkles( { size: 14 } ) : null }
					{ def.label }
				</span>
				<button
					className="dsm-close"
					onClick={ onClose }
					aria-label={ __( 'Close', 'wunderpaint' ) }
				>
					{ I.close( { size: 15 } ) }
				</button>
			</div>
			{ isWarp ? (
				<label className="smart-refine-field">
					<span>{ __( 'Bend', 'wunderpaint' ) }</span>
					<input
						type="range"
						min={ -100 }
						max={ 100 }
						value={ cur.bend ?? 50 }
						onChange={ ( e ) =>
							setPart( { bend: +e.target.value } )
						}
					/>
				</label>
			) : 'imageFill' === fxId ? (
				<>
					<div
						style={ {
							display: 'flex',
							alignItems: 'center',
							gap: 8,
						} }
					>
						{ cur.src ? (
							<img
								src={ cur.src }
								alt=""
								style={ {
									width: 34,
									height: 34,
									objectFit: 'cover',
									borderRadius: 4,
									border: '1px solid var(--ed-border)',
								} }
							/>
						) : (
							<span
								style={ {
									fontSize: 11,
									color: 'var(--ed-text-muted)',
								} }
							>
								{ __(
									'Pick the photo that fills the letters.',
									'wunderpaint'
								) }
							</span>
						) }
						<button
							className="ai-btn secondary"
							style={ { padding: '3px 10px', fontSize: 11 } }
							onClick={ () => setPicking( ! picking ) }
						>
							{ __( 'Choose image', 'wunderpaint' ) }
						</button>
					</div>
					{ picking && (
						<MediaPicker
							height={ 190 }
							onPick={ ( item ) => {
								setPart( {
									src: item.fullUrl || item.url,
								} );
								setPicking( false );
							} }
						/>
					) }
				</>
			) : (
				FX_PARAMS[ fxId ].map( ( p ) => (
					<label key={ p.key } className="smart-refine-field">
						<span>{ p.label }</span>
						{ p.color ? (
							<SwatchButton
								color={ cur[ p.key ] ?? def.def[ p.key ] }
								onChange={ ( c ) =>
									setPart( { [ p.key ]: c } )
								}
							/>
						) : (
							<input
								type="range"
								min={ p.min }
								max={ p.max }
								value={ cur[ p.key ] ?? def.def[ p.key ] ?? 0 }
								onChange={ ( e ) =>
									setPart( { [ p.key ]: +e.target.value } )
								}
							/>
						) }
					</label>
				) )
			) }
			<button
				className="ai-btn secondary"
				style={ { fontSize: 11, padding: '4px 10px' } }
				onClick={ remove }
			>
				{ __( 'Remove effect', 'wunderpaint' ) }
			</button>
		</div>
	);
}
