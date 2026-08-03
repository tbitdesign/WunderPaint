/**
 * Floating context bar (F4, v0.5): quick actions hovering above the
 * active layer while the Move tool is up.
 */

import { hasPivot } from '../../lib/pivot';
import { useState, useRef, useEffect } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../../icons';
import * as Ops from '../../store/ops';
import { SwatchButton } from '../../components/color-popover';
import { VarButton } from '../../components/var-picker';
import { useHoverTip } from '../../components/hover-tip';
import { getExtensionGenerator } from '../../lib/extensions';
import { unitFor } from '../../lib/selection-units';
import { canLayoutText } from '../../lib/text-layouts';
import { LayoutPopover } from './layout-popover';

const ALIGN_MODES = [
	[ 'L', __( 'Align left', 'wunderpaint' ), 'objAlignL' ],
	[ 'C', __( 'Align horizontal centers', 'wunderpaint' ), 'objAlignCH' ],
	[ 'R', __( 'Align right', 'wunderpaint' ), 'objAlignR' ],
	[ 'T', __( 'Align top', 'wunderpaint' ), 'objAlignT' ],
	[ 'M', __( 'Align vertical centers', 'wunderpaint' ), 'objAlignM' ],
	[ 'B', __( 'Align bottom', 'wunderpaint' ), 'objAlignB' ],
];

/**
 * Align & distribute flyout for the context bar (v1.24.13), the same grid as
 * the properties panel, one tap away above the layer. A single layer aligns to
 * the canvas; a multi-selection aligns to its own bounds (distribute needs 3+).
 */
function AlignFlyout( { editor, tip } ) {
	const [ pos, setPos ] = useState( null ); // {left, top} | null
	const ref = useRef( null );
	const canDist = Ops.canDistribute( editor.state );

	useEffect( () => {
		if ( ! pos ) {
			return;
		}
		const onDown = ( e ) => {
			if ( ref.current && ! ref.current.contains( e.target ) ) {
				setPos( null );
			}
		};
		const onKey = ( e ) => {
			if ( 'Escape' === e.key ) {
				e.stopPropagation();
				setPos( null );
			}
		};
		document.addEventListener( 'mousedown', onDown, true );
		document.addEventListener( 'keydown', onKey, true );
		return () => {
			document.removeEventListener( 'mousedown', onDown, true );
			document.removeEventListener( 'keydown', onKey, true );
		};
	}, [ pos ] );

	const toggle = ( e ) => {
		if ( pos ) {
			setPos( null );
			return;
		}
		const r = e.currentTarget.getBoundingClientRect();
		setPos( {
			left: Math.max(
				8,
				Math.min( r.left - 40, window.innerWidth - 148 )
			),
			top: r.bottom + 6,
		} );
	};

	return (
		<div className="cb-align" ref={ ref }>
			<button
				aria-label={ __( 'Align & distribute', 'wunderpaint' ) }
				aria-expanded={ !! pos }
				onClick={ ( e ) => {
					tip?.hide();
					toggle( e );
				} }
				{ ...( tip
					? tip.props( __( 'Align & distribute', 'wunderpaint' ) )
					: {
							title: __( 'Align & distribute', 'wunderpaint' ),
					  } ) }
			>
				{ I.objAlignCH( { size: 13 } ) }
			</button>
			{ pos && (
				<div
					className="cb-align-pop"
					style={ {
						position: 'fixed',
						left: pos.left,
						top: pos.top,
					} }
				>
					<div className="cb-align-grid">
						{ ALIGN_MODES.map( ( [ mode, label, icon ] ) => (
							<button
								key={ mode }
								title={ label }
								aria-label={ label }
								onClick={ () => {
									Ops.alignLayersOp( editor, mode );
									setPos( null );
								} }
							>
								{ I[ icon ]( { size: 14 } ) }
							</button>
						) ) }
					</div>
					<div className="cb-align-dist">
						<button
							disabled={ ! canDist }
							title={ __(
								'Distribute horizontally',
								'wunderpaint'
							) }
							aria-label={ __(
								'Distribute horizontally',
								'wunderpaint'
							) }
							onClick={ () => {
								Ops.distributeLayersOp( editor, true );
								setPos( null );
							} }
						>
							{ I.distributeH( { size: 14 } ) }
						</button>
						<button
							disabled={ ! canDist }
							title={ __(
								'Distribute vertically',
								'wunderpaint'
							) }
							aria-label={ __(
								'Distribute vertically',
								'wunderpaint'
							) }
							onClick={ () => {
								Ops.distributeLayersOp( editor, false );
								setPos( null );
							} }
						>
							{ I.distributeV( { size: 14 } ) }
						</button>
					</div>
				</div>
			) }
		</div>
	);
}

