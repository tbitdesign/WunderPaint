/**
 * Document + layer factories and (de)serialization (spec 02).
 * All coordinates are document pixels.
 */
import { sizedSvgUrl } from '../lib/svg-intrinsic';

export const uid = () => Math.random().toString( 36 ).slice( 2, 9 );

export const defaultAdjustments = () => ( {
	brightness: 0,
	contrast: 0,
	saturation: 0,
	hue: 0,
	temp: 0,
	exposure: 0,
	vibrance: 0,
} );

/**
 * Shared LayerBase fields (spec 02.2).
 * @param type
 * @param name
 * @param rect
 */
const base = ( type, name, rect ) => ( {
	id: uid(),
	type,
	name,
	visible: true,
	locked: false,
	opacity: 1,
	blend: 'normal',
	x: rect.x || 0,
	y: rect.y || 0,
	w: rect.w || 0,
	h: rect.h || 0,
	rot: 0,
	mask: null,
	filter: 'none',
	adjust: null,
	styles: rect.styles || null,
	parent: null,
} );

export const makeShape = ( opts = {} ) => ( {
	...base( 'shape', opts.name || 'Shape', opts ),
	shape: opts.shape || 'rect',
	fill: opts.fill || '#3b66ff',
	stroke: opts.stroke ?? null,
	strokeW: opts.strokeW || 0,
	// Stroke style (dashed | dotted), only stored when explicit so plain
	// solid shapes keep their historic serialized form.
	...( opts.strokeDash ? { strokeDash: opts.strokeDash } : {} ),
	...( opts.strokeDashLen ? { strokeDashLen: opts.strokeDashLen } : {} ),
	...( opts.strokeDashGap ? { strokeDashGap: opts.strokeDashGap } : {} ),
	// Line endpoint decorations (v1.300); only stored when set.
	...( opts.lineFlip ? { lineFlip: true } : {} ),
	...( opts.arrowStart ? { arrowStart: opts.arrowStart } : {} ),
	...( opts.arrowEnd ? { arrowEnd: opts.arrowEnd } : {} ),
	radius: opts.radius || 0,
	sides: opts.sides || 6,
	pattern: opts.pattern || 'none',
	patternData: opts.patternData || null,
	// Fill type (solid | gradient | pattern), gradient fills mirror text.
	// Only stored when explicit; otherwise the renderer/UI derive it from the
	// pattern field, so `{ ...makeShape(), pattern }` still fills the pattern.
	...( opts.fillType ? { fillType: opts.fillType } : {} ),
	gradientStops: opts.gradientStops || null,
	gradientAngle: opts.gradientAngle || 0,
	...( opts.gradientKind ? { gradientKind: opts.gradientKind } : {} ),
	...( opts.pathD ? { pathD: opts.pathD } : {} ),
} );

export const makeText = ( opts = {} ) => ( {
	...base( 'text', opts.name || opts.text || 'Text', {
		w: 300,
		h: 60,
		...opts,
	} ),
	text: opts.text || 'Text',
	fontSize: opts.fontSize || 48,
	fontFamily: opts.fontFamily || 'Inter',
	weight: opts.weight || 700,
	color: opts.color || '#1a1d21',
	align: opts.align || 'left',
	// Vertical anchor for area text; only stored when explicit so plain
	// text layers keep their historic shape (top for fixed width).
	...( opts.valign ? { valign: opts.valign } : {} ),
	letterSpacing: opts.letterSpacing || 0,
	lineHeight: opts.lineHeight || 1.05,
	curve: opts.curve || 0,
	italic: !! opts.italic,
	underline: !! opts.underline,
	// Non-destructive all-caps (v1.300); only stored when set.
	...( opts.textTransform ? { textTransform: opts.textTransform } : {} ),
	// Non-destructive list markers (v1.301): bullet | number.
	...( opts.listStyle ? { listStyle: opts.listStyle } : {} ),
	fixedWidth: !! opts.fixedWidth,
	outlineColor: opts.outlineColor || null,
	outlineW: opts.outlineW || 0,
	...( opts.outlineDash ? { outlineDash: opts.outlineDash } : {} ),
	...( opts.outlineDashLen ? { outlineDashLen: opts.outlineDashLen } : {} ),
	...( opts.outlineDashGap ? { outlineDashGap: opts.outlineDashGap } : {} ),
	shadowOn: !! opts.shadowOn,
	shadowColor: opts.shadowColor || '#000000',
	bgColor: opts.bgColor || null,
	bgRadius: opts.bgRadius ?? 8,
	fillType: opts.fillType || 'solid',
	gradientStops: opts.gradientStops || null,
	gradientAngle: opts.gradientAngle || 0,
	pattern: opts.pattern || 'none',
	patternData: opts.patternData || null,
} );

