/**
 * A canvas as the data URL a layer keeps (19.10.2026), encoded off the
 * main thread where the browser can: toBlob hands the encoding to the
 * browser, FileReader turns the blob into the data URL. Large generated
 * pictures (Background Studio, Vignette & Film) used to encode in one
 * synchronous toDataURL call and froze the editor for a second or two.
 * Where there is no toBlob (node tests) it falls back to toDataURL.
 *
 * @param {HTMLCanvasElement} canvas  The picture.
 * @param {string}            type    MIME type.
 * @param {number}            quality Lossy quality (0..1), if any.
 * @return {Promise<string>} The data URL.
 */
export function encodeCanvas( canvas, type = 'image/png', quality ) {
	if (
		'function' !== typeof canvas.toBlob ||
		'undefined' === typeof FileReader
	) {
		return Promise.resolve( canvas.toDataURL( type, quality ) );
	}
	return new Promise( ( resolve, reject ) => {
		canvas.toBlob(
			( blob ) => {
				if ( ! blob ) {
					reject( new Error( 'The picture could not be encoded.' ) );
					return;
				}
				const reader = new FileReader();
				reader.onload = () => resolve( reader.result );
				reader.onerror = () => reject( reader.error );
				reader.readAsDataURL( blob );
			},
			type,
			quality
		);
	} );
}
