/** Hidden logo trigger. The game and its renderer load only when requested. */
let active = null;

export function attachPixelstormTrigger( element, onError ) {
	if ( ! element ) {
		return () => {};
	}
	let clicks = [];
	let disposed = false;
	let owned = null;
	const onClick = async () => {
		const now = performance.now();
		clicks = clicks.filter( ( stamp ) => now - stamp < 900 );
		clicks.push( now );
		if ( clicks.length < 3 || active ) {
			return;
		}
		clicks = [];
		const token = {};
		owned = active = token;
		try {
			const { openPixelstorm } = await import( './pixelstorm/overlay' );
			if ( disposed || active !== token ) {
				return;
			}
			token.close = openPixelstorm(
				element.closest( '#wpie-root' ) ||
					document.getElementById( 'wpie-root' ),
				() => {
					if ( active === token ) {
						active = null;
					}
				},
				onError
			);
		} catch ( error ) {
			if ( active === token ) {
				active = null;
			}
			if ( ! disposed ) {
				onError?.( error );
			}
		}
	};
	element.addEventListener( 'click', onClick );
	return () => {
		disposed = true;
		element.removeEventListener( 'click', onClick );
		owned?.close?.();
		if ( active === owned ) {
			active = null;
		}
	};
}
