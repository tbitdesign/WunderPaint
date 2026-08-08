/**
 * The drawing surface.
 *
 * The guide lines here are not decoration: they are the ascender, cap
 * height, x-height, baseline and descender that will be written into
 * the font file, at the exact heights they will have. Getting those
 * right while drawing is the whole difference between a font and a
 * collection of pictures of letters, and it cannot be fixed afterwards
 * without redrawing.
 *
 * The neighbouring letters stand faintly on either side for the same
 * reason. A letter drawn alone is drawn at the wrong size; a letter
 * drawn between its neighbours is not.
 */

import { finishStroke, halfWidthAt } from '../core/strokes.js';
import { contoursToPath, fitCanvas, themeColor, outlineOpts } from './paint.js';
import { placeGlyph } from '../core/metrics.js';
import { sideFor } from '../core/build.js';

/** How much air is shown above the ascender and below the descender. */
const PAD = 0.16;

export class DrawSurface {
	/**
	 * @param {HTMLCanvasElement} canvas Target canvas.
	 * @param {Object}            opts   `{ project, cache, onChange }`.
	 */
	constructor( canvas, opts ) {
		this.canvas = canvas;
		this.project = opts.project;
		this.cache = opts.cache;
		this.t = opts.t || ( ( x ) => x );
		this.onChange = opts.onChange || ( () => {} );
		this.key = null;
		this.neighbours = { prev: null, next: null };
		this.ghost = null;
		this.model = null;
		this.live = null;
		this.erasing = false;
		this.bind();
	}

	bind() {
		const c = this.canvas;
		c.style.touchAction = 'none';
		this.onDown = ( e ) => this.pointerDown( e );
		this.onMove = ( e ) => this.pointerMove( e );
		this.onUp = ( e ) => this.pointerUp( e );
		c.addEventListener( 'pointerdown', this.onDown );
		c.addEventListener( 'pointermove', this.onMove );
		c.addEventListener( 'pointerup', this.onUp );
		c.addEventListener( 'pointercancel', this.onUp );
		// Deliberately no pointerleave: capturing the pointer on the
		// element it is already over makes the browser fire leave at that
		// element straight away, which would end every stroke on the
		// first pixel. Capture guarantees an up or a cancel instead.
		this.observer =
			'undefined' !== typeof ResizeObserver
				? new ResizeObserver( () => this.render() )
				: null;
		if ( this.observer ) {
			this.observer.observe( c );
		}
	}

	destroy() {
		const c = this.canvas;
		c.removeEventListener( 'pointerdown', this.onDown );
		c.removeEventListener( 'pointermove', this.onMove );
		c.removeEventListener( 'pointerup', this.onUp );
		c.removeEventListener( 'pointercancel', this.onUp );
		if ( this.observer ) {
			this.observer.disconnect();
		}
	}

	/**
	 * Point the surface at a different character.
	 *
	 * @param {string} key        Drawable key.
	 * @param {Object} neighbours `{ prev, next }` keys drawn faintly beside.
	 * @param {string} ghost      A letter shown behind, used when drawing an
	 *                            accent so it is placed and sized against a
	 *                            real letter rather than against nothing.
	 */
	setKey( key, neighbours, ghost ) {
		this.key = key;
		this.neighbours = neighbours || { prev: null, next: null };
		this.ghost = ghost || null;
		this.live = null;
		this.render();
	}

	setErasing( on ) {
		this.erasing = !! on;
		this.canvas.style.cursor = on ? 'crosshair' : 'default';
	}

	/** The glyph being drawn, created on first ink. */
	glyph( create ) {
		const g = this.project.glyphs[ this.key ];
		if ( g || ! create ) {
			return g || null;
		}
		const fresh = { src: 'draw', strokes: [], rev: 0 };
		this.project.glyphs[ this.key ] = fresh;
		return fresh;
	}

	/* ------------------------------ geometry ----------------------------- */

	view() {
		const m = this.project.metrics;
		const rect = this.canvas.getBoundingClientRect();
		const pad = m.unitsPerEm * PAD;
		const top = m.ascender + pad;
		const bottom = m.descender - pad;
		const scale = Math.max( 0.01, rect.height / ( top - bottom ) );
		const originX = ( rect.width - m.unitsPerEm * scale ) / 2;
		return { scale, originX, top, bottom, w: rect.width, h: rect.height };
	}

	toUnits( e ) {
		const v = this.view();
		const rect = this.canvas.getBoundingClientRect();
		return {
			x: ( e.clientX - rect.left - v.originX ) / v.scale,
			y: v.top - ( e.clientY - rect.top ) / v.scale,
		};
	}

	/* ------------------------------ pointers ----------------------------- */

