/**
 * Projective quad math for the free-transform warp (spec 13.6). Photoshop
 * places smart objects by mapping their flat content rectangle onto an
 * arbitrary corner quad (Distort / Perspective / rotated Free Transform);
 * the PSD import stores that placement in the editor's existing
 * `layer.quad` ({ tl, tr, br, bl } in doc coords) and `drawWarped` renders
 * the mesh through the homography below.
 *
 * Leaf module: no DOM globals (Jest-safe).
 */

/**
 * Homography mapping the UNIT square (0,0)(1,0)(1,1)(0,1) onto a quad
 * (Heckbert's square-to-quad). Returns coefficients for
 * x' = (a·u + b·v + c) / (g·u + h·v + 1), y' = (d·u + e·v + f) / (…).
 *
 * @param {number[]} quad Flat corner list [x0,y0,…,x3,y3] (TL,TR,BR,BL).
 * @return {Object} Coefficients { a, b, c, d, e, f, g, h }.
 */
export function homographyFromQuad( quad ) {
	const [ x0, y0, x1, y1, x2, y2, x3, y3 ] = quad;
	const dx1 = x1 - x2;
	const dx2 = x3 - x2;
	const dx3 = x0 - x1 + x2 - x3;
	const dy1 = y1 - y2;
	const dy2 = y3 - y2;
	const dy3 = y0 - y1 + y2 - y3;
	if ( Math.abs( dx3 ) < 1e-9 && Math.abs( dy3 ) < 1e-9 ) {
		// Parallelogram: plain affine.
		return {
			a: x1 - x0,
			b: x3 - x0,
			c: x0,
			d: y1 - y0,
			e: y3 - y0,
			f: y0,
			g: 0,
			h: 0,
		};
	}
	const den = dx1 * dy2 - dy1 * dx2;
	const g = ( dx3 * dy2 - dy3 * dx2 ) / den;
	const h = ( dx1 * dy3 - dy1 * dx3 ) / den;
	return {
		a: x1 - x0 + g * x1,
		b: x3 - x0 + h * x3,
		c: x0,
		d: y1 - y0 + g * y1,
		e: y3 - y0 + h * y3,
		f: y0,
		g,
		h,
	};
}

/**
 * Map a unit-square point through a homography.
 *
 * @param {Object} m Coefficients from homographyFromQuad.
 * @param {number} u Horizontal 0..1.
 * @param {number} v Vertical 0..1.
 * @return {number[]} [x, y].
 */
export function projectUnitPoint( m, u, v ) {
	const w = m.g * u + m.h * v + 1;
	return [ ( m.a * u + m.b * v + m.c ) / w, ( m.d * u + m.e * v + m.f ) / w ];
}

/**
 * True when the quad is an axis-aligned rectangle (its corners coincide
 * with its own bounding-box corners, in TL,TR,BR,BL order).
 *
 * @param {number[]} quad Flat corner list.
 * @param {number}   eps  Tolerance in the quad's units.
 * @return {boolean} Axis-aligned?
 */
export function quadIsAxisRect( quad, eps = 0.51 ) {
	const xs = [ quad[ 0 ], quad[ 2 ], quad[ 4 ], quad[ 6 ] ];
	const ys = [ quad[ 1 ], quad[ 3 ], quad[ 5 ], quad[ 7 ] ];
	const minX = Math.min( ...xs );
	const maxX = Math.max( ...xs );
	const minY = Math.min( ...ys );
	const maxY = Math.max( ...ys );
	const box = [ minX, minY, maxX, minY, maxX, maxY, minX, maxY ];
	return quad.every( ( value, i ) => Math.abs( value - box[ i ] ) < eps );
}

/**
 * True when a custom envelope warp is the identity: its mesh points form
 * the plain uniform grid over the warp bounds, i.e. no deformation. Both
 * Photoshop and ag-psd emit such placeholder warps on undeformed layers.
 *
 * @param {Object} warp PSD warp record.
 * @return {boolean} Identity mesh?
 */
