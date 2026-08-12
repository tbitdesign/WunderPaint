/**
 * Properties panel (spec 06.2): context-sensitive sections with live
 * two-way binding to the canvas.
 */

import { ROUNDABLE_SHAPES } from '../../lib/corner-geometry';
import {
	Fragment,
	useEffect,
	useRef,
	useState,
	useId,
} from '@wordpress/element';
import { __, _x } from '@wordpress/i18n';

import { dashDefaults } from '../../lib/raster';

import { I } from '../../icons';
import { FONT_WEIGHTS } from '../../store/constants';
import { FontPicker } from '../../components/font-picker';
import { EFFECTS, effectById, defaultParamsFor } from '../../lib/effects';
import { bindingGroups, hasTokens } from '../../lib/dynamic-content';
import { VarButton } from '../../components/var-picker';
import { unitFor } from '../../lib/selection-units';
import {
	listExtensionEffects,
	listExtensionPanelSections,
	subscribeExtensions,
} from '../../lib/extensions';
import {
	useEditor,
	activeLayerOf,
	withDescendants,
} from '../../store/editor-context';
import { ScrubLabel } from '../../components/scrub-label';
import { SwatchButton } from '../../components/color-popover';
import { useSelectionStyle } from '../../components/use-selection-style';
import { PanelGroup, PanelSection } from '../../components/panel-section';
import { GradientBar } from '../../components/gradient-bar';
import { PatternSelect } from '../../components/pattern-select';
import { SnapSlider } from '../../components/snap-slider';
import * as Ops from '../../store/ops';

const num = ( v ) => ( Number.isFinite( +v ) ? +v : 0 );

/** Square icon-box toggle button (matches Align & Distribute), v1.23. */
const fmtBtn = ( active ) => ( {
	height: 26,
	display: 'grid',
	placeItems: 'center',
	background: active ? 'var(--accent)' : 'var(--ed-panel-alt)',
	border: `1px solid ${ active ? 'var(--accent)' : 'var(--ed-border)' }`,
	borderRadius: 3,
	color: active ? '#fff' : 'var(--ed-text-dim)',
	cursor: 'pointer',
} );

/**
 * A styled segmented toggle for the properties panel (v1.24). The old code
 * used `.seg-row`, which is only styled inside dialogs, in the panel the
 * buttons ran together as unstyled text.
 */
function SegToggle( { value, options, onChange } ) {
	return (
		<div style={ { display: 'flex', gap: 2 } }>
			{ options.map( ( [ id, label ] ) => (
				<button
					key={ id }
					type="button"
					style={ {
						flex: 1,
						padding: '4px 6px',
						fontSize: 11,
						borderRadius: 3,
						cursor: 'pointer',
						whiteSpace: 'nowrap',
						background:
							value === id
								? 'var(--accent)'
								: 'var(--ed-panel-alt)',
						color: value === id ? '#fff' : 'var(--ed-text-dim)',
						border: `1px solid ${
							value === id ? 'var(--accent)' : 'var(--ed-border)'
						}`,
					} }
					onClick={ () => onChange( id ) }
				>
					{ label }
				</button>
			) ) }
		</div>
	);
}

/** Gradient fill controls (type + stops + angle), shared by text and shapes. */
function GradientFillControls( { layer, up } ) {
	const kind = layer.gradientKind || 'linear';
	return (
		<>
			<Field label={ __( 'Type', 'wunderpaint' ) }>
				<SegToggle
					value={ kind }
					options={ [
						[ 'linear', __( 'Linear', 'wunderpaint' ) ],
						[ 'radial', __( 'Radial', 'wunderpaint' ) ],
						[ 'angle', __( 'Angle', 'wunderpaint' ) ],
					] }
					onChange={ ( gradientKind ) => up( { gradientKind } ) }
				/>
			</Field>
			<div style={ { marginTop: 8 } }>
				<Field label={ __( 'Gradient', 'wunderpaint' ) }>
					{ /* The room for the stop handles is the bar's own margin
					     now, so this no longer needs a spacer of its own. */ }
					<GradientBar
						stops={ layer.gradientStops || [] }
						onChange={ ( gradientStops ) =>
							up( { gradientStops } )
						}
					/>
				</Field>
			</div>
			{ 'radial' !== kind && (
				<div style={ { marginTop: 6 } }>
					<SliderRow
						label={ __( 'Angle', 'wunderpaint' ) }
						min={ 0 }
						max={ 360 }
						value={ layer.gradientAngle || 0 }
						display={ ( layer.gradientAngle || 0 ) + '°' }
						onChange={ ( v ) => up( { gradientAngle: v } ) }
					/>
				</div>
			) }
		</>
	);
}

function Field( { label, children, cols = '70px 1fr', scrub, alignTop } ) {
	// `children` is anything from a slider to a four-button group, so there is
	// no single control an htmlFor could point at. A named group is the honest
	// markup, and the plain caption is a span - a <label> that labels nothing
	// is worse than no label at all (v1.348.0).
	const fieldLabelId = useId();
	return (
		<div
			className="field"
			role="group"
			aria-labelledby={ fieldLabelId }
			style={ {
				gridTemplateColumns: cols,
				...( alignTop ? { alignItems: 'start', paddingTop: 2 } : {} ),
			} }
		>
			{ scrub ? (
				<ScrubLabel as="span" id={ fieldLabelId } { ...scrub }>
					{ label }
				</ScrubLabel>
			) : (
				<span className="field-label" id={ fieldLabelId }>
					{ label }
				</span>
			) }
			{ children }
		</div>
	);
}

function SliderRow( {
	label,
	min,
	max,
	step = 1,
	value,
	display,
	onChange,
	onCommit,
	def = 0,
} ) {
	// Unique per mount, so two of these can never share an id.
	const fieldId = useId();
	return (
		<div className="slider-row">
			<label htmlFor={ fieldId }>{ label }</label>
			<SnapSlider
				id={ fieldId }
				min={ min }
				max={ max }
				step={ step }
				value={ value }
				def={ def }
				ariaLabel={ label }
				onChange={ onChange }
				onCommit={ onCommit }
			/>
			<span className="val">{ display ?? value }</span>
		</div>
	);
}

/* ------------------------------ Transform ------------------------------- */

/**
 * Rotation slider (v1.24.7). A single layer rotates absolutely via its own
 * `rot`. A GROUP has no stored rotation of its own and the compositor applies
 * no group transform, so it rotates rigidly about the group's combined centre:
 * every descendant leaf orbits that centre AND spins its own `rot` by the same
 * angle. Like Scale on a group it is a relative nudge that snaps back to 0° on
 * release (there is no single group angle to display).
 */
function RotateRow( { layer } ) {
	const { state, dispatch, commit } = useEditor();
	const base = useRef( null );
	const [ delta, setDelta ] = useState( 0 );

	if ( 'group' !== layer.type ) {
		return (
			<SliderRow
				label={ __( 'Rotation', 'wunderpaint' ) }
				min={ -180 }
				max={ 180 }
				value={ Math.round( layer.rot || 0 ) }
				display={ `${ Math.round( layer.rot || 0 ) }°` }
				onChange={ ( v ) =>
					dispatch( {
						type: 'UPDATE_LAYER',
						id: layer.id,
						patch: { rot: v },
					} )
				}
				onCommit={ () => commit( __( 'Rotate layer', 'wunderpaint' ) ) }
			/>
		);
	}

	const grab = () => {
		const ids = withDescendants( state.layers, [ layer.id ] );
		const leaves = state.layers.filter(
			( l ) => ids.has( l.id ) && 'group' !== l.type
		);
		if ( ! leaves.length ) {
			return null;
		}
		const minX = Math.min( ...leaves.map( ( l ) => l.x ) );
		const minY = Math.min( ...leaves.map( ( l ) => l.y ) );
		const maxX = Math.max( ...leaves.map( ( l ) => l.x + l.w ) );
		const maxY = Math.max( ...leaves.map( ( l ) => l.y + l.h ) );
		return {
			cx: ( minX + maxX ) / 2,
			cy: ( minY + maxY ) / 2,
			leaves: leaves.map( ( l ) => ( {
				id: l.id,
				lcx: l.x + l.w / 2,
				lcy: l.y + l.h / 2,
				w: l.w,
				h: l.h,
				rot: l.rot || 0,
			} ) ),
		};
	};

	const apply = ( deg ) => {
		const b = base.current;
		if ( ! b ) {
			return;
		}
		const rad = ( deg * Math.PI ) / 180;
		const cos = Math.cos( rad );
		const sin = Math.sin( rad );
		for ( const lf of b.leaves ) {
			const dx = lf.lcx - b.cx;
			const dy = lf.lcy - b.cy;
			const ncx = b.cx + dx * cos - dy * sin;
			const ncy = b.cy + dx * sin + dy * cos;
			const rot =
				( ( ( ( lf.rot + deg + 180 ) % 360 ) + 360 ) % 360 ) - 180;
			dispatch( {
				type: 'UPDATE_LAYER',
				id: lf.id,
				patch: { x: ncx - lf.w / 2, y: ncy - lf.h / 2, rot },
			} );
		}
	};

	return (
		<SliderRow
			label={ __( 'Rotation', 'wunderpaint' ) }
			min={ -180 }
			max={ 180 }
			value={ delta }
			def={ 0 }
			display={ `${ Math.round( delta ) }°` }
			onChange={ ( v ) => {
				if ( ! base.current ) {
					base.current = grab();
				}
				setDelta( v );
				apply( v );
			} }
			onCommit={ () => {
				base.current = null;
				setDelta( 0 );
				commit( __( 'Rotate layer', 'wunderpaint' ) );
			} }
		/>
	);
}

/**
 * Uniform scale slider (v1.24.5): scales the active layer about its centre.
 * The value is a live multiplier that snaps back to 100% on release, so it
 * reads as a relative nudge (Photoshop-style transform) rather than an
 * absolute size. Shapes rescale their path + stroke via patchLayer; text
 * scales its font size too so glyphs grow with the box.
 *
 * A GROUP has no real box of its own, its geometry is a placeholder and the
 * compositor never applies a group transform to its children (v1.24.6). So a
 * group scales by transforming every descendant leaf about the group's
 * combined centre: each leaf's size and its offset from that centre scale by
 * the same factor, which grows the whole group uniformly.
 */
