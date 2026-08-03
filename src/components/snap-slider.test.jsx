/**
 * SnapSlider precision (v1.285.3). The 0-detent's 2% tolerance used to
 * swallow small values on EVERY input path: on a 0-60 blur slider the
 * value 1 was unreachable - arrow-left from 2 fired onChange(1), the
 * snap dragged it back to 0. Snapping is a pointer aid: keyboard steps
 * must pass through untouched (and commit), pointer drags still snap.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { SnapSlider, snapValue } from './snap-slider';

global.IS_REACT_ACT_ENVIRONMENT = true;

const setup = ( props = {} ) => {
	const host = document.createElement( 'div' );
	document.body.appendChild( host );
	const root = createRoot( host );
	const seen = [];
	const commits = [];
	act( () => {
		root.render(
			<SnapSlider
				min={ 0 }
				max={ 60 }
				value={ 2 }
				def={ 0 }
				onChange={ ( v ) => seen.push( v ) }
				onCommit={ () => commits.push( 1 ) }
				{ ...props }
			/>
		);
	} );
	return { input: host.querySelector( 'input' ), seen, commits };
};

// React reads the value from the native input on change; set it the way
// a browser would before dispatching.
const nativeChange = ( input, value ) => {
	const set = Object.getOwnPropertyDescriptor(
		window.HTMLInputElement.prototype,
		'value'
	).set;
	set.call( input, String( value ) );
	input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
};

test( 'keyboard steps are precise: arrow-left from 2 reaches 1', () => {
	const { input, seen, commits } = setup();
	act( () => {
		input.dispatchEvent(
			new KeyboardEvent( 'keydown', { key: 'ArrowLeft', bubbles: true } )
		);
		nativeChange( input, 1 );
		input.dispatchEvent(
			new KeyboardEvent( 'keyup', { key: 'ArrowLeft', bubbles: true } )
		);
	} );
	expect( seen ).toEqual( [ 1 ] );
	expect( commits.length ).toBe( 1 );
} );

test( 'pointer drags still snap onto the 0 detent', () => {
	const { input, seen } = setup();
	act( () => {
		input.dispatchEvent( new Event( 'pointerdown', { bubbles: true } ) );
		nativeChange( input, 1 );
	} );
	expect( seen ).toEqual( [ 0 ] );
} );

test( 'snapValue keeps values outside the tolerance', () => {
	expect( snapValue( 1, 0, 60, [ 0 ] ) ).toBe( 0 );
	expect( snapValue( 2, 0, 60, [ 0 ] ) ).toBe( 2 );
	expect( snapValue( 30, 0, 60, [ 0 ] ) ).toBe( 30 );
} );
