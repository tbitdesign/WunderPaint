import {
	renderToCanvas,
	layerOvershoot,
	stylesPadding,
	effectReach,
	sharedImageCache,
	measureTextHeight,
} from '../raster';
import { fitTextLayout } from '../text-fit';
import { contrastRatio } from '../contrast-check';
import { parseColor, rgbToHex } from '../color';
import { buildPhotoScrim } from './elements/photo';
import { bestOn } from './tokens';
import { maxLinesFor } from './catalog';

/*
 * Stage-1 limits (deliberate, not bugs):
 * - Texts inside smart hulls (treated photos) are not measured; only plain
 *   text layers walked from `compiled.layers` are checked.
 * - After a geometry repair (margin, overlap-text, overflow), `rel`
 *   neighbours and stack siblings are not re-solved — only the repaired
 *   layer itself moves/resizes.
 * - No repair action exists for `min-size` or `lines`; a design that still
 *   has one of these after a round ends `rejected`. `overlap-decor` is a
 *   NOTE since stage 2d, not a violation - it never had a repair, and the
 *   contrast measurement (which reads the decor under the glyphs) is the
 *   readability guard that actually matters.
 * - There is only ONE kind of scrim since stage 2h: a PHOTO's own
 *   (`dm.part === 'scrim'`, carrying the photo's `dm.el`, built by
 *   `buildPhotoScrim()`). It is an authored element like any other and is
 *   checked like any other. The old repair scrim — a gradient band the
 *   `contrast` repair slipped in behind a single text — is gone: it turned
 *   up behind nearly every text of every generated design and read as a
 *   defect, not as a design. The `contrast` ladder is now recolor, then
 *   the photo's own scrim, then rejection.
 * - Fluid text (`textFit: 'fluid'`) is never `overflow` merely because
 *   `fitTextLayout()` scaled it down to fit — that IS the fluid contract
 *   (the box sets lines and sizes; the text fits by construction). Fluid
 *   `overflow` only fires when the fitted block still exceeds the box past
 *   a small tolerance (`fit.block > layer.h + tol`, `tol = max(1, 0.01 *
 *   layer.h)`); the `overflow` grow-repair therefore only ever applies to
 *   fixed-size text (`measureTextHeight() > h`). Readability of a
 *   scaled-down fluid text is `min-size`'s job instead, checked against the
 *   PAINTED per-line size, never the nominal `layer.fontSize`: a look's
 *   emphasis is painted at `line.s * relSize` (text-fit.js's `fitSpans`),
 *   so a line whose words are all enlarged never reaches the canvas at
 *   `line.s` — see `paintedSizes()`.
 * - A label on its own face (a component's text on the face shape that
 *   shares its `dm.el`, or a text carrying its own chip pill in
 *   `bgColor`) is measured differently: the glyphs are rendered WITHOUT
 *   the pill, the pill goes into the background pass, and the region is
 *   the label's own rect without the `layerOvershoot()` expansion — the
 *   glyphs stand on the face, not on the artwork around it. Its `contrast`
 *   repair is a recolor and nothing else: a gradient between face and
 *   label cannot change what the glyphs stand on, and one over the face
 *   would cover the very thing it stands on.
 * - `overlap-decor` exempts a decor layer from the text it names via `for`,
 *   and separately exempts a layer from a text that share the same
 *   `dm.el` — a component's face and label are two layers of one authored
 *   element and are expected to sit on top of each other.
 * - `contrast` measures the COMPOSITED glyph colour, never the raw one:
 *   `getImageData()` is un-premultiplied, so a text at `opacity: 0.35` hands
 *   back its full-strength colour at a low alpha. Each sampled pixel is
 *   composited over the pixel under it (`a * al + u * (1 - al)`) before the
 *   ratio, and the zero-sample fallback does the same with `textLayer.color`
 *   over the average under colour. The opacity that counts is the EFFECTIVE
 *   one - the layer's own times every enclosing group's - because the alone
 *   pass strips `parent` and would otherwise paint a text inside a 40% group
 *   at full strength.
 * - `margin`, its clamp and the `overlap-text` move-below measure a TEXT
 *   layer's overshoot as paint only (styles and live effects), never the
 *   `ceil(fontSize * 0.5)` raster pad inside `layerOvershoot()` — see
 *   `paintOvershoot()`. Every other check keeps `layerOvershoot()`, because
 *   there the glyph bleed is exactly what has to be covered.
 * - `margin` and `overlap-text` repair the ELEMENT, not the single violating
 *   layer: every layer sharing the violating layer's `dm.el` (a component's
 *   face/label/group, a masked photo's image/mask/group, a text and its
 *   repair scrim …) moves by one shared delta computed from their union rect
 *   and the largest `paintOvershoot()` among them, so a rigid shape stays
 *   rigid and a frozen-at-build-time group box (relink() in
 *   elements/component.js) moves with it. A second `margin` violation for an
 *   element already handled this round is a no-op (it was fixed as part of
 *   the first one).
 * - After the rounds, `sourceMap[el].rect` is re-read from each element's
 *   main layer: it starts life as the LAYOUT rect, and everything a repair
 *   moved or grew would otherwise leave it describing a place the design no
 *   longer occupies.
 */

const MAX_ROUNDS = 4;
const intersects = ( a, b ) =>
	a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const rectOf = ( l ) => ( { x: l.x, y: l.y, w: l.w, h: l.h } );

/** Elemente per Ebene: Source-Map-Marke `dm.el`. */
const elOf = ( compiled, layer ) =>
	compiled.markup.elements.find( ( e ) => e.id === layer.dm?.el );

