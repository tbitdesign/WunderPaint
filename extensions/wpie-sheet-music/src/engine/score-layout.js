import { textEl } from './svg.js';

/** Drum Builder uses p as an internal soft-hit marker, drawn as parentheses. */
export function markGhostNotes( tune ) {
	for ( const line of tune.lines || [] )
		for ( const staff of line.staff || [] )
			for ( const voice of staff.voices )
				for ( const event of voice ) {
					if (
						event.el_type === 'note' &&
						event.decoration?.includes( 'p' )
					) {
						event.wpieGhost = true;
						event.decoration = event.decoration.filter(
							( d ) => d !== 'p'
						);
					}
				}
}

/** Coordinates from the engraving engine, before its SVG classes are removed. */
export function scoreGeometry( tunes, options ) {
	const notes = [],
		staves = [];
	let serial = 0;
	for ( const tune of tunes ) {
		for ( const group of tune.engraver?.staffgroups || [] ) {
			const ids = new Map();
			for ( const voice of group.voices || [] ) {
				const staff = voice.staff;
				if (
					! Number.isFinite( staff?.topLine ) ||
					! Number.isFinite( staff?.bottomLine )
				)
					continue;
				if ( ! ids.has( staff ) ) {
					const id = staves.length;
					ids.set( staff, id );
					staves.push( {
						id,
						x: group.startx,
						right: group.w,
						top: staff.topLine,
						bottom: staff.bottomLine,
						step:
							Math.abs( staff.bottomLine - staff.topLine ) / 8 ||
							3.875,
						clef: options.clef || 'treble',
					} );
				}
				for ( const abs of voice.children || [] ) {
					const event = abs.abcelem;
					if ( event?.el_type !== 'note' ) continue;
					const range = options.noteRanges?.find(
						( r ) =>
							event.startChar >= r.start &&
							event.startChar < r.end
					);
					const point = abs.notePositions?.[ 0 ] || {
						x: abs.x + ( abs.w || 10 ) / 2,
						y: staff.absoluteY - 6 * 3.875,
					};
					notes.push( {
						...point,
						index: range?.index ?? serial,
						measure: event.wpieMeasure,
						voice: event.wpieVoice,
						staff: ids.get( staff ),
						elements: abs.elemset || [],
						editable: !! range,
						rest: !! event.rest,
						ghost: !! event.wpieGhost,
					} );
					serial++;
				}
			}
		}
	}
	return { notes, staves };
}

export function annotationTargets( geometry, item, byNote = false ) {
	const from = Math.max( 1, +item.from || 1 ),
		to = Math.max( from, +item.to || from );
	return geometry.notes.filter( ( n ) => {
		const pos = byNote ? n.index + 1 : n.measure;
		return (
			pos >= from &&
			pos <= to &&
			( ! item.voice || n.voice === +item.voice )
		);
	} );
}

function colorElements( elements, color ) {
	for ( const root of elements ) {
		const nodes = [
			root,
			...( root.querySelectorAll?.(
				'path,text,ellipse,circle,rect,line'
			) || [] ),
		];
		for ( const node of nodes ) {
			if ( ! node.getAttribute ) continue;
			if ( node.getAttribute( 'fill' ) !== 'none' )
				node.setAttribute( 'fill', color );
			if (
				node.getAttribute( 'stroke' ) &&
				node.getAttribute( 'stroke' ) !== 'none'
			)
				node.setAttribute( 'stroke', color );
		}
	}
}

