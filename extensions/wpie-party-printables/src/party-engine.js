/**
 * Party Printables render engine: bunting banners, a gift-box dieline
 * and plotter-ready sticker sheets. Pure module, node-testable.
 */

const makeCanvas = ( like, w, h ) => {
	const c =
		'undefined' !== typeof document
			? document.createElement( 'canvas' )
			: new like.constructor( w, h );
	c.width = w;
	c.height = h;
	return c;
};

/* ------------------------------- palettes -------------------------------- */

export const PALETTES = [
	{
		id: 'party',
		label: 'Party',
		colors: [
			'#f94144',
			'#f3722c',
			'#f8961e',
			'#f9c74f',
			'#90be6d',
			'#43aa8b',
			'#577590',
		],
	},
	{
		id: 'pastel',
		label: 'Pastel',
		colors: [
			'#ffd6e0',
			'#ffef9f',
			'#c1fba4',
			'#7bf1a8',
			'#a5d8ff',
			'#d0bfff',
		],
	},
	{
		id: 'gold',
		label: 'Gold & Black',
		colors: [ '#101010', '#d9a441', '#f5e6c4', '#8a5a1c' ],
	},
	{
		id: 'ocean',
		label: 'Ocean',
		colors: [ '#0b7285', '#1098ad', '#66d9e8', '#e3fafc' ],
	},
	{
		id: 'blush',
		label: 'Blush',
		colors: [ '#c94f6d', '#e58aa4', '#f7d6de', '#6d2136' ],
	},
	{
		id: 'forest',
		label: 'Forest',
		colors: [ '#2b9348', '#80b918', '#eeef20', '#007f5f' ],
	},
	{
		id: 'candy',
		label: 'Candy',
		colors: [ '#f9a8d4', '#e879f9', '#818cf8', '#38bdf8' ],
	},
	{
		id: 'sunset',
		label: 'Sunset',
		colors: [ '#ffd27a', '#ff7e5f', '#c2427b', '#7a2948' ],
	},
	{
		id: 'mono',
		label: 'Black & White',
		colors: [ '#111418', '#4a4f57', '#9aa0a8', '#e8eaee' ],
	},
	{
		id: 'noel',
		label: 'Christmas',
		colors: [ '#b3212b', '#1f6f43', '#f5e6c4', '#8a5a1c' ],
	},
];

/**
 * Effective color list: custom colors win, then a brand kit, then the
 * chosen palette preset.
 *
 * @param {Object} opts { customColors?, brandColors?, paletteId }.
 * @return {Array} Hex list (always >= 2 entries).
 */
export function colorsFor( opts = {} ) {
	const custom = ( opts.customColors || [] ).filter( ( c ) =>
		/^#[0-9a-f]{6}$/i.test( String( c ) )
	);
	// A single custom color is a valid choice: everything in that color.
	if ( custom.length >= 1 ) {
		return custom;
	}
	const brand = ( opts.brandColors || [] ).filter( ( c ) =>
		/^#[0-9a-f]{6}$/i.test( String( c ) )
	);
	if ( brand.length >= 2 ) {
		return brand;
	}
	return paletteById( opts.paletteId ).colors;
}

export const paletteById = ( id ) =>
	PALETTES.find( ( p ) => p.id === id ) || PALETTES[ 0 ];

const textOn = ( hex ) => {
	const r = parseInt( hex.slice( 1, 3 ), 16 );
	const g = parseInt( hex.slice( 3, 5 ), 16 );
	const b = parseInt( hex.slice( 5, 7 ), 16 );
	return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#26292e' : '#ffffff';
};

// Typography shared by all text templates: an optional editor font
// family plus a 60..160% size factor.
const famFor = ( opts ) =>
	opts && opts.font ? `"${ opts.font }", sans-serif` : 'sans-serif';
const tscale = ( opts ) =>
	Math.max( 60, Math.min( 160, ( opts && opts.textScale ) || 100 ) ) / 100;
const setFont = ( g, opts, weight, px ) => {
	g.font = `${ weight } ${ Math.round( px * tscale( opts ) ) }px ${ famFor(
		opts
	) }`;
};

// Multi-line text: split on line breaks (up to maxLines) and draw the
// block vertically centered on cy.
const splitLines = ( s, maxLines = 3 ) =>
	String( s || '' )
		.split( /\r?\n/ )
		.map( ( l ) => l.trim() )
		.filter( Boolean )
		.slice( 0, maxLines );
const fillLines = ( g, lines, cx, cy, lh ) => {
	const y0 = cy - ( ( lines.length - 1 ) * lh ) / 2;
	lines.forEach( ( ln, i ) => g.fillText( ln, cx, y0 + i * lh ) );
};

/* -------------------------------- bunting -------------------------------- */

/**
 * Text to a bunting banner: one letter per pennant on a cord.
 *
 * @param {Object} like Canvas-like for node fallback.
 * @param {Object} opts { text, shape 'triangle'|'swallow', paletteId,
 *                        perRow (default 8) }.
 * @return {HTMLCanvasElement}
 */
