import { seededRandom, regionMap } from './drawing-engine.js';
import { drawMotif, MOTIFS } from './motifs.js';
import { PRACTICE_MODES, practiceOptions } from './practice-catalog.js';

const INK = '#303943';
const GUIDE = '#d2d7dc';
const make = ( like, w, h ) => {
	const c =
		typeof document !== 'undefined'
			? document.createElement( 'canvas' )
			: new like.constructor( w, h );
	c.width = w;
	c.height = h;
	return c;
};
const line = ( g, x, y, x2, y2 ) => {
	g.beginPath();
	g.moveTo( x, y );
	g.lineTo( x2, y2 );
	g.stroke();
};
function text( g, value, x, y, size = 18, width = 970, color = INK ) {
	g.save();
	g.font = `500 ${ size }px sans-serif`;
	g.fillStyle = color;
	g.textAlign = 'left';
	g.textBaseline = 'alphabetic';
	g.fillText( value, x, y, width );
	g.restore();
}
function frame( g, x, y, w, h ) {
	g.save();
	g.strokeStyle = GUIDE;
	g.lineWidth = 1;
	g.strokeRect( x, y, w, h );
	g.restore();
}
function contain( g, image, x, y, w, h ) {
	const s = Math.min( w / image.width, h / image.height );
	g.drawImage(
		image,
		x + ( w - image.width * s ) / 2,
		y + ( h - image.height * s ) / 2,
		image.width * s,
		image.height * s
	);
}
function hint( o, index, count ) {
	if ( index === 0 ) return 1;
	if ( index === count - 1 || o.difficulty === 'independent' ) return 0;
	if ( o.difficulty === 'balanced' && index > count / 2 ) return 0;
	return ( o.hintOpacity / 100 ) * ( 1 - index / count );
}

function shape( g, v, x, y, size ) {
	g.beginPath();
	if ( v === 0 ) g.arc( x, y, size * 0.4, 0, Math.PI * 2 );
	else if ( v === 1 )
		g.ellipse( x, y, size * 0.45, size * 0.25, -0.3, 0, Math.PI * 2 );
	else if ( v === 2 ) {
		g.moveTo( x - size * 0.4, y + size * 0.4 );
		g.bezierCurveTo(
			x - size * 0.5,
			y - size * 0.4,
			x + size * 0.2,
			y - size * 0.45,
			x + size * 0.4,
			y - size * 0.4
		);
		g.bezierCurveTo(
			x + size * 0.45,
			y + size * 0.3,
			x - size * 0.1,
			y + size * 0.45,
			x - size * 0.4,
			y + size * 0.4
		);
	} else {
		g.ellipse(
			x,
			y + size * 0.13,
			size * 0.28,
			size * 0.3,
			0,
			0,
			Math.PI * 2
		);
		g.moveTo( x + size * 0.22, y - size * 0.2 );
		g.arc( x, y - size * 0.2, size * 0.22, 0, Math.PI * 2 );
	}
	g.stroke();
}
function wave( g, v, x, y, w, h ) {
	g.beginPath();
	if ( v === 3 ) {
		for ( let j = 0; j < 4; j++ )
			for ( let i = 0; i <= 120; i++ ) {
				const a = ( i / 120 ) * Math.PI * 5,
					radius = ( i / 120 ) * h * 0.38;
				const px = x + ( w * ( j + 0.5 ) ) / 4 + Math.cos( a ) * radius,
					py = y + Math.sin( a ) * radius;
				if ( i === 0 ) g.moveTo( px, py );
				else g.lineTo( px, py );
			}
	} else if ( v === 5 ) {
		for ( let j = 0; j < 5; j++ ) {
			g.moveTo( x, y + ( ( j - 2 ) * h ) / 7 );
			g.lineTo( x + w, y + ( ( j - 2 ) * h ) / 7 );
		}
	} else
		for ( let i = 0; i <= 240; i++ ) {
			const a = ( i / 240 ) * Math.PI * 8;
			const px =
				x +
				( w * i ) / 240 +
				( v === 1 ? ( Math.sin( a ) * w ) / 24 : 0 );
			const py =
				y +
				h *
					0.35 *
					( v === 1
						? Math.cos( a )
						: v === 2
						? 1 - 2 * Math.abs( Math.sin( a / 2 ) )
						: v === 4
						? Math.asin( Math.sin( a ) ) / ( Math.PI / 2 )
						: Math.sin( a ) );
			if ( i === 0 ) g.moveTo( px, py );
			else g.lineTo( px, py );
		}
	g.stroke();
}

