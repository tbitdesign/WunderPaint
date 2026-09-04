/**
 * The painter behind the flat stage: brush commands become paint through
 * the editor's own engine (bridge.paint, API 2.21).
 *
 * Two roads, chosen per command and per what the browser can do:
 *
 *   CPU  the stroke is laid with a media brush into a scratch window,
 *        then applyPaintStyle() lets it meet the pixels beneath - pigment
 *        mixing, load, pickup, the drying edge, grain, bleed, body and
 *        gloss. The styled result is revealed along the path while the
 *        world's clock runs, so the stroke is seen being made.
 *   WET  the stroke is stamped segment by segment into one of the three
 *        physics islands (liquid, paste, dry), exactly as the editor's wet
 *        brush does it; the island keeps living between frames (water
 *        flows and dries, paste stays open and locks, dust sets) and is
 *        drawn over the surface until it is dry, then baked in.
 *
 * Without WebGL2 float the wet road falls back to the CPU one, with the
 * same style id: one engine in production, never two looks.
 */

const SEG_MIN = 1.5; // px, shortest segment worth stamping

/**
 * Without the editor's brush engine (an older core, the mock editor of
 * the checks): plain round strokes, no media, no wet paint. The society
 * still paints; only the matter is missing.
 */
function plainKit() {
	return {
		tips: { stampMaxReach: ( tip, size ) => size },
		drawStroke( g, path ) {
			g.save();
			g.globalAlpha = Math.max(
				0.05,
				path.opacity === undefined ? 1 : path.opacity
			);
			g.strokeStyle = path.color;
			g.lineCap = 'round';
			g.lineJoin = 'round';
			g.lineWidth = Math.max( 1, path.size );
			g.beginPath();
			path.pts.forEach( ( p, i ) =>
				i ? g.lineTo( p.x, p.y ) : g.moveTo( p.x, p.y )
			);
			g.stroke();
			g.restore();
		},
		styles: { styleIsPlain: () => true, applyPaintStyle: () => {} },
		wet: null,
	};
}

