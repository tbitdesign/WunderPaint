/**
 * The nail template: where every nail of a string art board goes, at its
 * real size, spread over printable pages. Printed at 100 % and taped
 * together it lies on the board and the nails go through the dots.
 *
 * Everything is measured in millimetres and drawn per page at print
 * resolution, so the PDF pages carry their true paper size: a PDF viewer
 * printing "actual size" reproduces the board exactly. Pure module apart
 * from the canvas handed in; node-testable.
 */

import { boardNails } from '../../shared/string-art.js';

export const PAPERS = {
	a4: [ 210, 297 ],
	letter: [ 215.9, 279.4 ],
};

const MARGIN = 10; // unprinted edge of a page, mm
const ROOM = 16; // around the board, for the nail numbers, mm

const makeCanvas = ( like, w, h ) => {
	const c =
		'undefined' !== typeof document
			? document.createElement( 'canvas' )
			: new like.constructor( w, h );
	c.width = w;
	c.height = h;
	return c;
};

/**
 * Every nail in millimetres on the template, with the direction its number
 * is written in (outwards, away from the board).
 *
 * @param {string} shape   round | square | heart.
 * @param {number} n       Nails.
 * @param {number} boardMm Board width.
 * @param {number} insetMm Nails sit this far in from the edge.
 * @return {Array} [ { x, y, nx, ny } ] relative to the board centre.
 */
export function templateNails( shape, n, boardMm, insetMm ) {
	const R = boardMm / 2 - insetMm;
	const pts = boardNails( shape, n ).nails.map( ( [ x, y ] ) => [
		x * R,
		y * R,
	] );
	return pts.map( ( p, i ) => {
		// The outline runs clockwise on screen, so outwards is the tangent
		// turned a quarter to the left.
		const prev = pts[ ( i - 1 + n ) % n ];
		const next = pts[ ( i + 1 ) % n ];
		const tx = next[ 0 ] - prev[ 0 ];
		const ty = next[ 1 ] - prev[ 1 ];
		const len = Math.hypot( tx, ty ) || 1;
		return { x: p[ 0 ], y: p[ 1 ], nx: ty / len, ny: -tx / len };
	} );
}

/** Every how-many-th nail gets its number written, so numbers never touch. */
export function labelStep( nails ) {
	let run = 0;
	for ( let i = 0; i < nails.length; i++ ) {
		const a = nails[ i ];
		const b = nails[ ( i + 1 ) % nails.length ];
		run += Math.hypot( b.x - a.x, b.y - a.y );
	}
	const gap = run / nails.length;
	return [ 1, 2, 5, 10, 20, 25, 50 ].find( ( s ) => s * gap >= 6.5 ) || 100;
}

/** How the template splits into pages, portrait or landscape - fewer wins. */
export function pageGrid( boardMm, paper = 'a4' ) {
	const [ pw, ph ] = PAPERS[ paper ] || PAPERS.a4;
	const area = boardMm + 2 * ROOM;
	const fit = ( w, h ) => {
		const cols = Math.ceil( area / ( w - 2 * MARGIN ) );
		const rows = Math.ceil( area / ( h - 2 * MARGIN ) );
		return { w, h, cols, rows, pages: cols * rows };
	};
	const portrait = fit( pw, ph );
	const landscape = fit( ph, pw );
	return {
		area,
		...( landscape.pages < portrait.pages ? landscape : portrait ),
	};
}

/**
 * The pages, drawn.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} o    { shape, nails, boardCm, insetCm, paper, dpi,
 *                      labels: { title, start, scale, page } }.
 * @return {Array} [ { canvas, wMm, hMm } ] in reading order.
 */
