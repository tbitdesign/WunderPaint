/**
 * The re-layout heart: transform a document's layers into a target
 * frame WITHOUT the crop. Background units cover-fill the new frame;
 * content units scale uniformly and keep their composition anchors
 * (a logo pinned to the top-left corner stays pinned, a footer sticks
 * to the bottom, centered titles stay centered), clamped into the
 * platform's safe zone.
 *
 * The editor's layer list is FLAT: groups carry `children` as an array
 * of ids and members point back via `parent`. A group and all its
 * members form one UNIT that moves with a single affine map, so
 * groups never tear apart. Pure functions - unit-tested in node.
 */

/** A layer counts as edge-anchored within this fraction of the axis. */
const EDGE_FRAC = 0.33;

/** Geometry fields that scale with the layout (besides x/y/w/h). */
const SCALE_FIELDS = [
	'fontSize',
	'letterSpacing',
	'strokeW',
	'radius',
];

const hasBox = ( l ) =>
	'number' === typeof l.x &&
	'number' === typeof l.y &&
	'number' === typeof l.w &&
	'number' === typeof l.h;

/**
 * Group the flat layer list into units: every top-level layer (no
 * living parent) plus all its descendants. Unit bounds are the union
 * of the measurable members (groups themselves carry no geometry).
 *
 * @param {Array} layers Flat editor layer list (z-order).
 * @return {Array} [{ root, members, bounds|null }] in z-order.
 */
export function buildUnits( layers ) {
	const byId = new Map( layers.map( ( l ) => [ l.id, l ] ) );
	const rootOf = ( layer ) => {
		let cur = layer;
		let guard = 0;
		while (
			cur.parent &&
			byId.has( cur.parent ) &&
			guard++ < 100
		) {
			cur = byId.get( cur.parent );
		}
		return cur;
	};
	const units = [];
	const byRoot = new Map();
	for ( const layer of layers ) {
		const root = rootOf( layer );
		let unit = byRoot.get( root.id ?? root );
		if ( ! unit ) {
			unit = { root, members: [], bounds: null };
			byRoot.set( root.id ?? root, unit );
			units.push( unit );
		}
		unit.members.push( layer );
		if ( 'group' !== layer.type && ! layer.hidden && hasBox( layer ) ) {
			const b = unit.bounds;
			unit.bounds = b
				? {
						x0: Math.min( b.x0, layer.x ),
						y0: Math.min( b.y0, layer.y ),
						x1: Math.max( b.x1, layer.x + layer.w ),
						y1: Math.max( b.y1, layer.y + layer.h ),
				  }
				: {
						x0: layer.x,
						y0: layer.y,
						x1: layer.x + layer.w,
						y1: layer.y + layer.h,
				  };
		}
	}
	return units;
}

/**
 * Background heuristic on a unit's bounds: a non-text unit that
 * practically fills the document (or the bottom-most unit covering
 * most of it).
 *
 * @param {Object} unit  From buildUnits().
 * @param {Object} doc   { w, h }.
 * @param {number} index Unit position (0 = bottom).
 * @return {boolean} Whether the unit should cover-fill targets.
 */
export function isBackgroundUnit( unit, doc, index ) {
	if ( ! unit.bounds || 'text' === unit.root.type ) {
		return false;
	}
	const b = unit.bounds;
	const x0 = Math.max( 0, b.x0 );
	const y0 = Math.max( 0, b.y0 );
	const x1 = Math.min( doc.w, b.x1 );
	const y1 = Math.min( doc.h, b.y1 );
	const coverage =
		( Math.max( 0, x1 - x0 ) * Math.max( 0, y1 - y0 ) ) /
		( doc.w * doc.h || 1 );
	return coverage >= 0.9 || ( 0 === index && coverage >= 0.7 );
}

/**
 * Where the subject sits, from a cutout's alpha: the same local model the
 * editor's own Smart Recrop uses for thumbnails (bridge.raster.
 * subjectCutout -> u2netp), so Reformat frames a picture the way the
 * Media Library Manager already does. Nothing leaves the browser and
 * nothing is billed.
 *
 * The centre of the subject's BOX, not of its mass: a person with an
 * outstretched arm should stay whole, and the box is what has to survive
 * the crop.
 *
 * @param {Uint8ClampedArray} data RGBA of the cutout, row-major.
 * @param {number}            w    Width.
 * @param {number}            h    Height.
 * @param {number}            cut  Alpha cutoff, 0..255.
 * @return {Object|null} { x, y } in 0..1, or null when nothing was cut out.
 */
export function focusFromCutout( data, w, h, cut = 102 ) {
	if ( ! data || ! w || ! h || data.length < w * h * 4 ) {
		return null;
	}
	let x0 = w;
	let y0 = h;
	let x1 = -1;
	let y1 = -1;
	let on = 0;
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			if ( data[ ( y * w + x ) * 4 + 3 ] < cut ) {
				continue;
			}
			on++;
			if ( x < x0 ) {
				x0 = x;
			}
			if ( x > x1 ) {
				x1 = x;
			}
			if ( y < y0 ) {
				y0 = y;
			}
			if ( y > y1 ) {
				y1 = y;
			}
		}
	}
	// Nothing, or nearly everything: both mean the cutout says nothing
	// useful about where to crop.
	if ( x1 < 0 || on < w * h * 0.004 || on > w * h * 0.94 ) {
		return null;
	}
	return {
		x: ( x0 + x1 + 1 ) / 2 / w,
		y: ( y0 + y1 + 1 ) / 2 / h,
	};
}