function surface( g, kind, x, y, w, h, rnd, density = 1 ) {
	g.save();
	g.beginPath();
	g.rect( x, y, w, h );
	g.clip();
	g.translate( x, y );
	g.lineWidth = 1.4;
	g.strokeStyle = INK;
	if (
		[
			'Parallel hatching',
			'Crosshatching',
			'Contour hatching',
			'Scribble shading',
		].includes( kind )
	) {
		const gap = 16 / density;
		for ( let i = -h; i < w + h; i += gap ) {
			if ( kind === 'Contour hatching' ) {
				g.beginPath();
				g.moveTo( i, 0 );
				g.bezierCurveTo(
					i + 80,
					h / 3,
					i - 50,
					( h * 2 ) / 3,
					i + 20,
					h
				);
				g.stroke();
			} else if ( kind === 'Scribble shading' ) {
				for ( let j = 12; j < h; j += 26 ) {
					g.beginPath();
					g.ellipse(
						i + rnd() * 10,
						j,
						14,
						9,
						rnd() * Math.PI,
						0,
						Math.PI * 2
					);
					g.stroke();
				}
			} else {
				line( g, i, 0, i - h, h );
				if ( kind === 'Crosshatching' ) line( g, i, 0, i + h, h );
			}
		}
	} else if ( kind === 'Wood grain' || kind === 'Water' ) {
		for ( let j = 8; j < h; j += 13 ) {
			g.beginPath();
			for ( let i = 0; i <= w; i += 3 ) {
				const yy =
					j +
					Math.sin( i / 36 + j / 17 ) * ( kind === 'Water' ? 5 : 9 ) +
					( kind === 'Wood grain'
						? Math.exp( -( ( i - w / 2 ) ** 2 ) / 1200 ) *
						  Math.sin( j / 25 ) *
						  20
						: 0 );
				if ( i === 0 ) g.moveTo( i, yy );
				else g.lineTo( i, yy );
			}
			g.stroke();
		}
	} else if ( kind === 'Bark' || kind === 'Fur' ) {
		for ( let j = -10; j < h; j += 18 )
			for ( let i = -10; i < w; i += 13 ) {
				const xx = i + rnd() * 8,
					yy = j + rnd() * 9;
				g.beginPath();
				g.moveTo( xx, yy );
				g.quadraticCurveTo(
					xx + ( kind === 'Fur' ? 13 : 2 ),
					yy + 8,
					xx + 6,
					yy + ( kind === 'Fur' ? 16 : 27 )
				);
				g.stroke();
			}
	} else if ( kind === 'Feathers' ) {
		for ( let j = -20; j < h; j += 80 )
			for ( let i = -20; i < w; i += 60 ) {
				line( g, i, j, i + 20, j + 70 );
				for ( let k = 10; k < 60; k += 9 ) {
					line( g, i + k / 3, j + k, i - 12 + k / 3, j + k - 16 );
					line( g, i + k / 3, j + k, i + 17 + k / 3, j + k - 14 );
				}
			}
	} else if ( kind === 'Stone' ) {
		for ( let j = -15; j < h; j += 42 )
			for ( let i = -30; i < w; i += 68 ) {
				g.beginPath();
				g.ellipse(
					i + ( Math.round( j / 42 ) % 2 ) * 28,
					j,
					24 + rnd() * 7,
					15 + rnd() * 5,
					rnd() * 0.5,
					0,
					Math.PI * 2
				);
				g.stroke();
			}
	} else if ( kind === 'Woven fabric' ) {
		for ( let j = 0; j < h; j += 24 )
			for ( let i = 0; i < w; i += 24 )
				for ( let k = 4; k <= 20; k += 5 ) {
					if ( ( i / 24 + j / 24 ) % 2 )
						line( g, i + k, j + 2, i + k, j + 22 );
					else line( g, i + 2, j + k, i + 22, j + k );
				}
	}
	g.restore();
}