/**
 * Ein Etikett auf eigener Fläche: das Label einer Komponente (Gesichts-
 * Ebene mit demselben `dm.el`) oder ein Text mit eigener Chip-Pille
 * (`bgColor`, von text-draw.js hinter jeder Zeile gemalt).
 */
function labelOnFace( compiled, layer ) {
	if ( layer.bgColor ) {
		return true;
	}
	if ( 'component' !== elOf( compiled, layer )?.kind ) {
		return false;
	}
	return compiled.layers.some(
		( l ) =>
			l !== layer &&
			'face' === l.dm?.part &&
			l.dm?.el === layer.dm?.el &&
			l.visible !== false
	);
}

/**
 * Die Chip-Pille ohne ihre Glyphen: dieselbe Ebene, nur mit unsichtbarer
 * Schrift. Die Pille ist keine eigene Ebene (text-draw.js malt sie aus
 * `bgColor` hinter jede Zeile), gehört beim Kontrast aber unter die
 * Glyphen. Farben ändern keine Geometrie, der Umbruch bleibt identisch.
 *
 * Eigene id (`:pill`-Suffix): die Kopie landet zusätzlich zum "below"-
 * Ausschnitt im Untergrund-Rendersatz (`glyphContrast()`). Trüge sie die
 * ID des Texts, würde eine Gruppe, deren `children` diese ID nennt und
 * die selbst im selben Satz steckt, die Kopie als eigenes Kind auflösen
 * und ein zweites Mal (mit Gruppen-Transform) malen - eine doppelte
 * Pille, sichtbar bei einer durchscheinenden Pille oder einer rotierten
 * Gruppe.
 */
function chipFaceLayer( layer ) {
	const clear = ( s ) => ( { ...( s || {} ), color: 'transparent' } );
	const out = {
		...layer,
		id: `${ layer.id }:pill`,
		parent: null,
		color: 'transparent',
		fillType: null,
		outlineColor: null,
		shadowOn: false,
		spans: Array.isArray( layer.spans )
			? layer.spans.map( ( r ) => ( { ...r, s: clear( r.s ) } ) )
			: layer.spans,
	};
	if ( out.textLook?.roles ) {
		out.textLook = {
			...out.textLook,
			roles: Object.fromEntries(
				Object.entries( out.textLook.roles ).map( ( [ k, r ] ) => [
					k,
					{ ...r, color: 'transparent' },
				] )
			),
			...( out.textLook.emph
				? {
						emph: {
							...out.textLook.emph,
							style: {
								...out.textLook.emph.style,
								color: 'transparent',
							},
						},
				  }
				: {} ),
		};
	}
	return out;
}

/**
 * Die tatsächlich gemalten Zeilengrößen eines Fluid-Texts: `line.s` mal
 * der kleinsten Betonungsskalierung der Zeile (text-fit.js setzt
 * `size: line.s * word.rel`), damit die Mindestgröße die Zahl prüft, die
 * auf der Leinwand landet.
 */
const paintedSizes = ( fit ) =>
	fit.lines
		.map( ( ln ) => {
			const rels = ( ln.words || [] ).map( ( w ) => w.rel || 1 );
			return ln.s * ( rels.length ? Math.min( ...rels ) : 1 );
		} )
		.filter( Boolean );

/**
 * Wie weit eine Ebene beim Malen ueber ihren Kasten hinausragt - fuer die
 * RANDpruefung und die beiden Reparaturen, die daraufhin verschieben.
 *
 * Fuer alles ausser Text ist das `layerOvershoot()`. Fuer Text NICHT: dort
 * enthaelt `layerOvershoot()` auch den Rasterrand `ceil( fontSize * 0.5 )`,
 * einen Puffer fuer Glyphen, die ueber ihre Zeile hinauslaufen (Unterlaenge,
 * Akzent, Schwung). Der ist beim Rastern richtig und bei der Randpruefung
 * falsch: ein Textkasten, der exakt auf der Sicherheitszone sitzt,
 * "verletzt" sie damit IMMER um eine halbe Schriftgroesse - und weil die
 * Zone die Gruppe nicht schmaler machen kann, kommt auch die Reparatur
 * nicht weiter. Genau daran sind im Lauf 2c die Titel, Sublines und Datums-
 * zeilen in den Stapeln gescheitert, mit `value: 0`.
 *
 * Was bleibt, ist die FARBE ueber dem Kasten: Schlagschatten, Kontur,
 * Schein (`stylesPadding`) und laufende Effekte (`effectReach` ueber die
 * Smart Filter). Ein Text mit einem Schatten von 20 px muss 20 px weiter
 * innen sitzen, ein Text ohne Stile nicht.
 *
 * `textFxReach()` (Text am Pfad, Warp) fehlt hier bewusst: der Compiler
 * baut so etwas nicht, und die Funktion ist aus `raster` nicht exportiert.
 *
 * @param {Object} l Ebene.
 * @return {number} Ueberstand in Dokumentpixeln.
 */
function paintOvershoot( l ) {
	if ( 'text' !== l.type ) {
		return layerOvershoot( l );
	}
	let live = 0;
	for ( const sf of l.smartFilters || [] ) {
		if ( sf.enabled ) {
			live = Math.max( live, effectReach( sf.params ) );
		}
	}
	if ( l.previewEffect ) {
		live = Math.max( live, effectReach( l.previewEffect.params ) );
	}
	return ( l.styles ? stylesPadding( l ) : 0 ) + live;
}

