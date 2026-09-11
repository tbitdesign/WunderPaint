import {
	KINDS,
	VOICES,
	MOODS,
	IMAGERY,
	BG_STYLES,
	PALETTE_ROLES,
	PALETTE_SOURCES,
	ROLES,
	BLENDS,
	ANCHORS,
	SIDES,
	FITS,
	PHOTO_FITS,
	STACK_DIRS,
	STACK_ALIGNS,
	EMPH_RULES,
	EMPH_STYLES,
	ASSET_KINDS,
	ORIENTATIONS,
	TEXT_ALIGNS,
	BG_DIRECTIONS,
	PHOTO_INSTANCES,
	SCRIM_FROM,
	SIZE_KEYWORDS,
	LAYER_STYLES,
	TREATS,
	COMPONENTS,
	LIMITS,
	BIND_TEXT,
	BIND_IMAGE,
	shapeFamilies,
} from './catalog';

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

function note( notes, code, path, message ) {
	notes.push( { code, path, message } );
}
const pickEnum = ( v, list, dflt, notes, path ) => {
	if ( list.includes( v ) ) {
		return v;
	}
	if ( undefined !== v ) {
		note(
			notes,
			'enum',
			path,
			`${ v } is not one of ${ list.join( '|' ) }`
		);
	}
	return dflt;
};
const clampNum = ( v, min, max, dflt, notes, path ) => {
	if ( 'number' !== typeof v || Number.isNaN( v ) ) {
		return dflt;
	}
	const c = Math.min( max, Math.max( min, v ) );
	if ( c !== v ) {
		note( notes, 'clamp', path, `${ v } clamped to ${ c }` );
	}
	return c;
};
const frac = ( v, dflt, notes, path ) => clampNum( v, 0, 1, dflt, notes, path );
const colorOrRole = ( v ) =>
	PALETTE_ROLES.includes( v ) || HEX.test( String( v ) ) ? v : undefined;
/** Keep only the listed keys; note every other key. */
function keep( obj, allowed, notes, path ) {
	const out = {};
	for ( const key of Object.keys( obj || {} ) ) {
		if ( allowed.includes( key ) ) {
			out[ key ] = obj[ key ];
		} else {
			note( notes, 'unknown-field', `${ path }.${ key }`, 'dropped' );
		}
	}
	return out;
}

/**
 * Clean a treatment list (element `effects`, photo `treat`): drop entries
 * with an unknown `fx`, then `keep()` each surviving entry down to `fx`
 * plus that treatment's own param keys (so a stray key inside one entry
 * notes and drops instead of leaking through), and merge the registry
 * defaults underneath it.
 */
function cleanTreats( list, notes, path ) {
	return ( Array.isArray( list ) ? list : [] )
		.filter( ( t ) => t && TREATS[ t.fx ] )
		.map( ( t, i ) => {
			const def = TREATS[ t.fx ];
			const entry = keep(
				t,
				[ 'fx', ...Object.keys( def.params ) ],
				notes,
				`${ path }[${ i }]`
			);
			return { ...def.params, ...entry };
		} );
}

/**
 * A `size` tuple (`place.size` or a stack child's `size`): `fill`/`match`/
 * `auto` pass through, numbers clamp to a 0..1 fraction; an invalid tuple
 * (missing, wrong shape) becomes the neutral default.
 */
function cleanSizeTuple( raw, notes, path ) {
	if ( ! Array.isArray( raw ) || 2 !== raw.length ) {
		return [ 'fill', 'auto' ];
	}
	return raw.map( ( v, i ) =>
		SIZE_KEYWORDS.includes( v )
			? v
			: frac( v, 'auto', notes, `${ path }[${ i }]` )
	);
}

