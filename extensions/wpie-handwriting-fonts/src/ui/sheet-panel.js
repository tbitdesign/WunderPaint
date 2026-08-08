/**
 * The paper route, as a screen.
 *
 * Three steps, in the order somebody actually does them: print, write,
 * photograph. The only place this can go wrong is the photograph, so
 * that is the only place with anything to adjust. The four corner
 * handles are always shown, pre-placed by the detector; if the detector
 * was right they are never touched, and if it was not, the fix is
 * dragging four dots rather than taking the picture again.
 */

import {
	sheetLayout,
	drawSheet,
	findRegistrationMarks,
	homography,
	extractCell,
	cellToContours,
	despeckle,
	removeRules,
	chooseLayout,
	SHEET,
} from '../core/sheet.js';
import { labelOf, isMark, ALL_KEYS, MARK_LABELS } from '../core/charset.js';
import { contoursToPath, fitCanvas, themeColor } from './paint.js';
import { contourBounds } from '../core/outline.js';

/**
 * The longest side a photograph is worked at.
 *
 * A box is about a fortieth of the page, so at two thousand pixels a pen
 * stroke is under six pixels wide and there is very little for the
 * tracer to hold on to. Three thousand puts it near nine, which is the
 * difference between a shape and a suggestion, and the memory it costs
 * is a one-off.
 */
const MAX_PHOTO = 3000;

export class SheetPanel {
	/**
	 * @param {HTMLElement} root Container.
	 * @param {Object}      opts `{ project, t, ui, onImport, onStatus }`.
	 */
	constructor( root, opts ) {
		this.root = root;
		this.project = opts.project;
		this.t = opts.t || ( ( s ) => s );
		this.ui = opts.ui;
		this.onImport = opts.onImport || ( () => {} );
		this.onStatus = opts.onStatus || ( () => {} );
		this.pageIndex = 0;
		this.photo = null;
		this.corners = null;
		this.results = null;
		this.build();
	}

	get keys() {
		return this.onlyMissing
			? ALL_KEYS.filter( ( k ) => ! this.project.glyphs[ k ] )
			: ALL_KEYS.slice();
	}

	build() {
		const t = this.t;
		const ui = this.ui;
		this.root.innerHTML = '';
		this.onlyMissing = true;

		const step1 = ui.section( this.root, { icon: 'print', title: t( 'Print the sheet' ) } );
		ui.el(
			'p',
			'wpiehw-hint',
			step1,
			t(
				'Print at one hundred percent, do not let the printer scale the page. Write one character per box, standing on the stronger baseline. The printed rules are removed again when the sheet is read back.'
			)
		);
		const missRow = ui.row( step1, t( 'Include' ) );
		ui.select( missRow, {
			options: [
				{ value: 'missing', label: t( 'Only characters still missing' ) },
				{ value: 'all', label: t( 'Every character' ) },
			],
			value: 'missing',
			onChange: ( v ) => {
				this.onlyMissing = 'missing' === v;
				this.renderPages();
			},
		} );
		ui.el(
			'p',
			'wpiehw-hint',
			step1,
			t( 'The selection has to match the sheet you are about to read.' )
		);
		this.pagesRow = ui.el( 'div', 'wpiehw-pages', step1 );
		const printRow = ui.el( 'div', 'wpiehw-btnrow', step1 );
		ui.btn( printRow, { label: t( 'Print' ), primary: true, onClick: () => this.print() } );
		ui.btn( printRow, { label: t( 'Download as image' ), onClick: () => this.downloadPage() } );

		const step2 = ui.section( this.root, { icon: 'image', title: t( 'Read the photo back' ) } );
		ui.el(
			'p',
			'wpiehw-hint',
			step2,
			t(
				'Photograph the finished sheet from above with all four corner squares visible. An angled shot is fine, the corners straighten it out.'
			)
		);
		const pick = ui.el( 'div', 'wpiehw-btnrow', step2 );
		this.file = document.createElement( 'input' );
		this.file.type = 'file';
		this.file.accept = 'image/*';
		this.file.className = 'wpiehw-file';
		this.file.addEventListener( 'change', () => this.loadFile( this.file.files[ 0 ] ) );
		step2.appendChild( this.file );
		ui.btn( pick, {
			label: t( 'Choose a photo' ),
			onClick: () => this.file.click(),
		} );
		this.readBtn = ui.btn( pick, {
			label: t( 'Read sheet' ),
			primary: true,
			onClick: () => this.read(),
		} );
		this.readBtn.disabled = true;

		this.stage = ui.el( 'div', 'wpiehw-photo', step2 );
		this.resultBox = ui.el( 'div', 'wpiehw-results', this.root );

		this.renderPages();
	}

