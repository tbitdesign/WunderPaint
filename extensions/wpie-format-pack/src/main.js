/**
 * Reformat - WPIE extension entry.
 *
 * One design, every platform size, WITHOUT the crop: the current
 * document is re-laid-out per target format (backgrounds cover-fill,
 * content keeps its anchors and scales uniformly, platform safe zones
 * respected), previewed as a live grid and exported as one ZIP or
 * straight into the media library. Registers under Automate → Design.
 */

import { FORMATS } from './formats.js';
import { transformLayers } from './relayout.js';
import { makeZip, download } from './zip.js';

import { t } from './i18n.js';


/* ------------------------------ DOM helpers ------------------------------ */

function el( tag, cls, parent ) {
	const node = document.createElement( tag );
	if ( cls ) {
		node.className = cls;
	}
	if ( parent ) {
		parent.appendChild( node );
	}
	return node;
}

function row( parent, label ) {
	const r = el( 'div', 'wpiefp-row', parent );
	const s = el( 'span', 'dsm-label', r );
	s.textContent = label;
	return r;
}

function section( parent, icon, label ) {
	const card = el( 'div', 'wpiefp-card', parent );
	const head = el( 'div', 'wpiefp-card-head', card );
	head.innerHTML = icon + '<span>' + label + '</span>';
	return el( 'div', 'wpiefp-card-body', card );
}

const tabIcon = ( d, size = 15 ) =>
	'<svg xmlns="http://www.w3.org/2000/svg" width="' +
	size +
	'" height="' +
	size +
	'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' +
	d +
	'"/></svg>';

const ICON_BRAND =
	'<svg width="24" height="24" viewBox="0 0 18.83 18.83" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.84,18.83H3.62c-2,0-3.62-1.62-3.62-3.62V3.52h1.72c.7,0,1.28.57,1.28,1.28v10.43c0,.34.28.62.62.62h8.94c.71,0,1.29.58,1.29,1.29v1.71Z"/><path fill="#3b66ff" d="M18.83,14.02h-1.71c-.71,0-1.29-.58-1.29-1.29V3.62c0-.34-.28-.62-.62-.62H4.82c-.7,0-1.28-.57-1.28-1.28V0h11.67c2,0,3.62,1.62,3.62,3.62v10.4Z"/><circle fill="currentColor" cx="17.33" cy="17.33" r="1.5"/><path fill="#3b66ff" d="M9.51,5.71l.91,2.45c.03.08.09.14.17.17l2.45.91c.07.03.07.13,0,.16l-2.45.91c-.08.03-.14.09-.17.17l-.91,2.45c-.03.07-.13.07-.16,0l-.91-2.45c-.03-.08-.09-.14-.17-.17l-2.45-.91c-.07-.03-.07-.13,0-.16l2.45-.91c.08-.03.14-.09.17-.17l.91-2.45c.03-.07.13-.07.16,0Z"/></svg>';
