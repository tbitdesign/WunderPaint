/**
 * In-editor 360° viewer (v1.379.0): a dependency-free WebGL widget - the
 * same shaders and projection math as the embed (panorama.js is the one
 * source of truth). Premium handling to match the embed: eased camera
 * moves, auto-rotate with idle resume, a compass that flies back to the
 * front view, fullscreen, pinch and double-click zoom, icon markers.
 */

import {
	PANO_VERT,
	PANO_FRAG,
	screenFromYawPitch,
	yawPitchFromScreen,
} from '../lib/panorama';
import {
	HOTSPOT_SIZES,
	HOTSPOT_ICONS,
	HOTSPOT_DEFAULT_COLOR,
	hotspotTextColor,
} from '../lib/panorama-embed';

const easeInOut = ( k ) =>
	k < 0.5 ? 4 * k * k * k : 1 - Math.pow( -2 * k + 2, 3 ) / 2;

const BTN_CSS =
	'width:32px;height:32px;border:0;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0';

export class PanoramaViewer {
	/**
	 * @param {HTMLElement} container Host element (positioned).
	 * @param {Object}      opts      { onClick(yaw, pitch) } fired for a
	 *                                click without drag.
	 */
	constructor( container, opts = {} ) {
		this.container = container;
		this.onClick = opts.onClick || null;
		this.cam = { yaw: 0, pitch: 0, fov: 70 };
		this.vel = { x: 0, y: 0 };
		this.drag = null;
		this.moved = 0;
		this.dirty = true;
		this.dead = false;
		this.hotspots = [];
		this.marks = [];
		this.anim = null;
		this.rotOn = false;
		this.lastAct = Date.now();
		this.pts = {};
		this.pinchDist = 0;
		this.lastUp = 0;

		const canvas = document.createElement( 'canvas' );
		canvas.style.cssText =
			'width:100%;height:100%;display:block;cursor:grab;touch-action:none';
		container.appendChild( canvas );
		this.canvas = canvas;
		const gl =
			canvas.getContext( 'webgl' ) ||
			canvas.getContext( 'experimental-webgl' );
		this.gl = gl;
		if ( ! gl ) {
			return;
		}
		const sh = ( type, src ) => {
			const s = gl.createShader( type );
			gl.shaderSource( s, src );
			gl.compileShader( s );
			return s;
		};
		const prog = gl.createProgram();
		gl.attachShader( prog, sh( gl.VERTEX_SHADER, PANO_VERT ) );
		gl.attachShader( prog, sh( gl.FRAGMENT_SHADER, PANO_FRAG ) );
		gl.linkProgram( prog );
		gl.useProgram( prog );
		const buf = gl.createBuffer();
		gl.bindBuffer( gl.ARRAY_BUFFER, buf );
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array( [ -1, -1, 3, -1, -1, 3 ] ),
			gl.STATIC_DRAW
		);
		const loc = gl.getAttribLocation( prog, 'p' );
		gl.enableVertexAttribArray( loc );
		gl.vertexAttribPointer( loc, 2, gl.FLOAT, false, 0, 0 );
		this.uni = {
			yaw: gl.getUniformLocation( prog, 'yaw' ),
			pitch: gl.getUniformLocation( prog, 'pitch' ),
			fov: gl.getUniformLocation( prog, 'fov' ),
			aspect: gl.getUniformLocation( prog, 'aspect' ),
		};

		this.buildControls();

