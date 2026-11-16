/**
 * Local face finding (20.10.2026) for the Collage focus and Blur Faces:
 * YuNet (OpenCV Zoo, MIT, Shiqi Yu et al.), a small detector that ships
 * inside the plugin in assets/models/ and runs on the bundled
 * onnxruntime-web - nothing is fetched from anywhere but the site itself,
 * and nothing has to be downloaded first. The decoding, the tiling and the
 * crop math are pure and tested; only detectFaces() and findAllFaces()
 * touch the runtime, and load it when they are called, so the collage
 * engine can use faceAnchor() without it.
 */

/** The model's fixed input: a square of this size, image top left. */
export const FACE_INPUT = 640;
const STRIDES = [ 8, 16, 32 ];
export const FACE_MODEL_PATH =
	'assets/models/face_detection_yunet_2023mar.onnx';

const clamp = ( v, lo, hi ) => Math.min( hi, Math.max( lo, v ) );

/**
 * Overlap of two boxes, intersection over union.
 *
 * @param {Object} a { x1, y1, x2, y2 }.
 * @param {Object} b The other box.
 * @return {number} 0 to 1.
 */
export function iou( a, b ) {
	const w = Math.min( a.x2, b.x2 ) - Math.max( a.x1, b.x1 );
	const h = Math.min( a.y2, b.y2 ) - Math.max( a.y1, b.y1 );
	if ( w <= 0 || h <= 0 ) {
		return 0;
	}
	const inter = w * h;
	const area = ( r ) => ( r.x2 - r.x1 ) * ( r.y2 - r.y1 );
	return inter / ( area( a ) + area( b ) - inter );
}

/**
 * Keep the best of overlapping boxes.
 *
 * @param {Array}  boxes     [{ x1, y1, x2, y2, score }].
 * @param {number} threshold Overlap above which the weaker box goes.
 * @return {Array} The kept boxes, best first.
 */
export function nms( boxes, threshold = 0.3 ) {
	const sorted = [ ...boxes ].sort( ( a, b ) => b.score - a.score );
	const kept = [];
	for ( const box of sorted ) {
		if ( kept.every( ( k ) => iou( k, box ) <= threshold ) ) {
			kept.push( box );
		}
	}
	return kept;
}

/**
 * Faces from the model's raw outputs (the decoding OpenCV's
 * FaceDetectorYN uses for this model): per stride a grid of cells, each
 * with a class and an objectness score, a box offset and size.
 *
 * @param {Object} out       Output name -> { data } (cls_8, obj_8, bbox_8 …).
 * @param {Object} opts      Options.
 * @param {number} opts.size Input side the model saw.
 * @param {number} opts.min  Lowest score kept.
 * @param {number} opts.nms  Overlap threshold.
 * @return {Array} [{ x1, y1, x2, y2, score }] in input pixels, best first.
 */
export function decodeYunet(
	out,
	{ size = FACE_INPUT, min = 0.6, nms: overlap = 0.3 } = {}
) {
	const boxes = [];
	for ( const stride of STRIDES ) {
		const cols = Math.floor( size / stride );
		const cls = out[ 'cls_' + stride ]?.data;
		const obj = out[ 'obj_' + stride ]?.data;
		const bbox = out[ 'bbox_' + stride ]?.data;
		if ( ! cls || ! obj || ! bbox ) {
			continue;
		}
		for ( let i = 0; i < cls.length; i++ ) {
			const score = Math.sqrt(
				clamp( cls[ i ], 0, 1 ) * clamp( obj[ i ], 0, 1 )
			);
			if ( score < min ) {
				continue;
			}
			const r = Math.floor( i / cols );
			const c = i % cols;
			const cx = ( c + bbox[ i * 4 ] ) * stride;
			const cy = ( r + bbox[ i * 4 + 1 ] ) * stride;
			const w = Math.exp( bbox[ i * 4 + 2 ] ) * stride;
			const h = Math.exp( bbox[ i * 4 + 3 ] ) * stride;
			boxes.push( {
				x1: cx - w / 2,
				y1: cy - h / 2,
				x2: cx + w / 2,
				y2: cy + h / 2,
				score,
			} );
		}
	}
	return nms( boxes, overlap );
}

/**
 * Faces as a collage keeps them: shares of the picture, rounded, the
 * biggest few.
 *
 * @param {Array}  boxes Decoded boxes in input pixels.
 * @param {number} scale Input pixels per picture pixel.
 * @param {number} imgW  Picture width.
 * @param {number} imgH  Picture height.
 * @param {number} max   How many to keep.
 * @return {Array} [{ x, y, w, h }] from 0 to 1.
 */
export function facesInPicture( boxes, scale, imgW, imgH, max = 8 ) {
	const r = ( v ) => Math.round( v * 1000 ) / 1000;
	return boxes
		.map( ( b ) => {
			const x1 = clamp( b.x1 / scale, 0, imgW );
			const y1 = clamp( b.y1 / scale, 0, imgH );
			const x2 = clamp( b.x2 / scale, 0, imgW );
			const y2 = clamp( b.y2 / scale, 0, imgH );
			return {
				x: r( x1 / imgW ),
				y: r( y1 / imgH ),
				w: r( ( x2 - x1 ) / imgW ),
				h: r( ( y2 - y1 ) / imgH ),
			};
		} )
		.filter( ( f ) => f.w > 0 && f.h > 0 )
		.sort( ( a, b ) => b.w * b.h - a.w * a.h )
		.slice( 0, max );
}

