/**
 * Chaos Art: independent actors paint one-of-a-kind abstract art in 3D.
 *
 * The dialog follows the family: styles and colors on the left, the
 * living view in the middle with the transport under it, dials on the
 * right, status and the primary action in the foot. What is different
 * is the heart: there is no seed and no reproduce - the entropy field
 * charges the piece, the snapshot ring keeps the moments, and Stop is
 * the artistic act.
 */

import { ChaosEngine } from './engine.js';
import { STYLES, styleById } from './core/styles.js';
import { MOVEMENTS, movementById } from './core/movements.js';
import { MEDIA, resolveMedium } from './core/media.js';
import { PALETTES, generatePalette, hexRgb } from './core/palette.js';
import { makePool, makeRng } from './core/rng.js';
import { describePiece } from './core/naming.js';
import { t } from './i18n.js';

const GEN_ID = 'wpie-chaos-art/piece';

// The editor's brand mark - every studio badges with it, verbatim.
const ICON_BRAND =
	'<svg width="24" height="24" viewBox="0 0 18.83 18.83" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.84,18.83H3.62c-2,0-3.62-1.62-3.62-3.62V3.52h1.72c.7,0,1.28.57,1.28,1.28v10.43c0,.34.28.62.62.62h8.94c.71,0,1.29.58,1.29,1.29v1.71Z"/><path fill="#3b66ff" d="M18.83,14.02h-1.71c-.71,0-1.29-.58-1.29-1.29V3.62c0-.34-.28-.62-.62-.62H4.82c-.7,0-1.28-.57-1.28-1.28V0h11.67c2,0,3.62,1.62,3.62,3.62v10.4Z"/><circle fill="currentColor" cx="17.33" cy="17.33" r="1.5"/><path fill="#3b66ff" d="M9.51,5.71l.91,2.45c.03.08.09.14.17.17l2.45.91c.07.03.07.13,0,.16l-2.45.91c-.08.03-.14.09-.17.17l-.91,2.45c-.03.07-.13.07-.16,0l-.91-2.45c-.03-.08-.09-.14-.17-.17l-2.45-.91c-.07-.03-.07-.13,0-.16l2.45-.91c.08-.03.14-.09.17-.17l.91-2.45c.03-.07.13-.07.16,0Z"/></svg>';

/** Section icons, the Tabler set the family uses. */
const tabIcon = ( d ) =>
	'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
	'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
	d
		.split( ' M' )
		.map( ( part, i ) => '<path d="' + ( i ? 'M' + part : part ) + '"/>' )
		.join( '' ) +
	'</svg>';