export const makeStroke = ( opts = {} ) => ( {
	...base(
		'stroke',
		opts.name || ( opts.erase ? 'Eraser' : 'Stroke' ),
		opts
	),
	paths: opts.paths || [],
	erase: !! opts.erase,
} );

export const makeGradient = ( opts = {} ) => ( {
	...base( 'gradient', opts.name || 'Gradient', opts ),
	kind: opts.kind || 'linear',
	stops: opts.stops || [
		{ color: '#3b66ff', at: 0 },
		{ color: 'rgba(59,102,255,0)', at: 1 },
	],
	from: opts.from || { x: 0, y: 0 },
	to: opts.to || { x: opts.w || 0, y: opts.h || 0 },
} );

export const makeAdjustment = ( opts = {} ) => ( {
	...base( 'adjustment', opts.name || 'Adjustment', opts ),
	adjust: { ...defaultAdjustments(), ...( opts.adjust || {} ) },
	filter: opts.filter || 'none',
	clip: !! opts.clip,
} );

export const makeGroup = ( opts = {} ) => ( {
	...base( 'group', opts.name || 'Group', opts ),
	children: opts.children || [],
	isOpen: opts.isOpen !== false,
} );

export const makeSmart = ( opts = {} ) => ( {
	...base( 'smart', opts.name || 'Smart Object', opts ),
	src: opts.src || '',
	embedded: opts.embedded || { kind: 'image', bytes: null },
	srcW: opts.srcW || opts.w || 0,
	srcH: opts.srcH || opts.h || 0,
	smartFilters: opts.smartFilters || [],
} );

export const makeImage = ( opts = {} ) => ( {
	...base( 'image', opts.name || 'Image', opts ),
	src: opts.src || '',
	naturalW: opts.naturalW || opts.w || 0,
	naturalH: opts.naturalH || opts.h || 0,
	crossOrigin: opts.crossOrigin || undefined,
	// Cover is the default for NEW image layers (v1.116.2): resizing the
	// box crops instead of distorting, double-click repositions. Layers
	// saved without the field keep the legacy stretch behavior.
	imageFit: opts.imageFit || { mode: 'cover', ax: 0.5, ay: 0.5 },
} );

/**
 * A transparent, editable pixel layer (spec 02.2 raster). The live canvas is
 * created lazily in the browser; `dataUrl` is the serialized form.
 * @param opts
 */
export const makeRaster = ( opts = {} ) => ( {
	...base( 'raster', opts.name || 'Layer', opts ),
	canvas: opts.canvas || null,
	dataUrl: opts.dataUrl || null,
} );

/**
 * Blank document (Create dialog / bootstrap fallback).
 * @param opts
 */
export const createBlankDoc = ( opts = {} ) => ( {
	id: uid(),
	name: opts.name || 'untitled',
	w: opts.w || 1080,
	h: opts.h || 1080,
	bg: opts.bg || '#ffffff',
	dpi: opts.dpi || 72,
	colorMode: opts.colorMode || 'rgb8',
	source: {
		attachmentId: opts.attachmentId || 0,
		isNew: opts.isNew !== false,
		originalUrl: opts.originalUrl || null,
		psd: !! opts.psd,
	},
} );

/**
 * Load an HTMLImageElement (browser only).
 *
 * An SVG exported with only a viewBox has NO intrinsic size, and every
 * canvas draw then guesses the raster size from its destination surface
 * (v1.334.0). Such a file is decoded from a copy that carries a size, so
 * measuring it and drawing it agree everywhere - the batch watermarker
 * stamps a logo through this helper.
 *
 * @param src
 * @param crossOrigin
 */
export const loadImage = async ( src, crossOrigin ) => {
	const objectUrl = await sizedSvgUrl( src );
	return new Promise( ( resolve, reject ) => {
		const img = new window.Image();
		if ( crossOrigin ) {
			img.crossOrigin = 'anonymous';
		}
		const settle = ( finish, value ) => {
			if ( objectUrl ) {
				// The decoded image keeps the document, the copy is done.
				window.URL.revokeObjectURL( objectUrl );
			}
			finish( value );
		};
		img.onload = () => settle( resolve, img );
		img.onerror = () =>
			settle( reject, new Error( 'Could not load image: ' + src ) );
		img.src = objectUrl || src;
	} );
};

