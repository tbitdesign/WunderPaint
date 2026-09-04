/**
 * Print units: every item is designed in millimetres and drawn at 300 dpi.
 */
export const PX_PER_MM = 300 / 25.4;
export const px = ( mm ) => mm * PX_PER_MM;
export const mm = ( pxv ) => pxv / PX_PER_MM;
export const r = ( v ) => Math.round( v * 100 ) / 100;

export const FORMATS = {
	a4: [ 210, 297 ],
	a5: [ 148, 210 ],
	a3: [ 297, 420 ],
	letter: [ 215.9, 279.4 ],
	legal: [ 215.9, 355.6 ],
};

/** Sheet width and height in mm from the sheet params (landscape swaps, custom takes w/h). */
export function sheetSize( sheet ) {
	const s = sheet || {};
	let w;
	let h;
	if ( 'custom' === s.format && s.w > 0 && s.h > 0 ) {
		w = s.w;
		h = s.h;
	} else {
		[ w, h ] = FORMATS[ s.format ] || FORMATS.a4;
	}
	return s.landscape ? { w: h, h: w } : { w, h };
}
