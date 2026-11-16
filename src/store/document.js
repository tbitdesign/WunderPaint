/**
 * Document + layer factories and (de)serialization (spec 02).
 * All coordinates are document pixels.
 */
import { __ } from '@wordpress/i18n';

import { sizedSvgUrl } from '../lib/svg-intrinsic';
import { heicUrlToImage, isHeicUrl } from '../lib/heic';

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
	...( opts.strokeGradient ? { strokeGradient: opts.strokeGradient } : {} ),
	// Stroke position (v1.430): inside | outside; only stored when set.
	...( opts.strokeAlign ? { strokeAlign: opts.strokeAlign } : {} ),
	...( opts.strokeCap ? { strokeCap: opts.strokeCap } : {} ),
	...( opts.strokeJoin ? { strokeJoin: opts.strokeJoin } : {} ),
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
	// Dials of a dynamic shape (shape-dynamics.js); absent = defaults.
	...( opts.shapeParams ? { shapeParams: opts.shapeParams } : {} ),
	pattern: opts.pattern || 'none',
	patternData: opts.patternData || null,
	// Fill type (solid | gradient | pattern), gradient fills mirror text.
	// Only stored when explicit; otherwise the renderer/UI derive it from the
	// pattern field, so `{ ...makeShape(), pattern }` still fills the pattern.
	...( opts.fillType ? { fillType: opts.fillType } : {} ),
	gradientStops: opts.gradientStops || null,
	gradientAngle: opts.gradientAngle || 0,
	...( opts.gradientKind ? { gradientKind: opts.gradientKind } : {} ),
	// Fill rule (v1.431): only 'evenodd' is ever stored; nonzero is the default.
	...( 'evenodd' === opts.fillRule ? { fillRule: 'evenodd' } : {} ),
	...( opts.pathD ? { pathD: opts.pathD } : {} ),
	// The visible path stays portable; penPath retains the editable centerline.
	...( opts.penPath ? { penPath: opts.penPath } : {} ),
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
	...( opts.paragraphSpacing
		? { paragraphSpacing: opts.paragraphSpacing }
		: {} ),
	curve: opts.curve || 0,
	italic: !! opts.italic,
	underline: !! opts.underline,
	...( opts.strike ? { strike: true } : {} ),
	// Non-destructive all-caps (v1.300); only stored when set.
	...( opts.textTransform ? { textTransform: opts.textTransform } : {} ),
	// Non-destructive list markers (v1.301): bullet | number.
	...( opts.listStyle ? { listStyle: opts.listStyle } : {} ),
	// Fluid Text (v1.429): the box sets line breaks and sizes; only stored when on.
	...( opts.textFit ? { textFit: opts.textFit } : {} ),
	fixedWidth: !! opts.fixedWidth,
	outlineColor: opts.outlineColor || null,
	outlineW: opts.outlineW || 0,
	...( opts.strokeGradient ? { strokeGradient: opts.strokeGradient } : {} ),
	...( opts.outlineDash ? { outlineDash: opts.outlineDash } : {} ),
	...( opts.outlineDashLen ? { outlineDashLen: opts.outlineDashLen } : {} ),
	...( opts.outlineDashGap ? { outlineDashGap: opts.outlineDashGap } : {} ),
	shadowOn: !! opts.shadowOn,
	shadowColor: opts.shadowColor || '#000000',
	bgColor: opts.bgColor || null,
	bgRadius: opts.bgRadius ?? 8,
	fillType: opts.fillType || 'solid',
	...( opts.gradientKind ? { gradientKind: opts.gradientKind } : {} ),
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
	spread: opts.spread || 'pad',
	...( opts.freeform ? { freeform: opts.freeform } : {} ),
	...( opts.mesh ? { mesh: opts.mesh } : {} ),
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
 * A Repeat layer (v1.431): stamps its source after a rule. The box is
 * derived from the copies (store/repeat-sync.js keeps it current); the
 * defaults for rule and progression come from lib/repeat-layer.js, passed
 * in by the op that creates the layer, so this module stays free of that
 * import.
 * @param opts
 */