export function ContextBar( {
	editor,
	extras,
	layer,
	zoom,
	pan,
	areaSize,
	viewApi,
} ) {
	const { dispatch, commit } = editor;
	// v1.15: color for shapes/text.
	const colorKey =
		'shape' === layer.type
			? 'fill'
			: 'text' === layer.type
			? 'color'
			: null;

	// One EDIT entry for everything that reopens a tool (v1.167.1, user
	// request): extension generators (3D text, mockups, maps, …), QR,
	// charts/tables and smart objects - essential in Easy Mode, where
	// the layer context menu is off, and one tap in pro too.
	const find = ( id ) => editor.state.layers.find( ( l ) => l.id === id );
	const carrierOf = ( key ) => {
		if ( layer[ key ] ) {
			return layer;
		}
		if ( 'group' === layer.type ) {
			const kid = ( layer.children || [] )
				.map( find )
				.find( ( k ) => k?.[ key ] );
			if ( kid ) {
				return kid;
			}
		}
		const parent = find( layer.parent );
		return parent?.[ key ] ? parent : null;
	};
	const editEntry = ( () => {
		const genLayer = carrierOf( 'generator' );
		const gen = genLayer && getExtensionGenerator( genLayer.generator.id );
		if ( gen && ( gen.edit || gen.run ) ) {
			return {
				label: sprintf(
					/* translators: %s: generator name. */
					__( 'Edit %s', 'wunderpaint' ),
					gen.label
				),
				run: () =>
					( gen.edit || gen.run )( {
						editor,
						extras,
						layer: genLayer,
					} ),
			};
		}
		const qrLayer = carrierOf( 'qr' );
		if ( qrLayer ) {
			return {
				label: __( 'Edit QR Code', 'wunderpaint' ),
				run: () => extras.openQr( qrLayer.id ),
			};
		}
		const chartGroup = carrierOf( 'chart' );
		if ( chartGroup ) {
			return {
				label: String( chartGroup.chart?.type || '' ).startsWith(
					'table'
				)
					? __( 'Edit Table', 'wunderpaint' )
					: __( 'Edit Chart', 'wunderpaint' ),
				run: () => extras.openChart( chartGroup.id ),
			};
		}
		const mockupLayer = carrierOf( 'mockup' );
		if ( mockupLayer ) {
			return {
				label: __( 'Edit Mockup', 'wunderpaint' ),
				run: () => extras.openMockup( mockupLayer.id ),
			};
		}
		const bgLayer = carrierOf( 'bg' );
		if ( bgLayer ) {
			return {
				label: __( 'Edit Background', 'wunderpaint' ),
				run: () => extras.openBackgroundStudio( bgLayer.id ),
			};
		}
		if ( 'smart' === layer.type ) {
			return {
				label: __( 'Edit Smart Object', 'wunderpaint' ),
				run: () => extras.smartObject?.editContents?.( layer ),
			};
		}
		return null;
	} )();
	// Groups keep their own x/y at defaults; the union of the members is
	// where the artwork actually sits (v1.78.5) — leaves are unaffected
	// since their unit box IS their own box.
	const box = unitFor( editor.state.layers, layer ).box;
	const x = box.x * zoom + pan.x;
	const y = box.y * zoom + pan.y;
	const w = box.w * zoom;
	const left = Math.max( 8, Math.min( areaSize.w - 190, x + w / 2 - 90 ) );
	const top = Math.max( 8, y - 40 );

	// Text layouts (E1): the button opens the preview popover with six
	// rendered suggestions of this layer's text.
	const canLayout = canLayoutText( layer );
	const [ layoutAnchor, setLayoutAnchor ] = useState( null );

	// Styled tooltips above the bar (v1.250), same look as the tool rail;
	// native `title` bubbles only remain on the composite color/variable
	// buttons, which bring their own.
	const tip = useHoverTip( 'above' );

	// No shortcut hints in these labels (v1.250.1, user request): in the
	// compact bar tooltips they read as noise; the menubar teaches keys.
	const actions = [
		{
			icon: 'duplicate',
			label: __( 'Duplicate', 'wunderpaint' ),
			run: () => Ops.duplicateLayer( editor ),
		},
		{
			icon: 'arrUp',
			label: __( 'Bring forward', 'wunderpaint' ),
			run: () => Ops.bringForwardOp( editor ),
		},
		{
			icon: 'arrDown',
			label: __( 'Send backward', 'wunderpaint' ),
			run: () => Ops.sendBackwardOp( editor ),
		},
		{
			icon: 'zoom',
			label: __( 'Zoom to layer', 'wunderpaint' ),
			run: () =>
				viewApi.current?.zoomToRect( {
					x: box.x - box.w * 0.15,
					y: box.y - box.h * 0.15,
					w: Math.max( 1, box.w * 1.3 ),
					h: Math.max( 1, box.h * 1.3 ),
				} ),
		},
		{
			icon: 'trash',
			label: __( 'Delete', 'wunderpaint' ),
			run: () => Ops.deleteLayers( editor ),
		},
	];
	if ( 'image' === layer.type && ! layer.qr ) {
		// Image fit cycle (v1.250, user request): the same three modes as
		// the properties panel's Image Fit section, one tap on the canvas.
		// The icon shows the CURRENT mode, a click advances it.
		const fitMode = layer.imageFit?.mode || 'fill';
		const nextFit = { fill: 'cover', cover: 'contain', contain: 'fill' };
		const fitIcons = {
			fill: 'fitStretch',
			cover: 'fitCover',
			contain: 'fitContain',
		};
		actions.splice( 1, 0, {
			icon: fitIcons[ fitMode ] || 'fitStretch',
			label: __( 'Image fit (stretch/cover/fit)', 'wunderpaint' ),
			run: () => {
				const mode = nextFit[ fitMode ] || 'fill';
				dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: {
						imageFit:
							'fill' === mode
								? { mode }
								: {
										ax: 0.5,
										ay: 0.5,
										...( layer.imageFit || {} ),
										mode,
								  },
					},
				} );
				commit( __( 'Set image fit', 'wunderpaint' ) );
			},
		} );
	}
	if ( editEntry ) {
		actions.splice( 1, 0, {
			icon: 'pencil',
			label: editEntry.label,
			run: editEntry.run,
		} );
	}
	// Radial Repeat appears the moment a pivot has been moved (v1.372).
	// It lived only in the Layer menu, where the person who had just
	// dragged the pivot on the canvas never thought to look - reported by
	// the user, and fair: the command belongs next to the thing it needs.
	if ( hasPivot( layer ) ) {
		actions.splice( 1, 0, {
			icon: 'rotateCw',
			label: __( 'Radial repeat around the pivot', 'wunderpaint' ),
			run: () => Ops.radialRepeatPrompt( editor ),
		} );
	}
	if ( 'text' === layer.type ) {
		// Vertical alignment (v1.92.0, since v1.107.7 for point text too):
		// one compact button cycling top -> middle -> bottom. Align &
		// distribute renders right next to it (v1.165.0, user request) -
		// the '__align' sentinel marks the flyout's slot in the flow.
		const valign = layer.valign || ( layer.fixedWidth ? 'top' : 'middle' );
		const next = { top: 'middle', middle: 'bottom', bottom: 'top' };
		const icons = { top: 'valignT', middle: 'valignM', bottom: 'valignB' };
		actions.splice(
			1,
			0,
			{
				icon: icons[ valign ] || 'valignT',
				label: __(
					'Vertical align (top/middle/bottom)',
					'wunderpaint'
				),
				run: () => {
					dispatch( {
						type: 'UPDATE_LAYER',
						id: layer.id,
						patch: { valign: next[ valign ] || 'middle' },
					} );
					commit( __( 'Vertical align', 'wunderpaint' ) );
				},
			},
			{ icon: '__align' }
		);
	}
	if ( 'text' === layer.type ) {
		// Horizontal alignment as a cycling button too (v1.92.2): the icon
		// shows the current state, a click advances left -> center -> right
		// (-> justify for area text, which alone has a box to fill, v1.179.0).
		const align = layer.align || 'left';
		const alignIcons = {
			left: 'alignL',
			center: 'alignC',
			right: 'alignR',
			justify: 'alignJustify',
		};
		const order = layer.fixedWidth
			? [ 'left', 'center', 'right', 'justify' ]
			: [ 'left', 'center', 'right' ];
		const nextAlign =
			order[ ( order.indexOf( align ) + 1 ) % order.length ] || 'center';
		actions.splice( 1, 0, {
			icon: alignIcons[ align ] || 'alignL',
			label: layer.fixedWidth
				? __( 'Text align (left/center/right/justify)', 'wunderpaint' )
				: __( 'Text align (left/center/right)', 'wunderpaint' ),
			run: () => {
				dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: { align: nextAlign },
				} );
				commit( __( 'Edit text style', 'wunderpaint' ) );
			},
		} );
	}
	if ( canLayout ) {
		actions.splice( 1, 0, {
			icon: 'textLayout',
			label: __( 'Layouts', 'wunderpaint' ),
			run: ( e ) => {
				if ( layoutAnchor ) {
					setLayoutAnchor( null );
					return;
				}
				const r = e.currentTarget.getBoundingClientRect();
				setLayoutAnchor( {
					left: Math.max( 8, r.left - 60 ),
					top: r.bottom + 8,
				} );
			},
		} );
	}

	const isText = 'text' === layer.type;
	const kits = window.WPIE?.brandKits || [];
	const kit =
		kits.find( ( k ) => k.id === editor.state.doc.brandKitId ) ||
		kits[ 0 ] ||
		null;

	return (
		<div
			className="ed-context-bar"
			style={ { left, top } }
			onPointerDown={ ( e ) => e.stopPropagation() }
			onMouseDown={ ( e ) => e.stopPropagation() }
			role="toolbar"
			aria-label={ __( 'Layer actions', 'wunderpaint' ) }
		>
			{ colorKey && (
				<SwatchButton
					size={ 14 }
					color={ layer[ colorKey ] }
					title={ __( 'Color', 'wunderpaint' ) }
					tipProps={ tip.props( __( 'Color', 'wunderpaint' ) ) }
					onChange={ ( c ) => {
						dispatch( {
							type: 'UPDATE_LAYER',
							id: layer.id,
							patch: { [ colorKey ]: c },
						} );
						commit( __( 'Change color', 'wunderpaint' ) );
					} }
				/>
			) }
			{ actions
				.filter( ( a ) => 'trash' !== a.icon )
				.map( ( action ) =>
					'__align' === action.icon ? (
						<AlignFlyout
							key="__align"
							editor={ editor }
							tip={ tip }
						/>
					) : (
						<button
							key={ action.icon }
							aria-label={ action.label }
							onClick={ ( e ) => {
								tip.hide();
								action.run( e );
							} }
							{ ...tip.props( action.label ) }
						>
							{ I[ action.icon ]
								? I[ action.icon ]( { size: 13 } )
								: action.text || action.icon }
						</button>
					)
				) }
			{ ! isText && <AlignFlyout editor={ editor } tip={ tip } /> }
			{ isText && (
				<VarButton
					value={ layer.text || '' }
					kit={ kit }
					onKitChange={ ( id ) => Ops.assignBrandKitOp( editor, id ) }
					tipProps={ tip.props(
						__( 'Insert dynamic variable', 'wunderpaint' )
					) }
					onChange={ ( v ) => {
						dispatch( {
							type: 'UPDATE_LAYER',
							id: layer.id,
							patch: { text: v },
						} );
						commit( __( 'Insert variable', 'wunderpaint' ) );
					} }
				/>
			) }
			{ /* Delete is always the LAST control in the bar. */ }
			{ actions
				.filter( ( a ) => 'trash' === a.icon )
				.map( ( action ) => (
					<button
						key={ action.icon }
						aria-label={ action.label }
						onClick={ ( e ) => {
							tip.hide();
							action.run( e );
						} }
						{ ...tip.props( action.label ) }
					>
						{ I[ action.icon ]( { size: 13 } ) }
					</button>
				) ) }
			{ tip.node }
			{ layoutAnchor && (
				<LayoutPopover
					editor={ editor }
					extras={ extras }
					anchor={ layoutAnchor }
					onClose={ () => setLayoutAnchor( null ) }
				/>
			) }
		</div>
	);
}
