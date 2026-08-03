/**
 * PSD interchange (spec 13): ag-psd tree ↔ our layer model. Heavy work runs
 * in psd.worker.js (OffscreenCanvas); a main-thread path covers browsers
 * without OffscreenCanvas.
 *
 * Honest boundary (13.5): everything that maps is preserved (raster,
 * groups, masks, blend modes, opacity, editable text with raster fallback,
 * Smart Objects with original bytes); the rest is faithfully rasterized and
 * reported via the returned `notes`.
 */

import { __, sprintf } from '@wordpress/i18n';

import { createCanvas, renderToCanvas, sharedImageCache } from './raster';
import { placedQuad, warpMeshFromPlaced, warpedQuadPoints } from './quad-warp';
import { textRuns, resolveStyle } from './rich-text';
import {
	createBlankDoc,
	makeRaster,
	makeGroup,
	makeText,
	makeSmart,
	makeAdjustment,
	hydrateLayers,
} from '../store/document';
import { FONT_LIST } from '../store/constants';

/* ------------------------------ blend maps ------------------------------ */

const PSD_TO_CSS = {
	normal: 'normal',
	multiply: 'multiply',
	screen: 'screen',
	overlay: 'overlay',
	darken: 'darken',
	lighten: 'lighten',
	'color dodge': 'color-dodge',
	'color burn': 'color-burn',
	'linear dodge': 'color-dodge',
	'linear burn': 'color-burn',
	'hard light': 'hard-light',
	'soft light': 'soft-light',
	difference: 'difference',
	exclusion: 'exclusion',
	hue: 'hue',
	saturation: 'saturation',
	color: 'color',
	luminosity: 'luminosity',
};

const CSS_TO_PSD = Object.fromEntries(
	Object.entries( PSD_TO_CSS )
		.filter( ( [ psd ] ) => ! psd.startsWith( 'linear' ) )
		.map( ( [ psd, css ] ) => [ css, psd ] )
);

export const psdBlendToCss = ( blend ) => PSD_TO_CSS[ blend ] || 'normal';
export const cssBlendToPsd = ( blend ) => CSS_TO_PSD[ blend ] || 'normal';

/* ------------------------------ worker glue ----------------------------- */

const hasOffscreen = () =>
	'undefined' !== typeof window.OffscreenCanvas &&
	'undefined' !== typeof window.Worker;

/** Read a PSD buffer into an ag-psd tree (worker or main thread). */
async function readPsdTree( buffer ) {
	// Callers hand in ArrayBuffers OR typed-array views (smart-object bytes
	// from ag-psd are Uint8Arrays). The worker transfer list only accepts
	// real ArrayBuffers, so views are copied out to a tight buffer here.
	if ( ArrayBuffer.isView( buffer ) ) {
		buffer = buffer.buffer.slice(
			buffer.byteOffset,
			buffer.byteOffset + buffer.byteLength
		);
	}
	if ( hasOffscreen() ) {
		const { runPsdWorker } = await import( './psd-worker-client' );
		const { psd } = await runPsdWorker( { cmd: 'read', buffer }, [
			buffer,
		] );
		return hydrateBitmaps( psd );
	}
	const ag = await import( /* webpackChunkName: "agpsd" */ 'ag-psd' );
	return ag.readPsd( buffer, { skipThumbnail: true } );
}

/** Write an ag-psd tree to an ArrayBuffer (worker or main thread). */
async function writePsdTree( tree ) {
	if ( hasOffscreen() ) {
		const { runPsdWorker } = await import( './psd-worker-client' );
		const { transfers, prepared } = await dehydrateCanvases( tree );
		const { buffer } = await runPsdWorker(
			{ cmd: 'write', psd: prepared },
			transfers
		);
		return buffer;
	}
	const ag = await import( /* webpackChunkName: "agpsd" */ 'ag-psd' );
	return ag.writePsd( tree, {
		generateThumbnail: false,
		// Force Photoshop to rebuild type layers from our records on load
		// (without this it may refuse/rasterize freshly written text).
		invalidateTextLayers: true,
	} );
}

