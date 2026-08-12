/**
 * The shapes you reach for, as path data.
 *
 * ONE DEFINITION PER SHAPE, and that is the point of this file. The nine
 * shapes that came before live twice: once as maths in `drawShape` and
 * once as SVG commands in `shapeToPathD`, and the comment at the top of
 * the latter exists to beg the next person to keep them in step. Anything
 * added here is written once: `shapeToPathD` reads it, and `drawShape`
 * already traces path data before it looks at its own switch.
 *
 * What belongs in here is what a shape is actually FOR - something to put
 * a text in, to clip an image into, or to build on. Not drawings. A shape
 * nobody would use as a container has no business in this list however
 * pretty it is.
 *
 * Coordinates are layer-local, 0..w and 0..h, so a shape always fills the
 * box it was dragged out to.
 */

import { __ } from '@wordpress/i18n';

import { normalizePathD, scalePathD, offsetPathD } from './path';

const n = ( v ) => {
	const r = Math.round( v * 1000 ) / 1000;
	return Object.is( r, -0 ) ? '0' : String( r );
};

/**
 * Fit a path that was drawn somewhere else into this shape's own box.
 *
 * A shape taken from a drawing program arrives in whatever coordinates it
 * was made in - the blob below sits around the origin from -60 to 60, the
 * heart at y = 1031 because Inkscape put it there. Rather than retyping
 * the numbers by hand and getting one of them wrong, the path is measured
 * once and then moved and scaled to fill 0..w by 0..h.
 *
 * The bounds are taken from the CONTROL POINTS, which enclose the curve
 * they describe. The shape therefore sits a hair inside its box rather
 * than a hair outside it, and inside is the safe direction.
 *
 * The measuring happens once. So does the fitting FOR A GIVEN BOX: the
 * shape is asked for its path on every frame it is drawn, and the answer
 * for 200 x 120 was rebuilt from the string every single time - two passes
 * over the path data, offset then scale, for a result that cannot have
 * changed. One box remembered is enough: a shape is redrawn at the same
 * size over and over, and only changes size while a handle is being
 * dragged, which is exactly when the next size is wanted anyway.
 *
 * @param {string} raw Path data in any coordinate space.
 * @return {Function} ( w, h ) => path data filling that box.
 */
function fitted( raw ) {
	let box = null;
	let lastW = 0;
	let lastH = 0;
	let lastD = '';
	return ( w, h ) => {
		if ( ! box ) {
			const d = normalizePathD( raw );
			const nums = d.match( /-?\d*\.?\d+(?:e[+-]?\d+)?/g ) || [];
			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;
			for ( let i = 0; i + 1 < nums.length; i += 2 ) {
				const x = parseFloat( nums[ i ] );
				const y = parseFloat( nums[ i + 1 ] );
				minX = Math.min( minX, x );
				maxX = Math.max( maxX, x );
				minY = Math.min( minY, y );
				maxY = Math.max( maxY, y );
			}
			box = {
				d,
				x: minX,
				y: minY,
				w: Math.max( 1e-6, maxX - minX ),
				h: Math.max( 1e-6, maxY - minY ),
			};
		}
		const bw = Math.max( 1, w );
		const bh = Math.max( 1, h );
		if ( bw === lastW && bh === lastH ) {
			return lastD;
		}
		lastW = bw;
		lastH = bh;
		lastD = scalePathD(
			offsetPathD( box.d, -box.x, -box.y ),
			bw / box.w,
			bh / box.h
		);
		return lastD;
	};
}

/** `M x y` and friends without the string noise at every call site. */
const pt = ( x, y ) => n( x ) + ' ' + n( y );

