import { PenModeIcon } from './pen-mode-icon';
import { Dial, Choice } from './pen-controls';
import { PenCreativeOptions } from './pen-creative-options';
import { PenStyleLibrary } from './pen-style-library';
import {
	memo,
	useMemo,
	useRef,
	useState,
	useCallback,
} from '@wordpress/element';
import { I } from '../../icons';
import { __, _x, sprintf } from '@wordpress/i18n';
import { activeLayerOf } from '../../store/editor-context';
import { buildPathD, parsePathAnchors } from '../../lib/path-edit';
import {
	PEN_PRESETS,
	cleanPenStyle,
	isPenLayer,
	penLayerPatch,
	penPresetStyle,
	penWidthAt,
} from '../../lib/pen-path';
import { reversePenPath, extendPenPath } from '../../lib/pen-edit';
import { penPresetPreview } from '../../lib/pen-preset-preview';
const THUMBS = PEN_PRESETS.map( penPresetPreview );
const PRESET_GROUPS = [
	[ 'basic', () => __( 'Basics', 'wunderpaint' ) ],
	[ 'taper', () => __( 'Tapers', 'wunderpaint' ) ],
	[ 'profile', () => __( 'Profiles', 'wunderpaint' ) ],
	[ 'calligraphy', () => __( 'Calligraphy', 'wunderpaint' ) ],
	[ 'arrow', () => __( 'Arrows', 'wunderpaint' ) ],
	[ 'connection', () => __( 'Connections', 'wunderpaint' ) ],
	[ 'pattern', () => __( 'Patterns', 'wunderpaint' ) ],
	[ 'gradient', () => __( 'Gradients', 'wunderpaint' ) ],
	[ 'art', () => __( 'Art', 'wunderpaint' ) ],
];
const presetGroup = ( p ) =>
	p.group ||
	( p.style.kind && p.style.kind !== 'solid'
		? 'pattern'
		: p.style.arrowStart || p.style.arrowEnd
		? 'arrow'
		: p.style.markers?.length
		? 'profile'
		: p.style.start === 100 && p.style.end === 100
		? 'basic'
		: 'taper' );
