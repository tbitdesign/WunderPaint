/** Actual closed geometry for the design families, shared by text and SVG outlines. */
import * as THREE from 'three';
import {
	mergeGeometries,
	mergeVertices,
} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cleanPoints, offsetLine, strokeOutline } from './stroke-outline.js';
import { smoothSides } from './smooth.js';
import { normalizeDesign, designQuality } from './design-params.js';

const TAU = Math.PI * 2;
const v2 = ( points ) => points.map( ( p ) => new THREE.Vector2( p.x, p.y ) );

export function shapeRings( shapes, segments = 8 ) {
	return shapes.flatMap( ( shape ) => {
		const data = shape.extractPoints( segments );
		return [ data.shape, ...data.holes ]
			.map( cleanPoints )
			.filter( ( r ) => r.length >= 3 );
	} );
}

function ringShape( ring ) {
	return new THREE.Shape( v2( ring ) );
}

function outlineBands( rings, width ) {
	return rings.map( ( ring ) => {
		const expanded = strokeOutline( [ ...ring, ring[ 0 ] ], width );
		const shape = ringShape( expanded[ 0 ].points );
		shape.holes.push( new THREE.Path( v2( expanded[ 1 ].points ) ) );
		return shape;
	} );
}

/** Area / perimeter provides a conservative size for narrow strokes and counters. */
export function strokeSize( shapes, segments = 8 ) {
	let area = 0;
	let perimeter = 0;
	for ( const shape of shapes ) {
		const data = shape.extractPoints( segments );
		[ data.shape, ...data.holes ].forEach( ( raw, i ) => {
			const ring = cleanPoints( raw );
			area += Math.abs( THREE.ShapeUtils.area( ring ) ) * ( i ? -1 : 1 );
			for ( let j = 0; j < ring.length; j++ ) {
				const a = ring[ j ];
				const b = ring[ ( j + 1 ) % ring.length ];
				perimeter += Math.hypot( b.x - a.x, b.y - a.y );
			}
		} );
	}
	return Math.max( 0.12, area / Math.max( 1, perimeter ) );
}

function insetShapes( shapes, amount, segments ) {
	return shapes.map( ( shape ) => {
		const data = shape.extractPoints( segments );
		const rings = [ data.shape, ...data.holes ].map( ( raw, i ) => {
			const ring = cleanPoints( raw );
			const ccw = THREE.ShapeUtils.area( ring ) > 0 ? 1 : -1;
			return offsetLine( ring, amount * ccw * ( i ? -1 : 1 ), true );
		} );
		const out = ringShape( rings[ 0 ] );
		out.holes = rings.slice( 1 ).map( ( r ) => new THREE.Path( v2( r ) ) );
		return out;
	} );
}

/** Uniform arc-length samples retain corners (no Catmull-Rom overshoot into counters). */
function resampleRing( ring, maxSteps ) {
	const lengths = ring.map( ( a, i ) => {
		const b = ring[ ( i + 1 ) % ring.length ];
		return Math.hypot( b.x - a.x, b.y - a.y );
	} );
	const step = lengths.reduce( ( a, b ) => a + b, 0 ) / maxSteps;
	const result = [];
	ring.forEach( ( a, i ) => {
		const b = ring[ ( i + 1 ) % ring.length ];
		const n = Math.max(
			1,
			Math.ceil( lengths[ i ] / Math.max( 0.5, step ) )
		);
		for ( let j = 0; j < n; j++ ) {
			result.push( {
				x: a.x + ( ( b.x - a.x ) * j ) / n,
				y: a.y + ( ( b.y - a.y ) * j ) / n,
			} );
		}
	} );
	return result;
}