/**
 * Where the subject sits, from a depth map: 0 is far, 255 is near, and
 * what is near is what the picture is about. The centroid of the nearest
 * band is a better crop anchor than the middle of the frame, and it costs
 * one pass over a small buffer.
 *
 * Everything below the threshold is ignored, so a busy background cannot
 * drag the point back to the centre. A flat map (no depth at all, or a
 * model that never ran) has no nearest band and returns null - the caller
 * then keeps the middle.
 *
 * @param {Uint8Array|Array} depth One byte per pixel, row-major.
 * @param {number}           w     Map width.
 * @param {number}           h     Map height.
 * @return {Object|null} { x, y } in 0..1, or null when there is no subject.
 */
export function focusFromDepth( depth, w, h ) {
	if ( ! depth || ! w || ! h || depth.length < w * h ) {
		return null;
	}
	let lo = 255;
	let hi = 0;
	for ( let i = 0; i < w * h; i++ ) {
		const v = depth[ i ];
		if ( v < lo ) {
			lo = v;
		}
		if ( v > hi ) {
			hi = v;
		}
	}
	// A map with almost no range is a flat wall: there is no subject to
	// find, and pretending otherwise would move the crop at random.
	if ( hi - lo < 24 ) {
		return null;
	}
	const cut = lo + ( hi - lo ) * 0.62;
	let sum = 0;
	let sx = 0;
	let sy = 0;
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			const v = depth[ y * w + x ];
			if ( v < cut ) {
				continue;
			}
			// Weighted by how near it is, so the nose beats the shoulder.
			const k = ( v - cut ) / ( hi - cut || 1 );
			sum += k;
			sx += k * ( x + 0.5 );
			sy += k * ( y + 0.5 );
		}
	}
	if ( sum <= 0 ) {
		return null;
	}
	return { x: sx / sum / w, y: sy / sum / h };
}

/** A number in 0..1, or the fallback when it is not one. */
function clamp01( v, fallback ) {
	return 'number' === typeof v && isFinite( v )
		? Math.min( 1, Math.max( 0, v ) )
		: fallback;
}

/**
 * Cover-fill one background unit so that the FOCUS point of the document
 * lands in the middle of the target frame - and then slide back just far
 * enough that no edge of the frame runs empty.
 *
 * Centre-cropping is what makes a reformat look careless: a portrait cut
 * out of a landscape keeps the middle, which is usually the gap between
 * the two things that mattered. With a focus the same cover-fill keeps
 * the subject.
 *
 * @param {Object} b      Unit bounds in document units.
 * @param {Object} doc    Source document { w, h }.
 * @param {Object} target Target frame { w, h }.
 * @param {number} s      Cover scale.
 * @param {Object} focus  { x, y } in 0..1 of the document.
 * @return {Object} { s, dx, dy }.
 */
export function coverAffine( b, doc, target, s, focus ) {
	const f = {
		x: clamp01( focus && focus.x, 0.5 ),
		y: clamp01( focus && focus.y, 0.5 ),
	};
	const axis = ( x0, x1, docSize, targetSize, fr ) => {
		// Put the focus in the middle of the frame ...
		let d = targetSize / 2 - docSize * fr * s;
		// ... then pull it back inside: the unit must still cover the
		// frame on both sides, which is what stops a bright edge of
		// nothing appearing at the top or the left.
		const lo = targetSize - x1 * s;
		const hi = -x0 * s;
		if ( lo <= hi ) {
			d = Math.min( hi, Math.max( lo, d ) );
		} else {
			// The unit is smaller than the frame on this axis: centre it,
			// there is nothing to choose.
			d = ( targetSize - ( x1 - x0 ) * s ) / 2 - x0 * s;
		}
		return d;
	};
	return {
		s,
		dx: axis( b.x0, b.x1, doc.w, target.w, f.x ),
		dy: axis( b.y0, b.y1, doc.h, target.h, f.y ),
	};
}

/**
 * One axis of the anchor mapping: preserve the smaller edge margin
 * (scaled), else stay proportionally centered; clamp into the safe
 * band when the unit fits inside it.
 *
 * @param {Object} a Axis spec { pos, size, docSize, targetSize, s,
 *                   safeStart, safeEnd }.
 * @return {number} New position.
 */
