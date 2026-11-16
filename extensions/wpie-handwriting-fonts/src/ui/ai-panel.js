/**
 * The generated route, as a screen.
 *
 * Describe a handwriting, or show a photo of a note, and the blank sheet
 * goes to the image model the site has set up. It comes back written, is
 * read like a photographed sheet and goes straight into the font - no
 * review step, the characters simply appear in the grid. The second sheet
 * is written with the first one as its model, so both are one hand.
 */

import { drawSheet } from '../core/sheet.js';
import {
	aiPages,
	aiPageSize,
	aiPrompt,
	aiRows,
	aiMetrics,
	readFilledPage,
	AI_DRAW,
} from '../core/ai-sheet.js';

/**
 * The Gemini model that filled the sheets best when measured: 4K pages,
 * every box right. The site's own model is used when it will not run this
 * one for this user.
 */
const GEMINI_MODEL = 'gemini-3.1-flash-image-preview';

/** The providers that can write into a picture. */
const IMAGE_PROVIDERS = [ 'gemini', 'openai' ];

/** Longest side a written sheet is read at (the photo route's size). */
const READ_SIZE = 3000;

/** Longest side a reference goes out at: it carries a hand, not detail. */
const REF_SIZE = 1600;

/**
 * Longest side of a written sheet's thumbnail. The sheet itself is about
 * 17 megapixels; shown as it is, every thumbnail would hold that decoded.
 */
const THUMB_SIZE = 300;

/** Resolution the blank sheet is sent at. */
const SEND_DPI = 300;

/** Resolution the sheet is kept at to pair the rows it comes back with. */
const PAIR_DPI = 150;

/** Starting points for a description; the text lands in the field. */
const EXAMPLES = [
	{
		label: 'School hand',
		text: 'neat, rounded school handwriting with a blue ballpoint pen',
	},
	{
		label: 'Quick scribble',
		text: 'a quick, slightly untidy everyday scribble with a black ballpoint pen',
	},
	{
		label: 'Elegant cursive',
		text: 'elegant, flowing cursive with long loops, written with a fountain pen',
	},
	{
		label: 'Felt-tip marker',
		text: 'bold, upright felt-tip marker handwriting with simple, rounded shapes',
	},
];

export class AiPanel {
	/**
	 * @param {HTMLElement} root Container.
	 * @param {Object}      opts `{ project, t, ui, icons, onImport, onStatus }`.
	 */
	constructor( root, opts ) {
		this.root = root;
		this.project = opts.project;
		this.t = opts.t || ( ( s ) => s );
		this.ui = opts.ui;
		this.icons = opts.icons || {};
		this.onImport = opts.onImport || ( () => {} );
		this.onStatus = opts.onStatus || ( () => {} );
		this.source = 'describe';
		this.description = '';
		this.wish = '';
		this.note = '';
		this.onlyMissing = true;
		this.busy = false;
		this.noPin = false;
		this.sheets = [];
		const boot = window.WPIE || {};
		const bridge = boot.bridge || {};
		this.labels = ( bridge.providers && bridge.providers.PROVIDER_LABELS ) || {};
		this.providers = IMAGE_PROVIDERS.filter(
			( id ) => boot.providers && boot.providers[ id ]
		);
		this.provider = this.providers.includes( boot.defaultProvider )
			? boot.defaultProvider
			: this.providers[ 0 ] || '';
		this.build();
	}