	pressureOf( e ) {
		if ( 'pen' === e.pointerType && e.pressure > 0 ) {
			return e.pressure;
		}
		return 0.5;
	}

	pointerDown( e ) {
		if ( ! this.key || 0 !== e.button ) {
			return;
		}
		e.preventDefault();
		if ( this.erasing ) {
			this.eraseAt( this.toUnits( e ) );
			return;
		}
		const p = this.toUnits( e );
		this.live = [ { ...p, p: this.pressureOf( e ) } ];
		try {
			this.canvas.setPointerCapture( e.pointerId );
		} catch ( err ) {
			// Capture is a convenience; the stroke works without it.
		}
		this.render();
	}

	pointerMove( e ) {
		if ( ! this.live ) {
			return;
		}
		e.preventDefault();
		const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [ e ];
		for ( const ev of events.length ? events : [ e ] ) {
			const p = this.toUnits( ev );
			this.live.push( { ...p, p: this.pressureOf( ev ) } );
		}
		this.render();
	}

	pointerUp( e ) {
		if ( ! this.live ) {
			return;
		}
		if ( this.canvas.hasPointerCapture && this.canvas.hasPointerCapture( e.pointerId ) ) {
			this.canvas.releasePointerCapture( e.pointerId );
		}
		const o = this.project.options;
		const stroke = finishStroke( this.live, { smoothing: o.smoothing, width: o.pen } );
		this.live = null;
		if ( stroke && stroke.pts.length ) {
			const g = this.glyph( true );
			g.strokes.push( stroke );
			g.rev = ( g.rev || 0 ) + 1;
			this.onChange( this.key );
		}
		this.render();
	}

	/** Remove the stroke nearest the point, if the point is on one. */
	eraseAt( pt ) {
		const g = this.glyph( false );
		if ( ! g || ! g.strokes.length ) {
			return;
		}
		let best = -1;
		let bestD = Infinity;
		g.strokes.forEach( ( st, i ) => {
			for ( const p of st.pts ) {
				const d = Math.hypot( p.x - pt.x, p.y - pt.y ) - halfWidthAt( st.w, p.p );
				if ( d < bestD ) {
					bestD = d;
					best = i;
				}
			}
		} );
		if ( best >= 0 && bestD < this.project.options.pen ) {
			g.strokes.splice( best, 1 );
			g.rev = ( g.rev || 0 ) + 1;
			this.afterEdit();
		}
	}

	undo() {
		const g = this.glyph( false );
		if ( ! g || ! g.strokes.length ) {
			return;
		}
		g.strokes.pop();
		g.rev = ( g.rev || 0 ) + 1;
		this.afterEdit();
	}

	clear() {
		const g = this.glyph( false );
		if ( ! g ) {
			return;
		}
		g.strokes = [];
		g.rev = ( g.rev || 0 ) + 1;
		this.afterEdit();
	}

	afterEdit() {
		const g = this.glyph( false );
		if ( g && ( ! g.strokes || ! g.strokes.length ) ) {
			delete this.project.glyphs[ this.key ];
		}
		this.cache.drop( this.key );
		this.onChange( this.key );
		this.render();
	}

	/* ------------------------------ painting ----------------------------- */

