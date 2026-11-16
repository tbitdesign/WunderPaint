/**
 * The poster's text layers: which roles a poster carries, how each role
 * is set (size relative to the sheet, face, tracking, color), the layer
 * props the editor gets, and - when a poster is edited again - which
 * layers to patch, add or remove.
 *
 * Every managed text layer carries `mystic: { role, auto }`, where auto
 * is what the studio wrote last time. A layer whose text, face or color
 * differs from its auto values was edited by hand, and that edit wins
 * over the recomputed value. Pure, so it is tested without a browser.
 */

import { foilFrom, mix } from './themes.js';
import { titleFontOf } from './looks.js';

export const TEXT_ROLES = [
	'title',
	'subtitle',
	'keywords',
	'meaning',
	'message',
	'data',
];

/** Layer names (msgids) per role. */
export const ROLE_LABELS = {
	title: 'Title',
	subtitle: 'Subtitle',
	keywords: 'Keywords',
	meaning: 'Meaning',
	message: 'Message',
	data: 'Chart data',
};

const clamp = ( v, lo, hi ) => Math.max( lo, Math.min( hi, v ) );

/**
 * How a role is set on a sheet whose short side is u px.
 *
 * @param {string} role Role key.
 * @param {number} u    Short side of the sheet.
 * @param {Object} p    Parameters (titleFont, textFont, titleScale, textScale).
 * @return {Object} { size, family, weight, lineHeight, spacing, maxWidth,
 *   place, optional, upper }.
 */
export function roleStyle( role, u, p = {} ) {
	const title = titleFontOf( p.titleFont || 'Cinzel' );
	const text = p.textFont || 'Inter';
	const ts = clamp( p.titleScale ?? 1, 0.5, 1.8 );
	const xs = clamp( p.textScale ?? 1, 0.6, 1.6 );
	switch ( role ) {
		case 'title': {
			const size = u * 0.078 * ts;
			return {
				size,
				family: title.family,
				weight: title.weight,
				lineHeight: 1.1,
				spacing: size * title.track,
				maxWidth: 0.94,
				place: 'top',
				tight: true,
			};
		}
		case 'subtitle': {
			const size = u * 0.023 * xs;
			return {
				size,
				family: text,
				weight: 500,
				lineHeight: 1.55,
				spacing: size * 0.16,
				maxWidth: 0.92,
				place: 'top',
				upper: true,
			};
		}
		case 'keywords': {
			const size = u * 0.02 * xs;
			return {
				size,
				family: text,
				weight: 600,
				lineHeight: 1.6,
				spacing: size * 0.2,
				maxWidth: 0.86,
				place: 'bottom',
				optional: true,
				upper: true,
			};
		}
		case 'meaning': {
			const size = u * 0.026 * xs;
			return {
				size,
				family: text,
				weight: 400,
				lineHeight: 1.45,
				spacing: 0,
				maxWidth: 0.76,
				place: 'bottom',
				optional: true,
			};
		}
		case 'message': {
			const size = u * 0.032 * xs;
			return {
				size,
				family: text,
				weight: 400,
				lineHeight: 1.4,
				spacing: 0,
				maxWidth: 0.8,
				place: 'bottom',
			};
		}
		default: {
			const size = u * 0.0165 * xs;
			return {
				size,
				family: text,
				weight: 400,
				lineHeight: 1.6,
				spacing: size * 0.04,
				maxWidth: 0.94,
				place: 'bottom',
				optional: true,
			};
		}
	}
}

/**
 * The ordered text blocks of a poster.
 *
 * @param {Object} texts From cardTexts(): title, subtitle, keywords,
 *                       meaning, data.
 * @param {Object} p     Parameters (toggles, titleText, message, fonts).
 * @param {number} u     Short side of the sheet.
 * @param {string} mode  Resolved layout mode.
 * @return {Array} Blocks for layoutPoster().
 */
export function buildBlocks( texts, p, u, mode ) {
	if ( 'art' === mode ) {
		return [];
	}
	const minimal = 'minimal' === mode;
	const want = {
		title: p.withTitle !== false,
		subtitle: p.withSubtitle !== false,
		keywords: ! minimal && p.withKeywords !== false,
		meaning: ! minimal && p.withMeaning !== false,
		message: true,
		data: ! minimal && !! p.withData,
	};
	const source = {
		title: String( p.titleText || '' ).trim() || texts.title || '',
		subtitle: texts.subtitle || '',
		keywords: texts.keywords || '',
		meaning: texts.meaning || '',
		message: String( p.message || '' ).trim(),
		data: texts.data || '',
	};
	return TEXT_ROLES.filter( ( r ) => want[ r ] && source[ r ] ).map(
		( role ) => {
			const st = roleStyle( role, u, p );
			const text = st.upper
				? source[ role ].toUpperCase()
				: source[ role ];
			return { role, text, autoText: text, ...st };
		}
	);
}

