/**
 * Editor-styled prompt/confirm dialogs (v0.4.1), replaces every native
 * window.prompt/confirm/alert. This controller is framework-free so ops
 * modules can await dialogs; the React host (editor-main) binds itself
 * via bindDialogHost and renders the actual modal.
 */

let host = null;

/**
 * Bind the rendering host. The host receives a request object
 * `{ kind: 'prompt'|'confirm', opts, resolve }` and must resolve exactly
 * once. Returns an unbind function.
 *
 * @param {Function} handler Host callback.
 * @return {Function} Unbind.
 */
export function bindDialogHost( handler ) {
	host = handler;
	return () => {
		if ( host === handler ) {
			host = null;
		}
	};
}

/**
 * Ask for a text/number/choice input.
 *
 * @param {Object}   opts              Options.
 * @param {string}   opts.title        Dialog title.
 * @param {string}   [opts.label]      Field label / hint below the title.
 * @param {string}   [opts.defaultValue] Prefilled value.
 * @param {string}   [opts.placeholder]  Input placeholder.
 * @param {string}   [opts.type]       'text' (default), 'number' or 'color'.
 * @param {string[]} [opts.options]    When set, renders a select instead.
 * @param {Object}   [opts.select]     Optional SECOND field, a select below
 *                                     the main input: { label, options,
 *                                     defaultValue }. With it the promise
 *                                     resolves { value, select } instead of
 *                                     the bare string (still null on cancel).
 * @param {Object}   [opts.check]      Optional checkbox below everything
 *                                     else: { label, defaultValue }. Like
 *                                     `select`, its presence switches the
 *                                     result to an object.
 * @param {string}   [opts.confirmLabel] OK button label.
 * @return {Promise<string|Object|null>} Value, or null when cancelled.
 */
export function promptDialog( opts ) {
	if ( ! host ) {
		return Promise.resolve( null );
	}
	return new Promise( ( resolve ) =>
		host( { kind: 'prompt', opts: opts || {}, resolve } )
	);
}

/**
 * Ask for confirmation.
 *
 * @param {Object} opts                Options.
 * @param {string} opts.title          Dialog title.
 * @param {string} [opts.message]      Body text.
 * @param {string} [opts.confirmLabel] Confirm button label.
 * @param {string} [opts.cancelLabel]  Cancel button label.
 * @param {boolean} [opts.danger]      Style the confirm button as destructive.
 * @return {Promise<boolean>} Confirmed?
 */
export function confirmDialog( opts ) {
	if ( ! host ) {
		return Promise.resolve( false );
	}
	return new Promise( ( resolve ) =>
		host( { kind: 'confirm', opts: opts || {}, resolve } )
	);
}
