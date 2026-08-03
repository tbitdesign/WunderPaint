/**
 * Dynamic templates E1 (spec: docs/superpowers/specs/2026-07-07-dynamic-
 * templates-design.md): layers can carry a `binding` (post.title,
 * post.excerpt, ai.background, …) plus a `fit` {min,max} font-size range.
 * `resolveBindings` turns a post context into a paint-ready layer array at
 * render time; the document itself is never mutated, so design view, undo
 * history and exports keep the author's dummy content.
 *
 * A bound text layer is replaced as a whole and uses the layer's base
 * style: spans/lineStyles are cleared on resolution, because per-word
 * styling of unknown text cannot survive a batch run.
 */

import { __, sprintf } from '@wordpress/i18n';

import { measureTextHeight } from './raster';
import { getExtensionBinding, listExtensionBindings } from './extensions';

export const TEXT_BINDINGS = [
	{ id: 'post.title', label: __( 'Post title', 'wunderpaint' ) },
	{ id: 'post.excerpt', label: __( 'Post excerpt', 'wunderpaint' ) },
	{ id: 'post.content', label: __( 'Post content', 'wunderpaint' ) },
	{ id: 'post.author', label: __( 'Author', 'wunderpaint' ) },
	{ id: 'post.category', label: __( 'Category', 'wunderpaint' ) },
	{ id: 'post.date', label: __( 'Publish date', 'wunderpaint' ) },
	{ id: 'site.name', label: __( 'Site name', 'wunderpaint' ) },
];

export const IMAGE_BINDINGS = [
	{ id: 'ai.background', label: __( 'AI background', 'wunderpaint' ) },
	{ id: 'post.featured', label: __( 'Featured image', 'wunderpaint' ) },
	{ id: 'brand.logo', label: __( 'Brand logo', 'wunderpaint' ) },
];

// Brand-kit profile fields as text sources (v1.91.0). Bindings bind by
// KEY, never by kit id: which kit supplies the values is decided at run
// time (preview post, Featured Images, content generator), so one template
// works for every client kit.
export const BRAND_TEXT_BINDINGS = [
	{ id: 'brand.company', label: __( 'Company', 'wunderpaint' ) },
	{
		id: 'brand.contactName',
		label: __( 'Contact person', 'wunderpaint' ),
	},
	{ id: 'brand.email', label: __( 'Email', 'wunderpaint' ) },
	{ id: 'brand.website', label: __( 'Website', 'wunderpaint' ) },
	{ id: 'brand.street', label: __( 'Street', 'wunderpaint' ) },
	{ id: 'brand.zip', label: __( 'ZIP', 'wunderpaint' ) },
	{ id: 'brand.city', label: __( 'City', 'wunderpaint' ) },
	{ id: 'brand.industry', label: __( 'Industry', 'wunderpaint' ) },
	{ id: 'brand.description', label: __( 'Description', 'wunderpaint' ) },
];

// Site sources (v1.192.0): context free, resolve from the bootstrap payload.
export const SITE_BINDINGS = [
	{ id: 'site.name', label: __( 'Site name', 'wunderpaint' ) },
	{ id: 'site.url', label: __( 'Site URL', 'wunderpaint' ) },
	{ id: 'site.tagline', label: __( 'Tagline', 'wunderpaint' ) },
];

// Date + time sources (v1.192.0): context free, resolve to the current date
// in the browser locale at expansion time.
export const DATE_BINDINGS = [
	{ id: 'date.year', label: __( 'Year', 'wunderpaint' ) },
	{ id: 'date.month', label: __( 'Month number', 'wunderpaint' ) },
	{ id: 'date.monthName', label: __( 'Month name', 'wunderpaint' ) },
	{ id: 'date.today', label: __( 'Today', 'wunderpaint' ) },
	{ id: 'date.weekday', label: __( 'Weekday', 'wunderpaint' ) },
];