export function bunting( like, opts = {} ) {
	const text = String( opts.text || 'PARTY' ).toUpperCase();
	const shape = [ 'swallow', 'flag', 'scallop' ].includes( opts.shape )
		? opts.shape
		: 'triangle';
	const colors = opts.colors || paletteById( opts.paletteId ).colors;
	const perRow = Math.max( 4, Math.min( 12, opts.perRow || 8 ) );
	// Every input line starts its own cord row; long lines still wrap
	// at the per-row limit.
	const lines = splitLines( text, 6 );
	if ( ! lines.length ) {
		lines.push( 'PARTY' );
	}
	const slices = [];
	for ( const line of lines ) {
		const chars = Array.from( line );
		for ( let i = 0; i < chars.length; i += perRow ) {
			slices.push( chars.slice( i, i + perRow ) );
		}
	}
	const rows = Math.max( 1, slices.length );
	const PW = 150;
	const PH = 200;
	const GAP = 26;
	const widest = slices.reduce( ( m, s ) => Math.max( m, s.length ), 1 );
	const rowW = widest * ( PW + GAP ) + GAP;
	const rowH = PH + 110;
	const c = makeCanvas( like, Math.max( rowW, 400 ), rows * rowH + 30 );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	let colorIdx = 0;
	for ( let r = 0; r < rows; r++ ) {
		const slice = slices[ r ];
		const y0 = 40 + r * rowH;
		const x0 = ( c.width - ( slice.length * ( PW + GAP ) - GAP ) ) / 2;
		// The cord: a gentle catenary-ish arc through the hang points.
		g.strokeStyle = '#8a7f70';
		g.lineWidth = 3;
		g.beginPath();
		for ( let i = 0; i <= 40; i++ ) {
			const u = i / 40;
			const x = x0 - 30 + u * ( slice.length * ( PW + GAP ) - GAP + 60 );
			const y = y0 + Math.sin( Math.PI * u ) * 26;
			if ( i ) {
				g.lineTo( x, y );
			} else {
				g.moveTo( x, y );
			}
		}
		g.stroke();
		slice.forEach( ( ch, i ) => {
			const u = ( i + 0.5 ) / slice.length;
			const px = x0 + i * ( PW + GAP );
			const py = y0 + Math.sin( Math.PI * u ) * 26 + 4;
			const color = colors[ colorIdx++ % colors.length ];
			g.fillStyle = color;
			g.beginPath();
			g.moveTo( px, py );
			g.lineTo( px + PW, py );
			if ( 'swallow' === shape ) {
				g.lineTo( px + PW, py + PH );
				g.lineTo( px + PW / 2, py + PH * 0.68 );
				g.lineTo( px, py + PH );
			} else if ( 'flag' === shape ) {
				g.lineTo( px + PW, py + PH * 0.92 );
				g.lineTo( px, py + PH * 0.92 );
			} else if ( 'scallop' === shape ) {
				g.lineTo( px + PW, py + PH * 0.62 );
				g.arc( px + PW / 2, py + PH * 0.62, PW / 2, 0, Math.PI );
			} else {
				g.lineTo( px + PW / 2, py + PH );
			}
			g.closePath();
			g.fill();
			// Two cord holes.
			g.fillStyle = '#ffffff';
			for ( const hx of [ px + PW * 0.16, px + PW * 0.84 ] ) {
				g.beginPath();
				g.arc( hx, py + 13, 5, 0, Math.PI * 2 );
				g.fill();
			}
			if ( ' ' !== ch ) {
				g.fillStyle = textOn( color );
				setFont( g, opts, 700, PW * 0.52 );
				g.textAlign = 'center';
				g.textBaseline = 'middle';
				g.fillText( ch, px + PW / 2, py + PH * 0.4 );
			}
		} );
	}
	return c;
}

/* ------------------------------ box dieline ------------------------------ */

/**
 * A cube gift-box dieline: cross-shaped net with glue flaps, solid cut
 * lines and dashed fold lines. Faces take the artwork (cover) or a
 * palette color.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { image (canvas|null), paletteId, labels: {cut, fold},
 *                        imageSpan 'face'|'net', ribbon (boolean) }.
 * @return {HTMLCanvasElement}
 */
export function boxDieline( like, opts = {} ) {
	const colors = opts.colors || paletteById( opts.paletteId ).colors;
	const img = opts.image || null;
	const span = 'net' === opts.imageSpan ? 'net' : 'face';
	const labels = opts.labels || { cut: 'Cut', fold: 'Fold' };
	const F = 190; // face size
	const FLAP = 44;
	const W = F * 4 + FLAP * 2 + 80;
	const H = F * 3 + FLAP * 2 + 110;
	const c = makeCanvas( like, W, H );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, W, H );
	const ox = 40 + FLAP;
	const oy = 70 + FLAP;
	// Face positions in the cross net: [col,row] of the 4x3 face grid.
	const faces = [
		[ 1, 0 ], // top
		[ 0, 1 ], // left
		[ 1, 1 ], // front
		[ 2, 1 ], // right
		[ 3, 1 ], // back
		[ 1, 2 ], // bottom
	];
	const fill = ( fx, fy, i ) => {
		const x = ox + fx * F;
		const y = oy + fy * F;
		if ( img && 'net' === span ) {
			// One artwork stretched across the whole 4x3 net: wrapping
			// paper style - the motif flows over the edges.
			const netW = 4 * F;
			const netH = 3 * F;
			const sc = Math.max( netW / img.width, netH / img.height );
			const sw = netW / sc;
			const sh = netH / sc;
			g.save();
			g.beginPath();
			g.rect( x, y, F, F );
			g.clip();
			g.drawImage(
				img,
				( img.width - sw ) / 2,
				( img.height - sh ) / 2,
				sw,
				sh,
				ox,
				oy,
				netW,
				netH
			);
			g.restore();
		} else if ( img ) {
			const s = Math.max( F / img.width, F / img.height );
			const sw = F / s;
			const sh = F / s;
			g.save();
			g.beginPath();
			g.rect( x, y, F, F );
			g.clip();
			g.drawImage(
				img,
				( img.width - sw ) / 2,
				( img.height - sh ) / 2,
				sw,
				sh,
				x,
				y,
				F,
				F
			);
			g.restore();
		} else {
			g.fillStyle = colors[ i % colors.length ];
			g.fillRect( x, y, F, F );
		}
	};
	faces.forEach( ( [ fx, fy ], i ) => fill( fx, fy, i ) );

	// A printed ribbon: a contrast band around the sides plus the lid
	// cross and a bow on the top face - reads as a wrapped gift once
	// the box is folded.
	if ( opts.ribbon ) {
		const rc = colors[ 1 % colors.length ];
		const band = F * 0.16;
		g.save();
		g.beginPath();
		faces.forEach( ( [ fx, fy ] ) =>
			g.rect( ox + fx * F, oy + fy * F, F, F )
		);
		g.clip();
		g.fillStyle = rc;
		// Around the four sides (middle row).
		g.fillRect( ox, oy + 1.5 * F - band / 2, 4 * F, band );
		// Across lid, front and bottom (column of faces at col 1).
		g.fillRect( ox + 1.5 * F - band / 2, oy, band, 3 * F );
		// Bow on the lid.
		const bx = ox + 1.5 * F;
		const by = oy + 0.5 * F;
		g.strokeStyle = rc;
		g.fillStyle = rc;
		for ( const dir of [ -1, 1 ] ) {
			g.beginPath();
			g.moveTo( bx, by );
			g.quadraticCurveTo(
				bx + dir * F * 0.3,
				by - F * 0.26,
				bx + dir * F * 0.34,
				by - F * 0.02
			);
			g.quadraticCurveTo( bx + dir * F * 0.2, by + F * 0.12, bx, by );
			g.fill();
		}
		g.beginPath();
		g.arc( bx, by, band * 0.42, 0, Math.PI * 2 );
		g.fill();
		g.restore();
	}

	// Glue flaps: trapezoids off the top face and side faces.
	g.fillStyle = '#f2efe9';
	const flap = ( x0, y0, x1, y1, nx, ny ) => {
		g.beginPath();
		g.moveTo( x0, y0 );
		g.lineTo(
			x0 + nx * FLAP + ( x1 - x0 ) * 0.14,
			y0 + ny * FLAP + ( y1 - y0 ) * 0.14
		);
		g.lineTo(
			x1 + nx * FLAP - ( x1 - x0 ) * 0.14,
			y1 + ny * FLAP - ( y1 - y0 ) * 0.14
		);
		g.lineTo( x1, y1 );
		g.closePath();
		g.fill();
		g.stroke();
	};
	g.strokeStyle = '#26292e';
	g.lineWidth = 2;
	// top face upper flap + bottom face lower flap + back face outer flap
	flap( ox + F, oy, ox + 2 * F, oy, 0, -1 );
	flap( ox + F, oy + 3 * F, ox + 2 * F, oy + 3 * F, 0, 1 );
	flap( ox + 4 * F, oy + F, ox + 4 * F, oy + 2 * F, 1, 0 );
	// side flaps on top/bottom of left, right, back faces
	for ( const col of [ 0, 2, 3 ] ) {
		flap( ox + col * F, oy + F, ox + ( col + 1 ) * F, oy + F, 0, -1 );
		flap(
			ox + col * F,
			oy + 2 * F,
			ox + ( col + 1 ) * F,
			oy + 2 * F,
			0,
			1
		);
	}

	// Cut outline (solid): trace the outer boundary of the net + flaps
	// approximately: stroke each face and flap edge that is outside.
	g.strokeStyle = '#26292e';
	g.lineWidth = 2.4;
	faces.forEach( ( [ fx, fy ] ) => {
		g.strokeRect( ox + fx * F, oy + fy * F, F, F );
	} );
	// Fold lines (dashed) over the inner edges.
	g.save();
	g.strokeStyle = '#26292e';
	g.lineWidth = 1.4;
	g.setLineDash( [ 8, 6 ] );
	for ( let colIdx = 1; colIdx < 4; colIdx++ ) {
		g.beginPath();
		g.moveTo( ox + colIdx * F, oy + F );
		g.lineTo( ox + colIdx * F, oy + 2 * F );
		g.stroke();
	}
	g.beginPath();
	g.moveTo( ox + F, oy + F );
	g.lineTo( ox + 2 * F, oy + F );
	g.stroke();
	g.beginPath();
	g.moveTo( ox + F, oy + 2 * F );
	g.lineTo( ox + 2 * F, oy + 2 * F );
	g.stroke();
	g.restore();

	// Legend.
	g.font = '600 15px sans-serif';
	g.fillStyle = '#26292e';
	g.textAlign = 'left';
	g.textBaseline = 'middle';
	g.beginPath();
	g.moveTo( 44, 34 );
	g.lineTo( 96, 34 );
	g.lineWidth = 2.4;
	g.setLineDash( [] );
	g.stroke();
	g.fillText( labels.cut, 106, 34 );
	g.save();
	g.setLineDash( [ 8, 6 ] );
	g.lineWidth = 1.4;
	g.beginPath();
	g.moveTo( 220, 34 );
	g.lineTo( 272, 34 );
	g.stroke();
	g.restore();
	g.fillText( labels.fold, 282, 34 );
	return c;
}