function cleanPlace( raw, notes, path ) {
	const p = keep(
		raw,
		[ 'area', 'rect', 'rel', 'cover', 'anchor', 'inset', 'size' ],
		notes,
		path
	);
	const out = {};
	if ( p.cover ) {
		return { cover: true };
	}
	if ( Array.isArray( p.rect ) && 4 === p.rect.length ) {
		out.rect = p.rect.map( ( v, i ) =>
			frac( v, i < 2 ? 0 : 1, notes, `${ path }.rect[${ i }]` )
		);
		return out;
	}
	if ( p.rel && 'object' === typeof p.rel ) {
		out.rel = {
			to: String( p.rel.to || '' ),
			side: pickEnum(
				p.rel.side,
				SIDES,
				'below',
				notes,
				`${ path }.rel.side`
			),
			gap: clampNum( p.rel.gap, 0, 6, 1, notes, `${ path }.rel.gap` ),
		};
	} else if ( p.area ) {
		out.area = String( p.area );
	}
	out.anchor = pickEnum( p.anchor, ANCHORS, 'tl', notes, `${ path }.anchor` );
	out.inset =
		Array.isArray( p.inset ) && 4 === p.inset.length
			? p.inset.map( ( v, i ) =>
					frac( v, 0, notes, `${ path }.inset[${ i }]` )
			  )
			: [ 0, 0, 0, 0 ];
	if ( Array.isArray( p.size ) && 2 === p.size.length ) {
		out.size = cleanSizeTuple( p.size, notes, `${ path }.size` );
	}
	return out;
}

