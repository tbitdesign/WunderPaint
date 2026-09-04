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
import { DYNAMIC_SHAPE_MAP } from '../lib/shape-dynamics';

/**
 * The ones still defined as maths in `drawShape`. The heart used to be
 * here and has moved into the path library; arrow and speech live in
 * shape-dynamics now and are listed via the dynamic registry below.
 */
const BUILT_IN = [
	[ 'rect', () => __( 'Rectangle', 'wunderpaint' ) ],
	[ 'ellipse', () => __( 'Ellipse', 'wunderpaint' ) ],
	[ 'line', () => __( 'Line', 'wunderpaint' ) ],
	[ 'polygon', () => __( 'Polygon', 'wunderpaint' ) ],
	[ 'star', () => __( 'Star', 'wunderpaint' ) ],
	[ 'badge', () => __( 'Badge', 'wunderpaint' ) ],
];

/** A dynamic shape as a picker row, name straight from the registry. */
const dyn = ( id ) => ( { id, name: DYNAMIC_SHAPE_MAP[ id ].name } );

export const SHAPE_CHOICES = [
	...BUILT_IN.map( ( [ id, name ] ) => ( { id, name } ) ),
	dyn( 'squircle' ),
	dyn( 'arrow' ),
	dyn( 'speech' ),
	dyn( 'triangle' ),
	dyn( 'diamond' ),
	dyn( 'cross' ),
	dyn( 'arch' ),
	dyn( 'shield' ),
	dyn( 'tag' ),
	dyn( 'ribbon' ),
	dyn( 'bolt' ),
	// pill, heart, note and blob still render from the path library
	// (heart and blob switch to shape-dynamics once a dial is touched).
	...EXTRA_SHAPES.map( ( s ) => ( { id: s.id, name: s.name } ) ),
	dyn( 'ring' ),
	dyn( 'frame' ),
	dyn( 'ticket' ),
	dyn( 'chevron' ),
	dyn( 'burst' ),
	dyn( 'gear' ),
	dyn( 'grid' ),
	dyn( 'flower' ),
	dyn( 'shooting' ),
	dyn( 'wave' ),
	dyn( 'cloud' ),
	dyn( 'crescent' ),
	// The v1.428 batch: the element catalog's archetypes as REAL
	// dynamic shapes (crown prongs, pine tiers, seal bumps, ...).
	dyn( 'crown' ),
	dyn( 'seal' ),
	dyn( 'arcarrow' ),
	dyn( 'chevrons' ),
	dyn( 'parallelogram' ),
	dyn( 'trapezoid' ),
	dyn( 'stairs' ),
	dyn( 'lshape' ),
	dyn( 'bookmark' ),
	dyn( 'label' ),
	dyn( 'flag' ),
	dyn( 'mountain' ),
	dyn( 'clover' ),
	dyn( 'leaf' ),
	dyn( 'drop' ),
	dyn( 'check' ),
	dyn( 'xmark' ),
	dyn( 'thought' ),
	dyn( 'pine' ),
	dyn( 'sun' ),
	dyn( 'shout' ),
	dyn( 'medal' ),
	dyn( 'moon' ),
	dyn( 'spiral' ),
	dyn( 'layers' ),
	dyn( 'cube' ),
	dyn( 'target' ),
	dyn( 'gearpair' ),
	dyn( 'gem' ),
	dyn( 'rhombus' ),
	dyn( 'kite' ),
	dyn( 'polyframe' ),
	dyn( 'funnel' ),
	dyn( 'bars' ),
	dyn( 'compass' ),
	dyn( 'hourglass' ),
	dyn( 'cornerband' ),
	dyn( 'stamp' ),
	// Generators (v1.429): shapes that exist only as maths plus a seed.
	dyn( 'superform' ),
	dyn( 'blobgen' ),
	dyn( 'rose' ),
	dyn( 'guilloche' ),
	dyn( 'truchet' ),
	dyn( 'fractal' ),
	dyn( 'stroke' ),
	dyn( 'splat' ),
	dyn( 'shard' ),
	dyn( 'scatter' ),
	dyn( 'divider' ),
	dyn( 'rays' ),
	// Second generator batch (v1.430).
	dyn( 'lissajous' ),
	dyn( 'starpoly' ),
	dyn( 'phyllotaxis' ),
	dyn( 'mandala' ),
	dyn( 'galaxy' ),
	dyn( 'honeycomb' ),
	dyn( 'branch' ),
	dyn( 'metaball' ),
	dyn( 'skyline' ),
	dyn( 'moire' ),
	dyn( 'packing' ),
	dyn( 'stripes' ),
	// Third generator batch (v1.431): generative art families.
	dyn( 'voronoi' ),
	dyn( 'flowfield' ),
	dyn( 'hilbert' ),
	dyn( 'maze' ),
	dyn( 'halftone' ),
	dyn( 'scales' ),
	dyn( 'treerings' ),
	dyn( 'gridwarp' ),
	dyn( 'heartcurve' ),
	dyn( 'constellation' ),
	dyn( 'argyle' ),
	dyn( 'interference' ),
	// Fourth generator batch (v1.432).
	dyn( 'harmonograph' ),
	dyn( 'chladni' ),
	dyn( 'epitrochoid' ),
	dyn( 'butterfly' ),
	dyn( 'sierpinski' ),
	dyn( 'dragon' ),
	dyn( 'delaunay' ),
	dyn( 'startile' ),
	dyn( 'herringbone' ),
	dyn( 'isoblocks' ),
	dyn( 'datablocks' ),
	dyn( 'filmstrip' ),
	dyn( 'tornstrip' ),
	dyn( 'hatching' ),
];

