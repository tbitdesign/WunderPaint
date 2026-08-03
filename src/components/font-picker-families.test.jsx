/**
 * FontPicker `families` allow-list (v1.273.0): curated catalogs restrict
 * every group to the given families; empty groups disappear.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { FontPicker } from './font-picker';
import { isLoadableFamily } from '../lib/font-manager';

global.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no scrollIntoView; the list-open effect calls it on the
// active row.
beforeAll( () => {
	Element.prototype.scrollIntoView = jest.fn();
} );

jest.mock( '../store/editor-context', () => ( {
	useEditorMaybe: () => null,
} ) );
jest.mock( '../lib/font-manager', () => ( {
	ensureFont: jest.fn(),
	customFamilies: () => [ 'My Custom' ],
	googleEnabled: () => false,
	isLoadableFamily: jest.fn( () => true ),
	GOOGLE_FONTS: [],
	LOCAL_FONTS: {},
} ) );
jest.mock( '../store/constants', () => ( {
	FONT_GROUPS: [
		{ label: 'System fonts', fonts: [ 'Arial', 'Georgia' ] },
		{ label: 'Editor fonts', fonts: [ 'Inter', 'Montserrat', 'Lora' ] },
	],
} ) );

const mount = ( props ) => {
	const host = document.createElement( 'div' );
	document.body.appendChild( host );
	const root = createRoot( host );
	act( () => {
		root.render(
			<FontPicker value="Inter" onChange={ () => {} } { ...props } />
		);
	} );
	return { host, root };
};

const openList = ( host ) => {
	act( () => {
		host.querySelector( '.font-picker-toggle' ).dispatchEvent(
			new MouseEvent( 'click', { bubbles: true } )
		);
	} );
};

afterEach( () => {
	document.body.innerHTML = '';
	isLoadableFamily.mockImplementation( () => true );
} );

describe( 'FontPicker families', () => {
	it( 'shows the full catalog without the prop', () => {
		const { host } = mount( {} );
		openList( host );
		const names = Array.from(
			host.querySelectorAll( '.font-picker-list [data-family]' )
		).map( ( n ) => n.dataset.family );
		expect( names ).toEqual( [
			'My Custom',
			'Arial',
			'Georgia',
			'Inter',
			'Montserrat',
			'Lora',
		] );
	} );

	it( 'hides families that are not available (no silent fallback)', () => {
		// Lora is in the catalog but neither bundled nor downloaded here.
		isLoadableFamily.mockImplementation( ( f ) => 'Lora' !== f );
		const { host } = mount( {} );
		openList( host );
		const names = Array.from(
			host.querySelectorAll( '.font-picker-list [data-family]' )
		).map( ( n ) => n.dataset.family );
		expect( names ).not.toContain( 'Lora' );
		expect( names ).toContain( 'Inter' );
		expect( names ).toContain( 'Montserrat' );
	} );

	it( 'restricts to the allow-list and drops empty groups', () => {
		const { host } = mount( { families: [ 'Inter', 'Lora' ] } );
		openList( host );
		const names = Array.from(
			host.querySelectorAll( '.font-picker-list [data-family]' )
		).map( ( n ) => n.dataset.family );
		expect( names ).toEqual( [ 'Inter', 'Lora' ] );
		const groupLabels = Array.from(
			host.querySelectorAll( '.font-picker-group' )
		).map( ( n ) => n.textContent );
		expect( groupLabels ).toEqual( [ 'Editor fonts' ] );
	} );
} );
