/**
 * QA stage setup for Soundwave Art.
 *
 * The shared mock stands in for the editor: a document to work on, a
 * media picker with real plates, the icon and font libraries, and it
 * opens the registered generator by itself.
 */
window.__wpieQA = true;
window.__installWpieMock( {
	iconClassPrefix: 'wpiesnd',
	doc: { w: 1600, h: 1000 },
	readyDelay: 900,
} );
