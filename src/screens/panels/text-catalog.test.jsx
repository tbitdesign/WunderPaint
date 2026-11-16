import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TextCatalog } from './text-catalog';

global.IS_REACT_ACT_ENVIRONMENT = true;
const items = [
	{ id: 'film', label: 'Film', group: 'light' },
	{ id: 'ink', label: 'Ink', group: 'metal' },
];
let root, host;
function mount( renderer, extra = {} ) {
	act( () =>
		root.render(
			<TextCatalog
				items={ items }
				kind="effects"
				previewScope="layer-one"
				renderPreview={ renderer }
				choose={ () => {} }
				{ ...extra }
			/>
		)
	);
}
async function tick( ms = 32 ) {
	await act( async () => {
		jest.advanceTimersByTime( ms );
	} );
}
function select( category ) {
	act( () => {
		const el = host.querySelector( 'select' );
		el.value = category;
		el.dispatchEvent( new Event( 'change', { bubbles: true } ) );
	} );
}
beforeEach( () => {
	jest.useFakeTimers();
	host = document.createElement( 'div' );
	document.body.appendChild( host );
	root = createRoot( host );
} );
afterEach( async () => {
	act( () => root.unmount() );
	await tick();
	host.remove();
	jest.useRealTimers();
} );

it( 'does not regenerate equivalent cards on parent updates or category round trips', async () => {
	const render = jest.fn( ( item ) => 'data:image/png,' + item.id );
	mount( render );
	await tick();
	await tick();
	expect( render ).toHaveBeenCalledTimes( 2 );
	mount( render, {
		items: items.map( ( item ) => ( { ...item } ) ),
		active: { film: true },
	} );
	await tick();
	expect( render ).toHaveBeenCalledTimes( 2 );
	select( 'metal' );
	select( 'all' );
	expect( host.querySelectorAll( 'img' ) ).toHaveLength( 2 );
	await tick();
	expect( render ).toHaveBeenCalledTimes( 2 );
} );

it( 'retains the same image elements until a settled replacement is ready', async () => {
	const original = jest.fn( () => 'data:image/png,original' );
	mount( original );
	await tick();
	await tick();
	const img = host.querySelector( 'img' );
	const skipped = jest.fn( () => 'data:image/png,intermediate' );
	mount( skipped );
	await tick( 100 );
	let finish;
	const latest = jest.fn(
		() =>
			new Promise( ( resolve ) => {
				finish = resolve;
			} )
	);
	mount( latest );
	await tick( 170 );
	await tick();
	expect( skipped ).not.toHaveBeenCalled();
	expect( host.querySelector( 'img' ) ).toBe( img );
	expect( img.getAttribute( 'src' ) ).toBe( 'data:image/png,original' );
	await act( async () => {
		finish( 'data:image/png,latest' );
	} );
	expect( host.querySelector( 'img' ) ).toBe( img );
	expect( img.getAttribute( 'src' ) ).toBe( 'data:image/png,latest' );
	// Finish the second card as well so the shared job queue can drain.
	await tick();
	await act( async () => {
		finish( 'data:image/png,latest' );
	} );
} );

it( 'does not display a previous layer as the preview for another layer', async () => {
	mount( () => 'data:image/png,old-layer' );
	await tick();
	await tick();
	expect( host.querySelectorAll( 'img' ) ).toHaveLength( 2 );
	mount( () => 'data:image/png,new-layer', { previewScope: 'layer-two' } );
	expect( host.querySelector( 'img' ) ).toBeNull();
	await tick( 170 );
	await tick();
	await tick();
	expect( host.querySelector( 'img' ).getAttribute( 'src' ) ).toBe(
		'data:image/png,new-layer'
	);
} );

it( 'keeps available thumbnails visible when their replacement fails', async () => {
	mount( () => 'data:image/png,valid' );
	await tick();
	await tick();
	const img = host.querySelector( 'img' );
	mount( () => Promise.reject( new Error( 'temporary render failure' ) ) );
	await tick( 170 );
	await tick();
	await tick();
	expect( host.querySelector( 'img' ) ).toBe( img );
	expect( img.getAttribute( 'src' ) ).toBe( 'data:image/png,valid' );
} );
