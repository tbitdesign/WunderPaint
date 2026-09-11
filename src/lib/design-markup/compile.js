import { cleanMarkup, validateMarkup } from './clean';
import { resolveTokens } from './tokens';
import { measureTextBlock, measureComponent, textBoxHeight } from './measure';
import { solveLayout } from './layout';
import { resolveAssets } from './assets';
import { applyBindings, bindingPreview } from './bindings';
import { buildBackground } from './elements/background';
import { buildShape } from './elements/shape';
import { buildText } from './elements/text';
import { buildComponent } from './elements/component';
import { buildGroup } from './elements/group';
import { buildPhoto } from './elements/photo';
import { placeholderPhoto } from '../design-flair';
import { createCanvas } from '../raster';
import { ensureFontsForLayers, isLoadableFamily } from '../font-manager';
import { LIMITS } from './catalog';
import { verifyAndRepair } from './verify';

const BUILDERS = {
	background: buildBackground,
	shape: buildShape,
	text: buildText,
	component: buildComponent,
	group: buildGroup,
	photo: buildPhoto,
};

/**
 * One `font.fallback` note per voice family this installation cannot draw:
 * a catalog family that is neither shipped, downloaded, custom nor CDN-on
 * measures and paints as the system fallback, so every width, line break and
 * min-size verdict below belongs to a different typeface than the markup
 * asked for. The design still compiles - the note says the numbers are about
 * a substitute.
 *
 * The check itself never fails a compile: outside a browser (a node test
 * runner, a server-side render) `isLoadableFamily` reads a `window` that is
 * not there, and "we cannot tell" is not "not loadable".
 *
 * @param {Object} tokens Resolved tokens (`type.voices`).
 * @param {Array}  notes  Report notes, appended in place.
 */
function noteFontFallbacks( tokens, notes ) {
	const seen = new Set();
	for ( const voice of Object.values( tokens.type.voices ) ) {
		const family = voice.fontFamily;
		if ( ! family || seen.has( family ) ) {
			continue;
		}
		seen.add( family );
		let loadable = true;
		try {
			loadable = isLoadableFamily( family );
		} catch ( e ) {
			loadable = true;
		}
		if ( ! loadable ) {
			notes.push( {
				code: 'font.fallback',
				path: '$.tokens.type',
				message: `${ family } is not loadable here, measured with a fallback`,
			} );
		}
	}
}

async function defaultLoadFonts( markup, tokens ) {
	const probes = Object.values( tokens.type.voices ).map( ( v ) => ( {
		type: 'text',
		text: 'Ag',
		fontFamily: v.fontFamily,
		weight: v.weight,
	} ) );
	await ensureFontsForLayers( probes );
}

/**
 * Records the ONE `build-error` a failed compile needs, ignoring a second
 * call once one is already there: a builder failure inside `emit()` is
 * recorded there and rethrown, and unwinds through every enclosing `emit()`
 * frame (a parent's recursive `await emit(parent)` isn't itself wrapped in
 * try/catch) up to the outer loop's catch in `compileDesign` — without this
 * guard that outer catch would log the SAME failure a second time. A
 * failure that never went through a builder (e.g. the group-linking code
 * after it) reaches the outer catch with no `build-error` yet, so it still
 * gets recorded there, exactly once.
 */
export function recordBuildError( report, err, path ) {
	if ( report.errors.some( ( e ) => 'build-error' === e.code ) ) {
		return;
	}
	report.errors.push( {
		code: 'build-error',
		path,
		message: String( ( err && err.message ) || err ),
	} );
}

/**
 * The one rejected-compile shape, shared by every rejection site (invalid
 * markup, a missing non-optional asset, a builder that threw). `tokens` is
 * only ever included once resolveTokens() has actually run.
 */
function reject( { markup, ctx, report, assets, tokens } ) {
	return {
		markup,
		doc: { ...( ctx.doc || {} ), ...markup.canvas },
		layers: [],
		sourceMap: {},
		assets: assets || new Map(),
		report,
		status: 'rejected',
		...( tokens ? { tokens } : {} ),
	};
}

/**
 * Markup -> Ebenen. Reihenfolge: bereinigen, validieren, Tokens, Fonts,
 * Layout, Assets, Bau, Gruppen verlinken, Bindungen, Prüfung/Reparatur.
 */
