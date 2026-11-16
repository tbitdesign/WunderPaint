/** Local browser QA with the real editor state, bridge, dialogs and color panel. */
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorProvider, useEditor } from '@editor/store/editor-context';
import { ColorPanel } from '@editor/screens/panels/color-panel';
import { DialogHost } from '@editor/components/input-dialog';
import { proBridge } from '@editor/lib/pro-bridge';
window.__wpieQA = true;
const stored = new Map();

window.WPIE = {
	locale:
		new URLSearchParams( window.location.search ).get( 'locale' ) ||
		'en_US',
	bridge: {
		...proBridge,
		storage: {
			async get( key ) {
				return stored.get( key );
			},
			async set( key, value ) {
				stored.set( key, structuredClone( value ) );
			},
		},
	},
	api: {
		registerGenerator( generator ) {
			window.genGenerator = generator;
		},
	},
};

function Host() {
	const editor = useEditor();
	window.genEditor = editor;
	useEffect( () => {
		// Initialize the normal panel command before opening a nested swatch.
		editor.dispatch( { type: 'TOGGLE_COLOR_PANEL', show: false } );
	}, [] );
	return (
		<>
			<DialogHost />
			<ColorPanel editor={ editor } extras={ {} } />
		</>
	);
}

createRoot( document.getElementById( 'app' ) ).render(
	<EditorProvider
		doc={ {
			name: 'Math Figures QA',
			w: 1600,
			h: 1200,
			bg: 'transparent',
			source: { isNew: true },
		} }
		layers={ [] }
		WPIE={ {} }
	>
		<Host />
	</EditorProvider>
);

const fetchOriginal = window.fetch.bind( window );
window.fetch = ( url, opts ) => {
	const u = String( url );
	if ( ! u.startsWith( 'file://' ) ) return fetchOriginal( url, opts );
	return new Promise( ( resolve, reject ) => {
		const x = new XMLHttpRequest();
		x.open( 'GET', u );
		x.responseType = 'arraybuffer';
		x.onload = () => resolve( new Response( x.response, { status: 200 } ) );
		x.onerror = () => reject( new Error( 'Local font request failed' ) );
		x.send();
	} );
};
