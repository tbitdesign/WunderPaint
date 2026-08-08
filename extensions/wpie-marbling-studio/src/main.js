/**
 * Marble Bath (wpie-marbling-studio) - the dialog.
 *
 * The middle column is a water bath, and the user actually MARBLES: drop
 * ink (hold to let it grow, drag to scatter a trail), pull a needle or a
 * comb through, sway the bath, plant a curl. Every gesture becomes one
 * operation in the history; the GPU repaints the whole bath live while
 * the hand is still moving, and undo simply forgets the last move.
 *
 * The left column holds the classic patterns as recipes - Stone, Gel-git,
 * Nonpareil, Chevron, Bouquet, French curls, Peacock - each a seeded
 * starting point over the CURRENT inks that stays fully combable.
 *
 * Layout is the family's: recipes left, the stage in the middle, controls
 * on the right, status and the primary button in the foot.
 */

import { MarblingEngine } from './engine.js';
import {
	mergeParams,
	MAX_OPS,
	OP,
	GALL,
	FLOWER_KINDS,
	RECIPES,
	buildRecipe,
	flowerOps,
	splatterOps,
	replaySchedule,
	ease,
	rng,
} from './marbling.js';
import { t } from './i18n.js';

const GEN_ID = 'wpie-marbling-studio/marbling';
const OUT_SIZE = 1600;
const VIDEO_MAX = 1280;

// The editor's brand mark - every studio badges with it, verbatim.
const ICON_BRAND =
	'<svg width="24" height="24" viewBox="0 0 18.83 18.83" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.84,18.83H3.62c-2,0-3.62-1.62-3.62-3.62V3.52h1.72c.7,0,1.28.57,1.28,1.28v10.43c0,.34.28.62.62.62h8.94c.71,0,1.29.58,1.29,1.29v1.71Z"/><path fill="#3b66ff" d="M18.83,14.02h-1.71c-.71,0-1.29-.58-1.29-1.29V3.62c0-.34-.28-.62-.62-.62H4.82c-.7,0-1.28-.57-1.28-1.28V0h11.67c2,0,3.62,1.62,3.62,3.62v10.4Z"/><circle fill="currentColor" cx="17.33" cy="17.33" r="1.5"/><path fill="#3b66ff" d="M9.51,5.71l.91,2.45c.03.08.09.14.17.17l2.45.91c.07.03.07.13,0,.16l-2.45.91c-.08.03-.14.09-.17.17l-.91,2.45c-.03.07-.13.07-.16,0l-.91-2.45c-.03-.08-.09-.14-.17-.17l-2.45-.91c-.07-.03-.07-.13,0-.16l2.45-.91c.08-.03,.14-.09,.17-.17l.91-2.45c.03-.07,.13-.07,.16,0Z"/></svg>';

const tabIcon = ( d ) =>
	'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
	'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
	d
		.split( ' M' )
		.map( ( p, i ) => '<path d="' + ( i ? 'M' + p : p ) + '"/>' )
		.join( '' ) +
	'</svg>';

const ICONS = {
	cards: tabIcon(
		'M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4 M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4 M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4 M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4'
	),
	tool: tabIcon(
		'M7 3a4 4 0 0 1 4 4v10a4 4 0 0 1 -8 0v-10a4 4 0 0 1 4 -4 M13 7h8 M13 12h8 M13 17h8'
	),
	drop: tabIcon( 'M12 3l4.5 5a6.5 6.5 0 1 1 -9 0z' ),
	needle: tabIcon( 'M5 19L17 7 M17 7a2 2 0 1 0 2 -2' ),
	comb: tabIcon( 'M4 5h16 M6 5v14 M10 5v10 M14 5v14 M18 5v10' ),
	wave: tabIcon(
		'M3 12c2.2 -3.6 5 -3.6 7.2 0s5 3.6 7.2 0 M3 18c2.2 -3.6 5 -3.6 7.2 0s5 3.6 7.2 0'
	),
	vortex: tabIcon(
		'M12 12a2 2 0 0 1 2 2a4 4 0 0 1 -4 4a6 6 0 0 1 -6 -6a8 8 0 0 1 8 -8a9 9 0 0 1 9 9'
	),
	flower: tabIcon(
		'M12 12m-2.1 0a2.1 2.1 0 1 0 4.2 0a2.1 2.1 0 1 0 -4.2 0 M12 6m-2.1 0a2.1 2.1 0 1 0 4.2 0a2.1 2.1 0 1 0 -4.2 0 M12 18m-2.1 0a2.1 2.1 0 1 0 4.2 0a2.1 2.1 0 1 0 -4.2 0 M6 12m-2.1 0a2.1 2.1 0 1 0 4.2 0a2.1 2.1 0 1 0 -4.2 0 M18 12m-2.1 0a2.1 2.1 0 1 0 4.2 0a2.1 2.1 0 1 0 -4.2 0'
	),
	arc: tabIcon( 'M4 18a12 12 0 0 1 15 -11 M19 7l-3.2 -0.4 M19 7l-0.6 3.1' ),
	ringcomb: tabIcon(
		'M12 12m-2.6 0a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0 M12 12m-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0 M12 12m-9.3 0a9.3 9.3 0 1 0 18.6 0a9.3 9.3 0 1 0 -18.6 0'
	),
	splatter: tabIcon(
		'M7 7m-1.4 0a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0 M14 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M18 10m-1.7 0a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0 -3.4 0 M8 15m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M14 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M5 11m-0.8 0a0.8 0.8 0 1 0 1.6 0a0.8 0.8 0 1 0 -1.6 0'
	),
	ink: tabIcon(
		'M12 21a9 9 0 1 1 0 -18a9 8 0 0 1 9 8a4.5 4.5 0 0 1 -4.5 4.5h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 1.75 M8.5 10.5l0 .01 M12.5 7.5l0 .01 M16.5 10.5l0 .01'
	),
	water: tabIcon(
		'M3 10c2 0 3 -1.5 5 -1.5s3 1.5 5 1.5s3 -1.5 5 -1.5s2 1.5 4 1.5 M3 16c2 0 3 -1.5 5 -1.5s3 1.5 5 1.5s3 -1.5 5 -1.5s2 1.5 4 1.5'
	),
	filmSec: tabIcon(
		'M4 5a1 1 0 0 1 1 -1h14a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1z M8 4v16 M16 4v16 M4 9h4 M4 15h4 M16 9h4 M16 15h4'
	),
	exportIc: tabIcon(
		'M14 3v4a1 1 0 0 0 1 1h4 M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2 M12 11v6 M9.5 13.5l2.5 -2.5l2.5 2.5'
	),
	dice: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/></svg>',
	undo: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-4 -4l4 -4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/></svg>',
	trash: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3h6v3"/></svg>',
	sparkle:
		'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="M5.6 5.6l2.8 2.8"/><path d="M15.6 15.6l2.8 2.8"/><path d="M18.4 5.6l-2.8 2.8"/><path d="M8.4 15.6l-2.8 2.8"/></svg>',
	play: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 5l12 7l-12 7z"/></svg>',
	film: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
	eye: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/></svg>',
};