export const EXTRA_SHAPES = [
	{
		id: 'triangle',
		name: () => __( 'Triangle', 'wunderpaint' ),
		d: ( w, h ) =>
			`M ${ pt( w / 2, 0 ) } L ${ pt( w, h ) } L ${ pt( 0, h ) } Z`,
	},
	{
		id: 'diamond',
		name: () => __( 'Diamond', 'wunderpaint' ),
		d: ( w, h ) =>
			`M ${ pt( w / 2, 0 ) } L ${ pt( w, h / 2 ) } ` +
			`L ${ pt( w / 2, h ) } L ${ pt( 0, h / 2 ) } Z`,
	},
	{
		// The button shape: a capsule, so the round ends belong on the
		// SHORT sides and the radius is half the short side.
		//
		// It used to cap left and right whatever the box looked like, with
		// `r = min(w, h) / 2`. Drag it taller than wide and the two caps
		// became arcs whose chord was longer than their own diameter -
		// which SVG does not refuse, it scales the radii up until a
		// solution exists. At 40 x 200 the shape then ran from x = -80 to
		// x = +120: five times its own width, out of the box on both
		// sides, with the handles still sitting on the box.
		id: 'pill',
		name: () => __( 'Pill', 'wunderpaint' ),
		d: ( w, h ) => {
			if ( w >= h ) {
				const r = h / 2;
				return (
					`M ${ pt( r, 0 ) } L ${ pt( w - r, 0 ) } ` +
					`A ${ n( r ) } ${ n( r ) } 0 0 1 ${ pt( w - r, h ) } ` +
					`L ${ pt( r, h ) } ` +
					`A ${ n( r ) } ${ n( r ) } 0 0 1 ${ pt( r, 0 ) } Z`
				);
			}
			const r = w / 2;
			return (
				`M ${ pt( w, r ) } L ${ pt( w, h - r ) } ` +
				`A ${ n( r ) } ${ n( r ) } 0 0 1 ${ pt( 0, h - r ) } ` +
				`L ${ pt( 0, r ) } ` +
				`A ${ n( r ) } ${ n( r ) } 0 0 1 ${ pt( w, r ) } Z`
			);
		},
	},
	{
		// Flat bottom, half-round top: the window shape every second
		// portfolio uses to hold a photo.
		id: 'arch',
		name: () => __( 'Arch', 'wunderpaint' ),
		d: ( w, h ) => {
			const r = Math.min( w / 2, h );
			return (
				`M 0 ${ n( h ) } L 0 ${ n( r ) } ` +
				`A ${ n( w / 2 ) } ${ n( r ) } 0 0 1 ${ pt( w, r ) } ` +
				`L ${ pt( w, h ) } Z`
			);
		},
	},
	{
		id: 'shield',
		name: () => __( 'Shield', 'wunderpaint' ),
		d: ( w, h ) =>
			`M 0 0 L ${ pt( w, 0 ) } L ${ pt( w, h * 0.55 ) } ` +
			`C ${ pt( w, h * 0.82 ) } ${ pt( w * 0.72, h * 0.95 ) } ` +
			`${ pt( w / 2, h ) } ` +
			`C ${ pt( w * 0.28, h * 0.95 ) } ${ pt( 0, h * 0.82 ) } ` +
			`${ pt( 0, h * 0.55 ) } Z`,
	},
	{
		// Price tag: a notched left edge and the eyelet punched out of it.
		id: 'tag',
		name: () => __( 'Tag', 'wunderpaint' ),
		d: ( w, h ) => {
			const cut = Math.min( w * 0.22, h / 2 );
			const hole = Math.min( w, h ) * 0.09;
			const hx = cut * 0.75;
			const hy = h / 2;
			return (
				`M ${ pt( cut, 0 ) } L ${ pt( w, 0 ) } L ${ pt( w, h ) } ` +
				`L ${ pt( cut, h ) } L ${ pt( 0, h / 2 ) } Z ` +
				// Second subpath, wound the other way, so the even-odd of a
				// fill turns it into a real hole.
				`M ${ pt( hx + hole, hy ) } ` +
				`A ${ n( hole ) } ${ n( hole ) } 0 1 0 ${ pt(
					hx - hole,
					hy
				) } ` +
				`A ${ n( hole ) } ${ n( hole ) } 0 1 0 ${ pt(
					hx + hole,
					hy
				) } Z`
			);
		},
	},
	{
		// Banner with the swallow-tail ends, for headings.
		id: 'ribbon',
		name: () => __( 'Ribbon', 'wunderpaint' ),
		d: ( w, h ) => {
			// Shallow. A deep notch on a wide banner stops reading as a
			// swallow tail and starts reading as an hourglass.
			const cut = Math.min( w * 0.09, h * 0.35 );
			return (
				`M 0 0 L ${ pt( w, 0 ) } L ${ pt( w - cut, h / 2 ) } ` +
				`L ${ pt( w, h ) } L ${ pt( 0, h ) } ` +
				`L ${ pt( cut, h / 2 ) } Z`
			);
		},
	},
	{
		id: 'cross',
		name: () => __( 'Cross', 'wunderpaint' ),
		d: ( w, h ) => {
			const ax = w * 0.32;
			const ay = h * 0.32;
			return (
				`M ${ pt( ax, 0 ) } L ${ pt( w - ax, 0 ) } ` +
				`L ${ pt( w - ax, ay ) } L ${ pt( w, ay ) } ` +
				`L ${ pt( w, h - ay ) } L ${ pt( w - ax, h - ay ) } ` +
				`L ${ pt( w - ax, h ) } L ${ pt( ax, h ) } ` +
				`L ${ pt( ax, h - ay ) } L ${ pt( 0, h - ay ) } ` +
				`L ${ pt( 0, ay ) } L ${ pt( ax, ay ) } Z`
			);
		},
	},
	{
		// The heart moves in here from the two hand-written copies it used
		// to have (maths in drawShape, SVG in shapeToPathD). One reading
		// now, and a rounder shape than the old one.
		id: 'heart',
		name: () => __( 'Heart', 'wunderpaint' ),
		d: fitted(
			'm7 1031.4c-1.5355 0-3.0784 0.5-4.25 1.7-2.3431 2.4-2.2788 ' +
				'6.1 0 8.5l9.25 9.8 9.25-9.8c2.279-2.4 2.343-6.1 0-8.5' +
				'-2.343-2.3-6.157-2.3-8.5 0l-0.75 0.8-0.75-0.8c-1.172-1.2' +
				'-2.7145-1.7-4.25-1.7z'
		),
	},
	{
		id: 'bolt',
		name: () => __( 'Bolt', 'wunderpaint' ),
		d: ( w, h ) =>
			`M ${ pt( w * 0.58, 0 ) } L ${ pt( w * 0.16, h * 0.56 ) } ` +
			`L ${ pt( w * 0.45, h * 0.56 ) } L ${ pt( w * 0.36, h ) } ` +
			`L ${ pt( w * 0.86, h * 0.4 ) } L ${ pt( w * 0.55, h * 0.4 ) } Z`,
	},
	{
		// ONE closed outline, not a head plus a neck. Two subpaths fill
		// fine, but a shape can carry a stroke, and a stroke draws every
		// internal edge - the seam where the stem crossed the head was
		// visible as a little square. Up the stem's right side, out along
		// the flag and back, down its left side, then round the head.
		id: 'note',
		name: () => __( 'Music note', 'wunderpaint' ),
		d: ( w, h ) => {
			const rx = w * 0.19;
			const ry = h * 0.14;
			const cx = w * 0.29;
			const cy = h * 0.84;
			const stem = w * 0.09;
			const top = h * 0.04;
			return (
				`M ${ pt( cx + rx, cy ) } L ${ pt( cx + rx, top ) } ` +
				`C ${ pt( w * 0.72, h * 0.1 ) } ${ pt(
					w * 0.94,
					h * 0.18
				) } ` +
				`${ pt( w * 0.92, h * 0.44 ) } ` +
				`C ${ pt( w * 0.88, h * 0.25 ) } ${ pt(
					w * 0.76,
					h * 0.21
				) } ` +
				`${ pt( cx + rx - stem, h * 0.34 ) } ` +
				`L ${ pt( cx + rx - stem, cy - ry * 0.88 ) } ` +
				`A ${ n( rx ) } ${ n( ry ) } 0 1 0 ${ pt( cx + rx, cy ) } Z`
			);
		},
	},
	{
		// Thomas' own blob. Organic in a way hand-placed control points
		// never quite are, so it is taken as given and only fitted to the
		// box.
		id: 'blob',
		name: () => __( 'Blob', 'wunderpaint' ),
		d: fitted(
			'M28.4,-41C37.7,-32.4,46.8,-25.2,46.7,-17.1C46.7,-9,37.5,0.1,' +
				'36,13.9C34.6,27.7,40.7,46.1,36,60.8C31.3,75.5,15.6,86.4,5,' +
				'79.4C-5.5,72.5,-11.1,47.7,-20.6,34.6C-30.1,21.4,-43.6,20,' +
				'-50.7,13C-57.8,5.9,-58.6,-6.7,-54.3,-17C-50.1,-27.4,-40.9,' +
				'-35.4,-31,-43.9C-21.1,-52.3,-10.5,-61.1,-0.5,-60.4C9.6,' +
				'-59.8,19.1,-49.6,28.4,-41Z'
		),
	},
];

export const EXTRA_SHAPE_MAP = EXTRA_SHAPES.reduce( ( map, s ) => {
	map[ s.id ] = s;
	return map;
}, {} );

/** Whether this shape keyword is one of the path-defined ones. */
export const isExtraShape = ( id ) => !! EXTRA_SHAPE_MAP[ id ];

/**
 * Path data for one of them, in layer-local coordinates.
 *
 * @param {string} id Shape keyword.
 * @param {number} w  Layer width.
 * @param {number} h  Layer height.
 * @return {?string} Path data, or null if the keyword is not one of ours.
 */
export function extraShapePath( id, w, h ) {
	const s = EXTRA_SHAPE_MAP[ id ];
	return s ? s.d( Math.max( 1, w || 0 ), Math.max( 1, h || 0 ) ) : null;
}
