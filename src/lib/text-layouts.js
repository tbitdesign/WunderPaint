/**
 * Text layouts: one-click lockups INSIDE a single text layer (v1.45+).
 * Since E1 of the dynamic-layouts design the ten curated looks below are
 * ordinary LayoutSpec PRODUCERS ("classics"): `classicSpec()` turns them
 * into the shared spec format and `applyLayoutSpec()` (layout-spec.js)
 * typesets them — the same pipeline the seeded generator and (E2) the
 * cloud art director use. `cycleTextLayoutOp` remains as the thin
 * click-through wrapper over the classics.
 */

import { __ } from '@wordpress/i18n';

import { measureTextHeight, textLineStyle } from './raster';
import { cleanLayoutSpec, applyLayoutSpec } from './layout-spec';

/** Index of the shortest (trimmed) line — the natural emphasis word. */
function shortestIdx( lines ) {
	let idx = 0;
	lines.forEach( ( t, i ) => {
		if ( t.length < lines[ idx ].length ) {
			idx = i;
		}
	} );
	return idx;
}

/*
 * Each layout maps the display lines to per-line specs:
 *   rel      Size relative to the layout base (fit 'scale' only).
 *   ls       Letter-spacing in em.
 *   upper    Render the line in capitals (baked into the text; the source
 *            casing is remembered in the layer's layout memo).
 *   gapAfter Extra gap below the line in em of its own size.
 *   color    Line colour (accent lines use the brand colour).
 * `fit: 'block'` instead sizes every line to fill the full block width.
 */
export const TEXT_LAYOUTS = [
	{
		id: 'poster',
		name: __( 'Poster', 'wunderpaint' ),
		fit: 'block',
		map: ( lines ) =>
			lines.map( ( text ) => ( {
				text,
				fontFamily: 'Anton',
				weight: 400,
				upper: true,
				ls: 0.02,
				gapAfter: 0.18,
			} ) ),
	},
	{
		id: 'impact',
		name: __( 'Impact', 'wunderpaint' ),
		fit: 'block',
		map: ( lines, { color, accent } ) =>
			lines.map( ( text, i ) => ( {
				text,
				fontFamily: 'Archivo',
				weight: 900,
				upper: true,
				ls: 0.01,
				gapAfter: 0.12,
				color: i % 2 ? accent : color,
			} ) ),
	},
	{
		id: 'hero',
		name: __( 'Hero', 'wunderpaint' ),
		map: ( lines, { accent } ) => {
			const n = lines.length;
			return lines.map( ( text, i ) => {
				if ( 0 === i ) {
					return {
						text,
						fontFamily: 'Montserrat',
						weight: 600,
						upper: true,
						rel: 0.3,
						ls: 0.32,
						color: accent,
						gapAfter: 0.55,
					};
				}
				if ( i === n - 1 && n >= 3 ) {
					return {
						text,
						fontFamily: 'Montserrat',
						weight: 500,
						rel: 0.34,
						ls: 0.06,
						gapAfter: 0.3,
					};
				}
				return {
					text,
					fontFamily: 'Montserrat',
					weight: 800,
					upper: true,
					rel: 1,
					ls: 0.02,
					gapAfter: 0.22,
				};
			} );
		},
	},
	{
		id: 'editorial',
		name: __( 'Editorial', 'wunderpaint' ),
		map: ( lines ) =>
			lines.map( ( text, i ) => ( {
				text,
				fontFamily: 'Playfair Display',
				weight: i % 2 ? 500 : 700,
				italic: !! ( i % 2 ),
				rel: i % 2 ? 0.6 : 1,
				gapAfter: 0.24,
			} ) ),
	},
	{
		id: 'contrast',
		name: __( 'Contrast', 'wunderpaint' ),
		map: ( lines, { accent } ) => {
			const emph = shortestIdx( lines );
			return lines.map( ( text, i ) =>
				i === emph
					? {
							text,
							fontFamily: 'Anton',
							weight: 400,
							upper: true,
							rel: 1.15,
							ls: 0.02,
							color: accent,
							gapAfter: 0.2,
					  }
					: {
							text,
							fontFamily: 'Inter',
							weight: 500,
							rel: 0.5,
							ls: 0.08,
							gapAfter: 0.26,
					  }
			);
		},
	},
	{
		id: 'handwritten',
		name: __( 'Handwritten', 'wunderpaint' ),
		map: ( lines, { accent } ) => {
			const emph = lines.length > 1 ? 1 : 0;
			return lines.map( ( text, i ) =>
				i === emph
					? {
							text,
							fontFamily: 'Caveat',
							weight: 700,
							rel: 1.2,
							color: accent,
							gapAfter: 0.12,
					  }
					: {
							text,
							fontFamily: 'Archivo',
							weight: 800,
							upper: true,
							rel: 0.68,
							ls: 0.1,
							gapAfter: 0.2,
					  }
			);
		},
	},
	{
		id: 'minimal',
		name: __( 'Minimal', 'wunderpaint' ),
		map: ( lines ) =>
			lines.map( ( text ) => ( {
				text,
				fontFamily: 'Inter',
				weight: 300,
				upper: true,
				rel: 1,
				ls: 0.42,
				gapAfter: 0.7,
			} ) ),
	},
	{
		id: 'spotlight',
		name: __( 'Spotlight', 'wunderpaint' ),
		map: ( lines ) =>
			lines.map( ( text ) => ( {
				text,
				fontFamily: 'Inter',
				weight: 500,
				rel: 0.62,
				ls: 0.02,
				gapAfter: 0.32,
				emphWord: 'longest',
				emphStyle: { weight: 900, color: 'accent', relSize: 1.3 },
			} ) ),
	},
	{
		id: 'marker',
		name: __( 'Marker', 'wunderpaint' ),
		map: ( lines ) =>
			lines.map( ( text ) => ( {
				text,
				fontFamily: 'Archivo',
				weight: 800,
				rel: 0.68,
				ls: 0.04,
				gapAfter: 0.3,
				emphWord: 'longest',
				emphStyle: {
					family: 'Caveat',
					weight: 700,
					color: 'accent',
					relSize: 1.5,
				},
			} ) ),
	},
	{
		id: 'quote',
		name: __( 'Quote', 'wunderpaint' ),
		map: ( lines ) => {
			const n = lines.length;
			return lines.map( ( text, i ) =>
				i === n - 1 && n >= 2
					? {
							text,
							fontFamily: 'Inter',
							weight: 600,
							upper: true,
							rel: 0.36,
							ls: 0.3,
							gapAfter: 0.3,
					  }
					: {
							text,
							fontFamily: 'Lora',
							weight: 500,
							italic: true,
							rel: 0 === i ? 1 : 0.66,
							gapAfter: 0.3,
					  }
			);
		},
	},
];

