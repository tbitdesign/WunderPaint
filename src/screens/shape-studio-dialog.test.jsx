/**
 * The Shape Studio modal, mounted against the REAL editor provider: the
 * grid lists every studio shape, picking one swaps the dial stack to its
 * registry parameters, and Insert lands a real layer with the picked
 * geometry. jsdom has no 2d context, so the preview effect must survive
 * getContext returning null (guarded in the dialog).
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { EditorProvider, useEditor } from '../store/editor-context';
import { ShapeStudioDialog } from './shape-studio-dialog';
import { SHAPE_CHOICES } from '../components/shape-picker';

global.IS_REACT_ACT_ENVIRONMENT = true;

let editorRef = null;
function Probe() {
	editorRef = useEditor();
	return null;
}

function mount( { layerId = null, onClose = () => {} } = {} ) {
	const host = document.createElement( 'div' );
	document.body.appendChild( host );
	const root = createRoot( host );
	act( () =>
		root.render(
			<EditorProvider
				doc={ { w: 800, h: 600 } }
				layers={ [] }
				WPIE={ {} }
			>
				<Probe />
				<ShapeStudioDialog
					onClose={ onClose }
					extras={ {} }
					layerId={ layerId }
				/>
			</EditorProvider>
		)
	);
	return root;
}

const click = ( el ) =>
	act( () =>
		el.dispatchEvent( new MouseEvent( 'click', { bubbles: true } ) )
	);

describe( 'ShapeStudioDialog', () => {
	afterEach( () => {
		document.body.replaceChildren();
		editorRef = null;
	} );

	it( 'lists only shapes with real dials, grouped by theme', () => {
		mount();
		const dialog = document.querySelector( '.stock-dialog' );
		expect( dialog ).toBeTruthy();
		const grid = dialog.querySelector(
			':scope > div:nth-child(2) > div:first-child'
		);
		const tiles = grid.querySelectorAll( 'button' );
		// Dynamics only - no pill/note/badge statics, no frozen paths.
		expect( tiles.length ).toBeGreaterThan( 45 );
		expect( tiles.length ).toBeLessThan( SHAPE_CHOICES.length );
		const titles = [ ...tiles ].map( ( b ) => b.title );
		expect( titles ).toContain( 'Crown' );
		expect( titles ).toContain( 'Pine tree' );
		expect( titles ).not.toContain( 'Pill' );
		expect( titles ).not.toContain( 'Music note' );

		// Untranslated jest: titles are the msgids.
		const gearTile = [ ...tiles ].find( ( b ) => 'Gear' === b.title );
		expect( gearTile ).toBeTruthy();
		click( gearTile );
		const labels = [ ...dialog.querySelectorAll( '.dsm-label' ) ].map(
			( n ) => n.textContent
		);
		expect( labels ).toEqual(
			expect.arrayContaining( [ 'Teeth', 'Tooth depth', 'Bore' ] )
		);

		const ticketTile = [ ...tiles ].find( ( b ) => 'Ticket' === b.title );
		click( ticketTile );
		const labels2 = [ ...dialog.querySelectorAll( '.dsm-label' ) ].map(
			( n ) => n.textContent
		);
		expect( labels2 ).toEqual(
			expect.arrayContaining( [ 'Notch', 'Radius' ] )
		);
		expect( labels2 ).not.toContain( 'Teeth' );
	} );

	it( 'the crown carries prong dials, not just a radius', () => {
		mount();
		const dialog = document.querySelector( '.stock-dialog' );
		const tiles = dialog.querySelectorAll(
			':scope > div:nth-child(2) > div:first-child button'
		);
		click( [ ...tiles ].find( ( b ) => 'Crown' === b.title ) );
		const labels = [ ...dialog.querySelectorAll( '.dsm-label' ) ].map(
			( n ) => n.textContent
		);
		expect( labels ).toEqual(
			expect.arrayContaining( [ 'Points', 'Depth', 'Radius' ] )
		);
		click( dialog.querySelector( '.dsm-foot .ai-btn.primary' ) );
		expect( editorRef.state.layers ).toHaveLength( 1 );
		expect( editorRef.state.layers[ 0 ].shape ).toBe( 'crown' );
	} );

	it( 'an existing polygon-path layer opens with corner dials', () => {
		const FLAG =
			'M 15 5 L 22 5 L 22 95 L 15 95 Z M 22 10 L 88 10 L 76 30 L 88 50 L 22 50 Z';
		const host = document.createElement( 'div' );
		document.body.appendChild( host );
		const root = createRoot( host );
		act( () =>
			root.render(
				<EditorProvider
					doc={ { w: 800, h: 600 } }
					layers={ [
						{
							id: 'p1',
							type: 'shape',
							shape: 'rect',
							name: 'Flag path',
							x: 0,
							y: 0,
							w: 100,
							h: 100,
							fill: '#111111',
							pathD: FLAG,
						},
					] }
					WPIE={ {} }
				>
					<Probe />
					<ShapeStudioDialog
						onClose={ () => {} }
						extras={ {} }
						layerId="p1"
					/>
				</EditorProvider>
			)
		);
		const dialog = document.querySelector( '.stock-dialog' );
		const labels = [ ...dialog.querySelectorAll( '.dsm-label' ) ].map(
			( n ) => n.textContent
		);
		expect( labels ).toContain( 'Radius' );
		expect( dialog.textContent ).not.toContain( 'anchor editor' );
	} );

	it( 'filters the grid with the search field', () => {
		mount();
		const dialog = document.querySelector( '.stock-dialog' );
		const input = dialog.querySelector( 'input[type=search]' );
		act( () => {
			const set = Object.getOwnPropertyDescriptor(
				window.HTMLInputElement.prototype,
				'value'
			).set;
			set.call( input, 'crown' );
			input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		} );
		const tiles = dialog.querySelectorAll(
			':scope > div:nth-child(2) > div:first-child button'
		);
		expect( tiles ).toHaveLength( 1 );
		expect( tiles[ 0 ].title ).toBe( 'Crown' );
	} );

	it( 'inserts a real layer with the dialed shape', () => {
		let closed = false;
		mount( { onClose: () => ( closed = true ) } );
		const dialog = document.querySelector( '.stock-dialog' );
		const tiles = dialog.querySelectorAll(
			':scope > div:nth-child(2) > div:first-child button'
		);
		click( [ ...tiles ].find( ( b ) => 'Burst' === b.title ) );
		click( dialog.querySelector( '.dsm-foot .ai-btn.primary' ) );
		expect( closed ).toBe( true );
		expect( editorRef.state.layers ).toHaveLength( 1 );
		const layer = editorRef.state.layers[ 0 ];
		expect( layer.shape ).toBe( 'burst' );
		expect( layer.type ).toBe( 'shape' );
		// The quick picker follows the studio's pick.
		expect( editorRef.state.toolOpts.shape.shape ).toBe( 'burst' );
	} );
} );
