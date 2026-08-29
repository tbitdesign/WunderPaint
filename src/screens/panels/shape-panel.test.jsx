/**
 * The shape panel against the REAL editor provider. Two modes and one
 * rule each: with nothing selected the dials ARE the tool options, so the
 * next drag draws what the panel shows; with a shape layer selected they
 * are that layer's and land in the history when the gesture ends. jsdom
 * has no 2d context, so the preview effect has to survive getContext
 * returning null.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { EditorProvider, useEditor } from '../../store/editor-context';
import { ShapePanel } from './shape-panel';

global.IS_REACT_ACT_ENVIRONMENT = true;

let editorRef = null;

function Host() {
	editorRef = useEditor();
	return <ShapePanel editor={ editorRef } />;
}

function mount( layers = [] ) {
	const host = document.createElement( 'div' );
	document.body.appendChild( host );
	act( () =>
		createRoot( host ).render(
			<EditorProvider
				doc={ { w: 800, h: 600 } }
				layers={ layers }
				WPIE={ {} }
			>
				<Host />
			</EditorProvider>
		)
	);
	return document.querySelector( '.sp' );
}

const click = ( el ) =>
	act( () =>
		el.dispatchEvent( new MouseEvent( 'click', { bubbles: true } ) )
	);

const typeInto = ( input, value ) =>
	act( () => {
		Object.getOwnPropertyDescriptor(
			window.HTMLInputElement.prototype,
			'value'
		).set.call( input, value );
		input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	} );

const tiles = ( panel ) => [ ...panel.querySelectorAll( '.ssd-tile' ) ];
const labels = ( panel ) =>
	[ ...panel.querySelectorAll( '.dsm-label' ) ].map( ( n ) => n.textContent );

const SHAPE_LAYER = {
	id: 's1',
	type: 'shape',
	shape: 'rect',
	name: 'My box',
	x: 10,
	y: 10,
	w: 200,
	h: 200,
	fill: '#112233',
};

describe( 'ShapePanel', () => {
	afterEach( () => {
		document.body.replaceChildren();
		editorRef = null;
	} );

	it( 'shows the whole catalogue in one roll, grouped', () => {
		const panel = mount();
		// Every group at once, not one behind a dropdown: you have to be
		// able to SEE what you are reaching for (Thomas, 29.08.).
		const titles = tiles( panel ).map( ( b ) => b.title );
		expect( titles.length ).toBeGreaterThan( 100 );
		expect( titles ).toEqual(
			expect.arrayContaining( [ 'Rectangle', 'Gear', 'Crown' ] )
		);
		const heads = [ ...panel.querySelectorAll( '.ssd-grid-head' ) ].map(
			( n ) => n.textContent
		);
		expect( heads ).toEqual(
			expect.arrayContaining( [ 'Basics', 'Badges', 'Patterns' ] )
		);
	} );

	it( 'the search narrows the roll to the matches', () => {
		const panel = mount();
		typeInto( panel.querySelector( 'input[type=search]' ), 'crown' );
		const found = tiles( panel );
		expect( found ).toHaveLength( 1 );
		expect( found[ 0 ].title ).toBe( 'Crown' );
		// Only the group that still has a match keeps its heading.
		const heads = [ ...panel.querySelectorAll( '.ssd-grid-head' ) ];
		expect( heads ).toHaveLength( 1 );
	} );

	it( 'the foot button is the only thing that inserts', () => {
		const panel = mount();
		typeInto( panel.querySelector( 'input[type=search]' ), 'crown' );
		click( tiles( panel )[ 0 ] );
		// Picking a tile arms the tool. It does not drop a layer.
		expect( editorRef.state.layers ).toHaveLength( 0 );
		expect( editorRef.state.toolOpts.shape.shape ).toBe( 'crown' );
	} );

	it( 'with nothing selected the dials are the tool options', () => {
		const panel = mount();
		expect( panel.querySelector( '.sp-live' ) ).toBeNull();

		typeInto( panel.querySelector( 'input[type=search]' ), 'gear' );
		click( tiles( panel ).find( ( b ) => 'Gear' === b.title ) );

		// The drag follows the panel, and no layer was touched.
		expect( editorRef.state.toolOpts.shape.shape ).toBe( 'gear' );
		expect( editorRef.state.layers ).toHaveLength( 0 );
		expect( labels( panel ) ).toEqual(
			expect.arrayContaining( [ 'Teeth', 'Tooth depth', 'Bore' ] )
		);
	} );

	it( 'the foot inserts a real layer, and then edits it', () => {
		const panel = mount();
		typeInto( panel.querySelector( 'input[type=search]' ), 'burst' );
		click( tiles( panel ).find( ( b ) => 'Burst' === b.title ) );
		click( panel.querySelector( '.sp-foot .ai-btn.primary' ) );

		expect( editorRef.state.layers ).toHaveLength( 1 );
		expect( editorRef.state.layers[ 0 ].shape ).toBe( 'burst' );
		// ADD_LAYER selects what it added, so the panel is now that
		// layer's control surface: the button is gone, the notice is up.
		expect( panel.querySelector( '.sp-foot .ai-btn.primary' ) ).toBeNull();
		expect( panel.querySelector( '.sp-live' ) ).toBeTruthy();
	} );

	it( 'with a shape selected the dials write to that layer', () => {
		const panel = mount( [ SHAPE_LAYER ] );
		act( () => editorRef.dispatch( { type: 'SET_ACTIVE', id: 's1' } ) );
		expect( panel.querySelector( '.sp-live' ) ).toBeTruthy();

		const before = editorRef.state.layers[ 0 ];
		typeInto( panel.querySelector( 'input[type=search]' ), 'gear' );
		click( tiles( panel ).find( ( b ) => 'Gear' === b.title ) );

		const after = editorRef.state.layers[ 0 ];
		expect( after.id ).toBe( 's1' );
		expect( after.shape ).toBe( 'gear' );
		// The LAYER changed, the tool did not: you were editing a shape,
		// not choosing the next one.
		expect( editorRef.state.toolOpts.shape?.shape ).not.toBe( 'gear' );
		expect( before.shape ).toBe( 'rect' );
		// Still exactly one layer - no accidental second shape.
		expect( editorRef.state.layers ).toHaveLength( 1 );
	} );

	it( 'a dial drag reaches the layer and commits on release', () => {
		const panel = mount( [ SHAPE_LAYER ] );
		act( () => editorRef.dispatch( { type: 'SET_ACTIVE', id: 's1' } ) );
		const depth = editorRef.state.history.past.length;

		const radius = [ ...panel.querySelectorAll( '.ssd-dial' ) ].find(
			( row ) => 'Radius' === row.querySelector( '.dsm-label' ).textContent
		);
		const slider = radius.querySelector( 'input[type=range]' );
		typeInto( slider, '24' );
		expect( editorRef.state.layers[ 0 ].radius ).toBe( 24 );

		act( () =>
			slider.dispatchEvent(
				new MouseEvent( 'mouseup', { bubbles: true } )
			)
		);
		expect( editorRef.state.history.past.length ).toBeGreaterThan(
			depth
		);
	} );
} );
