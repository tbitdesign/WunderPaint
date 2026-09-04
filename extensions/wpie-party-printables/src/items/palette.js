/** Small colour helpers for items: luminance to pick a readable ink. */
export const lum = ( hex ) => {
	const s = String( hex || '' ).replace( '#', '' );
	const n = parseInt(
		3 === s.length
			? s
					.split( '' )
					.map( ( c ) => c + c )
					.join( '' )
			: s,
		16
	);
	return (
		0.299 * ( ( n >> 16 ) & 255 ) +
		0.587 * ( ( n >> 8 ) & 255 ) +
		0.114 * ( n & 255 )
	);
};
export const readableOn = ( fill, colors ) =>
	lum( fill ) > 170 ? colors.ink : colors.bg;
