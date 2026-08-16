/**
 * Code Shot - WunderPaint extension entry.
 *
 * Turn a code snippet into a framed, syntax-highlighted image and drop it in as
 * a re-editable layer. Highlighting runs locally (highlight.js). The code and
 * the title accept {{binding}} tokens, and the generator's resolve hook expands
 * them per post context, so a design works as a dynamic featured image.
 */

import { bakeCanvas, ensureFont } from './render.js';
import { LANGUAGES } from './languages.js';
import { THEME_LIST } from './themes.js';
import { t } from './i18n.js';

const GEN_ID = 'wpie-code-shot/code';

// The editor's brand mark - every studio badges with it, verbatim.
const ICON_BRAND =
	'<svg width="24" height="24" viewBox="0 0 18.83 18.83" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.84,18.83H3.62c-2,0-3.62-1.62-3.62-3.62V3.52h1.72c.7,0,1.28.57,1.28,1.28v10.43c0,.34.28.62.62.62h8.94c.71,0,1.29.58,1.29,1.29v1.71Z"/><path fill="#3b66ff" d="M18.83,14.02h-1.71c-.71,0-1.29-.58-1.29-1.29V3.62c0-.34-.28-.62-.62-.62H4.82c-.7,0-1.28-.57-1.28-1.28V0h11.67c2,0,3.62,1.62,3.62,3.62v10.4Z"/><circle fill="currentColor" cx="17.33" cy="17.33" r="1.5"/><path fill="#3b66ff" d="M9.51,5.71l.91,2.45c.03.08.09.14.17.17l2.45.91c.07.03.07.13,0,.16l-2.45.91c-.08.03-.14.09-.17.17l-.91,2.45c-.03.07-.13.07-.16,0l-.91-2.45c-.03-.08-.09-.14-.17-.17l-2.45-.91c-.07-.03-.07-.13,0-.16l2.45-.91c.08-.03.14-.09.17-.17l.91-2.45c.03-.07.13-.07.16,0Z"/></svg>';
const svg = ( d ) =>
	'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
	d +
	'</svg>';
const ICONS = {
	code: svg(
		'<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'
	),
	window: svg(
		'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><circle cx="6.5" cy="6.5" r="0.6"/><circle cx="9" cy="6.5" r="0.6"/>'
	),
	palette: svg(
		'<circle cx="13.5" cy="6.5" r="1"/><circle cx="17" cy="10" r="1"/><circle cx="8" cy="7" r="1"/><circle cx="6.5" cy="11.5" r="1"/><path d="M12 2a10 10 0 1 0 0 20c1 0 1.5-.8 1.5-1.5 0-1.6-1.5-1.6-1.5-3 0-1 .8-1.5 1.8-1.5H16a4 4 0 0 0 4-4c0-4.5-3.6-8-8-8z"/>'
	),
	image: svg(
		'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'
	),
	emphasis: svg(
		'<path d="M4 7h10M4 12h16M4 17h7"/><rect x="15" y="9.4" width="6" height="5.2" rx="1"/>'
	),
};

const SAMPLE = [
	'// Greet everyone in the room',
	'function greet( names ) {',
	'  return names',
	'    .map( ( n ) => `Hello, ${ n }!` )',
	"    .join( '\\n' );",
	'}',
	'',
	"greet( [ 'Ada', 'Grace', 'Linus' ] );",
].join( '\n' );

const DEFAULTS = {
	code: SAMPLE,
	language: 'auto',
	theme: 'dracula',
	window: 'mac',
	title: '',
	lineNumbers: true,
	fontSize: 15,
	tabSize: 2,
	padding: 44,
	shadow: true,
	bg: { mode: 'gradient', color: '#6366f1', color2: '#ec4899' },
	highlight: '',
	focus: false,
	diff: false,
	aspect: 'auto',
};