const Presets = memo( function Presets( { selected, onPick } ) {
	return (
		<div className="pp-presets">
			{ PRESET_GROUPS.map( ( [ id, label ] ) => (
				<section key={ id }>
					<h3 className="bp-sect-head">{ label() }</h3>
					<div className="pp-preset-grid">
						{ PEN_PRESETS.map(
							( p, i ) =>
								presetGroup( p ) === id && (
									<button
										key={ p.id }
										title={ p.name() }
										aria-label={ p.name() }
										aria-pressed={ selected === p.id }
										onClick={ () => onPick( p ) }
									>
										{ THUMBS[ i ].src ? (
											<img
												src={ THUMBS[ i ].src }
												alt=""
												width="150"
												height="100"
												loading="lazy"
												decoding="async"
											/>
										) : (
											<svg
												viewBox="0 0 150 100"
												aria-hidden="true"
											>
												<path
													d={ THUMBS[ i ].d }
													fill="currentColor"
												/>
											</svg>
										) }

										<span>{ p.name() }</span>
									</button>
								)
						) }
					</div>
				</section>
			) ) }
		</div>
	);
} );
function WidthGraph( { style, closed, onChange, onCommit } ) {
	const drag = useRef( null ),
		svg = useRef( null );
	const path = useMemo(
		() =>
			Array.from(
				{
					length: 101,
				},
				( _, i ) =>
					`${ i ? 'L' : 'M' }${ 10 + i * 2.8 },${
						92 -
						( penWidthAt( i / 100, style, closed ) / style.width ) *
							23
					}`
			).join( '' ),
		[ style, closed ]
	);
	const at = ( e ) => {
		const r = svg.current.getBoundingClientRect();
		return {
			t: Math.max(
				0.01,
				Math.min(
					0.99,
					( ( ( e.clientX - r.left ) * 300 ) / r.width - 10 ) / 280
				)
			),
			value: Math.max(
				0.02,
				Math.min(
					3,
					( 92 - ( ( e.clientY - r.top ) * 110 ) / r.height ) / 23
				)
			),
		};
	};
	const update = ( e ) => {
		const p = at( e ),
			base =
				penWidthAt(
					p.t,
					{
						...style,
						markers: [],
					},
					closed
				) / style.width;
		const markers = style.markers.slice();
		const i = drag.current;
		if ( i === null ) {
			return;
		}
		markers[ i ] = {
			t: Math.max(
				i ? markers[ i - 1 ].t + 0.001 : 0.01,
				Math.min(
					i < markers.length - 1 ? markers[ i + 1 ].t - 0.001 : 0.99,
					p.t
				)
			),
			value: Math.max(
				0.02,
				Math.min( 3, p.value / Math.max( 0.05, base ) )
			),
		};
		onChange( {
			markers,
		} );
	};
	return (
		<div className="pp-graph">
			<svg
				ref={ svg }
				viewBox="0 0 300 110"
				role="img"
				aria-label={ __( 'Width profile', 'wunderpaint' ) }
				onPointerDown={ ( e ) => {
					e.preventDefault();
					const p = at( e );
					let index = style.markers.findIndex(
						( m ) => Math.abs( m.t - p.t ) < 0.04
					);
					if ( e.altKey && index >= 0 ) {
						onChange( {
							markers: style.markers.filter(
								( _, i ) => i !== index
							),
						} );
						onCommit?.();
						return;
					}
					if ( index < 0 ) {
						if ( style.markers.length >= 32 ) {
							return;
						}
						const base =
							penWidthAt(
								p.t,
								{
									...style,
									markers: [],
								},
								closed
							) / style.width;
						const markers = [
							...style.markers,
							{
								t: p.t,
								value: Math.min(
									3,
									p.value / Math.max( 0.05, base )
								),
							},
						].sort( ( a, b ) => a.t - b.t );
						index = markers.findIndex( ( m ) => m.t === p.t );
						onChange( {
							markers,
						} );
					}
					drag.current = index;
					e.currentTarget.setPointerCapture( e.pointerId );
				} }
				onPointerMove={ ( e ) => {
					if ( drag.current !== null ) {
						update( e );
					}
				} }
				onPointerUp={ () => {
					drag.current = null;
					onCommit?.();
				} }
				onPointerCancel={ () => {
					drag.current = null;
					onCommit?.();
				} }
			>
				<path
					d="M10 69H290M10 46H290M10 23H290"
					className="pp-graph-grid"
				/>
				<path d={ path + 'L290 92H10Z' } className="pp-graph-area" />
				<path d={ path } className="pp-graph-line" />
				{ style.markers.map( ( m, i ) => (
					<circle
						key={ i }
						cx={ 10 + m.t * 280 }
						cy={
							92 -
							( penWidthAt( m.t, style, closed ) / style.width ) *
								23
						}
						r="4"
					/>
				) ) }
			</svg>
			<span>
				{ __(
					'Click to add width points; Alt-click removes.',
					'wunderpaint'
				) }
			</span>
		</div>
	);
}
export function PenPanel( {
	editor,
	draft,
	onDraft,
	onEdit,
	onNew,
	editMode = 'points',
	editApi,
	selection,
} ) {
	const { state, dispatch, commit } = editor,
		active = activeLayerOf( state );
	const layer = ! draft && isPenLayer( active ) ? active : null,
		opts = state.toolOpts.pen || {};
	const rawStyle = layer ? layer.penPath.style : opts.style;
	const style = useMemo( () => cleanPenStyle( rawStyle ), [ rawStyle ] );
	const [ tab, setTab ] = useState( 'width' );
	const [ userStyles, setUserStyles ] = useState( false );
	const closed = layer
		? !! parsePathAnchors( layer.penPath.d )?.[ 0 ]?.closed
		: !! draft?.closed;
	const visibleTab = tab;
	const disabled = ! layer || layer.locked;
	const commitStyle = () => {
		if ( layer && ! layer.locked ) {
			commit( __( 'Edit pen path', 'wunderpaint' ) );
		}
	};
	const patch = useCallback(
		( change, finish = false ) => {
			if ( layer?.locked ) {
				return;
			}
			const next = cleanPenStyle( { ...style, ...change } );
			if ( layer ) {
				dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: {
						...penLayerPatch( layer, next ),
						...( 'colorMode' in change
							? { fillType: 'solid' }
							: {} ),
					},
				} );
			}
			dispatch( {
				type: 'SET_TOOL_OPTS',
				tool: 'pen',
				patch: {
					style: layer
						? {
								...next,
								motion: [],
								symmetryAxis:
									( next.symmetry === 'vertical'
										? state.doc.w
										: state.doc.h ) / 2,
								symmetryX: state.doc.w / 2,
								symmetryY: state.doc.h / 2,
						  }
						: next,
				},
			} );
			if ( finish && layer ) {
				commit( __( 'Edit pen path', 'wunderpaint' ) );
			}
		},
		[ layer, style, dispatch, commit, state.doc.w, state.doc.h ]
	);
	const setOpt = ( key, value ) =>
		dispatch( {
			type: 'SET_TOOL_OPTS',
			tool: 'pen',
			patch: { [ key ]: value },
		} );
	const geometry = ( d, nextStyle = style ) => {
		if ( disabled ) {
			return;
		}
		dispatch( {
			type: 'UPDATE_LAYER',
			id: layer.id,
			patch: penLayerPatch( layer, { ...nextStyle, smoothing: 0 }, d ),
		} );
		commitStyle();
	};
	const pick = useCallback(
		( p ) => patch( penPresetStyle( p ), true ),
		[ patch ]
	);
	const selected = PEN_PRESETS.find(
		( p ) =>
			JSON.stringify( penPresetStyle( p ) ) === JSON.stringify( style )
	)?.id;
	const dial = ( key, label, min = 0, max = 100, step = 1, suffix = '%' ) => (
		<Dial
			key={ key }
			label={ label }
			value={ style[ key ] }
			min={ min }
			max={ max }
			step={ step }
			suffix={ suffix }
			onChange={ ( v ) => patch( { [ key ]: v } ) }
			onCommit={ commitStyle }
		/>
	);
	const pointAction = ( action, value ) =>
		editApi?.current?.( action, value );
	const modes = [
		[ 'redraw', __( 'Redraw section', 'wunderpaint' ) ],
		[ 'sculpt', __( 'Sculpt path', 'wunderpaint' ) ],
		[ 'round', __( 'Round corners', 'wunderpaint' ) ],
		[ 'smooth', __( 'Smooth locally', 'wunderpaint' ) ],
		[ 'cut', __( 'Scissors', 'wunderpaint' ) ],
		[ 'continue', __( 'Continue path', 'wunderpaint' ) ],
		[ 'join', __( 'Join paths', 'wunderpaint' ) ],
	];
	const modeHints = {
		redraw: __(
			'Draw over a section. Start and finish on the same path.',
			'wunderpaint'
		),
		sculpt: __( 'Drag to reshape the nearby curve.', 'wunderpaint' ),
		colors: __( 'Drag the color points along the path.', 'wunderpaint' ),
		trim: __(
			'Drag the endpoint grips to reveal or hide part of the path.',
			'wunderpaint'
		),
		round: __(
			'Drag the round grips to soften straight corners.',
			'wunderpaint'
		),
		smooth: __(
			'Brush over an uneven section. Corners stay sharp.',
			'wunderpaint'
		),
		cut: __( 'Click a point or curve to split the path.', 'wunderpaint' ),
		continue: __(
			'Click an open endpoint and keep drawing.',
			'wunderpaint'
		),
		join: __(
			'Click two open endpoints to connect them. The first path supplies the style.',
			'wunderpaint'
		),
	};
	const hint =
		draft && draft.kind !== 'penFree'
			? __(
					'Set points; Enter or Finish drawing completes the path.',
					'wunderpaint'
			  )
			: layer
			? modeHints[ editMode ] ||
			  ( editMode === 'width'
					? __(
							'Drag the width handles or drag across the path.',
							'wunderpaint'
					  )
					: editMode === 'move'
					? __( 'Drag the selected path to move it.', 'wunderpaint' )
					: __(
							'Drag points or curves. Double-click the curve to add a point.',
							'wunderpaint'
					  ) )
			: opts.mode === 'freehand'
			? __(
					'Draw and release. Your path is ready to edit.',
					'wunderpaint'
			  )
			: __(
					'Click to set points. Finish drawing selects your path.',
					'wunderpaint'
			  );
	return (
		<div className="pp">
			<div className="pp-main">
				<div className="pp-library">
					<button
						className="pp-library-toggle"
						onClick={ () => setUserStyles( ! userStyles ) }
					>
						{ userStyles
							? __( 'Presets', 'wunderpaint' )
							: __( 'My styles', 'wunderpaint' ) }
					</button>
					{ userStyles ? (
						<PenStyleLibrary
							style={ style }
							disabled={ layer?.locked }
							onApply={ ( saved ) =>
								patch(
									{
										...saved,
										motion: style.motion,
										symmetryAxis: layer
											? saved.symmetry === 'vertical'
												? layer.penPath.w / 2
												: layer.penPath.h / 2
											: saved.symmetry === 'vertical'
											? state.doc.w / 2
											: state.doc.h / 2,
										symmetryX:
											( layer
												? layer.penPath.w
												: state.doc.w ) / 2,
										symmetryY:
											( layer
												? layer.penPath.h
												: state.doc.h ) / 2,
									},
									true
								)
							}
						/>
					) : (
						<>
							<Presets selected={ selected } onPick={ pick } />
							<div className="pp-saved">
								<div className="pp-actions">
									<button
										onClick={ () => setUserStyles( true ) }
									>
										{ __( 'Save style', 'wunderpaint' ) }
									</button>
								</div>
							</div>
						</>
					) }
				</div>
				<div className="pp-settings">
					<div className="pp-context">
						<span className="bp-sect-head">
							{ layer
								? __( 'Edit path', 'wunderpaint' )
								: __( 'Draw', 'wunderpaint' ) }
						</span>
						{ layer ? (
							<div
								className="pp-tools"
								aria-label={ __( 'Edit path', 'wunderpaint' ) }
							>
								{ [
									[
										'points',
										_x( 'Form', 'pen tool', 'wunderpaint' ),
										I.pen,
									],
									[
										'width',
										__( 'Width', 'wunderpaint' ),
										I.sliders,
									],
									[
										'move',
										__( 'Move', 'wunderpaint' ),
										I.move,
									],
								].map( ( [ id, name, icon ] ) => (
									<button
										key={ id }
										className="ai-btn secondary"
										aria-pressed={ editMode === id }
										disabled={ disabled }
										onClick={ () => onEdit( id ) }
									>
										{ icon( { size: 14 } ) }
										{ name }
									</button>
								) ) }
							</div>
						) : (
							<div
								className="pp-modes"
								aria-label={ __(
									'Drawing mode',
									'wunderpaint'
								) }
							>
								{ [
									[ 'pen', __( 'Bézier', 'wunderpaint' ) ],
									[
										'curve',
										_x(
											'Curve',
											'pen tool',
											'wunderpaint'
										),
									],
									[
										'freehand',
										__( 'Freehand', 'wunderpaint' ),
									],
								].map( ( [ id, name ] ) => (
									<button
										key={ id }
										className="ai-tile ai-tile-compact"
										type="button"
										aria-pressed={
											( opts.mode || 'curve' ) === id
										}
										disabled={ !! draft }
										onClick={ () => setOpt( 'mode', id ) }
									>
										<span className="ai-tile-icon">
											<PenModeIcon mode={ id } />
										</span>
										<span className="ai-tile-name">
											{ name }
										</span>
									</button>
								) ) }
							</div>
						) }
						<p className="pp-hint pp-help">{ hint }</p>

						{ ! layer && ( opts.mode || 'curve' ) === 'curve' && (
							<Dial
								label={ __( 'Curve tension', 'wunderpaint' ) }
								value={ opts.tension ?? 50 }
								onChange={ ( v ) => setOpt( 'tension', v ) }
							/>
						) }
						{ ! layer && opts.mode === 'freehand' && (
							<Dial
								label={ __( 'Fidelity', 'wunderpaint' ) }
								value={ opts.fidelity ?? 50 }
								onChange={ ( v ) => setOpt( 'fidelity', v ) }
							/>
						) }
						{ ! layer && opts.mode === 'freehand' && (
							<Dial
								label={ __( 'Stabilizer', 'wunderpaint' ) }
								value={ opts.stabilize ?? 0 }
								onChange={ ( v ) => setOpt( 'stabilize', v ) }
							/>
						) }
					</div>
					<div className="pp-tabs" role="tablist">
						{ [
							[ 'width', __( 'Style', 'wunderpaint' ) ],
							[ 'ends', _x( 'Ends', 'pen tool', 'wunderpaint' ) ],
							[
								'points',
								_x( 'Points', 'pen tool', 'wunderpaint' ),
							],
						].map( ( [ id, name ] ) => (
							<button
								key={ id }
								role="tab"
								aria-selected={ visibleTab === id }
								className={ visibleTab === id ? 'active' : '' }
								onClick={ () => setTab( id ) }
							>
								{ name }
							</button>
						) ) }
					</div>
					<PenCreativeOptions
						tab={ visibleTab }
						style={ style }
						patch={ patch }
						commit={ commitStyle }
						opts={ opts }
						setOpt={ setOpt }
						layer={ layer }
						onPaint={ ( change ) => {
							if ( layer && ! layer.locked ) {
								dispatch( {
									type: 'UPDATE_LAYER',
									id: layer.id,
									patch: change,
								} );
							}
						} }
						doc={ state.doc }
						onEdit={ onEdit }
						editMode={ editMode }
						disabled={ disabled }
						color={ layer?.fill || state.fgColor }
						onColor={ ( color ) => {
							if ( layer?.locked ) {
								return;
							}
							if ( layer ) {
								dispatch( {
									type: 'UPDATE_LAYER',
									id: layer.id,
									patch: { fill: color },
								} );
								commitStyle();
							}
							dispatch( { type: 'SET_FG', color } );
						} }
					/>
					{ visibleTab === 'width' && (
						<>
							<WidthGraph
								closed={ closed }
								style={ style }
								onChange={ patch }
								onCommit={ commitStyle }
							/>
							<div className="pp-dials">
								{ dial(
									'width',
									__( 'Width', 'wunderpaint' ),
									0.5,
									160,
									0.5,
									' px'
								) }
								{ dial(
									'belly',
									__( 'Fullness', 'wunderpaint' ),
									-90,
									200
								) }
								{ dial(
									'peak',
									__( 'Peak position', 'wunderpaint' ),
									5,
									95
								) }
								{ dial(
									'bias',
									__( 'Asymmetry', 'wunderpaint' ),
									-90,
									90
								) }
							</div>
							<Choice
								label={ __( 'Style', 'wunderpaint' ) }
								value={ style.kind }
								choices={ [
									[
										'solid',
										_x(
											'Solid',
											'pen tool',
											'wunderpaint'
										),
									],
									[ 'dashed', __( 'Dashed', 'wunderpaint' ) ],
									[ 'dotted', __( 'Dotted', 'wunderpaint' ) ],
									[
										'double',
										__( 'Double line', 'wunderpaint' ),
									],
									[
										'fill',
										__( 'Filled shape', 'wunderpaint' ),
									],
									[
										'bristle',
										__( 'Dry brush', 'wunderpaint' ),
									],
									[ 'sketch', __( 'Sketch', 'wunderpaint' ) ],
									[
										'ribbon',
										_x(
											'Ribbon',
											'pen tool',
											'wunderpaint'
										),
									],
								] }
								onChange={ ( v ) => patch( { kind: v }, true ) }
							/>
							{ [ 'bristle', 'sketch', 'ribbon' ].includes(
								style.kind
							) && (
								<div className="pp-dials">
									{ dial(
										'texture',
										'bristle' === style.kind
											? __( 'Dryness', 'wunderpaint' )
											: 'sketch' === style.kind
											? __( 'Looseness', 'wunderpaint' )
											: __( 'Twists', 'wunderpaint' ),
										0,
										100,
										1,
										''
									) }
									{ 'ribbon' !== style.kind &&
										dial(
											'strands',
											'bristle' === style.kind
												? __(
														'Bristles',
														'wunderpaint'
												  )
												: __( 'Lines', 'wunderpaint' ),
											3,
											24,
											1,
											''
										) }
									{ dial(
										'seed',
										__( 'Variation', 'wunderpaint' ),
										1,
										99,
										1,
										''
									) }
								</div>
							) }
							{ style.kind !== 'fill' && (
								<div className="pp-dials">
									{ dial(
										'rough',
										__( 'Rough edge', 'wunderpaint' ),
										0,
										100,
										1,
										''
									) }
								</div>
							) }
							{ [ 'dashed', 'dotted' ].includes( style.kind ) && (
								<div className="pp-dials">
									{ dial(
										'gap',
										__( 'Gap', 'wunderpaint' ),
										1,
										100,
										1,
										' px'
									) }
									{ style.kind === 'dashed' &&
										dial(
											'dash',
											__( 'Dash', 'wunderpaint' ),
											1,
											100,
											1,
											' px'
										) }
								</div>
							) }
							{ style.kind !== 'fill' && (
								<details className="pp-section">
									<summary>
										{ __(
											'Parallel lines',
											'wunderpaint'
										) }
									</summary>
									<div className="pp-dials">
										{ dial(
											'parallelCount',
											__( 'Copies', 'wunderpaint' ),
											0,
											6,
											1,
											''
										) }
										{ dial(
											'parallelGap',
											__( 'Spacing', 'wunderpaint' ),
											-150,
											150,
											1,
											' px'
										) }
									</div>
								</details>
							) }
							<button
								className="pp-link"
								disabled={
									! style.markers.length || layer?.locked
								}
								onClick={ () => patch( { markers: [] }, true ) }
							>
								{ __( 'Reset width points', 'wunderpaint' ) }
							</button>
						</>
					) }
					{ visibleTab === 'ends' && (
						<>
							<div className="pp-dials">
								{ dial(
									'start',
									__( 'Start width', 'wunderpaint' ),
									0,
									200
								) }
								{ dial(
									'end',
									__( 'End width', 'wunderpaint' ),
									0,
									200
								) }
								{ dial(
									'inLength',
									__( 'Taper in', 'wunderpaint' )
								) }
								{ dial(
									'outLength',
									__( 'Taper out', 'wunderpaint' )
								) }
							</div>
							<Choice
								label={ __( 'Transition', 'wunderpaint' ) }
								value={ style.ease }
								choices={ [
									[ 'linear', __( 'Linear', 'wunderpaint' ) ],
									[ 'smooth', __( 'Smooth', 'wunderpaint' ) ],
									[ 'sharp', __( 'Sharp', 'wunderpaint' ) ],
								] }
								onChange={ ( v ) => patch( { ease: v }, true ) }
							/>
							<Choice
								label={ __( 'Caps', 'wunderpaint' ) }
								value={ style.cap }
								choices={ [
									[ 'round', __( 'Round', 'wunderpaint' ) ],
									[ 'flat', __( 'Flat', 'wunderpaint' ) ],
								] }
								onChange={ ( v ) => patch( { cap: v }, true ) }
							/>
							{ [
								[
									'startHead',
									__( 'Start marker', 'wunderpaint' ),
								],
								[
									'endHead',
									__( 'End marker', 'wunderpaint' ),
								],
							].map( ( [ key, label ] ) => (
								<Choice
									key={ key }
									label={ label }
									value={ style[ key ] }
									choices={ [
										[ 'none', __( 'None', 'wunderpaint' ) ],
										[
											'arrow',
											__( 'Arrow', 'wunderpaint' ),
										],
										[
											'open',
											__( 'Open arrow', 'wunderpaint' ),
										],
										[
											'needle',
											__( 'Narrow arrow', 'wunderpaint' ),
										],
										[
											'circle',
											__( 'Circle', 'wunderpaint' ),
										],
										[
											'diamond',
											__( 'Diamond', 'wunderpaint' ),
										],
										[ 'bar', __( 'Bar', 'wunderpaint' ) ],
									] }
									onChange={ ( v ) =>
										patch( { [ key ]: v }, true )
									}
								/>
							) ) }
							{ ( style.arrowStart || style.arrowEnd ) && (
								<>
									<Choice
										label={ __(
											'Direction',
											'wunderpaint'
										) }
										value={ style.headFollow }
										choices={ [
											[
												'curve',
												__(
													'Follow curve',
													'wunderpaint'
												),
											],
											[
												'straight',
												__( 'Tangent', 'wunderpaint' ),
											],
										] }
										onChange={ ( v ) =>
											patch( { headFollow: v }, true )
										}
									/>
									<div className="pp-dials">
										{ dial(
											'headLength',
											__( 'Head length', 'wunderpaint' ),
											0.5,
											10,
											0.1,
											'×'
										) }
										{ dial(
											'headWidth',
											__( 'Head width', 'wunderpaint' ),
											0.5,
											10,
											0.1,
											'×'
										) }
									</div>
								</>
							) }
						</>
					) }
					{ visibleTab === 'points' && (
						<>
							<div className="pp-actions pp-operations">
								{ modes.map( ( [ id, name ] ) => (
									<button
										key={ id }
										className={
											editMode === id ? 'active' : ''
										}
										aria-pressed={ editMode === id }
										disabled={ disabled }
										onClick={ () =>
											onEdit(
												editMode === id ? 'points' : id
											)
										}
									>
										{ name }
									</button>
								) ) }
							</div>
							{ editMode === 'join' && (
								<label
									className="pp-check"
									htmlFor="pp-smooth-join"
								>
									<input
										id="pp-smooth-join"
										type="checkbox"
										checked={ !! opts.smoothJoin }
										onChange={ ( e ) =>
											setOpt(
												'smoothJoin',
												e.target.checked
											)
										}
									/>
									{ __( 'Smooth join', 'wunderpaint' ) }
								</label>
							) }
							{ editMode === 'smooth' && (
								<div className="pp-dials">
									<Dial
										label={ __( 'Radius', 'wunderpaint' ) }
										value={ opts.smoothRadius ?? 40 }
										min={ 8 }
										max={ 100 }
										suffix=" px"
										onChange={ ( v ) =>
											setOpt( 'smoothRadius', v )
										}
									/>
									<Dial
										label={ __(
											'Strength',
											'wunderpaint'
										) }
										value={ opts.smoothStrength ?? 50 }
										onChange={ ( v ) =>
											setOpt( 'smoothStrength', v )
										}
									/>
								</div>
							) }
							<p className="pp-hint">
								{ __(
									'Shift-click adds points to the selection. Drag to move them together.',
									'wunderpaint'
								) }
							</p>
							{ selection?.count > 1 && (
								<span className="pp-hint">
									{ sprintf(
										/* translators: %d: number of selected path points. */
										__(
											'%d points selected',
											'wunderpaint'
										),
										selection.count
									) }
								</span>
							) }
							<button
								className="pp-link"
								disabled={ disabled }
								onClick={ () => pointAction( 'all' ) }
							>
								{ __( 'Select all points', 'wunderpaint' ) }
							</button>
							{ selection?.count > 1 && (
								<Choice
									label={ __( 'Arrange', 'wunderpaint' ) }
									value=""
									choices={ [
										[
											'',
											__(
												'Choose action',
												'wunderpaint'
											),
										],
										[
											'align-x',
											__(
												'Align vertically',
												'wunderpaint'
											),
										],
										[
											'align-y',
											__(
												'Align horizontally',
												'wunderpaint'
											),
										],
										...( selection.count > 2
											? [
													[
														'distribute-x',
														__(
															'Distribute horizontally',
															'wunderpaint'
														),
													],
													[
														'distribute-y',
														__(
															'Distribute vertically',
															'wunderpaint'
														),
													],
											  ]
											: [] ),
									] }
									onChange={ ( value ) =>
										pointAction( value )
									}
								/>
							) }

							<p className="pp-hint">
								{ __(
									'Select a point on the canvas to change its handles.',
									'wunderpaint'
								) }
							</p>
							<div className="pp-actions">
								{ [
									[ 'corner', __( 'Corner', 'wunderpaint' ) ],
									[ 'smooth', __( 'Smooth', 'wunderpaint' ) ],
									[
										'symmetric',
										__( 'Symmetric', 'wunderpaint' ),
									],
									[
										'delete',
										__( 'Remove point', 'wunderpaint' ),
									],
								].map( ( [ id, name ] ) => (
									<button
										className="ai-btn secondary"
										key={ id }
										disabled={
											disabled ||
											! [ 'points', 'round' ].includes(
												editMode
											) ||
											! selection
										}
										onClick={ () => pointAction( id ) }
									>
										{ name }
									</button>
								) ) }
							</div>
							<div className="pp-actions">
								<button
									className="ai-btn secondary"
									disabled={ disabled }
									onClick={ () =>
										geometry(
											reversePenPath( layer.penPath.d ),
											{
												...style,
												start: style.end,
												end: style.start,
												inLength: style.outLength,
												outLength: style.inLength,
												peak: 100 - style.peak,
												bias: -style.bias,
												arrowStart: style.arrowEnd,
												arrowEnd: style.arrowStart,
												startHead: style.endHead,
												endHead: style.startHead,
												parallelGap: -style.parallelGap,
												trimStart: 100 - style.trimEnd,
												trimEnd: 100 - style.trimStart,
												colors: style.colors.map(
													( c ) => ( {
														...c,
														t: 1 - c.t,
													} )
												),
												motion: style.motion.map(
													( m ) => ( {
														...m,
														t: 1 - m.t,
													} )
												),
												markers: style.markers.map(
													( m ) => ( {
														...m,
														t: 1 - m.t,
													} )
												),
											}
										)
									}
								>
									{ __( 'Reverse path', 'wunderpaint' ) }
								</button>
								<button
									className="ai-btn secondary"
									disabled={ disabled || closed }
									onClick={ () =>
										geometry(
											extendPenPath( layer.penPath.d, 40 )
										)
									}
								>
									{ __( 'Extend path', 'wunderpaint' ) }
								</button>
								<button
									className="ai-btn secondary"
									disabled={ disabled }
									onClick={ () =>
										geometry(
											buildPathD(
												parsePathAnchors(
													layer.penPath.d
												).map( ( s ) => ( {
													...s,
													closed: ! s.closed,
												} ) )
											)
										)
									}
								>
									{ closed
										? __( 'Open path', 'wunderpaint' )
										: __( 'Close path', 'wunderpaint' ) }
								</button>
							</div>
							{ dial(
								'smoothing',
								__( 'Simplify', 'wunderpaint' )
							) }
						</>
					) }
				</div>
			</div>
			<div className="pp-foot dsm-foot">
				<span className="dsm-hint pp-status" role="status">
					{ draft
						? __( 'Drawing a new path', 'wunderpaint' )
						: layer
						? layer.locked
							? __( 'Layer is locked', 'wunderpaint' )
							: __( 'Path selected', 'wunderpaint' )
						: __( 'Settings for the next path', 'wunderpaint' ) }
				</span>
				<div className="dsm-actions">
					{ draft ? (
						<>
							<button
								className="ai-btn secondary"
								title={ __( 'Last point back', 'wunderpaint' ) }
								aria-label={ __(
									'Last point back',
									'wunderpaint'
								) }
								disabled={ ! draft.anchors?.length }
								onClick={ () => onDraft( 'back' ) }
							>
								{ I.undo( { size: 14 } ) }
							</button>
							<button
								className="ai-btn secondary"
								onClick={ () => onDraft( 'cancel' ) }
							>
								{ __( 'Cancel', 'wunderpaint' ) }
							</button>
							<button
								className="ai-btn primary"
								disabled={ ( draft.anchors?.length || 0 ) < 2 }
								onClick={ () => onDraft( 'finish' ) }
							>
								{ __( 'Finish drawing', 'wunderpaint' ) }
							</button>
						</>
					) : (
						<button className="ai-btn primary" onClick={ onNew }>
							{ __( 'New path', 'wunderpaint' ) }
						</button>
					) }
				</div>
			</div>
		</div>
	);
}
