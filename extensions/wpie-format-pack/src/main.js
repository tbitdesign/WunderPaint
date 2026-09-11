/**
 * Reformat - WPIE extension entry.
 *
 * One design, every platform size, WITHOUT the crop: the current
 * document is re-laid-out per target format (backgrounds cover-fill,
 * content keeps its anchors and scales uniformly, platform safe zones
 * respected), previewed as a live grid and exported as one ZIP or
 * straight into the media library. Registers under Automate → Design.
 */

import { FORMATS, GROUPS } from './formats.js';
import {
	transformLayers,
	focusFromDepth,
	focusFromCutout,
	coverAffine,
} from './relayout.js';
import { makeZip, download } from './zip.js';

import { t } from './i18n.js';

/**
 * Upload through wp.apiFetch, which carries and refreshes the nonce; a
 * hand-built fetch with the boot nonce failed after the first rotation
 * (BRIDGE-04, 10.09.2026). Same shape as the fetch Response the callers read.
 */
async function wpieMediaPost( restRoot, init ) {
	try {
		const json = await window.wp.apiFetch( {
			url: restRoot + 'wp/v2/media',
			method: 'POST',
			...init,
		} );
		return { ok: true, status: 201, json: () => Promise.resolve( json ) };
	} catch ( e ) {
		return {
			ok: false,
			status: ( e && e.data && e.data.status ) || 0,
			json: () => Promise.resolve( e ),
		};
	}
}


/* ------------------------------ DOM helpers ------------------------------ */

/**
 * Same signature as the kit's ui.el, INCLUDING the fourth argument. It
 * used to stop at three, so `el( 'span', cls, parent, 'Text' )` dropped
 * the text without a word - the format list showed bare checkboxes.
 */
function el( tag, cls, parent, text ) {
	const node = document.createElement( tag );
	if ( cls ) {
		node.className = cls;
	}
	if ( parent ) {
		parent.appendChild( node );
	}
	if ( undefined !== text && null !== text ) {
		node.textContent = String( text );
	}
	return node;
}



const tabIcon = ( d, size = 15 ) =>
	'<svg xmlns="http://www.w3.org/2000/svg" width="' +
	size +
	'" height="' +
	size +
	'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' +
	d +
	'"/></svg>';

const ICONS = {
	formats: tabIcon(
		'M3 5a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z M16 7h2a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-9a2 2 0 0 1 -2 -2v-2'
	),
	options: tabIcon(
		'M4 6l8 0 M16 6l4 0 M8 12l12 0 M4 12l0 0 M4 18l4 0 M12 18l8 0 M14 4l0 4 M6 10l0 4 M10 16l0 4'
	),
	crop: tabIcon(
		'M6 3v12a2 2 0 0 0 2 2h12 M3 6h12a2 2 0 0 1 2 2v12'
	),
	export: tabIcon(
		'M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2 M7 11l5 5l5 -5 M12 4l0 12'
	),
};
const ICON_CLOSE =
	'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>';

const dataUrlBytes = ( url ) => {
	const bin = window.atob( url.slice( url.indexOf( ',' ) + 1 ) );
	const bytes = new Uint8Array( bin.length );
	for ( let i = 0; i < bin.length; i++ ) {
		bytes[ i ] = bin.charCodeAt( i );
	}
	return bytes;
};

/* --------------------------------- dialog -------------------------------- */