/* ------------------------------ sticker sheet ----------------------------- */

/**
 * Sticker shape paths, all fitted into a square cell. Shared between
 * the sticker sheet and its thumbnails.
 */
const stickerPath = ( g, shape, x, y, s ) => {
	const cx = x + s / 2;
	const cy = y + s / 2;
	g.beginPath();
	if ( 'rounded' === shape ) {
		const r = s * 0.18;
		if ( 'function' === typeof g.roundRect ) {
			g.roundRect( x, y, s, s, r );
		} else {
			g.rect( x, y, s, s );
		}
	} else if ( 'square' === shape ) {
		g.rect( x, y, s, s );
	} else if ( 'oval' === shape ) {
		if ( 'function' === typeof g.ellipse ) {
			g.ellipse( cx, cy, s / 2, s * 0.36, 0, 0, Math.PI * 2 );
		} else {
			g.arc( cx, cy, s / 2, 0, Math.PI * 2 );
		}
	} else if ( 'heart' === shape ) {
		g.moveTo( cx, y + s * 0.32 );
		g.bezierCurveTo(
			cx,
			y + s * 0.24,
			x + s * 0.38,
			y + s * 0.06,
			x + s * 0.24,
			y + s * 0.06
		);
		g.bezierCurveTo(
			x + s * 0.02,
			y + s * 0.06,
			x + s * 0.02,
			y + s * 0.36,
			x + s * 0.02,
			y + s * 0.36
		);
		g.bezierCurveTo(
			x + s * 0.02,
			y + s * 0.52,
			x + s * 0.18,
			y + s * 0.68,
			cx,
			y + s * 0.92
		);
		g.bezierCurveTo(
			x + s * 0.82,
			y + s * 0.68,
			x + s * 0.98,
			y + s * 0.52,
			x + s * 0.98,
			y + s * 0.36
		);
		g.bezierCurveTo(
			x + s * 0.98,
			y + s * 0.36,
			x + s * 0.98,
			y + s * 0.06,
			x + s * 0.76,
			y + s * 0.06
		);
		g.bezierCurveTo(
			x + s * 0.62,
			y + s * 0.06,
			cx,
			y + s * 0.24,
			cx,
			y + s * 0.32
		);
		g.closePath();
	} else if ( 'star' === shape ) {
		const R = s / 2;
		const r0 = R * 0.46;
		for ( let i = 0; i < 10; i++ ) {
			const a = -Math.PI / 2 + ( i * Math.PI ) / 5;
			const rr = i % 2 ? r0 : R;
			const px = cx + Math.cos( a ) * rr;
			const py = cy + Math.sin( a ) * rr;
			if ( i ) {
				g.lineTo( px, py );
			} else {
				g.moveTo( px, py );
			}
		}
		g.closePath();
	} else if ( 'hexagon' === shape ) {
		for ( let i = 0; i < 6; i++ ) {
			const a = -Math.PI / 2 + ( i * Math.PI ) / 3;
			const px = cx + Math.cos( a ) * ( s / 2 );
			const py = cy + Math.sin( a ) * ( s / 2 );
			if ( i ) {
				g.lineTo( px, py );
			} else {
				g.moveTo( px, py );
			}
		}
		g.closePath();
	} else if ( 'flower' === shape ) {
		const n = 10;
		const r0 = ( s / 2 ) * 0.82;
		const bump = ( ( Math.PI * r0 ) / n ) * 0.72;
		for ( let i = 0; i < n; i++ ) {
			const a = ( i / n ) * Math.PI * 2;
			g.arc(
				cx + Math.cos( a ) * r0,
				cy + Math.sin( a ) * r0,
				bump,
				a - Math.PI * 0.72,
				a + Math.PI * 0.72
			);
		}
		g.closePath();
	} else {
		g.arc( cx, cy, s / 2, 0, Math.PI * 2 );
	}
};

export const STICKER_SHAPES = [
	'circle',
	'rounded',
	'square',
	'heart',
	'star',
	'oval',
	'hexagon',
	'flower',
];