/** Sweep a round tube or a solid rectangular ribbon along a closed 3D contour. */
function sweepRing( raw, { z, radius, ribbon, thickness, bend = 0, quality } ) {
	const ring = resampleRing( raw, quality.ringSteps );
	const distance = [ 0 ];
	for ( let i = 1; i <= ring.length; i++ ) {
		const a = ring[ i - 1 ];
		const b = ring[ i % ring.length ];
		distance.push( distance[ i - 1 ] + Math.hypot( b.x - a.x, b.y - a.y ) );
	}
	const points = ring.map(
		( p, i ) =>
			new THREE.Vector3(
				p.x,
				p.y,
				z +
					Math.sin(
						( TAU * distance[ i ] ) / distance[ ring.length ]
					) *
						bend
			)
	);
	const sides = ribbon ? 4 : 8;
	const positions = [];
	const indices = [];
	const axis = new THREE.Vector3( 0, 0, 1 );
	points.forEach( ( point, i ) => {
		const tangent = points[ ( i + 1 ) % points.length ]
			.clone()
			.sub( points[ ( i - 1 + points.length ) % points.length ] )
			.normalize();
		const normal = new THREE.Vector3()
			.crossVectors( tangent, axis )
			.normalize();
		const binormal = new THREE.Vector3()
			.crossVectors( normal, tangent )
			.normalize();
		for ( let j = 0; j < sides; j++ ) {
			const u = ribbon
				? j === 0 || j === 3
					? -thickness / 2
					: thickness / 2
				: Math.cos( ( j / sides ) * TAU ) * radius;
			const v = ribbon
				? j < 2
					? -radius
					: radius
				: Math.sin( ( j / sides ) * TAU ) * radius;
			const vertex = point
				.clone()
				.addScaledVector( normal, u )
				.addScaledVector( binormal, v );
			positions.push( vertex.x, vertex.y, vertex.z );
			const a = i * sides + j;
			const b = i * sides + ( ( j + 1 ) % sides );
			const c =
				( ( i + 1 ) % points.length ) * sides + ( ( j + 1 ) % sides );
			const d = ( ( i + 1 ) % points.length ) * sides + j;
			indices.push( a, d, b, b, d, c );
		}
	} );
	const geo = new THREE.BufferGeometry();
	geo.setAttribute(
		'position',
		new THREE.Float32BufferAttribute( positions, 3 )
	);
	geo.setIndex( indices );
	geo.computeVertexNormals();
	// Smooth along the path, sharp across the four ribbon edges. Independent
	// triangle normals caused visible creases along otherwise smooth curves.
	if ( ribbon ) {
		const ribbonPositions = [];
		const ribbonIndices = [ [], [] ];
		for ( let i = 0; i < points.length; i++ ) {
			for ( let j = 0; j < 4; j++ ) {
				for ( const k of [ j, ( j + 1 ) % 4 ] ) {
					const offset = ( i * 4 + k ) * 3;
					ribbonPositions.push(
						...positions.slice( offset, offset + 3 )
					);
				}
				const a = i * 8 + j * 2;
				const d = ( ( i + 1 ) % points.length ) * 8 + j * 2;
				ribbonIndices[ j === 3 ? 1 : 0 ].push(
					a,
					d,
					a + 1,
					a + 1,
					d,
					d + 1
				);
			}
		}
		geo.dispose();
		const result = new THREE.BufferGeometry();
		result.setAttribute(
			'position',
			new THREE.Float32BufferAttribute( ribbonPositions, 3 )
		);
		result.setIndex( ribbonIndices.flat() );
		result.addGroup( 0, ribbonIndices[ 0 ].length, 0 );
		result.addGroup(
			ribbonIndices[ 0 ].length,
			ribbonIndices[ 1 ].length,
			1
		);
		result.computeVertexNormals();
		return result;
	}
	return geo;
}

function joined( geos, preserveGroups = false ) {
	if ( geos.length === 1 ) {
		return geos[ 0 ];
	}
	const result = mergeGeometries( geos, false );
	if ( preserveGroups ) {
		let offset = 0;
		for ( const geo of geos ) {
			for ( const group of geo.groups ) {
				result.addGroup(
					offset + group.start,
					group.count,
					group.materialIndex
				);
			}
			offset += geo.index
				? geo.index.count
				: geo.attributes.position.count;
		}
	}
	geos.forEach( ( g ) => g.dispose() );
	return result;
}

