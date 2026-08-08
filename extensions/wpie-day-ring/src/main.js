/**
 * Day Ring - WunderPaint extension entry.
 *
 * Build a circular 24-hour schedule from time blocks and drop it in as a
 * re-editable layer. Everything is drawn locally on a canvas; nothing is
 * uploaded. Built on the shared editor UI kit so it matches the other studios.
 */

import { renderRing } from './render.js';
import { parseTime, fmtTime } from './blocks.js';
import { PALETTE_LIST } from './palette.js';
import { PRESETS, PRESET_LIST } from './presets.js';
import { t } from './i18n.js';

const GEN_ID = 'wpie-day-ring/ring';

// The editor's brand mark (icon-wpie.svg), inlined so the header badge is the
// real WPIE logo. currentColor parts follow the theme; the CI blue stays.
const ICON_BRAND =
	'<svg width="20" height="20" viewBox="0 0 18.83 18.83" aria-hidden="true">' +
	'<path fill="currentColor" d="M13.84,18.83H3.62c-2,0-3.62-1.62-3.62-3.62V3.52h1.72c.7,0,1.28.57,1.28,1.28v10.43c0,.34.28.62.62.62h8.94c.71,0,1.29.58,1.29,1.29v1.71Z"/>' +
	'<path fill="#3b66ff" d="M18.83,14.02h-1.71c-.71,0-1.29-.58-1.29-1.29V3.62c0-.34-.28-.62-.62-.62H4.82c-.7,0-1.28-.57-1.28-1.28V0h11.67c2,0,3.62,1.62,3.62,3.62v10.4Z"/>' +
	'<circle fill="currentColor" cx="17.33" cy="17.33" r="1.5"/>' +
	'<path fill="#3b66ff" d="M9.51,5.71l.91,2.45c.03.08.09.14.17.17l2.45.91c.07.03.07.13,0,.16l-2.45.91c-.08.03-.14.09-.17.17l-.91,2.45c-.03.07-.13.07-.16,0l-.91-2.45c-.03-.08-.09-.14-.17-.17l-2.45-.91c-.07-.03-.07-.13,0-.16l2.45-.91c.08-.03.14-.09.17-.17l.91-2.45c.03-.07.13-.07.16,0Z"/>' +
	'</svg>';
const svg = ( d ) =>
	'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
	d +
	'</svg>';
const ICONS = {
	blocks: svg(
		'<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.4"/><circle cx="3.5" cy="12" r="1.4"/><circle cx="3.5" cy="18" r="1.4"/>'
	),
	dial: svg( '<circle cx="12" cy="12" r="9"/><path d="M12 8v4l2.5 1.5"/>' ),
	palette: svg(
		'<circle cx="13.5" cy="6.5" r="1"/><circle cx="17" cy="10" r="1"/><circle cx="8" cy="7" r="1"/><circle cx="6.5" cy="11.5" r="1"/><path d="M12 2a10 10 0 1 0 0 20c1 0 1.5-.8 1.5-1.5 0-1.6-1.5-1.6-1.5-3 0-1 .8-1.5 1.8-1.5H16a4 4 0 0 0 4-4c0-4.5-3.6-8-8-8z"/>'
	),
	image: svg(
		'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'
	),
	eye: svg(
		'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'
	),
	plus: svg( '<path d="M12 5v14M5 12h14"/>' ),
};

let idc = 0;
const uid = () => 'b' + ++idc + '_' + ( ( idc * 2654435761 ) % 100000 );

