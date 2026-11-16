/**
 * A recording as a WAV file (v2.5).
 *
 * The microphone hands over WebM/Opus in one browser and MP4 in another,
 * and WordPress accepts neither reliably as an AUDIO upload (an audio-only
 * .webm is refused as a video type on many sites). Plain 16-bit PCM WAV
 * is accepted everywhere, plays everywhere and decodes everywhere, which
 * is what a recording that has to be reopened later needs.
 */

/**
 * Average channels down to mono and resample (linear) to `rate`.
 *
 * @param {Float32Array[]} channels PCM.
 * @param {number}         from     Their sample rate.
 * @param {number}         rate     Target rate.
 * @return {Float32Array} Mono PCM at `rate`.
 */
export function monoAt( channels, from, rate ) {
	const n = channels[ 0 ].length;
	const out = new Float32Array( Math.max( 1, Math.round( ( n * rate ) / from ) ) );
	const k = 1 / channels.length;
	for ( let i = 0; i < out.length; i++ ) {
		const x = ( i * from ) / rate;
		const a = Math.min( n - 1, Math.floor( x ) );
		const b = Math.min( n - 1, a + 1 );
		const f = x - a;
		let v = 0;
		for ( const ch of channels ) {
			v += ch[ a ] + ( ch[ b ] - ch[ a ] ) * f;
		}
		out[ i ] = v * k;
	}
	return out;
}

/**
 * 16-bit PCM WAV bytes.
 *
 * @param {Float32Array} pcm  Mono samples, -1..1.
 * @param {number}       rate Sample rate.
 * @return {ArrayBuffer} The file.
 */
export function encodeWav( pcm, rate ) {
	const bytes = new ArrayBuffer( 44 + pcm.length * 2 );
	const v = new DataView( bytes );
	const text = ( at, s ) => {
		for ( let i = 0; i < s.length; i++ ) {
			v.setUint8( at + i, s.charCodeAt( i ) );
		}
	};
	text( 0, 'RIFF' );
	v.setUint32( 4, 36 + pcm.length * 2, true );
	text( 8, 'WAVE' );
	text( 12, 'fmt ' );
	v.setUint32( 16, 16, true );
	v.setUint16( 20, 1, true ); // PCM
	v.setUint16( 22, 1, true ); // mono
	v.setUint32( 24, rate, true );
	v.setUint32( 28, rate * 2, true );
	v.setUint16( 32, 2, true );
	v.setUint16( 34, 16, true );
	text( 36, 'data' );
	v.setUint32( 40, pcm.length * 2, true );
	for ( let i = 0; i < pcm.length; i++ ) {
		const s = Math.max( -1, Math.min( 1, pcm[ i ] ) );
		v.setInt16( 44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true );
	}
	return bytes;
}
