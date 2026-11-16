/**
 * Moving and turning in the picture, shared by the 3D studios (since
 * 20.10.2026; first in the Solar System Studio 0.17.0).
 *
 * A click selects what is under the pointer; a drag that starts on the
 * selection moves it in the picture plane (its depth stays), with Shift
 * towards or away from the viewer (drag up = away), with Alt turns it like
 * a ball under the hand. Empty space and everything not selected still go
 * to the studio's camera, so a large object never gets in the way of
 * turning the view. Escape during a drag puts it back without closing the
 * studio.
 *
 * The values are written through the studio's own fields (the ones its
 * sliders edit), so saved documents keep their shape.
 *
 * three.js comes in as a parameter: this folder has no node_modules, and a
 * module here may only import relative paths (see three3d/README.md).
 */

/**
 * The maths, bound to the studio's three.js.
 *
 * @param {Object} THREE three.js namespace.
 * @return {Object} { clampPosition, eulerDegrees, dragTurn, worldPerPixel }.
 */
export function directEditMath( THREE ) {
	const deg = THREE.MathUtils.radToDeg;
	// Rounded like a slider, without float noise (4.0600000000000005).
	const round = ( v, step ) => {
		const places = Math.max( 0, Math.ceil( -Math.log10( step ) - 1e-9 ) );
		return +( Math.round( v / step ) * step ).toFixed( places ) + 0;
	};
	const wrap = ( v ) => ( ( ( ( v + 180 ) % 360 ) + 360 ) % 360 ) - 180;

	/**
	 * A position kept inside the sliders' ranges, rounded like a slider.
	 *
	 * @param {number[]} p     [x, y, z].
	 * @param {Array}    range Three [min, max] pairs.
	 * @param {number}   step  Rounding.
	 * @return {number[]} New array.
	 */
	function clampPosition( p, range, step = 0.01 ) {
		return p.map( ( v, i ) =>
			round(
				Math.min( range[ i ][ 1 ], Math.max( range[ i ][ 0 ], v ) ),
				step
			)
		);
	}

	/**
	 * Euler angles in degrees in three.js order XYZ, as rotation sliders
	 * store them. Every orientation has two such triples; the one nearer
	 * the sliders' last values is taken, so a small turn by hand moves the
	 * sliders a little instead of flipping them to the twin.
	 *
	 * @param {THREE.Quaternion} q    Orientation.
	 * @param {number[]}         near Previous [x, y, z] in degrees, if any.
	 * @return {number[]} Degrees, tenths, each -180 to 180.
	 */
	function eulerDegrees( q, near = null ) {
		const e = new THREE.Euler().setFromQuaternion( q, 'XYZ' );
		const a = [ e.x, e.y, e.z ].map( deg );
		const twin = [ a[ 0 ] + 180, 180 - a[ 1 ], a[ 2 ] + 180 ];
		const off = ( c ) =>
			near
				? c.reduce(
						( sum, v, i ) => sum + Math.abs( wrap( v - near[ i ] ) ),
						0
				  )
				: 0;
		const best = near && off( twin ) < off( a ) ? twin : a;
		return best.map( ( v ) => round( wrap( v ), 0.1 ) );
	}

	/**
	 * The turn a drag by (dx, dy) pixels gives: about the axis in the
	 * picture plane at right angles to the drag, so the front follows the
	 * hand.
	 *
	 * @param {number}           dx     Pixels to the right.
	 * @param {number}           dy     Pixels down.
	 * @param {THREE.Quaternion} camera The camera's orientation.
	 * @param {number}           speed  Radians per pixel.
	 * @return {THREE.Quaternion} World-space turn.
	 */
	function dragTurn( dx, dy, camera, speed = 0.0075 ) {
		const len = Math.hypot( dx, dy );
		if ( ! len ) {
			return new THREE.Quaternion();
		}
		const axis = new THREE.Vector3( dy / len, dx / len, 0 ).applyQuaternion(
			camera
		);
		return new THREE.Quaternion().setFromAxisAngle( axis, len * speed );
	}

	/**
	 * World units per screen pixel at a point, for a perspective or an
	 * orthographic camera.
	 *
	 * @param {THREE.Camera}  camera Camera.
	 * @param {THREE.Vector3} at     World point.
	 * @param {number}        height Canvas height in CSS pixels.
	 * @return {number} Units per pixel.
	 */
	function worldPerPixel( camera, at, height ) {
		const h = height || 1,
			zoom = camera.zoom || 1;
		if ( camera.isOrthographicCamera ) {
			return ( camera.top - camera.bottom ) / zoom / h;
		}
		const dist = camera.position.distanceTo( at );
		return (
			( 2 * dist * Math.tan( THREE.MathUtils.degToRad( camera.fov / 2 ) ) ) /
			( h * zoom )
		);
	}

	return { clampPosition, eulerDegrees, dragTurn, worldPerPixel, wrap, round };
}