function sample() {
	return [
		{
			id: uid(),
			label: 'Sleep',
			start: 1380,
			end: 390,
			color: '#5c6bc0',
			emoji: '💤',
		},
		{
			id: uid(),
			label: 'Morning',
			start: 390,
			end: 480,
			color: '#ffb74d',
			emoji: '☀️',
		},
		{
			id: uid(),
			label: 'Deep work',
			start: 540,
			end: 720,
			color: '#4dabf7',
			emoji: '💻',
		},
		{
			id: uid(),
			label: 'Stand-up',
			start: 600,
			end: 630,
			color: '#f783ac',
			emoji: '🗣️',
		},
		{
			id: uid(),
			label: 'Lunch',
			start: 720,
			end: 780,
			color: '#51cf66',
			emoji: '🥗',
		},
		{
			id: uid(),
			label: 'Focus',
			start: 780,
			end: 1020,
			color: '#4dabf7',
			emoji: '🎯',
		},
		{
			id: uid(),
			label: 'Gym',
			start: 1020,
			end: 1080,
			color: '#ff6b6b',
			emoji: '🏋️',
		},
		{
			id: uid(),
			label: 'Dinner',
			start: 1140,
			end: 1260,
			color: '#ffa94d',
			emoji: '🍽️',
		},
		{
			id: uid(),
			label: 'Read',
			start: 1260,
			end: 1350,
			color: '#9775fa',
			emoji: '📖',
		},
	];
}

const DEFAULTS = {
	blocks: null, // filled from sample() on open
	title: 'My Day',
	subtitle: '',
	centerIcon: '',
	ticks: true,
	hourNumbers: true,
	dayNight: true,
	palette: 'vivid',
	ring: { thickness: 1, gap: 0.24, rounded: true },
	legend: true,
	ringLabels: true,
	dark: true,
	depth: true,
	durations: false,
	bg: { mode: 'solid', color: '#141726', color2: '#2b1055' },
};

function docOf( editor ) {
	return (
		( editor.getDocument && editor.getDocument() ) ||
		( editor.state && editor.state.doc ) || { w: 1200, h: 1200 }
	);
}