export async function compileDesign( raw, ctx = {} ) {
	const { markup, notes } = cleanMarkup( raw, ctx );
	const report = { notes, errors: [], metrics: {}, repairs: [] };
	const valid = validateMarkup( markup, ctx );
	if ( ! valid.ok ) {
		report.errors = valid.errors;
		return reject( { markup, ctx, report } );
	}
	const tokens = resolveTokens( markup, ctx );
	noteFontFallbacks( tokens, report.notes );
	await ( ctx.loadFonts || defaultLoadFonts )( markup, tokens );

	// Gemessen wird, was auch gemalt wird: ein gebundener Text mit seinem
	// Vorschau-Wert (`bindingPreview`, dieselbe Antwort, die
	// `applyBindings` weiter unten auf die Ebene schreibt), und in einem
	// Kasten nach dem Zeilen-Budget seiner Stimme (`textBoxHeight`). Mit
	// dem Beispieltext des Autors gemessen bekäme ein echter Auszug den
	// Kasten eines fremden, kürzeren Textes.
	const measure = ( el, w ) => {
		if ( 'text' === el.kind ) {
			const voice = tokens.type.voices[ el.voice ];
			const text = bindingPreview( el, ctx.previewContext ) || el.content;
			return measureTextBlock( {
				text,
				w,
				hMax: textBoxHeight( el, voice, { text, w } ),
				voice,
				upper: el.upper,
				fit: el.fit,
			} );
		}
		if ( 'component' === el.kind ) {
			return measureComponent( el, tokens, {
				w: markup.canvas.w,
				h: markup.canvas.h,
			} );
		}
		return { h: Math.round( w * 0.5 ) };
	};
	const layout = solveLayout( markup, tokens, measure );
	report.notes.push( ...layout.notes );

	const sizes = new Map();
	for ( const el of markup.elements ) {
		if ( 'photo' === el.kind && el.asset ) {
			const r = layout.rects.get( el.id );
			const prev = sizes.get( el.asset );
			if ( r && ( ! prev || r.w * r.h > prev.w * prev.h ) ) {
				sizes.set( el.asset, { w: r.w, h: r.h } );
			}
		}
	}
	const assets = await resolveAssets( markup, { ...ctx, tokens, sizes } );
	for ( const el of markup.elements ) {
		if (
			'photo' === el.kind &&
			el.asset &&
			assets.get( el.asset )?.missing &&
			! el.optional
		) {
			report.errors.push( {
				code: 'asset-missing',
				path: `$.elements[${ el.id }]`,
				message: `asset ${ el.asset } (${
					assets.get( el.asset ).kind
				}) is not available`,
			} );
		}
	}
	if ( report.errors.length ) {
		return reject( { markup, ctx, report, assets, tokens } );
	}

	const doc = {
		...( ctx.doc || {} ),
		w: markup.canvas.w,
		h: markup.canvas.h,
	};
	const buildCtx = {
		tokens,
		doc,
		seed: tokens.seed,
		assets,
		previewContext: ctx.previewContext,
		render: ctx.render,
		placeholder: ( rect ) =>
			placeholderPhoto(
				createCanvas,
				rect.w,
				rect.h,
				tokens.palette,
				tokens.seed
			),
	};
	const layers = [];
	const sourceMap = {};
	const emitted = new Set();
	const byId = new Map( markup.elements.map( ( e ) => [ e.id, e ] ) );
	const emit = async ( el ) => {
		if ( emitted.has( el.id ) ) {
			return;
		}
		if ( el.parent && byId.has( el.parent ) ) {
			await emit( byId.get( el.parent ) );
		}
		emitted.add( el.id );
		let rect = layout.rects.get( el.id );
		if ( ! rect ) {
			report.notes.push( {
				code: 'layout.rect-missing',
				path: `$.elements[${ el.id }]`,
				message: `no layout rect for ${ el.id }; using the full canvas`,
			} );
			rect = { x: 0, y: 0, w: doc.w, h: doc.h };
		}
		let built;
		try {
			built = await BUILDERS[ el.kind ]( el, rect, buildCtx );
		} catch ( err ) {
			recordBuildError( report, err, `$.elements[${ el.id }]` );
			throw err;
		}
		if ( el.parent ) {
			const parentMain = sourceMap[ el.parent ]?.parts.main;
			const group = layers.find( ( l ) => l.id === parentMain );
			const root =
				built.layers.find( ( l ) => l.id === built.parts.main ) ||
				built.layers[ 0 ];
			// EVERY top-level layer of the child joins the group, not just
			// its main one: a photo's authored scrim (elements/photo.js) is
			// a sibling layer with no `parent`, and linking only the main
			// layer left it outside the group - it stayed where it was when
			// the group moved, and the group's own box never covered it.
			// Main first, the rest in build order (z-order within the group
			// still comes from the flat layer list, render.js).
			if ( group && Array.isArray( group.children ) ) {
				const tops = [
					...( root ? [ root ] : [] ),
					...built.layers.filter( ( l ) => l !== root && ! l.parent ),
				];
				for ( const layer of tops ) {
					layer.parent = group.id;
					group.children.push( layer.id );
				}
			}
		}
		layers.push( ...built.layers );
		sourceMap[ el.id ] = {
			layerIds: built.layers.map( ( l ) => l.id ),
			parts: built.parts,
			rect,
		};
	};
	try {
		for ( const el of markup.elements ) {
			await emit( el );
		}
	} catch ( err ) {
		recordBuildError( report, err, '$.elements' );
		return reject( { markup, ctx, report, assets, tokens } );
	}
	// The layer budget is a BUILT count, not an authored one: 24 elements
	// within every other limit can still become a document nobody wants to
	// edit (a component is three layers, a masked, treated photo four).
	// `validateMarkup` cannot see it, so it is checked here, once, after the
	// emit loop.
	if ( layers.length > LIMITS.layers ) {
		report.errors.push( {
			code: 'limit',
			path: '$.elements',
			message: `too many layers: ${ layers.length } > ${ LIMITS.layers }`,
		} );
		return reject( { markup, ctx, report, assets, tokens } );
	}
	applyBindings( layers, sourceMap, markup, ctx );

	const compiled = {
		markup,
		doc,
		layers,
		sourceMap,
		assets,
		report,
		status: 'valid',
		tokens,
	};
	if ( false === ctx.verify ) {
		return compiled;
	}
	return verifyAndRepair( compiled, ctx );
}
