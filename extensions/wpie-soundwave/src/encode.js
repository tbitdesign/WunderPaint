/**
 * The video as an MP4 with its sound, made frame by frame (v2.5).
 *
 * The recorder this studio used before plays the song in real time and
 * films the canvas while it does: the tab has to stay in front, a
 * stutter is in the film for good, and half the browsers hand back WebM.
 * Here every frame is drawn and encoded as fast as the machine can
 * (WebCodecs H.264, muxed in the browser - the encoder Motion Graphics
 * uses), and the sound is encoded next to it: AAC where the browser has
 * it, Opus in the MP4 otherwise. Where neither works the studio falls
 * back to the recorder.
 */
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

const even = ( v ) => Math.max( 2, Math.round( v / 2 ) * 2 );
const RATE = 48000;

async function videoCodec( w, h, fps ) {
	if ( 'undefined' === typeof window || ! window.VideoEncoder ) {
		return '';
	}
	for ( const codec of [ 'avc1.640028', 'avc1.4d0028', 'avc1.42E01E' ] ) {
		try {
			const r = await window.VideoEncoder.isConfigSupported( {
				codec,
				width: even( w ),
				height: even( h ),
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

async function audioCodec( channels ) {
	if ( 'undefined' === typeof window || ! window.AudioEncoder ) {
		return null;
	}
	for ( const [ codec, mux ] of [
		[ 'mp4a.40.2', 'aac' ],
		[ 'opus', 'opus' ],
	] ) {
		const cfg = { codec, sampleRate: RATE, numberOfChannels: channels, bitrate: 160000 };
		try {
			const r = await window.AudioEncoder.isConfigSupported( cfg );
			if ( r && r.supported ) {
				return { cfg, mux };
			}
		} catch ( e ) {
			// Try the next codec.
		}
	}
	return null;
}

/**
 * Can this browser make the video offline at this size?
 *
 * @return {Promise<boolean>}
 */
export async function canEncode( width, height, channels = 2, fps = 30 ) {
	return !! ( ( await videoCodec( width, height, fps ) ) && ( await audioCodec( channels ) ) );
}

/** Linear resample of one channel to the encoder's rate. */
export function resample( data, from, to = RATE ) {
	if ( from === to ) {
		return data;
	}
	const out = new Float32Array( Math.max( 1, Math.round( ( data.length * to ) / from ) ) );
	for ( let i = 0; i < out.length; i++ ) {
		const x = ( i * from ) / to;
		const a = Math.min( data.length - 1, Math.floor( x ) );
		const b = Math.min( data.length - 1, a + 1 );
		out[ i ] = data[ a ] + ( data[ b ] - data[ a ] ) * ( x - a );
	}
	return out;
}

/**
 * Encode. Resolves { blob, ext: 'mp4' }.
 *
 * @param {Object} o `{ frames( { fps, onFrame } ), width, height, fps,
 *                   audio: { channels: Float32Array[], sampleRate },
 *                   sleep( ms ) }` - frames() draws every frame and hands
 *                   the canvas to onFrame( canvas, index ).
 */
export async function encodeVideo( o ) {
	const w = even( o.width );
	const h = even( o.height );
	const fps = o.fps || 30;
	const sleep = o.sleep || ( ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) ) );
	const codec = await videoCodec( w, h, fps );
	const channels = o.audio.channels.slice( 0, 2 ).map( ( c ) => resample( c, o.audio.sampleRate ) );
	const sound = await audioCodec( channels.length );
	if ( ! codec || ! sound ) {
		throw new Error( 'no encoder' );
	}
	const muxer = new Muxer( {
		target: new ArrayBufferTarget(),
		video: { codec: 'avc', width: w, height: h, frameRate: fps },
		audio: { codec: sound.mux, sampleRate: RATE, numberOfChannels: channels.length },
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
		bitrate: Math.max( 2000000, Math.min( 16000000, bitrate ) ),
		framerate: fps,
		latencyMode: 'quality',
		avc: { format: 'avc' },
	} );
	const frameUs = Math.round( 1e6 / fps );
	await o.frames( {
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
				await sleep( 8 );
			}
		},
	} );
	await venc.flush();
	venc.close();
	if ( failure ) {
		throw failure;
	}

	const aenc = new window.AudioEncoder( {
		output: ( chunk, meta ) => muxer.addAudioChunk( chunk, meta ),
		error: ( e ) => {
			failure = e;
		},
	} );
	aenc.configure( sound.cfg );
	const n = channels[ 0 ].length;
	const ch = channels.length;
	const CHUNK = 1024;
	for ( let pos = 0; pos < n; pos += CHUNK ) {
		const len = Math.min( CHUNK, n - pos );
		const data = new Float32Array( len * ch );
		for ( let c = 0; c < ch; c++ ) {
			data.set( channels[ c ].subarray( pos, pos + len ), c * len );
		}
		const ad = new window.AudioData( {
			format: 'f32-planar',
			sampleRate: RATE,
			numberOfFrames: len,
			numberOfChannels: ch,
			timestamp: Math.round( ( pos / RATE ) * 1e6 ),
			data,
		} );
		aenc.encode( ad );
		ad.close();
	}
	await aenc.flush();
	aenc.close();
	if ( failure ) {
		throw failure;
	}
	muxer.finalize();
	return { blob: new Blob( [ muxer.target.buffer ], { type: 'video/mp4' } ), ext: 'mp4' };
}
