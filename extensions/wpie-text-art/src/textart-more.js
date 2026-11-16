/**
 * Text Art 3.5: two more cards built from things - a wall of playing
 * cards and push pins on cork. (The other two new ones, string art and
 * Morse, are pens and live with the other drawings in lineart.js.)
 *
 * Every card draws its layout at working size and paints it `outScale`
 * times larger, so the same picture can be a quick preview or a sharp
 * layer at the document's own size.
 */
import {
	makeCanvas,
	makeSampler,
	lumOf,
	gridFor,
	cellRand,
	nearestOf,
	roundedRect,
} from './textart-engine.js';
import { rng } from './lineart.js';

const TAU = Math.PI * 2;
const clamp = ( v, lo, hi ) => ( v < lo ? lo : v > hi ? hi : v );
const scaleOf = ( opts ) => clamp( opts.outScale || 1, 0.1, 8 );

/** A canvas `scale` times the layout, already scaled for drawing. */
function sheet( like, w, h, scale ) {
	const c = makeCanvas(
		like,
		Math.max( 1, Math.round( w * scale ) ),
		Math.max( 1, Math.round( h * scale ) )
	);
	const g = c.getContext( '2d' );
	g.setTransform( scale, 0, 0, scale, 0, 0 );
	return { c, g };
}

/* ----------------------------- playing cards ------------------------------ */

const SUITS = [ 'spade', 'club', 'heart', 'diamond' ];
const RANKS = [
	'A',
	'2',
	'3',
	'4',
	'5',
	'6',
	'7',
	'8',
	'9',
	'10',
	'J',
	'Q',
	'K',
];

// Pip places on the face, the way real cards set them.
const L = 0.3;
const R = 0.7;
const C = 0.5;
const CARD_PIPS = {
	2: [
		[ C, 0.22 ],
		[ C, 0.78 ],
	],
	3: [
		[ C, 0.22 ],
		[ C, 0.5 ],
		[ C, 0.78 ],
	],
	4: [
		[ L, 0.22 ],
		[ R, 0.22 ],
		[ L, 0.78 ],
		[ R, 0.78 ],
	],
};
CARD_PIPS[ 5 ] = [ ...CARD_PIPS[ 4 ], [ C, 0.5 ] ];
CARD_PIPS[ 6 ] = [ ...CARD_PIPS[ 4 ], [ L, 0.5 ], [ R, 0.5 ] ];
CARD_PIPS[ 7 ] = [ ...CARD_PIPS[ 6 ], [ C, 0.36 ] ];
CARD_PIPS[ 8 ] = [ ...CARD_PIPS[ 7 ], [ C, 0.64 ] ];
CARD_PIPS[ 9 ] = [
	[ L, 0.2 ],
	[ R, 0.2 ],
	[ L, 0.4 ],
	[ R, 0.4 ],
	[ C, 0.5 ],
	[ L, 0.6 ],
	[ R, 0.6 ],
	[ L, 0.8 ],
	[ R, 0.8 ],
];
CARD_PIPS[ 10 ] = [
	[ L, 0.2 ],
	[ R, 0.2 ],
	[ C, 0.31 ],
	[ L, 0.4 ],
	[ R, 0.4 ],
	[ L, 0.6 ],
	[ R, 0.6 ],
	[ C, 0.69 ],
	[ L, 0.8 ],
	[ R, 0.8 ],
];

/** A suit symbol of height `s` around (0, 0), as the current path. */
function suitPath( g, suit, s ) {
	const h = s / 2;
	g.beginPath();
	if ( 'diamond' === suit ) {
		g.moveTo( 0, -h );
		g.quadraticCurveTo( h * 0.25, -h * 0.3, h * 0.75, 0 );
		g.quadraticCurveTo( h * 0.25, h * 0.3, 0, h );
		g.quadraticCurveTo( -h * 0.25, h * 0.3, -h * 0.75, 0 );
		g.quadraticCurveTo( -h * 0.25, -h * 0.3, 0, -h );
	} else if ( 'heart' === suit ) {
		g.moveTo( 0, h );
		g.bezierCurveTo(
			-h * 1.2,
			-h * 0.05,
			-h * 0.75,
			-h * 1.05,
			0,
			-h * 0.45
		);
		g.bezierCurveTo( h * 0.75, -h * 1.05, h * 1.2, -h * 0.05, 0, h );
	} else if ( 'spade' === suit ) {
		g.moveTo( 0, -h );
		g.bezierCurveTo( h * 1.2, -h * 0.05, h * 0.75, h * 0.85, 0, h * 0.3 );
		g.bezierCurveTo( -h * 0.75, h * 0.85, -h * 1.2, -h * 0.05, 0, -h );
		g.moveTo( -h * 0.32, h );
		g.lineTo( 0, h * 0.2 );
		g.lineTo( h * 0.32, h );
		g.closePath();
	} else {
		for ( const [ x, y ] of [
			[ 0, -h * 0.45 ],
			[ -h * 0.47, h * 0.1 ],
			[ h * 0.47, h * 0.1 ],
		] ) {
			g.moveTo( x + h * 0.36, y );
			g.arc( x, y, h * 0.36, 0, TAU );
		}
		g.moveTo( -h * 0.3, h );
		g.lineTo( 0, h * 0.05 );
		g.lineTo( h * 0.3, h );
		g.closePath();
	}
}

