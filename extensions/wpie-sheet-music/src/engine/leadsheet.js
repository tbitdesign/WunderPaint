/**
 * Leadsheet layout: chords exactly over their syllable, sections, one or
 * two columns, a row of chord diagrams under the title. Returns an SVG
 * string; `measure(text, sizePx, font)` supplies text widths.
 */
import { svgDoc, textEl } from './svg.js';

export function layoutLeadsheet( song, o, measure ) {
	const width = o.width;
	const margin = o.margin === undefined ? 60 : o.margin;
	const sizes = {
		title: 44,
		subtitle: 24,
		text: 22,
		chord: 20,
		label: 18,
		...( o.sizes || {} ),
	};
	const fonts = { title: 'Georgia', text: 'Arial', ...( o.fonts || {} ) };
	const ink = o.ink || '#1a1a1a';
	const chordColor = o.chordColor || '#8d1436';
	const columns = 2 === o.columns ? 2 : 1;
	const gap = 48;
	const children = [];
	let y = margin;

	// Head.
	if ( song.title ) {
		y += sizes.title;
		children.push(
			textEl( margin, y, song.title, {
				size: sizes.title,
				font: fonts.title,
				fill: ink,
				weight: 700,
			} )
		);
	}
	const sub = [ song.subtitle, song.artist ].filter( Boolean ).join( ' · ' );
	if ( sub ) {
		y += sizes.subtitle * 1.5;
		children.push(
			textEl( margin, y, sub, {
				size: sizes.subtitle,
				font: fonts.text,
				fill: ink,
				italic: true,
			} )
		);
	}
	const meta = [];
	if ( song.key ) {
		meta.push( ( o.keyLabel || 'Key' ) + ' ' + song.key );
	}
	if ( o.capoLabel ) {
		meta.push( o.capoLabel );
	}
	if ( meta.length ) {
		y += sizes.label * 1.6;
		children.push(
			textEl( margin, y, meta.join( '   ' ), {
				size: sizes.label,
				font: fonts.text,
				fill: chordColor,
				weight: 700,
			} )
		);
	}
	// Chord diagrams row.
	if ( o.diagrams && o.diagrams.length ) {
		y += 16;
		let x = margin;
		let rowH = 0;
		for ( const d of o.diagrams ) {
			if ( x + d.width > width - margin ) {
				x = margin;
				y += rowH + 8;
				rowH = 0;
			}
			children.push(
				`<g transform="translate(${ x } ${ y })">${ d.svg
					.replace( /^<svg[^>]*>/, '' )
					.replace( /<\/svg>$/, '' ) }</g>`
			);
			x += d.width + 12;
			rowH = Math.max( rowH, d.height );
		}
		y += rowH + 8;
	}
	y += sizes.text;

	// Body: lay every section into blocks first, then distribute the blocks.
	const colW = ( width - 2 * margin - ( columns - 1 ) * gap ) / columns;
	const blocks = song.sections.map( ( s ) =>
		layoutSection( s, { colW, sizes, fonts, ink, chordColor }, measure )
	);
	const cols = [ [] ];
	if ( 2 === columns ) {
		const total = blocks.reduce( ( a, b ) => a + b.height, 0 );
		let acc = 0;
		let ci = 0;
		cols.push( [] );
		for ( const b of blocks ) {
			if (
				0 === ci &&
				acc + b.height / 2 > total / 2 &&
				cols[ 0 ].length
			) {
				ci = 1;
			}
			cols[ ci ].push( b );
			acc += b.height;
		}
	} else {
		cols[ 0 ] = blocks;
	}
	let bottom = y;
	cols.forEach( ( list, ci ) => {
		let cy = y;
		const cx = margin + ci * ( colW + gap );
		for ( const b of list ) {
			children.push(
				`<g transform="translate(${ cx } ${ cy })">${ b.children.join(
					''
				) }</g>`
			);
			cy += b.height;
		}
		bottom = Math.max( bottom, cy );
	} );
	const height = Math.ceil( bottom + margin - sizes.text * 0.5 );
	return {
		svg: svgDoc( { width, height, bg: o.bg || null, children } ),
		width,
		height,
	};
}

/** One section as relative children plus its height. */
function layoutSection( section, c, measure ) {
	const { sizes, fonts, ink, chordColor } = c;
	const children = [];
	let y = 0;
	const indent = 'chorus' === section.type ? 24 : 0;
	if ( section.label || 'comment' === section.type ) {
		y += sizes.label * 1.3;
		children.push(
			textEl( indent, y, section.label, {
				size: sizes.label,
				font: fonts.text,
				fill: 'comment' === section.type ? ink : chordColor,
				weight: 700,
				italic: 'comment' === section.type,
			} )
		);
		y += sizes.label * 0.4;
	}
	const lineGap = sizes.text * 0.5;
	for ( const line of section.lines ) {
		const hasChord = line.parts.some( ( p ) => p.chord );
		if ( hasChord ) {
			y += sizes.chord * 1.1;
		}
		const chordY = y;
		y += sizes.text * 1.1;
		let x = indent;
		let lastChordRight = -Infinity;
		for ( const p of line.parts ) {
			let px = x;
			if ( p.chord ) {
				if ( px < lastChordRight + 8 ) {
					px = lastChordRight + 8;
				}
				const cw = measure( p.chord, sizes.chord, fonts.text );
				children.push(
					textEl( px, chordY, p.chord, {
						size: sizes.chord,
						font: fonts.text,
						fill: chordColor,
						weight: 700,
					} )
				);
				lastChordRight = px + cw;
			}
			if ( p.text ) {
				children.push(
					textEl( px, y, p.text, {
						size: sizes.text,
						font: fonts.text,
						fill: ink,
					} )
				);
				x = px + measure( p.text, sizes.text, fonts.text );
			} else {
				x = px;
			}
		}
		y += lineGap;
	}
	y += sizes.text * 0.8;
	return { children, height: y };
}
