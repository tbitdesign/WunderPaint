import { beginColorPick } from '../../lib/color-pick-session';

/** Every entry point uses the Color panel's visible target and sampling options. */
export const eyedropperTool = {
	onDown( tc, e ) {
		beginColorPick( tc.editor, { background: e.altKey } );
	},
	onMove() {},
	onUp() {},
};
