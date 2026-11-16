/** The paper in the middle: the rendered SVG drawn on a canvas, fitted to the view. */
import { ICONS } from './icons.js';
import { docParts, docAround } from '../../../shared/doc-preview.js';
import { staffPitch } from '../engine/studio.js';

export function buildView(
	mid,
	{ ui, t, onToggleDoc, getEditor = () => null }
) {
	const view = ui.el( 'div', 'wpiesm-view', mid );
	const canvas = document.createElement( 'canvas' );
	canvas.className = 'wpiesm-canvas';
	canvas.width = 1600;
	canvas.height = 400;
	view.appendChild( canvas );
	const toolbar = ui.el( 'div', 'wpiesm-view-tools', view );
	let zoom = 1,
		autoFit = true,
		panX = 0,
		panY = 0,
		drag = null;
	let geometry = null,
		lastImage = null,
		selection = [ -1, -1 ],
		editing = true,
		editDrag = null;
	const button = ( label, action ) => {
		const b = ui.el( 'button', 'dsm-viewbtn', toolbar, label );
		b.type = 'button';
		b.onclick = action;
		return b;
	};
	button( t( 'Fit' ), () => {
		autoFit = true;
		panX = panY = 0;
		fit();
	} );
	button( '100%', () => {
		autoFit = false;
		zoom = 1;
		panX = panY = 0;
		fit();
	} );
	button( '−', () => changeZoom( 0.8 ) ).setAttribute(
		'aria-label',
		t( 'Zoom out' )
	);
	const zoomLabel = ui.el(
		'span',
		'dsm-viewbtn wpiesm-zoom-label',
		toolbar,
		''
	);
	button( '+', () => changeZoom( 1.25 ) ).setAttribute(
		'aria-label',
		t( 'Zoom in' )
	);
	const editButton = button( t( 'Edit notes' ), () => {
		editing = ! editing;
		editButton.setAttribute( 'aria-pressed', String( editing ) );
		updateHint();
	} );
	editButton.hidden = true;
	editButton.setAttribute( 'aria-pressed', 'true' );
	const docBtn = ui.el( 'button', 'dsm-viewbtn wpiesm-doc', view );
	docBtn.type = 'button';
	docBtn.innerHTML = ICONS.eye + ' ' + t( 'Show document' );
	docBtn.setAttribute( 'aria-pressed', 'false' );
	docBtn.onclick = () => onToggleDoc();
	const hint = ui.el(
		'div',
		'dsm-viewhint wpiesm-hint',
		view,
		t( 'Drag to pan · scroll to zoom' )
	);
	let token = 0;
	// v1.1.2 (shared doc-preview): the document split at the music's
	// layer, laid around the paper where it lands - below under it, above
	// over it - and moving with the paper's zoom and pan.
	const parts = docParts( view, [ docBtn, hint ] );
	let docState = null;
	function layoutDoc() {
		if ( ! docState ) {
			parts.hide();
			return;
		}
		const box = {
			x: canvas.offsetLeft + panX,
			y: canvas.offsetTop + panY,
			w: canvas.offsetWidth,
			h: canvas.offsetHeight,
		};
		const R = docState.region( canvas.width, canvas.height );
		parts.show( docState.around, docAround( box, R, docState.doc.w, docState.doc.h ) );
	}
	function updateHint() {
		hint.textContent =
			geometry && editing
				? t(
						'Click to add · drag a note · Shift-click a phrase · Alt-drag to pan'
				  )
				: t( 'Drag to pan · scroll to zoom' );
		view.classList.toggle( 'is-editing', !! geometry && editing );
	}
	function paint() {
		if ( ! lastImage ) return;
		const g = canvas.getContext( '2d' );
		g.clearRect( 0, 0, canvas.width, canvas.height );
		g.drawImage( lastImage, 0, 0 );
		g.strokeStyle =
			getComputedStyle( view ).getPropertyValue( '--accent' ).trim() ||
			'#287bc1';
		g.lineWidth = 1.8 / Math.max( zoom, 0.1 );
		for ( const n of geometry?.notes || [] )
			if (
				n.editable &&
				n.index >= selection[ 0 ] &&
				n.index <= selection[ 1 ]
			) {
				g.beginPath();
				g.ellipse(
					n.x,
					n.y,
					10 / Math.max( zoom, 0.6 ),
					8 / Math.max( zoom, 0.6 ),
					0,
					0,
					Math.PI * 2
				);
				g.stroke();
			}
		if ( editDrag?.moved ) {
			g.globalAlpha = 0.6;
			g.beginPath();
			g.ellipse(
				editDrag.note.x,
				editDrag.y,
				8,
				5,
				-0.3,
				0,
				Math.PI * 2
			);
			g.stroke();
			g.globalAlpha = 1;
		}
	}
	function setSelection( from, to ) {
		selection = [ from, to ];
		paint();
	}

	/** Draw an SVG string; resolves when the picture is on the canvas. */
	function show( res ) {
		const my = ++token;
		return new Promise( ( ok ) => {
			const img = new Image();
			img.onload = () => {
				if ( my !== token ) {
					return ok( false );
				}
				canvas.width = res.width;
				canvas.height = res.height;
				lastImage = img;
				geometry = res.geometry || null;
				editButton.hidden = ! geometry;
				updateHint();
				fit();
				paint();
				ok( true );
			};
			img.onerror = () => ok( false );
			img.src =
				'data:image/svg+xml;charset=utf-8,' +
				encodeURIComponent( res.svg );
		} );
	}

	/** Keep the paper inside the view with its aspect. */
	function fit() {
		const vw = view.clientWidth || 800;
		const vh = view.clientHeight || 600;
		if ( autoFit )
			zoom = Math.min(
				( vw - 24 ) / canvas.width,
				( vh - 24 ) / canvas.height,
				1
			);
		canvas.style.width = Math.round( canvas.width * zoom ) + 'px';
		canvas.style.height = Math.round( canvas.height * zoom ) + 'px';
		canvas.style.transform = `translate(${ panX }px,${ panY }px)`;
		zoomLabel.textContent = Math.round( zoom * 100 ) + '%';
		layoutDoc();
	}
	function changeZoom( factor, x = 0, y = 0 ) {
		const old = zoom;
		autoFit = false;
		zoom = Math.max( 0.025, Math.min( 4, zoom * factor ) );
		panX = x - ( ( x - panX ) * zoom ) / old;
		panY = y - ( ( y - panY ) * zoom ) / old;
		fit();
		paint();
	}
	view.addEventListener(
		'wheel',
		( event ) => {
			event.preventDefault();
			const b = view.getBoundingClientRect();
			changeZoom(
				Math.exp(
					-Math.max( -120, Math.min( 120, event.deltaY ) ) * 0.004
				),
				event.clientX - b.left - b.width / 2,
				event.clientY - b.top - b.height / 2
			);
		},
		{ passive: false }
	);
	view.onpointerdown = ( event ) => {
		if ( event.target.closest( 'button' ) || event.button !== 0 ) return;
		const editor = getEditor();
		if ( geometry && editing && ! event.altKey ) {
			if ( ! editor ) return;
			const point = position( event );
			const notes = geometry.notes.filter( ( n ) => n.editable );
			const near = notes
				.map( ( n ) => ( {
					n,
					distance: Math.hypot(
						( n.x - point.x ) * zoom,
						( n.y - point.y ) * zoom
					),
				} ) )
				.sort( ( a, b ) => a.distance - b.distance )[ 0 ];
			if ( near && near.distance < 18 ) {
				editor.select( near.n.index, event.shiftKey );
				if ( ! event.shiftKey ) {
					editDrag = {
						note: near.n,
						editor,
						startY: event.clientY,
						y: near.n.y,
						moved: false,
						staff: geometry.staves.find(
							( s ) => s.id === near.n.staff
						),
					};
					view.setPointerCapture( event.pointerId );
				}
				return;
			}
			const staff = geometry.staves
				.filter(
					( s ) =>
						point.x >= s.x &&
						point.x <= s.right &&
						point.y >= s.top - s.step * 9 &&
						point.y <= s.bottom + s.step * 9
				)
				.sort(
					( a, b ) =>
						Math.abs( ( a.top + a.bottom ) / 2 - point.y ) -
						Math.abs( ( b.top + b.bottom ) / 2 - point.y )
				)[ 0 ];
			if ( staff ) {
				const onStaff = notes
						.filter( ( n ) => n.staff === staff.id )
						.sort( ( a, b ) => a.x - b.x ),
					next = onStaff.find( ( n ) => n.x > point.x );
				const index = next
					? next.index
					: onStaff.length
					? onStaff.at( -1 ).index + 1
					: 0;
				editor.insert(
					index,
					staffPitch( point.y, staff, editor.key, editor.accidental )
				);
			}
			return;
		}
		drag = { x: event.clientX, y: event.clientY, px: panX, py: panY };
		view.setPointerCapture( event.pointerId );
		view.classList.add( 'is-dragging' );
	};
	view.onpointermove = ( event ) => {
		if ( editDrag ) {
			editDrag.moved ||= Math.abs( event.clientY - editDrag.startY ) > 3;
			if ( editDrag.moved ) {
				editDrag.y = position( event ).y;
				paint();
			}
			return;
		}
		if ( ! drag ) return;
		panX = drag.px + event.clientX - drag.x;
		panY = drag.py + event.clientY - drag.y;
		fit();
	};
	view.onpointerup = () => {
		const change = editDrag;
		editDrag = null;
		if ( change?.moved && change.staff )
			change.editor.setPitch(
				change.note.index,
				staffPitch(
					change.y,
					change.staff,
					change.editor.key,
					change.editor.accidental
				)
			);
		drag = null;
		view.classList.remove( 'is-dragging' );
		paint();
	};
	view.onpointercancel = () => {
		drag = editDrag = null;
		view.classList.remove( 'is-dragging' );
		paint();
	};
	function position( event ) {
		const rect = canvas.getBoundingClientRect();
		return {
			x: ( ( event.clientX - rect.left ) * canvas.width ) / rect.width,
			y: ( ( event.clientY - rect.top ) * canvas.height ) / rect.height,
		};
	}
	const resize =
		typeof ResizeObserver === 'undefined'
			? null
			: new ResizeObserver( () => fit() );
	resize?.observe( view );

	/** { around, doc, region( w, h ) } from main, or null to hide. */
	function setDoc( state ) {
		docState = state || null;
		docBtn.setAttribute( 'aria-pressed', state ? 'true' : 'false' );
		layoutDoc();
	}

	return {
		view,
		canvas,
		hint,
		show,
		fit,
		setDoc,
		setSelection,
		dispose: () => {
			token++;
			resize?.disconnect();
		},
	};
}
