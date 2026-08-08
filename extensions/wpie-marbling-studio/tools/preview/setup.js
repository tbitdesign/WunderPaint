/**
 * QA stage setup for the Marbling Studio.
 *
 * The shared mock opens generator dialogs by itself and serves a stand-in
 * document. The bath renders on WebGL2 (swiftshader in the harness) and
 * the first frame is the picture, so the ready delay stays short.
 */
window.__wpieQA = true;
window.__installWpieMock( {
	iconClassPrefix: 'wpiemb',
	doc: { w: 1400, h: 1050 },
	readyDelay: 400,
} );
