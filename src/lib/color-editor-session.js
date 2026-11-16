/** One color controller per editor. Bindings are UI state, never document/history data. */
const sessions = new WeakMap();
const hosts = new Set();

export function colorEditorSession( dispatch ) {
	if ( ! sessions.has( dispatch ) ) {
		const listeners = new Set();
		const session = {
			request: null,
			root: null,
			dock: null,
			dockCollapsed: false,
			setDock( node ) {
				if ( this.dock !== node ) {
					this.dock = node;
					this.notify();
				}
			},
			setDockCollapsed( value ) {
				this.dockCollapsed = value;
				if ( value ) {
					this.beforeChange?.();
				}
				this.notify();
			},
			dispatch,
			subscribe( listener ) {
				listeners.add( listener );
				return () => listeners.delete( listener );
			},
			notify() {
				for ( const listener of listeners ) {
					listener();
				}
			},
			open( binding, anchor ) {
				const value = binding.current;
				const nested =
					!! anchor?.closest?.( '.global-color-panel' ) &&
					! value.documentTarget &&
					! value.layer &&
					! value.ramp;
				const parent = this.request?.nested
					? this.request.parent
					: this.request;
				this.beforeChange?.();
				const mode = this.onOpen?.( value, anchor, nested ) || 'panel';
				this.request = nested
					? { binding, anchor, nested: true, parent }
					: { binding, anchor, mode };
				this.notify();
			},
			resume() {
				if ( this.request?.nested ) {
					this.request = this.request.parent;
					this.notify();
				}
			},
			clear() {
				this.request = null;
				this.notify();
			},
		};
		sessions.set( dispatch, session );
	}
	return sessions.get( dispatch );
}

export function registerColorEditor( dispatch, root ) {
	const session = colorEditorSession( dispatch );
	session.root = root;
	hosts.add( session );
	return () => {
		hosts.delete( session );
		session.root = null;
		session.request = null;
	};
}

/** Extension React roots can use the editor containing their swatch, too. */
export function colorEditorFor( anchor, dispatch ) {
	const own = dispatch && colorEditorSession( dispatch );
	if ( own?.root ) {
		return own;
	}
	return [ ...hosts ].find( ( host ) => host.root?.contains( anchor ) );
}
