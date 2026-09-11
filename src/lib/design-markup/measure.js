import { makeText } from '../../store/document';
import { fitTextLayout } from '../text-fit';
import { measureTextHeight, measureTextWidth } from '../raster';
import { maxLinesFor } from './catalog';

/**
 * Die natürliche Blockhöhe eines Textes in der NENNGRÖSSE seiner Stimme:
 * so hoch wird er, wenn ihn niemand skaliert. Ohne Deckel - aus dieser
 * Zahl wird der Kasten gerechnet, nicht andersherum.
 *
 * @param {Object} args        Argumente.
 * @param {string} args.text   Der Text, der gemessen wird.
 * @param {number} args.w      Kastenbreite in Pixeln.
 * @param {Object} args.voice  Aufgelöste Stimme.
 * @param {boolean} args.upper Versalien am Element erzwungen.
 * @return {number} Blockhöhe in Pixeln.
 */
export function naturalTextHeight( { text, w, voice, upper = false } ) {
	const probe = makeText( {
		text: text || ' ',
		x: 0,
		y: 0,
		w: Math.max( 1, Math.round( w ) ),
		h: Math.max( 1, Math.round( voice.sizePx * voice.lineHeight ) ),
		fontFamily: voice.fontFamily,
		weight: voice.weight,
		fontSize: voice.sizePx,
		lineHeight: voice.lineHeight,
		letterSpacing: Math.round( voice.sizePx * voice.tracking ),
		fixedWidth: true,
		...( upper || voice.upper ? { textTransform: 'uppercase' } : {} ),
	} );
	return Math.ceil( measureTextHeight( probe ) );
}

/**
 * Die Kastenhöhe (`hMax`) eines Textelements: Zeilenzahl mal Stufe mal
 * Zeilenhöhe. Gebundene Texte rechnen mit dem Zeilen-Budget ihrer Stimme
 * (`maxLinesFor`, catalog.js) statt mit den Zeilen des Beispiels - siehe
 * dort, warum.
 *
 * Das Budget ist eine OBERGRENZE, kein Anspruch: ein Fluid-Text füllt jeden
 * Kasten, den er bekommt, und ein kurzer Vorschau-Wert im Kasten für vier
 * Zeilen wird dadurch riesig gesetzt (im Bogen von Stufe 1b: die zweite
 * Zeile der Subline mit 134 px, doppelt so groß wie die Schlagzeile
 * darüber). Kennt der Aufrufer den Inhalt und die Breite (`fitTo`), wächst
 * der Kasten deshalb nur so weit, wie der Inhalt ihn braucht: so viele
 * Zeilen, wie der Text in seiner Nenngröße wirklich umbricht, plus eine
 * Zeile Luft, gedeckelt vom Budget. Ein echter 240-Zeichen-Auszug bekommt
 * damit weiter das ganze Budget.
 *
 * Gerechnet wird in ganzen Zeilen, nicht in Pixeln: `measureTextHeight`
 * rundet auf und hat einen eigenen Mindestboden (`fontSize * 1.3`), und ein
 * halbes Pixel Rest würde sonst reichen, damit der Kasten eines einzeiligen
 * Textes über dem des Autors liegt.
 *
 * @param {Object} el      Markup-Element (`lines`, `voice`, `bind`).
 * @param {Object} voice   Aufgelöste Stimme (`sizePx`, `lineHeight`).
 * @param {Object} [fitTo] Inhalt für gebundene Texte: `{ text, w }`.
 * @return {number} Kastenhöhe in Pixeln.
 */
export function textBoxHeight( el, voice, fitTo = null ) {
	const unit = voice.sizePx * voice.lineHeight;
	const budget = maxLinesFor( el );
	if ( ! el?.bind?.id || ! fitTo?.w ) {
		return budget * unit;
	}
	const natural = naturalTextHeight( {
		text: fitTo.text,
		w: fitTo.w,
		voice,
		upper: el.upper,
	} );
	const needed = Math.max( 1, Math.round( natural / unit ) );
	return Math.min( budget, needed + 1 ) * unit;
}