/** One card face (or its back) on a padded sprite with its shadow. */
function cardSprite( like, w, h, scale, face ) {
	const pad = Math.ceil( w * 0.18 );
	const { c, g } = sheet( like, w + pad * 2, h + pad * 2, scale );
	g.translate( pad, pad );
	g.shadowColor = 'rgba(0,0,0,0.45)';
	g.shadowBlur = w * 0.12 * scale;
	g.shadowOffsetY = w * 0.05 * scale;
	roundedRect( g, 0, 0, w, h, w * 0.09 );
	g.fillStyle = face.back ? face.back : '#fbfaf6';
	g.fill();
	g.shadowColor = 'transparent';
	g.strokeStyle = 'rgba(0,0,0,0.18)';
	g.lineWidth = Math.max( 0.4, w * 0.02 );
	g.stroke();
	if ( face.back ) {
		// The back: a white border and a lattice, the same on every card.
		g.strokeStyle = 'rgba(255,255,255,0.85)';
		g.lineWidth = w * 0.035;
		roundedRect(
			g,
			w * 0.09,
			w * 0.09,
			w - w * 0.18,
			h - w * 0.18,
			w * 0.05
		);
		g.stroke();
		g.save();
		roundedRect(
			g,
			w * 0.13,
			w * 0.13,
			w - w * 0.26,
			h - w * 0.26,
			w * 0.03
		);
		g.clip();
		g.strokeStyle = 'rgba(255,255,255,0.35)';
		g.lineWidth = w * 0.02;
		for ( let d = -h; d < w + h; d += w * 0.12 ) {
			g.beginPath();
			g.moveTo( d, 0 );
			g.lineTo( d - h, h );
			g.moveTo( d - h, 0 );
			g.lineTo( d, h );
			g.stroke();
		}
		g.restore();
		return { c, pad };
	}
	const red = 'heart' === face.suit || 'diamond' === face.suit;
	g.fillStyle = red ? '#c8202e' : '#16181d';
	// Index in the corner: rank over a small suit.
	g.font = `700 ${ w * 0.2 }px sans-serif`;
	g.textAlign = 'center';
	g.textBaseline = 'top';
	g.fillText( RANKS[ face.rank - 1 ], w * 0.14, w * 0.06 );
	g.save();
	g.translate( w * 0.14, w * 0.37 );
	suitPath( g, face.suit, w * 0.13 );
	g.fill();
	g.restore();
	if ( 1 === face.rank ) {
		g.save();
		g.translate( w / 2, h / 2 );
		suitPath( g, face.suit, w * 0.42 );
		g.fill();
		g.restore();
		return { c, pad };
	}
	if ( face.rank > 10 ) {
		// A court card: the framed, banded robe of a figure and its
		// letter. At mosaic size it reads as what it is, a busy picture
		// card - the darkest faces in the pack.
		const fx = w * 0.24;
		const fy = h * 0.12;
		const fw = w * 0.58;
		const fh = h * 0.76;
		const bands = [ '#f2c23a', red ? '#c8202e' : '#16181d', '#1f3f8f' ];
		const n = 6 + face.rank - 11;
		for ( let i = 0; i < n; i++ ) {
			g.fillStyle = bands[ i % bands.length ];
			g.fillRect( fx, fy + ( i * fh ) / n, fw, fh / n + 0.3 );
		}
		g.strokeStyle = red ? '#c8202e' : '#16181d';
		g.lineWidth = w * 0.03;
		g.strokeRect( fx, fy, fw, fh );
		g.fillStyle = '#fbfaf6';
		g.font = `800 ${ w * 0.34 }px serif`;
		g.textBaseline = 'middle';
		g.fillText( RANKS[ face.rank - 1 ], fx + fw / 2, fy + fh / 2 );
		return { c, pad };
	}
	const inner = { x: w * 0.22, y: h * 0.06, w: w * 0.62, h: h * 0.88 };
	for ( const [ px, py ] of CARD_PIPS[ face.rank ] ) {
		g.save();
		g.translate( inner.x + px * inner.w, inner.y + py * inner.h );
		// The lower half of a card is printed upside down.
		if ( py > 0.5 ) {
			g.rotate( Math.PI );
		}
		suitPath( g, face.suit, w * 0.17 );
		g.fill();
		g.restore();
	}
	return { c, pad };
}

