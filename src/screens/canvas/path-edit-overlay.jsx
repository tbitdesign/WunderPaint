/**
 * Path edit session (v1.118): the white-arrow moment. Double-clicking a
 * pathD shape (pen drawing, icon) shows its anchors and bezier handles:
 * drag to move (handles mirror their angle unless Alt breaks them),
 * click the outline to insert a point (exact de Casteljau split),
 * Alt-click or Delete removes, double-click toggles corner/smooth. The
 * layer updates live; the box re-hugs the path after every change, with
 * the same center math the transform tool uses under rotation.
 */

import { useEffect, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import {
	buildPathD,
	deleteAnchor,
	insertAnchor,
	nearestOnPath,
	parsePathAnchors,
	pathBounds,
	shiftSubs,
	toggleSmooth,
} from '../../lib/path-edit';

export function PathEditOverlay( { editor, layerId, zoom, pan, onDone } ) {
	const { state, dispatch, commit } = editor;
	const layer = state.layers.find( ( l ) => l.id === layerId );
	// The editor drives a shape's `pathD` OR a text-on-path layer's own
	// `textPath.d` (v1.212.0) - same anchor engine, so reshaping the curve
	// makes the text follow live. Auto-detected; a layer never has both.
	const pathField = layer?.pathD
		? 'pathD'
		: layer?.textPath?.d
		? 'textPath'
		: null;
	const currentD = 'textPath' === pathField ? layer.textPath.d : layer?.pathD;
	const [ subs, setSubs ] = useState( () =>
		currentD ? parsePathAnchors( currentD ) : null
	);
	const [ selected, setSelected ] = useState( null ); // {si, ai}
	const drag = useRef( null ); // {kind, si, ai, hIn, hOut, moved}
	const dirty = useRef( false );

	const commitEdit = () => {
		if ( dirty.current ) {
			commit( __( 'Edit path', 'wunderpaint' ) );
			dirty.current = false;
		}
	};
	const finish = () => {
		commitEdit();
		onDone();
	};

	useEffect( () => {
		const onKey = ( e ) => {
			if ( 'Escape' === e.key || 'Enter' === e.key ) {
				e.stopPropagation();
				finish();
			} else if (
				( 'Delete' === e.key || 'Backspace' === e.key ) &&
				selected
			) {
				e.stopPropagation();
				e.preventDefault();
				applyLive( deleteAnchor( subs, selected.si, selected.ai ) );
				commitEdit();
				setSelected( null );
			}
		};
		window.addEventListener( 'keydown', onKey, true );
		return () => window.removeEventListener( 'keydown', onKey, true );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ selected, subs, layer ] );

	if ( ! layer || ! subs || ! pathField ) {
		onDone();
		return null;
	}

	const rot = layer.rot || 0;
	const rad = ( rot * Math.PI ) / 180;
	const fx = layer.flipX ? -1 : 1;
	const fy = layer.flipY ? -1 : 1;
	const c = { x: layer.x + layer.w / 2, y: layer.y + layer.h / 2 };

	// Local (pathD space) <-> screen, matching the renderer's transform:
	// doc = center + R(rot) * F(flip) * (local - (w/2, h/2)).
	const toScreen = ( p ) => {
		const vx = ( p.x - layer.w / 2 ) * fx;
		const vy = ( p.y - layer.h / 2 ) * fy;
		const dx = c.x + vx * Math.cos( rad ) - vy * Math.sin( rad );
		const dy = c.y + vx * Math.sin( rad ) + vy * Math.cos( rad );
		return { x: pan.x + dx * zoom, y: pan.y + dy * zoom };
	};
	const toLocal = ( sx, sy ) => {
		const dx = ( sx - pan.x ) / zoom - c.x;
		const dy = ( sy - pan.y ) / zoom - c.y;
		const vx = dx * Math.cos( -rad ) - dy * Math.sin( -rad );
		const vy = dx * Math.sin( -rad ) + dy * Math.cos( -rad );
		return { x: vx * fx + layer.w / 2, y: vy * fy + layer.h / 2 };
	};

	/** Push edited anchors into the layer; the box re-hugs the path. */
	const applyLive = ( nextSubs ) => {
		const b = pathBounds( nextSubs, 4 );
		const rebased = shiftSubs( nextSubs, -b.x, -b.y );
		// New box center in doc space via the current transform.
		const lx = b.x + b.w / 2 - layer.w / 2;
		const ly = b.y + b.h / 2 - layer.h / 2;
		const vx = lx * fx;
		const vy = ly * fy;
		const ncx = c.x + vx * Math.cos( rad ) - vy * Math.sin( rad );
		const ncy = c.y + vx * Math.sin( rad ) + vy * Math.cos( rad );
		const d = buildPathD( rebased );
		const patch = { x: ncx - b.w / 2, y: ncy - b.h / 2, w: b.w, h: b.h };
		if ( 'textPath' === pathField ) {
			// Include textPath in the patch so patchLayer does not ALSO
			// rescale it for the w/h change (it guards on !('textPath' in patch)).
			patch.textPath = { ...layer.textPath, d };
		} else {
			patch.pathD = d;
		}
		dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
		setSubs( rebased );
		dirty.current = true;
	};

	/** Screen-distance hit tests for handles and anchors. */
	const hitAt = ( sx, sy ) => {
		let best = null;
		subs.forEach( ( s, si ) => {
			s.anchors.forEach( ( a, ai ) => {
				for ( const kind of [ 'hIn', 'hOut' ] ) {
					if ( a[ kind ] ) {
						const q = toScreen( a[ kind ] );
						const d = Math.hypot( q.x - sx, q.y - sy );
						if ( d < 9 && ( ! best || d < best.d ) ) {
							best = { kind, si, ai, d };
						}
					}
				}
			} );
		} );
		if ( best ) {
			return best;
		}
		subs.forEach( ( s, si ) => {
			s.anchors.forEach( ( a, ai ) => {
				const q = toScreen( a );
				const d = Math.hypot( q.x - sx, q.y - sy );
				if ( d < 9 && ( ! best || d < best.d ) ) {
					best = { kind: 'anchor', si, ai, d };
				}
			} );
		} );
		return best;
	};

	// Anchors live in canvas-area coordinates (like pan/zoom); pointer
	// events arrive in viewport coordinates - convert at the boundary.
	const relPoint = ( e ) => {
		const r = e.currentTarget.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	};

	const onPointerDown = ( e ) => {
		e.stopPropagation();
		const rp = relPoint( e );
		const hit = hitAt( rp.x, rp.y );
		if ( hit ) {
			if ( e.altKey && 'anchor' === hit.kind ) {
				applyLive( deleteAnchor( subs, hit.si, hit.ai ) );
				commitEdit();
				setSelected( null );
				return;
			}
			const a = subs[ hit.si ].anchors[ hit.ai ];
			drag.current = {
				...hit,
				// Anchor drag carries its handles along.
				hIn: a.hIn ? { x: a.hIn.x - a.x, y: a.hIn.y - a.y } : null,
				hOut: a.hOut ? { x: a.hOut.x - a.x, y: a.hOut.y - a.y } : null,
			};
			setSelected( { si: hit.si, ai: hit.ai } );
			e.currentTarget.setPointerCapture?.( e.pointerId );
			return;
		}
		// On the outline: insert an anchor and drag it right away.
		const local = toLocal( rp.x, rp.y );
		const on = nearestOnPath( subs, local, 8 / zoom );
		if ( on ) {
			const next = insertAnchor( subs, on.si, on.seg, on.t );
			const s = next[ on.si ];
			// Splice position: after seg's start; the closing segment
			// appends at the end of the ring.
			const ai = Math.min( on.seg + 1, s.anchors.length - 1 );
			const a = s.anchors[ ai ];
			drag.current = {
				kind: 'anchor',
				si: on.si,
				ai,
				hIn: a.hIn ? { x: a.hIn.x - a.x, y: a.hIn.y - a.y } : null,
				hOut: a.hOut ? { x: a.hOut.x - a.x, y: a.hOut.y - a.y } : null,
			};
			setSelected( { si: on.si, ai } );
			applyLive( next );
			e.currentTarget.setPointerCapture?.( e.pointerId );
			return;
		}
		// Inside the box: deselect. Outside: done.
		const inBox =
			local.x > -8 / zoom &&
			local.x < layer.w + 8 / zoom &&
			local.y > -8 / zoom &&
			local.y < layer.h + 8 / zoom;
		if ( inBox ) {
			setSelected( null );
		} else {
			finish();
		}
	};

	const onPointerMove = ( e ) => {
		const d = drag.current;
		if ( ! d ) {
			return;
		}
		const rp = relPoint( e );
		const local = toLocal( rp.x, rp.y );
		const next = subs.map( ( s ) => ( {
			...s,
			anchors: s.anchors.map( ( a ) => ( { ...a } ) ),
		} ) );
		const a = next[ d.si ].anchors[ d.ai ];
		if ( 'anchor' === d.kind ) {
			a.x = local.x;
			a.y = local.y;
			a.hIn = d.hIn ? { x: a.x + d.hIn.x, y: a.y + d.hIn.y } : null;
			a.hOut = d.hOut ? { x: a.x + d.hOut.x, y: a.y + d.hOut.y } : null;
		} else {
			a[ d.kind ] = local;
			// Photoshop feel: the opposite handle mirrors the angle and
			// keeps its own length; Alt breaks the pair.
			const other = 'hIn' === d.kind ? 'hOut' : 'hIn';
			if ( a[ other ] && ! e.altKey ) {
				const len = Math.hypot(
					a[ other ].x - a.x,
					a[ other ].y - a.y
				);
				const dl = Math.hypot( local.x - a.x, local.y - a.y ) || 1;
				a[ other ] = {
					x: a.x - ( ( local.x - a.x ) / dl ) * len,
					y: a.y - ( ( local.y - a.y ) / dl ) * len,
				};
			}
		}
		applyLive( next );
	};

	const onPointerUp = () => {
		if ( drag.current ) {
			commitEdit();
		}
		drag.current = null;
	};

	const onDoubleClick = ( e ) => {
		e.stopPropagation();
		const rp = relPoint( e );
		const hit = hitAt( rp.x, rp.y );
		if ( hit && 'anchor' === hit.kind ) {
			applyLive( toggleSmooth( subs, hit.si, hit.ai ) );
			commitEdit();
		} else {
			finish();
		}
	};

	/* ------------------------------ render ------------------------------ */

	const outlineTransform = `translate(${ pan.x } ${
		pan.y
	}) scale(${ zoom }) translate(${ c.x } ${
		c.y
	}) rotate(${ rot }) scale(${ fx } ${ fy }) translate(${ -layer.w / 2 } ${
		-layer.h / 2
	})`;
	const markers = [];
	subs.forEach( ( s, si ) => {
		s.anchors.forEach( ( a, ai ) => {
			const isSel = selected && selected.si === si && selected.ai === ai;
			// Handles: shown for the selected anchor and its neighbors.
			const n = s.anchors.length;
			const nearSel =
				selected &&
				selected.si === si &&
				( Math.abs( selected.ai - ai ) <= 1 ||
					( s.closed && Math.abs( selected.ai - ai ) === n - 1 ) );
			if ( isSel || nearSel ) {
				const p = toScreen( a );
				for ( const kind of [ 'hIn', 'hOut' ] ) {
					if ( a[ kind ] ) {
						const q = toScreen( a[ kind ] );
						markers.push(
							<line
								key={ `l-${ si }-${ ai }-${ kind }` }
								x1={ p.x }
								y1={ p.y }
								x2={ q.x }
								y2={ q.y }
								stroke="var(--accent)"
								strokeWidth={ 1 }
								opacity={ 0.7 }
							/>,
							<circle
								key={ `h-${ si }-${ ai }-${ kind }` }
								cx={ q.x }
								cy={ q.y }
								r={ 3.5 }
								fill="#fff"
								stroke="var(--accent)"
								strokeWidth={ 1.5 }
							/>
						);
					}
				}
			}
		} );
	} );
	// Anchor squares on top of handle lines.
	subs.forEach( ( s, si ) => {
		s.anchors.forEach( ( a, ai ) => {
			const isSel = selected && selected.si === si && selected.ai === ai;
			const p = toScreen( a );
			markers.push(
				<rect
					key={ `a-${ si }-${ ai }` }
					x={ p.x - 3.5 }
					y={ p.y - 3.5 }
					width={ 7 }
					height={ 7 }
					fill={ isSel ? 'var(--accent)' : '#fff' }
					stroke="var(--accent)"
					strokeWidth={ 1.5 }
				/>
			);
		} );
	} );

	const boxBottom = toScreen( { x: layer.w / 2, y: layer.h } );

	return (
		<div
			style={ {
				position: 'absolute',
				inset: 0,
				zIndex: 40,
				cursor: 'default',
				overflow: 'hidden',
			} }
			onPointerDown={ onPointerDown }
			onPointerMove={ onPointerMove }
			onPointerUp={ onPointerUp }
			onDoubleClick={ onDoubleClick }
		>
			<svg
				width="100%"
				height="100%"
				style={ {
					position: 'absolute',
					inset: 0,
					pointerEvents: 'none',
				} }
			>
				<path
					d={ currentD }
					transform={ outlineTransform }
					fill="none"
					stroke="var(--accent)"
					strokeWidth={ 1.5 / zoom }
					opacity={ 0.9 }
				/>
				{ markers }
			</svg>
			<div
				style={ {
					position: 'absolute',
					left: Math.max( 8, boxBottom.x - 190 ),
					top: Math.min( window.innerHeight - 60, boxBottom.y + 14 ),
					background: 'var(--accent)',
					color: '#fff',
					borderRadius: 5,
					padding: '4px 10px',
					fontSize: 11,
					pointerEvents: 'none',
					whiteSpace: 'nowrap',
				} }
			>
				{ __(
					'Drag points and handles. Click the outline to add, Alt-click removes, double-click smooths. Enter ends.',
					'wunderpaint'
				) }
			</div>
		</div>
	);
}