export function nailTemplatePages( like, o ) {
	const boardMm = Math.max( 100, ( o.boardCm || 40 ) * 10 );
	const insetMm = ( o.insetCm ?? 1 ) * 10;
	const shape = o.shape || 'round';
	const n = Math.max( 12, Math.round( o.nails || 288 ) );
	const dpi = o.dpi || 200;
	const L = {
		title: 'String Art',
		start: 'start',
		scale: '5 cm - print at 100 %',
		page: 'Page',
		...( o.labels || {} ),
	};
	const grid = pageGrid( boardMm, o.paper );
	const usableW = grid.w - 2 * MARGIN;
	const usableH = grid.h - 2 * MARGIN;
	// The template sits in the middle of the page grid.
	const offX = ( grid.cols * usableW - grid.area ) / 2;
	const offY = ( grid.rows * usableH - grid.area ) / 2;
	const centre = grid.area / 2;
	const nails = templateNails( shape, n, boardMm, insetMm );
	const step = labelStep( nails );
	const outline = boardNails( shape, 'round' === shape ? 360 : 720 ).nails;
	const px = dpi / 25.4;

	const drawBoard = ( g ) => {
		// The board's edge, dashed: where the wood ends.
		g.strokeStyle = '#9aa0a8';
		g.lineWidth = 0.3;
		g.setLineDash( [ 2, 1.5 ] );
		g.beginPath();
		outline.forEach( ( [ x, y ], i ) => {
			const X = centre + ( x * boardMm ) / 2;
			const Y = centre + ( y * boardMm ) / 2;
			if ( i ) {
				g.lineTo( X, Y );
			} else {
				g.moveTo( X, Y );
			}
		} );
		g.closePath();
		g.stroke();
		g.setLineDash( [] );
		if ( 'heart' !== shape ) {
			g.strokeStyle = '#6a7078';
			g.lineWidth = 0.2;
			g.beginPath();
			g.moveTo( centre - 4, centre );
			g.lineTo( centre + 4, centre );
			g.moveTo( centre, centre - 4 );
			g.lineTo( centre, centre + 4 );
			g.stroke();
		}
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		nails.forEach( ( p, i ) => {
			const X = centre + p.x;
			const Y = centre + p.y;
			const named = 0 === i || 0 === ( i + 1 ) % step;
			g.strokeStyle = '#26292e';
			g.lineWidth = 0.15;
			g.beginPath();
			g.moveTo( X - 0.9, Y );
			g.lineTo( X + 0.9, Y );
			g.moveTo( X, Y - 0.9 );
			g.lineTo( X, Y + 0.9 );
			g.stroke();
			g.fillStyle = '#26292e';
			g.beginPath();
			g.arc( X, Y, named ? 0.45 : 0.3, 0, Math.PI * 2 );
			g.fill();
			if ( named ) {
				g.font = `${ 0 === i ? 700 : 500 } 2.3px sans-serif`;
				g.fillStyle = 0 === i ? '#b3212b' : '#31353b';
				g.fillText( String( i + 1 ), X + p.nx * 3.6, Y + p.ny * 3.6 );
			}
		} );
		// Nail 1 is where the thread starts and the counting runs
		// clockwise: a small arrow says which way.
		const a = nails[ 0 ];
		const X = centre + a.x + a.nx * 7.4;
		const Y = centre + a.y + a.ny * 7.4;
		g.fillStyle = '#b3212b';
		g.font = '600 2.2px sans-serif';
		g.fillText( L.start, X, Y );
		g.beginPath();
		g.moveTo( X + 5, Y - 1.1 );
		g.lineTo( X + 7, Y );
		g.lineTo( X + 5, Y + 1.1 );
		g.closePath();
		g.fill();
	};

	const pages = [];
	const total = grid.cols * grid.rows;
	for ( let r = 0; r < grid.rows; r++ ) {
		for ( let c = 0; c < grid.cols; c++ ) {
			const canvas = makeCanvas(
				like,
				Math.round( grid.w * px ),
				Math.round( grid.h * px )
			);
			const g = canvas.getContext( '2d' );
			g.fillStyle = '#ffffff';
			g.fillRect( 0, 0, canvas.width, canvas.height );
			g.save();
			g.scale( px, px );
			g.save();
			g.beginPath();
			g.rect( MARGIN, MARGIN, usableW, usableH );
			g.clip();
			g.translate(
				MARGIN - c * usableW - offX,
				MARGIN - r * usableH - offY
			);
			drawBoard( g );
			g.restore();
			// Trim marks at the printed area, so the pages butt together.
			g.strokeStyle = '#6a7078';
			g.lineWidth = 0.2;
			for ( const [ x, y ] of [
				[ MARGIN, MARGIN ],
				[ MARGIN + usableW, MARGIN ],
				[ MARGIN, MARGIN + usableH ],
				[ MARGIN + usableW, MARGIN + usableH ],
			] ) {
				g.beginPath();
				g.moveTo( x - 6, y );
				g.lineTo( x - 1, y );
				g.moveTo( x + 1, y );
				g.lineTo( x + 6, y );
				g.moveTo( x, y - 6 );
				g.lineTo( x, y - 1 );
				g.moveTo( x, y + 1 );
				g.lineTo( x, y + 6 );
				g.stroke();
			}
			g.fillStyle = '#31353b';
			g.textBaseline = 'middle';
			g.font = '600 3px sans-serif';
			g.textAlign = 'left';
			g.fillText( L.title, MARGIN + 8, MARGIN / 2 );
			g.textAlign = 'right';
			const name = String.fromCharCode( 65 + r ) + ( c + 1 );
			g.fillText(
				`${ L.page } ${
					r * grid.cols + c + 1
				} / ${ total } · ${ name }`,
				grid.w - MARGIN - 8,
				grid.h - MARGIN / 2
			);
			// A bar of exactly 5 cm on every page: measure it, and the
			// printer kept the size.
			g.fillStyle = '#26292e';
			g.fillRect( MARGIN + 8, grid.h - MARGIN / 2 - 0.6, 50, 1.2 );
			for ( let k = 0; k <= 5; k++ ) {
				g.fillRect(
					MARGIN + 8 + k * 10 - 0.15,
					grid.h - MARGIN / 2 - 1.6,
					0.3,
					3.2
				);
			}
			g.textAlign = 'left';
			g.font = '500 2.6px sans-serif';
			g.fillText( L.scale, MARGIN + 62, grid.h - MARGIN / 2 );
			g.restore();
			pages.push( { canvas, wMm: grid.w, hMm: grid.h } );
		}
	}
	return pages;
}

