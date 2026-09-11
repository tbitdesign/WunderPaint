import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// At grazing angles the plane has no usable document-sized projection.
// Ease back to an overview so orbiting still reveals the complete depth.
function inspectionBlend( settings, volume, top = false ) {
	const angle = top ? 0 : volume ? settings.volumeAngle : settings.angle;
	const cosine = Math.abs( Math.cos( ( angle * Math.PI ) / 180 ) );
	const blend = THREE.MathUtils.clamp( ( 0.57 - cosine ) / 0.42, 0, 1 );
	return blend * blend * ( 3 - 2 * blend );
}

function viewCenter( settings, volume, top = false ) {
	return volume
		? 0.3 *
				( settings?.boundary === 'open'
					? inspectionBlend( settings, volume, top )
					: 1 )
		: 0;
}

/** Camera coordinates only. Bath tilt and all physical fields stay separate. */
export function orientCamera( camera, settings, volume = false, top = false ) {
	const tilt = top
		? 0.001
		: Math.max(
				0.001,
				Math.min(
					179.999,
					volume ? settings.volumeAngle : settings.angle
				)
		  );
	const yaw = top ? 0 : ( ( settings.viewYaw || 0 ) * Math.PI ) / 180;
	const angle = ( tilt * Math.PI ) / 180;
	const center = viewCenter( settings, volume, top );
	camera.up.set( 0, 0, 1 );
	camera.zoom = top ? 1 : settings.viewZoom || 1;
	camera.position.set(
		Math.sin( yaw ) * Math.sin( angle ) * 3,
		-Math.cos( yaw ) * Math.sin( angle ) * 3,
		center + Math.cos( angle ) * 3
	);
	camera.lookAt( 0, 0, center );
	camera.updateProjectionMatrix();
	camera.updateMatrixWorld();
}

export class FluidViewControls {
	constructor( owner ) {
		this.owner = owner;
	}
	attach( camera ) {
		if ( this.camera === camera ) {
			const z = viewCenter(
				this.owner.settings,
				this.owner.sim.kind === 'volume'
			);
			this.control.target.set( 0, 0, z );
			this.configure();
			return;
		}
		this.dispose();
		this.camera = camera;
		camera.up.set( 0, 0, 1 );
		const control = new OrbitControls( camera, this.owner.canvas );
		this.control = control;
		control.enablePan = false;
		control.enableDamping = false;
		control.autoRotate = false;
		control.minPolarAngle = 0.001;
		control.maxPolarAngle = Math.PI - 0.001;
		control.minZoom = 0.45;
		control.maxZoom = 4;
		control.rotateSpeed = 0.65;
		control.zoomSpeed = 0.7;
		control.target.set(
			0,
			0,
			viewCenter( this.owner.settings, this.owner.sim.kind === 'volume' )
		);
		control.update();
		control.addEventListener( 'change', () => {
			const settings = this.owner.settings;
			if ( ! settings ) {
				return;
			}
			const delta = camera.position.clone().sub( control.target );
			settings.viewYaw =
				( Math.atan2( delta.x, -delta.y ) * 180 ) / Math.PI;
			settings[
				this.owner.sim.kind === 'volume' ? 'volumeAngle' : 'angle'
			] =
				( Math.acos(
					THREE.MathUtils.clamp( delta.z / delta.length(), -1, 1 )
				) *
					180 ) /
				Math.PI;
			settings.viewZoom = camera.zoom;
			camera.updateMatrixWorld();
			this.owner.onViewChange?.();
		} );
		this.configure();
	}
	configure() {
		if ( ! this.control ) {
			return;
		}
		const orbit = this.owner.settings?.tool === 'orbit';
		this.control.enabled = this.owner.viewEnabled !== false;
		this.control.mouseButtons.LEFT = orbit ? THREE.MOUSE.ROTATE : null;
		this.control.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
		this.control.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
		this.control.touches.ONE = orbit ? THREE.TOUCH.ROTATE : null;
		this.control.touches.TWO = orbit ? THREE.TOUCH.DOLLY_ROTATE : null;
	}
	dispose() {
		this.control?.dispose();
		this.control = null;
		this.camera = null;
	}
}

/** An open artwork crops the plane to the document, without a tray margin. */
export function artworkSize(
	settings,
	aspect,
	viewAspect,
	volume = false,
	top = false
) {
	const angle = top ? 0 : volume ? settings.volumeAngle : settings.angle;
	const yaw = top ? 0 : ( ( settings.viewYaw || 0 ) * Math.PI ) / 180;
	const tilt = Math.max(
		0.08,
		Math.abs( Math.cos( ( angle * Math.PI ) / 180 ) )
	);
	const c = Math.abs( Math.cos( yaw ) ),
		s = Math.abs( Math.sin( yaw ) );
	// Inscribe the viewport in the projected plane, including rotated views.
	// A small crop keeps the numerical outlet just beyond the visible image.
	const crop =
		0.96 *
		Math.min(
			aspect / ( viewAspect * c + s / tilt ),
			1 / ( viewAspect * s + c / tilt )
		);
	const overview = volume
		? Math.max( 1.65, ( aspect + 0.55 ) / viewAspect )
		: Math.max( 1.08, ( aspect / viewAspect ) * 1.08 );
	return THREE.MathUtils.lerp(
		crop,
		overview,
		inspectionBlend( settings, volume, top )
	);
}
