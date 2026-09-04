/** Tiny SVG string helpers shared by every card. Attributes only, never classes. */
export const escapeXml = ( s ) =>
	String( s ).replace(
		/[&<>"']/g,
		( c ) =>
			( {
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;',
			} )[ c ]
	);

export const PAPERS = {
	white: { bg: '#ffffff', ink: '#1a1a1a' },
	cream: { bg: '#f6efe1', ink: '#2b2418' },
	chalk: { bg: '#243328', ink: '#f2efe6' },
	dark: { bg: '#15171b', ink: '#ececec' },
};

export function svgDoc( { width, height, bg, children } ) {
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${ width }" height="${ height }" viewBox="0 0 ${ width } ${ height }">` +
		( bg
			? `<rect x="0" y="0" width="${ width }" height="${ height }" fill="${ bg }"/>`
			: '' ) +
		children.join( '' ) +
		'</svg>'
	);
}

export const textEl = (
	x,
	y,
	s,
	{
		size = 24,
		font = 'Arial',
		fill = '#000',
		weight = 400,
		anchor = 'start',
		italic = false,
	} = {}
) =>
	`<text x="${ r( x ) }" y="${ r( y ) }" font-family="${ escapeXml(
		font
	) }" font-size="${ size }" font-weight="${ weight }"${
		italic ? ' font-style="italic"' : ''
	} fill="${ fill }" text-anchor="${ anchor }">${ escapeXml( s ) }</text>`;

export const r = ( v ) => Math.round( v * 100 ) / 100;
