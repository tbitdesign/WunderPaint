/**
 * Replace Colors (v1.431.0): "this blue becomes that petrol, everywhere".
 *
 * Pure: a scan over the layers of the current page collects every carrier
 * of a solid color - shape fills and strokes, text color and outline,
 * character runs, gradient stops, layer-style colors and the document
 * background - grouped by color; the replacement patches exactly those
 * carriers and keeps each hit's own transparency (a 40% shadow stays a 40%
 * shadow in the new hue). Photos are pixels and stay out; so do hidden and
 * locked layers, generator groups (their children are rebuilt from the
 * recipe) and smart objects (edited through their own content editor).
 * The dialog in src/screens/replace-colors-dialog.jsx sits on top.
 */

import { parseColor, rgbToHex, toHexColor } from './color';

/** The carriers a color can sit on, in the order the dialog lists them. */
export const HIT_KINDS = [
	{ id: 'fill' },
	{ id: 'stroke' },
	{ id: 'text' },
	{ id: 'text-outline' },
	{ id: 'characters' },
	{ id: 'gradient' },
	{ id: 'effects' },
	{ id: 'background' },
];

const ALL_KINDS = HIT_KINDS.map( ( k ) => k.id );

/** Layer-style slots that carry one color. */
const STYLE_COLOR_SLOTS = [
	'dropShadow',
	'innerShadow',
	'outerGlow',
	'innerGlow',
	'satin',
	'colorOverlay',
	'stroke',
];

const SOLID = /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\([^)]*\))$/i;

/**
 * The comparable key of a color: #rrggbb, lower case, with the alpha kept
 * aside. Only explicit hex and rgb()/rgba() count - the parser's black
 * fallback for anything else is no licence to treat "url(#x)" as black.
 *
 * @param {*} value Stored color.
 * @return {{key: string, alpha: number}|null} Key and alpha, or null.
 */
export function colorKey( value ) {
	if ( 'string' !== typeof value ) {
		return null;
	}
	const v = value.trim();
	if ( ! v || ! SOLID.test( v ) ) {
		return null;
	}
	const c = parseColor( v );
	return { key: rgbToHex( c.r, c.g, c.b ).toLowerCase(), alpha: c.a };
}

/**
 * The original carrier in the target hue, with the carrier's own alpha.
 *
 * @param {string} original Stored color of the hit.
 * @param {string} target   Chosen color (#rrggbb or #rrggbbaa).
 * @return {string} New stored color.
 */
export function recolor( original, target ) {
	const from = colorKey( original );
	const to = parseColor( target );
	return toHexColor( to.r, to.g, to.b, from ? from.alpha : 1 );
}

/* ------------------------------ carriers ------------------------------- */

/** Which fill a shape or text layer actually draws. */
const fillMode = ( layer ) => {
	if ( layer.fillType ) {
		return layer.fillType;
	}
	return layer.pattern && 'none' !== layer.pattern ? 'pattern' : 'solid';
};

/**
 * Every color carrier of one layer as { kind, get, set }, where `set`
 * writes the new color into a shallow-copied patch object. The list is
 * the single source for scanning and replacing, so the two cannot drift.
 *
 * @param {Object} layer Layer.
 * @return {Array<{kind: string, value: string, apply: Function}>} Carriers.
 */
