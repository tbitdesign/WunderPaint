/**
 * The Repeat panel (v1.431): the rule of the current Repeat layer.
 *
 * Mode as cards, the mode's numbers as slider rows, the path drawn in a
 * small field, the progression as one curve editor that edits whichever
 * target is picked (the Particle Strokes pattern Thomas asked for), the
 * stack side, then Bake and Remove. Sliders write live and commit on
 * release; everything else commits at once.
 */
import { useState, useRef, useEffect, useId } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { I } from '../../icons';
import { RampSwatch } from '../../components/paint-controls';
import { defaultPaintStops } from '../../lib/layer-paint';
import { SwatchButton } from '../../components/color-popover';
import * as Ops from '../../store/ops';
import { SnapSlider } from '../../components/snap-slider';
import { CurveEditor } from '../../components/curve-editor';
import { repeatLayerOf, sourceOf, REPEAT_MODES } from '../../lib/repeat-layer';
import { REPEAT_LIMITS } from '../../lib/repeat-layout';
import { ancestorLocked } from '../canvas/tool-handlers';

const MODE_META = {
	row: { label: () => __( 'Row', 'wunderpaint' ), icon: 'repeat' },
	grid: { label: () => __( 'Grid', 'wunderpaint' ), icon: 'grid' },
	circle: { label: () => __( 'Circle', 'wunderpaint' ), icon: 'rotateCw' },
	path: { label: () => __( 'Path', 'wunderpaint' ), icon: 'pen' },
};
const TARGETS = [
	[ 'size', () => __( 'Size', 'wunderpaint' ), '%', 1, 400 ],
	[ 'opacity', () => __( 'Opacity', 'wunderpaint' ), '%', 0, 100 ],
	[ 'rotation', () => __( 'Rotation', 'wunderpaint' ), '°', -720, 720 ],
	[ 'color', () => __( 'Color', 'wunderpaint' ), '', 0, 0 ],
];
const EDIT = () => __( 'Edit repeat', 'wunderpaint' );

function Field( {
	label,
	value,
	min,
	max,
	step = 1,
	suffix,
	onChange,
	onCommit,
	disabled,
} ) {
	const id = useId();
	return (
		<div className="rp-field">
			<div className="rp-field-head">
				<label htmlFor={ id }>{ label }</label>
				<span className="rp-number">
					<input
						id={ id }
						type="number"
						data-number-kind={
							suffix === '°' ? 'angle' : undefined
						}
						min={ min }
						max={ max }
						step={ step }
						value={ value }
						disabled={ disabled }
						onBlur={ onCommit }
						onKeyDown={ ( e ) => {
							if ( 'Enter' === e.key ) {
								e.currentTarget.blur();
							}
						} }
						onChange={ ( e ) => {
							const v = +e.target.value;
							if (
								'' !== e.target.value &&
								Number.isFinite( v )
							) {
								onChange( Math.min( max, Math.max( min, v ) ) );
							}
						} }
					/>
					{ suffix ? <span>{ suffix }</span> : null }
				</span>
			</div>
			<SnapSlider
				ariaLabel={ label }
				step={ step }
				kind={ suffix === '°' ? 'angle' : undefined }
				min={ min }
				max={ max }
				value={ value }
				def={ value }
				detents={ [] }
				onChange={ onChange }
				onCommit={ onCommit }
				disabled={ disabled }
			/>
		</div>
	);
}

function Seg( { label, value, options, onChange, disabled } ) {
	return (
		<div className="dsm-seg rp-seg" role="group" aria-label={ label }>
			{ options.map( ( [ id, text ] ) => (
				<button
					type="button"
					key={ id }
					className={ value === id ? 'active' : '' }
					aria-pressed={ value === id }
					disabled={ disabled }
					onClick={ () => onChange( id ) }
				>
					{ text }
				</button>
			) ) }
		</div>
	);
}

/* ------------------------------ the path field ----------------------------- */

const PANEL_W = 320;
const dist = ( a, b ) => Math.hypot( a.x - b.x, a.y - b.y );

/** Drop points that barely move on from the last kept one. */
function thin( points, minGap = 0.015 ) {
	const out = [];
	for ( const p of points ) {
		if ( ! out.length || dist( out[ out.length - 1 ], p ) >= minGap ) {
			out.push( p );
		}
	}
	if (
		points.length > 1 &&
		out[ out.length - 1 ] !== points[ points.length - 1 ]
	) {
		out.push( points[ points.length - 1 ] );
	}
	return out;
}