/**
 * Split free text into display lines for a lockup. Manual line breaks win;
 * otherwise the text is split by sentences, and a short lead sentence (up to
 * three words) becomes one emphasis word per line — "Hallo Welt. Wir lieben
 * Code!" → [ "Hallo", "Welt", "Wir lieben Code!" ]. Trailing full stops are
 * dropped, ! and ? are kept.
 *
 * @param {string} text Source text.
 * @return {string[]} Display lines (may be fewer than 2 for tiny inputs).
 */
export function splitLayoutLines( text ) {
	const src = String( text || '' ).trim();
	if ( ! src ) {
		return [];
	}
	if ( src.includes( '\n' ) ) {
		return src
			.split( '\n' )
			.map( ( s ) => s.trim() )
			.filter( Boolean );
	}
	const sentences = src
		.split( /(?<=[.!?…])\s+/ )
		.map( ( s ) => s.trim() )
		.filter( Boolean );
	const lines = [];
	sentences.forEach( ( sentence, si ) => {
		const stripped = sentence.replace( /\.$/, '' );
		const words = stripped.split( /\s+/ );
		if ( 0 === si && sentences.length > 1 && words.length <= 3 ) {
			lines.push( ...words );
		} else if ( words.length > 6 ) {
			const mid = Math.ceil( words.length / 2 );
			lines.push(
				words.slice( 0, mid ).join( ' ' ),
				words.slice( mid ).join( ' ' )
			);
		} else {
			lines.push( stripped );
		}
	} );
	if ( lines.length < 2 && lines[ 0 ] ) {
		const words = lines[ 0 ].split( /\s+/ );
		if ( words.length >= 2 && words.length <= 4 ) {
			return words;
		}
		if ( words.length > 4 ) {
			const mid = Math.ceil( words.length / 2 );
			return [
				words.slice( 0, mid ).join( ' ' ),
				words.slice( mid ).join( ' ' ),
			];
		}
	}
	return lines;
}

/** The text a layout starts from: the memoed source while un-edited. */
export function sourceTextOf( layer ) {
	const meta = layer.textLayout;
	return meta && layer.text === meta.gen ? meta.src : layer.text;
}

/**
 * Whether the layout button applies to this layer: a text layer whose
 * content yields at least two display lines.
 *
 * @param {Object} layer Layer.
 * @return {boolean} True when a layout can be applied.
 */
export function canLayoutText( layer ) {
	return (
		!! layer &&
		'text' === layer.type &&
		splitLayoutLines( sourceTextOf( layer ) ).length >= 2
	);
}