		canvas.addEventListener( 'pointerdown', ( e ) => {
			this.act();
			this.anim = null;
			this.pts[ e.pointerId ] = e;
			if ( 1 === Object.keys( this.pts ).length ) {
				this.drag = { x: e.clientX, y: e.clientY };
				this.moved = 0;
				this.vel = { x: 0, y: 0 };
				canvas.setPointerCapture( e.pointerId );
				canvas.style.cursor = 'grabbing';
			}
		} );
		canvas.addEventListener( 'pointermove', ( e ) => {
			if ( ! this.pts[ e.pointerId ] ) {
				return;
			}
			this.pts[ e.pointerId ] = e;
			const ids = Object.keys( this.pts );
			if ( 2 === ids.length ) {
				const a = this.pts[ ids[ 0 ] ];
				const b = this.pts[ ids[ 1 ] ];
				const dist = Math.hypot(
					a.clientX - b.clientX,
					a.clientY - b.clientY
				);
				if ( this.pinchDist ) {
					this.cam.fov = Math.min(
						110,
						Math.max( 30, ( this.cam.fov * this.pinchDist ) / dist )
					);
					this.dirty = true;
				}
				this.pinchDist = dist;
				this.drag = null;
				return;
			}
			if ( ! this.drag ) {
				return;
			}
			const dx = e.clientX - this.drag.x;
			const dy = e.clientY - this.drag.y;
			this.moved += Math.abs( dx ) + Math.abs( dy );
			const s = this.cam.fov / this.container.clientHeight;
			this.vel = { x: -dx * s, y: dy * s };
			this.cam.yaw -= dx * s;
			this.cam.pitch += dy * s;
			this.drag = { x: e.clientX, y: e.clientY };
			this.dirty = true;
			this.act();
		} );
		const up = ( e ) => {
			delete this.pts[ e.pointerId ];
			this.pinchDist = 0;
			const wasClick = this.drag && this.moved < 5;
			if ( this.drag ) {
				const t = Date.now();
				// Double click/tap: eased zoom toggle.
				if ( wasClick && t - this.lastUp < 320 ) {
					this.animateTo(
						this.cam.yaw,
						this.cam.pitch,
						this.cam.fov > 55 ? 40 : 70,
						500
					);
				}
				this.lastUp = t;
			}
			this.drag = null;
			canvas.style.cursor = 'grab';
			this.act();
			if ( wasClick && this.onClick ) {
				const rect = canvas.getBoundingClientRect();
				const yp = yawPitchFromScreen(
					e.clientX - rect.left,
					e.clientY - rect.top,
					this.cam,
					rect.width,
					rect.height
				);
				this.onClick( yp.yaw, yp.pitch );
			}
		};
		canvas.addEventListener( 'pointerup', up );
		canvas.addEventListener( 'pointercancel', ( e ) => {
			delete this.pts[ e.pointerId ];
			this.pinchDist = 0;
			this.drag = null;
		} );
		canvas.addEventListener(
			'wheel',
			( e ) => {
				e.preventDefault();
				this.cam.fov = Math.min(
					110,
					Math.max( 30, this.cam.fov + e.deltaY * 0.06 )
				);
				this.dirty = true;
				this.act();
			},
			{ passive: false }
		);