function ScaleRow( { layer } ) {
	const { state, dispatch, commit } = useEditor();
	const base = useRef( null );
	const [ pct, setPct ] = useState( 100 );

	// Snapshot the geometry the scale is measured from (captured on grab).
	const grab = () => {
		if ( 'group' === layer.type ) {
			const ids = withDescendants( state.layers, [ layer.id ] );
			const leaves = state.layers.filter(
				( l ) => ids.has( l.id ) && 'group' !== l.type
			);
			if ( ! leaves.length ) {
				return null;
			}
			const minX = Math.min( ...leaves.map( ( l ) => l.x ) );
			const minY = Math.min( ...leaves.map( ( l ) => l.y ) );
			const maxX = Math.max( ...leaves.map( ( l ) => l.x + l.w ) );
			const maxY = Math.max( ...leaves.map( ( l ) => l.y + l.h ) );
			return {
				group: true,
				cx: ( minX + maxX ) / 2,
				cy: ( minY + maxY ) / 2,
				leaves: leaves.map( ( l ) => ( {
					id: l.id,
					x: l.x,
					y: l.y,
					w: l.w,
					h: l.h,
					fontSize: l.fontSize,
					spans: l.spans || null,
					isText: 'text' === l.type,
				} ) ),
			};
		}
		return {
			group: false,
			w: layer.w,
			h: layer.h,
			cx: layer.x + layer.w / 2,
			cy: layer.y + layer.h / 2,
			fontSize: layer.fontSize,
			spans: layer.spans || null,
		};
	};

	// Scale one snapshotted leaf about a centre and dispatch its new geometry.
	const scaleLeaf = ( lf, f, cx, cy ) => {
		const nw = Math.max( 1, lf.w * f );
		const nh = Math.max( 1, lf.h * f );
		const ncx = cx + ( lf.x + lf.w / 2 - cx ) * f;
		const ncy = cy + ( lf.y + lf.h / 2 - cy ) * f;
		const patch = { w: nw, h: nh, x: ncx - nw / 2, y: ncy - nh / 2 };
		if ( lf.isText && lf.fontSize ) {
			patch.fontSize = Math.max( 4, lf.fontSize * f );
			// Rich spans (v1.46) carry their own sizes — scale them along.
			if ( lf.spans ) {
				patch.spans = lf.spans.map( ( run ) =>
					run?.s?.size
						? {
								...run,
								s: {
									...run.s,
									size: Math.max( 4, run.s.size * f ),
								},
						  }
						: run
				);
			}
		}
		dispatch( { type: 'UPDATE_LAYER', id: lf.id, patch } );
	};

	const apply = ( s ) => {
		const b = base.current;
		if ( ! b ) {
			return;
		}
		const f = s / 100;
		if ( b.group ) {
			for ( const lf of b.leaves ) {
				scaleLeaf( lf, f, b.cx, b.cy );
			}
		} else {
			scaleLeaf(
				{
					id: layer.id,
					x: b.cx - b.w / 2,
					y: b.cy - b.h / 2,
					w: b.w,
					h: b.h,
					fontSize: b.fontSize,
					spans: b.spans,
					isText: 'text' === layer.type,
				},
				f,
				b.cx,
				b.cy
			);
		}
	};

	return (
		<SliderRow
			label={ __( 'Scale', 'wunderpaint' ) }
			min={ 10 }
			max={ 300 }
			value={ pct }
			def={ 100 }
			display={ `${ Math.round( pct ) }%` }
			onChange={ ( v ) => {
				if ( ! base.current ) {
					base.current = grab();
				}
				setPct( v );
				apply( v );
			} }
			onCommit={ () => {
				base.current = null;
				setPct( 100 );
				commit( __( 'Scale layer', 'wunderpaint' ) );
			} }
		/>
	);
}

function TransformSection( { layer } ) {
	const { state, dispatch, commit } = useEditor();
	const up = ( patch, label ) => {
		dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
		if ( label ) {
			commit( label );
		}
	};
	// Groups are UNITS (v1.66): the panel shows the union bounds of the
	// members, X/Y edits move everything by the same delta and flips mirror
	// the members about the unit centre (the compositor applies no group
	// transform of its own).
	const isGroup = 'group' === layer.type;
	const unit = isGroup ? unitFor( state.layers, layer ) : null;
	const box = isGroup
		? unit.box
		: { x: layer.x, y: layer.y, w: layer.w, h: layer.h };
	const moveUnitTo = ( patch ) => {
		if ( unit.locked ) {
			return;
		}
		const dx = undefined !== patch.x ? patch.x - box.x : 0;
		const dy = undefined !== patch.y ? patch.y - box.y : 0;
		if ( ! dx && ! dy ) {
			return;
		}
		dispatch( {
			type: 'UPDATE_LAYERS',
			ids: unit.ids,
			patchFor: ( l ) => ( { x: l.x + dx, y: l.y + dy } ),
		} );
	};
	const setX = ( v ) => ( isGroup ? moveUnitTo( { x: v } ) : up( { x: v } ) );
	const setY = ( v ) => ( isGroup ? moveUnitTo( { y: v } ) : up( { y: v } ) );
	const flipUnit = ( vertical ) => {
		if ( unit.locked ) {
			return;
		}
		const cx = box.x + box.w / 2;
		const cy = box.y + box.h / 2;
		dispatch( {
			type: 'UPDATE_LAYERS',
			ids: unit.ids,
			patchFor: ( l ) => {
				if ( 'group' === l.type ) {
					return {};
				}
				return vertical
					? {
							y: 2 * cy - ( l.y + l.h ),
							flipY: ! l.flipY,
							rot: -( l.rot || 0 ),
					  }
					: {
							x: 2 * cx - ( l.x + l.w ),
							flipX: ! l.flipX,
							rot: -( l.rot || 0 ),
					  };
			},
		} );
		commit(
			vertical
				? __( 'Flip layer V', 'wunderpaint' )
				: __( 'Flip layer H', 'wunderpaint' )
		);
	};
	return (
		<PanelSection
			wsKey="props.transform"
			title={ __( 'Transform', 'wunderpaint' ) }
		>
			<div className="row2">
				<Field
					label="X"
					cols="20px 1fr"
					scrub={ {
						value: Math.round( box.x ),
						onScrub: ( v ) => setX( v ),
						onCommit: () =>
							commit( __( 'Move layer', 'wunderpaint' ) ),
					} }
				>
					<input
						type="number"
						value={ Math.round( box.x ) }
						onChange={ ( e ) => setX( num( e.target.value ) ) }
						onBlur={ () =>
							commit( __( 'Move layer', 'wunderpaint' ) )
						}
					/>
				</Field>
				<Field
					label="Y"
					cols="20px 1fr"
					scrub={ {
						value: Math.round( box.y ),
						onScrub: ( v ) => setY( v ),
						onCommit: () =>
							commit( __( 'Move layer', 'wunderpaint' ) ),
					} }
				>
					<input
						type="number"
						value={ Math.round( box.y ) }
						onChange={ ( e ) => setY( num( e.target.value ) ) }
						onBlur={ () =>
							commit( __( 'Move layer', 'wunderpaint' ) )
						}
					/>
				</Field>
			</div>
			<div className="row2">
				<Field
					label="W"
					cols="20px 1fr"
					scrub={
						isGroup
							? undefined
							: {
									value: Math.round( box.w ),
									min: 1,
									onScrub: ( v ) => up( { w: v } ),
									onCommit: () =>
										commit(
											__( 'Resize layer', 'wunderpaint' )
										),
							  }
					}
				>
					<input
						type="number"
						value={ Math.round( box.w ) }
						disabled={ isGroup }
						title={
							isGroup
								? __(
										'Use the Scale slider to resize a group',
										'wunderpaint'
								  )
								: undefined
						}
						onChange={ ( e ) =>
							! isGroup &&
							up( { w: Math.max( 1, num( e.target.value ) ) } )
						}
						onBlur={ () =>
							! isGroup &&
							commit( __( 'Resize layer', 'wunderpaint' ) )
						}
					/>
				</Field>
				<Field
					label="H"
					cols="20px 1fr"
					scrub={
						isGroup
							? undefined
							: {
									value: Math.round( box.h ),
									min: 1,
									onScrub: ( v ) => up( { h: v } ),
									onCommit: () =>
										commit(
											__( 'Resize layer', 'wunderpaint' )
										),
							  }
					}
				>
					<input
						type="number"
						value={ Math.round( box.h ) }
						disabled={ isGroup }
						title={
							isGroup
								? __(
										'Use the Scale slider to resize a group',
										'wunderpaint'
								  )
								: undefined
						}
						onChange={ ( e ) =>
							! isGroup &&
							up( { h: Math.max( 1, num( e.target.value ) ) } )
						}
						onBlur={ () =>
							! isGroup &&
							commit( __( 'Resize layer', 'wunderpaint' ) )
						}
					/>
				</Field>
			</div>
			<RotateRow layer={ layer } />
			<ScaleRow layer={ layer } />
			<div style={ { display: 'flex', gap: 4 } }>
				<button
					className="ai-btn secondary"
					style={ { flex: 1 } }
					onClick={ () =>
						isGroup
							? flipUnit( false )
							: up(
									{ flipX: ! layer.flipX },
									__( 'Flip layer H', 'wunderpaint' )
							  )
					}
				>
					{ I.flipH( { size: 13 } ) }{ ' ' }
					{ __( 'Flip H', 'wunderpaint' ) }
				</button>
				<button
					className="ai-btn secondary"
					style={ { flex: 1 } }
					onClick={ () =>
						isGroup
							? flipUnit( true )
							: up(
									{ flipY: ! layer.flipY },
									__( 'Flip layer V', 'wunderpaint' )
							  )
					}
				>
					{ I.flipV( { size: 13 } ) }{ ' ' }
					{ __( 'Flip V', 'wunderpaint' ) }
				</button>
				<button
					className="ai-btn secondary"
					style={ { flex: 1 } }
					title={ __( 'Reset rotation and flips', 'wunderpaint' ) }
					onClick={ () =>
						up(
							{ rot: 0, flipX: false, flipY: false, quad: null },
							__( 'Reset transform', 'wunderpaint' )
						)
					}
				>
					{ __( 'Reset', 'wunderpaint' ) }
				</button>
			</div>
		</PanelSection>
	);
}

/* ---------------------------- type sections ----------------------------- */

/**
 * Dynamic content (dynamic templates E1): bind a text layer to a post
 * variable or an image layer to the generated background / featured image /
 * brand logo. Bound text gets a min/max font-size range for the auto-fit.
 */