/** Der Textkasten, um `layerOvershoot` erweitert und auf das Dokument geklemmt. */
function expandedRect( doc, layer, o ) {
	const x0 = Math.max( 0, layer.x - o );
	const y0 = Math.max( 0, layer.y - o );
	const x1 = Math.min( doc.w, layer.x + layer.w + o );
	const y1 = Math.min( doc.h, layer.y + layer.h + o );
	return {
		x: x0,
		y: y0,
		w: Math.max( 0, x1 - x0 ),
		h: Math.max( 0, y1 - y0 ),
	};
}

/** Mittelfarbe aller Pixel eines Canvas-Ausschnitts (nicht nur der Glyphen). */
function averageOf( data ) {
	let r = 0;
	let g = 0;
	let b = 0;
	const n = data.length / 4;
	if ( ! n ) {
		return { r: 255, g: 255, b: 255 };
	}
	for ( let i = 0; i < data.length; i += 4 ) {
		r += data[ i ];
		g += data[ i + 1 ];
		b += data[ i + 2 ];
	}
	return {
		r: Math.round( r / n ),
		g: Math.round( g / n ),
		b: Math.round( b / n ),
	};
}

/**
 * Die Deckkraft, mit der eine Ebene wirklich auf der Leinwand landet: die
 * eigene mal die jeder umschließenden Gruppe. Der Allein-Durchgang malt die
 * Ebene ohne `parent` (sonst löste die Gruppe ihre Kinder ein zweites Mal
 * auf), also muss die Gruppendeckkraft von Hand mitkommen. Der `seen`-Satz
 * bricht eine kaputte Elternkette ab, statt sich in ihr zu verfangen.
 */
function effectiveOpacity( compiled, layer ) {
	let opacity = layer.opacity ?? 1;
	const seen = new Set( [ layer.id ] );
	let parentId = layer.parent;
	while ( parentId && ! seen.has( parentId ) ) {
		seen.add( parentId );
		const parent = compiled.layers.find( ( l ) => l.id === parentId );
		if ( ! parent ) {
			break;
		}
		opacity *= parent.opacity ?? 1;
		parentId = parent.parent;
	}
	return opacity;
}

/** Ein Pixel über einem anderen: un-premultipliziert, wie getImageData liefert. */
const over = ( top, bottom, alpha ) => ( {
	r: top.r * alpha + bottom.r * ( 1 - alpha ),
	g: top.g * alpha + bottom.g * ( 1 - alpha ),
	b: top.b * alpha + bottom.b * ( 1 - alpha ),
} );

/**
 * Kontrast an den Glyphen: Text allein und alles darunter rendern, 10.
 * Perzentil. Gemessen wird die Farbe, die WIRKLICH auf der Leinwand steht:
 * `getImageData()` liefert un-premultipliziert, ein Text bei `opacity: 0.35`
 * käme also in voller Stärke zurück — jeder Glyphenpixel wird deshalb erst
 * über den Pixel darunter gerechnet. Nie vakuos bestehen: eine an die
 * effektive Deckkraft angepasste Alpha-Schwelle, ein auf den Überschuss
 * erweiterter Messbereich, und ein Rückfall auf die (ebenso verrechnete)
 * Textfarbe gegen die Durchschnittsfarbe darunter, falls kein Glyphenpixel
 * die Schwelle erreicht (nie `Infinity`, auf 21 gedeckelt).
 * Liegt der erweiterte Messbereich ganz außerhalb des Dokuments (Text
 * komplett off-canvas), wird die Messung übersprungen statt auf einem
 * leeren Ausschnitt zu rendern.
 *
 * Die eigene Chip-Pille (`bgColor`) gehört NICHT in den Allein-Durchgang:
 * sie ist deckend und würde jeden Pillen-Pixel als Glyphe zählen — gemessen
 * wäre dann Pille gegen Foto statt Schrift gegen Pille (weiße Schrift auf
 * fast weißer Pille bestünde). Sie wandert stattdessen in den Untergrund.
 * `onFace` (Etikett auf eigener Fläche) misst zudem im eigenen Rechteck,
 * ohne die Überschuss-Erweiterung.
 */
