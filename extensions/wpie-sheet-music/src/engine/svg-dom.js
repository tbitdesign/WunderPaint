/**
 * Browser-side fixes on a finished SVG before it goes to the editor's
 * importer, which reads x as the left edge and ignores text-anchor: every
 * centred or right-aligned text gets its measured left edge and loses
 * the anchor, so titles, lyrics and chord names land where they were.
 */
export function normalizeTextAnchors( svgText ) {
	const host = document.createElement( 'div' );
	host.style.cssText = 'position:absolute;left:-99999px;top:0;';
	host.innerHTML = svgText;
	document.body.appendChild( host );
	try {
		const svg = host.querySelector( 'svg' );
		if ( ! svg ) {
			return svgText;
		}
		for ( const el of svg.querySelectorAll( 'text' ) ) {
			const anchor = el.getAttribute( 'text-anchor' );
			if ( ! anchor || 'start' === anchor ) {
				continue;
			}
			let bb;
			try {
				bb = el.getBBox();
			} catch ( e ) {
				continue;
			}
			// Text inside a transformed group: getBBox is local to the text,
			// so the left edge in local units is what the importer wants.
			el.setAttribute( 'x', String( Math.round( bb.x * 100 ) / 100 ) );
			el.removeAttribute( 'text-anchor' );
		}
		let out = new window.XMLSerializer().serializeToString( svg );
		if ( ! /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test( out ) ) {
			out = out.replace(
				'<svg',
				'<svg xmlns="http://www.w3.org/2000/svg"'
			);
		}
		return out;
	} finally {
		host.remove();
	}
}