		const frame = () => {
			if ( this.dead ) {
				return;
			}
			this.tick();
			window.requestAnimationFrame( frame );
		};
		window.requestAnimationFrame( frame );
	}

	act() {
		this.lastAct = Date.now();
	}

	/** The bottom-right control cluster: auto-rotate, compass, fullscreen. */
	buildControls() {
		const bar = document.createElement( 'div' );
		bar.style.cssText =
			'position:absolute;right:10px;bottom:10px;display:flex;gap:6px;z-index:2';
		const rot = document.createElement( 'button' );
		rot.type = 'button';
		rot.style.cssText = BTN_CSS;
		rot.innerHTML =
			'<svg viewBox="0 0 24 24" style="width:17px;height:17px;fill:currentColor"><path d="M12 5a7 7 0 0 1 7 7h2a9 9 0 1 0-3 6.7V21h2v-5h-5v2h1.6A7 7 0 1 1 12 5z"/></svg>';
		rot.addEventListener( 'click', () => {
			this.rotOn = ! this.rotOn;
			rot.style.background = this.rotOn
				? 'rgba(59,102,255,.85)'
				: 'rgba(0,0,0,.45)';
			this.act();
		} );
		const compass = document.createElement( 'button' );
		compass.type = 'button';
		compass.style.cssText = BTN_CSS;
		const needle = document.createElement( 'span' );
		needle.style.cssText =
			'width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:12px solid #ff5a5a;position:relative;top:-1px';
		compass.appendChild( needle );
		compass.addEventListener( 'click', () => {
			this.animateTo( 0, 0, 70, 900 );
			this.act();
		} );
		this.needle = needle;
		const fs = document.createElement( 'button' );
		fs.type = 'button';
		fs.style.cssText = BTN_CSS;
		fs.textContent = '⛶';
		fs.addEventListener( 'click', () => {
			if ( document.fullscreenElement ) {
				document.exitFullscreen();
			} else if ( this.container.requestFullscreen ) {
				this.container.requestFullscreen();
			}
		} );
		bar.appendChild( rot );
		bar.appendChild( compass );
		bar.appendChild( fs );
		this.container.appendChild( bar );
		this.controls = bar;
	}

	/** Eased camera move (yaw/pitch/fov in degrees). */
	animateTo( yaw, pitch, fov, ms = 900 ) {
		const from = { ...this.cam };
		const t0 = Date.now();
		this.anim = () => {
			const k = easeInOut( Math.min( 1, ( Date.now() - t0 ) / ms ) );
			this.cam.yaw = from.yaw + ( yaw - from.yaw ) * k;
			this.cam.pitch = from.pitch + ( pitch - from.pitch ) * k;
			this.cam.fov = from.fov + ( ( fov ?? from.fov ) - from.fov ) * k;
			this.dirty = true;
			if ( k >= 1 ) {
				this.anim = null;
			}
		};
	}

	/** Upload a new equirectangular source (image or canvas). */
	setImage( source ) {
		const { gl } = this;
		if ( ! gl ) {
			return;
		}
		if ( ! this.tex ) {
			this.tex = gl.createTexture();
		}
		gl.bindTexture( gl.TEXTURE_2D, this.tex );
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			source
		);
		// NPOT-safe: clamp + linear, no mipmaps - AI sizes are rarely
		// powers of two and REPEAT would render black in WebGL1.
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
		this.dirty = true;
	}

	/** Replace the markers ([{ yaw, pitch, label, color, size, icon }]). */
	setHotspots( hotspots ) {
		this.hotspots = hotspots || [];
		this.marks.forEach( ( m ) => m.remove() );
		this.marks = this.hotspots.map( ( hs ) => {
			const el = document.createElement( 'span' );
			const fs = HOTSPOT_SIZES[ hs.size ] || HOTSPOT_SIZES.m;
			const color = hs.color || HOTSPOT_DEFAULT_COLOR;
			if ( hs.icon && HOTSPOT_ICONS[ hs.icon ] ) {
				const d = Math.round( fs * 2.1 );
				el.title = hs.label || '';
				el.style.cssText =
					'position:absolute;transform:translate(-50%,-50%);width:' +
					d +
					'px;height:' +
					d +
					'px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:' +
					color +
					';color:' +
					hotspotTextColor( hs.color ) +
					';pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.4)';
				el.innerHTML =
					'<svg viewBox="0 0 24 24" style="width:62%;height:62%;fill:currentColor">' +
					HOTSPOT_ICONS[ hs.icon ] +
					'</svg>';
			} else {
				el.textContent = hs.label || '•';
				el.style.cssText =
					'position:absolute;transform:translate(-50%,-130%);background:' +
					color +
					';color:' +
					hotspotTextColor( hs.color ) +
					';padding:' +
					Math.round( fs * 0.38 ) +
					'px ' +
					Math.round( fs * 0.8 ) +
					'px;border-radius:' +
					fs +
					'px;font:' +
					fs +
					'px/1.3 sans-serif;white-space:nowrap;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.4)';
			}
			this.container.appendChild( el );
			return el;
		} );
		this.dirty = true;
	}

	/** One render pass when needed (anim, inertia, idle rotate, resize). */
	tick() {
		const { gl, canvas, container } = this;
		if ( ! gl ) {
			return;
		}
		const dpr = window.devicePixelRatio || 1;
		const w = container.clientWidth;
		const h = container.clientHeight;
		if ( ! w || ! h ) {
			return;
		}
		if (
			canvas.width !== Math.round( w * dpr ) ||
			canvas.height !== Math.round( h * dpr )
		) {
			canvas.width = Math.round( w * dpr );
			canvas.height = Math.round( h * dpr );
			gl.viewport( 0, 0, canvas.width, canvas.height );
			this.dirty = true;
		}
		if ( this.anim ) {
			this.anim();
		} else if (
			! this.drag &&
			( Math.abs( this.vel.x ) > 0.005 || Math.abs( this.vel.y ) > 0.005 )
		) {
			this.cam.yaw += this.vel.x;
			this.cam.pitch += this.vel.y;
			this.vel.x *= 0.92;
			this.vel.y *= 0.92;
			this.dirty = true;
		} else if (
			this.rotOn &&
			! this.drag &&
			Date.now() - this.lastAct > 3500
		) {
			this.cam.yaw += 0.12;
			this.dirty = true;
		}
		this.cam.pitch = Math.max( -83, Math.min( 83, this.cam.pitch ) );
		if ( ! this.dirty ) {
			return;
		}
		const rad = Math.PI / 180;
		gl.uniform1f( this.uni.yaw, this.cam.yaw * rad );
		gl.uniform1f( this.uni.pitch, this.cam.pitch * rad );
		gl.uniform1f( this.uni.fov, this.cam.fov * rad );
		gl.uniform1f( this.uni.aspect, w / h );
		gl.drawArrays( gl.TRIANGLES, 0, 3 );
		this.hotspots.forEach( ( hs, i ) => {
			const mark = this.marks[ i ];
			if ( ! mark ) {
				return;
			}
			const p = screenFromYawPitch( hs.yaw, hs.pitch, this.cam, w, h );
			mark.style.display = p.visible ? 'flex' : 'none';
			if ( p.visible ) {
				mark.style.left = p.x + 'px';
				mark.style.top = p.y + 'px';
			}
		} );
		if ( this.needle ) {
			this.needle.style.transform = 'rotate(' + this.cam.yaw + 'deg)';
		}
		this.dirty = false;
	}

	/** Eased flight to a yaw/pitch (deg); 180 centers the wrap seam. */
	lookAt( yawDeg, pitchDeg = 0 ) {
		this.animateTo( yawDeg, pitchDeg, this.cam.fov, 900 );
	}

	/** Current view yaw in degrees (start view for the embed). */
	viewYaw() {
		return ( ( ( this.cam.yaw % 360 ) + 540 ) % 360 ) - 180;
	}

	destroy() {
		this.dead = true;
		this.marks.forEach( ( m ) => m.remove() );
		this.controls?.remove();
		this.canvas?.remove();
	}
}