async function glyphContrast( compiled, textLayer, index, ctx, onFace ) {
	const o = onFace ? 0 : layerOvershoot( textLayer );
	const rect = expandedRect( compiled.doc, textLayer, o );
	if ( rect.w <= 0 || rect.h <= 0 ) {
		return { skipped: 'off-canvas' };
	}
	const scale = Math.min( 1, 400 / Math.max( rect.w, rect.h, 1 ) );
	const render = ctx.render || renderToCanvas;
	const opts = { viewport: rect, scale, cache: sharedImageCache };
	const opacity = effectiveOpacity( compiled, textLayer );
	const alone = await render(
		{ ...compiled.doc, bg: 'transparent' },
		[ { ...textLayer, parent: null, bgColor: null, opacity } ],
		opts
	);
	const below = compiled.layers
		.slice( 0, index )
		.filter( ( l ) => l.visible !== false );
	const under = await render(
		compiled.doc,
		textLayer.bgColor ? [ ...below, chipFaceLayer( textLayer ) ] : below,
		opts
	);
	const a = alone
		.getContext( '2d' )
		.getImageData( 0, 0, alone.width, alone.height ).data;
	const u = under
		.getContext( '2d' )
		.getImageData( 0, 0, under.width, under.height ).data;
	// Nur der KERN einer Glyphe zaehlt, nicht ihr Saum. Bei 200 (rund 78 %)
	// rutschten die kantengeglaetteten Randpixel noch mit in die Messung -
	// halb durchsichtige Pixel, deren gemischte Farbe das 10. Perzentil
	// unter das eigentliche Verhaeltnis zieht. Im dritten Lauf sind daran
	// kleine Etiketten gescheitert, die auf ihrer Flaeche voellig lesbar
	// sind: Chip 3,99, CTA 4,28 und 4,48 gegen eine Grenze von 4,5. Bei
	// 230 (rund 90 %) bleibt der volle Kern uebrig, und das Perzentil sagt
	// wieder, was der Text auf der Flaeche wirklich tut. Der Boden von 40
	// haelt die Messung fuer sehr durchsichtige Texte am Leben, und der
	// Faktor `opacity` ist noetig, weil ein Text bei 0,35 nie mehr als 89
	// erreicht.
	const alphaThreshold = Math.max( 40, Math.round( 230 * opacity ) );
	const ratios = [];
	const sum = { r: 0, g: 0, b: 0, n: 0 };
	for ( let i = 0; i < a.length; i += 4 ) {
		if ( a[ i + 3 ] < alphaThreshold ) {
			continue;
		}
		const bgc = { r: u[ i ], g: u[ i + 1 ], b: u[ i + 2 ] };
		const t = over(
			{ r: a[ i ], g: a[ i + 1 ], b: a[ i + 2 ] },
			bgc,
			a[ i + 3 ] / 255
		);
		ratios.push( contrastRatio( t, bgc ) );
		sum.r += bgc.r;
		sum.g += bgc.g;
		sum.b += bgc.b;
		sum.n++;
	}
	if ( ! ratios.length ) {
		const avg = averageOf( u );
		const textColor = parseColor( textLayer.color ) || { r: 0, g: 0, b: 0 };
		const p10 = Math.min(
			21,
			contrastRatio( over( textColor, avg, opacity ), avg )
		);
		return { p10, avgBg: rgbToHex( avg.r, avg.g, avg.b ) };
	}
	ratios.sort( ( x, y ) => x - y );
	const p10 = Math.min( 21, ratios[ Math.floor( ratios.length * 0.1 ) ] );
	const avgBg = rgbToHex(
		Math.round( sum.r / sum.n ),
		Math.round( sum.g / sum.n ),
		Math.round( sum.b / sum.n )
	);
	return { p10, avgBg };
}

/**
 * Notiz `type.ratio`: die größte gemalte Zeilengröße eines Fluid-Blocks
 * geteilt durch die kleinste. Über 4 sieht der Block nicht mehr wie ein
 * Absatz aus, sondern wie zwei verschiedene Texte (eine Betonungsregel,
 * die ein Wort allein auf eine Zeile stellt, reicht dafür). Das ist eine
 * Entscheidung, kein Fehler - deshalb Notiz, nie Verstoß.
 */
const RATIO_NOTE = 4;

/**
 * Notizen dieses Laufs zurücksetzen, bevor neu gemessen wird: `verifyDesign`
 * läuft nach JEDER Reparaturrunde erneut über dieselben Ebenen, und ohne das
 * hier stünde dieselbe Notiz am Ende vier Mal im Report.
 */
function resetRunNotes( compiled ) {
	const notes = compiled.report?.notes;
	if ( ! Array.isArray( notes ) ) {
		return null;
	}
	for ( let i = notes.length - 1; i >= 0; i-- ) {
		if ( 'type.ratio' === notes[ i ].code ) {
			notes.splice( i, 1 );
		}
	}
	return notes;
}

