/**
 * A stamp as a RECIPE. Core, because two things need it.
 *
 * It began in the Particle Strokes extension, where every particle leaves a
 * stamp. The brush needs exactly the same thing for a drawn brush tip, and
 * the free plugin can never reach into a Pro extension for a component - so
 * the engine lives here and the extension reads it off the bridge. One copy,
 * no drift.
 *
 * THE ONE IDEA: a stamp is no longer a bitmap you painted once. It is a list
 * of ELEMENTS with real parameters - this circle has a radius and a two-pixel
 * outline, that star has seven points - and the bitmap is only ever the
 * rendering of that list. Three things follow, and each of them was
 * impossible before:
 *
 * 1. IT STAYS EDITABLE. Place a ring, paint around it, come back and make the
 *    ring thinner. The old maker forgot what you had drawn the moment the
 *    pixels landed.
 * 2. IT IS RESOLUTION-FREE. Positions and sizes are fractions of the square,
 *    so the same stamp renders crisp at 128 for a thumbnail and at 512 for a
 *    grain of 200. A bitmap can only be sampled upwards, and that was half of
 *    Thomas' "matschig".
 * 3. THE PARTS CAN MOVE. Give an element a motion and the stamp is rendered
 *    into a strip of frames; every particle picks one by its own age. That is
 *    what makes a swarm of these look alive rather than rubber-stamped.
 *
 * Nothing here touches the DOM or WebGL: it draws into any 2D context, which
 * is what lets the same code serve the maker, the thumbnail, the atlas, a
 * brush tip mask and the tests. It has no imports at all, which is why the
 * move into the core was a file move and nothing else.
 */

const TAU = Math.PI * 2;
const clamp = ( v, a, b ) => ( v < a ? a : v > b ? b : v );

/** What you can put in a stamp. Ids are stored in documents - stable API. */
export const ELEMENT_TYPES = [
	{ id: 'disc', name: 'Disc' },
	{ id: 'ring', name: 'Ring' },
	{ id: 'star', name: 'Star' },
	{ id: 'poly', name: 'Polygon' },
	{ id: 'bar', name: 'Bar' },
	{ id: 'leaf', name: 'Leaf' },
	{ id: 'arc', name: 'Arc' },
	{ id: 'dots', name: 'Dots' },
	{ id: 'path', name: 'Paint' },
	{ id: 'icon', name: 'Icon' },
	{ id: 'glyph', name: 'Emoji' },
	{ id: 'image', name: 'Image' },
];
export const TYPE_IDX = {};
ELEMENT_TYPES.forEach( ( e, i ) => {
	TYPE_IDX[ e.id ] = i;
} );

/**
 * How an element moves over one loop of the stamp.
 *
 * A motion is not an animation of the picture - it is a promise that the
 * frames differ. Each particle picks ONE frame and keeps it, so a swarm
 * shows every phase at once and the stroke shimmers instead of pulsing in
 * lockstep. Lockstep looks like a broken monitor; this looks alive.
 */
export const MOTIONS = [
	{ id: 'none', name: 'Still' },
	{ id: 'orbit', name: 'Orbit' },
	{ id: 'pulse', name: 'Pulse' },
	{ id: 'spin', name: 'Spin' },
	{ id: 'swing', name: 'Swing' },
	{ id: 'drift', name: 'Drift' },
	{ id: 'flicker', name: 'Flicker' },
	{ id: 'bloomOut', name: 'Open up' },
];
export const MOTION_IDX = {};
MOTIONS.forEach( ( m, i ) => {
	MOTION_IDX[ m.id ] = i;
} );

/** Frames rendered when anything moves. Twelve reads as continuous. */
export const FRAMES = 12;

export const PALETTE = [
	'#ffffff',
	'#ffd166',
	'#ff5ecb',
	'#5ee7ff',
	'#7cff5e',
	'#ff6b3d',
	'#b57bff',
	'#ff3d5e',
	'#3dffd1',
	'#ffe9a8',
];

let nextId = 1;

/**
 * A new element of a type, with defaults that look like something at once.
 *
 * An element that needs three slider moves before it is visible feels
 * broken, so every type starts as a finished shape.
 *
 * @param {string} type One of ELEMENT_TYPES.
 * @param {Object} over Fields to override.
 * @return {Object} The element.
 */
export function makeElement( type, over ) {
	const base = {
		id: 'e' + nextId++,
		type,
		x: 0.5,
		y: 0.5,
		size: 0.3,
		rot: 0,
		colour: '#ffffff',
		alpha: 1,
		hard: 0.35,
		width: 0,
		n: 5,
		inner: 0.45,
		sweep: 0.75,
		ratio: 0.35,
		spread: 0.6,
		seed: 1,
		erase: false,
		pts: null,
		path: '',
		char: '',
		src: '',
		keepColour: true,
		motion: { kind: 'none', amt: 0.25, speed: 1, phase: 0 },
	};
	if ( 'ring' === type ) {
		base.width = 0.03;
	} else if ( 'arc' === type ) {
		base.width = 0.05;
	} else if ( 'bar' === type ) {
		base.ratio = 0.16;
	} else if ( 'leaf' === type ) {
		base.ratio = 0.4;
	} else if ( 'dots' === type ) {
		base.n = 7;
		base.size = 0.07;
	} else if ( 'path' === type ) {
		base.size = 0.08;
	} else if ( 'poly' === type ) {
		base.n = 6;
	}
	return { ...base, ...( over || {} ) };
}

