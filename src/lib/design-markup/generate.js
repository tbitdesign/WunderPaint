import { __ } from '@wordpress/i18n';
import { ai } from '../api';
import { compileDesign } from './compile';
import { contextFromEditor } from './editor-ctx';
import { insertDesign } from './insert';

/**
 * Ist das ein Fehler der QUELLE (Schlüssel fehlt, Schlüssel gilt hier
 * nicht, Zugriff verweigert) - und wenn ja, wie lautet er wörtlich?
 *
 * Warum das eine eigene Klasse ist: auf dev antwortet der OpenAI-Schlüssel
 * mit `ip_not_authorized`, und als geworfener Fehler sah das in der Konsole
 * aus wie "das Modell hat nichts geliefert". Ein solcher Satz gehört
 * unverändert zurück an den Aufrufer, mit dem Namen der Quelle daneben;
 * alles andere (leere Antwort, Zeitüberschreitung, Fehler im Compiler)
 * fliegt weiter wie bisher.
 *
 * @param {Object} err Fehler aus `ai.designMarkup`.
 * @return {?string} Die Meldung der Quelle, sonst null.
 */
function providerRefusal( err ) {
	const status = Number( err?.status ) || 0;
	const text = `${ err?.code || '' } ${ err?.message || '' }`;
	if (
		401 === status ||
		403 === status ||
		err?.isAuth ||
		err?.isUnconfigured ||
		/ip_not_authorized|unauthorized|not authorized|forbidden|api[ _-]?key|wpie_ai_(auth|unconfigured)/i.test(
			text
		)
	) {
		return String( err?.message || '' );
	}
	return null;
}

/**
 * Design Markup, Stufe 2a: Brief rein, fertige Ebenen raus.
 *
 * Der ganze Weg an einer Stelle - Kontext aus dem offenen Editor, ein
 * Modellaufruf (`ai.designMarkup`, Serveraktion `design_markup`), jedes
 * zurückgegebene Markup durch denselben Compiler wie ein Fixture, und der
 * erste gültige Entwurf ins Dokument.
 *
 * Zurück kommt ALLES, auch das rohe Markup eines abgelehnten Entwurfs:
 * ohne Oberfläche ist die Konsole die einzige Stelle, an der jemand
 * nachsehen kann, warum ein Entwurf nicht gehalten hat, und dafür braucht
 * er den Text, den das Modell wirklich geschrieben hat - nicht nur den
 * Report darüber.
 *
 * Kompiliert wird nacheinander, nicht mit `Promise.all`: die Textmessung
 * läuft über eine Leinwand und über geladene Schriften, und vier Entwürfe
 * gleichzeitig zu messen macht nichts schneller, nur den Hauptfaden
 * länger unbedienbar (Spezifikation Abschnitt 13).
 *
 * @param {Object} editor     Editor-Kontext (`state`, `dispatch`, `commit`).
 * @param {string} brief      Der Auftrag in Worten.
 * @param {Object} [opts]     Optionen.
 * @param {number} [opts.k]   Wie viele Entwürfe (1..4, Server deckelt).
 * @param {boolean} [opts.insert] `false` = nichts einfügen, nur liefern.
 * @param {string} [opts.provider] `anthropic` | `openai` | `gemini`. Ohne
 *                            Angabe wählt der Server (Voreinstellung, sonst
 *                            die erste konfigurierte Quelle) - und wenn
 *                            deren Schlüssel auf andere IPs beschränkt ist,
 *                            endet der ganze Lauf an einer 401.
 * @param {Object} [opts.ctx] Zusätzliche Compiler-Kontextfelder (`verify`,
 *                            `render`, `loadFonts`), die den aus dem Editor
 *                            gelesenen Kontext überschreiben. Für die
 *                            Konsole und die Tests; das Studio braucht sie
 *                            nicht.
 * @return {Promise<{designs: Array, inserted: number, error?: string}>}
 *         Entwürfe und die Zahl der eingefügten Ebenen; `error` steht drin,
 *         wenn die Quelle selbst abgelehnt hat.
 */
export async function generateDesigns( editor, brief, opts = {} ) {
	// Vorrang wie bei `previewOptsFor`: ein vom Aufrufer genannter
	// `previewContext` gewinnt, sonst holt `contextFromEditor` den Beitrag
	// zu `previewPostId`. Ohne beides wird mit dem Beispiel des Modells
	// gemessen, und die Bindungen zeigen genau das.
	const ctx = {
		...( await contextFromEditor( editor, opts ) ),
		...( opts.ctx || {} ),
	};
	// Bindungen kommen als Zeilen (`bindingGroups()`) ODER als blanke IDs
	// aus der Konsole. `validateMarkup` liest `b.id`, und eine blanke ID
	// ergäbe dort die Pflichtbindung "undefined" - eine Ablehnung, die nach
	// einem Fehler des Modells aussieht. Deshalb wird hier einmal
	// vereinheitlicht: Zeilen für den Compiler, IDs für den Server.
	ctx.bindings = ( ctx.bindings || [] )
		.map( ( b ) => ( 'string' === typeof b ? { id: b } : b ) )
		.filter( ( b ) => b && b.id );
	const { w, h } = ctx.doc;
	// "No image" has to reach the model, not only the asset resolver. Stopping
	// the fetch (editor-ctx.js) keeps the quota safe, but the draft still comes
	// back built around a photo that then is not there. Saying it up front gets
	// a layout that was meant to work without one.
	const brief_ =
		'none' === ctx.imageMode
			? `${ brief }\n\nUse NO photographic or illustrative image elements at all. Build the layout from type, colour and shapes only.`
			: brief;
	let res;
	try {
		res = await ai.designMarkup( {
			brief: brief_,
			w,
			h,
			k: opts.k || 1,
			brand: ctx.brand || undefined,
			product: opts.product || undefined,
			lang: opts.lang || undefined,
			bindings: ctx.bindings.map( ( b ) => b.id ),
			image: opts.image || undefined,
			variation: opts.variation || undefined,
			provider: opts.provider || undefined,
		} );
	} catch ( err ) {
		const refusal = providerRefusal( err );
		if ( ! refusal ) {
			throw err;
		}
		// eslint-disable-next-line no-console
		console.warn(
			`WPIE design markup: the text provider ${
				opts.provider || '(server default)'
			} refused the request: ${ refusal }`
		);
		return {
			designs: [],
			inserted: 0,
			error: refusal,
			errorCode: err?.code || '',
		};
	}
	const markups = Array.isArray( res?.designs ) ? res.designs : [];
	if ( ! markups.length ) {
		throw new Error(
			__(
				'The design response was empty. Please try again.',
				'wunderpaint'
			)
		);
	}

	const designs = [];
	for ( const markup of markups ) {
		const compiled = await compileDesign( markup, ctx );
		designs.push( {
			markup,
			compiled,
			status: compiled.status,
			report: compiled.report,
		} );
	}

	let inserted = 0;
	if ( false !== opts.insert ) {
		const first = designs.find( ( d ) => 'valid' === d.status );
		if ( first ) {
			inserted = await insertDesign( editor, first.compiled );
		}
	}
	return { designs, inserted };
}