/**
 * Pointer handling on a studio's stage. It listens on the stage element in
 * the capture phase, so a drag on the selection is taken before the camera
 * controls on the canvas see it.
 *
 * @param {Object}   THREE           three.js namespace.
 * @param {Object}   o               Studio adapter.
 * @param {Element}  o.el            Stage element holding the canvas.
 * @param {Element}  o.canvas        The renderer's canvas.
 * @param {Function} o.camera        () => current camera.
 * @param {Function} o.pick          ( ray, only ) => { kind, id, distance }
 *                                   or null; ray is set from the pointer,
 *                                   only = { kind, id } to test just that.
 * @param {Function} o.selection     () => { kind, id } or null.
 * @param {Function} o.target        ( sel ) => what a drag edits, or null:
 *   { object3d, range, locked, rollOnly, get(), set( { position, rotation } ),
 *     begin(), turn( quaternion ), cancel() } - object3d gives the start
 *   position and orientation (its parent maps world to stored values),
 *   get() returns { position: [3], rotation: [3] in degrees }; begin, turn
 *   and cancel are optional hooks (the Solar rings use them).
 * @param {Function} o.onPick        ( hit ) on a click.
 * @param {Function} o.onChange      ( 'move' | 'end' ) after each change.
 * @return {{dispose: Function, dragging: Function}} Controller.
 */
