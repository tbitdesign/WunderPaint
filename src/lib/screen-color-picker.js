/** The browser's pixel-magnifying screen picker, shared by swatches, Color and the eyedropper tool. */
export const canPickScreenColor = () =>
	typeof window !== 'undefined' && typeof window.EyeDropper === 'function';

/** Must be called directly from a user gesture, just like EyeDropper.open(). */
export async function pickScreenColor( { signal } = {} ) {
	if ( ! canPickScreenColor() ) {
		return null;
	}
	try {
		const result = await new window.EyeDropper().open( { signal } );
		return result?.sRGBHex || null;
	} catch ( error ) {
		if ( error?.name === 'AbortError' ) {
			return null;
		}
		throw error;
	}
}