function ornament( g, variant, x, y, w, h ) {
	if ( variant >= 2 ) {
		wave( g, 0, x, y, w, h * 0.6 );
		if ( variant === 3 ) {
			g.save();
			g.translate( 0, y * 2 );
			g.scale( 1, -1 );
			wave( g, 0, x, y, w, h * 0.6 );
			g.restore();
		}
		return;
	}
	line( g, x, y, x + w, y );
	for ( let i = 0; i < 5; i++ ) {
		const cx = x + ( ( i + 0.5 ) * w ) / 5;
		if ( variant === 0 ) {
			for ( const s of [ -1, 1 ] ) {
				g.beginPath();
				g.moveTo( cx, y );
				g.quadraticCurveTo(
					cx - 30,
					y + ( s * h ) / 3,
					cx + 10,
					y + ( s * h ) / 3
				);
				g.quadraticCurveTo( cx + 34, y + s * 12, cx, y );
				g.stroke();
			}
		} else {
			for ( let k = 0; k < 6; k++ ) {
				const a = ( k * Math.PI ) / 3;
				g.beginPath();
				g.ellipse(
					cx + Math.cos( a ) * 16,
					y + Math.sin( a ) * 16,
					15,
					7,
					a,
					0,
					Math.PI * 2
				);
				g.stroke();
			}
			g.beginPath();
			g.arc( cx, y, 6, 0, Math.PI * 2 );
			g.stroke();
		}
	}
}

function rosette( g, o ) {
	const cx = 540,
		cy = 740,
		radius = 440,
		n = o.segments;
	g.save();
	g.strokeStyle = GUIDE;
	g.lineWidth = 1;
	for ( let ring = 1; ring <= o.rings; ring++ ) {
		g.beginPath();
		g.arc( cx, cy, ( radius * ring ) / o.rings, 0, Math.PI * 2 );
		g.stroke();
	}
	for ( let i = 0; i < n; i++ ) {
		const a = ( i / n ) * Math.PI * 2;
		line(
			g,
			cx,
			cy,
			cx + Math.cos( a ) * radius,
			cy + Math.sin( a ) * radius
		);
	}
	for ( let i = 0; i < n; i++ ) {
		g.save();
		g.translate( cx, cy );
		g.rotate( ( i / n ) * Math.PI * 2 );
		const partial = o.practiceVariant === 3;
		g.globalAlpha = partial ? hint( o, i, n ) : 1;
		g.strokeStyle = INK;
		g.lineWidth = o.strokeWeight;
		for ( let ring = 0; ring < o.rings; ring++ ) {
			const r1 = ( ( ring + 0.12 ) * radius ) / o.rings,
				r2 = ( ( ring + 0.93 ) * radius ) / o.rings,
				a = ( Math.PI * 2 ) / n,
				mid = ( r1 + r2 ) / 2;
			g.beginPath();
			g.moveTo( r1 * Math.cos( a / 2 ), r1 * Math.sin( a / 2 ) );
			if ( o.practiceVariant === 2 ) {
				g.quadraticCurveTo(
					r2 * 1.15,
					0,
					r2 * Math.cos( a / 2 ),
					r2 * Math.sin( a / 2 )
				);
				g.quadraticCurveTo(
					r2 * Math.cos( a ) * 1.15,
					r2 * Math.sin( a ) * 1.15,
					r1 * Math.cos( a / 2 ),
					r1 * Math.sin( a / 2 )
				);
			} else {
				g.quadraticCurveTo(
					mid,
					0,
					r2 * Math.cos( a / 2 ),
					r2 * Math.sin( a / 2 )
				);
				g.quadraticCurveTo(
					mid * Math.cos( a ),
					mid * Math.sin( a ),
					r1 * Math.cos( a / 2 ),
					r1 * Math.sin( a / 2 )
				);
			}
			g.stroke();
			if ( o.practiceVariant === 1 )
				line(
					g,
					r1 * Math.cos( a / 2 ),
					r1 * Math.sin( a / 2 ),
					r2 * Math.cos( a / 2 ),
					r2 * Math.sin( a / 2 )
				);
		}
		g.restore();
	}
	g.restore();
}

