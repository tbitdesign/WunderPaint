import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useCatalogSource } from './use-catalog-source';

global.IS_REACT_ACT_ENVIRONMENT = true;
let root, host, source;
function Probe( { layer, snapshot } ) {
	source = useCatalogSource( layer, {
		history: { present: { layers: snapshot ? [ snapshot ] : [] } },
	} );
	return null;
}
function update( layer, snapshot = layer ) {
	act( () => root.render( <Probe layer={ layer } snapshot={ snapshot } /> ) );
	return source;
}
beforeEach( () => {
	host = document.createElement( 'div' );
	document.body.appendChild( host );
	root = createRoot( host );
} );
afterEach( () => {
	act( () => root.unmount() );
	host.remove();
} );

it( 'keeps the source through grading and transient effect slider changes', () => {
	const layer = { id: 'shape', type: 'shape', fill: '#123456', filter: null };
	const first = update( layer );
	for ( const patch of [
		{ filter: 'film' },
		{ filterAmount: 42 },
		{ adjust: { brightness: 20 } },
		{ previewEffect: { id: 'noise', params: { amount: 25 } } },
		{ visible: false },
	] ) {
		expect( update( { ...layer, ...patch } ) ).toBe( first );
	}
	expect( update( { ...layer, fill: '#ffffff' } ) ).not.toBe( first );
} );

it( 'detects painted pixels and undo snapshots without reading the live canvas again', () => {
	const canvas = { toDataURL: jest.fn() };
	const layer = { id: 'paint', type: 'raster', canvas, dataUrl: null };
	const original = update( layer, {
		id: layer.id,
		dataUrl: 'original-pixels',
	} );
	expect(
		update(
			{ ...layer, filterAmount: 60 },
			{ id: layer.id, dataUrl: 'original-pixels' }
		)
	).toBe( original );
	const painted = update(
		{ ...layer },
		{ id: layer.id, dataUrl: 'painted-pixels' }
	);
	expect( painted ).not.toBe( original );
	expect(
		update( { ...layer }, { id: layer.id, dataUrl: 'original-pixels' } )
	).not.toBe( painted );
	expect( canvas.toDataURL ).not.toHaveBeenCalled();
} );

it( 'detects edits to a mask even when its canvas object stays the same', () => {
	const mask = { canvas: { toDataURL: jest.fn() } };
	const layer = { id: 'masked', type: 'shape', fill: '#aabbcc', mask };
	const first = update( layer, {
		id: layer.id,
		mask: { data: 'first-mask' },
	} );
	expect(
		update( { ...layer }, { id: layer.id, mask: { data: 'new-mask' } } )
	).not.toBe( first );
	expect( mask.canvas.toDataURL ).not.toHaveBeenCalled();
} );

it( 'stays conservative before a raster has its first committed snapshot', () => {
	const layer = { id: 'new', type: 'raster', canvas: {} };
	const first = update( layer, null );
	expect( update( { ...layer }, null ) ).not.toBe( first );
} );

it( 'invalidates renderable layer settings, source images and geometry', () => {
	const layer = {
		id: 'text',
		type: 'text',
		text: 'ART',
		fontFamily: 'sans-serif',
		x: 0,
		color: '#abcdef',
	};
	for ( const patch of [
		{ text: 'NEW' },
		{ fontFamily: 'serif' },
		{ x: 20 },
		{ color: '#fedcba' },
		{ smartFilters: [ { id: 'noise' } ] },
		{ src: 'new-image' },
	] ) {
		const first = update( layer );
		expect( update( { ...layer, ...patch } ) ).not.toBe( first );
	}
} );
