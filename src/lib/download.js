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
	// Local announcement, nothing more: every export in the editor ends up
	// here, so one event covers them all. Nobody listens inside WordPress -
	// the studio does, to count how many visits actually produce a file.
	// Deliberately not a network call: the plugin never talks to a server of
	// ours, and this line must not become the exception.
	try {
		window.dispatchEvent(
			new window.CustomEvent( 'wpie:file-saved', {
				detail: { filename },
			} )
		);
	} catch ( e ) {
		// An engine without CustomEvent must still get its download.
	}
}
