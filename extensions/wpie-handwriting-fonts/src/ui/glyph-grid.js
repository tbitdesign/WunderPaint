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

/**
 * One icon per character group, plus one for the progress card. A group
 * of characters is best named by a character: a line drawing of
 * "punctuation" would be a riddle, a comma is not.
 */
const glyphIcon = ( ch, size = 15 ) =>
	'<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
	'<text x="12" y="17" text-anchor="middle" font-size="' +
	size +
	'" font-weight="700" fill="currentColor" font-family="Georgia, \'Times New Roman\', serif">' +
	ch +
	'</text></svg>';

const GROUP_ICONS = {
	upper: glyphIcon( 'A' ),
	lower: glyphIcon( 'a' ),
	digits: glyphIcon( '1' ),
	punct: glyphIcon( ',', 19 ),
	marks: glyphIcon( '\u00c1' ),
	letters2: glyphIcon( '\u00df' ),
	punct2: glyphIcon( '@', 13 ),
};

const ICON_PROGRESS =
	'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
	'<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.3l2.4 2.4l4.6-5"/></svg>';

export class GlyphGrid {
	/**
	 * @param {HTMLElement} root Container.
	 * @param {Object}      opts `{ project, cache, t, onPick }`.
	 */
	constructor( root, opts ) {
		this.root = root;
		this.project = opts.project;
		this.cache = opts.cache;
		// bridge.ui, so the overview can use the editor's own section
		// card instead of drawing headings of its own.
		this.ui = opts.ui || null;
		this.t = opts.t || ( ( s ) => s );
		this.onPick = opts.onPick || ( () => {} );
		this.tiles = new Map();
		this.active = null;
		this.build();
	}

	/**
	 * A section card, through bridge.ui when it is there and by hand
	 * when it is not - the overview is also mounted in tests, where no
	 * bridge exists.
	 *
	 * @param {string} icon  Inline SVG.
	 * @param {string} title Section title.
	 * @return {Object} `{ body, head }`.
	 */
	section( icon, title ) {
		if ( this.ui && this.ui.section ) {
			const body = this.ui.section( this.root, { icon, title } );
			return { body, head: body.parentElement.firstChild };
		}
		const card = document.createElement( 'div' );
		card.className = 'dsm-card';
		const head = document.createElement( 'div' );
		head.className = 'dsm-card-head';
		head.innerHTML = icon + '<span></span>';
		head.querySelector( 'span' ).textContent = title;
		card.appendChild( head );
		const body = document.createElement( 'div' );
		body.className = 'dsm-card-body';
		card.appendChild( body );
		this.root.appendChild( card );
		return { body, head };
	}

	build() {
		const t = this.t;
		this.root.innerHTML = '';

		const prog = this.section( ICON_PROGRESS, t( 'Progress' ) );
		this.bar = document.createElement( 'div' );
		this.bar.className = 'wpiehw-progress';
		this.barFill = document.createElement( 'i' );
		this.bar.appendChild( this.barFill );
		prog.body.appendChild( this.bar );

		this.count = document.createElement( 'div' );
		this.count.className = 'dsm-note wpiehw-count';
		prog.body.appendChild( this.count );

		for ( const group of GROUPS ) {
			const sec = this.section(
				GROUP_ICONS[ group.id ] || GROUP_ICONS.upper,
				t( group.label )
			);
			// "optional" belongs at the right edge of the head, which is
			// what the kit's dsm-head-end is for.
			if ( ! group.required ) {
				const tag = document.createElement( 'span' );
				tag.className = 'dsm-head-end wpiehw-optional';
				tag.textContent = t( 'optional' );
				sec.head.appendChild( tag );
			}

			const grid = document.createElement( 'div' );
			grid.className = isMark( group.items[ 0 ] ) ? 'wpiehw-tiles wide' : 'wpiehw-tiles';
			sec.body.appendChild( grid );

			for ( const key of group.items ) {
				grid.appendChild( this.makeTile( key ) );
			}
		}
		this.refreshAll();
	}

	makeTile( key ) {
		const btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = 'dsm-pick wpiehw-tile';
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
