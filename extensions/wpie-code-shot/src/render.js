/**
 * The canvas renderer: tokenise the code and draw it as a framed, themed
 * screenshot - window chrome with traffic lights and an optional title, a line
 * number gutter, coloured tokens, a background (solid / gradient / transparent)
 * and a soft window shadow. Rendered at 2x for crisp text. Pure enough to run
 * both in the live preview and in the headless dynamic re-render.
 */
import { tokenizeLines } from './highlight.js';
import { expandTabs, parseLineSpec, splitDiff } from './tokens.js';
import { THEMES } from './themes.js';

const STACK =
	"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
const SS = 2; // supersample for crisp glyphs
const MAX_LINES = 500;
const ASPECTS = { '16:9': 16 / 9, '1:1': 1, '4:3': 4 / 3, '9:16': 9 / 16 };

let fontReady = null;

/** Load the bundled JetBrains Mono once; harmless if it fails (fallback mono). */
export function ensureFont( baseUrl ) {
	if ( fontReady ) {
		return fontReady;
	}
	if (
		typeof FontFace === 'undefined' ||
		typeof document === 'undefined' ||
		! baseUrl
	) {
		fontReady = Promise.resolve( false );
		return fontReady;
	}
	fontReady = ( async () => {
		try {
			const faces = [
				new FontFace(
					'JetBrains Mono',
					'url(' + baseUrl + 'fonts/JetBrainsMono-Regular.woff2)',
					{ weight: '400' }
				),
				new FontFace(
					'JetBrains Mono',
					'url(' + baseUrl + 'fonts/JetBrainsMono-Bold.woff2)',
					{ weight: '700' }
				),
			];
			const done = await Promise.allSettled(
				faces.map( ( f ) => f.load() )
			);
			done.forEach( ( r ) => {
				if ( 'fulfilled' === r.status ) {
					document.fonts.add( r.value );
				}
			} );
			return true;
		} catch ( e ) {
			return false;
		}
	} )();
	return fontReady;
}

function roundRect( g, x, y, w, h, r ) {
	r = Math.min( r, w / 2, h / 2 );
	g.beginPath();
	g.moveTo( x + r, y );
	g.arcTo( x + w, y, x + w, y + h, r );
	g.arcTo( x + w, y + h, x, y + h, r );
	g.arcTo( x, y + h, x, y, r );
	g.arcTo( x, y, x + w, y, r );
	g.closePath();
}

function paintBackground( g, W, H, bg ) {
	bg = bg || { mode: 'gradient' };
	if ( 'transparent' === bg.mode ) {
		return;
	}
	if ( 'solid' === bg.mode ) {
		g.fillStyle = bg.color || '#1e293b';
		g.fillRect( 0, 0, W, H );
		return;
	}
	const grad = g.createLinearGradient( 0, 0, W, H );
	grad.addColorStop( 0, bg.color || '#6366f1' );
	grad.addColorStop( 1, bg.color2 || '#ec4899' );
	g.fillStyle = grad;
	g.fillRect( 0, 0, W, H );
}

/**
 * Render params into a canvas.
 *
 * @param {Object} params { code, language, theme, window, title, lineNumbers,
 *                          fontSize, tabSize, padding, shadow, bg }
 * @return {HTMLCanvasElement}
 */
