/**
 * The brush panel: everything the brush can do, in reach while painting.
 *
 * It is NOT a seventh tab in the right rail. That rail has six tabs, three
 * over three, every tutorial video is built on that grid, and a seventh
 * would break footage that already exists. So this follows the pattern the
 * editor already has for exactly this case - the Navigator: toggled from
 * the View menu, remembered per browser, floating over the canvas - only
 * freely movable, which the Navigator is not.
 *
 * THE LAYOUT IS THE POINT. A brush panel you have to hunt through is a
 * brush panel nobody opens twice:
 *
 *   left    the 37 tips as rendered strokes, one strip, click to switch.
 *           A name in a dropdown tells you nothing; the stroke tells you
 *           everything.
 *   right   style first, because it changes the most; then the four
 *           numbers you reach for constantly; then the tip's own shape
 *           values; then colour with the full square, because picking a
 *           colour should be one drag and not a dialog.
 */

import { __, _x } from '@wordpress/i18n';
import { useEffect, useState } from '@wordpress/element';

import { groupedTips, getTip } from '../../lib/brush-tips';
import { tipPreview, TIP_TILE } from '../../lib/brush-preview';
import { PAINT_STYLES } from '../../lib/paint-engine';
import { ColorWheel } from '../../components/color-wheel';
import { recentColors } from '../../lib/user-swatches';
import { GradientBar } from '../../components/gradient-bar';
import {
	editDrawnTip,
	readTipLibrary,
	adoptLibraryTip,
} from '../../lib/brush-tip-edit';

/**
 * The three ways a stamped mark can get its colour. One at a time: they
 * are three answers to one question, not three switches to combine.
 */
const COLOUR_MODES = [
	[ 'solid', () => __( 'Solid', 'wunderpaint' ) ],
	[ 'jitter', () => __( 'Jitter', 'wunderpaint' ) ],
	[ 'gradient', () => __( 'Gradient', 'wunderpaint' ) ],
];

const JITTER_ROWS = [
	[ 'hueJitter', () => __( 'Hue', 'wunderpaint' ), 0, 50 ],
	[ 'satJitter', () => __( 'Saturation', 'wunderpaint' ), 0, 100 ],
	[ 'litJitter', () => __( 'Brightness', 'wunderpaint' ), 0, 100 ],
];

/** The tip's own numbers, as a table. */
const SHAPE_ROWS = [
	// _x, NOT __. One bare "Scatter" served both this slider and the chart
	// TYPE, and the catalogue had settled on the chart: the German panel
	// offered a "Streudiagramm" slider and the French one a "Nuage de
	// points". Its own context gives it its own translation.
	[ 'scatter', () => _x( 'Scatter', 'brush tip', 'wunderpaint' ), 0, 150 ],
	[ 'spacing', () => __( 'Spacing', 'wunderpaint' ), 0, 200 ],
	[ 'alphaJitter', () => __( 'Opacity jitter', 'wunderpaint' ), 0, 100 ],
	[ 'sizeJitter', () => __( 'Size jitter', 'wunderpaint' ), 0, 100 ],
];

/** One labelled slider, the shape the whole panel repeats. */
function Row( { label, value, min, max, onChange, suffix } ) {
	return (
		<label className="bp-row">
			<span className="bp-row-label">{ label }</span>
			<input
				type="range"
				min={ min }
				max={ max }
				value={ value }
				onChange={ ( e ) => onChange( +e.target.value ) }
			/>
			<b className="bp-row-val">
				{ value }
				{ suffix || '' }
			</b>
		</label>
	);
}