	build() {
		const t = this.t;
		const ui = this.ui;
		this.root.innerHTML = '';

		/* ------------------------------ the hand ----------------------------- */

		const hand = ui.section( this.root, { icon: this.icons.pen, title: t( 'Handwriting' ) } );
		const seg = ui.el( 'div', 'dsm-seg wpiehw-source', hand );
		const describeBtn = ui.el( 'button', null, seg, t( 'Describe it' ) );
		const noteBtn = ui.el( 'button', null, seg, t( 'From a note' ) );
		describeBtn.type = 'button';
		noteBtn.type = 'button';

		const describeBox = ui.el( 'div', 'dsm-rows wpiehw-genbox', hand );
		ui.el(
			'p',
			'dsm-note wpiehw-hint',
			describeBox,
			t( 'Describe the handwriting in a few words, and both sheets are written in it.' )
		);
		const area = ui.textarea( describeBox, {
			rows: 3,
			placeholder: t(
				'For example: neat, slightly slanted school handwriting with a blue ballpoint pen'
			),
		} );
		area.classList.add( 'wpiehw-describe' );
		const examples = ui.opts( describeBox, { cols: 2, cls: 'wpiehw-examples' } );
		const exampleBtns = EXAMPLES.map( ( ex ) =>
			ui.opt( examples, {
				label: t( ex.label ),
				onClick: () => {
					area.value = t( ex.text );
					this.description = area.value;
					markExamples();
				},
			} )
		);
		const markExamples = () =>
			exampleBtns.forEach( ( b, i ) =>
				ui.pressed( b, area.value.trim() === t( EXAMPLES[ i ].text ) )
			);
		area.addEventListener( 'input', () => {
			this.description = area.value;
			markExamples();
		} );

		const noteBox = ui.el( 'div', 'dsm-rows wpiehw-genbox', hand );
		ui.el(
			'p',
			'dsm-note wpiehw-hint',
			noteBox,
			t(
				'A photo of a few handwritten lines is enough. Characters the note does not show are written to match.'
			)
		);
		const pickRow = ui.el( 'div', 'wpiehw-btnrow', noteBox );
		this.noteFile = document.createElement( 'input' );
		this.noteFile.type = 'file';
		this.noteFile.accept = 'image/*';
		this.noteFile.className = 'wpiehw-file';
		this.noteFile.addEventListener( 'change', () => {
			const file = this.noteFile.files[ 0 ];
			this.noteFile.value = '';
			if ( file ) {
				this.takeNote( readAsDataUrl( file ) );
			}
		} );
		noteBox.appendChild( this.noteFile );
		ui.btn( pickRow, { label: t( 'Choose a photo' ), onClick: () => this.noteFile.click() } );
		if ( window.WPIE && window.WPIE.pickMedia ) {
			ui.btn( pickRow, {
				label: t( 'From the media library' ),
				onClick: () => this.pickNote(),
			} );
		}
		this.noteThumb = ui.el( 'div', 'wpiehw-notethumb', noteBox );
		ui.el( 'div', 'dsm-fieldlabel wpiehw-label', noteBox, t( 'Anything to add (optional)' ) );
		const wish = ui.textarea( noteBox, {
			rows: 2,
			placeholder: t( 'For example: a little bolder' ),
			onInput: ( v ) => {
				this.wish = v;
			},
		} );
		wish.classList.add( 'wpiehw-describe' );

		const setSource = ( source ) => {
			this.source = source;
			ui.pressed( describeBtn, 'describe' === source );
			ui.pressed( noteBtn, 'note' === source );
			describeBox.hidden = 'describe' !== source;
			noteBox.hidden = 'note' !== source;
		};
		describeBtn.onclick = () => setSource( 'describe' );
		noteBtn.onclick = () => setSource( 'note' );
		setSource( this.source );

		/* ----------------------------- the sheets ---------------------------- */

		const sheets = ui.section( this.root, { icon: this.icons.print, title: t( 'Sheets' ) } );
		if ( this.providers.length ) {
			const provRow = ui.row( sheets, t( 'AI provider' ) );
			ui.select( provRow, {
				options: this.providers.map( ( id ) => ( {
					value: id,
					label: this.labels[ id ] || id,
				} ) ),
				value: this.provider,
				onChange: ( v ) => {
					this.provider = v;
				},
			} );
		} else {
			const warn = ui.el( 'p', 'dsm-note wpiehw-hint', sheets, t( 'No AI provider configured.' ) );
			const url = window.WPIE && window.WPIE.settingsUrl;
			if ( url ) {
				warn.appendChild( document.createTextNode( ' ' ) );
				const a = ui.el( 'a', null, warn, t( 'Open settings' ) );
				a.href = url;
				a.target = '_blank';
				a.rel = 'noreferrer';
			}
		}
		const incRow = ui.row( sheets, t( 'Include' ) );
		ui.select( incRow, {
			options: [
				{ value: 'missing', label: t( 'Only characters still missing' ) },
				{ value: 'all', label: t( 'Every character' ) },
			],
			value: this.onlyMissing ? 'missing' : 'all',
			onChange: ( v ) => {
				this.onlyMissing = 'missing' === v;
				this.renderCount();
			},
		} );
		this.countLine = ui.el( 'p', 'dsm-note wpiehw-hint', sheets, '' );
		const goRow = ui.el( 'div', 'wpiehw-btnrow', sheets );
		this.goBtn = ui.btn( goRow, {
			label: t( 'Write the sheets' ),
			primary: true,
			onClick: () => this.generate(),
		} );
		this.goBtn.disabled = ! this.providers.length;

		this.resultBox = ui.el( 'div', 'wpiehw-genresults', this.root );
		this.renderCount();
	}

