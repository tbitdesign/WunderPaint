import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorMenuBar } from './editor-menubar';
import { EditorProvider, useEditor } from '../store/editor-context';
import { makeShape, serializeLayers } from '../store/document';
import { defaultParamsFor } from '../lib/effects';
import { api, __resetExtensions } from '../lib/extensions';

global.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, editor, extras;

function Probe() {
	editor = useEditor();
	return <EditorMenuBar extras={ extras } />;
}

function item( label ) {
	const button = [ ...host.querySelectorAll( '.ed-item' ) ].find(
		( el ) => el.firstChild?.textContent === label
	);
	expect( button ).toBeTruthy();
	return button;
}

function click( element ) {
	act( () => element.click() );
}

function openPath( ...labels ) {
	click( host.querySelector( '[data-menu="filter"]' ) );
	for ( const label of labels ) {
		click( item( label ) );
	}
}

function pointer( element, type = 'pointerover', pointerType = 'mouse' ) {
	act( () => {
		const event = new MouseEvent( type, { bubbles: true } );
		Object.defineProperty( event, 'pointerType', { value: pointerType } );
		element.dispatchEvent( event );
	} );
}

async function tick( ms = 220 ) {
	await act( async () => jest.advanceTimersByTime( ms ) );
}

function escape() {
	act( () => {
		document.dispatchEvent(
			new KeyboardEvent( 'keydown', { key: 'Escape', bubbles: true } )
		);
	} );
}

beforeEach( () => {
	jest.useFakeTimers();
	jest.spyOn(
		window.HTMLElement.prototype,
		'getClientRects'
	).mockReturnValue( [ {} ] );
	host = document.createElement( 'div' );
	document.body.appendChild( host );
	root = createRoot( host );
	extras = { openEffect: jest.fn(), toasts: { error: jest.fn() } };
	act( () => {
		root.render(
			<EditorProvider
				doc={ { w: 400, h: 300 } }
				layers={ [ makeShape( { fill: '#668899' } ) ] }
				WPIE={ {} }
			>
				<Probe />
			</EditorProvider>
		);
	} );
} );

afterEach( async () => {
	act( () => root.unmount() );
	__resetExtensions();
	await tick();
	host.remove();
	jest.restoreAllMocks();
	jest.useRealTimers();
} );

it( 'previews a third-level preset without changing document or history', async () => {
	openPath( 'Presets', 'Essentials' );
	const original = editor.state;
	const saved = serializeLayers( original.layers );
	pointer( item( 'Sepia' ) );
	await tick( 100 );
	expect( editor.state.colorPreview ).toBeFalsy();
	pointer( item( 'Sepia' ), 'pointerout' );
	pointer( item( 'B&W' ) );
	await tick();
	expect( editor.state.colorPreview.layers[ 0 ].filter ).toBe( 'mono' );
	expect( editor.state.layers ).toBe( original.layers );
	expect( editor.state.doc ).toBe( original.doc );
	expect( editor.state.history ).toBe( original.history );
	expect( serializeLayers( editor.state.layers ) ).toEqual( saved );
	pointer( item( 'B&W' ), 'pointerout' );
	expect( editor.state.colorPreview ).toBeNull();
} );

it( 'uses the exact Duotone palette and the normal dialog defaults', async () => {
	openPath( 'Duotone' );
	pointer( item( 'Ocean' ) );
	await tick();
	expect( editor.state.colorPreview.layers[ 0 ].previewEffect ).toEqual( {
		id: 'duotone',
		params: { shadow: '#0b2545', highlight: '#8ecae6' },
	} );
	escape();
	openPath( 'Blur & Sharpen' );
	pointer( item( 'Gaussian Blur' ) );
	await tick();
	expect( editor.state.colorPreview.layers[ 0 ].previewEffect ).toEqual( {
		id: 'gaussian-blur',
		params: defaultParamsFor( 'gaussian-blur' ),
	} );
	click( item( 'Gaussian Blur' ) );
	expect( editor.state.colorPreview ).toBeNull();
	expect( extras.openEffect ).toHaveBeenCalledTimes( 1 );
	expect( extras.openEffect ).toHaveBeenCalledWith( 'gaussian-blur' );
	await tick();
	expect( editor.state.colorPreview ).toBeNull();
} );

