import { makeText } from '../../../store/document';
import { ROLES, cleanTextLook } from '../../text-look';
import { roleColor, applyCommon } from './common';

const LOOK_RULE = {
	salient: 'salient',
	number: 'number',
	longest: 'longest',
	word: 'salient',
};

export function buildText( el, rect, ctx ) {
	const voice = ctx.tokens.type.voices[ el.voice ];
	const palette = ctx.tokens.palette;
	const upper = el.upper || voice.upper;
	const layer = makeText( {
		name:
			el.name && el.id !== el.name ? el.name : el.content.slice( 0, 30 ),
		...rect,
		text: el.content,
		fontFamily: voice.fontFamily,
		weight: voice.weight,
		fontSize: voice.sizePx,
		lineHeight: voice.lineHeight,
		letterSpacing: Math.round( voice.sizePx * voice.tracking ),
		color: roleColor( el.fill, palette ),
		align: el.align,
		fixedWidth: true,
		...( upper ? { textTransform: 'uppercase' } : {} ),
		...( 'fluid' === el.fit ? { textFit: 'fluid' } : {} ),
		...( el.chip
			? {
					bgColor: roleColor( el.chip, palette ),
					bgRadius: ctx.tokens.space.radius,
			  }
			: {} ),
	} );
	if ( el.emph && 'fluid' === el.fit ) {
		// cleanTextLook() needs `roles` and an emph.style OBJECT (relSize/
		// family/weight/italic/underline/color) — the markup's emph.style is
		// one of the catalog's EMPH_STYLES strings ('accent' | 'italic'), so
		// it is translated into the field cleanEmph() actually reads.
		//
		// Every role carries THIS layer's face. A role left out falls back to
		// cleanTextLook()'s own default (Inter 700, text-look.js), and at
		// paint time the role's face wins over the layer's (text-fit.js's
		// measureWords) — the pairing would be measured in Anton/Playfair by
		// measure.js and painted in Inter. The look here is only about roles
		// and emphasis, never about the typeface: same family, same weight,
		// same tracking as the layer, and no relSize on a role.
		const style =
			'italic' === el.emph.style ? { italic: true } : { color: 'accent' };
		const face = {
			family: voice.fontFamily,
			weight: voice.weight,
			ls: layer.letterSpacing / ( layer.fontSize || 16 ),
		};
		const look = cleanTextLook( {
			assign: 'auto',
			roles: Object.fromEntries( ROLES.map( ( r ) => [ r, face ] ) ),
			accent: palette.accent,
			emph: { rule: LOOK_RULE[ el.emph.rule ], style },
		} );
		if ( look ) {
			layer.textLook = look;
		}
	}
	applyCommon( layer, el, 'main', ctx );
	return { layers: [ layer ], parts: { main: layer.id } };
}
