/**
 * Color popover: free HSV picker (v1.0.1), hex/RGB/HSL number fields and
 * an alpha slider (v1.0.2), the 20 SWATCHES (spec 04.3), persistent recent
 * colors and starred custom swatches (v0.3). Emits #rrggbb, or #rrggbbaa
 * when alpha < 100% (canvas + CSS parse both).
 */

import {
	useState,
	useEffect,
	useReducer,
	useRef,
	Fragment,
} from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { SWATCHES } from '../store/constants';
import { I } from '../icons';
import { HsvPicker } from './hsv-picker';
import {
	parseColor,
	rgbToHex,
	toHexColor,
	rgbToHsl,
	hslToRgb,
} from '../lib/color';
import { extractPalette } from '../lib/palette';
import { renderToCanvas, sharedImageCache } from '../lib/raster';
import { useEditorMaybe } from '../store/editor-context';
import {
	recentColors,
	pushRecentColor,
	customSwatches,
	toggleCustomSwatch,
	isCustomSwatch,
} from '../lib/user-swatches';
import {
	getExtractedColors,
	onExtractedColorsChange,
} from '../lib/extracted-colors';

const clamp = ( n, min, max ) => Math.max( min, Math.min( max, n ) );

/**
 * Fixed-position style anchored to an element rect (v1.0.6). Ancestors with
 * overflow:hidden (menubar options row, docks) clipped the absolutely
 * positioned popover, fixed positioning escapes them; clamped to viewport.
 *
 * @param {DOMRect} rect Anchor bounding rect.
 * @return {Object} Style object for ColorPopover.
 */
export function anchoredPopoverStyle( rect ) {
	const width = 218;
	const estHeight = 480;
	const left = clamp( rect.left, 8, window.innerWidth - width - 12 );
	let top = rect.bottom + 8;
	if ( top + estHeight > window.innerHeight - 8 ) {
		top = Math.max( 8, window.innerHeight - estHeight - 8 );
	}
	return { position: 'fixed', left, top, zIndex: 700 };
}

/** Compact labelled number input for the RGB/HSL rows. */
function ChannelInput( { label, value, max, onChange } ) {
	return (
		<label className="cp-channel">
			<input
				type="number"
				min="0"
				max={ max }
				value={ value }
				aria-label={ label }
				onChange={ ( e ) =>
					onChange(
						clamp( Math.round( +e.target.value || 0 ), 0, max )
					)
				}
			/>
			<span>{ label }</span>
		</label>
	);
}

