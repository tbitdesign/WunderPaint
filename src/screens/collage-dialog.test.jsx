/**
 * Collage & Photo Grid in three columns (20.10.2026): every layout is a card
 * on the left, the settings sit in three cards on the right, and every
 * layout - the five new ones included - opens with the document's photos
 * without an error and shows only the settings that mean something for it.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { CollageDialog } from './collage-dialog';
import { EditorProvider } from '../store/editor-context';
import { makeImage } from '../store/document';

global.IS_REACT_ACT_ENVIRONMENT = true;

const plate =
	'data:image/svg+xml;charset=utf-8,' +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40"><rect width="60" height="40" fill="#88aacc"/></svg>'
	);

describe( 'Collage & Photo Grid layout', () => {
	let host, root;
	beforeEach( () => {
		host = document.createElement( 'div' );
		document.body.appendChild( host );
		root = createRoot( host );
		const photos = [ 0, 1, 2, 3, 4 ].map( ( i ) =>
			makeImage( {
				name: 'Photo ' + i,
				src: plate + '#' + i,
				naturalW: 600,
				naturalH: 400,
				w: 300,
				h: 200,
			} )
		);
		act( () => {
			root.render(
				<EditorProvider
					doc={ { w: 1200, h: 800 } }
					layers={ photos }
					WPIE={ {} }
				>
					<CollageDialog
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

	const button = ( text ) =>
		[ ...host.querySelectorAll( 'button' ) ].find( ( b ) =>
			b.textContent.includes( text )
		);
	const sliders = () =>
		[
			...host.querySelectorAll(
				'.clg-right .dsm-sliderrow-head span:first-child'
			),
		].map( ( s ) => s.textContent );

	it( 'lists every layout as a card and starts empty in the middle', () => {
		expect(
			host.querySelectorAll( '.clg-left .dsm-pickrow' )
		).toHaveLength( 15 );
		expect( host.querySelector( '.clg-empty' ) ).not.toBeNull();
		expect(
			host.querySelectorAll( '.clg-right > .dsm-card' )
		).toHaveLength( 3 );
	} );

	it( 'opens every layout with the document photos and fitting settings', () => {
		act( () => button( 'Use the photos in this document' ).click() );
		expect( host.querySelector( '.clg-stage canvas' ) ).not.toBeNull();
		const cards = [ ...host.querySelectorAll( '.clg-left .dsm-pickrow' ) ];
		for ( const card of cards ) {
			act( () => card.click() );
			expect( card.getAttribute( 'aria-pressed' ) ).toBe( 'true' );
			expect( card.querySelector( 'small' ).textContent ).not.toBe( '' );
		}
		const pickLayout = ( name ) =>
			act( () =>
				cards
					.find(
						( c ) => c.querySelector( 'b' ).textContent === name
					)
					.click()
			);
		pickLayout( 'Split' );
		expect( sliders() ).toContain( 'Panels' );
		expect( sliders() ).not.toContain( 'Frame' );
		expect( sliders() ).not.toContain( 'Corner radius' );
		pickLayout( 'Diagonal' );
		expect( sliders() ).not.toContain( 'Frame' );
		pickLayout( 'Masonry' );
		expect( sliders() ).toContain( 'Columns (0 = auto)' );
		expect( sliders() ).toContain( 'Corner radius' );
		pickLayout( 'Hexagon' );
		expect( sliders() ).not.toContain( 'Corner radius' );
		expect( sliders() ).toContain( 'Frame' );
	} );
} );