/** Worker → main: { __bitmap } markers become real canvases. */
function hydrateBitmaps( node ) {
	if ( ! node || 'object' !== typeof node ) {
		return node;
	}
	if ( Array.isArray( node ) ) {
		return node.map( hydrateBitmaps );
	}
	if ( node.__bitmap ) {
		const canvas = createCanvas( node.width, node.height );
		canvas.getContext( '2d' ).drawImage( node.__bitmap, 0, 0 );
		node.__bitmap.close?.();
		return canvas;
	}
	if ( node instanceof ArrayBuffer || ArrayBuffer.isView( node ) ) {
		return node;
	}
	const out = {};
	for ( const [ key, value ] of Object.entries( node ) ) {
		out[ key ] = hydrateBitmaps( value );
	}
	return out;
}

/** Main → worker: canvases become { __bitmap } + transfer list. */
async function dehydrateCanvases( node, transfers = [] ) {
	const walk = async ( value ) => {
		if ( ! value || 'object' !== typeof value ) {
			return value;
		}
		if ( Array.isArray( value ) ) {
			return Promise.all( value.map( walk ) );
		}
		if ( 'function' === typeof value.getContext && value.width ) {
			const bitmap = await window.createImageBitmap( value );
			transfers.push( bitmap );
			return {
				__bitmap: bitmap,
				width: bitmap.width,
				height: bitmap.height,
			};
		}
		if ( value instanceof ArrayBuffer || ArrayBuffer.isView( value ) ) {
			return value;
		}
		const out = {};
		for ( const [ key, child ] of Object.entries( value ) ) {
			out[ key ] = await walk( child );
		}
		return out;
	};
	const prepared = await walk( node );
	return { prepared, transfers };
}

/* -------------------------------- import -------------------------------- */

const mapFont = ( name ) => {
	if ( ! name ) {
		return 'Inter';
	}
	const found = FONT_LIST.find( ( f ) =>
		name.toLowerCase().includes( f.toLowerCase().split( ' ' )[ 0 ] )
	);
	return found || 'Inter';
};

/**
 * PostScript-style font names (v1.65.1): Photoshop resolves type layers by
 * PostScript name ("PlayfairDisplay-Bold"), never by CSS family with
 * spaces. Weight buckets follow the common foundry style names.
 */
const PS_WEIGHT_STEPS = [
	[ 350, 'Light' ],
	[ 450, 'Regular' ],
	[ 550, 'Medium' ],
	[ 650, 'SemiBold' ],
	[ 800, 'Bold' ],
	[ Infinity, 'Black' ],
];

const psFontName = ( family, weight, italic ) => {
	const fam = String( family || 'Inter' ).replace( /\s+/g, '' );
	let styleName = 'Regular';
	for ( const [ max, label ] of PS_WEIGHT_STEPS ) {
		if ( ( weight || 400 ) < max ) {
			styleName = label;
			break;
		}
	}
	if ( italic ) {
		styleName = 'Regular' === styleName ? 'Italic' : styleName + 'Italic';
	}
	return fam + '-' + styleName;
};

const psWeightFromName = ( name ) => {
	const n = ( name || '' ).toLowerCase();
	if ( n.includes( 'black' ) || n.includes( 'heavy' ) ) {
		return 900;
	}
	if ( n.includes( 'semibold' ) || n.includes( 'demibold' ) ) {
		return 600;
	}
	if ( n.includes( 'bold' ) ) {
		return 700;
	}
	if ( n.includes( 'medium' ) ) {
		return 500;
	}
	if ( n.includes( 'light' ) || n.includes( 'thin' ) ) {
		return 300;
	}
	return 400;
};

// ag-psd validates placed-layer ids as GUIDs; our short uid() is rejected
// with "Placed layer ID must be in a GUID format" (v1.67 fix — this broke
// every smart-object export).
const psdGuid = () =>
	'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace( /[xy]/g, ( c ) => {
		const r = ( Math.random() * 16 ) | 0;
		const v = 'x' === c ? r : ( r & 0x3 ) | 0x8;
		return v.toString( 16 );
	} );