function tonalSample( g, o, x, y, w, h, rnd, amount ) {
	const sphere = o.practiceVariant === 2;
	g.save();
	g.beginPath();
	if ( sphere ) g.arc( x + w / 2, y + h / 2, h * 0.43, 0, Math.PI * 2 );
	else g.rect( x, y, w, h );
	g.clip();
	if ( o.mode === 'stippling' ) {
		g.fillStyle = INK;
		for ( let i = 0; i < ( w * h ) / 7; i++ ) {
			const dx = rnd(),
				dy = rnd();
			const strength =
				o.practiceVariant === 0
					? amount
					: sphere
					? Math.min( 1, Math.hypot( dx - 0.36, dy - 0.25 ) * 1.2 )
					: dx;
			if ( rnd() > strength * 0.8 ) continue;
			g.beginPath();
			g.arc( x + dx * w, y + dy * h, 0.8 + rnd() * 0.5, 0, Math.PI * 2 );
			g.fill();
		}
	} else {
		if ( o.practiceVariant === 0 )
			g.fillStyle = `rgb(${ Math.round(
				255 * ( 1 - amount )
			) },${ Math.round( 255 * ( 1 - amount ) ) },${ Math.round(
				255 * ( 1 - amount )
			) })`;
		else {
			const grad = sphere
				? g.createRadialGradient(
						x + w * 0.4,
						y + h * 0.3,
						2,
						x + w / 2,
						y + h / 2,
						h * 0.55
				  )
				: g.createLinearGradient( x, y, x + w, y );
			grad.addColorStop( 0, '#ffffff' );
			grad.addColorStop( 1, '#303943' );
			g.fillStyle = grad;
		}
		g.fillRect( x, y, w, h );
	}
	g.restore();
	if ( sphere ) {
		g.save();
		g.strokeStyle = GUIDE;
		g.beginPath();
		g.arc( x + w / 2, y + h / 2, h * 0.43, 0, Math.PI * 2 );
		g.stroke();
		g.restore();
	}
}

function sourceStudy( g, c, source, o, t ) {
	if ( ! source ) throw Error( 'A source image is required.' );
	const x1 = 55,
		x2 = 560,
		top = 195,
		w = 465,
		h = 1060;
	text( g, t( 'Reference' ), x1, 166 );
	text( g, t( 'Your drawing' ), x2, 166 );
	frame( g, x1, top, w, h );
	frame( g, x2, top, w, h );
	if ( o.mode === 'detailstudy' ) {
		const cropSize = Math.min( source.width, source.height ) * 0.44,
			sx = ( source.width - cropSize ) / 2;
		const sy =
			( source.height - cropSize ) *
			[ 0.5, 0.15, 0.85 ][ o.practiceVariant ];
		const crop = make( c, 480, 480 );
		crop.getContext( '2d' ).drawImage(
			source,
			sx,
			sy,
			cropSize,
			cropSize,
			0,
			0,
			480,
			480
		);
		contain( g, source, x1 + 20, top + 20, w - 40, 440 );
		const s = Math.min( ( w - 40 ) / source.width, 440 / source.height );
		g.save();
		g.strokeStyle = '#677783';
		g.lineWidth = 2;
		g.strokeRect(
			x1 + 20 + ( w - 40 - source.width * s ) / 2 + sx * s,
			top + 20 + ( 440 - source.height * s ) / 2 + sy * s,
			cropSize * s,
			cropSize * s
		);
		g.restore();
		text( g, t( 'Enlarged detail' ), x1 + 20, top + 515 );
		contain( g, crop, x1 + 20, top + 545, w - 40, 440 );
		if ( o.difficulty !== 'independent' ) {
			g.save();
			g.strokeStyle = GUIDE;
			line( g, x2 + w / 2, top + 30, x2 + w / 2, top + h - 30 );
			line( g, x2 + 30, top + h / 2, x2 + w - 30, top + h / 2 );
			g.restore();
		}
		return;
	}
	const map = regionMap( source, { detail: 2 } );
	const { W, H, lab } = map,
		counts = new Map();
	for ( let x = 0; x < W; x++ )
		for ( const idx of [ x, ( H - 1 ) * W + x ] )
			counts.set( lab[ idx ], ( counts.get( lab[ idx ] ) || 0 ) + 1 );
	for ( let y = 0; y < H; y++ )
		for ( const idx of [ y * W, y * W + W - 1 ] )
			counts.set( lab[ idx ], ( counts.get( lab[ idx ] ) || 0 ) + 1 );
	const background = [ ...counts.entries() ].sort(
		( a, b ) => b[ 1 ] - a[ 1 ]
	)[ 0 ][ 0 ];
	const s = Math.min( ( w - 40 ) / W, ( h - 60 ) / H ),
		ox = x1 + ( w - W * s ) / 2,
		oy = top + ( h - H * s ) / 2;
	if ( o.mode === 'negative' ) {
		const mask = make( c, W, H ),
			mg = mask.getContext( '2d' ),
			pixels = mg.createImageData( W, H );
		for ( let i = 0; i < lab.length; i++ ) {
			const dark =
				( lab[ i ] === background ) === ( o.practiceVariant === 0 );
			const v = dark ? 60 : 255;
			pixels.data.set( [ v, v, v, 255 ], i * 4 );
		}
		mg.putImageData( pixels, 0, 0 );
		g.drawImage( mask, ox, oy, W * s, H * s );
	} else {
		g.drawImage( source, ox, oy, W * s, H * s );
		// One strong region corner per cell keeps landmarks spread over the image.
		const candidates = [],
			cols = o.difficulty === 'guided' ? 5 : 4;
		for ( let by = 0; by < cols; by++ )
			for ( let bx = 0; bx < cols; bx++ ) {
				let best = null,
					score = 0;
				for (
					let y = Math.max( 3, Math.floor( ( by * H ) / cols ) );
					y < Math.min( H - 3, ( ( by + 1 ) * H ) / cols );
					y += 2
				)
					for (
						let x = Math.max( 3, Math.floor( ( bx * W ) / cols ) );
						x < Math.min( W - 3, ( ( bx + 1 ) * W ) / cols );
						x += 2
					) {
						const id = y * W + x,
							center = lab[ id ];
						let edges = 0;
						for ( const delta of [ -3, 3, -W * 3, W * 3 ] )
							if ( lab[ id + delta ] !== center ) edges++;
						if ( edges > score ) {
							score = edges;
							best = { x, y };
						}
					}
				if ( best && score >= 2 ) candidates.push( best );
			}
		if ( o.practiceVariant === 0 && o.difficulty === 'guided' ) {
			g.save();
			g.globalAlpha = o.hintOpacity / 200;
			g.drawImage( source, ox + x2 - x1, oy, W * s, H * s );
			g.restore();
		}
		candidates.forEach( ( p, i ) => {
			for ( const shift of [ 0, x2 - x1 ] ) {
				const xx = ox + p.x * s + shift,
					yy = oy + p.y * s;
				g.save();
				g.fillStyle = '#ffffff';
				g.beginPath();
				g.arc( xx, yy, 11, 0, Math.PI * 2 );
				g.fill();
				g.strokeStyle = INK;
				g.lineWidth = 1.5;
				line( g, xx - 4, yy, xx + 4, yy );
				line( g, xx, yy - 4, xx, yy + 4 );
				text( g, String( i + 1 ), xx + 9, yy - 8, 13, 40 );
				g.restore();
			}
		} );
	}
}