/** Squared distance to all outline segments; caps remain inside the real glyph. */
function outlineDistance( x, y, rings ) {
	let d = Infinity;
	for ( const ring of rings ) {
		for ( let i = 0; i < ring.length; i++ ) {
			const a = ring[ i ];
			const b = ring[ ( i + 1 ) % ring.length ];
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const t = Math.max(
				0,
				Math.min(
					1,
					( ( x - a.x ) * dx + ( y - a.y ) * dy ) /
						( dx * dx + dy * dy || 1 )
				)
			);
			d = Math.min(
				d,
				( x - a.x - t * dx ) ** 2 + ( y - a.y - t * dy ) ** 2
			);
		}
	}
	return Math.sqrt( d );
}

/** Longest-edge bisection subdivides faces before bending; no rigid-letter illusion. */
function subdivide( a, b, c, limit2, emit, level = 0 ) {
	const lengths = [
		a.distanceToSquared( b ),
		b.distanceToSquared( c ),
		c.distanceToSquared( a ),
	];
	const longest = Math.max( ...lengths );
	if ( longest <= limit2 || level >= 12 ) {
		emit( a, b, c );
		return;
	}
	const k = lengths.indexOf( longest );
	const vertices = [ a, b, c ];
	const p = vertices[ k ];
	const q = vertices[ ( k + 1 ) % 3 ];
	const r = vertices[ ( k + 2 ) % 3 ];
	const middle = p.clone().add( q ).multiplyScalar( 0.5 );
	subdivide( p, middle, r, limit2, emit, level + 1 );
	subdivide( middle, q, r, limit2, emit, level + 1 );
}

function refineGeometry(
	source,
	step,
	transform = ( v ) => v,
	smooth = false,
	maxTriangles = 30000
) {
	source.computeBoundingBox();
	const size = source.boundingBox.getSize( new THREE.Vector3() );
	const boxArea = 2 * ( size.x * size.y + size.x * size.z + size.y * size.z );
	step = Math.max( step, Math.sqrt( boxArea / ( maxTriangles * 0.4 ) ) );
	const sourceIndexed = !! source.index;
	const raw = sourceIndexed ? source.toNonIndexed() : source;
	const positions = raw.attributes.position;
	const out = [];
	const groups = raw.groups.length
		? raw.groups
		: [ { start: 0, count: positions.count, materialIndex: 0 } ];
	const geo = new THREE.BufferGeometry();
	for ( const group of groups ) {
		const start = out.length / 3;
		for ( let i = group.start; i < group.start + group.count; i += 3 ) {
			const tri = [ 0, 1, 2 ].map( ( j ) =>
				new THREE.Vector3().fromBufferAttribute( positions, i + j )
			);
			subdivide( ...tri, step * step, ( ...vertices ) => {
				for ( const p of vertices ) {
					const v = transform( p.clone(), group.materialIndex );
					out.push( v.x, v.y, v.z );
				}
			} );
		}
		geo.addGroup( start, out.length / 3 - start, group.materialIndex );
	}
	geo.setAttribute( 'position', new THREE.Float32BufferAttribute( out, 3 ) );
	if ( sourceIndexed ) {
		raw.dispose();
	}
	source.dispose();
	const result = smooth ? mergeVertices( geo, 0.0001 ) : geo;
	if ( smooth ) {
		geo.dispose();
	}
	result.computeVertexNormals();
	return result;
}

