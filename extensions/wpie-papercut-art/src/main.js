/**
 * WPIE extension: Papercut Art.
 *
 * Layered papercut scenes with real depth. Sheets come from parametric
 * silhouettes, from a photo sliced along its brightness, from the local
 * subject cutout and from typed words - every sheet runs through the
 * cuttability engine and is proven to be one piece of paper. Insert as
 * editable layers, export cutting SVGs, record the reveal.
 */

import { t } from './i18n.js';
import { PaperEngine } from './ui/engine.js';
import {
	cleanParams,
	defaultParams,
	defaultSheet,
	defaultObject,
	isCutObject,
	isStanding,
	PRESETS,
	LOOKS,
	FRAMES,
	TREE_SPECIES,
	PLANT_SPECIES,
	ORBS,
	lookById,
} from './core/model.js';
import {
	GROUND_ANIMALS,
	SKY_ANIMALS,
	WATER_ANIMALS,
} from './core/generators.js';
import { autoThresholds, histogram } from './core/photo.js';
import { buildZip } from './core/zip.js';

const GEN_ID = 'wpie-papercut-art/scene';

const ICON_BRAND =
	'<svg width="24" height="24" viewBox="0 0 18.83 18.83" aria-hidden="true"><path fill="currentColor" d="M13.84,18.83H3.62c-2,0-3.62-1.62-3.62-3.62V3.52h1.72c.7,0,1.28.57,1.28,1.28v10.43c0,.34.28.62.62.62h8.94c.71,0,1.29.58,1.29,1.29v1.71Z"/><path fill="#3b66ff" d="M18.83,14.02h-1.71c-.71,0-1.29-.58-1.29-1.29V3.62c0-.34-.28-.62-.62-.62H4.82c-.7,0-1.28-.57-1.28-1.28V0h11.67c2,0,3.62,1.62,3.62,3.62v10.4Z"/><circle fill="currentColor" cx="17.33" cy="17.33" r="1.5"/><path fill="#3b66ff" d="M9.51,5.71l.91,2.45c.03.08.09.14.17.17l2.45.91c.07.03.07.13,0,.16l-2.45.91c-.08.03-.14.09-.17.17l-.91,2.45c-.03.07-.13.07-.16,0l-.91-2.45c-.03-.08-.09-.14-.17-.17l-2.45-.91c-.07-.03-.07-.13,0-.16l2.45-.91c.08-.03,.14-.09,.17-.17l.91-2.45c.03-.07,.13-.07,.16,0Z"/></svg>';

const svg = ( inner, size = 14 ) =>
	`<svg width="${ size }" height="${ size }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ inner }</svg>`;
const I = {
	dice: svg(
		'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.4" fill="currentColor" stroke="none"/>'
	),
	x: svg( '<path d="M18 6l-12 12M6 6l12 12"/>', 12 ),
	up: svg( '<path d="M6 15l6 -6l6 6"/>', 12 ),
	down: svg( '<path d="M6 9l6 6l6 -6"/>', 12 ),
	sun: svg(
		'<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4 -1.4M17 7l1.4 -1.4"/>',
		16
	),
	layers: svg(
		'<path d="M12 4l8 4l-8 4l-8 -4z"/><path d="M4 12l8 4l8 -4"/><path d="M4 16l8 4l8 -4"/>'
	),
	scissors: svg(
		'<circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="M8.6 8.6l10.4 10.4M8.6 15.4l10.4 -10.4"/>'
	),
	photo: svg(
		'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M4 17l5 -5l4 4l3 -3l4 4"/>'
	),
	frame: svg(
		'<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/>'
	),
	wand: svg(
		'<path d="M6 21l15 -15l-3 -3l-15 15z"/><path d="M15 6l3 3"/><path d="M9 3v4M3 9h4M5 5l2 2"/>'
	),
	merge: svg( '<path d="M12 4v10M8 10l4 4l4 -4M5 20h14"/>', 12 ),
	lift: svg( '<path d="M12 20V10M8 14l4 -4l4 4M5 4h14"/>', 12 ),
	flip: svg( '<path d="M12 3v18M8 8l-4 4l4 4M16 8l4 4l-4 4"/>', 12 ),
	palette: svg(
		'<path d="M12 21a9 9 0 1 1 9 -9c0 2 -1.5 3 -3 3h-2a2 2 0 0 0 -2 2c0 .5 .2 1 .6 1.4c.4 .4 .4 1 .1 1.5c-.5 .7 -1.5 1.1 -2.7 1.1"/><circle cx="8" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r="1" fill="currentColor" stroke="none"/>'
	),
};

const KIND_LABEL = {
	sky: 'Sky',
	clouds: 'Cloud bank',
	branch: 'Corner branch',
	band: 'Band',
	photoband: 'Photo band',
	subject: 'Subject',
	text: 'Text',
};

/* -------------------------- library thumbnails --------------------------- */

const THUMBS = new Map();

/* --------------------------------- studio -------------------------------- */

