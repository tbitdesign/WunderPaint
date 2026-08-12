/**
 * WPIE extension: Soundwave Art.
 *
 * The waveform of an audio file as a poster: pick a track from the
 * media library (the wedding song, a heartbeat, a podcast episode),
 * the pack decodes it locally with the Web Audio API, and you style
 * the wave (bars, line, filled, circle), trim the range, pick a theme
 * and shape, and insert it with the classic title/subtitle/duration
 * text block as real, editable layers. Nothing leaves the browser.
 *
 * The wave layer stores `layer.generator = { id, params }`, so "Edit
 * Soundwave Art" reopens the studio on the same track and settings.
 *
 * Built with esbuild (`npm run build` in this folder) into extension.js.
 */

import {
	THEMES,
	GRADIENTS,
	computePeaks,
	computeBrights,
	drawWave,
	maskPathOn,
	wavePalette,
	stopColor,
} from './wave-engine.js';

const GEN_ID = 'wpie-soundwave/wave';
const OUT_W = 2048;
const BASE_BUCKETS = 4096;

const DEFAULTS = {
	audio: null, // { id, url, title }
	duration: 0,
	style: 'bars',
	density: 120,
	amp: 1,
	trimStart: 0,
	trimEnd: 100,
	waveHeight: 30, // percent of doc width, non-circle styles
	rounded: true,
	transparentBg: false,
	themeId: 'midnight',
	overrides: {},
	mask: 'none',
	// v2.0 color & light
	colorMode: 'solid', // 'solid' | 'gradient' | 'spectral'
	gradientId: 'sunset',
	gradientMap: 'x', // 'x' along the wave | 'amp' by loudness
	glow: 0, // 0..100 neon glow
	reflect: false, // mirror reflection (linear styles)
	stereo: false, // left/right channel split (linear styles)
	textLayout: 'classic',
	videoRes: '1080x1080',
	videoMode: 'equalizer',
	videoText: true,
	videoBg: null,
	textScale: 1,
	font: '',
	useBrand: false,
	brandKitId: '',
};

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

