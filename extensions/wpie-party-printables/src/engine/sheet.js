/**
 * The sheet: imposition (how many pieces fit, where they sit), cut marks
 * outside the corners and dashed fold lines. Everything in millimetres;
 * the sheet renderer scales to px.
 */
import { r } from './units.js';

/**
 * Lay pieces of itemW x itemH (mm) on a sheet, centred, inside a margin.
 * fit: 'auto' fills the sheet, a number caps the count.
 */
export function impose( o ) {
	const margin = undefined === o.margin ? 8 : o.margin;
	const bleed = o.bleed || 0;
	const gap = undefined === o.gap ? 4 : o.gap;
	const cellW = o.itemW + 2 * bleed;
	const cellH = o.itemH + 2 * bleed;
	const innerW = o.sheetW - 2 * margin;
	const innerH = o.sheetH - 2 * margin;
	const cols = Math.max(
		0,
		Math.floor( ( innerW + gap ) / ( cellW + gap ) )
	);
	const rows = Math.max(
		0,
		Math.floor( ( innerH + gap ) / ( cellH + gap ) )
	);
	const max = o.max || 200;
	let count = Math.min( cols * rows, max );
	if ( 'auto' !== o.fit && undefined !== o.fit && null !== o.fit ) {
		count = Math.min( count, Math.max( 0, Math.floor( o.fit ) ) );
	}
	const usedRows = cols ? Math.ceil( count / cols ) : 0;
	const usedCols = Math.min( cols, count );
	const gridW = usedCols * cellW + Math.max( 0, usedCols - 1 ) * gap;
	const gridH = usedRows * cellH + Math.max( 0, usedRows - 1 ) * gap;
	const x0 = ( o.sheetW - gridW ) / 2;
	const y0 = ( o.sheetH - gridH ) / 2;
	const positions = [];
	for ( let i = 0; i < count; i++ ) {
		const c = i % cols;
		const rw = Math.floor( i / cols );
		positions.push( {
			x: r( x0 + c * ( cellW + gap ) + bleed ),
			y: r( y0 + rw * ( cellH + gap ) + bleed ),
		} );
	}
	return { cols, rows, count, cellW, cellH, positions };
}

/** Eight short lines outside the corners of a trim box (mm). */
export function cutMarks( box, ink, o = {} ) {
	const len = o.len || 4;
	const gap = undefined === o.gap ? 1.5 : o.gap;
	const sw = o.width || 0.2;
	const { x, y, w, h } = box;
	const L = ( x1, y1, x2, y2 ) =>
		`<line x1="${ r( x1 ) }" y1="${ r( y1 ) }" x2="${ r( x2 ) }" y2="${ r(
			y2
		) }" stroke="${ ink }" stroke-width="${ sw }"/>`;
	return [
		L( x - gap, y, x - gap - len, y ),
		L( x, y - gap, x, y - gap - len ),
		L( x + w + gap, y, x + w + gap + len, y ),
		L( x + w, y - gap, x + w, y - gap - len ),
		L( x - gap, y + h, x - gap - len, y + h ),
		L( x, y + h + gap, x, y + h + gap + len ),
		L( x + w + gap, y + h, x + w + gap + len, y + h ),
		L( x + w, y + h + gap, x + w, y + h + gap + len ),
	].join( '' );
}

export function foldLine( x1, y1, x2, y2, ink, o = {} ) {
	return `<line x1="${ r( x1 ) }" y1="${ r( y1 ) }" x2="${ r(
		x2
	) }" y2="${ r( y2 ) }" stroke="${ ink }" stroke-width="${
		o.width || 0.25
	}" stroke-dasharray="${ o.dash || '2 1.5' }" stroke-opacity="${
		undefined === o.opacity ? 0.6 : o.opacity
	}"/>`;
}