const TOOL_LIST = [
	[ 'drop', 'Ink drop', 'drop' ],
	[ 'flower', 'Flower', 'flower' ],
	[ 'needle', 'Needle', 'needle' ],
	[ 'comb', 'Comb', 'comb' ],
	[ 'arc', 'Arc', 'arc' ],
	[ 'ringcomb', 'Ring comb', 'ringcomb' ],
	[ 'wave', 'Wave', 'wave' ],
	[ 'vortex', 'Curl', 'vortex' ],
	[ 'splatter', 'Splatter', 'splatter' ],
];

const FLOWER_LABELS = {
	tulip: 'Tulip',
	carnation: 'Carnation',
	daisy: 'Daisy',
};

const RECIPE_LABELS = {
	stone: 'Stone',
	gelgit: 'Gel-git',
	nonpareil: 'Nonpareil',
	chevron: 'Chevron',
	bouquet: 'Bouquet',
	curls: 'French curls',
	peacock: 'Peacock',
};

/** Deterministic seed walk - the dice are a Lehmer sequence. */
const nextSeed = ( s ) => ( ( s * 48271 ) % 2147483647 ) % 999983 || 7;

const download = ( blob, name ) => {
	const a = document.createElement( 'a' );
	a.href = URL.createObjectURL( blob );
	a.download = name;
	a.click();
	window.setTimeout( () => URL.revokeObjectURL( a.href ), 4000 );
};

/* -------------------------------- the studio ------------------------------- */

