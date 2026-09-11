/**
 * The onion-peel inpaint off the main thread (v1.429.1). The keyless
 * "Remove Object" used to run inpaintRegion() synchronously at full
 * document size, and a big photo froze the editor for the duration.
 *
 * Protocol: postMessage({ data, width, height, mask, smoothPasses })
 *           → { data } | { error }, buffers transferred both ways.
 */

import { inpaintRegion } from './inpaint';

self.onmessage = ( event ) => {
	const { data, width, height, mask, smoothPasses } = event.data;
	try {
		const img = { data: new Uint8ClampedArray( data ), width, height };
		inpaintRegion(
			img,
			new Uint8Array( mask ),
			undefined === smoothPasses ? {} : { smoothPasses }
		);
		self.postMessage( { data: img.data.buffer }, [ img.data.buffer ] );
	} catch ( err ) {
		self.postMessage( {
			error: ( err && err.message ) || 'inpaint failed',
		} );
	}
};
