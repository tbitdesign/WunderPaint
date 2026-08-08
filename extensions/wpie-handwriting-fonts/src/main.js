/**
 * WPIE extension: Handwriting Fonts.
 *
 * Draw an alphabet, or write one on paper and photograph it, and get a
 * real OpenType family that installs into this site's font library and
 * is available everywhere the editor offers a font.
 *
 * Zero core edits: it speaks only to the public window.WPIE.api and
 * window.WPIE.bridge surface, plus the font REST route the editor's own
 * settings screen already uses.
 */

import { ALL_KEYS, GROUPS, isMark, labelOf, progress, SAMPLES } from './core/charset.js';
import { newProject, familyPlan, buildWeightSteps, plannedCuts } from './core/build.js';
import { WEIGHTS, sanitizeMetrics } from './core/metrics.js';
import {
	encodeProject,
	projectFromFont,
	saveDraft,
	loadDraft,
	listDrafts,
	deleteDraft,
} from './core/project.js';
import { readFamilyName } from './core/fontread.js';
import {
	canInstall,
	isStandalone,
	installFamily,
	downloadFont,
	listInstalled,
	fetchInstalled,
	faceSnippet,
} from './core/install.js';
import { OutlineCache, paintText, fitCanvas, themeColor } from './ui/paint.js';
import { auditGlyphs, snapToBaseline } from './core/audit.js';
import { DrawSurface } from './ui/draw-canvas.js';
import { GlyphGrid } from './ui/glyph-grid.js';
import { SheetPanel } from './ui/sheet-panel.js';
import { SpacingPanel } from './ui/spacing-panel.js';

const SLUG = 'wpie-handwriting-fonts';
const MENU_TARGET = 'extensions';

import { t, LOCALE } from './i18n.js';


/* -------------------------------- icons ---------------------------------- */

const ICON_BRAND =
	'<svg width="24" height="24" viewBox="0 0 18.83 18.83" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.84,18.83H3.62c-2,0-3.62-1.62-3.62-3.62V3.52h1.72c.7,0,1.28.57,1.28,1.28v10.43c0,.34.28.62.62.62h8.94c.71,0,1.29.58,1.29,1.29v1.71Z"/><path fill="#3b66ff" d="M18.83,14.02h-1.71c-.71,0-1.29-.58-1.29-1.29V3.62c0-.34-.28-.62-.62-.62H4.82c-.7,0-1.28-.57-1.28-1.28V0h11.67c2,0,3.62,1.62,3.62,3.62v10.4Z"/><circle fill="currentColor" cx="17.33" cy="17.33" r="1.5"/><path fill="#3b66ff" d="M9.51,5.71l.91,2.45c.03.08.09.14.17.17l2.45.91c.07.03.07.13,0,.16l-2.45.91c-.08.03-.14.09-.17.17l-.91,2.45c-.03.07-.13.07-.16,0l-.91-2.45c-.03-.08-.09-.14-.17-.17l-2.45-.91c-.07-.03-.07-.13,0-.16l2.45-.91c.08-.03.14-.09.17-.17l.91-2.45c.03-.07.13-.07.16,0Z"/></svg>';