const EXT_BY_SUFFIX = {
	js: 'javascript',
	mjs: 'javascript',
	jsx: 'javascript',
	ts: 'typescript',
	tsx: 'typescript',
	html: 'xml',
	xml: 'xml',
	vue: 'xml',
	svg: 'xml',
	css: 'css',
	scss: 'css',
	php: 'php',
	py: 'python',
	json: 'json',
	sh: 'bash',
	bash: 'bash',
	zsh: 'bash',
	sql: 'sql',
	java: 'java',
	go: 'go',
	rs: 'rust',
	c: 'c',
	h: 'c',
	cpp: 'cpp',
	cc: 'cpp',
	hpp: 'cpp',
	yml: 'yaml',
	yaml: 'yaml',
	md: 'markdown',
	markdown: 'markdown',
	rb: 'ruby',
};

function baseUrl() {
	const boot = window.WPIE || {};
	const own = ( boot.extensions || [] ).find(
		( e ) => e && 'wpie-code-shot' === e.slug
	);
	return own && own.main
		? String( own.main ).replace( /extension\.js([?#].*)?$/, '' )
		: '';
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
		toast( t( 'Code Shot needs a newer WunderPaint.' ), 'error' );
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
				bg: { ...DEFAULTS.bg, ...( layer.generator.params.bg || {} ) },
		  }
		: { ...DEFAULTS, bg: { ...DEFAULTS.bg } };

	const swatches = []; // { unmount }
	const modal = ui.dialog( {
		title: t( 'Code Shot' ),
		subtitle: editing
			? t( 'Edit this code image and update the layer.' )
			: t( 'Turn code into a beautiful, re-editable image.' ),
		width: 1180,
		closeOnBackdrop: true,
		onClose: () => cleanup(),
	} );
	const badge = document.createElement( 'span' );
	badge.className = 'dsm-badge';
	badge.innerHTML = ICON_BRAND;
	modal.head.insertBefore( badge, modal.head.firstChild );

	const body = ui.el( 'div', 'wpie-cs-body', modal.body );
	const left = ui.el( 'div', 'wpie-cs-left', body );
	const view = ui.el( 'div', 'wpie-cs-view', body );
	const side = ui.el( 'div', 'wpie-cs-side', body );

	ensureFont( baseUrl() ).then( ( ok ) => {
		if ( ok ) {
			rebuild();
		}
	} );

	// ---------------- LEFT: content ----------------
	const codeCard = ui.section( left, {
		icon: ICONS.code,
		title: t( 'Code' ),
	} );
	const codeInput = ui.el( 'textarea', 'wpie-cs-code', codeCard );
	codeInput.value = params.code;
	codeInput.spellcheck = false;
	codeInput.wrap = 'off';
	codeInput.setAttribute( 'aria-label', t( 'Code' ) );
	codeInput.oninput = () => {
		params.code = codeInput.value;
		queueRebuild();
	};

	const codeTools = ui.el( 'div', 'wpie-cs-tools', codeCard );
	const langRow = ui.row( codeTools, t( 'Language' ) );
	ui.select( langRow, {
		options: LANGUAGES.map( ( l ) => ( {
			value: l.id,
			label: t( l.label ),
		} ) ),
		value: params.language,
		onChange: ( v ) => {
			params.language = v;
			rebuild();
		},
	} );
	const langEl = langRow.querySelector( 'select' );

	// Dynamic-variable button for the code field ( {{binding}} tokens ).
	if ( bridge.components && bridge.components.mountVarButton ) {
		const varRow = ui.row( codeTools, t( 'Dynamic' ) );
		const varHost = document.createElement( 'div' );
		varRow.appendChild( varHost );
		swatches.push(
			bridge.components.mountVarButton( varHost, {
				getValue: () => codeInput.value,
				onChange: ( v ) => {
					codeInput.value = v;
					params.code = v;
					queueRebuild();
				},
				inputEl: codeInput,
			} )
		);
	}

	// Import a file.
	const importRow = ui.el( 'div', 'wpie-cs-import', codeCard );
	const fileInput = ui.el( 'input', '', importRow );
	fileInput.type = 'file';
	fileInput.style.display = 'none';
	fileInput.accept =
		'.js,.mjs,.jsx,.ts,.tsx,.html,.xml,.css,.scss,.php,.py,.json,.sh,.sql,.java,.go,.rs,.c,.h,.cpp,.cc,.hpp,.yml,.yaml,.md,.rb,.txt';
	ui.btn( importRow, {
		label: t( 'Import file' ),
		onClick: () => fileInput.click(),
	} );
	fileInput.onchange = () => {
		const f = fileInput.files && fileInput.files[ 0 ];
		if ( ! f ) {
			return;
		}
		const fr = new FileReader();
		fr.onload = () => {
			codeInput.value = String( fr.result || '' );
			params.code = codeInput.value;
			const suf = ( f.name.split( '.' ).pop() || '' ).toLowerCase();
			if ( EXT_BY_SUFFIX[ suf ] ) {
				params.language = EXT_BY_SUFFIX[ suf ];
				if ( langEl ) {
					langEl.value = params.language;
				}
			}
			if ( ! params.title ) {
				params.title = f.name;
				titleInput.value = f.name;
			}
			rebuild();
		};
		fr.readAsText( f );
	};

	// Window title (also dynamic).
	const titleCard = ui.section( left, {
		icon: ICONS.window,
		title: t( 'Window title' ),
	} );
	const titleRow = ui.el( 'div', 'wpie-cs-titlerow', titleCard );
	const titleInput = ui.el( 'input', 'dsm-input', titleRow );
	titleInput.type = 'text';
	titleInput.value = params.title;
	titleInput.placeholder = t( 'e.g. index.js (optional)' );
	titleInput.oninput = () => {
		params.title = titleInput.value;
		queueRebuild();
	};
	if ( bridge.components && bridge.components.mountVarButton ) {
		const tVarHost = document.createElement( 'div' );
		titleRow.appendChild( tVarHost );
		swatches.push(
			bridge.components.mountVarButton( tVarHost, {
				getValue: () => titleInput.value,
				onChange: ( v ) => {
					titleInput.value = v;
					params.title = v;
					queueRebuild();
				},
				inputEl: titleInput,
			} )
		);
	}
	ui.el(
		'p',
		'dsm-hint',
		titleCard,
		t(
			'Insert {{fields}} to pull code or a title from your posts. Highlighting runs locally.'
		)
	);

	// ---------------- MIDDLE: preview ----------------
	let previewEl = null;
	function rebuild() {
		const canvas = bakeCanvas( params );
		canvas.className = 'wpie-cs-canvas';
		if ( previewEl && previewEl.parentNode ) {
			previewEl.parentNode.replaceChild( canvas, previewEl );
		} else {
			view.appendChild( canvas );
		}
		previewEl = canvas;
		renderStatus();
	}
	let rebuildTimer = 0;
	function queueRebuild() {
		if ( rebuildTimer ) {
			clearTimeout( rebuildTimer );
		}
		rebuildTimer = setTimeout( rebuild, 130 );
	}

	// ---------------- RIGHT: style ----------------
	const styleCard = ui.section( side, {
		icon: ICONS.palette,
		title: t( 'Appearance' ),
	} );
	ui.select( ui.row( styleCard, t( 'Theme' ) ), {
		options: THEME_LIST.map( ( x ) => ( {
			value: x.id,
			label: t( x.label ),
		} ) ),
		value: params.theme,
		onChange: ( v ) => {
			params.theme = v;
			rebuild();
		},
	} );
	ui.select( ui.row( styleCard, t( 'Window' ) ), {
		options: [
			{ value: 'mac', label: t( 'macOS dots' ) },
			{ value: 'plain', label: t( 'Plain bar' ) },
			{ value: 'none', label: t( 'None' ) },
		],
		value: params.window,
		onChange: ( v ) => {
			params.window = v;
			rebuild();
		},
	} );
	ui.check( styleCard, {
		label: t( 'Line numbers' ),
		checked: params.lineNumbers !== false,
		onChange: ( v ) => {
			params.lineNumbers = v;
			rebuild();
		},
	} );
	ui.slider( styleCard, {
		label: t( 'Font size' ),
		min: 10,
		max: 28,
		step: 1,
		value: params.fontSize,
		format: ( v ) => v + ' px',
		onInput: ( v ) => {
			params.fontSize = v;
			queueRebuild();
		},
	} );
	ui.select( ui.row( styleCard, t( 'Tab size' ) ), {
		options: [
			{ value: 2, label: '2' },
			{ value: 4, label: '4' },
			{ value: 8, label: '8' },
		],
		value: params.tabSize,
		onChange: ( v ) => {
			params.tabSize = Number( v ) || 2;
			rebuild();
		},
	} );

	// Emphasis: highlight lines, focus (dim the rest), diff tinting.
	const emCard = ui.section( side, {
		icon: ICONS.emphasis,
		title: t( 'Emphasis' ),
	} );
	const hlRow = ui.row( emCard, t( 'Highlight lines' ) );
	const hlInput = ui.el( 'input', 'dsm-input', hlRow );
	hlInput.type = 'text';
	hlInput.value = params.highlight;
	hlInput.placeholder = t( 'e.g. 2-4, 7' );
	hlInput.oninput = () => {
		params.highlight = hlInput.value;
		queueRebuild();
	};
	ui.check( emCard, {
		label: t( 'Focus (dim the rest)' ),
		checked: !! params.focus,
		onChange: ( v ) => {
			params.focus = v;
			rebuild();
		},
	} );
	ui.check( emCard, {
		label: t( 'Diff mode (+/- lines)' ),
		checked: !! params.diff,
		onChange: ( v ) => {
			params.diff = v;
			rebuild();
		},
	} );
	ui.el(
		'p',
		'dsm-hint',
		emCard,
		t( 'Diff mode tints lines that start with + or -.' )
	);

	const bgCard = ui.section( side, {
		icon: ICONS.image,
		title: t( 'Background' ),
	} );
	ui.select( ui.row( bgCard, t( 'Type' ) ), {
		options: [
			{ value: 'gradient', label: t( 'Gradient' ) },
			{ value: 'solid', label: t( 'Solid colour' ) },
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
	ui.slider( bgCard, {
		label: t( 'Padding' ),
		min: 0,
		max: 120,
		step: 2,
		value: params.padding,
		format: ( v ) => v + ' px',
		onInput: ( v ) => {
			params.padding = v;
			queueRebuild();
		},
	} );
	ui.check( bgCard, {
		label: t( 'Window shadow' ),
		checked: params.shadow !== false,
		onChange: ( v ) => {
			params.shadow = v;
			rebuild();
		},
	} );
	ui.select( ui.row( bgCard, t( 'Aspect ratio' ) ), {
		options: [
			{ value: 'auto', label: t( 'Auto (fit)' ) },
			{ value: '16:9', label: '16:9' },
			{ value: '1:1', label: t( 'Square 1:1' ) },
			{ value: '4:3', label: '4:3' },
			{ value: '9:16', label: t( 'Story 9:16' ) },
		],
		value: params.aspect,
		onChange: ( v ) => {
			params.aspect = v;
			rebuild();
		},
	} );
	const bgColVis = () => {
		col1Row.parentElement.style.display =
			params.bg.mode === 'transparent' ? 'none' : '';
		col2Row.parentElement.style.display =
			params.bg.mode === 'gradient' ? '' : 'none';
	};

	// ---------------- footer ----------------
	const statusEl = ui.el( 'div', 'dsm-hint wpie-cs-status', modal.foot );
	function renderStatus() {
		const lines = ( params.code || '' ).split( '\n' ).length;
		statusEl.textContent =
			t( 'Code Shot' ) +
			'  ·  ' +
			( params.language === 'auto' ? t( 'auto' ) : params.language ) +
			'  ·  ' +
			lines +
			' ' +
			t( 'lines' );
	}
	const actions = ui.el( 'div', 'dsm-actions', modal.foot );
	ui.btn( actions, { label: t( 'Copy image' ), onClick: () => copyImage() } );
	ui.btn( actions, {
		label: t( 'Cancel' ),
		onClick: () => {
			modal.close();
			cleanup();
		},
	} );
	ui.btn( actions, {
		label: editing ? t( 'Update code shot' ) : t( 'Insert code shot' ),
		primary: true,
		onClick: () => insert(),
	} );

	async function copyImage() {
		try {
			if ( ! navigator.clipboard || ! window.ClipboardItem ) {
				toast(
					t( 'Clipboard is not available in this browser.' ),
					'error'
				);
				return;
			}
			const canvas = bakeCanvas( params );
			const blob = await new Promise( ( res ) =>
				canvas.toBlob( res, 'image/png' )
			);
			await navigator.clipboard.write( [
				new window.ClipboardItem( { 'image/png': blob } ),
			] );
			toast( t( 'Copied to clipboard.' ) );
		} catch ( e ) {
			toast( e.message || String( e ), 'error' );
		}
	}

	function insert() {
		try {
			const canvas = bakeCanvas( params );
			const url = canvas.toDataURL( 'image/png' );
			const tw = canvas.width,
				th2 = canvas.height;
			const doc = editor.getDocument
				? editor.getDocument()
				: ( editor.state && editor.state.doc ) || { w: 1200, h: 1200 };
			const store = JSON.parse( JSON.stringify( params ) );
			if ( editing ) {
				const w = layer.w,
					h = Math.max( 1, Math.round( ( layer.w * th2 ) / tw ) );
				editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: {
						src: url,
						x: layer.x,
						y: Math.round( layer.y + ( layer.h - h ) / 2 ),
						w,
						h,
						naturalW: tw,
						naturalH: th2,
						generator: { id: GEN_ID, params: store },
					},
				} );
				editor.commit( t( 'Update Code Shot' ) );
			} else {
				const { makeImage } = bridge.documents;
				const fit = Math.min(
					( doc.w * 0.92 ) / tw,
					( doc.h * 0.92 ) / th2,
					1
				);
				const w = Math.max( 1, Math.round( tw * fit ) ),
					h = Math.max( 1, Math.round( th2 * fit ) );
				const nl = makeImage( {
					name: t( 'Code Shot' ),
					x: Math.round( ( doc.w - w ) / 2 ),
					y: Math.round( ( doc.h - h ) / 2 ),
					w,
					h,
					src: url,
					naturalW: tw,
					naturalH: th2,
				} );
				nl.generator = { id: GEN_ID, params: store };
				editor.dispatch( { type: 'ADD_LAYER', layer: nl } );
				editor.commit( t( 'Insert Code Shot' ) );
			}
			toast(
				editing ? t( 'Code shot updated.' ) : t( 'Code shot inserted.' )
			);
			modal.close();
			cleanup();
		} catch ( e ) {
			toast( e.message || String( e ), 'error' );
		}
	}

	function cleanup() {
		swatches.forEach( ( s ) => s && s.unmount && s.unmount() );
		if ( rebuildTimer ) {
			clearTimeout( rebuildTimer );
		}
	}

	bgColVis();
	rebuild();
}

// -------- dynamic re-render (Pro dynamic featured images) --------
async function resolveCode( args ) {
	const params = args && args.params;
	const expandTokens = args && args.expandTokens;
	const hasTokens = args && args.hasTokens;
	if ( ! params || ! expandTokens || ! hasTokens ) {
		return null;
	}
	const codeHas = 'string' === typeof params.code && hasTokens( params.code );
	const titleHas =
		'string' === typeof params.title && hasTokens( params.title );
	if ( ! codeHas && ! titleHas ) {
		return null;
	}
	const resolved = { ...params };
	if ( codeHas ) {
		resolved.code = expandTokens( params.code );
	}
	if ( titleHas ) {
		resolved.title = expandTokens( params.title );
	}
	if ( codeHas && ! ( resolved.code || '' ).trim() ) {
		return null;
	} // no value: keep design pixels
	await ensureFont( baseUrl() );
	const out = bakeCanvas( resolved );
	return {
		src: out.toDataURL( 'image/png' ),
		naturalW: out.width,
		naturalH: out.height,
	};
}

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Code Shot',
		run: ( c ) => openStudio( c ),
		edit: ( c ) => openStudio( c ),
		resolve: ( a ) => resolveCode( a ),
	} );
}
if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else if ( window.wp && window.wp.hooks ) {
	window.wp.hooks.addAction( 'wpie.ready', 'wpie-code-shot', register );
}
