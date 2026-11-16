import {
	useEffect,
	useMemo,
	useRef,
	useState,
	useId,
} from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { I } from '../../icons';
import { ColorField } from '../../components/color-field';
import { buildScheme, HARMONIES } from '../../lib/color-scheme';
import { saveColorPalette } from '../../lib/save-color-palette';
import { ToolSetting } from './tool-setting';

export function ColorHarmony( {
	color,
	context,
	value,
	onChange,
	onPreview,
	onPreviewEnd,
	onGradient,
	Tiles,
	extras,
	settings,
	onSettings,
} ) {
	const baseId = useId();
	const [ base, setBase ] = useState( settings.harmonyBase || color );
	const [ locked, setLocked ] = useState( !! settings.harmonyLocked );
	const [ expanded, setExpanded ] = useState( false );
	const [ busy, setBusy ] = useState( false );
	const [ params, setParams ] = useState( {
		spread: settings.harmonySpread,
		saturation: settings.harmonySaturation,
		lightness: settings.harmonyLightness,
	} );
	useEffect(
		() =>
			onSettings( {
				harmonyBase: base,
				harmonyLocked: locked,
				harmonySpread: params.spread,
				harmonySaturation: params.saturation,
				harmonyLightness: params.lightness,
			} ),
		[ base, locked, params, onSettings ]
	);
	const ownPick = useRef( null );
	const priorContext = useRef( context );
	useEffect( () => {
		if (
			! locked &&
			( color !== ownPick.current || context !== priorContext.current )
		) {
			setBase( color );
		}
		ownPick.current = null;
		priorContext.current = context;
	}, [ color, context, locked ] );
	const colors = useMemo(
		() => buildScheme( { base, harmony: value, count: 8, ...params } ),
		[ base, value, params ]
	);
	const names = {
		shades: __( 'Shades & tints', 'wunderpaint' ),
		analogous: __( 'Analogous', 'wunderpaint' ),
		complementary: __( 'Complementary', 'wunderpaint' ),
		split: __( 'Split complementary', 'wunderpaint' ),
		triadic: __( 'Triadic', 'wunderpaint' ),
		tetradic: __( 'Tetradic', 'wunderpaint' ),
		mono: __( 'Monochromatic', 'wunderpaint' ),
	};
	const save = async () => {
		setBusy( true );
		try {
			await saveColorPalette( colors, extras );
		} finally {
			setBusy( false );
		}
	};
	return (
		<div className="color-panel-harmony">
			<select
				aria-label={ __( 'Color harmony', 'wunderpaint' ) }
				value={ value }
				onChange={ ( e ) => onChange( null, e.target.value ) }
			>
				{ [
					'shades',
					...HARMONIES.filter( ( h ) => h !== 'shades' ),
				].map( ( id ) => (
					<option key={ id } value={ id }>
						{ names[ id ] }
					</option>
				) ) }
			</select>
			<Tiles
				colors={ colors }
				value={ color }
				label={ __( 'Color harmony', 'wunderpaint' ) }
				className="color-panel-tones"
				onPreview={ onPreview }
				onPreviewEnd={ onPreviewEnd }
				onChange={ ( next ) => {
					ownPick.current = next;
					onChange( next );
				} }
			/>
			<div className="color-harmony-actions">
				<button
					type="button"
					className="dsm-mini"
					aria-pressed={ locked }
					aria-label={ __( 'Lock base color', 'wunderpaint' ) }
					title={ __( 'Lock base color', 'wunderpaint' ) }
					onClick={ () => setLocked( ! locked ) }
				>
					{ ( locked ? I.lock : I.unlock )( { size: 13 } ) }
				</button>
				<button
					type="button"
					className="ai-btn secondary sm"
					aria-expanded={ expanded }
					onClick={ () => setExpanded( ! expanded ) }
				>
					{ __( 'Tune', 'wunderpaint' ) }
				</button>
				{ ! window.WPIE?.standalone && (
					<button
						type="button"
						className="ai-btn secondary sm"
						disabled={ busy }
						onClick={ save }
					>
						{ __( 'Save palette', 'wunderpaint' ) }
					</button>
				) }
			</div>
			{ onGradient && (
				<button
					type="button"
					className="ai-btn secondary sm"
					onClick={ () => onGradient( colors ) }
				>
					{ __( 'Use as gradient', 'wunderpaint' ) }
				</button>
			) }
			{ expanded && (
				<div className="color-harmony-tune">
					<label className="color-harmony-base" htmlFor={ baseId }>
						<span>{ __( 'Base', 'wunderpaint' ) }</span>
						<ColorField
							id={ baseId }
							title={ __( 'Base color', 'wunderpaint' ) }
							color={ base }
							onChange={ setBase }
						/>
					</label>
					{ [
						[ 'spread', __( 'Spread', 'wunderpaint' ), 0 ],
						[
							'saturation',
							__( 'Saturation', 'wunderpaint' ),
							-100,
						],
						[ 'lightness', __( 'Lightness', 'wunderpaint' ), -100 ],
					].map( ( [ key, label, min ] ) => (
						<ToolSetting
							key={ key }
							label={ label }
							value={ params[ key ] }
							min={ min }
							max={ 100 }
							onChange={ ( next ) =>
								setParams( ( current ) => ( {
									...current,
									[ key ]: next,
								} ) )
							}
						/>
					) ) }
					<button
						type="button"
						className="ai-btn secondary sm"
						onClick={ () => {
							setBase( color );
							setParams( {
								spread: 50,
								saturation: 0,
								lightness: 0,
							} );
						} }
					>
						{ __( 'Reset', 'wunderpaint' ) }
					</button>
				</div>
			) }
		</div>
	);
}