function openStudio( ctx ) {
	const editor = ctx.editor,
		extras = ctx.extras,
		layer = ctx.layer;
	const bridge = window.WPIE && window.WPIE.bridge;
	const ui = bridge && bridge.ui;
	const toast = ( m, kind ) =>
		extras &&
		extras.toasts &&
		( extras.toasts[ kind || 'success' ] || extras.toasts.success )( m );
	if ( ! ui || ! ui.dialog ) {
		toast( t( 'Day Ring needs a newer WunderPaint.' ), 'error' );
		return;
	}

	const editing = !! (
		layer &&
		layer.generator &&
		layer.generator.id === GEN_ID
	);
	const params = editing
		? {
				...DEFAULTS,
				...layer.generator.params,
				ring: {
					...DEFAULTS.ring,
					...( layer.generator.params.ring || {} ),
				},
				bg: { ...DEFAULTS.bg, ...( layer.generator.params.bg || {} ) },
		  }
		: { ...DEFAULTS, ring: { ...DEFAULTS.ring }, bg: { ...DEFAULTS.bg } };
	if ( ! Array.isArray( params.blocks ) || ! params.blocks.length ) {
		params.blocks = sample();
	}
	params.blocks = params.blocks.map( ( b ) => ( {
		...b,
		id: b.id || uid(),
	} ) );

	const swatches = []; // dial/bg swatches
	const blockSwatches = [];
	const modal = ui.dialog( {
		title: t( 'Day Ring' ),
		subtitle: editing
			? t( 'Edit this day and update the layer.' )
			: t( 'Turn a day into a circular, colour-coded schedule.' ),
		width: 1200,
		closeOnBackdrop: true,
		onClose: () => cleanup(),
	} );
	const badge = document.createElement( 'span' );
	badge.className = 'dsm-badge';
	badge.innerHTML = ICON_BRAND;
	modal.head.insertBefore( badge, modal.head.firstChild );

	const body = ui.el( 'div', 'wpie-dr-body', modal.body );
	const left = ui.el( 'div', 'wpie-dr-left', body );
	const view = ui.el( 'div', 'wpie-dr-view', body );
	const side = ui.el( 'div', 'wpie-dr-side', body );

	// The editor's Tabler icon library, so a block mark can be an icon (drawn
	// as a vector) as well as an emoji. Repaint once it loads.
	let tabler = null;
	if ( bridge.iconsLib && bridge.iconsLib.loadTabler ) {
		bridge.iconsLib
			.loadTabler()
			.then( ( m ) => {
				tabler = m || {};
				renderBlockList();
				rebuild();
			} )
			.catch( () => {} );
	}
	function iconSvg( pathD ) {
		const NS = 'http://www.w3.org/2000/svg';
		const s = document.createElementNS( NS, 'svg' );
		s.setAttribute( 'viewBox', '0 0 24 24' );
		s.setAttribute( 'width', '18' );
		s.setAttribute( 'height', '18' );
		s.setAttribute( 'fill', 'none' );
		s.setAttribute( 'stroke', 'currentColor' );
		s.setAttribute( 'stroke-width', '2' );
		s.setAttribute( 'stroke-linecap', 'round' );
		s.setAttribute( 'stroke-linejoin', 'round' );
		const p = document.createElementNS( NS, 'path' );
		p.setAttribute( 'd', pathD );
		s.appendChild( p );
		return s;
	}
	function setBlockMark( btn, b ) {
		btn.classList.toggle( 'is-empty', ! b.emoji && ! b.icon );
		const path = b.icon && tabler ? tabler[ b.icon ] : null;
		btn.textContent = '';
		if ( path ) {
			btn.appendChild( iconSvg( path ) );
		} else {
			btn.textContent = b.emoji || '🙂';
		}
	}

	// The editor's icon/emoji picker (search + tabs), opened from a block mark
	// (icons + emojis) or the centre field (emojis only).
	let emojiPop = null,
		emojiPopHandle = null,
		onEmojiDown = null;
	function closeEmojiPop() {
		if ( onEmojiDown ) {
			document.removeEventListener( 'pointerdown', onEmojiDown, true );
			onEmojiDown = null;
		}
		if ( emojiPopHandle && emojiPopHandle.unmount ) {
			emojiPopHandle.unmount();
			emojiPopHandle = null;
		}
		if ( emojiPop && emojiPop.parentNode ) {
			emojiPop.parentNode.removeChild( emojiPop );
		}
		emojiPop = null;
	}
	function openMarkPicker( anchor, opts ) {
		opts = opts || {};
		closeEmojiPop();
		if ( ! ( bridge.components && bridge.components.mountIconPicker ) ) {
			return;
		}
		// Anchor to the backdrop (fixed, viewport-filling) and use the button's
		// viewport rect, so the popover opens right at the click - the dialog
		// box itself is position:static and can't be the reference.
		emojiPop = ui.el( 'div', 'wpie-dr-emojipop', modal.backdrop );
		const r = anchor.getBoundingClientRect();
		const vw = window.innerWidth,
			vh = window.innerHeight,
			popW = 300,
			popH = 344;
		const popLeft = Math.max( 8, Math.min( r.left, vw - popW - 8 ) );
		let top = r.bottom + 6;
		if ( top + popH > vh - 8 ) {
			top = Math.max( 8, r.top - popH - 6 );
		}
		emojiPop.style.left = Math.round( popLeft ) + 'px';
		emojiPop.style.top = Math.round( top ) + 'px';
		emojiPop.onclick = ( e ) => e.stopPropagation();
		emojiPopHandle = bridge.components.mountIconPicker(
			ui.el( 'div', null, emojiPop ),
			{
				icons: !! opts.icons,
				emoji: true,
				height: 264,
				onPick: ( sel ) => {
					if ( sel && opts.onPick ) {
						opts.onPick( sel );
					}
					closeEmojiPop();
				},
			}
		);
		onEmojiDown = ( e ) => {
			if (
				emojiPop &&
				! emojiPop.contains( e.target ) &&
				e.target !== anchor
			) {
				closeEmojiPop();
			}
		};
		setTimeout(
			() => document.addEventListener( 'pointerdown', onEmojiDown, true ),
			0
		);
	}

	// ---------------- LEFT: blocks ----------------
	const blocksCard = ui.section( left, {
		icon: ICONS.blocks,
		title: t( 'Time blocks' ),
	} );
	ui.select( ui.row( blocksCard, t( 'Load a day' ) ), {
		options: [ { value: '', label: t( 'Choose a template…' ) } ].concat(
			PRESET_LIST.map( ( x ) => ( { value: x.id, label: t( x.label ) } ) )
		),
		value: '',
		onChange: ( v ) => {
			const pr = PRESETS[ v ];
			if ( ! pr ) {
				return;
			}
			// Translated once, here, as the preset becomes the visitor's own
			// blocks: from this point the label is theirs to edit, so it must
			// not be run through t() again on every render.
			params.blocks = pr
				.blocks()
				.map( ( b ) => ( { ...b, label: t( b.label ), id: uid() } ) );
			if ( pr.title ) {
				params.title = t( pr.title );
				if ( titleIn ) {
					titleIn.value = params.title;
				}
			}
			renderBlockList();
			rebuild();
		},
	} );
	const list = ui.el( 'div', 'wpie-dr-list', blocksCard );
	const addBtn = ui.btn( blocksCard, {
		label: t( 'Add block' ),
		onClick: () => addBlock(),
	} );
	addBtn.classList.add( 'wpie-dr-add' );
	addBtn.innerHTML = ICONS.plus + ' ' + t( 'Add block' );

	function renderBlockList() {
		blockSwatches.forEach( ( s ) => s && s.unmount && s.unmount() );
		blockSwatches.length = 0;
		list.innerHTML = '';
		params.blocks.forEach( ( b ) => {
			const row = ui.el( 'div', 'wpie-dr-block', list );
			const top = ui.el( 'div', 'wpie-dr-top', row );
			const emojiBtn = ui.el(
				'button',
				'wpie-dr-emoji wpie-dr-emojibtn',
				top
			);
			emojiBtn.type = 'button';
			emojiBtn.title = t( 'Pick an icon or emoji' );
			setBlockMark( emojiBtn, b );
			emojiBtn.onclick = () =>
				openMarkPicker( emojiBtn, {
					icons: true,
					onPick: ( sel ) => {
						if ( 'emoji' === sel.type ) {
							b.emoji = sel.char;
							b.icon = '';
						} else if ( sel.name ) {
							b.icon = sel.name;
							b.emoji = '';
						}
						setBlockMark( emojiBtn, b );
						queueRebuild();
					},
				} );
			const nameIn = ui.el( 'input', 'dsm-input wpie-dr-name', top );
			nameIn.type = 'text';
			nameIn.value = b.label || '';
			nameIn.placeholder = t( 'Label' );
			nameIn.oninput = () => {
				b.label = nameIn.value;
				queueRebuild();
			};
			const times = ui.el( 'div', 'wpie-dr-times', row );
			const s0 = ui.el( 'input', 'wpie-dr-time', times );
			s0.type = 'time';
			s0.value = fmtTime( b.start );
			s0.onchange = () => {
				const v = parseTime( s0.value );
				if ( null !== v ) {
					b.start = v;
				}
				rebuild();
			};
			ui.el( 'span', 'wpie-dr-dash', times, '–' );
			const e0 = ui.el( 'input', 'wpie-dr-time', times );
			e0.type = 'time';
			e0.value = fmtTime( b.end );
			e0.onchange = () => {
				const v = parseTime( e0.value );
				if ( null !== v ) {
					b.end = v;
				}
				rebuild();
			};
			const colNode = ui.el( 'div', 'wpie-dr-color', row );
			if ( bridge.components && bridge.components.mountColorButton ) {
				blockSwatches.push(
					bridge.components.mountColorButton( colNode, {
						color: b.color || '#4dabf7',
						title: t( 'Block colour' ),
						onChange: ( c ) => {
							b.color = c;
							rebuild();
						},
					} )
				);
			}
			const del = ui.el( 'button', 'wpie-dr-del', row );
			del.type = 'button';
			del.innerHTML = '&times;';
			del.title = t( 'Remove' );
			del.onclick = () => {
				params.blocks = params.blocks.filter( ( x ) => x !== b );
				renderBlockList();
				rebuild();
			};
		} );
	}
	function addBlock() {
		const last = params.blocks[ params.blocks.length - 1 ];
		const start = last ? last.end : 540;
		params.blocks.push( {
			id: uid(),
			label: t( 'New block' ),
			start,
			end: ( start + 60 ) % 1440,
			color: '',
		} );
		renderBlockList();
		rebuild();
	}

	// ---------------- MIDDLE: preview ----------------
	ui.el(
		'div',
		'wpie-dr-hint',
		view,
		t( 'A 24-hour day - midnight at the top' )
	);
	const docBtn = ui.el( 'button', 'wpie-dr-docbtn', view );
	docBtn.type = 'button';
	docBtn.innerHTML = ICONS.eye + ' ' + t( 'Show document' );
	docBtn.setAttribute( 'aria-pressed', 'false' );
	const rasterBridge = bridge.raster || null;
	const canDoc = !! (
		rasterBridge &&
		rasterBridge.renderToCanvas &&
		editor.state &&
		editor.state.doc
	);
	let docOn = false,
		docUrl = null,
		docBusy = false;
	if ( ! canDoc ) {
		docBtn.style.display = 'none';
	}
	async function captureDoc() {
		const d = editor.state.doc;
		const full = await rasterBridge.renderToCanvas(
			d,
			( editor.state.layers || [] ).filter(
				( l ) => ! ( editing && layer && l.id === layer.id )
			),
			{
				scale: Math.min( 1, 1400 / Math.max( d.w || 1, d.h || 1 ) ),
				cache: rasterBridge.sharedImageCache,
			}
		);
		const out = document.createElement( 'canvas' );
		out.width = Math.max( 2, full.width );
		out.height = Math.max( 2, full.height );
		const gg = out.getContext( '2d' );
		if ( d.bg ) {
			gg.fillStyle = d.bg;
			gg.fillRect( 0, 0, out.width, out.height );
		}
		gg.drawImage( full, 0, 0 );
		return out.toDataURL( 'image/png' );
	}
	function updateDoc() {
		docBtn.setAttribute( 'aria-pressed', docOn ? 'true' : 'false' );
		if ( docOn && docUrl ) {
			view.classList.add( 'is-doc' );
			view.style.backgroundImage = 'url(' + docUrl + ')';
		} else {
			view.classList.remove( 'is-doc' );
			view.style.backgroundImage = '';
		}
		if ( docOn && ! docUrl && ! docBusy ) {
			docBusy = true;
			captureDoc()
				.then( ( u ) => {
					docUrl = u;
					docBusy = false;
					updateDoc();
				} )
				.catch( () => {
					docOn = false;
					docBusy = false;
					updateDoc();
				} );
		}
	}
	docBtn.onclick = () => {
		docOn = ! docOn;
		updateDoc();
	};

	let previewEl = null;
	function rebuild() {
		const d = docOf( editor );
		const ar = ( d.w || 1 ) / ( d.h || 1 );
		const long = 1000;
		const w = ar >= 1 ? long : Math.round( long * ar );
		const h = ar >= 1 ? Math.round( long / ar ) : long;
		const canvas = renderRing( params, w, h, { tabler } );
		canvas.className = 'wpie-dr-canvas';
		if ( previewEl && previewEl.parentNode ) {
			previewEl.parentNode.replaceChild( canvas, previewEl );
		} else {
			view.appendChild( canvas );
		}
		previewEl = canvas;
		renderStatus();
	}
	let timer = 0;
	function queueRebuild() {
		if ( timer ) {
			clearTimeout( timer );
		}
		timer = setTimeout( rebuild, 140 );
	}

	// ---------------- RIGHT: dial / style / background ----------------
	const dialCard = ui.section( side, {
		icon: ICONS.dial,
		title: t( 'Dial & title' ),
	} );
	const varComp =
		bridge.components && bridge.components.mountVarButton
			? bridge.components
			: null;
	const titleRow = ui.row( dialCard, t( 'Title' ) );
	const titleIn = ui.el( 'input', 'dsm-input', titleRow );
	titleIn.type = 'text';
	titleIn.value = params.title;
	titleIn.oninput = () => {
		params.title = titleIn.value;
		queueRebuild();
	};
	if ( varComp ) {
		const vh = document.createElement( 'div' );
		titleRow.appendChild( vh );
		swatches.push(
			varComp.mountVarButton( vh, {
				getValue: () => titleIn.value,
				onChange: ( v ) => {
					titleIn.value = v;
					params.title = v;
					queueRebuild();
				},
				inputEl: titleIn,
			} )
		);
	}
	const subRow = ui.row( dialCard, t( 'Subtitle' ) );
	const subIn = ui.el( 'input', 'dsm-input', subRow );
	subIn.type = 'text';
	subIn.value = params.subtitle;
	subIn.placeholder = t( 'optional' );
	subIn.oninput = () => {
		params.subtitle = subIn.value;
		queueRebuild();
	};
	if ( varComp ) {
		const vh = document.createElement( 'div' );
		subRow.appendChild( vh );
		swatches.push(
			varComp.mountVarButton( vh, {
				getValue: () => subIn.value,
				onChange: ( v ) => {
					subIn.value = v;
					params.subtitle = v;
					queueRebuild();
				},
				inputEl: subIn,
			} )
		);
	}
	const icoRow = ui.row( dialCard, t( 'Centre' ) );
	const icoIn = ui.el( 'input', 'dsm-input', icoRow );
	icoIn.type = 'text';
	icoIn.value = params.centerIcon || '';
	icoIn.placeholder = t( 'emoji or text' );
	icoIn.oninput = () => {
		params.centerIcon = icoIn.value;
		queueRebuild();
	};
	const icoPick = ui.el( 'button', 'wpie-dr-pickbtn', icoRow );
	icoPick.type = 'button';
	icoPick.textContent = '🙂';
	icoPick.title = t( 'Pick an emoji' );
	icoPick.onclick = () =>
		openMarkPicker( icoPick, {
			icons: false,
			onPick: ( sel ) => {
				if ( 'emoji' === sel.type ) {
					icoIn.value = ( icoIn.value || '' ) + sel.char;
					params.centerIcon = icoIn.value;
					queueRebuild();
				}
			},
		} );
	ui.check( dialCard, {
		label: t( 'Hour ticks' ),
		checked: params.ticks !== false,
		onChange: ( v ) => {
			params.ticks = v;
			rebuild();
		},
	} );
	ui.check( dialCard, {
		label: t( 'Hour numbers' ),
		checked: params.hourNumbers !== false,
		onChange: ( v ) => {
			params.hourNumbers = v;
			rebuild();
		},
	} );
	if ( varComp ) {
		ui.el(
			'p',
			'dsm-hint',
			dialCard,
			t(
				'Insert {{fields}} into the title for a dynamic featured image per post.'
			)
		);
	}

	const styleCard = ui.section( side, {
		icon: ICONS.palette,
		title: t( 'Style' ),
	} );
	ui.select( ui.row( styleCard, t( 'Palette' ) ), {
		options: PALETTE_LIST.map( ( x ) => ( {
			value: x.id,
			label: t( x.label ),
		} ) ),
		value: params.palette,
		onChange: ( v ) => {
			params.palette = v;
			rebuild();
		},
	} );
	ui.slider( styleCard, {
		label: t( 'Ring thickness' ),
		min: 0.5,
		max: 1.6,
		step: 0.05,
		value: params.ring.thickness,
		format: ( v ) => Math.round( v * 100 ) + '%',
		onInput: ( v ) => {
			params.ring.thickness = v;
			queueRebuild();
		},
	} );
	ui.slider( styleCard, {
		label: t( 'Gap' ),
		min: 0,
		max: 0.6,
		step: 0.02,
		value: params.ring.gap,
		format: ( v ) => Math.round( v * 100 ) + '%',
		onInput: ( v ) => {
			params.ring.gap = v;
			queueRebuild();
		},
	} );
	ui.check( styleCard, {
		label: t( 'Rounded ends' ),
		checked: params.ring.rounded !== false,
		onChange: ( v ) => {
			params.ring.rounded = v;
			rebuild();
		},
	} );
	ui.check( styleCard, {
		label: t( 'Labels on ring' ),
		checked: params.ringLabels !== false,
		onChange: ( v ) => {
			params.ringLabels = v;
			rebuild();
		},
	} );
	ui.check( styleCard, {
		label: t( 'Legend' ),
		checked: params.legend !== false,
		onChange: ( v ) => {
			params.legend = v;
			rebuild();
		},
	} );
	ui.check( styleCard, {
		label: t( 'Show durations' ),
		checked: !! params.durations,
		onChange: ( v ) => {
			params.durations = v;
			rebuild();
		},
	} );
	ui.check( styleCard, {
		label: t( 'Arc depth' ),
		checked: params.depth !== false,
		onChange: ( v ) => {
			params.depth = v;
			rebuild();
		},
	} );
	ui.check( styleCard, {
		label: t( 'Day & night shading' ),
		checked: params.dayNight !== false,
		onChange: ( v ) => {
			params.dayNight = v;
			rebuild();
		},
	} );
	ui.check( styleCard, {
		label: t( 'Dark theme' ),
		checked: params.dark !== false,
		onChange: ( v ) => {
			params.dark = v;
			rebuild();
		},
	} );

	const bgCard = ui.section( side, {
		icon: ICONS.image,
		title: t( 'Background' ),
	} );
	ui.select( ui.row( bgCard, t( 'Type' ) ), {
		options: [
			{ value: 'solid', label: t( 'Solid colour' ) },
			{ value: 'gradient', label: t( 'Gradient' ) },
			{ value: 'transparent', label: t( 'Transparent' ) },
		],
		value: params.bg.mode,
		onChange: ( v ) => {
			params.bg.mode = v;
			rebuild();
			bgColVis();
		},
	} );
	const col1Row = ui.row( bgCard, t( 'Colour' ) );
	const col1Node = document.createElement( 'div' );
	col1Row.appendChild( col1Node );
	swatches.push(
		bridge.components.mountColorButton( col1Node, {
			color: params.bg.color,
			title: t( 'Background colour' ),
			onChange: ( c ) => {
				params.bg.color = c;
				rebuild();
			},
		} )
	);
	const col2Row = ui.row( bgCard, t( 'Colour 2' ) );
	const col2Node = document.createElement( 'div' );
	col2Row.appendChild( col2Node );
	swatches.push(
		bridge.components.mountColorButton( col2Node, {
			color: params.bg.color2,
			title: t( 'Gradient end colour' ),
			onChange: ( c ) => {
				params.bg.color2 = c;
				rebuild();
			},
		} )
	);
	const bgColVis = () => {
		col1Row.parentElement.style.display =
			params.bg.mode === 'transparent' ? 'none' : '';
		col2Row.parentElement.style.display =
			params.bg.mode === 'gradient' ? '' : 'none';
	};

	// ---------------- footer ----------------
	const statusEl = ui.el( 'div', 'dsm-hint wpie-dr-status', modal.foot );
	function renderStatus() {
		statusEl.textContent =
			t( 'Day Ring' ) +
			'  ·  ' +
			params.blocks.length +
			' ' +
			t( 'blocks' );
	}
	const actions = ui.el( 'div', 'dsm-actions', modal.foot );
	ui.btn( actions, {
		label: t( 'Cancel' ),
		onClick: () => {
			modal.close();
			cleanup();
		},
	} );
	ui.btn( actions, {
		label: editing ? t( 'Update day ring' ) : t( 'Insert day ring' ),
		primary: true,
		onClick: () => insert(),
	} );

	function insert() {
		try {
			const d = docOf( editor );
			const store = JSON.parse( JSON.stringify( params ) );
			store._ar = editing
				? ( layer.w || 1 ) / ( layer.h || 1 )
				: ( d.w || 1 ) / ( d.h || 1 );
			if ( editing ) {
				const ar = ( layer.w || 1 ) / ( layer.h || 1 );
				const long = 2000,
					w = ar >= 1 ? long : Math.round( long * ar ),
					h = ar >= 1 ? Math.round( long / ar ) : long;
				const canvas = renderRing( params, w, h, { tabler } );
				editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: {
						src: canvas.toDataURL( 'image/png' ),
						naturalW: canvas.width,
						naturalH: canvas.height,
						generator: { id: GEN_ID, params: store },
					},
				} );
				editor.commit( t( 'Update Day Ring' ) );
			} else {
				const { makeImage } = bridge.documents;
				const ar = ( d.w || 1 ) / ( d.h || 1 );
				const long = 2000,
					w = ar >= 1 ? long : Math.round( long * ar ),
					h = ar >= 1 ? Math.round( long / ar ) : long;
				const canvas = renderRing( params, w, h, { tabler } );
				const nl = makeImage( {
					name: t( 'Day Ring' ),
					x: 0,
					y: 0,
					w: d.w,
					h: d.h,
					src: canvas.toDataURL( 'image/png' ),
					naturalW: canvas.width,
					naturalH: canvas.height,
				} );
				nl.generator = { id: GEN_ID, params: store };
				editor.dispatch( { type: 'ADD_LAYER', layer: nl } );
				editor.dispatch( { type: 'SET_ACTIVE', id: nl.id } );
				editor.commit( t( 'Insert Day Ring' ) );
			}
			toast(
				editing ? t( 'Day ring updated.' ) : t( 'Day ring inserted.' )
			);
			modal.close();
			cleanup();
		} catch ( e ) {
			toast( e.message || String( e ), 'error' );
		}
	}

	function cleanup() {
		closeEmojiPop();
		swatches.forEach( ( s ) => s && s.unmount && s.unmount() );
		blockSwatches.forEach( ( s ) => s && s.unmount && s.unmount() );
		if ( timer ) {
			clearTimeout( timer );
		}
	}

	renderBlockList();
	bgColVis();
	rebuild();
}