function cleanElement( raw, notes, path ) {
	const common = [
		'id',
		'kind',
		'name',
		'place',
		'parent',
		'size',
		'role',
		'for',
		'opacity',
		'blend',
		'rot',
		'effects',
		'styles',
		'bind',
		'lock',
		'optional',
	];
	const byKind = {
		background: [ 'style', 'colors', 'seed', 'grain', 'direction' ],
		photo: [
			'asset',
			'fit',
			'focus',
			'instance',
			'treat',
			'maskShape',
			'scrim',
		],
		text: [
			'voice',
			'content',
			'lines',
			'fit',
			'align',
			'emph',
			'fill',
			'chip',
			'upper',
		],
		shape: [ 'family', 'params', 'fill', 'stroke', 'strokeW', 'corner' ],
		component: [ 'type', 'props' ],
		group: [ 'stack' ],
	};
	const kind = pickEnum( raw?.kind, KINDS, null, notes, `${ path }.kind` );
	if ( ! kind ) {
		return null;
	}
	const e = keep( raw, [ ...common, ...byKind[ kind ] ], notes, path );
	const out = {
		id: String( e.id || '' ),
		kind,
		name: String( e.name || e.id || kind ),
		role: pickEnum( e.role, ROLES, 'support', notes, `${ path }.role` ),
		opacity: frac( e.opacity, 1, notes, `${ path }.opacity` ),
		blend: pickEnum( e.blend, BLENDS, 'normal', notes, `${ path }.blend` ),
		rot: clampNum(
			e.rot,
			-LIMITS.rotMax,
			LIMITS.rotMax,
			0,
			notes,
			`${ path }.rot`
		),
		lock: !! e.lock,
		optional: !! e.optional,
	};
	// A group and a component are both painted as a GROUP layer, and the
	// renderer rotates everything except groups (render.js: `rot` lives in
	// the non-group branch of renderLayerToDevice). A rotation here would be
	// accepted, stored, and then silently do nothing - so it is dropped with
	// a note instead. Text, shape and photo keep theirs.
	if ( out.rot && ( 'group' === kind || 'component' === kind ) ) {
		note(
			notes,
			'unsupported',
			`${ path }.rot`,
			'rotation is only supported on text, shape and photo in stage 1'
		);
		out.rot = 0;
	}
	if ( e.for ) {
		out.for = String( e.for );
	}
	if ( e.parent ) {
		out.parent = String( e.parent );
		// A stack child is sized, not placed. The response schema requires
		// `place` on EVERY element (without that requirement the model wrote
		// none at all, stage 2a), so a child legitimately arrives as
		// `place: { size: [...] }` - that is the child's size, and dropping
		// it would silently make every child "fill/auto" again.
		const childSize =
			Array.isArray( e.size ) && 2 === e.size.length
				? e.size
				: e.place?.size;
		out.size = cleanSizeTuple(
			childSize,
			notes,
			`${ path }.${
				Array.isArray( e.size ) && 2 === e.size.length
					? 'size'
					: 'place.size'
			}`
		);
	} else {
		out.place = cleanPlace( e.place || {}, notes, `${ path }.place` );
	}
	if ( Array.isArray( e.effects ) ) {
		out.effects = cleanTreats( e.effects, notes, `${ path }.effects` );
	}
	if ( e.styles && 'object' === typeof e.styles ) {
		out.styles = keep( e.styles, LAYER_STYLES, notes, `${ path }.styles` );
	}
	if ( e.bind && e.bind.id ) {
		out.bind = {
			id: String( e.bind.id ),
			fit: 'shrink' === e.bind.fit ? 'shrink' : 'fluid',
		};
	}
	switch ( kind ) {
		case 'background':
			out.style = pickEnum(
				e.style,
				BG_STYLES,
				'solid',
				notes,
				`${ path }.style`
			);
			out.colors = (
				Array.isArray( e.colors )
					? e.colors
					: [ 'bg', 'surface', 'accent' ]
			)
				.map( colorOrRole )
				.filter( Boolean );
			out.seed = clampNum( e.seed, 1, 1e9, 1, notes, `${ path }.seed` );
			out.grain = frac( e.grain, 0, notes, `${ path }.grain` );
			out.direction = pickEnum(
				e.direction,
				BG_DIRECTIONS,
				'down',
				notes,
				`${ path }.direction`
			);
			break;
		case 'photo':
			out.asset = e.asset ? String( e.asset ) : '';
			out.fit = pickEnum(
				e.fit,
				PHOTO_FITS,
				'cover',
				notes,
				`${ path }.fit`
			);
			out.focus =
				Array.isArray( e.focus ) && 2 === e.focus.length
					? e.focus.map( ( v, i ) =>
							frac( v, 0.5, notes, `${ path }.focus[${ i }]` )
					  )
					: [ 0.5, 0.5 ];
			out.instance = pickEnum(
				e.instance,
				PHOTO_INSTANCES,
				'full',
				notes,
				`${ path }.instance`
			);
			out.treat = cleanTreats( e.treat, notes, `${ path }.treat` );
			if (
				e.maskShape &&
				e.maskShape.family &&
				shapeFamilies().includes( e.maskShape.family )
			) {
				out.maskShape = {
					family: e.maskShape.family,
					params:
						e.maskShape.params &&
						'object' === typeof e.maskShape.params
							? e.maskShape.params
							: {},
				};
			}
			if ( e.scrim && 'object' === typeof e.scrim ) {
				out.scrim = {
					color: colorOrRole( e.scrim.color ) || 'bg',
					from: pickEnum(
						e.scrim.from,
						SCRIM_FROM,
						'b',
						notes,
						`${ path }.scrim.from`
					),
					strength: frac(
						e.scrim.strength,
						0.6,
						notes,
						`${ path }.scrim.strength`
					),
					height: frac(
						e.scrim.height,
						0.5,
						notes,
						`${ path }.scrim.height`
					),
				};
			}
			break;
		case 'text':
			out.voice = pickEnum(
				e.voice,
				VOICES,
				'sub',
				notes,
				`${ path }.voice`
			);
			out.content = String( e.content || '' );
			out.lines = clampNum(
				e.lines,
				1,
				LIMITS.lines,
				2,
				notes,
				`${ path }.lines`
			);
			out.fit = pickEnum( e.fit, FITS, 'fluid', notes, `${ path }.fit` );
			out.align = pickEnum(
				e.align,
				TEXT_ALIGNS,
				'left',
				notes,
				`${ path }.align`
			);
			out.upper = !! e.upper;
			if ( e.emph && 'object' === typeof e.emph ) {
				out.emph = {
					rule: pickEnum(
						e.emph.rule,
						EMPH_RULES,
						'salient',
						notes,
						`${ path }.emph.rule`
					),
					word: e.emph.word ? String( e.emph.word ) : '',
					style: pickEnum(
						e.emph.style,
						EMPH_STYLES,
						'accent',
						notes,
						`${ path }.emph.style`
					),
				};
			}
			out.fill = colorOrRole( e.fill ) || 'ink';
			if ( e.chip ) {
				out.chip = colorOrRole( e.chip ) || 'accent';
			}
			break;
		case 'shape': {
			const knownFamily = shapeFamilies().includes( e.family )
				? e.family
				: null;
			if ( ! knownFamily && undefined !== e.family ) {
				note(
					notes,
					'enum',
					`${ path }.family`,
					`${ e.family } is not a known shape family`
				);
			}
			out.family = knownFamily || 'rect';
			out.params =
				e.params && 'object' === typeof e.params ? e.params : {};
			out.fill = colorOrRole( e.fill ) || 'accent';
			out.stroke = colorOrRole( e.stroke ) || null;
			out.strokeW = clampNum(
				e.strokeW,
				0,
				0.05,
				0,
				notes,
				`${ path }.strokeW`
			);
			out.corner = frac( e.corner, 0, notes, `${ path }.corner` );
			break;
		}
		case 'component': {
			const type = pickEnum(
				e.type,
				Object.keys( COMPONENTS ),
				'button',
				notes,
				`${ path }.type`
			);
			out.type = type;
			// Typed, not just named: a model answering `"label": 70` for a
			// discount used to pass clean and validate and throw in
			// buttonComponent with `label.slice is not a function`. Every
			// prop takes the type of its default; what cannot be read as
			// that type falls back to the default and leaves a note.
			const defaults = COMPONENTS[ type ];
			const props = { ...defaults };
			const kept = keep(
				e.props,
				Object.keys( defaults ),
				notes,
				`${ path }.props`
			);
			for ( const [ key, value ] of Object.entries( kept ) ) {
				const dflt = defaults[ key ];
				if ( 'string' === typeof dflt ) {
					props[ key ] =
						null === value || undefined === value
							? dflt
							: String( value );
				} else if ( 'boolean' === typeof dflt ) {
					props[ key ] = !! value;
				} else if ( 'number' === typeof dflt ) {
					const n = Number( value );
					if ( Number.isFinite( n ) ) {
						props[ key ] = n;
					} else {
						props[ key ] = dflt;
						note(
							notes,
							'coerced',
							`${ path }.props.${ key }`,
							`not a number, kept ${ dflt }`
						);
					}
				} else {
					props[ key ] = value;
				}
			}
			out.props = props;
			break;
		}
		case 'group':
			if ( e.stack && 'object' === typeof e.stack ) {
				out.stack = {
					dir: pickEnum(
						e.stack.dir,
						STACK_DIRS,
						'col',
						notes,
						`${ path }.stack.dir`
					),
					gap: clampNum(
						e.stack.gap,
						0,
						6,
						1,
						notes,
						`${ path }.stack.gap`
					),
					align: pickEnum(
						e.stack.align,
						STACK_ALIGNS,
						'start',
						notes,
						`${ path }.stack.align`
					),
					justify: pickEnum(
						e.stack.justify,
						STACK_ALIGNS,
						'start',
						notes,
						`${ path }.stack.justify`
					),
				};
			} else {
				// A group without a stack let every child fall onto the full
				// canvas, and only a note said so. A group IS a stack: column,
				// as the default everywhere else.
				out.stack = {
					dir: 'col',
					gap: 1,
					align: 'start',
					justify: 'start',
				};
				note(
					notes,
					'defaulted',
					`${ path }.stack`,
					'group without stack: column'
				);
			}
			break;
	}
	return out;
}