async function openFormatPack( { editor, extras } ) {
	const bridge = window.WPIE && window.WPIE.bridge;
	const ui = bridge && bridge.ui;
	const doc = editor.state.doc;
	const srcLayers = editor.state.layers;
	if ( ! srcLayers.length ) {
		if ( extras && extras.toasts ) {
			extras.toasts.error( t( 'The document has no layers yet.' ) );
		}
		return;
	}
	const opts = {
		contentScale: 1,
		useSafe: true,
		// The point a cover-filled background must keep. Half/half is the
		// middle of the picture; the subject finder moves it.
		focus: { x: 0.5, y: 0.5 },
		smartCrop: true,
		showSafe: true,
		type: 'png',
		base: 'design',
		selected: new Set(
			FORMATS.filter( ( f ) => f.on ).map( ( f ) => f.id )
		),
	};

	const host = document.getElementById( 'wpie-root' ) || document.body;
	const backdrop = el( 'div', 'modal-backdrop', host );
	const dialog = el( 'div', 'dsm wpiefp-dialog', backdrop );
	dialog.setAttribute( 'role', 'dialog' );
	dialog.setAttribute( 'aria-label', 'Reformat' );
	dialog.onclick = ( e ) => e.stopPropagation();
	const head = el( 'div', 'dsm-head', dialog );
	// Die Marke kommt aus dem Kit (bridge.ui), nicht aus dem Paket.
	window.WPIE.bridge.ui.badge( head );
	const titles = el( 'div', 'dsm-titles', head );
	const titleRow = el( 'div', 'dsm-title-row', titles );
	const dlgTitle = el( 'span', 'dsm-title', titleRow );
	dlgTitle.textContent = 'Reformat';
	const sub = el( 'div', 'dsm-sub', titles );
	sub.textContent = t( 'One design, re-laid-out for every platform.' );
	const closeBtn = el( 'button', 'dsm-close', head );
	closeBtn.setAttribute( 'aria-label', 'Close' );
	closeBtn.innerHTML = ICON_CLOSE;
	const body = el( 'div', 'wpiefp-body', dialog );
	const view = el( 'div', 'wpiefp-view wpiefp-gridwrap', body );
	const grid = el( 'div', 'wpiefp-formats', view );
	const side = el( 'div', 'dsm-col end wpiefp-side', body );
	const controls = el( 'div', 'wpiefp-controls', side );

	/* ------------------------------ formats ------------------------------- */

	const secFormats = ui.section( controls, {
		icon: ICONS.formats,
		title: t( 'Formats' ),
	} );
	const selRow = el( 'div', 'wpiefp-selrow', secFormats );
	const allBtn = ui.btn( selRow, { label: t( 'All' ) } );
	const noneBtn = ui.btn( selRow, { label: t( 'None' ) } );
	// The formats were selectable only by clicking a preview card, which
	// nobody finds and which needs the card to be on screen. The list is
	// the control; the cards follow it.
	const fmtList = el( 'div', 'wpiefp-fmtlist', secFormats );
	const fmtChecks = new Map();
	const groupBoxes = [];
	for ( const group of GROUPS ) {
		const items = group.ids
			.map( ( id ) => FORMATS.find( ( f ) => f.id === id ) )
			.filter( Boolean );
		if ( ! items.length ) {
			continue;
		}
		// The group head is a control, not a caption: it takes the whole
		// platform in one click and shows a dash while only part of it is
		// picked.
		const gHead = el( 'label', 'wpiefp-fmtgroup', fmtList );
		const gbox = el( 'input', 'wpiefp-fmtbox', gHead );
		gbox.type = 'checkbox';
		el( 'span', 'wpiefp-groupname', gHead, t( group.label ) );
		const gcount = el( 'span', 'wpiefp-fmtdim', gHead, '' );
		gbox.onchange = () => {
			for ( const f of items ) {
				if ( gbox.checked ) {
					opts.selected.add( f.id );
				} else {
					opts.selected.delete( f.id );
				}
			}
			syncSelection();
		};
		groupBoxes.push( { box: gbox, count: gcount, items } );
		for ( const format of items ) {
			const line = el( 'label', 'wpiefp-fmtrow', fmtList );
			const box = el( 'input', 'wpiefp-fmtbox', line );
			box.type = 'checkbox';
			box.checked = opts.selected.has( format.id );
			el( 'span', 'wpiefp-fmtname', line, t( format.label ) );
			el(
				'span',
				'wpiefp-fmtdim',
				line,
				format.w + '×' + format.h
			);
			box.onchange = () => {
				if ( box.checked ) {
					opts.selected.add( format.id );
				} else {
					opts.selected.delete( format.id );
				}
				syncSelection();
			};
			fmtChecks.set( format.id, box );
		}
	}
	ui.note(
		secFormats,
		t(
			'Backgrounds fill each frame; text and logos keep their anchors and stay inside each platform’s safe zones.'
		)
	);

	/* ------------------------------ options ------------------------------- */

	/* ------------------------------- crop -------------------------------- */

	const secCrop = ui.section( controls, {
		icon: ICONS.crop,
		title: t( 'Crop' ),
	} );
	ui.check( secCrop, {
		label: t( 'Keep the subject in frame' ),
		checked: opts.smartCrop,
		onChange: ( v ) => {
			opts.smartCrop = !! v;
			schedulePreviews();
		},
	} );
	const cropNote = ui.note(
		secCrop,
		t( 'A square design cut to a story keeps its middle by default - which is often the gap between the things that matter.' )
	);
	const findBtn = ui.btn( secCrop, { label: t( 'Find the subject' ) } );

	/* ------------------------------ options ------------------------------- */

	const secOpts = ui.section( controls, {
		icon: ICONS.options,
		title: t( 'Options' ),
	} );
	ui.slider( secOpts, {
		label: t( 'Content scale' ),
		min: 60,
		max: 150,
		value: 100,
		format: ( v ) => v + '%',
		onInput: ( v ) => {
			opts.contentScale = v / 100;
			schedulePreviews();
		},
	} );
	ui.check( secOpts, {
		label: t( 'Respect platform safe zones' ),
		checked: true,
		onChange: ( v ) => {
			opts.useSafe = !! v;
			schedulePreviews();
		},
	} );
	ui.check( secOpts, {
		label: t( 'Show the safe zones in the preview' ),
		checked: true,
		onChange: ( v ) => {
			opts.showSafe = !! v;
			schedulePreviews();
		},
	} );
	ui.select( ui.row( secOpts, t( 'File type' ) ), {
		options: [
			{ value: 'png', label: 'PNG' },
			{ value: 'jpeg', label: 'JPEG (90%)' },
		],
		value: opts.type,
		onChange: ( v ) => {
			opts.type = v;
		},
	} );
	const nameInput = el(
		'input',
		'dsm-input',
		ui.row( secOpts, t( 'File name' ) )
	);
	nameInput.type = 'text';
	nameInput.value = opts.base;
	nameInput.oninput = () => {
		opts.base =
			nameInput.value
				.toLowerCase()
				.replace( /[^a-z0-9]+/g, '-' )
				.replace( /^-+|-+$/g, '' ) || 'design';
	};

	/* ------------------------------- export ------------------------------- */

	const secExport = ui.section( controls, {
		icon: ICONS.export,
		title: t( 'Export' ),
	} );
	const statusNote = ui.note( secExport, '' );
	statusNote.classList.add( 'wpiefp-status' );

	const foot = el( 'div', 'dsm-foot', dialog );
	const footHint = el( 'div', 'dsm-hint', foot );
	footHint.textContent = '';
	const actions = el( 'div', 'dsm-actions', foot );
	const cancelBtn = el( 'button', 'ai-btn secondary', actions );
	cancelBtn.type = 'button';
	cancelBtn.textContent = t( 'Cancel' );
	const libraryBtn = el( 'button', 'ai-btn secondary', actions );
	libraryBtn.type = 'button';
	libraryBtn.textContent = t( 'Save to Media Library' );
	const zipBtn = el( 'button', 'ai-btn primary', actions );
	zipBtn.type = 'button';
	zipBtn.textContent = t( 'Download ZIP' );

	/* ----------------------------- rendering ------------------------------ */

	const cache = bridge.raster.sharedImageCache;
	try {
		// The editor's layer list is flat already (groups reference
		// their members by id).
		await cache.warm( srcLayers );
	} catch ( e ) {
		// Missing sources render as gaps; never block the dialog.
	}

	const renderFormat = async ( format, scale ) => {
		const layers = transformLayers( srcLayers, doc, format, {
			contentScale: opts.contentScale,
			useSafe: opts.useSafe,
			focus: opts.smartCrop ? opts.focus : null,
		} );
		return bridge.raster.renderToCanvas(
			{ ...doc, w: format.w, h: format.h },
			layers,
			{ scale, cache }
		);
	};

	const cards = new Map();
	const cardEls = new Map();
	for ( const format of FORMATS ) {
		const card = el( 'button', 'dsm-pick wpiefp-format', grid );
		card.type = 'button';
		card.classList.toggle( 'active', opts.selected.has( format.id ) );
		const thumbBox = el( 'div', 'wpiefp-thumbbox', card );
		const thumb = el( 'canvas', 'wpiefp-thumb', thumbBox );
		const cap = el( 'div', 'wpiefp-caption', card );
		const capName = el( 'span', null, cap );
		capName.textContent = t( format.label );
		const capDims = el( 'span', 'wpiefp-dims', cap );
		capDims.textContent = format.w + '×' + format.h;
		card.onclick = ( e ) => {
			// A click on the picture sets the focus, a click anywhere
			// else on the card picks the format. Two jobs, but the one
			// you get is the one you aimed at.
			if ( opts.smartCrop && thumb.contains( e.target ) ) {
				const r = thumb.getBoundingClientRect();
				const p = focusFromPoint(
					format,
					( e.clientX - r.left ) / ( r.width || 1 ),
					( e.clientY - r.top ) / ( r.height || 1 )
				);
				if ( p ) {
					opts.focus = p;
					cropNote.textContent = t( 'Subject at %s' ).replace(
						'%s',
						Math.round( p.x * 100 ) +
							' / ' +
							Math.round( p.y * 100 )
					);
					schedulePreviews();
					return;
				}
			}
			if ( opts.selected.has( format.id ) ) {
				opts.selected.delete( format.id );
			} else {
				opts.selected.add( format.id );
			}
			syncSelection();
		};
		cards.set( format.id, thumb );
		cardEls.set( format.id, card );
	}

	/* ---------------------------- subject finder -------------------------- */

	/*
	 * Where to crop is a question about the picture, so we ask the picture.
	 * Depth Anything runs locally in the browser (bridge.ml.depthMap, API
	 * 2.16) and hands back one grayscale channel, near = bright; the
	 * centroid of the nearest band is the subject.
	 *
	 * It is a nice-to-have, never a requirement: with no model installed,
	 * no bridge or a flat map the focus stays in the middle and the
	 * reformat behaves exactly as it did before.
	 */
	async function findSubject() {
		const small = await bridge.raster.renderToCanvas( doc, srcLayers, {
			scale: Math.min( 1, 384 / Math.max( doc.w || 1, doc.h || 1 ) ),
			cache,
		} );
		const url = small.toDataURL( 'image/png' );

		// FIRST the cutout: it is the same local model the editor's own
		// Smart Recrop uses on thumbnails, so a picture is framed here the
		// way the Media Library Manager frames it. Local, no cost.
		if ( bridge.raster && bridge.raster.subjectCutout ) {
			try {
				const cut = await bridge.raster.subjectCutout( url );
				const img = await loadImage( cut );
				const c = document.createElement( 'canvas' );
				c.width = Math.max( 1, img.naturalWidth || img.width );
				c.height = Math.max( 1, img.naturalHeight || img.height );
				const g = c.getContext( '2d' );
				g.drawImage( img, 0, 0 );
				const px = g.getImageData( 0, 0, c.width, c.height );
				const f = focusFromCutout( px.data, c.width, c.height );
				if ( f ) {
					opts.focus = f;
					return { ok: true, f, how: 'cutout' };
				}
			} catch ( e ) {
				// No model installed, or nothing to cut out: fall through.
			}
		}

		// THEN depth, which answers a different question - what is near,
		// not what the picture is about. Good enough for a landscape.
		const ml = bridge && bridge.ml;
		if ( ml && ml.depthMap ) {
			try {
				const map = await ml.depthMap( url );
				const f = map && focusFromDepth( map.depth, map.w, map.h );
				if ( f ) {
					opts.focus = f;
					return { ok: true, f, how: 'depth' };
				}
			} catch ( e ) {
				// Fall through to the honest answer below.
			}
		}
		return {
			ok: false,
			why: t( 'No clear subject - the crop stays centered.' ),
		};
	}

	/**
	 * A dataURL as an <img>, resolved once it can be measured.
	 *
	 * @param {string} src Data URL.
	 * @return {Promise<HTMLImageElement>} The loaded image.
	 */
	function loadImage( src ) {
		return new Promise( ( resolve, reject ) => {
			const img = new window.Image();
			img.onload = () => resolve( img );
			img.onerror = () => reject( new Error( 'image' ) );
			img.src = src;
		} );
	}

	findBtn.onclick = async () => {
		findBtn.disabled = true;
		cropNote.textContent = t( 'Looking for the subject…' );
		try {
			const r = await findSubject();
			if ( r.ok ) {
				cropNote.textContent = t( 'Subject at %s' ).replace(
					'%s',
					Math.round( r.f.x * 100 ) + ' / ' + Math.round( r.f.y * 100 )
				);
				opts.smartCrop = true;
				schedulePreviews();
			} else {
				cropNote.textContent = r.why;
			}
		} catch ( e ) {
			cropNote.textContent = t( 'The subject could not be found.' );
		}
		findBtn.disabled = false;
	};

	/**
	 * What the preview owes the user beyond the picture: where the
	 * platform's own UI will sit, and which point of the design survived
	 * the crop. Both are drawn ON the thumbnail, never baked into the
	 * export - this runs after the render, on the preview canvas only.
	 *
	 * @param {Object} g      2D context of the thumbnail.
	 * @param {Object} format The target format.
	 * @param {number} w      Thumbnail width.
	 * @param {number} h      Thumbnail height.
	 */
	function drawOverlay( g, format, w, h ) {
		if ( opts.showSafe && opts.useSafe && format.safe ) {
			const t0 = ( format.safe.top || 0 ) * h;
			const b0 = ( format.safe.bottom || 0 ) * h;
			const l0 = ( format.safe.left || 0 ) * w;
			const r0 = ( format.safe.right || 0 ) * w;
			g.save();
			// The bands are what the platform covers - shading them says
			// "do not put anything here" far better than a number does.
			g.fillStyle = 'rgba(0,0,0,.34)';
			g.fillRect( 0, 0, w, t0 );
			g.fillRect( 0, h - b0, w, b0 );
			g.fillRect( 0, t0, l0, h - t0 - b0 );
			g.fillRect( w - r0, t0, r0, h - t0 - b0 );
			g.strokeStyle = 'rgba(255,255,255,.45)';
			g.setLineDash( [ 3, 3 ] );
			g.lineWidth = 1;
			g.strokeRect( l0 + 0.5, t0 + 0.5, w - l0 - r0 - 1, h - t0 - b0 - 1 );
			g.restore();
		}
		if ( ! opts.smartCrop ) {
			return;
		}
		// The focus, mapped through the same cover transform the layers
		// took, so the ring sits where the kept point really landed.
		const s = Math.max( w / doc.w, h / doc.h );
		const a = coverAffine(
			{ x0: 0, y0: 0, x1: doc.w, y1: doc.h },
			doc,
			{ w, h },
			s,
			opts.focus
		);
		const fx = opts.focus.x * doc.w * s + a.dx;
		const fy = opts.focus.y * doc.h * s + a.dy;
		if ( fx < 0 || fy < 0 || fx > w || fy > h ) {
			return;
		}
		g.save();
		g.strokeStyle = 'rgba(255,255,255,.9)';
		g.lineWidth = 1.5;
		g.beginPath();
		g.arc( fx, fy, 7, 0, Math.PI * 2 );
		g.stroke();
		g.strokeStyle = 'rgba(0,0,0,.55)';
		g.lineWidth = 1;
		g.beginPath();
		g.arc( fx, fy, 8.5, 0, Math.PI * 2 );
		g.stroke();
		g.restore();
	}

	/**
	 * A point clicked in one format's preview, back in document units.
	 * The preview is a cover-fill, so the same transform has to be
	 * undone - a click at the left edge of a story is NOT the left edge
	 * of the design.
	 *
	 * @param {Object} format The format that was clicked.
	 * @param {number} u      0..1 across the preview.
	 * @param {number} v      0..1 down the preview.
	 * @return {Object|null} { x, y } in 0..1 of the document.
	 */
	function focusFromPoint( format, u, v ) {
		const w = format.w;
		const h = format.h;
		const s = Math.max( w / doc.w, h / doc.h );
		const a = coverAffine(
			{ x0: 0, y0: 0, x1: doc.w, y1: doc.h },
			doc,
			{ w, h },
			s,
			opts.focus
		);
		const x = ( u * w - a.dx ) / s / doc.w;
		const y = ( v * h - a.dy ) / s / doc.h;
		if ( ! isFinite( x ) || ! isFinite( y ) ) {
			return null;
		}
		return {
			x: Math.min( 1, Math.max( 0, x ) ),
			y: Math.min( 1, Math.max( 0, y ) ),
		};
	}

	let previewSeq = 0;
	async function renderPreviews() {
		const seq = ++previewSeq;
		for ( const format of FORMATS ) {
			if ( seq !== previewSeq ) {
				return;
			}
			const thumb = cards.get( format.id );
			const scale = Math.min(
				176 / format.w,
				150 / format.h
			);
			try {
				const c = await renderFormat( format, scale );
				if ( seq !== previewSeq ) {
					return;
				}
				thumb.width = c.width;
				thumb.height = c.height;
				// Pin the display size to the raster: stray canvas CSS
				// (max-width/height from the dialog frame) otherwise
				// stretches the bitmap off its aspect.
				thumb.style.width = c.width + 'px';
				thumb.style.height = c.height + 'px';
				const g = thumb.getContext( '2d' );
				g.drawImage( c, 0, 0 );
				drawOverlay( g, format, c.width, c.height );
			} catch ( e ) {
				// Skip broken previews, keep the rest of the grid alive.
			}
		}
	}
	let previewTimer = 0;
	const schedulePreviews = () => {
		window.clearTimeout( previewTimer );
		previewTimer = window.setTimeout( renderPreviews, 180 );
	};

	// One place decides what "selected" looks like - the list, the cards
	// and the two buttons all read from the same set. Before this the
	// cards and the buttons each kept their own idea of it.
	function syncSelection() {
		const any = opts.selected.size > 0;
		zipBtn.disabled = ! any;
		libraryBtn.disabled = ! any;
		for ( const [ id, box ] of fmtChecks ) {
			box.checked = opts.selected.has( id );
		}
		for ( const g of groupBoxes ) {
			const on = g.items.filter( ( f ) =>
				opts.selected.has( f.id )
			).length;
			g.box.checked = on === g.items.length;
			g.box.indeterminate = on > 0 && on < g.items.length;
			g.count.textContent = on + '/' + g.items.length;
		}
		for ( const [ id, card ] of cardEls ) {
			card.classList.toggle( 'active', opts.selected.has( id ) );
		}
	}
	const syncButtons = syncSelection;
	allBtn.onclick = () => {
		FORMATS.forEach( ( f ) => opts.selected.add( f.id ) );
		syncSelection();
	};
	noneBtn.onclick = () => {
		opts.selected.clear();
		syncSelection();
	};

	/* ------------------------------- exports ------------------------------ */

	const mimeOf = () =>
		'jpeg' === opts.type ? 'image/jpeg' : 'image/png';
	const extOf = () => ( 'jpeg' === opts.type ? 'jpg' : 'png' );

	const bakeSelected = async ( onEach ) => {
		const picked = FORMATS.filter( ( f ) =>
			opts.selected.has( f.id )
		);
		const out = [];
		for ( let i = 0; i < picked.length; i++ ) {
			const format = picked[ i ];
			statusNote.textContent =
				t( 'Rendering formats…' ) +
				' (' + ( i + 1 ) + '/' + picked.length + ')';
			const c = await renderFormat( format, 1 );
			let final = c;
			if ( 'jpeg' === opts.type ) {
				// JPEG has no alpha: flatten onto white.
				const flat = document.createElement( 'canvas' );
				flat.width = c.width;
				flat.height = c.height;
				const ctx = flat.getContext( '2d' );
				ctx.fillStyle = '#ffffff';
				ctx.fillRect( 0, 0, flat.width, flat.height );
				ctx.drawImage( c, 0, 0 );
				final = flat;
			}
			const url = final.toDataURL( mimeOf(), 0.9 );
			const entry = {
				format,
				name: opts.base + '-' + format.id + '.' + extOf(),
				bytes: dataUrlBytes( url ),
			};
			out.push( entry );
			if ( onEach ) {
				await onEach( entry, i, picked.length );
			}
		}
		return out;
	};

	const guard = ( fn ) => async () => {
		if ( ! opts.selected.size ) {
			if ( extras && extras.toasts ) {
				extras.toasts.error( t( 'Select at least one format.' ) );
			}
			return;
		}
		zipBtn.disabled = true;
		libraryBtn.disabled = true;
		try {
			await fn();
		} finally {
			zipBtn.disabled = false;
			libraryBtn.disabled = false;
		}
	};

	zipBtn.onclick = guard( async () => {
		const entries = await bakeSelected();
		const zip = makeZip(
			entries.map( ( e ) => ( { name: e.name, data: e.bytes } ) )
		);
		download(
			opts.base + '-formats.zip',
			new Blob( [ zip ], { type: 'application/zip' } )
		);
		statusNote.textContent = '';
	} );

	libraryBtn.onclick = guard( async () => {
		const boot = window.WPIE || {};
		const mediaUrl = String( boot.restUrl || '' ).replace(
			/wpie\/v1\/?$/,
			'wp/v2/media'
		);
		let failed = 0;
		let done = 0;
		await bakeSelected( async ( entry, i, total ) => {
			statusNote.textContent =
				t( 'Saving to the media library…' ) +
				' (' + ( i + 1 ) + '/' + total + ')';
			const fd = new window.FormData();
			fd.append(
				'file',
				new window.File(
					[ entry.bytes ],
					entry.name,
					{ type: mimeOf() }
				)
			);
			fd.append(
				'title',
				opts.base + ' – ' + t( entry.format.label )
			);
			try {
				const res = await wpieMediaPost(
					mediaUrl.replace( /wp\/v2\/media$/, '' ),
					{ body: fd }
				);
				if ( ! res.ok ) {
					failed++;
				} else {
					done++;
				}
			} catch ( e ) {
				failed++;
			}
		} );
		statusNote.textContent = failed
			? t( 'Could not save some formats.' ) + ' (' + done + '/' + ( done + failed ) + ')'
			: done + ' ' + t( 'saved.' );
	} );

	/* ------------------------------ lifecycle ----------------------------- */

	function close() {
		document.removeEventListener( 'keydown', onKey );
		previewSeq++;
		backdrop.remove();
	}
	const onKey = ( e ) => {
		if ( 'Escape' === e.key ) {
			close();
		}
	};
	document.addEventListener( 'keydown', onKey );
	closeBtn.onclick = close;
	cancelBtn.onclick = close;
	backdrop.onclick = ( e ) => {
		if ( e.target === backdrop ) {
			close();
		}
	};

	syncButtons();
	renderPreviews();
}

/* -------------------------------- register ------------------------------- */

function register( api ) {
	// Core 1.154 removed the automate/* menu targets; generators land
	// in the top-level Extensions menu automatically (API 2.5).
	api.registerGenerator( {
		id: 'wpie-format-pack/formats',
		label: 'Reformat',
		run: ( ctx ) => openFormatPack( ctx ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else {
	window.wp.hooks.addAction( 'wpie.ready', 'wpie-format-pack', register );
}