/**
 * Build {doc, layers} from window.WPIE (spec 02.5), in priority order:
 * sidecar project → attachment image → blank. PSD sidecars are parsed via
 * the injected loader (wired when lib/psd.js exists) to avoid an eager dep.
 *
 * @param {Object} WPIE    Bootstrap payload.
 * @param {Object} loaders Optional { fetchJson(url), loadPsd(url) }.
 * @return {Promise<{doc: Object, layers: Array}>} Document + layers.
 */
export async function createDocFromBootstrap( WPIE, loaders = {} ) {
	const boot = WPIE.doc || {};

	// 1. Sidecar project (layered re-open).
	if ( boot.project ) {
		try {
			if ( boot.project.json && loaders.fetchJson ) {
				const project = await loaders.fetchJson( boot.project.json );
				if (
					project &&
					project.doc &&
					Array.isArray( project.layers )
				) {
					const layers = loaders.hydrateLayers
						? await loaders.hydrateLayers( project.layers )
						: project.layers;
					return {
						doc: {
							...project.doc,
							source: {
								...project.doc.source,
								attachmentId: WPIE.attachmentId,
								isNew: false,
							},
						},
						layers,
					};
				}
			}
			if ( boot.project.psd && loaders.loadPsd ) {
				return await loaders.loadPsd( boot.project.psd );
			}
		} catch ( e ) {
			// Fall through to the flattened image (never block opening).
			// eslint-disable-next-line no-console
			console.warn(
				'WPIE: could not restore layered project, falling back to flat image.',
				e
			);
		}
	}

	// 2. Existing attachment image.
	if ( boot.img ) {
		const src =
			boot.imgCrossOrigin && WPIE.proxyUrl
				? `${ WPIE.proxyUrl }?src=${ encodeURIComponent(
						boot.img
				  ) }&_wpnonce=${ WPIE.nonce }`
				: boot.img;
		const doc = createBlankDoc( {
			name: boot.name,
			w: boot.w,
			h: boot.h,
			bg: boot.bg || 'transparent',
			attachmentId: WPIE.attachmentId,
			isNew: false,
			originalUrl: boot.img,
		} );
		const layers = [
			makeShape( {
				name: 'Background',
				x: 0,
				y: 0,
				w: doc.w,
				h: doc.h,
				shape: 'rect',
				fill: doc.bg === 'transparent' ? 'transparent' : doc.bg,
			} ),
			makeImage( {
				name: doc.name,
				x: 0,
				y: 0,
				w: doc.w,
				h: doc.h,
				src,
				naturalW: boot.w,
				naturalH: boot.h,
				crossOrigin: 'anonymous',
			} ),
		];
		return { doc, layers };
	}

	// 3. New blank document.
	const doc = createBlankDoc( {
		name: boot.name || 'untitled',
		w: boot.w,
		h: boot.h,
		bg: boot.bg || '#ffffff',
		isNew: true,
	} );
	return { doc, layers: [] };
}

// New documents start with an empty layer stack: the background color
// lives on doc.bg (rendered/exported by the pipeline) instead of a
// redundant "Background" shape layer (v1.153.2); Image → Colors →
// Change Background Color edits it later.

/**
 * Serialize layers for history snapshots / projectJson: live raster canvases
 * and masks become PNG data URLs (spec 02.2).
 *
 * @param {Array} layers Layers.
 * @return {Array} Plain-data layers.
 */
// Serialization memo (v1.130.0): every COMMIT serializes the whole layer
// list, and encoding an untouched 4k raster canvas to PNG on each brush
// stroke is the single biggest commit cost. Layer objects are immutable
// in the store - every mutation (including in-place canvas painting,
// which always ends in an UPDATE_LAYER poke) produces a NEW object - so
// object identity is a safe cache key. Snapshots are read-only, sharing
// the cached plain object across history entries is fine.
const serializeCache = new WeakMap();

