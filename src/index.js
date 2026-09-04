import { createRoot } from '@wordpress/element';

import App from './app';
import { ErrorBoundary } from './components/error-boundary';
import { announceExtensionApi } from './lib/extensions';
import { bootExtensions } from './lib/extension-loader';
import { proBridge } from './lib/pro-bridge';
import './styles/editor.css';

const rootEl = document.getElementById( 'wpie-root' );
if ( rootEl ) {
	// The root boundary: a render error anywhere becomes a crash screen
	// with reload and project download, never a silent white page.
	createRoot( rootEl ).render(
		<ErrorBoundary root source="editor">
			<App />
		</ErrorBoundary>
	);
	// Extensions register via window.WPIE.api / the `wpie.ready` action.
	announceExtensionApi( proBridge );
	// WordPress hands the package list over and the editor loads it:
	// placeholders where the inventory allows, scripts otherwise (see
	// lib/extension-loader.js). The Studio injects its own combined file,
	// the pick overlay loads no packages at all.
	if ( window.WPIE && ! window.WPIE.standalone && ! window.WPIE.pickEmbed ) {
		bootExtensions( window.WPIE.extensions || [], {
			locale: window.WPIE.locale || '',
		} );
	}
}
