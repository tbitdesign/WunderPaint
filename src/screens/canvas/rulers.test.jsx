import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Rulers, createPointerStore } from './rulers';
import { RULER_SIZE } from './use-viewport';

global.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const layer = { id: 'a', type: 'shape', x: 100, y: 120, w: 80, h: 20, rot: 90 };
const base = {
	doc: { w: 600, h: 400 },
	zoom: 1,
	pan: { x: 200, y: 150 },
	areaW: 1000,
	areaH: 700,
	layers: [ layer ],
	ids: [ 'a' ],
};
const render = ( props = {} ) =>
	act( () => root.render( <Rulers { ...base } { ...props } /> ) );
const rail = ( axis ) => host.querySelector( `.ed-ruler.${ axis }` );
const number = ( el, key ) => Number( el.getAttribute( key ) );
const edges = ( axis ) => [
	...rail( axis ).querySelectorAll( '.ed-ruler-selection-edge' ),
];

beforeEach( () => {
	host = document.createElement( 'div' );
	document.body.appendChild( host );
	root = createRoot( host );
} );
afterEach( () => {
	act( () => root.unmount() );
	host.remove();
} );

it( 'shows the document extent, negative labels and three levels of ticks', () => {
	render();
	const doc = rail( 'h' ).querySelector( '.ed-ruler-document' );
	expect( number( doc, 'x' ) + RULER_SIZE ).toBe( base.pan.x );
	expect( number( doc, 'width' ) ).toBe( base.doc.w );
	expect( rail( 'h' ).querySelector( '[data-value="-100"]' ) ).toBeTruthy();
	for ( const axis of [ 'h', 'v' ] ) {
		for ( const kind of [ 'major', 'medium', 'minor' ] ) {
			expect(
				rail( axis ).querySelector( `.${ kind }` ).getAttribute( 'd' )
			).toBeTruthy();
		}
	}
} );

it( 'aligns the cursor to area coordinates, independent of pan and zoom', () => {
	// The pointer reaches the rulers through a store, not as a prop: as
	// canvas state it re-rendered the whole canvas on every pointermove.
	const cursorStore = createPointerStore();
	render( {
		zoom: 0.3,
		pan: { x: -81, y: 203 },
		cursorStore,
	} );
	expect( host.querySelector( '.ed-ruler-cursor' ) ).toBeNull();
	act( () => cursorStore.set( { x: 317.5, y: 240.25 } ) );
	expect(
		parseFloat(
			rail( 'h' ).querySelector( '.ed-ruler-cursor' ).style.left
		) + RULER_SIZE
	).toBe( 317.5 );
	expect(
		parseFloat(
			rail( 'v' ).querySelector( '.ed-ruler-cursor' ).style.top
		) + RULER_SIZE
	).toBe( 240.25 );
	act( () => cursorStore.set( null ) );
	expect( host.querySelector( '.ed-ruler-cursor' ) ).toBeNull();
	act( () => cursorStore.set( { x: 3, y: 1000 } ) );
	expect( host.querySelector( '.ed-ruler-cursor' ) ).toBeNull();
} );

it( 'marks the footprint of a rotated layer rather than its unrotated box', () => {
	render();
	expect(
		parseFloat( edges( 'h' )[ 0 ].style.left ) + RULER_SIZE
	).toBeCloseTo( 330 );
	expect(
		parseFloat( edges( 'h' )[ 1 ].style.left ) + RULER_SIZE
	).toBeCloseTo( 350 );
	expect(
		parseFloat( edges( 'v' )[ 0 ].style.top ) + RULER_SIZE
	).toBeCloseTo( 240 );
	expect(
		parseFloat( edges( 'v' )[ 1 ].style.top ) + RULER_SIZE
	).toBeCloseTo( 320 );
} );

it( 'resolves groups and multi-selection through the existing frame geometry', () => {
	const other = { id: 'b', type: 'shape', x: 10, y: 30, w: 30, h: 40 };
	const group = {
		id: 'g',
		type: 'group',
		x: 0,
		y: 0,
		w: 0,
		h: 0,
		children: [ 'a', 'b' ],
	};
	const layers = [ layer, other, group ];
	for ( const ids of [ [ 'g' ], [ 'a', 'b' ] ] ) {
		render( { layers, ids } );
		expect(
			parseFloat( edges( 'h' )[ 0 ].style.left ) + RULER_SIZE
		).toBeCloseTo( 210 );
		expect(
			parseFloat( edges( 'h' )[ 1 ].style.left ) + RULER_SIZE
		).toBeCloseTo( 350 );
		expect(
			parseFloat( edges( 'v' )[ 0 ].style.top ) + RULER_SIZE
		).toBeCloseTo( 180 );
		expect(
			parseFloat( edges( 'v' )[ 1 ].style.top ) + RULER_SIZE
		).toBeCloseTo( 320 );
	}
	render( { ids: [] } );
	expect( host.querySelector( '.ed-ruler-selection' ) ).toBeNull();
} );