function DynamicSection( { layer } ) {
	const { state, dispatch, commit } = useEditor();
	const isText = 'text' === layer.type;
	const kind = isText ? 'text' : 'image';
	// Kit assignment (v1.91.0): stored on the document (and therefore in
	// saved templates); decides whose custom variables the picker lists and
	// which kit the post preview resolves with. Runs can still override.
	const kits = window.WPIE?.brandKits || [];
	const kit =
		kits.find( ( k ) => k.id === state.doc.brandKitId ) ||
		kits[ 0 ] ||
		null;
	const groups = bindingGroups( kit )
		.map( ( g ) => ( {
			...g,
			items: ( g.items || [] ).filter( ( b ) => b.kind === kind ),
		} ) )
		.filter( ( g ) => g.items.length );
	const isMeta = !! layer.binding?.startsWith( 'meta.' );
	// A label commits to history; without one (a live scrub) we only
	// dispatch and let the caller commit once when the drag ends.
	const up = ( patch, label ) => {
		dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
		if ( label ) {
			commit( label );
		}
	};
	const pick = ( id ) => {
		if ( ! id ) {
			up( { binding: null }, __( 'Remove binding', 'wunderpaint' ) );
			return;
		}
		const patch = { binding: id };
		if ( isText && ! layer.fit ) {
			const max = Math.round( layer.fontSize || 48 );
			patch.fit = { min: Math.max( 10, Math.round( max * 0.4 ) ), max };
		}
		if ( ! isText && ! layer.imageFit ) {
			// Dynamic images arrive in arbitrary sizes: default to a
			// centered crop so nothing gets squashed into the box.
			patch.imageFit = { mode: 'cover', ax: 0.5, ay: 0.5 };
		}
		up( patch, __( 'Set binding', 'wunderpaint' ) );
	};
	// Update one end of the auto-fit range. Passing a label commits (typing in
	// the field, releasing a scrub); a scrub drag omits it so it dispatches
	// live without flooding the undo history, then commits once on release.
	const applyFit = ( key, v, label ) => {
		const fit = {
			min: 10,
			max: Math.round( layer.fontSize || 48 ),
			...( layer.fit || {} ),
			[ key ]: Math.max( 4, Math.round( num( v ) ) ),
		};
		// Keep the range coherent: the min can never sit above the max, and
		// editing one end pushes past the other rather than crossing it.
		if ( 'min' === key ) {
			fit.min = Math.min( fit.min, fit.max );
		} else {
			fit.max = Math.max( fit.max, fit.min );
		}
		up( { fit }, label );
	};
	const setFit = ( key, v ) =>
		applyFit( key, v, __( 'Edit fit range', 'wunderpaint' ) );
	return (
		<PanelSection
			wsKey="props.dynamic"
			title={ __( 'Dynamic content', 'wunderpaint' ) }
		>
			{ kits.length > 1 && (
				<Field label={ __( 'Brand Kit (document)', 'wunderpaint' ) }>
					<select
						value={ kit?.id || '' }
						onChange={ ( e ) =>
							Ops.assignBrandKitOp(
								{ state, dispatch, commit },
								e.target.value
							)
						}
					>
						{ kits.map( ( k ) => (
							<option key={ k.id } value={ k.id }>
								{ k.name }
							</option>
						) ) }
					</select>
				</Field>
			) }
			<Field label={ __( 'Variable', 'wunderpaint' ) }>
				<select
					value={ isMeta ? 'meta' : layer.binding || '' }
					onChange={ ( e ) =>
						pick(
							'meta' === e.target.value ? 'meta.' : e.target.value
						)
					}
				>
					<option value="">{ __( 'None', 'wunderpaint' ) }</option>
					{ groups.map( ( g ) => (
						<optgroup key={ g.label } label={ g.label }>
							{ g.items.map( ( b ) => (
								<option key={ b.id } value={ b.id }>
									{ b.label }
								</option>
							) ) }
						</optgroup>
					) ) }
					{ /* Custom meta keys bind text AND images (v1.314):
					     an image layer bound to meta.<key> swaps its src
					     to the field's attachment URL per post. */ }
					<option value="meta">
						{ __( 'Custom field…', 'wunderpaint' ) }
					</option>
				</select>
			</Field>
			{ isMeta && (
				<Field
					label={ __( 'Meta key', 'wunderpaint' ) }
					cols="52px 1fr"
				>
					<input
						type="text"
						value={ layer.binding.slice( 5 ) }
						placeholder="my_field_key"
						onChange={ ( e ) =>
							up(
								{ binding: 'meta.' + e.target.value.trim() },
								__( 'Set binding', 'wunderpaint' )
							)
						}
					/>
				</Field>
			) }
			{ 'ai.background' === layer.binding && (
				// Per-post style reference baked into the template
				// (v1.315): a meta key holding an image ID or URL. The
				// automation re-imagines each post's background from its
				// own image; empty = prompt-only generation.
				<Field
					label={ __( 'Reference', 'wunderpaint' ) }
					cols="52px 1fr"
				>
					<input
						type="text"
						value={ layer.aiRefKey || '' }
						placeholder={ __(
							'meta key with image (optional)',
							'wunderpaint'
						) }
						title={ __(
							'Custom field holding an image (attachment ID or URL). Automation runs re-imagine each post’s AI background from its own image.',
							'wunderpaint'
						) }
						onChange={ ( e ) =>
							up(
								{
									aiRefKey: e.target.value.trim() || null,
								},
								__( 'Set binding', 'wunderpaint' )
							)
						}
					/>
				</Field>
			) }
			{ isText && ( !! layer.binding || hasTokens( layer.text ) ) && (
				<div className="row2">
					<Field
						label={ __( 'Min size', 'wunderpaint' ) }
						cols="52px 1fr"
						scrub={ {
							value: layer.fit?.min ?? 10,
							min: 4,
							max: 800,
							onScrub: ( v ) => applyFit( 'min', v ),
							onCommit: () =>
								commit( __( 'Edit fit range', 'wunderpaint' ) ),
						} }
					>
						<input
							type="number"
							min="4"
							value={ layer.fit?.min ?? 10 }
							onChange={ ( e ) =>
								setFit( 'min', e.target.value )
							}
						/>
					</Field>
					<Field
						label={ __( 'Max size', 'wunderpaint' ) }
						cols="52px 1fr"
						scrub={ {
							value:
								layer.fit?.max ??
								Math.round( layer.fontSize || 48 ),
							min: 4,
							max: 800,
							onScrub: ( v ) => applyFit( 'max', v ),
							onCommit: () =>
								commit( __( 'Edit fit range', 'wunderpaint' ) ),
						} }
					>
						<input
							type="number"
							min="4"
							value={
								layer.fit?.max ??
								Math.round( layer.fontSize || 48 )
							}
							onChange={ ( e ) =>
								setFit( 'max', e.target.value )
							}
						/>
					</Field>
				</div>
			) }
			{ !! layer.binding && (
				<div
					style={ {
						fontSize: 11,
						color: 'var(--ed-text-muted)',
						lineHeight: 1.4,
					} }
				>
					{ 'ai.background' === layer.binding
						? __(
								'This layer will be replaced by the generated background image. Keep a placeholder photo in it while designing.',
								'wunderpaint'
						  )
						: isText
						? __(
								'Text that does not fit shrinks to the min size, then gets shortened. Use View, Preview with Post to test with real content.',
								'wunderpaint'
						  )
						: __(
								'The image source is replaced per post when the template runs and is placed into this box using the Image Fit settings.',
								'wunderpaint'
						  ) }
				</div>
			) }
			{ isText && ! layer.binding && (
				<>
					<Field label={ __( 'In text', 'wunderpaint' ) }>
						<div
							style={ {
								display: 'flex',
								gap: 6,
								alignItems: 'center',
							} }
						>
							<VarButton
								value={ layer.text || '' }
								onChange={ ( v ) =>
									up(
										{ text: v },
										__( 'Insert variable', 'wunderpaint' )
									)
								}
								kit={ kit }
								onKitChange={ ( id ) =>
									Ops.assignBrandKitOp(
										{ state, dispatch, commit },
										id
									)
								}
							/>
							<span
								style={ {
									fontSize: 11,
									color: 'var(--ed-text-muted)',
								} }
							>
								{ __(
									'Mix variables into the text',
									'wunderpaint'
								) }
							</span>
						</div>
					</Field>
					{ hasTokens( layer.text ) && (
						<div
							style={ {
								fontSize: 11,
								color: 'var(--ed-text-muted)',
								lineHeight: 1.4,
							} }
						>
							{ __(
								'Variables like {{post.url}} resolve per post when the template runs; if all variables in this text are empty, the layer hides. Word-level styling resets on resolved text.',
								'wunderpaint'
							) }
						</div>
					) }
				</>
			) }
		</PanelSection>
	);
}

/**
 * Image fit (v1.69): how the source maps into the layer box. 'fill'
 * stretches (the legacy behavior), 'cover' crops to fill, 'contain'
 * letterboxes; the anchor picks which part survives the crop or where
 * the letterboxed image sits. On raster layers this applies to the
 * dynamic replacement image.
 */
function ImageFitSection( { layer } ) {
	const { dispatch, commit } = useEditor();
	const fit = layer.imageFit || { mode: 'fill' };
	const mode = fit.mode || 'fill';
	const up = ( imageFit, label ) => {
		dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch: { imageFit } } );
		commit( label );
	};
	const MODES = [
		[ 'fill', __( 'Stretch', 'wunderpaint' ) ],
		[ 'cover', __( 'Cover', 'wunderpaint' ) ],
		[ 'contain', __( 'Fit', 'wunderpaint' ) ],
	];
	// Corner radius (v1.284): stored as a number, or an [tl,tr,br,bl]
	// array when composed content rounds only some corners — the field
	// shows the largest corner and writes back a uniform number.
	const radNow = Array.isArray( layer.radius )
		? Math.max( ...layer.radius.map( ( v ) => v || 0 ) )
		: layer.radius || 0;
	const upRad = ( v ) => {
		dispatch( {
			type: 'UPDATE_LAYER',
			id: layer.id,
			patch: { radius: Math.max( 0, Math.round( v ) ) },
		} );
	};
	return (
		<PanelSection
			wsKey="props.imagefit"
			title={ __( 'Image Fit', 'wunderpaint' ) }
		>
			<div className="fit-modes">
				{ MODES.map( ( [ id, label ] ) => (
					<button
						key={ id }
						className={ mode === id ? 'active' : '' }
						onClick={ () =>
							up(
								'fill' === id
									? { mode: id }
									: {
											ax: 0.5,
											ay: 0.5,
											...( layer.imageFit || {} ),
											mode: id,
									  },
								__( 'Set image fit', 'wunderpaint' )
							)
						}
					>
						{ label }
					</button>
				) ) }
			</div>
			{ 'image' === layer.type && (
				<Field
					label={ __( 'Radius', 'wunderpaint' ) }
					scrub={ {
						value: radNow,
						min: 0,
						onScrub: upRad,
						onCommit: () =>
							commit( __( 'Edit image', 'wunderpaint' ) ),
					} }
				>
					<input
						type="number"
						min="0"
						value={ radNow }
						onChange={ ( e ) => {
							upRad( num( e.target.value ) );
							commit( __( 'Edit image', 'wunderpaint' ) );
						} }
					/>
				</Field>
			) }
			{ 'fill' !== mode && 'image' === layer.type && (
				<div
					style={ {
						fontSize: 11,
						color: 'var(--ed-text-muted)',
						lineHeight: 1.4,
					} }
				>
					{ __(
						'Tip: double-click the layer on the canvas to reposition the image freely.',
						'wunderpaint'
					) }
				</div>
			) }
			{ 'raster' === layer.type && (
				<div
					style={ {
						fontSize: 11,
						color: 'var(--ed-text-muted)',
						lineHeight: 1.4,
					} }
				>
					{ __(
						'This layer has baked pixels; the fit applies to its dynamic replacement image.',
						'wunderpaint'
					) }
				</div>
			) }
		</PanelSection>
	);
}