function pillowGeometry( shapes, rings, depth, p, q, stroke ) {
	const source = new THREE.ShapeGeometry( shapes, q.curves );
	const height = depth * ( 0.24 + p.inflate * 0.0045 );
	const front = refineGeometry(
		source,
		q.faceStep,
		( v ) => {
			const distance = outlineDistance( v.x, v.y, rings );
			const t = Math.min( 1, distance / Math.max( 0.3, stroke * 1.15 ) );
			v.z = height * Math.sqrt( 1 - ( 1 - t ) ** 2 );
			return v;
		},
		false,
		q.maxTriangles
	);
	const back = front.clone();
	back.scale( 1, 1, -1 );
	// Mirroring a closed surface reverses winding, not just its normals.
	const bp = back.attributes.position;
	for ( let i = 0; i < bp.count; i += 3 ) {
		const v = new THREE.Vector3().fromBufferAttribute( bp, i );
		bp.setXYZ( i, bp.getX( i + 2 ), bp.getY( i + 2 ), bp.getZ( i + 2 ) );
		bp.setXYZ( i + 2, v.x, v.y, v.z );
	}
	front.deleteAttribute( 'normal' );
	back.deleteAttribute( 'normal' );
	const capCount = front.attributes.position.count;
	const both = joined( [ front, back ] );
	both.addGroup( 0, capCount, 0 );
	both.addGroup( capCount, capCount, 1 );
	const result = mergeVertices( both, 0.0001 );
	both.dispose();
	// Fair the cap's medial ridges without shifting its silhouette or holes.
	// Both hemispheres remain joined along their unchanged equator.
	const points = result.attributes.position;
	const neighbors = Array.from( { length: points.count }, () => new Set() );
	for ( let i = 0; i < result.index.count; i += 3 ) {
		const triangle = [ 0, 1, 2 ].map( ( j ) => result.index.getX( i + j ) );
		triangle.forEach( ( a ) =>
			triangle.forEach( ( b ) => {
				if ( a !== b ) {
					neighbors[ a ].add( b );
				}
			} )
		);
	}
	for ( let pass = 0; pass < 5; pass++ ) {
		const zs = new Float32Array( points.count );
		for ( let i = 0; i < points.count; i++ ) {
			const z = points.getZ( i );
			let total = 0;
			neighbors[ i ].forEach( ( j ) => {
				total += points.getZ( j );
			} );
			zs[ i ] =
				Math.abs( z ) < 0.001
					? z
					: z * 0.65 +
					  ( total / Math.max( 1, neighbors[ i ].size ) ) * 0.35;
		}
		for ( let i = 0; i < points.count; i++ ) {
			points.setZ( i, zs[ i ] );
		}
	}
	result.computeVertexNormals();
	return result;
}

function extrude( shapes, depth, p, q, stroke, z = 0, profile = p.profile ) {
	const bevel = ( p.bevel ?? 40 ) / 100;
	const size = Math.min(
		stroke * 0.7,
		profile === 'classic'
			? 2.8 * bevel
			: ( 0.3 + p.edgeSize * 0.06 ) * bevel
	);
	const segs = profile === 'facet' ? 1 : profile === 'round' ? 8 : 4;
	const geo = new THREE.ExtrudeGeometry( shapes, {
		depth,
		bevelEnabled: size > 0.01,
		bevelSize: size,
		bevelThickness: Math.min( depth * 0.28, size * 0.8 ),
		// A bake takes twice the bevel steps; a facet stays one cut.
		bevelSegments: q.fine && segs > 1 ? segs * 2 : segs,
		curveSegments: q.curves,
		steps:
			p.surface === 'fluted'
				? Math.min( 80, 12 + Math.round( depth / 2 ) )
				: 1,
	} );
	geo.translate( 0, 0, z - depth / 2 );
	// Rounds shaded round, corners kept (smooth.js); whatever reshapes
	// the extrusion later works out its own normals anyway.
	return smoothSides( geo );
}

