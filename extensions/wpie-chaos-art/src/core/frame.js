/** Keep the document's proportions; bound pixels rather than its shape. */
export const aspectOf = ( value ) =>
	Number.isFinite( value ) && value > 0 ? value : 1;

export function frameSize( aspect, pixels = 2240 * 1400, edge = 8192 ) {
	const a = aspectOf( aspect );
	const h = Math.min( Math.sqrt( pixels / a ), edge, edge / a );
	return {
		w: Math.max( 1, Math.floor( h * a ) ),
		h: Math.max( 1, Math.floor( h ) ),
	};
}

/** Analysis stays small even for a very thin banner. Coordinates stay in frame units. */
export function gridSize( aspect, rows = 36 ) {
	const a = aspectOf( aspect );
	const h = Math.max(
		1,
		Math.min( rows, Math.floor( Math.sqrt( 26000 / a ) ) )
	);
	return {
		rows: h,
		cols: Math.max( 4, Math.min( 2048, Math.round( h * a ) ) ),
	};
}