// Image info sources (v1.192.0): resolve where the run supplies ctx.image
// (the Media Library Manager and Alt Text Assistant work per image).
export const IMAGE_INFO_BINDINGS = [
	{ id: 'image.width', label: __( 'Image width', 'wunderpaint' ) },
	{ id: 'image.height', label: __( 'Image height', 'wunderpaint' ) },
	{
		id: 'image.dimensions',
		label: __( 'Dimensions (WxH)', 'wunderpaint' ),
	},
	{ id: 'image.filename', label: __( 'File name', 'wunderpaint' ) },
	{ id: 'image.type', label: __( 'File type', 'wunderpaint' ) },
];

/**
 * Grouped binding catalog for the dropdown (v1.60): the server enumerates
 * core + author + site + WooCommerce + ACF sources per site (WPIE payload);
 * without it (tests, old payloads) the built-in lists remain.
 *
 * @return {Array} [{label, items:[{id,label,kind}]}]
 */
export function bindingGroups( kit = null ) {
	const server = window.WPIE?.bindings;
	const groups =
		Array.isArray( server ) && server.length
			? [ ...server ]
			: [
					{
						label: __( 'Post', 'wunderpaint' ),
						items: TEXT_BINDINGS.map( ( b ) => ( {
							...b,
							kind: 'text',
						} ) ),
					},
					{
						label: __( 'Media', 'wunderpaint' ),
						items: IMAGE_BINDINGS.map( ( b ) => ( {
							...b,
							kind: 'image',
						} ) ),
					},
			  ];
	// Brand-kit group (v1.91.0): built client-side so the custom variables
	// of the kit picked in the panel appear as sources.
	groups.push( {
		label: kit?.name
			? sprintf(
					/* translators: %s: brand kit name. */
					__( 'Brand Kit (%s)', 'wunderpaint' ),
					kit.name
			  )
			: __( 'Brand Kit', 'wunderpaint' ),
		items: [
			...BRAND_TEXT_BINDINGS.map( ( b ) => ( { ...b, kind: 'text' } ) ),
			...( kit?.vars || [] )
				.filter( ( v ) => v?.key )
				.map( ( v ) => ( {
					id: 'brand.vars.' + v.key,
					label: '{' + v.key + '}',
					kind: 'text',
				} ) ),
		],
	} );
	// Date/time is context free and resolves everywhere, so it is always
	// available in the full catalog (templates, QR, …), not just the affixes.
	groups.push( {
		label: __( 'Date & time', 'wunderpaint' ),
		items: DATE_BINDINGS.map( ( b ) => ( { ...b, kind: 'text' } ) ),
	} );
	// Extension bindings (v1.273.0 / API 2.10): grouped by their declared
	// group label so every VarButton picker offers them.
	const byGroup = new Map();
	listExtensionBindings().forEach( ( b ) => {
		const label = b.group || __( 'Extensions', 'wunderpaint' );
		if ( ! byGroup.has( label ) ) {
			byGroup.set( label, [] );
		}
		byGroup.get( label ).push( { id: b.id, label: b.label, kind: 'text' } );
	} );
	byGroup.forEach( ( items, label ) => groups.push( { label, items } ) );
	return groups;
}

/** Brand-kit group (shared by the full catalog and the affix picker). */
function brandGroup( kit ) {
	return {
		label: kit?.name
			? sprintf(
					/* translators: %s: brand kit name. */
					__( 'Brand Kit (%s)', 'wunderpaint' ),
					kit.name
			  )
			: __( 'Brand Kit', 'wunderpaint' ),
		items: [
			...BRAND_TEXT_BINDINGS.map( ( b ) => ( { ...b, kind: 'text' } ) ),
			...( kit?.vars || [] )
				.filter( ( v ) => v?.key )
				.map( ( v ) => ( {
					id: 'brand.vars.' + v.key,
					label: '{' + v.key + '}',
					kind: 'text',
				} ) ),
		],
	};
}

/**
 * The subset of variables that resolve in a per-image, post-free context
 * (Alt Text Assistant, Media Library Manager affixes): site, date, image and
 * the brand kit. Post variables are deliberately excluded, they have no post
 * to resolve against here.
 *
 * @param {?Object} kit Active brand kit (or null).
 * @return {Array} Groups for the VarButton.
 */