export function bakeCanvas( params ) {
	params = params || {};
	const th = THEMES[ params.theme ] || THEMES.dracula;
	const fs = Math.round( ( params.fontSize || 15 ) * SS );

	// Content: optional diff pre-pass, tab expansion, line cap.
	let raw = ( 'string' === typeof params.code ? params.code : '' )
		.replace( /\r\n?/g, '\n' )
		.replace( /\n+$/, '' );
	let types = null;
	if ( params.diff ) {
		const d = splitDiff( raw );
		raw = d.code;
		types = d.types;
	}
	raw = expandTabs( raw, params.tabSize || 2 );
	let srcLines = raw.split( '\n' );
	if ( srcLines.length > MAX_LINES ) {
		srcLines = srcLines.slice( 0, MAX_LINES );
		if ( types ) {
			types = types.slice( 0, MAX_LINES );
		}
	}
	const { lines } = tokenizeLines(
		srcLines.join( '\n' ) || ' ',
		params.language || 'auto'
	);
	const hi = parseLineSpec( params.highlight, lines.length );
	const focus = !! params.focus && hi.size > 0;

	const meas = document.createElement( 'canvas' ).getContext( '2d' );
	const font = fs + 'px ' + STACK;
	meas.font = font;
	const charW = meas.measureText( '0000000000' ).width / 10 || fs * 0.6;
	const lineH = Math.round( fs * 1.55 );
	const pad = Math.round( fs * 0.95 );
	const showNums = false !== params.lineNumbers;
	const gutterW = showNums
		? Math.round( String( lines.length ).length * charW + pad )
		: 0;
	const titleH = 'none' === params.window ? 0 : Math.round( fs * 2.0 );
	const maxChars = lines.reduce(
		( mx, ln ) =>
			Math.max(
				mx,
				ln.reduce( ( s, r ) => s + r.text.length, 0 )
			),
		1
	);
	const codeW = Math.ceil( maxChars * charW );
	const winW = Math.round( gutterW + pad + codeW + pad );
	const winH = Math.round( titleH + pad + lines.length * lineH + pad );

	// Canvas size: window + padding, optionally grown to a target aspect ratio
	// with the window centred (social-ready output).
	const outer = Math.round(
		( 'number' === typeof params.padding ? params.padding : 44 ) * SS
	);
	let W = winW + outer * 2,
		H = winH + outer * 2;
	const target = ASPECTS[ params.aspect ];
	if ( target ) {
		if ( W / H < target ) {
			W = Math.round( H * target );
		} else {
			H = Math.round( W / target );
		}
	}
	const X = Math.round( ( W - winW ) / 2 ),
		Y = Math.round( ( H - winH ) / 2 );

	const c = document.createElement( 'canvas' );
	c.width = W;
	c.height = H;
	const g = c.getContext( '2d' );
	paintBackground( g, W, H, params.bg );

	const r = Math.round( 10 * SS );
	g.save();
	if ( false !== params.shadow ) {
		g.shadowColor = 'rgba(0,0,0,0.38)';
		g.shadowBlur = 42 * SS;
		g.shadowOffsetY = 20 * SS;
	}
	roundRect( g, X, Y, winW, winH, r );
	g.fillStyle = th.win;
	g.fill();
	g.restore();

	g.save();
	roundRect( g, X, Y, winW, winH, r );
	g.clip();
	if ( titleH ) {
		g.fillStyle = th.title;
		g.fillRect( X, Y, winW, titleH );
		if ( 'plain' !== params.window ) {
			const midY = Y + titleH / 2,
				dr = Math.round( 6 * SS );
			let dx = X + pad;
			[ '#ff5f56', '#ffbd2e', '#27c93f' ].forEach( ( col ) => {
				g.beginPath();
				g.arc( dx + dr, midY, dr, 0, Math.PI * 2 );
				g.fillStyle = col;
				g.fill();
				dx += dr * 2 + 8 * SS;
			} );
		}
		const title = ( params.title || '' ).trim();
		if ( title ) {
			g.font = '700 ' + Math.round( fs * 0.74 ) + 'px ' + STACK;
			g.fillStyle = th.gutter;
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			g.fillText( title, X + winW / 2, Y + titleH / 2 );
		}
	}

	const cx = X + gutterW + pad,
		cy0 = Y + titleH + pad;
	// Row bands: diff add/del tints with an accent bar, plus a highlight band.
	const hiBand =
		false === th.dark ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.09)';
	for ( let i = 0; i < lines.length; i++ ) {
		const y = cy0 + i * lineH,
			dt = types && types[ i ];
		if ( 'add' === dt ) {
			g.fillStyle = 'rgba(46,160,67,0.18)';
			g.fillRect( X, y, winW, lineH );
			g.fillStyle = '#2ea043';
			g.fillRect( X, y, 3 * SS, lineH );
		} else if ( 'del' === dt ) {
			g.fillStyle = 'rgba(248,81,73,0.16)';
			g.fillRect( X, y, winW, lineH );
			g.fillStyle = '#f85149';
			g.fillRect( X, y, 3 * SS, lineH );
		}
		if ( hi.has( i + 1 ) ) {
			g.fillStyle = hiBand;
			g.fillRect( X, y, winW, lineH );
		}
	}

	g.textBaseline = 'middle';
	if ( showNums ) {
		g.font = font;
		g.textAlign = 'right';
		g.fillStyle = th.gutter;
		for ( let i = 0; i < lines.length; i++ ) {
			g.globalAlpha = focus && ! hi.has( i + 1 ) ? 0.35 : 1;
			g.fillText(
				String( i + 1 ),
				X + gutterW - pad * 0.4,
				cy0 + i * lineH + lineH / 2
			);
		}
		g.globalAlpha = 1;
	}
	g.font = font;
	g.textAlign = 'left';
	for ( let i = 0; i < lines.length; i++ ) {
		g.globalAlpha = focus && ! hi.has( i + 1 ) ? 0.35 : 1;
		let x = cx;
		const y = cy0 + i * lineH + lineH / 2;
		for ( const run of lines[ i ] ) {
			g.fillStyle = th[ run.key ] || th.text;
			g.fillText( run.text, x, y );
			x += run.text.length * charW;
		}
	}
	g.globalAlpha = 1;
	g.restore();
	return c;
}