export async function verifyDesign( compiled, ctx = {} ) {
	const violations = [];
	const metrics = { texts: 0, contrast: {} };
	const { doc, layers, markup } = compiled;
	const notes = resetRunNotes( compiled );
	const scaleRef = doc.w / 1080;
	const margin = Math.round(
		Math.min( doc.w, doc.h ) * ( markup.grid?.margin ?? 0.06 )
	);
	const texts = layers
		.map( ( l, i ) => [ l, i ] )
		.filter( ( [ l ] ) => 'text' === l.type && l.visible !== false );
	metrics.texts = texts.length;
	for ( const [ layer, index ] of texts ) {
		const el = elOf( compiled, layer ) || {};
		// Überlauf, Zeilen, Mindestgröße (Fluid über die Fit-Auskunft; feste
		// Größe über dieselbe Messung, die der Renderer/measure.js nutzt).
		// `null` statt eines Look-Kontexts: `ctx` hier ist der Prüf-Kontext
		// (render …), nicht text-fit's `{ accent, brand, lc }`.
		let minSize = layer.fontSize;
		if ( 'fluid' === layer.textFit ) {
			const fit = fitTextLayout( layer, null );
			const sizes = paintedSizes( fit );
			minSize = sizes.length ? Math.min( ...sizes ) : layer.fontSize;
			const ratio = sizes.length
				? Math.max( ...sizes ) / Math.min( ...sizes )
				: 1;
			if ( notes && ratio > RATIO_NOTE ) {
				notes.push( {
					code: 'type.ratio',
					el: el.id,
					layerId: layer.id,
					value: ratio,
					message: `largest painted line is ${ ratio.toFixed(
						1
					) }x the smallest`,
				} );
			}
			// Scaling down to fit IS the fluid contract, not an overflow —
			// only a block that still exceeds the box past a small
			// tolerance is one (see the header comment).
			const tol = Math.max( 1, 0.01 * layer.h );
			if ( fit.block > layer.h + tol ) {
				violations.push( {
					code: 'overflow',
					el: el.id,
					layerId: layer.id,
					value: fit.block,
					limit: layer.h,
					message: 'text block exceeds its box',
				} );
			}
			// Gebundene Texte gegen das Zeilen-Budget ihrer Stimme, nicht
			// gegen das Beispiel des Autors: gemessen wurde in genau
			// diesem Kasten (compile.js, `textBoxHeight`).
			const maxLines = el.lines ? maxLinesFor( el ) : 0;
			if ( maxLines && fit.lines.length > maxLines ) {
				violations.push( {
					code: 'lines',
					el: el.id,
					layerId: layer.id,
					value: fit.lines.length,
					limit: maxLines,
					message: 'more lines than allowed',
				} );
			}
		} else {
			const naturalH = Math.ceil( measureTextHeight( layer ) );
			if ( naturalH > layer.h ) {
				violations.push( {
					code: 'overflow',
					el: el.id,
					layerId: layer.id,
					value: naturalH,
					limit: layer.h,
					message: 'text block exceeds its box',
				} );
			}
		}
		if ( minSize < 14 * scaleRef ) {
			violations.push( {
				code: 'min-size',
				el: el.id,
				layerId: layer.id,
				value: minSize,
				limit: 14 * scaleRef,
				message: 'text too small',
			} );
		}
		// Kontrast an den Glyphen (off-canvas: übersprungen, keine Verletzung —
		// der Rand-Check unten greift für einen Text ganz außerhalb ohnehin).
		const limit = minSize >= 36 * scaleRef ? 3 : 4.5;
		const measured = await glyphContrast(
			compiled,
			layer,
			index,
			ctx,
			labelOnFace( compiled, layer )
		);
		if ( measured.skipped ) {
			metrics.contrast[ layer.id ] = {
				p10: null,
				skipped: measured.skipped,
			};
		} else {
			const { p10, avgBg } = measured;
			metrics.contrast[ layer.id ] = { p10, avgBg, limit };
			if ( p10 < limit ) {
				violations.push( {
					code: 'contrast',
					el: el.id,
					layerId: layer.id,
					value: p10,
					limit,
					message: 'text contrast below limit',
				} );
			}
		}
	}
	// Überlappung Text/Text und Text/Dekor.
	for ( let i = 0; i < texts.length; i++ ) {
		for ( let j = i + 1; j < texts.length; j++ ) {
			if (
				intersects(
					rectOf( texts[ i ][ 0 ] ),
					rectOf( texts[ j ][ 0 ] )
				)
			) {
				violations.push( {
					code: 'overlap-text',
					el: texts[ j ][ 0 ].dm?.el,
					layerId: texts[ j ][ 0 ].id,
					other: texts[ i ][ 0 ].id,
					message: 'two texts overlap',
				} );
			}
		}
	}
	for ( const [ t ] of texts ) {
		const tEl = elOf( compiled, t );
		for ( const l of layers ) {
			const el = elOf( compiled, l );
			if (
				! el ||
				'decor' !== el.role ||
				l.opacity <= 0.5 ||
				'group' === l.type ||
				l === t
			) {
				continue;
			}
			if ( el.for === tEl?.id || l.dm?.el === t.dm?.el ) {
				continue;
			}
			if ( intersects( rectOf( t ), rectOf( l ) ) && notes ) {
				// Eine NOTIZ, keine Verletzung (Stufe 2d). Dekor unter Text
				// ist eine Absicht, die der Autor mit `for` erklaert - und
				// wenn er das vergisst, ist das ein fehlendes Wort, kein
				// unlesbares Bild. Was wirklich unlesbar waere, faengt die
				// Kontrastmessung ab: die misst an den Glyphen gegen ALLES
				// darunter, das Dekor eingeschlossen. Ein Entwurf wegen
				// eines fehlenden `for` wegzuwerfen, hat in beiden echten
				// Laeufen mehr gute Entwuerfe gekostet als schlechte.
				notes.push( {
					code: 'overlap-decor',
					path: `$.elements[${ tEl?.id }]`,
					el: tEl?.id,
					layerId: t.id,
					other: l.id,
					message: 'decor under text without for',
				} );
			}
		}
	}
	// Ränder (ein Reparatur-Scrim wird nie selbst zum Rand-Ziel — seine
	// Region ist ohnehin auf die Sicherheitszone geklemmt).
	for ( const l of layers ) {
		const el = elOf( compiled, l );
		if (
			! el ||
			'group' === l.type ||
			el.place?.cover ||
			'frame' === el.role ||
			'background' === el.kind
		) {
			continue;
		}
		const o = paintOvershoot( l );
		if (
			l.x - o < margin ||
			l.y - o < margin ||
			l.x + l.w + o > doc.w - margin ||
			l.y + l.h + o > doc.h - margin
		) {
			violations.push( {
				code: 'margin',
				el: el.id,
				layerId: l.id,
				message: 'outside the safe margin',
			} );
		}
	}
	return { violations, metrics };
}

/**
 * Alle Ebenen EINES Elements (`dm.el`) — eine Komponente aus Gruppe, Fläche
 * und Etikett, ein maskiertes Foto aus Gruppe, Maske und Bild, ein Text mit
 * seinem Reparatur-Scrim. Ohne Marke (oder ohne Treffer) bleibt es bei der
 * verletzenden Ebene selbst.
 */
const elementUnit = ( layers, elId, fallback ) => {
	const unit = elId ? layers.filter( ( l ) => l.dm?.el === elId ) : [];
	return unit.length ? unit : [ fallback ];
};

/** Umschließendes Rechteck einer Ebenengruppe (x/y plus rechte/untere Kante). */
const unionRect = ( targets ) =>
	targets.reduce(
		( acc, l ) => ( {
			x: Math.min( acc.x, l.x ),
			y: Math.min( acc.y, l.y ),
			x1: Math.max( acc.x1, l.x + l.w ),
			y1: Math.max( acc.y1, l.y + l.h ),
		} ),
		{ x: Infinity, y: Infinity, x1: -Infinity, y1: -Infinity }
	);

