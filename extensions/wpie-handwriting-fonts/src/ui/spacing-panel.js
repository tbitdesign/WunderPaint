/**
 * The spacing bench.
 *
 * Automatic spacing gets most pairs right and a few conspicuously
 * wrong, and no amount of cleverness fixes the wrong ones, because what
 * counts as right is a judgement about how a particular A looks beside a
 * particular V. So this is the place to look at a word large, grab the
 * gap that offends you, and move it.
 *
 * Two things can be grabbed. The gap between two letters is a kern and
 * belongs to that pair. The edge of a letter is its side bearing and
 * belongs to the letter everywhere it appears. Both are corrections on
 * top of the automatic pass, both survive in the project, and both end
 * up in the font file.
 */

import { layoutText, contoursToPath, fitCanvas, themeColor } from './paint.js';
import { manualKern, setManualKern, nudgeGlyph, clearSpacing, spacingCount } from '../core/spacing.js';

/** How near the pointer has to be to a gap to mean the gap. */
const GRAB_PX = 15;

export class SpacingPanel {
	/**
	 * @param {HTMLElement} root Container.
	 * @param {Object}      opts `{ project, cache, t, ui, onChange, sample }`.
	 */
	constructor( root, opts ) {
		this.root = root;
		this.project = opts.project;
		this.cache = opts.cache;
		this.t = opts.t || ( ( s ) => s );
		this.ui = opts.ui;
		this.onChange = opts.onChange || ( () => {} );
		this.text = opts.sample || 'Hamburgefonstiv';
		this.sel = null;
		this.drag = null;
		this.layout = { items: [], width: 0 };
		this.build();
	}

	build() {
		const t = this.t;
		const ui = this.ui;
		this.root.innerHTML = '';

		ui.el(
			'p',
			'wpiehw-hint',
			this.root,
			t(
				'Type a word, then drag the gap between two letters to correct that pair, or drag the edge of a letter to change the air on that side. Arrow keys nudge, and hold Shift for bigger steps.'
			)
		);

		this.input = ui.el( 'input', 'dsm-input wpiehw-sample', this.root );
		this.input.type = 'text';
		this.input.value = this.text;
		this.input.setAttribute( 'aria-label', t( 'Spacing' ) );
		this.input.addEventListener( 'input', () => {
			this.text = this.input.value;
			this.sel = null;
			this.render();
		} );

		this.canvas = document.createElement( 'canvas' );
		this.canvas.className = 'wpiehw-bench';
		this.canvas.tabIndex = 0;
		this.root.appendChild( this.canvas );

		const bar = ui.el( 'div', 'wpiehw-benchbar', this.root );
		this.readout = ui.el( 'span', 'dsm-mono wpiehw-benchvalue', bar, '' );
		this.resetOne = ui.btn( bar, {
			label: t( 'Reset this' ),
			onClick: () => this.reset( false ),
		} );
		ui.btn( bar, { label: t( 'Reset all spacing' ), onClick: () => this.reset( true ) } );
		this.count = ui.el( 'span', 'wpiehw-hint wpiehw-benchcount', bar, '' );

		this.bind();
		this.render();
	}

	bind() {
		const c = this.canvas;
		c.style.touchAction = 'none';
		this.onDown = ( e ) => this.pointerDown( e );
		this.onMove = ( e ) => this.pointerMove( e );
		this.onUp = () => {
			this.drag = null;
		};
		this.onKey = ( e ) => this.keyDown( e );
		c.addEventListener( 'pointerdown', this.onDown );
		c.addEventListener( 'pointermove', this.onMove );
		c.addEventListener( 'pointerup', this.onUp );
		c.addEventListener( 'pointercancel', this.onUp );
		c.addEventListener( 'keydown', this.onKey );
		this.observer =
			'undefined' !== typeof ResizeObserver ? new ResizeObserver( () => this.render() ) : null;
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
		c.removeEventListener( 'keydown', this.onKey );
		if ( this.observer ) {
			this.observer.disconnect();
		}
		this.root.innerHTML = '';
	}

	/* ------------------------------ geometry ----------------------------- */

