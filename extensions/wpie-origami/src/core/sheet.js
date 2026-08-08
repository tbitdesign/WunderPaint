/**
 * The printed deliverables: the folding sheet itself, front and
 * mirrored back, and the instruction pages drawn from the same steps
 * the preview folds.
 */
import { drawDiagram } from './diagram.js';

/**
 * One sheet page: the paper square centered with cutting marks.
 *
 * @param {Object}   o         Page options.
 * @param {number}   o.w       Page width in px.
 * @param {number}   o.h       Page height in px.
 * @param {Function} o.paint   paint( g, x, y, size ) draws the square.
 * @param {boolean}  o.mirror  Mirror the artwork (the back of the sheet).
 * @param {string}   o.caption Caption printed under the square.
 * @return {HTMLCanvasElement} The page.
 */
export function sheetPage( { w, h, paint, mirror = false, caption = '' } ) {
	const page = document.createElement( 'canvas' );
	page.width = w;
	page.height = h;
	const g = page.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, w, h );

	const size = Math.round( Math.min( w, h ) * 0.8 );
	const x = Math.round( ( w - size ) / 2 );
	const y = Math.round( ( h - size ) / 2 );

	g.save();
	if ( mirror ) {
		g.translate( w, 0 );
		g.scale( -1, 1 );
	}
	g.save();
	g.beginPath();
	g.rect( mirror ? w - x - size : x, y, size, size );
	g.clip();
	paint( g, mirror ? w - x - size : x, y, size );
	g.restore();
	g.restore();

	// Cutting marks, just outside the corners.
	const m = Math.round( size * 0.025 );
	const len = Math.round( size * 0.045 );
	g.strokeStyle = '#9a938a';
	g.lineWidth = Math.max( 1, size * 0.002 );
	for ( const [ cx, cy, sx, sy ] of [
		[ x, y, -1, -1 ],
		[ x + size, y, 1, -1 ],
		[ x, y + size, -1, 1 ],
		[ x + size, y + size, 1, 1 ],
	] ) {
		g.beginPath();
		g.moveTo( cx + sx * m, cy + sy * m );
		g.lineTo( cx + sx * ( m + len ), cy + sy * m );
		g.moveTo( cx + sx * m, cy + sy * m );
		g.lineTo( cx + sx * m, cy + sy * ( m + len ) );
		g.stroke();
	}

	if ( caption ) {
		g.fillStyle = '#6d675f';
		g.font = `500 ${ Math.round( h * 0.016 ) }px system-ui, sans-serif`;
		g.textAlign = 'center';
		g.fillText( caption, w / 2, y + size + ( h - y - size ) / 2 );
	}
	return page;
}

const wrap = ( g, text, maxW ) => {
	const words = String( text ).split( ' ' );
	const lines = [];
	let line = '';
	for ( const word of words ) {
		const probe = line ? line + ' ' + word : word;
		if ( g.measureText( probe ).width > maxW && line ) {
			lines.push( line );
			line = word;
		} else {
			line = probe;
		}
	}
	if ( line ) {
		lines.push( line );
	}
	return lines;
};

/**
 * Instruction pages: numbered panels, two by three per page.
 *
 * @param {Object}   o        Page options.
 * @param {number}   o.w      Page width in px.
 * @param {number}   o.h      Page height in px.
 * @param {Object}   o.figure Folded figure, its steps drive the panels.
 * @param {string}   o.title  Headline of the first page.
 * @param {string[]} o.texts  Localized step texts.
 * @param {string}   o.done   Caption of the final panel.
 * @return {HTMLCanvasElement[]} The pages.
 */
export function instructionPages( { w, h, figure, title, texts, done } ) {
	const panels = figure.steps.length + 1;
	const perPage = 6;
	const pages = [];
	const margin = Math.round( w * 0.06 );
	const gap = Math.round( w * 0.035 );

	for ( let start = 0; start < panels; start += perPage ) {
		const page = document.createElement( 'canvas' );
		page.width = w;
		page.height = h;
		const g = page.getContext( '2d' );
		g.fillStyle = '#ffffff';
		g.fillRect( 0, 0, w, h );

		let top = margin;
		if ( 0 === start ) {
			g.fillStyle = '#2c2a26';
			g.font = `700 ${ Math.round( w * 0.045 ) }px system-ui, sans-serif`;
			g.textAlign = 'left';
			g.fillText( title, margin, top + w * 0.03 );
			top += Math.round( w * 0.07 );
		}

		const cols = 2;
		const rows = 3;
		const cw = Math.floor( ( w - 2 * margin - gap ) / cols );
		const ch = Math.floor(
			( h - top - margin - ( rows - 1 ) * gap ) / rows
		);
		for ( let i = 0; i < perPage && start + i < panels; i++ ) {
			const k = start + i;
			const px = margin + ( i % cols ) * ( cw + gap );
			const py = top + Math.floor( i / cols ) * ( ch + gap );
			g.fillStyle = '#faf8f4';
			g.strokeStyle = '#ddd6cb';
			g.lineWidth = Math.max( 1, w * 0.0015 );
			g.beginPath();
			g.roundRect( px, py, cw, ch, w * 0.008 );
			g.fill();
			g.stroke();

			const diagH = Math.round( ch * 0.58 );
			drawDiagram( g, figure, k, {
				x: px + cw * 0.06,
				y: py + ch * 0.04,
				w: cw * 0.88,
				h: diagH,
			} );

			// Number badge.
			const r = Math.round( w * 0.016 );
			g.beginPath();
			g.arc( px + r * 1.6, py + r * 1.6, r, 0, Math.PI * 2 );
			g.fillStyle = k < figure.steps.length ? '#c04545' : '#3f9b62';
			g.fill();
			g.fillStyle = '#ffffff';
			g.font = `700 ${ Math.round( r * 1.15 ) }px system-ui, sans-serif`;
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			g.fillText(
				k < figure.steps.length ? String( k + 1 ) : '✓',
				px + r * 1.6,
				py + r * 1.65
			);
			g.textBaseline = 'alphabetic';

			const caption = k < figure.steps.length ? texts[ k ] : done;
			g.fillStyle = '#4a463f';
			g.font = `400 ${ Math.round( w * 0.015 ) }px system-ui, sans-serif`;
			g.textAlign = 'left';
			const maxW = cw * 0.88;
			const lines = wrap( g, caption, maxW );
			const lh = Math.round( w * 0.019 );
			lines.slice( 0, 4 ).forEach( ( line, li ) => {
				g.fillText(
					line,
					px + cw * 0.06,
					py + ch * 0.06 + diagH + lh * ( li + 1 )
				);
			} );
		}
		pages.push( page );
	}
	return pages;
}