export function ColorPopover( {
	color,
	onChange,
	onClose,
	style,
	embedded = false,
} ) {
	const initial = parseColor( color || '#000000' );
	const [ base, setBase ] = useState( () =>
		rgbToHex( initial.r, initial.g, initial.b )
	);
	const [ alpha, setAlpha ] = useState( initial.a );
	const [ hexText, setHexText ] = useState( null ); // typing buffer
	const [ mode, setMode ] = useState( 'hex' );
	const [ recents, setRecents ] = useState( recentColors );
	const [ custom, setCustom ] = useState( customSwatches );
	const [ imagePalette, setImagePalette ] = useState( [] );
	const [ extracted, setExtracted ] = useState( getExtractedColors );
	useEffect(
		() =>
			onExtractedColorsChange( () =>
				setExtracted( getExtractedColors() )
			),
		[]
	);
	// Nullable on purpose: the bridge mounts SwatchButton outside the
	// provider (extension packs); every use below optional-chains.
	const editorCtx = useEditorMaybe();
	const ref = useRef( null );
	const lastEmitted = useRef( color );

	// Brand kit palettes (v1.77.6): one captioned swatch group per kit.
	// window.WPIE first: the context copy misses kits saved after boot.
	const brandGroups = (
		window.WPIE?.brandKits ||
		editorCtx?.WPIE?.brandKits ||
		[]
	)
		.map( ( k, i ) => ( {
			key: k.id || String( i ),
			name: k.name || __( 'Brand Kit', 'wunderpaint' ),
			colors: [ ...new Set( k.colors || [] ) ],
		} ) )
		.filter( ( g ) => g.colors.length > 0 );

	// Saved swatch sets from the Color Schemer (v1.103.0), same idiom.
	const [ , bumpPalettes ] = useReducer( ( x ) => x + 1, 0 );
	useEffect( () => {
		window.addEventListener( 'wpie:palettes-updated', bumpPalettes );
		return () =>
			window.removeEventListener( 'wpie:palettes-updated', bumpPalettes );
	}, [] );
	const paletteGroups = ( window.WPIE?.palettes || [] )
		.map( ( p, i ) => ( {
			key: 'pal' + ( p.id || String( i ) ),
			name: p.name || __( 'Palette', 'wunderpaint' ),
			colors: [ ...new Set( p.colors || [] ) ],
		} ) )
		.filter( ( g ) => g.colors.length > 0 );

	const current = () => {
		const p = parseColor( base );
		return toHexColor( p.r, p.g, p.b, alpha );
	};

	const emit = ( nextBase, nextAlpha ) => {
		const p = parseColor( nextBase );
		const out = toHexColor( p.r, p.g, p.b, nextAlpha );
		lastEmitted.current = out;
		onChange( out );
	};

	// Remember applied colors across sessions (v0.3).
	const remember = ( value ) => setRecents( pushRecentColor( value ) );

	// Follow external changes, but not our own onChange echoes.
	useEffect( () => {
		if ( color && color !== lastEmitted.current ) {
			const p = parseColor( color );
			setBase( rgbToHex( p.r, p.g, p.b ) );
			setAlpha( p.a );
			setHexText( null );
		}
	}, [ color ] );

	// Suggest dominant document colors (v1.0), lazy, once per open.
	useEffect( () => {
		if ( ! editorCtx?.state?.layers?.length ) {
			return;
		}
		let cancelled = false;
		const { doc, layers } = editorCtx.state;
		renderToCanvas( doc, layers, {
			scale: Math.min( 1, 96 / Math.max( doc.w, doc.h ) ),
			cache: sharedImageCache,
		} )
			.then( ( canvas ) => {
				if ( ! cancelled ) {
					setImagePalette( extractPalette( canvas, 6 ) );
				}
			} )
			.catch( () => {} );
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	useEffect( () => {
		// Embedded (always-open) mode has no outside-click / Escape close, and
		// must NOT install a global capture-phase Escape handler (it would
		// swallow Escape for the rest of the editor).
		if ( embedded ) {
			return undefined;
		}
		const onDown = ( e ) => {
			if ( ref.current && ! ref.current.contains( e.target ) ) {
				onClose?.();
			}
		};
		const onKey = ( e ) => {
			if ( 'Escape' === e.key ) {
				e.stopPropagation();
				onClose?.();
			}
		};
		document.addEventListener( 'mousedown', onDown );
		document.addEventListener( 'keydown', onKey, true );
		return () => {
			document.removeEventListener( 'mousedown', onDown );
			document.removeEventListener( 'keydown', onKey, true );
		};
	}, [ onClose, embedded ] );

	const applyHexText = ( value ) => {
		setHexText( value );
		if ( /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test( value ) ) {
			const p = parseColor( value );
			setBase( rgbToHex( p.r, p.g, p.b ) );
			setAlpha( p.a );
			emit( value, p.a );
			remember( value.toLowerCase() );
		}
	};

	const applyRgb = ( patch ) => {
		const p = { ...parseColor( base ), ...patch };
		const next = rgbToHex( p.r, p.g, p.b );
		setBase( next );
		setHexText( null );
		emit( next, alpha );
	};

	const applyHsl = ( patch ) => {
		const p = parseColor( base );
		const hsl = { ...rgbToHsl( p.r, p.g, p.b ), ...patch };
		const back = hslToRgb( hsl.h, hsl.s, hsl.l );
		const next = rgbToHex( back.r, back.g, back.b );
		setBase( next );
		setHexText( null );
		emit( next, alpha );
	};

	const applyAlpha = ( a ) => {
		setAlpha( a );
		emit( base, a );
	};

	const pick = ( sw ) => {
		const p = parseColor( sw );
		setBase( rgbToHex( p.r, p.g, p.b ) );
		setAlpha( p.a );
		setHexText( null );
		emit( sw, p.a );
		remember( toHexColor( p.r, p.g, p.b, p.a ) );
	};

	const parsed = parseColor( base );
	const hsl = rgbToHsl( parsed.r, parsed.g, parsed.b );
	const starred = isCustomSwatch( current() );

	return (
		<div
			className={
				'color-popover' + ( embedded ? ' color-popover-embedded' : '' )
			}
			style={ embedded ? undefined : style }
			ref={ ref }
		>
			<HsvPicker
				color={ base }
				onChange={ ( value ) => {
					setBase( value );
					setHexText( null );
					emit( value, alpha );
				} }
				onCommit={ () => remember( current() ) }
			/>
			<div className="cp-alpha-row">
				<div
					className="cp-alpha"
					style={ {
						'--cp-color': base,
					} }
				>
					<input
						type="range"
						min="0"
						max="100"
						value={ Math.round( alpha * 100 ) }
						aria-label={ __( 'Opacity', 'wunderpaint' ) }
						onChange={ ( e ) =>
							applyAlpha( +e.target.value / 100 )
						}
						onPointerUp={ () => remember( current() ) }
					/>
				</div>
				<span className="cp-alpha-val">
					{ Math.round( alpha * 100 ) }%
				</span>
			</div>
			<div className="cp-modes" role="tablist">
				{ [ 'hex', 'rgb', 'hsl' ].map( ( m ) => (
					<button
						key={ m }
						type="button"
						role="tab"
						aria-selected={ mode === m }
						className={ mode === m ? 'active' : '' }
						onClick={ () => setMode( m ) }
					>
						{ m.toUpperCase() }
					</button>
				) ) }
				{ window.EyeDropper && (
					<button
						type="button"
						className="cp-eyedropper"
						title={ __( 'Pick from screen…', 'wunderpaint' ) }
						aria-label={ __( 'Pick from screen…', 'wunderpaint' ) }
						onClick={ async () => {
							try {
								const result =
									await new window.EyeDropper().open();
								if ( result?.sRGBHex ) {
									pick( result.sRGBHex );
								}
							} catch ( e ) {
								// user cancelled, fine
							}
						} }
					>
						{ I.eyedropper( { size: 13 } ) }
					</button>
				) }
			</div>
			{ 'hex' === mode && (
				<div className="hex-row">
					<input
						type="text"
						value={ null !== hexText ? hexText : current() }
						onChange={ ( e ) =>
							applyHexText(
								e.target.value.startsWith( '#' )
									? e.target.value
									: '#' + e.target.value
							)
						}
						onBlur={ () => setHexText( null ) }
						aria-label={ __( 'Hex color', 'wunderpaint' ) }
						spellCheck={ false }
					/>
					<button
						type="button"
						className={ 'sw-star' + ( starred ? ' active' : '' ) }
						title={
							starred
								? __( 'Remove from my swatches', 'wunderpaint' )
								: __( 'Save to my swatches', 'wunderpaint' )
						}
						onClick={ () =>
							setCustom( toggleCustomSwatch( current() ) )
						}
					>
						{ starred ? '★' : '☆' }
					</button>
				</div>
			) }
			{ 'rgb' === mode && (
				<div
					className="cp-channels"
					onBlur={ () => remember( current() ) }
				>
					<ChannelInput
						label="R"
						value={ parsed.r }
						max={ 255 }
						onChange={ ( v ) => applyRgb( { r: v } ) }
					/>
					<ChannelInput
						label="G"
						value={ parsed.g }
						max={ 255 }
						onChange={ ( v ) => applyRgb( { g: v } ) }
					/>
					<ChannelInput
						label="B"
						value={ parsed.b }
						max={ 255 }
						onChange={ ( v ) => applyRgb( { b: v } ) }
					/>
				</div>
			) }
			{ 'hsl' === mode && (
				<div
					className="cp-channels"
					onBlur={ () => remember( current() ) }
				>
					<ChannelInput
						label="H°"
						value={ Math.round( hsl.h ) }
						max={ 360 }
						onChange={ ( v ) => applyHsl( { h: v } ) }
					/>
					<ChannelInput
						label="S%"
						value={ Math.round( hsl.s * 100 ) }
						max={ 100 }
						onChange={ ( v ) => applyHsl( { s: v / 100 } ) }
					/>
					<ChannelInput
						label="L%"
						value={ Math.round( hsl.l * 100 ) }
						max={ 100 }
						onChange={ ( v ) => applyHsl( { l: v / 100 } ) }
					/>
				</div>
			) }
			{ [ ...brandGroups, ...paletteGroups ].map( ( g ) => (
				<Fragment key={ g.key }>
					<div className="cp-group-label">{ g.name }</div>
					<div className="swatches" aria-label={ g.name }>
						{ g.colors.map( ( sw ) => (
							<button
								key={ sw }
								className="sw"
								style={ { background: sw } }
								aria-label={ sw }
								onClick={ () => pick( sw ) }
							/>
						) ) }
					</div>
				</Fragment>
			) ) }
			{ extracted.length > 0 && (
				<Fragment>
					<div className="cp-group-label">
						{ __( 'Document colors', 'wunderpaint' ) }
					</div>
					<div
						className="swatches"
						aria-label={ __( 'Document colors', 'wunderpaint' ) }
					>
						{ extracted.map( ( sw ) => (
							<button
								key={ 'x' + sw }
								className="sw"
								style={ { background: sw } }
								aria-label={ sw }
								onClick={ () => pick( sw ) }
							/>
						) ) }
					</div>
				</Fragment>
			) }
			{ imagePalette.length > 0 && (
				<Fragment>
					<div className="cp-group-label">
						{ __( 'From image', 'wunderpaint' ) }
					</div>
					<div
						className="swatches"
						aria-label={ __( 'From image', 'wunderpaint' ) }
					>
						{ imagePalette.map( ( sw ) => (
							<button
								key={ sw }
								className="sw"
								style={ { background: sw } }
								aria-label={ sw }
								onClick={ () => pick( sw ) }
							/>
						) ) }
					</div>
				</Fragment>
			) }
			{ custom.length > 0 && (
				<Fragment>
					<div className="cp-group-label">
						{ __( 'My swatches', 'wunderpaint' ) }
					</div>
					<div
						className="swatches"
						aria-label={ __( 'My swatches', 'wunderpaint' ) }
					>
						{ custom.map( ( sw ) => (
							<button
								key={ sw }
								className="sw"
								style={ { background: sw } }
								aria-label={ sw }
								onClick={ () => pick( sw ) }
							/>
						) ) }
					</div>
				</Fragment>
			) }
			{ recents.length > 0 && (
				<Fragment>
					<div className="cp-group-label">
						{ __( 'Recent colors', 'wunderpaint' ) }
					</div>
					<div
						className="swatches"
						aria-label={ __( 'Recent colors', 'wunderpaint' ) }
					>
						{ recents.map( ( sw ) => (
							<button
								key={ sw }
								className="sw"
								style={ { background: sw } }
								aria-label={ sw }
								onClick={ () => pick( sw ) }
							/>
						) ) }
					</div>
				</Fragment>
			) }
			<div className="cp-group-label">
				{ __( 'Default swatches', 'wunderpaint' ) }
			</div>
			<div
				className="swatches"
				aria-label={ __( 'Default swatches', 'wunderpaint' ) }
			>
				{ SWATCHES.map( ( sw ) => (
					<button
						key={ sw }
						className="sw"
						style={ { background: sw } }
						aria-label={ sw }
						onClick={ () => pick( sw ) }
					/>
				) ) }
			</div>
		</div>
	);
}

/** A small swatch button that opens the popover. */
// `tipProps` (v1.250.1): hover handlers from useHoverTip replace the
// native title bubble where the host row uses styled tooltips (the
// canvas context bar); the title prop then only feeds the aria-label.
export function SwatchButton( {
	color,
	onChange,
	title,
	className = 'swatch',
	size = 26,
	tipProps = null,
	// Lets a <label htmlFor> point at the swatch itself (v1.348.0).
	id,
} ) {
	const [ open, setOpen ] = useState( null ); // anchored style | null
	return (
		<span style={ { position: 'relative', display: 'inline-flex' } }>
			<button
				id={ id }
				type="button"
				className={ className }
				title={ tipProps ? undefined : title }
				aria-label={ title || 'color' }
				style={ {
					background: color,
					width: size,
					height: size,
					borderRadius: 3,
					border: '1px solid var(--ed-border-strong)',
				} }
				{ ...( tipProps || {} ) }
				onClick={ ( e ) => {
					// The styled tip must not linger over the popover.
					tipProps?.onMouseLeave?.( e );
					// Read the rect synchronously, a state updater runs in a
					// later render phase, by which point React has nulled the
					// synthetic event's currentTarget. That only bites when the
					// queue already holds an update (the outside-mousedown that
					// closes the popover on the 2nd click), so the eager-state
					// path no longer runs the updater in-handler → black-screen
					// crash on reopening (v1.24.7).
					const rect = e.currentTarget.getBoundingClientRect();
					setOpen( ( o ) =>
						o ? null : anchoredPopoverStyle( rect )
					);
				} }
			/>
			{ open && (
				<ColorPopover
					color={ color }
					onChange={ onChange }
					onClose={ () => setOpen( null ) }
					style={ open }
				/>
			) }
		</span>
	);
}
