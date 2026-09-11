import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { useEscape, __escapeDepth } from './use-escape';

global.IS_REACT_ACT_ENVIRONMENT = true;

function Dialog( { onClose } ) {
	useEscape( onClose );
	return null;
}

const press = () =>
	act( () => {
		document.dispatchEvent(
			new window.KeyboardEvent( 'keydown', {
				key: 'Escape',
				bubbles: true,
				cancelable: true,
			} )
		);
	} );

describe( 'useEscape: one stack, the topmost dialog answers', () => {
	it( 'closes only the dialog opened last, then the one below', () => {
		const outer = jest.fn();
		const inner = jest.fn();
		const host = document.createElement( 'div' );
		document.body.appendChild( host );
		const root = createRoot( host );
		act( () =>
			root.render(
				<>
					<Dialog onClose={ outer } />
					<Dialog onClose={ inner } />
				</>
			)
		);
		expect( __escapeDepth() ).toBe( 2 );
		press();
		expect( inner ).toHaveBeenCalledTimes( 1 );
		expect( outer ).not.toHaveBeenCalled();
		// The inner one goes away, the outer one is topmost now.
		act( () => root.render( <Dialog onClose={ outer } /> ) );
		expect( __escapeDepth() ).toBe( 1 );
		press();
		expect( outer ).toHaveBeenCalledTimes( 1 );
		act( () => root.unmount() );
		expect( __escapeDepth() ).toBe( 0 );
		host.remove();
	} );

	it( 'uses the latest handler without re-registering', () => {
		const first = jest.fn();
		const second = jest.fn();
		const host = document.createElement( 'div' );
		document.body.appendChild( host );
		const root = createRoot( host );
		act( () => root.render( <Dialog onClose={ first } /> ) );
		act( () => root.render( <Dialog onClose={ second } /> ) );
		press();
		expect( first ).not.toHaveBeenCalled();
		expect( second ).toHaveBeenCalledTimes( 1 );
		act( () => root.unmount() );
		host.remove();
	} );
} );