async function jpegBytes( canvas ) {
	if ( 'function' === typeof canvas.toBuffer ) {
		return new Uint8Array(
			canvas.toBuffer( 'image/jpeg', { quality: 0.92 } )
		);
	}
	const blob = await new Promise( ( resolve ) =>
		canvas.toBlob( resolve, 'image/jpeg', 0.92 )
	);
	return new Uint8Array( await blob.arrayBuffer() );
}

/**
 * The pages as one PDF, each page at its real paper size.
 *
 * @param {Array} pages From nailTemplatePages.
 * @return {Promise<Blob>} application/pdf.
 */
export async function pagesToPdf( pages ) {
	const encoder = new TextEncoder();
	const chunks = [];
	const offsets = [];
	let position = 0;
	const push = ( data ) => {
		const bytes = 'string' === typeof data ? encoder.encode( data ) : data;
		chunks.push( bytes );
		position += bytes.length;
	};
	const object = ( body ) => {
		offsets.push( position );
		push( body );
	};
	const pt = ( mm ) => ( ( mm * 72 ) / 25.4 ).toFixed( 2 );
	push( '%PDF-1.4\n' );
	object( '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' );
	const kids = pages.map( ( _, i ) => `${ 3 + i * 3 } 0 R` ).join( ' ' );
	object(
		`2 0 obj\n<< /Type /Pages /Kids [${ kids }] /Count ${ pages.length } >>\nendobj\n`
	);
	for ( let i = 0; i < pages.length; i++ ) {
		const { canvas, wMm, hMm } = pages[ i ];
		const bytes = await jpegBytes( canvas );
		const id = 3 + i * 3;
		const w = pt( wMm );
		const h = pt( hMm );
		object(
			`${ id } 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ w } ${ h }] ` +
				`/Resources << /XObject << /Im0 ${
					id + 1
				} 0 R >> >> /Contents ${ id + 2 } 0 R >>\nendobj\n`
		);
		offsets.push( position );
		push(
			`${ id + 1 } 0 obj\n<< /Type /XObject /Subtype /Image /Width ${
				canvas.width
			} /Height ${ canvas.height } ` +
				`/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${ bytes.length } >>\nstream\n`
		);
		push( bytes );
		push( '\nendstream\nendobj\n' );
		const content = `q ${ w } 0 0 ${ h } 0 0 cm /Im0 Do Q`;
		object(
			`${ id + 2 } 0 obj\n<< /Length ${
				content.length
			} >>\nstream\n${ content }\nendstream\nendobj\n`
		);
	}
	const xref = position;
	let table = `xref\n0 ${ offsets.length + 1 }\n0000000000 65535 f \n`;
	for ( const off of offsets ) {
		table += `${ String( off ).padStart( 10, '0' ) } 00000 n \n`;
	}
	push(
		table +
			`trailer\n<< /Size ${
				offsets.length + 1
			} /Root 1 0 R >>\nstartxref\n${ xref }\n%%EOF`
	);
	return new Blob( chunks, { type: 'application/pdf' } );
}
