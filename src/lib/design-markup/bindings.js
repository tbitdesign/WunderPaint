import { bindingValue, resolveBindings } from '../dynamic-content';

/**
 * Der Vorschau-Wert EINER Bindung, oder '' wenn es keinen gibt (kein
 * `bind`, kein Vorschau-Kontext, leeres Feld).
 *
 * Die eine Stelle, an der aus einem gebundenen Element sein Vorschau-Text
 * wird: `compileDesign()` MISST damit (sonst bekommt ein 240 Zeichen langer
 * WordPress-Auszug den Kasten, den der Autor für sein 53 Zeichen langes
 * Beispiel entworfen hat, und der Fluid-Fit schrumpft ihn unter die
 * Lesbarkeitsgrenze), und `applyBindings()` MALT damit. Zwei Aufrufer, eine
 * Antwort - ein Kasten kann nie für einen anderen Text gesetzt worden sein
 * als den, der darin landet.
 *
 * @param {Object} el             Markup-Element (`bind`, `content`/`props.label`).
 * @param {Object} previewContext Vorschau-Kontext (`dynamic-content.js`).
 * @return {string} Vorschau-Wert oder ''.
 */
export function bindingPreview( el, previewContext ) {
	if ( ! el?.bind?.id || ! previewContext ) {
		return '';
	}
	return bindingValue( el.bind.id, previewContext ) || '';
}

/**
 * Bindungen aus dem Markup auf die gebauten Ebenen: Text und Komponenten-
 * Label bekommen `binding` + Fluid Fit, Fotos `binding` auf der Bildebene.
 * Ein Vorschau-Kontext ersetzt den Beispieltext, damit Layout und Prüfung
 * mit echtem Inhalt laufen.
 */
export function applyBindings( layers, sourceMap, markup, ctx = {} ) {
	const byId = new Map( layers.map( ( l ) => [ l.id, l ] ) );
	for ( const el of markup.elements ) {
		if ( ! el.bind ) {
			continue;
		}
		const parts = sourceMap[ el.id ]?.parts || {};
		if ( 'photo' === el.kind ) {
			const image = byId.get( parts.image || parts.main );
			if ( image ) {
				image.binding = el.bind.id;
			} else if ( parts.smart ) {
				// Treated photos wrap the image (+ mask/group) in a smart
				// hull (buildPhoto, Task 5): the top-level layer is the
				// smart object and the image only lives inside its
				// embedded layers, still under the id `parts.image`
				// names. The editor resolves bindings inside embedded
				// layers too (dynamic smart objects, dynamic-content.js
				// ~577-660), so bind the nested image instead.
				const smart = byId.get( parts.smart );
				const embedded = smart?.embedded?.layers?.find(
					( l ) => l.id === parts.image
				);
				if ( embedded ) {
					embedded.binding = el.bind.id;
				}
			}
			continue;
		}
		const text = byId.get(
			'component' === el.kind ? parts.label : parts.main
		);
		if ( ! text || 'text' !== text.type ) {
			continue;
		}
		text.binding = el.bind.id;
		text.fixedWidth = true;
		// `bind.fit` is in the schema and the cleaner; this line used to
		// overwrite it with fluid every time. "shrink" is the classic
		// bound text: fixed size, shrunk into its box when the value runs
		// long.
		text.textFit = 'shrink' === el.bind.fit ? null : 'fluid';
		const value = bindingPreview( el, ctx.previewContext );
		if ( value ) {
			text.text = value;
		}
	}
	return layers;
}

/** Aufgelöste Kopie für Vorschau und Prüfung; die gebundenen Originale bleiben. */
export function previewResolve( layers, ctx = {} ) {
	if ( ! ctx.previewContext ) {
		return layers;
	}
	return resolveBindings(
		layers.map( ( l ) => ( { ...l } ) ),
		ctx.previewContext
	);
}