/** The first managed layer per role. */
function byRole( layers ) {
	const out = {};
	for ( const l of layers || [] ) {
		const role = l && l.mystic && l.mystic.role;
		if ( role && TEXT_ROLES.includes( role ) && ! out[ role ] ) {
			out[ role ] = l;
		}
	}
	return out;
}

/** Whether a managed layer's color was changed by hand. */
function colorEdited( layer ) {
	const a = ( layer.mystic && layer.mystic.auto ) || {};
	return (
		String( layer.color || '' ).toLowerCase() !==
			String( a.color || '' ).toLowerCase() ||
		( layer.fillType || 'solid' ) !== ( a.fillType || 'solid' )
	);
}

/**
 * Carry hand edits of the existing layers into the new blocks, BEFORE the
 * layout runs, so an edited title is measured as it will stand.
 *
 * @param {Array} blocks   From buildBlocks().
 * @param {Array} existing The poster's current text layers.
 * @return {Array} Blocks with text/family replaced where edited, and
 *   keepColor set where the color was edited.
 */
export function keepEdits( blocks, existing ) {
	const map = byRole( existing );
	return blocks.map( ( b ) => {
		const l = map[ b.role ];
		const auto = l && l.mystic && l.mystic.auto;
		if ( ! auto ) {
			return b;
		}
		const out = { ...b, autoText: b.text, autoFamily: b.family };
		if ( 'string' === typeof l.text && l.text !== auto.text ) {
			out.text = l.text;
		}
		if ( l.fontFamily && l.fontFamily !== auto.fontFamily ) {
			out.family = l.fontFamily;
			out.weight = l.weight || out.weight;
		}
		if ( colorEdited( l ) ) {
			out.keepColor = true;
		}
		return out;
	} );
}

/** The color a role is written in. */
export function roleColor( role, theme ) {
	if ( 'title' === role || 'keywords' === role ) {
		return theme.accent;
	}
	if ( 'subtitle' === role || 'data' === role ) {
		return theme.muted;
	}
	return theme.ink;
}

/**
 * The title foil as gradient stops. On light paper the bright stops of a
 * metal foil vanish into the sheet, so there the foil is pulled towards
 * the ink until every stop still reads.
 *
 * @param {Object} theme Resolved theme.
 * @return {Array} [ { color, at } ].
 */
export function foilStops( theme ) {
	const foil = theme.foil || foilFrom( theme.accent );
	return foil.map( ( c, i ) => ( {
		color: theme.dark ? c : mix( c, theme.ink, 0.38 ),
		at: i / ( foil.length - 1 ),
	} ) );
}

/**
 * Props for one text layer (makeText input, plus the `mystic` record).
 *
 * @param {Object} b     Laid-out block (x, y, w, h, lines, align ...).
 * @param {Object} theme Resolved theme.
 * @param {Object} p     Parameters (titleFoil).
 * @param {string} name  Layer name.
 * @return {Object} Props.
 */
export function textLayerProps( b, theme, p, name ) {
	const color = roleColor( b.role, theme );
	const foil = 'title' === b.role && !! p.titleFoil;
	const stops = foil ? foilStops( theme ) : null;
	const props = {
		name,
		text: b.text,
		x: b.x,
		y: b.y,
		w: b.w,
		h: b.h,
		fontSize: b.size,
		fontFamily: b.family,
		weight: b.weight,
		align: b.align || 'center',
		letterSpacing: b.spacing || 0,
		lineHeight: b.lineHeight,
		fixedWidth: true,
		mystic: {
			role: b.role,
			auto: {
				text: b.autoText ?? b.text,
				fontFamily: b.autoFamily ?? b.family,
				color,
				fillType: foil ? 'gradient' : 'solid',
			},
		},
	};
	if ( ! b.keepColor ) {
		props.color = color;
		props.fillType = foil ? 'gradient' : 'solid';
		props.gradientStops = stops;
		props.gradientAngle = foil ? 12 : 0;
	}
	return props;
}

/**
 * What an update does to the poster's text layers.
 *
 * @param {Array} existing Current managed text layers (with ids).
 * @param {Array} next     textLayerProps() of the new layout.
 * @return {{ patches: Array, adds: Array, removes: Array }} patches are
 *   { id, patch }, adds are props, removes are layer ids.
 */
export function planUpdate( existing, next ) {
	const map = byRole( existing );
	const patches = [];
	const adds = [];
	const seen = new Set();
	for ( const props of next ) {
		const role = props.mystic.role;
		seen.add( role );
		const l = map[ role ];
		if ( ! l ) {
			adds.push( props );
			continue;
		}
		// The layer keeps the name the user may have given it.
		const { name, ...patch } = props;
		patches.push( { id: l.id, patch } );
	}
	const removes = Object.keys( map )
		.filter( ( role ) => ! seen.has( role ) )
		.map( ( role ) => map[ role ].id );
	return { patches, adds, removes };
}