/**
 * The cover-crop anchor that keeps the faces in a frame (the `ax`/`ay` of
 * an image layer's "cover" fit). All faces when they fit into the window
 * together, else the biggest one; a face sits a little above the middle,
 * where a portrait crop puts it.
 *
 * @param {Array}  faces [{ x, y, w, h }] from 0 to 1.
 * @param {number} frameW Frame width.
 * @param {number} frameH Frame height.
 * @param {number} imgW   Picture width.
 * @param {number} imgH   Picture height.
 * @return {?Object} { x, y } anchors, or null without faces.
 */
export function faceAnchor( faces, frameW, frameH, imgW, imgH ) {
	if (
		! faces ||
		! faces.length ||
		! frameW ||
		! frameH ||
		! imgW ||
		! imgH
	) {
		return null;
	}
	const s = Math.max( frameW / imgW, frameH / imgH );
	// The window the frame shows, as shares of the picture.
	const winW = frameW / s / imgW;
	const winH = frameH / s / imgH;
	const union = faces.reduce(
		( u, f ) => ( {
			x1: Math.min( u.x1, f.x ),
			y1: Math.min( u.y1, f.y ),
			x2: Math.max( u.x2, f.x + f.w ),
			y2: Math.max( u.y2, f.y + f.h ),
		} ),
		{ x1: 1, y1: 1, x2: 0, y2: 0 }
	);
	const fits =
		union.x2 - union.x1 <= winW * 0.9 && union.y2 - union.y1 <= winH * 0.9;
	const target = fits
		? union
		: {
				x1: faces[ 0 ].x,
				y1: faces[ 0 ].y,
				x2: faces[ 0 ].x + faces[ 0 ].w,
				y2: faces[ 0 ].y + faces[ 0 ].h,
		  };
	const cx = ( target.x1 + target.x2 ) / 2;
	const cy = ( target.y1 + target.y2 ) / 2;
	const spareX = 1 - winW;
	const spareY = 1 - winH;
	return {
		x:
			spareX > 1e-3
				? Math.round(
						clamp( ( cx - winW / 2 ) / spareX, 0, 1 ) * 1000
				  ) / 1000
				: 0.5,
		y:
			spareY > 1e-3
				? Math.round(
						clamp( ( cy - winH * 0.42 ) / spareY, 0, 1 ) * 1000
				  ) / 1000
				: 0.5,
	};
}

/**
 * The model input for a picture: drawn top left into the square at the
 * largest size that fits, the rest black, as BGR planes of 0-255 values.
 *
 * @param {Uint8ClampedArray} rgba Pixels of the FACE_INPUT square.
 * @param {number}            size Side.
 * @return {Float32Array} 3 x size x size.
 */
export function bgrPlanes( rgba, size = FACE_INPUT ) {
	const n = size * size;
	const out = new Float32Array( 3 * n );
	for ( let i = 0; i < n; i++ ) {
		out[ i ] = rgba[ i * 4 + 2 ];
		out[ n + i ] = rgba[ i * 4 + 1 ];
		out[ 2 * n + i ] = rgba[ i * 4 ];
	}
	return out;
}

let session = null;

async function faceSession() {
	if ( ! session ) {
		session = ( async () => {
			const { cachedRuntimeBuffer, ORT_WASM_FILE } = await import(
				'./ml-cache'
			);
			const base = ( window.WPIE?.pluginUrl || '/' ) + 'assets/ort/';
			const ort = await import(
				/* webpackChunkName: "ort" */ 'onnxruntime-web'
			);
			ort.env.wasm.wasmPaths = base;
			ort.env.wasm.numThreads = 1;
			try {
				const buf = await cachedRuntimeBuffer(
					base + ORT_WASM_FILE,
					window.WPIE?.version || ''
				);
				if ( buf ) {
					ort.env.wasm.wasmBinary = buf;
				}
			} catch ( e ) {}
			const s = await ort.InferenceSession.create(
				( window.WPIE?.pluginUrl || '/' ) + FACE_MODEL_PATH,
				{ executionProviders: [ 'wasm' ] }
			);
			return { ort, s };
		} )().catch( ( e ) => {
			session = null;
			throw e;
		} );
	}
	return session;
}

/**
 * The tiles a big picture is searched in (Blur Faces, 20.10.2026): the
 * model sees a square of FACE_INPUT pixels, so on a large photo a face in
 * the back row shrinks to a few pixels. The picture is worked at most
 * `maxSide` long and cut into model-sized tiles that overlap by a quarter,
 * the last row and column flush with the edges. A picture small enough
 * for one look gets no tiles.
 *
 * @param {number} imgW         Picture width.
 * @param {number} imgH         Picture height.
 * @param {Object} opts         Options.
 * @param {number} opts.maxSide Longest side the picture is worked at.
 * @return {Array} [{ x, y, w, h }] in picture pixels.
 */
