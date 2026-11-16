/** Real input events through the shared interaction, with a controlled React value. */
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SnapSlider } from './snap-slider';
import { installNumericControls } from '../lib/numeric-controls';

global.IS_REACT_ACT_ENVIRONMENT = true;
let root, dispose;
afterEach( () => {
	act( () => root?.unmount() );
	dispose?.();
	document.body.innerHTML = '';
} );
function setup( props = {} ) {
	const host = document.createElement( 'div' );
	host.id = 'wpie-root';
	document.body.appendChild( host );
	root = createRoot( host );
	const commits = jest.fn();
	function Field() {
		const [ value, setValue ] = useState( 2 );
		return (
			<SnapSlider
				min={ 0 }
				max={ 60 }
				value={ value }
				def={ 0 }
				onChange={ setValue }
				onCommit={ commits }
				{ ...props }
			/>
		);
	}
	act( () => root.render( <Field /> ) );
	dispose = installNumericControls();
	return { input: host.querySelector( 'input' ), commits };
}
function key( input, name, shiftKey = false ) {
	act( () =>
		input.dispatchEvent(
			new KeyboardEvent( 'keydown', {
				key: name,
				shiftKey,
				bubbles: true,
				cancelable: true,
			} )
		)
	);
	act( () =>
		input.dispatchEvent(
			new KeyboardEvent( 'keyup', { key: name, shiftKey, bubbles: true } )
		)
	);
}
test( 'keyboard can reach 1 and commits exactly once', () => {
	const { input, commits } = setup();
	key( input, 'ArrowLeft' );
	expect( input.value ).toBe( '1' );
	expect( commits ).toHaveBeenCalledTimes( 1 );
} );
test( 'shift arrows use ten steps and Home/End respect bounds', () => {
	const { input } = setup();
	key( input, 'ArrowRight', true );
	expect( input.value ).toBe( '12' );
	key( input, 'End' );
	expect( input.value ).toBe( '60' );
	key( input, 'Home' );
	expect( input.value ).toBe( '0' );
} );
test( 'disabled sliders reject keyboard edits', () => {
	const { input, commits } = setup( { disabled: true } );
	key( input, 'ArrowRight' );
	expect( input.value ).toBe( '2' );
	expect( commits ).not.toHaveBeenCalled();
} );

// A held key is one gesture, including its repeat events.
test( 'holding an arrow commits once at key release', () => {
	const { input, commits } = setup();
	for ( let n = 0; n < 5; n++ ) {
		act( () =>
			input.dispatchEvent(
				new KeyboardEvent( 'keydown', {
					key: 'ArrowRight',
					repeat: n > 0,
					bubbles: true,
					cancelable: true,
				} )
			)
		);
	}
	expect( input.value ).toBe( '7' );
	expect( commits ).not.toHaveBeenCalled();
	act( () =>
		input.dispatchEvent(
			new KeyboardEvent( 'keyup', { key: 'ArrowRight', bubbles: true } )
		)
	);
	expect( commits ).toHaveBeenCalledTimes( 1 );
} );
