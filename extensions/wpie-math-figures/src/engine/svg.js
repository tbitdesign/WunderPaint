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
	grid: { bg: '#fbfbf8', ink: '#1a1a1a', pattern: 'grid' },
	lines: { bg: '#fffdf7', ink: '#1a1a1a', pattern: 'lines' },
	chalk: { bg: '#243328', ink: '#f2efe6' },
	dark: { bg: '#15171b', ink: '#ececec' },
	transparent: { bg: null, ink: '#1a1a1a' },
};

/** Squared or lined paper as faint lines in the ink colour. */
export function paperPattern( kind, width, height, ink, scale = 1 ) {
	const parts = [];
	if ( 'grid' === kind ) {
		const step = 40 * scale;
		for ( let x = step; x < width; x += step ) {
			parts.push(
				`<line x1="${ r( x ) }" y1="0" x2="${ r(
					x
				) }" y2="${ height }" stroke="${ ink }" stroke-opacity="0.12" stroke-width="1"/>`
			);
		}
		for ( let y = step; y < height; y += step ) {
			parts.push(
				`<line x1="0" y1="${ r( y ) }" x2="${ width }" y2="${ r(
					y
				) }" stroke="${ ink }" stroke-opacity="0.12" stroke-width="1"/>`
			);
		}
	} else if ( 'lines' === kind ) {
		const step = 48 * scale;
		for ( let y = step; y < height; y += step ) {
			parts.push(
				`<line x1="0" y1="${ r( y ) }" x2="${ width }" y2="${ r(
					y
				) }" stroke="${ ink }" stroke-opacity="0.18" stroke-width="1"/>`
			);
		}
	}
	return parts.join( '' );
}

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
