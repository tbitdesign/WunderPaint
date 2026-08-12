/**
 * Picking a shape by looking at it.
 *
 * It used to be a dropdown of nine names. A name tells you nothing about a
 * shape: "Badge" and "Ribbon" are both a guess until you have drawn one.
 * The brush learned this two days ago - its tips are rendered strokes now,
 * not a list - and the shape tool was the last place in the editor still
 * asking people to read.
 *
 * The previews are the REAL geometry: every one is the same path data the
 * canvas draws, at preview size, so a preview cannot promise a shape the
 * tool does not deliver.
 */

import { useState, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { shapeToPathD } from '../lib/shape-path';
import { EXTRA_SHAPES } from '../lib/shape-library';

/**
 * The ones still defined as maths in `drawShape`. The heart used to be
 * here and has moved into the path library, so it comes in with the rest
 * below rather than twice.
 */
const BUILT_IN = [
	[ 'rect', () => __( 'Rectangle', 'wunderpaint' ) ],
	[ 'ellipse', () => __( 'Ellipse', 'wunderpaint' ) ],
	[ 'line', () => __( 'Line', 'wunderpaint' ) ],
	[ 'polygon', () => __( 'Polygon', 'wunderpaint' ) ],
	[ 'star', () => __( 'Star', 'wunderpaint' ) ],
	[ 'arrow', () => __( 'Arrow', 'wunderpaint' ) ],
	[ 'speech', () => __( 'Speech Bubble', 'wunderpaint' ) ],
	[ 'badge', () => __( 'Badge', 'wunderpaint' ) ],
];

export const SHAPE_CHOICES = [
	...BUILT_IN.map( ( [ id, name ] ) => ( { id, name } ) ),
	...EXTRA_SHAPES.map( ( s ) => ( { id: s.id, name: s.name } ) ),
];

const BOX = 34;
const COLS = 5;
/** The bar is 24px tall, so the preview inside the button has to be small. */
const BTN_BOX = 18;

/**
 * Under the button, and kept on screen.
 *
 * Not `anchoredPopoverStyle`: that one reserves 480px of height for the
 * colour picker and would shove this grid, which is a quarter of that,
 * halfway up the window for no reason.
 *
 * @param {?Object} rect The button's bounding box.
 * @return {Object} Inline style.
 */
function popoverStyle( rect ) {
	if ( ! rect ) {
		return { position: 'fixed', left: 8, top: 8, zIndex: 700 };
	}
	const width = COLS * ( BOX + 6 ) + 12;
	const height = Math.ceil( SHAPE_CHOICES.length / COLS ) * ( BOX + 6 ) + 12;
	const left = Math.min(
		Math.max( 8, rect.left ),
		window.innerWidth - width - 12
	);
	const top =
		rect.bottom + 6 + height > window.innerHeight - 8
			? Math.max( 8, rect.top - height - 6 )
			: rect.bottom + 6;
	return { position: 'fixed', left, top, width, zIndex: 700 };
}

/**
 * One shape drawn at preview size, from the same path the canvas uses.
 *
 * @param {Object} props      Component props.
 * @param {string} props.id   Shape keyword.
 * @param {number} props.size Edge length in pixels.
 * @return {Object} The preview element.
 */
function Preview( { id, size = BOX } ) {
	// A line has no area to fill, so it is shown as the diagonal it is.
	if ( 'line' === id ) {
		return (
			<svg
				width={ size }
				height={ size }
				viewBox={ `0 0 ${ BOX } ${ BOX }` }
			>
				<line
					x1="5"
					y1={ BOX - 5 }
					x2={ BOX - 5 }
					y2="5"
					stroke="currentColor"
					strokeWidth="3"
					strokeLinecap="round"
				/>
			</svg>
		);
	}
	const inset = 4;
	const inner = BOX - inset * 2;
	const d = shapeToPathD( {
		type: 'shape',
		shape: id,
		w: inner,
		h: inner,
		sides: 'star' === id ? 5 : 6,
	} );
	return (
		<svg width={ size } height={ size } viewBox={ `0 0 ${ BOX } ${ BOX }` }>
			<g transform={ `translate(${ inset } ${ inset })` }>
				{ /* NONZERO, not even-odd: `ctx.fill()` on the canvas winds that
					     way, and a preview that fills differently is a
					     preview of a shape the tool does not draw. The
					     Tag's hole survives it because its inner ring is
					     wound the other way round. */ }
				<path d={ d || '' } fill="currentColor" />
			</g>
		</svg>
	);
}

/**
 * @param {Object}   props          Component props.
 * @param {string}   props.value    The chosen shape keyword.
 * @param {Function} props.onChange Called with the new keyword.
 * @return {Object} The picker element.
 */
export function ShapePicker( { value, onChange } ) {
	const [ open, setOpen ] = useState( false );
	const btnRef = useRef( null );
	const current =
		SHAPE_CHOICES.find( ( s ) => s.id === value ) || SHAPE_CHOICES[ 0 ];

	return (
		<div className="shape-picker">
			<button
				ref={ btnRef }
				type="button"
				className="shape-picker-btn"
				aria-haspopup="true"
				aria-expanded={ open }
				title={ current.name() }
				onClick={ () => setOpen( ( v ) => ! v ) }
			>
				<Preview id={ current.id } size={ BTN_BOX } />
				<span>{ current.name() }</span>
			</button>
			{ open && (
				<>
					{ /* Click anywhere else to put it away. */ }
					<div
						className="shape-picker-out"
						role="presentation"
						onClick={ () => setOpen( false ) }
					/>
					<div
						className="shape-picker-pop"
						style={ popoverStyle(
							btnRef.current?.getBoundingClientRect()
						) }
					>
						{ SHAPE_CHOICES.map( ( s ) => (
							<button
								key={ s.id }
								type="button"
								className={
									'shape-picker-item' +
									( s.id === value ? ' is-on' : '' )
								}
								title={ s.name() }
								aria-pressed={ s.id === value }
								onClick={ () => {
									onChange( s.id );
									setOpen( false );
								} }
							>
								<Preview id={ s.id } />
							</button>
						) ) }
					</div>
				</>
			) }
		</div>
	);
}