const svgIc = ( d ) =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ d }</svg>`;
const SEC_ICONS = {
	audio: svgIc( '<path d="M3 10v4M7 6v12M11 3v18M15 8v8M19 5v14"/>' ),
	style: svgIc( '<path d="M4 6h11M4 12h7M4 18h13"/><circle cx="18" cy="6" r="2"/><circle cx="14" cy="12" r="2"/><circle cx="19" cy="18" r="2"/>' ),
	theme: svgIc( '<path d="M12 3a9 9 0 1 0 0 18 2 2 0 0 0 2-2c0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2a2 2 0 0 1 2-2h1.5A3.5 3.5 0 0 0 21 8c0-2.8-4-5-9-5z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/>' ),
	colors: svgIc( '<path d="M12 3v18M5 8l7-5 7 5v8l-7 5-7-5z"/>' ),
	shape: svgIc( '<rect x="4" y="4" width="7" height="7" rx="1"/><circle cx="17.5" cy="7.5" r="3.6"/><path d="M7 14l-4 6h8z"/>' ),
	text: svgIc( '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>' ),
	font: svgIc( '<path d="M4 20l5-14 5 14M6 15h6M15 20l4-11 4 11M16.5 16h5"/>' ),
	video: svgIc( '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>' ),
	dot: svgIc( '<circle cx="12" cy="12" r="7"/>' ),
};
function section( parent, label, iconKey ) {
	const card = el( 'div', 'wpiesnd-card', parent );
	if ( label ) {
		const head = el( 'div', 'wpiesnd-card-head', card );
		head.innerHTML = ( SEC_ICONS[ iconKey ] || SEC_ICONS.dot ) + '<span>' + label + '</span>';
	}
	return el( 'div', 'wpiesnd-card-body', card );
}

/** "3:42" */
/** Mix two hex colors, u toward b - stays hex for shape fills. */
function hexMix( a, b, u ) {
	const pa = a.replace( '#', '' );
	const pb = b.replace( '#', '' );
	let out = '#';
	for ( let i = 0; i < 3; i++ ) {
		const va = parseInt( pa.slice( i * 2, i * 2 + 2 ), 16 ) || 0;
		const vb = parseInt( pb.slice( i * 2, i * 2 + 2 ), 16 ) || 0;
		out += Math.round( va + ( vb - va ) * u )
			.toString( 16 )
			.padStart( 2, '0' );
	}
	return out;
}

function durationText( seconds ) {
	const s = Math.max( 0, Math.round( seconds ) );
	return `${ Math.floor( s / 60 ) }:${ String( s % 60 ).padStart( 2, '0' ) }`;
}

/** Relative luminance of a #rrggbb color, 0..1. */
function lumOf( hex ) {
	const m = /^#?([0-9a-f]{6})$/i.exec( hex || '' );
	if ( ! m ) {
		return 0;
	}
	const n = parseInt( m[ 1 ], 16 );
	return (
		( 0.2126 * ( ( n >> 16 ) & 255 ) +
			0.7152 * ( ( n >> 8 ) & 255 ) +
			0.0722 * ( n & 255 ) ) /
		255
	);
}

/** A neutral stage color that always contrasts the shape fill. */
const autoContrast = ( bg ) => ( lumOf( bg ) > 0.5 ? '#15171c' : '#f2f0ea' );

/** The preferred text color, flipped when it would vanish on `bg`. */
const textOn = ( bg, preferred ) =>
	Math.abs( lumOf( bg ) - lumOf( preferred ) ) > 0.35
		? preferred
		: lumOf( bg ) > 0.5
		? '#15171c'
		: '#f5f6f8';

/* --------------------------------- studio -------------------------------- */

async function openStudio( { editor, extras, layer } ) {
	const bridge = window.WPIE.bridge;
	if ( ! bridge || ! bridge.documents ) {
		if ( extras && extras.toasts ) {
			extras.toasts.error(
				t( 'Soundwave Art needs WunderPaint 1.144 or newer.' )
			);
		}
		return;
	}

	const editing = !! (
		layer &&
		layer.generator &&
		layer.generator.id === GEN_ID
	);
	const params = {
		...DEFAULTS,
		...( editing ? layer.generator.params : {} ),
	};
	params.overrides = { ...( params.overrides || {} ) };

	let basePeaks = null; // high-resolution peaks, source of truth
	let basePeaksL = null; // per-channel profiles (stereo split)
	let basePeaksR = null;
	let baseBrights = null; // zero-crossing brightness (spectral colors)
	let peaks = null; // current density/trim view
	let peaksB = null; // right channel at current density (stereo)
	let brightsArr = null; // brightness at current density
	let peaksFull = null; // high-res trim window (ridgeline)
	let syncStereoAvail = null; // set by the colors section
	let titleDirty = editing;

	/* ------------------------------ overlay ------------------------------ */

	const ICON_BRAND =
		'<svg width="24" height="24" viewBox="0 0 18.83 18.83" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.84,18.83H3.62c-2,0-3.62-1.62-3.62-3.62V3.52h1.72c.7,0,1.28.57,1.28,1.28v10.43c0,.34.28.62.62.62h8.94c.71,0,1.29.58,1.29,1.29v1.71Z"/><path fill="#3b66ff" d="M18.83,14.02h-1.71c-.71,0-1.29-.58-1.29-1.29V3.62c0-.34-.28-.62-.62-.62H4.82c-.7,0-1.28-.57-1.28-1.28V0h11.67c2,0,3.62,1.62,3.62,3.62v10.4Z"/><circle fill="currentColor" cx="17.33" cy="17.33" r="1.5"/><path fill="#3b66ff" d="M9.51,5.71l.91,2.45c.03.08.09.14.17.17l2.45.91c.07.03.07.13,0,.16l-2.45.91c-.08.03-.14.09-.17.17l-.91,2.45c-.03.07-.13.07-.16,0l-.91-2.45c-.03-.08-.09-.14-.17-.17l-2.45-.91c-.07-.03-.07-.13,0-.16l2.45-.91c.08-.03.14-.09.17-.17l.91-2.45c.03-.07.13-.07.16,0Z"/></svg>';
	const ICON_CLOSE =
		'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>';

	const host = document.getElementById( 'wpie-root' ) || document.body;
	const backdrop = el( 'div', 'modal-backdrop', host );
	const dialog = el( 'div', 'dsm wpiesnd-dialog', backdrop );
	dialog.setAttribute( 'role', 'dialog' );
	dialog.setAttribute( 'aria-label', 'Soundwave Art' );
	dialog.onclick = ( e ) => e.stopPropagation();
	const head = el( 'div', 'dsm-head', dialog );
	const badge = el( 'span', 'dsm-badge', head );
	badge.innerHTML = ICON_BRAND;
	const titles = el( 'div', 'dsm-titles', head );
	const headTitleRow = el( 'div', 'dsm-title-row', titles );
	const title = el( 'span', 'dsm-title', headTitleRow );
	title.textContent = 'Soundwave Art';
	const sub = el( 'div', 'dsm-sub', titles );
	sub.textContent = editing
		? t( 'Adjust the wave, the layer updates in place.' )
		: t( 'The waveform of any audio file, as editable layers.' );
	const closeBtn = el( 'button', 'dsm-close', head );
	closeBtn.setAttribute( 'aria-label', t( 'Close' ) );
	closeBtn.innerHTML = ICON_CLOSE;
	const body = el( 'div', 'wpiesnd-body', dialog );
	const view = el( 'div', 'wpiesnd-view', body );
	const canvas = el( 'canvas', null, view );
	const videoCanvas = el( 'canvas', 'wpiesnd-videoprev', view );
	videoCanvas.style.display = 'none';
	const empty = el( 'div', 'wpiesnd-empty', view );
	empty.textContent = t(
		'Pick an audio file from the media library to start.'
	);
	const status = el( 'div', 'wpiesnd-status', view );
	const setStatus = ( text, isError ) => {
		status.textContent = text || '';
		status.className =
			'wpiesnd-status' +
			( text ? ' on' : '' ) +
			( isError ? ' err' : '' );
	};
	const side = el( 'div', 'wpiesnd-side', body );

	/* -------------------------------- audio ------------------------------ */

	const audioSec = section( side, t( 'Audio' ), 'audio' );
	const pickBtn = el( 'button', 'ai-btn secondary', audioSec );
	pickBtn.style.width = '100%';
	pickBtn.textContent = t( 'Choose audio' );
	const audioInfo = el( 'div', 'wpiesnd-coords', audioSec );

	const syncAudioInfo = () => {
		audioInfo.textContent = params.audio
			? `${ params.audio.title || '' } · ${ durationText(
					params.duration
			  ) }`.replace( /^ · /, '' )
			: '';
	};

	const trimRow = ( key, label ) => {
		const row = el( 'label', 'wpiesnd-row', audioSec );
		el( 'span', null, row ).textContent = label;
		const input = el( 'input', null, row );
		input.type = 'range';
		input.min = '0';
		input.max = '100';
		input.value = String( params[ key ] );
		const out = el( 'output', null, row );
		const sync = () => {
			out.textContent = durationText(
				( params.duration * params[ key ] ) / 100
			);
		};
		sync();
		input.oninput = () => {
			params[ key ] = parseInt( input.value, 10 );
			if ( params.trimStart > params.trimEnd - 2 ) {
				params[ key ] =
					'trimStart' === key
						? Math.max( 0, params.trimEnd - 2 )
						: Math.min( 100, params.trimStart + 2 );
				input.value = String( params[ key ] );
			}
			sync();
			refreshPeaks();
			paint();
		};
		return { input, sync };
	};
	const startCtl = trimRow( 'trimStart', t( 'Start' ) );
	const endCtl = trimRow( 'trimEnd', t( 'End' ) );

	async function loadAudio( url ) {
		setStatus( t( 'Analyzing audio' ) );
		try {
			const response = await window.fetch( url, {
				credentials: 'same-origin',
			} );
			if ( ! response.ok ) {
				throw new Error( t( 'Could not load the audio file.' ) );
			}
			const bytes = await response.arrayBuffer();
			const Ctor = window.AudioContext || window.webkitAudioContext;
			const ac = new Ctor();
			try {
				const buffer = await ac.decodeAudioData( bytes );
				params.duration = buffer.duration;
				// Keep only compact profiles; the decoded PCM of a full
				// song would hold ~100 MB hostage.
				basePeaks = computePeaks( buffer, BASE_BUCKETS );
				baseBrights = computeBrights( buffer, BASE_BUCKETS );
				if ( buffer.numberOfChannels >= 2 ) {
					basePeaksL = computePeaks( buffer, BASE_BUCKETS, 0, 1, 0 );
					basePeaksR = computePeaks( buffer, BASE_BUCKETS, 0, 1, 1 );
				} else {
					basePeaksL = null;
					basePeaksR = null;
				}
			} finally {
				ac.close();
			}
			if ( syncStereoAvail ) {
				syncStereoAvail();
			}
			refreshPeaks();
			syncAudioInfo();
			startCtl.sync();
			endCtl.sync();
			setStatus( '' );
			apply.disabled = false;
			exportBtn.disabled = false;
			previewBtn.disabled = false;
			paint();
		} catch ( e ) {
			setStatus(
				e && e.message
					? e.message
					: t( 'Could not load the audio file.' ),
				true
			);
		}
	}

	function refreshPeaks() {
		if ( ! basePeaks ) {
			peaks = null;
			peaksB = null;
			brightsArr = null;
			peaksFull = null;
			return;
		}
		const view = ( src, buckets ) =>
			computePeaks(
				{
					length: src.length,
					numberOfChannels: 1,
					getChannelData: () => src,
				},
				buckets,
				params.trimStart / 100,
				params.trimEnd / 100
			);
		const stereoOn = params.stereo && basePeaksL && basePeaksR;
		peaks = view( stereoOn ? basePeaksL : basePeaks, params.density );
		peaksB = stereoOn ? view( basePeaksR, params.density ) : null;
		// Ridgeline reads a much finer profile than the bar densities.
		peaksFull = view( basePeaks, 3200 );
		// Brightness resamples by average (max-pooling would overweight
		// single trebly hits).
		if ( baseBrights ) {
			const from = Math.floor(
				( baseBrights.length * params.trimStart ) / 100
			);
			const to = Math.max(
				from + 1,
				Math.ceil( ( baseBrights.length * params.trimEnd ) / 100 )
			);
			const span = to - from;
			brightsArr = new Float32Array( params.density );
			for ( let b = 0; b < params.density; b++ ) {
				const s0 = from + Math.floor( ( span * b ) / params.density );
				const s1 = Math.max(
					s0 + 1,
					from + Math.floor( ( span * ( b + 1 ) ) / params.density )
				);
				let sum = 0;
				for ( let i = s0; i < s1; i++ ) {
					sum += baseBrights[ i ];
				}
				brightsArr[ b ] = sum / ( s1 - s0 );
			}
		} else {
			brightsArr = null;
		}
	}

	/** What the studio hands back, in the shape this studio already uses. */
	const useAudio = ( item ) => {
		pcmBuffer = null;
		params.audio = {
			id: item.id,
			url: item.url,
			title: item.title || item.filename || '',
		};
		if ( titleInput && ! titleDirty ) {
			titleInput.value = params.audio.title;
		}
		syncAudioInfo();
		loadAudio( item.url );
	};

	pickBtn.onclick = async () => {
		// THE EDITOR'S OWN PICKER FIRST. `wp.media` is the WordPress admin
		// modal and does not exist in the standalone studio on
		// wunderpaint.com, so this button only ever showed an error there.
		// `types` takes 'audio' as readily as 'image'.
		if ( window.WPIE && window.WPIE.pickMedia ) {
			const picked = await window.WPIE.pickMedia( {
				multiple: false,
				title: t( 'Choose audio' ),
				button: t( 'Use audio' ),
				types: 'audio',
			} );
			if ( picked && picked.length ) {
				useAudio( picked[ 0 ] );
			}
			return;
		}
		if ( ! window.wp || ! window.wp.media ) {
			setStatus( t( 'Could not load the audio file.' ), true );
			return;
		}
		const frame = window.wp.media( {
			title: t( 'Choose audio' ),
			library: { type: 'audio' },
			multiple: false,
			button: { text: t( 'Use audio' ) },
		} );
		frame.on( 'select', () => {
			useAudio( frame.state().get( 'selection' ).first().toJSON() );
		} );
		frame.open();
	};

	/* -------------------------------- style ------------------------------ */

	const styleSec = section( side, t( 'Style' ), 'style' );
	const styleGrid = el( 'div', 'wpiesnd-shapes', styleSec );
	const STYLE_ICONS = {
		bars: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10.5v3" stroke-linecap="round"/>',
		line: '<path d="M2 12c2.5 0 2.5-6 5-6s2.5 9 5 9 2.5-6 5-6 2.5 3 5 3" stroke-linecap="round"/>',
		fill: '<path d="M2 12c3-7 5-7 7-3s3 7 5 4 3-8 5-4 3 3 3 3v0H2z" fill="currentColor" stroke="none"/>',
		dots: '<path d="M5 9.5v0M5 14.5v0M9 7v0M9 17v0M13 5v0M13 19v0M17 8v0M17 16v0M21 11v0M21 13v0" stroke-width="2.6" stroke-linecap="round"/>',
		pulse: '<path d="M2 12h3l2-6 3 12 3-9 2 5 2-2h5" stroke-linecap="round"/>',
		led: '<path d="M5 13.5h2M5 16.5h2M11 10.5h2M11 13.5h2M11 16.5h2M17 7.5h2M17 10.5h2M17 13.5h2M17 16.5h2" stroke-width="2.2" stroke-linecap="round"/>',
		circle: '<circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" stroke-linecap="round"/>',
		ridgeline: '<path d="M3 7c2 0 3-3 5-3s3 3 5 3 3-2 5-2 3 2 3 2M3 12c2 0 3-4 5-4s3 4 5 4 3-3 5-3 3 3 3 3M3 17c2 0 3-3 5-3s3 3 5 3 3-4 5-4 3 4 3 4" stroke-linecap="round"/>',
		spiral: '<path d="M12 12c0-1.5 2-1.5 2 0 0 2-3 2.5-4 .5-1.2-2.4 1-5 3.5-4.5 3 .5 4 4 2.5 6.5-1.8 3-6.5 3-8.5 0-2.3-3.4-.5-8 3.5-9" stroke-linecap="round"/>',
		sunburst: '<circle cx="12" cy="12" r="3"/><path d="M12 6.5V4M12 20v-2.5M6.5 12H4M20 12h-2.5M8.2 8.2 6.5 6.5M17.5 17.5l-1.7-1.7M15.8 8.2l1.7-1.7M6.5 17.5l1.7-1.7" stroke-linecap="round"/>',
		heart: '<path d="M12 19s-6-4.2-6-8.4C6 8.2 7.6 7 9.2 7c1.2 0 2.2.6 2.8 1.7C12.6 7.6 13.6 7 14.8 7 16.4 7 18 8.2 18 10.6c0 4.2-6 8.4-6 8.4z"/><path d="M12 4.5v-2M5 5.5 3.6 4.1M19 5.5l1.4-1.4" stroke-linecap="round"/>',
		hexagon: '<path d="M12 4l6.5 3.75v7.5L12 19l-6.5-3.75v-7.5z"/><path d="M12 2.5V1M20 7l1.3-.75M20 17l1.3.75" stroke-linecap="round"/>',
	};
	const styleTiles = new Map();
	for ( const [ value, label ] of [
		[ 'bars', t( 'Bars' ) ],
		[ 'line', t( 'Line' ) ],
		[ 'fill', t( 'Filled' ) ],
		[ 'dots', t( 'Dots' ) ],
		[ 'pulse', t( 'Pulse' ) ],
		[ 'led', t( 'LED' ) ],
		[ 'circle', t( 'Circle' ) ],
		[ 'ridgeline', t( 'Ridgeline' ) ],
		[ 'spiral', t( 'Spiral' ) ],
		[ 'sunburst', t( 'Sunburst' ) ],
		[ 'heart', t( 'Heartbeat' ) ],
		[ 'hexagon', t( 'Hexagon' ) ],
	] ) {
		const tile = el( 'button', 'wpiesnd-shape', styleGrid );
		tile.title = label;
		tile.setAttribute( 'aria-label', label );
		tile.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">${ STYLE_ICONS[ value ] }</svg>`;
		tile.onclick = () => {
			params.style = value;
			syncStyleSel();
			paint();
		};
		styleTiles.set( value, tile );
	}
	const syncStyleSel = () =>
		styleTiles.forEach( ( tile, id ) =>
			tile.classList.toggle( 'sel', id === params.style )
		);
	syncStyleSel();

	const sliderRow = ( parent, label, min, max, get, set, fmt ) => {
		const row = el( 'label', 'wpiesnd-row', parent );
		el( 'span', null, row ).textContent = label;
		const input = el( 'input', null, row );
		input.type = 'range';
		input.min = String( min );
		input.max = String( max );
		input.value = String( get() );
		const out = el( 'output', null, row );
		out.textContent = fmt ? fmt( get() ) : String( get() );
		input.oninput = () => {
			set( parseInt( input.value, 10 ) );
			out.textContent = fmt
				? fmt( parseInt( input.value, 10 ) )
				: input.value;
			paint();
		};
		return input;
	};
	sliderRow(
		styleSec,
		t( 'Density' ),
		40,
		240,
		() => params.density,
		( v ) => {
			params.density = v;
			refreshPeaks();
		}
	);
	sliderRow(
		styleSec,
		t( 'Amplitude' ),
		50,
		200,
		() => Math.round( params.amp * 100 ),
		( v ) => ( params.amp = v / 100 ),
		( v ) => `${ v }%`
	);
	sliderRow(
		styleSec,
		t( 'Wave height' ),
		15,
		50,
		() => params.waveHeight,
		( v ) => ( params.waveHeight = v ),
		( v ) => `${ v }%`
	);

	const checkRow = ( parent, get, set, label ) => {
		const row = el( 'label', 'wpiesnd-check', parent );
		const input = el( 'input', null, row );
		input.type = 'checkbox';
		input.checked = get();
		el( 'span', null, row ).textContent = label;
		input.onchange = () => {
			set( input.checked );
			paint();
		};
	};
	checkRow(
		styleSec,
		() => params.rounded,
		( v ) => ( params.rounded = v ),
		t( 'Rounded caps' )
	);
	checkRow(
		styleSec,
		() => params.transparentBg,
		( v ) => ( params.transparentBg = v ),
		t( 'Transparent background' )
	);

	/* ------------------------------- themes ------------------------------ */

	const themeSec = section( side, t( 'Theme' ), 'theme' );
	const themeSel = el( 'select', 'dsm-select', themeSec );
	for ( const theme of THEMES ) {
		const o = el( 'option', null, themeSel );
		o.value = theme.id;
		o.textContent = theme.label;
	}
	themeSel.onchange = () => {
		params.themeId = themeSel.value;
		params.overrides = {};
		applyBrand();
		syncColorInputs();
		paint();
	};
	const syncThemeSel = () => {
		themeSel.value = params.themeId;
	};
	const themeOf = () =>
		THEMES.find( ( th ) => th.id === params.themeId ) || THEMES[ 0 ];

	/* ------------------------------- colors ------------------------------ */

	const colorSec = section( side, t( 'Colors' ), 'colors' );
	const colorControls = {};
	const mountSwatch = bridge.components && bridge.components.mountColorButton;
	const colorRow = ( key, label ) => {
		const row = el( 'div', 'wpiesnd-row', colorSec );
		el( 'span', null, row ).textContent = label;
		const slot = el( 'span', 'wpiesnd-swatch', row );
		const onChange = ( c ) => {
			params.overrides[ key ] = c;
			syncColorInputs();
			paint();
		};
		if ( mountSwatch ) {
			colorControls[ key ] = mountSwatch( slot, {
				color: '#000000',
				title: label,
				onChange,
			} );
		} else {
			const input = el( 'input', null, slot );
			input.type = 'color';
			input.oninput = () => onChange( input.value );
			colorControls[ key ] = {
				set: ( c ) => {
					input.value = c;
				},
			};
		}
		const reset = el( 'button', 'wpiesnd-reset', row );
		reset.textContent = t( 'Auto' );
		reset.title = t( 'Back to the theme color' );
		reset.onclick = ( e ) => {
			e.preventDefault();
			delete params.overrides[ key ];
			syncColorInputs();
			paint();
		};
		return row;
	};
	colorRow( 'bg', t( 'Background' ) );
	const waveRow = colorRow( 'wave', t( 'Wave' ) );
	const waveBRow = colorRow( 'waveB', t( 'Right channel' ) );

	/* ------------------------- color mode & light ------------------------ */

	// Solid | curated gradient (incl. metallic foils) | spectral (the
	// zero-crossing brightness of the sound picks the color).
	const cmodeRow = el( 'div', 'wpiesnd-seg', colorSec );
	const modeBtns = new Map();
	for ( const [ value, label ] of [
		[ 'solid', t( 'Solid' ) ],
		[ 'gradient', t( 'Gradient' ) ],
		[ 'spectral', t( 'Sound color' ) ],
	] ) {
		const b = el( 'button', 'wpiesnd-segbtn', cmodeRow );
		b.type = 'button';
		b.textContent = label;
		b.onclick = () => {
			params.colorMode = value;
			syncColorUi();
			paint();
		};
		modeBtns.set( value, b );
	}
	const gradWrap = el( 'div', 'wpiesnd-grads', colorSec );
	const gradBtns = new Map();
	for ( const g of GRADIENTS ) {
		const b = el( 'button', 'wpiesnd-grad', gradWrap );
		b.type = 'button';
		b.title = g.label;
		b.setAttribute( 'aria-label', g.label );
		b.style.background = `linear-gradient(90deg, ${ g.stops.join( ', ' ) })`;
		b.onclick = () => {
			params.gradientId = g.id;
			if ( 'solid' === params.colorMode ) {
				params.colorMode = 'gradient';
			}
			syncColorUi();
			paint();
		};
		gradBtns.set( g.id, b );
	}
	const dirRow = el( 'label', 'wpiesnd-row', colorSec );
	el( 'span', null, dirRow ).textContent = t( 'Color flow' );
	dirRow.style.gridTemplateColumns = '78px 1fr';
	const dirSel = el( 'select', 'dsm-select', dirRow );
	for ( const [ value, label ] of [
		[ 'x', t( 'Along the wave' ) ],
		[ 'amp', t( 'By loudness' ) ],
	] ) {
		const o = el( 'option', null, dirSel );
		o.value = value;
		o.textContent = label;
	}
	dirSel.onchange = () => {
		params.gradientMap = dirSel.value;
		paint();
	};
	sliderRow(
		colorSec,
		t( 'Glow' ),
		0,
		100,
		() => params.glow,
		( v ) => ( params.glow = v )
	);
	checkRow(
		colorSec,
		() => params.reflect,
		( v ) => ( params.reflect = v ),
		t( 'Mirror reflection' )
	);
	const stereoLbl = el( 'label', 'wpiesnd-check', colorSec );
	const stereoCb = el( 'input', null, stereoLbl );
	stereoCb.type = 'checkbox';
	stereoCb.checked = !! params.stereo;
	el( 'span', null, stereoLbl ).textContent = t( 'Stereo split (L/R)' );
	stereoCb.onchange = () => {
		params.stereo = stereoCb.checked;
		refreshPeaks();
		syncColorUi();
		paint();
	};
	syncStereoAvail = () => {
		const ok = !! ( basePeaksL && basePeaksR );
		stereoCb.disabled = ! ok;
		stereoLbl.title = ok ? '' : t( 'This track is mono.' );
		if ( ! ok && params.stereo ) {
			params.stereo = false;
			stereoCb.checked = false;
			refreshPeaks();
		}
		syncColorUi();
	};
	function syncColorUi() {
		modeBtns.forEach( ( b, id ) =>
			b.classList.toggle( 'sel', id === params.colorMode )
		);
		gradBtns.forEach( ( b, id ) =>
			b.classList.toggle( 'sel', id === params.gradientId )
		);
		gradWrap.style.display =
			'solid' === params.colorMode ? 'none' : '';
		dirRow.style.display =
			'gradient' === params.colorMode ? '' : 'none';
		waveRow.style.display = 'solid' === params.colorMode ? '' : 'none';
		waveBRow.style.display = params.stereo ? '' : 'none';
		dirSel.value = params.gradientMap;
	}
	syncColorUi();

	const brandKits = ( bridge.brand
		? bridge.brand.kits()
		: window.WPIE.brandKits || []
	).filter( ( k ) => k && Array.isArray( k.colors ) && k.colors.length );
	const brandColorsFor = () => {
		if ( ! brandKits.length ) {
			return ( window.WPIE.brand && window.WPIE.brand.colors ) || [];
		}
		const chosen = brandKits.find( ( k ) => String( k.id ) === String( params.brandKitId ) ) || brandKits[ 0 ];
		return chosen.colors || [];
	};
	// Brand colors map onto every editable color (wave first, then the
	// background), not just the wave. Each brand color is used once.
	const BRAND_KEYS = [ 'wave', 'bg' ];
	const applyBrand = () => {
		if ( ! params.useBrand ) {
			return;
		}
		const c = brandColorsFor();
		BRAND_KEYS.forEach( ( key, i ) => {
			if ( c[ i ] ) {
				params.overrides[ key ] = c[ i ];
			}
		} );
	};
	if ( brandKits.length || ( ( window.WPIE.brand && window.WPIE.brand.colors ) || [] ).length ) {
		const brandLbl = el( 'label', 'wpiesnd-check', colorSec );
		const brandCb = el( 'input', null, brandLbl );
		brandCb.type = 'checkbox';
		brandCb.checked = params.useBrand;
		el( 'span', null, brandLbl ).textContent = t( 'Use brand colors' );
		brandCb.onchange = () => {
			params.useBrand = brandCb.checked;
			if ( ! params.useBrand ) {
				BRAND_KEYS.forEach( ( key ) => delete params.overrides[ key ] );
			}
			applyBrand();
			syncColorInputs();
			paint();
		};
		if ( brandKits.length > 1 ) {
			// Central kit dropdown (bridge mountKitPicker, API 2.10).
			bridge.components.mountKitPicker( el( 'div', null, colorSec ), {
				value: params.brandKitId || brandKits[ 0 ].id,
				onChange: ( id ) => {
					params.brandKitId = id;
					params.useBrand = true;
					brandCb.checked = true;
					applyBrand();
					syncColorInputs();
					paint();
				},
			} );
		}
	}

	const syncColorInputs = () => {
		const pal = wavePalette( themeOf(), params.overrides );
		colorControls.bg.set( pal.bg );
		colorControls.wave.set( pal.wave );
		if ( colorControls.waveB ) {
			colorControls.waveB.set(
				params.overrides.waveB || stopColor( [ pal.wave, pal.bg ], 0.45 )
			);
		}
	};

	// Typography.
	const fontSec = section( side, t( 'Typography' ), 'font' );
	// Central font picker (bridge API 2.9); the plain select stays as
	// the fallback on older editors (default family: Montserrat).
	if ( bridge.components && bridge.components.mountFontPicker ) {
		bridge.components.mountFontPicker( el( 'div', null, fontSec ), {
			value: params.font || 'Montserrat',
			onChange: ( fam ) => {
				params.font = 'Montserrat' === fam ? '' : fam;
				if ( params.font && bridge.fonts && bridge.fonts.ensureFont ) {
					bridge.fonts.ensureFont( params.font ).then( paint ).catch( paint );
				} else {
					paint();
				}
			},
		} );
	} else {
		const fontSel = el( 'select', 'dsm-select', fontSec );
		const fontFamilies = ( () => {
			if ( bridge.fonts && bridge.fonts.listFamilies ) {
				try {
					const l = bridge.fonts.listFamilies();
					if ( l && l.length ) {
						return l;
					}
				} catch ( e ) {}
			}
			return [ 'Montserrat', 'Inter', 'Playfair Display', 'Georgia' ];
		} )();
		{
			const oDef = el( 'option', null, fontSel );
			oDef.value = '';
			oDef.textContent = t( 'Default (Montserrat)' );
		}
		for ( const fam of fontFamilies ) {
			const o = el( 'option', null, fontSel );
			o.value = fam;
			o.textContent = fam;
		}
		fontSel.value = params.font || '';
		fontSel.onchange = () => {
			params.font = fontSel.value;
			if ( params.font && bridge.fonts && bridge.fonts.ensureFont ) {
				bridge.fonts.ensureFont( params.font ).then( paint ).catch( paint );
			} else {
				paint();
			}
		};
	}

	/* -------------------------------- shape ------------------------------ */

	const shapeSec = section( side, t( 'Shape' ), 'shape' );
	const shapeGrid = el( 'div', 'wpiesnd-shapes', shapeSec );
	const SHAPE_ICONS = {
		none: '<rect x="3" y="9" width="18" height="6" rx="1"/>',
		square: '<rect x="4.5" y="4.5" width="15" height="15" rx="1"/>',
		squircle: '<rect x="4.5" y="4.5" width="15" height="15" rx="5.5"/>',
		circle: '<circle cx="12" cy="12" r="8"/>',
		heart: '<path d="M12 19.5C6.6 15 4.4 12.2 4.4 9.1 4.4 6.5 6.3 4.6 8.7 4.6c1.4 0 2.6.7 3.3 1.9.7-1.2 1.9-1.9 3.3-1.9 2.4 0 4.3 1.9 4.3 4.5 0 3.1-2.2 5.9-7.6 10.4z"/>',
		hex: '<path d="M12 3.5l7.4 4.2v8.6L12 20.5l-7.4-4.2V7.7z"/>',
	};
	const shapeTiles = new Map();
	for ( const [ value, label ] of [
		[ 'none', t( 'Strip' ) ],
		[ 'square', t( 'Square' ) ],
		[ 'squircle', t( 'Rounded' ) ],
		[ 'circle', t( 'Circle' ) ],
		[ 'heart', t( 'Heart' ) ],
		[ 'hex', t( 'Hexagon' ) ],
	] ) {
		const tile = el( 'button', 'wpiesnd-shape', shapeGrid );
		tile.title = label;
		tile.setAttribute( 'aria-label', label );
		tile.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">${ SHAPE_ICONS[ value ] }</svg>`;
		tile.onclick = () => {
			params.mask = value;
			syncShapeSel();
			syncVideoBg();
			paint();
		};
		shapeTiles.set( value, tile );
	}
	const syncShapeSel = () =>
		shapeTiles.forEach( ( tile, id ) =>
			tile.classList.toggle( 'sel', id === params.mask )
		);
	syncShapeSel();

	/* ----------------------------- text block ---------------------------- */

	let titleInput = null;
	let subtitleInput = null;
	let layoutSelect = null;
	let durationCheck = null;
	if ( ! editing ) {
		const textSec = section( side, t( 'Text block' ), 'text' );
		const layoutRow = el( 'label', 'wpiesnd-row', textSec );
		el( 'span', null, layoutRow ).textContent = t( 'Layout' );
		layoutRow.style.gridTemplateColumns = '78px 1fr';
		layoutSelect = el( 'select', 'dsm-select', layoutRow );
		for ( const [ value, label ] of [
			[ 'classic', t( 'Classic poster' ) ],
			[ 'player', t( 'Player card' ) ],
			[ 'none', t( 'No text' ) ],
		] ) {
			const opt = el( 'option', null, layoutSelect );
			opt.value = value;
			opt.textContent = label;
		}
		layoutSelect.value = params.textLayout;
		layoutSelect.onchange = () => {
			params.textLayout = layoutSelect.value;
			paint();
		};

		const titleRow = el( 'label', 'wpiesnd-text-row', textSec );
		el( 'span', null, titleRow ).textContent = t( 'Title' );
		titleInput = el( 'input', null, titleRow );
		titleInput.type = 'text';
		titleInput.oninput = () => {
			titleDirty = true;
			paint();
		};

		const subtitleRow = el( 'label', 'wpiesnd-text-row', textSec );
		el( 'span', null, subtitleRow ).textContent = t( 'Subtitle' );
		subtitleInput = el( 'input', null, subtitleRow );
		subtitleInput.type = 'text';
		subtitleInput.placeholder = t( 'e.g. Our song' );
		subtitleInput.oninput = () => paint();

		const sizeRow2 = el( 'label', 'wpiesnd-row', textSec );
		el( 'span', null, sizeRow2 ).textContent = t( 'Text size' );
		const sizeInput2 = el( 'input', null, sizeRow2 );
		sizeInput2.type = 'range';
		sizeInput2.min = '60';
		sizeInput2.max = '160';
		sizeInput2.value = String( Math.round( params.textScale * 100 ) );
		const sizeOut2 = el( 'output', null, sizeRow2 );
		sizeOut2.textContent = `${ sizeInput2.value }%`;
		sizeInput2.oninput = () => {
			params.textScale = parseInt( sizeInput2.value, 10 ) / 100;
			sizeOut2.textContent = `${ sizeInput2.value }%`;
			paint();
		};

		const durRow = el( 'label', 'wpiesnd-check', textSec );
		durationCheck = el( 'input', null, durRow );
		durationCheck.type = 'checkbox';
		durationCheck.checked = true;
		durationCheck.onchange = () => paint();
		el( 'span', null, durRow ).textContent = t( 'Duration line' );
	}

	/* -------------------------------- video ------------------------------ */

	const videoSec = section( side, t( 'Video' ), 'video' );
	const resRow = el( 'label', 'wpiesnd-row', videoSec );
	el( 'span', null, resRow ).textContent = t( 'Format' );
	resRow.style.gridTemplateColumns = '78px 1fr';
	const resSelect = el( 'select', 'dsm-select', resRow );
	for ( const [ value, label ] of [
		[ '1080x1080', '1:1 (1080)' ],
		[ '1920x1080', '16:9 (1080p)' ],
		[ '1080x1920', '9:16 (1080)' ],
	] ) {
		const opt = el( 'option', null, resSelect );
		opt.value = value;
		opt.textContent = label;
	}
	resSelect.value = params.videoRes;
	resSelect.onchange = () => {
		params.videoRes = resSelect.value;
	};
	const modeRow = el( 'label', 'wpiesnd-row', videoSec );
	el( 'span', null, modeRow ).textContent = t( 'Animation' );
	modeRow.style.gridTemplateColumns = '78px 1fr';
	const modeSelect = el( 'select', 'dsm-select', modeRow );
	for ( const [ value, label ] of [
		[ 'equalizer', t( 'Equalizer' ) ],
		[ 'progress', t( 'Progress' ) ],
		[ 'scroll', t( 'Scrolling' ) ],
	] ) {
		const opt = el( 'option', null, modeSelect );
		opt.value = value;
		opt.textContent = label;
	}
	modeSelect.value = params.videoMode;
	modeSelect.onchange = () => {
		params.videoMode = modeSelect.value;
	};
	const vidTextRow = el( 'label', 'wpiesnd-check', videoSec );
	const vidTextCheck = el( 'input', null, vidTextRow );
	vidTextCheck.type = 'checkbox';
	vidTextCheck.checked = !! params.videoText;
	vidTextCheck.onchange = () => {
		params.videoText = vidTextCheck.checked;
	};
	el( 'span', null, vidTextRow ).textContent = t( 'Include title text' );
	const vidBgRow = el( 'div', 'wpiesnd-row', videoSec );
	el( 'span', null, vidBgRow ).textContent = t( 'Video background' );
	const vidBgSlot = el( 'span', 'wpiesnd-swatch', vidBgRow );
	let vidBgCtl = null;
	const resolvedVideoBg = () => {
		const pal = wavePalette( themeOf(), params.overrides );
		if ( params.videoBg ) {
			return params.videoBg;
		}
		return 'none' === params.mask ? pal.bg : autoContrast( pal.bg );
	};
	const syncVideoBg = () => {
		if ( vidBgCtl ) {
			vidBgCtl.set( resolvedVideoBg() );
		}
	};
	if ( mountSwatch ) {
		vidBgCtl = mountSwatch( vidBgSlot, {
			color: '#000000',
			title: t( 'Video background' ),
			onChange: ( c ) => {
				params.videoBg = c;
				syncVideoBg();
			},
		} );
	} else {
		const input = el( 'input', null, vidBgSlot );
		input.type = 'color';
		input.oninput = () => {
			params.videoBg = input.value;
		};
		vidBgCtl = {
			set: ( c ) => {
				input.value = c;
			},
		};
	}
	syncVideoBg();
	const vidBgReset = el( 'button', 'wpiesnd-reset', vidBgRow );
	vidBgReset.textContent = t( 'Auto' );
	vidBgReset.onclick = ( e ) => {
		e.preventDefault();
		params.videoBg = null;
		syncVideoBg();
	};
	const previewBtn = el( 'button', 'ai-btn secondary', videoSec );
	previewBtn.style.width = '100%';
	previewBtn.style.marginBottom = '6px';
	previewBtn.textContent = t( 'Play preview' );
	previewBtn.disabled = true;
	const exportBtn = el( 'button', 'ai-btn secondary', videoSec );
	exportBtn.style.width = '100%';
	exportBtn.textContent = t( 'Export video' );
	exportBtn.disabled = true;
	const exportCancelBtn = el( 'button', 'wpiesnd-reset', videoSec );
	exportCancelBtn.textContent = t( 'Cancel export' );
	exportCancelBtn.style.display = 'none';
	const vidNote = el( 'div', 'wpiesnd-coords', videoSec );
	vidNote.textContent = t(
		'Keep this tab in the foreground while recording.'
	);

	/** basePeaks window (already 0..1 globally) WITHOUT re-normalizing. */
	function resamplePeaks( from01, to01, buckets ) {
		const out = new Float32Array( buckets );
		const a = Math.max( 0, Math.floor( basePeaks.length * from01 ) );
		const b = Math.min(
			basePeaks.length,
			Math.ceil( basePeaks.length * to01 )
		);
		const span = Math.max( 1, b - a );
		for ( let i = 0; i < buckets; i++ ) {
			const s0 = a + Math.floor( ( span * i ) / buckets );
			const s1 = Math.max(
				s0 + 1,
				a + Math.floor( ( span * ( i + 1 ) ) / buckets )
			);
			let peak = 0;
			for ( let s = s0; s < s1; s++ ) {
				if ( basePeaks[ s ] > peak ) {
					peak = basePeaks[ s ];
				}
			}
			out[ i ] = peak;
		}
		return out;
	}

	/**
	 * Real-time spectrum for the equalizer mode: log-spaced frequency
	 * bands (50 Hz to 11 kHz) from an AnalyserNode, as 0..1 bar values.
	 */
	function makeFreqMapper( ac, analyser, bars ) {
		const buf = new window.Uint8Array( analyser.frequencyBinCount );
		const binHz = ac.sampleRate / analyser.fftSize;
		const fMin = 50;
		const fMax = 11000;
		const ranges = [];
		for ( let i = 0; i < bars; i++ ) {
			const f0 = fMin * Math.pow( fMax / fMin, i / bars );
			const f1 = fMin * Math.pow( fMax / fMin, ( i + 1 ) / bars );
			const b0 = Math.max( 1, Math.floor( f0 / binHz ) );
			ranges.push( [ b0, Math.max( b0 + 1, Math.ceil( f1 / binHz ) ) ] );
		}
		return () => {
			analyser.getByteFrequencyData( buf );
			const out = new Float32Array( bars );
			for ( let i = 0; i < bars; i++ ) {
				let sum = 0;
				for ( let b = ranges[ i ][ 0 ]; b < ranges[ i ][ 1 ]; b++ ) {
					sum += buf[ b ];
				}
				out[ i ] = sum / ( ranges[ i ][ 1 ] - ranges[ i ][ 0 ] ) / 255;
			}
			return out;
		};
	}

	// Equalizer + ridgeline: a rolling waterfall of past spectrum frames
	// (each ridge row = one moment), so the mountain field flows with the
	// music instead of slicing one live frame into meaningless rows.
	const RIDGE_ROWS = 24;
	const RIDGE_COLS = 90;
	let ridgeHist = [];
	let ridgeHistAt = 0;
	function ridgeWaterfall( liveWave, nowMs ) {
		if ( ! ridgeHist.length || nowMs - ridgeHistAt > 66 ) {
			ridgeHistAt = nowMs;
			const row = new Float32Array( RIDGE_COLS );
			for ( let i = 0; i < RIDGE_COLS; i++ ) {
				row[ i ] =
					liveWave[
						Math.floor( ( i / RIDGE_COLS ) * liveWave.length )
					] || 0;
			}
			ridgeHist.push( row );
			if ( ridgeHist.length > RIDGE_ROWS ) {
				ridgeHist.shift();
			}
		}
		const full = new Float32Array( RIDGE_ROWS * RIDGE_COLS );
		const off = RIDGE_ROWS - ridgeHist.length;
		ridgeHist.forEach( ( f, i ) => full.set( f, ( off + i ) * RIDGE_COLS ) );
		return full;
	}

	function renderVideoFrame( ctx, W, H, progress, spanSec, liveWave ) {
		const pal = wavePalette( themeOf(), params.overrides );
		const stage = resolvedVideoBg();
		const uiText = textOn( stage, pal.text );
		ctx.fillStyle = stage;
		ctx.fillRect( 0, 0, W, H );
		const titleText =
			( titleInput && titleInput.value.trim() ) ||
			( params.audio && params.audio.title ) ||
			'';
		const subText = ( subtitleInput && subtitleInput.value.trim() ) || '';
		const withText = params.videoText && !! titleText;
		let waveTop = H * 0.22;
		let waveH = H * 0.56;
		if ( withText ) {
			const titleFs = Math.round(
				Math.min( W * 0.045, H * 0.09 ) * ( params.textScale || 1 )
			);
			ctx.fillStyle = uiText;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'top';
			ctx.font = `700 ${ titleFs }px ${ params.font || 'Montserrat' }, sans-serif`;
			ctx.fillText( titleText.toUpperCase(), W / 2, H * 0.08 );
			if ( subText ) {
				const subFs = Math.round( titleFs * 0.42 );
				ctx.globalAlpha = 0.75;
				ctx.font = `400 ${ subFs }px Inter, sans-serif`;
				ctx.fillText(
					subText.toUpperCase(),
					W / 2,
					H * 0.08 + titleFs * 1.5
				);
				ctx.globalAlpha = 1;
			}
			waveTop = H * 0.3;
			waveH = H * 0.44;
		}
		const tS = params.trimStart / 100;
		const tE = params.trimEnd / 100;
		// Shape masks render as a centered square tile filled with the
		// theme background - the stage color keeps the shape visible.
		const shaped = 'none' !== params.mask;
		const waveW = shaped ? Math.min( W * 0.86, waveH ) : W * 0.86;
		const tileH = shaped ? waveW : waveH;
		const waveX = ( W - waveW ) / 2;
		const tileTop = waveTop + ( waveH - tileH ) / 2;
		ctx.save();
		ctx.translate( waveX, tileTop );
		maskPathOn( ctx, params.mask, waveW, tileH );
		ctx.clip();
		ctx.fillStyle = pal.bg;
		ctx.fillRect( 0, 0, waveW, tileH );
		waveH = tileH;
		if ( 'equalizer' === params.videoMode && liveWave ) {
			// Bars dance to the music, in whatever wave style is active.
			// The live analyser is mono - drop the static stereo half AND
			// the static full-song profile, or ridgeline would ignore the
			// live data and freeze. Ridgeline gets its waterfall history.
			drawWave( ctx, waveW, waveH, {
				...waveOpts(),
				peaks: liveWave,
				peaksB: null,
				peaksFull:
					'ridgeline' === params.style
						? ridgeWaterfall( liveWave, window.performance.now() )
						: null,
				mask: 'none',
				transparentBg: true,
			} );
		} else if ( 'scroll' === params.videoMode ) {
			const windowFrac = 0.24;
			const half = windowFrac / 2;
			const c = Math.min( 1 - half, Math.max( half, progress ) );
			const win = resamplePeaks(
				tS + ( tE - tS ) * ( c - half ),
				tS + ( tE - tS ) * ( c + half ),
				params.density
			);
			// The scrolling window is cut from the mono profile only; for
			// ridgeline the window keeps its full resolution so the fine
			// mountains scroll instead of degrading to coarse triangles.
			drawWave( ctx, waveW, waveH, {
				...waveOpts(),
				peaks: win,
				peaksB: null,
				peaksFull:
					'ridgeline' === params.style
						? resamplePeaks(
								tS + ( tE - tS ) * ( c - half ),
								tS + ( tE - tS ) * ( c + half ),
								3200
						  )
						: null,
				mask: 'none',
				transparentBg: true,
			} );
			ctx.strokeStyle = pal.text;
			ctx.globalAlpha = 0.7;
			ctx.lineWidth = Math.max( 2, W * 0.002 );
			ctx.beginPath();
			ctx.moveTo( waveW / 2, 0 );
			ctx.lineTo( waveW / 2, waveH );
			ctx.stroke();
			ctx.globalAlpha = 1;
		} else if ( 'progress' === params.videoMode || ! liveWave ) {
			const px = waveW * progress;
			ctx.globalAlpha = 0.3;
			drawWave( ctx, waveW, waveH, {
				...waveOpts(),
				mask: 'none',
				transparentBg: true,
			} );
			ctx.globalAlpha = 1;
			ctx.save();
			ctx.beginPath();
			ctx.rect( 0, 0, px, waveH );
			ctx.clip();
			drawWave( ctx, waveW, waveH, {
				...waveOpts(),
				mask: 'none',
				transparentBg: true,
			} );
			ctx.restore();
			ctx.strokeStyle = pal.text;
			ctx.globalAlpha = 0.7;
			ctx.lineWidth = Math.max( 2, W * 0.002 );
			ctx.beginPath();
			ctx.moveTo( px, 0 );
			ctx.lineTo( px, waveH );
			ctx.stroke();
			ctx.globalAlpha = 1;
		}
		ctx.restore();
		// Live timecode, bottom right.
		const tcFs = Math.round( Math.min( W, H ) * 0.028 );
		ctx.globalAlpha = 0.7;
		ctx.fillStyle = uiText;
		ctx.textAlign = 'right';
		ctx.textBaseline = 'bottom';
		ctx.font = `400 ${ tcFs }px Inter, sans-serif`;
		ctx.fillText(
			`${ durationText( progress * spanSec ) } / ${ durationText(
				spanSec
			) }`,
			W - W * 0.04,
			H - H * 0.05
		);
		ctx.globalAlpha = 1;
	}

	// The decoded PCM is heavy (a full song ~100 MB): fetched lazily on
	// first preview/export, shared by both, dropped when the dialog closes.
	let pcmBuffer = null;

	async function ensurePcm() {
		if ( pcmBuffer ) {
			return pcmBuffer;
		}
		setStatus( t( 'Preparing audio' ) );
		const response = await window.fetch( params.audio.url, {
			credentials: 'same-origin',
		} );
		if ( ! response.ok ) {
			throw new Error( t( 'Could not load the audio file.' ) );
		}
		const bytes = await response.arrayBuffer();
		const Ctor = window.AudioContext || window.webkitAudioContext;
		const ac = new Ctor();
		try {
			pcmBuffer = await ac.decodeAudioData( bytes );
		} finally {
			ac.close();
		}
		setStatus( '' );
		return pcmBuffer;
	}

	let previewStop = null;

	async function playPreview() {
		if ( previewStop ) {
			previewStop();
			return;
		}
		if ( ! basePeaks || ! params.audio ) {
			setStatus( t( 'Pick an audio file first.' ), true );
			return;
		}
		previewBtn.disabled = true;
		try {
			const buffer = await ensurePcm();
			const spanSec =
				( ( params.trimEnd - params.trimStart ) / 100 ) *
				params.duration;
			const [ W, H ] = params.videoRes
				.split( 'x' )
				.map( ( v ) => parseInt( v, 10 ) );
			// Half resolution is plenty for the preview and keeps the
			// per-frame cost low.
			videoCanvas.width = Math.round( W / 2 );
			videoCanvas.height = Math.round( H / 2 );
			const vctx = videoCanvas.getContext( '2d' );
			canvas.style.display = 'none';
			videoCanvas.style.display = '';
			const Ctor = window.AudioContext || window.webkitAudioContext;
			const ac = new Ctor();
			const source = ac.createBufferSource();
			source.buffer = buffer;
			ridgeHist = []; // fresh waterfall history per run
			const analyser = ac.createAnalyser();
			analyser.fftSize = 2048;
			analyser.smoothingTimeConstant = 0.82;
			source.connect( analyser );
			analyser.connect( ac.destination );
			const readFreq = makeFreqMapper(
				ac,
				analyser,
				Math.min( params.density, 96 )
			);
			const t0 = ac.currentTime + 0.05;
			source.start(
				t0,
				( params.trimStart / 100 ) * params.duration,
				spanSec
			);
			let running = true;
			const cleanup = () => {
				if ( ! running ) {
					return;
				}
				running = false;
				try {
					source.stop();
				} catch ( err ) {}
				ac.close();
				previewStop = null;
				previewBtn.textContent = t( 'Play preview' );
				previewBtn.disabled = false;
				videoCanvas.style.display = 'none';
				canvas.style.display = '';
				paint();
			};
			previewStop = cleanup;
			source.onended = cleanup;
			previewBtn.textContent = t( 'Stop preview' );
			previewBtn.disabled = false;
			const tick = () => {
				if ( ! running ) {
					return;
				}
				const progress = Math.max(
					0,
					Math.min( 1, ( ac.currentTime - t0 ) / spanSec )
				);
				renderVideoFrame(
					vctx,
					videoCanvas.width,
					videoCanvas.height,
					progress,
					spanSec,
					readFreq()
				);
				window.requestAnimationFrame( tick );
			};
			window.requestAnimationFrame( tick );
		} catch ( e ) {
			previewBtn.disabled = false;
			setStatus(
				e && e.message
					? e.message
					: t( 'Could not load the audio file.' ),
				true
			);
		}
	}
	previewBtn.onclick = playPreview;

	let exportAbort = null;

	async function exportVideo() {
		if ( ! basePeaks || ! params.audio ) {
			setStatus( t( 'Pick an audio file first.' ), true );
			return;
		}
		const spanSec =
			( ( params.trimEnd - params.trimStart ) / 100 ) * params.duration;
		if ( spanSec > 300 ) {
			setStatus(
				t( 'Clips longer than 5 minutes are not supported.' ),
				true
			);
			return;
		}
		const mime = [
			'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
			'video/mp4',
			'video/webm;codecs=vp9,opus',
			'video/webm',
		].find(
			( m ) =>
				window.MediaRecorder &&
				window.MediaRecorder.isTypeSupported( m )
		);
		if ( ! mime || ! window.HTMLCanvasElement.prototype.captureStream ) {
			setStatus(
				t( 'Video recording is not supported in this browser.' ),
				true
			);
			return;
		}
		if ( previewStop ) {
			previewStop();
		}
		exportBtn.disabled = true;
		exportCancelBtn.style.display = '';
		let ac = null;
		try {
			const buffer = await ensurePcm();
			const Ctor = window.AudioContext || window.webkitAudioContext;
			ac = new Ctor();

			const [ W, H ] = params.videoRes
				.split( 'x' )
				.map( ( v ) => parseInt( v, 10 ) );
			const vidCanvas = document.createElement( 'canvas' );
			vidCanvas.width = W;
			vidCanvas.height = H;
			const vctx = vidCanvas.getContext( '2d' );
			renderVideoFrame( vctx, W, H, 0, spanSec );

			const stream = vidCanvas.captureStream( 30 );
			const dest = ac.createMediaStreamDestination();
			const source = ac.createBufferSource();
			source.buffer = buffer;
			ridgeHist = []; // fresh waterfall history per run
			const analyser = ac.createAnalyser();
			analyser.fftSize = 2048;
			analyser.smoothingTimeConstant = 0.82;
			source.connect( analyser );
			analyser.connect( dest );
			analyser.connect( ac.destination );
			const readFreq = makeFreqMapper(
				ac,
				analyser,
				Math.min( params.density, 96 )
			);
			for ( const track of dest.stream.getAudioTracks() ) {
				stream.addTrack( track );
			}
			const recorder = new window.MediaRecorder( stream, {
				mimeType: mime,
				videoBitsPerSecond: 6000000,
			} );
			const chunks = [];
			recorder.ondataavailable = ( e ) => {
				if ( e.data && e.data.size ) {
					chunks.push( e.data );
				}
			};
			const done = new Promise( ( resolve ) => {
				recorder.onstop = resolve;
			} );
			let cancelled = false;
			exportAbort = () => {
				cancelled = true;
				try {
					source.stop();
				} catch ( err ) {}
				try {
					recorder.stop();
				} catch ( err ) {}
			};

			const offset = ( params.trimStart / 100 ) * params.duration;
			recorder.start( 250 );
			const t0 = ac.currentTime + 0.05;
			source.start( t0, offset, spanSec );
			let running = true;
			source.onended = () => {
				running = false;
				try {
					recorder.stop();
				} catch ( err ) {}
			};
			const tick = () => {
				if ( ! running ) {
					return;
				}
				const progress = Math.max(
					0,
					Math.min( 1, ( ac.currentTime - t0 ) / spanSec )
				);
				renderVideoFrame( vctx, W, H, progress, spanSec, readFreq() );
				setStatus(
					`${ t( 'Recording video' ) } ${ Math.round(
						progress * 100
					) }%`
				);
				window.requestAnimationFrame( tick );
			};
			window.requestAnimationFrame( tick );
			await done;
			running = false;
			if ( cancelled ) {
				setStatus( '' );
				return;
			}
			const blob = new window.Blob( chunks, { type: mime } );
			setStatus( t( 'Rendering the wave' ) );
			const saved = await uploadVideo( blob, mime );
			setStatus( t( 'Video saved to the media library.' ) );
			if ( extras && extras.toasts && extras.toasts.success ) {
				extras.toasts.success(
					t( 'Video saved to the media library.' )
				);
			}
			return saved;
		} catch ( e ) {
			setStatus(
				e && e.message ? e.message : t( 'Could not save the video.' ),
				true
			);
		} finally {
			if ( ac ) {
				ac.close();
			}
			exportAbort = null;
			exportBtn.disabled = ! basePeaks;
			exportCancelBtn.style.display = 'none';
		}
	}
	exportBtn.onclick = exportVideo;
	exportCancelBtn.onclick = () => {
		if ( exportAbort ) {
			exportAbort();
		}
	};

	async function uploadVideo( blob, mime ) {
		const boot = window.WPIE || {};
		const mediaUrl = String( boot.restUrl || '' ).replace(
			/wpie\/v1\/?$/,
			'wp/v2/media'
		);
		const titleText =
			( titleInput && titleInput.value.trim() ) ||
			( params.audio && params.audio.title ) ||
			'audiogram';
		const ext = mime.indexOf( 'mp4' ) > -1 ? 'mp4' : 'webm';
		const slug =
			titleText
				.toLowerCase()
				.replace( /[^a-z0-9]+/g, '-' )
				.replace( /^-+|-+$/g, '' ) || 'audiogram';
		const fd = new window.FormData();
		fd.append(
			'file',
			new window.File( [ blob ], `${ slug }.${ ext }`, { type: mime } )
		);
		fd.append( 'title', titleText );
		const res = await window.fetch( mediaUrl, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'X-WP-Nonce': boot.nonce || '' },
			body: fd,
		} );
		if ( ! res.ok ) {
			throw new Error( t( 'Could not save the video.' ) );
		}
		return res.json();
	}

	/* ------------------------------- footer ------------------------------ */

	const foot = el( 'div', 'dsm-foot', dialog );
	const footHint = el( 'div', 'dsm-hint', foot );
	footHint.textContent = t(
		'The audio is analyzed locally in your browser.'
	);
	const actions = el( 'div', 'dsm-actions', foot );
	const cancelBtn = el( 'button', 'ai-btn secondary', actions );
	cancelBtn.textContent = t( 'Cancel' );
	cancelBtn.onclick = () => close();
	const apply = el( 'button', 'ai-btn primary', actions );
	apply.textContent = editing
		? t( 'Update Soundwave' )
		: t( 'Insert Soundwave' );
	apply.disabled = true;

	/* ----------------------------- layout + paint ------------------------ */

	// Styles that want a square tile instead of the wide strip - the
	// radial ones plus ridgeline (the album-cover mountain field).
	const SQUARE_STYLES = [ 'circle', 'spiral', 'sunburst', 'heart', 'hexagon', 'ridgeline' ];

	function waveRectFor( docW, docH, withText ) {
		const square =
			SQUARE_STYLES.includes( params.style ) || 'none' !== params.mask;
		if ( square ) {
			// Same sizing rule as the sibling posters: the text block
			// below always fits. The Wave height slider scales the tile
			// (default 30 = the classic size, so old posters keep theirs).
			const base = Math.min(
				docW * 0.86,
				docH * ( withText ? 0.62 : 0.86 )
			);
			const cap = Math.min(
				docW * 0.92,
				docH * ( withText ? 0.66 : 0.92 )
			);
			const factor = Math.min(
				1.15,
				Math.max( 0.55, ( params.waveHeight || 30 ) / 30 )
			);
			const size = Math.round( Math.min( base * factor, cap ) );
			return {
				x: Math.round( ( docW - size ) / 2 ),
				y: withText
					? Math.round( docH * 0.06 )
					: Math.round( ( docH - size ) / 2 ),
				w: size,
				h: size,
			};
		}
		const w = Math.round( docW * 0.86 );
		const h = Math.min(
			Math.round( ( docW * params.waveHeight ) / 100 ),
			Math.round( docH * ( withText ? 0.5 : 0.86 ) )
		);
		const x = Math.round( ( docW - w ) / 2 );
		const y = withText
			? Math.round( docH * 0.06 + Math.max( 0, ( docH * 0.56 - h ) / 2 ) )
			: Math.round( ( docH - h ) / 2 );
		return { x, y, w, h };
	}

	function layoutPoster( docW, docH ) {
		const ts = params.textScale || 1;
		const pal = wavePalette( themeOf(), params.overrides );
		const layout = editing ? 'none' : params.textLayout;
		const titleText = ( titleInput && titleInput.value.trim() ) || '';
		const subText = ( subtitleInput && subtitleInput.value.trim() ) || '';
		const withText = 'none' !== layout && !! titleText;
		const rect = waveRectFor( docW, docH, withText );

		const items = [];
		const text = ( spec ) => items.push( { kind: 'text', ...spec } );
		if ( withText && 'player' === layout ) {
			// The music-player card: progress line with a dot, elapsed and
			// total time, then title and subtitle left-aligned - all as
			// editable layers, like a paused song turned into a poster.
			const span =
				( ( params.trimEnd - params.trimStart ) / 100 ) *
				( params.duration || 0 );
			const at = 0.38; // the "paused at" position
			const trackY = rect.y + rect.h + Math.round( docH * 0.05 );
			const trackH = Math.max( 3, Math.round( docH * 0.0045 ) );
			const dotR = Math.max( trackH * 1.9, Math.round( docH * 0.008 ) );
			items.push( {
				kind: 'rect',
				name: t( 'Progress track' ),
				x: rect.x,
				y: trackY,
				w: rect.w,
				h: trackH,
				fill: hexMix( pal.text, pal.bg, 0.68 ),
			} );
			items.push( {
				kind: 'rect',
				name: t( 'Progress' ),
				x: rect.x,
				y: trackY,
				w: Math.round( rect.w * at ),
				h: trackH,
				fill: pal.text,
			} );
			items.push( {
				kind: 'dot',
				name: t( 'Progress dot' ),
				x: Math.round( rect.x + rect.w * at - dotR ),
				y: Math.round( trackY + trackH / 2 - dotR ),
				w: dotR * 2,
				h: dotR * 2,
				fill: pal.text,
			} );
			const timeFs = Math.round( docW * 0.018 * ts );
			let y = trackY + trackH + Math.round( docH * 0.012 );
			if ( span ) {
				text( {
					name: t( 'Elapsed' ),
					text: durationText( span * at ),
					x: rect.x,
					y,
					w: Math.round( rect.w / 2 ),
					h: Math.round( timeFs * 1.4 ),
					fontSize: timeFs,
					fontFamily: 'Inter',
					weight: 400,
					color: hexMix( pal.text, pal.bg, 0.35 ),
					align: 'left',
					letterSpacing: 0,
				} );
				text( {
					name: t( 'Duration' ),
					text: durationText( span ),
					x: rect.x + Math.round( rect.w / 2 ),
					y,
					w: Math.round( rect.w / 2 ),
					h: Math.round( timeFs * 1.4 ),
					fontSize: timeFs,
					fontFamily: 'Inter',
					weight: 400,
					color: hexMix( pal.text, pal.bg, 0.35 ),
					align: 'right',
					letterSpacing: 0,
				} );
				y += Math.round( timeFs * 1.9 );
			}
			const titleFs = Math.round(
				Math.min( docW * 0.052, docH * 0.06 ) * ts
			);
			y += Math.round( docH * 0.015 );
			text( {
				name: t( 'Title' ),
				text: titleText,
				x: rect.x,
				y,
				w: rect.w,
				h: Math.round( titleFs * 1.25 ),
				fontSize: titleFs,
				fontFamily: params.font || 'Montserrat',
				weight: 700,
				color: pal.text,
				align: 'left',
				letterSpacing: 0,
			} );
			y += Math.round( titleFs * 1.45 );
			if ( subText ) {
				const subFs = Math.round( titleFs * 0.52 );
				text( {
					name: t( 'Subtitle' ),
					text: subText,
					x: rect.x,
					y,
					w: rect.w,
					h: Math.round( subFs * 1.4 ),
					fontSize: subFs,
					fontFamily: 'Inter',
					weight: 400,
					color: hexMix( pal.text, pal.bg, 0.3 ),
					align: 'left',
					letterSpacing: 0,
				} );
			}
			return { rect, items };
		}
		if ( withText ) {
			const titleFs = Math.round(
				Math.min( docW * 0.07, docH * 0.08 ) * ts
			);
			let y = rect.y + rect.h + Math.round( docH * 0.05 );
			text( {
				name: t( 'Title' ),
				text: titleText.toUpperCase(),
				x: 0,
				y,
				w: docW,
				h: Math.round( titleFs * 1.25 ),
				fontSize: titleFs,
				fontFamily: params.font || 'Montserrat',
				weight: 700,
				color: pal.text,
				align: 'center',
				letterSpacing: Math.round( titleFs * 0.14 ),
			} );
			y += Math.round( titleFs * 1.5 );
			items.push( {
				kind: 'rect',
				name: t( 'Divider' ),
				x: Math.round( docW / 2 - docW * 0.05 ),
				y,
				w: Math.round( docW * 0.1 ),
				h: Math.max( 2, Math.round( docH * 0.0035 ) ),
				fill: pal.text,
			} );
			y += Math.round( docH * 0.02 );
			const subFs = Math.round( docW * 0.023 * ts );
			if ( subText ) {
				text( {
					name: t( 'Subtitle' ),
					text: subText.toUpperCase(),
					x: 0,
					y,
					w: docW,
					h: Math.round( subFs * 1.4 ),
					fontSize: subFs,
					fontFamily: 'Inter',
					weight: 400,
					color: pal.text,
					align: 'center',
					letterSpacing: Math.round( subFs * 0.32 ),
				} );
				y += Math.round( subFs * 2 );
			}
			if ( durationCheck && durationCheck.checked && params.duration ) {
				const dFs = Math.round( docW * 0.019 * ts );
				const span =
					( ( params.trimEnd - params.trimStart ) / 100 ) *
					params.duration;
				text( {
					name: t( 'Duration' ),
					text: durationText( span ),
					x: 0,
					y,
					w: docW,
					h: Math.round( dFs * 1.4 ),
					fontSize: dFs,
					fontFamily: 'Inter',
					weight: 400,
					color: pal.text,
					align: 'center',
					letterSpacing: Math.round( dFs * 0.24 ),
				} );
			}
		}
		return { rect, items };
	}

	// Ridgeline reads the fixed high-res profile, so the Density slider
	// maps onto its ROW count instead (40..240 -> 12..40 ridges).
	const ridgeRows = () =>
		Math.round( 12 + ( ( params.density - 40 ) / 200 ) * 28 );

	const waveOpts = () => ( {
		peaks,
		style: params.style,
		theme: themeOf(),
		overrides: params.overrides,
		amp: params.amp,
		rounded: params.rounded,
		transparentBg: params.transparentBg,
		mask: params.mask,
		colorMode: params.colorMode,
		gradientId: params.gradientId,
		gradientMap: params.gradientMap,
		glow: ( params.glow || 0 ) / 100,
		reflect: !! params.reflect,
		peaksB,
		brights: brightsArr,
		peaksFull,
		rows: 'ridgeline' === params.style ? ridgeRows() : 0,
	} );

	function paintNow() {
		const doc = editor.state.doc;
		const maxW = Math.max( 160, view.clientWidth - 36 );
		const maxH = Math.max( 160, view.clientHeight - 36 );
		const s = Math.min( maxW / doc.w, maxH / doc.h );
		const cw = Math.max( 60, Math.round( doc.w * s ) );
		const ch = Math.max( 60, Math.round( doc.h * s ) );
		if ( canvas.width !== cw || canvas.height !== ch ) {
			canvas.width = cw;
			canvas.height = ch;
		}
		const ctx = canvas.getContext( '2d' );
		ctx.clearRect( 0, 0, cw, ch );
		if ( ! peaks ) {
			empty.style.display = '';
			return;
		}
		empty.style.display = 'none';
		const L = layoutPoster( doc.w, doc.h );
		ctx.save();
		ctx.translate( L.rect.x * s, L.rect.y * s );
		drawWave( ctx, L.rect.w * s, L.rect.h * s, waveOpts() );
		ctx.restore();
		for ( const item of L.items ) {
			if ( 'rect' === item.kind ) {
				ctx.fillStyle = item.fill;
				ctx.fillRect(
					item.x * s,
					item.y * s,
					Math.max( 1, item.w * s ),
					Math.max( 1, item.h * s )
				);
				continue;
			}
			if ( 'dot' === item.kind ) {
				ctx.fillStyle = item.fill;
				ctx.beginPath();
				ctx.arc(
					( item.x + item.w / 2 ) * s,
					( item.y + item.h / 2 ) * s,
					Math.max( 1, ( item.w / 2 ) * s ),
					0,
					Math.PI * 2
				);
				ctx.fill();
				continue;
			}
			ctx.save();
			ctx.fillStyle = item.color;
			ctx.font = `${ item.weight } ${ Math.max(
				4,
				item.fontSize * s
			) }px ${ item.fontFamily }, sans-serif`;
			if ( 'letterSpacing' in ctx ) {
				ctx.letterSpacing = `${ ( item.letterSpacing || 0 ) * s }px`;
			}
			ctx.textBaseline = 'top';
			ctx.textAlign = item.align;
			let tx = item.x * s;
			if ( 'center' === item.align ) {
				tx = ( item.x + item.w / 2 ) * s;
			} else if ( 'right' === item.align ) {
				tx = ( item.x + item.w ) * s;
			}
			ctx.fillText( item.text, tx, item.y * s );
			if ( 'letterSpacing' in ctx ) {
				ctx.letterSpacing = '0px';
			}
			ctx.restore();
		}
	}

	let raf = 0;
	function paint() {
		if ( raf ) {
			return;
		}
		raf = window.requestAnimationFrame( () => {
			raf = 0;
			paintNow();
		} );
	}

	/* ------------------------------ lifecycle ---------------------------- */

	const onResize = () => paint();
	// A window resize alone misses the view getting its real height right
	// after mount, which left a tall 9:16 preview sized against a stale
	// height and overflowing past the footer. Observing the view element
	// refits the canvas whenever its box changes, mount included.
	const viewRO =
		'function' === typeof window.ResizeObserver
			? new window.ResizeObserver( () => paint() )
			: null;
	const onKey = ( e ) => {
		if ( 'Escape' === e.key ) {
			close();
		}
	};
	function close() {
		if ( previewStop ) {
			previewStop();
		}
		if ( exportAbort ) {
			exportAbort();
		}
		pcmBuffer = null;
		window.removeEventListener( 'resize', onResize );
		if ( viewRO ) {
			viewRO.disconnect();
		}
		document.removeEventListener( 'keydown', onKey );
		Object.values( colorControls ).forEach( ( c ) => {
			if ( c && c.unmount ) {
				c.unmount();
			}
		} );
		backdrop.remove();
	}
	window.addEventListener( 'resize', onResize );
	if ( viewRO ) {
		viewRO.observe( view );
	}
	document.addEventListener( 'keydown', onKey );
	closeBtn.onclick = close;
	backdrop.onclick = ( e ) => {
		if ( e.target === backdrop ) {
			close();
		}
	};

	/* -------------------------------- insert ----------------------------- */

	apply.onclick = async () => {
		if ( ! peaks ) {
			setStatus( t( 'Pick an audio file first.' ), true );
			return;
		}
		apply.disabled = true;
		setStatus( t( 'Rendering the wave' ) );
		try {
			await insertOrUpdate();
			close();
		} catch ( e ) {
			setStatus(
				e && e.message
					? e.message
					: t( 'Could not insert the soundwave.' ),
				true
			);
			apply.disabled = false;
		}
	};

	async function insertOrUpdate() {
		const doc = editor.state.doc;
		const L = layoutPoster( doc.w, doc.h );
		const outH = Math.max(
			64,
			Math.round( ( OUT_W * L.rect.h ) / L.rect.w )
		);
		const bake = document.createElement( 'canvas' );
		bake.width = OUT_W;
		bake.height = outH;
		drawWave( bake.getContext( '2d' ), OUT_W, outH, waveOpts() );
		const url = bake.toDataURL( 'image/png' );
		const stored = { ...params };

		if ( editing ) {
			editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: {
					src: url,
					naturalW: OUT_W,
					naturalH: outH,
					generator: { id: GEN_ID, params: stored },
				},
			} );
			editor.commit( t( 'Update Soundwave' ) );
			return;
		}

		const { makeImage, makeText, makeShape, makeGroup } = bridge.documents;
		const children = [];
		const waveLayer = makeImage( {
			name: `${ t( 'Soundwave' ) } ${
				( params.audio && params.audio.title ) || ''
			}`.trim(),
			x: L.rect.x,
			y: L.rect.y,
			w: L.rect.w,
			h: L.rect.h,
			src: url,
			naturalW: OUT_W,
			naturalH: outH,
		} );
		waveLayer.generator = { id: GEN_ID, params: stored };
		children.push( waveLayer );

		for ( const item of L.items ) {
			if ( 'rect' === item.kind || 'dot' === item.kind ) {
				children.push(
					makeShape( {
						name: item.name,
						x: item.x,
						y: item.y,
						w: item.w,
						h: item.h,
						shape: 'dot' === item.kind ? 'ellipse' : 'rect',
						fill: item.fill,
					} )
				);
				continue;
			}
			children.push(
				makeText( {
					name: item.name,
					text: item.text,
					x: item.x,
					y: item.y,
					w: item.w,
					h: item.h,
					fontSize: item.fontSize,
					fontFamily: item.fontFamily,
					weight: item.weight,
					color: item.color,
					align: item.align,
					letterSpacing: item.letterSpacing || 0,
					fixedWidth: true,
				} )
			);
		}

		try {
			await bridge.fonts.ensureFontsForLayers(
				children.filter( ( c ) => 'text' === c.type )
			);
		} catch ( e ) {
			// Fonts fall back gracefully; never block the insert.
		}

		const group = makeGroup( {
			name: `${ t( 'Soundwave' ) }: ${
				( params.audio && params.audio.title ) || t( 'Audio' )
			}`,
		} );
		editor.dispatch( { type: 'ADD_LAYER', layer: group } );
		for ( const child of children ) {
			child.parent = group.id;
			editor.dispatch( { type: 'ADD_LAYER', layer: child } );
		}
		editor.dispatch( { type: 'SET_ACTIVE', id: group.id } );
		editor.commit( t( 'Insert Soundwave' ) );
	}

	/* -------------------------------- boot ------------------------------- */

	syncThemeSel();
	applyBrand();
	syncColorInputs();
	if ( params.font && bridge.fonts && bridge.fonts.ensureFont ) {
		bridge.fonts.ensureFont( params.font ).then( paint ).catch( () => {} );
	}
	syncAudioInfo();
	bridge.fonts
		.ensureFontsForLayers( [
			{ type: 'text', fontFamily: params.font || 'Montserrat', weight: 700 },
			{ type: 'text', fontFamily: 'Inter', weight: 400 },
		] )
		.then( () => paint() )
		.catch( () => {} );
	requestAnimationFrame( () => {
		paint();
		if ( params.audio && params.audio.url ) {
			loadAudio( params.audio.url );
		}
	} );
}

/* -------------------------------- register ------------------------------- */

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Soundwave Art',
		run: ( ctx ) => openStudio( ctx ),
		edit: ( ctx ) => openStudio( ctx ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else {
	window.wp.hooks.addAction( 'wpie.ready', 'wpie-soundwave', register );
}