	/* ------------------------------ printing ----------------------------- */

	layout() {
		return sheetLayout( this.keys );
	}

	renderPages() {
		const t = this.t;
		const pages = this.layout();
		this.pagesRow.innerHTML = '';
		if ( ! pages[ 0 ].cells.length ) {
			this.ui.el( 'p', 'wpiehw-hint', this.pagesRow, t( 'Nothing left to write.' ) );
			return;
		}
		this.ui.el(
			'p',
			'wpiehw-hint',
			this.pagesRow,
			t( '%1$d characters on %2$d sheet(s).' )
				.replace( '%1$d', pages.reduce( ( n, p ) => n + p.cells.length, 0 ) )
				.replace( '%2$d', pages.length )
		);
	}

	pageCanvas( page, dpi = 300 ) {
		const canvas = document.createElement( 'canvas' );
		canvas.width = Math.round( ( SHEET.pageW * dpi ) / 25.4 );
		canvas.height = Math.round( ( SHEET.pageH * dpi ) / 25.4 );
		drawSheet( canvas.getContext( '2d' ), page, {
			dpi,
			metrics: this.project.metrics,
			labelFor: ( key ) => ( isMark( key ) ? this.t( MARK_LABELS[ key ] || key ) : key ),
			title: `${ this.project.family } — ${ this.t( 'write one character per box' ) }`,
		} );
		return canvas;
	}

	print() {
		const pages = this.layout().filter( ( p ) => p.cells.length );
		if ( ! pages.length ) {
			return;
		}
		const images = pages.map( ( p ) => this.pageCanvas( p ).toDataURL( 'image/png' ) );
		const frame = document.createElement( 'iframe' );
		frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
		document.body.appendChild( frame );
		const doc = frame.contentWindow.document;
		doc.open();
		doc.write(
			'<!doctype html><html><head><style>@page{size:A4;margin:0}html,body{margin:0;padding:0}img{display:block;width:100%;page-break-after:always}</style></head><body>' +
				images.map( ( src ) => `<img src="${ src }">` ).join( '' ) +
				'</body></html>'
		);
		doc.close();
		const go = () => {
			frame.contentWindow.focus();
			frame.contentWindow.print();
			setTimeout( () => frame.remove(), 60000 );
		};
		if ( doc.readyState === 'complete' ) {
			setTimeout( go, 120 );
		} else {
			frame.onload = () => setTimeout( go, 120 );
		}
	}

	downloadPage() {
		const pages = this.layout().filter( ( p ) => p.cells.length );
		if ( ! pages.length ) {
			return;
		}
		pages.forEach( ( page, i ) => {
			this.pageCanvas( page ).toBlob( ( blob ) => {
				const url = URL.createObjectURL( blob );
				const a = document.createElement( 'a' );
				a.href = url;
				a.download = `handwriting-sheet-${ i + 1 }.png`;
				document.body.appendChild( a );
				a.click();
				a.remove();
				setTimeout( () => URL.revokeObjectURL( url ), 4000 );
			}, 'image/png' );
		} );
	}

	/* ------------------------------- reading ----------------------------- */

	async loadFile( file ) {
		if ( ! file ) {
			return;
		}
		this.onStatus( this.t( 'Reading the photo' ) );
		try {
			const bitmap = await imageFrom( file );
			this.photo = downscale( bitmap, MAX_PHOTO );
			this.corners = findRegistrationMarks( this.photo ) || defaultCorners( this.photo );
			this.detected = !! findRegistrationMarks( this.photo );
			this.readBtn.disabled = false;
			this.paintPhoto();
			this.onStatus(
				this.detected
					? this.t( 'Corners found, check them and read the sheet' )
					: this.t( 'Corners not found, drag the four dots onto the corner squares' )
			);
		} catch ( e ) {
			this.onStatus( this.t( 'That image could not be read' ) );
		}
	}

