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

// BROAD STROKES. The style pass of the editor's engine (pigment mixing,
// bleed, drying edge, grain, relief) is JavaScript per pixel. A sweep
// across the sheet - an opening underpainting, a glaze over a mass - is a
// window of one to three megapixels, and measured (23.09.) it held the
// dialog for 0.4 to 1.6 seconds at a time; Classicism piled seven seconds
// of it into its first six. From BROAD_AREA on, a stroke is laid at a
// working resolution of at most BROAD_TARGET pixels (between a half and a
// quarter of the sheet's) and laid over the picture at full resolution by
// how much of the picture it lets through: what shows beneath a glaze
// stays as sharp as it was, the broad stroke itself gets a little softer
// - which a wash that size is anyway.
export const BROAD_AREA = 350000; // px² of window
export const BROAD_TARGET = 180000; // px² the style pass may work on
const BROAD_MIN_K = 0.25;
const BROAD_MAX_K = 0.5;

/** The working scale of a broad window: at most half, at least a quarter. */
export const broadScale = ( area ) =>
	Math.max(
		BROAD_MIN_K,
		Math.min( BROAD_MAX_K, Math.sqrt( BROAD_TARGET / Math.max( 1, area ) ) )
	);

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

// The core's own names, spelled the way the core spells them. A sweep to
// American spelling (03.09.2026) turned the colour key and the watercolour
// style into 'color' and 'watercolor' here; the core never followed, so
// for six weeks every stroke on the CPU road lost its colour (the core
// fell back to black) and every watercolour lost its water. Chaos Art
// speaks American; this boundary translates, and tests/core-names.test.js
// keeps it honest against the core's own list.
export const CORE_STYLE = { watercolor: 'watercolour' };
export const coreStyle = ( id ) => CORE_STYLE[ id ] || id;

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

	/** The stroke's runs laid with the media brush into `g` (already transformed). */
	function layStroke( g, cmd, parts ) {
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
	}

	/** The stroke's own alpha, spread by `d` px: where it may touch the sheet. */
	function dilatedMask( scratch, w, h, d ) {
		const maskC = createCanvas( w, h );
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
		return maskC;
	}

	/** Reveal along the path: circles around the points of each chunk. */
	function revealer( all, reach, bx, by, styledOf ) {
		const n = Math.min( 24, Math.max( 1, Math.floor( all.length / 2 ) ) );
		const per = Math.ceil( all.length / n );
		const draw = ( ctx, i ) => {
			const styled = styledOf();
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
		return { n, draw };
	}

	/**
	 * A broad stroke, styled at working resolution, laid over the picture at
	 * full resolution.
	 *
	 * The style runs on a small copy of what lies under the stroke. Per
	 * pixel it then says how much of the ground still shows through: the
	 * share of the way from the ground to the paint's own color that the
	 * result has gone, read on the channel where the two differ most (the
	 * stroke's own coverage where they hardly differ). Up at full size the
	 * picture is laid over the styled result by exactly that share - an
	 * opaque stroke covers the detail beneath, a glaze lets it through,
	 * veiled as a glaze veils. A first version carried only the change up
	 * and let every detail through, opaque oil included (seen 23.09.).
	 *
	 *   result = up( S - T x U ) + T_up x picture,  T = 1 - share
	 *
	 * done with the canvas: multiply by T, then add and subtract the rest
	 * (invert, add, invert back), eight bits each, exact.
	 */
	function styleBroad( cmd, parts, all, maxSize, reach, win ) {
		const { bx, by, bw, bh } = win;
		const k = broadScale( bw * bh );
		const sw = Math.max( 2, Math.round( bw * k ) );
		const sh = Math.max( 2, Math.round( bh * k ) );
		const kx = sw / bw;
		const ky = sh / bh;
		const scratch = createCanvas( sw, sh );
		const g = scratch.getContext( '2d' );
		g.setTransform( kx, 0, 0, ky, -bx * kx, -by * ky );
		layStroke( g, cmd, parts );
		g.setTransform( 1, 0, 0, 1, 0, 0 );
		const stroke = g.getImageData( 0, 0, sw, sh );
		// What lies under the stroke, at the working scale.
		const under = createCanvas( sw, sh );
		const ug = under.getContext( '2d' );
		ug.imageSmoothingEnabled = true;
		ug.imageSmoothingQuality = 'high';
		ug.drawImage( surface, bx, by, bw, bh, 0, 0, sw, sh );
		const base = ug.getImageData( 0, 0, sw, sh );
		const dst = ug.getImageData( 0, 0, sw, sh );
		kit.styles.applyPaintStyle( dst, stroke, {
			style: cmd.style,
			// 'colour': the core's key (see CORE_STYLE above).
			colour: cmd.color,
			size: maxSize * k,
			originX: Math.round( bx * kx ),
			originY: Math.round( by * ky ),
			from: { x: ( all[ 0 ].x - bx ) * kx, y: ( all[ 0 ].y - by ) * ky },
			to: {
				x: ( all[ all.length - 1 ].x - bx ) * kx,
				y: ( all[ all.length - 1 ].y - by ) * ky,
			},
			points: all.map( ( p ) => ( {
				x: ( p.x - bx ) * kx,
				y: ( p.y - by ) * ky,
			} ) ),
		} );
		const paint = [ 1, 3, 5 ].map( ( i ) =>
			parseInt( String( cmd.color || '#000000' ).slice( i, i + 2 ), 16 )
		);
		const opacity = cmd.opacity === undefined ? 1 : cmd.opacity;
		const through = ug.createImageData( sw, sh ); // T, as grey
		const add = ug.createImageData( sw, sh ); // the rest, above zero
		const take = ug.createImageData( sw, sh ); // the rest, below zero
		const u = base.data;
		const r = dst.data;
		const a0 = stroke.data;
		for ( let i = 0; i < u.length; i += 4 ) {
			let c0 = 0;
			let far = 0;
			for ( let c = 0; c < 3; c++ ) {
				const d = paint[ c ] - u[ i + c ];
				if ( Math.abs( d ) > Math.abs( far ) ) {
					far = d;
					c0 = c;
				}
			}
			const share =
				Math.abs( far ) >= 24
					? Math.min(
							1,
							Math.max( 0, ( r[ i + c0 ] - u[ i + c0 ] ) / far )
					  )
					: ( a0[ i + 3 ] / 255 ) * opacity;
			const t = 1 - share;
			const tv = Math.round( t * 255 );
			through.data[ i ] = tv;
			through.data[ i + 1 ] = tv;
			through.data[ i + 2 ] = tv;
			through.data[ i + 3 ] = 255;
			for ( let c = 0; c < 3; c++ ) {
				const rest = r[ i + c ] - ( tv / 255 ) * u[ i + c ];
				if ( rest > 0 ) {
					add.data[ i + c ] = Math.round( rest );
				} else if ( rest < 0 ) {
					take.data[ i + c ] = Math.round( -rest );
				}
			}
			add.data[ i + 3 ] = 255;
			take.data[ i + 3 ] = 255;
		}
		const canvasOf = ( img ) => {
			const c = createCanvas( sw, sh );
			c.getContext( '2d' ).putImageData( img, 0, 0 );
			return c;
		};
		const throughC = canvasOf( through );
		const addC = canvasOf( add );
		const takeC = canvasOf( take );
		// The full-resolution picture under the stroke, shown through by T.
		const styled = createCanvas( bw, bh );
		const stg = styled.getContext( '2d' );
		stg.drawImage( surface, bx, by, bw, bh, 0, 0, bw, bh );
		stg.imageSmoothingEnabled = true;
		stg.globalCompositeOperation = 'multiply';
		stg.drawImage( throughC, 0, 0, bw, bh );
		stg.fillStyle = '#ffffff';
		stg.globalCompositeOperation = 'difference';
		stg.fillRect( 0, 0, bw, bh );
		stg.globalCompositeOperation = 'lighter';
		stg.drawImage( takeC, 0, 0, bw, bh );
		stg.globalCompositeOperation = 'difference';
		stg.fillRect( 0, 0, bw, bh );
		stg.globalCompositeOperation = 'lighter';
		stg.drawImage( addC, 0, 0, bw, bh );
		// Only where the stroke and its spread lie, as on the small road.
		stg.globalCompositeOperation = 'destination-in';
		stg.drawImage(
			dilatedMask( scratch, sw, sh, Math.max( 1, reach * 0.6 * k ) ),
			0,
			0,
			bw,
			bh
		);
		stg.globalCompositeOperation = 'source-over';
		return styled;
	}

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
		const win = windowOf( all, reach );
		const { bx, by, bw, bh } = win;
		if ( bw < 2 || bh < 2 ) {
			return null;
		}
		if (
			bw * bh >= BROAD_AREA &&
			! kit.styles.styleIsPlain( cmd.style || 'normal' ) &&
			'metal-leaf' !== cmd.style
		) {
			// Styled when it is first needed: at once on the proof sheets,
			// one at a time between frames in the dialog (stage.js).
			let styled = null;
			const run = () => {
				if ( ! styled ) {
					styled = styleBroad( cmd, parts, all, maxSize, reach, win );
				}
				return styled;
			};
			const { n, draw } = revealer( all, reach, bx, by, run );
			return {
				steps: n,
				draw,
				bounds: cmd.pts,
				heavy: true,
				run,
				ready: () => !! styled,
			};
		}
		const scratch = createCanvas( bw, bh );
		const g = scratch.getContext( '2d' );
		g.translate( -bx, -by );
		layStroke( g, cmd, parts );
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
				// 'colour': the core's key (see CORE_STYLE above).
				colour: cmd.color,
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
		stg.globalCompositeOperation = 'destination-in';
		stg.drawImage(
			dilatedMask( scratch, bw, bh, Math.max( 2, reach * 0.6 ) ),
			0,
			0
		);
		stg.globalCompositeOperation = 'source-over';
		const { n, draw } = revealer( all, reach, bx, by, () => styled );
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
		prepare( cmdIn ) {
			if ( ! kit ) {
				return null;
			}
			// The style by the core's own name (CORE_STYLE).
			const cmd =
				cmdIn.style && CORE_STYLE[ cmdIn.style ]
					? { ...cmdIn, style: coreStyle( cmdIn.style ) }
					: cmdIn;
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