it.each( [ false, true ] )(
	'cancels pending or active previews when a submenu disappears (active=%s)',
	async ( active ) => {
		openPath( 'Presets', 'Essentials' );
		pointer( item( 'Sepia' ) );
		if ( active ) {
			await tick();
		}
		// No pointerleave: keyboard/programmatic closing also releases it.
		click( item( 'Essentials' ) );
		await tick();
		expect( editor.state.colorPreview ).toBeFalsy();
		expect(
			host
				.querySelector( '[data-menu="filter"]' )
				.getAttribute( 'aria-expanded' )
		).toBe( 'true' );
	}
);

it.each( [ false, true ] )(
	'one Escape closes the filter menu and restores the layer (active=%s)',
	async ( active ) => {
		openPath( 'Color' );
		pointer( item( 'Invert' ) );
		if ( active ) {
			await tick();
		}
		escape();
		await tick();
		expect( editor.state.colorPreview ).toBeFalsy();
		expect(
			host
				.querySelector( '[data-menu="filter"]' )
				.getAttribute( 'aria-expanded' )
		).toBe( 'false' );
	}
);

it( 'clears on menu switch and layer changes', async () => {
	openPath( 'Color' );
	pointer( item( 'Invert' ) );
	await tick();
	click( host.querySelector( '[data-menu="view"]' ) );
	expect( editor.state.colorPreview ).toBeNull();
	openPath( 'Color' );
	pointer( item( 'Invert' ) );
	await tick();
	act( () => editor.dispatch( { type: 'SET_ACTIVE', id: null } ) );
	await tick();
	expect( editor.state.colorPreview ).toBeNull();
	expect( item( 'Invert' ).disabled ).toBe( true );
	pointer( item( 'Invert' ) );
	await tick();
	expect( editor.state.colorPreview ).toBeNull();
} );

it( 'applies a clicked preset once, previews removal and keeps Undo intact', async () => {
	openPath( 'Presets', 'Essentials' );
	const original = serializeLayers( editor.state.layers );
	const historyLength = editor.state.history.past.length;
	pointer( item( 'Sepia' ) );
	await tick();
	click( item( 'Sepia' ) );
	await tick();
	expect( editor.state.colorPreview ).toBeNull();
	expect( editor.state.layers[ 0 ].filter ).toBe( 'sepia' );
	expect( editor.state.history.past ).toHaveLength( historyLength + 1 );
	openPath( 'Presets' );
	pointer( item( 'Remove Filter' ) );
	await tick();
	expect( editor.state.colorPreview.layers[ 0 ].filter ).toBe( 'none' );
	expect( editor.state.layers[ 0 ].filter ).toBe( 'sepia' );
	escape();
	act( () => editor.undo() );
	expect( serializeLayers( editor.state.layers ) ).toEqual( original );
} );

it( 'previews keyboard focus while leaving touch unchanged', async () => {
	openPath( 'Color' );
	const button = item( 'Invert' );
	pointer( button, 'pointerover', 'touch' );
	await tick();
	expect( editor.state.colorPreview ).toBeFalsy();
	jest.spyOn( button, 'matches' ).mockImplementation(
		( selector ) => selector === ':focus-visible'
	);
	act( () => button.focus() );
	await tick();
	expect( editor.state.colorPreview.layers[ 0 ].previewEffect.id ).toBe(
		'invert'
	);
	escape();
	expect( editor.state.colorPreview ).toBeNull();
} );

it( 'includes filters and parameter defaults registered by extensions', async () => {
	act( () => {
		api.registerFilterPreset( {
			id: 'preview-test/look',
			label: 'Extension Look',
			css: 'grayscale(1)',
		} );
		api.registerEffect( {
			id: 'preview-test/effect',
			label: 'Extension Effect',
			params: { amount: { min: 0, max: 100, default: 37 } },
			apply: ( image ) => image,
		} );
	} );
	openPath( 'Presets' );
	pointer( item( 'Extension Look' ) );
	await tick();
	expect( editor.state.colorPreview.layers[ 0 ].filter ).toBe(
		'preview-test/look'
	);
	escape();
	openPath( 'Extensions' );
	pointer( item( 'Extension Effect' ) );
	await tick();
	expect( editor.state.colorPreview.layers[ 0 ].previewEffect ).toEqual( {
		id: 'preview-test/effect',
		params: { amount: 37 },
	} );
	click( item( 'Extension Effect' ) );
	expect( extras.openEffect ).toHaveBeenCalledWith( 'preview-test/effect' );
	expect( editor.state.colorPreview ).toBeNull();
} );
