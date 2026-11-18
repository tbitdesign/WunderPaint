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

import {
	useRef,
	useEffect,
	useLayoutEffect,
	useState,
} from '@wordpress/element';

import { docToScreen } from './use-viewport';
import { textEditOffset, textFirstBaseline } from '../../lib/raster';
import { textEditPlacement } from './text-edit-place';
import { withTextFitForEdit } from '../../lib/text-fit';
import { previewTextColor } from '../../lib/text-color-preview';

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
	tidyLineBoxes,
	selectionStyle,
	nodeStyle,
	hasSpans,
	textRuns,
	resolveStyle,
	caseOf,
} from '../../lib/rich-text';

/**
 * A copy of the field that is laid out but neither seen nor reachable.
 *
 * @param {HTMLElement} el   The edit field.
 * @param {boolean}     deep With its content?
 * @return {HTMLElement} The copy, not yet in the document.
 */
function ghostOf( el, deep ) {
	const copy = el.cloneNode( deep );
	copy.removeAttribute( 'contenteditable' );
	copy.removeAttribute( 'role' );
	copy.removeAttribute( 'tabindex' );
	copy.setAttribute( 'aria-hidden', 'true' );
	copy.style.visibility = 'hidden';
	copy.style.pointerEvents = 'none';
	// (a turned field would report the box around its corners)
	copy.style.transform = 'none';
	return copy;
}

/**
 * A point on a line: an inline block without a size.
 *
 * @param {Document} doc   Document.
 * @param {string}   align 'baseline' or 'bottom' of the line.
 * @return {HTMLElement} The probe.
 */
function linePoint( doc, align ) {
	const probe = doc.createElement( 'span' );
	probe.style.cssText = `display:inline-block;width:0;height:0;vertical-align:${ align };`;
	return probe;
}

/**
 * Where the field's lines really are, asked of the DOM:
 *
 * `v`  - how far the field's OWN line reaches below its baseline. Text with
 *        runs ends every line there (--wpie-v, see editor/overlays.css), so
 *        that a line of plain typing fits in with the runs.
 * `px` - the first baseline, in px below the field's top.
 *
 * Asked of the DOM, not worked out. A browser lays a line out with the
 * font's ascent and descent rounded to whole pixels AT THE SIZE ON SCREEN and
 * rounds the baseline down; with runs of several sizes the tallest one on the
 * line decides. A formula in document pixels times the zoom lands beside
 * that, by a pixel or two and always on the same side, which is why a text
 * hopped up whenever it went into edit mode.
 *
 * A zero-size inline block at the start of a hidden copy of the field sits
 * exactly on the first line's baseline.
 *
 * @param {HTMLElement} el The edit field, with its content in place.
 * @return {number} Baseline in px below the field's top edge.
 */
function measureField( el ) {
	const doc = el.ownerDocument;
	// The field's own line, with nothing on it.
	const bare = ghostOf( el, false );
	const onLine = linePoint( doc, 'baseline' );
	const foot = linePoint( doc, 'bottom' );
	bare.append( onLine, foot );
	el.parentNode.appendChild( bare );
	const v =
		foot.getBoundingClientRect().bottom -
		onLine.getBoundingClientRect().bottom;
	bare.remove();
	// The first line as it stands with that.
	const copy = ghostOf( el, true );
	copy.style.setProperty( '--wpie-v', `${ v }px` );
	const probe = linePoint( doc, 'baseline' );
	copy.insertBefore( probe, copy.firstChild );
	el.parentNode.appendChild( copy );
	const px =
		probe.getBoundingClientRect().bottom - copy.getBoundingClientRect().top;
	copy.remove();
	return { px, v };
}

// While editing, pointerdowns inside these containers must NOT commit the
// session — they host the styling controls acting on the selection.
const KEEP_ALIVE =
	'.ed-menubar, .ed-tool-opts, .ed-right, .color-popover, .font-picker-pop, .blend-menu, .layout-popover, .ed-rail-tip, .text-tool-panel, .color-panel-window, .color-panel-pick-surface, [data-ws="tool.eyedropper"], .wpie-number-editor';

