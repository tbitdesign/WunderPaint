/**
 * SVG import/export (v1.1). Import turns the common SVG primitives into
 * editable shape/text layers (translate/scale transforms flattened; rotate
 * and exotic features are reported as warnings). Export writes vector
 * layers natively and embeds pixel layers as <image>.
 */

import { __, sprintf } from '@wordpress/i18n';

import { makeShape, makeText, uid } from '../store/document';
import { scalePathD, offsetPathD } from '../store/doc-ops';
import { hasTokens } from './dynamic-content';
import { arrowHeadSpec, ARROW_KINDS } from './line-geometry';
import { withTextTransform } from './rich-text';
import { tightenPathLayer } from './path-edit';
import { dashPattern } from './raster';
import { isUniform, cornerRadii } from './corner-radii';
import { shapeToPathD } from './shape-path';

const KAPPA = 0.5522847498;

const ellipsePath = ( cx, cy, rx, ry ) =>
	`M ${ cx - rx } ${ cy } ` +
	`C ${ cx - rx } ${ cy - ry * KAPPA } ${ cx - rx * KAPPA } ${
		cy - ry
	} ${ cx } ${ cy - ry } ` +
	`C ${ cx + rx * KAPPA } ${ cy - ry } ${ cx + rx } ${ cy - ry * KAPPA } ${
		cx + rx
	} ${ cy } ` +
	`C ${ cx + rx } ${ cy + ry * KAPPA } ${ cx + rx * KAPPA } ${
		cy + ry
	} ${ cx } ${ cy + ry } ` +
	`C ${ cx - rx * KAPPA } ${ cy + ry } ${ cx - rx } ${ cy + ry * KAPPA } ${
		cx - rx
	} ${ cy } Z`;

const rectPath = ( x, y, w, h ) =>
	`M ${ x } ${ y } L ${ x + w } ${ y } L ${ x + w } ${ y + h } L ${ x } ${
		y + h
	} Z`;

const num = ( el, name, def = 0 ) => {
	const v = parseFloat( el.getAttribute( name ) );
	return Number.isNaN( v ) ? def : v;
};

const STYLE_PROPS = [
	'fill',
	'stroke',
	'stroke-width',
	'stroke-dasharray',
	'opacity',
	'font-size',
	'font-family',
];

/**
 * Class rules from <style> blocks (v1.70.1). Illustrator/Figma/Inkscape
 * exports carry their colors as `.cls-1{fill:#ff6a00}` + class attributes;
 * skipping them painted everything with the inherited black. Only simple
 * class selectors are resolved (optionally tag-qualified, comma lists).
 *
 * @param {Element} svg Root SVG element.
 * @return {Object} className → declarations map.
 */
function parseClassRules( svg ) {
	const rules = {};
	for ( const styleEl of Array.from( svg.querySelectorAll( 'style' ) ) ) {
		const css = ( styleEl.textContent || '' ).replace(
			/\/\*[\s\S]*?\*\//g,
			''
		);
		const re = /([^{}]+)\{([^}]*)\}/g;
		let m;
		while ( ( m = re.exec( css ) ) ) {
			const decls = {};
			for ( const part of m[ 2 ].split( ';' ) ) {
				const [ k, v ] = part
					.split( ':' )
					.map( ( t ) => t && t.trim() );
				if ( k && v ) {
					decls[ k.toLowerCase() ] = v;
				}
			}
			for ( const sel of m[ 1 ].split( ',' ) ) {
				const cls = sel.trim().match( /^[a-zA-Z0-9_-]*\.([\w-]+)$/ );
				if ( cls ) {
					rules[ cls[ 1 ] ] = {
						...( rules[ cls[ 1 ] ] || {} ),
						...decls,
					};
				}
			}
		}
	}
	return rules;
}

/**
 * First stop color per gradient id (v1.70.1): `fill="url(#g)"` gets
 * approximated with a solid color instead of a broken string.
 *
 * @param {Element} svg Root SVG element.
 * @return {Object} id → color map.
 */
