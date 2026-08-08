/**
 * The character set the user draws, and the rules that build everything
 * else from it.
 *
 * Two ideas keep the work small. First, accented characters are never
 * drawn: the plain letters plus six accent marks are enough to compose
 * every accented character the editor's six languages need. Second, the
 * dotless i and j are derived from the drawn i and j by dropping the
 * tittle, so nobody has to draw a letter they have never seen written
 * on its own.
 */

/** Everything is designed on this em square. */
export const UNITS_PER_EM = 1000;

/** Keys of the six accent marks (not characters, so never encoded). */
export const MARKS = [
	'mark:acute',
	'mark:grave',
	'mark:circumflex',
	'mark:tilde',
	'mark:diaeresis',
	'mark:cedilla',
];

/** Human labels for the marks (translated at the UI boundary). */
export const MARK_LABELS = {
	'mark:acute': 'Acute',
	'mark:grave': 'Grave',
	'mark:circumflex': 'Circumflex',
	'mark:tilde': 'Tilde',
	'mark:diaeresis': 'Diaeresis',
	'mark:cedilla': 'Cedilla',
};

const chars = ( s ) => Array.from( s );

/**
 * The drawable groups, in the order they appear in the overview.
 *
 * `required` groups gate the "font is usable" state; the rest may stay
 * empty and simply do not end up in the file.
 */
