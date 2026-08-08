/**
 * QA stage setup for Reformat.
 *
 * The shared mock stands in for the editor: a document to work on, a
 * media picker with real plates, the icon and font libraries, and it
 * opens the registered generator by itself.
 */
window.__wpieQA = true;
window.__installWpieMock( {
	iconClassPrefix: 'wpiefp',
	doc: { w: 1600, h: 1000 },
	readyDelay: 900,
	// Reformat re-lays out what is already on the canvas, so it refuses
	// to open on an empty document. That is the right answer, and it
	// means the stage has to hand it something to work with.
	patch: ( WPIE, editor ) => {
		editor.state.layers = [
			{
				id: 'l-bg',
				type: 'shape',
				name: 'Background',
				x: 0,
				y: 0,
				w: 1600,
				h: 1000,
				shape: 'rect',
				fill: '#1d4e89',
			},
			{
				id: 'l-head',
				type: 'text',
				name: 'Headline',
				x: 120,
				y: 160,
				w: 900,
				h: 180,
				text: 'Sommeraktion',
				fontSize: 96,
				fontFamily: 'Inter',
				weight: 700,
				color: '#ffffff',
			},
			{
				id: 'l-sub',
				type: 'text',
				name: 'Subline',
				x: 120,
				y: 380,
				w: 800,
				h: 90,
				text: 'Nur bis Ende August',
				fontSize: 48,
				fontFamily: 'Inter',
				weight: 400,
				color: '#f5f0e6',
			},
		];
	},
} );