/** An empty stamp. */
export function emptyDoc() {
	return { v: 1, elements: [] };
}

/**
 * Repair whatever a stored document hands us.
 *
 * Old layers carry no recipe at all, only the rendered PNG - those become a
 * single image element, so reopening one shows exactly what it always showed
 * and everything else on this page still works on it.
 *
 * @param {Object} doc Stored recipe, possibly nothing.
 * @param {string} png Stored PNG data URL, possibly empty.
 * @return {Object} A usable recipe.
 */
export function normaliseDoc( doc, png ) {
	if ( doc && Array.isArray( doc.elements ) ) {
		return {
			v: 1,
			elements: doc.elements.map( ( e ) =>
				makeElement( e.type || 'disc', {
					...e,
					motion: {
						kind: 'none',
						amt: 0.25,
						speed: 1,
						phase: 0,
						...( e.motion || {} ),
					},
				} )
			),
		};
	}
	const out = emptyDoc();
	if ( png ) {
		out.elements.push(
			makeElement( 'image', { src: png, size: 0.5, keepColour: true } )
		);
	}
	return out;
}

/** Whether any element moves - and therefore whether frames are needed. */
export function isAnimated( doc ) {
	return !! (
		doc &&
		doc.elements &&
		doc.elements.some(
			( e ) => e.motion && 'none' !== e.motion.kind && e.motion.amt > 0
		)
	);
}

/* ------------------------------- the motions ------------------------------ */

/**
 * The element as it stands at one phase of the loop.
 *
 * @param {Object} e Element.
 * @param {number} p Phase, 0..1.
 * @return {Object} A shallow copy with x, y, size, rot and alpha moved.
 */
export function elementAt( e, p ) {
	const m = e.motion || { kind: 'none' };
	if ( 'none' === m.kind || ! ( m.amt > 0 ) ) {
		return e;
	}
	const a = TAU * ( p * ( m.speed || 1 ) + ( m.phase || 0 ) );
	const amt = m.amt;
	const o = { ...e };
	if ( 'orbit' === m.kind ) {
		o.x += Math.cos( a ) * amt * 0.5;
		o.y += Math.sin( a ) * amt * 0.5;
	} else if ( 'pulse' === m.kind ) {
		o.size = Math.max( 0.002, e.size * ( 1 + Math.sin( a ) * amt ) );
	} else if ( 'spin' === m.kind ) {
		o.rot = e.rot + TAU * p * ( m.speed || 1 ) * Math.sign( amt || 1 );
	} else if ( 'swing' === m.kind ) {
		o.rot = e.rot + Math.sin( a ) * amt * Math.PI;
	} else if ( 'drift' === m.kind ) {
		// Along the element's own heading, so a bar drifts the way it points.
		o.x += Math.cos( e.rot ) * Math.sin( a ) * amt * 0.5;
		o.y += Math.sin( e.rot ) * Math.sin( a ) * amt * 0.5;
	} else if ( 'flicker' === m.kind ) {
		o.alpha =
			e.alpha * ( 1 - amt + amt * ( 0.5 + 0.5 * Math.sin( a * 3 ) ) );
	} else if ( 'bloomOut' === m.kind ) {
		// Grows outward from the middle and fades - the shape a spark makes.
		const u = ( p * ( m.speed || 1 ) + ( m.phase || 0 ) ) % 1;
		o.size = Math.max( 0.002, e.size * ( 1 + u * amt * 2 ) );
		o.alpha = e.alpha * ( 1 - u * amt );
	}
	return o;
}

/* ------------------------------- the drawing ------------------------------ */

function withAlpha( col, a ) {
	if ( a >= 0.999 ) {
		return col;
	}
	const h = 7 === col.length ? col : '#ffffff';
	const v = Math.round( clamp( a, 0, 1 ) * 255 )
		.toString( 16 )
		.padStart( 2, '0' );
	return h + v;
}

/** Soft blob. Hardness decides where the falloff starts. */
export function blob( ctx, x, y, r, col, hard ) {
	if ( r <= 0 ) {
		return;
	}
	if ( hard >= 0.995 ) {
		ctx.fillStyle = col;
		ctx.beginPath();
		ctx.arc( x, y, r, 0, TAU );
		ctx.fill();
		return;
	}
	const g = ctx.createRadialGradient(
		x,
		y,
		Math.max( 0, r * hard ),
		x,
		y,
		r
	);
	g.addColorStop( 0, col );
	g.addColorStop(
		1,
		9 === col.length ? col.slice( 0, 7 ) + '00' : col + '00'
	);
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.arc( x, y, r, 0, TAU );
	ctx.fill();
}

