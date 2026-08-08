/**
 * QA stage setup for the origami studio.
 *
 * The shared mock opens generator dialogs by itself; its media picker
 * serves six coloured plates, which is all a folding sheet needs.
 */
window.__wpieQA = true;
window.__installWpieMock( {
	iconClassPrefix: 'wpieog',
	doc: { w: 1600, h: 1200 },
	readyDelay: 700,
} );
