import { act, useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import { useEffectPreview } from './use-effect-preview';
import { TextCatalog } from './text-catalog';
import { useEscape, __escapeDepth } from '../../components/use-escape';
import { initialState, reducer } from '../../store/editor-context';
import { withColorSync } from '../../store/color-sync';
import { makeShape, serializeLayers } from '../../store/document';

global.IS_REACT_ACT_ENVIRONMENT = true;
const reduce = withColorSync( reducer );
const items = [
	{ id: 'sepia', label: 'Sepia', group: 'light' },
	{ id: 'invert', label: 'Invert', group: 'metal' },
];
const thumbnail = () => null;
let root, host, editor, choose, outerEscape;
function Gallery() {
	const layer = editor.state.layers.find(
		( l ) => l.id === editor.state.activeId
	);
	const canvasPreview = useEffectPreview( editor, layer, ( item ) => ( {
		filter: item.id,
		filterAmount: 100,
	} ) );
	return (
		<TextCatalog
			items={ items }
			kind="filters"
			previewScope={ layer?.id }
			renderPreview={ thumbnail }
			choose={ choose }
			canvasPreview={ canvasPreview }
		/>
	);
}
function Probe( { show = true } ) {
	const [ state, dispatch ] = useReducer( reduce, null, () => {
		const layer = makeShape( { fill: '#668899' } );
		return {
			...initialState( {
				doc: { w: 400, h: 300 },
				layers: [ layer, makeShape( { fill: '#ff9900' } ) ],
				WPIE: {},
			} ),
			activeId: layer.id,
			selectedIds: [ layer.id ],
			rightTab: 'effects',
		};
	} );
	editor = { state, dispatch };
	useEscape( outerEscape );
	return show ? <Gallery /> : null;
}
const card = ( index = 0 ) => host.querySelectorAll( '.effect-chip' )[ index ];
function pointer( element, type, pointerType = 'mouse' ) {
	act( () => {
		const event = new MouseEvent( type, { bubbles: true } );
		Object.defineProperty( event, 'pointerType', { value: pointerType } );
		element.dispatchEvent( event );
	} );
}
async function tick( ms = 220 ) {
	await act( async () => jest.advanceTimersByTime( ms ) );
}
function key( value ) {
	act( () =>
		document.dispatchEvent(
			new KeyboardEvent( 'keydown', { key: value, bubbles: true } )
		)
	);
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
	choose = jest.fn();
	outerEscape = jest.fn();
	act( () => root.render( <Probe /> ) );
} );
afterEach( async () => {
	act( () => root.unmount() );
	await tick();
	host.remove();
	jest.restoreAllMocks();
	jest.useRealTimers();
} );

it( 'debounces pointer travel and restores the unmodified document on leave', async () => {
	const original = editor.state;
	const saved = serializeLayers( original.layers );
	pointer( card(), 'pointerover' );
	await tick( 100 );
	expect( editor.state.colorPreview ).toBeFalsy();
	pointer( card(), 'pointerout' );
	pointer( card( 1 ), 'pointerover' );
	await tick();
	expect( editor.state.colorPreview.layers[ 0 ].filter ).toBe( 'invert' );
	expect( editor.state.layers ).toBe( original.layers );
	expect( editor.state.history ).toBe( original.history );
	expect( serializeLayers( editor.state.layers ) ).toEqual( saved );
	pointer( card( 1 ), 'pointerout' );
	expect( editor.state.colorPreview ).toBeNull();
	expect( choose ).not.toHaveBeenCalled();
} );

it.each( [
	'Escape',
	'blur',
	'scroll',
	'pointerdown',
	'visibilitychange',
	'beforeinput',
] )( 'cancels pending and active previews on %s', async ( event ) => {
	for ( const active of [ false, true ] ) {
		pointer( card(), 'pointerover' );
		if ( active ) {
			await tick();
		}
		expect( !! editor.state.colorPreview ).toBe( active );
		act( () => {
			if ( event === 'Escape' ) {
				key( 'Escape' );
			} else {
				( event === 'blur' ? window : document ).dispatchEvent(
					new Event( event )
				);
			}
		} );
		await tick();
		expect( editor.state.colorPreview ).toBeFalsy();
	}
	expect( outerEscape ).not.toHaveBeenCalled();
	key( 'Escape' );
	expect( outerEscape ).toHaveBeenCalledTimes( 1 );
} );

it.each( [ false, true ] )(
	'cancels on selection changes, including pending=%s',
	async ( pending ) => {
		pointer( card(), 'pointerover' );
		if ( ! pending ) {
			await tick();
		}
		act( () =>
			editor.dispatch( {
				type: 'SET_ACTIVE',
				id: editor.state.layers[ 1 ].id,
			} )
		);
		await tick();
		expect( editor.state.colorPreview ).toBeFalsy();
	}
);

it( 'clears when a hovered card is filtered out or its panel unmounts', async () => {
	pointer( card(), 'pointerover' );
	await tick();
	act( () => {
		const select = host.querySelector( 'select' );
		select.value = 'metal';
		select.dispatchEvent( new Event( 'change', { bubbles: true } ) );
	} );
	expect( editor.state.colorPreview ).toBeNull();
	pointer( card(), 'pointerover' );
	await tick();
	act( () => root.render( <Probe show={ false } /> ) );
	expect( editor.state.colorPreview ).toBeNull();
	expect( __escapeDepth() ).toBe( 1 );
} );

it( 'leaves touch alone and hands a click to the original action without a delayed restart', async () => {
	pointer( card(), 'pointerover', 'touch' );
	await tick();
	expect( editor.state.colorPreview ).toBeFalsy();
	pointer( card(), 'pointerover' );
	await tick();
	act( () => card().click() );
	expect( choose ).toHaveBeenCalledWith( items[ 0 ] );
	await tick();
	expect( editor.state.colorPreview ).toBeNull();
} );

it( 'previews keyboard focus and gives Escape back after cancelling', async () => {
	const button = card();
	jest.spyOn( button, 'matches' ).mockImplementation(
		( selector ) => selector === ':focus-visible'
	);
	act( () => button.focus() );
	await tick();
	expect( editor.state.colorPreview.layers[ 0 ].filter ).toBe( 'sepia' );
	key( 'Escape' );
	expect( editor.state.colorPreview ).toBeNull();
	key( 'Escape' );
	expect( outerEscape ).toHaveBeenCalledTimes( 1 );
} );