export function tileGrid( imgW, imgH, { maxSide = 2560 } = {} ) {
	if ( ! imgW || ! imgH ) {
		return [];
	}
	const k = Math.min( 1, maxSide / Math.max( imgW, imgH ) );
	const tile = FACE_INPUT / k;
	if ( Math.max( imgW, imgH ) <= tile * 1.25 ) {
		return [];
	}
	const starts = ( len ) => {
		if ( len <= tile ) {
			return [ 0 ];
		}
		const out = [];
		for ( let at = 0; ; at += tile * 0.75 ) {
			if ( at + tile >= len ) {
				out.push( len - tile );
				break;
			}
			out.push( at );
		}
		return out;
	};
	const rects = [];
	for ( const y of starts( imgH ) ) {
		for ( const x of starts( imgW ) ) {
			rects.push( {
				x: Math.round( x ),
				y: Math.round( y ),
				w: Math.round( Math.min( tile, imgW ) ),
				h: Math.round( Math.min( tile, imgH ) ),
			} );
		}
	}
	return rects;
}

/**
 * One set of face boxes from several looks (tiles, a second detector): the
 * best of every overlapping group stays. Boxes without a score (Florence-2
 * names a face, it does not rate it) count as moderately sure, so where
 * both found the same face the face finder's box is kept.
 *
 * @param {...Array} lists Box lists [{ x1, y1, x2, y2, score? }].
 * @return {Array} The merged boxes, best first.
 */
export function mergeFaceBoxes( ...lists ) {
	return nms(
		lists
			.flat()
			.filter( Boolean )
			.map( ( b ) => ( {
				...b,
				score: 'number' === typeof b.score ? b.score : 0.5,
			} ) ),
		0.3
	);
}

/** One look of the model at a part of the picture, boxes in picture pixels. */
async function look( img, rect, { ort, s }, createCanvas ) {
	const scale = Math.min( FACE_INPUT / rect.w, FACE_INPUT / rect.h );
	const canvas = createCanvas( FACE_INPUT, FACE_INPUT );
	const ctx = canvas.getContext( '2d' );
	ctx.fillStyle = '#000';
	ctx.fillRect( 0, 0, FACE_INPUT, FACE_INPUT );
	ctx.drawImage(
		img,
		rect.x,
		rect.y,
		rect.w,
		rect.h,
		0,
		0,
		rect.w * scale,
		rect.h * scale
	);
	const { data } = ctx.getImageData( 0, 0, FACE_INPUT, FACE_INPUT );
	const input = new ort.Tensor( 'float32', bgrPlanes( data ), [
		1,
		3,
		FACE_INPUT,
		FACE_INPUT,
	] );
	const out = await s.run( { [ s.inputNames[ 0 ] ]: input } );
	return decodeYunet( out ).map( ( b ) => ( {
		x1: rect.x + b.x1 / scale,
		y1: rect.y + b.y1 / scale,
		x2: rect.x + b.x2 / scale,
		y2: rect.y + b.y2 / scale,
		score: b.score,
	} ) );
}

/** The runtime and a canvas factory, after checking the runtime ships. */
async function prepare() {
	const [ { assertLocalRuntime }, { createCanvas } ] = await Promise.all( [
		import( './ml' ),
		import( './raster' ),
	] );
	assertLocalRuntime();
	return { model: await faceSession(), createCanvas };
}

/**
 * Find the faces in a picture, in the browser: one look at the whole
 * picture, enough to frame a photo (Collage).
 *
 * @param {HTMLImageElement|HTMLCanvasElement} img A loaded picture.
 * @return {Promise<Array>} [{ x, y, w, h }] from 0 to 1, biggest first.
 */
export async function detectFaces( img ) {
	const imgW = img.naturalWidth || img.width;
	const imgH = img.naturalHeight || img.height;
	if ( ! imgW || ! imgH ) {
		return [];
	}
	const { model, createCanvas } = await prepare();
	const boxes = await look(
		img,
		{ x: 0, y: 0, w: imgW, h: imgH },
		model,
		createCanvas
	);
	return facesInPicture( boxes, 1, imgW, imgH );
}

/**
 * Every face in a picture, small ones included (Blur Faces, 20.10.2026):
 * the whole picture and, on a big one, its tiles; the event loop gets a
 * turn between looks.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} img A loaded picture.
 * @return {Promise<Array>} [{ x1, y1, x2, y2, score }] in picture pixels.
 */
export async function findAllFaces( img ) {
	const imgW = img.naturalWidth || img.width;
	const imgH = img.naturalHeight || img.height;
	if ( ! imgW || ! imgH ) {
		return [];
	}
	const { model, createCanvas } = await prepare();
	const found = [
		await look(
			img,
			{ x: 0, y: 0, w: imgW, h: imgH },
			model,
			createCanvas
		),
	];
	for ( const rect of tileGrid( imgW, imgH ) ) {
		await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
		found.push( await look( img, rect, model, createCanvas ) );
	}
	return mergeFaceBoxes( ...found );
}