function openStudio( ctx ) {
	const { editor } = ctx || {};
	const boot = window.WPIE || {};
	const bridge = boot.bridge;
	const ui = bridge && bridge.ui;
	if ( ! ui || ! editor ) {
		return;
	}
	const genLayer =
		ctx.layer && ctx.layer.generator && ctx.layer.generator.id === GEN_ID
			? ctx.layer
			: null;
	const editing = !! genLayer;
	const doc = editor.state.doc || { w: 4, h: 3 };
	const docAspect = Math.max(
		0.5,
		Math.min( 2, ( doc.w || 1 ) / ( doc.h || 1 ) )
	);
	let state = mergeParams(
		editing ? genLayer.generator.params : { aspect: docAspect }
	);

	// window.WPIE first - the Brand-Kits dialog REASSIGNS brandKits on it.
	const brandKits = () => {
		const kits =
			( bridge.brand && bridge.brand.kits && bridge.brand.kits() ) ||
			boot.brandKits ||
			[];
		return kits.filter( ( k ) => k && Array.isArray( k.colors ) );
	};

	/* --------------------------------- shell ------------------------------ */

	const host = document.getElementById( 'wpie-root' ) || document.body;
	const backdrop = ui.el( 'div', 'modal-backdrop', host );
	const dialog = ui.el( 'div', 'dsm wpiemb-dialog', backdrop );
	dialog.setAttribute( 'role', 'dialog' );
	dialog.setAttribute( 'aria-label', 'Marble Bath' );
	dialog.onclick = ( e ) => e.stopPropagation();

	const head = ui.el( 'div', 'dsm-head', dialog );
	const badge = ui.el( 'span', 'dsm-badge', head );
	badge.innerHTML = ICON_BRAND;
	const titles = ui.el( 'div', 'dsm-titles', head );
	ui.el(
		'span',
		'dsm-title',
		ui.el( 'div', 'dsm-title-row', titles ),
		'Marble Bath'
	);
	ui.el(
		'div',
		'dsm-sub',
		titles,
		t( 'A water bath: drop ink, pull combs, marble like on real water.' )
	);
	const closeBtn = ui.el( 'button', 'dsm-close', head );
	closeBtn.setAttribute( 'aria-label', 'Close' );
	closeBtn.innerHTML =
		'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
	closeBtn.onclick = () => close();

	const modal = {
		body: ui.el( 'div', 'dsm-body', dialog ),
		foot: ui.el( 'div', 'dsm-foot', dialog ),
	};
	const body = ui.el( 'div', 'wpiemb-body', modal.body );
	const left = ui.el( 'div', 'wpiemb-left', body );
	const view = ui.el( 'div', 'wpiemb-view', body );
	const side = ui.el( 'div', 'wpiemb-side', body );

	const stage = ui.el( 'div', 'wpiemb-stage', view );
	const canvas = ui.el( 'canvas', 'wpiemb-canvas', stage );
	const guide = ui.el( 'canvas', 'wpiemb-guide', stage );
	const hint = ui.el(
		'div',
		'wpiemb-hint',
		view,
		t( 'Click to drop ink · hold to let it grow · drag a tool through' )
	);
	void hint;
	const busy = ui.el( 'div', 'wpiemb-busy', view, '' );
	busy.style.display = 'none';

	const toasts = ( ctx.extras && ctx.extras.toasts ) || {
		error: ( m ) => window.console && window.console.error( m ),
		success: () => {},
	};

	const engine = new MarblingEngine( canvas );
	let replaying = false;

	/* ------------------------------ show document -------------------------- */

	let docBg = false;
	let docBgUrl = null;
	let docBgBusy = false;
	const rasterBridge = bridge.raster || null;
	const canDocBg = !! (
		rasterBridge &&
		rasterBridge.renderToCanvas &&
		editor.state &&
		editor.state.doc
	);
	const docBtn = ui.el( 'button', 'wpiemb-docbtn', view );
	docBtn.type = 'button';
	docBtn.innerHTML = ICONS.eye + '<span>' + t( 'Show document' ) + '</span>';
	docBtn.title = t( 'Preview on your current design.' );
	if ( ! canDocBg ) {
		docBtn.style.display = 'none';
	}
	const captureDocBg = async () => {
		const st = editor.state;
		const d = st.doc;
		const full = await rasterBridge.renderToCanvas(
			d,
			( st.layers || [] ).filter(
				( l ) => ! ( editing && genLayer && l.id === genLayer.id )
			),
			{
				scale: Math.min( 1, 1400 / Math.max( d.w || 1, d.h || 1 ) ),
				cache: rasterBridge.sharedImageCache,
			}
		);
		const out = document.createElement( 'canvas' );
		out.width = Math.max( 2, full.width );
		out.height = Math.max( 2, full.height );
		const g = out.getContext( '2d' );
		if ( 'string' === typeof d.bg && d.bg && 'transparent' !== d.bg ) {
			g.fillStyle = d.bg;
			g.fillRect( 0, 0, out.width, out.height );
		}
		g.drawImage( full, 0, 0 );
		return out.toDataURL( 'image/png' );
	};
	const updateDocBg = () => {
		const on = canDocBg && docBg;
		docBtn.setAttribute( 'aria-pressed', docBg ? 'true' : 'false' );
		stage.classList.toggle( 'is-doc', on && !! docBgUrl );
		stage.style.backgroundImage =
			on && docBgUrl ? 'url(' + docBgUrl + ')' : '';
		if ( on && ! docBgUrl && ! docBgBusy ) {
			docBgBusy = true;
			captureDocBg()
				.then( ( url ) => {
					docBgUrl = url;
					docBgBusy = false;
					updateDocBg();
				} )
				.catch( () => {
					docBg = false;
					docBgBusy = false;
					updateDocBg();
					toasts.error( t( 'Could not render the document.' ) );
				} );
		}
	};
	docBtn.onclick = () => {
		docBg = ! docBg;
		updateDocBg();
	};

	/* --------------------------------- cards ------------------------------- */

	function card( parent, title, icon ) {
		const box = ui.el( 'div', 'wpiemb-card', parent );
		const headRow = ui.el( 'div', 'wpiemb-cardhead', box );
		if ( icon ) {
			const ic = ui.el( 'span', 'wpiemb-cardicon', headRow );
			ic.innerHTML = icon;
		}
		ui.el( 'span', 'wpiemb-cardtitle', headRow, title );
		return ui.el( 'div', 'wpiemb-cardbody', box );
	}

	function row( parent, label, min, max, step, value, onChange, fmt ) {
		const r = ui.el( 'div', 'wpiemb-row', parent );
		ui.el( 'span', 'wpiemb-label', r, label );
		const input = ui.el( 'input', 'dsm-range', r );
		input.type = 'range';
		input.min = String( min );
		input.max = String( max );
		input.step = String( step );
		input.value = String( value );
		const out = ui.el(
			'span',
			'wpiemb-value',
			r,
			fmt ? fmt( value ) : String( value )
		);
		input.oninput = () => {
			const v = Number( input.value );
			out.textContent = fmt ? fmt( v ) : String( v );
			onChange( v );
		};
		return input;
	}

	function chips( parent, label, list, current, onPick ) {
		if ( label ) {
			const r = ui.el( 'div', 'wpiemb-row', parent );
			ui.el( 'span', 'wpiemb-label', r, label );
		}
		const wrap = ui.el( 'div', 'wpiemb-chips', parent );
		list.forEach( ( [ id, lbl, icon ] ) => {
			const chip = ui.el(
				'button',
				'wpiemb-chip' + ( id === current ? ' is-on' : '' ),
				wrap
			);
			chip.type = 'button';
			chip.innerHTML = icon
				? ICONS[ icon ] + '<span>' + lbl + '</span>'
				: lbl;
			chip.onclick = () => onPick( id );
		} );
		return wrap;
	}

	/* -------------------------------- left column --------------------------- */

	const recipesBox = card( left, t( 'Patterns' ), ICONS.cards );
	ui.el(
		'div',
		'wpiemb-note',
		recipesBox,
		t( 'A seeded start over your inks - keep marbling on top of it.' )
	);
	const recipeEls = {};
	for ( const r of RECIPES ) {
		const el = ui.el(
			'button',
			'wpiemb-card-btn',
			recipesBox,
			t( RECIPE_LABELS[ r.id ] || r.label )
		);
		el.type = 'button';
		el.onclick = () => applyRecipe( r.id );
		recipeEls[ r.id ] = el;
	}
	const seedRow = ui.el( 'div', 'wpiemb-row wpiemb-seedrow', recipesBox );
	ui.el( 'span', 'wpiemb-label', seedRow, t( 'Seed' ) );
	const seedInput = ui.el( 'input', 'dsm-input wpiemb-seed', seedRow );
	seedInput.type = 'number';
	seedInput.value = String( state.seed );
	seedInput.onchange = () => {
		state.seed = Number( seedInput.value ) || 7;
		if ( state.recipe ) {
			applyRecipe( state.recipe );
		}
	};
	const diceBtn = ui.el( 'button', 'wpiemb-chip', seedRow );
	diceBtn.type = 'button';
	diceBtn.innerHTML = ICONS.dice;
	diceBtn.title = t( 'New seed' );
	diceBtn.onclick = () => {
		state.seed = nextSeed( state.seed );
		seedInput.value = String( state.seed );
		if ( state.recipe ) {
			applyRecipe( state.recipe );
		}
	};

	const actionsBox = card( left, t( 'Bath' ), ICONS.water );
	const actRow = ui.el( 'div', 'wpiemb-btncol', actionsBox );
	const sprinkleBtn = ui.el( 'button', 'wpiemb-action', actRow );
	sprinkleBtn.type = 'button';
	sprinkleBtn.innerHTML =
		ICONS.sparkle + '<span>' + t( 'Sprinkle drops' ) + '</span>';
	sprinkleBtn.onclick = () => {
		const rand = rng( state.seed + state.ops.length * 131 );
		const ops = state.ops.slice();
		let added = 0;
		for ( let i = 0; i < 16 && ops.length < MAX_OPS; i++ ) {
			ops.push( [
				OP.DROP,
				0.05 + rand() * ( state.aspect - 0.1 ),
				0.05 + rand() * 0.9,
				0.016 + rand() * 0.05,
				Math.floor( rand() * state.inks.length ),
			] );
			added++;
		}
		if ( added ) {
			state.groups.push( added );
		}
		setOps( ops );
	};
	const undoBtn = ui.el( 'button', 'wpiemb-action', actRow );
	undoBtn.type = 'button';
	undoBtn.innerHTML =
		ICONS.undo + '<span>' + t( 'Undo last move' ) + '</span>';
	undoBtn.onclick = () => undoGroup();
	// Clearing throws a performance away - the button asks by turning red
	// once, never with a popup.
	let clearArmed = 0;
	const clearBtn = ui.el( 'button', 'wpiemb-action', actRow );
	clearBtn.type = 'button';
	const clearIdle =
		ICONS.trash + '<span>' + t( 'Empty the bath' ) + '</span>';
	clearBtn.innerHTML = clearIdle;
	clearBtn.onclick = () => {
		if ( ! state.ops.length ) {
			return;
		}
		if ( Date.now() - clearArmed < 2600 ) {
			clearArmed = 0;
			clearBtn.classList.remove( 'is-armed' );
			clearBtn.innerHTML = clearIdle;
			state.recipe = '';
			state.groups = [];
			setOps( [] );
			return;
		}
		clearArmed = Date.now();
		clearBtn.classList.add( 'is-armed' );
		clearBtn.innerHTML =
			ICONS.trash + '<span>' + t( 'Really empty?' ) + '</span>';
		window.setTimeout( () => {
			if ( clearArmed ) {
				clearArmed = 0;
				clearBtn.classList.remove( 'is-armed' );
				clearBtn.innerHTML = clearIdle;
			}
		}, 2600 );
	};

	/* -------------------------------- side column --------------------------- */

	let mounts = [];
	const unmountAll = () => {
		for ( const m of mounts ) {
			try {
				m.unmount();
			} catch ( e ) {}
		}
		mounts = [];
	};
	let activeInk = 0;
	let lastRealInk = 0;

	function renderSide() {
		const scrollTop = side.scrollTop;
		unmountAll();
		side.textContent = '';
		const p = state;

		/* -- Tool -- */
		const tw = card( side, t( 'Tool' ), ICONS.tool );
		chips(
			tw,
			null,
			TOOL_LIST.map( ( [ id, lbl, icon ] ) => [ id, t( lbl ), icon ] ),
			p.tool,
			( id ) => {
				state.tool = id;
				renderSide();
				syncStatus();
			}
		);
		if ( 'flower' === p.tool ) {
			const kr = ui.el( 'div', 'wpiemb-row', tw );
			ui.el( 'span', 'wpiemb-label', kr, t( 'Flower' ) );
			const ksel = ui.el( 'select', 'dsm-select', kr );
			for ( const k of FLOWER_KINDS ) {
				const o = ui.el(
					'option',
					null,
					ksel,
					t( FLOWER_LABELS[ k ] )
				);
				o.value = k;
			}
			ksel.value = p.flowerKind;
			ksel.onchange = () => {
				state.flowerKind = ksel.value;
			};
			row(
				tw,
				t( 'Size' ),
				0.06,
				0.3,
				0.005,
				p.flowerSize,
				( v ) => {
					state.flowerSize = v;
				},
				( v ) => Math.round( v * 100 ) + '%'
			);
			row( tw, t( 'Petals' ), 4, 14, 1, p.petals, ( v ) => {
				state.petals = v;
			} );
			ui.check( tw, {
				label: t( 'With stem' ),
				checked: p.stem,
				onChange: ( v ) => {
					state.stem = v;
				},
			} );
			ui.el(
				'div',
				'wpiemb-note',
				tw,
				t(
					'Click plants the flower; drag turns it and sets its size. The stem uses the last ink well.'
				)
			);
		}
		if ( 'arc' === p.tool || 'ringcomb' === p.tool ) {
			row( tw, t( 'Force' ), 0.05, 1.2, 0.05, p.arcForce, ( v ) => {
				state.arcForce = v;
			} );
			if ( 'ringcomb' === p.tool ) {
				row(
					tw,
					t( 'Tooth spacing' ),
					0.03,
					0.3,
					0.005,
					p.spacing,
					( v ) => {
						state.spacing = v;
					},
					( v ) => Math.round( v * 100 ) + '%'
				);
			}
			row(
				tw,
				t( 'Softness' ),
				0.004,
				0.09,
				0.002,
				p.softness,
				( v ) => {
					state.softness = v;
				},
				( v ) => Math.round( v * 1000 ) / 10 + '%'
			);
			ui.el(
				'div',
				'wpiemb-note',
				tw,
				t(
					'Press at the centre, drag out to the radius; right pulls clockwise.'
				)
			);
		}
		if ( 'splatter' === p.tool ) {
			row(
				tw,
				t( 'Drop size' ),
				0.012,
				0.16,
				0.002,
				p.dropSize,
				( v ) => {
					state.dropSize = v;
				},
				( v ) => Math.round( v * 1000 ) / 10 + '%'
			);
			ui.el(
				'div',
				'wpiemb-note',
				tw,
				t( 'Flick across the bath to spray a fan of tiny drops.' )
			);
		}
		if ( 'drop' === p.tool ) {
			row(
				tw,
				t( 'Drop size' ),
				0.012,
				0.16,
				0.002,
				p.dropSize,
				( v ) => {
					state.dropSize = v;
				},
				( v ) => Math.round( v * 1000 ) / 10 + '%'
			);
			const ringRow = ui.el( 'div', 'wpiemb-row', tw );
			ui.el( 'span', 'wpiemb-label', ringRow, t( 'Rings' ) );
			const ringSel = ui.el( 'select', 'dsm-select', ringRow );
			for ( const n of [ 1, 3, 5, 7 ] ) {
				const o = ui.el(
					'option',
					null,
					ringSel,
					1 === n ? t( 'Single drop' ) : String( n )
				);
				o.value = String( n );
			}
			ringSel.value = String( p.rings );
			ringSel.onchange = () => {
				state.rings = Number( ringSel.value );
			};
			ui.el(
				'div',
				'wpiemb-note',
				tw,
				t( 'Hold to grow the drop; drag to scatter a trail.' )
			);
		}
		if ( 'needle' === p.tool || 'comb' === p.tool ) {
			if ( 'comb' === p.tool ) {
				row(
					tw,
					t( 'Tooth spacing' ),
					0.03,
					0.4,
					0.005,
					p.spacing,
					( v ) => {
						state.spacing = v;
					},
					( v ) => Math.round( v * 100 ) + '%'
				);
			}
			row(
				tw,
				t( 'Softness' ),
				0.004,
				0.09,
				0.002,
				p.softness,
				( v ) => {
					state.softness = v;
				},
				( v ) => Math.round( v * 1000 ) / 10 + '%'
			);
			ui.el(
				'div',
				'wpiemb-note',
				tw,
				t( 'Drag through the bath; the pull length is the force.' )
			);
		}
		if ( 'wave' === p.tool ) {
			row(
				tw,
				t( 'Sway' ),
				0.01,
				0.16,
				0.005,
				p.waveAmp,
				( v ) => {
					state.waveAmp = v;
				},
				( v ) => Math.round( v * 100 ) + '%'
			);
			row(
				tw,
				t( 'Wavelength' ),
				0.08,
				0.9,
				0.01,
				p.waveLen,
				( v ) => {
					state.waveLen = v;
				},
				( v ) => Math.round( v * 100 ) + '%'
			);
			ui.el(
				'div',
				'wpiemb-note',
				tw,
				t( 'Drag along the direction the water should sway.' )
			);
		}
		if ( 'vortex' === p.tool ) {
			row(
				tw,
				t( 'Curl radius' ),
				0.05,
				0.5,
				0.01,
				p.vortexRadius,
				( v ) => {
					state.vortexRadius = v;
				},
				( v ) => Math.round( v * 100 ) + '%'
			);
			ui.el(
				'div',
				'wpiemb-note',
				tw,
				t( 'Drag right to curl clockwise, left to curl the other way.' )
			);
		}

		/* -- Inks -- */
		const co = card( side, t( 'Inks' ), ICONS.ink );
		const inkRow = ui.el( 'div', 'wpiemb-inks', co );
		p.inks.forEach( ( c, i ) => {
			const b = ui.el(
				'button',
				'wpiemb-ink' + ( i === activeInk ? ' is-on' : '' ),
				inkRow
			);
			b.type = 'button';
			b.style.background = c;
			b.title = t( 'Ink' ) + ' ' + ( i + 1 );
			b.onclick = () => {
				activeInk = i;
				lastRealInk = i;
				renderSide();
			};
		} );
		// The gall well: ox gall in the real workshop - it displaces the
		// colours exactly like ink, but what it leaves behind is water.
		const gallBtn = ui.el(
			'button',
			'wpiemb-ink wpiemb-gall' + ( GALL === activeInk ? ' is-on' : '' ),
			inkRow
		);
		gallBtn.type = 'button';
		gallBtn.title = t( 'Gall (clear drop)' );
		gallBtn.onclick = () => {
			activeInk = GALL;
			renderSide();
		};
		if ( GALL !== activeInk ) {
			const editRow = ui.el( 'div', 'wpiemb-row', co );
			ui.el( 'span', 'wpiemb-label', editRow, t( 'Active ink' ) );
			const mountNode = ui.el( 'div', null, editRow );
			if ( bridge.components && bridge.components.mountColorButton ) {
				mounts.push(
					bridge.components.mountColorButton( mountNode, {
						color: p.inks[ activeInk ],
						onChange: ( c ) => {
							const inks = state.inks.slice();
							inks[ activeInk ] = c;
							state.inks = inks;
							syncInks();
						},
						title: t( 'Active ink' ),
					} )
				);
			}
		} else {
			ui.el(
				'div',
				'wpiemb-note',
				co,
				t(
					'The gall drop pushes the colours aside and leaves open water.'
				)
			);
		}
		const kits = brandKits();
		if ( kits.length ) {
			const kitRow = ui.el( 'div', 'wpiemb-row', co );
			const kitBtn = ui.el(
				'button',
				'wpiemb-chip',
				kitRow,
				t( 'Use brand colors' )
			);
			kitBtn.type = 'button';
			let kitSel = null;
			if ( kits.length > 1 ) {
				kitSel = ui.el( 'select', 'dsm-select', kitRow );
				for ( const k of kits ) {
					const o = ui.el(
						'option',
						null,
						kitSel,
						k.name || String( k.id )
					);
					o.value = String( k.id );
				}
			}
			kitBtn.onclick = () => {
				const kit = kitSel
					? kits.find( ( k ) => String( k.id ) === kitSel.value ) ||
					  kits[ 0 ]
					: kits[ 0 ];
				const cols = ( kit.colors || [] ).filter( ( c ) =>
					/^#[0-9a-f]{6}$/i.test( String( c ) )
				);
				if ( ! cols.length ) {
					return;
				}
				state.inks = state.inks.map(
					( c, i ) => cols[ i % cols.length ]
				);
				renderSide();
				syncInks();
			};
		}

		/* -- Water -- */
		const wa = card( side, t( 'Water' ), ICONS.water );
		const bathRow = ui.el( 'div', 'wpiemb-row', wa );
		ui.el( 'span', 'wpiemb-label', bathRow, t( 'Water color' ) );
		const bathNode = ui.el( 'div', null, bathRow );
		if ( bridge.components && bridge.components.mountColorButton ) {
			mounts.push(
				bridge.components.mountColorButton( bathNode, {
					color: p.bath,
					onChange: ( c ) => {
						state.bath = c;
						syncInks();
					},
					title: t( 'Water color' ),
				} )
			);
		}
		ui.check( wa, {
			label: t( 'Clear water (transparent)' ),
			checked: p.bathClear,
			onChange: ( v ) => {
				state.bathClear = v;
				syncInks();
			},
		} );
		ui.el(
			'div',
			'wpiemb-note',
			wa,
			t( 'Clear water marbles veins straight over your design.' )
		);
		row( wa, t( 'Pigment' ), 0, 1, 0.05, p.veins, ( v ) => {
			state.veins = v;
			syncInks();
		} );
		row( wa, t( 'Paper grain' ), 0, 1, 0.05, p.paper, ( v ) => {
			state.paper = v;
			syncInks();
		} );

		/* -- Film -- */
		const fi = card( side, t( 'Film' ), ICONS.filmSec );
		const modeRow = ui.el( 'div', 'wpiemb-row', fi );
		ui.el( 'span', 'wpiemb-label', modeRow, t( 'Motion' ) );
		const modeSel = ui.el( 'select', 'dsm-select', modeRow );
		for ( const [ v, label ] of [
			[ 'grow', t( 'The making, replayed' ) ],
			[ 'water', t( 'Living water loop' ) ],
		] ) {
			const o = ui.el( 'option', null, modeSel, label );
			o.value = v;
		}
		modeSel.value = p.video;
		modeSel.onchange = () => {
			state.video = modeSel.value;
			renderSide();
		};
		if ( 'water' === p.video ) {
			row( fi, t( 'Sway' ), 0.1, 1, 0.05, p.waterAmp, ( v ) => {
				state.waterAmp = v;
			} );
			row(
				fi,
				t( 'Loop' ),
				2,
				16,
				1,
				p.loop,
				( v ) => {
					state.loop = v;
				},
				( v ) => v + 's'
			);
		}
		const prevBtn = ui.el( 'button', 'wpiemb-chip', fi );
		prevBtn.type = 'button';
		prevBtn.innerHTML = ICONS.play + ' ' + t( 'Preview' );
		prevBtn.onclick = () => playPreview();
		if ( engine.cpu ) {
			ui.el(
				'div',
				'wpiemb-note',
				fi,
				t( 'Video export needs WebGL2, which this browser lacks.' )
			);
		} else {
			const vidRow = ui.el( 'div', 'wpiemb-btnrow', fi );
			const vidBtn = ui.el( 'button', 'ai-btn secondary', vidRow );
			vidBtn.type = 'button';
			vidBtn.innerHTML = ICONS.film + ' ' + t( 'Video (WebM)' );
			vidBtn.onclick = () =>
				recordAnd( vidBtn, ( blob, ext ) =>
					download( blob, 'marbling.' + ext )
				);
			const vidLib = ui.el( 'button', 'ai-btn secondary', vidRow );
			vidLib.type = 'button';
			vidLib.innerHTML = ICONS.film + ' ' + t( 'To Media Library' );
			vidLib.onclick = () => recordAnd( vidLib, uploadToMedia );
		}

		side.scrollTop = scrollTop;
	}

	/* ------------------------------ state -> engine ------------------------- */

	function syncInks() {
		engine.setState( {
			inks: state.inks,
			bath: state.bath,
			bathClear: state.bathClear,
			ops: state.ops,
			aspect: state.aspect,
			veins: state.veins,
			paper: state.paper,
		} );
		engine.render();
		syncStatus();
	}

	function setOps( ops, silent ) {
		state.ops = ops;
		// Always the FULL state: a fresh dialog's first recipe must not
		// render with the engine's empty starting inks (every drop black).
		engine.setState( {
			ops,
			aspect: state.aspect,
			inks: state.inks,
			bath: state.bath,
			bathClear: state.bathClear,
			veins: state.veins,
			paper: state.paper,
		} );
		if ( ! silent ) {
			engine.render();
			syncStatus();
		}
	}

	/*
	 * Undo works in GESTURES, not raw ops: a flower is a dozen ops but
	 * one move, a splatter stroke likewise. `groups` partitions the
	 * committed history; anything beyond the partition is the gesture
	 * currently in flight.
	 */
	const sumGroups = () => state.groups.reduce( ( a, b ) => a + b, 0 );

	const commitGesture = () => {
		const extra = state.ops.length - sumGroups();
		if ( extra > 0 ) {
			state.groups.push( extra );
		}
	};

	const cancelToCommitted = () => {
		setOps( state.ops.slice( 0, sumGroups() ) );
	};

	const undoGroup = () => {
		if ( ! state.groups.length ) {
			return;
		}
		const n = state.groups.pop();
		setOps( state.ops.slice( 0, state.ops.length - n ) );
	};

	function applyRecipe( id ) {
		state.recipe = id;
		const ops = buildRecipe(
			id,
			state.seed,
			state.aspect,
			state.inks.length
		);
		state.groups = ops.length ? [ ops.length ] : [];
		setOps( ops );
		for ( const rid of Object.keys( recipeEls ) ) {
			recipeEls[ rid ].classList.toggle( 'is-on', rid === id );
		}
	}

	/* -------------------------------- gestures ------------------------------ */

	const guideCtx = guide.getContext( '2d' );
	let gesture = null;

	const toBath = ( e ) => {
		const r = canvas.getBoundingClientRect();
		return {
			x: ( ( e.clientX - r.left ) / r.width ) * state.aspect,
			y: ( e.clientY - r.top ) / r.height,
		};
	};
	const toPx = ( p ) => {
		return {
			x: ( p.x / state.aspect ) * guide.width,
			y: p.y * guide.height,
			scale: guide.width / state.aspect,
		};
	};

	const clearGuide = () =>
		guideCtx.clearRect( 0, 0, guide.width, guide.height );

	function drawGuide( a, b, tool ) {
		clearGuide();
		const A = toPx( a );
		const B = toPx( b );
		const g = guideCtx;
		g.strokeStyle = 'rgba(255,255,255,0.85)';
		g.fillStyle = 'rgba(255,255,255,0.85)';
		g.lineWidth = 1.5;
		g.setLineDash( [] );
		if ( 'vortex' === tool ) {
			g.beginPath();
			g.arc( A.x, A.y, state.vortexRadius * A.scale, 0, Math.PI * 2 );
			g.setLineDash( [ 5, 5 ] );
			g.stroke();
			return;
		}
		if ( 'arc' === tool || 'ringcomb' === tool || 'flower' === tool ) {
			const R = Math.max(
				4,
				Math.hypot( B.x - A.x, B.y - A.y ) || state.flowerSize * A.scale
			);
			g.setLineDash( [ 5, 5 ] );
			g.beginPath();
			g.arc( A.x, A.y, R, 0, Math.PI * 2 );
			g.stroke();
			if ( 'ringcomb' === tool ) {
				const sp = state.spacing * 0.8 * A.scale;
				for ( const off of [ -sp, sp ] ) {
					if ( R + off > 4 ) {
						g.beginPath();
						g.arc( A.x, A.y, R + off, 0, Math.PI * 2 );
						g.stroke();
					}
				}
			}
			if ( 'flower' === tool ) {
				g.beginPath();
				g.moveTo( A.x, A.y );
				g.lineTo( B.x, B.y );
				g.stroke();
			}
			return;
		}
		g.beginPath();
		g.moveTo( A.x, A.y );
		g.lineTo( B.x, B.y );
		g.stroke();
		if ( 'comb' === tool ) {
			// The comb's teeth, perpendicular to the pull.
			const dx = B.x - A.x;
			const dy = B.y - A.y;
			const L = Math.hypot( dx, dy ) || 1;
			const nx = -dy / L;
			const ny = dx / L;
			const sp = state.spacing * A.scale;
			g.setLineDash( [ 3, 4 ] );
			for ( let k = -6; k <= 6; k++ ) {
				if ( ! k ) {
					continue;
				}
				g.beginPath();
				g.moveTo( A.x + nx * sp * k, A.y + ny * sp * k );
				g.lineTo( A.x + nx * sp * k + dx, A.y + ny * sp * k + dy );
				g.stroke();
			}
		}
	}

	canvas.addEventListener( 'pointerdown', ( e ) => {
		if ( replaying || state.ops.length >= MAX_OPS ) {
			if ( state.ops.length >= MAX_OPS ) {
				toasts.error( t( 'The bath is full - undo a move first.' ) );
			}
			return;
		}
		e.preventDefault();
		try {
			// Synthetic events (QA) have no active pointer to capture.
			canvas.setPointerCapture( e.pointerId );
		} catch ( err ) {}
		const p = toBath( e );
		const tool = state.tool;
		state.recipe = state.recipe; // a manual move keeps the recipe tag
		if ( 'drop' === tool ) {
			const ops = state.ops.slice();
			if ( state.rings > 1 ) {
				let added = 0;
				for (
					let i = 0;
					i < state.rings && ops.length < MAX_OPS;
					i++
				) {
					// With the gall active, rings alternate water and the
					// last real ink - the classic gall bullseye.
					const ink =
						GALL === activeInk
							? i % 2
								? lastRealInk
								: GALL
							: ( activeInk + i ) % state.inks.length;
					ops.push( [ OP.DROP, p.x, p.y, state.dropSize, ink ] );
					added++;
				}
				if ( added ) {
					state.groups.push( added );
				}
				setOps( ops );
				gesture = { tool, done: true };
				return;
			}
			ops.push( [ OP.DROP, p.x, p.y, 0.012, activeInk ] );
			setOps( ops );
			gesture = {
				tool,
				at: p,
				start: performance.now(),
				chain: false,
				lastDrop: p,
			};
			const grow = ( now ) => {
				if ( ! gesture || 'drop' !== gesture.tool || gesture.chain ) {
					return;
				}
				const r = Math.min(
					0.16,
					0.012 + ( ( now - gesture.start ) / 1000 ) * 0.055
				);
				const ops2 = state.ops.slice();
				ops2[ ops2.length - 1 ] = [
					OP.DROP,
					gesture.at.x,
					gesture.at.y,
					r,
					activeInk,
				];
				setOps( ops2 );
				gesture.raf = window.requestAnimationFrame( grow );
			};
			gesture.raf = window.requestAnimationFrame( grow );
			return;
		}
		if ( 'flower' === tool ) {
			gesture = { tool, at: p, base: state.ops.slice() };
			rebuildFlower( p, state.flowerSize, 0 );
			return;
		}
		if ( 'splatter' === tool ) {
			gesture = {
				tool,
				at: p,
				last: p,
				rand: rng( state.seed + state.ops.length * 31 ),
			};
			return;
		}
		gesture = { tool, at: p, cur: p };
		const alpha0 = 0.001;
		if ( 'arc' === tool || 'ringcomb' === tool ) {
			pushLive(
				'ringcomb' === tool
					? [
							OP.RING,
							p.x,
							p.y,
							0.06,
							0.01,
							state.softness * 1.6,
							state.spacing * 0.8,
					  ]
					: [ OP.ARC, p.x, p.y, 0.06, 0.01, state.softness * 1.6 ]
			);
			drawGuide( p, p, tool );
			return;
		}
		if ( 'needle' === tool ) {
			pushLive( [ OP.TINE, p.x, p.y, 0, 1, alpha0, state.softness ] );
		} else if ( 'comb' === tool ) {
			pushLive( [
				OP.COMB,
				p.x,
				p.y,
				0,
				1,
				alpha0,
				state.softness,
				state.spacing,
			] );
		} else if ( 'wave' === tool ) {
			pushLive( [ OP.WAVE, 0, 1, 0.001, state.waveLen, 0 ] );
		} else if ( 'vortex' === tool ) {
			pushLive( [ OP.VORTEX, p.x, p.y, 0.001, state.vortexRadius ] );
			drawGuide( p, p, 'vortex' );
		}
	} );

	function rebuildFlower( at, size, rotDeg ) {
		const inkA = GALL === activeInk ? lastRealInk : activeInk;
		const real = state.inks.length;
		const ops = gesture.base.concat(
			flowerOps( state.flowerKind, at.x, at.y, size, rotDeg, {
				petals: state.petals,
				stem: state.stem,
				inkA,
				inkB: ( inkA + 1 ) % real,
				inkStem: real - 1,
			} )
		);
		setOps( ops.slice( 0, MAX_OPS ) );
	}

	function pushLive( op ) {
		const ops = state.ops.slice();
		ops.push( op );
		setOps( ops );
		gesture.liveIndex = ops.length - 1;
	}

	function replaceLive( op ) {
		const ops = state.ops.slice();
		ops[ gesture.liveIndex ] = op;
		setOps( ops );
	}

	canvas.addEventListener( 'pointermove', ( e ) => {
		if ( ! gesture || gesture.done ) {
			return;
		}
		const p = toBath( e );
		const g = gesture;
		g.cur = p;
		if ( 'drop' === g.tool ) {
			const moved = Math.hypot( p.x - g.at.x, p.y - g.at.y );
			if ( ! g.chain && moved > 0.035 ) {
				g.chain = true;
				g.rand = rng( state.seed + state.ops.length * 17 );
			}
			if (
				g.chain &&
				Math.hypot( p.x - g.lastDrop.x, p.y - g.lastDrop.y ) >
					state.dropSize * 1.5 &&
				state.ops.length < MAX_OPS
			) {
				const ops = state.ops.slice();
				ops.push( [
					OP.DROP,
					p.x,
					p.y,
					state.dropSize * ( 0.7 + g.rand() * 0.6 ),
					activeInk,
				] );
				setOps( ops );
				g.lastDrop = p;
			}
			return;
		}
		const dx = p.x - g.at.x;
		const dy = p.y - g.at.y;
		const L = Math.hypot( dx, dy );
		if ( 'flower' === g.tool ) {
			if ( L > 0.02 ) {
				const size = Math.max( 0.06, Math.min( 0.3, L ) );
				const rotDeg = ( Math.atan2( dx, -dy ) * 180 ) / Math.PI;
				rebuildFlower( g.at, size, rotDeg );
				drawGuide( g.at, p, 'flower' );
			}
			return;
		}
		if ( 'splatter' === g.tool ) {
			if (
				Math.hypot( p.x - g.last.x, p.y - g.last.y ) > 0.05 &&
				state.ops.length < MAX_OPS
			) {
				const ops = state.ops.concat(
					splatterOps(
						g.rand,
						g.last.x,
						g.last.y,
						p.x,
						p.y,
						Math.max( 0.004, state.dropSize * 0.4 ),
						activeInk
					)
				);
				setOps( ops.slice( 0, MAX_OPS ) );
				g.last = p;
			}
			return;
		}
		if ( 'arc' === g.tool || 'ringcomb' === g.tool ) {
			if ( L < 0.03 ) {
				return;
			}
			const dir = dx >= 0 ? 1 : -1;
			const alpha = dir * state.arcForce * ( 0.35 + L * 0.7 );
			replaceLive(
				'ringcomb' === g.tool
					? [
							OP.RING,
							g.at.x,
							g.at.y,
							L,
							alpha,
							state.softness * 1.6,
							state.spacing * 0.8,
					  ]
					: [ OP.ARC, g.at.x, g.at.y, L, alpha, state.softness * 1.6 ]
			);
			drawGuide( g.at, p, g.tool );
			return;
		}
		if ( 'needle' === g.tool || 'comb' === g.tool ) {
			if ( L < 0.004 ) {
				return;
			}
			const ux = dx / L;
			const uy = dy / L;
			const alpha = Math.min( 1.2, L * 0.95 );
			replaceLive(
				'comb' === g.tool
					? [
							OP.COMB,
							g.at.x,
							g.at.y,
							ux,
							uy,
							alpha,
							state.softness,
							state.spacing,
					  ]
					: [ OP.TINE, g.at.x, g.at.y, ux, uy, alpha, state.softness ]
			);
			drawGuide( g.at, p, g.tool );
		} else if ( 'wave' === g.tool ) {
			if ( L < 0.01 ) {
				return;
			}
			const ux = dx / L;
			const uy = dy / L;
			const amp = state.waveAmp * Math.min( 1.6, L / 0.22 + 0.2 );
			const phase =
				Math.PI / 2 -
				( 2 * Math.PI * ( g.at.x * ux + g.at.y * uy ) ) / state.waveLen;
			replaceLive( [ OP.WAVE, ux, uy, amp, state.waveLen, phase ] );
			drawGuide( g.at, p, 'wave' );
		} else if ( 'vortex' === g.tool ) {
			const turn = Math.max(
				-14,
				Math.min( 14, ( dx >= 0 ? 1 : -1 ) * L * 22 )
			);
			replaceLive( [
				OP.VORTEX,
				g.at.x,
				g.at.y,
				turn,
				state.vortexRadius,
			] );
			drawGuide( g.at, p, 'vortex' );
		}
	} );

	const endGesture = ( commit ) => {
		if ( ! gesture ) {
			return;
		}
		const g = gesture;
		gesture = null;
		clearGuide();
		if ( g.raf ) {
			window.cancelAnimationFrame( g.raf );
		}
		if ( g.done ) {
			return;
		}
		if ( 'drop' === g.tool || 'flower' === g.tool ) {
			if ( commit ) {
				commitGesture();
			} else {
				cancelToCommitted();
			}
			return;
		}
		if ( 'splatter' === g.tool ) {
			if ( ! commit ) {
				cancelToCommitted();
				return;
			}
			if ( state.ops.length === sumGroups() ) {
				// A tap sprays a tiny burst where the finger landed.
				setOps(
					state.ops
						.concat(
							splatterOps(
								g.rand,
								g.at.x - 0.02,
								g.at.y - 0.01,
								g.at.x + 0.02,
								g.at.y + 0.01,
								Math.max( 0.004, state.dropSize * 0.4 ),
								activeInk
							)
						)
						.slice( 0, MAX_OPS )
				);
			}
			commitGesture();
			return;
		}
		const last = state.ops[ g.liveIndex ];
		const tiny =
			! commit ||
			! last ||
			( OP.VORTEX === last[ 0 ]
				? Math.abs( last[ 3 ] ) < 0.05
				: OP.WAVE === last[ 0 ]
				? last[ 3 ] < 0.004
				: OP.ARC === last[ 0 ] || OP.RING === last[ 0 ]
				? Math.abs( last[ 4 ] ) < 0.02
				: last[ 5 ] < 0.01 );
		if ( tiny ) {
			// A click with a stroke tool is not a stroke.
			setOps( state.ops.slice( 0, g.liveIndex ) );
			return;
		}
		commitGesture();
	};
	canvas.addEventListener( 'pointerup', () => endGesture( true ) );
	canvas.addEventListener( 'pointercancel', () => endGesture( false ) );

	/* --------------------------------- replay ------------------------------- */

	function playPreview() {
		if ( replaying || engine.cpu ) {
			if ( engine.cpu ) {
				toasts.error(
					t( 'Video export needs WebGL2, which this browser lacks.' )
				);
			}
			return;
		}
		replaying = true;
		const ops = state.ops;
		if ( 'water' === state.video ) {
			const t0 = performance.now();
			const loopMs = state.loop * 1000;
			const step = ( now ) => {
				if ( ! replaying ) {
					return;
				}
				const k = ( now - t0 ) / loopMs;
				if ( k >= 1 ) {
					engine.setLive( 0, 0 );
					engine.render();
					replaying = false;
					return;
				}
				engine.setLive( state.waterAmp, 2 * Math.PI * k );
				engine.render();
				window.requestAnimationFrame( step );
			};
			window.requestAnimationFrame( step );
			return;
		}
		const sched = replaySchedule( ops );
		const t0 = performance.now();
		const step = ( now ) => {
			if ( ! replaying ) {
				return;
			}
			const tt = ( now - t0 ) / 1000;
			let count = 0;
			let lastT = 1;
			for ( let i = 0; i < ops.length; i++ ) {
				if ( tt >= sched.starts[ i ] ) {
					count = i + 1;
					lastT = ease(
						( tt - sched.starts[ i ] ) /
							Math.max( 0.001, sched.durations[ i ] )
					);
				}
			}
			engine.setPartial( count, lastT );
			engine.render();
			if ( tt >= sched.total + 0.3 ) {
				engine.setPartial( ops.length, 1 );
				engine.render();
				replaying = false;
				return;
			}
			window.requestAnimationFrame( step );
		};
		window.requestAnimationFrame( step );
	}

	/* -------------------------------- exports ------------------------------- */

	const outSize = () => {
		const ratio = state.aspect;
		let w = OUT_SIZE;
		let h = Math.round( OUT_SIZE / ratio );
		if ( ratio < 1 ) {
			h = OUT_SIZE;
			w = Math.round( OUT_SIZE * ratio );
		}
		return {
			w: Math.max( 2, w - ( w % 2 ) ),
			h: Math.max( 2, h - ( h % 2 ) ),
		};
	};

	async function recordAnd( btn, sink ) {
		if ( btn.disabled || replaying ) {
			return;
		}
		const prev = btn.innerHTML;
		btn.disabled = true;
		btn.innerHTML = '<span class="wpiemb-spin"></span>' + t( 'Recording…' );
		const { w, h } = outSize();
		const vw = Math.min( VIDEO_MAX, w );
		const vh = Math.min( VIDEO_MAX, h );
		try {
			const { blob, ext } = await engine.recordVideo( {
				width: vw - ( vw % 2 ),
				height: vh - ( vh % 2 ),
				fps: 30,
				mode: state.video,
				params: { waterAmp: state.waterAmp, loop: state.loop },
			} );
			await sink( blob, ext );
		} catch ( e ) {
			toasts.error( t( 'Recording failed.' ) );
		}
		btn.innerHTML = prev;
		btn.disabled = false;
	}

	async function uploadToMedia( blob, ext ) {
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
					'attachment; filename="marbling.' + ext + '"',
				'Content-Type': blob.type || 'video/webm',
			},
			body: blob,
		} );
		if ( ! res.ok ) {
			toasts.error( t( 'Could not save to the Media Library.' ) );
			return;
		}
		toasts.success( t( 'Saved to Media Library.' ) );
	}

	/* ---------------------------------- foot -------------------------------- */

	const statusEl = ui.el( 'div', 'wpiemb-status', modal.foot, '' );
	const footBtns = ui.el( 'div', 'wpiemb-footbtns', modal.foot );
	ui.btn( footBtns, { label: t( 'Cancel' ), onClick: () => close() } );
	ui.btn( footBtns, {
		label: editing ? t( 'Update' ) : t( 'Insert' ),
		primary: true,
		onClick: doInsert,
	} );

	function syncStatus() {
		const toolLabel = TOOL_LIST.find( ( x ) => x[ 0 ] === state.tool );
		statusEl.textContent =
			state.ops.length +
			' ' +
			t( 'moves' ) +
			' · ' +
			t( toolLabel ? toolLabel[ 1 ] : '' ) +
			( engine.cpu ? ' · ' + t( 'CPU mode' ) : '' );
	}

	const storableParams = () => {
		const stored = { ...state };
		return stored;
	};

	function doInsert() {
		try {
			const stored = storableParams();
			if ( editing ) {
				const ratio = ( genLayer.w || 1 ) / ( genLayer.h || 1 );
				let w = OUT_SIZE;
				let h = Math.round( OUT_SIZE / ratio );
				if ( ratio < 1 ) {
					h = OUT_SIZE;
					w = Math.round( OUT_SIZE * ratio );
				}
				w = Math.max( 2, w - ( w % 2 ) );
				h = Math.max( 2, h - ( h % 2 ) );
				const url = engine.renderStill( w, h ).toDataURL( 'image/png' );
				editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: genLayer.id,
					patch: {
						src: url,
						naturalW: w,
						naturalH: h,
						generator: { id: GEN_ID, params: stored },
					},
				} );
				editor.commit( t( 'Update marbling' ) );
			} else {
				const { w, h } = outSize();
				const url = engine.renderStill( w, h ).toDataURL( 'image/png' );
				const newLayer = bridge.documents.makeImage( {
					name: 'Marble Bath',
					x: 0,
					y: 0,
					w: doc.w,
					h: doc.h,
					src: url,
					naturalW: w,
					naturalH: h,
				} );
				newLayer.generator = { id: GEN_ID, params: stored };
				editor.dispatch( { type: 'ADD_LAYER', layer: newLayer } );
				editor.dispatch( { type: 'SET_ACTIVE', id: newLayer.id } );
				editor.commit( t( 'Insert marbling' ) );
			}
			close();
		} catch ( e ) {
			toasts.error( t( 'Could not insert.' ) );
		}
	}

	/* ------------------------------- lifecycle ------------------------------ */

	function fit() {
		const r = view.getBoundingClientRect();
		const pad = 24;
		const availW = Math.max( 200, r.width - pad * 2 );
		const availH = Math.max( 200, r.height - pad * 2 );
		let w = availW;
		let h = w / state.aspect;
		if ( h > availH ) {
			h = availH;
			w = h * state.aspect;
		}
		stage.style.width = Math.round( w ) + 'px';
		stage.style.height = Math.round( h ) + 'px';
		engine.resize( w, h );
		guide.width = Math.round( w );
		guide.height = Math.round( h );
		engine.render();
	}

	const ro =
		'undefined' !== typeof ResizeObserver
			? new ResizeObserver( fit )
			: null;
	if ( ro ) {
		ro.observe( view );
	}

	function onKey( e ) {
		if ( 'Escape' === e.key ) {
			if ( gesture ) {
				endGesture( false );
				return;
			}
			close();
		}
	}

	function close() {
		replaying = false;
		unmountAll();
		if ( ro ) {
			ro.disconnect();
		}
		window.removeEventListener( 'resize', fit );
		document.removeEventListener( 'keydown', onKey );
		engine.dispose();
		backdrop.remove();
	}
	backdrop.onclick = () => close();
	window.addEventListener( 'resize', fit );
	document.addEventListener( 'keydown', onKey );

	/* -------------------------------- opening ------------------------------- */

	renderSide();
	fit();
	if ( ! editing && ! state.ops.length ) {
		applyRecipe( 'stone' );
	} else {
		syncInks();
		if ( state.recipe && recipeEls[ state.recipe ] ) {
			recipeEls[ state.recipe ].classList.add( 'is-on' );
		}
	}
	syncStatus();

	// What the QA harness reads: the state the studio believes it is in.
	window.__wpiembState = () => ( {
		ready: true,
		ops: state.ops.length,
		tool: state.tool,
		cpu: engine.cpu,
		recipe: state.recipe,
	} );
	window.__marblingStudio = {
		engine,
		getState: () => state,
		set: ( patch ) => {
			state = mergeParams( { ...state, ...patch } );
			renderSide();
			syncInks();
		},
		addOp: ( op ) => {
			state.groups.push( 1 );
			setOps( state.ops.concat( [ op ] ) );
		},
		recipe: applyRecipe,
		still: ( w, h ) => engine.renderStill( w || 640, h || 480 ),
	};
}

/* --------------------------------- register -------------------------------- */

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Marble Bath',
		run: ( c ) => openStudio( c ),
		edit: ( c ) => openStudio( c ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else if ( window.wp && window.wp.hooks ) {
	window.wp.hooks.addAction( 'wpie.ready', 'wpie-marbling-studio', register );
}