	render() {
		const { ctx, dpr } = fitCanvas( this.canvas );
		const v = this.view();
		const m = this.project.metrics;
		ctx.scale( dpr, dpr );

		const line = themeColor( '--ed-border', '#3a3f47' );
		const strong = themeColor( '--ed-accent', '#4c8dff' );
		const ink = themeColor( '--ed-text', '#e8eaee' );
		const faint = themeColor( '--ed-text-dim', '#7b828c' );

		const toY = ( u ) => ( v.top - u ) * v.scale;
		const toX = ( u ) => v.originX + u * v.scale;

		ctx.save();
		ctx.lineWidth = 1;
		const guides = [
			[ m.ascender, line, this.t( 'Ascender' ) ],
			[ m.capHeight, line, this.t( 'Cap' ) ],
			[ m.xHeight, line, this.t( 'x-height' ) ],
			[ 0, strong, this.t( 'Baseline' ) ],
			[ m.descender, line, this.t( 'Descender' ) ],
		];
		ctx.font = '10px system-ui, sans-serif';
		ctx.textBaseline = 'bottom';
		for ( const [ u, color, label ] of guides ) {
			const y = Math.round( toY( u ) ) + 0.5;
			ctx.strokeStyle = color;
			ctx.globalAlpha = 0 === u ? 0.9 : 0.42;
			ctx.beginPath();
			ctx.moveTo( 0, y );
			ctx.lineTo( v.w, y );
			ctx.stroke();
			ctx.globalAlpha = 0.55;
			ctx.fillStyle = faint;
			ctx.fillText( label, 4, y - 2 );
		}
		ctx.globalAlpha = 1;

		// The em box, so the letter has something to be sized against.
		ctx.strokeStyle = line;
		ctx.globalAlpha = 0.3;
		ctx.setLineDash( [ 4, 4 ] );
		ctx.beginPath();
		ctx.moveTo( Math.round( toX( 0 ) ) + 0.5, 0 );
		ctx.lineTo( Math.round( toX( 0 ) ) + 0.5, v.h );
		ctx.moveTo( Math.round( toX( m.unitsPerEm ) ) + 0.5, 0 );
		ctx.lineTo( Math.round( toX( m.unitsPerEm ) ) + 0.5, v.h );
		ctx.stroke();
		ctx.setLineDash( [] );
		ctx.globalAlpha = 1;
		ctx.restore();

		if ( this.project.options.cursive ) {
			this.paintJoinMarks( ctx, v, toX, toY, strong );
		}

		if ( this.model ) {
			this.paintModel( ctx, v, toX, toY, faint );
		}
		this.paintNeighbours( ctx, v, toX, toY, faint );
		if ( this.ghost ) {
			this.paintGhost( ctx, v, faint );
		}

		const g = this.glyph( false );
		if ( g && g.strokes.length ) {
			const contours = this.cache.get( this.key, g, outlineOpts( this.project ) );
			ctx.save();
			ctx.translate( v.originX, v.top * v.scale );
			ctx.scale( v.scale, -v.scale );
			ctx.fillStyle = ink;
			ctx.fill( contoursToPath( contours ), 'nonzero' );
			ctx.restore();
		}

		if ( this.live && this.live.length ) {
			this.paintLive( ctx, v, toX, toY, ink );
		}
	}

	/**
	 * The stroke under the cursor, drawn the fast way while it moves.
	 *
	 * A round pen is a thick line with round ends, which the canvas draws
	 * in one call. A chisel nib is not, so it is stamped: an ellipse at
	 * every sample, which the pointer supplies densely enough that they
	 * merge. The committed stroke goes through the real rasteriser either
	 * way; this only has to keep up with the hand.
	 */
	paintLive( ctx, v, toX, toY, ink ) {
		const o = this.project.options;
		const nib = o.nib || {};
		const ratio = Math.max( 0.08, Math.min( 1, nib.ratio ?? 1 ) );
		const pts = this.live;
		ctx.save();
		ctx.fillStyle = ink;
		ctx.strokeStyle = ink;

		if ( ratio > 0.995 ) {
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			if ( 1 === pts.length ) {
				ctx.beginPath();
				ctx.arc(
					toX( pts[ 0 ].x ),
					toY( pts[ 0 ].y ),
					halfWidthAt( o.pen, pts[ 0 ].p, o.influence ) * v.scale,
					0,
					Math.PI * 2
				);
				ctx.fill();
			}
			for ( let i = 1; i < pts.length; i++ ) {
				const a = pts[ i - 1 ];
				const b = pts[ i ];
				ctx.lineWidth =
					( halfWidthAt( o.pen, a.p, o.influence ) + halfWidthAt( o.pen, b.p, o.influence ) ) * v.scale;
				ctx.beginPath();
				ctx.moveTo( toX( a.x ), toY( a.y ) );
				ctx.lineTo( toX( b.x ), toY( b.y ) );
				ctx.stroke();
			}
			ctx.restore();
			return;
		}

		// The canvas has y pointing down, so the nib leans the other way.
		const tilt = ( -( nib.angle || 0 ) * Math.PI ) / 180;
		for ( const p of pts ) {
			const r = halfWidthAt( o.pen, p.p, o.influence ) * v.scale;
			ctx.beginPath();
			ctx.ellipse( toX( p.x ), toY( p.y ), r, r * ratio, tilt, 0, Math.PI * 2 );
			ctx.fill();
		}
		ctx.restore();
	}

	/** Where a joining hand should enter and leave the letter. */
	paintJoinMarks( ctx, v, toX, toY, color ) {
		const m = this.project.metrics;
		const y = toY( m.xHeight * 0.25 );
		ctx.save();
		ctx.strokeStyle = color;
		ctx.globalAlpha = 0.65;
		ctx.setLineDash( [ 3, 3 ] );
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo( 0, Math.round( y ) + 0.5 );
		ctx.lineTo( v.w, Math.round( y ) + 0.5 );
		ctx.stroke();
		ctx.setLineDash( [] );
		ctx.fillStyle = color;
		ctx.globalAlpha = 0.85;
		ctx.font = '10px system-ui, sans-serif';
		ctx.textBaseline = 'bottom';
		ctx.fillText( this.t( 'Join here' ), toX( 0 ) + 9, y - 4 );
		ctx.globalAlpha = 0.65;
		for ( const x of [ toX( 0 ), toX( m.unitsPerEm ) ] ) {
			ctx.beginPath();
			ctx.moveTo( x - 5, y - 5 );
			ctx.lineTo( x + 5, y );
			ctx.lineTo( x - 5, y + 5 );
			ctx.closePath();
			ctx.fill();
		}
		ctx.restore();
	}