/**
 * Ein Element als Ganzes verschieben: EIN Delta auf jede seiner Ebenen.
 * Einzeln verschoben driften Fläche und Etikett auseinander und der beim
 * Bauen eingefrorene Gruppenkasten (relink(), elements/component.js) bleibt
 * stehen.
 */
function moveElement( targets, dx, dy ) {
	for ( const l of targets ) {
		l.x += dx;
		l.y += dy;
	}
}

/**
 * Ein Element als Ganzes verkleinern: EIN Faktor, um die Mitte seines
 * umschliessenden Rechtecks, auf jede seiner Ebenen - Kasten, Schrift,
 * Gruppenrahmen.
 *
 * Warum ueberhaupt: fuer `margin` gab es bis Stufe 2g nur das Verschieben,
 * und das kann nichts ausrichten, wenn ein Element groesser ist als die
 * Sicherheitszone (`hiX >= lo` ist dann falsch - und weil die Bedingung
 * BEIDE Achsen verlangt, reicht eine zu grosse Hoehe, um auch das
 * Verschieben in der Breite zu verhindern). In Lauf 4 waren zwei von vier
 * OpenAI-Entwuerfen daran gescheitert, an genau EINER Verletzung: ein
 * Dekor-Panel und ein freigestelltes Foto, beide mit einem Schatten, der
 * groesser war als der Platz um sie herum.
 *
 * Ein Faktor fuer beide Achsen, damit ein Foto oder eine Form nicht
 * verzerrt; die Schriftgroesse eines Etiketts geht mit, sonst laeuft es
 * aus seiner geschrumpften Flaeche.
 *
 * @param {Array}  targets Ebenen des Elements.
 * @param {Object} union   Ihr umschliessendes Rechteck (x, y, x1, y1).
 * @param {number} f       Faktor < 1.
 */
function scaleElement( targets, union, f ) {
	const cx = ( union.x + union.x1 ) / 2;
	const cy = ( union.y + union.y1 ) / 2;
	for ( const l of targets ) {
		l.x = Math.round( cx + ( l.x - cx ) * f );
		l.y = Math.round( cy + ( l.y - cy ) * f );
		l.w = Math.max( 1, Math.round( l.w * f ) );
		l.h = Math.max( 1, Math.round( l.h * f ) );
		if ( 'text' === l.type && l.fontSize ) {
			l.fontSize = Math.max( 1, Math.round( l.fontSize * f ) );
		}
	}
}

/** Die ungebremste Blockhöhe: Fluid über den Fit auf volle Dokumenthöhe, fest über measureTextHeight. */
function naturalHeight( compiled, layer ) {
	if ( 'fluid' === layer.textFit ) {
		return fitTextLayout( { ...layer, h: compiled.doc.h }, null ).block;
	}
	return measureTextHeight( layer );
}

/**
 * Den Grund unter einem Text dunkler machen - ueber den Scrim des FOTOS,
 * ueber dem er steht.
 *
 * Gesucht wird das Foto, dessen Rechteck den Text schneidet (das
 * oberste, wenn es mehrere sind). Sein `scrim` wird gesetzt oder
 * verstaerkt: von der Seite, auf der der Text steht, ueber die ganze
 * Breite des Fotos, Staerke bis 0,9 und Hoehe bis 0,8. Die Ebene baut
 * derselbe Code wie beim ersten Bau (`buildPhotoScrim`), damit es keine
 * zweite Wahrheit ueber die Form eines Scrims gibt.
 *
 * Gibt false zurueck, wenn kein Foto darunter liegt oder sein Scrim schon
 * am Anschlag ist - dann bleibt die Verletzung stehen, und der Entwurf
 * wird abgelehnt.
 *
 * @param {Object}   compiled Kompilierter Entwurf.
 * @param {Object}   layer    Textebene mit zu wenig Kontrast.
 * @param {Function} log      Reparaturprotokoll.
 * @param {Object}   v        Die Verletzung.
 * @return {boolean} true, wenn etwas geaendert wurde.
 */