/**
 * A print-and-cut sticker sheet: the motif (or plain palette colors
 * with an optional label text) repeated in a grid, each sticker with a
 * cut contour, plus corner registration marks.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { image (canvas|null), shape (STICKER_SHAPES),
 *                        cols (2..6), colors, paletteId, text, font,
 *                        textScale }.
 * @return {Object} { canvas, count }
 */
export function stickerSheet( like, opts = {} ) {
	const img = opts.image || null;
	const shape = STICKER_SHAPES.includes( opts.shape ) ? opts.shape : 'circle';
	const colors = opts.colors || paletteById( opts.paletteId ).colors;
	const textLines = splitLines( opts.text, 3 );
	const cols = Math.max( 2, Math.min( 6, opts.cols || 4 ) );
	const W = 1240; // A4-ish at ~150 dpi
	const H = 1754;
	const M = 70;
	const gap = 26;
	const cell = Math.floor( ( W - M * 2 - gap * ( cols - 1 ) ) / cols );
	const rows = Math.floor( ( H - M * 2 - 60 ) / ( cell + gap ) );
	const c = makeCanvas( like, W, H );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, W, H );
	// Registration marks (print & cut alignment).
	g.fillStyle = '#26292e';
	for ( const [ mx, my ] of [
		[ M / 2, M / 2 ],
		[ W - M / 2 - 26, M / 2 ],
		[ M / 2, H - M / 2 - 26 ],
	] ) {
		g.fillRect( mx, my, 26, 26 );
	}
	let count = 0;
	for ( let r = 0; r < rows; r++ ) {
		for ( let q = 0; q < cols; q++ ) {
			const x = M + q * ( cell + gap );
			const y = M + 60 + r * ( cell + gap );
			if ( img ) {
				g.save();
				stickerPath( g, shape, x, y, cell );
				g.clip();
				const s = Math.max( cell / img.width, cell / img.height );
				const sw = cell / s;
				const sh = cell / s;
				g.drawImage(
					img,
					( img.width - sw ) / 2,
					( img.height - sh ) / 2,
					sw,
					sh,
					x,
					y,
					cell,
					cell
				);
				g.restore();
			} else {
				// Color stickers: palette fill, a soft inner ring and an
				// optional label text (name tags, "Danke", dots...).
				const color = colors[ ( r * cols + q ) % colors.length ];
				g.fillStyle = color;
				stickerPath( g, shape, x, y, cell );
				g.fill();
				g.save();
				stickerPath( g, shape, x, y, cell );
				g.clip();
				g.strokeStyle = 'rgba(255,255,255,0.75)';
				g.lineWidth = 3;
				g.setLineDash( [ 2, 10 ] );
				stickerPath(
					g,
					shape,
					x + cell * 0.07,
					y + cell * 0.07,
					cell * 0.86
				);
				g.stroke();
				g.setLineDash( [] );
				if ( textLines.length ) {
					const px = cell * ( textLines.length > 1 ? 0.16 : 0.2 );
					g.fillStyle = textOn( color );
					setFont( g, opts, 700, px );
					g.textAlign = 'center';
					g.textBaseline = 'middle';
					fillLines(
						g,
						textLines,
						x + cell / 2,
						y + cell / 2,
						Math.round( px * 1.2 * tscale( opts ) )
					);
				}
				g.restore();
			}
			// The cut contour, slightly outside the motif.
			g.strokeStyle = '#e03131';
			g.lineWidth = 2;
			stickerPath( g, shape, x, y, cell );
			g.stroke();
			count++;
		}
	}
	return { canvas: c, count };
}

/* ------------------------------- gift tags -------------------------------- */

/**
 * Gift tags: 8 tags per sheet with a punch hole, the motif (or color)
 * and a text line, cut contours included.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { image, colors, paletteId, text }.
 * @return {HTMLCanvasElement}
 */
export function giftTags( like, opts = {} ) {
	const colors = opts.colors || paletteById( opts.paletteId ).colors;
	const lines = splitLines( opts.text, 3 );
	const lh = Math.round( 28 * tscale( opts ) );
	const img = opts.image || null;
	const TW = 260;
	const TH = 130;
	const GAP = 26;
	const cols = 2;
	const rows = 4;
	const c = makeCanvas(
		like,
		cols * ( TW + GAP ) + GAP,
		rows * ( TH + GAP ) + GAP
	);
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	for ( let r = 0; r < rows; r++ ) {
		for ( let q = 0; q < cols; q++ ) {
			const x = GAP + q * ( TW + GAP );
			const y = GAP + r * ( TH + GAP );
			const color = colors[ ( r * cols + q ) % colors.length ];
			const tag = () => {
				g.beginPath();
				g.moveTo( x + 34, y );
				g.lineTo( x + TW, y );
				g.lineTo( x + TW, y + TH );
				g.lineTo( x + 34, y + TH );
				g.lineTo( x, y + TH / 2 );
				g.closePath();
			};
			if ( img ) {
				g.save();
				tag();
				g.clip();
				const s = Math.max( TW / img.width, TH / img.height );
				g.drawImage(
					img,
					( img.width - TW / s ) / 2,
					( img.height - TH / s ) / 2,
					TW / s,
					TH / s,
					x,
					y,
					TW,
					TH
				);
				g.restore();
			} else {
				g.fillStyle = color;
				tag();
				g.fill();
			}
			g.strokeStyle = '#b9542a';
			g.lineWidth = 1.6;
			tag();
			g.stroke();
			// Punch hole.
			g.fillStyle = '#ffffff';
			g.beginPath();
			g.arc( x + 30, y + TH / 2, 9, 0, Math.PI * 2 );
			g.fill();
			g.strokeStyle = '#8a8f96';
			g.lineWidth = 1.4;
			g.beginPath();
			g.arc( x + 30, y + TH / 2, 9, 0, Math.PI * 2 );
			g.stroke();
			if ( lines.length ) {
				// Centered on the tag; on photos a soft shadow keeps the
				// text readable instead of an overlay band.
				g.save();
				if ( img ) {
					g.fillStyle = '#ffffff';
					g.shadowColor = 'rgba(0,0,0,0.6)';
					g.shadowBlur = 8;
				} else {
					g.fillStyle = textOn( color );
				}
				setFont( g, opts, 600, 24 );
				g.textAlign = 'center';
				g.textBaseline = 'middle';
				fillLines( g, lines, x + 34 + ( TW - 34 ) / 2, y + TH / 2, lh );
				g.restore();
			}
		}
	}
	return c;
}

/* ---------------------------- cupcake toppers ----------------------------- */

/**
 * Cupcake toppers: circles with the motif or a monogram letter, ready
 * to cut and glue onto sticks.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { image, colors, paletteId, text }.
 * @return {HTMLCanvasElement}
 */