/**
 * Bereinigt ein Markup: Defaults, Aufzählungen, Grenzen, unbekannte Felder.
 * Wirft nie; Probleme landen in `notes`.
 */
export function cleanMarkup( raw, ctx = {} ) {
	const notes = [];
	const src = raw && 'object' === typeof raw ? raw : {};
	// 'meta' is allowed so test-bench context on the root never produces an
	// unknown-field note, but it is intentionally not copied into `markup`.
	const top = keep(
		src,
		[
			'v',
			'name',
			'concept',
			'canvas',
			'tokens',
			'grid',
			'areas',
			'assets',
			'elements',
			'meta',
		],
		notes,
		'$'
	);
	const w = ctx.doc?.w || top.canvas?.w || 1080;
	const h = ctx.doc?.h || top.canvas?.h || 1080;
	const concept = top.concept || {};
	const tokens = top.tokens || {};
	const palette = tokens.palette || {};
	const type = tokens.type || {};
	const space = tokens.space || {};
	const grid = top.grid || {};
	const markup = {
		v: 1,
		name: String( top.name || 'Design' ).slice( 0, 80 ),
		concept: {
			idea: String( concept.idea || '' ),
			mood: pickEnum(
				concept.mood,
				MOODS,
				'cool',
				notes,
				'$.concept.mood'
			),
			loud: clampNum( concept.loud, 1, 5, 3, notes, '$.concept.loud' ),
			imagery: pickEnum(
				concept.imagery,
				IMAGERY,
				'none',
				notes,
				'$.concept.imagery'
			),
		},
		canvas: { w, h },
		tokens: {
			palette: {
				source: pickEnum(
					palette.source,
					PALETTE_SOURCES,
					ctx.brand?.colors?.length >= 3 ? 'brand' : 'intent',
					notes,
					'$.tokens.palette.source'
				),
				intent: pickEnum(
					palette.intent,
					MOODS,
					concept.mood && MOODS.includes( concept.mood )
						? concept.mood
						: 'cool',
					notes,
					'$.tokens.palette.intent'
				),
				roles: Object.fromEntries(
					Object.entries( palette.roles || {} ).filter(
						( [ k, v ] ) =>
							PALETTE_ROLES.includes( k ) &&
							HEX.test( String( v ) )
					)
				),
			},
			type: {
				pairing:
					type.pairing &&
					Array.isArray( type.pairing.hero ) &&
					Array.isArray( type.pairing.support )
						? {
								hero: [
									String( type.pairing.hero[ 0 ] ),
									Number( type.pairing.hero[ 1 ] ) || 700,
								],
								support: [
									String( type.pairing.support[ 0 ] ),
									Number( type.pairing.support[ 1 ] ) || 400,
								],
						  }
						: null,
				scale: clampNum(
					type.scale,
					1.1,
					1.6,
					1.25,
					notes,
					'$.tokens.type.scale'
				),
			},
			space: {
				margin: clampNum(
					space.margin,
					0,
					0.2,
					0.06,
					notes,
					'$.tokens.space.margin'
				),
				gap: clampNum(
					space.gap,
					0,
					0.2,
					0.02,
					notes,
					'$.tokens.space.gap'
				),
				radius: clampNum(
					space.radius,
					0,
					0.2,
					0.02,
					notes,
					'$.tokens.space.radius'
				),
			},
		},
		grid: {
			cols: clampNum( grid.cols, 1, 24, 12, notes, '$.grid.cols' ),
			rows: clampNum( grid.rows, 1, 24, 12, notes, '$.grid.rows' ),
			margin: clampNum(
				grid.margin,
				0,
				0.2,
				0.06,
				notes,
				'$.grid.margin'
			),
			gutter: clampNum(
				grid.gutter,
				0,
				0.2,
				0.02,
				notes,
				'$.grid.gutter'
			),
		},
		areas: ( Array.isArray( top.areas ) ? top.areas : [] )
			.filter(
				( a ) =>
					a && a.id && Array.isArray( a.cell ) && 4 === a.cell.length
			)
			.map( ( a ) => ( {
				id: String( a.id ),
				cell: a.cell.map( ( v ) =>
					Math.max( 0, Math.round( Number( v ) || 0 ) )
				),
			} ) ),
		assets: ( Array.isArray( top.assets ) ? top.assets : [] )
			.filter( ( a ) => a && a.id )
			.map( ( a, i ) => ( {
				id: String( a.id ),
				kind: pickEnum(
					a.kind,
					ASSET_KINDS,
					'placeholder',
					notes,
					`$.assets[${ i }].kind`
				),
				query: String( a.query || '' ),
				prompt: String( a.prompt || '' ),
				mediaId: Number( a.mediaId ) || 0,
				orientation: pickEnum(
					a.orientation,
					ORIENTATIONS,
					'landscape',
					notes,
					`$.assets[${ i }].orientation`
				),
			} ) ),
		elements: ( Array.isArray( top.elements ) ? top.elements : [] )
			.map( ( e, i ) => cleanElement( e, notes, `$.elements[${ i }]` ) )
			.filter( Boolean ),
	};
	// `for` zeigt auf einen Text, unter dem dieses Dekor liegen darf. Zeigt
	// es ins Leere, ist das ein Tippfehler - und ein Tippfehler in einer
	// Erlaubnis darf keinen ganzen Entwurf kosten. Er faellt hier mit einer
	// Notiz weg; `parent`, `rel.to`, `place.area` und `asset` bleiben
	// streng, denn ohne sie fehlt dem Element sein Platz oder sein Bild.
	const ids = new Set( markup.elements.map( ( e ) => e.id ) );
	for ( const e of markup.elements ) {
		if ( e.for && ! ids.has( e.for ) ) {
			note(
				notes,
				'missing-ref',
				`$.elements[${ e.id }].for`,
				`for ${ e.for } dropped`
			);
			delete e.for;
		}
	}
	return { markup, notes };
}

