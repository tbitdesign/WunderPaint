/**
 * Drawing a collage onto a canvas (20.10.2026): the live preview and the
 * layout cards of the Collage & Photo Grid dialog paint through this, and
 * so do tests and proof sheets - it needs nothing a browser has and Node
 * lacks (no Path2D: the shape paths of Diagonal, Hexagon and Split are
 * straight lines and are traced here).
 */

const clamp = ( v, lo, hi ) => Math.min( hi, Math.max( lo, v ) );

/** Trace a rounded rect path (same arcTo recipe the renderer uses). */
export function roundedPath( ctx, w, h, r ) {
	const rr = clamp( r || 0, 0, Math.min( w, h ) / 2 );
	ctx.beginPath();
	ctx.moveTo( rr, 0 );
	ctx.arcTo( w, 0, w, h, rr );
	ctx.arcTo( w, h, 0, h, rr );
	ctx.arcTo( 0, h, 0, 0, rr );
	ctx.arcTo( 0, 0, w, 0, rr );
	ctx.closePath();
}

/** Cover-crop draw around a focus - mirrors the image layer's "cover". */
export function coverDraw( ctx, img, w, h, focus ) {
	const iw = img.naturalWidth || img.width;
	const ih = img.naturalHeight || img.height;
	if ( ! iw || ! ih ) {
		return;
	}
	const s = Math.max( w / iw, h / ih );
	const sw = w / s;
	const sh = h / s;
	const ax = focus ? focus.x : 0.5;
	const ay = focus ? focus.y : 0.5;
	ctx.drawImage(
		img,
		( iw - sw ) * ax,
		( ih - sh ) * ay,
		sw,
		sh,
		0,
		0,
		w,
		h
	);
}

/** The drop shadow a spec's 0-100 shadow becomes (as in the beautifier). */
export function shadowStyle( amount, unit ) {
	const k = clamp( amount || 0, 0, 100 ) / 100;
	return {
		color: '#000000',
		opacity: Math.round( ( 0.2 + 0.3 * k ) * 100 ) / 100,
		angle: 120,
		distance: Math.round( unit * 0.012 * k ),
		blur: Math.round( unit * 0.035 * k ),
		spread: 0,
	};
}

/**
 * Trace path data made of straight lines (M, L, Z - what the collage
 * shapes are) as the current path. Several subpaths become one path, so a
 * Split clip holds every panel.
 *
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {string}                   d   Path data.
 */
export function tracePath( ctx, d ) {
	ctx.beginPath();
	const tokens = d.match( /[MLZ]|-?[\d.]+(?:e-?\d+)?/gi ) || [];
	let cmd = 'M';
	for ( let i = 0; i < tokens.length;  ) {
		const t = tokens[ i ];
		if ( /^[MLZ]$/i.test( t ) ) {
			cmd = t.toUpperCase();
			i++;
			if ( 'Z' === cmd ) {
				ctx.closePath();
			}
			continue;
		}
		const x = +tokens[ i ];
		const y = +tokens[ i + 1 ];
		i += 2;
		if ( 'M' === cmd ) {
			ctx.moveTo( x, y );
			cmd = 'L';
		} else {
			ctx.lineTo( x, y );
		}
	}
}

/**
 * Paint a collage's specs onto a canvas (20.10.2026): the live preview and
 * the small layout cards draw through the same code, so a card shows what
 * picking it gives. Shaped photos (Diagonal, Hexagon, Split) are clipped
 * to their path, exactly as the inserted photo is clipped to its mask.
 *
 * @param {HTMLCanvasElement} canvas Target; sized here.
 * @param {Array}             specs  collageLayerSpecs result.
 * @param {Object}            o      { w, h (document), scale (pixels per
 *                                   document unit), imageFor( spec ),
 *                                   backdrop, layout, unit, selected }.
 */
export function paintCollage( canvas, specs, o ) {
	const { w, h, scale } = o;
	canvas.width = Math.max( 1, Math.round( w * scale ) );
	canvas.height = Math.max( 1, Math.round( h * scale ) );
	const ctx = canvas.getContext( '2d' );
	ctx.setTransform( scale, 0, 0, scale, 0, 0 );
	ctx.fillStyle = o.backdrop || '#eef0f3';
	ctx.fillRect( 0, 0, w, h );
	const polaroid = 'polaroid' === o.layout;
	// The spec's outline as the current path: its shape, or a rounded rect.
	const outline = ( spec ) => {
		const d = spec.clip || spec.pathD;
		if ( d ) {
			tracePath( ctx, d );
		} else {
			roundedPath( ctx, spec.w, spec.h, spec.radius );
		}
	};
	specs.forEach( ( spec ) => {
		ctx.save();
		ctx.translate( spec.x + spec.w / 2, spec.y + spec.h / 2 );
		ctx.rotate( ( ( spec.rot || 0 ) * Math.PI ) / 180 );
		ctx.translate( -spec.w / 2, -spec.h / 2 );
		if ( spec.shadow ) {
			const sh = shadowStyle( spec.shadow, o.unit );
			ctx.shadowColor = `rgba(0,0,0,${ sh.opacity })`;
			ctx.shadowBlur = sh.blur * scale;
			ctx.shadowOffsetX = sh.distance * 0.5 * scale;
			ctx.shadowOffsetY = sh.distance * 0.87 * scale;
		}
		if ( 'photo' === spec.kind ) {
			const img = o.imageFor( spec );
			outline( spec );
			ctx.fillStyle = '#c9cdd4';
			ctx.fill();
			ctx.shadowColor = 'transparent';
			if ( img && ( img.naturalWidth || img.width ) ) {
				ctx.save();
				ctx.clip();
				coverDraw( ctx, img, spec.w, spec.h, spec.focus );
				ctx.restore();
			}
			if ( o.selected === spec.index ) {
				ctx.strokeStyle = '#3b66ff';
				ctx.lineWidth = 4 / scale;
				outline( spec );
				ctx.stroke();
			}
		} else if ( 'caption' === spec.kind || 'badgeText' === spec.kind ) {
			const badge = 'badgeText' === spec.kind;
			const size = badge
				? Math.round( spec.h * 0.46 )
				: Math.round( clamp( spec.h * 0.45, 10, 30 ) );
			ctx.fillStyle = badge ? '#ffffff' : '#4a4e55';
			ctx.font = `${ polaroid && ! badge ? 'italic ' : '' }${
				badge ? 600 : 500
			} ${ size }px ${ polaroid && ! badge ? 'Lora' : 'Inter' }`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText( spec.text, spec.w / 2, spec.h / 2 );
		} else if ( 'holes' === spec.kind ) {
			ctx.fillStyle = spec.fill;
			// Squares only - trace them straight from the path data.
			const nums = ( spec.pathD.match( /[\d.]+/g ) || [] ).map( Number );
			for ( let i = 0; i + 7 < nums.length; i += 8 ) {
				ctx.fillRect(
					nums[ i ],
					nums[ i + 1 ],
					nums[ i + 2 ] - nums[ i ],
					nums[ i + 5 ] - nums[ i + 1 ]
				);
			}
		} else {
			ctx.fillStyle = spec.fill;
			outline( spec );
			ctx.fill();
			if ( 'card' === spec.kind ) {
				ctx.shadowColor = 'transparent';
				ctx.strokeStyle = 'rgba(0,0,0,0.08)';
				ctx.lineWidth = 1 / scale;
				ctx.stroke();
			}
		}
		ctx.restore();
	} );
}
