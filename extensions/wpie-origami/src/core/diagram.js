/**
 * Classic instruction diagrams, drawn from the same steps the 3D
 * preview folds - panel k shows the model after k steps plus the
 * notation for what happens next: valley folds dashed, mountain folds
 * dash-dotted, a curved arrow from the flap to where it lands, a
 * looped arrow for turning the model over.
 *
 * Split in two: diagramGeometry() is pure and testable, drawDiagram()
 * puts it on a canvas.
 */
import { foldState, mapPoint, faceNormal, stackHeights } from './fold.js';

/* ------------------------------- geometry -------------------------------- */

const project = ( p ) => [ p[ 0 ], p[ 2 ] ];

/**
 * Everything a panel needs, in flat 2D model coordinates.
 *
 * @param {Object} figure The figure.
 * @param {number} k      Completed steps shown (0..steps.length).
 * @return {Object} { polys, creases, arrows, turnOver, bounds }.
 */
export function diagramGeometry( figure, k ) {
	const { transforms } = foldState( figure, k );
	const heights =
		stackHeights( figure )[ Math.min( k, figure.steps.length ) ];

	// An edge is drawn only where the paper actually ends or turns: at
	// the sheet border, and where the neighbouring face lies elsewhere
	// in the air or on another layer. Edges inside a flat, connected
	// region stay invisible - otherwise the first panel would show the
	// whole crease web as a spider's net.
	const mid = new Map();
	const midKey = ( a, b ) =>
		`${ ( ( a[ 0 ] + b[ 0 ] ) / 2 ).toFixed( 6 ) },${ (
			( a[ 1 ] + b[ 1 ] ) /
			2
		).toFixed( 6 ) }`;
	figure.faces.forEach( ( pts, f ) => {
		for ( let i = 0; i < pts.length; i++ ) {
			const key = midKey( pts[ i ], pts[ ( i + 1 ) % pts.length ] );
			if ( ! mid.has( key ) ) {
				mid.set( key, [] );
			}
			mid.get( key ).push( f );
		}
	} );
	const edgeVisible = ( f, a, b ) => {
		const owners = mid.get( midKey( a, b ) ) || [];
		const other = owners.find( ( o ) => o !== f );
		if ( undefined === other ) {
			return true;
		}
		if ( Math.abs( heights[ f ] - heights[ other ] ) > 0.5 ) {
			return true;
		}
		const m = [ ( a[ 0 ] + b[ 0 ] ) / 2, ( a[ 1 ] + b[ 1 ] ) / 2 ];
		const p = mapPoint( transforms, f, m );
		const q = mapPoint( transforms, other, m );
		return (
			Math.hypot( p[ 0 ] - q[ 0 ], p[ 1 ] - q[ 1 ], p[ 2 ] - q[ 2 ] ) >
			1e-6
		);
	};

	const polys = figure.faces
		.map( ( pts, f ) => ( {
			pts: pts.map( ( pt ) => project( mapPoint( transforms, f, pt ) ) ),
			edges: pts.map( ( pt, i ) =>
				edgeVisible( f, pt, pts[ ( i + 1 ) % pts.length ] )
			),
			h: heights[ f ],
			front: faceNormal( transforms[ f ] )[ 1 ] >= 0,
		} ) )
		.sort( ( a, b ) => a.h - b.h );

	const creases = [];
	const arrows = [];
	let turnOver = false;
	const next = figure.steps[ k ];
	for ( const rot of next ? next.rotations : [] ) {
		if ( rot.faces.length === figure.faces.length ) {
			turnOver = true;
			continue;
		}
		const a3 = mapPoint( transforms, rot.anchor, rot.line[ 0 ] );
		const b3 = mapPoint( transforms, rot.anchor, rot.line[ 1 ] );
		const a = project( a3 );
		const b = project( b3 );
		creases.push( {
			a,
			b,
			kind: ( rot.dir || 1 ) > 0 ? 'valley' : 'mountain',
		} );

		// Arrow: the flap's farthest corner swings to its mirror image.
		const dx = b[ 0 ] - a[ 0 ];
		const dy = b[ 1 ] - a[ 1 ];
		const len2 = dx * dx + dy * dy || 1;
		let tip = null;
		let dist = 0;
		for ( const f of rot.faces ) {
			for ( const pt of figure.faces[ f ] ) {
				const p = project( mapPoint( transforms, f, pt ) );
				const d = Math.abs(
					dx * ( p[ 1 ] - a[ 1 ] ) - dy * ( p[ 0 ] - a[ 0 ] )
				);
				if ( d > dist ) {
					dist = d;
					tip = p;
				}
			}
		}
		if ( tip && dist > 1e-6 ) {
			const t =
				( ( tip[ 0 ] - a[ 0 ] ) * dx + ( tip[ 1 ] - a[ 1 ] ) * dy ) /
				len2;
			const foot = [ a[ 0 ] + t * dx, a[ 1 ] + t * dy ];
			const to = [ 2 * foot[ 0 ] - tip[ 0 ], 2 * foot[ 1 ] - tip[ 1 ] ];
			arrows.push( {
				from: tip,
				to,
				kind: ( rot.dir || 1 ) > 0 ? 'valley' : 'mountain',
			} );
		}
	}

	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	const eat = ( p ) => {
		minX = Math.min( minX, p[ 0 ] );
		maxX = Math.max( maxX, p[ 0 ] );
		minY = Math.min( minY, p[ 1 ] );
		maxY = Math.max( maxY, p[ 1 ] );
	};
	for ( const poly of polys ) {
		poly.pts.forEach( eat );
	}
	for ( const ar of arrows ) {
		eat( ar.from );
		eat( ar.to );
	}
	return {
		polys,
		creases,
		arrows,
		turnOver,
		bounds: { minX, maxX, minY, maxY },
	};
}

