import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createRef } from '@wordpress/element';

import { TitleSearch } from './title-search';
import { buildMenus } from './editor-menubar';
import { EditorProvider, useEditor } from '../store/editor-context';
import { makeShape, makeText } from '../store/document';
import { TOOLS } from '../store/constants';
import { buildSearchIndex, searchIndex } from '../lib/command-search';

global.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, editor, extras, focusRef;

function Probe() {
	editor = useEditor();
	return <TitleSearch extras={ extras } focusRef={ focusRef } />;
}

// Every runnable leaf of a menu tree, the way the menubar shows it.
function leaves( items ) {
	return ( items || [] ).flatMap( ( item ) => {
		if ( ! item || item.head || item.divider ) {
			return [];
		}
		if ( Array.isArray( item.children ) ) {
			return leaves( item.children );
		}
		// Greyed entries are found too; they only cannot run.
		return 'function' === typeof item.run && item.label ? [ item ] : [];
	} );
}

function type( text ) {
	const input = host.querySelector( '.ed-title-search input' );
	const setter = Object.getOwnPropertyDescriptor(
		window.HTMLInputElement.prototype,
		'value'
	).set;
	act( () => {
		setter.call( input, text );
		input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	} );
}

function key( name ) {
	act( () => {
		host.querySelector( '.ed-title-search input' ).dispatchEvent(
			new KeyboardEvent( 'keydown', { key: name, bubbles: true } )
		);
	} );
}

const rows = () =>
	[ ...host.querySelectorAll( '.ed-search-results .ed-item' ) ].map(
		( b ) => b.querySelector( '.ed-search-label' ).textContent
	);

function mount( layers ) {
	act( () => {
		root.render(
			<EditorProvider
				key={ layers.map( ( l ) => l.id ).join() }
				doc={ { w: 400, h: 300 } }
				layers={ layers }
				WPIE={ {} }
			>
				<Probe />
			</EditorProvider>
		);
	} );
}

const activeLayer = () =>
	editor.state.layers.find( ( l ) => l.id === editor.state.activeId );

beforeEach( () => {
	host = document.createElement( 'div' );
	document.body.appendChild( host );
	root = createRoot( host );
	focusRef = createRef();
	extras = {
		openEffect: jest.fn(),
		openShortcutHelp: jest.fn(),
		openHelp: jest.fn(),
		toasts: { error: jest.fn() },
	};
	mount( [ makeShape( { fill: '#668899' } ) ] );
} );

afterEach( () => {
	act( () => root.unmount() );
	host.remove();
} );

describe( 'title search', () => {
	it( 'finds every runnable menu entry and every tool by its name', () => {
		const menus = buildMenus( editor, extras );
		const index = buildSearchIndex( { menus, tools: TOOLS } );
		const missing = [];
		for ( const menu of menus ) {
			for ( const item of leaves( menu.items ) ) {
				const hits = searchIndex( index, item.label, {
					perGroup: 1000,
				} ).flatMap( ( g ) => g.items );
				if ( ! hits.some( ( h ) => h.label === item.label ) ) {
					missing.push( `${ menu.id }: ${ item.label }` );
				}
			}
		}
		for ( const tool of TOOLS ) {
			const tools = searchIndex( index, tool.label ).find(
				( g ) => 'tools' === g.id
			);
			if ( ! tools?.items.some( ( h ) => h.label === tool.label ) ) {
				missing.push( `tool: ${ tool.label }` );
			}
		}
		expect( missing ).toEqual( [] );
		// A real menu, a real filter and a real tool, not only a mock.
		expect( index.some( ( e ) => 'commands' === e.group ) ).toBe( true );
		expect( index.some( ( e ) => 'filters' === e.group ) ).toBe( true );
		expect( index.some( ( e ) => 'tools' === e.group ) ).toBe( true );
	} );

	it( 'is a magnifier until clicked, then the field with the cursor in it', () => {
		// Never the panels' .ed-search: that one grows with flex: 1 and
		// pulled the title bar group to the middle.
		expect( host.querySelector( '.ed-search' ) ).toBeNull();
		expect( host.querySelector( '.ed-title-search input' ) ).toBeNull();
		act( () => host.querySelector( '.ed-search-toggle' ).click() );
		const input = host.querySelector( '.ed-title-search input' );
		expect( input ).toBeTruthy();
		expect( input.ownerDocument.activeElement ).toBe( input );
	} );

	it( 'opens on ⌘K, runs the marked hit with Enter and folds back', () => {
		act( () => focusRef.current() );
		expect(
			host
				.querySelector( '.ed-title-search' )
				.classList.contains( 'is-open' )
		).toBe( true );
		type( 'keyboard shortcuts' );
		expect( rows()[ 0 ] ).toBe( 'Keyboard Shortcuts' );
		key( 'Enter' );
		expect( extras.openShortcutHelp ).toHaveBeenCalled();
		expect( host.querySelector( '.ed-search-results' ) ).toBeNull();
		expect( host.querySelector( '.ed-title-search input' ) ).toBeNull();
	} );

	it( 'greys the filters out without a layer and says why on a click', () => {
		mount( [] );
		act( () => focusRef.current() );
		type( 'gaussian' );
		const row = [
			...host.querySelectorAll( '.ed-search-results .ed-item' ),
		].find(
			( b ) =>
				'Gaussian Blur' ===
				b.querySelector( '.ed-search-label' ).textContent
		);
		expect( row.classList.contains( 'is-disabled' ) ).toBe( true );
		expect( row.getAttribute( 'title' ) ).toBeTruthy();
		act( () => row.click() );
		expect( extras.toasts.error ).toHaveBeenCalledWith(
			row.getAttribute( 'title' )
		);
		expect( extras.openEffect ).not.toHaveBeenCalled();
		// The search stays open to go on typing.
		expect( host.querySelector( '.ed-search-results' ) ).toBeTruthy();
	} );

	it( 'applies a text effect and a layer style to the text layer', () => {
		mount( [ makeText( { text: 'Hello' } ) ] );
		act( () => focusRef.current() );
		type( 'liquid metal' );
		expect( rows()[ 0 ] ).toBe( 'Liquid Metal' );
		key( 'Enter' );
		expect( activeLayer().textFX?.liquidMetal ).toBeTruthy();
		act( () => focusRef.current() );
		type( 'drop shadow' );
		key( 'Enter' );
		expect( activeLayer().styles?.dropShadow ).toBeTruthy();
		expect( editor.state.rightTab ).toBe( 'props' );
	} );

	it( 'moves the mark with the arrow keys and closes with Escape', () => {
		act( () => focusRef.current() );
		// Many menu entries carry "layer", so there is somewhere to move.
		type( 'layer' );
		expect( rows().length ).toBeGreaterThan( 1 );
		const marked = () =>
			host
				.querySelector( '.ed-search-results .ed-item.focused' )
				?.querySelector( '.ed-search-label' ).textContent;
		const first = marked();
		key( 'ArrowDown' );
		expect( marked() ).not.toBe( first );
		key( 'Escape' );
		expect( host.querySelector( '.ed-search-results' ) ).toBeNull();
	} );

	it( 'says so when nothing matches', () => {
		act( () => focusRef.current() );
		type( 'qqqqzzzz' );
		expect(
			host.querySelector( '.ed-search-empty' )?.textContent
		).toBeTruthy();
	} );
} );