	/** Refresh what depends on the glyphs (called when the tab is shown). */
	refresh() {
		this.renderCount();
	}

	renderCount() {
		const t = this.t;
		const pages = aiPages( this.project.glyphs, this.onlyMissing );
		this.countLine.textContent = pages.length
			? t( '%1$d characters on %2$d sheet(s).' )
					.replace( '%1$d', pages.reduce( ( n, p ) => n + p.cells.length, 0 ) )
					.replace( '%2$d', pages.length )
			: t( 'Nothing left to write.' );
	}

	/* -------------------------------- the note ------------------------------- */

	async pickNote() {
		try {
			const list = await window.WPIE.pickMedia( {
				multiple: false,
				types: 'image',
				title: this.t( 'From the media library' ),
				button: this.t( 'Use image' ),
			} );
			const item = list && list[ 0 ];
			if ( item && item.url ) {
				this.takeNote( Promise.resolve( item.url ) );
			}
		} catch ( e ) {
			this.onStatus( this.t( 'That image could not be read' ), true );
		}
	}

	/**
	 * Keep a note, sized down to what a reference needs.
	 *
	 * @param {Promise<string>} source URL or data URL of the picture.
	 */
	async takeNote( source ) {
		try {
			const img = await loadImage( await source );
			this.note = scaled( img, REF_SIZE ).toDataURL( 'image/jpeg', 0.9 );
			this.noteThumb.innerHTML = '';
			const thumb = document.createElement( 'img' );
			thumb.className = 'wpiehw-notepic';
			thumb.alt = this.t( 'Handwritten note' );
			thumb.src = this.note;
			this.noteThumb.appendChild( thumb );
		} catch ( e ) {
			this.onStatus( this.t( 'That image could not be read' ), true );
		}
	}

	/* ------------------------------- writing -------------------------------- */

	/**
	 * A blank sheet as the model gets it.
	 *
	 * @param {Object} page    Page from `aiPages`.
	 * @param {number} index   Its number, from 0.
	 * @param {number} count   Number of pages.
	 * @param {number} dpi     Resolution.
	 * @param {Object} metrics The generated sheet's metrics.
	 * @return {HTMLCanvasElement} The sheet.
	 */
	pageCanvas( page, index, count, dpi, metrics ) {
		const size = aiPageSize( dpi );
		const canvas = document.createElement( 'canvas' );
		canvas.width = size.w;
		canvas.height = size.h;
		drawSheet( canvas.getContext( '2d' ), page, {
			...AI_DRAW,
			dpi,
			metrics,
			// For the model, which reads English best; the person sees the
			// written sheet only as a thumbnail.
			title: `Handwriting font, sheet ${ index + 1 } of ${ count }`,
		} );
		return canvas;
	}

