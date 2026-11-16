/** Direct editing of a pen's centerline and width profile, never its baked outline. */
import {
	replacePenSection,
	refinePenArea,
	sculptPenPath,
	mirrorPenPoint,
	RADIAL_SYMMETRY,
} from '../../lib/pen-creative';
import { useEffect, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { ancestorLocked, ancestorHidden } from './tool-handlers';
import {
	buildPathD,
	parsePathAnchors,
	insertAnchor,
	deleteAnchor,
} from '../../lib/path-edit';
import { scalePathD } from '../../lib/path';
import {
	penLayerPatch,
	penSourceD,
	penPointAt,
	penSamples,
	penWidthAt,
	isPenLayer,
} from '../../lib/pen-path';
import {
	nearestPenSegment,
	bendPenSegment,
	setPenPointType,
} from '../../lib/pen-edit';
import {
	penCoordinates as coordinates,
	movePenPoints,
	arrangePenPoints,
	cutPenPath,
	penCorner,
	roundPenCorner,
	locallySmoothPen,
	joinPenPaths,
	mapPenSubs,
	penContinuation,
} from '../../lib/pen-operations';
const selectedPoints = ( selected ) =>
	selected?.points || ( selected ? [ selected ] : [] );
const samePoint = ( a, b ) => a.si === b.si && a.ai === b.ai;
const endpoint = ( subs, hit ) =>
	hit &&
	! subs[ hit.si ]?.closed &&
	( hit.ai === 0 || hit.ai === subs[ hit.si ]?.anchors.length - 1 );
export function PenEditOverlay( {
	editor,
	layerId,
	zoom,
	pan,
	mode = 'points',
	apiRef,
	onSelection,
	onContinue,
	onDone,
} ) {
	const layer = editor.state.layers.find( ( l ) => l.id === layerId ),
		[ selected, setSelected ] = useState( null ),
		drag = useRef( null ),
		dirty = useRef( false ),
		[ brushPoint, setBrushPoint ] = useState( null ),
		[ redrawPoints, setRedrawPoints ] = useState( [] );
	const source = layer?.penPath ? penSourceD( layer ) : '',
		subs = source ? parsePathAnchors( source ) : null;
	const geometryRef = useRef( null );
	geometryRef.current = {
		layer,
		subs,
		selected,
	};
	const commit = () => {
		if ( dirty.current ) {
			editor.commit( __( 'Edit pen path', 'wunderpaint' ) );
			dirty.current = false;
		}
	};
	const write = ( base, nextSubs ) => {
		if (
			! base ||
			base.locked ||
			ancestorLocked( editor.state.layers, base )
		) {
			return;
		}
		const d = scalePathD(
			buildPathD( nextSubs ),
			base.penPath.w / base.w,
			base.penPath.h / base.h
		);
		editor.dispatch( {
			type: 'UPDATE_LAYER',
			id: base.id,
			patch: penLayerPatch(
				base,
				{
					...base.penPath.style,
					smoothing: 0,
				},
				d
			),
		} );
		dirty.current = true;
	};
	const action = ( type, value ) => {
		const current = geometryRef.current;
		if ( ! current.layer || ! current.subs ) {
			return;
		}
		const points = selectedPoints( current.selected );
		let next = current.subs;
		if ( type === 'all' ) {
			const all = next.flatMap( ( sub, si ) =>
				sub.anchors.map( ( _, ai ) => ( { si, ai } ) )
			);
			setSelected( all.length ? { ...all.at( -1 ), points: all } : null );
			return;
		}
		if ( type === 'continue' ) {
			const hit = points[ 0 ];
			if ( endpoint( next, hit ) ) {
				const draft = penContinuation( current.layer, hit.si, hit.ai );
				if ( draft ) {
					onContinue?.( draft );
				}
			}
			return;
		}
		if ( type.startsWith( 'align-' ) || type.startsWith( 'distribute-' ) ) {
			next = arrangePenPoints( next, points, type );
		} else if ( type === 'move' ) {
			next = movePenPoints( next, points, value.x, value.y );
		} else if ( type === 'cut' && points.length === 1 ) {
			next = cutPenPath( next, points[ 0 ] );
		} else {
			for ( const point of points
				.slice()
				.sort( ( a, b ) => b.si - a.si || b.ai - a.ai ) ) {
				next =
					type === 'delete'
						? deleteAnchor( next, point.si, point.ai )
						: type === 'round'
						? roundPenCorner( next, point.si, point.ai, value )
						: setPenPointType( next, point, type );
			}
		}
		if ( next === current.subs ) {
			return;
		}
		write( current.layer, next );
		commit();
		if ( [ 'delete', 'cut', 'round' ].includes( type ) ) {
			setSelected( null );
		}
	};

	if ( apiRef ) {
		apiRef.current = action;
	}
	useEffect( () => {
		setSelected( null );
	}, [ layerId ] );
	useEffect( () => {
		onSelection?.(
			selected
				? { ...selected, count: selectedPoints( selected ).length }
				: null
		);
	}, [ selected, onSelection ] );
	useEffect( () => {
		const key = ( e ) => {
			if (
				e.target.closest?.(
					'input,textarea,select,[contenteditable=true],button'
				) ||
				document.getElementById( 'wpie-root' )?.inert
			) {
				return;
			}
			if ( ( e.ctrlKey || e.metaKey ) && e.key.toLowerCase() === 'a' ) {
				e.preventDefault();
				e.stopPropagation();
				action( 'all' );
				return;
			}
			if (
				[ 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown' ].includes(
					e.key
				) &&
				geometryRef.current.selected
			) {
				e.preventDefault();
				e.stopPropagation();
				const step = e.shiftKey ? 10 : 1;
				action( 'move', {
					x:
						e.key === 'ArrowLeft'
							? -step
							: e.key === 'ArrowRight'
							? step
							: 0,
					y:
						e.key === 'ArrowUp'
							? -step
							: e.key === 'ArrowDown'
							? step
							: 0,
				} );
				return;
			}
			if ( e.key === 'Escape' || e.key === 'Enter' ) {
				e.preventDefault();
				e.stopPropagation();
				commit();
				onDone();
			}
			if (
				( e.key === 'Delete' || e.key === 'Backspace' ) &&
				geometryRef.current.selected
			) {
				e.preventDefault();
				e.stopPropagation();
				action( 'delete' );
			}
		};
		window.addEventListener( 'keydown', key, true );
		return () => window.removeEventListener( 'keydown', key, true );
		// The ref reads the latest layer and selection without capturing a stale gesture.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ onDone, onContinue ] );
	if ( ! layer || ! subs || layer.locked ) {
		return null;
	}
	const map = coordinates( layer, zoom, pan ),
		baseScale = {
			x: layer.w / layer.penPath.w,
			y: layer.h / layer.penPath.h,
		};
	const relative = ( e ) => {
		const r = e.currentTarget.getBoundingClientRect();
		return {
			x: e.clientX - r.left,
			y: e.clientY - r.top,
		};
	};
	const hitPoint = ( p ) => {
		let hit = null;
		subs.forEach( ( sub, si ) =>
			sub.anchors.forEach( ( a, ai ) => {
				for ( const kind of [ 'hIn', 'hOut', 'anchor' ] ) {
					if (
						kind !== 'anchor' &&
						( ! selected ||
							selected.si !== si ||
							Math.abs( selected.ai - ai ) > 1 )
					) {
						continue;
					}
					const point = kind === 'anchor' ? a : a[ kind ];
					if ( ! point ) {
						continue;
					}
					const q = map.screen( point ),
						distance = Math.hypot( q.x - p.x, q.y - p.y );
					if (
						distance < 9 &&
						( ! hit || distance < hit.distance )
					) {
						hit = {
							si,
							ai,
							kind,
							distance,
						};
					}
				}
			} )
		);
		return hit;
	};
	const widthGrips = () => {
		const style = layer.penPath.style,
			markers = style.markers.length
				? style.markers
				: [ { t: 0.5, value: 1 } ];
		return penSamples( layer.penPath.d ).flatMap( ( sub, si ) =>
			markers.map( ( m, i ) => {
				const point = penPointAt( layer.penPath.d, m.t, si ),
					width = penWidthAt( m.t, style, sub.closed ),
					shift = ( width * ( 1 + style.bias / 100 ) ) / 2;
				return {
					i,
					si,
					t: m.t,
					center: map.screen( {
						x: point.x * baseScale.x,
						y: point.y * baseScale.y,
					} ),
					point: map.screen( {
						x: ( point.x + point.normal.x * shift ) * baseScale.x,
						y: ( point.y + point.normal.y * shift ) * baseScale.y,
					} ),
				};
			} )
		);
	};

	const updateWidth = ( base, p, index, subIndex ) => {
		const at = coordinates( base, zoom, pan ).local( p ),
			raw = {
				x: ( at.x * base.penPath.w ) / base.w,
				y: ( at.y * base.penPath.h ) / base.h,
			},
			parts = penSamples( base.penPath.d ),
			pts = parts.flatMap( ( sub, si ) =>
				subIndex === undefined || subIndex === si
					? sub.pts.map( ( q ) => ( { ...q, si } ) )
					: []
			);
		let best = null;
		for ( const q of pts ) {
			const d = Math.hypot( q.x - raw.x, q.y - raw.y );
			if ( ! best || d < best.distance ) {
				best = {
					...q,
					distance: d,
				};
			}
		}
		if ( ! best ) {
			return;
		}
		const t = Math.max( 0.005, Math.min( 0.995, best.t ) ),
			center = penPointAt( base.penPath.d, t, best.si ),
			style = base.penPath.style;
		const width =
				( Math.abs(
					( raw.x - center.x ) * center.normal.x +
						( raw.y - center.y ) * center.normal.y
				) *
					2 ) /
				Math.max( 0.1, 1 + style.bias / 100 ),
			normalWidth = penWidthAt(
				t,
				{
					...style,
					markers: [],
				},
				parts[ best.si ].closed
			);
		const markers = style.markers.slice();
		markers[ index ] = {
			t,
			value: Math.max(
				0.02,
				Math.min( 3, width / Math.max( 0.1, normalWidth ) )
			),
		};
		editor.dispatch( {
			type: 'UPDATE_LAYER',
			id: base.id,
			patch: penLayerPatch( base, {
				...style,
				markers,
			} ),
		} );
		dirty.current = true;
	};
	const cornerGrips = () =>
		subs.flatMap( ( sub, si ) =>
			sub.anchors.flatMap( ( a, ai ) => {
				const corner = penCorner( subs, si, ai );
				if ( ! corner ) {
					return [];
				}
				const radius = Math.min( corner.maxRadius, 14 / zoom ),
					inset = radius / Math.sin( corner.angle / 2 );
				return [
					{
						si,
						ai,
						corner,
						point: map.screen( {
							x: a.x + corner.bisect.x * inset,
							y: a.y + corner.bisect.y * inset,
						} ),
					},
				];
			} )
		);
	const joinTarget = ( targetLayer, hit ) => {
		const first = selectedPoints( selected )[ 0 ];
		if ( ! endpoint( subs, first ) ) {
			if ( targetLayer.id === layer.id ) {
				setSelected( { si: hit.si, ai: hit.ai } );
			}
			return;
		}
		let next = subs,
			second = hit;
		if ( targetLayer.id !== layer.id ) {
			const other = parsePathAnchors( penSourceD( targetLayer ) ),
				otherMap = coordinates( targetLayer );
			const converted = mapPenSubs( other, ( p ) =>
				coordinates( layer ).local( otherMap.screen( p ) )
			);
			second = { si: subs.length + hit.si, ai: hit.ai };
			next = [ ...subs, ...converted ];
		}
		const joined = joinPenPaths(
			next,
			first,
			second,
			!! editor.state.toolOpts.pen?.smoothJoin
		);
		if ( joined === next ) {
			return;
		}
		write( layer, joined );
		if ( targetLayer.id !== layer.id ) {
			editor.dispatch( {
				type: 'REMOVE_LAYERS',
				ids: [ targetLayer.id ],
			} );
		}
		commit();
		setSelected( null );
	};
	const styleWrite = ( base, patch ) => {
		if (
			! base ||
			base.locked ||
			ancestorLocked( editor.state.layers, base )
		) {
			return;
		}
		editor.dispatch( {
			type: 'UPDATE_LAYER',
			id: base.id,
			patch: penLayerPatch( base, { ...base.penPath.style, ...patch } ),
		} );
		dirty.current = true;
	};
	const closestT = ( base, p, si = 0 ) => {
		const at = coordinates( base, zoom, pan ).local( p ),
			raw = {
				x: ( at.x * base.penPath.w ) / base.w,
				y: ( at.y * base.penPath.h ) / base.h,
			},
			pts = penSamples( base.penPath.d )[ si ]?.pts || [];
		let best = { distance: Infinity, t: 0 };
		for ( const q of pts ) {
			const distance = Math.hypot( q.x - raw.x, q.y - raw.y );
			if ( distance < best.distance ) {
				best = { distance, t: q.t };
			}
		}
		return best.t;
	};
	const refScreen = ( t, si = 0 ) => {
		const p = penPointAt( layer.penPath.d, t, si );
		return p
			? map.screen( { x: p.x * baseScale.x, y: p.y * baseScale.y } )
			: null;
	};
	const mirrorScreen = ( p, base = layer ) => {
		const m = coordinates( base, zoom, pan ),
			local = m.local( p ),
			axis =
				base.penPath.style.symmetryAxis *
				( base.penPath.style.symmetry === 'vertical'
					? base.w / base.penPath.w
					: base.h / base.penPath.h );
		return m.screen(
			mirrorPenPoint( local, base.penPath.style.symmetry, axis )
		);
	};
	const down = ( e ) => {
		if ( e.button !== 0 ) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		e.currentTarget.focus( { preventScroll: true } );
		const mirrored = !! e.target.closest?.( '[data-pen-mirror]' );
		const p = mirrored ? mirrorScreen( relative( e ) ) : relative( e ),
			local = map.local( p );
		const data = e.target.dataset;
		if ( data.penAxis ) {
			drag.current = { kind: 'axis', layer };
			e.currentTarget.setPointerCapture( e.pointerId );
			return;
		}
		if ( data.penCenter ) {
			drag.current = { kind: 'center', layer };
			e.currentTarget.setPointerCapture( e.pointerId );
			return;
		}
		if ( mode === 'colors' && data.penColor !== undefined ) {
			drag.current = {
				kind: 'colors',
				layer,
				index: Number( data.penColor ),
				si: Number( data.penSub || 0 ),
			};
			e.currentTarget.setPointerCapture( e.pointerId );
			return;
		}
		if ( mode === 'trim' && data.penTrim ) {
			drag.current = {
				kind: 'trim',
				layer,
				field: data.penTrim,
				si: Number( data.penSub || 0 ),
			};
			e.currentTarget.setPointerCapture( e.pointerId );
			return;
		}
		if ( mode === 'colors' || mode === 'trim' ) {
			return;
		}
		if ( mode === 'redraw' ) {
			const hit = nearestPenSegment( subs, local, 16 / zoom );
			if ( ! hit ) {
				return;
			}
			drag.current = {
				kind: 'redraw',
				mirrored,
				layer,
				subs,
				hit,
				points: [ { x: hit.x, y: hit.y } ],
			};
			setRedrawPoints( [ p ] );
			e.currentTarget.setPointerCapture( e.pointerId );
			return;
		}
		if ( mode === 'sculpt' ) {
			const radius =
				( editor.state.toolOpts.pen?.sculptRadius ?? 70 ) / zoom;
			drag.current = {
				kind: 'sculpt',
				mirrored,
				layer,
				subs: refinePenArea( subs, local, radius ),
				start: local,
				radius,
			};
			e.currentTarget.setPointerCapture( e.pointerId );
			return;
		}

		if ( mode === 'join' ) {
			const target = e.target.dataset;
			if ( target.joinLayer ) {
				const other = editor.state.layers.find(
					( l ) => l.id === target.joinLayer
				);
				if ( other && ! other.locked ) {
					joinTarget( other, {
						si: Number( target.joinSi ),
						ai: Number( target.joinAi ),
					} );
				}
				return;
			}
			const hit = hitPoint( p );
			if ( endpoint( subs, hit ) ) {
				joinTarget( layer, hit );
			}
			return;
		}
		if ( mode === 'continue' ) {
			const hit = hitPoint( p );
			if ( endpoint( subs, hit ) ) {
				const next = penContinuation( layer, hit.si, hit.ai );
				if ( next ) {
					onContinue?.( next );
				}
			}
			return;
		}
		if ( mode === 'cut' ) {
			const hit =
				hitPoint( p ) || nearestPenSegment( subs, local, 12 / zoom );
			if ( hit ) {
				const next = cutPenPath( subs, hit );
				if ( next !== subs ) {
					write( layer, next );
					commit();
					setSelected( null );
				}
			}
			return;
		}
		if ( mode === 'round' ) {
			const hit =
				cornerGrips().find(
					( g ) => Math.hypot( g.point.x - p.x, g.point.y - p.y ) < 12
				) || hitPoint( p );
			if ( ! hit ) {
				return;
			}
			const corner = penCorner( subs, hit.si, hit.ai );
			if ( ! corner ) {
				return;
			}
			drag.current = {
				kind: 'round',
				mirrored,
				layer,
				subs,
				si: hit.si,
				ai: hit.ai,
				corner,
			};
			e.currentTarget.setPointerCapture( e.pointerId );
			return;
		}
		if ( mode === 'smooth' ) {
			drag.current = {
				kind: 'smooth',
				mirrored,
				layer,
				subs,
				touches: [ local ],
			};
			e.currentTarget.setPointerCapture( e.pointerId );
			return;
		}
		if ( mode === 'width' ) {
			const grips = widthGrips();
			const hit = grips.find(
				( g ) => Math.hypot( g.point.x - p.x, g.point.y - p.y ) < 12
			);
			if ( e.altKey && hit ) {
				editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: penLayerPatch( layer, {
						...layer.penPath.style,
						markers: layer.penPath.style.markers.filter(
							( _, i ) => i !== hit.i
						),
					} ),
				} );
				dirty.current = true;
				commit();
				return;
			}
			const i = hit ? hit.i : layer.penPath.style.markers.length;
			if ( i >= 32 ) {
				return;
			}
			drag.current = {
				kind: 'width',
				layer,
				index: i,
				subIndex: hit?.si,
			};
			if ( ! hit ) {
				updateWidth( layer, p, i );
			}
		} else {
			const hit = hitPoint( p );
			if ( hit ) {
				const point = { si: hit.si, ai: hit.ai };
				let points = selectedPoints( selected );
				const included = points.some( ( q ) => samePoint( q, point ) );
				if ( e.shiftKey && hit.kind === 'anchor' ) {
					points = included
						? points.filter( ( q ) => ! samePoint( q, point ) )
						: [ ...points, point ];
				} else if ( ! included ) {
					points = [ point ];
				}
				setSelected(
					points.length ? { ...points.at( -1 ), points } : null
				);
				if ( e.shiftKey && included ) {
					return;
				}
				drag.current = {
					points,
					...hit,
					layer,
					subs,
					start: local,
				};
			} else {
				const on = nearestPenSegment( subs, local, 12 / zoom );
				if ( on ) {
					if ( ! e.altKey ) {
						drag.current = {
							kind: 'bend',
							hit: on,
							layer,
							subs,
						};
						setSelected( null );
					} else {
						const next = insertAnchor( subs, on.si, on.seg, on.t ),
							ai = on.seg + 1;
						drag.current = {
							kind: 'anchor',
							si: on.si,
							ai,
							layer,
							subs: next,
							start: { x: on.x, y: on.y },
						};
						setSelected( {
							si: on.si,
							ai,
						} );
						write( layer, next );
					}
				} else {
					setSelected( null );
					return;
				}
			}
		}
		if ( drag.current ) {
			drag.current.mirrored = mirrored;
		}
		e.currentTarget.setPointerCapture( e.pointerId );
	};
	const move = ( e ) => {
		const g = drag.current;
		if ( mode === 'smooth' || mode === 'sculpt' ) {
			setBrushPoint( relative( e ) );
		}
		if ( ! g ) {
			return;
		}
		e.stopPropagation();
		const p = g.mirrored
			? mirrorScreen( relative( e ), g.layer )
			: relative( e );
		if ( g.kind === 'width' ) {
			updateWidth( g.layer, p, g.index, g.subIndex );
			return;
		}
		const local = coordinates( g.layer, zoom, pan ).local( p );
		if ( g.kind === 'center' ) {
			styleWrite( g.layer, {
				symmetryX: local.x * ( g.layer.penPath.w / g.layer.w ),
				symmetryY: local.y * ( g.layer.penPath.h / g.layer.h ),
			} );
			return;
		}
		if ( g.kind === 'axis' ) {
			const field =
				g.layer.penPath.style.symmetry === 'vertical' ? 'x' : 'y';
			styleWrite( g.layer, {
				symmetryAxis:
					local[ field ] *
					( field === 'x'
						? g.layer.penPath.w / g.layer.w
						: g.layer.penPath.h / g.layer.h ),
			} );
			return;
		}
		if ( g.kind === 'trim' ) {
			const t = closestT( g.layer, p, g.si ) * 100,
				st = g.layer.penPath.style;
			styleWrite( g.layer, {
				[ g.field ]:
					g.field === 'trimStart'
						? Math.min( st.trimEnd - 0.1, t )
						: Math.max( st.trimStart + 0.1, t ),
			} );
			return;
		}
		if ( g.kind === 'colors' ) {
			const st = g.layer.penPath.style,
				t =
					( closestT( g.layer, p, g.si ) * 100 - st.trimStart ) /
					Math.max( 0.1, st.trimEnd - st.trimStart ),
				colors = st.colors.slice(),
				lo = g.index ? colors[ g.index - 1 ].t + 0.005 : 0,
				hi =
					g.index < colors.length - 1
						? colors[ g.index + 1 ].t - 0.005
						: 1;
			colors[ g.index ] = {
				...colors[ g.index ],
				t: Math.max( lo, Math.min( hi, t ) ),
			};
			styleWrite( g.layer, { colors } );
			return;
		}
		if ( g.kind === 'redraw' ) {
			if (
				g.points.length < 2000 &&
				Math.hypot(
					local.x - g.points.at( -1 ).x,
					local.y - g.points.at( -1 ).y
				) >
					1 / zoom
			) {
				g.points.push( local );
				const m = coordinates( g.layer, zoom, pan );
				setRedrawPoints( g.points.map( ( q ) => m.screen( q ) ) );
			}
			return;
		}
		if ( g.kind === 'sculpt' ) {
			write(
				g.layer,
				sculptPenPath(
					g.subs,
					g.start,
					local,
					g.radius,
					( editor.state.toolOpts.pen?.sculptStrength ?? 70 ) / 100,
					editor.state.toolOpts.pen?.sculptMode || 'push'
				)
			);
			return;
		}

		if ( g.kind === 'round' ) {
			const c = g.corner;
			const radius = Math.max(
				0,
				( ( local.x - c.a.x ) * c.bisect.x +
					( local.y - c.a.y ) * c.bisect.y ) *
					Math.sin( c.angle / 2 )
			);
			write( g.layer, roundPenCorner( g.subs, g.si, g.ai, radius ) );
			return;
		}
		if ( g.kind === 'smooth' ) {
			if ( g.touches.length < 160 ) {
				g.touches.push( local );
			} else {
				g.touches[ g.touches.length - 1 ] = local;
			}
			write(
				g.layer,
				locallySmoothPen(
					g.subs,
					g.touches,
					( editor.state.toolOpts.pen?.smoothRadius || 40 ) / zoom,
					( editor.state.toolOpts.pen?.smoothStrength ?? 50 ) / 100
				)
			);
			return;
		}
		if ( g.kind === 'bend' ) {
			write( g.layer, bendPenSegment( g.subs, g.hit, local ) );
			return;
		}
		const next = g.subs.map( ( s ) => ( {
				...s,
				anchors: s.anchors.map( ( a ) => ( {
					...a,
				} ) ),
			} ) ),
			a = next[ g.si ].anchors[ g.ai ],
			old = g.subs[ g.si ].anchors[ g.ai ];
		if ( g.kind === 'anchor' ) {
			const origin = g.start || old;
			write(
				g.layer,
				movePenPoints(
					g.subs,
					g.points || [ { si: g.si, ai: g.ai } ],
					local.x - origin.x,
					local.y - origin.y
				)
			);
			return;
		}

		let target = local;
		if ( e.shiftKey ) {
			const r = Math.hypot( local.x - a.x, local.y - a.y ),
				angle =
					( Math.round(
						Math.atan2( local.y - a.y, local.x - a.x ) /
							( Math.PI / 4 )
					) *
						Math.PI ) /
					4;
			target = {
				x: a.x + Math.cos( angle ) * r,
				y: a.y + Math.sin( angle ) * r,
			};
		}
		a[ g.kind ] = target;
		const other = g.kind === 'hIn' ? 'hOut' : 'hIn';
		if ( a[ other ] && ! e.altKey ) {
			const len = Math.hypot( a[ other ].x - a.x, a[ other ].y - a.y ),
				r = Math.hypot( target.x - a.x, target.y - a.y ) || 1;
			a[ other ] = {
				x: a.x - ( ( target.x - a.x ) * len ) / r,
				y: a.y - ( ( target.y - a.y ) * len ) / r,
			};
		}
		write( g.layer, next );
	};
	const up = ( e ) => {
		const g = drag.current;
		if ( g?.kind === 'redraw' ) {
			if ( e?.type !== 'pointercancel' ) {
				const hit = nearestPenSegment(
					g.subs,
					g.points.at( -1 ),
					20 / zoom
				);
				const next =
					hit &&
					replacePenSection(
						g.subs,
						g.hit,
						hit,
						g.points,
						1.5 / zoom
					);
				if ( next ) {
					write( g.layer, next );
					setSelected( null );
				}
			}
			setRedrawPoints( [] );
		}
		if ( drag.current?.kind === 'round' ) {
			setSelected( null );
		}
		commit();
		drag.current = null;
	};
	const markers = [];
	if ( mode === 'width' ) {
		for ( const g of widthGrips() ) {
			markers.push(
				<g key={ `${ g.si }:${ g.i }` }>
					<line
						x1={ g.center.x }
						y1={ g.center.y }
						x2={ g.point.x }
						y2={ g.point.y }
					/>
					<circle
						className="pp-grip"
						cx={ g.point.x }
						cy={ g.point.y }
						r="6"
					/>
				</g>
			);
		}
	} else if ( ! [ 'colors', 'trim' ].includes( mode ) ) {
		subs.forEach( ( s, si ) =>
			s.anchors.forEach( ( a, ai ) => {
				const point = map.screen( a ),
					chosen = selectedPoints( selected ).some(
						( q ) => q.si === si && q.ai === ai
					);
				if (
					selected?.si === si &&
					Math.abs( selected.ai - ai ) <= 1
				) {
					for ( const kind of [ 'hIn', 'hOut' ] ) {
						if ( ! a[ kind ] ) {
							continue;
						}
						const q = map.screen( a[ kind ] );
						markers.push(
							<g key={ `${ si }-${ ai }-${ kind }` }>
								<line
									x1={ point.x }
									y1={ point.y }
									x2={ q.x }
									y2={ q.y }
								/>
								<circle
									className="pp-grip"
									cx={ q.x }
									cy={ q.y }
									r="5"
								/>
							</g>
						);
					}
				}
				markers.push(
					<rect
						key={ `${ si }-${ ai }` }
						x={ point.x - 4 }
						y={ point.y - 4 }
						width="8"
						height="8"
						data-pen-node={ `${ si }:${ ai }` }
						className={ chosen ? 'pp-grip selected' : 'pp-grip' }
					/>
				);
			} )
		);
	}
	if ( mode === 'round' ) {
		for ( const g of cornerGrips() ) {
			markers.push(
				<circle
					key={ 'round' + g.si + ':' + g.ai }
					className="pp-grip pp-round-grip"
					cx={ g.point.x }
					cy={ g.point.y }
					r="6"
				>
					<title>
						{ __( 'Drag to round this corner', 'wunderpaint' ) }
					</title>
				</circle>
			);
		}
	}
	if ( mode === 'join' ) {
		for ( const other of editor.state.layers.filter(
			( l ) =>
				l.id !== layer.id &&
				isPenLayer( l ) &&
				! l.locked &&
				l.visible !== false &&
				! ancestorLocked( editor.state.layers, l ) &&
				! ancestorHidden( editor.state.layers, l )
		) ) {
			const otherMap = coordinates( other, zoom, pan ),
				otherSubs = parsePathAnchors( penSourceD( other ) );
			otherSubs?.forEach( ( sub, si ) => {
				if ( sub.closed ) {
					return;
				}
				for ( const ai of [ 0, sub.anchors.length - 1 ] ) {
					const q = otherMap.screen( sub.anchors[ ai ] );
					markers.push(
						<circle
							key={ 'join' + other.id + ':' + si + ':' + ai }
							data-join-layer={ other.id }
							data-join-si={ si }
							data-join-ai={ ai }
							className="pp-grip pp-join-grip"
							cx={ q.x }
							cy={ q.y }
							r="7"
						>
							<title>
								{ __( 'Join this endpoint', 'wunderpaint' ) }
							</title>
						</circle>
					);
				}
			} );
		}
	}
	const extraGrips = [];
	if ( mode === 'colors' ) {
		penSamples( layer.penPath.d ).forEach( ( sub, si ) =>
			layer.penPath.style.colors?.forEach( ( stop, i ) => {
				const st = layer.penPath.style,
					p = refScreen(
						( st.trimStart +
							( st.trimEnd - st.trimStart ) * stop.t ) /
							100,
						si
					);
				if ( p ) {
					extraGrips.push(
						<circle
							className="pp-grip pp-color-grip"
							style={ { fill: stop.color } }
							data-pen-color={ i }
							data-pen-sub={ si }
							key={ 'color' + si + ':' + i }
							cx={ p.x }
							cy={ p.y }
							r="7"
						/>
					);
				}
			} )
		);
	}
	if ( mode === 'trim' ) {
		penSamples( layer.penPath.d ).forEach( ( sub, si ) =>
			[ 'trimStart', 'trimEnd' ].forEach( ( field ) => {
				const p = refScreen( layer.penPath.style[ field ] / 100, si );
				if ( p ) {
					extraGrips.push(
						<rect
							className="pp-grip pp-trim-grip"
							data-pen-trim={ field }
							data-pen-sub={ si }
							key={ field + si }
							x={ p.x - 6 }
							y={ p.y - 6 }
							width="12"
							height="12"
						/>
					);
				}
			} )
		);
	}
	// Only the single mirrors edit their twin directly; radial copies are
	// shown by the outline and turn around a centre grip.
	const mirrored = [ 'vertical', 'horizontal' ].includes(
		layer.penPath.style.symmetry
	);
	if ( RADIAL_SYMMETRY.includes( layer.penPath.style.symmetry ) ) {
		const st = layer.penPath.style,
			c = map.screen( {
				x: st.symmetryX * baseScale.x,
				y: st.symmetryY * baseScale.y,
			} );
		extraGrips.push(
			<g key="center">
				<circle
					className="pp-grip pp-axis-grip"
					data-pen-center="1"
					cx={ c.x }
					cy={ c.y }
					r="7"
				>
					<title>
						{ __( 'Move symmetry center', 'wunderpaint' ) }
					</title>
				</circle>
			</g>
		);
	}
	let mirrorTransform = '';
	if ( mirrored ) {
		const o = mirrorScreen( { x: 0, y: 0 } ),
			x = mirrorScreen( { x: 1, y: 0 } ),
			y = mirrorScreen( { x: 0, y: 1 } );
		mirrorTransform = `matrix(${ x.x - o.x } ${ x.y - o.y } ${
			y.x - o.x
		} ${ y.y - o.y } ${ o.x } ${ o.y })`;
		const vertical = layer.penPath.style.symmetry === 'vertical',
			axis =
				layer.penPath.style.symmetryAxis *
				( vertical ? baseScale.x : baseScale.y ),
			a = map.screen(
				vertical ? { x: axis, y: -10000 } : { x: -10000, y: axis }
			),
			b = map.screen(
				vertical ? { x: axis, y: 10000 } : { x: 10000, y: axis }
			),
			c = map.screen(
				vertical
					? { x: axis, y: layer.h / 2 }
					: { x: layer.w / 2, y: axis }
			);
		extraGrips.push(
			<g key="axis">
				<line
					className="pp-mirror-axis"
					x1={ a.x }
					y1={ a.y }
					x2={ b.x }
					y2={ b.y }
				/>
				<circle
					className="pp-grip pp-axis-grip"
					data-pen-axis="1"
					cx={ c.x }
					cy={ c.y }
					r="7"
				>
					<title>{ __( 'Move symmetry axis', 'wunderpaint' ) }</title>
				</circle>
			</g>
		);
	}
	const transform = `translate(${ pan.x } ${
		pan.y
	}) scale(${ zoom }) translate(${ layer.x + layer.w / 2 } ${
		layer.y + layer.h / 2
	}) rotate(${ layer.rot || 0 }) scale(${ layer.flipX ? -1 : 1 } ${
		layer.flipY ? -1 : 1
	}) translate(${ -layer.w / 2 } ${ -layer.h / 2 })`;
	return (
		<div
			className={ `pp-overlay pp-mode-${ mode }` }
			tabIndex={ -1 }
			aria-label={ __( 'Edit pen path', 'wunderpaint' ) }
			onPointerDown={ down }
			onPointerMove={ move }
			onPointerUp={ up }
			onPointerCancel={ up }
			onDoubleClick={ ( e ) => {
				e.stopPropagation();
				if ( mode !== 'points' ) {
					return;
				}
				const hit = hitPoint( relative( e ) );
				if ( hit ) {
					setSelected( {
						si: hit.si,
						ai: hit.ai,
					} );
					const next = setPenPointType(
						subs,
						hit,
						subs[ hit.si ].anchors[ hit.ai ].hOut
							? 'corner'
							: 'smooth'
					);
					write( layer, next );
					commit();
				} else if ( mode !== 'width' ) {
					const segment = nearestPenSegment(
						subs,
						map.local( relative( e ) ),
						12 / zoom
					);
					if ( segment ) {
						write(
							layer,
							insertAnchor(
								subs,
								segment.si,
								segment.seg,
								segment.t
							)
						);
						setSelected( { si: segment.si, ai: segment.seg + 1 } );
						commit();
					}
				}
			} }
		>
			<svg width="100%" height="100%">
				<path
					className="pp-hit"
					d={ layer.pathD }
					transform={ transform }
					fill="transparent"
				/>
				<path
					className="pp-hit-line"
					d={ source }
					transform={ transform }
					fill="none"
					stroke="transparent"
					strokeWidth={ 24 / zoom }
				/>
				<path
					d={ source }
					transform={ transform }
					fill="none"
					stroke="var(--accent)"
					strokeWidth={ 1.3 / zoom }
				/>
				{ mirrored && (
					<g transform={ mirrorTransform } data-pen-mirror="1">
						<path
							className="pp-hit-line"
							d={ source }
							transform={ transform }
							fill="none"
							stroke="transparent"
							strokeWidth={ 24 / zoom }
						/>
						<path
							d={ source }
							transform={ transform }
							fill="none"
							stroke="var(--accent)"
							strokeWidth={ 1.3 / zoom }
						/>
						{ [ 'points', 'width' ].includes( mode ) && markers }
					</g>
				) }
				{ markers }
				{ extraGrips }
				{ redrawPoints.length > 1 && (
					<polyline
						className="pp-redraw-preview"
						points={ redrawPoints
							.map( ( p ) => `${ p.x },${ p.y }` )
							.join( ' ' ) }
						fill="none"
						stroke="var(--accent)"
						strokeWidth="2"
					/>
				) }

				{ ( mode === 'smooth' || mode === 'sculpt' ) && brushPoint && (
					<circle
						className="pp-brush-radius"
						cx={ brushPoint.x }
						cy={ brushPoint.y }
						r={
							mode === 'sculpt'
								? editor.state.toolOpts.pen?.sculptRadius ?? 70
								: editor.state.toolOpts.pen?.smoothRadius || 40
						}
					/>
				) }
			</svg>
		</div>
	);
}