const icon = ( d ) =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ d }</svg>`;

const ISSUE_LABEL = {
	floats: 'floats above the line',
	sinks: 'sinks below the line',
	tall: 'taller than the rest',
	short: 'shorter than the rest',
	wide: 'much wider than the rest',
};

const ICONS = {
	font: icon( '<path d="M4 20h16"/><path d="M7 16l5-12 5 12"/><path d="M9.5 11h5"/>' ),
	pen: icon( '<path d="M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>' ),
	spacing: icon( '<path d="M4 5v14"/><path d="M20 5v14"/><path d="M8 12h8"/><path d="M10 9l-2 3 2 3"/><path d="M14 9l2 3-2 3"/>' ),
	heights: icon( '<path d="M6 4v16"/><path d="M3 7h6"/><path d="M3 12h4"/><path d="M3 17h6"/><path d="M13 18l4-12 4 12"/>' ),
	project: icon( '<path d="M4 6a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>' ),
	print: icon( '<path d="M7 8V4h10v4"/><rect x="4" y="8" width="16" height="7" rx="2"/><path d="M7 15h10v5H7z"/>' ),
	image: icon( '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4 4 3 3-2 4 3"/>' ),
	check: icon( '<path d="M5 13l4 4L19 7"/>' ),
};

/* ------------------------------- the studio ------------------------------ */

function openStudio( ctx ) {
	const bridge = window.WPIE && window.WPIE.bridge;
	const ui = bridge && bridge.ui;
	if ( ! ui || ! ui.dialog ) {
		return;
	}
	const toasts = ( ctx && ctx.extras && ctx.extras.toasts ) || null;
	const editor = ( ctx && ctx.editor ) || null;

	const state = {
		project: freshProject(),
		cache: new OutlineCache(),
		key: 'A',
		tab: 'draw',
		busy: false,
		sampleText: SAMPLES[ LOCALE.slice( 0, 2 ) ] || SAMPLES.en,
		saveTimer: 0,
		previewTimer: 0,
		previewPending: false,
		previewCost: 0,
	};

	const modal = ui.dialog( {
		title: t( 'Handwriting Fonts' ),
		subtitle: t( 'Draw an alphabet, get a font this site can use everywhere.' ),
		width: 1300,
		onClose: () => teardown(),
	} );
	const badge = document.createElement( 'span' );
	badge.className = 'dsm-badge';
	badge.innerHTML = ICON_BRAND;
	modal.head.insertBefore( badge, modal.head.firstChild );

	// A definite width, not a ceiling. Left to a maximum, the dialog is
	// only as wide as its content, so it starts narrow and then grows the
	// first time the sheet tab is laid out, taking the drawing area with
	// it. Stating the width outright means it is right from the start and
	// never moves again.
	modal.dialog.style.width = 'min(1300px, 97vw)';

	const wrap = ui.el( 'div', 'wpiehw-wrap', modal.body );
	const left = ui.el( 'div', 'wpiehw-side wpiehw-left', wrap );
	const stage = ui.el( 'div', 'wpiehw-stage', wrap );
	const right = ui.el( 'div', 'wpiehw-side wpiehw-right', wrap );

	/* ------------------------------- centre ------------------------------ */

	const tabs = ui.el( 'div', 'wpiehw-tabs', stage );
	const drawTab = ui.el( 'button', 'wpiehw-tab is-active', tabs, t( 'Draw' ) );
	const sheetTab = ui.el( 'button', 'wpiehw-tab', tabs, t( 'Sheet' ) );
	const spaceTab = ui.el( 'button', 'wpiehw-tab', tabs, t( 'Spacing' ) );
	drawTab.type = 'button';
	sheetTab.type = 'button';
	spaceTab.type = 'button';

	const drawPane = ui.el( 'div', 'wpiehw-pane', stage );
	const sheetPane = ui.el( 'div', 'wpiehw-pane is-hidden', stage );
	const spacePane = ui.el( 'div', 'wpiehw-pane is-hidden', stage );

	const charHead = ui.el( 'div', 'wpiehw-charhead', drawPane );
	const charName = ui.el( 'span', 'wpiehw-charname', charHead, 'A' );
	const charHint = ui.el( 'span', 'wpiehw-charhint', charHead, '' );

	const canvas = document.createElement( 'canvas' );
	canvas.className = 'wpiehw-canvas';
	drawPane.appendChild( canvas );

	const tools = ui.el( 'div', 'wpiehw-tools', drawPane );
	const prevBtn = ui.btn( tools, { label: t( 'Previous' ), onClick: () => step( -1 ) } );
	const undoBtn = ui.btn( tools, { label: t( 'Undo' ), onClick: () => surface.undo() } );
	const eraseBtn = ui.btn( tools, {
		label: t( 'Erase' ),
		onClick: () => {
			const on = ! eraseBtn.classList.contains( 'is-on' );
			eraseBtn.classList.toggle( 'is-on', on );
			surface.setErasing( on );
		},
	} );
	const clearBtn = ui.btn( tools, { label: t( 'Clear character' ), onClick: () => surface.clear() } );
	const nextBtn = ui.btn( tools, { label: t( 'Next' ), primary: true, onClick: () => step( 1 ) } );

	const previewBox = ui.el( 'div', 'wpiehw-previewbox', drawPane );
	const previewInput = ui.el( 'input', 'dsm-input wpiehw-sample', previewBox );
	previewInput.type = 'text';
	previewInput.value = state.sampleText;
	previewInput.setAttribute( 'aria-label', t( 'Preview' ) );
	previewInput.addEventListener( 'input', () => {
		state.sampleText = previewInput.value;
		paintPreview();
	} );
	const previewCanvas = document.createElement( 'canvas' );
	previewCanvas.className = 'wpiehw-preview';
	previewBox.appendChild( previewCanvas );

	const surface = new DrawSurface( canvas, {
		project: state.project,
		cache: state.cache,
		t,
		onChange: ( key ) => {
			state.sticky = false;
			grid.refresh( key );
			schedulePreview();
			scheduleSave();
			updateFoot();
		},
	} );

	const sheet = new SheetPanel( sheetPane, {
		project: state.project,
		t,
		ui,
		onStatus: ( msg ) => setStatus( msg ),
		onImport: ( keys ) => {
			state.cache.clear();
			grid.refreshAll();
			schedulePreview();
			scheduleSave();
			updateFoot();
			setStatus( t( 'Took over %d characters' ).replace( '%d', keys.length ) );
		},
	} );

	const bench = new SpacingPanel( spacePane, {
		project: state.project,
		cache: state.cache,
		t,
		ui,
		sample: 'Hamburgefonstiv',
		onChange: () => {
			state.sticky = false;
			schedulePreview();
			scheduleSave();
		},
	} );

	const setTab = ( name ) => {
		state.tab = name;
		drawTab.classList.toggle( 'is-active', 'draw' === name );
		sheetTab.classList.toggle( 'is-active', 'sheet' === name );
		spaceTab.classList.toggle( 'is-active', 'spacing' === name );
		drawPane.classList.toggle( 'is-hidden', 'draw' !== name );
		sheetPane.classList.toggle( 'is-hidden', 'sheet' !== name );
		spacePane.classList.toggle( 'is-hidden', 'spacing' !== name );
		if ( 'draw' === name ) {
			surface.render();
			paintPreview();
		}
		if ( 'spacing' === name ) {
			bench.render();
		}
	};
	drawTab.onclick = () => setTab( 'draw' );
	sheetTab.onclick = () => setTab( 'sheet' );
	spaceTab.onclick = () => setTab( 'spacing' );

	/* -------------------------------- left ------------------------------- */

	const grid = new GlyphGrid( left, {
		project: state.project,
		cache: state.cache,
		t,
		onPick: ( key ) => selectKey( key ),
	} );

	/* -------------------------------- right ------------------------------ */

	let panelRefresh = () => {};
	buildPanel();

	function buildPanel() {
		right.innerHTML = '';
		const o = state.project.options;
		const m = state.project.metrics;

		const fontSec = ui.section( right, { icon: ICONS.font, title: t( 'Font' ) } );
		const nameCell = ui.row( fontSec, t( 'Family name' ) );
		const nameInput = ui.el( 'input', 'dsm-input', nameCell );
		nameInput.type = 'text';
		nameInput.value = state.project.family;
		nameInput.addEventListener( 'input', () => {
			state.project.family = nameInput.value;
			scheduleSave();
			updateFoot();
		} );
		ui.el( 'div', 'wpiehw-label', fontSec, t( 'Weights' ) );
		const weightRow = ui.el( 'div', 'wpiehw-checks', fontSec );
		for ( const w of WEIGHTS ) {
			ui.check( weightRow, {
				label: t( w.style ),
				checked: ( o.weights || [] ).includes( w.id ),
				onChange: ( on ) => {
					const set = new Set( o.weights || [] );
					if ( on ) {
						set.add( w.id );
					} else {
						set.delete( w.id );
					}
					o.weights = WEIGHTS.filter( ( x ) => set.has( x.id ) ).map( ( x ) => x.id );
					if ( ! o.weights.length ) {
						o.weights = [ 'regular' ];
						panelRefresh();
					}
					scheduleSave();
					updateFoot();
				},
			} );
		}
		ui.check( fontSec, {
			label: t( 'Add an italic' ),
			checked: !! o.italic,
			onChange: ( on ) => {
				o.italic = on;
				scheduleSave();
				updateFoot();
			},
		} );

		const penSec = ui.section( right, { icon: ICONS.pen, title: t( 'Pen' ) } );
		ui.slider( penSec, {
			label: t( 'Pen width' ),
			min: 12,
			max: 160,
			step: 2,
			value: o.pen,
			onInput: ( v ) => {
				o.pen = v;
				state.cache.clear();
				surface.render();
				grid.refreshAll();
				schedulePreview();
				scheduleSave();
			},
		} );
		ui.slider( penSec, {
			label: t( 'Smoothing' ),
			min: 0,
			max: 100,
			value: o.smoothing,
			format: ( v ) => `${ v }%`,
			onInput: ( v ) => {
				o.smoothing = v;
				scheduleSave();
			},
			format: ( v ) => `${ v }%`,
		} );
		const nib = o.nib || ( o.nib = { angle: 30, ratio: 1 } );
		const nibRow = ui.row( penSec, t( 'Nib' ) );
		ui.select( nibRow, {
			options: [
				{ value: 'round', label: t( 'Round' ) },
				{ value: 'chisel', label: t( 'Chisel' ) },
			],
			value: nib.ratio > 0.995 ? 'round' : 'chisel',
			onChange: ( v ) => {
				nib.ratio = 'round' === v ? 1 : 0.3;
				state.cache.clear();
				panelRefresh();
				surface.render();
				grid.refreshAll();
				schedulePreview();
				scheduleSave();
			},
		} );
		if ( nib.ratio <= 0.995 ) {
			ui.slider( penSec, {
				label: t( 'Nib angle' ),
				min: -90,
				max: 90,
				step: 5,
				value: nib.angle ?? 30,
				format: ( v ) => `${ v }°`,
				onInput: ( v ) => {
					nib.angle = v;
					state.cache.clear();
					surface.render();
					grid.refreshAll();
					schedulePreview();
					scheduleSave();
				},
			} );
			ui.slider( penSec, {
				label: t( 'Nib width' ),
				min: 8,
				max: 99,
				value: Math.round( nib.ratio * 100 ),
				format: ( v ) => `${ v }%`,
				onInput: ( v ) => {
					nib.ratio = v / 100;
					state.cache.clear();
					surface.render();
					grid.refreshAll();
					schedulePreview();
					scheduleSave();
				},
			} );
		}
		ui.slider( penSec, {
			label: t( 'Pressure' ),
			min: 0,
			max: 100,
			value: Math.round( ( o.influence ?? 0.5 ) * 100 ),
			format: ( v ) => `${ v }%`,
			onInput: ( v ) => {
				o.influence = v / 100;
				state.cache.clear();
				surface.render();
				schedulePreview();
				scheduleSave();
			},
		} );

		const modelRow = ui.row( penSec, t( 'Trace over' ) );
		const families = ( () => {
			try {
				const list = bridge.fonts && bridge.fonts.listFamilies ? bridge.fonts.listFamilies() : [];
				return Array.isArray( list ) ? list.slice( 0, 40 ) : [];
			} catch ( e ) {
				return [];
			}
		} )();
		ui.select( modelRow, {
			options: [ { value: '', label: t( 'Nothing' ) } ].concat(
				( families.length ? families : [ 'Georgia', 'Helvetica', 'Arial' ] ).map( ( f ) => ( {
					value: f,
					label: f,
				} ) )
			),
			value: o.model || '',
			onChange: ( v ) => {
				o.model = v;
				const apply = () => surface.setModel( v );
				if ( v && bridge.fonts && bridge.fonts.ensureFont ) {
					bridge.fonts.ensureFont( v ).then( apply, apply );
				} else {
					apply();
				}
				scheduleSave();
			},
		} );

		const spaceSec = ui.section( right, { icon: ICONS.spacing, title: t( 'Spacing' ) } );
		ui.slider( spaceSec, {
			label: t( 'Tracking' ),
			min: -40,
			max: 160,
			value: o.tracking || 0,
			onInput: ( v ) => {
				o.tracking = v;
				surface.render();
				schedulePreview();
				scheduleSave();
			},
		} );
		ui.check( spaceSec, {
			label: t( 'Join the letters up' ),
			checked: !! o.cursive,
			onChange: ( on ) => {
				o.cursive = on;
				panelRefresh();
				surface.render();
				schedulePreview();
				scheduleSave();
			},
		} );
		if ( o.cursive ) {
			ui.slider( spaceSec, {
				label: t( 'Overlap' ),
				min: 0,
				max: 90,
				value: o.overlap ?? 24,
				onInput: ( v ) => {
					o.overlap = v;
					surface.render();
					schedulePreview();
					scheduleSave();
				},
			} );
		} else {
			ui.check( spaceSec, {
				label: t( 'Kern automatically' ),
				checked: false !== o.kerning,
				onChange: ( on ) => {
					o.kerning = on;
					schedulePreview();
					scheduleSave();
				},
			} );
		}

		const hSec = ui.section( right, { icon: ICONS.heights, title: t( 'Heights' ) } );
		ui.slider( hSec, {
			label: t( 'Cap height' ),
			min: 400,
			max: 900,
			step: 10,
			value: m.capHeight,
			onInput: ( v ) => {
				m.capHeight = v;
				surface.render();
				schedulePreview();
				scheduleSave();
			},
		} );
		ui.slider( hSec, {
			label: t( 'x-height' ),
			min: 250,
			max: 750,
			step: 10,
			value: m.xHeight,
			onInput: ( v ) => {
				m.xHeight = v;
				surface.render();
				schedulePreview();
				scheduleSave();
			},
		} );

		const flagged = auditGlyphs( state.project );
		if ( flagged.length ) {
			const checkSec = ui.section( right, { icon: ICONS.check, title: t( 'Worth a look' ) } );
			ui.el(
				'p',
				'wpiehw-hint',
				checkSec,
				t( '%d character(s) sit oddly next to the others.' ).replace( '%d', flagged.length )
			);
			const chips = ui.el( 'div', 'wpiehw-chips', checkSec );
			for ( const item of flagged.slice( 0, 24 ) ) {
				const chip = ui.el( 'button', 'wpiehw-chip', chips, item.key );
				chip.type = 'button';
				chip.title = item.issues.map( ( i ) => t( ISSUE_LABEL[ i ] || i ) ).join( ', ' );
				chip.onclick = () => {
					setTab( 'draw' );
					selectKey( item.key );
				};
			}
			const off = flagged.filter( ( f ) => f.offset );
			if ( off.length ) {
				ui.btn( ui.el( 'div', 'wpiehw-btnrow', checkSec ), {
					label: t( 'Stand them on the baseline' ),
					onClick: () => {
						let moved = 0;
						for ( const item of off ) {
							if ( snapToBaseline( state.project, item.key ) ) {
								state.cache.drop( item.key );
								moved++;
							}
						}
						buildPanel();
						grid.refreshAll();
						bench.render();
						surface.render();
						schedulePreview();
						scheduleSave();
						setStatus( t( '%d character(s) moved onto the baseline' ).replace( '%d', moved ), true );
					},
				} );
			}
		}

		const projSec = ui.section( right, { icon: ICONS.project, title: t( 'Project' ) } );
		const draftCell = ui.row( projSec, t( 'Saved drafts' ) );
		const draftSel = ui.select( draftCell, { options: [ { value: '', label: '—' } ], value: '' } );
		refreshDrafts( draftSel );
		draftSel.onchange = () => {
			if ( draftSel.value ) {
				openDraft( draftSel.value );
			}
		};
		const projRow = ui.el( 'div', 'wpiehw-btnrow', projSec );
		ui.btn( projRow, { label: t( 'Start over' ), onClick: () => startOver() } );
		ui.btn( projRow, {
			label: t( 'Delete draft' ),
			onClick: async () => {
				const id = draftSel.value;
				if ( ! id ) {
					return;
				}
				await deleteDraft( id );
				if ( id === state.project.id ) {
					startOver();
				} else {
					refreshDrafts( draftSel );
				}
			},
		} );
		ui.btn( projRow, { label: t( 'Open a font file' ), onClick: () => fontFile.click() } );
		if ( ! isStandalone() ) {
			ui.btn( projRow, {
				label: t( 'Open an installed font' ),
				onClick: () => openInstalled(),
			} );
		}
		panelRefresh = buildPanel;
	}

	const fontFile = document.createElement( 'input' );
	fontFile.type = 'file';
	fontFile.accept = '.ttf,.otf,font/ttf,font/otf';
	fontFile.className = 'wpiehw-file';
	fontFile.addEventListener( 'change', async () => {
		const f = fontFile.files[ 0 ];
		fontFile.value = '';
		if ( ! f ) {
			return;
		}
		const bytes = new Uint8Array( await f.arrayBuffer() );
		const loaded = await projectFromFont( bytes );
		if ( ! loaded ) {
			setStatus( t( 'This font has no project inside it.' ), true );
			return;
		}
		adopt( loaded, readFamilyName( bytes ) );
	} );
	modal.body.appendChild( fontFile );

	/* -------------------------------- foot ------------------------------- */

	const status = ui.el( 'div', 'dsm-mono wpiehw-status', modal.foot, '' );
	const actions = ui.el( 'div', 'dsm-actions', modal.foot );
	const downloadBtn = ui.btn( actions, {
		label: t( 'Build and download' ),
		onClick: () => run( false ),
	} );
	const installBtn = ui.btn( actions, {
		label: canInstall() ? t( 'Build and install' ) : t( 'Build and download' ),
		primary: true,
		onClick: () => run( canInstall() ),
	} );
	if ( ! canInstall() ) {
		downloadBtn.style.display = 'none';
	}

	/* ------------------------------ behaviour ---------------------------- */

	function freshProject() {
		const p = newProject( 'My Handwriting' );
		p.id = `p${ Date.now().toString( 36 ) }${ Math.random().toString( 36 ).slice( 2, 7 ) }`;
		return p;
	}

	function selectKey( key ) {
		state.key = key;
		grid.setActive( key );
		const i = ALL_KEYS.indexOf( key );
		const neighbours = isMark( key )
			? { prev: null, next: null }
			: { prev: ALL_KEYS[ i - 1 ], next: ALL_KEYS[ i + 1 ] };
		const ghost = isMark( key ) ? ghostFor() : null;
		surface.setKey( key, neighbours, ghost );
		charName.textContent = isMark( key ) ? t( labelOf( key ) ) : key;
		charHint.textContent = isMark( key )
			? t( 'Draw an accent once, and every letter that needs it is built for you.' )
			: groupOf( key );
	}

	function ghostFor() {
		for ( const k of [ 'a', 'o', 'n', 'A', 'O' ] ) {
			if ( state.project.glyphs[ k ] ) {
				return k;
			}
		}
		return null;
	}

	function groupOf( key ) {
		const g = GROUPS.find( ( group ) => group.items.includes( key ) );
		return g ? t( g.label ) : '';
	}

	function step( dir ) {
		const i = ALL_KEYS.indexOf( state.key );
		const next = ALL_KEYS[ Math.max( 0, Math.min( ALL_KEYS.length - 1, i + dir ) ) ];
		selectKey( next );
	}

	function scheduleSave() {
		clearTimeout( state.saveTimer );
		state.saveTimer = setTimeout( async () => {
			const ok = await saveDraft( state.project.id, state.project );
			// A routine autosave never talks over a result somebody is
			// still reading.
			if ( ok && ! state.sticky ) {
				setStatus( t( 'Draft saved in this browser' ) );
			}
		}, 900 );
	}

	/**
	 * Repaint the sample line soon, and keep repainting while something
	 * is being dragged.
	 *
	 * A trailing delay is the wrong tool here: every step of a drag
	 * resets it, so the line sits frozen until the hand stops, which is
	 * precisely when the user has stopped looking for feedback. This
	 * paints once per frame instead, and if a paint turns out to be
	 * expensive (the pen width invalidates every traced outline) it backs
	 * off to whatever that paint actually cost rather than blocking the
	 * drag.
	 */
	function schedulePreview() {
		if ( state.previewPending ) {
			return;
		}
		state.previewPending = true;
		const run = () => {
			state.previewPending = false;
			const started = now();
			paintPreview();
			state.previewCost = now() - started;
		};
		if ( state.previewCost > 24 ) {
			state.previewTimer = setTimeout( run, Math.min( 250, state.previewCost ) );
		} else if ( 'undefined' !== typeof requestAnimationFrame ) {
			requestAnimationFrame( run );
		} else {
			state.previewTimer = setTimeout( run, 16 );
		}
	}

	function paintPreview() {
		const { ctx, dpr } = fitCanvas( previewCanvas );
		const rect = previewCanvas.getBoundingClientRect();
		ctx.scale( dpr, dpr );
		paintText( ctx, state.project, state.sampleText, {
			cache: state.cache,
			size: Math.min( 52, rect.height * 0.72 ),
			x: 8,
			y: rect.height * 0.76,
			color: themeColor( '--ed-text', '#e8eaee' ),
			maxWidth: rect.width - 16,
		} );
	}

	/**
	 * Put a line in the footer.
	 *
	 * A result worth reading is marked sticky, so the routine
	 * "ready to build" line that follows every change does not wipe out
	 * the answer to what just happened before it has been read.
	 *
	 * @param {string}  msg    Message.
	 * @param {boolean} sticky Whether later routine updates should wait.
	 */
	function setStatus( msg, sticky ) {
		status.textContent = msg || '';
		state.sticky = !! sticky;
	}

	function updateFoot() {
		const p = progress( state.project.glyphs );
		const cuts = plannedCuts( state.project );
		installBtn.disabled = state.busy || ! p.ready;
		downloadBtn.disabled = state.busy || ! p.ready;
		if ( ! state.busy && ! state.sticky ) {
			setStatus(
				p.ready
					? `${ t( 'Ready to build' ) }: ${ state.project.family }, ${ cuts }×`
					: t( '%d character(s) still needed' ).replace(
							'%d',
							p.requiredTotal - p.requiredDone
					  )
			);
		}
	}

	async function refreshDrafts( sel ) {
		const rows = await listDrafts();
		sel.innerHTML = '';
		const add = ( value, label ) => {
			const opt = document.createElement( 'option' );
			opt.value = value;
			opt.textContent = label;
			sel.appendChild( opt );
		};
		add( '', '—' );
		for ( const row of rows ) {
			add( row.id, row.family || row.id );
		}
		sel.value = state.project.id;
	}

	async function openDraft( id ) {
		const loaded = await loadDraft( id );
		if ( loaded ) {
			loaded.id = id;
			adopt( loaded );
		}
	}

	function startOver() {
		adopt( freshProject() );
	}

	async function openInstalled() {
		const fonts = await listInstalled();
		if ( ! fonts.length ) {
			setStatus( t( 'This font has no project inside it.' ) );
			return;
		}
		for ( const font of fonts.slice().reverse() ) {
			const bytes = await fetchInstalled( font );
			if ( ! bytes ) {
				continue;
			}
			const loaded = await projectFromFont( bytes );
			if ( loaded ) {
				adopt( loaded, font.family );
				return;
			}
		}
		setStatus( t( 'This font has no project inside it.' ) );
	}

	/** Replace the project everything is pointing at, in place. */
	function adopt( loaded, familyName ) {
		const p = state.project;
		p.family = familyName || loaded.family || p.family;
		p.metrics = sanitizeMetrics( loaded.metrics || p.metrics );
		p.options = { ...p.options, ...( loaded.options || {} ) };
		p.glyphs = loaded.glyphs || {};
		p.id = loaded.id || p.id;
		state.cache.clear();
		buildPanel();
		grid.refreshAll();
		bench.render();
		selectKey( state.key );
		schedulePreview();
		updateFoot();
		setStatus( t( 'Opened %s' ).replace( '%s', p.family ), true );
	}

	/* -------------------------------- build ------------------------------ */

	async function run( install ) {
		if ( state.busy ) {
			return;
		}
		const p = progress( state.project.glyphs );
		if ( ! p.ready ) {
			setStatus( t( 'Draw the letters marked as required before building.' ), true );
			return;
		}
		state.busy = true;
		installBtn.disabled = true;
		downloadBtn.disabled = true;
		try {
			const payload = await encodeProject( state.project );
			const plan = familyPlan( state.project );
			const cuts = [];
			for ( const entry of plan ) {
				setStatus( t( 'Building %s' ).replace( '%s', entry.style ) );
				const bytes = await runSliced(
					buildWeightSteps( state.project, entry.cut, {
						italic: entry.italic,
						project: payload,
					} ),
					( s ) =>
						setStatus(
							`${ t( 'Building %s' ).replace( '%s', entry.style ) } ${ s.done }/${ s.total }`
						)
				);
				cuts.push( { ...entry, bytes } );
			}

			if ( install && canInstall() ) {
				const res = await installFamily( state.project.family, cuts, ( s ) =>
					setStatus( t( 'Installing %s' ).replace( '%s', s.style ) )
				);
				if ( res.installed.length ) {
					const msg = t( 'Installed %s. It is in the font picker now.' ).replace(
						'%s',
						`${ state.project.family } (${ res.installed.join( ', ' ) })`
					);
					setStatus( msg, true );
					offerUse( state.project.family );
					if ( toasts && toasts.success ) {
						toasts.success( msg );
					}
				} else {
					setStatus( t( 'Nothing was installed.' ), true );
				}
				if ( res.failed.length ) {
					setStatus(
						`${ t( 'Nothing was installed.' ) } ${ res.failed
							.map( ( f ) => `${ f.style }: ${ f.message }` )
							.join( ' ' ) }`,
						true
					);
				}
			} else {
				for ( const cut of cuts ) {
					downloadFont( cut.bytes, cut.filename, bridge );
				}
				const msg = t( 'Downloaded %d file(s).' ).replace( '%d', cuts.length );
				setStatus(
					canInstall()
						? msg
						: `${ msg } ${ t(
								'Only an administrator can add fonts to this site. The files were downloaded instead.'
						  ) }`,
					true
				);
				offerSnippet( cuts );
			}
		} catch ( e ) {
			setStatus( String( ( e && e.message ) || e ), true );
		} finally {
			state.busy = false;
			updateFoot();
		}
	}

	/**
	 * Close the loop: a font nobody uses is a font nobody made.
	 *
	 * Straight after installing, the two things somebody is most likely
	 * to want next are one click away, and both put real editable layers
	 * on the canvas rather than a picture of them.
	 *
	 * @param {string} family Family name.
	 */
	function offerUse( family ) {
		if ( ! editor || ! bridge || ! bridge.documents || ! bridge.documents.makeText ) {
			return;
		}
		const made = [
			ui.btn( actions, { label: t( 'Add a text layer' ), onClick: () => addText( family ) } ),
			ui.btn( actions, { label: t( 'Insert a specimen' ), onClick: () => addSpecimen( family ) } ),
		];
		setTimeout( () => made.forEach( ( el ) => el.remove() ), 180000 );
	}

	function docSize() {
		const d = ( editor && editor.state && editor.state.doc ) || {};
		return { w: d.w || 1600, h: d.h || 1000 };
	}

	function addLayers( layers, label ) {
		for ( const layer of layers ) {
			editor.dispatch( { type: 'ADD_LAYER', layer } );
		}
		editor.commit( label );
		if ( toasts && toasts.success ) {
			toasts.success( label );
		}
	}

	function addText( family ) {
		const { w, h } = docSize();
		const size = Math.round( Math.min( w, h ) * 0.13 );
		addLayers(
			[
				bridge.documents.makeText( {
					name: family,
					text: state.project.family,
					x: Math.round( w * 0.1 ),
					y: Math.round( h / 2 - size * 0.7 ),
					w: Math.round( w * 0.8 ),
					h: Math.round( size * 1.4 ),
					fontSize: size,
					fontFamily: family,
					weight: 400,
					color: '#1a1d21',
					align: 'center',
				} ),
			],
			t( 'Handwriting Fonts' )
		);
	}

	function addSpecimen( family ) {
		const { w } = docSize();
		const pad = Math.round( w * 0.07 );
		const sample = state.sampleText || SAMPLES.en;
		const rows = [
			[ state.project.family, 0.095, 2.0 ],
			[ 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 0.04, 1.7 ],
			[ 'abcdefghijklmnopqrstuvwxyz', 0.04, 1.7 ],
			[ '0123456789 .,:;!?()-', 0.04, 2.4 ],
			[ sample, 0.055, 1.9 ],
			[ sample, 0.036, 1.9 ],
			[ sample, 0.024, 1.6 ],
		];
		const layers = [];
		let y = pad;
		for ( const [ text, share, gap ] of rows ) {
			const size = Math.max( 8, Math.round( w * share ) );
			layers.push(
				bridge.documents.makeText( {
					name: `${ family } ${ size }`,
					text,
					x: pad,
					y,
					w: w - pad * 2,
					h: Math.round( size * 1.4 ),
					fontSize: size,
					fontFamily: family,
					weight: 400,
					color: '#1a1d21',
					align: 'left',
				} )
			);
			y += Math.round( size * gap );
		}
		addLayers( layers, t( 'Handwriting Fonts' ) );
	}

	function offerSnippet( cuts ) {
		const css = faceSnippet( state.project.family, cuts[ 0 ].filename, cuts );
		const b = ui.btn( actions, {
			label: t( 'Copy CSS' ),
			onClick: async () => {
				try {
					await navigator.clipboard.writeText( css );
					setStatus( t( 'CSS copied' ) );
				} catch ( e ) {
					setStatus( css.slice( 0, 120 ) );
				}
			},
		} );
		setTimeout( () => b.remove(), 60000 );
	}

	/* ------------------------------ lifecycle ---------------------------- */

	function onKey( e ) {
		if ( ! modal.backdrop.isConnected || 'draw' !== state.tab ) {
			return;
		}
		const inField = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test( e.target.tagName );
		if ( inField ) {
			return;
		}
		if ( 'Enter' === e.key ) {
			e.preventDefault();
			step( e.shiftKey ? -1 : 1 );
		} else if ( 'z' === e.key.toLowerCase() && ( e.ctrlKey || e.metaKey ) ) {
			e.preventDefault();
			surface.undo();
		}
	}
	document.addEventListener( 'keydown', onKey );

	function teardown() {
		document.removeEventListener( 'keydown', onKey );
		clearTimeout( state.saveTimer );
		clearTimeout( state.previewTimer );
		surface.destroy();
		sheet.destroy();
		bench.destroy();
		saveDraft( state.project.id, state.project );
	}

	selectKey( 'A' );
	setTab( 'draw' );
	updateFoot();
	requestAnimationFrame( () => {
		surface.render();
		grid.refreshAll();
		paintPreview();
	} );
}

/**
 * Drive a build generator without freezing the tab.
 *
 * A full alphabet across three weights is a few seconds of arithmetic,
 * and a few seconds of blocked main thread is indistinguishable from a
 * crash, so the work is handed back to the browser every so often.
 *
 * @param {Generator} gen    Build generator.
 * @param {Function}  onStep Progress callback.
 * @return {Promise<*>} Whatever the generator returns.
 */
async function runSliced( gen, onStep ) {
	let res = gen.next();
	let since = now();
	while ( ! res.done ) {
		if ( onStep ) {
			onStep( res.value );
		}
		if ( now() - since > 24 ) {
			await new Promise( ( r ) => setTimeout( r, 0 ) );
			since = now();
		}
		res = gen.next();
	}
	return res.value;
}

const now = () =>
	'undefined' !== typeof performance && performance.now ? performance.now() : Date.now();

/* ------------------------------ registration ----------------------------- */

function register( api ) {
	if ( ! api || ! api.registerMenuItem ) {
		return;
	}
	api.registerMenuItem( MENU_TARGET, {
		// Namespaced id so ?wpie-open= can reach this studio; an
		// extension without a generator was otherwise unlinkable.
		id: 'wpie-handwriting-fonts/studio',
		label: t( 'Handwriting Fonts' ),
		category: 'tools',
		run: ( ctx ) => openStudio( ctx ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else if ( window.wp && window.wp.hooks ) {
	window.wp.hooks.addAction( 'wpie.ready', SLUG, register );
}