/** One Chaikin pass, endpoints kept. */
function smooth( points ) {
	if ( points.length < 3 ) {
		return points;
	}
	const out = [ points[ 0 ] ];
	for ( let i = 0; i < points.length - 1; i++ ) {
		const a = points[ i ];
		const b = points[ i + 1 ];
		out.push( { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 } );
		out.push( { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 } );
	}
	out.push( points[ points.length - 1 ] );
	return out;
}

const PATH_H = 110;
const PRESETS = {
	line: () => [
		{ x: 0, y: 0.5 },
		{ x: 1, y: 0.5 },
	],
	arc: () =>
		Array.from( { length: 13 }, ( _, i ) => {
			const t = i / 12;
			return { x: t, y: 0.9 - 0.8 * Math.sin( Math.PI * t ) };
		} ),
	wave: () =>
		Array.from( { length: 17 }, ( _, i ) => {
			const t = i / 16;
			return { x: t, y: 0.5 + 0.35 * Math.sin( 2 * Math.PI * t ) };
		} ),
	s: () =>
		Array.from( { length: 13 }, ( _, i ) => {
			const t = i / 12;
			return { x: t, y: 0.9 - 0.8 * ( t * t * ( 3 - 2 * t ) ) };
		} ),
};

function PathField( { path, disabled, onPoints } ) {
	const ref = useRef( null );
	const drag = useRef( null );
	const points = path?.points || [];
	const size = () => {
		const r = ref.current.getBoundingClientRect();
		return { W: Math.max( 60, r.width ), H: Math.max( 60, r.height ) };
	};
	useEffect( () => {
		const c = ref.current;
		if ( ! c ) {
			return;
		}
		const { W, H } = size();
		const dpr = window.devicePixelRatio || 1;
		c.width = Math.round( W * dpr );
		c.height = Math.round( H * dpr );
		const ctx = c.getContext( '2d' );
		ctx.scale( dpr, dpr );
		ctx.clearRect( 0, 0, W, H );
		ctx.strokeStyle = 'rgba(255,255,255,0.08)';
		ctx.lineWidth = 1;
		for ( let i = 1; i < 4; i++ ) {
			ctx.beginPath();
			ctx.moveTo( ( W * i ) / 4, 0 );
			ctx.lineTo( ( W * i ) / 4, H );
			ctx.stroke();
		}
		ctx.beginPath();
		ctx.moveTo( 0, H / 2 );
		ctx.lineTo( W, H / 2 );
		ctx.stroke();
		const live = drag.current?.points || points;
		if ( live.length ) {
			ctx.beginPath();
			live.forEach( ( q, i ) =>
				( i ? ctx.lineTo : ctx.moveTo ).call( ctx, q.x * W, q.y * H )
			);
			ctx.strokeStyle = '#3b66ff';
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.fillStyle = '#fff';
			for ( const q of live ) {
				ctx.beginPath();
				ctx.arc( q.x * W, q.y * H, 2.5, 0, Math.PI * 2 );
				ctx.fill();
			}
			// The start is marked so the direction of travel is visible.
			ctx.fillStyle = '#3b66ff';
			ctx.beginPath();
			ctx.arc( live[ 0 ].x * W, live[ 0 ].y * H, 4, 0, Math.PI * 2 );
			ctx.fill();
		}
	} );
	const toNorm = ( e ) => {
		const r = ref.current.getBoundingClientRect();
		return {
			x: Math.min( 1, Math.max( 0, ( e.clientX - r.left ) / r.width ) ),
			y: Math.min( 1, Math.max( 0, ( e.clientY - r.top ) / r.height ) ),
		};
	};
	const down = ( e ) => {
		if ( disabled || 0 !== e.button ) {
			return;
		}
		e.preventDefault();
		const q = toNorm( e );
		drag.current = { start: q, points: [ q ], drawing: false };
		e.currentTarget.setPointerCapture( e.pointerId );
	};
	const move = ( e ) => {
		const d = drag.current;
		if ( ! d ) {
			return;
		}
		const q = toNorm( e );
		const { W, H } = size();
		if ( ! d.drawing && dist( q, d.start ) * W < 4 ) {
			return;
		}
		d.drawing = true;
		d.points.push( q );
		const ctx = ref.current.getContext( '2d' );
		const prev = d.points[ d.points.length - 2 ];
		ctx.strokeStyle = '#3b66ff';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo( prev.x * W, prev.y * H );
		ctx.lineTo( q.x * W, q.y * H );
		ctx.stroke();
	};
	const up = ( e ) => {
		const d = drag.current;
		drag.current = null;
		if ( ! d ) {
			return;
		}
		if ( d.drawing ) {
			onPoints( thin( d.points ) );
		} else {
			onPoints( [ ...points, toNorm( e ) ] );
		}
	};
	return (
		<canvas
			ref={ ref }
			className="rp-path"
			style={ { height: PATH_H } }
			title={ __(
				'Draw the path: drag freely or click points.',
				'wunderpaint'
			) }
			onPointerDown={ down }
			onPointerMove={ move }
			onPointerUp={ up }
			onPointerCancel={ up }
			aria-label={ __(
				'Draw the path: drag freely or click points.',
				'wunderpaint'
			) }
		/>
	);
}

