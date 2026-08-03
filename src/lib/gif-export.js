/**
 * Animated GIF export (v1.0): every visible top-level layer becomes one
 * frame (bottom-most first), rendered over the document background.
 * Uses gifenc (MIT), loaded lazily so the main bundle stays small.
 */

import { renderToCanvas, sharedImageCache, createCanvas } from './raster';
import { pickRecorderMime } from './canvas-record';
import { __ } from '@wordpress/i18n';

/** Visible top-level content layers, bottom first (= frame order). */
export function gifFrameLayers( layers ) {
	return ( layers || [] ).filter(
		( l ) => ! l.parent && l.visible && 'adjustment' !== l.type
	);
}

/**
 * Render the document to an animated GIF blob.
 *
 * @param {Object}   doc           Document.
 * @param {Array}    layers        Full (flat) layer list.
 * @param {Object}   opts          Options.
 * @param {number}   opts.delay    Frame delay in ms.
 * @param {number}   opts.maxSize  Longest output edge (default 1024).
 * @param {Function} opts.render   Injectable renderer for tests
 *                                 (doc, layers, {scale, cache}) → canvas.
 * @return {Promise<Blob>} GIF blob.
 */
export async function exportGif(
	doc,
	layers,
	{ delay = 500, maxSize = 1024, render = renderToCanvas } = {}
) {
	const { GIFEncoder, quantize, applyPalette } = await import(
		/* webpackChunkName: "gifenc" */ 'gifenc'
	);
	const frames = gifFrameLayers( layers );
	if ( frames.length < 2 ) {
		throw new Error( 'GIF export needs at least two visible layers.' );
	}
	const scale = Math.min( 1, maxSize / Math.max( doc.w, doc.h ) );
	const gif = GIFEncoder();
	let w = 0;
	let h = 0;
	for ( const frame of frames ) {
		// Hide all other top-level layers; keep the full list so group
		// children stay resolvable inside the renderer.
		const frameLayers = layers.map( ( l ) =>
			! l.parent && l.id !== frame.id ? { ...l, visible: false } : l
		);
		const canvas = await render( doc, frameLayers, {
			scale,
			cache: sharedImageCache,
		} );
		w = canvas.width;
		h = canvas.height;
		const imageData = canvas.getContext( '2d' ).getImageData( 0, 0, w, h );
		// gifenc instanceof-checks the array, normalize across realms
		// (node-canvas in tests hands back a foreign Uint8ClampedArray).
		const data = new Uint8Array(
			imageData.data.buffer,
			imageData.data.byteOffset,
			imageData.data.length
		);
		const palette = quantize( data, 256 );
		const index = applyPalette( data, palette );
		gif.writeFrame( index, w, h, {
			palette,
			delay: frame.frameDelay ?? delay,
		} );
	}
	gif.finish();
	return new window.Blob( [ gif.bytes() ], { type: 'image/gif' } );
}

/**
 * Render the frames into an animated PNG (APNG) blob via upng-js.
 *
 * @param {Object}   doc          Document.
 * @param {Array}    layers       Full layer list.
 * @param {Object}   opts         Options (delay ms, maxSize, render).
 * @param {number}   opts.delay   Default frame delay.
 * @param {number}   opts.maxSize Longest edge.
 * @param {Function} opts.render  Injectable renderer.
 * @return {Promise<Blob>} APNG blob.
 */
export async function exportApng(
	doc,
	layers,
	{ delay = 500, maxSize = 1024, render = renderToCanvas } = {}
) {
	const UPNG = ( await import( /* webpackChunkName: "upng" */ 'upng-js' ) )
		.default;
	const frames = gifFrameLayers( layers );
	if ( frames.length < 2 ) {
		throw new Error( 'APNG export needs at least two visible layers.' );
	}
	const scale = Math.min( 1, maxSize / Math.max( doc.w, doc.h ) );
	const buffers = [];
	const delays = [];
	let w = 0;
	let h = 0;
	for ( const frame of frames ) {
		const frameLayers = layers.map( ( l ) =>
			! l.parent && l.id !== frame.id ? { ...l, visible: false } : l
		);
		const canvas = await render( doc, frameLayers, {
			scale,
			cache: sharedImageCache,
		} );
		w = canvas.width;
		h = canvas.height;
		const data = canvas.getContext( '2d' ).getImageData( 0, 0, w, h );
		buffers.push( data.data.buffer.slice( 0 ) );
		delays.push( frame.frameDelay ?? delay );
	}
	const apng = UPNG.encode( buffers, w, h, 0, delays );
	return new window.Blob( [ apng ], { type: 'image/apng' } );
}

/**
 * Record the frames into a WebM video via canvas.captureStream +
 * MediaRecorder (browser only).
 *
 * @param {Object} doc          Document.
 * @param {Array}  layers       Full layer list.
 * @param {Object} opts         Options.
 * @param {number} opts.delay   Frame delay in ms.
 * @param {number} opts.maxSize Longest output edge in px.
 * @param {number} opts.loops   Loop count (0 = forever).
 * @return {Promise<Blob>} WebM blob.
 */
export async function exportWebM(
	doc,
	layers,
	{ delay = 500, maxSize = 1024, loops = 2 } = {}
) {
	if ( ! window.MediaRecorder ) {
		throw new Error( 'MediaRecorder is not available in this browser.' );
	}
	const frames = gifFrameLayers( layers );
	if ( frames.length < 2 ) {
		throw new Error( 'Video export needs at least two visible layers.' );
	}
	const scale = Math.min( 1, maxSize / Math.max( doc.w, doc.h ) );
	// Pre-render all frames, then play them onto a recorded canvas.
	const rendered = [];
	for ( const frame of frames ) {
		const frameLayers = layers.map( ( l ) =>
			! l.parent && l.id !== frame.id ? { ...l, visible: false } : l
		);
		rendered.push( {
			canvas: await renderToCanvas( doc, frameLayers, {
				scale,
				cache: sharedImageCache,
			} ),
			delay: frame.frameDelay ?? delay,
		} );
	}
	const stage = createCanvas(
		rendered[ 0 ].canvas.width,
		rendered[ 0 ].canvas.height
	);
	const ctx = stage.getContext( '2d' );
	const stream = stage.captureStream( 30 );
	// Same chain as the shared recorder, but WebM only: this export is
	// named after the format. Handing an unsupported mime to the
	// constructor is what used to throw on WebKit.
	const mimeType = pickRecorderMime(
		( m ) =>
			0 === m.indexOf( 'video/webm' ) &&
			window.MediaRecorder?.isTypeSupported?.( m )
	);
	if ( ! mimeType ) {
		throw new Error(
			__(
				'This browser cannot record WebM. Chrome, Edge and Firefox can.',
				'wunderpaint'
			)
		);
	}
	const recorder = new window.MediaRecorder( stream, { mimeType } );
	const chunks = [];
	recorder.ondataavailable = ( e ) => e.data.size && chunks.push( e.data );
	const done = new Promise( ( resolve ) => {
		recorder.onstop = () =>
			resolve( new window.Blob( chunks, { type: 'video/webm' } ) );
	} );
	recorder.start();
	for ( let loop = 0; loop < loops; loop++ ) {
		for ( const frame of rendered ) {
			ctx.clearRect( 0, 0, stage.width, stage.height );
			ctx.drawImage( frame.canvas, 0, 0 );
			await new Promise( ( r ) => setTimeout( r, frame.delay ) );
		}
	}
	recorder.stop();
	return done;
}
