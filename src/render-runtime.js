/**
 * Standalone render runtime (v1.157.0): exposes the editor's building
 * blocks (window.WPIE.bridge, the same frozen object extensions receive
 * on the editor page) on OTHER screens - the block editor and, on
 * demand, the front end - so Pro's dynamic-image blocks can render
 * templates with the REAL engine there. The slim bootstrap payload
 * arrives as an inline script (Assets::runtime_bootstrap); the editor
 * page itself never loads this bundle (its own boot announces the
 * bridge first).
 */

import { initApi } from './lib/api';
import { proBridge } from './lib/pro-bridge';
import { announceExtensionApi } from './lib/extensions';

window.WPIE = window.WPIE || {};
if ( ! window.WPIE.bridge ) {
	initApi( window.WPIE );
	// The full announcement (v1.158.0, was a bare bridge assignment):
	// extension packs injected later - e.g. for generator layers inside a
	// template being baked - register through window.WPIE.api exactly
	// like on the editor page, so their resolve hooks re-render 3D text
	// and friends per post.
	announceExtensionApi( proBridge );
}
document.dispatchEvent( new CustomEvent( 'wpie:runtime-ready' ) );
