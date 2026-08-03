/**
 * LayoutSpec (E1 of the dynamic-layouts design, see
 * docs/superpowers/specs/2026-07-07-dynamic-text-layouts-design.md):
 * the serializable contract every layout producer emits — the classic
 * presets, the seeded generator and (E2) the cloud art director. One
 * validator sanitizes any producer's output, one applier typesets a spec
 * through the v1.46 rich-span engine, so producers stay interchangeable.
 *
 *   {
 *     version: 1,
 *     source: 'classic'|'generated'|'ai',
 *     id: 'poster'|null, seed: 123|null,
 *     fit: 'block'|'scale',
 *     lines: [ { text, role, fontFamily, weight, italic, rel, ls,
 *                gapAfter, color?, emph?: { wordIndex, style } } ],
 *   }
 */

import { __ } from '@wordpress/i18n';

import { LOCAL_FONTS, ensureFont } from './font-manager';
import { measureTextWidth, measureTextHeight } from './raster';

export const LAYOUT_ROLES = [ 'eyebrow', 'hero', 'sub', 'detail' ];
export const LAYOUT_SOURCES = [ 'classic', 'generated', 'ai' ];

const clamp = ( n, lo, hi ) => Math.max( lo, Math.min( hi, n ) );
const num = ( v, d ) => ( Number.isFinite( +v ) ? +v : d );
const isColor = ( c ) =>
	'accent' === c ||
	( 'string' === typeof c &&
		( /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test( c.trim() ) ||
			/^rgba?\([\d\s.,%]+\)$/i.test( c.trim() ) ) );

function cleanEmphStyle( raw ) {
	if ( ! raw || 'object' !== typeof raw ) {
		return null;
	}
	const out = {};
	if ( undefined !== raw.relSize ) {
		out.relSize = clamp( num( raw.relSize, 1 ), 0.5, 3 );
	}
	if ( raw.family && LOCAL_FONTS[ raw.family ] ) {
		out.family = raw.family;
	}
	if ( undefined !== raw.weight ) {
		out.weight = clamp( Math.round( num( raw.weight, 400 ) ), 100, 900 );
	}
	if ( undefined !== raw.italic ) {
		out.italic = !! raw.italic;
	}
	if ( undefined !== raw.underline ) {
		out.underline = !! raw.underline;
	}
	if ( raw.color && isColor( raw.color ) ) {
		out.color = raw.color;
	}
	return Object.keys( out ).length ? out : null;
}

/**
 * Sanitize any producer's raw spec: font whitelist, enums, numeric clamps,
 * baked casing, at most 8 non-empty lines. Returns null when unusable.
 *
 * @param {Object} raw Raw spec (possibly from an AI response).
 * @return {?Object} Clean spec or null.
 */
export function cleanLayoutSpec( raw ) {
	if ( ! raw || ! Array.isArray( raw.lines ) ) {
		return null;
	}
	const lines = raw.lines
		.filter( ( l ) => l && 'string' === typeof l.text && l.text.trim() )
		.slice( 0, 8 )
		.map( ( l ) => {
			const text = String(
				l.upper ? l.text.toUpperCase() : l.text
			).slice( 0, 160 );
			const line = {
				text,
				role: LAYOUT_ROLES.includes( l.role ) ? l.role : 'sub',
				fontFamily: LOCAL_FONTS[ l.fontFamily ]
					? l.fontFamily
					: 'Inter',
				weight: clamp( Math.round( num( l.weight, 400 ) ), 100, 900 ),
				italic: !! l.italic,
				rel: clamp( num( l.rel, 1 ), 0.05, 3 ),
				ls: clamp( num( l.ls, 0 ), -0.1, 0.6 ),
				gapAfter: clamp( num( l.gapAfter, 0.2 ), 0, 2 ),
			};
			if ( l.color && isColor( l.color ) ) {
				line.color = l.color;
			}
			const style = cleanEmphStyle( l.emph?.style );
			const wordIndex = Math.round( num( l.emph?.wordIndex, -1 ) );
			if ( style && wordIndex >= 0 ) {
				line.emph = { wordIndex, style };
			}
			return line;
		} );
	if ( ! lines.length ) {
		return null;
	}
	return {
		version: 1,
		source: LAYOUT_SOURCES.includes( raw.source )
			? raw.source
			: 'generated',
		id: 'string' === typeof raw.id ? raw.id.slice( 0, 40 ) : null,
		seed: Number.isFinite( +raw.seed ) ? Math.round( +raw.seed ) : null,
		fit: 'block' === raw.fit ? 'block' : 'scale',
		lines,
	};
}

// Split a line into parts, isolating the emph word (by INDEX, no
// heuristics — producers decide). Single-word lines stay plain.
function lineTokens( line ) {
	if ( ! line.emph ) {
		return [ { text: line.text, extra: null } ];
	}
	const tokens = line.text.split( /(\s+)/ ).filter( ( t ) => '' !== t );
	const words = tokens
		.map( ( t, i ) => ( { t, i } ) )
		.filter( ( x ) => x.t.trim() );
	if ( words.length < 2 || line.emph.wordIndex >= words.length ) {
		return [ { text: line.text, extra: null } ];
	}
	const pick = words[ line.emph.wordIndex ];
	return tokens.map( ( t, i ) => ( {
		text: t,
		extra: i === pick.i ? line.emph.style : null,
	} ) );
}

