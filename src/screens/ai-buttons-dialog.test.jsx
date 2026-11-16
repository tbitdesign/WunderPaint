/**
 * The AI Studio Buttons dialog (spec 2026-09-16): rows, hiding, order,
 * own buttons, saving. Rendered with createRoot like the other dialog
 * tests; the API is a fake that echoes the config.
 */

import { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock( '../lib/api', () => ( {
	...jest.requireActual( '../lib/api' ),
	aiButtons: {
		get: jest.fn(),
		save: jest.fn( async ( config ) => ( { ...config } ) ),
	},
} ) );
// lib/ai-buttons pulls ai-actions, which pulls the worker module with
// import.meta (unparseable in the CJS jest runtime); nothing here runs it.
jest.mock( '../lib/local-image-ops', () => ( {} ) );

import { aiButtons as api } from '../lib/api';
import { AiButtonsDialog } from './ai-buttons-dialog';

global.IS_REACT_ACT_ENVIRONMENT = true;

const OWN = {
	id: 'btn_own00001',
	title: 'Comic Art',
	description: 'Comic look',
	input: 'layer',
	prompt: 'Make it comic.',
	refImageId: 0,
	refImageUrl: '',
	refThumbUrl: '',
	output: 'newLayer',
	source: 'cartoon',
};

function mount( config ) {
	window.WPIE = {
		aiButtons: config,
		canManage: true,
		toasts: { success: jest.fn() },
		// The shared picker (Media Library Manager or classic wp.media).
		pickMedia: jest.fn( async () => [
			{
				id: 12,
				url: 'https://x/large.jpg',
				thumb: 'https://x/thumb.jpg',
			},
		] ),
	};
	const wrap = document.createElement( 'div' );
	wrap.id = 'wpie-root';
	document.body.appendChild( wrap );
	const root = createRoot( wrap );
	const onClose = jest.fn();
	act( () =>
		root.render(
			<AiButtonsDialog
				extras={ { toasts: { success: jest.fn() } } }
				onClose={ onClose }
			/>
		)
	);
	return { root, onClose };
}

const q = ( sel ) => document.querySelector( sel );
const qa = ( sel ) => [ ...document.querySelectorAll( sel ) ];
const click = ( el ) =>
	act( () =>
		el.dispatchEvent( new MouseEvent( 'click', { bubbles: true } ) )
	);
const type = ( el, value ) =>
	act( () => {
		const proto =
			'TEXTAREA' === el.tagName
				? window.HTMLTextAreaElement.prototype
				: window.HTMLInputElement.prototype;
		Object.getOwnPropertyDescriptor( proto, 'value' ).set.call( el, value );
		el.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	} );
const rowIds = ( section ) =>
	qa(
		`.wpie-aib-sect:nth-child(${
			'cloud' === section ? 1 : 2
		}) .wpie-aib-row`
	).map( ( r ) => r.dataset.id );

describe( 'AiButtonsDialog', () => {
	afterEach( () => {
		document.body.replaceChildren();
		jest.clearAllMocks();
	} );

	it( 'lists both sections, hidden rows dimmed, own buttons first in their order', () => {
		mount( {
			custom: [ OWN ],
			hidden: [ 'colorize' ],
			order: { local: [], cloud: [ 'btn_own00001' ] },
		} );
		expect( rowIds( 'cloud' )[ 0 ] ).toBe( 'btn_own00001' );
		expect( rowIds( 'cloud' ) ).toContain( 'colorize' );
		expect( rowIds( 'local' ) ).toContain( 'removeBg' );
		expect( q( '.wpie-aib-row[data-id="colorize"]' ).classList ).toContain(
			'is-hidden'
		);
		expect(
			q( '.wpie-aib-row[data-id="enhanceDesign"]' ).classList
		).not.toContain( 'is-hidden' );
		// Nothing selected yet: the form is not there, the starters are.
		expect( q( '#wpie-aib-title' ) ).toBeNull();
		expect( qa( '.wpie-aib-starters .dgs-preset' ) ).toHaveLength( 6 );
	} );

	it( 'toggles hiding and saves the whole config', async () => {
		mount( {
			custom: [],
			hidden: [ 'colorize' ],
			order: { local: [], cloud: [] },
		} );
		click( q( '.wpie-aib-row[data-id="colorize"] [data-act="hide"]' ) );
		expect(
			q( '.wpie-aib-row[data-id="colorize"]' ).classList
		).not.toContain( 'is-hidden' );
		click( q( '.wpie-aib-row[data-id="cartoon"] [data-act="hide"]' ) );
		await act( async () => {
			q( '[data-act="save"]' ).click();
		} );
		expect( api.save ).toHaveBeenCalledTimes( 1 );
		const sent = api.save.mock.calls[ 0 ][ 0 ];
		expect( sent.hidden ).toEqual( [ 'cartoon' ] );
		expect( window.WPIE.aiButtons.hidden ).toEqual( [ 'cartoon' ] );
	} );

	it( 'moves a row and stores the full order of its section', () => {
		mount( { custom: [], hidden: [], order: { local: [], cloud: [] } } );
		const before = rowIds( 'cloud' );
		click(
			q( `.wpie-aib-row[data-id="${ before[ 1 ] }"] [data-act="up"]` )
		);
		const after = rowIds( 'cloud' );
		expect( after[ 0 ] ).toBe( before[ 1 ] );
		expect( after[ 1 ] ).toBe( before[ 0 ] );
		expect( after.length ).toBe( before.length );
	} );

	it( 'adds an own button, edits it in the form and refuses to save it empty', async () => {
		mount( null );
		click( q( '[data-act="add"]' ) );
		const own = q( '.wpie-aib-row .wpie-aib-name.is-own' );
		expect( own ).toBeTruthy();
		expect( rowIds( 'cloud' )[ 0 ] ).toMatch( /^btn_[a-z0-9]{8}$/ );
		expect( q( '#wpie-aib-title' ).value ).toBe( '' );

		await act( async () => {
			q( '[data-act="save"]' ).click();
		} );
		expect( api.save ).not.toHaveBeenCalled();
		expect( q( '.wpie-aib-error' ).textContent ).toMatch(
			/title and a prompt/i
		);

		type( q( '#wpie-aib-title' ), 'Line Art' );
		type( q( '#wpie-aib-prompt' ), 'Turn it into clean line art.' );
		// Text input drops the reference block and switches the result.
		click( q( '.dsm-pickrow[data-input="text"]' ) );
		expect( q( '.wpie-aib-ref' ) ).toBeNull();
		expect(
			qa( '.dsm-pickrow[data-output]' ).map( ( b ) => b.dataset.output )
		).toEqual( [ 'replaceText', 'alternatives' ] );
		expect(
			q( '.dsm-pickrow[data-output="replaceText"]' ).getAttribute(
				'aria-pressed'
			)
		).toBe( 'true' );

		await act( async () => {
			q( '[data-act="save"]' ).click();
		} );
		expect( api.save ).toHaveBeenCalledTimes( 1 );
		const sent = api.save.mock.calls[ 0 ][ 0 ];
		expect( sent.custom ).toHaveLength( 1 );
		expect( sent.custom[ 0 ] ).toEqual(
			expect.objectContaining( {
				title: 'Line Art',
				prompt: 'Turn it into clean line art.',
				input: 'text',
				output: 'replaceText',
				refImageId: 0,
			} )
		);
		expect( sent.order.cloud[ 0 ] ).toBe( sent.custom[ 0 ].id );
	} );

	it( 'duplicates a prompt button with its prompt, right below it', () => {
		mount( null );
		click( q( '.wpie-aib-row[data-id="cartoon"] [data-act="dup"]' ) );
		const ids = rowIds( 'cloud' );
		const at = ids.indexOf( 'cartoon' );
		expect( ids[ at + 1 ] ).toMatch( /^btn_/ );
		expect( q( '#wpie-aib-title' ).value ).toBe( 'Cartoon' );
		expect( q( '#wpie-aib-prompt' ).value ).toMatch(
			/cartoon illustration/i
		);
		expect(
			q( '.dsm-pickrow[data-input="layer"]' ).getAttribute(
				'aria-pressed'
			)
		).toBe( 'true' );
		// Code buttons and local tools cannot be duplicated.
		expect(
			q( '.wpie-aib-row[data-id="inpaint"] [data-act="dup"]' ).disabled
		).toBe( true );
		expect(
			q( '.wpie-aib-row[data-id="removeBg"] [data-act="dup"]' ).disabled
		).toBe( true );
	} );

	it( 'asks before closing with unsaved changes, and deletes in two steps', () => {
		const { onClose } = mount( {
			custom: [ OWN ],
			hidden: [],
			order: { local: [], cloud: [] },
		} );
		click( q( '.wpie-aib-row[data-id="btn_own00001"] .wpie-aib-name' ) );
		click( q( '[data-act="del"]' ) );
		expect( q( '.wpie-aib-row[data-id="btn_own00001"]' ) ).toBeTruthy();
		click( q( '[data-act="del"]' ) );
		expect( q( '.wpie-aib-row[data-id="btn_own00001"]' ) ).toBeNull();

		const closeBtn = qa( '.dsm-actions button' ).find( ( b ) =>
			/close/i.test( b.textContent )
		);
		click( closeBtn );
		expect( onClose ).not.toHaveBeenCalled();
		expect( closeBtn.textContent ).toMatch( /discard/i );
		click( closeBtn );
		expect( onClose ).toHaveBeenCalledTimes( 1 );
	} );
} );

describe( 'the reference image', () => {
	afterEach( () => {
		document.body.replaceChildren();
		jest.clearAllMocks();
	} );

	it( 'comes from the shared Media Library picker, never a picker of its own', async () => {
		mount( {
			custom: [ OWN ],
			hidden: [],
			order: { local: [], cloud: [] },
		} );
		click( q( '.wpie-aib-row[data-id="btn_own00001"] .wpie-aib-name' ) );
		expect( q( '.wpie-aib-ref img' ) ).toBeNull();
		await act( async () => {
			q( '[data-act="pick"]' ).click();
		} );
		expect( window.WPIE.pickMedia ).toHaveBeenCalledWith(
			expect.objectContaining( { multiple: false, types: 'image' } )
		);
		expect( q( '.wpie-aib-ref img' ).getAttribute( 'src' ) ).toBe(
			'https://x/thumb.jpg'
		);
		await act( async () => {
			q( '[data-act="save"]' ).click();
		} );
		const sent = api.save.mock.calls[ 0 ][ 0 ];
		expect( sent.custom[ 0 ].refImageId ).toBe( 12 );
		expect( sent.custom[ 0 ].refImageUrl ).toBe( 'https://x/large.jpg' );
		// Nothing of a mini library was rendered inside the dialog.
		expect( q( '.media-picker' ) ).toBeNull();
	} );
} );

describe( 'the starter examples', () => {
	afterEach( () => {
		document.body.replaceChildren();
		jest.clearAllMocks();
	} );

	it( 'become an own preset with the prompt filled in, selected for rewording', async () => {
		mount( null );
		click( q( '.dgs-preset[data-starter="headline"]' ) );
		expect( rowIds( 'cloud' )[ 0 ] ).toMatch( /^btn_/ );
		expect( q( '#wpie-aib-title' ).value ).toBe( 'Punchier Headline' );
		expect( q( '#wpie-aib-prompt' ).value ).toMatch( /punchier headline/i );
		expect(
			q( '.dsm-pickrow[data-input="text"]' ).getAttribute(
				'aria-pressed'
			)
		).toBe( 'true' );
		expect(
			q( '.dsm-pickrow[data-output="alternatives"]' ).getAttribute(
				'aria-pressed'
			)
		).toBe( 'true' );
		await act( async () => {
			q( '[data-act="save"]' ).click();
		} );
		const sent = api.save.mock.calls[ 0 ][ 0 ];
		expect( sent.custom[ 0 ].source ).toBe( 'starter_headline' );
		expect( sent.custom[ 0 ].refImageId ).toBe( 0 );
	} );
} );

describe( 'a reference image that is gone', () => {
	const GONE = {
		...OWN,
		id: 'btn_gone00001',
		title: 'Lost Look',
		refImageId: 77,
		refImageUrl: '',
		refThumbUrl: '',
	};

	afterEach( () => {
		document.body.replaceChildren();
		jest.clearAllMocks();
	} );

	it( 'is marked in the list and explained in the form', () => {
		mount( {
			custom: [ GONE, { ...OWN, refImageId: 0 } ],
			hidden: [],
			order: { local: [], cloud: [] },
		} );
		// The row says it without opening the preset.
		expect(
			q( '.wpie-aib-row[data-id="btn_gone00001"] [data-warn="ref"]' )
		).toBeTruthy();
		// A preset without any reference is not marked.
		expect(
			q( '.wpie-aib-row[data-id="btn_own00001"] [data-warn="ref"]' )
		).toBeNull();

		click( q( '.wpie-aib-row[data-id="btn_gone00001"] .wpie-aib-name' ) );
		expect( q( '.wpie-aib-ref-thumb' ).classList ).toContain( 'is-gone' );
		expect( q( '.wpie-aib-ref img' ) ).toBeNull();
		expect( q( '.wpie-aib-note[data-warn="ref"]' ).textContent ).toMatch(
			/gone from the Media Library/i
		);
	} );

	it( 'goes quiet again once a new image is picked', async () => {
		mount( {
			custom: [ GONE ],
			hidden: [],
			order: { local: [], cloud: [] },
		} );
		click( q( '.wpie-aib-row[data-id="btn_gone00001"] .wpie-aib-name' ) );
		await act( async () => {
			q( '[data-act="pick"]' ).click();
		} );
		expect( q( '[data-warn="ref"]' ) ).toBeNull();
		expect( q( '.wpie-aib-ref img' ).getAttribute( 'src' ) ).toBe(
			'https://x/thumb.jpg'
		);
	} );
} );