export function cupcakeToppers( like, opts = {} ) {
	const colors = opts.colors || paletteById( opts.paletteId ).colors;
	const mono = ( splitLines( opts.text, 1 )[ 0 ] || '' )
		.slice( 0, 2 )
		.toUpperCase();
	const img = opts.image || null;
	const D = 240;
	const GAP = 30;
	const cols = 3;
	const rows = 4;
	const c = makeCanvas(
		like,
		cols * ( D + GAP ) + GAP,
		rows * ( D + GAP ) + GAP
	);
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	for ( let r = 0; r < rows; r++ ) {
		for ( let q = 0; q < cols; q++ ) {
			const cx = GAP + q * ( D + GAP ) + D / 2;
			const cy = GAP + r * ( D + GAP ) + D / 2;
			const color = colors[ ( r * cols + q ) % colors.length ];
			if ( img ) {
				g.save();
				g.beginPath();
				g.arc( cx, cy, D / 2, 0, Math.PI * 2 );
				g.clip();
				const s = Math.max( D / img.width, D / img.height );
				g.drawImage(
					img,
					( img.width - D / s ) / 2,
					( img.height - D / s ) / 2,
					D / s,
					D / s,
					cx - D / 2,
					cy - D / 2,
					D,
					D
				);
				g.restore();
			} else {
				g.fillStyle = color;
				g.beginPath();
				g.arc( cx, cy, D / 2, 0, Math.PI * 2 );
				g.fill();
				// Scalloped inner ring for the classic topper look.
				g.strokeStyle = 'rgba(255,255,255,0.85)';
				g.lineWidth = 4;
				g.setLineDash( [ 2, 12 ] );
				g.beginPath();
				g.arc( cx, cy, D / 2 - 12, 0, Math.PI * 2 );
				g.stroke();
				g.setLineDash( [] );
				if ( mono ) {
					g.fillStyle = textOn( color );
					setFont( g, opts, 700, D * 0.4 );
					g.textAlign = 'center';
					g.textBaseline = 'middle';
					g.fillText( mono, cx, cy + 4 );
				}
			}
			g.strokeStyle = '#b9542a';
			g.lineWidth = 1.6;
			g.beginPath();
			g.arc( cx, cy, D / 2, 0, Math.PI * 2 );
			g.stroke();
		}
	}
	return c;
}

/* ------------------------------ place cards ------------------------------- */

/**
 * Folded place cards: names from a list, one tent card each with a
 * dashed fold line, color bar and cut contour.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { names (array), colors, paletteId }.
 * @return {HTMLCanvasElement}
 */
export function placeCards( like, opts = {} ) {
	const colors = opts.colors || paletteById( opts.paletteId ).colors;
	const names = ( opts.names || [] )
		.map( ( n ) => String( n ).trim() )
		.filter( Boolean )
		.slice( 0, 12 );
	if ( ! names.length ) {
		names.push( 'Name' );
	}
	const CW = 420;
	const CH = 240; // full card, folds to CH/2
	const GAP = 26;
	const cols = 2;
	const rows = Math.ceil( names.length / cols );
	const c = makeCanvas(
		like,
		cols * ( CW + GAP ) + GAP,
		rows * ( CH + GAP ) + GAP
	);
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	names.forEach( ( name, i ) => {
		const q = i % cols;
		const r = ( i / cols ) | 0;
		const x = GAP + q * ( CW + GAP );
		const y = GAP + r * ( CH + GAP );
		const color = colors[ i % colors.length ];
		g.strokeStyle = '#b9542a';
		g.lineWidth = 1.6;
		g.strokeRect( x, y, CW, CH );
		// Fold line across the middle.
		g.save();
		g.strokeStyle = '#8a8f96';
		g.lineWidth = 1.2;
		g.setLineDash( [ 7, 6 ] );
		g.beginPath();
		g.moveTo( x, y + CH / 2 );
		g.lineTo( x + CW, y + CH / 2 );
		g.stroke();
		g.restore();
		// Front half (bottom) carries the name; the top half is printed
		// upside down so it reads correctly after folding.
		const paint = ( flip ) => {
			g.save();
			if ( flip ) {
				g.translate( x + CW / 2, y + CH / 4 );
				g.rotate( Math.PI );
			} else {
				g.translate( x + CW / 2, y + ( 3 * CH ) / 4 );
			}
			g.fillStyle = color;
			g.fillRect( -CW / 2 + 14, CH / 4 - 26, CW - 28, 12 );
			g.fillStyle = '#26292e';
			setFont( g, opts, 600, 40 );
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			g.fillText( name, 0, -6 );
			g.restore();
		};
		paint( false );
		paint( true );
	} );
	return c;
}

/* ------------------------------ straw flags ------------------------------- */

/**
 * Straw flags: small double flags that fold around a straw, with the
 * text (or motif color) on both wings.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { text, colors, paletteId }.
 * @return {HTMLCanvasElement}
 */
export function strawFlags( like, opts = {} ) {
	const colors = opts.colors || paletteById( opts.paletteId ).colors;
	const lines = splitLines( opts.text, 2 ).map( ( l ) => l.slice( 0, 12 ) );
	const lh = Math.round( 30 * tscale( opts ) );
	const FW = 300; // both wings together
	const FH = 96;
	const GAP = 24;
	const cols = 2;
	const rows = 6;
	const c = makeCanvas(
		like,
		cols * ( FW + GAP ) + GAP,
		rows * ( FH + GAP ) + GAP
	);
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	for ( let r = 0; r < rows; r++ ) {
		for ( let q = 0; q < cols; q++ ) {
			const x = GAP + q * ( FW + GAP );
			const y = GAP + r * ( FH + GAP );
			const color = colors[ ( r * cols + q ) % colors.length ];
			const wing = FW / 2;
			// Swallowtail on both outer ends.
			g.fillStyle = color;
			g.beginPath();
			g.moveTo( x + wing * 0.22, y );
			g.lineTo( x + FW - wing * 0.22, y );
			g.lineTo( x + FW, y + FH / 2 );
			g.lineTo( x + FW - wing * 0.22, y + FH );
			g.lineTo( x + wing * 0.22, y + FH );
			g.lineTo( x, y + FH / 2 );
			g.closePath();
			g.fill();
			g.strokeStyle = '#b9542a';
			g.lineWidth = 1.4;
			g.stroke();
			// Straw fold line in the middle.
			g.save();
			g.strokeStyle = 'rgba(255,255,255,0.9)';
			g.lineWidth = 1.2;
			g.setLineDash( [ 6, 5 ] );
			g.beginPath();
			g.moveTo( x + FW / 2, y + 4 );
			g.lineTo( x + FW / 2, y + FH - 4 );
			g.stroke();
			g.restore();
			if ( lines.length ) {
				g.fillStyle = textOn( color );
				setFont( g, opts, 600, lines.length > 1 ? 22 : 26 );
				g.textAlign = 'center';
				g.textBaseline = 'middle';
				// Left wing upside down so both read correctly folded.
				g.save();
				g.translate( x + FW * 0.27, y + FH / 2 );
				g.rotate( Math.PI );
				fillLines( g, lines, 0, 0, lh );
				g.restore();
				fillLines( g, lines, x + FW * 0.73, y + FH / 2, lh );
			}
		}
	}
	return c;
}