function parseGradientColors( svg ) {
	const colors = {};
	for ( const grad of Array.from(
		svg.querySelectorAll( 'linearGradient, radialGradient' )
	) ) {
		const id = grad.getAttribute( 'id' );
		const stop = grad.querySelector( 'stop' );
		if ( ! id || ! stop ) {
			continue;
		}
		const styled = ( stop.getAttribute( 'style' ) || '' ).match(
			/stop-color\s*:\s*([^;]+)/
		);
		const color =
			stop.getAttribute( 'stop-color' ) ||
			( styled && styled[ 1 ].trim() );
		if ( color ) {
			colors[ id ] = color;
		}
	}
	return colors;
}

/**
 * fill/stroke resolution with CSS priority (v1.70.1):
 * inline style > class rule > presentation attribute > inherited.
 */
function styleOf( el, inherited, classRules = {} ) {
	const out = { ...inherited };
	const fromClass = {};
	for ( const c of ( el.getAttribute( 'class' ) || '' )
		.split( /\s+/ )
		.filter( Boolean ) ) {
		Object.assign( fromClass, classRules[ c ] || {} );
	}
	const style = el.getAttribute( 'style' ) || '';
	const fromStyle = {};
	for ( const part of style.split( ';' ) ) {
		const [ k, v ] = part.split( ':' ).map( ( t ) => t && t.trim() );
		if ( k && v ) {
			fromStyle[ k ] = v;
		}
	}
	for ( const key of STYLE_PROPS ) {
		const v =
			fromStyle[ key ] ?? fromClass[ key ] ?? el.getAttribute( key );
		if ( undefined !== v && null !== v ) {
			out[ key ] = v;
		}
	}
	return out;
}

/** Parse translate(...)/scale(...) chains; anything else → warning. */
function parseTransform( el, warnings ) {
	const t = el.getAttribute( 'transform' );
	const out = { dx: 0, dy: 0, sx: 1, sy: 1 };
	if ( ! t ) {
		return out;
	}
	const calls = t.match( /(\w+)\s*\(([^)]*)\)/g ) || [];
	for ( const call of calls ) {
		const [ , fn, argsRaw ] = call.match( /(\w+)\s*\(([^)]*)\)/ );
		const args = argsRaw
			.split( /[\s,]+/ )
			.filter( Boolean )
			.map( Number );
		if ( 'translate' === fn ) {
			out.dx += args[ 0 ] || 0;
			out.dy += args[ 1 ] || 0;
		} else if ( 'scale' === fn ) {
			out.sx *= args[ 0 ] || 1;
			out.sy *= args[ 1 ] ?? ( args[ 0 ] || 1 );
		} else {
			warnings.push(
				sprintf(
					/* translators: %s: transform name. */
					__( 'Unsupported transform "%s" ignored.', 'wunderpaint' ),
					fn
				)
			);
		}
	}
	return out;
}

const applyTransform = ( d, t ) =>
	offsetPathD( scalePathD( d, t.sx, t.sy ), t.dx, t.dy );

const combine = ( a, b ) => ( {
	// b happens in a's coordinate space.
	dx: a.dx + b.dx * a.sx,
	dy: a.dy + b.dy * a.sy,
	sx: a.sx * b.sx,
	sy: a.sy * b.sy,
} );

/**
 * Parse an SVG document into WPIE layers.
 *
 * @param {string} text SVG source.
 * @return {{layers: Array, warnings: Array, width: number, height: number}} Result.
 */
