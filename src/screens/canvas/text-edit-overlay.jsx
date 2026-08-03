/**
 * On-canvas text editing via a positioned contentEditable (spec 05.2/05.4):
 * while editing, the text layer is hidden from the pixel pipeline and this
 * overlay mirrors its typography; on commit the content flows back.
 *
 * v1.46 (rich text): the overlay renders the layer's styled spans as real
 * HTML, so mixed sizes/fonts/colours are edited WYSIWYG. Marking words or
 * characters and using the options bar styles just the selection (routed
 * here via the `richTextRef` api). Enter and paste are normalized to plain
 * newlines/text so the DOM stays parseable, and the commit serializes the
 * DOM back into { text, spans }.
 */

import { useRef, useEffect } from '@wordpress/element';

import { docToScreen } from './use-viewport';
import { textEditOffset } from '../../lib/raster';

/**
 * The selection of the document the node actually lives in (v1.342.0).
 *
 * The global getSelection() reads the TOP window, which is the wrong one the
 * moment the editor renders into another document. The media-modal pick
 * overlay already boots in an iframe, and the lint rule that says so could
 * not see this file until .jsx was linted at all.
 *
 * @param {Node} node Any node inside the editable.
 * @return {Selection} The selection that owns that node.
 */
const selectionOf = ( node ) =>
	( node?.ownerDocument?.defaultView || window ).getSelection();

import {
	spansToHtml,
	domToSpans,
	applySelectionStyle,
	selectionStyle,
	nodeStyle,
	hasSpans,
} from '../../lib/rich-text';

// While editing, pointerdowns inside these containers must NOT commit the
// session — they host the styling controls acting on the selection.
const KEEP_ALIVE =
	'.ed-menubar, .ed-tool-opts, .ed-right, .color-popover, .font-picker-pop, .blend-menu, .layout-popover, .ed-rail-tip';