/** Semantische Prüfung nach cleanMarkup. */
export function validateMarkup( markup, ctx = {} ) {
	const errors = [];
	const err = ( code, path, message ) =>
		errors.push( { code, path, message } );
	const ids = new Set();
	const els = markup.elements || [];
	els.forEach( ( e, i ) => {
		if ( ! e.id ) {
			err( 'missing-id', `$.elements[${ i }]`, 'element without id' );
		} else if ( ids.has( e.id ) ) {
			err( 'dup-id', `$.elements[${ i }]`, `duplicate id ${ e.id }` );
		}
		ids.add( e.id );
	} );
	const areaIds = new Set( ( markup.areas || [] ).map( ( a ) => a.id ) );
	const assetIds = new Set( ( markup.assets || [] ).map( ( a ) => a.id ) );
	const byId = new Map( els.map( ( e ) => [ e.id, e ] ) );
	for ( const e of els ) {
		const path = `$.elements[${ e.id }]`;
		if ( e.parent ) {
			const p = byId.get( e.parent );
			if ( ! p || 'group' !== p.kind ) {
				err(
					'missing-ref',
					path,
					`parent ${ e.parent } is not a group`
				);
			}
		} else if ( ! e.place ) {
			err( 'place-missing', path, 'element needs place or parent' );
		} else {
			if ( e.place.area && ! areaIds.has( e.place.area ) ) {
				err( 'missing-ref', path, `area ${ e.place.area }` );
			}
			if ( e.place.rel && ! byId.has( e.place.rel.to ) ) {
				err( 'missing-ref', path, `rel.to ${ e.place.rel.to }` );
			}
			if ( ( e.place.area || e.place.rel ) && ! e.place.size ) {
				err(
					'size-missing',
					path,
					'place.area and place.rel need size'
				);
			}
		}
		// Ein Text ohne Worte ist kein Entwurf, sondern ein Kasten. Der
		// Compiler malt dafuer den Platzhalter "Text", und genau das stand
		// im dritten Lauf in zwei EINGEFUEGTEN Entwuerfen auf der Leinwand.
		// Ausgenommen ist nur ein gebundener Text: dort kommt die Copy aus
		// dem Beitrag, `content` ist da nur das Beispiel des Autors.
		if (
			'text' === e.kind &&
			! e.bind &&
			! String( e.content || '' ).trim()
		) {
			err( 'empty-content', path, 'text without content' );
		}
		// Dasselbe fuer ein Etikett, das der Autor ausdruecklich leer
		// laesst; ohne `props` steht ohnehin die Vorgabe der Komponente da.
		if (
			'component' === e.kind &&
			! e.bind &&
			[ 'button', 'chip' ].includes( e.type ) &&
			! String( e.props?.label ?? '' ).trim()
		) {
			err( 'empty-label', path, `${ e.type } without a label` );
		}
		if (
			'photo' === e.kind &&
			! e.bind &&
			e.asset &&
			! assetIds.has( e.asset )
		) {
			err( 'missing-ref', path, `asset ${ e.asset }` );
		}
		if ( 'photo' === e.kind && ! e.bind && ! e.asset ) {
			err( 'asset-missing', path, 'photo needs asset or bind' );
		}
		if ( e.bind ) {
			const ok =
				'text' === e.kind || 'component' === e.kind
					? BIND_TEXT.includes( e.bind.id )
					: 'photo' === e.kind
					? BIND_IMAGE.includes( e.bind.id )
					: false;
			if ( ! ok ) {
				err(
					'binding-unknown',
					path,
					`${ e.bind.id } for ${ e.kind }`
				);
			}
		}
	}
	// rel graph acyclic (DFS)
	const state = new Map();
	const visit = ( id, trail ) => {
		if ( 'done' === state.get( id ) ) {
			return;
		}
		if ( 'active' === state.get( id ) ) {
			err(
				'rel-cycle',
				`$.elements[${ id }]`,
				trail.concat( id ).join( ' -> ' )
			);
			return;
		}
		state.set( id, 'active' );
		const e = byId.get( id );
		const next = e?.place?.rel?.to || e?.parent;
		if ( next && byId.has( next ) ) {
			visit( next, trail.concat( id ) );
		}
		state.set( id, 'done' );
	};
	for ( const e of els ) {
		visit( e.id, [] );
	}
	// depth
	for ( const e of els ) {
		let d = 0;
		let cur = e;
		while (
			cur &&
			cur.parent &&
			byId.has( cur.parent ) &&
			d <= LIMITS.depth
		) {
			cur = byId.get( cur.parent );
			d++;
		}
		if ( d > LIMITS.depth ) {
			err(
				'depth',
				`$.elements[${ e.id }]`,
				`deeper than ${ LIMITS.depth }`
			);
		}
	}
	// limits (recursive over the flat list)
	const count = ( pred ) => els.filter( pred ).length;
	if ( els.length > LIMITS.elements ) {
		err( 'limit', '$.elements', `more than ${ LIMITS.elements } elements` );
	}
	if ( count( ( e ) => 'photo' === e.kind ) > LIMITS.photos ) {
		err( 'limit', '$.elements', `more than ${ LIMITS.photos } photos` );
	}
	if ( count( ( e ) => 'text' === e.kind ) > LIMITS.texts ) {
		err( 'limit', '$.elements', `more than ${ LIMITS.texts } texts` );
	}
	if (
		count( ( e ) => 'text' === e.kind && 'hero' === e.voice ) >
		LIMITS.heroes
	) {
		err( 'limit', '$.elements', `more than ${ LIMITS.heroes } hero texts` );
	}
	for ( const e of els ) {
		if ( Math.abs( e.rot ) > LIMITS.rotFree && markup.concept.loud < 4 ) {
			err(
				'rot-loud',
				`$.elements[${ e.id }]`,
				'rotation above 15° needs loud >= 4'
			);
		}
	}
	// required bindings exactly once
	for ( const b of ctx.bindings || [] ) {
		const n = count( ( e ) => e.bind && e.bind.id === b.id );
		if ( 0 === n ) {
			err(
				'binding-missing',
				'$.elements',
				`required binding ${ b.id } not placed`
			);
		} else if ( n > 1 ) {
			err(
				'binding-duplicate',
				'$.elements',
				`binding ${ b.id } placed ${ n } times`
			);
		}
	}
	return { ok: 0 === errors.length, errors };
}
