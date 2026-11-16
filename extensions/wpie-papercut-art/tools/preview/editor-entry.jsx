/** Local browser QA with the real editor state, bridge, dialogs and color panel. */
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
	EditorProvider,
	useEditor,
} from '../../../../src/store/editor-context';
import { ColorPanel } from '../../../../src/screens/panels/color-panel';
import { DialogHost } from '../../../../src/components/input-dialog';
import { proBridge } from '../../../../src/lib/pro-bridge';
import './library-entry.js';

window.WPIE = {
	locale:
		new URLSearchParams( window.location.search ).get( 'locale' ) ||
		'en_US',
	bridge: proBridge,
	api: {
		registerGenerator( generator ) {
			window.pcaGenerator = generator;
		},
	},
};

function Host() {
	const editor = useEditor();
	window.pcaEditor = editor;
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
			name: 'Papercut browser QA',
			w: 1200,
			h: 800,
			bg: 'transparent',
			source: { isNew: true },
		} }
		layers={ [] }
		WPIE={ {} }
	>
		<Host />
	</EditorProvider>
);