/** Preview edge, the same 28px the Shape Studio's tiles use. */
const BOX = 28;
const COLS = 7;
/** Tile = preview plus its 1px border; the grid uses this exact width. */
const TILE = BOX + 2;
const GAP = 6;
const PAD = 6;
/** The bar is 24px tall, so the preview inside the button has to be small. */
const BTN_BOX = 18;
/** The "All shapes" footer: a 24px button plus its gap. */
const MORE_H = 30;

/**
 * The popover's two rows (v1.430): the basics everyone draws. It used
 * to be the whole catalog, 117 tiles that scrolled past the screen and
 * hid the rectangle among generators; the Shape Studio has the whole
 * catalog with search and previews, so the popover sends you there.
 */
const BASIC_IDS = [
	'rect',
	'ellipse',
	'line',
	'polygon',
	'star',
	'triangle',
	'diamond',
	'squircle',
	'pill',
	'arrow',
	'speech',
	'heart',
	'cross',
	'ring',
];
const BASICS = BASIC_IDS.map( ( id ) =>
	SHAPE_CHOICES.find( ( s ) => s.id === id )
).filter( Boolean );

/**
 * Under the button, and kept on screen.
 *
 * Not `anchoredPopoverStyle`: that one reserves 480px of height for the
 * colour picker and would shove this grid, which is a quarter of that,
 * halfway up the window for no reason.
 *
 * @param {?Object} rect The button's bounding box.
 * @param {number}  rows Tile rows in the grid.
 * @return {Object} Inline style.
 */
function popoverStyle( rect, rows ) {
	if ( ! rect ) {
		return { position: 'fixed', left: 8, top: 8, zIndex: 700 };
	}
	// Exact: tiles, gaps, padding and the popover's own border. A width
	// rounded from 1fr columns let the last tile poke out (user report).
	const width = COLS * TILE + ( COLS - 1 ) * GAP + 2 * PAD + 2;
	const height = rows * TILE + ( rows - 1 ) * GAP + 2 * PAD + 2 + MORE_H;
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
	const inset = 3;
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
 * @param {Function} [props.onMore] Opens the whole catalog (the studio).
 * @return {Object} The picker element.
 */
export function ShapePicker( { value, onChange, onMore } ) {
	const [ open, setOpen ] = useState( false );
	const btnRef = useRef( null );
	const current =
		SHAPE_CHOICES.find( ( s ) => s.id === value ) || SHAPE_CHOICES[ 0 ];
	// A shape picked in the studio stays visible (and lit) in the grid.
	const choices = BASICS.some( ( s ) => s.id === current.id )
		? BASICS
		: [ ...BASICS, current ];
	const rows = Math.ceil( choices.length / COLS );

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
							btnRef.current?.getBoundingClientRect(),
							rows
						) }
					>
						<div
							className="shape-picker-grid"
							style={ {
								gridTemplateColumns: `repeat(${ COLS }, ${ TILE }px)`,
								gap: GAP,
							} }
						>
							{ choices.map( ( s ) => (
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
						{ onMore && (
							<button
								type="button"
								className="shape-picker-more"
								onClick={ () => {
									setOpen( false );
									onMore();
								} }
							>
								{ __( 'All shapes', 'wunderpaint' ) }
							</button>
						) }
					</div>
				</>
			) }
		</div>
	);
}