	/** Trace over this family instead of drawing from memory. */
	setModel( family ) {
		this.model = family || null;
		this.render();
	}

	/**
	 * The same letter from an existing font, laid faintly underneath.
	 *
	 * Drawing a letter from memory and drawing over one are very
	 * different tasks, and only the second is available to most people.
	 * The model is scaled by measuring it rather than by guessing: a
	 * capital is matched to the cap height and a lowercase letter to the
	 * x-height, so what is underneath really is the size the letter
	 * should be.
	 */
	paintModel( ctx, v, toX, toY, color ) {
		const key = this.key;
		if ( ! key || key.length !== 1 || ! /\S/.test( key ) ) {
			return;
		}
		const m = this.project.metrics;
		const isUpper = key === key.toUpperCase() && key !== key.toLowerCase();
		const gauge = isUpper ? 'H' : 'x';
		const want = isUpper ? m.capHeight : m.xHeight;
		ctx.save();
		ctx.font = `100px "${ this.model }", serif`;
		const probe = ctx.measureText( gauge );
		const unit = probe.actualBoundingBoxAscent || 70;
		const size = ( want * v.scale * 100 ) / unit;
		ctx.font = `${ size }px "${ this.model }", serif`;
		const width = ctx.measureText( key ).width;
		ctx.globalAlpha = 0.16;
		ctx.fillStyle = color;
		ctx.textBaseline = 'alphabetic';
		ctx.fillText(
			key,
			v.originX + ( m.unitsPerEm * v.scale - width ) / 2,
			toY( 0 )
		);
		ctx.restore();
	}

	/**
	 * A letter shown behind the accent being drawn.
	 *
	 * An accent drawn over nothing ends up the wrong size and in the
	 * wrong place. Drawn over a real letter, at the position the
	 * composer will use, it does not.
	 */
	paintGhost( ctx, v, color ) {
		const glyph = this.project.glyphs[ this.ghost ];
		if ( ! glyph ) {
			return;
		}
		const m = this.project.metrics;
		const contours = this.cache.get( this.ghost, glyph, outlineOpts( this.project ) );
		if ( ! contours.length ) {
			return;
		}
		let x0 = Infinity;
		let x1 = -Infinity;
		for ( const ring of contours ) {
			for ( const p of ring ) {
				x0 = Math.min( x0, p.x );
				x1 = Math.max( x1, p.x );
			}
		}
		ctx.save();
		ctx.globalAlpha = 0.22;
		ctx.fillStyle = color;
		ctx.translate( v.originX + ( m.unitsPerEm / 2 ) * v.scale, v.top * v.scale );
		ctx.scale( v.scale, -v.scale );
		ctx.translate( -( x0 + x1 ) / 2, 0 );
		ctx.fill( contoursToPath( contours ), 'nonzero' );
		ctx.restore();
	}

	/** The letters before and after, so this one is drawn to match. */
	paintNeighbours( ctx, v, toX, toY, color ) {
		const m = this.project.metrics;
		const o = this.project.options;
		const side = sideFor( m, o.pen || 62, 1 );
		const traceOpts = outlineOpts( this.project );
		const draw = ( key, anchor, align ) => {
			const glyph = this.project.glyphs[ key ];
			if ( ! glyph ) {
				return;
			}
			const contours = this.cache.get( key, glyph, traceOpts );
			if ( ! contours.length ) {
				return;
			}
			const placed = placeGlyph( contours, {
				side,
				tracking: o.tracking || 0,
				cursive: !! o.cursive,
				overlap: o.overlap ?? 24,
			} );
			const x = 'right' === align ? anchor - placed.advance : anchor;
			ctx.save();
			ctx.globalAlpha = 0.28;
			ctx.fillStyle = color;
			ctx.translate( toX( x ), v.top * v.scale );
			ctx.scale( v.scale, -v.scale );
			ctx.fill( contoursToPath( placed.contours ), 'nonzero' );
			ctx.restore();
		};
		draw( this.neighbours.prev, 0, 'right' );
		draw( this.neighbours.next, m.unitsPerEm, 'left' );
	}
}