export function TextEditOverlay( {
	layer,
	zoom,
	pan,
	onCommit,
	onCancel,
	richTextRef,
} ) {
	const ref = useRef( null );
	// Sizes in the DOM are scaled by the zoom at populate time; keep that
	// zoom for parsing back so a mid-edit zoom change cannot skew values.
	const zoomRef = useRef( zoom );
	const lastRange = useRef( null );
	const doneRef = useRef( false );

	useEffect( () => {
		const el = ref.current;
		if ( ! el ) {
			return;
		}
		zoomRef.current = zoom;
		if ( hasSpans( layer ) || Array.isArray( layer.lineStyles ) ) {
			el.innerHTML = spansToHtml( layer, zoomRef.current );
		} else {
			el.textContent = layer.text || '';
		}
		el.focus();
		// Select all so typing replaces the placeholder immediately.
		const range = document.createRange();
		range.selectNodeContents( el );
		const sel = selectionOf( el );
		sel.removeAllRanges();
		sel.addRange( range );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ layer.id ] );

	const serialize = () => domToSpans( ref.current, layer, zoomRef.current );

	const commit = () => {
		if ( doneRef.current ) {
			return;
		}
		doneRef.current = true;
		if ( ! ref.current ) {
			onCancel();
			return;
		}
		const { text, spans } = serialize();
		// A document with no style overrides stays a plain text layer.
		const plain = spans.every( ( r ) => ! r.s );
		onCommit( { text, spans: plain ? null : spans } );
	};

	// The selection-styling api for the options bar (via extras.richText).
	// Shape text (area text in a silhouette) is uniform by design and the
	// renderer reads the base layer style, not spans, so it opts OUT of the
	// rich-text session: colour/font changes then patch the layer directly
	// and survive the commit (v1.211.0 - fixes colour snapping back).
	useEffect( () => {
		if ( ! richTextRef || layer.shapeBox ) {
			return;
		}
		const restore = () => {
			const el = ref.current;
			const sel = selectionOf( el );
			if (
				el &&
				lastRange.current &&
				( ! sel.rangeCount ||
					! el.contains(
						sel.getRangeAt( 0 ).commonAncestorContainer
					) )
			) {
				el.focus();
				sel.removeAllRanges();
				sel.addRange( lastRange.current );
			}
		};
		richTextRef.current = {
			layerId: layer.id,
			applyStyle: ( patch ) => {
				const el = ref.current;
				if ( ! el ) {
					return false;
				}
				restore();
				const ok = applySelectionStyle( el, patch, zoomRef.current );
				const sel = selectionOf( el );
				if ( ok && sel.rangeCount ) {
					lastRange.current = sel.getRangeAt( 0 ).cloneRange();
				}
				return ok;
			},
			getStyle: () => {
				const el = ref.current;
				if ( ! el ) {
					return null;
				}
				restore();
				return selectionStyle( el, layer, zoomRef.current );
			},
			// Like getStyle but WITHOUT touching the live selection, so
			// toolbars can mirror the caret style on every selectionchange.
			peekStyle: () => {
				const el = ref.current;
				if ( ! el ) {
					return null;
				}
				const sel = selectionOf( el );
				if (
					sel.rangeCount &&
					el.contains( sel.getRangeAt( 0 ).commonAncestorContainer )
				) {
					return selectionStyle( el, layer, zoomRef.current );
				}
				if ( lastRange.current ) {
					return nodeStyle(
						lastRange.current.startContainer,
						el,
						layer,
						zoomRef.current
					);
				}
				return null;
			},
		};
		// Let toolbars re-read the session state on start/end.
		document.dispatchEvent( new CustomEvent( 'wpie-richtext-session' ) );
		return () => {
			richTextRef.current = null;
			document.dispatchEvent(
				new CustomEvent( 'wpie-richtext-session' )
			);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ layer.id ] );

	// Remember the selection (toolbar clicks move focus away) and commit on
	// pointerdown anywhere outside the overlay and the styling controls.
	useEffect( () => {
		const onSel = () => {
			const el = ref.current;
			const sel = selectionOf( el );
			if (
				el &&
				sel.rangeCount &&
				el.contains( sel.getRangeAt( 0 ).commonAncestorContainer )
			) {
				lastRange.current = sel.getRangeAt( 0 ).cloneRange();
			}
		};
		const onDown = ( e ) => {
			const el = ref.current;
			if ( ! el || el.contains( e.target ) ) {
				return;
			}
			if ( e.target.closest && e.target.closest( KEEP_ALIVE ) ) {
				return;
			}
			commit();
		};
		document.addEventListener( 'selectionchange', onSel );
		document.addEventListener( 'pointerdown', onDown, true );
		return () => {
			document.removeEventListener( 'selectionchange', onSel );
			document.removeEventListener( 'pointerdown', onDown, true );
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ layer.id ] );

	const screen = docToScreen( layer, pan, zoom );

	// Match the renderer's vertical anchor EXACTLY (v1.222.0) so entering edit
	// mode never shifts the text: the offset aligns the contentEditable's first
	// baseline (CSS half-leading) with the canvas baseline (topPad + ascent).
	// Applied to the box top because it can be negative for tight line-heights.
	const yOffset = textEditOffset( layer ) * zoom;

	return (
		<div
			ref={ ref }
			className="text-edit"
			contentEditable
			suppressContentEditableWarning
			role="textbox"
			aria-multiline="true"
			tabIndex={ 0 }
			spellCheck={ false }
			style={ {
				left: screen.x,
				top: screen.y + yOffset,
				minWidth: Math.max( 40, layer.w * zoom ),
				width: layer.fixedWidth ? layer.w * zoom : 'auto',
				minHeight: layer.h * zoom,
				boxSizing: 'border-box',
				paddingTop: 0,
				transform: `rotate(${ layer.rot || 0 }deg)`,
				transformOrigin: 'center',
				fontFamily: `"${ layer.fontFamily }", sans-serif`,
				fontWeight: layer.weight,
				fontStyle: layer.italic ? 'italic' : 'normal',
				fontSize: layer.fontSize * zoom,
				lineHeight: layer.lineHeight || 1.05,
				letterSpacing: ( layer.letterSpacing || 0 ) * zoom,
				textAlign: layer.align,
				textDecoration: layer.underline ? 'underline' : 'none',
				// CSS mirrors the non-destructive all-caps: the DOM keeps
				// the raw text, so caret offsets stay valid (v1.300).
				textTransform:
					'uppercase' === layer.textTransform ? 'uppercase' : 'none',
				color: layer.color,
			} }
			onKeyDown={ ( e ) => {
				e.stopPropagation();
				if ( 'Escape' === e.key ) {
					doneRef.current = true;
					onCancel();
				} else if ( 'Enter' === e.key && ( e.metaKey || e.ctrlKey ) ) {
					commit();
				} else if ( 'Enter' === e.key ) {
					// Keep newlines as literal \n (pre-wrap), not <div> soup.
					e.preventDefault();
					document.execCommand( 'insertText', false, '\n' );
				}
			} }
			onPaste={ ( e ) => {
				// Foreign HTML would bring foreign styling — paste plain.
				e.preventDefault();
				const text = e.clipboardData.getData( 'text/plain' );
				if ( text ) {
					document.execCommand( 'insertText', false, text );
				}
			} }
			onMouseDown={ ( e ) => e.stopPropagation() }
			onPointerDown={ ( e ) => e.stopPropagation() }
		/>
	);
}
