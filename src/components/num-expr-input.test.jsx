/** Formula entry and the shared arrows operate on the same controlled field. */
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NumExprInput } from './num-expr-input';
import { installNumericControls } from '../lib/numeric-controls';
import { numberCommit } from '../lib/number-transaction';

global.IS_REACT_ACT_ENVIRONMENT = true;
let root, dispose;
afterEach( () => {
	act( () => dispose?.() );
	act( () => root?.unmount() );
	document.body.innerHTML = '';
} );
function setup( props = {} ) {
	const host = document.createElement( 'div' );
	host.id = 'wpie-root';
	document.body.appendChild( host );
	root = createRoot( host );
	const history = [],
		owner = {},
		changes = jest.fn();
	function Field() {
		const [ value, setValue ] = useState( props.initial ?? 120 );
		return (
			<NumExprInput
				{ ...props }
				value={ value }
				onChange={ ( next ) => {
					changes( next );
					setValue( next );
				} }
				onCommit={ () =>
					numberCommit( owner, () => history.push( value ) )
				}
			/>
		);
	}
	act( () => root.render( <Field /> ) );
	dispose = installNumericControls();
	const input = host.querySelector( 'input' );
	input.getBoundingClientRect = () => ( {
		left: 0,
		right: 80,
		top: 0,
		bottom: 26,
		width: 80,
		height: 26,
	} );
	return { input, history, changes };
}
function fill( input, text ) {
	act( () => {
		input.focus();
		Object.getOwnPropertyDescriptor(
			window.HTMLInputElement.prototype,
			'value'
		).set.call( input, text );
		input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	} );
}
function key( input, name, type = 'keydown', extra = {} ) {
	act( () =>
		input.dispatchEvent(
			new KeyboardEvent( type, {
				key: name,
				bubbles: true,
				cancelable: true,
				...extra,
			} )
		)
	);
}
async function spin( input, type, up = true, extra = {} ) {
	await act( async () => {
		input.dispatchEvent(
			new MouseEvent( type, {
				clientX: 74,
				clientY: up ? 5 : 21,
				bubbles: true,
				cancelable: true,
				...extra,
			} )
		);
	} );
}

test( 'formula fields get the same one-step and Shift arrows', async () => {
	const { input, history } = setup();
	expect( input.type ).toBe( 'text' );
	expect( input.classList.contains( 'wpie-number-control' ) ).toBe( true );
	await spin( input, 'pointerdown' );
	expect( input.value ).toBe( '121' );
	expect( history ).toEqual( [] );
	await spin( input, 'pointerup' );
	expect( history ).toEqual( [ 121 ] );
	await spin( input, 'pointerdown', false, { shiftKey: true } );
	await spin( input, 'pointerup', false );
	expect( input.value ).toBe( '111' );
	expect( history ).toEqual( [ 121, 111 ] );
} );

test( 'an arrow resolves a pending relative expression once, then steps', async () => {
	const { input, changes, history } = setup();
	fill( input, '/2' );
	expect( changes ).not.toHaveBeenCalled();
	await spin( input, 'pointerdown' );
	await spin( input, 'pointerup' );
	expect( input.value ).toBe( '61' );
	expect( history ).toEqual( [ 61 ] );
	act( () => input.blur() );
	expect( changes.mock.calls ).toEqual( [ [ 61 ] ] );
} );

test( 'held keyboard steps apply a draft once and form one history entry', () => {
	const { input, history } = setup();
	fill( input, '*2' );
	key( input, 'ArrowUp' );
	key( input, 'ArrowUp', 'keydown', { repeat: true } );
	key( input, 'ArrowUp', 'keydown', { repeat: true } );
	expect( input.value ).toBe( '243' );
	expect( history ).toEqual( [] );
	key( input, 'ArrowUp', 'keyup' );
	expect( history ).toEqual( [ 243 ] );
} );

test( 'Enter and blur each apply a relative expression exactly once', () => {
	const { input, changes, history } = setup();
	fill( input, '/2' );
	key( input, 'Enter' );
	expect( input.value ).toBe( '60' );
	expect( changes.mock.calls ).toEqual( [ [ 60 ] ] );
	fill( input, '*2' );
	act( () => input.blur() );
	expect( input.value ).toBe( '120' );
	expect( changes.mock.calls ).toEqual( [ [ 60 ], [ 120 ] ] );
	expect( history ).toHaveLength( 2 );
} );

test( 'Escape discards a formula draft and cursor keys do not step', () => {
	const { input, changes } = setup();
	fill( input, '100+20' );
	for ( const name of [ 'ArrowLeft', 'ArrowRight', 'Home', 'End' ] ) {
		key( input, name );
	}
	expect( input.value ).toBe( '100+20' );
	key( input, 'Escape' );
	expect( input.value ).toBe( '120' );
	expect( changes ).not.toHaveBeenCalled();
} );

test( 'Escape during an arrow gesture restores the value before the formula', async () => {
	const { input, history } = setup();
	fill( input, '/2' );
	await spin( input, 'pointerdown' );
	expect( input.value ).toBe( '61' );
	key( input, 'Escape' );
	await spin( input, 'pointerup' );
	expect( input.value ).toBe( '120' );
	expect( history ).toEqual( [] );
} );

test( 'bounds apply to steps without creating history for an unchanged value', async () => {
	const { input, history } = setup( { initial: 5, min: 4, max: 6 } );
	for ( let i = 0; i < 2; i++ ) {
		await spin( input, 'pointerdown' );
		await spin( input, 'pointerup' );
	}
	expect( input.value ).toBe( '6' );
	expect( history ).toEqual( [ 6 ] );
	await spin( input, 'pointerdown', false, { shiftKey: true } );
	await spin( input, 'pointerup', false );
	expect( input.value ).toBe( '4' );
} );

test( 'decimal entry, fractional steps and cancellation retain precision', async () => {
	const { input } = setup( { step: 0.1 } );
	fill( input, '1,5' );
	expect( input.value ).toBe( '1.5' );
	await spin( input, 'pointerdown' );
	expect( input.value ).toBe( '1.6' );
	key( input, 'Escape' );
	await spin( input, 'pointerup' );
	expect( input.value ).toBe( '1.5' );
} );

test( 'a draft is cleared even when its stepped result equals the stored value', async () => {
	const { input, changes, history } = setup();
	fill( input, '120-1' );
	await spin( input, 'pointerdown' );
	await spin( input, 'pointerup' );
	expect( input.value ).toBe( '120' );
	expect( changes ).not.toHaveBeenCalled();
	expect( history ).toEqual( [] );
} );

test( 'disabled formula fields reject pointer and keyboard steps', async () => {
	const { input, changes, history } = setup( { disabled: true } );
	await spin( input, 'pointerdown' );
	await spin( input, 'pointerup' );
	key( input, 'ArrowUp' );
	key( input, 'ArrowUp', 'keyup' );
	expect( input.value ).toBe( '120' );
	expect( changes ).not.toHaveBeenCalled();
	expect( history ).toEqual( [] );
} );