function AppearanceSection( { layer, extras } ) {
	const { dispatch, commit } = useEditor();
	const up = ( patch, label ) => {
		dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
		commit( label || __( 'Edit shape', 'wunderpaint' ) );
	};
	const ft =
		layer.fillType ||
		( layer.pattern && 'none' !== layer.pattern ? 'pattern' : 'solid' );
	// The on-canvas grips can pull the four corners apart (v1.367), so a
	// shape radius is a number OR an [tl,tr,br,bl] array here too. One
	// field cannot show four values: it shows the largest and writes back
	// a uniform number - the same bargain the image radius field makes.
	const shapeRadiusNow = Array.isArray( layer.radius )
		? Math.max( ...layer.radius.map( ( v ) => v || 0 ) )
		: layer.radius || 0;
	return (
		<PanelSection
			wsKey="props.appearance"
			title={ __( 'Appearance', 'wunderpaint' ) }
		>
			<PanelGroup title={ __( 'Fill', 'wunderpaint' ) }>
				<Field label={ __( 'Type', 'wunderpaint' ) }>
					<SegToggle
						value={ ft }
						options={ [
							[ 'solid', __( 'Solid', 'wunderpaint' ) ],
							[ 'gradient', __( 'Gradient', 'wunderpaint' ) ],
							[ 'pattern', __( 'Pattern', 'wunderpaint' ) ],
						] }
						onChange={ ( id ) =>
							up( {
								fillType: id,
								...( 'gradient' === id && ! layer.gradientStops
									? {
											gradientStops: [
												{
													color:
														layer.fill || '#3b66ff',
													at: 0,
												},
												{ color: '#ff6a00', at: 1 },
											],
									  }
									: {} ),
								...( 'pattern' === id &&
								( ! layer.pattern || 'none' === layer.pattern )
									? { pattern: 'dots' }
									: {} ),
							} )
						}
					/>
				</Field>
				{ 'solid' === ft && (
					<Field label={ __( 'Color', 'wunderpaint' ) }>
						<div
							style={ {
								display: 'flex',
								gap: 6,
								alignItems: 'center',
							} }
						>
							<SwatchButton
								color={ layer.fill }
								onChange={ ( c ) => up( { fill: c } ) }
							/>
							<input
								type="text"
								value={ layer.fill || '' }
								onChange={ ( e ) =>
									up( { fill: e.target.value } )
								}
							/>
						</div>
					</Field>
				) }
				{ 'gradient' === ft && (
					<GradientFillControls layer={ layer } up={ up } />
				) }
				{ 'pattern' === ft && (
					<>
						<Field label={ __( 'Pattern', 'wunderpaint' ) }>
							<PatternSelect
								value={ layer.pattern }
								patternData={ layer.patternData }
								extras={ extras }
								onChange={ ( pattern, patternData ) =>
									up( {
										pattern:
											'none' === pattern
												? 'dots'
												: pattern,
										patternData,
									} )
								}
							/>
						</Field>
						<SliderRow
							label={ __( 'Pattern scale', 'wunderpaint' ) }
							min={ 10 }
							max={ 400 }
							def={ 100 }
							value={ Math.round(
								( layer.patternScale || 1 ) * 100
							) }
							display={
								Math.round(
									( layer.patternScale || 1 ) * 100
								) + '%'
							}
							onChange={ ( v ) =>
								up( { patternScale: v / 100 } )
							}
						/>
					</>
				) }
			</PanelGroup>
			<PanelGroup title={ __( 'Stroke', 'wunderpaint' ) }>
				<Field label={ __( 'Color', 'wunderpaint' ) }>
					<div
						style={ {
							display: 'flex',
							gap: 6,
							alignItems: 'center',
						} }
					>
						<SwatchButton
							color={ layer.stroke || 'transparent' }
							onChange={ ( c ) => up( { stroke: c } ) }
						/>
						<input
							type="text"
							placeholder="none"
							value={ layer.stroke || '' }
							onChange={ ( e ) =>
								up( { stroke: e.target.value || null } )
							}
						/>
					</div>
				</Field>
				<Field
					label={ __( 'Width', 'wunderpaint' ) }
					scrub={ {
						value: layer.strokeW || 0,
						min: 0,
						onScrub: ( v ) =>
							dispatch( {
								type: 'UPDATE_LAYER',
								id: layer.id,
								patch: {
									strokeW: Math.max( 0, Math.round( v ) ),
								},
							} ),
						onCommit: () =>
							commit( __( 'Edit shape', 'wunderpaint' ) ),
					} }
				>
					<input
						type="number"
						min="0"
						value={ layer.strokeW || 0 }
						onChange={ ( e ) =>
							up( {
								strokeW: Math.max( 0, num( e.target.value ) ),
							} )
						}
					/>
				</Field>
				<Field label={ __( 'Style', 'wunderpaint' ) }>
					<div
						style={ {
							display: 'flex',
							gap: 6,
							alignItems: 'center',
						} }
					>
						<select
							value={ layer.strokeDash || 'solid' }
							onChange={ ( e ) =>
								up( {
									strokeDash:
										'solid' === e.target.value
											? null
											: e.target.value,
								} )
							}
						>
							<option value="solid">
								{ _x( 'Solid', 'stroke style', 'wunderpaint' ) }
							</option>
							<option value="dashed">
								{ __( 'Dashed', 'wunderpaint' ) }
							</option>
							<option value="dotted">
								{ __( 'Dotted', 'wunderpaint' ) }
							</option>
						</select>
						{ 'dashed' === layer.strokeDash && (
							<input
								type="number"
								min="1"
								title={ __( 'Dash', 'wunderpaint' ) }
								value={ Math.round(
									layer.strokeDashLen ??
										dashDefaults( 'dashed', layer.strokeW )
											.len
								) }
								style={ { width: 46 } }
								onChange={ ( e ) =>
									up( {
										strokeDashLen: Math.max(
											1,
											num( e.target.value )
										),
									} )
								}
							/>
						) }
						{ [ 'dashed', 'dotted' ].includes(
							layer.strokeDash
						) && (
							<input
								type="number"
								min="1"
								title={ __( 'Gap', 'wunderpaint' ) }
								value={ Math.round(
									layer.strokeDashGap ??
										dashDefaults(
											layer.strokeDash,
											layer.strokeW
										).gap
								) }
								style={ { width: 46 } }
								onChange={ ( e ) =>
									up( {
										strokeDashGap: Math.max(
											1,
											num( e.target.value )
										),
									} )
								}
							/>
						) }
					</div>
				</Field>
			</PanelGroup>
			{ ( 'line' === layer.shape ||
				ROUNDABLE_SHAPES.includes( layer.shape ) ) && (
				<PanelGroup title={ __( 'Shape', 'wunderpaint' ) }>
					{ 'line' === layer.shape && (
						<Field label={ __( 'Line ends', 'wunderpaint' ) }>
							<div style={ { display: 'flex', gap: 6 } }>
								{ [
									[
										'arrowStart',
										__(
											'Start of the line',
											'wunderpaint'
										),
									],
									[
										'arrowEnd',
										__( 'End of the line', 'wunderpaint' ),
									],
								].map( ( [ key, title ] ) => (
									<select
										key={ key }
										title={ title }
										value={ layer[ key ] || '' }
										style={ { flex: 1, minWidth: 0 } }
										onChange={ ( e ) =>
											up( {
												[ key ]: e.target.value || null,
											} )
										}
									>
										<option value="">
											{ __( 'None', 'wunderpaint' ) }
										</option>
										<option value="arrow">
											{ __( 'Arrow', 'wunderpaint' ) }
										</option>
										<option value="triangle">
											{ __( 'Triangle', 'wunderpaint' ) }
										</option>
										<option value="circle">
											{ _x(
												'Dot',
												'line end',
												'wunderpaint'
											) }
										</option>
										<option value="bar">
											{ _x(
												'Bar',
												'line end',
												'wunderpaint'
											) }
										</option>
									</select>
								) ) }
							</div>
						</Field>
					) }
					{ ROUNDABLE_SHAPES.includes( layer.shape ) && (
						<Field
							label={ __( 'Radius', 'wunderpaint' ) }
							scrub={ {
								value: shapeRadiusNow,
								min: 0,
								onScrub: ( v ) =>
									dispatch( {
										type: 'UPDATE_LAYER',
										id: layer.id,
										patch: {
											radius: Math.max(
												0,
												Math.round( v )
											),
										},
									} ),
								onCommit: () =>
									commit( __( 'Edit shape', 'wunderpaint' ) ),
							} }
						>
							<input
								type="number"
								min="0"
								value={ shapeRadiusNow }
								onChange={ ( e ) =>
									up( {
										radius: Math.max(
											0,
											num( e.target.value )
										),
									} )
								}
							/>
						</Field>
					) }
					{ ROUNDABLE_SHAPES.includes( layer.shape ) &&
						shapeRadiusNow > 0 && (
							<SliderRow
								label={ __( 'Smoothing', 'wunderpaint' ) }
								min={ 0 }
								max={ 100 }
								value={ Math.round(
									( layer.cornerSmoothing || 0 ) * 100
								) }
								display={
									Math.round(
										( layer.cornerSmoothing || 0 ) * 100
									) + '%'
								}
								onChange={ ( v ) =>
									up( { cornerSmoothing: v / 100 } )
								}
							/>
						) }
					{ 'star' === layer.shape && (
						<SliderRow
							label={ __( 'Waist', 'wunderpaint' ) }
							min={ 5 }
							max={ 95 }
							def={ 45 }
							value={ Math.round(
								( layer.innerRatio ?? 0.45 ) * 100
							) }
							display={
								Math.round(
									( layer.innerRatio ?? 0.45 ) * 100
								) + '%'
							}
							onChange={ ( v ) => up( { innerRatio: v / 100 } ) }
						/>
					) }
					{ [ 'polygon', 'star' ].includes( layer.shape ) && (
						<Field
							label={
								'star' === layer.shape
									? __( 'Points', 'wunderpaint' )
									: __( 'Sides', 'wunderpaint' )
							}
						>
							<input
								type="number"
								min="3"
								max="24"
								value={ layer.sides || 6 }
								onChange={ ( e ) =>
									up( {
										sides: Math.max(
											3,
											num( e.target.value )
										),
									} )
								}
							/>
						</Field>
					) }
				</PanelGroup>
			) }
		</PanelSection>
	);
}

// Character-level keys that style the SELECTION while a rich-text edit
// session is open (v1.46), mapped to the span-style names.
const CHAR_SELECTION_KEYS = {
	fontFamily: 'family',
	fontSize: 'size',
	weight: 'weight',
	color: 'color',
	letterSpacing: 'ls',
	italic: 'italic',
	underline: 'underline',
	mark: 'mark',
};