function darkenPhotoUnder( compiled, layer, log, v ) {
	const { layers, markup, sourceMap } = compiled;
	const tRect = rectOf( layer );
	let photo = null;
	let pRect = null;
	for ( const el of markup.elements ) {
		if ( 'photo' !== el.kind ) {
			continue;
		}
		const rect = sourceMap?.[ el.id ]?.rect;
		if ( rect && intersects( tRect, rect ) ) {
			photo = el;
			pRect = rect;
		}
	}
	if ( ! photo || photo.lock ) {
		return false;
	}
	// Von welcher Seite? Von der, auf der der Text steht: liegt seine
	// Mitte in der unteren Haelfte des Fotos, kommt der Verlauf von unten.
	const side = tRect.y + tRect.h / 2 > pRect.y + pRect.h / 2 ? 'b' : 't';
	const before = photo.scrim;
	const strength = Math.min(
		0.9,
		Math.round( ( ( before?.strength ?? 0.35 ) + 0.25 ) * 100 ) / 100
	);
	// Hoch genug, dass der Verlauf den Text wirklich erreicht: der Abstand
	// von der gewaehlten Kante bis zur fernen Kante des Textkastens, plus
	// etwas Luft, gedeckelt auf 0,8 der Fotohoehe.
	const reach =
		'b' === side
			? pRect.y + pRect.h - tRect.y
			: tRect.y + tRect.h - pRect.y;
	const height = Math.min(
		0.8,
		Math.max(
			before?.height ?? 0.5,
			Math.round( ( reach / Math.max( 1, pRect.h ) + 0.1 ) * 100 ) / 100
		)
	);
	if (
		before &&
		before.from === side &&
		before.strength >= strength &&
		before.height >= height
	) {
		return false; // Schon am Anschlag - mehr Verlauf hilft nicht.
	}
	photo.scrim = {
		color: before?.color || 'bg',
		from: side,
		strength,
		height,
	};
	const scrim = buildPhotoScrim( photo, pRect );
	const existing = layers.find( ( l ) => l.id === scrim.id );
	if ( existing ) {
		scrim.parent = existing.parent;
		layers[ layers.indexOf( existing ) ] = scrim;
	} else {
		// Neu: direkt ueber die letzte Ebene des Fotos, also unter alles,
		// was nach dem Foto gemalt wird - der Text bleibt oben.
		const own = layers.filter( ( l ) => l.dm?.el === photo.id );
		const last = own[ own.length - 1 ];
		scrim.parent = last?.parent || null;
		layers.splice( layers.indexOf( last ) + 1, 0, scrim );
		if ( scrim.parent ) {
			const group = layers.find( ( l ) => l.id === scrim.parent );
			if ( group && Array.isArray( group.children ) ) {
				const at = group.children.indexOf( last.id );
				group.children.splice(
					-1 === at ? group.children.length : at + 1,
					0,
					scrim.id
				);
			}
		}
		const entry = sourceMap?.[ photo.id ];
		if ( entry ) {
			entry.parts.scrim = scrim.id;
			if ( ! entry.layerIds.includes( scrim.id ) ) {
				entry.layerIds.push( scrim.id );
			}
		}
	}
	log( 'photo-scrim', v );
	return true;
}

/** Eine Reparaturrunde: gibt true zurück, wenn etwas geändert wurde. */
function repairOnce( compiled, report, round ) {
	const { layers, tokens, doc, markup } = compiled;
	const byId = new Map( layers.map( ( l ) => [ l.id, l ] ) );
	const elById = new Map( markup.elements.map( ( e ) => [ e.id, e ] ) );
	const margin = Math.round(
		Math.min( doc.w, doc.h ) * ( markup.grid?.margin ?? 0.06 )
	);
	let changed = false;
	// `margin` moves an ELEMENT, not a layer: a second violation for an
	// element already handled this round (e.g. a component's face AND its
	// label) is a no-op — see the `margin` branch below.
	const handledMarginEls = new Set();
	const log = ( action, v ) =>
		compiled.report.repairs.push( {
			round,
			code: v.code,
			el: v.el,
			action,
			layerId: v.layerId,
		} );
	// Geometrie zuerst (margin, overlap-text), damit ein Scrim beim finalen
	// Rechteck landet.
	const rank = ( code ) =>
		'margin' === code || 'overlap-text' === code ? 0 : 1;
	const ordered = [ ...report.violations ].sort(
		( a, b ) => rank( a.code ) - rank( b.code )
	);
	for ( const v of ordered ) {
		const layer = byId.get( v.layerId );
		const el = elById.get( v.el );
		if ( ! layer || ! el?.id || el.lock ) {
			continue;
		}
		if ( 'contrast' === v.code ) {
			const avgOf = () =>
				compiled.report.metrics?.contrast?.[ layer.id ]?.avgBg ||
				tokens.palette.bg;
			// (a) Die Farbe der Glyphen. Sie kostet nichts, sie veraendert
			// keine Geometrie, und sie ist bei einem Etikett auf eigener
			// Flaeche die EINZIGE Moeglichkeit (ein Verlauf zwischen
			// Flaeche und Schrift waere unsichtbar, einer darueber wuerde
			// die Flaeche zudecken).
			const next = bestOn( avgOf(), [
				tokens.palette.onAccent,
				tokens.palette.ink,
				tokens.palette.bg,
				'#ffffff',
				'#111111',
			] );
			if ( next && next !== layer.color ) {
				layer.color = next;
				log( 'recolor', v );
				changed = true;
				continue;
			}
			if ( labelOnFace( compiled, layer ) ) {
				continue;
			}
			// (b) Reicht die Farbe nicht, wird der GRUND dunkler - aber der
			// des Fotos, ueber dem der Text steht, nicht ein Balken hinter
			// der Zeile. Bis Stufe 2h legte die Reparatur je Text einen
			// eigenen Verlauf unter die Glyphen; in fast jedem erzeugten
			// Entwurf stand danach hinter jedem Text ein Streifen mit einem
			// Verlauf darin. Der Scrim eines Fotos ist dagegen Teil der
			// Sprache: er laeuft ueber die ganze Breite des Fotos, kommt
			// von der Seite des Textes und sieht aus wie eine Entscheidung.
			if ( darkenPhotoUnder( compiled, layer, log, v ) ) {
				changed = true;
			}
			// (c) Sonst bleibt die Verletzung stehen: kein Foto darunter
			// und keine Farbe, die traegt, heisst, der Text steht an der
			// falschen Stelle - das ist ein Entwurfsfehler, kein
			// Reparaturfall.
		} else if ( 'overflow' === v.code ) {
			const natural = naturalHeight( compiled, layer );
			const fits = layer.y + natural <= doc.h - margin;
			const grownRect = {
				x: layer.x,
				y: layer.y,
				w: layer.w,
				h: natural,
			};
			const collides =
				fits &&
				layers.some(
					( l ) =>
						'text' === l.type &&
						l !== layer &&
						intersects( grownRect, rectOf( l ) )
				);
			if ( fits && ! collides ) {
				const newH = Math.ceil( natural );
				if ( newH !== layer.h ) {
					layer.h = newH;
					log( 'grow', v );
					changed = true;
				}
			}
			// Sonst: keine Aktion — die Verletzung bleibt bestehen und
			// führt nach der Runde zu `rejected` (wie `min-size`).
		} else if ( 'margin' === v.code ) {
			if ( handledMarginEls.has( v.el ) ) {
				continue; // this element's unit already moved this round
			}
			handledMarginEls.add( v.el );
			// A violating layer is rarely alone: a component's face/label/
			// group (or a masked photo's image/mask/group) share one
			// `dm.el` and were built as one rigid shape — clamping each
			// independently (its own, different `layerOvershoot`) drifts
			// them apart and leaves the group's box (frozen at build time,
			// elements/component.js's relink()) stale. Move the whole
			// element by ONE delta, from the union of every layer sharing
			// its `dm.el` and the largest overshoot among them.
			const targets = elementUnit( layers, v.el, layer );
			const oMax = Math.max(
				...targets.map( ( l ) => paintOvershoot( l ) )
			);
			let union = unionRect( targets );
			let uw = union.x1 - union.x;
			let uh = union.y1 - union.y;
			// Passt das Element gar nicht erst in die Zone, hilft kein
			// Verschieben - dann wird es verkleinert (Stufe 2g). Nur, was
			// kein Text ist: einen Text kleiner zu ziehen ist die Aufgabe
			// des Fluid-Fits, und unter der Mindestgroesse waere er zwar
			// im Rahmen, aber nicht mehr lesbar.
			const room = {
				w: doc.w - 2 * ( margin + oMax ),
				h: doc.h - 2 * ( margin + oMax ),
			};
			if (
				( uw > room.w || uh > room.h ) &&
				'text' !== el.kind &&
				room.w > 1 &&
				room.h > 1
			) {
				const f = Math.min( room.w / uw, room.h / uh );
				// Unter einem Viertel ist nichts mehr zu retten: das waere
				// kein verkleinertes Element mehr, sondern ein Punkt.
				// Dann bleibt die Verletzung stehen und der Entwurf wird
				// abgelehnt - ehrlicher als eine Attrappe.
				if ( f >= 0.25 ) {
					scaleElement( targets, union, f );
					log( 'shrink', v );
					changed = true;
					union = unionRect( targets );
					uw = union.x1 - union.x;
					uh = union.y1 - union.y;
				}
			}
			const lo = margin + oMax;
			const hiX = doc.w - margin - oMax - uw;
			const hiY = doc.h - margin - oMax - uh;
			if ( hiX >= lo && hiY >= lo ) {
				const newX = Math.min( Math.max( union.x, lo ), hiX );
				const newY = Math.min( Math.max( union.y, lo ), hiY );
				const dx = newX - union.x;
				const dy = newY - union.y;
				if ( dx || dy ) {
					moveElement( targets, dx, dy );
					log( 'clamp', v );
					changed = true;
				}
			}
			// Sonst: die Sicherheitszone kann w+2o / h+2o nicht fassen —
			// keine Aktion, kein Log.
		} else if ( 'overlap-text' === v.code ) {
			const other = byId.get( v.other );
			if ( other ) {
				// Like `margin`: the ELEMENT moves. The violating layer of a
				// component is its LABEL — moving that alone slides the text
				// off its own face and out of the group's box.
				const targets = elementUnit( layers, v.el, layer );
				const oMax = Math.max(
					...targets.map( ( l ) => paintOvershoot( l ) )
				);
				const union = unionRect( targets );
				const dy = other.y + other.h + tokens.space.gap - layer.y;
				if ( union.y1 + dy + oMax <= doc.h - margin ) {
					moveElement( targets, 0, dy );
					log( 'move-below', v );
					changed = true;
				}
			}
		}
		// `overlap-decor`, `min-size`, `lines`: keine Reparatur (Stufe 1).
	}
	return changed;
}