// Resolve a classic's emphWord heuristic ('longest'|'shortest'|'first'|
// 'last') to a concrete word index; null for single-word lines.
function emphIndexOf( text, emphWord ) {
	const words = text.split( /\s+/ ).filter( Boolean );
	if ( words.length < 2 ) {
		return null;
	}
	let idx = 0;
	if ( 'longest' === emphWord ) {
		words.forEach( ( w, i ) => {
			if ( w.length > words[ idx ].length ) {
				idx = i;
			}
		} );
	} else if ( 'shortest' === emphWord ) {
		words.forEach( ( w, i ) => {
			if ( w.length < words[ idx ].length ) {
				idx = i;
			}
		} );
	} else if ( 'last' === emphWord ) {
		idx = words.length - 1;
	}
	return idx;
}

/**
 * Build the LayoutSpec of a classic preset for the given display lines.
 * Colours stay symbolic ('accent') so the spec is context-free until
 * applied.
 *
 * @param {string}   id    TEXT_LAYOUTS id.
 * @param {string[]} lines Display lines (original casing).
 * @param {Object}   ctx   { color } base colour (for alternating looks).
 * @return {?Object} Clean LayoutSpec or null.
 */
export function classicSpec( id, lines, ctx = {} ) {
	const layout = TEXT_LAYOUTS.find( ( l ) => l.id === id );
	if ( ! layout || ! lines.length ) {
		return null;
	}
	const color = ctx.color || '#1a1d21';
	const specs = layout.map( lines, { color, accent: 'accent' } );
	const specLines = specs.map( ( sp ) => {
		const line = {
			text: sp.text,
			upper: !! sp.upper,
			fontFamily: sp.fontFamily,
			weight: sp.weight,
			italic: !! sp.italic,
			rel: sp.rel || 1,
			ls: sp.ls || 0,
			gapAfter: sp.gapAfter ?? 0.2,
		};
		if ( sp.color && sp.color !== color ) {
			line.color = sp.color;
		}
		if ( sp.emphWord && sp.emphStyle ) {
			const wordIndex = emphIndexOf(
				sp.upper ? sp.text.toUpperCase() : sp.text,
				sp.emphWord
			);
			if ( null !== wordIndex ) {
				line.emph = { wordIndex, style: sp.emphStyle };
			}
		}
		return line;
	} );
	return cleanLayoutSpec( {
		source: 'classic',
		id,
		fit: layout.fit || 'scale',
		lines: specLines,
	} );
}

/**
 * Apply the next classic layout to the active text layer, IN PLACE.
 * Clicking again cycles the ten classics; editing the text in between
 * restarts from the edit. One history step per click, no groups.
 *
 * @param {Object} editor Editor context.
 * @return {Promise<?Object>} The applied TEXT_LAYOUTS entry (null = no-op).
 */
export async function cycleTextLayoutOp( editor ) {
	const { state } = editor;
	const layer = state.layers.find( ( l ) => l.id === state.activeId );
	if ( ! layer || 'text' !== layer.type ) {
		return null;
	}
	const meta = layer.textLayout || null;
	const edited = ! meta || layer.text !== meta.gen;
	const src = edited ? layer.text : meta.src;
	const lines = splitLayoutLines( src );
	if ( lines.length < 2 ) {
		return null;
	}
	const idx = edited ? 0 : ( ( meta.idx ?? 0 ) + 1 ) % TEXT_LAYOUTS.length;
	const spec = classicSpec( TEXT_LAYOUTS[ idx ].id, lines, {
		color: layer.color || '#1a1d21',
	} );
	const applied = await applyLayoutSpec( editor, spec, { src, idx } );
	return applied ? TEXT_LAYOUTS[ idx ] : null;
}

/**
 * Remove a layout from a text layer: restores the memoed source text and
 * clears the styled spans.
 *
 * @param {Object} editor Editor context.
 * @return {boolean} True when a layout was removed.
 */
export function clearTextLayoutOp( editor ) {
	const { state, dispatch, commit } = editor;
	const layer = state.layers.find( ( l ) => l.id === state.activeId );
	if ( ! layer || 'text' !== layer.type || ! layer.textLayout ) {
		return false;
	}
	const src = sourceTextOf( layer );
	const patch = {
		text: src,
		spans: null,
		lineStyles: null,
		textLayout: null,
	};
	patch.h = measureTextHeight( { ...layer, ...patch } );
	dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
	commit( __( 'Text layout', 'wunderpaint' ) );
	return true;
}

// Re-export for consumers that style per line (properties panel, tests).
export { textLineStyle };