function CharacterSection( { layer, extras } ) {
	const { dispatch, commit } = useEditor();
	const selStyle = useSelectionStyle( extras );
	const up = ( patch ) => {
		const rt = extras?.richText?.current;
		const keys = Object.keys( patch );
		if (
			rt &&
			keys.length &&
			keys.every( ( k ) => CHAR_SELECTION_KEYS[ k ] )
		) {
			const sp = {};
			keys.forEach( ( k ) => {
				sp[ CHAR_SELECTION_KEYS[ k ] ] = patch[ k ];
			} );
			rt.applyStyle( sp );
			return;
		}
		dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
		commit( __( 'Edit text style', 'wunderpaint' ) );
	};
	// While editing, the controls mirror the selection's style.
	const eff = {
		fontFamily: selStyle?.family ?? layer.fontFamily,
		fontSize: selStyle?.size ?? layer.fontSize,
		weight: selStyle?.weight ?? layer.weight,
		color: selStyle?.color ?? layer.color,
		letterSpacing: selStyle?.ls ?? ( layer.letterSpacing || 0 ),
		italic: selStyle ? !! selStyle.italic : !! layer.italic,
		underline: selStyle ? !! selStyle.underline : !! layer.underline,
	};
	return (
		<PanelSection
			wsKey="props.character"
			title={ __( 'Character', 'wunderpaint' ) }
		>
			<Field label={ __( 'Text', 'wunderpaint' ) } alignTop>
				<textarea
					value={ layer.text }
					rows={ 2 }
					style={ {
						width: '100%',
						padding: 4,
						border: '1px solid var(--ed-border-strong)',
						borderRadius: 3,
						background: 'var(--ed-panel-alt)',
						color: 'var(--ed-text)',
						fontSize: 12,
						fontFamily: 'var(--font-ui)',
						resize: 'vertical',
					} }
					onChange={ ( e ) => up( { text: e.target.value } ) }
				/>
			</Field>
			<PanelGroup title={ __( 'Font', 'wunderpaint' ) }>
				<Field label={ __( 'Font', 'wunderpaint' ) }>
					<FontPicker
						value={ eff.fontFamily }
						width="100%"
						onChange={ ( fontFamily ) => up( { fontFamily } ) }
					/>
				</Field>
				<div className="row2">
					<Field
						label={ __( 'Size', 'wunderpaint' ) }
						cols="70px 1fr"
						scrub={ {
							value: Math.round( eff.fontSize ),
							min: 4,
							max: 800,
							onScrub: ( v ) => up( { fontSize: v } ),
						} }
					>
						<input
							type="number"
							value={ Math.round( eff.fontSize ) }
							onChange={ ( e ) =>
								up( {
									fontSize: Math.max(
										4,
										num( e.target.value )
									),
								} )
							}
						/>
					</Field>
					<Field
						label={ __( 'Weight', 'wunderpaint' ) }
						cols="52px 1fr"
					>
						<select
							value={ eff.weight }
							onChange={ ( e ) =>
								up( { weight: +e.target.value } )
							}
						>
							{ FONT_WEIGHTS.map( ( w ) => (
								<option key={ w } value={ w }>
									{ w }
								</option>
							) ) }
						</select>
					</Field>
				</div>
				<Field label={ __( 'Style', 'wunderpaint' ) }>
					<div
						style={ {
							display: 'grid',
							gridTemplateColumns: 'repeat(4,1fr)',
							gap: 2,
						} }
					>
						{ [
							[
								'bold',
								__( 'Bold', 'wunderpaint' ),
								I.bold,
								layer.weight >= 700,
								() =>
									up( {
										weight: layer.weight >= 700 ? 400 : 700,
									} ),
							],
							[
								'italic',
								__( 'Italic', 'wunderpaint' ),
								I.italic,
								!! layer.italic,
								() => up( { italic: ! layer.italic } ),
							],
							[
								'underline',
								__( 'Underline', 'wunderpaint' ),
								I.underline,
								!! layer.underline,
								() => up( { underline: ! layer.underline } ),
							],
							[
								'uppercase',
								__( 'Uppercase', 'wunderpaint' ),
								I.caseUpper,
								'uppercase' === layer.textTransform,
								() =>
									up( {
										textTransform:
											'uppercase' === layer.textTransform
												? ''
												: 'uppercase',
									} ),
							],
						].map( ( [ id, label, icon, active, onClick ] ) => (
							<button
								key={ id }
								title={ label }
								aria-label={ label }
								style={ fmtBtn( active ) }
								onClick={ onClick }
							>
								{ icon( { size: 14 } ) }
							</button>
						) ) }
					</div>
				</Field>
				<Field label={ __( 'Alignment', 'wunderpaint' ) }>
					<div style={ { display: 'flex', gap: 6 } }>
						<div
							style={ {
								display: 'grid',
								gridTemplateColumns: `repeat(${
									layer.fixedWidth ? 4 : 3
								},1fr)`,
								gap: 2,
								flex: 1,
							} }
						>
							{ [
								[
									'left',
									__( 'Align left', 'wunderpaint' ),
									I.alignL,
								],
								[
									'center',
									__( 'Align center', 'wunderpaint' ),
									I.alignC,
								],
								[
									'right',
									__( 'Align right', 'wunderpaint' ),
									I.alignR,
								],
								// Justify only fills a fixed box; point text has nothing to stretch to.
								...( layer.fixedWidth
									? [
											[
												'justify',
												__( 'Justify', 'wunderpaint' ),
												I.alignJustify,
											],
									  ]
									: [] ),
							].map( ( [ align, label, icon ] ) => (
								<button
									key={ align }
									aria-label={ label }
									title={ label }
									style={ fmtBtn( layer.align === align ) }
									onClick={ () => up( { align } ) }
								>
									{ icon( { size: 14 } ) }
								</button>
							) ) }
						</div>
						<div
							style={ {
								display: 'grid',
								gridTemplateColumns: 'repeat(3,1fr)',
								gap: 2,
								flex: 1,
							} }
						>
							{ [
								[
									'top',
									__( 'Align top', 'wunderpaint' ),
									I.valignT,
								],
								[
									'middle',
									__( 'Align middle', 'wunderpaint' ),
									I.valignM,
								],
								[
									'bottom',
									__( 'Align bottom', 'wunderpaint' ),
									I.valignB,
								],
							].map( ( [ valign, label, icon ] ) => (
								<button
									key={ valign }
									aria-label={ label }
									title={ label }
									style={ fmtBtn(
										( layer.valign ||
											( layer.fixedWidth
												? 'top'
												: 'middle' ) ) === valign
									) }
									onClick={ () => up( { valign } ) }
								>
									{ icon( { size: 14 } ) }
								</button>
							) ) }
						</div>
					</div>
				</Field>
				<Field label={ __( 'List', 'wunderpaint' ) }>
					<div
						style={ {
							display: 'grid',
							gridTemplateColumns: 'repeat(3,1fr)',
							gap: 2,
							width: 100,
						} }
					>
						{ [
							[ '', __( 'No list', 'wunderpaint' ), '\u2013' ],
							[
								'bullet',
								__( 'Bullet list', 'wunderpaint' ),
								'\u2022',
							],
							[
								'number',
								__( 'Numbered list', 'wunderpaint' ),
								'1.',
							],
						].map( ( [ val, label, glyph ] ) => (
							<button
								key={ label }
								aria-label={ label }
								title={ label }
								style={ {
									...fmtBtn(
										( layer.listStyle || '' ) === val
									),
									fontSize: 12,
									fontWeight: 700,
								} }
								onClick={ () =>
									up( { listStyle: val || null } )
								}
							>
								{ glyph }
							</button>
						) ) }
					</div>
				</Field>
			</PanelGroup>
			<PanelGroup title={ __( 'Fill', 'wunderpaint' ) }>
				<Field label={ __( 'Type', 'wunderpaint' ) }>
					<SegToggle
						value={ layer.fillType || 'solid' }
						options={ [
							[ 'solid', __( 'Solid', 'wunderpaint' ) ],
							[ 'gradient', __( 'Gradient', 'wunderpaint' ) ],
							[ 'pattern', __( 'Pattern', 'wunderpaint' ) ],
						] }
						onChange={ ( id ) =>
							up( {
								fillType: id,
								...( 'gradient' === id && ! layer.gradientStops
									? {
											gradientStops: [
												{
													color:
														layer.color ||
														'#3b66ff',
													at: 0,
												},
												{ color: '#ff6a00', at: 1 },
											],
									  }
									: {} ),
								...( 'pattern' === id &&
								( ! layer.pattern || 'none' === layer.pattern )
									? { pattern: 'dots' }
									: {} ),
							} )
						}
					/>
				</Field>
				{ 'gradient' === ( layer.fillType || 'solid' ) && (
					<GradientFillControls layer={ layer } up={ up } />
				) }
				{ 'pattern' === ( layer.fillType || 'solid' ) && (
					<>
						<Field label={ __( 'Pattern', 'wunderpaint' ) }>
							<PatternSelect
								value={ layer.pattern }
								patternData={ layer.patternData }
								extras={ extras }
								onChange={ ( pattern, patternData ) =>
									up( {
										pattern:
											'none' === pattern
												? 'dots'
												: pattern,
										patternData,
									} )
								}
							/>
						</Field>
						<SliderRow
							label={ __( 'Pattern scale', 'wunderpaint' ) }
							min={ 10 }
							max={ 400 }
							def={ 100 }
							value={ Math.round(
								( layer.patternScale || 1 ) * 100
							) }
							display={
								Math.round(
									( layer.patternScale || 1 ) * 100
								) + '%'
							}
							onChange={ ( v ) =>
								up( { patternScale: v / 100 } )
							}
						/>
					</>
				) }
				<Field label={ __( 'Color', 'wunderpaint' ) }>
					<div
						style={ {
							display: 'flex',
							gap: 6,
							alignItems: 'center',
						} }
					>
						<SwatchButton
							color={ eff.color }
							onChange={ ( c ) => up( { color: c } ) }
						/>
						<input
							type="text"
							value={ eff.color }
							onChange={ ( e ) =>
								up( { color: e.target.value } )
							}
						/>
					</div>
				</Field>
			</PanelGroup>
			<PanelGroup title={ __( 'Spacing', 'wunderpaint' ) }>
				<SliderRow
					label={ __( 'Tracking', 'wunderpaint' ) }
					min={ -10 }
					max={ 40 }
					value={ eff.letterSpacing }
					onChange={ ( v ) => up( { letterSpacing: v } ) }
				/>
				<SliderRow
					label={ __( 'Line height', 'wunderpaint' ) }
					min={ 0.7 }
					max={ 2.5 }
					step={ 0.05 }
					value={ layer.lineHeight || 1.05 }
					onChange={ ( v ) => up( { lineHeight: v } ) }
				/>
			</PanelGroup>
			<PanelGroup title={ __( 'Curve & Path', 'wunderpaint' ) }>
				{ ! layer.textPath && (
					<SliderRow
						label={ __( 'Curve', 'wunderpaint' ) }
						min={ -100 }
						max={ 100 }
						value={ layer.curve || 0 }
						onChange={ ( v ) => up( { curve: v } ) }
					/>
				) }
				{ layer.textPath && (
					<>
						<SliderRow
							label={ __( 'Path start', 'wunderpaint' ) }
							min={ -100 }
							max={ 100 }
							value={ layer.textPath.start || 0 }
							onChange={ ( v ) =>
								up( {
									textPath: { ...layer.textPath, start: v },
								} )
							}
						/>
						<Field label={ __( 'Text path', 'wunderpaint' ) }>
							<div
								style={ {
									display: 'flex',
									gap: 6,
									flexWrap: 'wrap',
								} }
							>
								<button
									className="ai-btn secondary"
									onClick={ () =>
										up( {
											textPath: {
												...layer.textPath,
												flip: ! layer.textPath.flip,
											},
										} )
									}
								>
									{ __( 'Reverse direction', 'wunderpaint' ) }
								</button>
								<button
									className="ai-btn secondary"
									onClick={ () => up( { textPath: null } ) }
								>
									{ __( 'Detach from path', 'wunderpaint' ) }
								</button>
							</div>
						</Field>
					</>
				) }
			</PanelGroup>
			<PanelGroup title={ __( 'Decorations', 'wunderpaint' ) }>
				<Field label={ __( 'Outline', 'wunderpaint' ) }>
					<div
						style={ {
							display: 'flex',
							gap: 6,
							alignItems: 'center',
						} }
					>
						<SwatchButton
							color={ layer.outlineColor || 'transparent' }
							title={ __( 'Outline color', 'wunderpaint' ) }
							onChange={ ( c ) =>
								up( {
									outlineColor: c,
									outlineW:
										layer.outlineW ||
										Math.max(
											2,
											Math.round( layer.fontSize / 12 )
										),
								} )
							}
						/>
						<input
							type="number"
							min="0"
							max="60"
							value={ layer.outlineW || 0 }
							style={ { width: 52 } }
							onChange={ ( e ) =>
								up( {
									outlineW: Math.max(
										0,
										num( e.target.value )
									),
								} )
							}
						/>
						<span
							style={ {
								fontSize: 11,
								color: 'var(--ed-text-muted)',
							} }
						>
							px
						</span>
						<select
							title={ __( 'Stroke style', 'wunderpaint' ) }
							value={ layer.outlineDash || 'solid' }
							style={ { width: 0, flex: 1, minWidth: 64 } }
							onChange={ ( e ) =>
								up( {
									outlineDash:
										'solid' === e.target.value
											? null
											: e.target.value,
								} )
							}
						>
							<option value="solid">
								{ _x( 'Solid', 'stroke style', 'wunderpaint' ) }
							</option>
							<option value="dashed">
								{ __( 'Dashed', 'wunderpaint' ) }
							</option>
							<option value="dotted">
								{ __( 'Dotted', 'wunderpaint' ) }
							</option>
						</select>
					</div>
				</Field>
				{ [ 'dashed', 'dotted' ].includes( layer.outlineDash ) && (
					<Field label={ __( 'Dash', 'wunderpaint' ) }>
						<div
							style={ {
								display: 'flex',
								gap: 6,
								alignItems: 'center',
							} }
						>
							{ 'dashed' === layer.outlineDash && (
								<input
									type="number"
									min="1"
									title={ __( 'Dash', 'wunderpaint' ) }
									value={ Math.round(
										layer.outlineDashLen ??
											dashDefaults(
												'dashed',
												layer.outlineW
											).len
									) }
									style={ { width: 52 } }
									onChange={ ( e ) =>
										up( {
											outlineDashLen: Math.max(
												1,
												num( e.target.value )
											),
										} )
									}
								/>
							) }
							<span
								style={ {
									fontSize: 11,
									color: 'var(--ed-text-muted)',
								} }
							>
								{ __( 'Gap', 'wunderpaint' ) }
							</span>
							<input
								type="number"
								min="1"
								title={ __( 'Gap', 'wunderpaint' ) }
								value={ Math.round(
									layer.outlineDashGap ??
										dashDefaults(
											layer.outlineDash,
											layer.outlineW
										).gap
								) }
								style={ { width: 52 } }
								onChange={ ( e ) =>
									up( {
										outlineDashGap: Math.max(
											1,
											num( e.target.value )
										),
									} )
								}
							/>
						</div>
					</Field>
				) }
				<Field label={ __( 'Marker', 'wunderpaint' ) }>
					<div
						style={ {
							display: 'flex',
							gap: 6,
							alignItems: 'center',
						} }
					>
						<SwatchButton
							color={
								selStyle
									? selStyle.mark || 'transparent'
									: layer.textFX?.marker?.color ||
									  'transparent'
							}
							title={ __( 'Marker color', 'wunderpaint' ) }
							onChange={ ( c ) => {
								const rt = extras?.richText?.current;
								if ( rt && selStyle ) {
									rt.applyStyle( { mark: c } );
									return;
								}
								up( {
									textFX: {
										...( layer.textFX || {} ),
										marker: {
											...( layer.textFX?.marker || {
												rough: 4,
												seed: 1,
											} ),
											color: c,
										},
									},
								} );
							} }
						/>
						{ ( selStyle
							? !! selStyle.mark
							: !! layer.textFX?.marker ) && (
							<button
								className="ai-btn secondary"
								style={ { padding: '2px 8px', fontSize: 11 } }
								onClick={ () => {
									const rt = extras?.richText?.current;
									if ( rt && selStyle ) {
										rt.applyStyle( { mark: null } );
										return;
									}
									up( {
										textFX: {
											...( layer.textFX || {} ),
											marker: null,
										},
									} );
								} }
							>
								{ __( 'Remove', 'wunderpaint' ) }
							</button>
						) }
						<span
							style={ {
								fontSize: 11,
								color: 'var(--ed-text-muted)',
							} }
						>
							{ selStyle
								? __(
										'Marks the selected words.',
										'wunderpaint'
								  )
								: __(
										'Marks whole lines. Select words while editing to mark only them.',
										'wunderpaint'
								  ) }
						</span>
					</div>
				</Field>
				<Field label={ __( 'Shadow', 'wunderpaint' ) }>
					<div
						style={ {
							display: 'flex',
							gap: 6,
							alignItems: 'center',
						} }
					>
						<input
							type="checkbox"
							checked={ !! layer.shadowOn }
							aria-label={ __( 'Text shadow', 'wunderpaint' ) }
							onChange={ ( e ) =>
								up( { shadowOn: e.target.checked } )
							}
						/>
						<SwatchButton
							color={ layer.shadowColor || '#000000' }
							title={ __( 'Shadow color', 'wunderpaint' ) }
							onChange={ ( c ) =>
								up( { shadowColor: c, shadowOn: true } )
							}
						/>
					</div>
				</Field>
				<Field label={ __( 'Background', 'wunderpaint' ) }>
					<div
						style={ {
							display: 'flex',
							gap: 6,
							alignItems: 'center',
						} }
					>
						<SwatchButton
							color={ layer.bgColor || 'transparent' }
							title={ __(
								'Background pill color',
								'wunderpaint'
							) }
							onChange={ ( c ) => up( { bgColor: c } ) }
						/>
						<button
							className="ai-btn secondary"
							style={ { padding: '2px 8px', fontSize: 11 } }
							disabled={ ! layer.bgColor }
							onClick={ () => up( { bgColor: null } ) }
						>
							{ __( 'None', 'wunderpaint' ) }
						</button>
						<input
							type="number"
							min="0"
							max="60"
							value={ layer.bgRadius ?? 8 }
							style={ { width: 52 } }
							title={ __( 'Corner radius', 'wunderpaint' ) }
							onChange={ ( e ) =>
								up( {
									bgRadius: Math.max(
										0,
										num( e.target.value )
									),
								} )
							}
						/>
					</div>
				</Field>
				{ layer.rasterFallback && (
					<label
						style={ {
							display: 'flex',
							gap: 6,
							fontSize: 11,
							color: 'var(--ed-text-dim)',
							padding: '4px 0',
						} }
					>
						<input
							type="checkbox"
							checked={ !! layer.useRasterFallback }
							onChange={ () =>
								up( {
									useRasterFallback:
										! layer.useRasterFallback,
								} )
							}
						/>
						{ __(
							'Show original rasterized look (PSD import)',
							'wunderpaint'
						) }
					</label>
				) }
			</PanelGroup>
		</PanelSection>
	);
}

