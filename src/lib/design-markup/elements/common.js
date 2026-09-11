import { dmId } from '../ids';
import { PALETTE_ROLES } from '../catalog';

/** Rollenname -> Hex aus der Palette; Hex bleibt Hex. */
export function roleColor( value, palette ) {
	if ( PALETTE_ROLES.includes( value ) ) {
		return palette[ value ];
	}
	return value;
}

/** Rollenfarben in einem Stil-Objekt (dropShadow, outerGlow, …) auflösen. */
function stylesWithColors( styles, palette ) {
	const out = {};
	for ( const [ key, style ] of Object.entries( styles || {} ) ) {
		if ( ! style || 'object' !== typeof style ) {
			continue;
		}
		out[ key ] = { ...style };
		for ( const f of [ 'color', 'color2', 'highlight', 'shadow' ] ) {
			if ( 'string' === typeof style[ f ] ) {
				out[ key ][ f ] = roleColor( style[ f ], palette );
			}
		}
	}
	return Object.keys( out ).length ? out : null;
}

/**
 * Gemeinsame Felder nach dem Fabrikaufruf: deterministische ID, Name,
 * Deckkraft, Blendmodus, Drehung, Stile, Source-Map-Marke.
 */
export function applyCommon( layer, el, part, ctx ) {
	layer.id = dmId( el.id, part );
	if ( 'main' === part ) {
		// clean.js always fills `name` (defaults to the element id), so an
		// unnamed element cannot be told apart from one just by "is it set".
		// Only an EXPLICIT name (different from the id) may override the
		// builder's own default (content preview, 'Background', …).
		if ( el.name && el.id !== el.name ) {
			layer.name = el.name;
		}
		layer.opacity = el.opacity;
		layer.blend = el.blend;
		layer.rot = el.rot;
		if ( el.styles ) {
			layer.styles = stylesWithColors( el.styles, ctx.tokens.palette );
		}
	}
	layer.dm = { el: el.id, part };
	return layer;
}
