/**
 * PSD read/write in a Web Worker (spec 13.4): ag-psd initialized with
 * OffscreenCanvas; pixel payloads cross the thread boundary as transferable
 * ImageBitmaps / ArrayBuffers.
 *
 * Protocol:
 *   { cmd: 'read',  buffer } → { psd: tree } (canvases → { __bitmap })
 *   { cmd: 'write', psd }    → { buffer }   ({ __bitmap } → canvases)
 */

let agPromise = null;

async function getAgPsd() {
	if ( ! agPromise ) {
		agPromise = import( /* webpackChunkName: "agpsd" */ 'ag-psd' ).then(
			( ag ) => {
				ag.initializeCanvas(
					( width, height ) =>
						new OffscreenCanvas(
							Math.max( 1, width || 1 ) || 1,
							Math.max( 1, height || 1 ) || 1
						),
					( width, height ) =>
						new OffscreenCanvas(
							Math.max( 1, width || 1 ) || 1,
							Math.max( 1, height || 1 ) || 1
						)
							.getContext( '2d' )
							.createImageData(
								Math.max( 1, width || 1 ) || 1,
								Math.max( 1, height || 1 ) || 1
							)
				);
				return ag;
			}
		);
	}
	return agPromise;
}

/** Replace canvases with transferable ImageBitmaps (recursive). */
function bitmapize( node, transfers ) {
	if ( ! node || 'object' !== typeof node ) {
		return node;
	}
	if ( Array.isArray( node ) ) {
		return node.map( ( item ) => bitmapize( item, transfers ) );
	}
	const out = {};
	for ( const [ key, value ] of Object.entries( node ) ) {
		if ( value && 'function' === typeof value.transferToImageBitmap ) {
			const bitmap = value.transferToImageBitmap();
			transfers.push( bitmap );
			out[ key ] = {
				__bitmap: bitmap,
				width: bitmap.width,
				height: bitmap.height,
			};
		} else if (
			value instanceof ArrayBuffer ||
			ArrayBuffer.isView( value )
		) {
			out[ key ] = value;
		} else if ( value && 'object' === typeof value ) {
			out[ key ] = bitmapize( value, transfers );
		} else if ( 'function' !== typeof value ) {
			out[ key ] = value;
		}
	}
	return out;
}

/** Replace { __bitmap } markers with OffscreenCanvases (recursive). */
function canvasize( node ) {
	if ( ! node || 'object' !== typeof node ) {
		return node;
	}
	if ( Array.isArray( node ) ) {
		return node.map( canvasize );
	}
	if ( node.__bitmap ) {
		const canvas = new OffscreenCanvas(
			node.__bitmap.width,
			node.__bitmap.height
		);
		canvas.getContext( '2d' ).drawImage( node.__bitmap, 0, 0 );
		return canvas;
	}
	if ( node instanceof ArrayBuffer || ArrayBuffer.isView( node ) ) {
		return node;
	}
	const out = {};
	for ( const [ key, value ] of Object.entries( node ) ) {
		out[ key ] = canvasize( value );
	}
	return out;
}

self.onmessage = async ( event ) => {
	const { cmd, buffer, psd } = event.data;
	try {
		const ag = await getAgPsd();
		if ( 'read' === cmd ) {
			const parsed = ag.readPsd( buffer, {
				skipThumbnail: true,
				useImageData: false,
			} );
			const transfers = [];
			const tree = bitmapize( parsed, transfers );
			self.postMessage( { psd: tree }, transfers );
		} else if ( 'write' === cmd ) {
			const doc = canvasize( psd );
			const out = ag.writePsd( doc, {
				generateThumbnail: false,
				invalidateTextLayers: true,
			} );
			self.postMessage( { buffer: out }, [ out ] );
		}
	} catch ( err ) {
		self.postMessage( { error: err?.message || String( err ) } );
	}
};