/** Keep a liquid horizontal inside the contour, with a real top face around holes. */
export function liquidGeometry( shapes, depth, level, q ) {
	const rings = shapeRings( shapes, q.curves );
	if ( ! rings.length ) {
		return new THREE.BufferGeometry().setAttribute(
			'position',
			new THREE.Float32BufferAttribute( [], 3 )
		);
	}
	let ymin = Infinity;
	let ymax = -Infinity;
	for ( const ring of rings ) {
		for ( const p of ring ) {
			ymin = Math.min( ymin, p.y );
			ymax = Math.max( ymax, p.y );
		}
	}
	const height = ymin + ( ( ymax - ymin ) * level ) / 100;
	const base = new THREE.ExtrudeGeometry( shapes, {
		depth,
		bevelEnabled: false,
		curveSegments: q.curves,
	} );
	base.translate( 0, 0, -depth / 2 );
	const pos = base.attributes.position;
	const out = [];
	const add = ( a, b, c ) =>
		out.push( ...a.toArray(), ...b.toArray(), ...c.toArray() );
	for ( let i = 0; i < pos.count; i += 3 ) {
		const input = [ 0, 1, 2 ].map( ( j ) =>
			new THREE.Vector3().fromBufferAttribute( pos, i + j )
		);
		const poly = [];
		for ( let j = 0; j < 3; j++ ) {
			const a = input[ j ];
			const b = input[ ( j + 1 ) % 3 ];
			if ( a.y <= height ) {
				poly.push( a );
			}
			if ( a.y < height !== b.y < height ) {
				poly.push(
					a.clone().lerp( b, ( height - a.y ) / ( b.y - a.y ) )
				);
			}
		}
		for ( let j = 1; j < poly.length - 1; j++ ) {
			add( poly[ 0 ], poly[ j ], poly[ j + 1 ] );
		}
	}
	const hits = [];
	for ( const ring of rings ) {
		for ( let i = 0; i < ring.length; i++ ) {
			const a = ring[ i ];
			const b = ring[ ( i + 1 ) % ring.length ];
			if ( a.y < height !== b.y < height ) {
				hits.push(
					a.x + ( ( b.x - a.x ) * ( height - a.y ) ) / ( b.y - a.y )
				);
			}
		}
	}
	hits.sort( ( a, b ) => a - b );
	for ( let i = 0; i + 1 < hits.length; i += 2 ) {
		const a = new THREE.Vector3( hits[ i ], height, -depth / 2 );
		const b = new THREE.Vector3( hits[ i ], height, depth / 2 );
		const c = new THREE.Vector3( hits[ i + 1 ], height, depth / 2 );
		const d = new THREE.Vector3( hits[ i + 1 ], height, -depth / 2 );
		add( a, b, d );
		add( b, c, d );
	}
	base.dispose();
	const geo = new THREE.BufferGeometry();
	geo.setAttribute( 'position', new THREE.Float32BufferAttribute( out, 3 ) );
	geo.computeVertexNormals();
	return geo;
}

