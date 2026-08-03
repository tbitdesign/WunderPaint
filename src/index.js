import { createRoot } from '@wordpress/element';

import App from './app';
import { announceExtensionApi } from './lib/extensions';
import { proBridge } from './lib/pro-bridge';
import './styles/editor.css';

const rootEl = document.getElementById( 'wpie-root' );
if ( rootEl ) {
	createRoot( rootEl ).render( <App /> );
	// Extensions register via window.WPIE.api / the `wpie.ready` action.
	announceExtensionApi( proBridge );
}