	view() {
		const rect = this.canvas.getBoundingClientRect();
		const em = this.project.metrics.unitsPerEm;
		const size = Math.min( rect.height * 0.62, 110 );
		let scale = size / em;
		const width = this.layout.width || em;
		if ( width * scale > rect.width - 32 ) {
			scale = ( rect.width - 32 ) / width;
		}
		// Sit the word in the middle of the space rather than low in it.
		return {
			scale,
			x: 16,
			y: rect.height / 2 + size * 0.32,
			w: rect.width,
			h: rect.height,
		};
	}

	/* ------------------------------ picking ------------------------------ */

	pick( clientX ) {
		const v = this.view();
		const rect = this.canvas.getBoundingClientRect();
		const at = ( clientX - rect.left - v.x ) / v.scale;
		const items = this.layout.items.filter( ( i ) => ! i.space );
		const grab = GRAB_PX / v.scale;

		// A gap first: it is the smaller target and the likelier intent.
		for ( let i = 1; i < items.length; i++ ) {
			if ( Math.abs( at - items[ i ].x ) <= grab ) {
				return { type: 'pair', a: items[ i - 1 ].ch, b: items[ i ].ch, index: i };
			}
		}
		for ( const item of items ) {
			if ( at >= item.x && at <= item.x + item.advance ) {
				const side = at < item.x + item.advance / 2 ? 'left' : 'right';
				return { type: 'side', ch: item.ch, side, index: items.indexOf( item ) };
			}
		}
		return null;
	}

	pointerDown( e ) {
		if ( 0 !== e.button ) {
			return;
		}
		e.preventDefault();
		this.canvas.focus();
		const hit = this.pick( e.clientX );
		this.sel = hit;
		if ( hit ) {
			const v = this.view();
			this.drag = { startX: e.clientX, scale: v.scale, moved: 0 };
			try {
				this.canvas.setPointerCapture( e.pointerId );
			} catch ( err ) {
				// Capture is a convenience, not a requirement.
			}
		}
		this.render();
	}

	pointerMove( e ) {
		if ( ! this.drag || ! this.sel ) {
			if ( this.drag ) {
				return;
			}
			this.canvas.style.cursor = this.pick( e.clientX ) ? 'ew-resize' : 'default';
			return;
		}
		e.preventDefault();
		const units = ( e.clientX - this.drag.startX ) / this.drag.scale;
		const step = Math.round( units ) - this.drag.moved;
		if ( ! step ) {
			return;
		}
		this.drag.moved += step;
		this.apply( step );
	}

	keyDown( e ) {
		if ( ! this.sel ) {
			return;
		}
		const step = e.shiftKey ? 10 : 2;
		if ( 'ArrowLeft' === e.key ) {
			e.preventDefault();
			this.apply( -step );
		} else if ( 'ArrowRight' === e.key ) {
			e.preventDefault();
			this.apply( step );
		} else if ( 'Backspace' === e.key || 'Delete' === e.key ) {
			e.preventDefault();
			this.reset( false );
		}
	}

	/** Move the selected correction by a number of units. */
	apply( delta ) {
		const sel = this.sel;
		if ( ! sel ) {
			return;
		}
		if ( 'pair' === sel.type ) {
			const item = this.layout.items.filter( ( i ) => ! i.space )[ sel.index ];
			const current = manualKern( this.project, sel.a, sel.b );
			const base = null === current ? ( item ? item.kern : 0 ) : current;
			setManualKern( this.project, sel.a, sel.b, base + delta );
		} else {
			nudgeGlyph(
				this.project,
				sel.ch,
				'left' === sel.side ? delta : 0,
				'right' === sel.side ? delta : 0
			);
		}
		this.onChange();
		this.render();
	}

	reset( all ) {
		if ( all ) {
			clearSpacing( this.project );
			this.sel = null;
		} else if ( this.sel && 'pair' === this.sel.type ) {
			setManualKern( this.project, this.sel.a, this.sel.b, 0 );
		} else if ( this.sel ) {
			const g = this.project.glyphs[ this.sel.ch ];
			if ( g ) {
				delete g.nudgeL;
				delete g.nudgeR;
			}
		}
		this.onChange();
		this.render();
	}

	/* ------------------------------ painting ----------------------------- */

