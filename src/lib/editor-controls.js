/**
 * Shared semantics for existing Boolean inputs, including lazy extensions.
 * Keep the real input, checked/disabled state and native label/keyboard events.
 * Selection/confirmation checkboxes opt out with data-checkbox="selection".
 */
const installations = new WeakMap();

export function installEditorControls( doc = document ) {
	if ( installations.has( doc ) ) {
		return installations.get( doc );
	}
	const managed = new WeakSet();
	const decorate = ( input ) => {
		const inEditor = input.closest( '#wpie-root' );
		const isSelection = input.dataset.checkbox === 'selection';
		if (
			managed.has( input ) &&
			( input.type !== 'checkbox' || ! inEditor || isSelection )
		) {
			if ( input.getAttribute( 'role' ) === 'switch' ) {
				input.removeAttribute( 'role' );
			}
			managed.delete( input );
		}
		if (
			input.type === 'checkbox' &&
			inEditor &&
			! isSelection &&
			! input.hasAttribute( 'role' )
		) {
			input.setAttribute( 'role', 'switch' );
			managed.add( input );
		}
	};
	const scan = ( node ) => {
		if ( node.nodeType !== 1 ) {
			return;
		}
		if ( node.matches( 'input' ) ) {
			decorate( node );
		}
		node.querySelectorAll( 'input[type="checkbox"]' ).forEach( decorate );
	};
	const observer = new doc.defaultView.MutationObserver( ( records ) => {
		const nodes = new Set();
		for ( const record of records ) {
			if ( record.type === 'attributes' ) {
				nodes.add( record.target );
			} else {
				record.addedNodes.forEach( ( node ) => nodes.add( node ) );
			}
		}
		nodes.forEach( scan );
	} );
	observer.observe( doc.documentElement, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: [ 'type', 'data-checkbox' ],
	} );
	scan( doc.documentElement );
	const dispose = () => {
		observer.disconnect();
		installations.delete( doc );
	};
	installations.set( doc, dispose );
	return dispose;
}