/* --------------------------------- the panel -------------------------------- */

export function RepeatPanel( { editor } ) {
	const { state } = editor;
	const [ target, setTarget ] = useState( 'size' );
	const layer = repeatLayerOf( state );
	const source = sourceOf( state.layers, layer );
	if ( ! layer || ! source ) {
		return (
			<div className="rp rp-empty">
				<p className="rp-hint">
					{ __(
						'Select a layer or group to repeat.',
						'wunderpaint'
					) }
				</p>
			</div>
		);
	}
	const locked =
		layer.locked || source.locked || ancestorLocked( state.layers, layer );
	const rule = layer.rule || {};
	const mode = rule.mode || 'row';
	const prog = layer.progression || {};
	const rulePatch = ( patch, commit = false ) =>
		Ops.setRepeatRule( editor, layer.id, patch, commit ? EDIT() : null );
	const progPatch = ( key, patch, commit = false ) =>
		Ops.setRepeatProgression(
			editor,
			layer.id,
			key,
			patch,
			commit ? EDIT() : null
		);
	const commitNow = () => rulePatch( {}, true );
	const num = ( key, label, min, max, suffix = '' ) => (
		<Field
			key={ key }
			label={ label }
			value={ Math.round( Number( rule[ key ] ) || 0 ) }
			min={ min }
			max={ max }
			suffix={ suffix }
			disabled={ locked }
			onChange={ ( v ) => rulePatch( { [ key ]: v } ) }
			onCommit={ commitNow }
		/>
	);
	const radius = Math.round(
		Math.hypot( rule.center?.dx || 0, rule.center?.dy || 0 )
	);
	const setRadius = ( v ) => {
		const dx = rule.center?.dx || 0;
		const dy = rule.center?.dy || 0;
		const len = Math.hypot( dx, dy );
		const dir = len > 0.5 ? { x: dx / len, y: dy / len } : { x: 0, y: -1 };
		rulePatch( {
			center: {
				dx: Math.round( dir.x * v ),
				dy: Math.round( dir.y * v ),
			},
		} );
	};
	const [ , targetLabel, targetSuffix, targetMin, targetMax ] = TARGETS.find(
		( t ) => t[ 0 ] === target
	);
	const tp = prog[ target ] || { on: false, end: 0, curve: null };
	const tileButton = ( m ) => (
		<button
			type="button"
			key={ m }
			className="ai-tile ai-tile-compact"
			aria-pressed={ mode === m }
			disabled={ locked }
			onClick={ () => rulePatch( { mode: m }, true ) }
		>
			<span className="ai-tile-icon">
				{ I[ MODE_META[ m ].icon ]( { size: 18 } ) }
			</span>
			<span className="ai-tile-label">{ MODE_META[ m ].label() }</span>
		</button>
	);
	return (
		<div className="rp">
			<div className="rp-main">
				<div className="rp-modes">
					{ REPEAT_MODES.map( tileButton ) }
				</div>
				<div className="rp-settings">
					{ 'row' === mode && (
						<>
							{ num(
								'count',
								__( 'Copies', 'wunderpaint' ),
								2,
								REPEAT_LIMITS.count
							) }
							{ num(
								'dx',
								__( 'Step X', 'wunderpaint' ),
								-2000,
								2000,
								'px'
							) }
							{ num(
								'dy',
								__( 'Step Y', 'wunderpaint' ),
								-2000,
								2000,
								'px'
							) }
						</>
					) }
					{ 'grid' === mode && (
						<>
							{ num(
								'cols',
								__( 'Columns', 'wunderpaint' ),
								1,
								REPEAT_LIMITS.cols
							) }
							{ num(
								'rows',
								__( 'Rows', 'wunderpaint' ),
								1,
								REPEAT_LIMITS.rows
							) }
							{ num(
								'gapX',
								__( 'Gap X', 'wunderpaint' ),
								-500,
								1000,
								'px'
							) }
							{ num(
								'gapY',
								__( 'Gap Y', 'wunderpaint' ),
								-500,
								1000,
								'px'
							) }
						</>
					) }
					{ 'circle' === mode && (
						<>
							{ num(
								'count',
								__( 'Copies', 'wunderpaint' ),
								2,
								REPEAT_LIMITS.count
							) }
							<Field
								label={ __( 'Radius', 'wunderpaint' ) }
								value={ radius }
								min={ 1 }
								max={ 3000 }
								suffix="px"
								disabled={ locked }
								onChange={ setRadius }
								onCommit={ commitNow }
							/>
							{ num(
								'span',
								__( 'Sweep', 'wunderpaint' ),
								1,
								360,
								'°'
							) }
							<Seg
								label={ __( 'Orientation', 'wunderpaint' ) }
								value={
									false === rule.turn ? 'upright' : 'turned'
								}
								disabled={ locked }
								options={ [
									[ 'turned', __( 'Turned', 'wunderpaint' ) ],
									[
										'upright',
										__( 'Upright', 'wunderpaint' ),
									],
								] }
								onChange={ ( v ) =>
									rulePatch( { turn: 'turned' === v }, true )
								}
							/>
						</>
					) }
					{ 'path' === mode && (
						<>
							<PathField
								path={ rule.path }
								disabled={ locked }
								onPoints={ ( points ) =>
									rulePatch(
										{ path: { ...rule.path, points } },
										true
									)
								}
							/>
							<div className="rp-actions rp-actions-small">
								{ [
									[ 'line', __( 'Line', 'wunderpaint' ) ],
									[ 'arc', __( 'Arc', 'wunderpaint' ) ],
									[ 'wave', __( 'Wave', 'wunderpaint' ) ],
									[ 's', __( 'S-curve', 'wunderpaint' ) ],
								].map( ( [ id, text ] ) => (
									<button
										type="button"
										key={ id }
										className="ai-btn secondary"
										disabled={ locked }
										onClick={ () =>
											rulePatch(
												{
													path: {
														...rule.path,
														points: PRESETS[ id ](),
													},
												},
												true
											)
										}
									>
										{ text }
									</button>
								) ) }
							</div>
							<div className="rp-actions rp-actions-small">
								<button
									type="button"
									className="ai-btn secondary"
									disabled={
										locked ||
										( rule.path?.points || [] ).length < 3
									}
									onClick={ () =>
										rulePatch(
											{
												path: {
													...rule.path,
													points: smooth(
														rule.path.points
													),
												},
											},
											true
										)
									}
								>
									{ __( 'Smooth', 'wunderpaint' ) }
								</button>
								<button
									type="button"
									className="ai-btn secondary"
									disabled={ locked }
									onClick={ () =>
										rulePatch(
											{
												path: {
													...rule.path,
													points: (
														rule.path?.points || []
													).map( ( q ) => ( {
														x: 1 - q.x,
														y: q.y,
													} ) ),
												},
											},
											true
										)
									}
								>
									{ __( 'Mirror', 'wunderpaint' ) }
								</button>
							</div>
							{ num(
								'count',
								__( 'Copies', 'wunderpaint' ),
								1,
								REPEAT_LIMITS.count
							) }
							<Seg
								label={ __( 'Orientation', 'wunderpaint' ) }
								value={
									false === rule.path?.tangent
										? 'upright'
										: 'tangent'
								}
								disabled={ locked }
								options={ [
									[
										'tangent',
										__( 'Tangent', 'wunderpaint' ),
									],
									[
										'upright',
										__( 'Upright', 'wunderpaint' ),
									],
								] }
								onChange={ ( v ) =>
									rulePatch(
										{
											path: {
												...rule.path,
												tangent: 'tangent' === v,
											},
										},
										true
									)
								}
							/>
						</>
					) }
				</div>
			</div>

			<fieldset className="rp-section">
				<div
					className="rp-targets"
					role="group"
					aria-label={ __( 'Progression', 'wunderpaint' ) }
				>
					{ TARGETS.map( ( [ key, label ] ) => (
						<button
							type="button"
							key={ key }
							aria-pressed={ target === key }
							data-on={ prog[ key ]?.on ? 'true' : 'false' }
							onClick={ () => setTarget( key ) }
						>
							{ label() }
						</button>
					) ) }
				</div>
				<div className="rp-progrow">
					<label className="rp-check">
						<input
							type="checkbox"
							checked={ !! tp.on }
							disabled={ locked }
							onChange={ ( e ) =>
								progPatch(
									target,
									{ on: e.target.checked },
									true
								)
							}
						/>
						<span>
							{ sprintf(
								/* translators: %s: progression target (Size, Opacity, Rotation, Color). */
								__( 'Use for %s', 'wunderpaint' ),
								targetLabel()
							) }
						</span>
					</label>
					{ 'color' === target ? (
						<div className="rp-color-paint">
							<Seg
								label={ __(
									'Color progression',
									'wunderpaint'
								) }
								value={ tp.mode || 'tint' }
								disabled={ locked || ! tp.on }
								options={ [
									[
										'tint',
										__( 'End color', 'wunderpaint' ),
									],
									[
										'gradient',
										__( 'Gradient', 'wunderpaint' ),
									],
								] }
								onChange={ ( paintMode ) =>
									progPatch(
										target,
										{
											mode: paintMode,
											...( paintMode === 'gradient' &&
											! tp.stops
												? {
														stops: defaultPaintStops(
															source?.fill ||
																source?.color ||
																state.fgColor
														),
												  }
												: {} ),
										},
										true
									)
								}
							/>
							{ tp.mode === 'gradient' ? (
								<RampSwatch
									title={ __(
										'Repeat · Copy colors',
										'wunderpaint'
									) }
									paint={ tp }
									disabled={ locked || ! tp.on }
									onChange={ ( patch ) =>
										progPatch( target, patch )
									}
									onCommit={ commitNow }
								/>
							) : (
								<SwatchButton
									color={ tp.end || '#000000' }
									size={ 22 }
									disabled={ locked || ! tp.on }
									title={ __( 'End color', 'wunderpaint' ) }
									onChange={ ( c ) =>
										progPatch( target, { end: c }, true )
									}
								/>
							) }
						</div>
					) : (
						<span className="rp-number">
							<input
								type="number"
								aria-label={ __( 'End value', 'wunderpaint' ) }
								min={ targetMin }
								max={ targetMax }
								step="1"
								value={ Math.round( Number( tp.end ) || 0 ) }
								disabled={ locked || ! tp.on }
								onChange={ ( e ) => {
									const v = +e.target.value;
									if (
										'' !== e.target.value &&
										Number.isFinite( v )
									) {
										progPatch( target, {
											end: Math.min(
												targetMax,
												Math.max( targetMin, v )
											),
										} );
									}
								} }
								onBlur={ () => progPatch( target, {}, true ) }
							/>
							<span>{ targetSuffix }</span>
						</span>
					) }
				</div>
				<div className={ `rp-curve${ tp.on ? '' : ' is-off' }` }>
					<CurveEditor
						width={ PANEL_W }
						height={ 80 }
						points={ tp.curve || undefined }
						onChange={ ( pts ) =>
							progPatch( target, { curve: pts }, true )
						}
					/>
				</div>
			</fieldset>

			<div className="rp-foot">
				<Seg
					label={ __( 'Stack', 'wunderpaint' ) }
					value={ 'front' === layer.stack ? 'front' : 'behind' }
					disabled={ locked }
					options={ [
						[ 'behind', __( 'Copies behind', 'wunderpaint' ) ],
						[ 'front', __( 'Copies in front', 'wunderpaint' ) ],
					] }
					onChange={ ( v ) =>
						Ops.updateRepeat(
							editor,
							layer.id,
							{ stack: v },
							EDIT()
						)
					}
				/>
				<div className="rp-actions">
					<button
						type="button"
						className="ai-btn primary"
						disabled={ locked }
						onClick={ () => Ops.bakeRepeat( editor, layer.id ) }
					>
						{ __( 'Bake', 'wunderpaint' ) }
					</button>
					<button
						type="button"
						className="ai-btn secondary"
						disabled={ locked }
						onClick={ () => Ops.removeRepeat( editor, layer.id ) }
					>
						{ __( 'Remove', 'wunderpaint' ) }
					</button>
				</div>
			</div>
		</div>
	);
}