function GradientSection( { layer } ) {
	const { dispatch, commit } = useEditor();
	const up = ( patch ) => {
		dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
		commit( __( 'Edit gradient', 'wunderpaint' ) );
	};
	// The gradient direction is stored as from/to points; expose it as an angle
	// (like text/shape gradient fills) for linear gradients.
	const gradAngle = () => {
		const fx = layer.from?.x ?? layer.x;
		const fy = layer.from?.y ?? layer.y;
		const tx = layer.to?.x ?? layer.x + layer.w;
		const ty = layer.to?.y ?? layer.y + layer.h;
		const a = Math.round(
			( Math.atan2( ty - fy, tx - fx ) * 180 ) / Math.PI
		);
		return a < 0 ? a + 360 : a;
	};
	const setGradAngle = ( deg ) => {
		const rad = ( deg * Math.PI ) / 180;
		const cx = layer.x + layer.w / 2;
		const cy = layer.y + layer.h / 2;
		const half =
			( Math.abs( layer.w * Math.cos( rad ) ) +
				Math.abs( layer.h * Math.sin( rad ) ) ) /
			2;
		const dx = Math.cos( rad ) * half;
		const dy = Math.sin( rad ) * half;
		up( {
			from: { x: Math.round( cx - dx ), y: Math.round( cy - dy ) },
			to: { x: Math.round( cx + dx ), y: Math.round( cy + dy ) },
		} );
	};
	// Radial gradients (the template vignettes!) store center + radius as
	// from/to points; expose them as sliders (v1.256.0) - before, a
	// radial layer had no way to adjust its reach or center in the UI.
	const radial = 'radial' === layer.kind;
	const radialR = () => {
		const fx = layer.from?.x ?? layer.x + layer.w / 2;
		const fy = layer.from?.y ?? layer.y + layer.h / 2;
		const tx = layer.to?.x ?? layer.x + layer.w;
		const ty = layer.to?.y ?? fy;
		return Math.max( 1, Math.hypot( tx - fx, ty - fy ) );
	};
	const setRadial = ( part ) => {
		const cx =
			part.cx ??
			( ( layer.from?.x ?? layer.x + layer.w / 2 ) - layer.x ) / layer.w;
		const cy =
			part.cy ??
			( ( layer.from?.y ?? layer.y + layer.h / 2 ) - layer.y ) / layer.h;
		const r = part.r ?? radialR();
		const fx = layer.x + cx * layer.w;
		const fy = layer.y + cy * layer.h;
		up( {
			from: { x: Math.round( fx ), y: Math.round( fy ) },
			to: { x: Math.round( fx + r ), y: Math.round( fy ) },
		} );
	};
	const maxR = Math.ceil( Math.hypot( layer.w || 1, layer.h || 1 ) );
	return (
		<PanelSection
			wsKey="props.gradient"
			title={ __( 'Gradient', 'wunderpaint' ) }
		>
			<Field label={ __( 'Kind', 'wunderpaint' ) }>
				<select
					value={ layer.kind }
					onChange={ ( e ) => up( { kind: e.target.value } ) }
				>
					<option value="linear">
						{ __( 'Linear', 'wunderpaint' ) }
					</option>
					<option value="radial">
						{ __( 'Radial', 'wunderpaint' ) }
					</option>
					<option value="angle">
						{ __( 'Angle', 'wunderpaint' ) }
					</option>
				</select>
			</Field>
			{ radial && (
				<>
					<Field label={ __( 'Size', 'wunderpaint' ) }>
						<input
							type="range"
							min="1"
							max={ maxR }
							value={ Math.round( radialR() ) }
							onChange={ ( e ) =>
								setRadial( { r: +e.target.value } )
							}
						/>
						<span style={ { minWidth: 34, textAlign: 'right' } }>
							{ Math.round( ( radialR() / maxR ) * 100 ) }%
						</span>
					</Field>
					<Field label={ __( 'Center X', 'wunderpaint' ) }>
						<input
							type="range"
							min="0"
							max="100"
							value={ Math.round(
								( ( ( layer.from?.x ?? layer.x + layer.w / 2 ) -
									layer.x ) /
									( layer.w || 1 ) ) *
									100
							) }
							onChange={ ( e ) =>
								setRadial( { cx: +e.target.value / 100 } )
							}
						/>
					</Field>
					<Field label={ __( 'Center Y', 'wunderpaint' ) }>
						<input
							type="range"
							min="0"
							max="100"
							value={ Math.round(
								( ( ( layer.from?.y ?? layer.y + layer.h / 2 ) -
									layer.y ) /
									( layer.h || 1 ) ) *
									100
							) }
							onChange={ ( e ) =>
								setRadial( { cy: +e.target.value / 100 } )
							}
						/>
					</Field>
				</>
			) }
			{ 'linear' === layer.kind && (
				<Field label={ __( 'Angle', 'wunderpaint' ) }>
					<input
						type="range"
						min="0"
						max="360"
						value={ gradAngle() }
						onChange={ ( e ) => setGradAngle( +e.target.value ) }
					/>
					<span style={ { minWidth: 34, textAlign: 'right' } }>
						{ gradAngle() }°
					</span>
				</Field>
			) }
			<div style={ { margin: '8px 0' } }>
				<GradientBar
					stops={ layer.stops }
					onChange={ ( stops ) => up( { stops } ) }
				/>
			</div>
			<button
				className="ai-btn secondary"
				onClick={ () =>
					up( {
						stops: layer.stops
							.map( ( s ) => ( { ...s, at: 1 - s.at } ) )
							.sort( ( a, b ) => a.at - b.at ),
					} )
				}
			>
				{ I.swap( { size: 13 } ) } { __( 'Reverse', 'wunderpaint' ) }
			</button>
		</PanelSection>
	);
}