export function BrushPanel( { editor } ) {
	const { state, dispatch } = editor;
	const tool = state.tool;
	const opts = state.toolOpts[ tool ] || {};
	const set = ( patch ) => dispatch( { type: 'SET_TOOL_OPTS', tool, patch } );
	const tipId = opts.tip || 'round';
	// Colour jitter only survives a plain lay-down; see SHAPE_ROWS.
	// A mark can only carry its own colour if there ARE marks, and only a
	// plain lay-down keeps it: the pigment styles work the colour out
	// themselves and read nothing but coverage from the stroke.
	const plainStyle = 'normal' === ( opts.paintStyle || 'normal' );
	// NOT gated on a stamped tip any more. The soft round tips lay dabs as
	// well, they just lay them close together, so the colour can vary along
	// them too - and a control that vanishes for the DEFAULT brush is how
	// this looked broken rather than limited.
	const canVaryColour = plainStyle && undefined !== opts.colorMode;
	const mode = opts.colorMode || 'solid';
	// No fallback of its own. A panel that draws stops the store does not
	// have is a panel that shows a gradient the brush will not paint, and
	// that is exactly what it did.
	const stops = opts.gradientStops || [];

	// A scatter value falls back to whatever the tip itself says, so the
	// slider always shows the number that is actually in force.
	const tipVal = ( key ) => {
		const t = getTip( tipId );
		return null === opts[ key ] || undefined === opts[ key ]
			? Math.round( ( t[ key ] || 0 ) * 100 )
			: Math.round( opts[ key ] * 100 );
	};

	// Whoever HAS a tip gets the strip beside the sliders, which is the
	// eraser too - it paints through the same tip table. Only the tools
	// with no tip at all stay in the narrow one-column shape, rather than
	// sitting in a window twice the size of their contents.
	const hasTips = undefined !== opts.tip;

	// Tips you saved in the maker, across documents. They are shown but
	// NOT registered for drawing: a stroke stores only its tip's id, so a
	// library tip has to be copied into the document before it can be
	// painted with, or the picture would not survive being opened
	// somewhere else.
	const [ library, setLibrary ] = useState( [] );
	useEffect( () => {
		let alive = true;
		readTipLibrary().then( ( list ) => {
			if ( alive ) {
				setLibrary( list );
			}
		} );
		return () => {
			alive = false;
		};
	}, [] );
	const own = ( state.doc?.tips || [] ).map( ( t ) => t.id );
	const shelf = library.filter( ( e ) => ! own.includes( e.id ) );

	return (
		<div className={ 'bp' + ( hasTips ? ' has-tips' : '' ) }>
			{ hasTips && (
				<div className="bp-tips">
					<button
						type="button"
						className="bp-newtip"
						onClick={ () =>
							editDrawnTip( editor, '', ( id ) =>
								set( { tip: id } )
							)
						}
					>
						{ __( 'Draw a brush tip', 'wunderpaint' ) }
					</button>
					{ !! shelf.length && (
						<div className="bp-tipgroup">
							<span className="bp-sect-head">
								{ __( 'Saved tips', 'wunderpaint' ) }
							</span>
							<div className="bp-shelf">
								{ shelf.map( ( e ) => (
									<button
										key={ e.id }
										type="button"
										className="bp-shelfitem"
										title={ e.name || '' }
										onClick={ () =>
											set( {
												tip: adoptLibraryTip(
													editor,
													e
												),
											} )
										}
									>
										{ e.name || __( 'Tip', 'wunderpaint' ) }
									</button>
								) ) }
							</div>
						</div>
					) }
					{ groupedTips().map( ( g ) => (
						<div key={ g.id } className="bp-tipgroup">
							<span className="bp-sect-head">{ g.name }</span>
							<div className="bp-tipgrid">
								{ g.tips.map( ( t ) => (
									<button
										key={ t.id }
										type="button"
										aria-pressed={ t.id === tipId }
										className={
											'bp-tip' +
											( t.id === tipId ? ' is-on' : '' )
										}
										title={ t.label }
										onClick={ () =>
											// A second click on the tip you are
											// already holding opens it again, which
											// is where anyone looks for "edit this".
											t.id === tipId && t.doc
												? editDrawnTip( editor, t.id )
												: set( { tip: t.id } )
										}
									>
										<img
											src={ tipPreview( t.id, TIP_TILE ) }
											alt=""
										/>
									</button>
								) ) }
							</div>
						</div>
					) ) }
				</div>
			) }

			<div className="bp-main">
				{ undefined !== opts.paintStyle && (
					<div className="bp-sect bp-sect-style">
						<span className="bp-sect-head">
							{ __( 'Style', 'wunderpaint' ) }
						</span>
						<div className="bp-styles">
							{ PAINT_STYLES.map( ( st ) => (
								<button
									key={ st.id }
									type="button"
									className={
										'bp-style' +
										( st.id ===
										( opts.paintStyle || 'normal' )
											? ' is-on'
											: '' )
									}
									onClick={ () =>
										set( { paintStyle: st.id } )
									}
								>
									{ st.name }
								</button>
							) ) }
						</div>
					</div>
				) }

				<div className="bp-sect">
					<span className="bp-sect-head">
						{ __( 'Brush', 'wunderpaint' ) }
					</span>
					{ Number.isFinite( opts.size ) && (
						<Row
							label={ __( 'Size', 'wunderpaint' ) }
							value={ opts.size }
							min={ 1 }
							max={ 500 }
							onChange={ ( v ) => set( { size: v } ) }
						/>
					) }
					{ Number.isFinite( opts.hardness ) && (
						<Row
							label={ __( 'Hardness', 'wunderpaint' ) }
							value={ opts.hardness }
							min={ 0 }
							max={ 100 }
							onChange={ ( v ) => set( { hardness: v } ) }
						/>
					) }
					{ Number.isFinite( opts.opacity ) && (
						<Row
							label={ __( 'Opacity', 'wunderpaint' ) }
							value={ opts.opacity }
							min={ 1 }
							max={ 100 }
							onChange={ ( v ) => set( { opacity: v } ) }
						/>
					) }
					{ Number.isFinite( opts.flow ) && (
						<Row
							label={ __( 'Flow', 'wunderpaint' ) }
							value={ opts.flow }
							min={ 1 }
							max={ 100 }
							onChange={ ( v ) => set( { flow: v } ) }
						/>
					) }
				</div>

				{ /* NOT gated on a stamped tip. The round family lays dabs
				     too, so it answers to these four exactly as a textured
				     tip does - the renderer just used to hard-code them,
				     which put the section out of reach for the DEFAULT
				     brush of all things. Same move as the colour block
				     above, and for the same reason. */ }
				{ undefined !== opts.scatter && (
					<div className="bp-sect">
						{ /* The way back sits on the heading line, not under
						     the sliders. A whole button's worth of column
						     spelling out "Back to the tip's own values" cost
						     more room than the four sliders it undoes, and
						     the sentence is longer still in German. The word
						     is on the button, the sentence is on the tooltip. */ }
						<div className="bp-head">
							<span className="bp-sect-head">
								{ __( 'Tip shape', 'wunderpaint' ) }
							</span>
							<button
								type="button"
								className="bp-reset"
								title={ __(
									"Back to the tip's own values",
									'wunderpaint'
								) }
								onClick={ () =>
									set( {
										scatter: null,
										spacing: null,
										alphaJitter: null,
										sizeJitter: null,
										// The COLOUR jitter stays put. It
										// belongs to the Color section and
										// this button sits on Tip shape; a
										// reset that reaches across and
										// quietly puts someone's hue back
										// is worse than no reset at all.
										// It briefly did exactly that: I
										// spread the shipped amounts here
										// to stop Reset ZEROING them, which
										// cured the wrong half.
									} )
								}
							>
								{ __( 'Reset', 'wunderpaint' ) }
							</button>
						</div>
						{ SHAPE_ROWS.map( ( [ key, label, min, max ] ) => (
							<Row
								key={ key }
								label={ label() }
								value={ tipVal( key ) }
								min={ min }
								max={ max }
								onChange={ ( v ) =>
									set( { [ key ]: v / 100 } )
								}
							/>
						) ) }
					</div>
				) }

				{ /* The eraser takes paint away, it does not carry a colour.
				     Its panel was showing a full colour wheel that changed
				     nothing whatsoever about the eraser. */ }
				{ 'eraser' !== tool && (
					<div className="bp-sect">
						<span className="bp-sect-head">
							{ __( 'Color', 'wunderpaint' ) }
						</span>
						<div className="bp-colour">
							<ColorWheel
								color={ state.fgColor }
								size={ 176 }
								onChange={ ( c ) =>
									dispatch( { type: 'SET_FG', color: c } )
								}
							/>
							{ canVaryColour && (
								<>
									<div className="bp-styles bp-modes">
										{ COLOUR_MODES.map(
											( [ id, label ] ) => (
												<button
													key={ id }
													type="button"
													className={
														'bp-style' +
														( id === mode
															? ' is-on'
															: '' )
													}
													onClick={ () =>
														set( { colorMode: id } )
													}
												>
													{ label() }
												</button>
											)
										) }
									</div>
									{ 'jitter' === mode &&
										JITTER_ROWS.map(
											( [ key, label, min, max ] ) => (
												<Row
													key={ key }
													label={ label() }
													value={ tipVal( key ) }
													min={ min }
													max={ max }
													onChange={ ( v ) =>
														set( {
															[ key ]: v / 100,
														} )
													}
												/>
											)
										) }
									{ 'gradient' === mode && (
										<div className="bp-ramp">
											<GradientBar
												stops={ stops }
												onChange={ ( next ) =>
													set( {
														gradientStops: next,
													} )
												}
											/>
											<Row
												label={ __(
													'Repeats',
													'wunderpaint'
												) }
												value={ Math.round(
													opts.gradientCycles || 1
												) }
												min={ 1 }
												max={ 12 }
												onChange={ ( v ) =>
													set( { gradientCycles: v } )
												}
											/>
										</div>
									) }
								</>
							) }
							<div className="bp-recent">
								{ recentColors()
									.slice( 0, 10 )
									.map( ( c ) => (
										<button
											key={ c }
											type="button"
											style={ { background: c } }
											aria-label={ c }
											title={ c }
											onClick={ () =>
												dispatch( {
													type: 'SET_FG',
													color: c,
												} )
											}
										/>
									) ) }
							</div>
						</div>
					</div>
				) }

				{ undefined !== opts.layerMode && (
					<label className="bp-check">
						<input
							type="checkbox"
							checked={ 'perStroke' === opts.layerMode }
							onChange={ ( e ) =>
								set( {
									layerMode: e.target.checked
										? 'perStroke'
										: 'single',
								} )
							}
						/>
						{ __( 'Each stroke on its own layer', 'wunderpaint' ) }
					</label>
				) }
			</div>
		</div>
	);
}
