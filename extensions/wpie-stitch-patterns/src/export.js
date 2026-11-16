/**
 * The winding as a film (v2.9, the encoder of 3D Flip Studio and Motion
 * Graphics): MP4 through WebCodecs (H.264, muxed in
 * the browser) or a looping GIF. Taken from Motion Graphics' export, less
 * the music: both render frame by frame, nothing waits for real time, and
 * nothing leaves the browser.
 *
 * `frames( { width, height, fps, onFrame, onProgress } )` is the studio's
 * driver: it paints every frame and hands the canvas over.
 */
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

const even = ( v ) => Math.max( 2, Math.round( v / 2 ) * 2 );

/** Does this browser encode H.264? Resolves the codec, or ''. */
export async function mp4Codec( width, height, fps ) {
	if ( 'undefined' === typeof window || ! window.VideoEncoder ) {
		return '';
	}
	for ( const codec of [ 'avc1.640028', 'avc1.4d0028', 'avc1.42E01E' ] ) {
		try {
			const r = await window.VideoEncoder.isConfigSupported( {
				codec,
				width: even( width ),
				height: even( height ),
				bitrate: 8000000,
				framerate: fps,
			} );
			if ( r && r.supported ) {
				return codec;
			}
		} catch ( e ) {
			// Try the next profile.
		}
	}
	return '';
}

/** Quick yes/no for the UI. */
export function mp4Available() {
	return 'undefined' !== typeof window && !! window.VideoEncoder;
}

/** Encode the clip as MP4. Resolves { blob, ext: 'mp4' }. */
export async function encodeMp4( { frames, width, height, fps = 30, onProgress } ) {
	const w = even( width );
	const h = even( height );
	const codec = await mp4Codec( w, h, fps );
	if ( ! codec ) {
		throw new Error( 'no h264 encoder' );
	}
	const muxer = new Muxer( {
		target: new ArrayBufferTarget(),
		video: { codec: 'avc', width: w, height: h, frameRate: fps },
		fastStart: 'in-memory',
	} );
	let failure = null;
	const venc = new window.VideoEncoder( {
		output: ( chunk, meta ) => muxer.addVideoChunk( chunk, meta ),
		error: ( e ) => {
			failure = e;
		},
	} );
	const bitrate = Math.round( ( ( w * h ) / ( 1920 * 1080 ) ) * 8000000 );
	venc.configure( {
		codec,
		width: w,
		height: h,
		bitrate: Math.max( 1500000, Math.min( 16000000, bitrate ) ),
		framerate: fps,
		latencyMode: 'quality',
		avc: { format: 'avc' },
	} );
	const frameUs = Math.round( 1e6 / fps );
	await frames( {
		width: w,
		height: h,
		fps,
		onFrame: async ( canvas, i ) => {
			if ( failure ) {
				throw failure;
			}
			const frame = new window.VideoFrame( canvas, {
				timestamp: i * frameUs,
				duration: frameUs,
			} );
			venc.encode( frame, { keyFrame: 0 === i % ( fps * 2 ) } );
			frame.close();
			while ( venc.encodeQueueSize > 6 ) {
				await new Promise( ( r ) => setTimeout( r, 8 ) );
			}
		},
		onProgress,
	} );
	await venc.flush();
	venc.close();
	if ( failure ) {
		throw failure;
	}
	muxer.finalize();
	return { blob: new Blob( [ muxer.target.buffer ], { type: 'video/mp4' } ), ext: 'mp4' };
}

/** Encode the clip as a looping GIF. Resolves { blob, ext: 'gif' }. */
export async function encodeGif( { frames, width, height, fps = 15, onProgress } ) {
	const w = Math.max( 2, Math.round( width ) );
	const h = Math.max( 2, Math.round( height ) );
	const gif = GIFEncoder();
	const scratch = document.createElement( 'canvas' );
	scratch.width = w;
	scratch.height = h;
	const g = scratch.getContext( '2d', { willReadFrequently: true } );
	const delay = Math.round( 1000 / fps );
	await frames( {
		width: w,
		height: h,
		fps,
		onFrame: ( canvas, i ) => {
			g.drawImage( canvas, 0, 0, w, h );
			const rgba = g.getImageData( 0, 0, w, h ).data;
			const palette = quantize( rgba, 256, { format: 'rgb444' } );
			const index = applyPalette( rgba, palette, 'rgb444' );
			gif.writeFrame( index, w, h, {
				palette,
				delay,
				repeat: 0 === i ? 0 : undefined,
			} );
		},
		onProgress,
	} );
	gif.finish();
	return { blob: new Blob( [ gif.bytes() ], { type: 'image/gif' } ), ext: 'gif' };
}
