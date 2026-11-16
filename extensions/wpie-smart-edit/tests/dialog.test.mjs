/** DOM lifecycle checks with real UI builders; raster/picker seams are doubles. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as pause } from 'node:timers/promises';

const require = createRequire( import.meta.url );
const { JSDOM } = require( 'jsdom' );
const build = process.env.WPIE_SMART_EDIT_TEST_BUILD;
const uiSource = readFileSync( join( build, 'ui.js' ), 'utf8' );
const extensionSource = readFileSync( join( build, 'extension.js' ), 'utf8' );
const dialogCSS = readFileSync(
	new URL( '../../../src/styles/editor/modals.css', import.meta.url ),
	'utf8'
);
const extensionCSS = readFileSync(
	new URL( '../style.css', import.meta.url ),
	'utf8'
);

function fixture() {
	const dom = new JSDOM(
		'<html lang="en"><body><div id="wpie-root"></div></body></html>',
		{ runScripts: 'outside-only', pretendToBeVisual: true }
	);
	const { window } = dom,
		{ document } = window;
	Object.defineProperties( window.HTMLElement.prototype, {
		clientWidth: {
			get() {
				return this.classList.contains( 'wpiese-view' ) ? 700 : 0;
			},
		},
		clientHeight: {
			get() {
				return this.classList.contains( 'wpiese-view' ) ? 500 : 0;
			},
		},
	} );
	const styles = document.createElement( 'style' );
	styles.textContent = dialogCSS + '\n' + extensionCSS;
	document.head.appendChild( styles );
	const errors = [],
		calls = [],
		renders = [],
		mounts = new Set();
	window.addEventListener( 'error', ( e ) => errors.push( e.error ) );
	window.ResizeObserver = class {
		observe() {}
		disconnect() {}
	};
	window.HTMLCanvasElement.prototype.getContext = function () {
		return ( this._ctx ||= {
			clearRect() {},
			drawImage( source ) {
				this.source = source;
			},
			setTransform() {},
			setLineDash() {},
			strokeRect() {},
			measureText( text ) {
				return {
					width: text.length * 8,
					actualBoundingBoxAscent: 10,
					actualBoundingBoxDescent: 3,
				};
			},
		} );
	};
	const text = ( id, extra = {} ) => ( {
		id,
		name: id,
		type: 'text',
		text: id,
		fontFamily: 'Arial',
		fontSize: 12,
		weight: 700,
		italic: true,
		color: '#ff0000',
		x: 20,
		y: 20,
		w: 100,
		h: 20,
		lineHeight: 1.05,
		fillType: 'solid',
		...extra,
	} );
	const editor = {
		state: {
			doc: { w: 800, h: 600, bg: '#ffffff' },
			layers: [
				text( 'heading' ),
				text( 'body', { weight: 400, y: 80 } ),
				{
					id: 'box',
					name: 'Box',
					type: 'shape',
					shape: 'rect',
					x: 200,
					y: 200,
					w: 100,
					h: 50,
					radius: 20,
					fill: '#0000ff',
				},
			],
			selectedIds: [ 'heading' ],
		},
		dispatch( action ) {
			calls.push( action );
			if ( action.type === 'UPDATE_LAYERS' ) {
				editor.state = {
					...editor.state,
					layers: editor.state.layers.map( ( l ) =>
						action.ids.includes( l.id )
							? { ...l, ...action.patchFor( l ) }
							: l
					),
				};
			}
			if ( action.type === 'SET_DOC' ) {
				editor.state = {
					...editor.state,
					doc: { ...editor.state.doc, ...action.doc },
				};
			}
		},
		commit( label ) {
			calls.push( { type: 'COMMIT', label } );
		},
	};
	const mount = ( host, props, type ) => {
		const input = document.createElement( 'input' );
		input.dataset.mockPicker = type;
		input.value = props.value || props.color || '';
		input.onchange = () => props.onChange( input.value );
		host.appendChild( input );
		mounts.add( input );
		return {
			unmount() {
				mounts.delete( input );
				input.remove();
			},
		};
	};
	window.eval( uiSource );
	const menus = {};
	window.WPIE = {
		locale: 'en',
		api: {
			registerMenuItem( menuId, item ) {
				menus[ menuId ] = item;
			},
		},
		bridge: {
			ui: {
				...window.WPIE_TEST_UI,
				opts: window.WPIE_TEST_UI.optGrid,
				opt: window.WPIE_TEST_UI.optBtn,
			},
			fonts: { async ensureFontsForLayers() {} },
			components: {
				mountFontPicker: ( host, props ) =>
					mount( host, props, 'font' ),
				mountColorButton: ( host, props ) =>
					mount( host, props, 'color' ),
			},
			raster: {
				async renderToCanvas( doc, layers ) {
					const canvas = document.createElement( 'canvas' );
					renders.push( { doc, layers, canvas } );
					canvas.width = doc.w;
					canvas.height = doc.h;
					return canvas;
				},
			},
		},
	};
	window.eval( extensionSource );
	const button = ( label ) =>
		[ ...document.querySelectorAll( 'button' ) ].find(
			( b ) => b.textContent.trim() === label
		);
	const input = ( selector, value, event = 'input' ) => {
		const el = document.querySelector( selector );
		assert.ok( el, selector );
		el.value = value;
		el.dispatchEvent( new window.Event( event, { bubbles: true } ) );
		return el;
	};
	return {
		dom,
		window,
		document,
		editor,
		calls,
		renders,
		mounts,
		errors,
		button,
		input,
		menus,
		open: ( menuId = 'extensions' ) =>
			menus[ menuId ].run( {
				editor: { state: editor.state, live: editor },
				extras: {
					toasts: { error: ( message ) => errors.push( message ) },
				},
			} ),
	};
}

async function ready( f ) {
	for ( let i = 0; i < 60; i++ ) {
		await pause( 20 );
		if (
			f.document.querySelector( '.wpiese-status' )?.textContent !==
			'Preparing preview'
		) {
			break;
		}
	}
	assert.deepEqual( f.errors, [] );
	assert.doesNotMatch(
		f.document.querySelector( '.wpiese-status' ).textContent,
		/could not|Preparing/
	);
}

test( 'shared dialog styles keep the panels in a row with independent scrolling', () => {
	const f = fixture();
	try {
		f.open();
		const style = ( selector ) =>
			f.window.getComputedStyle( f.document.querySelector( selector ) );
		assert.equal( style( '.wpiese-body' ).flexDirection, 'row' );
		assert.equal( style( '.wpiese-body' ).overflow, 'hidden' );
		assert.equal( style( '.wpiese-left' ).overflowY, 'auto' );
		assert.equal( style( '.wpiese-side' ).overflowY, 'auto' );
		f.button( 'Cancel' ).click();
	} finally {
		f.dom.window.close();
	}
} );

test( 'dialog previews scoped typography and cancels without touching the document', async () => {
	const f = fixture();
	try {
		const original = f.editor.state;
		f.open();
		await ready( f );
		assert.ok( f.document.querySelector( '.dsm-badge' ) );
		assert.ok( f.button( 'Apply changes' ).disabled );
		f.input( '.wpiese-left select', 'selection', 'change' );
		await ready( f );
		f.input( '#wpiese-size', '24' );
		await ready( f );
		assert.ok( ! f.button( 'Apply changes' ).disabled );
		assert.equal( f.renders.at( -1 ).layers[ 0 ].fontSize, 24 );
		assert.equal( f.renders.at( -1 ).layers[ 1 ].fontSize, 12 );
		assert.equal( f.calls.length, 0 );
		f.button( 'Cancel' ).click();
		assert.strictEqual( f.editor.state, original );
		assert.equal( f.mounts.size, 0 );
		assert.equal( f.document.querySelector( '.wpiese-dialog' ), null );
	} finally {
		f.dom.window.close();
	}
} );

test( 'family variants, exclusions and shared pickers apply in a single history entry', async () => {
	const f = fixture();
	try {
		f.open();
		await ready( f );
		const variants = f.document.querySelectorAll(
			'.wpiese-variants .dsm-pick'
		);
		assert.equal( variants.length, 2 );
		variants[ 0 ].click();
		f.input( '[data-mock-picker="font"]', 'Inter', 'change' );
		f.input( '#wpiese-weight', '500', 'change' );
		f.input( '[data-mock-picker="color"]', '#ffffff', 'change' );
		await ready( f );
		f.button( 'Shapes' ).click();
		f.input( '#wpiese-radius', '30' );
		await ready( f );
		f.document.querySelector( '.wpiese-member' ).click();
		await ready( f );
		f.button( 'Apply changes' ).click();
		assert.equal( f.editor.state.layers[ 0 ].fontFamily, 'Inter' );
		assert.equal( f.editor.state.layers[ 0 ].weight, 500 );
		assert.equal( f.editor.state.layers[ 0 ].color, '#ffffff' );
		assert.equal( f.editor.state.layers[ 1 ].fontFamily, 'Arial' );
		assert.equal( f.editor.state.layers[ 2 ].radius, 20 );
		assert.equal(
			f.calls.filter( ( c ) => c.type === 'COMMIT' ).length,
			1
		);
		assert.equal( f.document.querySelector( '.wpiese-dialog' ), null );
		assert.equal( f.mounts.size, 0 );
		assert.deepEqual( f.errors, [] );
	} finally {
		f.dom.window.close();
	}
} );

test( 'document changes invalidate pending work and refresh starts from the new document', async () => {
	const f = fixture();
	try {
		f.open();
		await ready( f );
		f.input( '#wpiese-size', '24' );
		await ready( f );
		f.editor.state = {
			...f.editor.state,
			layers: f.editor.state.layers.map( ( l ) =>
				l.id === 'heading' ? { ...l, text: 'Changed elsewhere' } : l
			),
		};
		f.button( 'Apply changes' ).click();
		assert.equal( f.calls.length, 0 );
		assert.equal(
			f.document.querySelector( '.wpiese-notice' ).hidden,
			false
		);
		f.button( 'Refresh analysis' ).click();
		await ready( f );
		assert.ok( f.button( 'Apply changes' ).disabled );
		assert.equal(
			f.renders.at( -1 ).layers[ 0 ].text,
			'Changed elsewhere'
		);
		f.window.document.dispatchEvent(
			new f.window.KeyboardEvent( 'keydown', {
				key: 'Escape',
				bubbles: true,
			} )
		);
		assert.equal( f.mounts.size, 0 );
		assert.equal( f.document.querySelector( '.wpiese-dialog' ), null );
	} finally {
		f.dom.window.close();
	}
} );

test( 'exploring an example, relative editing and returning to the catalog preserves staged work', async () => {
	const f = fixture();
	try {
		f.editor.state.layers[ 1 ].fontSize = 24;
		f.open();
		await ready( f );
		assert.equal(
			f.document.querySelector( '.wpiese-pick-mode' ).value,
			'explore'
		);
		f.button( 'Explore active object' ).click();
		assert.equal(
			f.document.querySelector( '.wpiese-example' ).hidden,
			false
		);
		assert.match(
			f.document.querySelector( '.wpiese-example' ).textContent,
			/heading/
		);
		assert.match(
			f.document.querySelector( '.wpiese-families' ).textContent,
			/Same text style/
		);
		const family = [
			...f.document.querySelectorAll( '.wpiese-families .dsm-pick' ),
		].find( ( node ) => node.textContent.includes( 'Same font' ) );
		assert.ok( family );
		family.click();
		assert.equal(
			f.document.querySelectorAll(
				'.wpiese-families .dsm-pick[aria-pressed="true"]'
			).length,
			1
		);
		f.input( '#wpiese-size-mode', 'percent', 'change' );
		f.input( '#wpiese-size', '25' );
		await ready( f );
		assert.deepEqual(
			Array.from(
				f.renders.at( -1 ).layers.slice( 0, 2 ),
				( l ) => l.fontSize
			),
			[ 15, 30 ]
		);
		f.button( 'Show all families' ).click();
		assert.equal(
			f.document.querySelector( '.wpiese-example' ).hidden,
			true
		);
		assert.equal(
			f.document.querySelector( '#wpiese-size-mode' ).value,
			'percent'
		);
		f.document.querySelectorAll( '.wpiese-member' )[ 1 ].click();
		await ready( f );
		assert.deepEqual(
			Array.from(
				f.renders.at( -1 ).layers.slice( 0, 2 ),
				( l ) => l.fontSize
			),
			[ 15, 24 ]
		);
		assert.equal( f.calls.length, 0 );
		f.button( 'Apply changes' ).click();
		assert.equal( f.editor.state.layers[ 0 ].fontSize, 15 );
		assert.equal( f.editor.state.layers[ 1 ].fontSize, 24 );
		assert.equal(
			f.calls.filter( ( c ) => c.type === 'COMMIT' ).length,
			1
		);
	} finally {
		f.dom.window.close();
	}
} );

test( 'stroke width alone previews and applies the default color without picking it', async () => {
	const f = fixture();
	try {
		f.editor.state.layers = f.editor.state.layers.filter(
			( l ) => l.id === 'box'
		);
		const original = f.editor.state.layers[ 0 ];
		f.open();
		await ready( f );
		f.input( '#wpiese-strokeW', '8' );
		await ready( f );
		assert.equal( f.renders.at( -1 ).layers[ 0 ].strokeW, 8 );
		assert.equal( f.renders.at( -1 ).layers[ 0 ].stroke, '#000000' );
		assert.strictEqual( f.editor.state.layers[ 0 ], original );
		f.button( 'Apply changes' ).click();
		assert.equal( f.editor.state.layers[ 0 ].strokeW, 8 );
		assert.equal( f.editor.state.layers[ 0 ].stroke, '#000000' );
		assert.equal(
			f.calls.filter( ( a ) => a.type === 'COMMIT' ).length,
			1
		);
	} finally {
		f.dom.window.close();
	}
} );

test( 'dimension fields show two decimals without rounding untouched or relative geometry', async () => {
	const f = fixture();
	try {
		const box = {
			...f.editor.state.layers.find( ( l ) => l.id === 'box' ),
			w: 233.33333333333334,
			h: 147.77777777777777,
		};
		f.editor.state.layers = [ box ];
		f.open();
		await ready( f );
		assert.equal( f.document.querySelector( '#wpiese-w' ).value, '233.33' );
		assert.equal( f.document.querySelector( '#wpiese-h' ).value, '147.78' );
		f.document.querySelector( '#wpiese-w' ).focus();
		f.document.querySelector( '#wpiese-h' ).focus();
		assert.ok( f.button( 'Apply changes' ).disabled );
		f.input( '#wpiese-strokeW', '4' );
		await ready( f );
		assert.equal( f.renders.at( -1 ).layers[ 0 ].w, box.w );
		assert.equal( f.renders.at( -1 ).layers[ 0 ].h, box.h );
		f.input( '#wpiese-w-mode', 'percent', 'change' );
		f.input( '#wpiese-w', '10' );
		await ready( f );
		assert.equal( f.renders.at( -1 ).layers[ 0 ].w, box.w * 1.1 );
		f.input( '#wpiese-w-mode', 'set', 'change' );
		await ready( f );
		assert.equal( f.document.querySelector( '#wpiese-w' ).value, '233.33' );
		f.button( 'Apply changes' ).click();
		assert.equal( f.editor.state.layers[ 0 ].w, box.w );
		assert.equal( f.editor.state.layers[ 0 ].h, box.h );
	} finally {
		f.dom.window.close();
	}
} );

test( 'the change list toggles and removes individual edits across families', async () => {
	const f = fixture();
	try {
		f.open();
		await ready( f );
		f.input( '#wpiese-size', '20' );
		await ready( f );
		f.button( 'Shapes' ).click();
		f.input( '#wpiese-strokeW', '3' );
		await ready( f );
		const toggle = () =>
			f.document.querySelector(
				'.wpiese-change[data-property="size"] input'
			);
		toggle().click();
		await ready( f );
		assert.equal( f.renders.at( -1 ).layers[ 0 ].fontSize, 12 );
		assert.equal( f.renders.at( -1 ).layers[ 2 ].strokeW, 3 );
		toggle().click();
		await ready( f );
		assert.equal( f.renders.at( -1 ).layers[ 0 ].fontSize, 20 );
		f.document
			.querySelector( '.wpiese-change[data-property="strokeW"] button' )
			.click();
		await ready( f );
		assert.equal( f.renders.at( -1 ).layers[ 2 ].strokeW, undefined );
		assert.equal(
			f.document.querySelectorAll( '.wpiese-change' ).length,
			1
		);
		f.button( 'Apply changes' ).click();
		assert.equal( f.editor.state.layers[ 0 ].fontSize, 20 );
		assert.equal(
			f.calls.filter( ( a ) => a.type === 'COMMIT' ).length,
			1
		);
	} finally {
		f.dom.window.close();
	}
} );

test( 'linked dimensions update the other field and can be disabled as one change', async () => {
	const f = fixture();
	try {
		f.editor.state.layers = f.editor.state.layers.filter(
			( l ) => l.id === 'box'
		);
		f.open();
		await ready( f );
		f.button( 'Keep proportions' ).click();
		f.input( '#wpiese-w', '200' );
		await ready( f );
		assert.equal( f.document.querySelector( '#wpiese-h' ).value, '100' );
		assert.equal( f.renders.at( -1 ).layers[ 0 ].h, 100 );
		f.document
			.querySelector( '.wpiese-change[data-property="w"] input' )
			.click();
		await ready( f );
		const displayed = f.document
			.querySelector( '.wpiese-canvas' )
			.getContext( '2d' ).source;
		const original = f.renders.find( ( r ) => r.canvas === displayed );
		assert.equal( original.layers[ 0 ].w, 100 );
		assert.equal( original.layers[ 0 ].h, 50 );
		assert.ok( f.button( 'Apply changes' ).disabled );
		f.input( '#wpiese-h-mode', 'percent', 'change' );
		f.input( '#wpiese-h', '20' );
		await ready( f );
		assert.equal( f.renders.at( -1 ).layers[ 0 ].w, 120 );
		assert.equal( f.renders.at( -1 ).layers[ 0 ].h, 60 );
		assert.equal(
			f.document.querySelectorAll( '.wpiese-change' ).length,
			1
		);
		f.button( 'Cancel' ).click();
	} finally {
		f.dom.window.close();
	}
} );

test( 'similarity changes preserve earlier matches and their exclusion while finding more objects', async () => {
	const f = fixture();
	try {
		const base = f.editor.state.layers[ 0 ];
		f.editor.state.layers = [
			{ ...base, fontSize: 24 },
			{ ...base, id: 'near', fontSize: 24.3 },
			{ ...base, id: 'broader', fontSize: 25.2 },
		];
		f.open();
		await ready( f );
		f.button( 'Explore active object' ).click();
		const similar = () =>
			Array.from(
				f.document.querySelectorAll( '.wpiese-families button' )
			).find( ( b ) => b.textContent.includes( 'Similar typography' ) );
		similar().click();
		assert.equal(
			f.document.querySelectorAll( '.wpiese-member' ).length,
			2
		);
		f.document.querySelectorAll( '.wpiese-member' )[ 1 ].click();
		f.input( '#wpiese-size', '40' );
		await ready( f );
		f.input( '#wpiese-similarity', 'broad', 'change' );
		assert.equal(
			f.document.querySelectorAll( '.wpiese-member' ).length,
			3
		);
		assert.equal( f.renders.at( -1 ).layers[ 0 ].fontSize, 40 );
		assert.equal( f.renders.at( -1 ).layers[ 1 ].fontSize, 24.3 );
		assert.equal( f.renders.at( -1 ).layers[ 2 ].fontSize, 25.2 );
		f.input( '#wpiese-similarity', 'close', 'change' );
		assert.equal(
			f.document.querySelectorAll(
				'.wpiese-member[aria-pressed="false"]'
			).length,
			1
		);
		f.button( 'Cancel' ).click();
	} finally {
		f.dom.window.close();
	}
} );

test( 'example selection transfers one property into the preview and honors exclusions', async () => {
	const f = fixture();
	try {
		const box = f.editor.state.layers.find( ( l ) => l.id === 'box' );
		// Shapes group by how they look (1.2): the box and its twin in
		// another color and size are one family, the example with other
		// corners and an outline is a shape of its own.
		f.editor.state.layers = [
			box,
			{ ...box, id: 'twin', name: 'Twin', fill: '#00aa00', w: 60 },
			{
				...box,
				id: 'source',
				name: 'Example',
				fill: '#ff0000',
				stroke: '#00ff00',
				strokeW: 5,
				radius: 8,
			},
		];
		f.open();
		await ready( f );
		f.document.querySelectorAll( '.wpiese-member' )[ 1 ].click();
		f.input( '.wpiese-sample-source', 'source', 'change' );
		const part = ( label ) =>
			Array.from(
				f.document.querySelectorAll( '.wpiese-sample-parts button' )
			).find( ( b ) => b.textContent.trim() === label );
		part( 'Stroke' ).click();
		await ready( f );
		assert.equal( f.renders.at( -1 ).layers[ 0 ].stroke, '#00ff00' );
		assert.equal( f.renders.at( -1 ).layers[ 0 ].strokeW, 5 );
		assert.equal( f.renders.at( -1 ).layers[ 0 ].fill, '#0000ff' );
		assert.equal( f.renders.at( -1 ).layers[ 0 ].radius, 20 );
		assert.equal( f.calls.length, 0 );
		f.button( 'Pick example on canvas' ).click();
		assert.ok( f.document.querySelector( '.wpiese-pick-mode' ).disabled );
		f.button( 'Related elements' ).click();
		assert.ok( ! f.document.querySelector( '.wpiese-pick-mode' ).disabled );
		f.button( 'Shapes' ).click();
		part( 'Corner radius' ).click();
		await ready( f );
		assert.equal( f.renders.at( -1 ).layers[ 0 ].radius, 8 );
		f.button( 'Apply changes' ).click();
		assert.equal( f.editor.state.layers[ 0 ].strokeW, 5 );
		assert.equal( f.editor.state.layers[ 0 ].radius, 8 );
		// The excluded twin keeps its own look.
		assert.equal( f.editor.state.layers[ 1 ].radius, 20 );
		assert.equal( f.editor.state.layers[ 1 ].strokeW, undefined );
		assert.equal(
			f.calls.filter( ( a ) => a.type === 'COMMIT' ).length,
			1
		);
	} finally {
		f.dom.window.close();
	}
} );

test( 'switching numeric modes and clearing an adjustment remove the old operation', async () => {
	const f = fixture();
	try {
		f.open();
		await ready( f );
		f.input( '#wpiese-size', '30' );
		await ready( f );
		f.input( '#wpiese-size-mode', 'add', 'change' );
		await ready( f );
		assert.ok( f.button( 'Apply changes' ).disabled );
		assert.equal( f.document.querySelector( '#wpiese-size' ).value, '0' );
		f.input( '#wpiese-size', '-2' );
		await ready( f );
		assert.equal( f.renders.at( -1 ).layers[ 0 ].fontSize, 10 );
		f.input( '#wpiese-size', '' );
		await ready( f );
		assert.ok( f.button( 'Apply changes' ).disabled );
		f.button( 'Cancel' ).click();
		assert.equal( f.editor.state.layers[ 0 ].fontSize, 12 );
		assert.equal( f.calls.length, 0 );
	} finally {
		f.dom.window.close();
	}
} );

test( 'single objects wait folded below what repeats', async () => {
	const f = fixture();
	try {
		const box = f.editor.state.layers.find( ( l ) => l.id === 'box' );
		f.editor.state.layers = [
			box,
			{ ...box, id: 'twin', fill: '#00aa00', x: 400 },
			{ ...box, id: 'odd', radius: 0, y: 400 },
		];
		f.open();
		await ready( f );
		f.button( 'Shapes' ).click();
		const cards = () =>
			f.document.querySelectorAll( '.wpiese-families .dsm-pick' ).length;
		assert.equal( cards(), 1 );
		const toggle = f.button( 'Single objects (1)' );
		assert.ok( toggle );
		assert.equal( toggle.getAttribute( 'aria-expanded' ), 'false' );
		toggle.click();
		assert.equal( cards(), 2 );
		assert.equal(
			f.button( 'Single objects (1)' ).getAttribute( 'aria-expanded' ),
			'true'
		);
	} finally {
		f.dom.window.close();
	}
} );

test( 'a family goes to the editor as a selection, without its exclusions', async () => {
	const f = fixture();
	try {
		f.open();
		await ready( f );
		// Both texts are body text of one role.
		assert.match(
			f.document.querySelector( '.wpiese-families' ).textContent,
			/Body text/
		);
		f.input( '#wpiese-size', '30' );
		await ready( f );
		assert.ok( f.button( 'Select in document' ).disabled );
		f.button( 'Reset all changes' ).click();
		await ready( f );
		assert.ok( ! f.button( 'Select in document' ).disabled );
		f.document.querySelectorAll( '.wpiese-member' )[ 1 ].click();
		f.button( 'Select in document' ).click();
		const picked = f.calls.find( ( c ) => c.type === 'SET_SELECTED' );
		assert.deepEqual( Array.from( picked.ids ), [ 'heading' ] );
		assert.equal( f.document.querySelector( '.wpiese-dialog' ), null );
		assert.equal(
			f.calls.filter( ( c ) => c.type === 'COMMIT' ).length,
			0
		);
	} finally {
		f.dom.window.close();
	}
} );

test( 'the Layer menu opens Smart Edit on the active object', async () => {
	const f = fixture();
	try {
		assert.ok( f.menus.layer, 'registered in the Layer menu' );
		assert.ok(
			! f.menus.layer.when( { editor: { state: { activeId: null } } } )
		);
		f.editor.state = { ...f.editor.state, activeId: 'box' };
		f.open( 'layer' );
		await ready( f );
		const example = f.document.querySelector( '.wpiese-example' );
		assert.equal( example.hidden, false );
		assert.match( example.textContent, /Box/ );
	} finally {
		f.dom.window.close();
	}
} );