const ICONS = {
	style: tabIcon(
		'M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.58 9 8c0 1.1 -.9 2 -2 2h-4a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25 M7.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M12 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M16.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0'
	),
	temper: tabIcon( 'M13 3l-6 9h4l-2 9l8 -11h-5z' ),
	colors: tabIcon(
		'M19 3h-4a2 2 0 0 0 -2 2v12a4 4 0 0 0 8 0v-12a2 2 0 0 0 -2 -2 M13 7.35l-2 -2a2 2 0 0 0 -2.828 0l-2.828 2.828a2 2 0 0 0 0 2.828l9 9 M7.3 13h-2.3a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h12 M17 17v.01'
	),
	look: tabIcon(
		'M3 12h1 M12 3v1 M20 12h1 M5.6 5.6l.7 .7 M18.4 5.6l-.7 .7 M8 16a5 5 0 1 1 8 0a5 5 0 0 1 -8 0 M9.7 17h4.6'
	),
	pointer: tabIcon(
		'M7.904 17.563a1.2 1.2 0 0 0 2.228 .308l2.09 -3.093l4.907 4.907a1.067 1.067 0 0 0 1.509 0l1.047 -1.047a1.067 1.067 0 0 0 0 -1.509l-4.907 -4.907l3.113 -2.09a1.2 1.2 0 0 0 -.309 -2.228l-13.582 -3.904l3.904 13.563z'
	),
	exportIc: tabIcon(
		'M14 3v4a1 1 0 0 0 1 1h4 M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2 M12 11v6 M9.5 13.5l2.5 -2.5l2.5 2.5'
	),
	moments: tabIcon( 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18 M12 7v5l3 3' ),
	school: tabIcon(
		'M22 9l-10 -4l-10 4l10 4l10 -4v6 M6 10.6v5.4a6 3 0 0 0 12 0v-5.4'
	),
};

const GROUNDS = [
	[ 'style', 'Style default' ],
	[ 'void', 'Black void' ],
	[ 'paper', 'Paper' ],
	[ 'mist', 'Deep mist' ],
];

const POINTER_MODES = [
	[ 'wind', 'Stir (wind)' ],
	[ 'attract', 'Attract' ],
	[ 'repel', 'Repel' ],
	[ 'off', 'Off' ],
];

/* -------------------------------- the studio ------------------------------- */

function openStudio( ctx ) {
	const { editor } = ctx || {};
	const bridge = window.WPIE && window.WPIE.bridge;
	const ui = bridge && bridge.ui;
	if ( ! ui || ! ui.dialog || ! editor ) {
		return;
	}
	const ownLayer =
		ctx.layer && ctx.layer.generator && ctx.layer.generator.id === GEN_ID
			? ctx.layer
			: null;
	const stored = ( ownLayer && ownLayer.generator.params ) || null;

	const doc = editor.state.doc;
	const aspect = Math.max(
		0.2,
		Math.min( 5, ( doc.w || 1 ) / ( doc.h || 1 ) )
	);

	const first = styleById( ( stored && stored.styleId ) || 'ink' );
	const state = {
		// A fresh studio starts SELF-DIRECTED: the society picks style,
		// school, colors and temperament at every Start. Touching a
		// control locks that one aspect in the user's hand.
		styleId: stored ? stored.styleId : 'auto',
		paletteId: stored ? stored.paletteId || first.defaultPalette : 'auto',
		kitName: ( stored && stored.kitName ) || '',
		custom: ( stored && stored.custom ) || [
			'#e63946',
			'#f1faee',
			'#457b9d',
		],
		colors: ( stored && stored.colors ) || null,
		ground: ( stored && stored.ground ) || 'style',
		cursorMode: ( stored && stored.cursorMode ) || first.cursorMode,
		fx: {
			bloom: 100,
			dof: 100,
			grain: 100,
			vignette: 100,
			...( stored && stored.fx ),
		},
		movementId: stored ? stored.movementId || 'free' : 'auto',
		autoTemper: stored ? !! stored.autoTemper : true,
		mediumId: ( stored && stored.mediumId ) || 'auto',
		chaos: stored ? stored.chaos : 55,
		energy: stored ? stored.energy : 55,
		density: stored ? stored.density : 50,
		tempo: stored ? stored.tempo : 100,
	};
	if ( ! state.colors ) {
		state.colors = paletteColors( state );
	}

	// One live params object; the world holds a reference, the dials
	// write into it, the actors see it next decision. No plumbing.
	const params = {
		chaos: state.chaos / 100,
		energy: state.energy / 100,
		density: state.density / 100,
		tempo: state.tempo / 100,
		colors: state.colors.slice(),
	};

	const pool = makePool();
	const engine = new ChaosEngine();
	let runPick = null; // what the society chose for the CURRENT piece
	let runSeq = 0;
	let colorMounts = [];
	let liveThumb = '';
	let steck = null; // the piece's own title and life, written on pause
	let momentAt = -1; // -1 = live end
	let started = false;
	let closed = false;

	function paletteColors( s ) {
		if ( 'auto' === s.paletteId ) {
			return PALETTES[ 0 ].colors.slice();
		}
		if ( 'custom' === s.paletteId ) {
			return s.custom.slice();
		}
		if ( s.paletteId && s.paletteId.startsWith( 'kit' ) ) {
			return s.colors || s.custom.slice();
		}
		const p =
			PALETTES.find( ( x ) => x.id === s.paletteId ) || PALETTES[ 0 ];
		return p.colors.slice();
	}

	function settingsForEngine() {
		const sid = runPick
			? runPick.styleId
			: 'auto' === state.styleId
			? 'ensemble'
			: state.styleId;
		const mid = runPick
			? runPick.movementId
			: 'auto' === state.movementId
			? 'free'
			: state.movementId;
		return {
			style: styleById( sid ),
			movement: movementById( mid ),
			movementAuto: 'auto' === state.movementId,
			mediumAuto: 'auto' === state.mediumId,
			medium: resolveMedium( state.mediumId, movementById( mid ) ),
			params,
			cursorMode: state.cursorMode,
			ground: ( runPick && runPick.ground ) || state.ground,
			fx: {
				bloom: state.fx.bloom / 100,
				dof: state.fx.dof / 100,
				grain: state.fx.grain / 100,
				vignette: state.fx.vignette / 100,
			},
		};
	}

	const modal = ui.dialog( {
		title: t( 'Chaos Art' ),
		subtitle: t(
			'Independent painters make one-of-a-kind art. You choose the moment it is finished.'
		),
		width: 1340,
		onClose: () => cleanup(),
	} );
	// The family bug class, third sighting: ui.dialog({width}) only caps
	// max-width - a REAL width needs its own class on the dialog box.
	modal.dialog.classList.add( 'wpiechaos-dialog' );
	const badge = document.createElement( 'span' );
	badge.className = 'dsm-badge';
	badge.innerHTML = ICON_BRAND;
	modal.head.insertBefore( badge, modal.head.firstChild );

	const body = ui.el( 'div', 'wpiechaos-body', modal.body );

	/* -------------------------------- left -------------------------------- */

	const left = ui.el( 'div', 'wpiechaos-left', body );

	// The school sits ABOVE the styles: it does not replace the casting,
	// it educates it - palette, dials, marks and light shift together.
	const moveCard = ui.section( left, {
		icon: ICONS.school,
		title: t( 'Art movement' ),
	} );
	ui.select( moveCard, {
		options: [ { value: 'auto', label: t( 'Their choice' ) } ].concat(
			MOVEMENTS.map( ( m ) => ( {
				value: m.id,
				label: t( m.label ),
			} ) )
		),
		value: state.movementId,
		onChange: ( v ) => {
			state.movementId = v;
			const mv = movementById( v );
			if (
				'custom' !== state.paletteId &&
				'auto' !== state.paletteId &&
				! state.paletteId.startsWith( 'kit' )
			) {
				state.paletteId =
					mv.paletteId || styleById( state.styleId ).defaultPalette;
				state.colors = paletteColors( state );
				syncColors();
			}
			state.ground = mv.ground || 'style';
			if ( mv.dials ) {
				for ( const k of [ 'chaos', 'energy', 'density', 'tempo' ] ) {
					if ( undefined !== mv.dials[ k ] ) {
						state[ k ] = mv.dials[ k ];
						params[ k ] = mv.dials[ k ] / 100;
					}
				}
			}
			syncMoveBlurb();
			hardReset();
			renderRight();
			applyLook();
		},
	} );
	const moveBlurb = ui.el( 'div', 'wpiechaos-note', moveCard, '' );
	const syncMoveBlurb = () => {
		moveBlurb.textContent =
			'auto' === state.movementId
				? t( 'A school drawn fresh at every start - or none at all.' )
				: t( movementById( state.movementId ).blurb );
	};
	syncMoveBlurb();

	const styleCard = ui.section( left, {
		icon: ICONS.style,
		title: t( 'Style' ),
	} );
	const styleWrap = ui.el( 'div', 'wpiechaos-styles', styleCard );
	const styleTiles = [];
	{
		// The first card is no style at all: they pick one themselves,
		// fresh at every start.
		const tile = ui.el( 'button', 'wpiechaos-style', styleWrap );
		tile.type = 'button';
		const sw = ui.el( 'span', 'wpiechaos-style-art', tile );
		sw.style.background =
			'conic-gradient(#d02e26,#f4b400,#5d9c46,#087e8b,#3b66ff,#7b2ff7,#d02e26)';
		ui.el( 'span', 'wpiechaos-style-name', tile, t( 'Surprise' ) );
		ui.el(
			'span',
			'wpiechaos-style-blurb',
			tile,
			t( 'They pick the style themselves.' )
		);
		tile.onclick = () => {
			if ( 'auto' === state.styleId ) {
				return;
			}
			state.styleId = 'auto';
			hardReset();
			renderRight();
			syncTiles();
		};
		styleTiles.push( { tile, id: 'auto' } );
	}
	for ( const s of STYLES ) {
		const tile = ui.el( 'button', 'wpiechaos-style', styleWrap );
		tile.type = 'button';
		const sw = ui.el( 'span', 'wpiechaos-style-art', tile );
		sw.style.background = styleGradient( s );
		ui.el( 'span', 'wpiechaos-style-name', tile, t( s.label ) );
		ui.el( 'span', 'wpiechaos-style-blurb', tile, t( s.blurb ) );
		tile.onclick = () => {
			if ( state.styleId === s.id ) {
				return;
			}
			state.styleId = s.id;
			state.cursorMode = s.cursorMode;
			if (
				'custom' !== state.paletteId &&
				'auto' !== state.paletteId &&
				! state.paletteId.startsWith( 'kit' )
			) {
				// An active school keeps its colors across style changes.
				state.paletteId =
					movementById( state.movementId ).paletteId ||
					s.defaultPalette;
			}
			syncColors();
			// A new style is a new piece: the stage clears, the entropy
			// stays, painting starts fresh on the next Start.
			hardReset();
			renderRight();
			syncTiles();
		};
		styleTiles.push( { tile, id: s.id } );
	}
	const syncTiles = () => {
		for ( const st of styleTiles ) {
			st.tile.classList.toggle( 'is-on', st.id === state.styleId );
		}
	};

	const noteCard = ui.section( left, {
		icon: ICONS.moments,
		title: t( 'One of a kind' ),
	} );
	ui.el(
		'div',
		'wpiechaos-note',
		noteCard,
		t(
			'Same settings, different picture - every run is unique, there is no seed. Snapshots keep the last two minutes, so no moment is ever lost.'
		)
	);

	/* ------------------------------- middle ------------------------------- */

	const mid = ui.el( 'div', 'wpiechaos-mid', body );
	const view = ui.el( 'div', 'wpiechaos-view', mid );
	const hint = ui.el(
		'div',
		'wpiechaos-hint',
		view,
		t( 'Drag to orbit · wheel to zoom · your pointer stirs the paint' )
	);
	hint.style.display = 'none';

	// The entropy field: before the first stroke, your movement is the seed.
	const field = ui.el( 'div', 'wpiechaos-field', view );
	ui.el( 'div', 'wpiechaos-field-title', field, t( 'Charge the piece' ) );
	ui.el(
		'div',
		'wpiechaos-field-sub',
		field,
		t(
			'Move your pointer here. Your movement becomes this artwork - it can never be painted again.'
		)
	);
	const meter = ui.el( 'div', 'wpiechaos-meter', field );
	const meterFill = ui.el( 'div', 'wpiechaos-meter-fill', meter );
	const sparks = ui.el( 'canvas', 'wpiechaos-sparks', field );

	field.addEventListener( 'pointermove', ( e ) => {
		pool.feed(
			Math.round( e.clientX * 7919 ),
			Math.round( e.clientY * 104729 ),
			performance.now() >>> 0
		);
		meterFill.style.width = Math.min( 100, pool.charge() / 1.4 ) + '%';
		drawSpark( e );
	} );
	// While it paints, the pointer keeps feeding the pool - entropy in,
	// art out, for as long as the session lives.
	view.addEventListener( 'pointermove', ( e ) => {
		pool.feed(
			Math.round( e.clientX * 31 ),
			Math.round( e.clientY * 37 ),
			performance.now() >>> 0
		);
	} );

	function drawSpark( e ) {
		const r = field.getBoundingClientRect();
		if ( sparks.width !== Math.round( r.width ) ) {
			sparks.width = Math.round( r.width );
			sparks.height = Math.round( r.height );
		}
		const g = sparks.getContext( '2d' );
		g.fillStyle = 'rgba(120,160,255,0.5)';
		const x = e.clientX - r.left;
		const y = e.clientY - r.top;
		for ( let i = 0; i < 3; i++ ) {
			g.beginPath();
			g.arc(
				x + ( Math.random() - 0.5 ) * 30,
				y + ( Math.random() - 0.5 ) * 30,
				1 + Math.random() * 2,
				0,
				7
			);
			g.fill();
		}
		// Fade by ERASING, not by painting black: the old fade stacked a
		// darkening veil over the field - and the canvas sits above it.
		g.globalCompositeOperation = 'destination-out';
		g.fillStyle = 'rgba(0,0,0,0.08)';
		g.fillRect( 0, 0, sparks.width, sparks.height );
		g.globalCompositeOperation = 'source-over';
	}

	// Transport under the view.
	const transport = ui.el( 'div', 'wpiechaos-transport', mid );
	const startBtn = ui.btn( transport, {
		label: t( 'Start painting' ),
		primary: true,
		onClick: () => {
			if ( ! started ) {
				begin();
			} else if ( engine.running ) {
				pause();
			} else {
				resume();
			}
		},
	} );
	startBtn.classList.add( 'wpiechaos-start' );
	const impulseBtn = ui.btn( transport, {
		label: t( 'Impulse' ),
		onClick: () => engine.impulse(),
	} );
	impulseBtn.disabled = true;
	const overBtn = ui.btn( transport, {
		label: t( 'Start over' ),
		onClick: () => {
			hardReset();
			begin();
		},
	} );
	overBtn.disabled = true;

	// The moment picker: appears on pause, reads the ring.
	const moments = ui.el( 'div', 'wpiechaos-moments', mid );
	moments.style.display = 'none';

	function renderMoments() {
		moments.textContent = '';
		if ( steck ) {
			// The piece introduces itself: its own title, its own life.
			ui.el( 'div', 'wpiechaos-title', moments, steck.title );
			const f = steck.facts;
			const bits = [
				t( styleById( f.style ).label ),
				t( movementById( f.school ).label ) +
					( f.endSchool !== f.school
						? ' → ' + t( movementById( f.endSchool ).label )
						: '' ),
				f.upheavals + ' ' + t( 'upheavals' ),
				f.moves + ' ' + t( 'moves' ),
				f.marks.toLocaleString() + ' ' + t( 'marks' ),
			];
			ui.el( 'div', 'wpiechaos-bio', moments, bits.join( ' · ' ) );
		}
		ui.el(
			'div',
			'wpiechaos-moments-title',
			moments,
			t( 'Pick the moment' )
		);
		const strip = ui.el( 'div', 'wpiechaos-strip', moments );
		const items = engine.ring.list();
		items.forEach( ( item, i ) => {
			const b = ui.el( 'button', 'wpiechaos-moment', strip );
			b.type = 'button';
			const img = ui.el( 'img', null, b );
			img.src = item.url;
			img.alt = '';
			b.classList.toggle( 'is-on', i === momentAt );
			b.onclick = () => {
				momentAt = i;
				renderMoments();
			};
		} );
		const live = ui.el( 'button', 'wpiechaos-moment is-live', strip );
		live.type = 'button';
		if ( liveThumb ) {
			const img = ui.el( 'img', null, live );
			img.src = liveThumb;
			img.alt = t( 'Now (live)' );
			img.title = t( 'Now (live)' );
		} else {
			ui.el( 'span', null, live, t( 'Now (live)' ) );
		}
		live.classList.toggle( 'is-on', -1 === momentAt );
		live.onclick = () => {
			momentAt = -1;
			renderMoments();
		};
		strip.scrollLeft = strip.scrollWidth;
	}

	function begin() {
		// The society serves itself: whatever stands on "their choice"
		// is drawn HERE, freshly, from the piece's own entropy - so the
		// same settings never even BEGIN the same way twice.
		runSeq++;
		pool.feed(
			( 'undefined' !== typeof performance
				? performance.now()
				: runSeq ) >>> 0,
			( runSeq * 2654435761 ) >>> 0,
			( runSeq * 40503 + 7 ) >>> 0
		);
		const draw = makeRng( pool.words );
		runPick = {
			styleId:
				'auto' === state.styleId
					? STYLES[ Math.floor( draw() * STYLES.length ) ].id
					: state.styleId,
			movementId:
				'auto' === state.movementId
					? MOVEMENTS[ Math.floor( draw() * MOVEMENTS.length ) ].id
					: state.movementId,
		};
		const mv = movementById( runPick.movementId );
		if ( 'auto' === state.paletteId ) {
			let cols;
			if ( mv.paletteId && draw() < 0.55 ) {
				const pp = PALETTES.find( ( x ) => x.id === mv.paletteId );
				cols = ( pp || PALETTES[ 0 ] ).colors.slice();
			} else if ( draw() < 0.55 ) {
				cols = generatePalette( draw );
			} else {
				cols =
					PALETTES[
						Math.floor( draw() * PALETTES.length ) % PALETTES.length
					].colors.slice();
			}
			state.colors = cols;
			syncColors();
		}
		if ( state.autoTemper ) {
			const base = mv.dials || {};
			const roll = ( k, lo, hi ) => {
				let v =
					undefined !== base[ k ]
						? base[ k ] + ( draw() - 0.5 ) * 26
						: lo + draw() * ( hi - lo );
				v = Math.round( Math.max( 8, Math.min( hi, v ) ) );
				state[ k ] = v;
				params[ k ] = v / 100;
			};
			roll( 'chaos', 15, 92 );
			roll( 'energy', 20, 92 );
			roll( 'density', 15, 92 );
			roll( 'tempo', 60, 185 );
		}
		if ( 'style' === state.ground ) {
			// Sometimes the piece stands on its own darkest or lightest
			// color - grounds stop looking like the same two rooms.
			const g = draw();
			if ( g < 0.45 ) {
				const lum = ( hx ) => {
					const c = hexRgb( hx );
					return c[ 0 ] + c[ 1 ] + c[ 2 ];
				};
				const sorted = state.colors
					.slice()
					.sort( ( x, y ) => lum( x ) - lum( y ) );
				runPick.ground =
					g < 0.3 ? sorted[ 0 ] : sorted[ sorted.length - 1 ];
			}
		}
		params.autoPalette = 'auto' === state.paletteId;
		params.autoTemper = state.autoTemper;
		params.allowRecast =
			'auto' === state.styleId || 'ensemble' === runPick.styleId;
		engine.newWorld( settingsForEngine(), pool );
		engine.start();
		started = true;
		momentAt = -1;
		field.style.display = 'none';
		hint.style.display = '';
		moments.style.display = 'none';
		startBtn.textContent = t( 'Pause' );
		impulseBtn.disabled = false;
		overBtn.disabled = false;
		renderRight();
		const med = resolveMedium( state.mediumId, mv );
		setStatus(
			t( 'They chose:' ) +
				' ' +
				t( styleById( runPick.styleId ).label ) +
				' · ' +
				t( mv.label ) +
				( med.paint ? ' · ' + t( med.label ) : '' )
		);
	}

	function pause() {
		engine.stop();
		startBtn.textContent = t( 'Resume' );
		moments.style.display = '';
		momentAt = -1;
		liveThumb = '';
		steck = engine.world ? describePiece( engine.world ) : null;
		// The loop keeps rendering while paused; the thumb arrives from
		// inside the render task (the same-task readback rule).
		engine.captureNext( ( url ) => {
			liveThumb = url;
			renderMoments();
		} );
		renderMoments();
	}

	function resume() {
		engine.resume();
		momentAt = -1;
		moments.style.display = 'none';
		startBtn.textContent = t( 'Pause' );
	}

	function hardReset() {
		engine.stop();
		runPick = null;
		started = false;
		momentAt = -1;
		moments.style.display = 'none';
		startBtn.textContent = t( 'Start painting' );
		impulseBtn.disabled = true;
		overBtn.disabled = true;
		field.style.display = '';
		hint.style.display = 'none';
		if ( engine.world ) {
			engine.newWorld( settingsForEngine(), pool );
		}
	}

	/* -------------------------------- right ------------------------------- */

	const side = ui.el( 'div', 'wpiechaos-side', body );

	function renderRight() {
		for ( const m of colorMounts ) {
			if ( m.unmount ) {
				m.unmount();
			}
		}
		colorMounts = [];
		side.textContent = '';

		const temper = ui.section( side, {
			icon: ICONS.temper,
			title: t( 'Temperament' ),
		} );
		const temperBox = ui.check( temper, {
			label: t( 'They set the dials themselves' ),
			checked: state.autoTemper,
			onChange: ( v ) => {
				state.autoTemper = v;
			},
		} );
		const lockTemper = () => {
			if ( state.autoTemper ) {
				state.autoTemper = false;
				temperBox.checked = false;
			}
		};
		ui.slider( temper, {
			label: t( 'Order to chaos' ),
			min: 0,
			max: 100,
			value: state.chaos,
			onInput: ( v ) => {
				lockTemper();
				state.chaos = v;
				params.chaos = v / 100;
			},
		} );
		ui.slider( temper, {
			label: t( 'Energy' ),
			min: 0,
			max: 100,
			value: state.energy,
			onInput: ( v ) => {
				lockTemper();
				state.energy = v;
				params.energy = v / 100;
			},
		} );
		ui.slider( temper, {
			label: t( 'Density' ),
			min: 0,
			max: 100,
			value: state.density,
			onInput: ( v ) => {
				lockTemper();
				state.density = v;
				params.density = v / 100;
				engine.recast();
			},
		} );
		ui.slider( temper, {
			label: t( 'Tempo' ),
			min: 20,
			max: 300,
			value: state.tempo,
			format: ( v ) => v + '%',
			onInput: ( v ) => {
				lockTemper();
				state.tempo = v;
				params.tempo = v / 100;
			},
		} );

		const colors = ui.section( side, {
			icon: ICONS.colors,
			title: t( 'Colors' ),
		} );
		const palSel = ui.select( ui.row( colors, t( 'Palette' ) ), {
			options: [],
		} );
		{
			const o = document.createElement( 'option' );
			o.value = 'auto';
			o.textContent = t( 'Their choice' );
			palSel.appendChild( o );
		}
		PALETTES.forEach( ( p ) => {
			const o = document.createElement( 'option' );
			o.value = p.id;
			o.textContent = t( p.label );
			palSel.appendChild( o );
		} );
		const kits = (
			bridge.brand && bridge.brand.kits
				? bridge.brand.kits()
				: ( window.WPIE && window.WPIE.brandKits ) || []
		).filter( ( k ) => k && k.name && ( k.colors || [] ).length > 1 );
		kits.forEach( ( k, i ) => {
			const o = document.createElement( 'option' );
			o.value = 'kit:' + i;
			o.textContent = '★ ' + k.name;
			palSel.appendChild( o );
		} );
		const customOpt = document.createElement( 'option' );
		customOpt.value = 'custom';
		customOpt.textContent = t( 'Custom colors' );
		palSel.appendChild( customOpt );
		if ( 'auto' === state.paletteId ) {
			palSel.value = 'auto';
		} else if ( state.paletteId.startsWith( 'kit' ) ) {
			const idx = kits.findIndex( ( k ) => k.name === state.kitName );
			if ( idx >= 0 ) {
				palSel.value = 'kit:' + idx;
			} else {
				// The kit is gone but its colors travel in the params.
				const o = document.createElement( 'option' );
				o.value = 'kit:saved';
				o.textContent = '★ ' + ( state.kitName || 'Brand Kit' );
				palSel.appendChild( o );
				palSel.value = 'kit:saved';
			}
		} else {
			palSel.value = state.paletteId;
		}
		const dots = ui.el( 'div', 'wpiechaos-dots', colors );
		const customRow = ui.el( 'div', 'wpiechaos-customrow', colors );
		palSel.onchange = () => {
			const v = palSel.value;
			if ( 'auto' === v ) {
				state.paletteId = 'auto';
			} else if ( v.startsWith( 'kit:' ) && 'kit:saved' !== v ) {
				const k = kits[ Number( v.slice( 4 ) ) ];
				state.paletteId = 'kit';
				state.kitName = k.name;
				state.colors = k.colors.slice( 0, 8 );
			} else if ( 'custom' === v ) {
				state.paletteId = 'custom';
				state.colors = state.custom.slice();
			} else if ( 'kit:saved' !== v ) {
				state.paletteId = v;
				state.colors = paletteColors( state );
			}
			syncColors();
			renderDots();
			syncCustomRow();
		};
		const renderDots = () => {
			dots.textContent = '';
			for ( const hex of state.colors ) {
				const d = ui.el( 'span', 'wpiechaos-dot', dots );
				d.style.background = hex;
			}
		};
		const syncCustomRow = () => {
			customRow.style.display =
				'custom' === state.paletteId ? '' : 'none';
		};
		if ( bridge.components && bridge.components.mountColorButton ) {
			state.custom.forEach( ( hex, i ) => {
				const host = ui.el( 'span', 'wpiechaos-colorhost', customRow );
				colorMounts.push(
					bridge.components.mountColorButton( host, {
						color: hex,
						title: t( 'Custom colors' ),
						onChange: ( c ) => {
							state.custom[ i ] = c;
							if ( 'custom' === state.paletteId ) {
								state.colors = state.custom.slice();
								syncColors();
								renderDots();
							}
						},
					} )
				);
			} );
		}
		renderDots();
		syncCustomRow();

		const look = ui.section( side, {
			icon: ICONS.look,
			title: t( 'Look' ),
		} );
		ui.select( ui.row( look, t( 'Medium' ) ), {
			options: [
				{ value: 'auto', label: t( 'Auto (their choice)' ) },
			].concat(
				MEDIA.map( ( m ) => ( { value: m.id, label: t( m.label ) } ) )
			),
			value: state.mediumId,
			onChange: ( v ) => {
				state.mediumId = v;
				applyLook();
			},
		} ).classList.add( 'wpiechaos-medium' );
		ui.select( ui.row( look, t( 'Ground' ) ), {
			options: GROUNDS.map( ( g ) => ( {
				value: g[ 0 ],
				label: t( g[ 1 ] ),
			} ) ),
			value: state.ground,
			onChange: ( v ) => {
				state.ground = v;
				applyLook();
			},
		} );
		const fxSlider = ( key, label ) =>
			ui.slider( look, {
				label,
				min: 0,
				max: 150,
				value: state.fx[ key ],
				format: ( v ) => v + '%',
				onInput: ( v ) => {
					state.fx[ key ] = v;
					applyLook();
				},
			} );
		fxSlider( 'bloom', t( 'Bloom' ) );
		fxSlider( 'dof', t( 'Depth blur' ) );
		fxSlider( 'grain', t( 'Grain' ) );
		fxSlider( 'vignette', t( 'Vignette' ) );

		const pointer = ui.section( side, {
			icon: ICONS.pointer,
			title: t( 'Pointer' ),
		} );
		ui.select( ui.row( pointer, t( 'The pointer' ) ), {
			options: POINTER_MODES.map( ( m ) => ( {
				value: m[ 0 ],
				label: t( m[ 1 ] ),
			} ) ),
			value: state.cursorMode,
			onChange: ( v ) => {
				state.cursorMode = v;
				if ( engine.world ) {
					engine.world.cursor.mode = v;
				}
			},
		} );

		const ex = ui.section( side, {
			icon: ICONS.exportIc,
			title: t( 'Export' ),
		} );
		const filmRow = ui.el( 'div', 'wpiechaos-filmrow', ex );
		const filmBtn = ui.btn( filmRow, {
			label: t( 'Process film' ),
			onClick: () =>
				withFilm( filmBtn, ( blob ) =>
					download( blob, filmName() + '.webm' )
				),
		} );
		// No Media Library exists on the standalone host (the Studio); a
		// button that can only fail is worse than no button.
		if ( ! window.WPIE || ! window.WPIE.standalone ) {
			const filmLib = ui.btn( filmRow, {
				label: t( 'To Media Library' ),
				onClick: () =>
					withFilm( filmLib, ( blob ) =>
						uploadToMedia( blob, 'webm' )
					),
			} );
		}
		ui.el(
			'div',
			'wpiechaos-note',
			ex,
			t(
				'The film records the painting as it happens, from start to stop.'
			)
		);
		if ( runtimeUrl ) {
			const snipRow = ui.el( 'div', 'wpiechaos-filmrow', ex );
			ui.btn( snipRow, {
				label: t( 'Copy snippet' ),
				onClick: copySnippet,
			} );
			ui.el(
				'div',
				'wpiechaos-note',
				ex,
				t(
					'Embed (HTML): the piece paints itself live on your website - a new original for every visitor.'
				)
			);
		}
	}

	// The runtime lives next to the extension bundle, the family pattern.
	// ABSOLUTE on purpose: on the standalone Studio `main` is a relative
	// path, and a snippet carries its URL onto a FOREIGN page, where a
	// relative path points nowhere (the base-URL bug class).
	const runtimeUrl = ( () => {
		const own = ( ( window.WPIE && window.WPIE.extensions ) || [] ).find(
			( x ) => x && 'wpie-chaos-art' === x.slug
		);
		if ( ! own || ! own.main ) {
			return '';
		}
		const rel = String( own.main ).replace(
			/extension\.js([?#].*)?$/,
			'runtime.js'
		);
		try {
			return new URL( rel, document.baseURI ).href;
		} catch ( e ) {
			return rel;
		}
	} )();

	async function copySnippet() {
		// The society itself travels in the snippet; the entropy does NOT -
		// every page load charges its own pool, that is the whole point.
		const embed = {
			styleId: state.styleId,
			movementId: state.movementId,
			mediumId: state.mediumId,
			ground: state.ground,
			cursorMode: state.cursorMode,
			fx: { ...state.fx },
			aspect: [ doc.w || 16, doc.h || 9 ],
		};
		// What stands on "their choice" stays THEIR choice on the page:
		// omitted here, drawn fresh for every visitor by the runtime.
		if ( 'auto' !== state.paletteId ) {
			embed.colors = state.colors.slice();
		}
		if ( ! state.autoTemper ) {
			embed.chaos = state.chaos;
			embed.energy = state.energy;
			embed.density = state.density;
			embed.tempo = state.tempo;
		}
		const json = JSON.stringify( embed ).replace( /'/g, '&#39;' );
		const snippet =
			"<div data-wpie-chaos='" +
			json +
			'\' style="width:100%;aspect-ratio:' +
			( doc.w || 16 ) +
			' / ' +
			( doc.h || 9 ) +
			'"></div>\n<script src="' +
			runtimeUrl +
			'" defer></' +
			'script>';
		try {
			await navigator.clipboard.writeText( snippet );
			setStatus(
				t(
					'Snippet copied - paste it into an HTML block on your site.'
				)
			);
		} catch ( e ) {
			setStatus( t( 'Copy failed.' ), true );
		}
	}

	function applyLook() {
		const s = settingsForEngine();
		engine.applyLook( s.style, s.fx, s.ground, s.movement, s.medium );
	}

	function syncColors() {
		params.colors.length = 0;
		for ( const c of state.colors ) {
			params.colors.push( c );
		}
	}

	renderRight();
	syncTiles();
	engine.mount( view, aspect );
	applyLook();

	/* ------------------------------- exports ------------------------------ */

	function download( blob, name ) {
		const a = document.createElement( 'a' );
		a.href = URL.createObjectURL( blob );
		a.download = name;
		a.click();
		window.setTimeout( () => URL.revokeObjectURL( a.href ), 4000 );
	}

	function filmName() {
		const raw = ( steck && steck.title ) || 'chaos-art';
		return (
			raw
				.toLowerCase()
				.replace( /[^a-z0-9]+/g, '-' )
				.replace( /^-+|-+$/g, '' ) || 'chaos-art'
		);
	}

	async function withFilm( btn, sink ) {
		if ( btn.disabled ) {
			return;
		}
		if ( ! engine.hasRecording() ) {
			setStatus(
				t( 'Nothing recorded yet - the film runs while it paints.' ),
				true
			);
			return;
		}
		const prev = btn.textContent;
		btn.disabled = true;
		btn.textContent = t( 'Preparing…' );
		try {
			const blob = await engine.getRecording();
			if ( ! blob ) {
				setStatus(
					t( 'Recording is not available in this browser.' ),
					true
				);
			} else {
				await sink( blob );
			}
		} catch ( e ) {
			setStatus(
				t( 'Recording is not available in this browser.' ),
				true
			);
		}
		btn.disabled = false;
		btn.textContent = prev;
	}

	async function uploadToMedia( blob, ext ) {
		const boot = window.WPIE || {};
		const restRoot = String( boot.restUrl || '/wp-json/wpie/v1/' ).replace(
			/wpie\/v1\/?$/,
			''
		);
		const res = await window.fetch( restRoot + 'wp/v2/media', {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				'X-WP-Nonce': boot.nonce || '',
				'Content-Disposition':
					'attachment; filename="' + filmName() + '.' + ext + '"',
				'Content-Type': blob.type || 'video/webm',
			},
			body: blob,
		} );
		if ( ! res.ok ) {
			setStatus( t( 'Could not save to the Media Library.' ), true );
			return;
		}
		setStatus( t( 'Saved to Media Library.' ) );
	}

	function chosenStill() {
		if ( -1 === momentAt ) {
			const out = engine.renderStill( 2048 );
			return Promise.resolve( out );
		}
		const item = engine.ring.list()[ momentAt ];
		return Promise.resolve( { url: item.url, w: item.w, h: item.h } );
	}

	/* --------------------------------- foot ------------------------------- */

	const status = ui.el( 'div', 'dsm-hint wpiechaos-status', modal.foot, '' );
	const setStatus = ( msg, bad ) => {
		status.textContent = msg;
		status.classList.toggle( 'is-bad', !! bad );
	};
	if ( ownLayer ) {
		setStatus(
			t(
				'The settings returned; the painting itself will be new - chaos cannot repeat.'
			)
		);
	} else {
		setStatus( t( 'Charge the field, then start painting.' ) );
	}

	const actions = ui.el( 'div', 'dsm-actions', modal.foot );
	ui.btn( actions, {
		label: t( 'Cancel' ),
		onClick: () => {
			cleanup();
			modal.close();
		},
	} );
	const primary = ui.btn( actions, {
		label: ownLayer ? t( 'Update' ) : t( 'Insert as picture' ),
		primary: true,
		onClick: async () => {
			if ( primary.disabled ) {
				return;
			}
			primary.disabled = true;
			try {
				engine.stop();
				const still = await chosenStill();
				if ( ownLayer ) {
					editor.dispatch( {
						type: 'UPDATE_LAYER',
						id: ownLayer.id,
						patch: {
							src: still.url,
							naturalW: still.w,
							naturalH: still.h,
							generator: { id: GEN_ID, params: genParams() },
						},
					} );
				} else {
					// The piece is painted in the document's own
					// proportions; it takes the whole page like a print.
					const layer = bridge.documents.makeImage( {
						name: ( steck && steck.title ) || t( 'Chaos Art' ),
						x: 0,
						y: 0,
						w: doc.w,
						h: doc.h,
						src: still.url,
						naturalW: still.w,
						naturalH: still.h,
					} );
					layer.generator = { id: GEN_ID, params: genParams() };
					editor.dispatch( { type: 'ADD_LAYER', layer } );
					editor.dispatch( { type: 'SET_ACTIVE', id: layer.id } );
				}
				editor.commit( t( 'Chaos Art' ) );
				cleanup();
				modal.close();
			} catch ( e ) {
				primary.disabled = false;
				setStatus(
					( e && e.message ) || t( 'Could not insert.' ),
					true
				);
			}
		},
	} );
	primary.disabled = true;

	function genParams() {
		return {
			styleId: state.styleId,
			movementId: state.movementId,
			mediumId: state.mediumId,
			paletteId: state.paletteId,
			kitName: state.kitName,
			custom: state.custom.slice(),
			colors: params.colors.slice(),
			autoTemper: state.autoTemper,
			ground: state.ground,
			cursorMode: state.cursorMode,
			fx: { ...state.fx },
			chaos: state.chaos,
			energy: state.energy,
			density: state.density,
			tempo: state.tempo,
		};
	}

	/* ------------------------------- heartbeat ---------------------------- */

	let beatAcc = 0;
	engine.onFrame = () => {
		if ( closed ) {
			return;
		}
		beatAcc++;
		if ( beatAcc % 30 ) {
			return;
		}
		primary.disabled = ! engine.painted();
		if ( engine.running ) {
			setStatus(
				t( 'Painting…' ) +
					' · ' +
					engine.painted().toLocaleString() +
					' ' +
					t( 'marks' ) +
					' · ' +
					t( 'time' ) +
					' ×' +
					( engine.world
						? engine.world.timeScale.toFixed( 1 )
						: '1.0' )
			);
		} else if ( started ) {
			setStatus( t( 'Paused - pick a moment, or resume painting.' ) );
		}
	};

	function cleanup() {
		if ( closed ) {
			return;
		}
		closed = true;
		for ( const m of colorMounts ) {
			if ( m.unmount ) {
				m.unmount();
			}
		}
		colorMounts = [];
		engine.dispose();
	}

	// What the studio is doing, for the checks: without a state hook a
	// test can only say "nothing threw".
	window.__wpiechaosEngine = engine;
	window.__wpiechaosState = () => ( {
		styleId: state.styleId,
		movementId: state.movementId,
		run: runPick,
		autoTemper: state.autoTemper,
		started,
		running: engine.running,
		painted: engine.painted(),
		charge: pool.charge(),
		snapshots: engine.ring.size(),
		momentAt,
	} );
}

function styleGradient( s ) {
	const p =
		PALETTES.find( ( x ) => x.id === s.defaultPalette ) || PALETTES[ 0 ];
	const c = p.colors;
	return (
		'linear-gradient(135deg, ' +
		c[ 0 ] +
		' 0%, ' +
		c[ Math.floor( c.length / 2 ) ] +
		' 55%, ' +
		c[ c.length - 1 ] +
		' 100%)'
	);
}

/* -------------------------------- register -------------------------------- */

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Chaos Art',
		run: ( ctx ) => openStudio( ctx ),
		edit: ( ctx ) => openStudio( ctx ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else if ( window.wp && window.wp.hooks ) {
	window.wp.hooks.addAction( 'wpie.ready', 'wpie-chaos-art', register );
}
