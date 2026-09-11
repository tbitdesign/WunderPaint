/**
 * Result navigation and bulk actions in the real manager component.
 * REST/model boundaries are controlled; user events run through React.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MediaLibraryDialog } from './media-library-dialog';
import { useEditor } from '../store/editor-context';
import {
	mediaLib,
	findSimilar,
	findDuplicates,
	clusterLibrary,
} from '../lib/media-library';
import { searchMediaLibrary, searchModelInstalled } from '../lib/image-search';
import { confirmDialog } from '../lib/dialogs';

jest.mock( '../store/editor-context', () => ( { useEditor: jest.fn() } ) );
jest.mock( '../lib/media-library', () => ( {
	mediaLib: {
		items: jest.fn(),
		folders: { list: jest.fn(), create: jest.fn() },
		tags: { list: jest.fn() },
		smart: { list: jest.fn(), create: jest.fn() },
		assign: jest.fn(),
		remove: jest.fn(),
		broken: jest.fn(),
	},
	findSimilar: jest.fn(),
	findDuplicates: jest.fn(),
	clusterLibrary: jest.fn(),
	indexColors: jest.fn(),
} ) );
jest.mock( '../lib/image-search', () => ( {
	searchMediaLibrary: jest.fn(),
	searchModelInstalled: jest.fn(),
	fetchIndexStatus: () => Promise.resolve( {} ),
	subscribeIndexer: () => () => {},
	invalidateVectorCache: jest.fn(),
} ) );
jest.mock( '../lib/ml', () => ( { isModelInstalled: () => false } ) );
jest.mock( '../lib/api', () => ( {} ) );
jest.mock( '../lib/dialogs', () => ( {
	confirmDialog: jest.fn(),
	promptDialog: jest.fn( () => Promise.resolve( 'Saved search' ) ),
} ) );
jest.mock( '../store/document', () => ( {
	loadImage: () =>
		Promise.resolve( { naturalWidth: 800, naturalHeight: 600 } ),
	makeImage: ( image ) => ( { id: 'inserted', ...image } ),
} ) );
jest.mock( '../lib/smart-upload', () => ( {} ) );
jest.mock( '../lib/dynamic-content', () => ( {
	affixBindingGroups: () => [],
} ) );
jest.mock( '../components/var-picker', () => ( { VarButton: () => null } ) );
jest.mock( './help-dialog', () => ( { HelpLink: () => null } ) );
jest.mock( './meta-editor', () => ( { MetaEditor: () => null } ) );
jest.mock( './cleanup-dialog', () => ( { CleanupDialog: () => null } ) );
jest.mock( './post-picker-dialog', () => ( { PostPickerDialog: () => null } ) );

global.IS_REACT_ACT_ENVIRONMENT = true;
let root;
let extras;
let editor;
const files = [
	{
		id: 1,
		title: 'Alpha',
		mime: 'image/png',
		kind: 'image',
		url: '/alpha.png',
		thumb: '/alpha.png',
		tags: [],
		folders: [],
	},
	{
		id: 2,
		title: 'Beta',
		mime: 'image/jpeg',
		kind: 'image',
		url: '/beta.jpg',
		thumb: '/beta.jpg',
		tags: [],
		folders: [],
	},
];
const response = ( items, more = {} ) => ( {
	items,
	total: items.length,
	page: 1,
	pages: 1,
	...more,
} );
const deferred = () => {
	let resolve;
	let reject;
	const promise = new Promise( ( yes, no ) => {
		resolve = yes;
		reject = no;
	} );
	return { promise, resolve, reject };
};
const button = ( label ) =>
	[ ...document.querySelectorAll( 'button' ) ].find(
		( el ) => el.textContent.trim() === label
	);
const tiles = () => [ ...document.querySelectorAll( '.wpie-mlm-tile' ) ];
const folder = ( label ) =>
	[ ...document.querySelectorAll( '.wpie-mlm-row' ) ].find(
		( el ) => el.querySelector( '.nm' )?.textContent === label
	);
const click = async ( el ) => {
	expect( el ).toBeTruthy();
	await act( async () =>
		el.dispatchEvent( new MouseEvent( 'click', { bubbles: true } ) )
	);
};
const change = async ( el, value ) => {
	expect( el ).toBeTruthy();
	await act( async () => {
		const proto =
			el.tagName === 'SELECT'
				? window.HTMLSelectElement.prototype
				: window.HTMLInputElement.prototype;
		Object.getOwnPropertyDescriptor( proto, 'value' ).set.call( el, value );
		el.dispatchEvent(
			new Event( el.tagName === 'SELECT' ? 'change' : 'input', {
				bubbles: true,
			} )
		);
	} );
};
const search = async ( value ) => {
	const input = document.querySelector( '.wpie-mlm-search' );
	await change( input, value );
	await act( async () =>
		input.dispatchEvent(
			new KeyboardEvent( 'keydown', { key: 'Enter', bubbles: true } )
		)
	);
};
async function mount() {
	const host = document.createElement( 'div' );
	document.body.appendChild( host );
	root = createRoot( host );
	await act( async () =>
		root.render(
			<MediaLibraryDialog onClose={ jest.fn() } extras={ extras } />
		)
	);
}
beforeEach( () => {
	jest.clearAllMocks();
	window.WPIE = { demo: true, canManageTerms: true };
	window.localStorage.clear();
	extras = { toasts: { success: jest.fn(), error: jest.fn() } };
	editor = {
		WPIE: {},
		state: { doc: { w: 800, h: 600 }, tool: 'brush' },
		dispatch: jest.fn(),
		commit: jest.fn(),
	};
	useEditor.mockReturnValue( editor );
	searchModelInstalled.mockReturnValue( true );
	searchMediaLibrary.mockResolvedValue( [ { id: 1 }, { id: 2 } ] );
	mediaLib.items.mockImplementation( async ( p ) =>
		response(
			files.filter(
				( f ) =>
					( ! p.mime || f.mime === p.mime ) &&
					( ! p.ids || p.ids.includes( f.id ) ) &&
					( ! p.search || f.title.includes( p.search ) )
			)
		)
	);
	mediaLib.folders.list.mockResolvedValue( {
		items: [
			{ id: 10, name: 'Folder A', parent: 0, count: 1 },
			{ id: 20, name: 'Folder B', parent: 0, count: 1 },
		],
	} );
	mediaLib.tags.list.mockResolvedValue( { items: [] } );
	mediaLib.smart.list.mockResolvedValue( { items: [] } );
	mediaLib.assign.mockImplementation( async ( p ) => ( {
		updated: p.ids.length,
	} ) );
	mediaLib.remove.mockResolvedValue( { deleted: [] } );
	mediaLib.folders.create.mockResolvedValue( { id: 30 } );
	confirmDialog.mockResolvedValue( true );
} );
afterEach( async () => {
	if ( root ) {
		await act( async () => root.unmount() );
		root = null;
	}
	jest.useRealTimers();
	document.body.replaceChildren();
	delete window.WPIE;
} );

it( 'clears hidden selection before a filtered bulk move', async () => {
	await mount();
	await click( tiles()[ 0 ] );
	await change(
		document.querySelector( 'select[title="File type"]' ),
		'image/jpeg'
	);
	expect( document.querySelectorAll( '.wpie-mlm-tile.sel' ) ).toHaveLength(
		0
	);
	await click( tiles()[ 0 ] );
	const move = [ ...document.querySelectorAll( 'select' ) ].find(
		( el ) => el.options[ 0 ].textContent.trim() === 'Move to folder'
	);
	await change( move, '10' );
	expect( mediaLib.assign ).toHaveBeenCalledWith( {
		ids: [ 2 ],
		folder: 10,
	} );
} );

it( 'keeps the latest folder when earlier results arrive last', async () => {
	await mount();
	const a = deferred();
	const b = deferred();
	mediaLib.items.mockImplementation( ( p ) =>
		p.folder === 10 ? a.promise : b.promise
	);
	await click( folder( 'Folder A' ) );
	await click( folder( 'Folder B' ) );
	await act( async () => b.resolve( response( [ files[ 1 ] ] ) ) );
	await act( async () => a.resolve( response( [ files[ 0 ] ] ) ) );
	expect( tiles() ).toHaveLength( 1 );
	expect( tiles()[ 0 ].textContent ).toContain( 'Beta' );
	expect( folder( 'Folder B' ).className ).toContain( 'active' );
} );

it( 'ignores both late semantic results and errors after navigation', async () => {
	await mount();
	const pending = deferred();
	searchMediaLibrary.mockReturnValueOnce( pending.promise );
	await search( 'beach' );
	await click( folder( 'Folder A' ) );
	await act( async () => pending.resolve( [ { id: 2 } ] ) );
	expect( folder( 'Folder A' ).className ).toContain( 'active' );
	expect( tiles() ).toHaveLength( 2 );
	const failure = deferred();
	searchMediaLibrary.mockReturnValueOnce( failure.promise );
	await search( 'forest' );
	await click( folder( 'Folder B' ) );
	await act( async () => failure.reject( new Error( 'obsolete failure' ) ) );
	expect( extras.toasts.error ).not.toHaveBeenCalled();
	expect( folder( 'Folder B' ).className ).toContain( 'active' );
} );

it( 'cancels a pending debounce on folder navigation', async () => {
	jest.useFakeTimers();
	await mount();
	await change( document.querySelector( '.wpie-mlm-search' ), 'beach' );
	await click( folder( 'Folder B' ) );
	await act( async () => jest.advanceTimersByTime( 500 ) );
	expect( searchMediaLibrary ).not.toHaveBeenCalled();
	expect( folder( 'Folder B' ).className ).toContain( 'active' );
} );

it( 'searches titles without installing an image model and retains the query while filtering', async () => {
	searchModelInstalled.mockReturnValue( false );
	await mount();
	await search( 'Beta' );
	expect( tiles() ).toHaveLength( 1 );
	expect( tiles()[ 0 ].textContent ).toContain( 'Beta' );
	await change(
		document.querySelector( 'select[title="File type"]' ),
		'image/jpeg'
	);
	expect( mediaLib.items ).toHaveBeenLastCalledWith(
		expect.objectContaining( { search: 'Beta', mime: 'image/jpeg' } )
	);
	expect( searchMediaLibrary ).not.toHaveBeenCalled();
	expect( extras.toasts.error ).not.toHaveBeenCalled();
} );

it( 'filters similar images using their reference and never saves their label as a search', async () => {
	findSimilar.mockResolvedValue( [ 1, 2 ] );
	await mount();
	await click( tiles()[ 0 ] );
	await click( button( 'Find similar' ) );
	await change(
		document.querySelector( 'select[title="File type"]' ),
		'image/jpeg'
	);
	expect( findSimilar ).toHaveBeenLastCalledWith( 1 );
	expect( findSimilar ).toHaveBeenCalledTimes( 2 );
	expect( tiles() ).toHaveLength( 1 );
	expect( searchMediaLibrary ).not.toHaveBeenCalled();
	expect( button( 'Save as smart folder' ) ).toBeUndefined();
} );

it( 'keeps broken-file filtering on its original ID set without an image model', async () => {
	searchModelInstalled.mockReturnValue( false );
	mediaLib.broken.mockResolvedValue( { ids: [ 2 ] } );
	await mount();
	await click( button( 'Media Library Tools' ) );
	await click( button( 'Find broken files' ) );
	await change(
		document.querySelector( 'select[title="File type"]' ),
		'image/jpeg'
	);
	expect( mediaLib.items ).toHaveBeenLastCalledWith(
		expect.objectContaining( { ids: [ 2 ], mime: 'image/jpeg' } )
	);
	expect( searchMediaLibrary ).not.toHaveBeenCalled();
	expect( button( 'Save as smart folder' ) ).toBeUndefined();
} );

it( 'keeps rejected duplicates visible and selected for retry', async () => {
	findDuplicates.mockResolvedValue( [ { size: 2, items: files } ] );
	await mount();
	await click( button( 'Media Library Tools' ) );
	await click( button( 'Find duplicates' ) );
	await click( button( 'Trash 1' ) );
	expect( mediaLib.remove ).toHaveBeenCalledWith( [ 2 ], false );
	expect( document.querySelectorAll( '.wpie-mlm-dup .dth' ) ).toHaveLength(
		2
	);
	expect(
		document.querySelectorAll( '.wpie-mlm-dup .dth.del' )
	).toHaveLength( 1 );
	expect( tiles() ).toHaveLength( 2 );
	expect( extras.toasts.error ).toHaveBeenCalledWith(
		'Some files could not be moved to the trash.'
	);
} );

it( 'counts only completed folder suggestions and retains failed groups', async () => {
	clusterLibrary.mockResolvedValue( [
		{ ids: [ 1 ], size: 1 },
		{ ids: [ 2 ], size: 1 },
	] );
	mediaLib.folders.create
		.mockRejectedValueOnce( new Error( 'offline' ) )
		.mockResolvedValueOnce( { id: 30 } );
	await mount();
	await click( button( 'Media Library Tools' ) );
	await click( button( 'Suggest folders' ) );
	await change(
		document.querySelectorAll( 'input[placeholder="Folder name"]' )[ 0 ],
		'First'
	);
	await change(
		document.querySelectorAll( 'input[placeholder="Folder name"]' )[ 1 ],
		'Second'
	);
	await click( button( 'Create all' ) );
	const remaining = document.querySelectorAll(
		'input[placeholder="Folder name"]'
	);
	expect( remaining ).toHaveLength( 1 );
	expect( remaining[ 0 ].value ).toBe( 'First' );
	expect( extras.toasts.success ).toHaveBeenCalledWith(
		'Created 1 folder(s).'
	);
	expect( extras.toasts.error ).toHaveBeenCalled();
} );

it( 'keeps a just-typed query when a filter changes before its debounce', async () => {
	jest.useFakeTimers();
	await mount();
	await change( document.querySelector( '.wpie-mlm-search' ), 'beach' );
	await change(
		document.querySelector( 'select[title="File type"]' ),
		'image/jpeg'
	);
	expect( searchMediaLibrary ).toHaveBeenCalledWith(
		'beach',
		expect.any( Object )
	);
	await act( async () => jest.advanceTimersByTime( 500 ) );
	expect( searchMediaLibrary ).toHaveBeenCalledTimes( 1 );
	expect( mediaLib.items ).toHaveBeenLastCalledWith(
		expect.objectContaining( { mime: 'image/jpeg' } )
	);
} );

it( 'retains selections while appending the next page', async () => {
	mediaLib.items.mockResolvedValueOnce(
		response( [ files[ 0 ] ], { pages: 2, total: 2 } )
	);
	await mount();
	await click( tiles()[ 0 ] );
	mediaLib.items.mockResolvedValueOnce(
		response( [ files[ 1 ] ], { page: 2, pages: 2, total: 2 } )
	);
	await act( async () =>
		document
			.querySelector( '.wpie-mlm-grid' )
			.dispatchEvent( new Event( 'scroll', { bubbles: true } ) )
	);
	expect( tiles() ).toHaveLength( 2 );
	expect( document.querySelectorAll( '.wpie-mlm-tile.sel' ) ).toHaveLength(
		1
	);
} );

it( 'retains a folder suggestion when assignment was refused and permits retry', async () => {
	clusterLibrary.mockResolvedValue( [ { ids: [ 1 ], size: 1 } ] );
	mediaLib.assign.mockResolvedValueOnce( { updated: 0 } );
	await mount();
	await click( button( 'Media Library Tools' ) );
	await click( button( 'Suggest folders' ) );
	await change(
		document.querySelector( 'input[placeholder="Folder name"]' ),
		'Retry'
	);
	await click( button( 'Create all' ) );
	expect(
		document.querySelector( 'input[placeholder="Folder name"]' ).value
	).toBe( 'Retry' );
	expect( extras.toasts.success ).not.toHaveBeenCalled();
	await click( button( 'Create all' ) );
	expect(
		document.querySelector( 'input[placeholder="Folder name"]' )
	).toBeNull();
	expect( extras.toasts.success ).toHaveBeenCalledWith(
		'Created 1 folder(s).'
	);
} );