/** Factory owns material creation/caching; the caller owns and disposes all results. */
export function buildDesign(
	shapes,
	depth,
	input,
	pair,
	material,
	quality = designQuality()
) {
	const p = { ...input, ...normalizeDesign( input ) };
	const q = quality;
	const group = new THREE.Group();
	const rings = shapeRings( shapes, q.curves );
	if ( ! rings.length ) {
		return group;
	}
	const stroke = strokeSize( shapes, q.curves );
	const width = Math.min( stroke * 0.7, 0.2 + p.wall * 0.14 );
	const shapeBox = new THREE.Box2();
	rings.flat().forEach( ( pt ) => shapeBox.expandByPoint( pt ) );
	const center = shapeBox.getCenter( new THREE.Vector2() );
	const add = ( geometry, materials = [ pair.face, pair.side ] ) => {
		const mesh = new THREE.Mesh( geometry, materials );
		group.add( mesh );
		return mesh;
	};
	const painted = ( preset, color, side = color, wallThickness = null ) =>
		material( preset, color, side, wallThickness );
	const shifted = ( mesh, t ) => {
		const angle = ( ( p.stackTwist * Math.PI ) / 180 ) * t;
		mesh.geometry.translate( -center.x, -center.y, 0 );
		mesh.rotation.z = angle;
		mesh.position.set(
			center.x + t * p.spread * 0.55,
			center.y + t * p.spread * 0.12,
			0
		);
	};
	if ( p.shape === 'contour' || p.shape === 'tube' || p.shape === 'ribbon' ) {
		const ribbon = p.shape === 'ribbon';
		const count =
			p.shape === 'contour'
				? Math.min( p.copies, q.maxCopies )
				: ribbon
				? 2
				: 1;
		for ( let i = 0; i < count; i++ ) {
			const t = count > 1 ? i / ( count - 1 ) : 0.5;
			const color = new THREE.Color( input.faceColor || '#e8ebf0' )
				.lerp( new THREE.Color( input.color2 || '#9256f0' ), t )
				.getHexString();
			const mat =
				p.shape === 'tube'
					? pair.face
					: painted( input.preset, '#' + color ).face;
			const geo = joined(
				rings.map( ( ring ) =>
					sweepRing( ring, {
						z: ( t - 0.5 ) * depth,
						radius: ribbon
							? Math.max( 1, depth * 0.27 )
							: p.shape === 'tube'
							? width * 1.3
							: Math.min( width * 0.7, ( depth / count ) * 0.32 ),
						thickness: Math.max( 0.3, width * 0.7 ),
						ribbon,
						bend:
							ribbon || p.shape === 'tube'
								? ( depth * p.gap ) / 220
								: 0,
						quality: q,
					} )
				),
				ribbon
			);
			shifted( add( geo, ribbon ? [ mat, pair.side ] : mat ), t - 0.5 );
		}
	} else if ( p.shape === 'slices' ) {
		const count = Math.min( p.copies, q.maxCopies );
		const pitch = depth / count;
		for ( let i = 0; i < count; i++ ) {
			const t = i / ( count - 1 );
			const geo = extrude(
				shapes,
				Math.max( 0.15, pitch * ( 1 - p.gap / 100 ) ),
				p,
				q,
				stroke,
				( t - 0.5 ) * ( depth - pitch )
			);
			shifted( add( geo ), t - 0.5 );
		}
	} else if ( p.shape === 'stack' ) {
		const count = Math.min(
			p.stackRepeat,
			Math.max( 1, Math.floor( q.maxCopies / 3 ) )
		);
		const face = painted( p.faceMaterial, p.layerColor );
		const edge = painted( p.edgeMaterial, p.edgeColor );
		const unit = depth / count;
		for ( let i = 0; i < count; i++ ) {
			const start = -depth / 2 + i * unit;
			const fd = ( unit * p.faceDepth ) / 100;
			const ed = ( unit * p.edgeDepth ) / 100;
			const body = unit - fd - ed;
			const layers = [
				[ body, pair ],
				[ ed, edge ],
				[ fd, face ],
			];
			let z = start;
			for ( const [ d, mat ] of layers ) {
				const geo = extrude(
					shapes,
					d * 0.96,
					p,
					q,
					stroke,
					z + d / 2
				);
				shifted(
					add( geo, [ mat.face, mat.side ] ),
					count > 1 ? i / ( count - 1 ) - 0.5 : 0
				);
				z += d;
			}
		}
	} else if ( p.shape === 'pillow' ) {
		add( pillowGeometry( shapes, rings, depth, p, q, stroke ), [
			pair.face,
			pair.side,
		] );
		if ( p.seam > 0 ) {
			const geo = joined(
				rings.map( ( ring ) =>
					sweepRing( ring, {
						z: 0,
						radius: 0.1 + p.seam * 0.008,
						quality: q,
					} )
				)
			);
			add( geo, painted( p.edgeMaterial, p.edgeColor ).face );
		}
	} else if ( p.shape === 'shell' ) {
		add(
			extrude(
				outlineBands( rings, width ),
				depth,
				{ ...p, bevel: 20 },
				q,
				width * 0.5
			)
		);
		add(
			extrude(
				shapes,
				Math.max( 0.4, width ),
				{ ...p, bevel: 0 },
				q,
				stroke,
				-depth / 2 + width / 2
			)
		);
	} else if ( p.shape === 'glass' ) {
		const glass = painted(
			input.preset === 'frosted' ? 'frosted' : 'glass',
			input.faceColor || '#e9f4ff',
			input.sideColor || input.faceColor || '#e9f4ff',
			width
		);
		const shell = add( extrude( shapes, depth, p, q, stroke ), [
			glass.face,
			glass.side,
		] );
		shell.userData.glassShell = true;
		const inner = insetShapes(
			shapes,
			Math.min( width, stroke * 0.3 ),
			q.curves
		);
		const innerDepth = Math.max( 0.5, depth - width * 2 );
		// Opaque cores participate in the transmission buffer of the outer glass.
		const core = painted(
			p.coreMaterial === 'glass' || p.coreMaterial === 'frosted'
				? 'gloss'
				: p.coreMaterial,
			p.coreColor
		);
		if ( p.interior === 'liquid' ) {
			if ( p.fillLevel > 0 ) {
				add(
					liquidGeometry( inner, innerDepth, p.fillLevel, q ),
					core.face
				);
			}
		} else if ( p.interior === 'layers' ) {
			for ( let i = 0; i < 5; i++ ) {
				const color = new THREE.Color( p.coreColor ).lerp(
					new THREE.Color( p.edgeColor ),
					i / 4
				);
				const layer = painted(
					[ 'glass', 'frosted', 'jelly', 'opal' ].includes(
						p.coreMaterial
					)
						? 'gloss'
						: p.coreMaterial,
					'#' + color.getHexString()
				);
				add(
					extrude(
						inner,
						innerDepth * 0.12,
						{ ...p, bevel: 0 },
						q,
						stroke,
						( i - 2 ) * innerDepth * 0.19
					),
					[ layer.face, layer.side ]
				);
			}
		} else {
			add(
				extrude(
					inner,
					innerDepth * 0.68,
					{ ...p, bevel: 25 },
					q,
					stroke
				),
				[ core.face, core.side ]
			);
		}
	} else {
		let geo = extrude( shapes, depth, p, q, stroke );
		if ( p.profile === 'inset' ) {
			geo.dispose();
			geo = extrude( shapes, depth * 0.85, p, q, stroke, -depth * 0.075 );
			const rim = painted( p.edgeMaterial, p.edgeColor );
			add(
				extrude(
					outlineBands( rings, width ),
					depth * 0.16,
					{ ...p, bevel: 20 },
					q,
					width,
					depth * 0.425
				),
				[ rim.face, rim.side ]
			);
		} else if ( p.profile === 'steps' ) {
			geo.dispose();
			geo = extrude(
				shapes,
				depth * 0.62,
				{ ...p, bevel: 0 },
				q,
				stroke,
				-depth * 0.19
			);
			for ( let i = 0; i < 3; i++ ) {
				const inner = insetShapes(
					shapes,
					( ( stroke * p.edgeSize ) / 100 ) * ( i + 1 ) * 0.14,
					q.curves
				);
				add(
					extrude(
						inner,
						depth * 0.13,
						{ ...p, bevel: 0 },
						q,
						stroke,
						depth * ( 0.185 + i * 0.13 )
					)
				);
			}
		}
		if ( p.surface === 'machined' || p.surface === 'engraved' ) {
			const spacing = 2 + p.grooveSpacing * 0.13;
			const angle = ( p.grooveAngle * Math.PI ) / 180;
			geo = refineGeometry(
				geo,
				Math.min( q.faceStep, spacing / 3 ),
				( v, materialIndex ) => {
					if ( materialIndex === 0 && v.z > 0 ) {
						const d = outlineDistance( v.x, v.y, rings );
						const axis =
							p.surface === 'engraved'
								? d
								: v.x * Math.cos( angle ) +
								  v.y * Math.sin( angle );
						const cut = Math.pow(
							0.5 + 0.5 * Math.cos( ( axis / spacing ) * TAU ),
							3
						);
						v.z -=
							cut *
							Math.min( depth * 0.2, p.grooveDepth * 0.045 ) *
							Math.min( 1, d / 1.5 );
					}
					return v;
				},
				true,
				q.maxTriangles
			);
		} else if ( p.surface === 'fluted' ) {
			const pos = geo.attributes.position;
			const norm = geo.attributes.normal;
			for ( let i = 0; i < pos.count; i++ ) {
				const z = pos.getZ( i );
				const taper = Math.max(
					0,
					1 - Math.pow( Math.abs( z ) / ( depth / 2 ), 8 )
				);
				const rib =
					( 0.5 +
						0.5 *
							Math.cos(
								( z / ( 2 + p.grooveSpacing * 0.12 ) ) * TAU
							) ) *
					Math.min( stroke * 0.3, p.grooveDepth * 0.035 ) *
					taper;
				pos.setXY(
					i,
					pos.getX( i ) + norm.getX( i ) * rib,
					pos.getY( i ) + norm.getY( i ) * rib
				);
			}
			geo.computeVertexNormals();
		}
		add( geo );
	}
	return group;
}

