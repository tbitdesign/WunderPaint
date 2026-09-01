/**
 * The per-image detail editor on two different hosts.
 *
 * Title, alt text, caption and description are written through the core route
 * wp/v2/media/<id>. WordPress serves it; the standalone studio does not, so
 * every save there reached nothing while the dialog closed as if it had
 * worked. The studio hides what it cannot do, and this pins both halves of
 * that: the fields and the Save button are gone when window.WPIE.standalone is
 * set, and they are untouched when it is not - the plugin must not notice the
 * rule at all.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { EditorProvider } from '../store/editor-context';
import { MetaEditor } from './meta-editor';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock( '../lib/api', () => ( {
	getMediaMeta: jest.fn( () =>
		Promise.resolve( {
			title: 'Beach',
			alt: '',
			caption: '',
			description: '',
			sourceUrl: 'https://example.test/beach.jpg',
			filename: 'beach.jpg',
			width: 800,
			height: 600,
			filesize: 12345,
			mime: 'image/jpeg',
			date: '2026-08-30T10:00:00',
		} )
	),
	updateMedia: jest.fn( () => Promise.resolve( {} ) ),
} ) );
jest.mock( '../lib/media-library', () => ( {
	mediaLib: {
		tags: { list: () => Promise.resolve( { items: [] } ) },
		items: () => Promise.resolve( { items: [ {} ] } ),
		assign: () => Promise.resolve( {} ),
	},
	ensureTagIds: () => Promise.resolve( [] ),
} ) );
jest.mock( '../lib/ml', () => ( { isModelInstalled: () => false } ) );
// The left column's three panels each ask the server on mount; none of them
// is what this test is about.
jest.mock( './usage-panel', () => ( {
	UsagePanel: () => null,
	CreditsPanel: () => null,
} ) );
jest.mock( './metadata-panel', () => ( { MetadataPanel: () => null } ) );
jest.mock( './replace-dialog', () => ( { ReplaceDialog: () => null } ) );
jest.mock( './recrop-dialog', () => ( { RecropDialog: () => null } ) );

async function mount() {
	const host = document.createElement( 'div' );
	document.body.appendChild( host );
	const root = createRoot( host );
	await act( async () => {
		root.render(
			<EditorProvider
				doc={ { w: 800, h: 600 } }
				layers={ [] }
				WPIE={ {} }
			>
				<MetaEditor
					id={ 7 }
					engine="local"
					lang=""
					onClose={ () => {} }
					onSaved={ () => {} }
					onTagsChanged={ () => {} }
					onReplaced={ () => {} }
					toasts={ { error: () => {}, success: () => {} } }
				/>
			</EditorProvider>
		);
	} );
	return root;
}

const buttonLabels = () =>
	[ ...document.querySelectorAll( '.dsm-foot button' ) ].map( ( b ) =>
		b.textContent.trim()
	);

describe( 'MetaEditor metadata fields', () => {
	afterEach( () => {
		document.body.replaceChildren();
		delete window.WPIE;
	} );

	it( 'edits and saves on a WordPress host', async () => {
		await mount();
		expect( document.querySelector( '.wpie-me-right' ) ).toBeTruthy();
		expect(
			document.querySelectorAll( '.wpie-me-right .wpie-alt-field' ).length
		).toBeGreaterThan( 0 );
		expect( buttonLabels() ).toContain( 'Save' );
	} );

	it( 'shows no unsaveable fields in the standalone studio', async () => {
		window.WPIE = { standalone: true };
		await mount();
		expect( document.querySelector( '.wpie-me-right' ) ).toBeNull();
		expect( document.querySelector( '.wpie-alt-field' ) ).toBeNull();
		expect( buttonLabels() ).not.toContain( 'Save' );
		expect( buttonLabels() ).not.toContain( 'Generate metadata' );
		// The read-only half is still the point of opening this dialog.
		expect( document.querySelector( '.wpie-me-left' ) ).toBeTruthy();
	} );
} );
