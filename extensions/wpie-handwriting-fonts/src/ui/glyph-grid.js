/**
 * The character overview.
 *
 * Its real job is answering "how much is left", which is the question
 * somebody drawing an alphabet asks every thirty seconds. Each tile
 * shows the letter as it will actually come out, so the overview
 * doubles as a specimen: patchy weights and letters that sit at the
 * wrong height are visible here long before the font is built.
 */

import { GROUPS, isMark, labelOf, progress } from '../core/charset.js';
import { contoursToPath, fitCanvas, themeColor, outlineOpts } from './paint.js';

export class GlyphGrid {
	/**
	 * @param {HTMLElement} root Container.
	 * @param {Object}      opts `{ project, cache, t, onPick }`.
	 */
	constructor( root, opts ) {
		this.root = root;
		this.project = opts.project;
		this.cache = opts.cache;
		this.t = opts.t || ( ( s ) => s );
		this.onPick = opts.onPick || ( () => {} );
		this.tiles = new Map();
		this.active = null;
		this.build();
	}

	build() {
		const t = this.t;
		this.root.innerHTML = '';
		this.bar = document.createElement( 'div' );
		this.bar.className = 'wpiehw-progress';
		this.barFill = document.createElement( 'i' );
		this.bar.appendChild( this.barFill );
		this.root.appendChild( this.bar );

		this.count = document.createElement( 'div' );
		this.count.className = 'wpiehw-count';
		this.root.appendChild( this.count );

		for ( const group of GROUPS ) {
			const head = document.createElement( 'div' );
			head.className = 'wpiehw-group';
			head.textContent = t( group.label );
			if ( ! group.required ) {
				const tag = document.createElement( 'span' );
				tag.textContent = t( 'optional' );
				head.appendChild( tag );
			}
			this.root.appendChild( head );

			const grid = document.createElement( 'div' );
			grid.className = isMark( group.items[ 0 ] ) ? 'wpiehw-tiles wide' : 'wpiehw-tiles';
			this.root.appendChild( grid );

			for ( const key of group.items ) {
				grid.appendChild( this.makeTile( key ) );
			}
		}
		this.refreshAll();
	}

	makeTile( key ) {
		const btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = 'wpiehw-tile';
		btn.title = labelOf( key );
		const canvas = document.createElement( 'canvas' );
		canvas.className = 'wpiehw-tilecv';
		btn.appendChild( canvas );
		const label = document.createElement( 'span' );
		label.textContent = isMark( key ) ? this.t( labelOf( key ) ) : key;
		btn.appendChild( label );
		btn.addEventListener( 'click', () => this.onPick( key ) );
		this.tiles.set( key, { btn, canvas } );
		return btn;
	}

	setActive( key ) {
		if ( this.active && this.tiles.has( this.active ) ) {
			this.tiles.get( this.active ).btn.classList.remove( 'is-active' );
		}
		this.active = key;
		const tile = this.tiles.get( key );
		if ( tile ) {
			tile.btn.classList.add( 'is-active' );
			if ( tile.btn.scrollIntoView ) {
				tile.btn.scrollIntoView( { block: 'nearest' } );
			}
		}
	}

	/** Repaint one tile and the counter above it. */
	refresh( key ) {
		const tile = this.tiles.get( key );
		if ( tile ) {
			this.paintTile( key, tile );
		}
		this.refreshCount();
	}

	refreshAll() {
		for ( const [ key, tile ] of this.tiles ) {
			this.paintTile( key, tile );
		}
		this.refreshCount();
	}

	refreshCount() {
		const p = progress( this.project.glyphs );
		this.barFill.style.width = `${ Math.round( ( p.requiredDone / p.requiredTotal ) * 100 ) }%`;
		this.bar.classList.toggle( 'is-ready', p.ready );
		this.count.textContent = this.t( '%1$d of %2$d drawn' )
			.replace( '%1$d', p.done )
			.replace( '%2$d', p.total );
		return p;
	}

	paintTile( key, tile ) {
		const glyph = this.project.glyphs[ key ];
		tile.btn.classList.toggle( 'is-done', !! glyph );
		const { ctx, dpr } = fitCanvas( tile.canvas );
		if ( ! glyph ) {
			return;
		}
		const contours = this.cache.get( key, glyph, outlineOpts( this.project ) );
		if ( ! contours.length ) {
			return;
		}
		const m = this.project.metrics;
		const rect = tile.canvas.getBoundingClientRect();
		const span = ( m.ascender - m.descender ) * 1.05;
		const scale = rect.height / span;
		ctx.scale( dpr, dpr );
		ctx.fillStyle = themeColor( '--ed-text', '#e8eaee' );
		ctx.save();
		ctx.translate( rect.width / 2, ( m.ascender + span * 0.025 ) * scale );
		ctx.scale( scale, -scale );
		const box = boundsOf( contours );
		ctx.translate( -( box.x0 + box.x1 ) / 2, 0 );
		ctx.fill( contoursToPath( contours ), 'nonzero' );
		ctx.restore();
	}
}

function boundsOf( contours ) {
	let x0 = Infinity;
	let x1 = -Infinity;
	for ( const ring of contours ) {
		for ( const p of ring ) {
			if ( p.x < x0 ) {
				x0 = p.x;
			}
			if ( p.x > x1 ) {
				x1 = p.x;
			}
		}
	}
	return Number.isFinite( x0 ) ? { x0, x1 } : { x0: 0, x1: 0 };
}
