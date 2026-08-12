/**
 * WPIE extension: Papercut Art.
 *
 * Layered papercut pictures with real depth. Layers come from parametric
 * silhouettes, from a photo sliced along its DEPTH, from the local
 * subject cutout and from typed words. Insert as editable layers, one
 * per sheet of paper.
 *
 * Until v3 every layer also had to be a physically cuttable piece of
 * paper. Nothing is cut any more - the pictures only have to look good -
 * and that single change is what let the handling come loose.
 */

import { t } from './i18n.js';
import { PaperEngine } from './ui/engine.js';
import {
	cleanParams,
	defaultParams,
	defaultLayer,
	defaultObject,
	PRESETS,
	LOOKS,
	PROFILES,
	WINDOWS,
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

/**
 * The library and the thumbnails describe their little scenes in the old
 * sheet vocabulary, which reads well: "a backdrop, a ridge, a ground".
 * cleanParams() turns a base into the object that replaces it, so this
 * shape is still a legal way to state a layer.
 *
 * @param {string} base  Old base name.
 * @param {Object} extra yBase, height, jag, seed, border, objects.
 * @return {Object} A layer, stated the short way.
 */
const rawSheet = ( base, extra = {} ) => ( { base, objects: [], ...extra } );

const GEN_ID = 'wpie-papercut-art/scene';

// Objects that cover the page: no corner to drag, no size, no rotation.
const FULL_PAGE_KINDS = [ 'backdrop', 'terrain', 'border', 'frame' ];

const ICON_BRAND =
	'<svg width="24" height="24" viewBox="0 0 18.83 18.83" aria-hidden="true"><path fill="currentColor" d="M13.84,18.83H3.62c-2,0-3.62-1.62-3.62-3.62V3.52h1.72c.7,0,1.28.57,1.28,1.28v10.43c0,.34.28.62.62.62h8.94c.71,0,1.29.58,1.29,1.29v1.71Z"/><path fill="#3b66ff" d="M18.83,14.02h-1.71c-.71,0-1.29-.58-1.29-1.29V3.62c0-.34-.28-.62-.62-.62H4.82c-.7,0-1.28-.57-1.28-1.28V0h11.67c2,0,3.62,1.62,3.62,3.62v10.4Z"/><circle fill="currentColor" cx="17.33" cy="17.33" r="1.5"/><path fill="#3b66ff" d="M9.51,5.71l.91,2.45c.03.08.09.14.17.17l2.45.91c.07.03.07.13,0,.16l-2.45.91c-.08.03-.14.09-.17.17l-.91,2.45c-.03.07-.13.07-.16,0l-.91-2.45c-.03-.08-.09-.14-.17-.17l-2.45-.91c-.07-.03-.07-.13,0-.16l2.45-.91c.08-.03,.14-.09,.17-.17l.91-2.45c.03-.07,.13-.07,.16,0Z"/></svg>';

const svg = ( inner, size = 14 ) =>
	`<svg width="${ size }" height="${ size }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ inner }</svg>`;
const I = {
	dice: svg(
		'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.4" fill="currentColor" stroke="none"/>'
	),
	x: svg( '<path d="M18 6l-12 12M6 6l12 12"/>', 12 ),
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
	grip: svg(
		'<circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/>',
		12
	),
	flip: svg( '<path d="M12 3v18M8 8l-4 4l4 4M16 8l4 4l-4 4"/>', 12 ),
	palette: svg(
		'<path d="M12 21a9 9 0 1 1 9 -9c0 2 -1.5 3 -3 3h-2a2 2 0 0 0 -2 2c0 .5 .2 1 .6 1.4c.4 .4 .4 1 .1 1.5c-.5 .7 -1.5 1.1 -2.7 1.1"/><circle cx="8" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r="1" fill="currentColor" stroke="none"/>'
	),
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
	const editing = !! (
		layer &&
		layer.generator &&
		layer.generator.id === GEN_ID
	);
	const params = cleanParams(
		editing ? layer.generator.params : defaultParams()
	);

	const modal = ui.dialog( {
		title: 'Papercut Art',
		subtitle: editing
			? t( 'Adjust the scene, the group updates in place.' )
			: t( 'Layered paper pictures with real depth.' ),
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
		'Click to pick · drag to move · corner handles resize · Del removes · Ctrl+Z undoes'
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
		engine.setSize(
			Math.min( 1100, w * 1.6 ),
			Math.min( 1100 / ar, ( w * 1.6 ) / ar )
		);
	};

	/* ----------------------------- rebuilds ---------------------------- */

	const rebuild = () => {
		engine.build( params );
		engine.render( { selected } );
		syncStatus();
		syncSun();
	};
	/**
	 * The same thing, without the status line - for the frames of a drag.
	 *
	 * There used to be a 120ms debounce here, and it was the single worst
	 * thing about this studio: `clearTimeout` reset the timer on every
	 * pointermove, so during a CONTINUOUS drag it never fired at all. The
	 * picture stood still until you paused, then jumped. It existed
	 * because a rebuild had to re-prove every sheet. Nothing is proven any
	 * more, and the per-layer cache means one moved object costs one
	 * layer, so the honest thing is to just draw.
	 */
	const rebuildLive = () => {
		engine.build( params );
		engine.render( { selected } );
	};
	const repaint = () => engine.render( { selected } );

	const syncSun = () => {
		sunBtn.style.left = 'calc(50% + ' + ( params.lightX / 100 ) * 30 + '%)';
	};

	const syncStatus = () => {
		const built = engine.allLayers();
		const empty = built.filter( ( s ) => ! s.rings.length ).length;
		const objs = params.layers.reduce(
			( a, s ) => a + s.objects.length,
			0
		);
		const photoOn = 'none' !== params.photo.source;
		// Count THINGS, not layers. The layer is not a word this studio
		// says any more, so the status line must not say it either.
		const things =
			objs +
			built.filter( ( s ) => 'elements' !== s.layer.source ).length;
		status.textContent =
			things +
			' ' +
			t( 'objects' ) +
			// Say WHICH way the picture was sliced. Brightness only stands
			// in for distance in a hazy landscape, so a user looking at a
			// portrait that came out wrong deserves to know why.
			( photoOn
				? ' · ' +
				  ( engine.hasDepth()
						? t( 'sliced by real depth' )
						: t( 'sliced by brightness' ) )
				: '' ) +
			( empty
				? ' · ' +
				  t(
						'Some layers are empty - add elements or adjust the depth.'
				  )
				: '' );
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

	/** The object with that id, plus the layer carrying it. */
	const findObject = ( id ) => {
		for ( const s of params.layers ) {
			const o = s.objects.find( ( x ) => x.id === id );
			if ( o ) {
				return { layer: s, object: o };
			}
		}
		return null;
	};
	const findLayer = ( id ) => params.layers.find( ( s ) => s.id === id );

	/* ------------------------------- undo ------------------------------- */

	// A plain ring of snapshots. Everything that changes the scene calls
	// mark() first, so Ctrl+Z is a real way back and not a promise.
	const undoStack = [];
	const mark = () => {
		undoStack.push( JSON.stringify( params ) );
		if ( undoStack.length > 30 ) {
			undoStack.shift();
		}
	};
	const undo = () => {
		const prev = undoStack.pop();
		if ( ! prev ) {
			return;
		}
		const restored = cleanParams( JSON.parse( prev ) );
		for ( const k of Object.keys( params ) ) {
			delete params[ k ];
		}
		Object.assign( params, restored );
		if ( selected && ! findObject( selected ) && ! findLayer( selected ) ) {
			selected = null;
		}
		rebuild();
		syncAll();
	};

	/* ----------------------------- dragging ----------------------------- */

	let drag = null;
	canvas.addEventListener( 'pointerdown', ( e ) => {
		const [ px, py ] = canvasPoint( e );
		// Handles first, always: they sit ON the shape, and a hit test
		// that ignores what the eye sees is the classic drag-and-drop bug
		// in this family.
		const handles = selected ? engine.handlesFor( selected ) : null;
		const grabbed =
			handles &&
			handles.find(
				( hnd ) => Math.hypot( hnd.x - px, hnd.y - py ) <= hnd.r * 1.8
			);
		if ( grabbed ) {
			const found = findObject( selected );
			if ( found ) {
				mark();
				drag = {
					kind: 'rot' === grabbed.id ? 'rotate' : 'scale',
					obj: found.object,
					x: e.clientX,
					y: e.clientY,
					rot0: found.object.rot,
					scale0: found.object.scale,
				};
				canvas.setPointerCapture( e.pointerId );
				return;
			}
		}
		const hit = engine.hitAt( px, py );
		if ( ! hit ) {
			selected = null;
			syncHighlight();
			syncSelection();
			repaint();
			return;
		}
		mark();
		if ( 'object' === hit.type ) {
			selected = hit.object.id;
			drag = {
				// Alt still turns a plain drag into a rotation, for hands
				// that know the trick; the handle is for the ones that do
				// not.
				kind: e.altKey ? 'rotate' : 'object',
				obj: hit.object,
				x: e.clientX,
				y: e.clientY,
				x0: hit.object.x,
				y0: hit.object.y,
				rot0: hit.object.rot,
				scale0: hit.object.scale,
			};
		} else {
			selected = hit.layer.id;
			drag = {
				kind: 'layer',
				layer: hit.layer,
				x: e.clientX,
				y: e.clientY,
				dx0: hit.layer.dx,
				dy0: hit.layer.dy,
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
			rebuildLive();
		} else if ( 'scale' === drag.kind ) {
			// Pulling away from the middle grows it; the diagonal reads
			// as one number so a corner handle behaves like every other.
			const f = 1 + ( ddx + ddy ) * 1.6;
			drag.obj.scale = Math.max(
				3,
				Math.min( 140, Math.round( drag.scale0 * f ) )
			);
			rebuildLive();
		} else if ( 'object' === drag.kind ) {
			// Both axes, for everything. Trees and animals used to refuse
			// the pointer's y and moved the horizon of their sheet
			// instead, which is exactly what "I move the whole sheet
			// instead of the bird" meant.
			drag.obj.x = Math.max( -0.15, Math.min( 1.15, drag.x0 + ddx ) );
			drag.obj.y = Math.max( -0.15, Math.min( 1.15, drag.y0 + ddy ) );
			rebuildLive();
		} else {
			drag.layer.dx = Math.max( -0.5, Math.min( 0.5, drag.dx0 + ddx ) );
			drag.layer.dy = Math.max( -0.5, Math.min( 0.5, drag.dy0 + ddy ) );
			repaint();
		}
	} );
	const endDrag = () => {
		if ( drag && 'layer' !== drag.kind ) {
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

	/* ------------------------------ keyboard ----------------------------- */

	// There was no keydown handler at all before v3: Delete did not
	// delete, the arrows did nothing, and there was no way back.
	const onKey = ( e ) => {
		if ( ! document.body.contains( canvas ) ) {
			return;
		}
		const tag = ( e.target && e.target.tagName ) || '';
		if ( 'INPUT' === tag || 'TEXTAREA' === tag || 'SELECT' === tag ) {
			return;
		}
		if ( ( e.ctrlKey || e.metaKey ) && 'z' === e.key.toLowerCase() ) {
			e.preventDefault();
			undo();
			return;
		}
		if ( ! selected ) {
			return;
		}
		const found = findObject( selected );
		if ( 'Delete' === e.key || 'Backspace' === e.key ) {
			e.preventDefault();
			mark();
			if ( found ) {
				const i = found.layer.objects.indexOf( found.object );
				found.layer.objects.splice( i, 1 );
			} else if ( params.layers.length > 1 ) {
				const li = params.layers.findIndex(
					( s ) => s.id === selected
				);
				if ( li >= 0 ) {
					params.layers.splice( li, 1 );
				}
			}
			selected = null;
			rebuild();
			syncAll();
			return;
		}
		const step = e.shiftKey ? 0.05 : 0.005;
		const nudge = {
			ArrowLeft: [ -step, 0 ],
			ArrowRight: [ step, 0 ],
			ArrowUp: [ 0, -step ],
			ArrowDown: [ 0, step ],
		}[ e.key ];
		if ( ! nudge ) {
			return;
		}
		e.preventDefault();
		mark();
		if ( found ) {
			found.object.x = Math.max(
				-0.15,
				Math.min( 1.15, found.object.x + nudge[ 0 ] )
			);
			found.object.y = Math.max(
				-0.15,
				Math.min( 1.15, found.object.y + nudge[ 1 ] )
			);
			rebuild();
			syncSelection();
		} else {
			// `sheet`, not `layer`: the outer `layer` is the EDITOR's layer
			// this studio was opened on. Two different things under one
			// name in one file is how the wrong one gets moved.
			const sheet = findLayer( selected );
			if ( sheet ) {
				sheet.dx = Math.max(
					-0.5,
					Math.min( 0.5, sheet.dx + nudge[ 0 ] )
				);
				sheet.dy = Math.max(
					-0.5,
					Math.min( 0.5, sheet.dy + nudge[ 1 ] )
				);
				repaint();
			}
		}
	};
	document.addEventListener( 'keydown', onKey );

	/* ------------------------------ placement ---------------------------- */

	/**
	 * Put a new object on the stack.
	 *
	 * v2 gave every standing element a COMPLETE sheet of its own, with a
	 * horizon at its feet and mounds underneath, because a sheet had to
	 * be one connected piece of paper. Five trees meant five sheets, all
	 * called "Flat ground", and past twelve one of them was deleted
	 * without a word. A new element simply gets its own layer now, and
	 * nothing is ever silently thrown away.
	 *
	 * @param {Object}  obj       The object.
	 * @param {Object}  opts      Placement.
	 * @param {?string} opts.onto An existing layer id to share, or null
	 *                            for a layer of its own.
	 */
	const addObject = ( obj, { onto = null } = {} ) => {
		mark();
		// A picture has ONE passepartout. Picking a second window means
		// "this one instead", not "two frames on top of each other".
		if ( 'frame' === obj.kind ) {
			for ( const l of params.layers ) {
				const k = l.objects.findIndex( ( o ) => 'frame' === o.kind );
				if ( k >= 0 ) {
					l.objects[ k ] = { ...obj, id: l.objects[ k ].id };
					selected = l.objects[ k ].id;
					rebuild();
					syncAll();
					return;
				}
			}
		}
		const host = onto ? findLayer( onto ) : null;
		if ( host ) {
			host.objects.push( obj );
		} else {
			// Sky things go towards the back, things on the ground to the
			// front - a first guess the user can override by dragging the
			// layer up or down.
			const sheet = defaultLayer( { objects: [ obj ] } );
			if ( 'cloud' === obj.kind || 'flock' === obj.kind ) {
				params.layers.splice( 1, 0, sheet );
			} else {
				// A passepartout is the last sheet by definition; anything
				// else lands in front of what is there but behind it.
				const frameAt = params.layers.findIndex( ( l ) =>
					l.objects.some( ( o ) => 'frame' === o.kind )
				);
				if ( 'frame' !== obj.kind && frameAt >= 0 ) {
					params.layers.splice( frameAt, 0, sheet );
				} else {
					params.layers.push( sheet );
				}
			}
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
	const thumbOf =
		( layers, extra = {} ) =>
		() => {
			thumbEngine.build(
				cleanParams( {
					...defaultParams(),
					photo: { source: 'none' },
					...extra,
					layers,
				} )
			);
			thumbEngine.render();
			return thumbEngine.canvas.toDataURL( 'image/png' );
		};
	const presetThumb = ( p ) => () => {
		thumbEngine.build(
			cleanParams( {
				...defaultParams(),
				photo: { source: 'none' },
				...p.patch(),
			} )
		);
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

	/**
	 * Ask before a scene wipes the work, in the editor's own dialog.
	 *
	 * `window.confirm` used to do this: a system box in the browser's own
	 * language, outside the editor's look, and one the editor cannot style
	 * or place. The bridge has carried a real one since API 2.14.
	 *
	 * On a core too old to have it we go AHEAD rather than refuse. The line
	 * above the grid already says that picking one replaces what you have,
	 * `mark()` puts an undo step in first, and a tile that silently does
	 * nothing is the worse failure of the two.
	 *
	 * @return {Promise<boolean>} Whether to replace.
	 */
	async function askReplace() {
		const ask =
			bridge && bridge.components && bridge.components.confirmDialog;
		if ( ! ask ) {
			return true;
		}
		return ask( {
			title: t( 'Start from a scene' ),
			message: t( 'Replace the current picture with this scene?' ),
			confirmLabel: t( 'Replace' ),
			destructive: true,
		} );
	}

	const buildLibrary = () => {
		// Scenes REPLACE everything. They used to sit in the same grid as
		// the elements, look the same and answer the same click, so one
		// stray hit wiped the work - with no undo to come back from. They
		// get their own block, their own colour, and a question.
		ui.el( 'div', 'wpiepca-famhead', left, t( 'Start from a scene' ) );
		ui.el(
			'div',
			'wpiepca-note',
			left,
			t( 'Picking one replaces what you have.' )
		);
		const pf = ui.el( 'div', 'wpiepca-libgrid is-scenes', left );
		for ( const p of PRESETS ) {
			tile( pf, p.label, 'preset:' + p.id, presetThumb( p ), async () => {
				const busy = params.layers.some( ( s ) => s.objects.length );
				if ( busy && ! ( await askReplace() ) ) {
					return;
				}
				mark();
				Object.assign(
					params,
					cleanParams( { ...params, ...p.patch() } )
				);
				selected = null;
				rebuild();
				syncAll();
			} );
		}

		const wf = famSection( t( 'Passepartout' ) );
		for ( const win of WINDOWS ) {
			tile(
				wf,
				t( WINDOW_LABEL[ win ] || win ),
				'win:' + win,
				thumbOf( [
					rawSheet( 'hills', { seed: 3, yBase: 70, height: 34 } ),
					{
						objects: [
							defaultObject( 'frame', {
								window: win,
								inset: 11,
							} ),
						],
					},
				] ),
				() => addObject( defaultObject( 'frame', { window: win } ) )
			);
		}

		const bf = famSection( t( 'Paper' ) );
		tile(
			bf,
			t( 'Backdrop' ),
			'base:full',
			thumbOf( [ rawSheet( 'full' ) ] ),
			() => addObject( defaultObject( 'backdrop' ) )
		);
		tile(
			bf,
			t( 'Frame edge' ),
			'base:edge',
			thumbOf( [
				rawSheet( 'full' ),
				rawSheet( 'edge', { border: 4 } ),
			] ),
			() => addObject( defaultObject( 'border' ) )
		);

		const lf = famSection( t( 'Landscape' ) );
		const lands = [
			[ t( 'Mountain ridge' ), 'ridge' ],
			[ t( 'Rolling hills' ), 'hills' ],
			[ t( 'Dunes' ), 'dunes' ],
			[ t( 'Waves' ), 'waves' ],
			[ t( 'City skyline' ), 'city' ],
			[ t( 'Flat ground' ), 'flat' ],
		];
		for ( const [ label, profile ] of lands ) {
			tile(
				lf,
				label,
				'base:' + profile,
				thumbOf( [
					rawSheet( 'full', { yBase: 100 } ),
					rawSheet( 'flat' === profile ? 'ground' : profile, {
						seed: 8,
						yBase: 62,
						height: 40,
					} ),
					rawSheet( 'flat' === profile ? 'ground' : profile, {
						seed: 9,
						yBase: 88,
						height: 32,
					} ),
				] ),
				() => {
					// A horizon is an object like any other now, so it can
					// be picked, dragged and reshaped afterwards.
					const yBase = Math.min( 96, 52 + params.layers.length * 8 );
					addObject(
						defaultObject( 'terrain', {
							profile,
							yBase,
							y: yBase / 100,
							height: 'waves' === profile ? 20 : 34,
						} )
					);
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
					rawSheet( 'full', { yBase: 100 } ),
					{
						...rawSheet( 'ground', { seed: 21, yBase: 88 } ),
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
					rawSheet( 'full', { yBase: 100 } ),
					{
						...rawSheet( 'ground', { seed: 31, yBase: 86 } ),
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
					rawSheet( 'full', { yBase: 100 } ),
					{
						...rawSheet( 'ground', { seed: 41, yBase: 88 } ),
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
			[
				t( 'Cloud' ),
				() => defaultObject( 'cloud', { x: 0.4, y: 0.22 } ),
			],
			[
				t( 'Moon' ),
				() =>
					defaultObject( 'orb', {
						variant: 'moon',
						x: 0.7,
						y: 0.24,
					} ),
			],
			[
				t( 'Crescent' ),
				() =>
					defaultObject( 'orb', {
						variant: 'crescent',
						x: 0.7,
						y: 0.24,
					} ),
			],
			[
				t( 'Sun' ),
				() =>
					defaultObject( 'orb', { variant: 'sun', x: 0.7, y: 0.24 } ),
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
						...rawSheet( 'full', { yBase: 100 } ),
						objects: [
							{
								...probe,
								id: 'thumb',
								x: 0.5,
								y: 0.4,
								scale: probe.scale * 1.8,
							},
						],
					},
					rawSheet( 'hills', { seed: 9, yBase: 92, height: 20 } ),
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
				rawSheet( 'full', { yBase: 100 } ),
				rawSheet( 'hills', { seed: 9, yBase: 90, height: 22 } ),
				{
					...rawSheet( 'edge', { border: 3 } ),
					objects: [
						defaultObject( 'branch', { corner: 'tl', reach: 62 } ),
					],
				},
			] ),
			() => addObject( defaultObject( 'branch' ) )
		);
		tile(
			ff,
			t( 'Words' ),
			'fr:text',
			thumbOf( [
				rawSheet( 'full', { yBase: 100 } ),
				{
					...rawSheet( 'ground', { seed: 3, yBase: 96 } ),
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

	const WINDOW_LABEL = {
		circle: 'Circle',
		oval: 'Oval',
		heart: 'Heart',
		arch: 'Arch',
		hex: 'Hexagon',
		rect: 'Rectangle',
		star: 'Star',
		ring: 'Ring',
		twinring: 'Twin rings',
		letter: 'Initial letter',
	};
	const PROFILE_LABEL = {
		ridge: 'Mountain ridge',
		hills: 'Rolling hills',
		dunes: 'Dunes',
		waves: 'Waves',
		city: 'City skyline',
		flat: 'Flat ground',
	};
	const objectName = ( o ) => {
		if ( 'terrain' === o.kind ) {
			return t( PROFILE_LABEL[ o.profile ] || 'Landscape' );
		}
		if ( 'backdrop' === o.kind ) {
			return t( 'Backdrop' );
		}
		if ( 'border' === o.kind ) {
			return t( 'Frame edge' );
		}
		if ( 'frame' === o.kind ) {
			return t( WINDOW_LABEL[ o.window ] || 'Passepartout' );
		}
		if (
			'animal' === o.kind ||
			'flyer' === o.kind ||
			'trees' === o.kind ||
			'plants' === o.kind
		) {
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

	/**
	 * What a layer is called in the stack.
	 *
	 * v2 named every row after its hidden substructure, so ten rows read
	 * "Flat ground" and told you nothing. A layer has no substructure any
	 * more, so it is named after what you can actually see on it.
	 *
	 * @param {Object} s     The layer.
	 * @param {number} index Its place in the stack.
	 * @return {string} A name.
	 */
	const layerName = ( s, index ) => {
		if ( 'photo' === s.source ) {
			return t( 'Depth' ) + ' ' + ( s.band + 1 );
		}
		if ( 'subject' === s.source ) {
			return t( 'Subject' );
		}
		if ( ! s.objects.length ) {
			return t( 'Empty layer' );
		}
		const names = s.objects.map( objectName );
		return names.length > 2
			? names[ 0 ] + ' +' + ( names.length - 1 )
			: names.join( ', ' ) || t( 'Layer' ) + ' ' + ( index + 1 );
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

	/**
	 * The stack, as ONE flat list of things from front to back.
	 *
	 * There used to be two nested stacks here - layers, with objects
	 * beneath them - and only one of them was ever the user's idea of the
	 * picture. Thomas, 9 August: "ich habe flat ground mit grass, deer,
	 * flat ground [...] das blickt doch kein Mensch." He was right: the
	 * layer was bookkeeping I had handed him, it repeated the same name
	 * twice, and it split one question (what colour is this thing?) into
	 * two rules.
	 *
	 * So the layer is gone from the interface. A row is a THING. The
	 * grouping still exists underneath and rearranges itself: giving a
	 * thing its own colour, or dragging it somewhere, quietly puts it on
	 * a sheet of its own.
	 *
	 * @return {Array} `[ { id, layer, object } ]`, frontmost first.
	 */
	const flatRows = () => {
		const rows = [];
		for ( let i = params.layers.length - 1; i >= 0; i-- ) {
			const sheet = params.layers[ i ];
			if ( 'elements' !== sheet.source || ! sheet.objects.length ) {
				rows.push( { id: sheet.id, layer: sheet, object: null } );
				continue;
			}
			for ( let k = sheet.objects.length - 1; k >= 0; k-- ) {
				const object = sheet.objects[ k ];
				rows.push( { id: object.id, layer: sheet, object } );
			}
		}
		return rows;
	};

	/**
	 * Move a thing in the stack.
	 *
	 * @param {string} rowId  The row's id.
	 * @param {Object|string} to A layer to sit in front of, or the string
	 *                           'front' / 'back' for the two ends.
	 */
	const moveThing = ( rowId, to ) => {
		const rows = flatRows();
		const from = rows.find( ( r ) => r.id === rowId );
		if ( ! from ) {
			return;
		}
		mark();
		// Where in the layer array the thing lands. The array runs back to
		// front, so "in front of L" is one past L.
		const slotFor = () => {
			if ( 'back' === to ) {
				return 0;
			}
			if ( 'front' === to || ! to ) {
				return params.layers.length;
			}
			const at = params.layers.indexOf( to );
			return at < 0 ? params.layers.length : at + 1;
		};
		if ( ! from.object ) {
			// A photo sheet moves as a whole; it has no objects to split.
			const at = params.layers.indexOf( from.layer );
			params.layers.splice( at, 1 );
			params.layers.splice( Math.max( 0, slotFor() ), 0, from.layer );
		} else {
			// Dragging SPLITS: the thing gets a sheet of its own at the new
			// place, which is exactly what "I moved it there" should mean.
			const k = from.layer.objects.indexOf( from.object );
			from.layer.objects.splice( k, 1 );
			params.layers.splice(
				Math.max( 0, slotFor() ),
				0,
				defaultLayer( {
					color: from.layer.color,
					shadow: from.layer.shadow,
					objects: [ from.object ],
				} )
			);
		}
		// Sheets that are left empty were bookkeeping, not a decision.
		params.layers = params.layers.filter(
			( l ) => 'elements' !== l.source || l.objects.length
		);
		if ( ! params.layers.length ) {
			params.layers = [ defaultLayer() ];
		}
		rebuild();
		syncAll();
	};

	/** The colour of one thing. Setting it splits the thing out. */
	const setThingColor = ( row, hex ) => {
		mark();
		if ( ! row.object || 1 === row.layer.objects.length ) {
			row.layer.color = hex;
			rebuild();
			return;
		}
		const k = row.layer.objects.indexOf( row.object );
		row.layer.objects.splice( k, 1 );
		const at = params.layers.indexOf( row.layer );
		params.layers.splice(
			at + 1,
			0,
			defaultLayer( {
				color: hex,
				shadow: row.layer.shadow,
				objects: [ row.object ],
			} )
		);
		rebuild();
		syncAll();
	};

	let dragRow = null;

	const syncStack = () => {
		if ( ! stackBody ) {
			return;
		}
		unmountAll();
		rowsById = new Map();
		stackBody.textContent = '';
		const rows = flatRows();
		ui.el( 'div', 'wpiepca-edge', stackBody, t( 'Front' ) );
		rows.forEach( ( r, n ) => {
			const row = ui.el(
				'div',
				'wpiepca-lrow' + ( selected === r.id ? ' is-on' : '' ),
				stackBody
			);
			rowsById.set( r.id, row );
			row.onclick = () => {
				selected = r.id;
				syncHighlight();
				syncSelection();
				repaint();
			};
			ui.el( 'span', 'wpiepca-grip', row ).innerHTML = I.grip;
			ui.el(
				'span',
				'wpiepca-lname',
				row,
				r.object ? objectName( r.object ) : layerName( r.layer, n )
			);
			const colorHost = ui.el( 'span', 'wpiepca-lcolor', row );
			// The picker renders its popover INSIDE this host; letting the
			// click reach the row would reselect and rebuild the list,
			// tearing the popover down in the same tick.
			colorHost.addEventListener( 'pointerdown', ( e ) =>
				e.stopPropagation()
			);
			colorHost.addEventListener( 'click', ( e ) => e.stopPropagation() );
			if ( bridge.components && bridge.components.mountColorButton ) {
				const built = engine
					.allLayers()
					.find( ( s ) => s.layer.id === r.layer.id );
				const handle = bridge.components.mountColorButton( colorHost, {
					color:
						r.layer.color || ( built && built.color ) || '#888888',
					onChange: ( c ) => {
						const hex = 'string' === typeof c ? c : c && c.hex;
						handle.set( hex );
						setThingColor( r, hex );
					},
				} );
				unmounts.push( handle );
			}
			miniBtn( row, I.x, t( 'Remove' ), rows.length <= 1, () => {
				mark();
				if ( r.object ) {
					r.layer.objects.splice(
						r.layer.objects.indexOf( r.object ),
						1
					);
				}
				params.layers = params.layers.filter(
					( l ) =>
						l !== r.layer ||
						( 'elements' === l.source && l.objects.length )
				);
				if ( ! params.layers.length ) {
					params.layers = [ defaultLayer() ];
				}
				if ( selected === r.id ) {
					selected = null;
				}
				rebuild();
				syncAll();
			} );

			// Pointer events, not HTML5 drag and drop: the latter needs a
			// DataTransfer, does nothing at all on touch, and behaves
			// differently inside the editor's modal. This is the same
			// gesture the stage already uses.
			const grip = row.querySelector( '.wpiepca-grip' );
			grip.addEventListener( 'pointerdown', ( e ) => {
				e.preventDefault();
				e.stopPropagation();
				grip.setPointerCapture( e.pointerId );
				dragRow = {
					id: r.id,
					y: e.clientY,
					moved: false,
					target: null,
				};
				row.classList.add( 'is-drag' );
			} );
			grip.addEventListener( 'pointermove', ( e ) => {
				if ( ! dragRow || dragRow.id !== r.id ) {
					return;
				}
				if (
					! dragRow.moved &&
					Math.abs( e.clientY - dragRow.y ) < 4
				) {
					return;
				}
				dragRow.moved = true;
				dragRow.target = null;
				for ( const el of stackBody.children ) {
					el.classList.remove( 'is-over' );
				}
				// What is under the pointer decides where it lands, which
				// is the only rule a hand can predict.
				const under = document
					.elementsFromPoint( e.clientX, e.clientY )
					.find(
						( el ) =>
							el.classList &&
							( el.classList.contains( 'wpiepca-lrow' ) ||
								el.classList.contains( 'wpiepca-edge' ) )
					);
				if ( ! under || under === row ) {
					return;
				}
				under.classList.add( 'is-over' );
				dragRow.target = under;
			} );
			const endRowDrag = () => {
				if ( ! dragRow || dragRow.id !== r.id ) {
					return;
				}
				row.classList.remove( 'is-drag' );
				const target = dragRow.moved ? dragRow.target : null;
				const id = dragRow.id;
				dragRow = null;
				for ( const el of stackBody.children ) {
					el.classList.remove( 'is-over' );
				}
				if ( ! target ) {
					return;
				}
				// Dropping ON a row means "put it in front of that one";
				// the BACK marker at the bottom means "all the way back".
				if ( target.classList.contains( 'wpiepca-edge' ) ) {
					moveThing(
						id,
						target.classList.contains( 'is-tail' )
							? 'back'
							: 'front'
					);
					return;
				}
				const hit = rows.find(
					( x ) => rowsById.get( x.id ) === target
				);
				moveThing( id, hit ? hit.layer : 'front' );
			};
			grip.addEventListener( 'pointerup', endRowDrag );
			grip.addEventListener( 'pointercancel', endRowDrag );
		} );
		// The very back is a drop target too, or nothing could ever be
		// moved behind the last thing.
		ui.el( 'div', 'wpiepca-edge is-tail', stackBody, t( 'Back' ) );
	};

	const sliderRow = ( parent, label, value, min, max, onInput, step = 1 ) =>
		ui.slider( parent, { label, min, max, step, value, onInput } );

	const syncSelection = () => {
		if ( ! selBody ) {
			return;
		}
		selBody.textContent = '';
		const objHit = selected ? findObject( selected ) : null;
		const sheet = ! objHit && selected ? findLayer( selected ) : null;
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
				// A textarea, not an input: several words under each other
				// are one block, and a single-line field cannot hold a
				// line break at all.
				const input = ui.el(
					'textarea',
					'dsm-input wpiepca-words',
					selBody
				);
				input.rows = 3;
				input.value = o.value;
				input.oninput = () => {
					o.value = input.value.slice( 0, 80 );
					rebuildLive();
				};
				sliderRow(
					selBody,
					t( 'Line gap' ),
					o.lineGap,
					0,
					120,
					( v ) => {
						o.lineGap = v;
						rebuildLive();
					}
				);
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
			}
			if ( 'terrain' === o.kind ) {
				ui.select( ui.row( selBody, t( 'Shape' ) ), {
					options: PROFILES.map( ( v ) => ( {
						value: v,
						label: t( PROFILE_LABEL[ v ] || v ),
					} ) ),
					value: o.profile,
					onChange: ( v ) => {
						mark();
						o.profile = v;
						rebuild();
						syncAll();
					},
				} );
				sliderRow( selBody, t( 'Horizon' ), o.yBase, 2, 100, ( v ) => {
					o.yBase = v;
					o.y = v / 100;
					rebuildLive();
				} );
				if ( 'flat' !== o.profile ) {
					sliderRow(
						selBody,
						t( 'Height' ),
						o.height,
						0,
						100,
						( v ) => {
							o.height = v;
							rebuildLive();
						}
					);
					sliderRow(
						selBody,
						t( 'Ruggedness' ),
						o.jag,
						0,
						100,
						( v ) => {
							o.jag = v;
							rebuildLive();
						}
					);
				}
			}
			if ( 'border' === o.kind ) {
				sliderRow( selBody, t( 'Border' ), o.border, 1, 20, ( v ) => {
					o.border = v;
					rebuildLive();
				} );
			}
			if ( 'frame' === o.kind ) {
				ui.select( ui.row( selBody, t( 'Window' ) ), {
					options: WINDOWS.map( ( v ) => ( {
						value: v,
						label: t( WINDOW_LABEL[ v ] || v ),
					} ) ),
					value: o.window,
					onChange: ( v ) => {
						mark();
						o.window = v;
						rebuild();
						syncAll();
					},
				} );
				if ( 'letter' === o.window ) {
					const inp = ui.el( 'input', 'dsm-input', selBody );
					inp.type = 'text';
					inp.maxLength = 1;
					inp.value = o.letter;
					inp.oninput = () => {
						o.letter = inp.value.slice( 0, 1 ) || 'A';
						rebuildLive();
					};
				}
				sliderRow( selBody, t( 'Border' ), o.inset, 0, 30, ( v ) => {
					o.inset = v;
					rebuildLive();
				} );
				if ( 'star' === o.window ) {
					sliderRow(
						selBody,
						t( 'Points' ),
						o.points,
						3,
						24,
						( v ) => {
							o.points = v;
							rebuildLive();
						}
					);
					sliderRow(
						selBody,
						t( 'Sharpness' ),
						o.sharp,
						0,
						100,
						( v ) => {
							o.sharp = v;
							rebuildLive();
						}
					);
				}
				if ( 'ring' === o.window || 'twinring' === o.window ) {
					sliderRow(
						selBody,
						t( 'Band width' ),
						o.width,
						4,
						80,
						( v ) => {
							o.width = v;
							rebuildLive();
						}
					);
				}
				if ( 'ring' === o.window ) {
					sliderRow( selBody, t( 'Tilt' ), o.tilt, -90, 90, ( v ) => {
						o.tilt = v;
						rebuildLive();
					} );
				}
				if ( 'twinring' === o.window ) {
					sliderRow(
						selBody,
						t( 'Overlap' ),
						o.gap,
						10,
						140,
						( v ) => {
							o.gap = v;
							rebuildLive();
						}
					);
				}
			}
			if ( 'cloud' === o.kind ) {
				sliderRow( selBody, t( 'Billow' ), o.puff, 0, 100, ( v ) => {
					o.puff = v;
					rebuildLive();
				} );
				sliderRow( selBody, t( 'Fray' ), o.wisp, 0, 100, ( v ) => {
					o.wisp = v;
					rebuildLive();
				} );
			}
			if ( 'orb' === o.kind ) {
				ui.select( ui.row( selBody, t( 'Shape' ) ), {
					options: ORBS.map( ( v ) => ( {
						value: v,
						label: cap( v ),
					} ) ),
					value: o.variant,
					onChange: ( v ) => {
						mark();
						o.variant = v;
						rebuild();
						syncAll();
					},
				} );
				if ( 'sun' === o.variant ) {
					sliderRow( selBody, t( 'Rays' ), o.rays, 3, 40, ( v ) => {
						o.rays = v;
						rebuildLive();
					} );
				}
			}
			if ( 'animal' === o.kind || 'flyer' === o.kind ) {
				const list =
					'flyer' === o.kind
						? SKY_ANIMALS
						: GROUND_ANIMALS.concat( WATER_ANIMALS );
				ui.select( ui.row( selBody, t( 'Kind' ) ), {
					options: list.map( ( v ) => ( {
						value: v,
						label: cap( v ),
					} ) ),
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
					options: list.map( ( v ) => ( {
						value: v,
						label: cap( v ),
					} ) ),
					value: o.species,
					onChange: ( v ) => {
						o.species = v;
						rebuild();
						syncAll();
					},
				} );
				sliderRow( selBody, t( 'Count' ), o.count, 1, 30, ( v ) => {
					o.count = v;
					rebuildLive();
				} );
				sliderRow( selBody, t( 'Spread' ), o.spread, 0, 150, ( v ) => {
					o.spread = v;
					rebuildLive();
				} );
				sliderRow(
					selBody,
					t( 'Height variation' ),
					o.vary,
					0,
					100,
					( v ) => {
						o.vary = v;
						rebuildLive();
					}
				);
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
					rebuildLive();
				} );
				sliderRow( selBody, t( 'Spread' ), o.spread, 5, 150, ( v ) => {
					o.spread = v;
					rebuildLive();
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
					rebuildLive();
				} );
			}
			if ( ! FULL_PAGE_KINDS.includes( o.kind ) ) {
				sliderRow( selBody, t( 'Size' ), o.scale, 3, 140, ( v ) => {
					o.scale = v;
					rebuildLive();
				} );
				sliderRow(
					selBody,
					t( 'Rotation' ),
					o.rot,
					-180,
					180,
					( v ) => {
						o.rot = v;
						rebuildLive();
					}
				);
				// Punching used to be decided by KIND, and a hole was only
				// allowed on a backdrop. Any object, any layer.
				ui.check( selBody, {
					label: t( 'Punch out of the paper' ),
					checked: !! o.cut,
					onChange: ( v ) => {
						mark();
						o.cut = v;
						rebuild();
						syncAll();
					},
				} );
			}
			const row = ui.el( 'div', 'wpiepca-row', selBody );
			ui.el( 'span', 'dsm-label wpiepca-lbl', row, t( 'Variation' ) );
			miniBtn( row, I.dice, t( 'Roll a new variation' ), false, () => {
				o.seed = 1 + Math.floor( Math.random() * 999999 );
				rebuild();
			} );
			if (
				'orb' !== o.kind &&
				'cloud' !== o.kind &&
				'branch' !== o.kind
			) {
				miniBtn( row, I.flip, t( 'Flip' ), false, () => {
					o.flip = ! o.flip;
					rebuild();
				} );
			}
			miniBtn( row, I.x, t( 'Remove' ), false, () => {
				mark();
				const idx = objHit.layer.objects.indexOf( o );
				objHit.layer.objects.splice( idx, 1 );
				params.layers = params.layers.filter(
					( l ) => 'elements' !== l.source || l.objects.length
				);
				if ( ! params.layers.length ) {
					params.layers = [ defaultLayer() ];
				}
				selected = null;
				rebuild();
				syncAll();
			} );
			// The shadow this thing casts. It belongs to the sheet it sits
			// on, and a thing usually has that sheet to itself.
			sliderRow(
				selBody,
				t( 'Shadow' ),
				objHit.layer.shadow,
				0,
				200,
				( v ) => {
					objHit.layer.shadow = v;
					rebuildLive();
				}
			);
			return;
		}
		// A photo sheet is selected. It has no shape of its own to edit:
		// its outline comes from the picture.
		const index = params.layers.indexOf( sheet );
		ui.el( 'div', 'wpiepca-note', selBody, layerName( sheet, index ) );
		sliderRow( selBody, t( 'Shadow' ), sheet.shadow, 0, 200, ( v ) => {
			sheet.shadow = v;
			rebuildLive();
		} );
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
			if (
				Array.isArray( l.children ) &&
				l.children.length &&
				'object' === typeof l.children[ 0 ]
			) {
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

	/**
	 * Lay the photo out as a stack of depth layers.
	 *
	 * Anything the user placed by hand stays: only the photo's own layers
	 * are replaced. The ceiling of twelve is gone, twenty depth layers is
	 * the point of the thing.
	 */
	const applyPhotoSheets = () => {
		const bands = params.photo.bands;
		const keep = params.layers.filter(
			( s ) => 'elements' === s.source && s.objects.length
		);
		const fresh = [];
		for ( let b = bands - 1; b >= 0; b-- ) {
			fresh.push( defaultLayer( { source: 'photo', band: b } ) );
		}
		if ( params.photo.subject ) {
			fresh.push( defaultLayer( { source: 'subject' } ) );
		}
		params.layers = fresh.concat( keep );
		selected = null;
	};

	/**
	 * The local depth map for the current photo, if the editor has the
	 * model.
	 *
	 * This is what makes the photo strand worth anything: brightness only
	 * stands in for distance in a hazy landscape. It is deliberately
	 * OPTIONAL - `bridge.ml.depthMap` arrived with API 2.16, the model is
	 * an opt-in download, and a studio must never send someone off to
	 * install something before it works. Without it the brightness bands
	 * carry on, and the status line says so.
	 */
	const loadDepth = async () => {
		const ml = bridge.ml;
		if (
			! ml ||
			! ml.depthMap ||
			! ml.isModelInstalled ||
			! ml.isModelInstalled( 'depth' ) ||
			! photoSrcUrl ||
			'luma' === params.photo.mode
		) {
			engine.setDepth( null );
			return;
		}
		try {
			status.textContent = t( 'Reading the depth…' );
			engine.setDepth( await ml.depthMap( photoSrcUrl ) );
		} catch ( e ) {
			// A model that will not run is not an error the user caused.
			engine.setDepth( null );
		}
		syncStatus();
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
				if (
					! editor ||
					! bridge.raster ||
					! bridge.raster.renderToCanvas
				) {
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
				c = await bridge.raster.renderToCanvas(
					editor.state.doc,
					layers,
					{
						scale: Math.min(
							1,
							1200 /
								Math.max(
									editor.state.doc.w,
									editor.state.doc.h
								)
						),
					}
				);
			} else if ( params.photo.src ) {
				c = await canvasFromImage( params.photo.src );
			}
			if ( ! c ) {
				return;
			}
			engine.setPhoto( c );
			photoSrcUrl = c.toDataURL( 'image/png' );
			const lm = engine.lumaAt( 240, 160, params.photo.blur );
			params.photo.thresholds = autoThresholds(
				lm.luma,
				params.photo.bands
			);
			await loadDepth();
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
			rebuildLive();
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
		if (
			'media' === src &&
			bridge.components &&
			bridge.components.mountMediaPicker
		) {
			const node = ui.el( 'div', 'wpiepca-media', photoExtra );
			bridge.components.mountMediaPicker( node, {
				height: 170,
				onPick: async ( item ) => {
					try {
						const c = await canvasFromImage(
							item.fullUrl || item.url
						);
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
		const photoSec = ui.section( side, {
			icon: I.photo,
			title: t( 'Photo' ),
		} );
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
		sliderRow(
			photoSec,
			t( 'Depth layers' ),
			params.photo.bands,
			2,
			20,
			( v ) => {
				params.photo.bands = v;
				if ( engine.photoCanvas ) {
					const lm = engine.lumaAt( 240, 160, params.photo.blur );
					params.photo.thresholds = autoThresholds( lm.luma, v );
					applyPhotoSheets();
					drawHistogram();
					rebuild();
					syncStack();
				}
			}
		);
		// Only worth offering where there is a choice: without the local
		// model there is only one way to slice a picture.
		if (
			bridge.ml &&
			bridge.ml.depthMap &&
			bridge.ml.isModelInstalled &&
			bridge.ml.isModelInstalled( 'depth' )
		) {
			ui.select( ui.row( photoSec, t( 'Slice by' ) ), {
				options: [
					{ value: 'depth', label: t( 'Real depth' ) },
					{ value: 'luma', label: t( 'Brightness' ) },
				],
				value: params.photo.mode,
				onChange: async ( v ) => {
					mark();
					params.photo.mode = v;
					await loadDepth();
					rebuild();
					syncAll();
				},
			} );
		}
		sliderRow(
			photoSec,
			t( 'Smoothing' ),
			params.photo.blur,
			0,
			100,
			( v ) => {
				params.photo.blur = v;
				drawHistogram();
				rebuildLive();
			}
		);
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
		const stackSec = ui.section( side, {
			icon: I.layers,
			title: t( 'Sheets & objects' ),
		} );
		stackBody = ui.el( 'div', 'wpiepca-lstack', stackSec );
		const addSheetBtn = ui.btn( stackSec, {
			label: t( 'Add empty sheet' ),
			onClick: () => {
				const s = rawSheet( 'ground', {
					yBase: Math.min( 97, 60 + params.layers.length * 8 ),
				} );
				params.layers.push( s );
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

		const lookSec = ui.section( side, {
			icon: I.palette,
			title: t( 'Look' ),
		} );
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

		const lightSec = ui.section( side, {
			icon: I.sun,
			title: t( 'Light & paper' ),
		} );
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

		// The three look axes. The named looks above are presets on them,
		// so turning a dial here simply leaves the preset behind.
		const paperSec = ui.section( side, {
			icon: I.scissors,
			title: t( 'Paper' ),
		} );
		ui.select( ui.row( paperSec, t( 'Colour from' ) ), {
			options: [
				{ value: 'palette', label: t( 'The look' ) },
				{ value: 'photo', label: t( 'The photo' ) },
			],
			value: params.colorSource,
			onChange: ( v ) => {
				mark();
				params.colorSource = v;
				rebuild();
			},
		} );
		ui.select( ui.row( paperSec, t( 'Surface' ) ), {
			options: [
				{ value: 'smooth', label: t( 'Smooth' ) },
				{ value: 'fibre', label: t( 'Fibrous' ) },
			],
			value: params.paper,
			onChange: ( v ) => {
				mark();
				params.paper = v;
				rebuild();
			},
		} );
		ui.select( ui.row( paperSec, t( 'Separation' ) ), {
			options: [
				{ value: 'shadow', label: t( 'Deep shadow' ) },
				{ value: 'rim', label: t( 'Narrow rim' ) },
			],
			value: params.edge,
			onChange: ( v ) => {
				mark();
				params.edge = v;
				repaint();
			},
		} );
		sliderRow( paperSec, t( 'Detail' ), params.detail, 0, 100, ( v ) => {
			params.detail = v;
			rebuildLive();
		} );
		ampelEl = ui.el( 'div', 'wpiepca-ampel', paperSec, '' );
	};

	const syncAll = () => {
		syncStack();
		syncSelection();
		drawHistogram();
	};

	/* ------------------------------ exports ------------------------------ */

	const insert = () => {
		if ( ! editor || ! bridge.documents ) {
			return;
		}
		const scale = Math.min( 1, 2200 / Math.max( doc.w, doc.h ) );
		const iw = Math.round( doc.w * scale );
		const ih = Math.round( doc.h * scale );
		const { images } = engine.layerImages( iw, ih, params );
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
		images.forEach( ( { layer: built, src }, i ) => {
			const child = bridge.documents.makeImage( {
				name:
					'Papercut ' +
					( i + 1 ) +
					' - ' +
					( '__frame' === built.layer.id
						? t( 'Frame' )
						: layerName( built.layer, i ) ),
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

	/* ------------------------------ footer ------------------------------- */

	ui.btn( actions, { label: t( 'Cancel' ), onClick: () => modal.close() } );
	ui.btn( actions, {
		label: editing ? t( 'Update' ) : t( 'Insert' ),
		primary: true,
		onClick: insert,
	} );

	/* ------------------------------ start up ----------------------------- */

	function destroy() {
		closed = true;
		document.removeEventListener( 'keydown', onKey );
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
			// A fresh scene lays the picture out as depth layers right
			// away - that IS the first step. An existing group keeps the
			// layers it was saved with, and a run without a readable
			// document quietly falls back to the built-in scene.
			if ( ! editing ) {
				if ( engine.photoCanvas ) {
					applyPhotoSheets();
				} else {
					params.photo.source = 'none';
					syncPhotoExtra();
				}
			}
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
		rerender: () => {
			rebuild();
			syncAll();
		},
		get params() {
			return params;
		},
		rebuild,
		close: () => modal.close(),
		applyPreset: ( id ) => {
			const p = PRESETS.find( ( x ) => x.id === id );
			if ( p ) {
				// Through cleanParams, exactly like the tile does. Assigning
				// a patch RAW leaves the v2 `base` on the layer, and every
				// later clean (undo, insert, reopen) then builds that base's
				// object a second time - the scene grows on its own.
				Object.assign(
					params,
					cleanParams( { ...params, ...p.patch() } )
				);
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