export function serializeLayers( layers ) {
	return layers.map( ( layer ) => {
		const cached = serializeCache.get( layer );
		if ( cached ) {
			return cached;
		}
		const copy = { ...layer };
		delete copy.previewEffect; // transient (effect dialog live preview)
		if ( copy.canvas ) {
			if ( typeof copy.canvas.toDataURL === 'function' ) {
				copy.dataUrl = copy.canvas.toDataURL( 'image/png' );
			}
			delete copy.canvas;
		}
		if ( copy.mask ) {
			copy.mask = { ...copy.mask };
			if ( copy.mask.canvas ) {
				if ( typeof copy.mask.canvas.toDataURL === 'function' ) {
					copy.mask.data = copy.mask.canvas.toDataURL( 'image/png' );
				}
				delete copy.mask.canvas;
			}
		}
		if ( copy.paths ) {
			copy.paths = copy.paths.map( ( p ) => ( { ...p } ) );
		}
		if ( copy.lineStyles ) {
			copy.lineStyles = copy.lineStyles.map( ( s ) =>
				s ? { ...s } : s
			);
		}
		if ( copy.stops ) {
			copy.stops = copy.stops.map( ( s ) => ( { ...s } ) );
		}
		if ( copy.adjust ) {
			copy.adjust = { ...copy.adjust };
		}
		if ( copy.styles ) {
			copy.styles = JSON.parse( JSON.stringify( copy.styles ) );
		}
		if ( copy.children ) {
			copy.children = [ ...copy.children ];
		}
		if ( copy.smartFilters ) {
			copy.smartFilters = copy.smartFilters.map( ( f ) => ( {
				...f,
				params: { ...f.params },
			} ) );
		}
		if ( copy.embedded && copy.embedded.bytes ) {
			// ArrayBuffers survive by reference (immutable for our purposes).
			copy.embedded = { ...copy.embedded };
		}
		serializeCache.set( layer, copy );
		return copy;
	} );
}

/**
 * Rebuild live canvases from serialized dataUrls (async; browser only).
 *
 * @param {Array} layers Serialized layers.
 * @return {Promise<Array>} Layers with canvases restored.
 */
export async function hydrateLayers( layers ) {
	// Pre-decode embedded user pattern tiles (v1.1) so the first sync
	// render already paints them.
	{
		const { registerUserTile } = require( '../lib/raster' );
		const tiles = [];
		for ( const layer of layers || [] ) {
			if ( layer?.patternData ) {
				tiles.push( layer.patternData );
			}
			if ( layer?.styles?.patternOverlay?.patternData ) {
				tiles.push( layer.styles.patternOverlay.patternData );
			}
		}
		await Promise.all( tiles.map( ( t ) => registerUserTile( t ) ) );
	}
	const { sanitizeSpanStyle } = require( '../lib/rich-text' );
	return Promise.all(
		layers.map( async ( layer ) => {
			const copy = { ...layer };
			// Defence-in-depth (security): text run/line styles can arrive
			// verbatim from an opened project/template; scrub their string
			// fields so no value can ever carry markup into the edit overlay.
			if ( Array.isArray( copy.spans ) ) {
				copy.spans = copy.spans.map( ( run ) =>
					run && run.s
						? { ...run, s: sanitizeSpanStyle( run.s ) }
						: run
				);
			}
			if ( Array.isArray( copy.lineStyles ) ) {
				copy.lineStyles = copy.lineStyles.map( ( ls ) =>
					ls ? sanitizeSpanStyle( ls ) : ls
				);
			}
			if ( 'raster' === copy.type && copy.dataUrl && ! copy.canvas ) {
				try {
					const img = await loadImage( copy.dataUrl );
					const canvas = document.createElement( 'canvas' );
					canvas.width = img.naturalWidth;
					canvas.height = img.naturalHeight;
					canvas.getContext( '2d' ).drawImage( img, 0, 0 );
					copy.canvas = canvas;
				} catch ( e ) {
					// Keep dataUrl; renderer will skip until hydrated.
				}
			}
			// Masks must come back as live canvases too, painting on the
			// mask targets mask.canvas directly (v1.11.2).
			if ( copy.mask?.data && ! copy.mask.canvas ) {
				try {
					const img = await loadImage( copy.mask.data );
					const canvas = document.createElement( 'canvas' );
					canvas.width = img.naturalWidth;
					canvas.height = img.naturalHeight;
					canvas.getContext( '2d' ).drawImage( img, 0, 0 );
					copy.mask = { ...copy.mask, canvas };
				} catch ( e ) {
					// Renderer falls back to the cached data URL.
				}
			}
			return copy;
		} )
	);
}