	/**
	 * One sheet through the site's image model.
	 *
	 * @param {Object} args `{ prompt, image, refImage, size }`.
	 * @return {Promise<Object>} `{ images }`.
	 */
	async ask( args ) {
		const api = window.WPIE.bridge.api.ai;
		const call = { ...args, provider: this.provider, aspect: '2:3' };
		if ( 'gemini' !== this.provider || this.noPin ) {
			return api.edit( call );
		}
		try {
			return await api.edit( { ...call, model: GEMINI_MODEL } );
		} catch ( e ) {
			// The site does not run that model for this user, or the
			// provider does not know it: the site's own model then, for
			// this sheet and the ones after it.
			const msg = String( ( e && e.message ) || '' );
			if (
				( e && 'wpie_ai_model' === e.code ) ||
				msg.includes( 'wpie_ai_model' ) ||
				msg.includes( GEMINI_MODEL )
			) {
				this.noPin = true;
				return api.edit( call );
			}
			throw e;
		}
	}

	async generate() {
		const t = this.t;
		if ( this.busy ) {
			return;
		}
		const api = window.WPIE && window.WPIE.bridge && window.WPIE.bridge.api;
		if ( ! this.provider || ! api || ! api.ai || ! api.ai.edit ) {
			this.onStatus( t( 'No AI provider configured.' ), true );
			return;
		}
		if ( 'note' === this.source && ! this.note ) {
			this.onStatus( t( 'Choose a photo of a handwritten note first.' ), true );
			return;
		}
		const pages = aiPages( this.project.glyphs, this.onlyMissing );
		if ( ! pages.length ) {
			this.onStatus( t( 'Nothing left to write.' ), true );
			return;
		}
		const metrics = aiMetrics( this.project.metrics );
		const size = aiPageSize( SEND_DPI );
		const wish = 'note' === this.source ? this.wish : this.description;
		this.setBusy( true );
		this.sheets = [];
		this.paintSheets();
		let ref = 'note' === this.source ? this.note : '';
		let took = 0;
		let missed = 0;
		try {
			for ( let i = 0; i < pages.length; i++ ) {
				const page = pages[ i ];
				const of = ( s ) =>
					t( s ).replace( '%1$d', i + 1 ).replace( '%2$d', pages.length );
				this.onStatus( of( 'Writing sheet %1$d of %2$d' ), true );
				const res = await this.ask( {
					prompt: aiPrompt( {
						source: this.source,
						description: wish,
						page: i + 1,
						pages: pages.length,
						continued: i > 0,
						rows: aiRows( page ),
					} ),
					image: this.pageCanvas( page, i, pages.length, SEND_DPI, metrics ).toDataURL(
						'image/png'
					),
					refImage: ref || undefined,
					size: `${ size.w }x${ size.h }`,
				} );
				const src = res && res.images && res.images[ 0 ];
				if ( ! src ) {
					throw new Error( t( 'The provider returned no image.' ) );
				}
				this.onStatus( of( 'Reading sheet %1$d of %2$d' ), true );
				const img = await loadImage( src );
				const out = readFilledPage(
					pixels( scaled( img, READ_SIZE ) ),
					page,
					metrics,
					{ template: pixels( this.pageCanvas( page, i, pages.length, PAIR_DPI, metrics ) ) }
				);
				if ( out.error ) {
					throw new Error( t( 'The written sheet came back without its corner squares.' ) );
				}
				const keys = [];
				for ( const g of out.glyphs ) {
					this.project.glyphs[ g.key ] = {
						src: 'scan',
						contours: g.contours,
						rev: Date.now(),
					};
					keys.push( g.key );
				}
				took += keys.length;
				missed += page.cells.length - keys.length;
				this.sheets.push( {
					src,
					thumb: scaled( img, THUMB_SIZE ).toDataURL( 'image/jpeg', 0.85 ),
				} );
				this.paintSheets();
				if ( keys.length ) {
					this.onImport( keys );
				}
				// The next sheet is written in the hand of this one.
				ref = scaled( img, REF_SIZE ).toDataURL( 'image/jpeg', 0.9 );
			}
			let msg = t( 'Took over %d characters' ).replace( '%d', took );
			if ( missed ) {
				msg +=
					'. ' +
					t(
						'%d character(s) could not be read. Draw them, or write the sheets again with only the missing characters.'
					).replace( '%d', missed );
			}
			this.onStatus( msg, true );
		} catch ( e ) {
			this.onStatus( ( e && e.message ) || t( 'That image could not be read' ), true );
		} finally {
			this.setBusy( false );
			this.renderCount();
		}
	}