/**
 * Card wall: playing cards on a table, the darker the spot the more pips;
 * the deepest shadows lie face down. Warm parts of the picture are dealt
 * hearts and diamonds, the rest spades and clubs.
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { cell (card width), background, outScale }.
 * @return {HTMLCanvasElement}
 */
export function renderCardWall( like, source, opts = {} ) {
	const scale = scaleOf( opts );
	const cw = clamp( opts.cell || 22, 14, 48 );
	const ch = Math.round( cw * 1.4 );
	const cols = Math.max( 8, Math.round( 1120 / cw ) );
	const rows = Math.max(
		6,
		Math.round( ( cols * cw * source.height ) / source.width / ch )
	);
	const smp = makeSampler( like, source, cols, rows );
	const W = cols * cw;
	const H = rows * ch;
	const { c, g } = sheet( like, W, H, scale );
	g.fillStyle = 'light' === opts.background ? '#e6e0d2' : '#14402c';
	g.fillRect( 0, 0, W, H );
	const w = cw * 0.9;
	const h = ch * 0.9;
	// Every card of the pack, and how dark it actually reads: measured on
	// the sprite, not guessed, so the picture is dealt from real tones.
	const tone = ( sprite ) => {
		const probe = makeCanvas( like, 6, 8 );
		const pg = probe.getContext( '2d' );
		pg.drawImage(
			sprite.c,
			sprite.pad * scale,
			sprite.pad * scale,
			w * scale,
			h * scale,
			0,
			0,
			6,
			8
		);
		const d = pg.getImageData( 0, 0, 6, 8 ).data;
		let sum = 0;
		for ( let i = 0; i < d.length; i += 4 ) {
			sum += lumOf( [ d[ i ], d[ i + 1 ], d[ i + 2 ] ] );
		}
		return sum / ( d.length / 4 ) / 255;
	};
	const deck = { red: [], black: [] };
	for ( const back of [ '#203466', '#6e1f2c' ] ) {
		const sprite = cardSprite( like, w, h, scale, { back } );
		const entry = { lum: tone( sprite ), sprites: [ sprite ] };
		deck.red.push( entry );
		deck.black.push( entry );
	}
	for ( const [ group, pair ] of [
		[ 'black', SUITS.slice( 0, 2 ) ],
		[ 'red', SUITS.slice( 2 ) ],
	] ) {
		for ( let rank = 1; rank <= 13; rank++ ) {
			const sprites = pair.map( ( suit ) =>
				cardSprite( like, w, h, scale, { suit, rank } )
			);
			deck[ group ].push( {
				lum: ( tone( sprites[ 0 ] ) + tone( sprites[ 1 ] ) ) / 2,
				sprites,
			} );
		}
	}
	const all = deck.red.concat( deck.black ).map( ( e ) => e.lum );
	const lo = Math.min( ...all );
	const hi = Math.max( ...all );
	for ( let y = 0; y < rows; y++ ) {
		for ( let x = 0; x < cols; x++ ) {
			const p = smp.pix( x, y );
			const target = lo + ( lumOf( p ) / 255 ) * ( hi - lo );
			const warm = p[ 0 ] > p[ 2 ] + 24 && p[ 0 ] > p[ 1 ] + 6;
			let best = null;
			for ( const e of deck[ warm ? 'red' : 'black' ] ) {
				if (
					! best ||
					Math.abs( e.lum - target ) < Math.abs( best.lum - target )
				) {
					best = e;
				}
			}
			const sprite =
				best.sprites[
					Math.floor( cellRand( x, y, 7 ) * best.sprites.length )
				];
			const pad = sprite.pad;
			g.save();
			g.translate( x * cw + cw / 2, y * ch + ch / 2 );
			g.rotate( ( cellRand( x, y, 11 ) - 0.5 ) * 0.09 );
			g.drawImage(
				sprite.c,
				-w / 2 - pad,
				-h / 2 - pad,
				w + pad * 2,
				h + pad * 2
			);
			g.restore();
		}
	}
	return c;
}

