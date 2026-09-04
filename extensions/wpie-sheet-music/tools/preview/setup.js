/** QA stage setup: the shared mock stands in for the editor and opens the generator. */
window.__wpieQA = true;
window.__installWpieMock( {
	iconClassPrefix: 'wpiesm',
	doc: { w: 1600, h: 1000 },
	readyDelay: 900,
} );