/**
 * Höhe eines Textblocks für das Layout. Fluid: die Box (w, hMax) setzt
 * Zeilen und Größen, `block` ist die genutzte Höhe. Fixed: Stimmengröße,
 * Umbruch an w, Höhe gemessen.
 */
export function measureTextBlock( {
	text,
	w,
	hMax,
	voice,
	upper = false,
	fit = 'fluid',
} ) {
	const common = {
		text: text || ' ',
		x: 0,
		y: 0,
		w: Math.max( 1, Math.round( w ) ),
		h: Math.max( 1, Math.round( hMax ) ),
		fontFamily: voice.fontFamily,
		weight: voice.weight,
		fontSize: voice.sizePx,
		lineHeight: voice.lineHeight,
		letterSpacing: Math.round( voice.sizePx * voice.tracking ),
		fixedWidth: true,
		...( upper || voice.upper ? { textTransform: 'uppercase' } : {} ),
	};
	if ( 'fixed' === fit ) {
		const probe = makeText( common );
		const h = Math.ceil( measureTextHeight( probe ) );
		return {
			h: Math.min( h, common.h ),
			lines: Math.max(
				1,
				Math.round( h / ( voice.sizePx * voice.lineHeight ) )
			),
			minSize: voice.sizePx,
			scaled: h > common.h,
		};
	}
	const probe = makeText( { ...common, textFit: 'fluid' } );
	const fitted = fitTextLayout( probe );
	const sizes = fitted.lines.map( ( l ) => l.s ).filter( ( s ) => s > 0 );
	return {
		h: Math.min( common.h, Math.ceil( fitted.block ) || common.h ),
		lines: fitted.lines.length,
		minSize: sizes.length ? Math.min( ...sizes ) : 0,
		scaled: !! fitted.scaled,
	};
}

/**
 * Fußabdruck einer Komponente vor dem Bau (Button/Chip aus design-composer).
 * `doc` ist optional (Bestandsaufrufe ohne Canvas-Maße fallen auf `docMin`
 * zurück); ist es da, muss dieselbe `sizeRef`-Formel wie in
 * `elements/component.js` gelten, sonst weicht der Layout-Slot von der
 * tatsächlich gebauten Komponente ab.
 */
export function measureComponent( el, tokens, doc ) {
	const docMin = tokens.docMin;
	const sizeRef = doc
		? Math.max( docMin, Math.round( 0.7 * doc.w ) )
		: docMin;
	if ( 'button' === el.type ) {
		const h = Math.min(
			112,
			Math.max( 44, Math.round( sizeRef * 0.072 ) )
		);
		return { w: Math.round( h * 4.2 ), h };
	}
	if ( 'chip' === el.type ) {
		// Same multiplier and clamp as badgeComponent() (design-composer.js):
		// `clamp( round( sizeRef * 0.045 ), 26, 64 )` - and the same width
		// rule, label plus padding. The layout used to guess a fixed 2.6 h
		// while the builder sized by the label, so a long chip overlapped
		// its neighbours. Capped at 80 percent of the canvas.
		const h = Math.min( 64, Math.max( 26, Math.round( sizeRef * 0.045 ) ) );
		const fontSize = Math.round( h * 0.42 );
		const label = String( el.props?.label ?? 'NEW' );
		const labelW = measureTextWidth( {
			type: 'text',
			text: label,
			fontSize,
			fontFamily: 'Inter',
			weight: 700,
			letterSpacing: Math.round( fontSize * 0.06 ),
		} );
		const cap = doc ? Math.round( doc.w * 0.8 ) : Math.round( h * 12 );
		return { w: Math.min( cap, Math.round( labelW + h * 1.05 ) ), h };
	}
	return { w: 0, h: 0 };
}