/**
 * Typeset a spec for a text layer — PURE: returns the UPDATE_LAYER patch
 * (fitted spans, joined text, measured height, textLayout {spec, gen})
 * without dispatching, so preview tiles reuse the exact same maths.
 *
 * @param {Object} layer Text layer (box width is the fitting target).
 * @param {Object} spec  Clean LayoutSpec.
 * @param {Object} ctx   { accent, color } resolution context.
 * @return {Object} Patch for UPDATE_LAYER.
 */
export function specPatch( layer, spec, ctx ) {
	const accent = ctx?.accent || '#3b66ff';
	const baseColor = ctx?.color || layer.color || '#1a1d21';
	const targetW = Math.max( 40, Math.round( layer.w || 300 ) );
	const allParts = spec.lines.map( ( l ) => lineTokens( l ) );

	const probeW = ( i ) =>
		Math.max(
			1,
			allParts[ i ].reduce( ( acc, part ) => {
				const rel = part.extra?.relSize || 1;
				return (
					acc +
					measureTextWidth( {
						text: part.text,
						fontFamily:
							part.extra?.family || spec.lines[ i ].fontFamily,
						weight: part.extra?.weight || spec.lines[ i ].weight,
						italic: part.extra?.italic ?? !! spec.lines[ i ].italic,
						fontSize: 100 * rel,
						letterSpacing: ( spec.lines[ i ].ls || 0 ) * 100 * rel,
					} )
				);
			}, 0 )
		);

	let sizes;
	if ( 'block' === spec.fit ) {
		sizes = spec.lines.map( ( l, i ) =>
			clamp( ( 100 * targetW ) / probeW( i ), 8, 500 )
		);
	} else {
		const k = Math.min(
			...spec.lines.map(
				( l, i ) => targetW / ( ( probeW( i ) / 100 ) * ( l.rel || 1 ) )
			)
		);
		sizes = spec.lines.map( ( l ) => clamp( k * ( l.rel || 1 ), 8, 500 ) );
	}

	const spans = [];
	spec.lines.forEach( ( l, i ) => {
		const size = Math.round( sizes[ i ] );
		let lineLh = null;
		if ( i > 0 ) {
			const prev = Math.round( sizes[ i - 1 ] );
			const gap = spec.lines[ i - 1 ].gapAfter ?? 0.2;
			lineLh = clamp(
				( size * 0.95 + prev * ( 0.15 + gap ) ) / size,
				0.9,
				4
			);
		}
		const parts = allParts[ i ];
		parts.forEach( ( part, pi ) => {
			const rel = part.extra?.relSize || 1;
			const pSize = Math.max( 4, Math.round( size * rel ) );
			const style = {
				size: pSize,
				family: part.extra?.family || l.fontFamily,
				weight: part.extra?.weight || l.weight,
				italic: part.extra?.italic ?? !! l.italic,
				ls: Math.round( ( l.ls || 0 ) * pSize ),
			};
			const rawCol = part.extra?.color || l.color || null;
			const col = 'accent' === rawCol ? accent : rawCol;
			if ( col && col !== baseColor ) {
				style.color = col;
			}
			if ( part.extra?.underline ) {
				style.underline = true;
			}
			if ( lineLh ) {
				// Keep the line's advance uniform even for bigger parts.
				style.lh = clamp( ( lineLh * size ) / pSize, 0.5, 4 );
			}
			spans.push( {
				text:
					part.text +
					( pi === parts.length - 1 && i < spec.lines.length - 1
						? '\n'
						: '' ),
				s: style,
			} );
		} );
	} );

	const text = spec.lines
		.map( ( l, i ) => allParts[ i ].map( ( p ) => p.text ).join( '' ) )
		.join( '\n' );
	const patch = {
		text,
		spans,
		lineStyles: null,
		align: 'center',
		fixedWidth: false,
		textLayout: { spec, gen: text },
	};
	patch.h = measureTextHeight( { ...layer, ...patch } );
	return patch;
}

/**
 * Apply a spec to the active text layer: load its fonts, typeset, dispatch
 * one UPDATE_LAYER + commit. `meta.src` memoes the original wording (for
 * clear/cycle), `meta.idx` the classic cycle position.
 *
 * @param {Object} editor Editor context.
 * @param {Object} spec   Clean LayoutSpec.
 * @param {Object} meta   { src, idx }.
 * @return {Promise<?Object>} The applied spec (null = no-op).
 */
export async function applyLayoutSpec( editor, spec, meta = {} ) {
	const { state, dispatch, commit } = editor;
	const layer = state.layers.find( ( l ) => l.id === state.activeId );
	if ( ! layer || 'text' !== layer.type || ! spec ) {
		return null;
	}
	await Promise.all(
		spec.lines.flatMap( ( l ) => [
			ensureFont( l.fontFamily, l.weight ).catch( () => {} ),
			l.emph?.style?.family
				? ensureFont(
						l.emph.style.family,
						l.emph.style.weight || 400
				  ).catch( () => {} )
				: null,
		] )
	);
	const patch = specPatch( layer, spec, {
		accent: editor.WPIE?.brand?.colors?.[ 0 ] || '#3b66ff',
		color: layer.color || '#1a1d21',
	} );
	patch.textLayout = {
		...patch.textLayout,
		src: meta.src ?? layer.text,
		...( undefined !== meta.idx ? { idx: meta.idx } : {} ),
	};
	dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
	commit( __( 'Text layout', 'wunderpaint' ) );
	return spec;
}