export function affixBindingGroups( kit = null ) {
	return [
		{
			label: __( 'Site', 'wunderpaint' ),
			items: SITE_BINDINGS.map( ( b ) => ( { ...b, kind: 'text' } ) ),
		},
		{
			label: __( 'Date & time', 'wunderpaint' ),
			items: DATE_BINDINGS.map( ( b ) => ( { ...b, kind: 'text' } ) ),
		},
		{
			label: __( 'Image', 'wunderpaint' ),
			items: IMAGE_INFO_BINDINGS.map( ( b ) => ( {
				...b,
				kind: 'text',
			} ) ),
		},
		brandGroup( kit ),
	];
}

export const bindingLabel = ( id ) => {
	if ( id?.startsWith( 'meta.' ) ) {
		return id.slice( 5 );
	}
	if ( id?.startsWith( 'brand.vars.' ) ) {
		return '{' + id.slice( 'brand.vars.'.length ) + '}';
	}
	for ( const group of bindingGroups() ) {
		const hit = group.items.find( ( b ) => b.id === id );
		if ( hit ) {
			return hit.label;
		}
	}
	return (
		[ ...TEXT_BINDINGS, ...IMAGE_BINDINGS ].find( ( b ) => b.id === id )
			?.label || id
	);
};

// Inline variable tokens (v1.161.0): free-form strings - QR contents, and
// whatever form fields adopt the VarButton next - may mix literal text with
// `{{binding.id}}` placeholders, e.g. `https://{{site.url}}/?sku={{wc.sku}}`.
// The slash admits extension bindings (`plugin/name`, v1.273.0).
const TOKEN_RE = /\{\{\s*([A-Za-z0-9_./-]+)\s*\}\}/g;

/**
 * Whether a string contains `{{…}}` variable tokens.
 *
 * @param {string} str Raw string.
 * @return {boolean} Has tokens.
 */
export const hasTokens = ( str ) =>
	/\{\{\s*[A-Za-z0-9_./-]+\s*\}\}/.test( String( str || '' ) );

/**
 * Expand `{{binding.id}}` tokens against a post context; unknown or empty
 * bindings become '' so a missing value never leaks its placeholder.
 *
 * @param {string} str Raw string with tokens.
 * @param {Object} ctx Post context (same shape as resolveBindings).
 * @return {string} Expanded string.
 */
export const expandTokens = ( str, ctx ) =>
	String( str || '' ).replace( TOKEN_RE, ( _, id ) =>
		bindingValue( id, ctx || {} )
	);

/**
 * Expansion plus fill statistics: a token layer whose tokens ALL come up
 * empty hides entirely (badge pattern - "Updated: " alone says nothing),
 * so callers need to know how many tokens carried a value.
 *
 * @param {string} str Raw string with tokens.
 * @param {Object} ctx Post context.
 * @return {Object} { text, total, filled }.
 */
const expandTokensCounted = ( str, ctx ) => {
	let total = 0;
	let filled = 0;
	const text = String( str || '' ).replace( TOKEN_RE, ( _, id ) => {
		total++;
		const v = bindingValue( id, ctx || {} );
		if ( v.trim() ) {
			filled++;
		}
		return v;
	} );
	return { text, total, filled };
};

/**
 * Meta keys used by `meta.*` bindings in a layer list; the context request
 * sends them so the server resolves those custom fields. Token-capable
 * fields (QR contents) are scanned for `{{meta.*}}` placeholders too.
 *
 * @param {Array} layers Layers.
 * @return {Array} Unique keys.
 */