/* -------------------------------- drawing -------------------------------- */

/**
 * Draw one panel into a canvas rectangle.
 *
 * @param {CanvasRenderingContext2D} g      Target context.
 * @param {Object}                   figure The figure.
 * @param {number}                   k      Completed steps shown.
 * @param {Object}                   rect   { x, y, w, h } panel rectangle.
 * @param {Object}                   [opts] { front, back, line } colours.
 */
export function drawDiagram( g, figure, k, rect, opts = {} ) {
	const front = opts.front || '#fdfaf3';
	const back = opts.back || '#e9dfcc';
	const line = opts.line || '#3b3630';
	const geo = diagramGeometry( figure, k );
	const { bounds } = geo;
	const spanX = bounds.maxX - bounds.minX || 1;
	const spanY = bounds.maxY - bounds.minY || 1;
	const pad = 0.14;
	const s = Math.min(
		( rect.w * ( 1 - pad ) ) / spanX,
		( rect.h * ( 1 - pad ) ) / spanY
	);
	const ox = rect.x + rect.w / 2 - ( bounds.minX + spanX / 2 ) * s;
	const oy = rect.y + rect.h / 2 - ( bounds.minY + spanY / 2 ) * s;
	const P = ( p ) => [ ox + p[ 0 ] * s, oy + p[ 1 ] * s ];

	g.save();
	g.lineJoin = 'round';
	g.lineCap = 'round';
	for ( const poly of geo.polys ) {
		g.beginPath();
		poly.pts.forEach( ( p, i ) => {
			const q = P( p );
			return i ? g.lineTo( q[ 0 ], q[ 1 ] ) : g.moveTo( q[ 0 ], q[ 1 ] );
		} );
		g.closePath();
		g.fillStyle = poly.front ? front : back;
		g.fill();
		g.strokeStyle = line;
		g.lineWidth = Math.max( 1, rect.w * 0.006 );
		for ( let i = 0; i < poly.pts.length; i++ ) {
			if ( ! poly.edges[ i ] ) {
				continue;
			}
			const a = P( poly.pts[ i ] );
			const b = P( poly.pts[ ( i + 1 ) % poly.pts.length ] );
			g.beginPath();
			g.moveTo( a[ 0 ], a[ 1 ] );
			g.lineTo( b[ 0 ], b[ 1 ] );
			g.stroke();
		}
	}

	for ( const cr of geo.creases ) {
		const a = P( cr.a );
		const b = P( cr.b );
		g.beginPath();
		g.setLineDash(
			'valley' === cr.kind
				? [ rect.w * 0.03, rect.w * 0.02 ]
				: [
						rect.w * 0.03,
						rect.w * 0.015,
						rect.w * 0.004,
						rect.w * 0.015,
				  ]
		);
		g.moveTo( a[ 0 ], a[ 1 ] );
		g.lineTo( b[ 0 ], b[ 1 ] );
		g.strokeStyle = line;
		g.lineWidth = Math.max( 1, rect.w * 0.008 );
		g.stroke();
		g.setLineDash( [] );
	}

	for ( const ar of geo.arrows ) {
		const from = P( ar.from );
		const to = P( ar.to );
		const mx = ( from[ 0 ] + to[ 0 ] ) / 2;
		const my = ( from[ 1 ] + to[ 1 ] ) / 2;
		const nx = -( to[ 1 ] - from[ 1 ] ) * 0.45;
		const ny = ( to[ 0 ] - from[ 0 ] ) * 0.45;
		const cx = mx + nx;
		const cy = my + ny;
		g.beginPath();
		g.moveTo( from[ 0 ], from[ 1 ] );
		g.quadraticCurveTo( cx, cy, to[ 0 ], to[ 1 ] );
		g.strokeStyle = '#c04545';
		g.lineWidth = Math.max( 1.2, rect.w * 0.009 );
		g.stroke();
		// Arrow head along the curve's end direction.
		const hx = to[ 0 ] - cx;
		const hy = to[ 1 ] - cy;
		const hl = Math.hypot( hx, hy ) || 1;
		const ux = hx / hl;
		const uy = hy / hl;
		const size = Math.max( 5, rect.w * 0.035 );
		g.beginPath();
		g.moveTo( to[ 0 ], to[ 1 ] );
		g.lineTo(
			to[ 0 ] - ux * size - uy * size * 0.5,
			to[ 1 ] - uy * size + ux * size * 0.5
		);
		g.lineTo(
			to[ 0 ] - ux * size + uy * size * 0.5,
			to[ 1 ] - uy * size - ux * size * 0.5
		);
		g.closePath();
		if ( 'valley' === ar.kind ) {
			g.fillStyle = '#c04545';
			g.fill();
		} else {
			g.strokeStyle = '#c04545';
			g.lineWidth = Math.max( 1, rect.w * 0.006 );
			g.stroke();
		}
	}

	if ( geo.turnOver ) {
		const cx = rect.x + rect.w * 0.82;
		const cy = rect.y + rect.h * 0.18;
		const r = rect.w * 0.07;
		g.beginPath();
		g.arc( cx, cy, r, 0.4, Math.PI * 1.6 );
		g.strokeStyle = '#c04545';
		g.lineWidth = Math.max( 1.2, rect.w * 0.009 );
		g.stroke();
		const ax = cx + r * Math.cos( 0.4 );
		const ay = cy + r * Math.sin( 0.4 );
		g.beginPath();
		g.moveTo( ax + r * 0.5, ay - r * 0.1 );
		g.lineTo( ax - r * 0.35, ay - r * 0.45 );
		g.lineTo( ax - r * 0.1, ay + r * 0.55 );
		g.closePath();
		g.fillStyle = '#c04545';
		g.fill();
	}
	g.restore();
}
