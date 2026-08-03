/**
 * Area text inside a shape outline (v1.210.0). Given a way to ask "how wide is
 * the shape between vertical y0 and y1" (spanAt) and "how wide is this string
 * at font size px" (measure), greedily flow words down the shape so the text
 * block takes the shape's silhouette: a circle yields wide middle lines and
 * short top/bottom lines. The whole run is auto-shrunk until it fits the shape
 * vertically.
 *
 * Pure given its two callbacks, so the layout is unit-testable without a
 * canvas and can be reused by the headless QA harness.
 */

/**
 * @typedef {Object} ShapeTextLine
 * @property {string} text     The line's text.
 * @property {number} baseline Baseline y (layer-local).
 * @property {number} cx       Horizontal centre of the shape span at that row.
 * @property {number} width    Measured width of the line at the chosen size.
 * @property {number} fs       Font size the line is drawn at.
 * @property {number} ls       Letter spacing at the chosen scale.
 */

/**
 * Flow text inside a shape.
 *
 * @param {Object}   o               Options.
 * @param {string}   o.text          The paragraph text (whitespace = word breaks).
 * @param {number}   o.fontSize      Requested font size (before auto-fit).
 * @param {number}   [o.lineHeight]  Line height multiple.
 * @param {number}   [o.letterSpacing] Extra px between glyphs at scale 1.
 * @param {number}   [o.pad]         Inset from the outline on every side.
 * @param {number}   o.top           Top of the shape's bounds (layer-local).
 * @param {number}   o.bottom        Bottom of the shape's bounds.
 * @param {Function} o.spanAt        (yTop,yBot) => [left,right] | null, the
 *                                   narrowest inside interval across that band.
 * @param {Function} o.measure       (text, fontSizePx) => width in px.
 * @param {number}   [o.minScale]    Lowest auto-fit scale to try.
 * @param {number}   [o.ascent]      Ascent as a fraction of font size.
 * @param {number}   [o.descent]     Descent as a fraction of font size.
 * @param {boolean}  [o.center]      Vertically centre the block in the shape.
 * @return {{ scale: number, fits: boolean, lines: ShapeTextLine[] }} Layout.
 */
export function layoutTextInShape( o ) {
	const {
		text,
		fontSize,
		lineHeight = 1.15,
		letterSpacing = 0,
		pad = 0,
		top,
		bottom,
		spanAt,
		measure,
		minScale = 0.4,
		ascent = 0.72,
		descent = 0.24,
		center = true,
	} = o;
	const words = String( text || '' )
		.split( /\s+/ )
		.filter( Boolean );
	if ( ! words.length ) {
		return { scale: 1, fits: true, lines: [] };
	}

	// Try progressively smaller scales until the whole text fits the shape.
	let fallback = null;
	for ( let scale = 1; scale >= minScale - 1e-6; scale -= 0.06 ) {
		const res = flow( scale, top );
		if ( res.fits ) {
			return center ? recentre( res, scale ) : res;
		}
		if ( ! fallback ) {
			fallback = res; // most readable size, used if nothing fits
		}
	}
	return fallback || { scale: minScale, fits: false, lines: [] };

	// Lay words out from a given first-baseline anchor at one scale.
	function flow( scale, startTop ) {
		const fs = fontSize * scale;
		const lh = fs * lineHeight;
		const a = fs * ascent;
		const dsc = fs * descent;
		const ls = letterSpacing * scale;
		const lineW = ( s ) =>
			measure( s, fs ) + ls * Math.max( 0, Array.from( s ).length - 1 );
		const lines = [];
		let wi = 0;
		let baseline = startTop + pad + a;
		let guard = 0;
		while ( wi < words.length ) {
			if ( ++guard > 4000 ) {
				break;
			}
			if ( baseline + dsc > bottom - pad ) {
				return { scale, fits: false, lines };
			}
			const span = spanAt( baseline - a, baseline + dsc );
			const avail = span ? span[ 1 ] - span[ 0 ] - 2 * pad : 0;
			if ( ! span || avail < fs * 0.5 ) {
				baseline += lh; // row too narrow here, drop to the next
				continue;
			}
			// Greedily pack as many words as fit this row's width.
			let line = words[ wi ];
			let count = 1;
			while ( wi + count < words.length ) {
				const trial = line + ' ' + words[ wi + count ];
				if ( lineW( trial ) <= avail ) {
					line = trial;
					count++;
				} else {
					break;
				}
			}
			lines.push( {
				text: line,
				baseline,
				cx: ( span[ 0 ] + span[ 1 ] ) / 2,
				width: lineW( line ),
				fs,
				ls,
			} );
			wi += count;
			baseline += lh;
		}
		return { scale, fits: true, lines };
	}

	// Centre the block on the shape's vertical middle. Because the available
	// width (and thus the wrapping) changes with y, we can't rigid-shift; we
	// re-flow from a corrected start and iterate toward the centre. Each pass
	// keeps the last layout that still holds every word, so it never regresses.
	function recentre( res, scale ) {
		if ( ! res.lines.length ) {
			return res;
		}
		const fs = fontSize * scale;
		const a = fs * ascent;
		const dsc = fs * descent;
		const shapeMid = ( top + bottom ) / 2;
		let cur = res;
		for ( let iter = 0; iter < 3; iter++ ) {
			const firstTop = cur.lines[ 0 ].baseline - a;
			const lastBot = cur.lines[ cur.lines.length - 1 ].baseline + dsc;
			const shift = shapeMid - ( firstTop + lastBot ) / 2;
			if ( Math.abs( shift ) < 1 ) {
				break;
			}
			const next = flow( scale, firstTop + shift - pad );
			if ( ! next.fits || ! next.lines.length ) {
				break;
			}
			cur = next;
		}
		return cur;
	}
}

/**
 * Build a spanAt(yTop,yBot) from a shape alpha mask: the narrowest inside
 * interval across the rows the band covers, so a line never pokes out where
 * the shape pinches. Rows are sampled at `step` to keep it cheap.
 *
 * @param {Uint8ClampedArray|Uint8Array} alpha Row-major alpha, one byte per px.
 * @param {number}                       w     Mask width.
 * @param {number}                       h     Mask height.
 * @param {number}                       [sx]  Mask-x -> layer-x scale.
 * @param {number}                       [sy]  Mask-y -> layer-y scale.
 * @return {Function} spanAt(yTop,yBot) in LAYER coordinates.
 */
export function maskSpanFn( alpha, w, h, sx = 1, sy = 1 ) {
	const rowSpan = ( row ) => {
		let l = -1;
		let r = -1;
		const base = row * w;
		for ( let x = 0; x < w; x++ ) {
			if ( alpha[ base + x ] > 8 ) {
				if ( l < 0 ) {
					l = x;
				}
				r = x;
			}
		}
		return l < 0 ? null : [ l, r + 1 ];
	};
	return ( yTop, yBot ) => {
		const r0 = Math.max( 0, Math.floor( yTop / sy ) );
		const r1 = Math.min( h - 1, Math.ceil( yBot / sy ) );
		let left = -Infinity;
		let right = Infinity;
		let any = false;
		for ( let row = r0; row <= r1; row++ ) {
			const s = rowSpan( row );
			if ( ! s ) {
				return null; // a fully empty row in the band: unsafe, skip it
			}
			any = true;
			left = Math.max( left, s[ 0 ] );
			right = Math.min( right, s[ 1 ] );
		}
		if ( ! any || right - left < 1 ) {
			return null;
		}
		return [ left * sx, right * sx ];
	};
}
