/** The paper in the middle: the rendered SVG drawn on a canvas, fitted to the view. */
import { ICONS } from './icons.js';

export function buildView( mid, { ui, t, onToggleDoc } ) {
	const view = ui.el( 'div', 'wpiepp-view', mid );
	const canvas = document.createElement( 'canvas' );
	canvas.className = 'wpiepp-canvas';
	canvas.width = 1600;
	canvas.height = 400;
	view.appendChild( canvas );
	const docBtn = ui.el( 'button', 'dsm-viewbtn wpiepp-doc', view );
	docBtn.type = 'button';
	docBtn.innerHTML = ICONS.eye + ' ' + t( 'Show document' );
	docBtn.setAttribute( 'aria-pressed', 'false' );
	docBtn.onclick = () => onToggleDoc();
	const hint = ui.el(
		'div',
		'dsm-viewhint wpiepp-hint',
		view,
		t( 'Solid lines are cuts, dashed lines are folds.' )
	);
	let token = 0;

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
				const g = canvas.getContext( '2d' );
				g.clearRect( 0, 0, canvas.width, canvas.height );
				g.drawImage( img, 0, 0 );
				fit();
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
		const s = Math.min(
			( vw - 24 ) / canvas.width,
			( vh - 24 ) / canvas.height,
			1
		);
		canvas.style.width = Math.round( canvas.width * s ) + 'px';
		canvas.style.height = Math.round( canvas.height * s ) + 'px';
	}

	function setDoc( url ) {
		view.style.backgroundImage = url ? 'url(' + url + ')' : '';
		view.style.backgroundSize = url ? 'contain' : '';
		view.style.backgroundRepeat = 'no-repeat';
		view.style.backgroundPosition = 'center';
		docBtn.setAttribute( 'aria-pressed', url ? 'true' : 'false' );
	}

	return { view, canvas, hint, show, fit, setDoc };
}