export function renderPractice( like, params, source = null, t = ( s ) => s ) {
	const o = practiceOptions( params ),
		mode = PRACTICE_MODES.find( ( m ) => m.id === o.mode );
	if ( ! mode ) throw Error( 'Unknown practice template.' );
	const c = make( like, 1080, 1400 ),
		g = c.getContext( '2d' ),
		rnd = seededRandom( Number( o.seed ) || 1 );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	g.strokeStyle = INK;
	g.lineWidth = o.strokeWeight;
	g.lineCap = g.lineJoin = 'round';
	text( g, t( mode.label ), 55, 62, 31 );
	const instruction = mode.source
		? 'Observe the reference and draw in the empty field.'
		: o.mode === 'construction'
		? 'Build the motif from large shapes to small details.'
		: o.mode === 'rosette'
		? 'Follow the rings and repeat the shapes around the center.'
		: 'Follow the sample, trace the guides, then continue on your own.';
	text( g, t( instruction ), 55, 98, 17 );
	if ( mode.source ) sourceStudy( g, c, source, o, t );
	else if ( o.mode === 'rosette' ) rosette( g, o );
	else if ( o.mode === 'construction' ) {
		const count = o.practiceVariant === 0 ? 4 : 6,
			cols = 2,
			rows = count / cols,
			cellW = 465,
			cellH = ( 1160 - ( rows - 1 ) * 25 ) / rows;
		const captions = [
			'Base shapes',
			'Main features',
			'Secondary shapes',
			'Fine details',
			'Color reference',
			'Your drawing',
		];
		for ( let i = 0; i < count; i++ ) {
			const x = 55 + ( i % 2 ) * 505,
				y = 160 + Math.floor( i / 2 ) * ( cellH + 25 ),
				size = Math.min( cellW - 20, cellH - 55 );
			frame( g, x, y, cellW, cellH );
			text(
				g,
				`${ i + 1 }. ${ t( captions[ i ] ) }`,
				x + 16,
				y + 28,
				17,
				cellW - 32
			);
			if ( i < 5 )
				drawMotif( g, o.motif, {
					x: x + ( cellW - size ) / 2,
					y: y + 42 + ( cellH - 48 - size ) / 2,
					size,
					phase: Math.min( 4, i + 1 ),
					outline: i !== 4,
					weight: o.strokeWeight * 1.5,
				} );
		}
	} else {
		const h = 1130 / o.rows;
		for ( let row = 0; row < o.rows; row++ ) {
			const y = 155 + row * h,
				areaH = h - 28,
				v = o.practiceVariant;
			if (
				[ 'hatching', 'textures', 'stippling', 'values' ].includes(
					o.mode
				)
			) {
				frame( g, 55, y, 465, areaH );
				frame( g, 560, y, 465, areaH );
				const pad = 18;
				if ( o.mode === 'hatching' || o.mode === 'textures' )
					surface(
						g,
						mode.variants[ v ],
						55 + pad,
						y + pad,
						465 - pad * 2,
						areaH - pad * 2,
						rnd,
						0.7 + ( row / o.rows ) * 1.7
					);
				else
					tonalSample(
						g,
						o,
						55 + pad,
						y + pad,
						465 - pad * 2,
						areaH - pad * 2,
						rnd,
						( row + 1 ) / o.rows
					);
				if ( o.difficulty === 'guided' && row === 0 ) {
					g.save();
					g.globalAlpha = o.hintOpacity / 100;
					if ( [ 'hatching', 'textures' ].includes( o.mode ) )
						surface(
							g,
							mode.variants[ v ],
							560 + pad,
							y + pad,
							100,
							areaH - pad * 2,
							rnd
						);
					g.restore();
				}
			} else if ( o.mode === 'lettering' ) {
				const base = y + areaH * 0.72,
					fontSize = Math.min( 94, areaH * 0.65 );
				g.save();
				g.strokeStyle = GUIDE;
				g.lineWidth = 1;
				for ( const offset of [
					0,
					-fontSize * 0.5,
					-fontSize * 0.74,
					fontSize * 0.2,
				] ) {
					g.setLineDash( offset === 0 ? [] : [ 5, 5 ] );
					line( g, 55, base + offset, 1025, base + offset );
				}
				g.setLineDash( [] );
				g.font = `700 ${ fontSize }px ${
					o.font ? JSON.stringify( o.font ) + ',' : ''
				}sans-serif`;
				g.lineWidth = 1.1;
				const opacity =
					row === 0 ? 1 : v === 2 ? 0 : hint( o, row, o.rows );
				g.globalAlpha = opacity;
				g.strokeStyle = INK;
				g.fillStyle = INK;
				if ( v === 0 ) g.strokeText( o.practiceText, 68, base, 940 );
				else g.fillText( o.practiceText, 68, base, 940 );
				g.restore();
			} else {
				frame( g, 55, y, 970, areaH );
				const count = o.mode === 'forms' ? 6 : 3,
					cellW = 970 / count;
				for ( let col = 0; col < count; col++ ) {
					g.save();
					g.globalAlpha = hint( o, col, count );
					g.strokeStyle = INK;
					g.lineWidth = o.strokeWeight;
					const x = 55 + col * cellW;
					if ( o.mode === 'forms' )
						shape(
							g,
							( v + ( o.practiceVariant === 3 ? row : 0 ) ) % 4,
							x + cellW / 2,
							y + areaH / 2,
							Math.min( cellW - 25, areaH - 25 )
						);
					else if ( o.mode === 'ornaments' )
						ornament(
							g,
							v,
							x + 18,
							y + areaH / 2,
							cellW - 36,
							Math.min( 130, areaH - 24 )
						);
					else
						wave(
							g,
							v,
							x + 18,
							y + areaH / 2,
							cellW - 36,
							Math.min( 125, areaH - 24 )
						);
					g.restore();
				}
			}
		}
		text( g, t( 'Sample' ), 55, 1340, 15, 300, '#697681' );
		text( g, t( 'Your drawing' ), 560, 1340, 15, 400, '#697681' );
	}
	if ( o.mode === 'construction' )
		text(
			g,
			t( MOTIFS.find( ( m ) => m.id === o.motif )?.label || 'Fox' ),
			55,
			1360,
			16
		);
	return c;
}
