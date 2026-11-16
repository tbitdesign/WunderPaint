/** Visual-only rich-text preview. The editable DOM and its selection are untouched. */
export function previewTextColor( root, range, color ) {
	if ( ! root ) {
		return () => {};
	}
	const doc = root.ownerDocument;
	const copy = root.cloneNode( true );
	copy.classList.add( 'text-edit-color-preview' );
	copy.contentEditable = 'false';
	copy.removeAttribute( 'role' );
	copy.removeAttribute( 'id' );
	copy.setAttribute( 'aria-hidden', 'true' );
	copy.tabIndex = -1;
	copy.style.pointerEvents = 'none';
	const pathOf = ( node ) => {
		const path = [];
		while ( node && node !== root ) {
			if ( ! node.parentNode ) {
				return null;
			}
			path.unshift(
				Array.prototype.indexOf.call( node.parentNode.childNodes, node )
			);
			node = node.parentNode;
		}
		return node === root ? path : null;
	};
	const find = ( path ) =>
		path?.reduce( ( node, index ) => node?.childNodes[ index ], copy );
	const previewRange = doc.createRange();
	const start = range && find( pathOf( range.startContainer ) );
	const end = range && find( pathOf( range.endContainer ) );
	if ( range && ! range.collapsed && start && end ) {
		previewRange.setStart( start, range.startOffset );
		previewRange.setEnd( end, range.endOffset );
	} else {
		previewRange.selectNodeContents( copy );
	}
	const span = doc.createElement( 'span' );
	span.style.color = color;
	span.appendChild( previewRange.extractContents() );
	for ( const child of span.querySelectorAll( '*' ) ) {
		child.style.color = color;
	}
	previewRange.insertNode( span );
	const opacity = root.style.opacity;
	root.after( copy );
	root.style.opacity = '0';
	let cleared = false;
	return () => {
		if ( cleared ) {
			return;
		}
		cleared = true;
		copy.remove();
		root.style.opacity = opacity;
	};
}