export function makePainter( { kit: kitIn, createCanvas, surface, S } ) {
	const kit = kitIn && kitIn.drawStroke ? kitIn : plainKit();
	const W = surface.width;
	const H = surface.height;
	const sctx = surface.getContext( '2d' );
	const wetOK = !! (
		kit &&
		kit.wet &&
		kit.wet.available &&
		kit.wet.available()
	);
	const SC = ( kit && kit.wet && kit.wet.SC ) || 2;
	const isles = {}; // family → island
	const live = {}; // family → strokes in progress
	let scratchGrid = null;
	let ticks = 0;

	const familyOf = ( style ) =>
		( kit && kit.wet && kit.wet.FAMILY_OF[ style ] ) || null;

	function island( fam ) {
		if ( ! isles[ fam ] ) {
			const w = kit.wet;
			const isle =
				'liquid' === fam
					? w.createLiquid()
					: 'paste' === fam
					? w.createPaste()
					: w.createDry();
			if ( isle.setPaper ) {
				isle.setPaper(
					w.PAPERS[
						'paste' === fam
							? 'canvas'
							: 'liquid' === fam
							? 'cold-press'
							: 'laid'
					] || null
				);
			}
			isles[ fam ] = isle;
			live[ fam ] = 0;
		}
		return isles[ fam ];
	}

	// Regions: an island holds ONE rectangle of the sheet at a time, the
	// way the editor keeps its wet paint to the stroke. The whole sheet
	// would blow the cell cap, and a capped island answers with a coarse
	// grid - every dab a boulder (seen 02.09. in the first run against
	// the real core). A mark that lands outside the current region first
	// dries and bakes what is there; while another mark is still being
	// laid the region grows to hold both, up to a budget.
	const BUDGET = 600000; // px² of sheet an island may hold at once
	const PAD = 12;

	// rx/ry/rw/rh are GRID CELLS of SC px each; the island canvas is the
	// region at document resolution (rw*SC x rh*SC) and sits at rx*SC.
	function regionOf( isle ) {
		return {
			x: isle.rx * SC,
			y: isle.ry * SC,
			w: isle.rw * SC,
			h: isle.rh * SC,
		};
	}

	/** Make room for a rectangle of the sheet (px); false if it cannot. */
	function place( isle, fam, rect ) {
		const x = Math.max( 0, Math.floor( rect.x - PAD ) );
		const y = Math.max( 0, Math.floor( rect.y - PAD ) );
		const want = {
			x,
			y,
			w: Math.min( W, Math.ceil( rect.x + rect.w + PAD ) ) - x,
			h: Math.min( H, Math.ceil( rect.y + rect.h + PAD ) ) - y,
		};
		if ( want.w < 1 || want.h < 1 ) {
			return false;
		}
		if ( isle.hasRegion() ) {
			const r = regionOf( isle );
			if (
				want.x >= r.x &&
				want.y >= r.y &&
				want.x + want.w <= r.x + r.w &&
				want.y + want.h <= r.y + r.h
			) {
				return true;
			}
			const ux = Math.min( r.x, want.x );
			const uy = Math.min( r.y, want.y );
			const uw = Math.max( r.x + r.w, want.x + want.w ) - ux;
			const uh = Math.max( r.y + r.h, want.y + want.h ) - uy;
			if ( ! live[ fam ] || uw * uh > BUDGET ) {
				bake( fam );
			}
		}
		const sig = ( i ) => i.rx + ':' + i.ry + ':' + i.rw + ':' + i.rh;
		const before = isle.hasRegion() ? sig( isle ) : '';
		if ( ! isle.ensure( want ) ) {
			return false;
		}
		if ( before !== sig( isle ) ) {
			// A new or grown region: the island is blank and lost its
			// ground; it paints on nothing, over the sheet.
			if ( isle.setGround ) {
				isle.setGround( null );
			}
			isle.render();
		}
		return true;
	}

	// A media mask fills about half of its size box across the stroke, so
	// a mark asks for twice its hand width to land at the width it means.
	const tipMul = ( tip ) => ( String( tip ).includes( '-' ) ? 2.1 : 1.2 );

	/** Frame-unit hand points → pixel runs of near-constant width (a taper in steps). */
	function runs( pts, k = 5, mul = 1 ) {
		const px = pts.map( ( p ) => ( {
			x: p.x * S,
			y: p.y * S,
			w: Math.max( 1, ( p.w || 0.01 ) * S * mul ),
		} ) );
		const out = [];
		const per = Math.max( 2, Math.ceil( px.length / k ) );
		for ( let i = 0; i < px.length - 1; i += per - 1 ) {
			const slice = px.slice( i, Math.min( px.length, i + per ) );
			if ( slice.length < 2 ) {
				break;
			}
			const size = slice.reduce( ( a, p ) => a + p.w, 0 ) / slice.length;
			out.push( { pts: slice, size } );
		}
		return out;
	}

	function windowOf( pxPts, reach ) {
		let x0 = Infinity;
		let y0 = Infinity;
		let x1 = -Infinity;
		let y1 = -Infinity;
		for ( const p of pxPts ) {
			x0 = Math.min( x0, p.x );
			y0 = Math.min( y0, p.y );
			x1 = Math.max( x1, p.x );
			y1 = Math.max( y1, p.y );
		}
		const bx = Math.max( 0, Math.floor( x0 - reach ) );
		const by = Math.max( 0, Math.floor( y0 - reach ) );
		const bw = Math.min( W - bx, Math.ceil( x1 + reach ) - bx );
		const bh = Math.min( H - by, Math.ceil( y1 + reach ) - by );
		return { bx, by, bw, bh };
	}

	/* --------------------------------- CPU --------------------------------- */

	function prepCpu( cmd ) {
		const tips = kit.tips;
		const parts = runs(
			cmd.pts,
			cmd.taper === undefined ? 5 : cmd.taper,
			tipMul( cmd.tip )
		);
		if ( ! parts.length ) {
			return null;
		}
		const maxSize = Math.max( ...parts.map( ( r ) => r.size ) );
		const reach = tips.stampMaxReach( cmd.tip, maxSize, cmd ) + 4;
		const all = parts.flatMap( ( r ) => r.pts );
		const { bx, by, bw, bh } = windowOf( all, reach );
		if ( bw < 2 || bh < 2 ) {
			return null;
		}
		const scratch = createCanvas( bw, bh );
		const g = scratch.getContext( '2d' );
		g.translate( -bx, -by );
		for ( const r of parts ) {
			kit.drawStroke(
				g,
				{
					pts: r.pts,
					d:
						'M ' +
						r.pts.map( ( p ) => p.x + ' ' + p.y ).join( ' L ' ),
					color: cmd.color,
					size: r.size,
					opacity: cmd.opacity === undefined ? 1 : cmd.opacity,
					flow: cmd.flow === undefined ? 1 : cmd.flow,
					tip: cmd.tip,
					spacing: cmd.spacing,
					scatter: cmd.scatter,
					alphaJitter: cmd.alphaJitter,
					sizeJitter: cmd.sizeJitter,
					seedOffset: cmd.seed % 977,
				},
				cmd.hardness === undefined ? 85 : cmd.hardness
			);
		}
		// The styled window: the stroke as it will finally lie on the sheet.
		const styled = createCanvas( bw, bh );
		const stg = styled.getContext( '2d' );
		if ( kit.styles.styleIsPlain( cmd.style || 'normal' ) ) {
			stg.drawImage( surface, bx, by, bw, bh, 0, 0, bw, bh );
			stg.drawImage( scratch, 0, 0 );
		} else {
			const dst = sctx.getImageData( bx, by, bw, bh );
			kit.styles.applyPaintStyle( dst, g.getImageData( 0, 0, bw, bh ), {
				style: cmd.style,
				color: cmd.color,
				size: maxSize,
				originX: bx,
				originY: by,
				from: { x: all[ 0 ].x - bx, y: all[ 0 ].y - by },
				to: {
					x: all[ all.length - 1 ].x - bx,
					y: all[ all.length - 1 ].y - by,
				},
				points: all.map( ( p ) => ( { x: p.x - bx, y: p.y - by } ) ),
			} );
			stg.putImageData( dst, 0, 0 );
		}
		// A paint style may touch the whole window (a film, a lighting
		// pass); on the sheet only the stroke and its spread belong to
		// the mark, never the window's rectangle. Keep the window where
		// the stroke's alpha lies, dilated by the style's reach.
		{
			const d = Math.max( 2, reach * 0.6 );
			const maskC = createCanvas( bw, bh );
			const mg = maskC.getContext( '2d' );
			for ( let k = 0; k < 8; k++ ) {
				const a = ( k / 8 ) * Math.PI * 2;
				mg.drawImage( scratch, Math.cos( a ) * d, Math.sin( a ) * d );
			}
			mg.drawImage( scratch, 0, 0 );
			for ( let k = 0; k < 8; k++ ) {
				const a = ( k / 8 ) * Math.PI * 2 + Math.PI / 8;
				mg.drawImage(
					scratch,
					Math.cos( a ) * d * 0.5,
					Math.sin( a ) * d * 0.5
				);
			}
			stg.globalCompositeOperation = 'destination-in';
			stg.drawImage( maskC, 0, 0 );
			stg.globalCompositeOperation = 'source-over';
		}
		// Reveal along the path: circles around the points of each chunk.
		const n = Math.min( 24, Math.max( 1, Math.floor( all.length / 2 ) ) );
		const per = Math.ceil( all.length / n );
		const draw = ( ctx, i ) => {
			const from = i * per;
			const to = Math.min( all.length, from + per + 1 );
			ctx.save();
			ctx.beginPath();
			for ( let k = from; k < to; k++ ) {
				const p = all[ k ];
				ctx.moveTo( p.x + p.w, p.y );
				ctx.arc(
					p.x,
					p.y,
					Math.max( 2, p.w * 0.9 + reach * 0.35 ),
					0,
					Math.PI * 2
				);
			}
			ctx.clip();
			ctx.globalCompositeOperation = 'source-over';
			ctx.globalAlpha = 1;
			ctx.drawImage( styled, bx, by );
			ctx.restore();
		};
		return { steps: n, draw, bounds: cmd.pts };
	}

	/* --------------------------------- WET --------------------------------- */

	function stampSeg( isle, fam, a, b, stroke ) {
		const reach =
			kit.tips.stampMaxReach( stroke.tip, stroke.size, stroke ) + 2;
		const x0 = Math.min( a.x, b.x ) - reach;
		const y0 = Math.min( a.y, b.y ) - reach;
		const x1 = Math.max( a.x, b.x ) + reach;
		const y1 = Math.max( a.y, b.y ) + reach;
		if ( ! place( isle, fam, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } ) ) {
			return;
		}
		const gx = Math.floor( x0 / SC );
		const gy = Math.floor( y0 / SC );
		const gw = Math.ceil( ( x1 - x0 ) / SC ) + 1;
		const gh = Math.ceil( ( y1 - y0 ) / SC ) + 1;
		if ( ! scratchGrid ) {
			scratchGrid = createCanvas( 64, 64 );
		}
		if ( scratchGrid.width < gw || scratchGrid.height < gh ) {
			scratchGrid.width = Math.max( scratchGrid.width, gw );
			scratchGrid.height = Math.max( scratchGrid.height, gh );
		}
		const ctx = scratchGrid.getContext( '2d', {
			willReadFrequently: true,
		} );
		ctx.setTransform( 1, 0, 0, 1, 0, 0 );
		ctx.clearRect( 0, 0, gw, gh );
		ctx.setTransform( 1 / SC, 0, 0, 1 / SC, -gx, -gy );
		if ( 'paste' === fam ) {
			const dl = Math.hypot( b.x - a.x, b.y - a.y );
			isle.setParams(
				dl > 0.5
					? { advX: ( b.x - a.x ) / dl, advY: ( b.y - a.y ) / dl }
					: { advX: 0, advY: 0 }
			);
		}
		kit.drawStroke(
			ctx,
			{
				d: `M ${ a.x } ${ a.y } L ${ b.x } ${ b.y }`,
				pts: [ a, b ],
				color: '#000000',
				size: stroke.size,
				opacity: 1,
				flow: 1,
				tip: stroke.tip,
				spacing: stroke.spacing,
				scatter: stroke.scatter,
			},
			stroke.hardness
		);
		const img = ctx.getImageData( 0, 0, gw, gh );
		const alpha = new Float32Array( gw * gh );
		for ( let i = 0; i < gw * gh; i++ ) {
			alpha[ i ] = img.data[ i * 4 + 3 ] / 255;
		}
		isle.stamp( { data: alpha, w: gw, h: gh, gx, gy }, stroke );
	}

	// Wet paint is for marks at hand scale. A school's broad opening
	// sweep (a thousand pixels wide) is an underpainting, not a wet
	// stroke: it would swamp an island's region and its physics, so it
	// takes the CPU road with the same medium's look.
	const WET_MAX_WIDTH = 160; // px

	function prepWet( cmd ) {
		const style = cmd.style;
		const fam = familyOf( style );
		if ( ! wetOK || ! fam ) {
			return prepCpu( cmd );
		}
		const widest = Math.max(
			...cmd.pts.map( ( p ) => ( p.w || 0.01 ) * S * tipMul( cmd.tip ) )
		);
		if ( widest > WET_MAX_WIDTH ) {
			return prepCpu( cmd );
		}
		const isle = island( fam );
		if ( ! isle ) {
			return prepCpu( cmd );
		}
		const w = kit.wet;
		const preset = w.WET_STYLES[ style ];
		const tune = w.tuned( style, {} );
		const flow = cmd.flow === undefined ? 1 : cmd.flow;
		const opac = cmd.opacity === undefined ? 1 : cmd.opacity;
		const mul = tipMul( cmd.tip );
		const px = cmd.pts.map( ( p ) => ( {
			x: p.x * S,
			y: p.y * S,
			w: Math.max( 1, ( p.w || 0.01 ) * S * mul ),
		} ) );
		// Drop segments too short to matter; keep the shape.
		const pts = [ px[ 0 ] ];
		for ( let i = 1; i < px.length; i++ ) {
			const l = pts[ pts.length - 1 ];
			if (
				Math.hypot( px[ i ].x - l.x, px[ i ].y - l.y ) >= SEG_MIN ||
				i === px.length - 1
			) {
				pts.push( px[ i ] );
			}
		}
		if ( pts.length < 2 ) {
			return null;
		}
		const stroke = {
			family: fam,
			press: 1,
			tilt: 0,
			tip: cmd.tip,
			size: pts[ 0 ].w,
			hardness: cmd.hardness === undefined ? 85 : cmd.hardness,
			spacing: cmd.spacing,
			scatter: cmd.scatter,
			docW: W,
			docH: H,
			gran: tune.gran,
		};
		if ( 'liquid' === fam ) {
			stroke.water =
				( preset.water[ 0 ] + preset.water[ 1 ] * flow ) *
				tune.waterMul;
			stroke.pigment = preset.pigment * opac * tune.pigMul;
			Object.assign(
				stroke,
				w.pigmentOf( cmd.color, tune.sBase, preset.kMul )
			);
		} else if ( 'paste' === fam ) {
			stroke.water =
				( preset.thick[ 0 ] + preset.thick[ 1 ] * flow ) *
				tune.waterMul;
			stroke.pigment = preset.pigRate * opac;
			Object.assign(
				stroke,
				w.pigmentOf( cmd.color, tune.sBase, preset.kMul )
			);
		} else {
			stroke.water = 0;
			stroke.pigment = preset.amt * opac * tune.pigMul;
			Object.assign( stroke, w.pigmentOf( cmd.color, 0, preset.kMul ) );
		}
		const params =
			'liquid' === fam
				? {
						evapK: tune.evapK,
						sogK: tune.sogK,
						korn: tune.korn,
						depK: tune.depK,
						liftK: tune.liftK,
						viscK: tune.visc,
						seedK: 0,
				  }
				: 'paste' === fam
				? {
						openK: tune.openK,
						blendK: tune.blendK,
						body: preset.body,
						gloss: preset.gloss,
						korn: tune.korn,
						pickK: tune.pickK ?? 0,
						advK: tune.advK ?? 0,
				  }
				: { tooth: tune.tooth };
		const n = pts.length - 1;
		let begun = false;
		const reachAll =
			kit.tips.stampMaxReach(
				stroke.tip,
				Math.max( ...pts.map( ( p ) => p.w ) ),
				stroke
			) + 2;
		const xs = pts.map( ( p ) => p.x );
		const ys = pts.map( ( p ) => p.y );
		const box = {
			x: Math.min( ...xs ) - reachAll,
			y: Math.min( ...ys ) - reachAll,
			w: Math.max( ...xs ) - Math.min( ...xs ) + 2 * reachAll,
			h: Math.max( ...ys ) - Math.min( ...ys ) + 2 * reachAll,
		};
		if ( box.w * box.h > BUDGET ) {
			// A long sweep across the sheet: too big for one region.
			return prepCpu( cmd );
		}
		const draw = ( ctx, i ) => {
			if ( ! begun ) {
				begun = true;
				if ( ! place( isle, fam, box ) ) {
					return;
				}
				live[ fam ]++;
				isle.setParams( params );
				if ( isle.strokeBegin ) {
					isle.strokeBegin();
				}
			}
			const a = pts[ i ];
			const b = pts[ i + 1 ];
			stroke.size = ( a.w + b.w ) / 2;
			stampSeg( isle, fam, a, b, stroke );
			if ( i === n - 1 ) {
				if ( isle.strokeEnd ) {
					isle.strokeEnd();
				}
				if ( 'paste' === fam ) {
					// The knife has lifted: open paint stops being dragged
					// along the last segment. Left set, thousands of steps
					// smear every dab into a sliver (probe 02.09.).
					isle.setParams( { advX: 0, advY: 0 } );
				}
				live[ fam ] = Math.max( 0, live[ fam ] - 1 );
			}
		};
		return { steps: n, draw, bounds: cmd.pts, wet: fam };
	}

	/** Time passes: the islands flow, dry, and bake into the surface. */
	function tick( dtMs, speed = 1 ) {
		ticks++;
		for ( const fam in isles ) {
			const isle = isles[ fam ];
			if ( ! isle.hasRegion() || isle.lost ) {
				continue;
			}
			if ( isle.wet > 0 ) {
				let sub =
					Math.max( 1, Math.round( Math.min( 60, dtMs ) / 5.5 ) ) * 2;
				sub = Math.round( sub * speed );
				if ( ! live[ fam ] ) {
					sub *= 3;
				}
				// The editor allows 96 steps a frame for ONE stroke under
				// the hand; here a dozen marks may be wet at once, so the
				// budget per island stays lower and drying takes a little
				// longer instead of the frame.
				isle.steps( Math.min( sub, 48 ) );
				isle.render();
				if ( 0 === ticks % 10 ) {
					isle.checkWet();
				}
			}
			if ( isle.wet < 1 && ! live[ fam ] && isle.painted !== false ) {
				bake( fam );
			}
		}
	}

	function bake( fam ) {
		const isle = isles[ fam ];
		if ( ! isle || ! isle.hasRegion() ) {
			return;
		}
		isle.dryAll();
		isle.render();
		sctx.save();
		sctx.globalCompositeOperation = 'source-over';
		sctx.globalAlpha = 1;
		// The island canvas is its region at sheet resolution, at rx*SC.
		sctx.drawImage( isle.canvas, isle.rx * SC, isle.ry * SC );
		sctx.restore();
		isle.reset();
	}

	/** Everything wet, dried and baked now (a still, an insert). */
	function settle() {
		for ( const fam in isles ) {
			if ( isles[ fam ].hasRegion() ) {
				bake( fam );
			}
		}
	}

	/** Draw the living islands over a rendered copy of the surface. */
	function overlays( g, scaleX, scaleY ) {
		for ( const fam in isles ) {
			const isle = isles[ fam ];
			if ( isle.hasRegion() && ! isle.lost ) {
				g.drawImage(
					isle.canvas,
					isle.rx * SC * scaleX,
					isle.ry * SC * scaleY,
					isle.canvas.width * scaleX,
					isle.canvas.height * scaleY
				);
			}
		}
	}

	function dispose() {
		for ( const fam in isles ) {
			try {
				isles[ fam ].reset();
				if ( isles[ fam ].dispose ) {
					isles[ fam ].dispose();
				}
			} catch ( e ) {}
		}
	}

	return {
		wetOK,
		prepare( cmd ) {
			if ( ! kit ) {
				return null;
			}
			return cmd.wet ? prepWet( cmd ) : prepCpu( cmd );
		},
		tick,
		settle,
		overlays,
		dispose,
		hasWet: () =>
			Object.keys( isles ).some( ( f ) => isles[ f ].hasRegion() ),
	};
}