	paintPhoto() {
		const t = this.t;
		this.stage.innerHTML = '';
		if ( ! this.photo ) {
			return;
		}
		const wrap = this.ui.el( 'div', 'wpiehw-photowrap', this.stage );
		const canvas = document.createElement( 'canvas' );
		canvas.className = 'wpiehw-photocv';
		wrap.appendChild( canvas );
		const scale = Math.min( 1, 520 / this.photo.width );
		canvas.width = Math.round( this.photo.width * scale );
		canvas.height = Math.round( this.photo.height * scale );
		const ctx = canvas.getContext( '2d' );
		const tmp = document.createElement( 'canvas' );
		tmp.width = this.photo.width;
		tmp.height = this.photo.height;
		tmp.getContext( '2d' ).putImageData( toImageData( this.photo ), 0, 0 );
		ctx.drawImage( tmp, 0, 0, canvas.width, canvas.height );

		const labels = [ t( 'top left' ), t( 'top right' ), t( 'bottom right' ), t( 'bottom left' ) ];
		this.corners.forEach( ( pt, i ) => {
			const dot = this.ui.el( 'span', 'wpiehw-dot', wrap );
			dot.title = labels[ i ];
			dot.style.left = `${ pt.x * scale }px`;
			dot.style.top = `${ pt.y * scale }px`;
			dragable( dot, wrap, ( x, y ) => {
				this.corners[ i ] = { x: x / scale, y: y / scale };
				dot.style.left = `${ x }px`;
				dot.style.top = `${ y }px`;
			} );
		} );
	}

	read() {
		if ( ! this.photo || ! this.corners ) {
			return;
		}
		// Which sheet is this? The geometry changed once, and reading a
		// sheet with the wrong one looks up every box a tenth of a page
		// from where it is, which fails silently rather than loudly. The
		// photo is asked instead of the user: with the right geometry the
		// letters sit clear of the box edges, with the wrong one nearly
		// every box is crossed by a stroke.
		const pick = chooseLayout( this.photo, this.corners, this.keys );
		const page = pick.pages[ this.pageIndex ];
		if ( ! page ) {
			this.onStatus( this.t( 'Nothing left to write.' ) );
			return;
		}
		const H = homography( page.marks, this.corners );
		if ( ! H ) {
			this.onStatus( this.t( 'Those four corners do not form a sheet' ) );
			return;
		}
		this.onStatus(
			'grid1' === pick.id
				? this.t( 'Reading an older sheet' )
				: this.t( 'Reading the boxes' )
		);
		const out = [];
		for ( const cell of page.cells ) {
			const raw = extractCell( this.photo, H, cell, { size: 300 } );
			const ruled = raw.empty ? raw : removeRules( raw, this.project.metrics, { cellMm: cell.w } );
			const bmp = ruled.empty ? ruled : despeckle( ruled, 40 );
			if ( bmp.empty ) {
				continue;
			}
			const contours = cellToContours( bmp, this.project.metrics, { cellMm: cell.w } );
			if ( ! contours.length || ! contourBounds( contours ) ) {
				continue;
			}
			out.push( { key: cell.key, contours, take: true } );
		}
		this.results = out;
		this.paintResults();
		this.onStatus(
			out.length
				? this.t( 'Found %d characters' ).replace( '%d', out.length )
				: this.t( 'No writing found in the boxes' )
		);
	}

