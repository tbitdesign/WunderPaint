/**
 * The reveal as a video, frame by frame (3.5).
 *
 * The old export recorded the preview in real time: a heavy card fell
 * behind the clock, frames dropped and the reveal stuttered. Here frame i
 * is simply the moment it names, drawn as long as it takes and encoded to
 * H.264 in the browser (WebCodecs + mp4-muxer) - the pattern Growth &
 * Decay and the 3D studios use. Nothing waits for real time.
 */
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

/** H.264 levels (hex) with their largest frame in macroblocks. */
const H264_LEVELS = [
	[ '1f', 3600 ], // 3.1: 720p
	[ '28', 8192 ], // 4.0: 1080p
	[ '32', 22080 ], // 5.0
	[ '33', 36864 ], // 5.1
	[ '34', 36864 ], // 5.2
];

/** The smallest H.264 level (hex) that holds a frame size at 30 fps. */
export function h264Level( w, h ) {
	const mbs = Math.ceil( w / 16 ) * Math.ceil( h / 16 );
	const hit = H264_LEVELS.find( ( [ , max ] ) => mbs <= max );
	return hit ? hit[ 0 ] : '34';
}

/** That level and every larger one, for an encoder that is choosy. */
function levelsFrom( level ) {
	const i = H264_LEVELS.findIndex( ( [ l ] ) => l === level );
	return H264_LEVELS.slice( Math.max( 0, i ) ).map( ( [ l ] ) => l );
}

/**
 * Size, level and bitrate of a reveal video of w x h pixels.
 *
 * @param {number} w       Width (even).
 * @param {number} h       Height (even).
 * @param {number} seconds Duration.
 * @return {Object} { w, h, fps, frames, level, bitrate }.
 */
export function videoPlan( w, h, seconds ) {
	const fps = 30;
	return {
		w,
		h,
		fps,
		frames: Math.max( 4, Math.round( Math.max( 1, seconds ) * fps ) ),
		level: h264Level( w, h ),
		// A reveal changes a little everywhere: about 10 Mbit/s at 1080p,
		// scaled with the pixel count.
		bitrate: Math.round(
			Math.max(
				4e6,
				Math.min( 40e6, ( ( w * h ) / ( 1920 * 1080 ) ) * 10e6 )
			)
		),
	};
}

/** Does this browser encode video through WebCodecs? */
export function mp4Available() {
	return 'undefined' !== typeof window && !! window.VideoEncoder;
}

/** A codec string this browser encodes this plan with, or ''. */
export async function mp4CodecFor( plan ) {
	if ( ! mp4Available() ) {
		return '';
	}
	for ( const profile of [ '6400', '4d00', '42e0' ] ) {
		for ( const l of levelsFrom( plan.level ) ) {
			const codec = 'avc1.' + profile + l;
			try {
				const r = await window.VideoEncoder.isConfigSupported( {
					codec,
					width: plan.w,
					height: plan.h,
					bitrate: plan.bitrate,
					framerate: plan.fps,
				} );
				if ( r && r.supported ) {
					return codec;
				}
			} catch ( e ) {
				// Try the next level or profile.
			}
		}
	}
	return '';
}

const breathe = () => new Promise( ( r ) => setTimeout( r, 0 ) );

/**
 * Encode `frames` frames; `frameAt( i )` resolves a canvas of plan size.
 *
 * @param {Object}      o
 * @param {Object}      o.plan       videoPlan().
 * @param {number}      o.frames     How many frames (QA may ask for fewer).
 * @param {Function}    o.frameAt    i -> canvas (or a promise of one).
 * @param {Function}    o.onProgress 0..1.
 * @param {AbortSignal} o.signal     Cancels between frames.
 * @return {Promise<Blob>} The MP4.
 */
export async function encodeFrames( {
	plan,
	frames,
	frameAt,
	onProgress,
	signal,
} ) {
	const codec = await mp4CodecFor( plan );
	if ( ! codec ) {
		throw new Error( 'no h264 encoder' );
	}
	const muxer = new Muxer( {
		target: new ArrayBufferTarget(),
		video: {
			codec: 'avc',
			width: plan.w,
			height: plan.h,
			frameRate: plan.fps,
		},
		fastStart: 'in-memory',
	} );
	let failure = null;
	const encoder = new window.VideoEncoder( {
		output: ( chunk, meta ) => muxer.addVideoChunk( chunk, meta ),
		error: ( e ) => {
			failure = e;
		},
	} );
	encoder.configure( {
		codec,
		width: plan.w,
		height: plan.h,
		bitrate: plan.bitrate,
		framerate: plan.fps,
		latencyMode: 'quality',
		avc: { format: 'avc' },
	} );
	const frameUs = Math.round( 1e6 / plan.fps );
	try {
		for ( let i = 0; i < frames; i++ ) {
			if ( signal?.aborted ) {
				throw new DOMException( 'Canceled', 'AbortError' );
			}
			if ( failure ) {
				throw failure;
			}
			const canvas = await frameAt( i );
			const frame = new window.VideoFrame( canvas, {
				timestamp: i * frameUs,
				duration: frameUs,
			} );
			encoder.encode( frame, { keyFrame: 0 === i % ( plan.fps * 2 ) } );
			frame.close();
			while ( encoder.encodeQueueSize > 6 ) {
				await new Promise( ( r ) => setTimeout( r, 8 ) );
			}
			onProgress?.( ( i + 1 ) / frames );
			await breathe();
		}
		await encoder.flush();
	} catch ( e ) {
		try {
			encoder.close();
		} catch ( closed ) {}
		throw e;
	}
	encoder.close();
	if ( failure ) {
		throw failure;
	}
	muxer.finalize();
	return new Blob( [ muxer.target.buffer ], { type: 'video/mp4' } );
}
