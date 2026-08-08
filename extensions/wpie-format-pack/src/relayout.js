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
			const cx = ( unit.bounds.x0 + unit.bounds.x1 ) / 2;
			const cy = ( unit.bounds.y0 + unit.bounds.y1 ) / 2;
			affine = {
				s: sCover,
				dx: target.w / 2 - cx * sCover,
				dy: target.h / 2 - cy * sCover,
			};
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