/** Deform all vertices in word space, including the depth and the interior geometry. */
export function deformDesign( group, input, quality = designQuality() ) {
	const p = normalizeDesign( input );
	if ( p.deform === 'none' || p.bendAmount === 0 ) {
		return;
	}
	group.updateMatrixWorld( true );
	const box = new THREE.Box3().setFromObject( group );
	if ( box.isEmpty() ) {
		return;
	}
	const center = box.getCenter( new THREE.Vector3() );
	const width = Math.max( 1, box.max.x - box.min.x );
	const height = Math.max( 1, box.max.y - box.min.y );
	const amount = p.bendAmount / 100;
	group.traverse( ( mesh ) => {
		if ( ! mesh.isMesh ) {
			return;
		}
		const matrix = mesh.matrixWorld.clone();
		const inverse = matrix.clone().invert();
		mesh.geometry = refineGeometry(
			mesh.geometry,
			Math.max( quality.faceStep, width / 90 ),
			( v ) => {
				v.applyMatrix4( matrix );
				const x = v.x - center.x;
				const y = v.y - center.y;
				const z = v.z - center.z;
				const t = x / width;
				if ( p.deform === 'wave' ) {
					v.z +=
						Math.sin( t * TAU * p.bendCycles ) *
						amount *
						height *
						0.4;
					v.y +=
						Math.cos( t * TAU * p.bendCycles ) *
						amount *
						height *
						0.12;
				} else if ( p.deform === 'scurve' ) {
					v.y +=
						Math.sin( t * Math.PI * 1.7 ) * amount * height * 0.6;
					v.z +=
						Math.sin( t * Math.PI * 1.7 ) * amount * height * 0.22;
				} else if ( p.deform === 'fan' ) {
					v.x =
						center.x +
						x * ( 1 + ( ( amount * y ) / height ) * 0.7 );
					v.z += amount * t * t * height;
				} else if ( p.deform === 'taper' ) {
					const scale = 1 + amount * t * 0.9;
					v.y = center.y + y * scale;
					v.z = center.z + z * scale;
				} else if ( p.deform === 'twist' ) {
					const a = t * amount * Math.PI;
					v.y = center.y + y * Math.cos( a ) - z * Math.sin( a );
					v.z = center.z + y * Math.sin( a ) + z * Math.cos( a );
				}
				return v.applyMatrix4( inverse );
			},
			true,
			quality.maxTriangles
		);
	} );
}