export const makeRepeat = ( opts = {} ) => ( {
	...base( 'repeat', opts.name || 'Repeat', opts ),
	sourceId: opts.sourceId || null,
	stack: 'front' === opts.stack ? 'front' : 'behind',
	rule: opts.rule || { mode: 'row', count: 3, dx: 40, dy: 0 },
	progression: opts.progression || null,
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
/**
 * Image hosts whose pixels must always be read with CORS.
 *
 * Since the studio hotlinks stock photos instead of proxying them, a layer can
 * carry a provider URL, and that layer is loaded again by every path that
 * reopens a document, not only by the picker that inserted it. Forgetting the
 * flag in one of those places would taint the canvas and break the export far
 * away from the cause, so the rule lives here rather than at twenty call
 * sites.
 *
 * Deliberately a short list and not "every foreign host": switching CORS on
 * for a host that does not answer with the header turns a picture that used to
 * load into one that does not load at all. These three were measured on
 * 2026-08-07 and all answer with access-control-allow-origin: *.
 */
const CORS_HOSTS = [
	'images.pexels.com',
	'pixabay.com',
	'cdn.pixabay.com',
	'images.unsplash.com',
	'plus.unsplash.com',
];

const needsCors = ( src ) => {
	if ( 'string' !== typeof src || ! /^https:\/\//.test( src ) ) {
		return false;
	}
	try {
		return CORS_HOSTS.includes( new window.URL( src ).hostname );
	} catch ( e ) {
		return false;
	}
};

export const loadImage = async ( src, crossOrigin ) => {
	const objectUrl = await sizedSvgUrl( src );
	return new Promise( ( resolve, reject ) => {
		const img = new window.Image();
		if ( crossOrigin || needsCors( src ) ) {
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
		let src =
			boot.imgCrossOrigin && WPIE.proxyUrl
				? `${ WPIE.proxyUrl }?src=${ encodeURIComponent(
						boot.img
				  ) }&_wpnonce=${ WPIE.nonce }`
				: boot.img;
		let w = boot.w,
			h = boot.h;
		// A HEIC attachment (WordPress counts it as an image, but only Safari
		// can show it): decoded once here, the layer carries a JPEG. Its size
		// comes from the pixels, because a server without HEIC support saved
		// no width or height for it.
		if ( isHeicUrl( boot.img ) ) {
			try {
				const pic = await heicUrlToImage( src );
				src = pic.src;
				w = pic.width;
				h = pic.height;
			} catch ( e ) {
				// Fall through: the layer shows the usual "could not load".
			}
		}
		const doc = createBlankDoc( {
			name: boot.name,
			w,
			h,
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
				naturalW: w,
				naturalH: h,
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
			return settleLayer( cached );
		}
		const copy = serializeCopy( settleLayer( layer ), false );
		serializeCache.set( layer, copy );
		return copy;
	} );
}

/*
 * HISTORY SNAPSHOTS WITHOUT A PNG IN THE WAY (Thomas, 16.10.2026: the
 * brushes "haken"). A commit serialized every changed raster to PNG on the
 * spot, on the main thread: 22 to 40 ms for a fresh paint layer, a quarter
 * to half a second for a photo-sized one (measured 241 ms at 3000 x 2000,
 * 486 ms at 4000 x 3000) - after every stroke, every bake of a drying
 * wash, right when the hand starts the next one. snapshotLayers() freezes
 * a COPY of the pixels instead (one blit) and the PNG is made in the
 * background, in a worker where the browser has one. Whoever needs the
 * data URL before that - save, export, a page switch - settles the copy
 * on the spot, exactly the old cost and nothing more; undo gets the frozen
 * pixels back as a live canvas without decoding anything.
 */
const encodeQueue = [];
let encodeBusy = false;
// Frozen pixels waiting for their PNG, in bytes, and the canvases they
// are. Past the cap a commit encodes on the spot again, as it always did:
// a document of fifty photo layers must not hold fifty raw copies at once.
const FROZEN_CAP = 192 * 1024 * 1024;
let frozenBytes = 0;
const frozenPending = new WeakSet();

/**
 * A frozen copy for a snapshot, counted against the cap; null past it.
 *
 * @param {HTMLCanvasElement} canvas Source.
 * @return {HTMLCanvasElement|null} The copy.
 */
function freezePending( canvas ) {
	const bytes = canvas.width * canvas.height * 4;
	if ( frozenBytes + bytes > FROZEN_CAP ) {
		return null;
	}
	const copy = freezeCanvas( canvas );
	if ( copy ) {
		frozenBytes += bytes;
		frozenPending.add( copy );
	}
	return copy;
}

/**
 * A frozen copy got its PNG (or was dropped): off the count.
 *
 * @param {HTMLCanvasElement} canvas The frozen copy.
 */
function thaw( canvas ) {
	if ( canvas && frozenPending.delete( canvas ) ) {
		frozenBytes -= canvas.width * canvas.height * 4;
	}
}

/**
 * A private copy of a canvas, or null where the environment cannot make
 * one (the caller then encodes on the spot, as before).
 *
 * @param {HTMLCanvasElement} canvas Source.
 * @return {HTMLCanvasElement|null} The copy.
 */
function freezeCanvas( canvas ) {
	try {
		const copy = document.createElement( 'canvas' );
		copy.width = canvas.width;
		copy.height = canvas.height;
		const ctx = copy.getContext( '2d' );
		if ( ! ctx ) {
			return null;
		}
		ctx.drawImage( canvas, 0, 0 );
		return copy;
	} catch ( e ) {
		return null;
	}
}

/**
 * Encode a serialized layer's frozen pixels now, if any wait (layer and
 * mask). Safe on anything: a layer without frozen pixels comes back as is.
 *
 * @param {Object} copy A serialized layer.
 * @return {Object} The same object, settled.
 */
export function settleLayer( copy ) {
	if ( copy?.pixels ) {
		copy.dataUrl = copy.pixels.toDataURL( 'image/png' );
		thaw( copy.pixels );
		delete copy.pixels;
	}
	if ( copy?.mask?.pixels ) {
		copy.mask.data = copy.mask.pixels.toDataURL( 'image/png' );
		thaw( copy.mask.pixels );
		delete copy.mask.pixels;
	}
	return copy;
}

/**
 * Serialize layers for a HISTORY snapshot: like serializeLayers, but a
 * raster that needs encoding keeps frozen pixels (`pixels`, `mask.pixels`)
 * until the background encoder - or the first caller that needs the data
 * URL - turns them into one. Shares serializeLayers' cache, so a later
 * save of the same layer object finds the work done.
 *
 * @param {Array} layers Live layers.
 * @return {Array} Snapshot layers.
 */
export function snapshotLayers( layers ) {
	return layers.map( ( layer ) => {
		const cached = serializeCache.get( layer );
		if ( cached ) {
			return cached;
		}
		const copy = serializeCopy( settleLayer( layer ), true );
		serializeCache.set( layer, copy );
		if ( copy.pixels || copy.mask?.pixels ) {
			encodeQueue.push( copy );
			encodeLater();
		}
		return copy;
	} );
}

/**
 * Layers of a history snapshot, ready to be live again. Frozen pixels
 * (snapshotLayers, still encoding) come back as live canvases at once - a
 * COPY, so painting on the restored layer can never reach into history.
 * Everything else is as before: data URLs, hydrated afterwards.
 *
 * @param {Array} layers Snapshot layers.
 * @return {Array} Layers for the live state.
 */
export function restoreLayers( layers ) {
	return layers.map( ( copy ) => {
		if ( copy.pixels && 'raster' !== copy.type ) {
			// Only rasters come back as canvases, as hydrateLayers does it.
			settleLayer( copy );
		}
		if ( ! copy.pixels && ! copy.mask?.pixels ) {
			return copy;
		}
		const live = { ...copy };
		if ( live.pixels ) {
			live.canvas = freezeCanvas( live.pixels );
			delete live.pixels;
			if ( ! live.canvas ) {
				return settleLayer( copy );
			}
		}
		if ( live.mask?.pixels ) {
			const canvas = freezeCanvas( live.mask.pixels );
			live.mask = { ...live.mask, canvas };
			delete live.mask.pixels;
			if ( ! canvas ) {
				return settleLayer( copy );
			}
		}
		// Until something changes it, the restored layer IS that snapshot.
		serializeCache.set( live, copy );
		return live;
	} );
}

function encodeLater() {
	if ( encodeBusy || ! encodeQueue.length ) {
		return;
	}
	encodeBusy = true;
	const idle =
		'function' === typeof window.requestIdleCallback
			? ( fn ) => window.requestIdleCallback( fn, { timeout: 2000 } )
			: ( fn ) => window.setTimeout( fn, 100 );
	idle( () => {
		const copy = encodeQueue.shift();
		encodeInBackground( copy )
			.catch( () => {} )
			.then( () => {
				encodeBusy = false;
				encodeLater();
			} );
	} );
}

/**
 * Turn a snapshot copy's frozen pixels into data URLs off the main thread
 * where possible; a copy settled meanwhile (save, export) keeps that.
 *
 * @param {Object} copy A snapshot layer.
 */
async function encodeInBackground( copy ) {
	const { encodeCanvasBlob } = require( '../lib/raster/encode-worker' );
	for ( const [ holder, out ] of [
		[ copy, 'dataUrl' ],
		[ copy.mask, 'data' ],
	] ) {
		const pixels = holder?.pixels;
		if ( ! pixels ) {
			continue;
		}
		const blob = await encodeCanvasBlob( pixels, 'image/png' );
		if ( ! blob ) {
			continue;
		}
		const url = await new Promise( ( resolve, reject ) => {
			const reader = new window.FileReader();
			reader.onload = () => resolve( reader.result );
			reader.onerror = reject;
			reader.readAsDataURL( blob );
		} );
		if ( holder.pixels === pixels && 'string' === typeof url ) {
			holder[ out ] = url;
			thaw( pixels );
			delete holder.pixels;
		}
	}
}

/**
 * One layer as plain data; `deferred` keeps frozen pixels instead of
 * encoding them (snapshotLayers).
 *
 * @param {Object}  layer    Live layer.
 * @param {boolean} deferred Freeze instead of encode.
 * @return {Object} The serialized copy.
 */
function serializeCopy( layer, deferred ) {
	const copy = { ...layer };
	delete copy.previewEffect; // transient (effect dialog live preview)
	if ( copy.canvas ) {
		if ( typeof copy.canvas.toDataURL === 'function' ) {
			const frozen = deferred ? freezePending( copy.canvas ) : null;
			if ( frozen ) {
				copy.pixels = frozen;
				delete copy.dataUrl;
			} else {
				copy.dataUrl = copy.canvas.toDataURL( 'image/png' );
			}
		}
		delete copy.canvas;
	}
	if ( copy.mask ) {
		copy.mask = { ...copy.mask };
		if ( copy.mask.canvas ) {
			if ( typeof copy.mask.canvas.toDataURL === 'function' ) {
				const frozen = deferred
					? freezePending( copy.mask.canvas )
					: null;
				if ( frozen ) {
					copy.mask.pixels = frozen;
					delete copy.mask.data;
				} else {
					copy.mask.data = copy.mask.canvas.toDataURL( 'image/png' );
				}
			}
			delete copy.mask.canvas;
		}
	}
	if ( copy.paths ) {
		copy.paths = copy.paths.map( ( p ) => ( { ...p } ) );
	}
	if ( copy.lineStyles ) {
		copy.lineStyles = copy.lineStyles.map( ( s ) => ( s ? { ...s } : s ) );
	}
	if ( copy.stops ) {
		copy.stops = copy.stops.map( ( s ) => ( { ...s } ) );
	}
	for ( const key of [ 'freeform', 'mesh', 'colorLinks' ] ) {
		if ( copy[ key ] ) {
			copy[ key ] = JSON.parse( JSON.stringify( copy[ key ] ) );
		}
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
	return copy;
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
			if (
				copy.embedded &&
				( copy.embedded.bytesB64 || copy.embedded.bytes )
			) {
				copy.embedded = { ...copy.embedded };
				const b = copy.embedded.bytes;
				if ( copy.embedded.bytesB64 ) {
					copy.embedded.bytes = base64ToBytes(
						copy.embedded.bytesB64
					);
					delete copy.embedded.bytesB64;
				} else if (
					b &&
					'object' === typeof b &&
					! ( b instanceof ArrayBuffer ) &&
					! ArrayBuffer.isView( b )
				) {
					// A typed array that went through JSON before this fix:
					// an object of numeric keys, or `{}` for an ArrayBuffer
					// whose bytes are gone for good.
					const keys = Object.keys( b );
					copy.embedded.bytes = keys.length
						? Uint8Array.from( keys.map( ( k ) => b[ k ] ) )
						: null;
				}
			}
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
			// A snapshot still encoding (snapshotLayers) has its pixels at
			// hand: a copy of them, nothing to decode.
			if ( copy.pixels ) {
				if ( 'raster' === copy.type && ! copy.canvas ) {
					copy.canvas = freezeCanvas( copy.pixels );
					delete copy.pixels;
				} else {
					copy.dataUrl = copy.pixels.toDataURL( 'image/png' );
					delete copy.pixels;
				}
			}
			if ( copy.mask?.pixels && ! copy.mask.canvas ) {
				copy.mask = {
					...copy.mask,
					canvas: freezeCanvas( copy.mask.pixels ),
				};
				delete copy.mask.pixels;
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

/**
 * The whole document, pages included, in the shape every transport uses.
 *
 * A multi-page design keeps the OPEN page in `state.doc`/`state.layers` and
 * the others in `state.pages.list`. Three transports serialized only the open
 * one: parking a tab (app.jsx), the autosave (editor-main.jsx) and the .wpie
 * download, whose own comment says "the whole document". So switching tabs and
 * back left a five-page design with one page, and saving that over the stored
 * design made the loss permanent. saveDesignOp() had it right all along -
 * this is that code, in one place the others can use.
 *
 * @param {Object} state Editor state.
 * @return {Object} { doc, layers, pages?, currentPage? }
 */
export function serializeDocument( state ) {
	const out = {
		doc: { ...state.doc },
		layers: portableLayers( serializeLayers( state.layers ) ),
	};
	if ( state.pages ) {
		// The live page is the authority for its slot; the stored copy in the
		// list is whatever it looked like when the user last left it.
		const list = state.pages.list.map( ( page ) =>
			page && page.layers
				? { ...page, layers: portableLayers( page.layers ) }
				: page
		);
		list[ state.pages.current ] = {
			doc: { ...state.doc },
			layers: out.layers,
		};
		out.pages = list;
		out.currentPage = state.pages.current;
	}
	return out;
}

/* ------------------------- portable binary fields ----------------------- */

const B64_CHUNK = 0x8000;

/** Bytes (ArrayBuffer or view) as base64, in chunks so a 20 MB buffer does not blow the call stack. */
export function bytesToBase64( bytes ) {
	const u8 =
		bytes instanceof Uint8Array
			? bytes
			: new Uint8Array( bytes.buffer || bytes );
	let s = '';
	for ( let i = 0; i < u8.length; i += B64_CHUNK ) {
		s += String.fromCharCode.apply( null, u8.subarray( i, i + B64_CHUNK ) );
	}
	return window.btoa( s );
}

export function base64ToBytes( b64 ) {
	const s = window.atob( b64 );
	const u8 = new Uint8Array( s.length );
	for ( let i = 0; i < s.length; i++ ) {
		u8[ i ] = s.charCodeAt( i );
	}
	return u8;
}

/**
 * Serialized layers made safe for JSON. The history keeps a smart object's
 * embedded bytes by reference (cheap, immutable), but JSON turns a typed
 * array into an object of numeric keys and an ArrayBuffer into `{}` - and
 * every transport of a document goes through JSON at some point (a parked
 * tab, a .wpie file, a saved design). So the transports carry the bytes as
 * base64 and hydrateLayers() turns them back.
 *
 * @param {Array} layers Serialized layers.
 * @return {Array} Layers, embedded bytes as `bytesB64`.
 */
export function portableLayers( layers ) {
	return ( layers || [] ).map( ( layer ) => {
		const bytes = layer?.embedded?.bytes;
		if (
			! bytes ||
			! ( bytes instanceof ArrayBuffer || ArrayBuffer.isView( bytes ) )
		) {
			return layer;
		}
		return {
			...layer,
			embedded: {
				...layer.embedded,
				bytes: null,
				bytesB64: bytesToBase64( bytes ),
			},
		};
	} );
}

/* ------------------------------ format ---------------------------------- */

/**
 * The project format this build writes: a saved design, a template, a
 * .wpie file. The number travels as `wpie` in every payload (LUECKE-04,
 * 10.09.2026). The designs and templates on the server carried no marker at
 * all, so an older editor opened whatever a newer one had saved and
 * silently dropped what it did not know. A payload without the field is
 * format 1; one from a later format is refused instead of half-hydrated.
 */
export const PROJECT_FORMAT = 2;

/**
 * @param {Object} data Parsed project payload.
 * @return {Object} The same payload.
 * @throws {Error} When it comes from a newer format than this build knows.
 */
export function checkProjectFormat( data ) {
	const format = Number( data?.wpie ) || 1;
	if ( format > PROJECT_FORMAT ) {
		throw new Error(
			__(
				'This design was saved by a newer version of WunderPaint. Update the plugin to open it.',
				'wunderpaint'
			)
		);
	}
	return data;
}