export function anchorAxis( a ) {
	const scaled = a.size * a.s;
	const m0 = a.pos;
	const m1 = a.docSize - ( a.pos + a.size );
	let out;
	if ( m0 <= m1 && m0 < a.docSize * EDGE_FRAC ) {
		out = Math.max( m0 * a.s, a.safeStart );
	} else if ( m1 < m0 && m1 < a.docSize * EDGE_FRAC ) {
		out = Math.min(
			a.targetSize - m1 * a.s - scaled,
			a.targetSize - a.safeEnd - scaled
		);
	} else {
		out =
			( ( a.pos + a.size / 2 ) / ( a.docSize || 1 ) ) *
				a.targetSize -
			scaled / 2;
	}
	// Clamp into the safe band whenever the unit fits into it.
	const lo = a.safeStart;
	const hi = a.targetSize - a.safeEnd - scaled;
	if ( hi >= lo ) {
		out = Math.min( Math.max( out, lo ), hi );
	} else {
		// Larger than the safe band: center on the full frame.
		out = ( a.targetSize - scaled ) / 2;
	}
	return out;
}

/** Layer-style sub-keys that live in layer pixel units. */
const STYLE_SCALE_KEYS = [ 'distance', 'blur', 'spread', 'size' ];

/** Apply an affine map (uniform scale + offset) to one flat layer. */
function mapLayer( layer, s, dx, dy ) {
	const out = { ...layer };
	if ( hasBox( layer ) ) {
		out.x = layer.x * s + dx;
		out.y = layer.y * s + dy;
		out.w = layer.w * s;
		out.h = layer.h * s;
	}
	for ( const f of SCALE_FIELDS ) {
		if ( 'number' === typeof layer[ f ] ) {
			out[ f ] = layer[ f ] * s;
		}
	}
	// Layer styles (drop shadow, glow, stroke) measure in layer pixels:
	// without scaling them a shrunken design keeps full-size shadows.
	if ( layer.styles && 'object' === typeof layer.styles ) {
		const styles = {};
		for ( const [ key, val ] of Object.entries( layer.styles ) ) {
			if ( val && 'object' === typeof val ) {
				const copy = { ...val };
				for ( const k of STYLE_SCALE_KEYS ) {
					if ( 'number' === typeof copy[ k ] ) {
						copy[ k ] = copy[ k ] * s;
					}
				}
				styles[ key ] = copy;
			} else {
				styles[ key ] = val;
			}
		}
		out.styles = styles;
	}
	// `children` on groups is an id list - copy untouched.
	return out;
}

/**
 * Transform the FLAT layer list of a document into a target frame.
 * Every unit (top-level layer or whole group) gets one affine map;
 * order and ids stay identical, so the renderer's group resolution
 * keeps working on the copies.
 *
 * @param {Array}  layers Flat editor layers.
 * @param {Object} doc    Source { w, h }.
 * @param {Object} target Format { w, h, safe }.
 * @param {Object} [opts] { contentScale = 1, useSafe = true }.
 * @return {Array} Transformed flat copies (same order).
 */
export function transformLayers( layers, doc, target, opts = {} ) {
	const contentScale = opts.contentScale || 1;
	const useSafe = false !== opts.useSafe;
	const safe = useSafe
		? {
				top: ( target.safe?.top || 0 ) * target.h,
				right: ( target.safe?.right || 0 ) * target.w,
				bottom: ( target.safe?.bottom || 0 ) * target.h,
				left: ( target.safe?.left || 0 ) * target.w,
		  }
		: { top: 0, right: 0, bottom: 0, left: 0 };
	const sCover = Math.max( target.w / doc.w, target.h / doc.h );
	// The point that must survive the crop, in 0..1 of the document.
	// Half/half is the old behaviour: the middle of the picture.
	const focus = {
		x: clamp01( opts.focus && opts.focus.x, 0.5 ),
		y: clamp01( opts.focus && opts.focus.y, 0.5 ),
	};
	const sContent =
		Math.min( target.w / doc.w, target.h / doc.h ) * contentScale;

	const units = buildUnits( layers );
	const affineByLayer = new Map();
	units.forEach( ( unit, i ) => {
		let affine;
		if ( ! unit.bounds ) {
			// Nothing measurable (empty group): proportional center.
			affine = {
				s: sContent,
				dx: ( target.w - doc.w * sContent ) / 2,
				dy: ( target.h - doc.h * sContent ) / 2,
			};
		} else if ( isBackgroundUnit( unit, doc, i ) ) {
			affine = coverAffine( unit.bounds, doc, target, sCover, focus );
		} else {
			const b = unit.bounds;
			const nx = anchorAxis( {
				pos: b.x0,
				size: b.x1 - b.x0,
				docSize: doc.w,
				targetSize: target.w,
				s: sContent,
				safeStart: safe.left,
				safeEnd: safe.right,
			} );
			const ny = anchorAxis( {
				pos: b.y0,
				size: b.y1 - b.y0,
				docSize: doc.h,
				targetSize: target.h,
				s: sContent,
				safeStart: safe.top,
				safeEnd: safe.bottom,
			} );
			affine = {
				s: sContent,
				dx: nx - b.x0 * sContent,
				dy: ny - b.y0 * sContent,
			};
		}
		for ( const member of unit.members ) {
			affineByLayer.set( member, affine );
		}
	} );

	return layers.map( ( layer ) => {
		const a = affineByLayer.get( layer );
		return mapLayer( layer, a.s, a.dx, a.dy );
	} );
}