export function decorateScore( svg, geometry, options ) {
	const accent = options.accent;
	const soft = geometry.notes.filter( ( n ) => n.ghost );
	if ( soft.length ) {
		const group = document.createElementNS(
			'http://www.w3.org/2000/svg',
			'g'
		);
		group.innerHTML = soft
			.map(
				( n ) =>
					textEl( n.x - 9, n.y + 4, '(', {
						size: 14,
						font: options.fonts.text,
						fill: options.ink,
						anchor: 'end',
					} ) +
					textEl( n.x + 9, n.y + 4, ')', {
						size: 14,
						font: options.fonts.text,
						fill: options.ink,
					} )
			)
			.join( '' );
		svg.appendChild( group );
	}
	for ( const n of geometry.notes )
		if ( options.highlightIndices?.includes( n.index ) )
			colorElements( n.elements, accent );
	const annotations = options.annotations || [];
	const pieces = [],
		legend = [];
	annotations.forEach( ( item, i ) => {
		const selected = annotationTargets(
			geometry,
			item,
			!! options.noteRanges
		);
		if ( ! selected.length ) return;
		const color = /^#[0-9a-f]{6}$/i.test( item.color )
			? item.color
			: accent;
		for ( const note of selected ) colorElements( note.elements, color );
		for ( const staff of geometry.staves ) {
			const notes = selected.filter( ( n ) => n.staff === staff.id );
			if ( ! notes.length ) continue;
			const x1 = Math.min( ...notes.map( ( n ) => n.x ) ) - 7,
				x2 = Math.max( ...notes.map( ( n ) => n.x ) ) + 8;
			const all = geometry.notes.filter( ( n ) => n.staff === staff.id );
			const y =
				Math.min( staff.top - 32, ...all.map( ( n ) => n.y - 38 ) ) -
				i * 19;
			const d =
				item.kind === 'phrase'
					? `M${ x1 } ${ y + 8 }Q${ ( x1 + x2 ) / 2 } ${
							y - 12
					  } ${ x2 } ${ y + 8 }`
					: item.kind === 'callout'
					? `M${ x1 } ${ y }L${ x1 } ${ notes[ 0 ].y - 9 }`
					: `M${ x1 } ${ y + 7 }V${ y }H${ x2 }V${ y + 7 }`;
			pieces.push(
				`<path d="${ d }" fill="none" stroke="${ color }" stroke-width="1.5"/>`,
				textEl( x1 + 2, y - 4, String( i + 1 ), {
					font: options.fonts.text,
					size: 11,
					fill: color,
					weight: 700,
				} )
			);
		}
		legend.push( { label: `${ i + 1 }. ${ item.label || '' }`, color } );
	} );
	if ( ! pieces.length ) return;
	const group = document.createElementNS( 'http://www.w3.org/2000/svg', 'g' );
	group.innerHTML = pieces.join( '' );
	svg.appendChild( group );
	let y = svg.getBBox().y + svg.getBBox().height + 26;
	const width = options.width / ( options.scale || 1 ) - 32;
	const legendPieces = [];
	for ( const item of legend ) {
		const words = item.label.split( /\s+/ );
		let text = '';
		for ( const word of words ) {
			if ( ( text.length + word.length ) * 7 > width && text ) {
				legendPieces.push(
					textEl( 16, y, text, {
						font: options.fonts.text,
						size: 13,
						fill: item.color,
					} )
				);
				y += 20;
				text = '';
			}
			text += ( text ? ' ' : '' ) + word;
		}
		legendPieces.push(
			textEl( 16, y, text, {
				font: options.fonts.text,
				size: 13,
				fill: item.color,
			} )
		);
		y += 24;
	}
	const legendGroup = document.createElementNS(
		'http://www.w3.org/2000/svg',
		'g'
	);
	legendGroup.innerHTML = legendPieces.join( '' );
	svg.appendChild( legendGroup );
}

export function transformGeometry( geometry, x = 0, y = 0, scale = 1 ) {
	if ( ! geometry ) return { notes: [], staves: [] };
	return {
		notes: geometry.notes.map( ( { elements, ...n } ) => ( {
			...n,
			x: x + n.x * scale,
			y: y + n.y * scale,
		} ) ),
		staves: geometry.staves.map( ( s ) => ( {
			...s,
			x: x + s.x * scale,
			right: x + s.right * scale,
			top: y + s.top * scale,
			bottom: y + s.bottom * scale,
			step: s.step * scale,
		} ) ),
	};
}