const ICONS = {
	formats: tabIcon(
		'M3 5a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z M16 7h2a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-9a2 2 0 0 1 -2 -2v-2'
	),
	options: tabIcon(
		'M4 6l8 0 M16 6l4 0 M8 12l12 0 M4 12l0 0 M4 18l4 0 M12 18l8 0 M14 4l0 4 M6 10l0 4 M10 16l0 4'
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
	const badge = el( 'span', 'dsm-badge', head );
	badge.innerHTML = ICON_BRAND;
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
	const side = el( 'div', 'wpiefp-side', body );
	const controls = el( 'div', 'wpiefp-controls', side );

	/* ------------------------------ formats ------------------------------- */

	const secFormats = section( controls, ICONS.formats, t( 'Formats' ) );
	const selRow = el( 'div', 'wpiefp-selrow', secFormats );
	const allBtn = el( 'button', 'ai-btn secondary', selRow );
	allBtn.type = 'button';
	allBtn.textContent = t( 'All' );
	const noneBtn = el( 'button', 'ai-btn secondary', selRow );
	noneBtn.type = 'button';
	noneBtn.textContent = t( 'None' );
	const selNote = el( 'div', 'wpiefp-note', secFormats );
	selNote.textContent = t(
		'Backgrounds fill each frame; text and logos keep their anchors and stay inside each platform’s safe zones.'
	);

	/* ------------------------------ options ------------------------------- */

	const secOpts = section( controls, ICONS.options, t( 'Options' ) );
	const scaleRow = row( secOpts, t( 'Content scale' ) );
	scaleRow.classList.add( 'has-val' );
	const scaleInput = el( 'input', 'dsm-range', scaleRow );
	scaleInput.type = 'range';
	scaleInput.min = '60';
	scaleInput.max = '150';
	scaleInput.value = '100';
	const scaleVal = el( 'span', 'wpiefp-val', scaleRow );
	scaleVal.textContent = '100%';
	scaleInput.oninput = () => {
		scaleVal.textContent = scaleInput.value + '%';
		opts.contentScale = parseInt( scaleInput.value, 10 ) / 100;
		schedulePreviews();
	};
	const safeRow = row( secOpts, t( 'Respect platform safe zones' ) );
	safeRow.classList.add( 'wpiefp-wide' );
	const safeInput = el( 'input', 'wpiefp-checkbox', safeRow );
	safeInput.type = 'checkbox';
	safeInput.checked = true;
	safeInput.onchange = () => {
		opts.useSafe = safeInput.checked;
		schedulePreviews();
	};
	const typeRow = row( secOpts, t( 'File type' ) );
	const typeSel = el( 'select', 'dsm-select', typeRow );
	[
		[ 'png', 'PNG' ],
		[ 'jpeg', 'JPEG (90%)' ],
	].forEach( ( [ v, label ] ) => {
		const opt = el( 'option', null, typeSel );
		opt.value = v;
		opt.textContent = label;
	} );
	typeSel.onchange = () => {
		opts.type = typeSel.value;
	};
	const nameRow = row( secOpts, t( 'File name' ) );
	const nameInput = el( 'input', 'dsm-input', nameRow );
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

	const secExport = section( controls, ICONS.export, t( 'Export' ) );
	const statusNote = el( 'div', 'wpiefp-note wpiefp-status', secExport );

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
		} );
		return bridge.raster.renderToCanvas(
			{ ...doc, w: format.w, h: format.h },
			layers,
			{ scale, cache }
		);
	};

	const cards = new Map();
	for ( const format of FORMATS ) {
		const card = el( 'button', 'wpiefp-format', grid );
		card.type = 'button';
		card.classList.toggle( 'active', opts.selected.has( format.id ) );
		const thumbBox = el( 'div', 'wpiefp-thumbbox', card );
		const thumb = el( 'canvas', 'wpiefp-thumb', thumbBox );
		const cap = el( 'div', 'wpiefp-caption', card );
		const capName = el( 'span', null, cap );
		capName.textContent = t( format.label );
		const capDims = el( 'span', 'wpiefp-dims', cap );
		capDims.textContent = format.w + '×' + format.h;
		card.onclick = () => {
			if ( opts.selected.has( format.id ) ) {
				opts.selected.delete( format.id );
			} else {
				opts.selected.add( format.id );
			}
			card.classList.toggle(
				'active',
				opts.selected.has( format.id )
			);
			syncButtons();
		};
		cards.set( format.id, thumb );
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
				thumb.getContext( '2d' ).drawImage( c, 0, 0 );
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

	const syncButtons = () => {
		const any = opts.selected.size > 0;
		zipBtn.disabled = ! any;
		libraryBtn.disabled = ! any;
	};
	allBtn.onclick = () => {
		FORMATS.forEach( ( f ) => opts.selected.add( f.id ) );
		grid.querySelectorAll( '.wpiefp-format' ).forEach( ( c ) =>
			c.classList.add( 'active' )
		);
		syncButtons();
	};
	noneBtn.onclick = () => {
		opts.selected.clear();
		grid.querySelectorAll( '.wpiefp-format' ).forEach( ( c ) =>
			c.classList.remove( 'active' )
		);
		syncButtons();
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
				const res = await window.fetch( mediaUrl, {
					method: 'POST',
					credentials: 'same-origin',
					headers: { 'X-WP-Nonce': boot.nonce || '' },
					body: fd,
				} );
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
