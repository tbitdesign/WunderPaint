/** View-only ruler scales; their geometry uses the same origin as the canvas. */
import { memo, useEffect, useMemo, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { frameBox } from '../../lib/snap';
import { RULER_SIZE, RULER_UNITS, rulerTicks } from './use-viewport';

const tickLengths = { major: 9, medium: 6, minor: 3 };

/**
 * Where the pointer is, for the ruler marks - outside React state. As a
 * state of the canvas it re-rendered the whole canvas component on every
 * pointermove (1.8 ms a move in the live editor, measured 16.10.2026, the
 * rulers shown or not); now only the two marks follow.
 *
 * @return {Object} { value, set( point|null ), subscribe( fn ) }.
 */
export function createPointerStore() {
	const subs = new Set();
	const store = {
		value: null,
		set( point ) {
			store.value = point;
			subs.forEach( ( fn ) => fn( point ) );
		},
		subscribe( fn ) {
			subs.add( fn );
			return () => subs.delete( fn );
		},
	};
	return store;
}

/** One axis' pointer mark, re-rendered on its own. */
function RulerCursor( { store, vertical, length } ) {
	const along = ( point ) => {
		const v = vertical ? point?.y : point?.x;
		return Number.isFinite( v ) ? v - RULER_SIZE : null;
	};
	const [ position, setPosition ] = useState( () => along( store?.value ) );
	useEffect(
		() => store?.subscribe( ( point ) => setPosition( along( point ) ) ),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[ store, vertical ]
	);
	return position !== null && position >= 0 && position <= length ? (
		<span
			className="ed-ruler-cursor"
			style={ axisPosition( vertical, position ) }
		/>
	) : null;
}
const axisPosition = ( vertical, value ) =>
	vertical ? { top: value } : { left: value };
const axisRange = ( vertical, start, length ) =>
	vertical ? { top: start, height: length } : { left: start, width: length };

// Cursor movement does not regenerate the scale, labels or document shading.
const RulerScale = memo( function RulerScale( {
	vertical,
	zoom,
	origin,
	length,
	extent,
	unit,
	dpi,
} ) {
	const ticks = rulerTicks( zoom, origin, length, unit, dpi );
	const paths = { major: [], medium: [], minor: [] };
	for ( const tick of ticks ) {
		const p = Math.round( tick.position ) + 0.5;
		const end = RULER_SIZE - 1;
		const start = end - tickLengths[ tick.kind ];
		paths[ tick.kind ].push(
			vertical
				? `M${ start },${ p }H${ end }`
				: `M${ p },${ start }V${ end }`
		);
	}
	const documentEnd = origin + extent * zoom;
	const start = Math.max( 0, origin );
	const end = Math.min( length, documentEnd );
	return (
		<svg
			className="ed-ruler-scale"
			width={ vertical ? RULER_SIZE : length }
			height={ vertical ? length : RULER_SIZE }
			aria-hidden="true"
		>
			{ end > start && (
				<rect
					className="ed-ruler-document"
					x={ vertical ? 0 : start }
					y={ vertical ? start : 0 }
					width={ vertical ? RULER_SIZE : end - start }
					height={ vertical ? end - start : RULER_SIZE }
				/>
			) }
			{ [ origin, documentEnd ].map( ( p, i ) =>
				p >= 0 && p <= length ? (
					<line
						key={ i }
						className="ed-ruler-document-edge"
						x1={ vertical ? 0 : Math.round( p ) + 0.5 }
						x2={ vertical ? RULER_SIZE : Math.round( p ) + 0.5 }
						y1={ vertical ? Math.round( p ) + 0.5 : 0 }
						y2={ vertical ? Math.round( p ) + 0.5 : RULER_SIZE }
					/>
				) : null
			) }
			{ Object.entries( paths ).map( ( [ kind, segments ] ) => (
				<path
					key={ kind }
					className={ `ed-ruler-ticks ${ kind }` }
					d={ segments.join( ' ' ) }
				/>
			) ) }
			{ ticks.map( ( tick ) => {
				const label = String( tick.value );
				const p = Math.round( tick.position ) + 3;
				if (
					tick.kind !== 'major' ||
					p + label.length * 6.5 > length
				) {
					return null;
				}
				return (
					<text
						key={ tick.value }
						data-value={ tick.value }
						x={ vertical ? 0 : p }
						y={ vertical ? 0 : 10 }
						transform={
							vertical
								? `translate(10 ${ p }) rotate(-90)`
								: undefined
						}
						textAnchor={ vertical ? 'end' : 'start' }
					>
						{ label }
					</text>
				);
			} ) }
		</svg>
	);
} );

function RulerAxis( {
	vertical,
	zoom,
	origin,
	length,
	extent,
	unit,
	dpi,
	selection,
	cursorStore,
	onStartGuide,
} ) {
	const start = selection ? selection[ 0 ] * zoom + origin : null;
	const end = selection ? selection[ 1 ] * zoom + origin : null;
	const clippedStart = Math.max( 0, start );
	const clippedEnd = Math.min( length, end );
	return (
		<div
			className={ `ed-ruler ${ vertical ? 'v' : 'h' }` }
			role="presentation"
			aria-hidden="true"
			onPointerDown={ ( event ) =>
				onStartGuide?.( vertical ? 'v' : 'h', event )
			}
		>
			<RulerScale
				{ ...{ vertical, zoom, origin, length, extent, unit, dpi } }
			/>
			{ selection && clippedEnd > clippedStart && (
				<span
					className="ed-ruler-selection"
					style={ axisRange(
						vertical,
						clippedStart,
						clippedEnd - clippedStart
					) }
				/>
			) }
			{ selection &&
				[ start, end ].map( ( p, i ) =>
					p >= 0 && p <= length ? (
						<span
							key={ i }
							className="ed-ruler-selection-edge"
							style={ axisPosition( vertical, p ) }
						/>
					) : null
				) }
			<RulerCursor
				store={ cursorStore }
				vertical={ vertical }
				length={ length }
			/>
		</div>
	);
}

export function Rulers( {
	doc,
	zoom,
	pan,
	cursorStore,
	areaW,
	areaH,
	layers,
	ids,
	onStartGuide,
	onUnitChange,
} ) {
	const box = useMemo( () => frameBox( layers, ids ), [ layers, ids ] );
	const unit = RULER_UNITS.includes( doc.rulerUnit ) ? doc.rulerUnit : 'px';
	const stop = ( event ) => event.stopPropagation();
	return (
		<div
			className="ed-rulers"
			style={ { '--ed-ruler-size': `${ RULER_SIZE }px` } }
		>
			<select
				className="ed-ruler-corner"
				aria-label={ __( 'Ruler units', 'wunderpaint' ) }
				title={ __( 'Ruler units', 'wunderpaint' ) }
				value={ unit }
				onChange={ ( event ) => {
					if ( event.target.value !== unit ) {
						onUnitChange?.( event.target.value );
					}
				} }
				onPointerDown={ stop }
				onPointerUp={ stop }
				onClick={ stop }
				onDoubleClick={ stop }
				onKeyDown={ stop }
				onKeyUp={ stop }
				onContextMenu={ ( event ) => {
					event.preventDefault();
					stop( event );
				} }
			>
				{ RULER_UNITS.map( ( value ) => (
					<option key={ value } value={ value }>
						{ value }
					</option>
				) ) }
			</select>
			<RulerAxis
				zoom={ zoom }
				unit={ unit }
				dpi={ doc.dpi }
				origin={ pan.x - RULER_SIZE }
				length={ Math.max( 0, areaW - RULER_SIZE ) }
				extent={ doc.w }
				selection={ box ? [ box.x, box.x + box.w ] : null }
				cursorStore={ cursorStore }
				onStartGuide={ onStartGuide }
			/>
			<RulerAxis
				vertical
				zoom={ zoom }
				unit={ unit }
				dpi={ doc.dpi }
				origin={ pan.y - RULER_SIZE }
				length={ Math.max( 0, areaH - RULER_SIZE ) }
				extent={ doc.h }
				selection={ box ? [ box.y, box.y + box.h ] : null }
				cursorStore={ cursorStore }
				onStartGuide={ onStartGuide }
			/>
		</div>
	);
}
