/**
 * Client-side blob download (spec 07.2 export).
 * @param blob
 * @param filename
 */
export function downloadBlob( blob, filename ) {
	const url = window.URL.createObjectURL( blob );
	const a = document.createElement( 'a' );
	a.href = url;
	a.download = filename;
	document.body.appendChild( a );
	a.click();
	a.remove();
	window.setTimeout( () => window.URL.revokeObjectURL( url ), 5000 );
}