export function TextEditOverlay( {
	layer,
	zoom,
	pan,
	onCommit,
	onCancel,
	richTextRef,
	getDraftRef,
	previewingEffects = false,
} ) {
	// Fluid Text (v1.429): the overlay edits the fitted lines and sizes,
	// with the stored characters (no baked uppercase or list markers).
	const view = withTextFitForEdit( layer );
	// Text with runs (spans, per-line styles, a fitted view): its lines are
	// made by the runs, each as high as its advance (lib/rich-text.js,
	// editor/overlays.css). The field's own font still puts a strut on
	// EVERY line and is what plain typing next to the runs gets, so it must
	// fit into the smallest of them: the field's line is as high as the
	// smallest advance. (It used to take the smallest size, and only when
	// every run had one: a lockup made of per-line styles kept the layer's
	// size, and its small lines stood ninety pixels too low.)
	// How the content was WRITTEN holds for the whole session: the field
	// is filled once per layer, and a layer that gets its runs while it is
	// open (a layout applied from the bar) still shows the plain text that
	// was put in.
	const written = useRef( { id: null, rich: false } );
	const richNow = hasSpans( view ) || Array.isArray( view.lineStyles );
	const rich =
		written.current.id === layer.id ? written.current.rich : richNow;
	const leading = view.lineHeight || 1.05;
	const advances = rich
		? textRuns( view ).map(
				( run ) => resolveStyle( view, run.s ).lineHeight
		  )
		: [];
	const domFontSize = advances.length
		? Math.min( ...advances ) / leading
		: view.fontSize;
	const ref = useRef( null );
	// Sizes in the DOM are scaled by the zoom at populate time; keep that
	// zoom for parsing back so a mid-edit zoom change cannot skew values.
	const zoomRef = useRef( zoom );
	const lastRange = useRef( null );
	const doneRef = useRef( false );
	const colorPreview = useRef( null );
	// The field's lines as the browser laid them out (measureField), and
	// what they were measured for: { layer, zoom, fonts, px, v }.
	const [ domBase, setDomBase ] = useState( null );
	// Counts the fonts that arrive while the field is open: a face that
	// lands late changes the line under the text.
	const [ fonts, setFonts ] = useState( 0 );
	const clearColorPreview = () => {
		colorPreview.current?.();
		colorPreview.current = null;
	};
	useEffect( () => clearColorPreview, [ layer.id, zoom, pan ] );

	// Before the first paint, so the field never shows empty and the
	// measuring below finds its content in place.
	useLayoutEffect( () => {
		const el = ref.current;
		if ( ! el ) {
			return;
		}
		zoomRef.current = zoom;
		written.current = { id: layer.id, rich: richNow };
		if ( richNow ) {
			el.innerHTML = spansToHtml( view, zoomRef.current );
		} else {
			el.textContent = view.text || '';
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

	useEffect( () => {
		const set = document.fonts;
		if ( ! set || ! set.addEventListener ) {
			return undefined;
		}
		const arrived = () => setFonts( ( n ) => n + 1 );
		set.addEventListener( 'loadingdone', arrived );
		return () => set.removeEventListener( 'loadingdone', arrived );
	}, [] );

	// Where the first line really sits in the field. Measured again whenever
	// something changes that line: the zoom (the browser rounds at the size
	// on screen), the layer's own type settings (font, size, line height
	// changed in the panel while the field is open) or a font that arrives.
	// Typing does not: the field keeps its place while its content changes.
	useLayoutEffect( () => {
		const el = ref.current;
		if ( el && el.parentNode ) {
			setDomBase( { layer, zoom, fonts, ...measureField( el ) } );
		}
	}, [ layer, zoom, fonts ] );

	const serialize = () => domToSpans( ref.current, layer, zoomRef.current );
	// Read-only access for canvas effect previews, including shape text.
	// Keep the editable DOM and its selection alive while its pixels hide.
	useEffect( () => {
		if ( ! getDraftRef ) {
			return undefined;
		}
		getDraftRef.current = serialize;
		return () => {
			getDraftRef.current = null;
		};
	} );

	const commit = () => {
		clearColorPreview();
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
			commit,
			getText: () => serialize().text,
			clearColorPreview,
			previewColor: ( color ) => {
				clearColorPreview();
				colorPreview.current = previewTextColor(
					ref.current,
					lastRange.current,
					color
				);
			},
			applyStyle: ( patch ) => {
				clearColorPreview();
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
			clearColorPreview();
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

	// The text must stand where it stood when it goes into edit mode: the
	// field's first baseline goes onto the line the renderer draws its first
	// baseline on. Both ends are read, not worked out a second time - the
	// renderer's from its own layout, the field's from the DOM. Until the
	// field has been measured (one render, never painted) the old estimate
	// stands in. Applied to the box top because it can be negative for tight
	// line-heights.
	const measured =
		domBase &&
		domBase.layer === layer &&
		domBase.zoom === zoom &&
		domBase.fonts === fonts;
	const yOffset = measured
		? textFirstBaseline( layer ) * zoom - domBase.px
		: textEditOffset( view ) * zoom;

	// Hung on the edge the text is aligned to, one letter spacing wider than
	// the box, turning around the centre of the layer: see text-edit-place.js.
	const place = textEditPlacement( layer, zoom, yOffset );

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
			data-lines={ rich ? 'canvas' : undefined }
			onInput={ ( e ) => {
				// (never between the keystrokes of one composed character)
				if ( rich && ! e.nativeEvent?.isComposing ) {
					tidyLineBoxes( ref.current );
				}
			} }
			style={ {
				opacity: previewingEffects ? 0 : undefined,
				// What the runs of a text with runs stack their lines
				// with (editor/overlays.css).
				...( rich
					? {
							'--wpie-s': view.fontSize || 16,
							'--wpie-z': zoom,
							'--wpie-lh': leading,
							'--wpie-v': `${ measured ? domBase.v : 0 }px`,
					  }
					: null ),
				left: screen.x + place.left,
				top: screen.y + yOffset,
				minWidth: place.minWidth,
				width: place.width,
				// Fluid lines are explicit <br>s; the DOM must not re-wrap
				// a line the canvas measured to the exact box width.
				whiteSpace: layer.textFit ? 'pre' : undefined,
				minHeight: layer.h * zoom,
				boxSizing: 'border-box',
				paddingTop: 0,
				transform:
					`rotate(${ layer.rot || 0 }deg)` +
					( place.pull
						? ` translateX(${ -100 * place.pull }%)`
						: '' ),
				transformOrigin: `${ place.pivot.x }px ${ place.pivot.y }px`,
				fontFamily: `"${ layer.fontFamily }", sans-serif`,
				fontWeight: layer.weight,
				fontStyle: layer.italic ? 'italic' : 'normal',
				fontSize: domFontSize * zoom,
				lineHeight: rich ? leading : layer.lineHeight || 1.05,
				letterSpacing: place.tracking,
				// The renderer draws letter-spaced text glyph by glyph,
				// without kerning; the field must not kern it either.
				fontKerning: place.tracking ? 'none' : undefined,
				textAlign: layer.textFit ? 'center' : layer.align,
				textDecoration:
					[
						layer.underline ? 'underline' : '',
						layer.strike ? 'line-through' : '',
					]
						.filter( Boolean )
						.join( ' ' ) || 'none',
				// CSS mirrors the non-destructive all-caps: the DOM keeps
				// the raw text, so caret offsets stay valid (v1.300).
				textTransform: caseOf( layer.textTransform ) || 'none',
				color: layer.color,
			} }
			onBeforeInput={ clearColorPreview }
			onKeyDown={ ( e ) => {
				clearColorPreview();
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