export const collectMetaKeys = ( layers ) => {
	const keys = new Set();
	const scan = ( str ) => {
		for ( const m of String( str || '' ).matchAll( TOKEN_RE ) ) {
			if ( m[ 1 ].startsWith( 'meta.' ) ) {
				keys.add( m[ 1 ].slice( 5 ) );
			}
		}
	};
	for ( const l of layers || [] ) {
		if ( l.binding?.startsWith( 'meta.' ) ) {
			keys.add( l.binding.slice( 5 ) );
		}
		// The AI background's per-post reference field (v1.315) rides
		// along in the context request like any other bound meta key.
		if ( l.aiRefKey ) {
			keys.add( String( l.aiRefKey ) );
		}
		if ( 'text' === l.type ) {
			scan( l.text );
		}
		for ( const v of Object.values( l.qr?.content || {} ) ) {
			if ( 'string' === typeof v ) {
				scan( v );
			}
		}
	}
	return [ ...keys ];
};

/** Current-date value for a date.* binding, in the site/user locale. */
function dateValue( id, ctx ) {
	const d = ctx?.now instanceof Date ? ctx.now : new Date();
	// WordPress hands the locale over as 'de_DE'; Intl expects BCP-47
	// ('de-DE') and THROWS a RangeError on an invalid tag, which used to
	// break Month name / Today / Weekday entirely. Normalize and fall back
	// to the browser default when the tag still is not resolvable.
	const raw = ( typeof window !== 'undefined' && window.WPIE?.locale ) || '';
	const locale = String( raw ).replace( /_/g, '-' ) || undefined;
	const fmt = ( opts ) => {
		try {
			return d.toLocaleDateString( locale, opts );
		} catch ( e ) {
			return d.toLocaleDateString( undefined, opts );
		}
	};
	switch ( id ) {
		case 'date.year':
			return String( d.getFullYear() );
		case 'date.month':
			return String( d.getMonth() + 1 ).padStart( 2, '0' );
		case 'date.monthName':
			return fmt( { month: 'long' } );
		case 'date.today':
			return fmt( undefined );
		case 'date.weekday':
			return fmt( { weekday: 'long' } );
	}
	return '';
}

/** Human file type from a mime, e.g. image/svg+xml -> SVG. */
function imageType( image ) {
	const part = String( image?.mime || '' )
		.split( '/' )
		.pop();
	return part ? part.replace( '+xml', '' ).toUpperCase() : '';
}

/**
 * Context value for a binding id ('' when the post has none).
 *
 * @param {string} binding Binding id.
 * @param {Object} ctx     Post context from /posts/{id}/context (+ brand).
 * @return {string} Resolved value.
 */
export function bindingValue( binding, ctx = {} ) {
	// Extension bindings (v1.273.0): ids carry a slash (`plugin/name`),
	// which no core id does. Resolver errors and nullish results degrade
	// to '' so one broken extension never kills a batch run.
	if ( binding && binding.includes( '/' ) ) {
		const ext = getExtensionBinding( binding );
		if ( ext ) {
			try {
				const v = ext.resolve( ctx );
				return null === v || undefined === v ? '' : String( v );
			} catch ( e ) {
				return '';
			}
		}
		return String( ctx.fields?.[ binding ] || '' );
	}
	if ( binding?.startsWith( 'date.' ) ) {
		return dateValue( binding, ctx );
	}
	switch ( binding ) {
		// Site values live top-level in the per-image contexts (Media
		// Library, Alt Text affixes) but in the flat fields map of the post
		// context (/posts/{id}/context) - both must resolve, so fall back
		// to the catalog fields instead of shadowing them.
		case 'site.url':
			return String( ctx.siteUrl || ctx.fields?.[ 'site.url' ] || '' );
		case 'site.tagline':
			return String(
				ctx.siteTagline || ctx.fields?.[ 'site.tagline' ] || ''
			);
		case 'image.width':
			return String( ctx.image?.width || '' );
		case 'image.height':
			return String( ctx.image?.height || '' );
		case 'image.dimensions':
			return ctx.image?.width && ctx.image?.height
				? `${ ctx.image.width }x${ ctx.image.height }`
				: '';
		case 'image.filename':
			return String( ctx.image?.filename || '' );
		case 'image.type':
			return imageType( ctx.image );
	}
	switch ( binding ) {
		case 'post.title':
			return String( ctx.title || '' );
		case 'post.excerpt':
			return String( ctx.excerpt || '' );
		// Plain-text body (v1.232): the fields map carries the word-safe
		// capped version; ctx.content (the AI-prompt text) is the fallback
		// for older context payloads.
		case 'post.content':
			return String(
				ctx.fields?.[ 'post.content' ] || ctx.content || ''
			);
		case 'post.author':
			return String( ctx.author || '' );
		case 'post.category':
			return String(
				ctx.category || ( ctx.categories || [] )[ 0 ] || ''
			);
		case 'post.date':
			return String( ctx.date || '' );
		case 'site.name':
			return String( ctx.siteName || ctx.fields?.[ 'site.name' ] || '' );
		case 'post.featured':
			return String( ctx.featuredUrl || '' );
		case 'brand.logo':
			return String( ctx.brand?.logoUrl || '' );
	}
	// Brand-kit sources (v1.91.0) resolve client-side from the kit that the
	// run supplies as ctx.brand: portable across kits by design.
	if ( binding?.startsWith( 'brand.vars.' ) ) {
		const key = binding.slice( 'brand.vars.'.length );
		const hit = ( ctx.brand?.vars || [] ).find( ( v ) => v?.key === key );
		return String( hit?.value || '' );
	}
	if ( binding?.startsWith( 'brand.' ) ) {
		return String( ctx.brand?.[ binding.slice( 6 ) ] || '' );
	}
	// Catalog sources (author.*, site.*, wc.*, acf.*, meta.*) resolve
	// server-side into the flat fields map (v1.60).
	return String( ctx.fields?.[ binding ] || '' );
}