const psdColorToHex = ( color ) => {
	if ( ! color ) {
		return '#1a1d21';
	}
	const to2 = ( v ) =>
		Math.round( v ?? 0 )
			.toString( 16 )
			.padStart( 2, '0' );
	return `#${ to2( color.r ) }${ to2( color.g ) }${ to2( color.b ) }`;
};

/**
 * Map a PSD ArrayBuffer into { doc, layers, notes } (spec 13.1).
 *
 * @param {ArrayBuffer} buffer PSD bytes.
 * @param {string}      name   Document name.
 */
export async function psdToDocument( buffer, name = 'psd-import' ) {
	const psd = await readPsdTree( buffer );
	const notes = [];
	const doc = createBlankDoc( {
		name,
		w: psd.width,
		h: psd.height,
		bg: 'transparent',
		psd: true,
	} );
	const layers = [];
	const linkedFiles = psd.linkedFiles || [];

	const mapMask = ( node ) => {
		if ( ! node.mask?.canvas ) {
			return null;
		}
		// PSD masks are grayscale (white = show) → convert luminance→alpha
		// on a doc-sized canvas.
		const docMask = createCanvas( doc.w, doc.h );
		const ctx = docMask.getContext( '2d' );
		ctx.fillStyle = '#fff';
		if ( 0 !== node.mask.defaultColor ) {
			ctx.fillRect( 0, 0, doc.w, doc.h );
		}
		ctx.drawImage(
			node.mask.canvas,
			node.mask.left || 0,
			node.mask.top || 0
		);
		const imageData = ctx.getImageData( 0, 0, doc.w, doc.h );
		const d = imageData.data;
		for ( let i = 0; i < d.length; i += 4 ) {
			d[ i + 3 ] =
				0.2126 * d[ i ] + 0.7152 * d[ i + 1 ] + 0.0722 * d[ i + 2 ];
			d[ i ] = 255;
			d[ i + 1 ] = 255;
			d[ i + 2 ] = 255;
		}
		ctx.putImageData( imageData, 0, 0 );
		return {
			kind: 'raster',
			canvas: docMask,
			data: null,
			inverted: false,
			enabled: ! node.mask.disabled,
		};
	};

	const base = ( node ) => ( {
		visible: ! node.hidden,
		locked: !! node.protected?.transparency || false,
		opacity: node.opacity ?? 1,
		blend: psdBlendToCss( node.blendMode ),
		mask: mapMask( node ),
	} );

	// Rasterize smart-object bytes FLAT at content size (spec 13.6): inner
	// PSD/PSB → composite via the regular reader, plain image bytes → decode.
	const flatSmartContent = async ( bytes ) => {
		const u8 =
			bytes instanceof Uint8Array ? bytes : new Uint8Array( bytes );
		const isPsd =
			u8.length > 4 &&
			0x38 === u8[ 0 ] &&
			0x42 === u8[ 1 ] &&
			0x50 === u8[ 2 ] &&
			0x53 === u8[ 3 ];
		if ( isPsd ) {
			// Copy: the worker path transfers the buffer away, the original
			// bytes must survive for the embedded round trip.
			const tree = await readPsdTree( u8.slice().buffer );
			if ( ! tree?.canvas ) {
				throw new Error( 'no composite' );
			}
			return { canvas: tree.canvas, w: tree.width, h: tree.height };
		}
		const url = window.URL.createObjectURL( new window.Blob( [ u8 ] ) );
		try {
			const img = await new Promise( ( resolve, reject ) => {
				const im = new window.Image();
				im.onload = () => resolve( im );
				im.onerror = reject;
				im.src = url;
			} );
			const c = createCanvas(
				img.naturalWidth || img.width,
				img.naturalHeight || img.height
			);
			c.getContext( '2d' ).drawImage( img, 0, 0 );
			return { canvas: c, w: c.width, h: c.height };
		} finally {
			window.URL.revokeObjectURL( url );
		}
	};

	const walk = async ( nodes, parent ) => {
		for ( const node of nodes ) {
			const left = node.left || 0;
			const top = node.top || 0;
			const width = Math.max( 1, ( node.right || 0 ) - left );
			const height = Math.max( 1, ( node.bottom || 0 ) - top );

			if ( node.children ) {
				const group = makeGroup( {
					name: node.name || 'Group',
					isOpen: !! node.opened,
				} );
				Object.assign( group, base( node ) );
				group.parent = parent;
				layers.push( group );
				const before = layers.length;
				await walk( node.children, group.id );
				group.children = layers
					.slice( before )
					.filter( ( l ) => l.parent === group.id )
					.map( ( l ) => l.id );
				continue;
			}

			if ( node.placedLayer ) {
				// Smart Object (13.1): preview canvas + original bytes.
				const linked = linkedFiles.find(
					( f ) => f.id === node.placedLayer.id
				);
				const bytes = node.placedLayer.data || linked?.data || null;
				const preview = createCanvas( width, height );
				if ( node.canvas ) {
					preview.getContext( '2d' ).drawImage( node.canvas, 0, 0 );
				}
				let src = preview.toDataURL
					? preview.toDataURL( 'image/png' )
					: '';
				let srcW = width;
				let srcH = height;
				// Distort/Perspective placement (spec 13.6): feed the corner
				// geometry into the editor's free-transform quad and keep the
				// content FLAT in src, so edits re-render in perspective
				// instead of a flat stretch. On any failure the baked
				// Photoshop preview above stays (correct static look).
				let quad = placedQuad( node.placedLayer );
				const warpMesh = quad
					? warpMeshFromPlaced( node.placedLayer )
					: null;
				if ( quad && bytes ) {
					try {
						const flat = await flatSmartContent( bytes );
						src = flat.canvas.toDataURL( 'image/png' );
						srcW = flat.w;
						srcH = flat.h;
					} catch ( err ) {
						quad = null;
					}
				} else {
					quad = null;
				}
				const smart = makeSmart( {
					name: node.name || 'Smart Object',
					x: left,
					y: top,
					w: width,
					h: height,
					src,
					srcW,
					srcH,
					embedded: {
						// PSB is the same container (ag-psd reads both), so
						// Edit Contents must treat it as a nested PSD too.
						kind: [ 'psd', 'psb' ].includes(
							( linked?.name || '' )
								.split( '.' )
								.pop()
								.toLowerCase()
						)
							? 'psd'
							: 'image',
						bytes,
					},
				} );
				Object.assign( smart, base( node ) );
				if ( quad ) {
					smart.quad = quad;
					if ( warpMesh ) {
						smart.warpMesh = warpMesh;
					}
				}
				smart.parent = parent;
				layers.push( smart );
				continue;
			}

			if ( node.text ) {
				const style = node.text.style || {};
				const text = makeText( {
					name: node.name || node.text.text?.slice( 0, 24 ) || 'Text',
					x: left,
					y: top,
					w: width,
					h: height,
					text: node.text.text || '',
					fontSize: style.fontSize || 24,
					fontFamily: mapFont( style.font?.name ),
					weight: /bold/i.test( style.font?.name || '' ) ? 700 : 400,
					color: psdColorToHex( style.fillColor ),
					align:
						(
							node.text.paragraphStyle?.justification || 'left'
						).replace( /^justify-?/, '' ) || 'left',
					// PSD tracking is 1/1000 em.
					letterSpacing: style.tracking
						? ( style.tracking / 1000 ) * ( style.fontSize || 24 )
						: 0,
				} );
				Object.assign( text, base( node ) );
				text.parent = parent;
				// Per-run styles → rich-text spans (v1.65.1), so mixed
				// character styling survives the PSD round trip.
				const psRuns = node.text.styleRuns;
				if ( Array.isArray( psRuns ) && psRuns.length > 1 ) {
					const full = String( node.text.text || '' );
					let offset = 0;
					const spans = [];
					for ( const run of psRuns ) {
						const len = Math.max(
							0,
							Math.min( run.length || 0, full.length - offset )
						);
						if ( ! len ) {
							continue;
						}
						const rs = run.style || {};
						spans.push( {
							text: full.slice( offset, offset + len ),
							s: {
								...( rs.fontSize ? { size: rs.fontSize } : {} ),
								...( rs.font?.name
									? {
											family: mapFont( rs.font.name ),
											weight: psWeightFromName(
												rs.font.name
											),
											...( /italic/i.test( rs.font.name )
												? { italic: true }
												: {} ),
									  }
									: {} ),
								...( rs.fillColor
									? {
											color: psdColorToHex(
												rs.fillColor
											),
									  }
									: {} ),
								...( rs.underline ? { underline: true } : {} ),
							},
						} );
						offset += len;
					}
					if ( offset < full.length ) {
						spans.push( { text: full.slice( offset ), s: null } );
					}
					if ( spans.length > 1 ) {
						text.spans = spans;
					}
				}
				if ( node.canvas && node.canvas.toDataURL ) {
					// Editable text + rasterized fallback the user can toggle.
					text.rasterFallback = node.canvas.toDataURL( 'image/png' );
				}
				if (
					style.font?.name &&
					mapFont( style.font.name ) !== style.font.name
				) {
					notes.push(
						sprintf(
							/* translators: 1: layer name, 2: font name. */
							__(
								'“%1$s”: font “%2$s” substituted.',
								'wunderpaint'
							),
							text.name,
							style.font.name
						)
					);
				}
				layers.push( text );
				continue;
			}

			if ( node.adjustment ) {
				const adjust = {};
				const type = node.adjustment.type || '';
				if ( 'brightness/contrast' === type ) {
					adjust.brightness =
						( node.adjustment.brightness || 0 ) / 1.5;
					adjust.contrast = ( node.adjustment.contrast || 0 ) / 1.5;
				} else if ( 'hue/saturation' === type ) {
					const first = node.adjustment.channels?.[ 0 ] || {};
					adjust.hue = first.hue || 0;
					adjust.saturation = first.saturation || 0;
				} else {
					notes.push(
						sprintf(
							/* translators: %s: adjustment type. */
							__(
								'Adjustment layer “%s” is not supported and was skipped.',
								'wunderpaint'
							),
							type || node.name
						)
					);
					continue;
				}
				const adjustment = makeAdjustment( {
					name: node.name || 'Adjustment',
					x: 0,
					y: 0,
					w: doc.w,
					h: doc.h,
					adjust,
				} );
				Object.assign( adjustment, base( node ) );
				adjustment.parent = parent;
				layers.push( adjustment );
				continue;
			}

			if ( node.canvas ) {
				// Raster content (also the rasterized form of vector layers).
				const canvas = createCanvas( width, height );
				canvas.getContext( '2d' ).drawImage( node.canvas, 0, 0 );
				const raster = makeRaster( {
					name: node.name || 'Layer',
					x: left,
					y: top,
					w: width,
					h: height,
					canvas,
				} );
				Object.assign( raster, base( node ) );
				raster.parent = parent;
				if ( node.vectorMask || node.vectorFill ) {
					notes.push(
						sprintf(
							/* translators: %s: layer name. */
							__(
								'“%s” was rasterized from a vector layer.',
								'wunderpaint'
							),
							raster.name
						)
					);
				}
				layers.push( raster );
				continue;
			}

			notes.push(
				sprintf(
					/* translators: %s: layer name. */
					__(
						'“%s” had no drawable content and was skipped.',
						'wunderpaint'
					),
					node.name || '?'
				)
			);
		}
	};

	await walk( psd.children || [], null );

	// ag-psd preserves the PSD file order (bottom→top), matching our paint
	// order directly.
	return { doc, layers, notes };
}

