/**
 * QA steps for a Fluid Lab layer that keeps its bath (21.10.2026). The layer
 * holds the bath packed (src/fluid/pack.js): Insert and Update finish once it
 * is packed, an edit opens once it is unpacked, each a moment later.
 */

/** Presses Insert or Update and waits until the layer is in the editor. */
export async function pressAndWait( page, name ) {
	await page.getByRole( 'button', { name, exact: true } ).click();
	await page.waitForFunction(
		() => ! document.querySelector( '.wpiemb-lab-dialog' )
	);
}

/**
 * Edits the layer and pauses the reopened lab before its first step: the
 * loop steps on its third frame at the earliest, and this polls in tasks.
 */
export const editPaused = ( page, layer ) =>
	page.evaluate( async ( l ) => {
		const old = window.__wpieFluidLab;
		window.__gen.edit( { editor: window.__editor, layer: l } );
		const until = Date.now() + 15000;
		while ( ! window.__wpieFluidLab || window.__wpieFluidLab === old ) {
			if ( Date.now() > until ) {
				throw new Error( 'The lab did not reopen' );
			}
			await new Promise( ( r ) => setTimeout( r, 0 ) );
		}
		window.__wpieFluidLab.pause();
	}, layer );

const floats = ( data ) => {
	const bytes = Buffer.from( data, 'base64' );
	return new Float32Array(
		bytes.buffer,
		bytes.byteOffset,
		bytes.length >> 2
	);
};

/**
 * How far a reopened bath is from the one inserted: `same` when everything
 * but the grid matches exactly, `worst` the largest gap of one value in
 * steps of half precision (at most 1 is the bath, rounded once).
 */
export function bathGap( before, after ) {
	const { data: a, ...metaA } = before;
	const { data: b, ...metaB } = after;
	const x = floats( a ),
		y = floats( b );
	let worst = x.length === y.length ? 0 : Infinity;
	for ( let i = 0; i < x.length && worst < Infinity; i++ ) {
		const gap =
			Math.abs( x[ i ] - y[ i ] ) /
			( Math.abs( x[ i ] ) * 2 ** -11 + 2 ** -24 );
		worst = Math.max( worst, gap );
	}
	return { same: JSON.stringify( metaA ) === JSON.stringify( metaB ), worst };
}