export function importSvg( text ) {
	const doc = new window.DOMParser().parseFromString( text, 'image/svg+xml' );
	const svg = doc.querySelector( 'svg' );
	const warnings = [];
	if ( ! svg || doc.querySelector( 'parsererror' ) ) {
		throw new Error( __( 'Not a readable SVG file.', 'wunderpaint' ) );
	}

	const viewBox = ( svg.getAttribute( 'viewBox' ) || '' )
		.split( /[\s,]+/ )
		.filter( Boolean )
		.map( Number );
	const vbW = viewBox.length === 4 ? viewBox[ 2 ] : num( svg, 'width', 512 );
	const vbH = viewBox.length === 4 ? viewBox[ 3 ] : num( svg, 'height', 512 );
	const width = num( svg, 'width', vbW ) || vbW;
	const height = num( svg, 'height', vbH ) || vbH;
	const root = {
		dx: viewBox.length === 4 ? -viewBox[ 0 ] * ( width / vbW ) : 0,
		dy: viewBox.length === 4 ? -viewBox[ 1 ] * ( height / vbH ) : 0,
		sx: width / vbW,
		sy: height / vbH,
	};

	const classRules = parseClassRules( svg );
	const gradientColors = parseGradientColors( svg );
	// url(#gradient) fills become their first stop color (solid), a real
	// gradient layer would not clip to the path anyway.
	const resolvePaint = ( value ) => {
		const m = /^url\(\s*['"]?#([^'")\s]+)/.exec( value || '' );
		if ( ! m ) {
			return value;
		}
		const solid = gradientColors[ m[ 1 ] ];
		warnings.push(
			solid
				? __(
						'Gradient fill approximated with a solid color.',
						'wunderpaint'
				  )
				: __(
						'Unsupported paint reference replaced with gray.',
						'wunderpaint'
				  )
		);
		return solid || '#888888';
	};

	const layers = [];
	const emitShape = ( d, style, t, name ) => {
		const fill =
			style.fill && 'none' !== style.fill
				? resolvePaint( style.fill )
				: 'transparent';
		const stroke =
			style.stroke && 'none' !== style.stroke
				? resolvePaint( style.stroke )
				: null;
		const strokeW = stroke
			? Math.max( 0.5, parseFloat( style[ 'stroke-width' ] || 1 ) * t.sx )
			: 0;
		// stroke-dasharray -> our dashed stroke style (first two values).
		const dashRaw =
			stroke && style[ 'stroke-dasharray' ]
				? String( style[ 'stroke-dasharray' ] )
						.split( /[\s,]+/ )
						.map( parseFloat )
						.filter( ( v ) => v > 0 )
				: [];
		const dashProps = dashRaw.length
			? {
					strokeDash: 'dashed',
					strokeDashLen: Math.max( 1, dashRaw[ 0 ] * t.sx ),
					strokeDashGap: Math.max(
						1,
						( dashRaw[ 1 ] ?? dashRaw[ 0 ] ) * t.sx
					),
			  }
			: {};
		// Tight layer box (v1.128.1, shared helper since v1.130.0): every
		// imported shape used to span the WHOLE SVG canvas, so selecting
		// an element showed no visible frame (the outline sat exactly on
		// the document edge) and the transform handles were useless.
		const layer = tightenPathLayer(
			makeShape( {
				name,
				x: 0,
				y: 0,
				w: Math.round( width ),
				h: Math.round( height ),
				pathD: applyTransform( d, t ),
				fill,
				stroke,
				strokeW,
				...dashProps,
			} ),
			stroke ? Math.ceil( strokeW / 2 ) : 0
		);
		const opacity = parseFloat( style.opacity );
		if ( ! Number.isNaN( opacity ) ) {
			layer.opacity = Math.max( 0, Math.min( 1, opacity ) );
		}
		layers.push( layer );
	};

	const walk = ( el, inherited, t ) => {
		for ( const child of Array.from( el.children ) ) {
			const tag = child.tagName.toLowerCase();
			const style = styleOf( child, inherited, classRules );
			const ct = combine( t, parseTransform( child, warnings ) );
			switch ( tag ) {
				case 'g':
					walk( child, style, ct );
					break;
				case 'path':
					if ( child.getAttribute( 'd' ) ) {
						emitShape(
							child.getAttribute( 'd' ),
							style,
							ct,
							'Path'
						);
					}
					break;
				case 'rect':
					emitShape(
						rectPath(
							num( child, 'x' ),
							num( child, 'y' ),
							num( child, 'width' ),
							num( child, 'height' )
						),
						style,
						ct,
						'Rect'
					);
					break;
				case 'circle':
					emitShape(
						ellipsePath(
							num( child, 'cx' ),
							num( child, 'cy' ),
							num( child, 'r' ),
							num( child, 'r' )
						),
						style,
						ct,
						'Circle'
					);
					break;
				case 'ellipse':
					emitShape(
						ellipsePath(
							num( child, 'cx' ),
							num( child, 'cy' ),
							num( child, 'rx' ),
							num( child, 'ry' )
						),
						style,
						ct,
						'Ellipse'
					);
					break;
				case 'polygon':
				case 'polyline': {
					const pts = ( child.getAttribute( 'points' ) || '' )
						.split( /[\s,]+/ )
						.filter( Boolean )
						.map( Number );
					if ( pts.length >= 4 ) {
						let d = `M ${ pts[ 0 ] } ${ pts[ 1 ] }`;
						for ( let i = 2; i < pts.length - 1; i += 2 ) {
							d += ` L ${ pts[ i ] } ${ pts[ i + 1 ] }`;
						}
						if ( 'polygon' === tag ) {
							d += ' Z';
						}
						emitShape( d, style, ct, 'Polygon' );
					}
					break;
				}
				case 'line':
					emitShape(
						`M ${ num( child, 'x1' ) } ${ num(
							child,
							'y1'
						) } L ${ num( child, 'x2' ) } ${ num( child, 'y2' ) }`,
						{ ...style, fill: 'none' },
						ct,
						'Line'
					);
					break;
				case 'text': {
					const content = ( child.textContent || '' ).trim();
					if ( content ) {
						const size =
							parseFloat( style[ 'font-size' ] || 16 ) * ct.sy;
						layers.push(
							makeText( {
								text: content,
								x: Math.round(
									num( child, 'x' ) * ct.sx + ct.dx
								),
								y: Math.round(
									( num( child, 'y' ) - size * 0.8 ) * ct.sy +
										ct.dy
								),
								w: Math.round(
									Math.max( 60, content.length * size * 0.6 )
								),
								h: Math.round( size * 1.4 ),
								fontSize: Math.round( size ),
								fontFamily: (
									style[ 'font-family' ] || 'Inter'
								)
									.replace( /['"]/g, '' )
									.split( ',' )[ 0 ],
								color:
									style.fill && 'none' !== style.fill
										? resolvePaint( style.fill )
										: '#000000',
							} )
						);
					}
					break;
				}
				case 'defs':
				case 'title':
				case 'desc':
				case 'metadata':
				case 'style':
					break;
				default:
					warnings.push(
						sprintf(
							/* translators: %s: SVG element name. */
							__(
								'Unsupported element <%s> skipped.',
								'wunderpaint'
							),
							tag
						)
					);
			}
		}
	};
	walk( svg, { fill: '#000000' }, root );

	return {
		layers,
		warnings,
		width: Math.round( width ),
		height: Math.round( height ),
	};
}

/* --------------------------------- export ------------------------------- */

const esc = ( s ) =>
	String( s )
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' )
		.replace( /"/g, '&quot;' );

const dashAttr = ( layer, width ) => {
	const d = dashPattern(
		layer.strokeDash,
		width,
		layer.strokeDashLen,
		layer.strokeDashGap
	);
	if ( ! d ) {
		return '';
	}
	const vals = d.map( ( v ) => Math.round( v * 100 ) / 100 ).join( ' ' );
	return ` stroke-dasharray="${ vals }"${
		'dotted' === layer.strokeDash ? ' stroke-linecap="round"' : ''
	}`;
};

function shapeToSvg( layer, defs ) {
	const fillAttr =
		layer.fill && 'transparent' !== layer.fill ? layer.fill : 'none';
	const strokeAttr =
		layer.stroke && layer.strokeW
			? ` stroke="${ esc( layer.stroke ) }" stroke-width="${
					layer.strokeW
			  }"${ dashAttr( layer, layer.strokeW ) }`
			: '';
	const common = `fill="${ esc( fillAttr ) }"${ strokeAttr }`;
	const tx = ` transform="translate(${ layer.x },${ layer.y })${
		layer.rot
			? ` rotate(${ layer.rot } ${ layer.w / 2 } ${ layer.h / 2 })`
			: ''
	}"`;
	if ( layer.pathD ) {
		return `<path d="${ esc( layer.pathD ) }" ${ common }${ tx }/>`;
	}
	switch ( layer.shape ) {
		case 'ellipse':
			return `<ellipse cx="${ layer.w / 2 }" cy="${ layer.h / 2 }" rx="${
				layer.w / 2
			}" ry="${ layer.h / 2 }" ${ common }${ tx }/>`;
		case 'line': {
			const ly1 = layer.lineFlip ? layer.h : 0;
			const ly2 = layer.lineFlip ? 0 : layer.h;
			const lw = Math.max( 2, layer.strokeW || 0 );
			const color = esc( layer.fill || '#000' );
			const dx = layer.w;
			const dy = ly2 - ly1;
			const len = Math.hypot( dx, dy ) || 1;
			const ux = dx / len;
			const uy = dy / len;
			const startKind = ARROW_KINDS.includes( layer.arrowStart )
				? layer.arrowStart
				: '';
			const endKind = ARROW_KINDS.includes( layer.arrowEnd )
				? layer.arrowEnd
				: '';
			let t1 = startKind ? arrowHeadSpec( startKind, lw ).trim : 0;
			let t2 = endKind ? arrowHeadSpec( endKind, lw ).trim : 0;
			if ( t1 + t2 >= len ) {
				t1 = 0;
				t2 = 0;
			}
			const shaft = `<line x1="${ ux * t1 }" y1="${
				ly1 + uy * t1
			}" x2="${ layer.w - ux * t2 }" y2="${
				ly2 - uy * t2
			}" stroke="${ color }" stroke-width="${ lw }"${ dashAttr(
				layer,
				lw
			) }/>`;
			// Same head geometry as the raster renderer (arrowHeadSpec).
			const head = ( tipX, tipY, deg, kind ) => {
				const { len: hl, half, r } = arrowHeadSpec( kind, lw );
				const g = `transform="translate(${ tipX } ${ tipY }) rotate(${ deg })"`;
				if ( 'arrow' === kind ) {
					return `<path d="M ${ -hl } ${ -half } L 0 0 L ${ -hl } ${ half }" fill="none" stroke="${ color }" stroke-width="${ lw }" stroke-linecap="round" stroke-linejoin="round" ${ g }/>`;
				}
				if ( 'triangle' === kind ) {
					return `<path d="M 0 0 L ${ -hl } ${ -half } L ${ -hl } ${ half } Z" fill="${ color }" ${ g }/>`;
				}
				if ( 'circle' === kind ) {
					return `<circle cx="0" cy="0" r="${ r }" fill="${ color }" ${ g }/>`;
				}
				return `<line x1="0" y1="${ -half }" x2="0" y2="${ half }" stroke="${ color }" stroke-width="${ lw }" stroke-linecap="round" ${ g }/>`;
			};
			const deg = ( Math.atan2( dy, dx ) * 180 ) / Math.PI;
			const heads =
				( startKind ? head( 0, ly1, deg + 180, startKind ) : '' ) +
				( endKind ? head( layer.w, ly2, deg, endKind ) : '' );
			if ( ! heads ) {
				return `<line x1="0" y1="${ ly1 }" x2="${
					layer.w
				}" y2="${ ly2 }" stroke="${ color }" stroke-width="${ lw }"${ dashAttr(
					layer,
					lw
				) }${ tx }/>`;
			}
			return `<g${ tx }>${ shaft }${ heads }</g>`;
		}
		case 'rect': {
			// <rect rx> can only say ONE radius. Four different corners
			// (v1.367) therefore leave through the path geometry, which is
			// the same one the canvas draws.
			if ( ! isUniform( layer.radius ) ) {
				return `<path d="${ shapeToPathD(
					layer
				) }" ${ common }${ tx }/>`;
			}
			const [ r ] = cornerRadii( layer.radius, layer.w, layer.h );
			return `<rect width="${ layer.w }" height="${ layer.h }" rx="${ r }" ${ common }${ tx }/>`;
		}
		default: {
			// A shape whose geometry we can bake travels as its real path
			// (v1.368). This used to approximate everything as a sharp
			// polygon, which threw away rounded corners, corner smoothing
			// and a star's waist - all of them invisible in the export
			// while the editor showed them plainly.
			const baked = shapeToPathD( layer );
			if ( baked ) {
				return `<path d="${ baked }" ${ common }${ tx }/>`;
			}
			const sides = Math.max( 3, layer.sides || 6 );
			const pts = [];
			for ( let i = 0; i < sides; i++ ) {
				const a = ( i / sides ) * 2 * Math.PI - Math.PI / 2;
				pts.push(
					`${ ( layer.w / 2 ) * ( 1 + Math.cos( a ) ) },${
						( layer.h / 2 ) * ( 1 + Math.sin( a ) )
					}`
				);
			}
			defs.warnings.push(
				sprintf(
					/* translators: %s: shape kind. */
					__( 'Shape "%s" exported as polygon.', 'wunderpaint' ),
					layer.shape
				)
			);
			return `<polygon points="${ pts.join(
				' '
			) }" ${ common }${ tx }/>`;
		}
	}
}

function textToSvg( layer ) {
	// Same non-destructive transforms as the raster painter (v1.301).
	layer = withTextTransform( layer );
	const lines = String( layer.text || '' ).split( '\n' );
	const size = layer.fontSize || 16;
	const lineHeight = ( layer.lineHeight || 1.05 ) * size;
	const anchor =
		'center' === layer.align
			? 'middle'
			: 'right' === layer.align
			? 'end'
			: 'start';
	const ax =
		'middle' === anchor ? layer.w / 2 : 'end' === anchor ? layer.w : 0;
	const spans = lines
		.map(
			( line, i ) =>
				`<tspan x="${ ax }" y="${ size * 0.8 + i * lineHeight }">${ esc(
					line
				) }</tspan>`
		)
		.join( '' );
	// Dynamic binding marker (v1.157.0): server-side consumers (Pro live
	// badges) substitute the text content of marked nodes per request.
	// The layout metadata (v1.159.0) lets them WRAP and shrink-to-fit the
	// substituted value: box size, line height and the measured average
	// character width of this face (SVG text never wraps on its own).
	// Unbound text with inline {{tokens}} (v1.162.0) gets the same
	// metadata under data-wpie-tokens; the node keeps its raw token text
	// and the server expands it per request.
	let binding = '';
	if ( layer.binding || hasTokens( layer.text ) ) {
		let cw = size * 0.55;
		try {
			const ctx = document.createElement( 'canvas' ).getContext( '2d' );
			ctx.font = `${ layer.italic ? 'italic ' : '' }${
				layer.weight || 400
			} ${ size }px "${ layer.fontFamily || 'Inter' }"`;
			const sample =
				'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ';
			cw = ctx.measureText( sample ).width / sample.length;
		} catch ( e ) {
			// Headless (tests): the 0.55em heuristic stands in.
		}
		binding =
			( layer.binding
				? ` data-wpie-binding="${ esc( layer.binding ) }"`
				: // The raw token string rides along: the wrapped tspans may
				  // split it, the attribute is what the server expands.
				  ` data-wpie-tokens="1" data-wpie-text="${ esc(
						String( layer.text || '' )
				  ) }"` ) +
			` data-wpie-w="${ Math.round( layer.w ) }"` +
			` data-wpie-h="${ Math.round( layer.h ) }"` +
			` data-wpie-fs="${ size }"` +
			` data-wpie-lh="${ Math.round( lineHeight * 100 ) / 100 }"` +
			` data-wpie-cw="${ Math.round( cw * 100 ) / 100 }"`;
	}
	return `<text${ binding } transform="translate(${ layer.x },${
		layer.y
	})" font-family="${ esc(
		layer.fontFamily || 'Inter'
	) }" font-size="${ size }" font-weight="${
		layer.weight || 400
	}" text-anchor="${ anchor }" fill="${ esc(
		layer.color || '#000'
	) }">${ spans }</text>`;
}

function gradientToSvg( layer, defs ) {
	const id = `grad-${ uid() }`;
	const stops = ( layer.stops || [] )
		.map(
			( s ) =>
				`<stop offset="${ s.at * 100 }%" stop-color="${ esc(
					s.color
				) }"/>`
		)
		.join( '' );
	defs.items.push(
		'radial' === layer.kind
			? `<radialGradient id="${ id }">${ stops }</radialGradient>`
			: `<linearGradient id="${ id }" x1="0" y1="0" x2="${
					'linear' === layer.kind ? 1 : 0
			  }" y2="${
					'linear' === layer.kind ? 0 : 1
			  }">${ stops }</linearGradient>`
	);
	return `<rect x="${ layer.x }" y="${ layer.y }" width="${ layer.w }" height="${ layer.h }" fill="url(#${ id })"/>`;
}

/**
 * Serialize layers into a standalone SVG document.
 *
 * @param {Object} doc    Document.
 * @param {Array}  layers Full flat layer list.
 * @return {{svg: string, warnings: Array}} SVG source + warnings.
 */
export function exportSvg( doc, layers ) {
	const defs = { items: [], warnings: [] };
	const byId = new Map( layers.map( ( l ) => [ l.id, l ] ) );

	const emit = ( layer ) => {
		if ( ! layer.visible ) {
			return '';
		}
		const alpha =
			1 !== ( layer.opacity ?? 1 ) ? ` opacity="${ layer.opacity }"` : '';
		if ( 'group' === layer.type ) {
			const inner = ( layer.children || [] )
				.map( ( id ) => byId.get( id ) )
				.filter( Boolean )
				.map( emit )
				.join( '\n' );
			return `<g${ alpha }>\n${ inner }\n</g>`;
		}
		if (
			layer.mask ||
			layer.styles ||
			'none' !== ( layer.filter || 'none' )
		) {
			defs.warnings.push(
				sprintf(
					/* translators: %s: layer name. */
					__(
						'Masks/styles/filters on "%s" are not exported.',
						'wunderpaint'
					),
					layer.name
				)
			);
		}
		let body = '';
		switch ( layer.type ) {
			case 'shape':
				body = shapeToSvg( layer, defs );
				break;
			case 'text':
				body = textToSvg( layer );
				break;
			case 'gradient':
				body = gradientToSvg( layer, defs );
				break;
			case 'adjustment':
				return '';
			default: {
				// Pixel content embeds as an image.
				let href = layer.src || layer.dataUrl || '';
				if ( ! href && layer.canvas?.toDataURL ) {
					href = layer.canvas.toDataURL( 'image/png' );
				}
				if ( ! href ) {
					return '';
				}
				body = `<image href="${ esc( href ) }" x="${ layer.x }" y="${
					layer.y
				}" width="${ layer.w }" height="${
					layer.h
				}" preserveAspectRatio="none"/>`;
			}
		}
		return alpha && body.startsWith( '<' )
			? `<g${ alpha }>${ body }</g>`
			: body;
	};

	const body = layers
		.filter( ( l ) => ! l.parent )
		.map( emit )
		.filter( Boolean )
		.join( '\n' );
	const bg =
		doc.bg && 'transparent' !== doc.bg
			? `<rect width="${ doc.w }" height="${ doc.h }" fill="${ esc(
					doc.bg
			  ) }"/>\n`
			: '';
	const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${
		doc.w
	}" height="${ doc.h }" viewBox="0 0 ${ doc.w } ${ doc.h }">\n${
		defs.items.length ? `<defs>${ defs.items.join( '' ) }</defs>\n` : ''
	}${ bg }${ body }\n</svg>\n`;
	return { svg, warnings: defs.warnings };
}
