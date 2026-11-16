/**
 * Background Studio in three columns (20.10.2026): every style is a card in
 * the left column, its settings sit in the right one, and a choice with more
 * than three options is an option grid, never a segment that wraps. The
 * fixed window size itself lives in background-studio.css.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { BackgroundStudioDialog } from './background-studio-dialog';
import { EditorProvider } from '../store/editor-context';

global.IS_REACT_ACT_ENVIRONMENT = true;

describe( 'Background Studio layout', () => {
	let host, root;
	beforeEach( () => {
		host = document.createElement( 'div' );
		document.body.appendChild( host );
		root = createRoot( host );
		act( () => {
			root.render(
				<EditorProvider
					doc={ { w: 400, h: 300 } }
					layers={ [] }
					WPIE={ {} }
				>
					<BackgroundStudioDialog
						onClose={ () => {} }
						extras={ { toasts: {} } }
					/>
				</EditorProvider>
			);
		} );
	} );
	afterEach( () => {
		act( () => root.unmount() );
		host.remove();
	} );

	it( 'lists every style as a card and shows its own settings on the right', () => {
		expect( host.querySelector( '.dsm.bgs .bgs-body' ) ).not.toBeNull();
		const cards = [ ...host.querySelectorAll( '.bgs-left .dsm-pickrow' ) ];
		expect( cards ).toHaveLength( 16 );
		for ( const card of cards ) {
			act( () => card.click() );
			expect( card.getAttribute( 'aria-pressed' ) ).toBe( 'true' );
			expect( card.querySelector( 'small' ).textContent ).not.toBe( '' );
			const right = host.querySelector( '.bgs-right' );
			const head = right.querySelectorAll( '.dsm-card-head' )[ 1 ];
			expect( head.textContent ).toBe(
				card.querySelector( 'b' ).textContent
			);
			expect(
				right.querySelectorAll( '.dsm-sliderrow' ).length
			).toBeGreaterThan( 0 );
			right
				.querySelectorAll( '.dsm-seg' )
				.forEach( ( seg ) =>
					expect( seg.children.length ).toBeLessThanOrEqual( 3 )
				);
		}
		expect(
			host.querySelectorAll(
				'.bgs-left .dsm-pickrow[aria-pressed="true"]'
			)
		).toHaveLength( 1 );
	} );

	it( 'keeps colors, settings and looks in the right column', () => {
		const right = host.querySelector( '.bgs-right' );
		expect( right.querySelectorAll( ':scope > .dsm-card' ) ).toHaveLength(
			3
		);
		expect(
			right.querySelectorAll( '.dsm-opts .dsm-opt' ).length
		).toBeGreaterThan( 10 );
		expect( host.querySelector( '.bgs-main .bgs-stage' ) ).not.toBeNull();
	} );
} );