function meshIsUniform( warp ) {
	const mesh = warp.customEnvelopeWarp?.meshPoints;
	const cols = warp.uOrder || 4;
	const rows = warp.vOrder || 4;
	if ( ! Array.isArray( mesh ) || mesh.length !== cols * rows ) {
		return false;
	}
	const val = ( u ) => ( u && 'object' === typeof u ? u.value : u ) || 0;
	const left = val( warp.bounds?.left );
	const top = val( warp.bounds?.top );
	const spanW = val( warp.bounds?.right ) - left;
	const spanH = val( warp.bounds?.bottom ) - top;
	if ( spanW <= 0 || spanH <= 0 ) {
		return false;
	}
	const eps = Math.max( spanW, spanH ) * 0.001 + 0.01;
	for ( let j = 0; j < rows; j++ ) {
		for ( let i = 0; i < cols; i++ ) {
			const p = mesh[ j * cols + i ];
			if (
				Math.abs( p.x - ( left + ( i * spanW ) / ( cols - 1 ) ) ) >
					eps ||
				Math.abs( p.y - ( top + ( j * spanH ) / ( rows - 1 ) ) ) > eps
			) {
				return false;
			}
		}
	}
	return true;
}

/**
 * Extract a PSD custom envelope warp as a renderable 4x4 Bézier mesh,
 * normalized to the warp bounds (so replacing the contents with different
 * dimensions keeps the deformation). Returns null when there is no warp,
 * the mesh is the identity, a named warp style or perspective slider is
 * active, or the warp is a quilt (split) warp - those keep the baked
 * preview.
 *
 * @param {Object} placed PSD placedLayer record.
 * @return {Object|null} { pts: number[32] } (row-major 4x4, normalized).
 */
export function warpMeshFromPlaced( placed ) {
	const warp = placed?.warp;
	const mesh = warp?.customEnvelopeWarp?.meshPoints;
	if ( ! Array.isArray( mesh ) || 16 !== mesh.length ) {
		return null;
	}
	const style = warp.style || 'none';
	if (
		warp.value ||
		warp.perspective ||
		warp.perspectiveOther ||
		( 'none' !== style && 'custom' !== style )
	) {
		return null;
	}
	// Quilt (split) warps carry slice data we cannot rebuild.
	if (
		( warp.deformNumRows && 4 !== warp.deformNumRows ) ||
		( warp.deformNumCols && 4 !== warp.deformNumCols ) ||
		( warp.customEnvelopeWarp.quiltSliceX?.length || 0 ) > 2 ||
		( warp.customEnvelopeWarp.quiltSliceY?.length || 0 ) > 2
	) {
		return null;
	}
	if ( meshIsUniform( warp ) ) {
		return null;
	}
	const val = ( u ) => ( u && 'object' === typeof u ? u.value : u ) || 0;
	const left = val( warp.bounds?.left );
	const top = val( warp.bounds?.top );
	const spanW = val( warp.bounds?.right ) - left;
	const spanH = val( warp.bounds?.bottom ) - top;
	if ( spanW <= 0 || spanH <= 0 ) {
		return null;
	}
	const pts = [];
	for ( const p of mesh ) {
		if ( ! Number.isFinite( p?.x ) || ! Number.isFinite( p?.y ) ) {
			return null;
		}
		pts.push( ( p.x - left ) / spanW, ( p.y - top ) / spanH );
	}
	return { pts };
}

/** Cubic Bernstein basis at t. */
const bernstein3 = ( t ) => {
	const s = 1 - t;
	return [ s * s * s, 3 * t * s * s, 3 * t * t * s, t * t * t ];
};

/**
 * Evaluate a normalized 4x4 Bézier warp mesh at (u, v): where does the
 * content point (u, v) land inside the (deformed) unit square?
 *
 * @param {Object} mesh { pts: number[32] } from warpMeshFromPlaced.
 * @param {number} u    Horizontal 0..1.
 * @param {number} v    Vertical 0..1.
 * @return {number[]} [u', v'] deformed normalized coords.
 */