function SmartObjectSection( { layer, extras } ) {
	const editor = useEditor();
	const { dispatch, commit } = editor;
	const filters = layer.smartFilters || [];

	const updateFilters = ( smartFilters, label ) => {
		dispatch( {
			type: 'UPDATE_LAYER',
			id: layer.id,
			patch: { smartFilters },
		} );
		commit( label );
	};

	return (
		<PanelSection
			wsKey="props.smart"
			title={ __( 'Smart Object', 'wunderpaint' ) }
		>
			<div
				style={ {
					fontSize: 11,
					color: 'var(--ed-text-muted)',
					marginBottom: 8,
				} }
			>
				{ layer.srcW }×{ layer.srcH } ·{ ' ' }
				{ 'psd' === layer.embedded?.kind
					? 'PSD'
					: __( 'Image', 'wunderpaint' ) }
				{ layer.embedded?.bytes
					? ' · ' + __( 'original embedded', 'wunderpaint' )
					: '' }
			</div>
			<div
				style={ {
					fontSize: 10,
					color: 'var(--ed-text-muted)',
					textTransform: 'uppercase',
					letterSpacing: 0.5,
					margin: '8px 0 4px',
				} }
			>
				{ __( 'Smart Filters', 'wunderpaint' ) }
			</div>
			{ filters.map( ( sf, i ) => {
				const def = effectById( sf.id );
				return (
					<div
						key={ sf.uid || i }
						style={ {
							display: 'flex',
							alignItems: 'center',
							gap: 4,
							padding: '3px 0',
							fontSize: 12,
						} }
					>
						<input
							type="checkbox"
							checked={ sf.enabled }
							aria-label={ __( 'Toggle filter', 'wunderpaint' ) }
							onChange={ () =>
								updateFilters(
									filters.map( ( f, j ) =>
										j === i
											? { ...f, enabled: ! f.enabled }
											: f
									),
									__( 'Toggle Smart Filter', 'wunderpaint' )
								)
							}
						/>
						<span
							style={ { flex: 1, opacity: sf.enabled ? 1 : 0.5 } }
						>
							{ def?.label || sf.id }
						</span>
						<button
							className="icon-btn"
							title={ __( 'Move up', 'wunderpaint' ) }
							disabled={ 0 === i }
							onClick={ () => {
								const next = [ ...filters ];
								[ next[ i - 1 ], next[ i ] ] = [
									next[ i ],
									next[ i - 1 ],
								];
								updateFilters(
									next,
									__( 'Reorder Smart Filters', 'wunderpaint' )
								);
							} }
						>
							{ I.arrUp( { size: 12 } ) }
						</button>
						<button
							className="icon-btn"
							title={ __( 'Remove', 'wunderpaint' ) }
							onClick={ () =>
								updateFilters(
									filters.filter( ( _, j ) => j !== i ),
									__( 'Remove Smart Filter', 'wunderpaint' )
								)
							}
						>
							{ I.close( { size: 12 } ) }
						</button>
					</div>
				);
			} ) }
			<Field label={ __( 'Add', 'wunderpaint' ) }>
				<select
					value=""
					onChange={ ( e ) => {
						if ( e.target.value ) {
							updateFilters(
								[
									...filters,
									{
										id: e.target.value,
										params: defaultParamsFor(
											e.target.value
										),
										enabled: true,
										uid: Math.random()
											.toString( 36 )
											.slice( 2 ),
									},
								],
								__( 'Add Smart Filter', 'wunderpaint' )
							);
						}
					} }
				>
					<option value="">{ __( 'Filter', 'wunderpaint' ) }</option>
					{ [ ...EFFECTS, ...listExtensionEffects() ]
						.filter( ( e ) => ! e.hidden )
						.map( ( e ) => (
							<option key={ e.id } value={ e.id }>
								{ e.label }
							</option>
						) ) }
				</select>
			</Field>
			<div
				style={ {
					display: 'flex',
					gap: 4,
					marginTop: 8,
					flexWrap: 'wrap',
				} }
			>
				<button
					className="ai-btn secondary"
					onClick={ () =>
						extras.smartObject?.editContents?.( layer )
					}
				>
					{ __( 'Edit Contents', 'wunderpaint' ) }
				</button>
				<button
					className="ai-btn secondary"
					onClick={ () =>
						extras.smartObject?.replaceContents?.( layer )
					}
				>
					{ __( 'Replace…', 'wunderpaint' ) }
				</button>
				<button
					className="ai-btn secondary"
					onClick={ () => Ops.rasterizeLayerOp( editor ) }
				>
					{ __( 'Rasterize', 'wunderpaint' ) }
				</button>
			</div>
		</PanelSection>
	);
}

/* --------------------------- Blending Options --------------------------- */

const STYLE_DEFAULTS = {
	stroke: { size: 3, color: '#000000', position: 'outside', opacity: 1 },
	dropShadow: {
		color: '#000000',
		opacity: 0.5,
		angle: 120,
		distance: 6,
		blur: 8,
		spread: 0,
	},
	innerShadow: {
		color: '#000000',
		opacity: 0.5,
		angle: 120,
		distance: 4,
		blur: 6,
	},
	outerGlow: { color: '#ffef9e', opacity: 0.8, blur: 12, spread: 0 },
	colorOverlay: { color: '#3b66ff', opacity: 0.6 },
	innerGlow: { color: '#ffef9e', opacity: 0.8, blur: 10 },
	bevel: { size: 4, strength: 0.6, direction: 'up' },
	satin: { color: '#000000', opacity: 0.4, angle: 45, distance: 8, blur: 8 },
	patternOverlay: {
		pattern: 'dots',
		color: '#000000',
		opacity: 0.35,
		scale: 1,
	},
	gradientOverlay: {
		stops: [
			{ color: '#3b66ff', at: 0 },
			{ color: '#8b5cf6', at: 1 },
		],
		angle: 90,
		opacity: 0.8,
		kind: 'linear',
	},
};

const STYLE_LABELS = {
	stroke: __( 'Stroke', 'wunderpaint' ),
	dropShadow: __( 'Drop Shadow', 'wunderpaint' ),
	innerShadow: __( 'Inner Shadow', 'wunderpaint' ),
	outerGlow: __( 'Outer Glow', 'wunderpaint' ),
	colorOverlay: __( 'Color Overlay', 'wunderpaint' ),
	innerGlow: __( 'Inner Glow', 'wunderpaint' ),
	bevel: __( 'Bevel & Emboss', 'wunderpaint' ),
	satin: __( 'Satin', 'wunderpaint' ),
	patternOverlay: __( 'Pattern Overlay', 'wunderpaint' ),
	gradientOverlay: __( 'Gradient Overlay', 'wunderpaint' ),
};

function StyleParams( { value, onChange, extras } ) {
	const set = ( key, v ) => onChange( { ...value, [ key ]: v } );
	return (
		<div style={ { padding: '2px 0 6px 20px' } }>
			{ 'color' in value && (
				<Field label={ __( 'Color', 'wunderpaint' ) }>
					<SwatchButton
						color={ value.color }
						onChange={ ( c ) => set( 'color', c ) }
					/>
				</Field>
			) }
			{ 'stops' in value && (
				<GradientBar
					stops={ value.stops }
					onChange={ ( stops ) => set( 'stops', stops ) }
					width={ 200 }
				/>
			) }
			{ 'opacity' in value && (
				<SliderRow
					def={ 100 }
					label={ __( 'Opacity', 'wunderpaint' ) }
					min={ 0 }
					max={ 100 }
					value={ Math.round( value.opacity * 100 ) }
					display={ Math.round( value.opacity * 100 ) + '%' }
					onChange={ ( v ) => set( 'opacity', v / 100 ) }
				/>
			) }
			{ 'size' in value && (
				<SliderRow
					label={ __( 'Size', 'wunderpaint' ) }
					min={ 1 }
					max={ 100 }
					value={ value.size }
					onChange={ ( v ) => set( 'size', v ) }
				/>
			) }
			{ 'position' in value && (
				<Field label={ __( 'Position', 'wunderpaint' ) }>
					<select
						value={ value.position }
						onChange={ ( e ) => set( 'position', e.target.value ) }
					>
						<option value="outside">
							{ __( 'Outside', 'wunderpaint' ) }
						</option>
						<option value="center">
							{ __( 'Center', 'wunderpaint' ) }
						</option>
						<option value="inside">
							{ __( 'Inside', 'wunderpaint' ) }
						</option>
					</select>
				</Field>
			) }
			{ 'angle' in value && (
				<SliderRow
					label={ __( 'Angle', 'wunderpaint' ) }
					min={ -180 }
					max={ 180 }
					value={ value.angle }
					display={ value.angle + '°' }
					onChange={ ( v ) => set( 'angle', v ) }
				/>
			) }
			{ 'distance' in value && (
				<SliderRow
					label={ __( 'Distance', 'wunderpaint' ) }
					min={ 0 }
					max={ 60 }
					value={ value.distance }
					onChange={ ( v ) => set( 'distance', v ) }
				/>
			) }
			{ 'blur' in value && (
				<SliderRow
					label={ __( 'Blur', 'wunderpaint' ) }
					min={ 0 }
					max={ 60 }
					value={ value.blur }
					onChange={ ( v ) => set( 'blur', v ) }
				/>
			) }
			{ 'spread' in value && (
				<SliderRow
					label={ __( 'Spread', 'wunderpaint' ) }
					min={ 0 }
					max={ 40 }
					value={ value.spread || 0 }
					onChange={ ( v ) => set( 'spread', v ) }
				/>
			) }
			{ 'strength' in value && (
				<SliderRow
					label={ __( 'Strength', 'wunderpaint' ) }
					min={ 5 }
					max={ 100 }
					value={ Math.round( value.strength * 100 ) }
					display={ Math.round( value.strength * 100 ) + '%' }
					onChange={ ( v ) => set( 'strength', v / 100 ) }
				/>
			) }
			{ 'direction' in value && (
				<Field label={ __( 'Direction', 'wunderpaint' ) }>
					<select
						value={ value.direction }
						onChange={ ( e ) => set( 'direction', e.target.value ) }
					>
						<option value="up">
							{ __( 'Up (raised)', 'wunderpaint' ) }
						</option>
						<option value="down">
							{ __( 'Down (recessed)', 'wunderpaint' ) }
						</option>
					</select>
				</Field>
			) }
			{ 'pattern' in value && (
				<Field label={ __( 'Pattern', 'wunderpaint' ) }>
					<PatternSelect
						value={ value.pattern }
						patternData={ value.patternData }
						extras={ extras }
						onChange={ ( pattern, patternData ) =>
							onChange( {
								...value,
								pattern: 'none' === pattern ? 'dots' : pattern,
								patternData,
							} )
						}
					/>
				</Field>
			) }
			{ 'scale' in value && (
				<SliderRow
					label={ __( 'Scale', 'wunderpaint' ) }
					min={ 1 }
					max={ 6 }
					value={ value.scale || 1 }
					display={ ( value.scale || 1 ) + '×' }
					onChange={ ( v ) => set( 'scale', v ) }
				/>
			) }
		</div>
	);
}

