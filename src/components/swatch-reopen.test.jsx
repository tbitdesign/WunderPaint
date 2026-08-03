/**
 * SwatchButton reopen crash (v1.24.7). Clicking the fill swatch, closing the
 * popover with an outside click, then clicking the swatch again used to read
 * `e.currentTarget` inside a setState UPDATER. React runs the updater in a
 * later phase, by which point it has nulled the synthetic event's
 * currentTarget, so `currentTarget.getBoundingClientRect()` threw and took
 * down the whole React root ("black screen"). The fix reads the rect
 * synchronously in the handler. This test reproduces the reopen sequence and
 * asserts it never throws and the popover comes back.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { SwatchButton } from './color-popover';

// React 18 act() support flag for the jsdom environment.
global.IS_REACT_ACT_ENVIRONMENT = true;

// ColorPopover pulls in the editor context + a document render for its palette
// suggestions; stub both so the swatch/popover can mount in isolation.
// Null on purpose: this doubles as the regression test for the bridge's
// mountColorButton, which mounts SwatchButton in a standalone root with
// NO provider (v1.145.4) - the popover must render regardless.
jest.mock( '../store/editor-context', () => ( {
	useEditorMaybe: () => null,
} ) );
jest.mock( '../lib/raster', () => ( {
	renderToCanvas: () => Promise.resolve( null ),
	sharedImageCache: {},
} ) );

const click = ( el ) =>
	el.dispatchEvent( new window.MouseEvent( 'click', { bubbles: true } ) );
const mousedown = ( el ) =>
	el.dispatchEvent( new window.MouseEvent( 'mousedown', { bubbles: true } ) );

describe( 'SwatchButton reopen', () => {
	it( 'reopens without crashing after an outside-close', () => {
		const container = document.createElement( 'div' );
		document.body.appendChild( container );
		const root = createRoot( container );
		act( () => {
			root.render(
				<SwatchButton color="#3b66ff" onChange={ () => {} } />
			);
		} );
		const btn = container.querySelector( 'button' );

		// First open.
		act( () => click( btn ) );
		expect( container.querySelector( '.color-popover' ) ).toBeTruthy();

		// Reopen: the popover's outside-mousedown closes it, then the click
		// must reopen it, this is the sequence that used to throw.
		act( () => {
			mousedown( btn );
			click( btn );
		} );
		expect( container.querySelector( '.color-popover' ) ).toBeTruthy();

		act( () => root.unmount() );
		container.remove();
	} );
} );
