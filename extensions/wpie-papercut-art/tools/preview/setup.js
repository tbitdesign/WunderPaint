/**
 * QA stage setup for Papercut Art.
 *
 * The shared mock stands in for the editor: a document, the ui kit,
 * pickers and dispatch logging - and it opens the registered generator
 * by itself once everything is wired.
 */
window.__wpieQA = true;
window.__installWpieMock( {
	iconClassPrefix: 'wpiepca',
	doc: { w: 1500, h: 1000 },
	readyDelay: 900,
} );