const ELLIPSIS = '…';

/**
 * Fit dynamic text into the layer's box: binary-search the font size within
 * layer.fit {min,max}; lineHeight is relative already, letterSpacing scales
 * proportionally. When even the min size overflows, truncate at a word
 * boundary with an ellipsis (second binary search over the word count).
 *
 * @param {Object} layer Bound text layer (box = layer.w × layer.h).
 * @param {string} text  Resolved text.
 * @return {Object} Patch { text, fontSize, letterSpacing, fixedWidth }.
 */
export function fitTextToBox( layer, text ) {
	const max = Math.max(
		4,
		Math.round( layer.fit?.max || layer.fontSize || 48 )
	);
	const min = Math.min(
		max,
		Math.max( 4, Math.round( layer.fit?.min || 10 ) )
	);
	const base = layer.fontSize || max;
	const ls0 = layer.letterSpacing || 0;
	const boxH = Math.max( 8, layer.h || 0 );
	const fits = ( t, size ) =>
		measureTextHeight( {
			...layer,
			text: t,
			fontSize: size,
			letterSpacing: ( ls0 * size ) / base,
			spans: null,
			lineStyles: null,
			fixedWidth: true,
		} ) <= boxH;
	const patch = ( t, size ) => ( {
		text: t,
		fontSize: size,
		letterSpacing: ( ls0 * size ) / base,
		fixedWidth: true,
	} );

	let lo = min;
	let hi = max;
	let best = 0;
	while ( lo <= hi ) {
		const mid = Math.floor( ( lo + hi ) / 2 );
		if ( fits( text, mid ) ) {
			best = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	if ( best ) {
		return patch( text, best );
	}

	// Even min overflows: keep as many whole words as fit, add an ellipsis.
	const words = String( text ).split( /\s+/ ).filter( Boolean );
	lo = 1;
	hi = words.length;
	let keep = 0;
	while ( lo <= hi ) {
		const mid = Math.floor( ( lo + hi ) / 2 );
		if ( fits( words.slice( 0, mid ).join( ' ' ) + ELLIPSIS, min ) ) {
			keep = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	const cut = keep
		? words.slice( 0, keep ).join( ' ' ) + ELLIPSIS
		: ( words[ 0 ] || '' ).slice( 0, 12 ) + ELLIPSIS;
	return patch( cut, min );
}

// Resolution is re-run per paint; memoise per (layer object, ctx object) so
// unchanged layers keep their patched object identity across frames (the
// canvas prefix cache keys off identity).
const memo = new WeakMap();

// Extension-generator layers (layer.generator = {id, params}, e.g. the 3D
// Mockup Studio) re-render per post context in an ASYNC prepare pass
// (lib/generator-resolve.js), exactly like ai.background: the pass stores
// its result here, the sync resolveBindings below consumes it.
//
// Keyed by CONTENT identity, not layer identity (v1.249.2): the immutable
// store mints a new layer object on every drag frame, but the baked pixels
// only depend on the generator params / QR content / embedded layers plus
// the context. Those objects survive moves untouched and are REPLACED by
// every real edit (Edit 3D Text, QR dialog, Edit Contents), so keying on
// them makes dragging in post preview free instead of a full re-bake per
// frame (with the raw variable flickering through while it ran).
const generatorMemo = new WeakMap();

/** Content key for a generator/QR result (layer object as last resort). */
const generatorKey = ( layer ) => layer.generator || layer.qr || layer;

/**
 * Store a prepared generator result for one layer + context, consumed by
 * resolveBindings. Called by prepareGeneratorLayers, not by extensions.
 *
 * @param {Object} layer Layer object (its content object is the key).
 * @param {Object} ctx   Post context the result belongs to.
 * @param {Object} patch {src, naturalW?, naturalH?} replacement.
 */
export function setResolvedGenerator( layer, ctx, patch ) {
	generatorMemo.set( generatorKey( layer ), { ctx, patch } );
}

/**
 * Whether a layer already has a prepared generator result for this
 * context; lets repeated prepare passes (every preview repaint) skip
 * the expensive re-bake.
 *
 * @param {Object} layer Layer object.
 * @param {Object} ctx   Post context.
 * @return {boolean} Prepared.
 */
export function hasResolvedGenerator( layer, ctx ) {
	const m = generatorMemo.get( generatorKey( layer ) );
	return !! ( m && m.ctx === ctx );
}

/* Dynamic smart objects (v1.249): prepared per-context re-renders of a
   smart object's embedded layers, same two-phase pattern as generators.
   The patch swaps ONLY the content pixels - the layer stays type 'smart',
   so smart filters and Edit Contents keep working. Keyed by the embedded
   descriptor (content identity, see generatorMemo above): moving the
   smart object keeps the memo, Edit Contents replaces `embedded` and
   re-bakes. */
const smartMemo = new WeakMap();

/** Content key for a smart-object render (layer object as last resort). */
const smartKey = ( layer ) => layer.embedded || layer;

/**
 * Store a prepared smart-object render for one layer + context.
 *
 * @param {Object} layer Smart layer (its embedded object is the key).
 * @param {Object} ctx   Post context the result belongs to.
 * @param {Object} patch {src?} replacement ({}: memoised no-op).
 */
export function setResolvedSmart( layer, ctx, patch ) {
	smartMemo.set( smartKey( layer ), { ctx, patch } );
}

/**
 * Whether a smart layer already prepared for this context.
 *
 * @param {Object} layer Smart layer.
 * @param {Object} ctx   Post context.
 * @return {boolean} Prepared.
 */
export function hasResolvedSmart( layer, ctx ) {
	const m = smartMemo.get( smartKey( layer ) );
	return !! ( m && m.ctx === ctx );
}

/**
 * Resolve all bindings against a post context. Pure: returns a new array in
 * which only bound layers are replaced; empty values hide the layer.
 * `ai.background` stays untouched in E1 (E2 swaps its src per post).
 *
 * @param {Array}  layers Document layers.
 * @param {Object} ctx    Post context (+ brand); falsy = no-op.
 * @return {Array} Resolved layers (same array when nothing changed).
 */
// Extra sync passes over the resolved list (v1.271): modules register a
// (layers, ctx) => layers function - chart-refresh swaps rebuilt chart
// groups in this way without dynamic-content importing it (no cycle).
const resolvePasses = [];

/**
 * Register a sync resolve pass, run at the end of resolveBindings.
 *
 * @param {Function} fn (layers, ctx) => layers.
 */
export function registerResolvePass( fn ) {
	if ( 'function' === typeof fn && ! resolvePasses.includes( fn ) ) {
		resolvePasses.push( fn );
	}
}

export function resolveBindings( layers, ctx ) {
	if ( ! ctx ) {
		return layers;
	}
	let changed = false;
	const out = layers.map( ( layer ) => {
		// Dynamic smart objects (v1.249): swap in the per-context render
		// of the embedded layers; everything else on the layer stays.
		const sm = layer.embedded ? smartMemo.get( layer.embedded ) : null;
		if (
			sm &&
			sm.ctx === ctx &&
			sm.patch &&
			sm.patch.src &&
			sm.patch.src !== layer.src
		) {
			changed = true;
			return {
				...layer,
				src: sm.patch.src,
				canvas: null,
				dataUrl: null,
			};
		}
		// Prepared generator layers swap their pixels wholesale; the
		// design-time src stays when no prepare pass ran (preview
		// parity with ai.background). {hide:true} mirrors the empty-
		// binding rule: no value, no layer.
		const gen =
			layer.generator || layer.qr
				? generatorMemo.get( generatorKey( layer ) )
				: null;
		if ( gen && gen.ctx === ctx && gen.patch && gen.patch.hide ) {
			changed = true;
			return { ...layer, visible: false };
		}
		if ( gen && gen.ctx === ctx && gen.patch && gen.patch.src ) {
			changed = true;
			return {
				...layer,
				...gen.patch,
				type: 'image',
				canvas: null,
				dataUrl: null,
			};
		}
		if ( ! layer.binding || 'ai.background' === layer.binding ) {
			// Inline {{tokens}} in unbound text layers (v1.162.0): literal
			// text and variables mix ("By {{author.name}}"). All tokens
			// empty = the layer hides, like an empty binding. A set
			// binding keeps precedence over tokens in the dummy text.
			if (
				'text' === layer.type &&
				! layer.binding &&
				hasTokens( layer.text )
			) {
				const mt = memo.get( layer );
				if ( mt && mt.ctx === ctx ) {
					changed = changed || mt.out !== layer;
					return mt.out;
				}
				const { text, filled } = expandTokensCounted( layer.text, ctx );
				const hidden = ! filled || ! text.trim();
				const out2 = hidden
					? { ...layer, visible: false }
					: {
							...layer,
							// Path text follows its path, boxes auto-fit.
							...( layer.textPath?.d
								? { text }
								: fitTextToBox( layer, text ) ),
							spans: null,
							lineStyles: null,
					  };
				memo.set( layer, { ctx, out: out2 } );
				changed = true;
				return out2;
			}
			return layer;
		}
		const m = memo.get( layer );
		if ( m && m.ctx === ctx ) {
			changed = changed || m.out !== layer;
			return m.out;
		}
		let res = layer;
		if ( 'text' === layer.type ) {
			const v = bindingValue( layer.binding, ctx ).trim();
			res = v
				? {
						...layer,
						...fitTextToBox( layer, v ),
						spans: null,
						lineStyles: null,
				  }
				: { ...layer, visible: false };
		} else if ( 'image' === layer.type || 'raster' === layer.type ) {
			// Raster layers (an image that got pixel edits or effects) stay
			// bindable: the dynamic value replaces the whole content, so the
			// resolved layer renders as an image again.
			const src = bindingValue( layer.binding, ctx );
			if ( ! src ) {
				res = { ...layer, visible: false };
			} else if ( src !== layer.src || 'raster' === layer.type ) {
				res = {
					...layer,
					type: 'image',
					src,
					canvas: null,
					dataUrl: null,
				};
			}
		}
		memo.set( layer, { ctx, out: res } );
		changed = changed || res !== layer;
		return res;
	} );
	let result = changed ? out : layers;
	for ( const pass of resolvePasses ) {
		result = pass( result, ctx );
	}
	return result;
}
