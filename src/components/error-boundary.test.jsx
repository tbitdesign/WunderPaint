/**
 * A render error must become a crash screen (root) or a panel box
 * (local), and the root screen must flush a snapshot while the document
 * is still mounted.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { ErrorBoundary } from './error-boundary';
import { registerLastResort, __resetLastResort } from '../lib/last-resort';

global.IS_REACT_ACT_ENVIRONMENT = true;

function Bomb( { armed } ) {
	if ( armed ) {
		throw new Error( 'kaboom' );
	}
	return <span data-ok="1">fine</span>;
}

const mount = ( el ) => {
	const host = document.createElement( 'div' );
	document.body.appendChild( host );
	const root = createRoot( host );
	act( () => root.render( el ) );
	return { host, root };
};

let quiet;
beforeEach( () => {
	__resetLastResort();
	// React logs the caught error on purpose; keep the test output clean.
	quiet = jest.spyOn( console, 'error' ).mockImplementation( () => {} );
} );
afterEach( () => quiet.mockRestore() );

describe( 'ErrorBoundary', () => {
	it( 'renders children while nothing throws', () => {
		const { host } = mount(
			<ErrorBoundary>
				<Bomb armed={ false } />
			</ErrorBoundary>
		);
		expect( host.querySelector( '[data-ok]' ) ).not.toBeNull();
		expect( host.querySelector( '.ed-crash-box' ) ).toBeNull();
	} );

	it( 'a local boundary shows the panel box with the message and tries again', () => {
		let armed = true;
		const Wrap = () => (
			<ErrorBoundary label="Layers">
				<Bomb armed={ armed } />
			</ErrorBoundary>
		);
		const { host, root } = mount( <Wrap /> );
		const box = host.querySelector( '.ed-crash-box' );
		expect( box ).not.toBeNull();
		expect( box.textContent ).toContain( 'Layers' );
		expect( box.textContent ).toContain( 'kaboom' );
		// Fresh children first (the old element would throw again), then
		// the button clears the error.
		armed = false;
		act( () => root.render( <Wrap /> ) );
		act( () => box.querySelector( 'button' ).click() );
		expect( host.querySelector( '[data-ok]' ) ).not.toBeNull();
	} );

	it( 'the root boundary flushes a snapshot first, then offers reload and download', async () => {
		const calls = [];
		registerLastResort( {
			snapshot: async () => {
				calls.push( 'snapshot' );
				return true;
			},
			download: () => calls.push( 'download' ),
		} );
		const { host } = mount(
			<ErrorBoundary root>
				<Bomb armed={ true } />
			</ErrorBoundary>
		);
		await act( async () => {
			await Promise.resolve();
		} );
		expect( calls ).toContain( 'snapshot' );
		const buttons = Array.from( host.querySelectorAll( 'button' ) );
		expect( buttons.length ).toBe( 2 );
		expect( host.textContent ).toContain( 'snapshot of your work' );
		act( () => buttons[ 1 ].click() );
		expect( calls ).toContain( 'download' );
		expect( host.querySelector( 'pre' ).textContent ).toContain( 'kaboom' );
	} );

	it( 'without a download handler the root screen has only the reload button', () => {
		const { host } = mount(
			<ErrorBoundary root>
				<Bomb armed={ true } />
			</ErrorBoundary>
		);
		expect( host.querySelectorAll( 'button' ).length ).toBe( 1 );
	} );
} );