function carriersOf( layer ) {
	const out = [];
	const add = ( kind, value, apply ) => {
		if ( colorKey( value ) ) {
			out.push( { kind, value, apply } );
		}
	};
	const mode = fillMode( layer );

	if ( 'shape' === layer.type ) {
		if ( 'solid' === mode ) {
			add( 'fill', layer.fill, ( p, c ) => {
				p.fill = c;
			} );
		}
		if ( layer.strokeW > 0 && ! layer.strokeGradient ) {
			add( 'stroke', layer.stroke, ( p, c ) => {
				p.stroke = c;
			} );
		}
	}

	if ( 'text' === layer.type ) {
		if ( 'solid' === mode ) {
			add( 'text', layer.color, ( p, c ) => {
				p.color = c;
			} );
		}
		if ( layer.outlineW > 0 && ! layer.strokeGradient ) {
			add( 'text-outline', layer.outlineColor, ( p, c ) => {
				p.outlineColor = c;
			} );
		}
		if ( layer.shadowOn ) {
			add( 'effects', layer.shadowColor, ( p, c ) => {
				p.shadowColor = c;
			} );
		}
		add( 'fill', layer.bgColor, ( p, c ) => {
			p.bgColor = c;
		} );
		( layer.spans || [] ).forEach( ( run, i ) => {
			add( 'characters', run?.s?.color, ( p, c ) => {
				p.spans = p.spans || layer.spans.map( ( r ) => ( { ...r } ) );
				p.spans[ i ] = { ...p.spans[ i ], s: { ...run.s, color: c } };
			} );
		} );
		( layer.lineStyles || [] ).forEach( ( ls, i ) => {
			add( 'characters', ls?.color, ( p, c ) => {
				p.lineStyles =
					p.lineStyles ||
					layer.lineStyles.map( ( l ) => ( l ? { ...l } : l ) );
				p.lineStyles[ i ] = { ...p.lineStyles[ i ], color: c };
			} );
		} );
	}

	if (
		( 'shape' === layer.type || 'text' === layer.type ) &&
		'gradient' === mode
	) {
		( layer.gradientStops || [] ).forEach( ( stop, i ) => {
			add( 'gradient', stop?.color, ( p, c ) => {
				p.gradientStops =
					p.gradientStops ||
					layer.gradientStops.map( ( s ) => ( { ...s } ) );
				p.gradientStops[ i ] = { ...p.gradientStops[ i ], color: c };
			} );
		} );
	}

	if (
		layer.strokeGradient?.stops &&
		( layer.strokeW > 0 || layer.outlineW > 0 )
	) {
		layer.strokeGradient.stops.forEach( ( stop, i ) => {
			add( 'gradient', stop.color, ( patch, color ) => {
				patch.strokeGradient = patch.strokeGradient || {
					...layer.strokeGradient,
					stops: layer.strokeGradient.stops.map( ( s ) => ( {
						...s,
					} ) ),
				};
				patch.strokeGradient.stops[ i ] = {
					...patch.strokeGradient.stops[ i ],
					color,
				};
			} );
		} );
	}
	if (
		layer.type === 'repeat' &&
		layer.progression?.color?.on &&
		layer.progression.color.mode === 'gradient'
	) {
		( layer.progression.color.stops || [] ).forEach( ( stop, i ) => {
			add( 'gradient', stop.color, ( patch, color ) => {
				patch.progression = patch.progression || {
					...layer.progression,
					color: {
						...layer.progression.color,
						stops: layer.progression.color.stops.map( ( s ) => ( {
							...s,
						} ) ),
					},
				};
				patch.progression.color.stops[ i ] = {
					...patch.progression.color.stops[ i ],
					color,
				};
			} );
		} );
	}
	if ( 'gradient' === layer.type ) {
		( layer.stops || [] ).forEach( ( stop, i ) => {
			add( 'gradient', stop?.color, ( p, c ) => {
				p.stops = p.stops || layer.stops.map( ( s ) => ( { ...s } ) );
				p.stops[ i ] = { ...p.stops[ i ], color: c };
			} );
		} );
	}

	const s = layer.styles;
	if ( s && 'object' === typeof s ) {
		const styles = ( p ) => {
			p.styles = p.styles || { ...s };
			return p.styles;
		};
		for ( const slot of STYLE_COLOR_SLOTS ) {
			if (
				s[ slot ] &&
				'object' === typeof s[ slot ] &&
				! ( slot === 'stroke' && s.stroke.gradient?.stops?.length )
			) {
				add( 'effects', s[ slot ].color, ( p, c ) => {
					const st = styles( p );
					st[ slot ] = { ...st[ slot ], color: c };
				} );
			}
		}
		s.stroke?.gradient?.stops?.forEach( ( stop, i ) => {
			add( 'effects', stop.color, ( p, c ) => {
				const st = styles( p ),
					gradient = st.stroke.gradient;
				st.stroke = {
					...st.stroke,
					gradient: {
						...gradient,
						stops: gradient.stops.map( ( entry, index ) =>
							index === i ? { ...entry, color: c } : entry
						),
					},
				};
			} );
		} );
		const go = s.gradientOverlay;
		if ( go && Array.isArray( go.stops ) ) {
			go.stops.forEach( ( stop, i ) => {
				add( 'effects', stop?.color, ( p, c ) => {
					const st = styles( p );
					const stops = (
						st.gradientOverlay.stops === go.stops
							? go.stops.map( ( x ) => ( { ...x } ) )
							: st.gradientOverlay.stops
					).slice();
					stops[ i ] = { ...stops[ i ], color: c };
					st.gradientOverlay = { ...st.gradientOverlay, stops };
				} );
			} );
		}
	}

	return out;
}

/**
 * Which layers may be touched, and why the others are not: hidden or
 * locked, below a generator group, or a smart object.
 *
 * @param {Object[]} layers Layers of the page.
 * @return {{eligible: Object[], skipped: {hiddenOrLocked: number, generator: number, smart: number}}} Split.
 */
function eligibleLayers( layers ) {
	const byId = new Map( layers.map( ( l ) => [ l.id, l ] ) );
	const underGenerator = ( layer ) => {
		let cur = layer;
		const seen = new Set();
		while ( cur && ! seen.has( cur.id ) ) {
			seen.add( cur.id );
			if ( cur.generator ) {
				return true;
			}
			cur = cur.parent ? byId.get( cur.parent ) : null;
		}
		return false;
	};
	const hiddenBranch = ( layer ) => {
		let cur = layer;
		const seen = new Set();
		while ( cur && ! seen.has( cur.id ) ) {
			seen.add( cur.id );
			if ( false === cur.visible || cur.locked ) {
				return true;
			}
			cur = cur.parent ? byId.get( cur.parent ) : null;
		}
		return false;
	};
	const skipped = { hiddenOrLocked: 0, generator: 0, smart: 0 };
	const eligible = [];
	for ( const layer of layers ) {
		if ( 'group' === layer.type ) {
			continue; // no colors of its own; the reasons count per child
		}
		if ( 'smart' === layer.type ) {
			skipped.smart++;
			continue;
		}
		if ( hiddenBranch( layer ) ) {
			skipped.hiddenOrLocked++;
			continue;
		}
		if ( underGenerator( layer ) ) {
			skipped.generator++;
			continue;
		}
		eligible.push( layer );
	}
	return { eligible, skipped };
}