	paintResults() {
		const t = this.t;
		this.resultBox.innerHTML = '';
		if ( ! this.results || ! this.results.length ) {
			return;
		}
		const sec = this.ui.section( this.resultBox, { icon: 'check', title: t( 'What was found' ) } );
		this.ui.el(
			'p',
			'wpiehw-hint',
			sec,
			t( 'Click a character to leave it out. The rest are taken over when you confirm.' )
		);
		const grid = this.ui.el( 'div', 'wpiehw-tiles', sec );
		for ( const item of this.results ) {
			const btn = document.createElement( 'button' );
			btn.type = 'button';
			btn.className = 'wpiehw-tile is-done';
			btn.title = labelOf( item.key );
			const canvas = document.createElement( 'canvas' );
			canvas.className = 'wpiehw-tilecv';
			btn.appendChild( canvas );
			const label = document.createElement( 'span' );
			label.textContent = isMark( item.key ) ? t( labelOf( item.key ) ) : item.key;
			btn.appendChild( label );
			btn.addEventListener( 'click', () => {
				item.take = ! item.take;
				btn.classList.toggle( 'is-off', ! item.take );
			} );
			grid.appendChild( btn );
			requestAnimationFrame( () => paintContours( canvas, item.contours, this.project.metrics ) );
		}
		const row = this.ui.el( 'div', 'wpiehw-btnrow', sec );
		this.ui.btn( row, {
			label: t( 'Take these over' ),
			primary: true,
			onClick: () => {
				const taken = this.results.filter( ( r ) => r.take );
				for ( const item of taken ) {
					this.project.glyphs[ item.key ] = {
						src: 'scan',
						contours: item.contours,
						rev: Date.now(),
					};
				}
				this.results = null;
				this.resultBox.innerHTML = '';
				this.onImport( taken.map( ( r ) => r.key ) );
			},
		} );
	}

	destroy() {
		this.root.innerHTML = '';
	}
}

function paintContours( canvas, contours, metrics ) {
	const { ctx, dpr } = fitCanvas( canvas );
	const rect = canvas.getBoundingClientRect();
	const span = ( metrics.ascender - metrics.descender ) * 1.05;
	const scale = rect.height / span;
	const box = contourBounds( contours );
	if ( ! box ) {
		return;
	}
	ctx.scale( dpr, dpr );
	ctx.fillStyle = themeColor( '--ed-text', '#e8eaee' );
	ctx.save();
	ctx.translate( rect.width / 2, ( metrics.ascender + span * 0.025 ) * scale );
	ctx.scale( scale, -scale );
	ctx.translate( -( box.x0 + box.x1 ) / 2, 0 );
	ctx.fill( contoursToPath( contours ), 'nonzero' );
	ctx.restore();
}

function imageFrom( file ) {
	return new Promise( ( resolve, reject ) => {
		const url = URL.createObjectURL( file );
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL( url );
			resolve( img );
		};
		img.onerror = () => {
			URL.revokeObjectURL( url );
			reject( new Error( 'image' ) );
		};
		img.src = url;
	} );
}

/** Down to a size the algorithms are happy with and memory tolerates. */
function downscale( img, max ) {
	const w = img.naturalWidth || img.width;
	const h = img.naturalHeight || img.height;
	const f = Math.min( 1, max / Math.max( w, h ) );
	const cw = Math.max( 1, Math.round( w * f ) );
	const ch = Math.max( 1, Math.round( h * f ) );
	const canvas = document.createElement( 'canvas' );
	canvas.width = cw;
	canvas.height = ch;
	const ctx = canvas.getContext( '2d', { willReadFrequently: true } );
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage( img, 0, 0, cw, ch );
	return ctx.getImageData( 0, 0, cw, ch );
}

function toImageData( img ) {
	return new ImageData( new Uint8ClampedArray( img.data ), img.width, img.height );
}

function defaultCorners( img ) {
	const mx = img.width * 0.08;
	const my = img.height * 0.08;
	return [
		{ x: mx, y: my },
		{ x: img.width - mx, y: my },
		{ x: img.width - mx, y: img.height - my },
		{ x: mx, y: img.height - my },
	];
}

function dragable( dot, wrap, onMove ) {
	dot.addEventListener( 'pointerdown', ( e ) => {
		e.preventDefault();
		dot.setPointerCapture( e.pointerId );
		const move = ( ev ) => {
			const rect = wrap.getBoundingClientRect();
			const x = Math.max( 0, Math.min( rect.width, ev.clientX - rect.left ) );
			const y = Math.max( 0, Math.min( rect.height, ev.clientY - rect.top ) );
			onMove( x, y );
		};
		const up = () => {
			dot.removeEventListener( 'pointermove', move );
			dot.removeEventListener( 'pointerup', up );
		};
		dot.addEventListener( 'pointermove', move );
		dot.addEventListener( 'pointerup', up );
	} );
}