function starPath( ctx, r, spikes, inner ) {
	ctx.beginPath();
	const n = Math.max( 3, Math.round( spikes ) );
	for ( let i = 0; i < n * 2; i++ ) {
		const rr = i % 2 ? r * inner : r;
		const a = ( i / ( n * 2 ) ) * TAU - Math.PI / 2;
		const px = Math.cos( a ) * rr;
		const py = Math.sin( a ) * rr;
		if ( 0 === i ) {
			ctx.moveTo( px, py );
		} else {
			ctx.lineTo( px, py );
		}
	}
	ctx.closePath();
}

function polyPath( ctx, r, sides ) {
	ctx.beginPath();
	const n = Math.max( 3, Math.round( sides ) );
	for ( let i = 0; i < n; i++ ) {
		const a = ( i / n ) * TAU - Math.PI / 2;
		const px = Math.cos( a ) * r;
		const py = Math.sin( a ) * r;
		if ( 0 === i ) {
			ctx.moveTo( px, py );
		} else {
			ctx.lineTo( px, py );
		}
	}
	ctx.closePath();
}

/** A cheap deterministic roll, so a dot cluster keeps its layout. */
function seeded( seed ) {
	let a = seed >>> 0 || 1;
	return () => {
		a = ( a + 0x6d2b79f5 ) | 0;
		let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
		t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}

/**
 * Draw ONE element into a context whose origin is the square's top left.
 *
 * @param {Object}                   ctx    2D context.
 * @param {Object}                   e      Element, already moved by phase.
 * @param {number}                   S      Square size in pixels.
 * @param {Map<string, HTMLElement>} images Loaded images by src.
 */
export function drawElement( ctx, e, S, images ) {
	const cx = e.x * S;
	const cy = e.y * S;
	const r = Math.max( 0.5, e.size * S );
	const col = withAlpha( e.colour, e.alpha );
	const lw = Math.max( 0.6, ( e.width || 0 ) * S );
	ctx.save();
	if ( e.erase ) {
		ctx.globalCompositeOperation = 'destination-out';
	}
	if ( 'path' === e.type ) {
		// Painted by hand, kept as points so it survives a resize.
		const pts = e.pts || [];
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		if ( e.hard >= 0.995 ) {
			ctx.strokeStyle = col;
			ctx.lineWidth = r * 2;
			ctx.beginPath();
			for ( let i = 0; i < pts.length; i += 2 ) {
				const px = pts[ i ] * S,
					py = pts[ i + 1 ] * S;
				if ( 0 === i ) {
					ctx.moveTo( px, py );
				} else {
					ctx.lineTo( px, py );
				}
			}
			if ( pts.length <= 2 ) {
				ctx.lineTo( pts[ 0 ] * S + 0.01, pts[ 1 ] * S );
			}
			ctx.stroke();
		} else {
			// A soft brush has to be stamped, or the join shows as a seam.
			for ( let i = 0; i < pts.length - 2; i += 2 ) {
				const ax = pts[ i ] * S,
					ay = pts[ i + 1 ] * S,
					bx = pts[ i + 2 ] * S,
					by = pts[ i + 3 ] * S;
				const d = Math.hypot( bx - ax, by - ay );
				const steps = Math.max(
					1,
					Math.ceil( d / Math.max( 1, r * 0.3 ) )
				);
				for ( let k = 0; k <= steps; k++ ) {
					const u = k / steps;
					blob(
						ctx,
						ax + ( bx - ax ) * u,
						ay + ( by - ay ) * u,
						r,
						col,
						e.hard
					);
				}
			}
			if ( pts.length <= 2 ) {
				blob( ctx, pts[ 0 ] * S, pts[ 1 ] * S, r, col, e.hard );
			}
		}
		ctx.restore();
		return;
	}
	ctx.translate( cx, cy );
	ctx.rotate( e.rot || 0 );
	if ( 'disc' === e.type ) {
		if ( e.width > 0 ) {
			ctx.strokeStyle = col;
			ctx.lineWidth = lw;
			ctx.beginPath();
			ctx.arc( 0, 0, r, 0, TAU );
			ctx.stroke();
		} else {
			blob( ctx, 0, 0, r, col, e.hard );
		}
	} else if ( 'ring' === e.type ) {
		ctx.strokeStyle = col;
		ctx.lineWidth = lw;
		ctx.beginPath();
		ctx.arc( 0, 0, r, 0, TAU );
		ctx.stroke();
	} else if ( 'arc' === e.type ) {
		ctx.strokeStyle = col;
		ctx.lineWidth = lw;
		ctx.lineCap = 'round';
		ctx.beginPath();
		ctx.arc( 0, 0, r, 0, TAU * clamp( e.sweep, 0.02, 1 ) );
		ctx.stroke();
	} else if ( 'star' === e.type ) {
		starPath( ctx, r, e.n, clamp( e.inner, 0.05, 0.95 ) );
		if ( e.width > 0 ) {
			ctx.strokeStyle = col;
			ctx.lineWidth = lw;
			ctx.lineJoin = 'round';
			ctx.stroke();
		} else {
			ctx.fillStyle = col;
			ctx.fill();
		}
	} else if ( 'poly' === e.type ) {
		polyPath( ctx, r, e.n );
		if ( e.width > 0 ) {
			ctx.strokeStyle = col;
			ctx.lineWidth = lw;
			ctx.lineJoin = 'round';
			ctx.stroke();
		} else {
			ctx.fillStyle = col;
			ctx.fill();
		}
	} else if ( 'bar' === e.type ) {
		const th = Math.max( 0.6, r * clamp( e.ratio, 0.02, 2 ) );
		ctx.lineCap = e.hard > 0.6 ? 'butt' : 'round';
		ctx.strokeStyle = col;
		ctx.lineWidth = th;
		ctx.beginPath();
		ctx.moveTo( -r, 0 );
		ctx.lineTo( r, 0 );
		ctx.stroke();
	} else if ( 'leaf' === e.type ) {
		const wide = r * clamp( e.ratio, 0.02, 2 );
		ctx.fillStyle = col;
		ctx.beginPath();
		ctx.moveTo( -r, 0 );
		ctx.quadraticCurveTo( 0, -wide, r, 0 );
		ctx.quadraticCurveTo( 0, wide, -r, 0 );
		ctx.closePath();
		ctx.fill();
		if ( e.width > 0 ) {
			ctx.strokeStyle = col;
			ctx.lineWidth = lw;
			ctx.beginPath();
			ctx.moveTo( -r * 0.9, 0 );
			ctx.lineTo( r * 0.9, 0 );
			ctx.stroke();
		}
	} else if ( 'dots' === e.type ) {
		const rr = seeded( e.seed || 1 );
		const n = Math.max( 1, Math.round( e.n ) );
		const spread = e.spread * S * 0.5;
		for ( let i = 0; i < n; i++ ) {
			const a = rr() * TAU;
			const d = Math.sqrt( rr() ) * spread;
			blob(
				ctx,
				Math.cos( a ) * d,
				Math.sin( a ) * d,
				r * ( 0.5 + rr() ),
				col,
				e.hard
			);
		}
	} else if ( 'icon' === e.type && e.path ) {
		// The editor's icon library hands out 24-unit path data, which is
		// real vector: it stays sharp at any square size.
		if ( window.Path2D ) {
			const k = ( r * 2 ) / 24;
			ctx.scale( k, k );
			ctx.translate( -12, -12 );
			const p = new window.Path2D( e.path );
			if ( e.width > 0 ) {
				ctx.strokeStyle = col;
				ctx.lineWidth = ( e.width * S ) / k;
				ctx.lineJoin = 'round';
				ctx.lineCap = 'round';
				ctx.stroke( p );
			} else {
				ctx.fillStyle = col;
				ctx.fill( p );
			}
		}
	} else if ( 'glyph' === e.type && e.char ) {
		ctx.fillStyle = col;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = Math.round( r * 2 ) + 'px sans-serif';
		ctx.fillText( e.char, 0, 0 );
	} else if ( 'image' === e.type && e.src ) {
		const img = images && images.get( e.src );
		if ( img && img.width ) {
			const k = ( r * 2 ) / Math.max( img.width, img.height );
			const iw = img.width * k,
				ih = img.height * k;
			if ( ! e.keepColour ) {
				// Tint: the image becomes a SHAPE in the element's colour,
				// which is what makes a library icon usable as a grain.
				const tmp = ctx.canvas.ownerDocument
					? ctx.canvas.ownerDocument.createElement( 'canvas' )
					: null;
				if ( tmp ) {
					tmp.width = Math.max( 1, Math.round( iw ) );
					tmp.height = Math.max( 1, Math.round( ih ) );
					const g = tmp.getContext( '2d' );
					g.drawImage( img, 0, 0, tmp.width, tmp.height );
					g.globalCompositeOperation = 'source-in';
					g.fillStyle = col;
					g.fillRect( 0, 0, tmp.width, tmp.height );
					ctx.drawImage( tmp, -iw / 2, -ih / 2, iw, ih );
				}
			} else {
				ctx.globalAlpha = clamp( e.alpha, 0, 1 );
				ctx.drawImage( img, -iw / 2, -ih / 2, iw, ih );
			}
		}
	}
	ctx.restore();
}

/**
 * Draw the whole stamp at one phase.
 *
 * @param {Object}                   ctx    2D context, cleared by the caller.
 * @param {Object}                   doc    The recipe.
 * @param {number}                   S      Square size in pixels.
 * @param {number}                   phase  0..1.
 * @param {Map<string, HTMLElement>} images Loaded images by src.
 */
export function drawStamp( ctx, doc, S, phase, images ) {
	if ( ! doc || ! doc.elements ) {
		return;
	}
	for ( const e of doc.elements ) {
		drawElement( ctx, elementAt( e, phase || 0 ), S, images );
	}
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = 1;
}

/**
 * Cells one texture may hold.
 *
 * Four variants at twelve frames each would be a 48-cell, 3.5k-square
 * texture: fifty megabytes for a brush. Sixteen at 512 is a 2k square and
 * four megabytes, which is a texture and not a problem. When variants ask
 * for room, frames give it up - a second stamp is a bigger difference than
 * a smoother loop.
 */
export const MAX_CELLS = 16;

/**
 * Render one or more recipes into a grid of cells.
 *
 * ONE texture, because the GPU path uploads one: a single still stamp is a
 * 1x1 grid and behaves exactly as it did before atlases existed. The cell a
 * particle shows is `variant * frames + frame`, and that index is what the
 * engine writes into the vertex.
 *
 * @param {Object}   canvas A canvas to render into (resized here).
 * @param {Object[]} docs   One recipe, or several to pick between.
 * @param {number}   cell   Pixels per cell.
 * @param {Map}      images Loaded images by src.
 * @return {Object} { frames, variants, total, cols, rows, cell }.
 */
export function renderAtlas( canvas, docs, cell, images ) {
	const list = ( Array.isArray( docs ) ? docs : [ docs ] ).filter(
		( d ) => d && d.elements && d.elements.length
	);
	const variants = Math.max( 1, list.length );
	const animated = list.some( isAnimated );
	const frames = animated
		? Math.max( 1, Math.min( FRAMES, Math.floor( MAX_CELLS / variants ) ) )
		: 1;
	const total = variants * frames;
	const cols = total > 1 ? Math.ceil( Math.sqrt( total ) ) : 1;
	const rows = Math.ceil( total / cols );
	canvas.width = cols * cell;
	canvas.height = rows * cell;
	const ctx = canvas.getContext( '2d' );
	ctx.clearRect( 0, 0, canvas.width, canvas.height );
	for ( let v = 0; v < variants; v++ ) {
		const doc = list[ v ] || list[ 0 ] || emptyDoc();
		for ( let f = 0; f < frames; f++ ) {
			const idx = v * frames + f;
			const cxi = idx % cols,
				cyi = ( idx / cols ) | 0;
			ctx.save();
			ctx.beginPath();
			ctx.rect( cxi * cell, cyi * cell, cell, cell );
			ctx.clip();
			ctx.translate( cxi * cell, cyi * cell );
			drawStamp( ctx, doc, cell, f / frames, images );
			ctx.restore();
		}
	}
	return { frames, variants, total, cols, rows, cell };
}

/** Every image the recipes need, loaded once. */
export function collectSources( docs ) {
	const list = Array.isArray( docs ) ? docs : [ docs ];
	const out = [];
	for ( const doc of list ) {
		for ( const e of ( doc && doc.elements ) || [] ) {
			if ( 'image' === e.type && e.src && ! out.includes( e.src ) ) {
				out.push( e.src );
			}
		}
	}
	return out;
}

/**
 * Whether a recipe can go in the library.
 *
 * The store holds 32 KB for the whole extension, and one pasted photo as a
 * data URL is bigger than that on its own. Refusing with a reason beats
 * saving something silently altered, or failing at write time with a
 * message about quota that nobody can act on.
 *
 * @param {Object} doc The recipe.
 * @return {string} Empty when it may be saved, else why not.
 */
export function librarySnag( doc ) {
	for ( const e of ( doc && doc.elements ) || [] ) {
		if ( 'image' === e.type && /^data:/.test( e.src || '' ) ) {
			return 'uploaded-image';
		}
	}
	if ( JSON.stringify( doc ).length > 6000 ) {
		return 'too-big';
	}
	return '';
}

/* -------------------------------- surprise -------------------------------- */

const rnd = ( a, b ) => a + Math.random() * ( b - a );
const pick = ( arr ) => arr[ ( Math.random() * arr.length ) | 0 ];
const ri = ( a, b ) => Math.round( rnd( a, b ) );

/**
 * The rolls. Each one is an IDEA, and rolls only inside itself.
 *
 * Free dice on twelve element types reliably produce mud. This is the whole
 * difference between random and random on purpose - and because every roll
 * comes out as elements, whatever it gives you can now be taken apart and
 * changed, which the old pixel version could never offer.
 *
 * @type {Array<{name: string, build: Function}>}
 */
export const RECIPES = [
	{
		name: 'Stardust',
		build: ( a, b ) => [
			makeElement( 'dots', {
				colour: a,
				n: ri( 6, 16 ),
				size: rnd( 0.03, 0.08 ),
				spread: rnd( 0.5, 0.95 ),
				hard: rnd( 0, 0.5 ),
				seed: ri( 1, 9999 ),
				motion: mo( 'flicker', rnd( 0.4, 0.9 ) ),
			} ),
			makeElement( 'dots', {
				colour: b,
				n: ri( 3, 8 ),
				size: rnd( 0.02, 0.05 ),
				spread: rnd( 0.4, 0.8 ),
				hard: 0.2,
				seed: ri( 1, 9999 ),
			} ),
		],
	},
	{
		name: 'Notched ring',
		build: ( a, b ) => {
			const out = [
				makeElement( 'ring', {
					colour: a,
					size: rnd( 0.28, 0.42 ),
					width: rnd( 0.015, 0.06 ),
					motion: mo( 'pulse', rnd( 0.1, 0.3 ) ),
				} ),
			];
			for ( let i = 0; i < ri( 3, 7 ); i++ ) {
				const an = Math.random() * TAU;
				out.push(
					makeElement( 'disc', {
						erase: true,
						x: 0.5 + Math.cos( an ) * 0.35,
						y: 0.5 + Math.sin( an ) * 0.35,
						size: rnd( 0.04, 0.1 ),
						hard: 0.6,
						colour: b,
					} )
				);
			}
			return out;
		},
	},
	{
		name: 'Rays',
		build: ( a, b ) => {
			const n = ri( 5, 12 );
			const out = [];
			for ( let i = 0; i < n; i++ ) {
				out.push(
					makeElement( 'bar', {
						colour: a,
						x: 0.5,
						y: 0.5,
						rot: ( i / n ) * TAU,
						size: rnd( 0.25, 0.46 ),
						ratio: rnd( 0.04, 0.14 ),
						motion: mo( 'drift', rnd( 0.15, 0.5 ), i / n ),
					} )
				);
			}
			out.push(
				makeElement( 'disc', {
					colour: b,
					size: rnd( 0.05, 0.14 ),
					hard: 0.1,
				} )
			);
			return out;
		},
	},
	{
		name: 'Blossom',
		build: ( a, b ) => {
			const n = ri( 4, 9 );
			const out = [];
			for ( let i = 0; i < n; i++ ) {
				const an = ( i / n ) * TAU;
				out.push(
					makeElement( 'leaf', {
						colour: i % 2 ? a : b,
						x: 0.5 + Math.cos( an ) * 0.2,
						y: 0.5 + Math.sin( an ) * 0.2,
						rot: an,
						size: rnd( 0.16, 0.28 ),
						ratio: rnd( 0.3, 0.6 ),
						motion: mo( 'swing', rnd( 0.05, 0.2 ), i / n ),
					} )
				);
			}
			return out;
		},
	},
	{
		name: 'Halo star',
		build: ( a, b ) => [
			makeElement( 'disc', {
				colour: b,
				size: rnd( 0.3, 0.46 ),
				hard: 0,
				alpha: rnd( 0.4, 0.9 ),
			} ),
			makeElement( 'star', {
				colour: a,
				size: rnd( 0.2, 0.4 ),
				n: ri( 4, 9 ),
				inner: rnd( 0.3, 0.6 ),
				motion: mo( 'spin', 1 ),
			} ),
		],
	},
	{
		name: 'Comet',
		build: ( a, b ) => {
			const an = Math.random() * TAU;
			return [
				makeElement( 'bar', {
					colour: a,
					rot: an,
					x: 0.5 - Math.cos( an ) * 0.18,
					y: 0.5 - Math.sin( an ) * 0.18,
					size: rnd( 0.28, 0.45 ),
					ratio: rnd( 0.06, 0.16 ),
					alpha: 0.75,
					hard: 0.2,
				} ),
				makeElement( 'disc', {
					colour: b,
					x: 0.5 + Math.cos( an ) * 0.2,
					y: 0.5 + Math.sin( an ) * 0.2,
					size: rnd( 0.06, 0.13 ),
					hard: rnd( 0.1, 0.4 ),
					motion: mo( 'pulse', rnd( 0.2, 0.5 ) ),
				} ),
			];
		},
	},
	{
		name: 'Orbits',
		build: ( a, b ) => {
			const n = ri( 2, 5 );
			const out = [
				makeElement( 'disc', {
					colour: b,
					size: rnd( 0.06, 0.13 ),
					hard: 0.15,
				} ),
			];
			for ( let i = 0; i < n; i++ ) {
				out.push(
					makeElement( 'disc', {
						colour: a,
						size: rnd( 0.03, 0.07 ),
						hard: 0.4,
						motion: {
							kind: 'orbit',
							amt: rnd( 0.4, 0.95 ),
							speed: pick( [ 1, 1, 2 ] ),
							phase: i / n,
						},
					} )
				);
			}
			return out;
		},
	},
	{
		name: 'Cell',
		build: ( a, b ) => [
			makeElement( 'disc', {
				colour: b,
				size: rnd( 0.25, 0.42 ),
				hard: 0,
				alpha: rnd( 0.3, 0.7 ),
				motion: mo( 'pulse', rnd( 0.1, 0.35 ) ),
			} ),
			makeElement( 'ring', {
				colour: a,
				size: rnd( 0.24, 0.4 ),
				width: rnd( 0.006, 0.02 ),
			} ),
			makeElement( 'dots', {
				colour: a,
				n: ri( 3, 9 ),
				size: rnd( 0.015, 0.04 ),
				spread: rnd( 0.25, 0.5 ),
				hard: 0.5,
				seed: ri( 1, 9999 ),
				motion: mo( 'orbit', rnd( 0.1, 0.3 ) ),
			} ),
		],
	},
	{
		name: 'Shards',
		build: ( a, b ) => {
			const out = [];
			for ( let i = 0; i < ri( 3, 7 ); i++ ) {
				out.push(
					makeElement( 'poly', {
						colour: i % 2 ? a : b,
						n: 3,
						x: 0.5 + rnd( -0.22, 0.22 ),
						y: 0.5 + rnd( -0.22, 0.22 ),
						size: rnd( 0.08, 0.24 ),
						rot: Math.random() * TAU,
						motion: mo( 'spin', 1, Math.random() ),
					} )
				);
			}
			return out;
		},
	},
	{
		name: 'Arc pair',
		build: ( a, b ) => [
			makeElement( 'arc', {
				colour: a,
				size: rnd( 0.28, 0.44 ),
				width: rnd( 0.015, 0.05 ),
				sweep: rnd( 0.25, 0.6 ),
				rot: Math.random() * TAU,
				motion: mo( 'spin', 1 ),
			} ),
			makeElement( 'arc', {
				colour: b,
				size: rnd( 0.14, 0.26 ),
				width: rnd( 0.015, 0.05 ),
				sweep: rnd( 0.25, 0.6 ),
				rot: Math.random() * TAU,
				motion: { kind: 'spin', amt: -1, speed: 1.5, phase: 0 },
			} ),
		],
	},
	{
		name: 'Snowflake',
		build: ( a, b ) => {
			const n = 6;
			const out = [];
			const len = rnd( 0.3, 0.45 );
			for ( let i = 0; i < n; i++ ) {
				const an = ( i / n ) * TAU;
				out.push(
					makeElement( 'bar', {
						colour: a,
						rot: an,
						size: len,
						ratio: rnd( 0.03, 0.07 ),
					} )
				);
				out.push(
					makeElement( 'bar', {
						colour: b,
						x: 0.5 + Math.cos( an ) * len * 0.6,
						y: 0.5 + Math.sin( an ) * len * 0.6,
						rot: an + 1.1,
						size: len * 0.28,
						ratio: 0.08,
					} )
				);
			}
			return out;
		},
	},
	{
		name: 'Bubble',
		build: ( a, b ) => [
			makeElement( 'ring', {
				colour: a,
				size: rnd( 0.3, 0.44 ),
				width: rnd( 0.004, 0.012 ),
				motion: mo( 'pulse', rnd( 0.05, 0.2 ) ),
			} ),
			makeElement( 'disc', {
				colour: b,
				x: 0.38,
				y: 0.36,
				size: rnd( 0.04, 0.09 ),
				hard: 0.2,
				alpha: rnd( 0.5, 1 ),
			} ),
		],
	},
	{
		name: 'Spark',
		build: ( a, b ) => [
			makeElement( 'disc', {
				colour: a,
				size: rnd( 0.05, 0.1 ),
				hard: 0.05,
				motion: mo( 'bloomOut', rnd( 0.5, 1 ) ),
			} ),
			makeElement( 'star', {
				colour: b,
				size: rnd( 0.12, 0.24 ),
				n: 4,
				inner: rnd( 0.08, 0.2 ),
				alpha: rnd( 0.5, 0.9 ),
				motion: mo( 'bloomOut', rnd( 0.6, 1 ) ),
			} ),
		],
	},
	{
		name: 'Gear',
		build: ( a, b ) => [
			makeElement( 'star', {
				colour: a,
				size: rnd( 0.26, 0.42 ),
				n: ri( 7, 14 ),
				inner: rnd( 0.7, 0.88 ),
				motion: mo( 'spin', 1, Math.random() ),
			} ),
			makeElement( 'disc', {
				colour: b,
				size: rnd( 0.05, 0.12 ),
				hard: 0.8,
				erase: Math.random() < 0.5,
			} ),
		],
	},
	{
		name: 'Ripple',
		build: ( a, b ) => {
			const out = [];
			for ( let i = 0; i < ri( 3, 5 ); i++ ) {
				out.push(
					makeElement( 'ring', {
						colour: i % 2 ? a : b,
						size: 0.1 + i * rnd( 0.07, 0.11 ),
						width: rnd( 0.005, 0.018 ),
						alpha: 1 - i * 0.15,
						motion: {
							kind: 'bloomOut',
							amt: rnd( 0.4, 0.9 ),
							speed: 1,
							phase: i / 5,
						},
					} )
				);
			}
			return out;
		},
	},
	{
		name: 'Nib',
		build: ( a, b ) => [
			makeElement( 'leaf', {
				colour: a,
				size: rnd( 0.3, 0.46 ),
				ratio: rnd( 0.15, 0.35 ),
				rot: Math.random() * TAU,
				motion: mo( 'swing', rnd( 0.05, 0.18 ) ),
			} ),
			makeElement( 'bar', {
				colour: b,
				size: rnd( 0.2, 0.35 ),
				ratio: 0.05,
				rot: Math.random() * TAU,
			} ),
		],
	},
];

function mo( kind, amt, phase ) {
	return { kind, amt, speed: 1, phase: phase || 0 };
}

/**
 * Roll a whole stamp.
 *
 * @param {Object} doc Recipe to fill (its elements are replaced).
 * @return {string} The name of the idea that was rolled.
 */
export function surpriseDoc( doc ) {
	const r = pick( RECIPES );
	const a = pick( PALETTE );
	let b = pick( PALETTE );
	if ( b === a ) {
		b = pick( PALETTE );
	}
	doc.elements = r.build( a, b );
	return r.name;
}

/* -------------------------------- starters -------------------------------- */

const E = ( type, over ) => ( { type, ...over } );

/**
 * The stamps that are simply there.
 *
 * A library that starts empty teaches nobody what a library is for, and a
 * roll of the dice is not a starting point - it is a surprise. These are
 * hand-set, they cover the range the tool can do (hard, soft, outline,
 * organic, moving), and every one of them can be taken apart the moment it
 * is loaded. Ids are stored in the library, so they must not drift.
 */
export const STARTERS = [
	{
		id: 'st-dot',
		name: 'Soft dot',
		elements: [ E( 'disc', { size: 0.34, hard: 0 } ) ],
	},
	{
		id: 'st-hard',
		name: 'Hard dot',
		elements: [ E( 'disc', { size: 0.3, hard: 0.98 } ) ],
	},
	{
		id: 'st-hoop',
		name: 'Thin hoop',
		elements: [ E( 'ring', { size: 0.38, width: 0.008 } ) ],
	},
	{
		id: 'st-eye',
		name: 'Eye',
		elements: [
			E( 'ring', { size: 0.4, width: 0.012 } ),
			E( 'disc', { size: 0.12, hard: 0.5, colour: '#5ee7ff' } ),
		],
	},
	{
		id: 'st-leaf',
		name: 'Leaf',
		elements: [
			E( 'leaf', {
				size: 0.42,
				ratio: 0.42,
				colour: '#7cff5e',
				width: 0.006,
			} ),
		],
	},
	{
		id: 'st-shard',
		name: 'Shard',
		elements: [ E( 'poly', { size: 0.36, n: 3, colour: '#ffd166' } ) ],
	},
	{
		id: 'st-cross',
		name: 'Cross',
		elements: [
			E( 'bar', { size: 0.4, ratio: 0.09 } ),
			E( 'bar', { size: 0.4, ratio: 0.09, rot: Math.PI / 2 } ),
		],
	},
	{
		id: 'st-spark',
		name: 'Four-point',
		elements: [
			E( 'star', { size: 0.44, n: 4, inner: 0.12 } ),
			E( 'disc', { size: 0.08, hard: 0.1, colour: '#ffe9a8' } ),
		],
	},
	{
		id: 'st-grain',
		name: 'Grit',
		elements: [
			E( 'dots', {
				size: 0.035,
				n: 9,
				spread: 0.7,
				hard: 0.7,
				seed: 4711,
			} ),
		],
	},
	{
		id: 'st-breathe',
		name: 'Breathing dot',
		elements: [
			E( 'disc', {
				size: 0.24,
				hard: 0.1,
				motion: { kind: 'pulse', amt: 0.55, speed: 1, phase: 0 },
			} ),
		],
	},
	{
		id: 'st-moth',
		name: 'Moth',
		elements: [
			E( 'leaf', {
				x: 0.38,
				size: 0.26,
				ratio: 0.55,
				rot: -0.5,
				colour: '#ffe9a8',
				motion: { kind: 'swing', amt: 0.22, speed: 1, phase: 0 },
			} ),
			E( 'leaf', {
				x: 0.62,
				size: 0.26,
				ratio: 0.55,
				rot: 0.5,
				colour: '#ffe9a8',
				motion: { kind: 'swing', amt: 0.22, speed: 1, phase: 0.5 },
			} ),
		],
	},
	{
		id: 'st-halo',
		name: 'Opening halo',
		elements: [
			E( 'ring', {
				size: 0.16,
				width: 0.01,
				colour: '#b57bff',
				motion: { kind: 'bloomOut', amt: 0.9, speed: 1, phase: 0 },
			} ),
			E( 'disc', { size: 0.06, hard: 0.2 } ),
		],
	},
];

/**
 * A starter as a working recipe.
 *
 * Through makeElement, so a starter written as three fields comes out with
 * every field the rest of the code expects - and with fresh ids, because a
 * starter loaded twice must be two independent stamps.
 *
 * @param {Object} s A STARTERS entry or a stored library entry.
 * @return {Object} The recipe.
 */
export function fromStored( s ) {
	return normaliseDoc( { elements: ( s && s.elements ) || [] }, '' );
}