/* -------------------------------- scan --------------------------------- */

/**
 * Every solid color in the page's editable layers and the background,
 * most used first.
 *
 * @param {Object[]} layers Layers of the page.
 * @param {Object}   doc    Document (for `bg`).
 * @return {{colors: Array<{key: string, count: number, kinds: string[], layerIds: string[]}>, skipped: Object}} Scan.
 */
export function scanColors( layers, doc ) {
	const { eligible, skipped } = eligibleLayers( layers );
	const map = new Map();
	const note = ( key, kind, layerId ) => {
		if ( ! map.has( key ) ) {
			map.set( key, { key, count: 0, kinds: [], layerIds: [] } );
		}
		const e = map.get( key );
		e.count++;
		if ( ! e.kinds.includes( kind ) ) {
			e.kinds.push( kind );
		}
		if ( layerId && ! e.layerIds.includes( layerId ) ) {
			e.layerIds.push( layerId );
		}
	};
	for ( const layer of eligible ) {
		for ( const c of carriersOf( layer ) ) {
			note( colorKey( c.value ).key, c.kind, layer.id );
		}
	}
	const bg = colorKey( doc?.bg );
	if ( bg ) {
		note( bg.key, 'background', null );
	}
	const colors = Array.from( map.values() ).sort(
		( a, b ) => b.count - a.count || a.key.localeCompare( b.key )
	);
	return { colors, skipped };
}

/* ------------------------------- replace -------------------------------- */

/**
 * The patches that turn every carrier of each mapped color into its target.
 * Several colors at once, read against the ORIGINAL layers, so a swap
 * (A -> B and B -> A in one go) comes out right. A mapping whose target is
 * the source itself is a no-op and ignored.
 *
 * @param {Object[]} layers        Layers of the page.
 * @param {Object}   doc           Document.
 * @param {Object}   mapping       { [fromKey]: target } with keys from the scan.
 * @param {Object}   [opts]        Options.
 * @param {string[]} [opts.kinds]  Carrier kinds to touch (default: all).
 * @return {{patches: Map<string, Object>, doc: Object|null, changed: number}} Patches per layer id, the document patch (or null) and the number of carriers changed.
 */
export function replaceColorMap( layers, doc, mapping, opts = {} ) {
	const kinds = new Set( opts.kinds || ALL_KINDS );
	const map = new Map();
	for ( const [ from, target ] of Object.entries( mapping || {} ) ) {
		const key = String( from || '' ).toLowerCase();
		const to = colorKey( target );
		if ( key && to && to.key !== key ) {
			map.set( key, target );
		}
	}
	const patches = new Map();
	let changed = 0;
	if ( map.size ) {
		const { eligible } = eligibleLayers( layers );
		for ( const layer of eligible ) {
			const patch = {};
			let hits = 0;
			for ( const c of carriersOf( layer ) ) {
				const target = map.get( colorKey( c.value ).key );
				if ( ! target || ! kinds.has( c.kind ) ) {
					continue;
				}
				c.apply( patch, recolor( c.value, target ) );
				hits++;
			}
			if ( hits ) {
				patches.set( layer.id, patch );
				changed += hits;
			}
		}
	}
	let docPatch = null;
	const bg = colorKey( doc?.bg );
	if ( kinds.has( 'background' ) && bg && map.has( bg.key ) ) {
		docPatch = { bg: recolor( doc.bg, map.get( bg.key ) ) };
		changed++;
	}
	return { patches, doc: docPatch, changed };
}

/**
 * One color into another; see replaceColorMap().
 *
 * @param {Object[]} layers  Layers of the page.
 * @param {Object}   doc     Document.
 * @param {string}   fromKey Color key from the scan (#rrggbb).
 * @param {string}   target  New color.
 * @param {Object}   [opts]  Options, see replaceColorMap().
 * @return {{patches: Map<string, Object>, doc: Object|null, changed: number}} Result.
 */
export function replaceColors( layers, doc, fromKey, target, opts = {} ) {
	return replaceColorMap( layers, doc, { [ fromKey ]: target }, opts );
}

/**
 * The layers as they would look after the replacement, for a preview.
 *
 * @param {Object[]} layers  Layers.
 * @param {Map}      patches From replaceColors().
 * @return {Object[]} Patched copies (untouched layers by reference).
 */
export function previewLayers( layers, patches ) {
	return layers.map( ( l ) =>
		patches.has( l.id ) ? { ...l, ...patches.get( l.id ) } : l
	);
}