/* -------------------------------- party hat ------------------------------- */

/**
 * A cone party-hat dieline: a circle sector with stripes in the
 * palette (or the motif), glue tab and cut/fold styling.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { image, colors, paletteId,
 *                        decor 'stripes'|'dots'|'solid', stripeCount }.
 * @return {HTMLCanvasElement}
 */
export function partyHat( like, opts = {} ) {
	const colors = opts.colors || paletteById( opts.paletteId ).colors;
	const img = opts.image || null;
	const R = 430;
	const A0 = Math.PI * 0.62; // sector sweep ~112 deg
	const c = makeCanvas( like, R * 2 * Math.sin( A0 / 2 ) + 120, R + 120 );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	const cx = c.width / 2;
	const cy = 60;
	const start = Math.PI / 2 - A0 / 2;
	const sector = () => {
		g.beginPath();
		g.moveTo( cx, cy );
		g.arc( cx, cy, R, start, start + A0 );
		g.closePath();
	};
	g.save();
	sector();
	g.clip();
	if ( img ) {
		const s = Math.max( c.width / img.width, ( R + 60 ) / img.height );
		g.drawImage(
			img,
			( img.width - c.width / s ) / 2,
			( img.height - ( R + 60 ) / s ) / 2,
			c.width / s,
			( R + 60 ) / s,
			0,
			0,
			c.width,
			R + 60
		);
	} else if ( 'dots' === opts.decor ) {
		// Confetti dots over the base color.
		g.fillStyle = colors[ 0 ];
		g.fillRect( 0, 0, c.width, R + 60 );
		let seed = 7;
		const rnd = () => {
			seed = ( seed * 16807 ) % 2147483647;
			return seed / 2147483647;
		};
		for ( let i = 0; i < 90; i++ ) {
			g.fillStyle =
				colors[ ( 1 + ( i % ( colors.length - 1 ) ) ) % colors.length ];
			g.beginPath();
			g.arc(
				rnd() * c.width,
				rnd() * ( R + 60 ),
				10 + rnd() * 16,
				0,
				Math.PI * 2
			);
			g.fill();
		}
	} else if ( 'solid' === opts.decor ) {
		g.fillStyle = colors[ 0 ];
		g.fillRect( 0, 0, c.width, R + 60 );
		// A contrast brim arc along the bottom edge.
		g.strokeStyle = colors[ 1 % colors.length ];
		g.lineWidth = 26;
		g.beginPath();
		g.arc( cx, cy, R - 20, start, start + A0 );
		g.stroke();
	} else {
		// Radial stripes.
		const stripes = Math.max( 5, Math.min( 14, opts.stripeCount || 9 ) );
		for ( let i = 0; i < stripes; i++ ) {
			g.fillStyle = colors[ i % colors.length ];
			g.beginPath();
			g.moveTo( cx, cy );
			g.arc(
				cx,
				cy,
				R,
				start + ( A0 * i ) / stripes,
				start + ( A0 * ( i + 1 ) ) / stripes
			);
			g.closePath();
			g.fill();
		}
	}
	g.restore();
	// Glue tab along one straight edge.
	const tabA = start + A0;
	const x1 = cx + Math.cos( tabA ) * R;
	const y1 = cy + Math.sin( tabA ) * R;
	g.fillStyle = '#f2efe9';
	g.strokeStyle = '#26292e';
	g.lineWidth = 1.6;
	g.beginPath();
	g.moveTo( cx, cy );
	g.lineTo( x1, y1 );
	const nx = Math.cos( tabA + Math.PI / 2 );
	const ny = Math.sin( tabA + Math.PI / 2 );
	g.lineTo( x1 + nx * 34, y1 + ny * 34 );
	g.lineTo( cx + nx * 34, cy + ny * 34 );
	g.closePath();
	g.fill();
	g.stroke();
	// Cut contour.
	g.strokeStyle = '#26292e';
	g.lineWidth = 2.4;
	sector();
	g.stroke();
	return c;
}

/* ----------------------------- letter banner ------------------------------ */

/**
 * Letter banner: each letter as one big pennant card, meant to print
 * one card per page - the sheet shows the whole set in a grid.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { text, colors, paletteId }.
 * @return {HTMLCanvasElement}
 */
export function letterBanner( like, opts = {} ) {
	const colors = opts.colors || paletteById( opts.paletteId ).colors;
	const chars = Array.from(
		String( opts.text || 'PARTY' ).toUpperCase()
	).filter( ( ch ) => ! /\s/.test( ch ) );
	const CW = 300;
	const CH = 400;
	const GAP = 26;
	const cols = Math.min(
		5,
		Math.max( 2, Math.ceil( Math.sqrt( chars.length ) ) )
	);
	const rows = Math.ceil( chars.length / cols );
	const c = makeCanvas(
		like,
		cols * ( CW + GAP ) + GAP,
		rows * ( CH + GAP ) + GAP
	);
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	chars.forEach( ( ch, i ) => {
		const q = i % cols;
		const r = ( i / cols ) | 0;
		const x = GAP + q * ( CW + GAP );
		const y = GAP + r * ( CH + GAP );
		const color = colors[ i % colors.length ];
		g.fillStyle = color;
		g.beginPath();
		g.moveTo( x, y );
		g.lineTo( x + CW, y );
		g.lineTo( x + CW, y + CH * 0.78 );
		g.lineTo( x + CW / 2, y + CH );
		g.lineTo( x, y + CH * 0.78 );
		g.closePath();
		g.fill();
		g.strokeStyle = '#b9542a';
		g.lineWidth = 1.6;
		g.stroke();
		g.fillStyle = '#ffffff';
		for ( const hx of [ x + CW * 0.14, x + CW * 0.86 ] ) {
			g.beginPath();
			g.arc( hx, y + 22, 8, 0, Math.PI * 2 );
			g.fill();
			g.strokeStyle = '#8a8f96';
			g.lineWidth = 1.2;
			g.stroke();
		}
		g.fillStyle = textOn( color );
		setFont( g, opts, 800, CW * 0.62 );
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		g.fillText( ch, x + CW / 2, y + CH * 0.42 );
	} );
	return c;
}

/* ---------------------------- cupcake wrappers ---------------------------- */