// Dynamic re-render: expand {{tokens}} in the title/subtitle per post context
// and re-bake, so a Day Ring works as a dynamic featured image.
async function resolveDay( args ) {
	const params = args && args.params;
	const expandTokens = args && args.expandTokens;
	const hasTokens = args && args.hasTokens;
	if ( ! params || ! expandTokens || ! hasTokens ) {
		return null;
	}
	const tHas = 'string' === typeof params.title && hasTokens( params.title );
	const sHas =
		'string' === typeof params.subtitle && hasTokens( params.subtitle );
	if ( ! tHas && ! sHas ) {
		return null;
	}
	const resolved = { ...params };
	if ( tHas ) {
		resolved.title = expandTokens( params.title );
	}
	if ( sHas ) {
		resolved.subtitle = expandTokens( params.subtitle );
	}
	const ar = params._ar > 0 ? params._ar : 1;
	const long = 1600,
		w = ar >= 1 ? long : Math.round( long * ar ),
		h = ar >= 1 ? Math.round( long / ar ) : long;
	const bridge = window.WPIE && window.WPIE.bridge;
	let tabler = null;
	try {
		if ( bridge && bridge.iconsLib ) {
			tabler = await bridge.iconsLib.loadTabler();
		}
	} catch ( e ) {
		tabler = null;
	}
	const canvas = renderRing( resolved, w, h, { tabler } );
	return {
		src: canvas.toDataURL( 'image/png' ),
		naturalW: canvas.width,
		naturalH: canvas.height,
	};
}

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Day Ring',
		run: ( c ) => openStudio( c ),
		edit: ( c ) => openStudio( c ),
		resolve: ( a ) => resolveDay( a ),
	} );
}
if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else if ( window.wp && window.wp.hooks ) {
	window.wp.hooks.addAction( 'wpie.ready', 'wpie-day-ring', register );
}