	setBusy( on ) {
		this.busy = on;
		this.goBtn.disabled = on || ! this.providers.length;
	}

	/* ------------------------------- results -------------------------------- */

	paintSheets() {
		const t = this.t;
		const ui = this.ui;
		this.resultBox.innerHTML = '';
		if ( ! this.sheets.length ) {
			return;
		}
		const sec = ui.section( this.resultBox, { icon: this.icons.image, title: t( 'Written sheets' ) } );
		const row = ui.el( 'div', 'wpiehw-sheetthumbs', sec );
		this.sheets.forEach( ( sheet, i ) => {
			const img = document.createElement( 'img' );
			img.className = 'wpiehw-sheetthumb';
			img.alt = t( 'Sheet %d' ).replace( '%d', i + 1 );
			img.src = sheet.thumb;
			row.appendChild( img );
		} );
		const btns = ui.el( 'div', 'wpiehw-btnrow', sec );
		ui.btn( btns, {
			label: t( 'Download the sheets' ),
			onClick: () => this.downloadSheets(),
		} );
	}

	async downloadSheets() {
		for ( let i = 0; i < this.sheets.length; i++ ) {
			try {
				const blob = await ( await window.fetch( this.sheets[ i ].src ) ).blob();
				const ext = /png/.test( blob.type ) ? 'png' : /webp/.test( blob.type ) ? 'webp' : 'jpg';
				const url = URL.createObjectURL( blob );
				const a = document.createElement( 'a' );
				a.href = url;
				a.download = `handwriting-sheet-${ i + 1 }.${ ext }`;
				document.body.appendChild( a );
				a.click();
				a.remove();
				setTimeout( () => URL.revokeObjectURL( url ), 4000 );
			} catch ( e ) {
				this.onStatus( this.t( 'That image could not be read' ), true );
			}
		}
	}

	destroy() {
		this.root.innerHTML = '';
	}
}

/* -------------------------------- helpers -------------------------------- */

function readAsDataUrl( file ) {
	return new Promise( ( resolve, reject ) => {
		const reader = new FileReader();
		reader.onload = () => resolve( String( reader.result || '' ) );
		reader.onerror = () => reject( new Error( 'file' ) );
		reader.readAsDataURL( file );
	} );
}

function loadImage( src ) {
	return new Promise( ( resolve, reject ) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve( img );
		img.onerror = () => reject( new Error( 'image' ) );
		img.src = src;
	} );
}

/**
 * An image on white, at most `max` pixels on its long side.
 *
 * @param {HTMLImageElement} img Image.
 * @param {number}           max Longest side.
 * @return {HTMLCanvasElement} Canvas.
 */
function scaled( img, max ) {
	const w = img.naturalWidth || img.width;
	const h = img.naturalHeight || img.height;
	const f = Math.min( 1, max / Math.max( w, h ) );
	const canvas = document.createElement( 'canvas' );
	canvas.width = Math.max( 1, Math.round( w * f ) );
	canvas.height = Math.max( 1, Math.round( h * f ) );
	const ctx = canvas.getContext( '2d', { willReadFrequently: true } );
	ctx.fillStyle = '#ffffff';
	ctx.fillRect( 0, 0, canvas.width, canvas.height );
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage( img, 0, 0, canvas.width, canvas.height );
	return canvas;
}

/** A canvas as the plain `{ width, height, data }` the reader takes. */
function pixels( canvas ) {
	const data = canvas
		.getContext( '2d', { willReadFrequently: true } )
		.getImageData( 0, 0, canvas.width, canvas.height );
	return { width: canvas.width, height: canvas.height, data: data.data };
}