/* -------------------------------- push pins -------------------------------- */

// Office push pins, the colors a box of them comes in.
export const PIN_COLORS = [
	[ 204, 32, 42 ],
	[ 236, 112, 34 ],
	[ 246, 202, 44 ],
	[ 64, 160, 72 ],
	[ 32, 92, 192 ],
	[ 86, 172, 222 ],
	[ 142, 72, 172 ],
	[ 236, 122, 172 ],
	[ 246, 246, 240 ],
	[ 32, 32, 36 ],
	[ 128, 128, 136 ],
	[ 126, 76, 42 ],
];

/** One pin head seen from above, with its shadow, on a padded sprite. */
function pinSprite( like, cell, scale, rgb ) {
	const pad = Math.ceil( cell * 0.25 );
	const size = cell + pad * 2;
	const { c, g } = sheet( like, size, size, scale );
	const r = cell * 0.4;
	const cx = size / 2;
	const cy = size / 2;
	g.shadowColor = 'rgba(0,0,0,0.45)';
	g.shadowBlur = cell * 0.18 * scale;
	g.shadowOffsetX = cell * 0.08 * scale;
	g.shadowOffsetY = cell * 0.12 * scale;
	g.fillStyle = `rgb(${ rgb[ 0 ] },${ rgb[ 1 ] },${ rgb[ 2 ] })`;
	g.beginPath();
	g.arc( cx, cy, r, 0, TAU );
	g.fill();
	g.shadowColor = 'transparent';
	// A domed head: light from the top left, a darker rim.
	const shade = g.createRadialGradient(
		cx - r * 0.35,
		cy - r * 0.4,
		r * 0.05,
		cx,
		cy,
		r
	);
	shade.addColorStop( 0, 'rgba(255,255,255,0.75)' );
	shade.addColorStop( 0.35, 'rgba(255,255,255,0.12)' );
	shade.addColorStop( 0.8, 'rgba(0,0,0,0.08)' );
	shade.addColorStop( 1, 'rgba(0,0,0,0.38)' );
	g.fillStyle = shade;
	g.beginPath();
	g.arc( cx, cy, r, 0, TAU );
	g.fill();
	return { c, pad };
}

/**
 * Push pin art: the picture pinned to a cork board, one colored pin per
 * spot, in the colors a box of pins actually has.
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { cell, background, seed, outScale }.
 * @return {HTMLCanvasElement}
 */
export function renderPushPins( like, source, opts = {} ) {
	const scale = scaleOf( opts );
	const cell = clamp( opts.cell || 16, 8, 40 );
	const { cols, rows } = gridFor( source, cell );
	const smp = makeSampler( like, source, cols, rows );
	const W = cols * cell;
	const H = rows * cell;
	const { c, g } = sheet( like, W, H, scale );
	const light = 'light' === opts.background;
	g.fillStyle = light ? '#c79a66' : '#8a6038';
	g.fillRect( 0, 0, W, H );
	// Cork: granules of slightly lighter and darker bark.
	const rand = rng( opts.seed || 5 );
	const grains = Math.round( ( W * H ) / 18 );
	for ( let i = 0; i < grains; i++ ) {
		const t = rand();
		g.fillStyle =
			t < 0.5
				? `rgba(60,34,14,${ 0.12 + rand() * 0.2 })`
				: `rgba(255,226,180,${ 0.08 + rand() * 0.16 })`;
		const s = 0.4 + rand() * 1.4;
		g.fillRect( rand() * W, rand() * H, s, s * ( 0.6 + rand() * 0.8 ) );
	}
	const sprites = PIN_COLORS.map( ( rgb ) =>
		pinSprite( like, cell, scale, rgb )
	);
	for ( let y = 0; y < rows; y++ ) {
		for ( let x = 0; x < cols; x++ ) {
			const p = smp.pix( x, y );
			const col = nearestOf( p, PIN_COLORS );
			const sprite = sprites[ PIN_COLORS.indexOf( col ) ];
			const jx = ( cellRand( x, y, 5 ) - 0.5 ) * cell * 0.14;
			const jy = ( cellRand( x, y, 9 ) - 0.5 ) * cell * 0.14;
			g.drawImage(
				sprite.c,
				x * cell + jx - sprite.pad,
				y * cell + jy - sprite.pad,
				cell + sprite.pad * 2,
				cell + sprite.pad * 2
			);
		}
	}
	return c;
}