/**
 * Cupcake wrappers: two arc-band dielines per sheet that wrap around a
 * standard cupcake, with an optional scalloped top edge, glue tab and
 * the motif or palette colors on the band.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { image, colors, paletteId, scallop (boolean) }.
 * @return {HTMLCanvasElement}
 */
export function cupcakeWrappers( like, opts = {} ) {
	const colors = opts.colors || paletteById( opts.paletteId ).colors;
	const img = opts.image || null;
	const scallop = false !== opts.scallop;
	const R1 = 320; // outer (top) radius
	const R0 = 185; // inner (bottom) radius
	const A = Math.PI * 0.82; // band sweep
	const bandW = R1 * 2 * Math.sin( A / 2 ) + 90;
	const bandH = R1 - R0 * Math.cos( A / 2 ) + 80;
	const c = makeCanvas( like, bandW, bandH * 2 + 40 );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	const one = ( top, colorIdx ) => {
		const cx = c.width / 2;
		const cy = top + R1 + 30;
		const a0 = -Math.PI / 2 - A / 2;
		const a1 = -Math.PI / 2 + A / 2;
		const band = () => {
			g.beginPath();
			if ( scallop ) {
				const n = 11;
				for ( let i = 0; i < n; i++ ) {
					const am = a0 + ( ( i + 0.5 ) / n ) * A;
					const bump = ( R1 * A ) / n / 2;
					g.arc(
						cx + Math.cos( am ) * ( R1 - bump * 0.4 ),
						cy + Math.sin( am ) * ( R1 - bump * 0.4 ),
						bump,
						am - Math.PI * 0.62,
						am + Math.PI * 0.62
					);
				}
			} else {
				g.arc( cx, cy, R1, a0, a1 );
			}
			g.arc( cx, cy, R0, a1, a0, true );
			g.closePath();
		};
		g.save();
		band();
		g.clip();
		if ( img ) {
			const bh = R1 - R0 + 60;
			const s = Math.max( c.width / img.width, bh / img.height );
			g.drawImage(
				img,
				( img.width - c.width / s ) / 2,
				( img.height - bh / s ) / 2,
				c.width / s,
				bh / s,
				0,
				cy - R1,
				c.width,
				bh
			);
		} else {
			// Radial stripes along the band.
			const stripes = 12;
			for ( let i = 0; i < stripes; i++ ) {
				g.fillStyle = colors[ ( colorIdx + i ) % colors.length ];
				g.beginPath();
				g.moveTo( cx, cy );
				g.arc(
					cx,
					cy,
					R1 + 10,
					a0 + ( A * i ) / stripes,
					a0 + ( A * ( i + 1 ) ) / stripes
				);
				g.closePath();
				g.fill();
			}
		}
		g.restore();
		// Glue tab on the right straight edge.
		const tx = cx + Math.cos( a1 ) * ( ( R0 + R1 ) / 2 );
		const ty = cy + Math.sin( a1 ) * ( ( R0 + R1 ) / 2 );
		const nx = Math.cos( a1 + Math.PI / 2 );
		const ny = Math.sin( a1 + Math.PI / 2 );
		g.fillStyle = '#f2efe9';
		g.strokeStyle = '#26292e';
		g.lineWidth = 1.6;
		g.beginPath();
		g.moveTo( cx + Math.cos( a1 ) * R0, cy + Math.sin( a1 ) * R0 );
		g.lineTo( cx + Math.cos( a1 ) * R1, cy + Math.sin( a1 ) * R1 );
		g.lineTo(
			cx + Math.cos( a1 ) * ( R1 - 14 ) + nx * 30,
			cy + Math.sin( a1 ) * ( R1 - 14 ) + ny * 30
		);
		g.lineTo(
			cx + Math.cos( a1 ) * ( R0 + 14 ) + nx * 30,
			cy + Math.sin( a1 ) * ( R0 + 14 ) + ny * 30
		);
		g.closePath();
		g.fill();
		g.stroke();
		void tx;
		void ty;
		// Cut contour.
		g.strokeStyle = '#26292e';
		g.lineWidth = 2.2;
		band();
		g.stroke();
	};
	one( 0, 0 );
	one( bandH + 20, 3 );
	return c;
}

/* ------------------------------ photo props ------------------------------- */

/**
 * Photo-booth props: mustache, lips, glasses, bow tie, crown and a
 * speech bubble with the text - each with a dashed stick marker, ready
 * to cut and glue onto skewers.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { text, colors, paletteId, font, textScale }.
 * @return {HTMLCanvasElement}
 */
