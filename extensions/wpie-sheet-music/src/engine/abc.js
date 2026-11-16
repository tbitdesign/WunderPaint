/**
 * The score card's engine: abcjs renders ABC into a hidden element, the
 * resulting SVG is made self-contained (fill/stroke/font attributes on
 * every element, no classes, no <style>) so the editor's SVG importer can
 * turn it into layers, and its height is trimmed to the content.
 */
import ABCJS from 'abcjs';
import { selectExcerpt, isEmphasized, markEmphasis } from './excerpt.js';
import {
	scoreGeometry,
	decorateScore,
	transformGeometry,
	markGhostNotes,
} from './score-layout.js';

const FONT = ( family, size, extra ) =>
	`${ family } ${ size }${ extra ? ' ' + extra : '' }`;

export async function renderScore( abc, o ) {
	const scale = Math.max( 0.3, o.scale || 1 );
	// abcjs draws in unscaled units; the scale is applied through the
	// viewBox against the width and height attributes, which is exactly
	// what the editor's SVG importer and an <img> understand.
	const margin = o.margin / scale;
	const innerW = o.width / scale;
	const host = document.createElement( 'div' );
	host.style.cssText =
		'position:absolute;left:-99999px;top:0;width:' +
		Math.ceil( innerW ) +
		'px;';
	document.body.appendChild( host );
	try {
		const tunes = ABCJS.renderAbc( host, abc, {
			afterParsing: ( tune ) => {
				selectExcerpt( tune, o.excerpt );
				if ( o.ghostNotes ) markGhostNotes( tune );
			},
			staffwidth: innerW - 2 * margin,
			scale: 1,
			paddingtop: margin + ( o.annotations?.length || 0 ) * 20,
			paddingbottom: margin,
			paddingleft: margin,
			paddingright: margin,
			add_classes: true,
			visualTranspose: o.transpose || 0,
			foregroundColor: o.ink,
			tablature: o.tab
				? [
						{
							instrument: 'guitar',
							label: '',
							tuning: o.tab.tuning,
							capo: o.tab.capo || 0,
						},
				  ]
				: undefined,
			format: {
				...( o.annotations?.length
					? {
							stafftopmargin: 40 + o.annotations.length * 20,
							systemsep: 60 + o.annotations.length * 20,
					  }
					: {} ),
				titlefont: FONT( o.fonts.title, 28, 'bold' ),
				subtitlefont: FONT( o.fonts.title, 20 ),
				composerfont: FONT( o.fonts.text, 16, 'italic' ),
				vocalfont: FONT( o.fonts.text, 16 ),
				gchordfont: FONT( o.fonts.text, 16, 'bold' ),
				wordsfont: FONT( o.fonts.text, 16 ),
				annotationfont: FONT( o.fonts.text, 14 ),
				partsfont: FONT( o.fonts.text, 16, 'bold' ),
				tempofont: FONT( o.fonts.text, 16 ),
			},
		} );
		const svg = host.querySelector( 'svg' );
		if ( ! svg ) {
			throw new Error( 'The score could not be drawn.' );
		}
		markEmphasis( tunes, o.excerpt );
		const geometry =
			o.noteRanges ||
			o.annotations?.length ||
			o.highlightIndices ||
			o.ghostNotes
				? scoreGeometry( tunes, o )
				: null;
		inlineStyles( svg, o.ink, o.accent, o.excerpt );
		if ( geometry ) decorateScore( svg, geometry, o );
		const box = svg.getBBox();
		const innerH = box.y + box.height + margin;
		const height = Math.ceil( innerH * scale );
		svg.setAttribute( 'width', o.width );
		svg.setAttribute( 'height', height );
		svg.setAttribute( 'viewBox', `0 0 ${ innerW } ${ innerH }` );
		svg.setAttribute( 'preserveAspectRatio', 'xMinYMin meet' );
		svg.removeAttribute( 'style' );
		const warnings = [];
		for ( const t of tunes || [] ) {
			for ( const w of t.warnings || [] ) {
				warnings.push( String( w ).replace( /<[^>]+>/g, '' ) );
			}
		}
		let text = new window.XMLSerializer().serializeToString( svg );
		if ( ! /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test( text ) ) {
			text = text.replace(
				'<svg',
				'<svg xmlns="http://www.w3.org/2000/svg"'
			);
		}
		return {
			svg: text,
			width: o.width,
			height,
			warnings,
			...( o.noteRanges
				? { geometry: transformGeometry( geometry, 0, 0, scale ) }
				: {} ),
		};
	} finally {
		host.remove();
	}
}

/** Every element carries its colour as an attribute; classes and styles go. */
export function inlineStyles( svg, ink, accent, excerpt ) {
	for ( const st of svg.querySelectorAll( 'style' ) ) {
		st.remove();
	}
	const chord = ( el ) => {
		let n = el;
		while ( n && n !== svg ) {
			const c = n.getAttribute && n.getAttribute( 'class' );
			if ( c && /abcjs-chord|abcjs-annotation/.test( c ) ) {
				return true;
			}
			n = n.parentNode;
		}
		return false;
	};
	for ( const el of svg.querySelectorAll(
		'path, text, rect, line, ellipse, circle, polygon'
	) ) {
		const isChord = chord( el ) || isEmphasized( el, svg, excerpt );
		const col = isChord ? accent : ink;
		const fill = el.getAttribute( 'fill' );
		if (
			! fill ||
			'currentColor' === fill ||
			( isChord && fill !== 'none' )
		) {
			el.setAttribute( 'fill', 'line' === el.tagName ? 'none' : col );
		}
		const stroke = el.getAttribute( 'stroke' );
		if ( 'currentColor' === stroke ) {
			el.setAttribute( 'stroke', col );
		}
		if ( 'line' === el.tagName && ! stroke ) {
			el.setAttribute( 'stroke', col );
		}
	}
	for ( const el of svg.querySelectorAll( '*' ) ) {
		el.removeAttribute( 'class' );
		el.removeAttribute( 'style' );
		el.removeAttribute( 'data-name' );
		el.removeAttribute( 'data-wpiesm-emphasis' );
	}
}