/* -------------------------------- export -------------------------------- */

const hexToPsdColor = ( hex ) => {
	const value = ( hex || '#000000' ).replace( '#', '' );
	const n = parseInt(
		3 === value.length
			? value
					.split( '' )
					.map( ( c ) => c + c )
					.join( '' )
			: value,
		16
	);
	return { r: ( n >> 16 ) & 255, g: ( n >> 8 ) & 255, b: n & 255 };
};

/**
 * Build a PSD ArrayBuffer from the current document (spec 13.2).
 * Returns { buffer, notes }, notes list what was flattened.
 */
export async function documentToPsd( doc, layers ) {
	const notes = [];
	await sharedImageCache.warm( layers );

	const renderLayerCanvas = async ( layer ) => {
		// Free-transform quads live in absolute doc coords and may extend
		// past the layer box - the preview raster must cover their bbox
		// (including Bézier-warp bulges outside the corner quad).
		const q = layer.quad;
		const qPts = q
			? layer.warpMesh
				? warpedQuadPoints( q, layer.warpMesh )
				: [ q.tl, q.tr, q.br, q.bl ]
			: null;
		const xs = qPts ? qPts.map( ( p ) => p.x ) : null;
		const ys = qPts ? qPts.map( ( p ) => p.y ) : null;
		const bounds = q
			? {
					x: Math.floor( Math.min( ...xs ) ),
					y: Math.floor( Math.min( ...ys ) ),
					w: Math.max(
						1,
						Math.ceil( Math.max( ...xs ) - Math.min( ...xs ) )
					),
					h: Math.max(
						1,
						Math.ceil( Math.max( ...ys ) - Math.min( ...ys ) )
					),
			  }
			: {
					x: Math.floor( layer.x ),
					y: Math.floor( layer.y ),
					w: Math.max( 1, Math.ceil( layer.w ) ),
					h: Math.max( 1, Math.ceil( layer.h ) ),
			  };
		const rendered = await renderToCanvas(
			{ ...doc, bg: 'transparent' },
			[
				{
					...layer,
					parent: null,
					opacity: 1,
					blend: 'normal',
					mask: null,
				},
			],
			{ viewport: bounds, cache: sharedImageCache }
		);
		return { canvas: rendered, bounds };
	};

	const maskFor = ( layer ) => {
		const source = layer.mask?.canvas || null;
		if ( ! source || false === layer.mask.enabled ) {
			return {};
		}
		// Our masks are alpha; PSD masks are grayscale (white = show).
		const gray = createCanvas( source.width, source.height );
		const ctx = gray.getContext( '2d' );
		const imageData = source
			.getContext( '2d' )
			.getImageData( 0, 0, source.width, source.height );
		const out = ctx.createImageData( source.width, source.height );
		for ( let i = 0; i < imageData.data.length; i += 4 ) {
			const alpha = imageData.data[ i + 3 ];
			out.data[ i ] = alpha;
			out.data[ i + 1 ] = alpha;
			out.data[ i + 2 ] = alpha;
			out.data[ i + 3 ] = 255;
		}
		ctx.putImageData( out, 0, 0 );
		return { mask: { canvas: gray, left: 0, top: 0 } };
	};

	const mapLayer = async ( layer ) => {
		const common = {
			name: layer.name,
			opacity: layer.opacity ?? 1,
			blendMode: cssBlendToPsd( layer.blend ),
			hidden: ! layer.visible,
			...maskFor( layer ),
		};

		if ( 'group' === layer.type ) {
			const children = [];
			for ( const id of layer.children || [] ) {
				const child = layers.find( ( l ) => l.id === id );
				if ( child ) {
					const mapped = await mapLayer( child );
					if ( mapped ) {
						children.push( mapped );
					}
				}
			}
			return { ...common, opened: layer.isOpen, children };
		}

		if (
			'smart' === layer.type &&
			( layer.embedded?.bytes ||
				( 'layers' === layer.embedded?.kind && layer.embedded.layers ) )
		) {
			// Re-embed the original smart-object bytes (13.2). Editor-made
			// smart objects (v1.67) carry their LAYERS instead of bytes: a
			// real inner PSD is built from them recursively, so Photoshop
			// opens the contents as editable layers, not a flat picture.
			let bytes = layer.embedded.bytes;
			let ext = 'psd' === layer.embedded.kind ? 'psd' : 'png';
			if ( ! bytes && 'layers' === layer.embedded.kind ) {
				try {
					const innerLayers = await hydrateLayers(
						layer.embedded.layers.map( ( l ) => ( { ...l } ) )
					);
					const inner = await documentToPsd(
						{
							name: layer.name,
							w:
								layer.embedded.doc?.w ||
								layer.srcW ||
								Math.max( 1, Math.round( layer.w ) ),
							h:
								layer.embedded.doc?.h ||
								layer.srcH ||
								Math.max( 1, Math.round( layer.h ) ),
							bg: 'transparent',
						},
						innerLayers
					);
					bytes = inner.buffer;
					ext = 'psd';
				} catch ( err ) {
					bytes = null;
				}
			}
			if ( bytes ) {
				const { canvas, bounds } = await renderLayerCanvas( layer );
				const id = psdGuid();
				// Distort/Perspective placement (spec 13.6): write the doc-
				// space corner quad back so Photoshop restores the exact
				// placement. Trnf stays the affine frame (the quad's bbox,
				// mirroring what Photoshop itself writes). The free-transform
				// quad convention folds rot into the corners (rot === 0).
				const q = layer.quad;
				const docQuad =
					q && q.tl && q.tr && q.br && q.bl
						? [
								q.tl.x,
								q.tl.y,
								q.tr.x,
								q.tr.y,
								q.br.x,
								q.br.y,
								q.bl.x,
								q.bl.y,
						  ]
						: null;
				const frame = docQuad
					? {
							x: Math.min(
								docQuad[ 0 ],
								docQuad[ 2 ],
								docQuad[ 4 ],
								docQuad[ 6 ]
							),
							y: Math.min(
								docQuad[ 1 ],
								docQuad[ 3 ],
								docQuad[ 5 ],
								docQuad[ 7 ]
							),
							r: Math.max(
								docQuad[ 0 ],
								docQuad[ 2 ],
								docQuad[ 4 ],
								docQuad[ 6 ]
							),
							b: Math.max(
								docQuad[ 1 ],
								docQuad[ 3 ],
								docQuad[ 5 ],
								docQuad[ 7 ]
							),
					  }
					: {
							x: bounds.x,
							y: bounds.y,
							r: bounds.x + bounds.w,
							b: bounds.y + bounds.h,
					  };
				return {
					...common,
					left: bounds.x,
					top: bounds.y,
					right: bounds.x + bounds.w,
					bottom: bounds.y + bounds.h,
					canvas,
					placedLayer: {
						id,
						type: 'raster',
						transform: [
							frame.x,
							frame.y,
							frame.r,
							frame.y,
							frame.r,
							frame.b,
							frame.x,
							frame.b,
						],
						...( docQuad ? { nonAffineTransform: docQuad } : {} ),
						...( docQuad && 32 === layer.warpMesh?.pts?.length
							? {
									// Envelope warp (spec 13.6): denormalize
									// the mesh back to content pixels so
									// Photoshop restores the deformation.
									warp: {
										style: 'custom',
										value: 0,
										perspective: 0,
										perspectiveOther: 0,
										rotate: 'horizontal',
										bounds: {
											top: { units: 'Pixels', value: 0 },
											left: { units: 'Pixels', value: 0 },
											bottom: {
												units: 'Pixels',
												value: layer.srcH || 1,
											},
											right: {
												units: 'Pixels',
												value: layer.srcW || 1,
											},
										},
										uOrder: 4,
										vOrder: 4,
										customEnvelopeWarp: {
											meshPoints: Array.from(
												{ length: 16 },
												( _, i ) => ( {
													x:
														layer.warpMesh.pts[
															2 * i
														] * ( layer.srcW || 1 ),
													y:
														layer.warpMesh.pts[
															2 * i + 1
														] * ( layer.srcH || 1 ),
												} )
											),
										},
									},
							  }
							: {} ),
						width: layer.srcW,
						height: layer.srcH,
					},
					__linkedFile: {
						id,
						name: 'smart-object.' + ext,
						data:
							bytes instanceof ArrayBuffer
								? new Uint8Array( bytes )
								: bytes,
					},
				};
			}
		}

		if ( 'text' === layer.type ) {
			const { canvas, bounds } = await renderLayerCanvas( layer );
			// Photoshop-grade type record (v1.65.1): PostScript font names,
			// tracking/leading/underline, and per-run styles so rich-text
			// spans stay editable character ranges in Photoshop.
			const psStyle = ( st ) => ( {
				font: { name: psFontName( st.family, st.weight, st.italic ) },
				fontSize: st.size,
				fillColor: hexToPsdColor( st.color || layer.color ),
				autoLeading: false,
				leading: Math.round( st.lineHeight * 100 ) / 100,
				...( st.ls
					? {
							tracking: Math.round( ( st.ls / st.size ) * 1000 ),
					  }
					: {} ),
				...( st.underline ? { underline: true } : {} ),
			} );
			const base = resolveStyle( layer, null );
			const runs = textRuns( layer );
			const styleRuns = runs.map( ( r ) => ( {
				length: r.text.length,
				style: psStyle( resolveStyle( layer, r.s ) ),
			} ) );
			if ( 'solid' !== ( layer.fillType || 'solid' ) ) {
				notes.push(
					sprintf(
						/* translators: %s: layer name. */
						__(
							'“%s”: gradient/pattern text fill became a solid color in the type layer (the pixel preview keeps the fill).',
							'wunderpaint'
						),
						layer.name
					)
				);
			}
			return {
				...common,
				left: bounds.x,
				top: bounds.y,
				right: bounds.x + bounds.w,
				bottom: bounds.y + bounds.h,
				canvas,
				text: {
					text: layer.text,
					transform: [ 1, 0, 0, 1, bounds.x, bounds.y + base.size ],
					antiAlias: 'smooth',
					style: psStyle( base ),
					...( styleRuns.length > 1 ? { styleRuns } : {} ),
					paragraphStyle: { justification: layer.align },
				},
			};
		}

		if ( 'adjustment' === layer.type ) {
			notes.push(
				sprintf(
					/* translators: %s: layer name. */
					__(
						'Adjustment layer “%s” could not be written and was dropped from the layer stack (its effect is visible in the flattened composite).',
						'wunderpaint'
					),
					layer.name
				)
			);
			return null;
		}

		// raster / image / shape / stroke / gradient → raster (13.2), with
		// layer styles and filters baked through the shared pipeline.
		const styled =
			layer.styles ||
			'none' !== ( layer.filter || 'none' ) ||
			layer.adjust;
		if ( styled ) {
			notes.push(
				sprintf(
					/* translators: %s: layer name. */
					__(
						'“%s”: filters/styles were baked into pixels.',
						'wunderpaint'
					),
					layer.name
				)
			);
		}
		// Tight bounds unless rotation/styles paint outside the layer rect.
		if ( layer.rot || layer.styles ) {
			const full = await renderToCanvas(
				{ ...doc, bg: 'transparent' },
				[
					{
						...layer,
						parent: null,
						opacity: 1,
						blend: 'normal',
						mask: null,
					},
				],
				{ cache: sharedImageCache }
			);
			return {
				...common,
				left: 0,
				top: 0,
				right: doc.w,
				bottom: doc.h,
				canvas: full,
			};
		}
		const { canvas, bounds } = await renderLayerCanvas( layer );
		return {
			...common,
			left: bounds.x,
			top: bounds.y,
			right: bounds.x + bounds.w,
			bottom: bounds.y + bounds.h,
			canvas,
		};
	};

	const children = [];
	const linked = [];
	// doc.bg is not a layer (v1.153.2); a PSD needs one, or hiding the
	// top layers in Photoshop would reveal transparency instead.
	if ( doc.bg && 'transparent' !== doc.bg ) {
		const bgCanvas = createCanvas( doc.w, doc.h );
		const bctx = bgCanvas.getContext( '2d' );
		bctx.fillStyle = doc.bg;
		bctx.fillRect( 0, 0, doc.w, doc.h );
		children.push( {
			name: 'Background',
			left: 0,
			top: 0,
			right: doc.w,
			bottom: doc.h,
			canvas: bgCanvas,
		} );
	}
	for ( const layer of layers.filter( ( l ) => ! l.parent ) ) {
		const mapped = await mapLayer( layer );
		if ( mapped ) {
			if ( mapped.__linkedFile ) {
				linked.push( mapped.__linkedFile );
				delete mapped.__linkedFile;
			}
			children.push( mapped );
		}
	}

	const composite = await renderToCanvas( doc, layers, {
		cache: sharedImageCache,
	} );
	const tree = {
		width: doc.w,
		height: doc.h,
		children,
		canvas: composite,
		...( linked.length ? { linkedFiles: linked } : {} ),
	};

	const buffer = await writePsdTree( tree );
	return { buffer, notes };
}