it( 'clips offscreen ranges without inventing a selection edge at the viewport boundary', () => {
	render( { pan: { x: -135, y: -100 } } );
	expect(
		rail( 'h' ).querySelector( '.ed-ruler-selection-edge' )
	).toBeNull();
	expect( edges( 'v' ) ).toHaveLength( 1 );
	expect( rail( 'v' ).querySelector( '.ed-ruler-selection' ).style.top ).toBe(
		'0px'
	);
} );

it( 'does not build more labels for a huge document', () => {
	render();
	const count = host.querySelectorAll( 'text' ).length;
	render( { doc: { w: 10000000, h: 10000000 } } );
	expect( host.querySelectorAll( 'text' ) ).toHaveLength( count );
} );

it( 'switches both axes using DPI without changing document, selection or cursor geometry', () => {
	const cursorStore = createPointerStore();
	cursorStore.set( { x: 320, y: 210 } );
	const geometry = () =>
		[
			...host.querySelectorAll(
				'.ed-ruler-document, .ed-ruler-document-edge, .ed-ruler-selection, .ed-ruler-selection-edge, .ed-ruler-cursor'
			),
		].map( ( el ) => el.outerHTML );
	render( { cursorStore } );
	const before = geometry();
	expect( before.join() ).toContain( 'ed-ruler-cursor' );
	for ( const rulerUnit of [ 'mm', 'cm', 'in' ] ) {
		render( { cursorStore, doc: { ...base.doc, rulerUnit, dpi: 300 } } );
		expect( geometry() ).toEqual( before );
		expect( host.querySelector( 'select' ).value ).toBe( rulerUnit );
		for ( const axis of [ 'h', 'v' ] ) {
			const label = rail( axis ).querySelector(
				'[data-value="' + ( rulerUnit === 'mm' ? 10 : 1 ) + '"]'
			);
			const origin =
				( axis === 'h' ? base.pan.x : base.pan.y ) - RULER_SIZE;
			const position =
				Math.round(
					origin + ( rulerUnit === 'in' ? 300 : 300 / 2.54 )
				) + 3;
			const coordinate =
				axis === 'h'
					? number( label, 'x' )
					: Number(
							label
								.getAttribute( 'transform' )
								.match( /translate\(10 ([\d.-]+)/ )[ 1 ]
					  );
			expect( coordinate ).toBe( position );
		}
	}
} );

it( 'makes the corner accessible and keeps unit interaction out of canvas tools and shortcuts', () => {
	const onUnitChange = jest.fn();
	const onStartGuide = jest.fn();
	const bubble = jest.fn();
	render( { onUnitChange, onStartGuide } );
	const corner = host.querySelector( 'select' );
	expect( corner.getAttribute( 'aria-label' ) ).toBe( 'Ruler units' );
	expect( corner.closest( '[aria-hidden="true"]' ) ).toBeNull();
	expect( [ ...corner.options ].map( ( option ) => option.value ) ).toEqual( [
		'px',
		'mm',
		'cm',
		'in',
	] );
	for ( const type of [
		'pointerdown',
		'pointerup',
		'click',
		'dblclick',
		'keydown',
		'keyup',
		'contextmenu',
	] ) {
		document.body.addEventListener( type, bubble );
		act( () =>
			corner.dispatchEvent( new Event( type, { bubbles: true } ) )
		);
		document.body.removeEventListener( type, bubble );
	}
	expect( bubble ).not.toHaveBeenCalled();
	expect( onStartGuide ).not.toHaveBeenCalled();
	act( () => {
		corner.value = 'cm';
		corner.dispatchEvent( new Event( 'change', { bubbles: true } ) );
	} );
	expect( onUnitChange ).toHaveBeenCalledWith( 'cm' );
	render( { doc: { ...base.doc, rulerUnit: 'cm' }, onUnitChange } );
	act( () =>
		corner.dispatchEvent( new Event( 'change', { bubbles: true } ) )
	);
	expect( onUnitChange ).toHaveBeenCalledTimes( 1 );
	render( { doc: { ...base.doc, rulerUnit: 'unknown' } } );
	expect( corner.value ).toBe( 'px' );
	render();
	expect( corner.value ).toBe( 'px' );
} );