export function photoProps( like, opts = {} ) {
	const colors = opts.colors || paletteById( opts.paletteId ).colors;
	const bubbleLines = splitLines( opts.text || 'PARTY!', 2 ).map( ( l ) =>
		l.slice( 0, 16 )
	);
	const CW = 560;
	const CH = 310;
	const GAP = 24;
	const cols = 2;
	const rows = 3;
	const c = makeCanvas(
		like,
		cols * ( CW + GAP ) + GAP,
		rows * ( CH + GAP ) + GAP
	);
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	const stick = ( x, y ) => {
		g.save();
		g.strokeStyle = '#8a8f96';
		g.lineWidth = 1.4;
		g.setLineDash( [ 6, 5 ] );
		g.strokeRect( x - 11, y, 22, 54 );
		g.restore();
	};
	const outline = () => {
		g.strokeStyle = '#b9542a';
		g.lineWidth = 1.6;
		g.stroke();
	};
	const cell = ( i ) => {
		const x = GAP + ( i % cols ) * ( CW + GAP );
		const y = GAP + ( ( i / cols ) | 0 ) * ( CH + GAP );
		return [ x + CW / 2, y + CH / 2, colors[ i % colors.length ] ];
	};
	// 1: mustache.
	{
		const [ cx, cy, col ] = cell( 0 );
		g.fillStyle = col;
		g.beginPath();
		for ( const dir of [ -1, 1 ] ) {
			g.moveTo( cx, cy - 8 );
			g.bezierCurveTo(
				cx + dir * 60,
				cy - 66,
				cx + dir * 190,
				cy - 48,
				cx + dir * 208,
				cy + 6
			);
			g.bezierCurveTo(
				cx + dir * 150,
				cy - 6,
				cx + dir * 130,
				cy + 40,
				cx + dir * 60,
				cy + 30
			);
			g.bezierCurveTo( cx + dir * 24, cy + 24, cx, cy + 10, cx, cy - 8 );
		}
		g.fill();
		outline();
		stick( cx, cy + 40 );
	}
	// 2: lips.
	{
		const [ cx, cy, col ] = cell( 1 );
		g.fillStyle = col;
		g.beginPath();
		g.moveTo( cx - 170, cy );
		g.bezierCurveTo( cx - 80, cy - 88, cx - 26, cy - 40, cx, cy - 44 );
		g.bezierCurveTo( cx + 26, cy - 40, cx + 80, cy - 88, cx + 170, cy );
		g.bezierCurveTo( cx + 80, cy + 78, cx - 80, cy + 78, cx - 170, cy );
		g.closePath();
		g.fill();
		outline();
		g.strokeStyle = 'rgba(255,255,255,0.7)';
		g.lineWidth = 3;
		g.beginPath();
		g.moveTo( cx - 150, cy + 2 );
		g.quadraticCurveTo( cx, cy + 26, cx + 150, cy + 2 );
		g.stroke();
		stick( cx, cy + 62 );
	}
	// 3: glasses.
	{
		const [ cx, cy, col ] = cell( 2 );
		g.fillStyle = col;
		g.strokeStyle = col;
		g.lineWidth = 16;
		for ( const dir of [ -1, 1 ] ) {
			g.beginPath();
			g.arc( cx + dir * 92, cy, 78, 0, Math.PI * 2 );
			g.stroke();
		}
		g.lineWidth = 12;
		g.beginPath();
		g.moveTo( cx - 16, cy - 10 );
		g.quadraticCurveTo( cx, cy - 34, cx + 16, cy - 10 );
		g.stroke();
		for ( const dir of [ -1, 1 ] ) {
			g.beginPath();
			g.moveTo( cx + dir * 168, cy - 12 );
			g.lineTo( cx + dir * 252, cy - 34 );
			g.stroke();
		}
		stick( cx, cy + 82 );
	}
	// 4: bow tie.
	{
		const [ cx, cy, col ] = cell( 3 );
		g.fillStyle = col;
		g.beginPath();
		for ( const dir of [ -1, 1 ] ) {
			g.moveTo( cx, cy );
			g.lineTo( cx + dir * 170, cy - 78 );
			g.quadraticCurveTo( cx + dir * 205, cy, cx + dir * 170, cy + 78 );
			g.closePath();
		}
		g.fill();
		outline();
		g.fillStyle = colors[ 4 % colors.length ];
		g.beginPath();
		if ( 'function' === typeof g.roundRect ) {
			g.roundRect( cx - 34, cy - 34, 68, 68, 14 );
		} else {
			g.rect( cx - 34, cy - 34, 68, 68 );
		}
		g.fill();
		outline();
		stick( cx, cy + 80 );
	}
	// 5: crown.
	{
		const [ cx, cy, col ] = cell( 4 );
		g.fillStyle = col;
		g.beginPath();
		g.moveTo( cx - 190, cy + 70 );
		g.lineTo( cx - 190, cy - 30 );
		g.lineTo( cx - 95, cy + 20 );
		g.lineTo( cx, cy - 78 );
		g.lineTo( cx + 95, cy + 20 );
		g.lineTo( cx + 190, cy - 30 );
		g.lineTo( cx + 190, cy + 70 );
		g.closePath();
		g.fill();
		outline();
		g.fillStyle = 'rgba(255,255,255,0.8)';
		for ( const dx of [ -190, 0, 190 ] ) {
			g.beginPath();
			g.arc( cx + dx, dx ? cy - 40 : cy - 88, 13, 0, Math.PI * 2 );
			g.fill();
		}
		stick( cx, cy + 72 );
	}
	// 6: speech bubble with the text.
	{
		const [ cx, cy, col ] = cell( 5 );
		g.fillStyle = col;
		g.beginPath();
		if ( 'function' === typeof g.roundRect ) {
			g.roundRect( cx - 220, cy - 90, 440, 150, 34 );
		} else {
			g.rect( cx - 220, cy - 90, 440, 150 );
		}
		g.fill();
		g.beginPath();
		g.moveTo( cx - 40, cy + 56 );
		g.lineTo( cx - 6, cy + 110 );
		g.lineTo( cx + 30, cy + 56 );
		g.closePath();
		g.fill();
		outline();
		g.fillStyle = textOn( col );
		setFont( g, opts, 700, bubbleLines.length > 1 ? 44 : 54 );
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		fillLines(
			g,
			bubbleLines,
			cx,
			cy - 14,
			Math.round( 50 * tscale( opts ) )
		);
		stick( cx, cy + 112 );
	}
	return c;
}

/* ------------------------------ bottle labels ----------------------------- */

/**
 * Bottle labels: four wrap-around labels per sheet with the motif or a
 * color band, a text line and cut contours.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { image, colors, paletteId, text, font, textScale }.
 * @return {HTMLCanvasElement}
 */
export function bottleLabels( like, opts = {} ) {
	const colors = opts.colors || paletteById( opts.paletteId ).colors;
	const img = opts.image || null;
	const lines = splitLines( opts.text || 'CHEERS', 2 );
	const px = lines.length > 1 ? 52 : 64;
	const lh = Math.round( px * 1.14 * tscale( opts ) );
	const LW = 1000;
	const LH = 250;
	const GAP = 28;
	const rows = 4;
	const c = makeCanvas( like, LW + GAP * 2, rows * ( LH + GAP ) + GAP );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	for ( let r = 0; r < rows; r++ ) {
		const x = GAP;
		const y = GAP + r * ( LH + GAP );
		const color = colors[ r % colors.length ];
		if ( img ) {
			g.save();
			g.beginPath();
			g.rect( x, y, LW, LH );
			g.clip();
			const s = Math.max( LW / img.width, LH / img.height );
			g.drawImage(
				img,
				( img.width - LW / s ) / 2,
				( img.height - LH / s ) / 2,
				LW / s,
				LH / s,
				x,
				y,
				LW,
				LH
			);
			g.restore();
		} else {
			g.fillStyle = color;
			g.fillRect( x, y, LW, LH );
			// Thin deco rules top and bottom.
			g.strokeStyle = 'rgba(255,255,255,0.8)';
			g.lineWidth = 3;
			g.beginPath();
			g.moveTo( x + 30, y + 26 );
			g.lineTo( x + LW - 30, y + 26 );
			g.moveTo( x + 30, y + LH - 26 );
			g.lineTo( x + LW - 30, y + LH - 26 );
			g.stroke();
		}
		if ( lines.length ) {
			// Centered; on photos a soft shadow instead of an overlay band.
			g.save();
			if ( img ) {
				g.fillStyle = '#ffffff';
				g.shadowColor = 'rgba(0,0,0,0.6)';
				g.shadowBlur = 10;
			} else {
				g.fillStyle = textOn( color );
			}
			setFont( g, opts, 700, px );
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			fillLines( g, lines, x + LW / 2, y + LH / 2 + 2, lh );
			g.restore();
		}
		g.strokeStyle = '#b9542a';
		g.lineWidth = 1.6;
		g.strokeRect( x, y, LW, LH );
	}
	return c;
}
