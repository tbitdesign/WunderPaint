/**
 * On-canvas handles of a Repeat layer (v1.431), after the gradient overlay's
 * pattern: an SVG over the stage, pointer capture per handle, the rule
 * written live while dragging and one history step on release. The
 * numbers stay in the panel; the handles are the few that beat a number:
 * the row's step vector, the grid's two steps, the circle's centre and
 * ring, the path's frame.
 */
import { useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import * as Ops from '../../store/ops';
import { unitBoxOf } from '../../store/repeat-sync';
import { pathPointsToDoc } from '../../lib/repeat-layout';
import { defaultPathFrame } from '../../lib/repeat-layer';
import { ancestorLocked } from './tool-handlers';

const rad = ( d ) => ( d * Math.PI ) / 180;
const deg = ( r ) => ( r * 180 ) / Math.PI;

function Handle( { at, title, cursor, onDown, onDouble, shape = 'square' } ) {
	const common = {
		className: 'rp-handle',
		style: { cursor: cursor || 'move', pointerEvents: 'all' },
		fill: '#fff',
		stroke: 'var(--accent)',
		strokeWidth: 1.5,
		onPointerDown: onDown,
		onDoubleClick: ( e ) => {
			e.stopPropagation();
			if ( onDouble ) {
				onDouble();
			}
		},
	};
	return 'round' === shape ? (
		<circle cx={ at.x } cy={ at.y } r="6" { ...common }>
			<title>{ title }</title>
		</circle>
	) : (
		<rect
			x={ at.x - 6 }
			y={ at.y - 6 }
			width="12"
			height="12"
			rx="2"
			{ ...common }
		>
			<title>{ title }</title>
		</rect>
	);
}

export function RepeatOverlay( { editor, layer, source, zoom, pan } ) {
	const drag = useRef( null );
	const layers = editor.state.layers;
	if (
		! layer ||
		! source ||
		layer.locked ||
		ancestorLocked( layers, layer ) ||
		! source.visible
	) {
		return null;
	}
	const rule = layer.rule || {};
	const box = unitBoxOf( layers, source );
	const S = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
	const screen = ( p ) => ( {
		x: pan.x + p.x * zoom,
		y: pan.y + p.y * zoom,
	} );
	const toDoc = ( e, svg ) => {
		const r = svg.getBoundingClientRect();
		return {
			x: ( e.clientX - r.left - pan.x ) / zoom,
			y: ( e.clientY - r.top - pan.y ) / zoom,
		};
	};
	const write = ( rulePatch, done = false ) => {
		Ops.setRepeatRule(
			editor,
			layer.id,
			rulePatch,
			done ? __( 'Edit repeat', 'wunderpaint' ) : null
		);
	};
	const start = ( key ) => ( e ) => {
		if ( 0 !== e.button ) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		const svg = e.currentTarget.ownerSVGElement;
		drag.current = {
			key,
			svg,
			from: toDoc( e, svg ),
			rule: layer.rule,
			frame: layer.rule?.path?.frame,
			changed: false,
		};
		e.currentTarget.setPointerCapture( e.pointerId );
	};
	const snap45 = ( v, shift ) => {
		if ( ! shift ) {
			return v;
		}
		const a =
			Math.round( Math.atan2( v.y, v.x ) / ( Math.PI / 4 ) ) *
			( Math.PI / 4 );
		const len = Math.hypot( v.x, v.y );
		return { x: Math.cos( a ) * len, y: Math.sin( a ) * len };
	};
	const move = ( e ) => {
		const d = drag.current;
		if ( ! d ) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		const p = toDoc( e, d.svg );
		if (
			! d.changed &&
			Math.hypot( p.x - d.from.x, p.y - d.from.y ) * zoom < 1
		) {
			return;
		}
		d.changed = true;
		const r = d.rule;
		if ( 'row' === d.key ) {
			const v = snap45( { x: p.x - S.x, y: p.y - S.y }, e.shiftKey );
			write( { dx: Math.round( v.x ), dy: Math.round( v.y ) } );
		} else if ( 'gridX' === d.key ) {
			write( {
				gapX: Math.round( Math.max( -box.w * 0.9, p.x - S.x - box.w ) ),
			} );
		} else if ( 'gridY' === d.key ) {
			write( {
				gapY: Math.round( Math.max( -box.h * 0.9, p.y - S.y - box.h ) ),
			} );
		} else if ( 'centre' === d.key ) {
			const v = snap45( { x: p.x - S.x, y: p.y - S.y }, e.shiftKey );
			write( {
				center: { dx: Math.round( v.x ), dy: Math.round( v.y ) },
			} );
		} else if ( 'ring' === d.key ) {
			// The ring keeps passing through the source: the far point of the
			// ring is where the pointer is, the centre halfway to the source.
			write( {
				center: {
					dx: Math.round( ( p.x - S.x ) / 2 ),
					dy: Math.round( ( p.y - S.y ) / 2 ),
				},
			} );
		} else if ( 'frameMove' === d.key ) {
			const f = d.frame;
			write( {
				path: {
					...r.path,
					frame: {
						...f,
						x: Math.round( f.x + p.x - d.from.x ),
						y: Math.round( f.y + p.y - d.from.y ),
					},
				},
			} );
		} else if ( 'frameRotate' === d.key ) {
			const f = d.frame;
			const c = { x: f.x + f.w / 2, y: f.y + f.h / 2 };
			let a = deg( Math.atan2( p.y - c.y, p.x - c.x ) ) + 90;
			if ( e.shiftKey ) {
				a = Math.round( a / 15 ) * 15;
			}
			write( {
				path: { ...r.path, frame: { ...f, rot: Math.round( a ) } },
			} );
		} else if ( d.key.startsWith( 'c' ) && 3 === d.key.length ) {
			// Work in the frame's own unrotated space: the opposite corner
			// stays, the dragged one follows the pointer.
			const f = d.frame;
			const c = { x: f.x + f.w / 2, y: f.y + f.h / 2 };
			const cos = Math.cos( -rad( f.rot || 0 ) );
			const sin = Math.sin( -rad( f.rot || 0 ) );
			const lx = c.x + ( p.x - c.x ) * cos - ( p.y - c.y ) * sin;
			const ly = c.y + ( p.x - c.x ) * sin + ( p.y - c.y ) * cos;
			const right = d.key.includes( 'E' );
			const bottom = d.key.includes( 'S' );
			const fx0 = right ? f.x : lx;
			const fx1 = right ? lx : f.x + f.w;
			const fy0 = bottom ? f.y : ly;
			const fy1 = bottom ? ly : f.y + f.h;
			const nw = Math.max( 20, fx1 - fx0 );
			const nh = Math.max( 20, fy1 - fy0 );
			// The unrotated box moved its centre; keep the rotation about the
			// NEW centre by re-deriving x/y from the local corners.
			const nx = right ? f.x : f.x + f.w - nw;
			const ny = bottom ? f.y : f.y + f.h - nh;
			write( {
				path: {
					...r.path,
					frame: {
						...f,
						x: Math.round( nx ),
						y: Math.round( ny ),
						w: Math.round( nw ),
						h: Math.round( nh ),
					},
				},
			} );
		}
	};
	const end = ( e ) => {
		const d = drag.current;
		drag.current = null;
		if ( ! d ) {
			return;
		}
		e.stopPropagation();
		if ( d.changed ) {
			write( {}, true );
		}
	};
	// Double-click on the path frame: back to the frame the source started with.
	const resetFrame = () => {
		const { frame, anchor } = defaultPathFrame( box, editor.state.doc );
		write( { path: { ...rule.path, frame, anchor } }, true );
	};
	const handleProps = ( key, cursor, title, shape ) => ( {
		title,
		cursor,
		shape,
		onDown: start( key ),
		onDouble:
			key.startsWith( 'c' ) || 'frameRotate' === key ? resetFrame : null,
	} );
	const svgEvents = {
		onPointerMove: move,
		onPointerUp: end,
		onPointerCancel: end,
	};

	const mode = rule.mode || 'row';
	const s0 = screen( S );
	let body = null;
	if ( 'row' === mode ) {
		const c1 = screen( {
			x: S.x + ( rule.dx || 0 ),
			y: S.y + ( rule.dy || 0 ),
		} );
		body = (
			<>
				<line
					x1={ s0.x }
					y1={ s0.y }
					x2={ c1.x }
					y2={ c1.y }
					className="rp-guide"
				/>
				<Handle
					at={ c1 }
					{ ...handleProps(
						'row',
						'move',
						__(
							'Drag to set the step between copies - Shift snaps to 45°',
							'wunderpaint'
						)
					) }
				/>
			</>
		);
	} else if ( 'grid' === mode ) {
		const gx = screen( { x: S.x + box.w + ( rule.gapX || 0 ), y: S.y } );
		const gy = screen( { x: S.x, y: S.y + box.h + ( rule.gapY || 0 ) } );
		body = (
			<>
				<line
					x1={ s0.x }
					y1={ s0.y }
					x2={ gx.x }
					y2={ gx.y }
					className="rp-guide"
				/>
				<line
					x1={ s0.x }
					y1={ s0.y }
					x2={ gy.x }
					y2={ gy.y }
					className="rp-guide"
				/>
				<Handle
					at={ gx }
					{ ...handleProps(
						'gridX',
						'ew-resize',
						__( 'Drag to set the column step', 'wunderpaint' )
					) }
				/>
				<Handle
					at={ gy }
					{ ...handleProps(
						'gridY',
						'ns-resize',
						__( 'Drag to set the row step', 'wunderpaint' )
					) }
				/>
			</>
		);
	} else if ( 'circle' === mode ) {
		const cdx = rule.center?.dx || 0;
		const cdy = rule.center?.dy || 0;
		const M = screen( { x: S.x + cdx, y: S.y + cdy } );
		const far = screen( { x: S.x + 2 * cdx, y: S.y + 2 * cdy } );
		const radius = Math.hypot( cdx, cdy ) * zoom;
		body = (
			<>
				<circle
					cx={ M.x }
					cy={ M.y }
					r={ radius }
					className="rp-guide rp-ring"
				/>
				<Handle
					at={ M }
					shape="round"
					{ ...handleProps(
						'centre',
						'move',
						__(
							'Drag the center of the circle - Shift snaps to 45°',
							'wunderpaint'
						),
						'round'
					) }
				/>
				<Handle
					at={ far }
					{ ...handleProps(
						'ring',
						'move',
						__( 'Drag to set the radius', 'wunderpaint' )
					) }
				/>
			</>
		);
	} else if ( 'path' === mode && rule.path?.frame ) {
		const f = rule.path.frame;
		const c = { x: f.x + f.w / 2, y: f.y + f.h / 2 };
		const local = ( x, y ) => {
			const cos = Math.cos( rad( f.rot || 0 ) );
			const sin = Math.sin( rad( f.rot || 0 ) );
			return screen( {
				x: c.x + ( x - c.x ) * cos - ( y - c.y ) * sin,
				y: c.y + ( x - c.x ) * sin + ( y - c.y ) * cos,
			} );
		};
		const nw = local( f.x, f.y );
		const ne = local( f.x + f.w, f.y );
		const se = local( f.x + f.w, f.y + f.h );
		const sw = local( f.x, f.y + f.h );
		const top = local( f.x + f.w / 2, f.y );
		const rot = local( f.x + f.w / 2, f.y - 28 / zoom );
		const pts = pathPointsToDoc( rule.path ).map( screen );
		body = (
			<>
				<polygon
					points={ [ nw, ne, se, sw ]
						.map( ( p ) => `${ p.x },${ p.y }` )
						.join( ' ' ) }
					className="rp-frame"
					style={ { pointerEvents: 'all', cursor: 'move' } }
					onPointerDown={ start( 'frameMove' ) }
					onDoubleClick={ ( e ) => {
						e.stopPropagation();
						resetFrame();
					} }
				/>
				{ pts.length > 1 && (
					<polyline
						points={ pts
							.map( ( p ) => `${ p.x },${ p.y }` )
							.join( ' ' ) }
						className="rp-path"
					/>
				) }
				<line
					x1={ top.x }
					y1={ top.y }
					x2={ rot.x }
					y2={ rot.y }
					className="rp-guide"
				/>
				<Handle
					at={ rot }
					shape="round"
					{ ...handleProps(
						'frameRotate',
						'grab',
						__(
							'Drag to turn the path - Shift snaps to 15°',
							'wunderpaint'
						),
						'round'
					) }
				/>
				{ [
					[ 'cNW', nw, 'nwse-resize' ],
					[ 'cNE', ne, 'nesw-resize' ],
					[ 'cSE', se, 'nwse-resize' ],
					[ 'cSW', sw, 'nesw-resize' ],
				].map( ( [ key, at, cursor ] ) => (
					<Handle
						key={ key }
						at={ at }
						{ ...handleProps(
							key,
							cursor,
							__( 'Drag to resize the path frame', 'wunderpaint' )
						) }
					/>
				) ) }
			</>
		);
	}
	return (
		<svg
			className="ed-overlay rp-overlay"
			width="100%"
			height="100%"
			aria-label={ __( 'Repeat handles', 'wunderpaint' ) }
			{ ...svgEvents }
		>
			{ body }
		</svg>
	);
}