export const GROUPS = [
	{
		id: 'upper',
		label: 'Capitals',
		required: true,
		items: chars( 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' ),
	},
	{
		id: 'lower',
		label: 'Lowercase',
		required: true,
		items: chars( 'abcdefghijklmnopqrstuvwxyz' ),
	},
	{
		id: 'digits',
		label: 'Numbers',
		required: true,
		items: chars( '0123456789' ),
	},
	{
		id: 'punct',
		label: 'Punctuation',
		required: true,
		items: chars( '.,:;!?\'"()-/' ),
	},
	{
		id: 'marks',
		label: 'Accents',
		required: false,
		items: MARKS.slice(),
	},
	{
		id: 'letters2',
		label: 'Extra letters',
		required: false,
		items: chars( 'ßæœı' ),
	},
	{
		id: 'punct2',
		label: 'More punctuation',
		required: false,
		items: chars( '&@#%+=*_[]{}<>«»¡¿…–—$€£§©®°' ),
	},
];

/** Every drawable key, in overview order. */
export const ALL_KEYS = GROUPS.reduce(
	( acc, g ) => acc.concat( g.items ),
	[]
);

/** Keys that must exist before a font can be built. */
export const REQUIRED_KEYS = GROUPS.filter( ( g ) => g.required ).reduce(
	( acc, g ) => acc.concat( g.items ),
	[]
);

/**
 * Composed characters: base letter plus one mark.
 *
 * `over` marks sit above the base and are pushed up so they clear it;
 * `under` marks hang below the baseline. The dotless flag says the base
 * loses its tittle first, which is what makes í and ì look right.
 */
const OVER = ( base, mark, dotless = false ) => ( {
	base,
	mark,
	pos: 'over',
	dotless,
} );
const UNDER = ( base, mark ) => ( { base, mark, pos: 'under' } );

export const COMPOSED = {
	// Grave
	'À': OVER( 'A', 'mark:grave' ),
	'È': OVER( 'E', 'mark:grave' ),
	'Ì': OVER( 'I', 'mark:grave' ),
	'Ò': OVER( 'O', 'mark:grave' ),
	'Ù': OVER( 'U', 'mark:grave' ),
	'à': OVER( 'a', 'mark:grave' ),
	'è': OVER( 'e', 'mark:grave' ),
	'ì': OVER( 'i', 'mark:grave', true ),
	'ò': OVER( 'o', 'mark:grave' ),
	'ù': OVER( 'u', 'mark:grave' ),
	// Acute
	'Á': OVER( 'A', 'mark:acute' ),
	'É': OVER( 'E', 'mark:acute' ),
	'Í': OVER( 'I', 'mark:acute' ),
	'Ó': OVER( 'O', 'mark:acute' ),
	'Ú': OVER( 'U', 'mark:acute' ),
	'Ý': OVER( 'Y', 'mark:acute' ),
	'á': OVER( 'a', 'mark:acute' ),
	'é': OVER( 'e', 'mark:acute' ),
	'í': OVER( 'i', 'mark:acute', true ),
	'ó': OVER( 'o', 'mark:acute' ),
	'ú': OVER( 'u', 'mark:acute' ),
	'ý': OVER( 'y', 'mark:acute' ),
	// Circumflex
	'Â': OVER( 'A', 'mark:circumflex' ),
	'Ê': OVER( 'E', 'mark:circumflex' ),
	'Î': OVER( 'I', 'mark:circumflex' ),
	'Ô': OVER( 'O', 'mark:circumflex' ),
	'Û': OVER( 'U', 'mark:circumflex' ),
	'â': OVER( 'a', 'mark:circumflex' ),
	'ê': OVER( 'e', 'mark:circumflex' ),
	'î': OVER( 'i', 'mark:circumflex', true ),
	'ô': OVER( 'o', 'mark:circumflex' ),
	'û': OVER( 'u', 'mark:circumflex' ),
	// Tilde
	'Ã': OVER( 'A', 'mark:tilde' ),
	'Ñ': OVER( 'N', 'mark:tilde' ),
	'Õ': OVER( 'O', 'mark:tilde' ),
	'ã': OVER( 'a', 'mark:tilde' ),
	'ñ': OVER( 'n', 'mark:tilde' ),
	'õ': OVER( 'o', 'mark:tilde' ),
	// Diaeresis
	'Ä': OVER( 'A', 'mark:diaeresis' ),
	'Ë': OVER( 'E', 'mark:diaeresis' ),
	'Ï': OVER( 'I', 'mark:diaeresis' ),
	'Ö': OVER( 'O', 'mark:diaeresis' ),
	'Ü': OVER( 'U', 'mark:diaeresis' ),
	'Ÿ': OVER( 'Y', 'mark:diaeresis' ),
	'ä': OVER( 'a', 'mark:diaeresis' ),
	'ë': OVER( 'e', 'mark:diaeresis' ),
	'ï': OVER( 'i', 'mark:diaeresis', true ),
	'ö': OVER( 'o', 'mark:diaeresis' ),
	'ü': OVER( 'u', 'mark:diaeresis' ),
	'ÿ': OVER( 'y', 'mark:diaeresis' ),
	// Cedilla
	'Ç': UNDER( 'C', 'mark:cedilla' ),
	'ç': UNDER( 'c', 'mark:cedilla' ),
};

/**
 * Which composed characters can actually be built right now.
 *
 * @param {Object} glyphs Drawn glyphs keyed like ALL_KEYS.
 * @return {string[]} Composable characters.
 */
export function composableFrom( glyphs ) {
	const has = ( k ) => !! ( glyphs && glyphs[ k ] );
	return Object.keys( COMPOSED ).filter( ( ch ) => {
		const rec = COMPOSED[ ch ];
		return has( rec.base ) && has( rec.mark );
	} );
}

/**
 * Progress over the drawable set.
 *
 * @param {Object} glyphs Drawn glyphs.
 * @return {Object} `{ done, total, requiredDone, requiredTotal, ready }`.
 */
export function progress( glyphs ) {
	const has = ( k ) => !! ( glyphs && glyphs[ k ] );
	const requiredDone = REQUIRED_KEYS.filter( has ).length;
	return {
		done: ALL_KEYS.filter( has ).length,
		total: ALL_KEYS.length,
		requiredDone,
		requiredTotal: REQUIRED_KEYS.length,
		ready: requiredDone === REQUIRED_KEYS.length,
	};
}

/** True for the six accent-mark keys. */
export const isMark = ( key ) => 0 === String( key ).indexOf( 'mark:' );

/**
 * The codepoint a drawable key encodes to, or null for the marks (they
 * exist only as building blocks and never reach the cmap).
 *
 * @param {string} key Drawable key.
 * @return {number|null} Codepoint.
 */
export function codepointOf( key ) {
	if ( isMark( key ) ) {
		return null;
	}
	return String( key ).codePointAt( 0 );
}

/** A readable name for the overview tile. */
export function labelOf( key ) {
	if ( isMark( key ) ) {
		return MARK_LABELS[ key ] || key;
	}
	return key;
}

/**
 * The pangram-ish sample the preview falls back to, per UI language.
 * Kept short so it stays readable at preview size.
 */
export const SAMPLES = {
	en: 'The quick brown fox jumps over the lazy dog',
	de: 'Franz jagt im Taxi quer durch Bayern',
	es: 'El veloz murciélago hindú comía feliz',
	fr: 'Portez ce vieux whisky au juge blond',
	pt: 'À noite, vovô Kowalsky vê o ímã cair',
	it: 'Pranzo d’acqua fa volti sghembi',
	nl: 'Sexy qua lijf, doch bang voor het zwempak',
};