export function evalBezierMesh( mesh, u, v ) {
	const { pts } = mesh;
	const bu = bernstein3( u );
	const bv = bernstein3( v );
	let x = 0;
	let y = 0;
	for ( let j = 0; j < 4; j++ ) {
		for ( let i = 0; i < 4; i++ ) {
			const w = bu[ i ] * bv[ j ];
			x += w * pts[ 2 * ( j * 4 + i ) ];
			y += w * pts[ 2 * ( j * 4 + i ) + 1 ];
		}
	}
	return [ x, y ];
}

/**
 * Sample the full warp mapping (mesh, then quad homography) on a coarse
 * grid - used for device bounds, since a bulging mesh extends OUTSIDE the
 * quad corners.
 *
 * @param {Object} quad    { tl, tr, br, bl } in doc coords.
 * @param {Object} mesh    Normalized Bézier mesh or null.
 * @param {number} samples Grid subdivisions per axis.
 * @return {Array} Points [{ x, y }].
 */
export function warpedQuadPoints( quad, mesh, samples = 6 ) {
	const m = homographyFromQuad( [
		quad.tl.x,
		quad.tl.y,
		quad.tr.x,
		quad.tr.y,
		quad.br.x,
		quad.br.y,
		quad.bl.x,
		quad.bl.y,
	] );
	const out = [];
	for ( let j = 0; j <= samples; j++ ) {
		for ( let i = 0; i <= samples; i++ ) {
			let u = i / samples;
			let v = j / samples;
			if ( mesh ) {
				[ u, v ] = evalBezierMesh( mesh, u, v );
			}
			const [ x, y ] = projectUnitPoint( m, u, v );
			out.push( { x, y } );
		}
	}
	return out;
}

/**
 * Extract the placement quad of a PSD placed layer as an editor
 * free-transform quad ({ tl, tr, br, bl } in doc coords). Photoshop keeps
 * the affine frame in `transform` and the Distort/Perspective corners in
 * `nonAffineTransform`.
 *
 * Returns null when the placement is a plain axis-aligned rectangle with
 * no usable warp mesh (the legacy import path is exact there), when a
 * warp is active that we cannot rebuild (named styles, perspective
 * sliders, quilt warps - only the baked preview can represent those), or
 * when the data is degenerate.
 *
 * @param {Object} placed PSD placedLayer record.
 * @return {Object|null} { tl, tr, br, bl } or null.
 */
export function placedQuad( placed ) {
	if ( ! placed ) {
		return null;
	}
	const warp = placed.warp || {};
	const style = warp.style || 'none';
	if (
		warp.value ||
		warp.perspective ||
		warp.perspectiveOther ||
		( 'none' !== style && 'custom' !== style )
	) {
		return null;
	}
	const mesh = warpMeshFromPlaced( placed );
	if ( warp.customEnvelopeWarp && ! meshIsUniform( warp ) && ! mesh ) {
		// Deformed, but not rebuildable (quilt warp) → baked preview.
		return null;
	}
	const pick = ( t ) =>
		Array.isArray( t ) && 8 === t.length && t.every( Number.isFinite )
			? t
			: null;
	const t = pick( placed.nonAffineTransform ) || pick( placed.transform );
	if ( ! t || ( quadIsAxisRect( t ) && ! mesh ) ) {
		return null;
	}
	const xs = [ t[ 0 ], t[ 2 ], t[ 4 ], t[ 6 ] ];
	const ys = [ t[ 1 ], t[ 3 ], t[ 5 ], t[ 7 ] ];
	if (
		Math.max( ...xs ) - Math.min( ...xs ) < 1 ||
		Math.max( ...ys ) - Math.min( ...ys ) < 1
	) {
		return null;
	}
	return {
		tl: { x: t[ 0 ], y: t[ 1 ] },
		tr: { x: t[ 2 ], y: t[ 3 ] },
		br: { x: t[ 4 ], y: t[ 5 ] },
		bl: { x: t[ 6 ], y: t[ 7 ] },
	};
}