	render() {
		const t = this.t;
		this.layout = layoutText( this.project, this.text, {
			cache: this.cache,
			maxWidth: Infinity,
		} );
		const { ctx, dpr } = fitCanvas( this.canvas );
		ctx.scale( dpr, dpr );
		const v = this.view();
		const m = this.project.metrics;
		const ink = themeColor( '--ed-text', '#e8eaee' );
		const dim = themeColor( '--ed-text-dim', '#8b929c' );
		const accent = themeColor( '--ed-accent', '#4c8dff' );
		const line = themeColor( '--ed-border', '#3a3f47' );

		ctx.strokeStyle = line;
		ctx.globalAlpha = 0.7;
		ctx.beginPath();
		ctx.moveTo( 0, Math.round( v.y ) + 0.5 );
		ctx.lineTo( v.w, Math.round( v.y ) + 0.5 );
		ctx.stroke();
		ctx.globalAlpha = 1;

		const items = this.layout.items.filter( ( i ) => ! i.space );
		const sel = this.sel;

		// The letter or the pair under the hand gets a lit background, so
		// there is never a doubt about what a drag is going to move.
		if ( sel ) {
			ctx.fillStyle = accent;
			ctx.globalAlpha = 0.16;
			if ( 'pair' === sel.type && items[ sel.index ] ) {
				const x = v.x + items[ sel.index ].x * v.scale;
				ctx.fillRect( x - GRAB_PX / 2, v.y - m.ascender * v.scale, GRAB_PX, ( m.ascender - m.descender ) * v.scale );
			} else if ( items[ sel.index ] ) {
				const it = items[ sel.index ];
				const x = v.x + it.x * v.scale;
				const w = it.advance * v.scale;
				ctx.fillRect(
					'left' === sel.side ? x : x + w / 2,
					v.y - m.ascender * v.scale,
					w / 2,
					( m.ascender - m.descender ) * v.scale
				);
			}
			ctx.globalAlpha = 1;
		}

		for ( const item of items ) {
			ctx.save();
			ctx.translate( v.x + item.x * v.scale, v.y );
			ctx.scale( v.scale, -v.scale );
			ctx.fillStyle = ink;
			ctx.fill( contoursToPath( item.contours ), 'nonzero' );
			ctx.restore();
		}

		// A tick at every gap, so the grabbable places announce themselves.
		ctx.strokeStyle = dim;
		ctx.globalAlpha = 0.5;
		for ( let i = 1; i < items.length; i++ ) {
			const x = Math.round( v.x + items[ i ].x * v.scale ) + 0.5;
			const has = null !== manualKern( this.project, items[ i - 1 ].ch, items[ i ].ch );
			ctx.strokeStyle = has ? accent : dim;
			ctx.globalAlpha = has ? 0.9 : 0.4;
			ctx.beginPath();
			ctx.moveTo( x, v.y + 8 );
			ctx.lineTo( x, v.y + 18 );
			ctx.stroke();
		}
		ctx.globalAlpha = 1;

		this.readout.textContent = this.describe();
		this.resetOne.disabled = ! sel;
		const counts = spacingCount( this.project );
		this.count.textContent =
			counts.pairs || counts.nudged
				? t( '%1$d pair(s), %2$d letter(s) adjusted' )
						.replace( '%1$d', counts.pairs )
						.replace( '%2$d', counts.nudged )
				: '';
	}

	describe() {
		const t = this.t;
		const sel = this.sel;
		if ( ! sel ) {
			return t( 'Drag a gap or a letter edge' );
		}
		const items = this.layout.items.filter( ( i ) => ! i.space );
		if ( 'pair' === sel.type ) {
			const item = items[ sel.index ];
			const manual = manualKern( this.project, sel.a, sel.b );
			const value = null === manual ? ( item ? item.kern : 0 ) : manual;
			return `${ sel.a }${ sel.b }  ${ value > 0 ? '+' : '' }${ value }${
				null === manual ? ` (${ t( 'automatic' ) })` : ''
			}`;
		}
		const g = this.project.glyphs[ sel.ch ] || {};
		const value = 'left' === sel.side ? g.nudgeL || 0 : g.nudgeR || 0;
		return `${ sel.ch }  ${ 'left' === sel.side ? t( 'left' ) : t( 'right' ) }  ${
			value > 0 ? '+' : ''
		}${ value }`;
	}
}
