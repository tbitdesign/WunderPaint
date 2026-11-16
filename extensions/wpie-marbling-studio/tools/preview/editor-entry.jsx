/** Local QA uses the real editor state, dialogs, bridge and color controls. */
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
	EditorProvider,
	useEditor,
} from '../../../../src/store/editor-context';
import { ColorPanel } from '../../../../src/screens/panels/color-panel';
import { DialogHost } from '../../../../src/components/input-dialog';
import { proBridge } from '../../../../src/lib/pro-bridge';

window.__wpieQA = true;
window.WPIE = {
	locale:
		new URLSearchParams( window.location.search ).get( 'locale' ) ||
		'en_US',
	bridge: proBridge,
	api: {
		registerGenerator( generator ) {
			window.fluidGenerator = generator;
		},
	},
};
function Host() {
	const editor = useEditor();
	window.fluidEditor = editor;
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
createRoot( document.getElementById( 'app' ) ).render(
	<EditorProvider
		doc={ {
			name: 'Fluid Lab browser QA',
			w: 1200,
			h: 900,
			bg: 'transparent',
			source: { isNew: true },
		} }
		layers={ [] }
		WPIE={ {} }
	>
		<Host />
	</EditorProvider>
);