function openStudio( ctx ) {
	const bridge = window.WPIE && window.WPIE.bridge;
	const ui = bridge && bridge.ui;
	if ( ! ui || ! ui.dialog ) {
		return;
	}
	const editor = ctx && ctx.editor;
	const toasts = ( ctx && ctx.extras && ctx.extras.toasts ) || {
		success: () => {},
		error: () => {},
	};
	const layer = ctx && ctx.layer;
	const editing = !! ( layer && layer.generator && layer.generator.id === GEN_ID );
	const params = cleanParams(
		editing ? layer.generator.params : defaultParams()
	);

	const modal = ui.dialog( {
		title: 'Papercut Art',
		subtitle: editing
			? t( 'Adjust the scene, the group updates in place.' )
			: t( 'Layered paper scenes with real depth - every sheet provably cuttable.' ),
		width: 1460,
		closeOnBackdrop: true,
		onClose: () => destroy(),
	} );
	const badge = document.createElement( 'span' );
	badge.className = 'dsm-badge';
	badge.innerHTML = ICON_BRAND;
	modal.head.insertBefore( badge, modal.head.firstChild );
	// The dsm base is a narrow settings dialog; the studio needs the
	// full three-column stage (ui.dialog only caps maxWidth).
	modal.dialog.classList.add( 'wpiepca-dialog' );

	const body = ui.el( 'div', 'wpiepca-body', modal.body );
	const left = ui.el( 'div', 'wpiepca-left', body );
	const view = ui.el( 'div', 'wpiepca-view', body );
	const canvas = ui.el( 'canvas', null, view );
	const sunBtn = ui.el( 'div', 'wpiepca-sun', view );
	sunBtn.innerHTML = I.sun;
	const hint = ui.el( 'div', 'wpiepca-hint', view );
	hint.textContent = t(
		'Click to pick · drag to move · Alt-drag to turn · drag the sun for the light'
	);
	const side = ui.el( 'div', 'wpiepca-side', body );

	const status = ui.el( 'div', 'dsm-hint wpiepca-status', modal.foot, '' );
	const actions = ui.el( 'div', 'dsm-actions', modal.foot );

	const engine = new PaperEngine( canvas );
	const unmounts = [];
	let selected = null;
	let closed = false;

	/* ------------------------------ sizing ----------------------------- */

	const doc = ( editor && editor.state && editor.state.doc ) || {
		w: 1500,
		h: 1000,
	};
	const fitCanvas = () => {
		const pad = 18;
		const vw = Math.max( 200, view.clientWidth - pad * 2 );
		const vh = Math.max( 160, view.clientHeight - pad * 2 );
		const ar = doc.w / doc.h;
		let w = vw;
		let h = w / ar;
		if ( h > vh ) {
			h = vh;
			w = h * ar;
		}
		canvas.style.width = w + 'px';
		canvas.style.height = h + 'px';
		engine.setSize( Math.min( 1100, w * 1.6 ), Math.min( 1100 / ar, ( w * 1.6 ) / ar ) );
	};

	/* ----------------------------- rebuilds ---------------------------- */

	let buildTimer = 0;
	const rebuild = () => {
		engine.build( params );
		engine.render( { selected } );
		syncStatus();
		syncSun();
	};
	const rebuildSoon = () => {
		clearTimeout( buildTimer );
		buildTimer = setTimeout( rebuild, 120 );
	};
	const repaint = () => engine.render( { selected } );

	const syncSun = () => {
		sunBtn.style.left =
			'calc(50% + ' + ( params.lightX / 100 ) * 30 + '%)';
	};

	const syncStatus = () => {
		const sheets = engine.allSheets();
		const empty = sheets.filter( ( s ) => ! s.rings.length ).length;
		const n = sheets.length;
		const objs = params.sheets.reduce(
			( a, s ) => a + s.objects.length,
			0
		);
		status.textContent =
			n +
			' ' +
			t( 'sheets' ) +
			' · ' +
			objs +
			' ' +
			t( 'objects' ) +
			' · ' +
			( empty
				? t(
						'Some sheets are empty - add elements or adjust the photo bands.'
				  )
				: t( 'Every sheet is one piece of paper.' ) );
		if ( ampelEl ) {
			ampelEl.textContent = status.textContent;
			ampelEl.classList.toggle( 'is-warn', !! empty );
		}
	};

	/* --------------------------- interactions -------------------------- */

	const canvasPoint = ( e ) => {
		const r = canvas.getBoundingClientRect();
		return [
			( ( e.clientX - r.left ) / r.width ) * engine.w,
			( ( e.clientY - r.top ) / r.height ) * engine.h,
		];
	};

	/** The object with that id, plus the sheet carrying it. */
	const findObject = ( id ) => {
		for ( const s of params.sheets ) {
			const o = s.objects.find( ( x ) => x.id === id );
			if ( o ) {
				return { sheet: s, object: o };
			}
		}
		return null;
	};
	const findSheet = ( id ) => params.sheets.find( ( s ) => s.id === id );

	let drag = null;
	canvas.addEventListener( 'pointerdown', ( e ) => {
		const [ px, py ] = canvasPoint( e );
		const hit = engine.hitAt( px, py );
		if ( ! hit ) {
			selected = null;
			syncHighlight();
			syncSelection();
			repaint();
			return;
		}
		if ( 'object' === hit.type ) {
			selected = hit.object.id;
			drag = {
				// Alt turns the drag into a rotation, the way every
				// canvas app does it.
				kind: e.altKey ? 'rotate' : 'object',
				obj: hit.object,
				x: e.clientX,
				y: e.clientY,
				x0: hit.object.x,
				y0: hit.object.y,
				rot0: hit.object.rot,
			};
		} else {
			selected = hit.sheet.id;
			drag = {
				kind: 'sheet',
				sheet: hit.sheet,
				x: e.clientX,
				y: e.clientY,
				dx0: hit.sheet.dx,
				dy0: hit.sheet.dy,
			};
		}
		canvas.setPointerCapture( e.pointerId );
		syncHighlight();
		syncSelection();
		repaint();
	} );

	canvas.addEventListener( 'pointermove', ( e ) => {
		if ( ! drag ) {
			return;
		}
		const r = canvas.getBoundingClientRect();
		const ddx = ( e.clientX - drag.x ) / r.width;
		const ddy = ( e.clientY - drag.y ) / r.height;
		if ( 'rotate' === drag.kind ) {
			drag.obj.rot = Math.max(
				-180,
				Math.min( 180, Math.round( drag.rot0 + ddx * 360 ) )
			);
			rebuildSoon();
		} else if ( 'object' === drag.kind ) {
			drag.obj.x = Math.max( -0.15, Math.min( 1.15, drag.x0 + ddx ) );
			// Standing objects ride their sheet's profile, so only the
			// free ones (moon, flyer, cloud, text) take a y from the
			// pointer at all.
			if ( ! isStanding( drag.obj ) ) {
				drag.obj.y = Math.max( -0.15, Math.min( 1.15, drag.y0 + ddy ) );
			} else {
				const sh = findObject( drag.obj.id );
				if ( sh && 'ground' === sh.sheet.base ) {
					sh.sheet.yBase = Math.max(
						10,
						Math.min( 100, sh.sheet.yBase + ddy * 100 )
					);
					drag.y = e.clientY;
				}
			}
			rebuildSoon();
		} else {
			drag.sheet.dx = Math.max( -0.5, Math.min( 0.5, drag.dx0 + ddx ) );
			drag.sheet.dy = Math.max( -0.5, Math.min( 0.5, drag.dy0 + ddy ) );
			repaint();
		}
	} );
	const endDrag = () => {
		if ( drag && ( 'object' === drag.kind || 'rotate' === drag.kind ) ) {
			rebuild();
			syncAll();
		}
		drag = null;
	};
	canvas.addEventListener( 'pointerup', endDrag );
	canvas.addEventListener( 'pointercancel', endDrag );

	let sunDrag = null;
	sunBtn.addEventListener( 'pointerdown', ( e ) => {
		sunDrag = { x: e.clientX, v: params.lightX };
		sunBtn.setPointerCapture( e.pointerId );
		e.stopPropagation();
	} );
	sunBtn.addEventListener( 'pointermove', ( e ) => {
		if ( ! sunDrag ) {
			return;
		}
		const r = view.getBoundingClientRect();
		params.lightX = Math.max(
			-100,
			Math.min(
				100,
				sunDrag.v + ( ( e.clientX - sunDrag.x ) / r.width ) * 320
			)
		);
		syncSun();
		repaint();
		if ( lightSlider ) {
			lightSlider.set( Math.round( params.lightX ) );
		}
	} );
	sunBtn.addEventListener( 'pointerup', () => ( sunDrag = null ) );

	/* ------------------------------ placement ---------------------------- */

	/** Where a new object goes, and on which kind of fresh sheet. */
	const addObject = ( obj ) => {
		const sky = params.sheets.find( ( s ) => 'full' === s.base );
		if ( isCutObject( obj ) ) {
			// Holes need paper around them: they belong on the backdrop.
			const host = sky || params.sheets[ 0 ];
			if ( host ) {
				host.objects.push( obj );
			}
		} else if ( 'cloud' === obj.kind ) {
			const s = defaultSheet( 'top', {
				yBase: Math.max( 12, obj.y * 100 - 6 ),
			} );
			s.objects.push( obj );
			params.sheets.splice( sky ? 1 : 0, 0, s );
		} else if ( 'branch' === obj.kind ) {
			const s = defaultSheet( 'edge', { border: 3 } );
			s.objects.push( obj );
			params.sheets.push( s );
		} else {
			// Everything that stands gets its OWN complete sheet: a
			// horizon at its feet, mounds where it needs them.
			const s = defaultSheet( 'ground', {
				yBase: Math.min( 98, obj.y * 100 + 4 ),
			} );
			s.objects.push( obj );
			params.sheets.push( s );
		}
		if ( params.sheets.length > 12 ) {
			params.sheets.splice( 1, 1 );
		}
		selected = obj.id;
		rebuild();
		syncAll();
	};

	/* ------------------------------ library ----------------------------- */

	const thumbEngine = new PaperEngine( document.createElement( 'canvas' ) );
	thumbEngine.setSize( 168, 112 );
	const thumbQueue = [];
	let thumbBusy = false;
	const pumpThumbs = () => {
		if ( closed || ! thumbQueue.length ) {
			thumbBusy = false;
			return;
		}
		const job = thumbQueue.shift();
		let url = THUMBS.get( job.key );
		if ( ! url ) {
			url = job.make();
			THUMBS.set( job.key, url );
		}
		job.el.style.backgroundImage = `url(${ url })`;
		requestAnimationFrame( pumpThumbs );
	};
	const queueThumb = ( key, el, make ) => {
		thumbQueue.push( { key, el, make } );
		if ( ! thumbBusy ) {
			thumbBusy = true;
			requestAnimationFrame( pumpThumbs );
		}
	};
	const thumbOf = ( sheets, extra = {} ) => () => {
		thumbEngine.build(
			cleanParams( { ...defaultParams(), frame: 'none', ...extra, sheets } )
		);
		thumbEngine.render();
		return thumbEngine.canvas.toDataURL( 'image/png' );
	};
	const presetThumb = ( p ) => () => {
		thumbEngine.build( cleanParams( { ...defaultParams(), ...p.patch() } ) );
		thumbEngine.render();
		return thumbEngine.canvas.toDataURL( 'image/png' );
	};

	const famSection = ( title ) => {
		ui.el( 'div', 'wpiepca-famhead', left, title );
		return ui.el( 'div', 'wpiepca-libgrid', left );
	};
	const tile = ( grid, label, key, make, onClick ) => {
		const el = ui.el( 'button', 'wpiepca-tile', grid );
		el.type = 'button';
		const th = ui.el( 'span', 'wpiepca-tile-thumb', el );
		ui.el( 'span', 'wpiepca-tile-label', el, label );
		el.onclick = onClick;
		queueThumb( key, th, make );
		return el;
	};

	const cap = ( s ) => t( s.charAt( 0 ).toUpperCase() + s.slice( 1 ) );

	const buildLibrary = () => {
		const pf = famSection( t( 'Scenes' ) );
		for ( const p of PRESETS ) {
			tile( pf, p.label, 'preset:' + p.id, presetThumb( p ), () => {
				Object.assign( params, cleanParams( { ...params, ...p.patch() } ) );
				selected = null;
				rebuild();
				syncAll();
			} );
		}

		const lf = famSection( t( 'Landscape' ) );
		const lands = [
			[ t( 'Mountain ridge' ), 'ridge' ],
			[ t( 'Rolling hills' ), 'hills' ],
			[ t( 'Dunes' ), 'dunes' ],
			[ t( 'Waves' ), 'waves' ],
			[ t( 'City skyline' ), 'city' ],
			[ t( 'Flat ground' ), 'ground' ],
		];
		for ( const [ label, base ] of lands ) {
			tile(
				lf,
				label,
				'base:' + base,
				thumbOf( [
					defaultSheet( 'full', { yBase: 100 } ),
					defaultSheet( base, { seed: 8, yBase: 62, height: 40 } ),
					defaultSheet( base, { seed: 9, yBase: 88, height: 32 } ),
				] ),
				() => {
					const s = defaultSheet( base, {
						yBase: Math.min( 96, 52 + params.sheets.length * 8 ),
						height: 'waves' === base ? 20 : 34,
					} );
					params.sheets.push( s );
					selected = s.id;
					rebuild();
					syncAll();
				}
			);
		}

		const tf = famSection( t( 'Trees & plants' ) );
		for ( const species of TREE_SPECIES ) {
			tile(
				tf,
				cap( species ),
				'tree:' + species,
				thumbOf( [
					defaultSheet( 'full', { yBase: 100 } ),
					{
						...defaultSheet( 'ground', { seed: 21, yBase: 88 } ),
						objects: [
							defaultObject( 'trees', {
								species,
								y: 0.88,
								spread: 0.8,
								count: 3,
								scale: 'palm' === species ? 46 : 40,
							} ),
						],
					},
				] ),
				() =>
					addObject(
						defaultObject( 'trees', {
							species,
							x: 0.5,
							y: 0.86,
							spread: 40,
							count: 5,
							scale: 'palm' === species ? 34 : 26,
						} )
					)
			);
		}
		for ( const species of PLANT_SPECIES ) {
			tile(
				tf,
				cap( species ),
				'plant:' + species,
				thumbOf( [
					defaultSheet( 'full', { yBase: 100 } ),
					{
						...defaultSheet( 'ground', { seed: 31, yBase: 86 } ),
						objects: [
							defaultObject( 'plants', {
								species,
								y: 0.86,
								spread: 90,
								count: 10,
								scale: 26,
							} ),
						],
					},
				] ),
				() =>
					addObject(
						defaultObject( 'plants', {
							species,
							x: 0.5,
							y: 0.9,
							spread: 60,
							count: 12,
							scale: 16,
						} )
					)
			);
		}

		const af = famSection( t( 'Animals' ) );
		for ( const species of GROUND_ANIMALS.concat( WATER_ANIMALS ) ) {
			tile(
				af,
				cap( species ),
				'an:' + species,
				thumbOf( [
					defaultSheet( 'full', { yBase: 100 } ),
					{
						...defaultSheet( 'ground', { seed: 41, yBase: 88 } ),
						objects: [
							defaultObject( 'animal', {
								species,
								x: 0.5,
								y: 0.88,
								scale: 58,
							} ),
						],
					},
				] ),
				() =>
					addObject(
						defaultObject( 'animal', {
							species,
							x: 0.4,
							y: 0.86,
							scale: 30,
						} )
					)
			);
		}

		const sf = famSection( t( 'Sky' ) );
		const skyItems = [
			[ t( 'Cloud' ), () => defaultObject( 'cloud', { x: 0.4, y: 0.22 } ) ],
			[
				t( 'Moon' ),
				() => defaultObject( 'orb', { variant: 'moon', x: 0.7, y: 0.24 } ),
			],
			[
				t( 'Crescent' ),
				() =>
					defaultObject( 'orb', { variant: 'crescent', x: 0.7, y: 0.24 } ),
			],
			[
				t( 'Sun' ),
				() => defaultObject( 'orb', { variant: 'sun', x: 0.7, y: 0.24 } ),
			],
			[ t( 'Flock' ), () => defaultObject( 'flock', { count: 5 } ) ],
			...SKY_ANIMALS.map( ( species ) => [
				cap( species ),
				() => defaultObject( 'flyer', { species, x: 0.5, y: 0.24 } ),
			] ),
		];
		for ( const [ label, make ] of skyItems ) {
			const probe = make();
			tile(
				sf,
				label,
				'sky:' + probe.kind + ( probe.species || probe.variant || '' ),
				thumbOf( [
					{
						...defaultSheet( 'full', { yBase: 100 } ),
						objects: [
							{ ...probe, id: 'thumb', x: 0.5, y: 0.4, scale: probe.scale * 1.8 },
						],
					},
					defaultSheet( 'hills', { seed: 9, yBase: 92, height: 20 } ),
				] ),
				() => addObject( make() )
			);
		}

		const ff = famSection( t( 'Framing' ) );
		tile(
			ff,
			t( 'Corner branch' ),
			'fr:branch',
			thumbOf( [
				defaultSheet( 'full', { yBase: 100 } ),
				defaultSheet( 'hills', { seed: 9, yBase: 90, height: 22 } ),
				{
					...defaultSheet( 'edge', { border: 3 } ),
					objects: [ defaultObject( 'branch', { corner: 'tl', reach: 62 } ) ],
				},
			] ),
			() => addObject( defaultObject( 'branch' ) )
		);
		tile(
			ff,
			t( 'Words' ),
			'fr:text',
			thumbOf( [
				defaultSheet( 'full', { yBase: 100 } ),
				{
					...defaultSheet( 'ground', { seed: 3, yBase: 96 } ),
					objects: [
						defaultObject( 'text', {
							value: 'ART',
							x: 0.5,
							y: 0.78,
							scale: 34,
						} ),
					],
				},
			] ),
			() =>
				addObject(
					defaultObject( 'text', { x: 0.5, y: 0.88, scale: 22 } )
				)
		);
	};

	/* ---------------------------- side panels --------------------------- */

	let stackBody = null;
	let selBody = null;
	let ampelEl = null;
	let lightSlider = null;
	let histCanvas = null;

	const unmountAll = () => {
		while ( unmounts.length ) {
			try {
				unmounts.pop().unmount();
			} catch ( e ) {}
		}
	};

	const BASE_LABEL = {
		full: 'Backdrop',
		ridge: 'Mountain ridge',
		hills: 'Rolling hills',
		dunes: 'Dunes',
		waves: 'Waves',
		city: 'City skyline',
		ground: 'Flat ground',
		top: 'Cloud bank',
		edge: 'Frame edge',
		photo: 'Photo band',
		subject: 'Subject',
	};
	const sheetName = ( s ) =>
		t( BASE_LABEL[ s.base ] || 'Sheet' ) +
		( 'photo' === s.base ? ' ' + ( s.band + 1 ) : '' );
	const objectName = ( o ) => {
		if ( 'animal' === o.kind || 'flyer' === o.kind ) {
			return cap( o.species );
		}
		if ( 'trees' === o.kind || 'plants' === o.kind ) {
			return cap( o.species );
		}
		if ( 'orb' === o.kind ) {
			return cap( o.variant );
		}
		if ( 'flock' === o.kind ) {
			return t( 'Flock' );
		}
		if ( 'cloud' === o.kind ) {
			return t( 'Cloud' );
		}
		if ( 'branch' === o.kind ) {
			return t( 'Corner branch' );
		}
		return o.value ? '"' + o.value + '"' : t( 'Words' );
	};

	const miniBtn = ( row, icon, title, disabled, onClick ) => {
		const b = ui.el( 'button', 'wpiepca-mini', row );
		b.type = 'button';
		b.title = title;
		b.innerHTML = icon;
		b.disabled = !! disabled;
		b.onclick = ( e ) => {
			e.stopPropagation();
			onClick();
		};
		return b;
	};

	// Selecting must never rebuild this list: the colour picker mounts
	// its popover INSIDE its host, so a rebuild would tear it down the
	// moment it opens. Rows remember themselves and only re-highlight.
	let rowsById = new Map();

	const syncHighlight = () => {
		for ( const [ id, el ] of rowsById ) {
			el.classList.toggle( 'is-on', selected === id );
		}
	};

	const syncStack = () => {
		if ( ! stackBody ) {
			return;
		}
		unmountAll();
		rowsById = new Map();
		stackBody.textContent = '';
		// Front sheet first: the list reads like the stack looks.
		for ( let i = params.sheets.length - 1; i >= 0; i-- ) {
			const sheet = params.sheets[ i ];
			const row = ui.el(
				'div',
				'wpiepca-lrow' + ( selected === sheet.id ? ' is-on' : '' ),
				stackBody
			);
			rowsById.set( sheet.id, row );
			row.onclick = () => {
				selected = sheet.id;
				syncHighlight();
				syncSelection();
				repaint();
			};
			ui.el( 'span', 'wpiepca-lname', row, sheetName( sheet ) );
			const colorHost = ui.el( 'span', 'wpiepca-lcolor', row );
			// The picker lives INSIDE this host; letting the click reach
			// the row would reselect and rebuild the whole stack, which
			// tears the popover down in the same tick.
			colorHost.addEventListener( 'pointerdown', ( e ) =>
				e.stopPropagation()
			);
			colorHost.addEventListener( 'click', ( e ) => e.stopPropagation() );
			if ( bridge.components && bridge.components.mountColorButton ) {
				const built = engine
					.allSheets()
					.find( ( s ) => s.sheet.id === sheet.id );
				const handle = bridge.components.mountColorButton( colorHost, {
					color: sheet.color || ( built && built.color ) || '#888888',
					onChange: ( c ) => {
						sheet.color = 'string' === typeof c ? c : c && c.hex;
						handle.set( sheet.color );
						rebuildSoon();
					},
				} );
				unmounts.push( handle );
			}
			miniBtn( row, I.up, t( 'Move forward' ), i === params.sheets.length - 1, () => {
				const tmp = params.sheets[ i + 1 ];
				params.sheets[ i + 1 ] = sheet;
				params.sheets[ i ] = tmp;
				rebuild();
				syncAll();
			} );
			miniBtn( row, I.down, t( 'Move back' ), 0 === i, () => {
				const tmp = params.sheets[ i - 1 ];
				params.sheets[ i - 1 ] = sheet;
				params.sheets[ i ] = tmp;
				rebuild();
				syncAll();
			} );
			miniBtn(
				row,
				I.x,
				t( 'Remove' ),
				params.sheets.length <= 1,
				() => {
					params.sheets.splice( i, 1 );
					selected = null;
					rebuild();
					syncAll();
				}
			);
			// The objects living on this sheet.
			for ( let k = sheet.objects.length - 1; k >= 0; k-- ) {
				const obj = sheet.objects[ k ];
				const orow = ui.el(
					'div',
					'wpiepca-orow' + ( selected === obj.id ? ' is-on' : '' ),
					stackBody
				);
				rowsById.set( obj.id, orow );
				orow.onclick = () => {
					selected = obj.id;
					syncHighlight();
					syncSelection();
					repaint();
				};
				ui.el( 'span', 'wpiepca-oname', orow, objectName( obj ) );
				miniBtn( orow, I.merge, t( 'Move to the sheet behind' ), 0 === i, () => {
					sheet.objects.splice( k, 1 );
					params.sheets[ i - 1 ].objects.push( obj );
					rebuild();
					syncAll();
				} );
				miniBtn(
					orow,
					I.lift,
					t( 'Move to the sheet in front' ),
					i === params.sheets.length - 1,
					() => {
						sheet.objects.splice( k, 1 );
						params.sheets[ i + 1 ].objects.push( obj );
						rebuild();
						syncAll();
					}
				);
				miniBtn( orow, I.x, t( 'Remove' ), false, () => {
					sheet.objects.splice( k, 1 );
					if ( selected === obj.id ) {
						selected = null;
					}
					rebuild();
					syncAll();
				} );
			}
		}
	};

	const sliderRow = ( parent, label, value, min, max, onInput, step = 1 ) =>
		ui.slider( parent, { label, min, max, step, value, onInput } );

	const syncSelection = () => {
		if ( ! selBody ) {
			return;
		}
		selBody.textContent = '';
		const objHit = selected ? findObject( selected ) : null;
		const sheet = ! objHit && selected ? findSheet( selected ) : null;
		if ( ! objHit && ! sheet ) {
			ui.el(
				'div',
				'wpiepca-note',
				selBody,
				t( 'Pick something in the picture, or add from the left.' )
			);
			return;
		}
		if ( objHit ) {
			const o = objHit.object;
			ui.el( 'div', 'wpiepca-note', selBody, objectName( o ) );
			if ( 'text' === o.kind ) {
				const input = ui.el( 'input', 'dsm-input', selBody );
				input.type = 'text';
				input.value = o.value;
				input.oninput = () => {
					o.value = input.value.slice( 0, 40 );
					rebuildSoon();
				};
				if ( bridge.components && bridge.components.mountFontPicker ) {
					const host = ui.el(
						'span',
						'wpiepca-fonthost',
						ui.row( selBody, t( 'Font' ) )
					);
					const fp = bridge.components.mountFontPicker( host, {
						value: o.family,
						onChange: ( v ) => {
							o.family = v;
							if (
								bridge.fonts &&
								bridge.fonts.ensureFontsForLayers
							) {
								bridge.fonts
									.ensureFontsForLayers( [
										{ type: 'text', fontFamily: v },
									] )
									.then( rebuild )
									.catch( rebuild );
							} else {
								rebuild();
							}
						},
					} );
					unmounts.push( fp );
				}
				ui.select( ui.row( selBody, t( 'Cut style' ) ), {
					options: [
						{ value: 'paper', label: t( 'Paper letters' ) },
						{ value: 'cut', label: t( 'Cut out' ) },
					],
					value: o.mode,
					onChange: ( v ) => {
						o.mode = v;
						rebuild();
					},
				} );
			}
			if ( 'orb' === o.kind ) {
				ui.select( ui.row( selBody, t( 'Shape' ) ), {
					options: ORBS.map( ( v ) => ( { value: v, label: cap( v ) } ) ),
					value: o.variant,
					onChange: ( v ) => {
						o.variant = v;
						rebuild();
					},
				} );
			}
			if ( 'animal' === o.kind || 'flyer' === o.kind ) {
				const list =
					'flyer' === o.kind
						? SKY_ANIMALS
						: GROUND_ANIMALS.concat( WATER_ANIMALS );
				ui.select( ui.row( selBody, t( 'Kind' ) ), {
					options: list.map( ( v ) => ( { value: v, label: cap( v ) } ) ),
					value: o.species,
					onChange: ( v ) => {
						o.species = v;
						rebuild();
						syncAll();
					},
				} );
			}
			if ( 'trees' === o.kind || 'plants' === o.kind ) {
				const list = 'trees' === o.kind ? TREE_SPECIES : PLANT_SPECIES;
				ui.select( ui.row( selBody, t( 'Kind' ) ), {
					options: list.map( ( v ) => ( { value: v, label: cap( v ) } ) ),
					value: o.species,
					onChange: ( v ) => {
						o.species = v;
						rebuild();
						syncAll();
					},
				} );
				sliderRow( selBody, t( 'Count' ), o.count, 1, 30, ( v ) => {
					o.count = v;
					rebuildSoon();
				} );
				sliderRow( selBody, t( 'Spread' ), o.spread, 0, 150, ( v ) => {
					o.spread = v;
					rebuildSoon();
				} );
			}
			if ( 'flock' === o.kind ) {
				ui.select( ui.row( selBody, t( 'Kind' ) ), {
					options: SKY_ANIMALS.map( ( v ) => ( {
						value: v,
						label: cap( v ),
					} ) ),
					value: o.species,
					onChange: ( v ) => {
						o.species = v;
						rebuild();
					},
				} );
				sliderRow( selBody, t( 'Count' ), o.count, 1, 20, ( v ) => {
					o.count = v;
					rebuildSoon();
				} );
				sliderRow( selBody, t( 'Spread' ), o.spread, 5, 150, ( v ) => {
					o.spread = v;
					rebuildSoon();
				} );
			}
			if ( 'branch' === o.kind ) {
				ui.select( ui.row( selBody, t( 'Corner' ) ), {
					options: [
						{ value: 'tl', label: t( 'Top left' ) },
						{ value: 'tr', label: t( 'Top right' ) },
						{ value: 'bl', label: t( 'Bottom left' ) },
						{ value: 'br', label: t( 'Bottom right' ) },
					],
					value: o.corner,
					onChange: ( v ) => {
						o.corner = v;
						rebuild();
					},
				} );
				sliderRow( selBody, t( 'Reach' ), o.reach, 15, 100, ( v ) => {
					o.reach = v;
					rebuildSoon();
				} );
			}
			sliderRow( selBody, t( 'Size' ), o.scale, 3, 140, ( v ) => {
				o.scale = v;
				rebuildSoon();
			} );
			sliderRow( selBody, t( 'Rotation' ), o.rot, -180, 180, ( v ) => {
				o.rot = v;
				rebuildSoon();
			} );
			const row = ui.el( 'div', 'wpiepca-row', selBody );
			ui.el( 'span', 'dsm-label wpiepca-lbl', row, t( 'Variation' ) );
			miniBtn( row, I.dice, t( 'Roll a new variation' ), false, () => {
				o.seed = 1 + Math.floor( Math.random() * 999999 );
				rebuild();
			} );
			if ( 'orb' !== o.kind && 'cloud' !== o.kind && 'branch' !== o.kind ) {
				miniBtn( row, I.flip, t( 'Flip' ), false, () => {
					o.flip = ! o.flip;
					rebuild();
				} );
			}
			miniBtn( row, I.x, t( 'Remove' ), false, () => {
				const idx = objHit.sheet.objects.indexOf( o );
				objHit.sheet.objects.splice( idx, 1 );
				selected = null;
				rebuild();
				syncAll();
			} );
			return;
		}
		// A sheet is selected.
		ui.el( 'div', 'wpiepca-note', selBody, sheetName( sheet ) );
		if ( ! [ 'photo', 'subject', 'full' ].includes( sheet.base ) ) {
			ui.select( ui.row( selBody, t( 'Paper' ) ), {
				options: [
					{ value: 'ground', label: t( 'Flat ground' ) },
					{ value: 'ridge', label: t( 'Mountain ridge' ) },
					{ value: 'hills', label: t( 'Rolling hills' ) },
					{ value: 'dunes', label: t( 'Dunes' ) },
					{ value: 'waves', label: t( 'Waves' ) },
					{ value: 'city', label: t( 'City skyline' ) },
					{ value: 'top', label: t( 'Cloud bank' ) },
					{ value: 'edge', label: t( 'Frame edge' ) },
					{ value: 'full', label: t( 'Backdrop' ) },
				],
				value: sheet.base,
				onChange: ( v ) => {
					sheet.base = v;
					rebuild();
					syncAll();
				},
			} );
		}
		if ( 'edge' === sheet.base ) {
			sliderRow( selBody, t( 'Border' ), sheet.border, 1, 20, ( v ) => {
				sheet.border = v;
				rebuildSoon();
			} );
		} else if ( ! [ 'photo', 'subject', 'full' ].includes( sheet.base ) ) {
			sliderRow( selBody, t( 'Horizon' ), sheet.yBase, 2, 100, ( v ) => {
				sheet.yBase = v;
				rebuildSoon();
			} );
			if ( 'ground' !== sheet.base ) {
				sliderRow( selBody, t( 'Height' ), sheet.height, 0, 100, ( v ) => {
					sheet.height = v;
					rebuildSoon();
				} );
				sliderRow(
					selBody,
					t( 'Ruggedness' ),
					sheet.jag,
					0,
					100,
					( v ) => {
						sheet.jag = v;
						rebuildSoon();
					}
				);
			}
			const row = ui.el( 'div', 'wpiepca-row', selBody );
			ui.el( 'span', 'dsm-label wpiepca-lbl', row, t( 'Variation' ) );
			miniBtn( row, I.dice, t( 'Roll a new variation' ), false, () => {
				sheet.seed = 1 + Math.floor( Math.random() * 999999 );
				rebuild();
			} );
		}
	};

	/* ------------------------------ photo ------------------------------- */

	let photoExtra = null;
	let photoSrcUrl = '';

	const descendantIds = ( layers, rootId ) => {
		const ids = new Set( [ rootId ] );
		let grew = true;
		while ( grew ) {
			grew = false;
			for ( const l of layers ) {
				if ( l.parent && ids.has( l.parent ) && ! ids.has( l.id ) ) {
					ids.add( l.id );
					grew = true;
				}
			}
		}
		return ids;
	};

	const flattenLayers = ( layers, out = [] ) => {
		for ( const l of layers || [] ) {
			out.push( l );
			if ( Array.isArray( l.children ) && l.children.length && 'object' === typeof l.children[ 0 ] ) {
				flattenLayers( l.children, out );
			}
		}
		return out;
	};

	const canvasFromImage = ( url ) =>
		new Promise( ( resolve, reject ) => {
			const img = new Image();
			img.onload = () => {
				const c = document.createElement( 'canvas' );
				c.width = img.naturalWidth || img.width;
				c.height = img.naturalHeight || img.height;
				c.getContext( '2d' ).drawImage( img, 0, 0 );
				resolve( c );
			};
			img.onerror = reject;
			img.src = url;
		} );

	const applyPhotoSheets = () => {
		const bands = params.photo.bands;
		const keep = params.sheets.filter( ( s ) =>
			s.objects.some( ( o ) => 'text' === o.kind )
		);
		const sheets = [];
		for ( let b = bands - 1; b >= 0; b-- ) {
			sheets.push( defaultSheet( 'photo', { band: b } ) );
		}
		if ( params.photo.subject ) {
			sheets.push( defaultSheet( 'subject' ) );
		}
		params.sheets = sheets.concat( keep ).slice( 0, 12 );
		selected = null;
	};

	const loadPhotoSource = async () => {
		const src = params.photo.source;
		if ( 'none' === src ) {
			engine.setPhoto( null );
			return;
		}
		try {
			let c = null;
			if ( 'document' === src || 'layer' === src ) {
				if ( ! editor || ! bridge.raster || ! bridge.raster.renderToCanvas ) {
					return;
				}
				let layers = editor.state.layers || [];
				if ( editing && layer ) {
					const own = descendantIds( layers, layer.id );
					layers = layers.filter( ( l ) => ! own.has( l.id ) );
				}
				if ( 'layer' === src ) {
					const flat = flattenLayers( layers );
					const one = flat.find(
						( l ) => l.id === params.photo.layerId
					);
					layers = one ? [ one ] : layers;
				}
				c = await bridge.raster.renderToCanvas( editor.state.doc, layers, {
					scale: Math.min(
						1,
						1200 / Math.max( editor.state.doc.w, editor.state.doc.h )
					),
				} );
			} else if ( params.photo.src ) {
				c = await canvasFromImage( params.photo.src );
			}
			if ( ! c ) {
				return;
			}
			engine.setPhoto( c );
			photoSrcUrl = c.toDataURL( 'image/png' );
			const lm = engine.lumaAt( 240, 160, params.photo.blur );
			params.photo.thresholds = autoThresholds( lm.luma, params.photo.bands );
			drawHistogram();
			if ( params.photo.subject ) {
				await loadSubject();
			}
		} catch ( e ) {
			toasts.error( t( 'Could not read that picture.' ) );
		}
	};

	const loadSubject = async () => {
		if (
			! bridge.raster ||
			! bridge.raster.subjectCutout ||
			! photoSrcUrl
		) {
			return;
		}
		status.textContent = t( 'Cutting the subject out…' );
		try {
			const cut = await bridge.raster.subjectCutout( photoSrcUrl );
			engine.setSubject( await canvasFromImage( cut ) );
		} catch ( e ) {
			toasts.error( t( 'Could not read that picture.' ) );
			params.photo.subject = false;
		}
	};

	const drawHistogram = () => {
		if ( ! histCanvas || ! engine.photoCanvas ) {
			return;
		}
		const g = histCanvas.getContext( '2d' );
		const W = histCanvas.width;
		const H = histCanvas.height;
		g.clearRect( 0, 0, W, H );
		const lm = engine.lumaAt( 240, 160, params.photo.blur );
		const bins = histogram( lm.luma );
		g.fillStyle = 'rgba(140, 150, 170, 0.55)';
		for ( let i = 0; i < 64; i++ ) {
			const bh = bins[ i ] * ( H - 6 );
			g.fillRect( ( i / 64 ) * W, H - bh, W / 64 - 1, bh );
		}
		g.fillStyle = '#3b66ff';
		for ( const th of params.photo.thresholds ) {
			g.fillRect( th * W - 1.5, 0, 3, H );
		}
	};

	const bindHistogram = () => {
		let dragIdx = -1;
		histCanvas.addEventListener( 'pointerdown', ( e ) => {
			const r = histCanvas.getBoundingClientRect();
			const x = ( e.clientX - r.left ) / r.width;
			let best = 0;
			let bestD = 2;
			params.photo.thresholds.forEach( ( th, i ) => {
				const d = Math.abs( th - x );
				if ( d < bestD ) {
					bestD = d;
					best = i;
				}
			} );
			dragIdx = best;
			histCanvas.setPointerCapture( e.pointerId );
		} );
		histCanvas.addEventListener( 'pointermove', ( e ) => {
			if ( dragIdx < 0 ) {
				return;
			}
			const r = histCanvas.getBoundingClientRect();
			const x = Math.max(
				0.02,
				Math.min( 0.98, ( e.clientX - r.left ) / r.width )
			);
			const th = params.photo.thresholds;
			const lo = dragIdx > 0 ? th[ dragIdx - 1 ] + 0.01 : 0.02;
			const hi =
				dragIdx < th.length - 1 ? th[ dragIdx + 1 ] - 0.01 : 0.98;
			th[ dragIdx ] = Math.max( lo, Math.min( hi, x ) );
			drawHistogram();
			rebuildSoon();
		} );
		histCanvas.addEventListener( 'pointerup', () => ( dragIdx = -1 ) );
	};

	const syncPhotoExtra = () => {
		photoExtra.textContent = '';
		const src = params.photo.source;
		if ( 'layer' === src && editor ) {
			let layers = editor.state.layers || [];
			if ( editing && layer ) {
				const own = descendantIds( layers, layer.id );
				layers = layers.filter( ( l ) => ! own.has( l.id ) );
			}
			const flat = flattenLayers( layers );
			ui.select( ui.row( photoExtra, t( 'Pick a layer' ) ), {
				options: flat.map( ( l ) => ( {
					value: l.id,
					label: l.name || l.type || l.id,
				} ) ),
				value: params.photo.layerId || ( flat[ 0 ] && flat[ 0 ].id ),
				onChange: async ( v ) => {
					params.photo.layerId = v;
					await loadPhotoSource();
					applyPhotoSheets();
					rebuild();
					syncAll();
				},
			} );
		}
		if ( 'media' === src && bridge.components && bridge.components.mountMediaPicker ) {
			const node = ui.el( 'div', 'wpiepca-media', photoExtra );
			bridge.components.mountMediaPicker( node, {
				height: 170,
				onPick: async ( item ) => {
					try {
						const c = await canvasFromImage( item.fullUrl || item.url );
						params.photo.src = c.toDataURL( 'image/jpeg', 0.9 );
						await loadPhotoSource();
						applyPhotoSheets();
						rebuild();
						syncAll();
					} catch ( e ) {
						toasts.error( t( 'Could not read that picture.' ) );
					}
				},
			} );
		}
		if ( 'upload' === src ) {
			const file = ui.el( 'input', 'wpiepca-file', photoExtra );
			file.type = 'file';
			file.accept = 'image/*';
			file.onchange = () => {
				const f = file.files && file.files[ 0 ];
				if ( ! f ) {
					return;
				}
				const reader = new FileReader();
				reader.onload = async () => {
					params.photo.src = String( reader.result );
					await loadPhotoSource();
					applyPhotoSheets();
					rebuild();
					syncAll();
				};
				reader.readAsDataURL( f );
			};
		}
	};

	/* --------------------------- build the side -------------------------- */

	const buildSide = () => {
		const stackSec = ui.section( side, {
			icon: I.layers,
			title: t( 'Sheets & objects' ),
		} );
		stackBody = ui.el( 'div', 'wpiepca-lstack', stackSec );
		const addSheetBtn = ui.btn( stackSec, {
			label: t( 'Add empty sheet' ),
			onClick: () => {
				const s = defaultSheet( 'ground', {
					yBase: Math.min( 97, 60 + params.sheets.length * 8 ),
				} );
				params.sheets.push( s );
				selected = s.id;
				rebuild();
				syncAll();
			},
		} );
		void addSheetBtn;

		const selSec = ui.section( side, {
			icon: I.wand,
			title: t( 'Selection' ),
		} );
		selBody = ui.el( 'div', 'wpiepca-lage', selSec );

		const lookSec = ui.section( side, { icon: I.palette, title: t( 'Look' ) } );
		const chips = ui.el( 'div', 'wpiepca-looks', lookSec );
		for ( const look of LOOKS ) {
			const chip = ui.el( 'button', 'wpiepca-look', chips );
			chip.type = 'button';
			chip.title = look.label;
			chip.style.background = `linear-gradient(135deg, ${ look.front } 0%, ${ look.back } 60%, ${ look.bg[ 1 ] } 100%)`;
			chip.classList.toggle( 'is-on', params.look === look.id );
			chip.onclick = () => {
				params.look = look.id;
				chips
					.querySelectorAll( '.wpiepca-look' )
					.forEach( ( c ) => c.classList.remove( 'is-on' ) );
				chip.classList.add( 'is-on' );
				rebuild();
			};
		}
		sliderRow( lookSec, t( 'Glow' ), params.glow, 0, 100, ( v ) => {
			params.glow = v;
			repaint();
		} );
		sliderRow( lookSec, t( 'Paper grain' ), params.grain, 0, 100, ( v ) => {
			params.grain = v;
			repaint();
		} );

		const frameSec = ui.section( side, { icon: I.frame, title: t( 'Frame' ) } );
		const frameExtra = ui.el( 'div', null, frameSec );
		const frameLabels = {
			none: t( 'None' ),
			circle: t( 'Circle' ),
			heart: t( 'Heart' ),
			arch: t( 'Arch' ),
			oval: t( 'Oval' ),
			hex: t( 'Hexagon' ),
			letter: t( 'Initial letter' ),
		};
		const syncFrameExtra = () => {
			frameExtra.textContent = '';
			if ( 'letter' === params.frame ) {
				const inp = ui.el( 'input', 'dsm-input', frameExtra );
				inp.type = 'text';
				inp.maxLength = 1;
				inp.value = params.frameLetter;
				inp.oninput = () => {
					params.frameLetter = inp.value.slice( 0, 1 ) || 'A';
					rebuildSoon();
				};
			}
		};
		ui.select( ui.row( frameSec, t( 'Frame' ) ), {
			options: FRAMES.map( ( f ) => ( { value: f, label: frameLabels[ f ] } ) ),
			value: params.frame,
			onChange: ( v ) => {
				params.frame = v;
				syncFrameExtra();
				rebuild();
			},
		} );
		frameSec.appendChild( frameExtra );
		syncFrameExtra();
		sliderRow( frameSec, t( 'Border' ), params.frameInset, 2, 24, ( v ) => {
			params.frameInset = v;
			rebuildSoon();
		} );

		const lightSec = ui.section( side, { icon: I.sun, title: t( 'Light & paper' ) } );
		lightSlider = sliderRow(
			lightSec,
			t( 'Light' ),
			params.lightX,
			-100,
			100,
			( v ) => {
				params.lightX = v;
				syncSun();
				repaint();
			}
		);
		sliderRow( lightSec, t( 'Shadow' ), params.shadow, 0, 100, ( v ) => {
			params.shadow = v;
			repaint();
		} );
		sliderRow( lightSec, t( 'Softness' ), params.soft, 0, 100, ( v ) => {
			params.soft = v;
			repaint();
		} );

		const cutSec = ui.section( side, { icon: I.scissors, title: t( 'Cutting' ) } );
		sliderRow( cutSec, t( 'Cut width (cm)' ), params.cutWidth, 8, 100, ( v ) => {
			params.cutWidth = v;
			rebuildSoon();
		} );
		ui.select( ui.row( cutSec, t( 'Min bridge (mm)' ) ), {
			options: [ 1, 1.5, 2, 2.5, 3, 4, 5, 6 ].map( ( v ) => ( {
				value: String( v ),
				label: String( v ),
			} ) ),
			value: String( params.minBridge ),
			onChange: ( v ) => {
				params.minBridge = Number( v );
				rebuild();
			},
		} );
		sliderRow( cutSec, t( 'Detail' ), params.detail, 0, 100, ( v ) => {
			params.detail = v;
			rebuildSoon();
		} );
		ampelEl = ui.el( 'div', 'wpiepca-ampel', cutSec, '' );

		const photoSec = ui.section( side, { icon: I.photo, title: t( 'Photo' ) } );
		ui.select( ui.row( photoSec, t( 'Source' ) ), {
			options: [
				{ value: 'none', label: t( 'None' ) },
				{ value: 'document', label: t( 'The document' ) },
				{ value: 'layer', label: t( 'A layer' ) },
				{ value: 'media', label: t( 'From the media library' ) },
				{ value: 'upload', label: t( 'Upload a picture' ) },
			],
			value: params.photo.source,
			onChange: async ( v ) => {
				params.photo.source = v;
				syncPhotoExtra();
				if ( 'none' === v ) {
					engine.setPhoto( null );
					rebuild();
					return;
				}
				if ( 'document' === v || 'layer' === v ) {
					await loadPhotoSource();
					applyPhotoSheets();
					rebuild();
					syncAll();
				}
			},
		} );
		photoExtra = ui.el( 'div', null, photoSec );
		sliderRow( photoSec, t( 'Depth sheets' ), params.photo.bands, 2, 8, ( v ) => {
			params.photo.bands = v;
			if ( engine.photoCanvas ) {
				const lm = engine.lumaAt( 240, 160, params.photo.blur );
				params.photo.thresholds = autoThresholds( lm.luma, v );
				applyPhotoSheets();
				drawHistogram();
				rebuild();
				syncStack();
			}
		} );
		sliderRow( photoSec, t( 'Smoothing' ), params.photo.blur, 0, 100, ( v ) => {
			params.photo.blur = v;
			drawHistogram();
			rebuildSoon();
		} );
		ui.check( photoSec, {
			label: t( 'Bright side front' ),
			checked: params.photo.invert,
			onChange: ( v ) => {
				params.photo.invert = v;
				rebuild();
			},
		} );
		if ( bridge.raster && bridge.raster.subjectCutout ) {
			ui.check( photoSec, {
				label: t( 'Lift the subject onto the front sheet' ),
				checked: params.photo.subject,
				onChange: async ( v ) => {
					params.photo.subject = v;
					if ( v ) {
						await loadSubject();
					}
					applyPhotoSheets();
					rebuild();
					syncAll();
				},
			} );
		}
		histCanvas = ui.el( 'canvas', 'wpiepca-hist', photoSec );
		histCanvas.width = 280;
		histCanvas.height = 56;
		bindHistogram();
		ui.el(
			'div',
			'wpiepca-note',
			photoSec,
			t( 'Photo sheets replace the current layers.' )
		);
	};

	const syncAll = () => {
		syncStack();
		syncSelection();
		drawHistogram();
	};

	/* ------------------------------ exports ------------------------------ */

	const download = ( blob, name ) => {
		const a = document.createElement( 'a' );
		a.href = URL.createObjectURL( blob );
		a.download = name;
		a.click();
		setTimeout( () => URL.revokeObjectURL( a.href ), 4000 );
	};

	const exportZip = () => {
		const { files, mmW, mmH, sheets } = engine.cutSvgs( params );
		const readme = [
			'Papercut Art - cut package',
			'',
			`Physical size: ${ mmW } x ${ mmH.toFixed( 0 ) } mm (scale the SVGs together to resize).`,
			`Minimum bridge width: ${ params.minBridge } mm.`,
			'Stack order: layer-01 is the BACK sheet, the highest number is the front.',
			'Every file is one connected piece: cut the black shape, keep the sheet.',
			'',
			...files.map(
				( f, i ) =>
					`${ f.name }  color ${ f.color }  (${ f.kind })`
			),
		].join( '\n' );
		const zip = buildZip( [
			...files.map( ( f ) => ( { name: f.name, data: f.data } ) ),
			{ name: 'README.txt', data: readme },
		] );
		download(
			new Blob( [ zip ], { type: 'application/zip' } ),
			'papercut-art.zip'
		);
		toasts.success( t( 'Cut package saved.' ) );
		void sheets;
	};

	const insert = () => {
		if ( ! editor || ! bridge.documents ) {
			return;
		}
		const scale = Math.min( 1, 2200 / Math.max( doc.w, doc.h ) );
		const iw = Math.round( doc.w * scale );
		const ih = Math.round( doc.h * scale );
		const { images } = engine.sheetImages( iw, ih, params );
		if ( editing && layer ) {
			const old = editor.state.layers || [];
			const gone = descendantIds( old, layer.id );
			editor.dispatch( {
				type: 'SET_LAYERS',
				layers: old.filter( ( l ) => ! gone.has( l.id ) ),
			} );
		}
		const group = bridge.documents.makeGroup( {
			name: 'Papercut Art',
			x: 0,
			y: 0,
			w: doc.w,
			h: doc.h,
		} );
		group.generator = {
			id: GEN_ID,
			params: JSON.parse( JSON.stringify( params ) ),
		};
		editor.dispatch( { type: 'ADD_LAYER', layer: group } );
		images.forEach( ( { sheet, src }, i ) => {
			const child = bridge.documents.makeImage( {
				name:
					'Papercut ' +
					( i + 1 ) +
					' - ' +
					( '__frame' === sheet.sheet.id
						? t( 'Frame' )
						: sheetName( sheet.sheet ) ),
				x: 0,
				y: 0,
				w: doc.w,
				h: doc.h,
				src,
				naturalW: iw,
				naturalH: ih,
			} );
			child.parent = group.id;
			editor.dispatch( { type: 'ADD_LAYER', layer: child } );
		} );
		editor.dispatch( { type: 'SET_ACTIVE', id: group.id } );
		editor.commit( 'Papercut Art' );
		toasts.success( t( 'Inserted as editable layers.' ) );
		modal.close();
	};

	const recordReveal = async () => {
		if ( ! bridge.video || ! bridge.video.canRecordCanvas || ! bridge.video.canRecordCanvas() ) {
			toasts.error( t( 'This browser cannot record video.' ) );
			return;
		}
		status.textContent = t( 'Recording…' );
		try {
			const blob = await engine.recordReveal( bridge.video );
			const ext =
				bridge.video.recordingExtension
					? bridge.video.recordingExtension()
					: 'webm';
			download( blob, 'papercut-art.' + ext );
		} catch ( e ) {
			toasts.error( t( 'This browser cannot record video.' ) );
		}
		syncStatus();
	};

	/* ------------------------------ footer ------------------------------- */

	ui.btn( actions, { label: t( 'Cancel' ), onClick: () => modal.close() } );
	ui.btn( actions, { label: t( 'Cut package (ZIP)' ), onClick: exportZip } );
	if ( bridge.video && bridge.video.canRecordCanvas && bridge.video.canRecordCanvas() ) {
		ui.btn( actions, { label: t( 'Reveal video' ), onClick: recordReveal } );
	}
	ui.btn( actions, {
		label: editing ? t( 'Update' ) : t( 'Insert' ),
		primary: true,
		onClick: insert,
	} );

	/* ------------------------------ start up ----------------------------- */

	function destroy() {
		closed = true;
		unmountAll();
		if ( window.__pca && window.__pca.engine === engine ) {
			delete window.__pca;
		}
	}

	buildLibrary();
	buildSide();
	requestAnimationFrame( async () => {
		fitCanvas();
		if ( 'none' !== params.photo.source ) {
			await loadPhotoSource();
		}
		rebuild();
		syncAll();
	} );

	window.__pcaPresets = PRESETS.map( ( p ) => p.id );
	window.__pca = {
		engine,
		get selected() {
			return selected;
		},
		pick: ( id ) => {
			selected = id;
			syncAll();
			repaint();
		},
		get params() {
			return params;
		},
		rebuild,
		close: () => modal.close(),
		applyPreset: ( id ) => {
			const p = PRESETS.find( ( x ) => x.id === id );
			if ( p ) {
				Object.assign( params, p.patch() );
				rebuild();
				syncAll();
			}
		},
	};
}

/* -------------------------------- register ------------------------------- */

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Papercut Art',
		run: ( ctx ) => openStudio( ctx ),
		edit: ( ctx ) => openStudio( ctx ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else {
	window.wp.hooks.addAction( 'wpie.ready', 'wpie-papercut-art', register );
}

// Referenced to keep the import explicit for future presets.
void lookById;
