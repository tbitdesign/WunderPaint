// Real editor state, dialogs and bridge; only persistence is local to this test.
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorProvider, useEditor } from '@editor/store/editor-context';
import { ColorPanel } from '@editor/screens/panels/color-panel';
import { DialogHost } from '@editor/components/input-dialog';
import { proBridge } from '@editor/lib/pro-bridge';
const stored = new Map();
window.__auditActions = [];
window.__auditMessages = [];
window.__wpieQA = true;
window.WPIE = {
	locale: 'en_US',
	extensions: window.__auditBoot.extensions,
	fonts: [ 'Inter', 'Georgia', 'Arial' ],
	customFonts: [],
	brandKits: [],
	providers: {},
	bridge: {
		...proBridge,
		storage: {
			async get( k ) {
				return stored.get( k );
			},
			async set( k, v ) {
				stored.set( k, structuredClone( v ) );
			},
		},
	},
	api: {
		registerGenerator( g ) {
			window.__auditActions.push( g );
		},
		registerMenuItem( _m, g ) {
			window.__auditActions.push( g );
		},
		registerBinding() {},
	},
};
function Host() {
	const editor = useEditor();
	window.__auditEditor = editor;
	useEffect( () => {
		editor.dispatch( { type: 'TOGGLE_COLOR_PANEL', show: false } );
	}, [] );
	return (
		<>
			<DialogHost />
			<ColorPanel editor={ editor } extras={ {} } />
		</>
	);
}
const layers = [
	proBridge.documents.makeShape( {
		name: 'Blue shape',
		shape: 'ellipse',
		x: 250,
		y: 180,
		w: 360,
		h: 360,
		fill: '#3b66ff',
	} ),
	proBridge.documents.makeText( {
		name: 'Preview audit',
		text: 'WunderPaint',
		x: 720,
		y: 420,
		w: 650,
		h: 120,
		fontSize: 72,
		fontFamily: 'Arial',
		color: '#ffffff',
	} ),
];
createRoot( document.getElementById( 'app' ) ).render(
	<EditorProvider
		doc={ {
			name: 'Particle Strokes QA',
			w: 1600,
			h: 1000,
			bg: '#101318',
			source: { isNew: true },
		} }
		layers={ layers }
		WPIE={ {} }
	>
		<Host />
	</EditorProvider>
);
window.__auditOpen = () => {
	const extras = {
		toasts: {
			error: ( m ) => __auditMessages.push( m ),
			success() {},
			push: ( m ) => __auditMessages.push( m ),
		},
		pickImage: async () => null,
	};
	Promise.resolve(
		window.__auditActions[ 0 ].run( {
			editor: window.__auditEditor,
			extras,
			layer: null,
		} )
	).catch( ( e ) => window.__auditMessages.push( e.message ) );
};
const fetchOriginal = window.fetch.bind( window );
window.fetch = ( url, opts ) => {
	if ( ! String( url ).startsWith( 'file://' ) )
		return fetchOriginal( url, opts );
	return new Promise( ( resolve, reject ) => {
		const x = new XMLHttpRequest();
		x.open( 'GET', String( url ) );
		x.responseType = 'arraybuffer';
		x.onload = () => resolve( new Response( x.response, { status: 200 } ) );
		x.onerror = () => reject( Error( 'Local asset unavailable' ) );
		x.send();
	} );
};