export function createDirectEdit( THREE, o ) {
	const M = directEditMath( THREE );
	const ray = new THREE.Raycaster();
	let drag = null,
		down = null,
		hoverQueued = 0;

	const setRay = ( event ) => {
		const rect = o.canvas.getBoundingClientRect();
		ray.setFromCamera(
			new THREE.Vector2(
				( ( event.clientX - rect.left ) / rect.width ) * 2 - 1,
				1 - ( ( event.clientY - rect.top ) / rect.height ) * 2
			),
			o.camera()
		);
		return ray;
	};
	const pick = ( event, only = null ) => o.pick( setRay( event ), only );

	function onDown( event ) {
		down = 0 === event.button ? { x: event.clientX, y: event.clientY } : null;
		const sel = o.selection();
		if ( 0 !== event.button || ! sel || drag ) {
			return;
		}
		const target = o.target( sel );
		if ( ! target || target.locked ) {
			return;
		}
		const hit = pick( event );
		if ( ! hit || hit.kind !== sel.kind || hit.id !== sel.id ) {
			return;
		}
		// Ours: the camera controls on the canvas never see this press.
		event.stopPropagation();
		event.preventDefault();
		o.el.setPointerCapture?.( event.pointerId );
		const camera = o.camera(),
			obj = target.object3d,
			world = obj.getWorldPosition( new THREE.Vector3() ),
			forward = camera.getWorldDirection( new THREE.Vector3() ),
			plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
				forward,
				world
			),
			start = new THREE.Vector3();
		if ( ! setRay( event ).ray.intersectPlane( plane, start ) ) {
			start.copy( world );
		}
		const before = target.get();
		target.begin?.();
		drag = {
			mode: event.altKey ? 'turn' : event.shiftKey ? 'depth' : 'move',
			target,
			plane,
			forward,
			world,
			offset: world.clone().sub( start ),
			y0: event.clientY,
			last: [ event.clientX, event.clientY ],
			q: obj.getWorldQuaternion( new THREE.Quaternion() ),
			parentQ: obj.parent
				? obj.parent.getWorldQuaternion( new THREE.Quaternion() )
				: new THREE.Quaternion(),
			before: {
				position: before.position.slice(),
				rotation: before.rotation.slice(),
			},
		};
		o.el.style.cursor = 'grabbing';
		window.addEventListener( 'keydown', onKey, true );
	}

	function onMove( event ) {
		const d = drag;
		if ( ! d ) {
			hover( event );
			return;
		}
		const camera = o.camera(),
			now = d.target.get();
		if ( 'turn' === d.mode ) {
			const dx = event.clientX - d.last[ 0 ],
				dy = event.clientY - d.last[ 1 ];
			d.last = [ event.clientX, event.clientY ];
			if ( d.target.rollOnly ) {
				// Aimed by something else (a comet by its light): the drag
				// only rolls it, as its angle slider does.
				const r = now.rotation.slice();
				r[ 2 ] = M.round( M.wrap( r[ 2 ] + dx * 0.5 ), 0.1 );
				d.target.set( { rotation: r } );
			} else {
				const turn = M.dragTurn( dx, dy, camera.quaternion );
				d.q.premultiply( turn );
				// Stored rotations are relative to the parent.
				const local = d.parentQ.clone().invert().multiply( d.q );
				d.target.set( {
					rotation: M.eulerDegrees( local, now.rotation ),
				} );
				d.target.turn?.( turn );
			}
		} else {
			const world = new THREE.Vector3();
			if ( 'depth' === d.mode ) {
				const per = M.worldPerPixel(
					camera,
					d.world,
					o.canvas.getBoundingClientRect().height
				);
				world
					.copy( d.world )
					.addScaledVector( d.forward, ( d.y0 - event.clientY ) * per * 1.5 );
			} else {
				if ( ! setRay( event ).ray.intersectPlane( d.plane, world ) ) {
					return;
				}
				world.add( d.offset );
			}
			d.target.object3d.parent?.worldToLocal( world );
			d.target.set( {
				position: M.clampPosition(
					world.toArray(),
					d.target.range,
					d.target.step
				),
			} );
		}
		o.onChange( 'move' );
	}

	function onUp( event ) {
		if ( drag ) {
			finish( event );
			return;
		}
		const was = down;
		down = null;
		if (
			! was ||
			Math.hypot( event.clientX - was.x, event.clientY - was.y ) > 4
		) {
			return;
		}
		const hit = pick( event );
		if ( hit ) {
			o.onPick( hit );
		}
	}

	function onKey( event ) {
		if ( 'Escape' !== event.key || ! drag ) {
			return;
		}
		// Escape cancels the drag and must not close the studio.
		event.stopPropagation();
		event.preventDefault();
		drag.target.set( drag.before );
		drag.target.cancel?.();
		finish();
	}

	function finish( event ) {
		if ( event ) {
			o.el.releasePointerCapture?.( event.pointerId );
		}
		drag = null;
		down = null;
		o.el.style.cursor = '';
		window.removeEventListener( 'keydown', onKey, true );
		o.onChange( 'end' );
	}

	// The hand cursor over what can be dragged, once per frame at most.
	function hover( event ) {
		if ( event.buttons || hoverQueued ) {
			return;
		}
		const { clientX, clientY } = event;
		hoverQueued = requestAnimationFrame( () => {
			hoverQueued = 0;
			const sel = o.selection(),
				target = sel && o.target( sel ),
				// The same test as a press: something nearer in front wins.
				hit = target && ! target.locked && pick( { clientX, clientY } );
			const over = !! hit && hit.kind === sel.kind && hit.id === sel.id;
			o.el.style.cursor = over ? 'grab' : '';
		} );
	}

	o.el.addEventListener( 'pointerdown', onDown, true );
	o.el.addEventListener( 'pointermove', onMove );
	o.el.addEventListener( 'pointerup', onUp );
	o.el.addEventListener( 'pointercancel', onUp );
	return {
		dragging: () => !! drag,
		pick,
		dispose() {
			cancelAnimationFrame( hoverQueued );
			window.removeEventListener( 'keydown', onKey, true );
			o.el.removeEventListener( 'pointerdown', onDown, true );
			o.el.removeEventListener( 'pointermove', onMove );
			o.el.removeEventListener( 'pointerup', onUp );
			o.el.removeEventListener( 'pointercancel', onUp );
		},
	};
}