export function BlendingOptionsSection( { layer, extras } ) {
	const { dispatch, commit } = useEditor();
	const styles = layer.styles || {};

	const setStyle = ( kind, value, label ) => {
		dispatch( {
			type: 'UPDATE_LAYER',
			id: layer.id,
			patch: {
				styles: {
					stroke: null,
					dropShadow: null,
					innerShadow: null,
					outerGlow: null,
					colorOverlay: null,
					gradientOverlay: null,
					innerGlow: null,
					bevel: null,
					satin: null,
					patternOverlay: null,
					...styles,
					[ kind ]: value,
				},
			},
		} );
		commit( label );
	};

	return (
		<PanelSection
			wsKey="props.blending"
			title={ __( 'Blending Options', 'wunderpaint' ) }
		>
			{ /* Pick the styles in a compact grid; each active style then
			     edits below under its own caption. Before, the parameters
			     were wedged between the checkboxes and pushed the rest of
			     the list around while you worked (v1.373). */ }
			<div className="blend-grid">
				{ Object.keys( STYLE_DEFAULTS ).map( ( kind ) => (
					<label key={ kind } className="blend-check">
						<input
							type="checkbox"
							checked={ !! styles[ kind ] }
							onChange={ () =>
								setStyle(
									kind,
									styles[ kind ]
										? null
										: { ...STYLE_DEFAULTS[ kind ] },
									( styles[ kind ]
										? __( 'Remove style:', 'wunderpaint' )
										: __( 'Add style:', 'wunderpaint' ) ) +
										' ' +
										STYLE_LABELS[ kind ]
								)
							}
						/>
						<span>{ STYLE_LABELS[ kind ] }</span>
					</label>
				) ) }
			</div>
			{ Object.keys( STYLE_DEFAULTS )
				.filter( ( kind ) => !! styles[ kind ] )
				.map( ( kind ) => (
					<PanelGroup key={ kind } title={ STYLE_LABELS[ kind ] }>
						<StyleParams
							kind={ kind }
							value={ styles[ kind ] }
							extras={ extras }
							onChange={ ( v ) =>
								setStyle(
									kind,
									v,
									__( 'Edit style:', 'wunderpaint' ) +
										' ' +
										STYLE_LABELS[ kind ]
								)
							}
						/>
					</PanelGroup>
				) ) }
		</PanelSection>
	);
}

/* --------------------------- Align & Distribute -------------------------- */

function AlignSection() {
	const editor = useEditor();
	// Shared unit-aware ops (v1.66): this section had its own per-layer
	// implementation that tore groups apart; every align/distribute goes
	// through the ONE selection-units path now.
	const align = ( mode ) => Ops.alignLayersOp( editor, mode );
	const distribute = ( horizontal ) =>
		Ops.distributeLayersOp( editor, horizontal );
	const distributable = Ops.canDistribute( editor.state );

	// Icon buttons since v1.9 (were bare L/C/R/T/M/B letters).
	const modes = [
		[ 'L', __( 'Align left', 'wunderpaint' ), I.objAlignL ],
		[ 'C', __( 'Align horizontal centers', 'wunderpaint' ), I.objAlignCH ],
		[ 'R', __( 'Align right', 'wunderpaint' ), I.objAlignR ],
		[ 'T', __( 'Align top', 'wunderpaint' ), I.objAlignT ],
		[ 'M', __( 'Align vertical centers', 'wunderpaint' ), I.objAlignM ],
		[ 'B', __( 'Align bottom', 'wunderpaint' ), I.objAlignB ],
	];

	return (
		<PanelSection
			wsKey="props.align"
			title={ __( 'Align & Distribute', 'wunderpaint' ) }
		>
			<div
				style={ {
					display: 'grid',
					gridTemplateColumns: 'repeat(6,1fr)',
					gap: 2,
				} }
			>
				{ modes.map( ( [ mode, label, icon ] ) => (
					<button
						key={ mode }
						title={ label }
						aria-label={ label }
						style={ {
							height: 26,
							display: 'grid',
							placeItems: 'center',
							background: 'var(--ed-panel-alt)',
							border: '1px solid var(--ed-border)',
							borderRadius: 3,
							color: 'var(--ed-text-dim)',
						} }
						onClick={ () => align( mode ) }
					>
						{ icon( { size: 14 } ) }
					</button>
				) ) }
			</div>
			<div style={ { display: 'flex', gap: 4, marginTop: 6 } }>
				<button
					className="ai-btn secondary"
					style={ {
						flex: 1,
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 6,
					} }
					disabled={ ! distributable }
					title={ __( 'Distribute horizontally', 'wunderpaint' ) }
					onClick={ () => distribute( true ) }
				>
					{ I.distributeH( { size: 14 } ) }{ ' ' }
					{ __( 'Distribute H', 'wunderpaint' ) }
				</button>
				<button
					className="ai-btn secondary"
					style={ {
						flex: 1,
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 6,
					} }
					disabled={ ! distributable }
					title={ __( 'Distribute vertically', 'wunderpaint' ) }
					onClick={ () => distribute( false ) }
				>
					{ I.distributeV( { size: 14 } ) }{ ' ' }
					{ __( 'Distribute V', 'wunderpaint' ) }
				</button>
			</div>
		</PanelSection>
	);
}

/* --------------------------------- panel -------------------------------- */

function ExtensionSection( { section, layer, extras } ) {
	// Extension properties-panel section (v1.119): framework-free DOM
	// mount like registerPanel. Re-mounted per LAYER (id), not per state
	// change — rebuilding controls on every dispatch would break slider
	// drags inside the section. Extensions read live values from
	// editor.state when they need them.
	const editor = useEditor();
	const editorRef = useRef( editor );
	editorRef.current = editor;
	// Always-live editor facade: the section mounts once per layer, so a
	// captured editor snapshot would go stale after the first dispatch.
	const liveEditor = useRef( null );
	if ( ! liveEditor.current ) {
		liveEditor.current = {
			get state() {
				return editorRef.current.state;
			},
			get WPIE() {
				return editorRef.current.WPIE;
			},
			dispatch: ( action ) => editorRef.current.dispatch( action ),
			commit: ( label ) => editorRef.current.commit( label ),
			undo: () => editorRef.current.undo(),
			redo: () => editorRef.current.redo(),
		};
	}
	const ref = useRef( null );
	useEffect( () => {
		const el = ref.current;
		el.innerHTML = '';
		let cleanup;
		try {
			cleanup = section.render( el, {
				editor: liveEditor.current,
				extras,
				layer,
			} );
		} catch ( e ) {
			// eslint-disable-next-line no-console
			console.warn( 'WPIE extension section failed:', section.id, e );
		}
		return () => {
			if ( 'function' === typeof cleanup ) {
				cleanup();
			}
			el.innerHTML = '';
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ section, layer.id ] );
	return (
		<PanelSection title={ section.title }>
			<div ref={ ref } />
		</PanelSection>
	);
}

/**
 * Why-is-nothing-happening banner (v1.365.0): a locked or hidden active
 * layer makes every tool look broken. Name the state and offer the
 * one-click way out - walking the parent chain, so a hiding or locking
 * GROUP is caught and fixed at the group, not the child.
 */
function LayerStateNotice( { layer } ) {
	const { state, dispatch, commit } = useEditor();
	const chain = [ layer ];
	for (
		let g = state.layers.find( ( l ) => l.id === layer.parent );
		g;
		g = state.layers.find( ( l ) => l.id === g.parent )
	) {
		chain.push( g );
	}
	const hidden = chain.find( ( l ) => false === l.visible );
	const locked = chain.find( ( l ) => l.locked );
	if ( ! hidden && ! locked ) {
		return null;
	}
	const fix = ( target, patch, label ) => {
		dispatch( { type: 'UPDATE_LAYER', id: target.id, patch } );
		commit( label );
	};
	return (
		<div className="layer-state-notice">
			{ hidden && (
				<div className="layer-state-row">
					{ I.eye ? I.eye( { size: 13 } ) : null }
					<span>
						{ __( 'This layer is hidden.', 'wunderpaint' ) }
					</span>
					<button
						onClick={ () =>
							fix(
								hidden,
								{ visible: true },
								__( 'Show layer', 'wunderpaint' )
							)
						}
					>
						{ __( 'Show layer', 'wunderpaint' ) }
					</button>
				</div>
			) }
			{ locked && (
				<div className="layer-state-row">
					{ I.lock ? I.lock( { size: 13 } ) : null }
					<span>
						{ __( 'This layer is locked.', 'wunderpaint' ) }
					</span>
					<button
						onClick={ () =>
							fix(
								locked,
								{ locked: false },
								__( 'Unlock layer', 'wunderpaint' )
							)
						}
					>
						{ __( 'Unlock layer', 'wunderpaint' ) }
					</button>
				</div>
			) }
		</div>
	);
}

export function PropertiesPanel( { extras } ) {
	const { state } = useEditor();
	const layer = activeLayerOf( state );
	// Extension sections may register after mount (v1.119).
	const [ , setExtTick ] = useState( 0 );
	useEffect(
		() => subscribeExtensions( () => setExtTick( ( t ) => t + 1 ) ),
		[]
	);
	if ( ! layer ) {
		return (
			<div
				style={ {
					padding: 20,
					color: 'var(--ed-text-muted)',
					fontSize: 12,
					textAlign: 'center',
				} }
			>
				{ __( 'Select a layer to see its properties', 'wunderpaint' ) }
			</div>
		);
	}
	return (
		<Fragment>
			<LayerStateNotice layer={ layer } />
			<TransformSection layer={ layer } />
			{ 'shape' === layer.type && (
				<AppearanceSection layer={ layer } extras={ extras } />
			) }
			{ 'text' === layer.type && (
				<CharacterSection layer={ layer } extras={ extras } />
			) }
			{ 'gradient' === layer.type && <GradientSection layer={ layer } /> }
			{ 'smart' === layer.type && (
				<SmartObjectSection layer={ layer } extras={ extras } />
			) }
			{ ( 'image' === layer.type ||
				( 'raster' === layer.type && !! layer.binding ) ) && (
				<ImageFitSection layer={ layer } />
			) }
			{ ( 'text' === layer.type ||
				'image' === layer.type ||
				'raster' === layer.type ) && (
				<DynamicSection layer={ layer } />
			) }
			<AlignSection />
			{ /* Groups too (v1.118): the renderer applies styles to the
			     group's composited silhouette, Photoshop-style. */ }
			{ 'adjustment' !== layer.type && (
				<BlendingOptionsSection layer={ layer } extras={ extras } />
			) }
			{ listExtensionPanelSections()
				.filter( ( s ) => ! s.when || !! s.when( layer ) )
				.map( ( s ) => (
					<ExtensionSection
						key={ s.id }
						section={ s }
						layer={ layer }
						extras={ extras }
					/>
				) ) }
		</Fragment>
	);
}