export async function repairDesign( compiled, ctx = {} ) {
	let report = await verifyDesign( compiled, ctx );
	compiled.report.metrics = {
		...report.metrics,
		violations: report.violations,
	};
	for (
		let round = 0;
		round < MAX_ROUNDS && report.violations.length;
		round++
	) {
		if ( ! repairOnce( compiled, report, round + 1 ) ) {
			break;
		}
		report = await verifyDesign( compiled, ctx );
		compiled.report.metrics = {
			...report.metrics,
			violations: report.violations,
		};
	}
	compiled.status = report.violations.length ? 'rejected' : 'valid';
	return compiled;
}

/**
 * `sourceMap[el].rect` auf die Endgeometrie ziehen. Es startet als LAYOUT-
 * Rechteck; jede Reparatur (Rand geklemmt, Überlappung verschoben, Kasten
 * gewachsen) ließ es sonst auf einen Platz zeigen, an dem das Element nicht
 * mehr steht — und genau daraus lesen Prüfstand und Studio die Geometrie.
 */
function syncSourceRects( compiled ) {
	const byId = new Map(
		( compiled.layers || [] ).map( ( l ) => [ l.id, l ] )
	);
	for ( const entry of Object.values( compiled.sourceMap || {} ) ) {
		const main = byId.get( entry?.parts?.main );
		if ( main ) {
			entry.rect = { x: main.x, y: main.y, w: main.w, h: main.h };
		}
	}
}

export async function verifyAndRepair( compiled, ctx = {} ) {
	try {
		const out = await repairDesign( compiled, ctx );
		syncSourceRects( out );
		return out;
	} catch ( err ) {
		compiled.report.errors.push( {
			code: 'verify-error',
			message: String( ( err && err.message ) || err ),
		} );
		compiled.status = 'rejected';
		return compiled;
	}
}
