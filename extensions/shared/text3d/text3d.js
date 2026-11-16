/**
 * 3D text builder: opentype.js glyph outlines -> THREE.Shapes (holes
 * handled by SVGLoader.createShapes) -> one beveled ExtrudeGeometry per
 * glyph, laid out with kerning, letter spacing, line height, alignment
 * and an optional curve bend around Y. Per-glyph meshes keep the bend
 * simple and rebuilds fast.
 *
 * Materials are premium presets on MeshPhysicalMaterial with a two-tone
 * split: ExtrudeGeometry group 0 = front/back caps (+ bevel), group 1 =
 * extruded walls, so Face and Side can carry different colors.
 */

import * as THREE from 'three';
import { DESIGN_MATERIALS, applySurfaceTexture } from './design-materials.js';
import { normalizeDesign, designQuality } from './design-params.js';
import { buildDesign, deformDesign } from './design-geometry.js';
import { smoothSides, DETAIL } from './smooth.js';

/** World-space em size; everything else scales from it. */
export const TEXT_SIZE = 100;

/* -------------------------------- presets -------------------------------- */

export const PRESETS = {
	...DESIGN_MATERIALS,
	gold: {
		label: 'Gold',
		face: '#f6c453',
		side: '#9a7414',
		mat: {
			metalness: 1,
			roughness: 0.12,
			env: 2.2,
			clearcoat: 0.55,
			clearcoatRoughness: 0.14,
		},
	},
	chrome: {
		label: 'Chrome',
		face: '#eef1f6',
		side: '#c7cdd6',
		mat: { metalness: 1, roughness: 0.02, env: 2.4 },
	},
	copper: {
		label: 'Copper',
		face: '#e08a52',
		side: '#8d4a28',
		mat: {
			metalness: 1,
			roughness: 0.15,
			env: 2.0,
			clearcoat: 0.5,
			clearcoatRoughness: 0.16,
		},
	},
	steel: {
		label: 'Steel',
		face: '#a9b2bd',
		side: '#77808b',
		mat: { metalness: 1, roughness: 0.38, env: 1.5 },
	},
	glass: {
		label: 'Glass',
		face: '#cfe0ff',
		side: '#b7cdf4',
		mat: {
			metalness: 0,
			roughness: 0.03,
			transmission: 1,
			ior: 1.5,
			env: 1.6,
		},
	},
	frosted: {
		label: 'Frosted',
		face: '#e3ebf6',
		side: '#cbd8ea',
		mat: {
			metalness: 0,
			roughness: 0.42,
			transmission: 1,
			ior: 1.45,
			env: 1.15,
		},
	},
	neon: {
		label: 'Neon',
		face: '#41f2ff',
		side: '#127f8c',
		mat: {
			metalness: 0,
			roughness: 0.35,
			emissiveFace: 2.4,
			emissiveSide: 1.1,
			env: 0.5,
		},
		glow: 65,
	},
	gloss: {
		label: 'Gloss',
		face: '#e8455f',
		side: '#a01f36',
		mat: {
			metalness: 0,
			roughness: 0.12,
			clearcoat: 1,
			clearcoatRoughness: 0.06,
			env: 0.9,
		},
	},
	matte: {
		label: 'Matte',
		face: '#e8ebf0',
		side: '#b9bfc9',
		mat: { metalness: 0, roughness: 0.7, env: 0.55 },
	},
	candy: {
		label: 'Candy',
		face: '#ff6fb0',
		side: '#c23a7e',
		mat: {
			metalness: 0.2,
			roughness: 0.16,
			clearcoat: 1,
			clearcoatRoughness: 0.1,
			iridescence: 0.35,
			env: 1.15,
		},
	},
	hologram: {
		label: 'Hologram',
		face: '#cdd4ff',
		side: '#9aa4e8',
		mat: {
			metalness: 0.95,
			roughness: 0.1,
			iridescence: 1,
			iridescenceIOR: 1.8,
			env: 1.65,
		},
	},
	gradient: {
		label: 'Gradient',
		face: '#5b7cfa',
		side: '#31437f',
		mat: { metalness: 0.25, roughness: 0.3, env: 0.85 },
		gradient: true,
	},
	rosegold: {
		label: 'Rose gold',
		face: '#efb3a2',
		side: '#985e50',
		mat: {
			metalness: 1,
			roughness: 0.2,
			env: 1.8,
			clearcoat: 0.4,
			clearcoatRoughness: 0.2,
		},
	},
	bronze: {
		label: 'Bronze',
		face: '#bd874a',
		side: '#684726',
		mat: {
			metalness: 0.92,
			roughness: 0.42,
			env: 1.4,
		},
	},
	satin: {
		label: 'Satin metal',
		face: '#c8d2de',
		side: '#8797a9',
		mat: {
			metalness: 0.85,
			roughness: 0.52,
			env: 1.2,
		},
	},
	ceramic: {
		label: 'Glazed ceramic',
		face: '#e5f1ec',
		side: '#9eb6b2',
		mat: {
			metalness: 0,
			roughness: 0.22,
			env: 0.8,
			clearcoat: 1,
			clearcoatRoughness: 0.15,
		},
	},
	rubber: {
		label: 'Rubber',
		face: '#576775',
		side: '#35424c',
		mat: {
			metalness: 0,
			roughness: 1,
			env: 0.2,
		},
	},
	pearl: {
		label: 'Pearl',
		face: '#fff0df',
		side: '#baa3b9',
		mat: {
			metalness: 0.15,
			roughness: 0.25,
			env: 1.2,
			clearcoat: 1,
			clearcoatRoughness: 0.12,
			iridescence: 0.55,
			iridescenceIOR: 1.3,
		},
	},
	jelly: {
		label: 'Jelly',
		face: '#f58fb4',
		side: '#bc466f',
		mat: {
			metalness: 0,
			roughness: 0.14,
			env: 1.1,
			transmission: 0.65,
			ior: 1.33,
			clearcoat: 1,
			clearcoatRoughness: 0.05,
		},
	},
	opal: {
		label: 'Opal',
		face: '#c6f2e7',
		side: '#8494c4',
		mat: {
			metalness: 0.25,
			roughness: 0.24,
			env: 1.5,
			transmission: 0.3,
			ior: 1.45,
			iridescence: 1,
			iridescenceIOR: 1.4,
			clearcoat: 0.7,
		},
	},
};

/**
 * Vertical two-color gradient as a shader patch (world Y, abs() so the
 * ground-reflection clone mirrors the gradient correctly). The patch and
 * its cache key live on userData so the reflection material can re-apply
 * them on its clones (Material.clone drops onBeforeCompile).
 */
function applyGradient( mat, topHex, bottomHex ) {
	const uniforms = {
		a: { value: new THREE.Color( topHex ) },
		b: { value: new THREE.Color( bottomHex ) },
		y0: { value: 0 },
		y1: { value: TEXT_SIZE },
	};
	const patch = ( sh ) => {
		sh.uniforms.uGradA = uniforms.a;
		sh.uniforms.uGradB = uniforms.b;
		sh.uniforms.uGradY0 = uniforms.y0;
		sh.uniforms.uGradY1 = uniforms.y1;
		sh.vertexShader = sh.vertexShader
			.replace(
				'#include <common>',
				'#include <common>\nvarying float wpieGradY;'
			)
			.replace(
				'#include <project_vertex>',
				'#include <project_vertex>\nwpieGradY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;'
			);
		sh.fragmentShader = sh.fragmentShader
			.replace(
				'#include <common>',
				'#include <common>\nvarying float wpieGradY;\nuniform vec3 uGradA;\nuniform vec3 uGradB;\nuniform float uGradY0;\nuniform float uGradY1;'
			)
			.replace(
				'#include <color_fragment>',
				'#include <color_fragment>\n{\n\tfloat wpieT = clamp( ( abs( wpieGradY ) - uGradY0 ) / max( 0.0001, uGradY1 - uGradY0 ), 0.0, 1.0 );\n\tdiffuseColor.rgb = mix( uGradB, uGradA, wpieT );\n}'
			);
	};
	mat.onBeforeCompile = patch;
	mat.customProgramCacheKey = () => 'wpie-grad';
	mat.userData.wpiePatch = patch;
	mat.userData.wpieCacheKey = 'wpie-grad';
	mat.userData.gradUniforms = uniforms;
}

/**
 * Face + side materials for the current params. `depthWorld` feeds the
 * glass thickness so refraction matches the extrusion.
 */
export function makeMaterials( p, depthWorld ) {
	const spec = PRESETS[ p.preset ] || PRESETS.gold;
	const m = spec.mat;
	const mk = ( hex, isFace ) => {
		const mat = new THREE.MeshPhysicalMaterial( {
			color: new THREE.Color( hex ),
			metalness: m.metalness ?? 0,
			roughness: m.roughness ?? 0.4,
		} );
		mat.envMapIntensity = m.env || 1;
		if ( m.clearcoat ) {
			mat.clearcoat = m.clearcoat;
			mat.clearcoatRoughness = m.clearcoatRoughness ?? 0.08;
		}
		if ( m.transmission ) {
			mat.transmission = m.transmission;
			mat.thickness = Math.max( 3, depthWorld * 0.6 );
			mat.ior = m.ior || 1.5;
			mat.attenuationColor = new THREE.Color( hex );
			mat.attenuationDistance = 140;
		}
		if ( m.iridescence ) {
			mat.iridescence = m.iridescence;
			mat.iridescenceIOR = m.iridescenceIOR || 1.6;
		}
		if ( m.sheen ) {
			mat.sheen = m.sheen;
			mat.sheenColor = new THREE.Color( hex );
			mat.sheenRoughness = 0.8;
		}
		if ( m.emissiveFace ) {
			mat.emissive = new THREE.Color( hex );
			mat.emissiveIntensity = isFace
				? m.emissiveFace
				: m.emissiveSide ?? m.emissiveFace * 0.5;
			mat.color = new THREE.Color( hex ).multiplyScalar( 0.16 );
		}
		if ( spec.gradient ) {
			applyGradient(
				mat,
				p.faceColor || spec.face,
				p.color2 || '#9256f0'
			);
		}
		applySurfaceTexture( mat, spec.texture, p );
		return mat;
	};
	return {
		face: mk( p.faceColor || spec.face, true ),
		side: mk( p.sideColor || spec.side, false ),
	};
}

/** Share layer materials across glyphs; the studio disposes the owned list. */
export function designMaterialFactory( p, depth, owned ) {
	const cache = new Map();
	return ( preset, color, side = color, wallThickness = null ) => {
		const key = preset + '|' + color + '|' + side + '|' + wallThickness;
		if ( ! cache.has( key ) ) {
			const pair = makeMaterials(
				{ ...p, preset, faceColor: color, sideColor: side },
				depth
			);
			if ( wallThickness !== null ) {
				pair.face.thickness = pair.side.thickness = Math.max(
					0.1,
					wallThickness
				);
			}
			cache.set( key, pair );
			owned.push( pair.face, pair.side );
		}
		return cache.get( key );
	};
}

/**
 * Sides tone for a face color: same hue, darkened. Plain sRGB math on
 * purpose - THREE.Color multiplies in linear space, which barely
 * darkens light colors after conversion back.
 */
export function sideHex( hex ) {
	const n = parseInt( hex.slice( 1 ), 16 );
	const ch = ( v ) => Math.round( v * 0.68 );
	return (
		'#' +
		(
			( ch( ( n >> 16 ) & 255 ) << 16 ) |
			( ch( ( n >> 8 ) & 255 ) << 8 ) |
			ch( n & 255 )
		)
			.toString( 16 )
			.padStart( 6, '0' )
	);
}

/* --------------------------------- shapes -------------------------------- */

/** Glyph outline -> THREE.Shapes with holes (nonzero fill like TrueType). */
function glyphShapes( glyph, scale ) {
	const path = new THREE.ShapePath();
	for ( const cmd of glyph.path.commands ) {
		if ( 'M' === cmd.type ) {
			path.moveTo( cmd.x * scale, cmd.y * scale );
		} else if ( 'L' === cmd.type ) {
			path.lineTo( cmd.x * scale, cmd.y * scale );
		} else if ( 'C' === cmd.type ) {
			path.bezierCurveTo(
				cmd.x1 * scale,
				cmd.y1 * scale,
				cmd.x2 * scale,
				cmd.y2 * scale,
				cmd.x * scale,
				cmd.y * scale
			);
		} else if ( 'Q' === cmd.type ) {
			path.quadraticCurveTo(
				cmd.x1 * scale,
				cmd.y1 * scale,
				cmd.x * scale,
				cmd.y * scale
			);
		}
	}
	for ( const sp of path.subPaths ) {
		sp.autoClose = true;
	}
	// three r180+: toShapes() carries the robust hole-assignment that
	// used to live in SVGLoader.createShapes (which now only warns).
	return path.toShapes();
}

/* --------------------------------- layout -------------------------------- */

/**
 * Greedy word wrap against a width budget in font units (kerning-aware
 * via getAdvanceWidth). A single word longer than the budget stays on
 * its own line - 3D type does not hyphenate.
 */
function wrapLine( font, line, budget ) {
	const words = line.split( ' ' ).filter( ( w ) => w.length );
	if ( ! words.length ) {
		return [ line ];
	}
	const out = [];
	let cur = '';
	for ( const w of words ) {
		const cand = cur ? cur + ' ' + w : w;
		if ( cur && font.getAdvanceWidth( cand, TEXT_SIZE ) > budget ) {
			out.push( cur );
			cur = w;
		} else {
			cur = cand;
		}
	}
	if ( cur ) {
		out.push( cur );
	}
	return out;
}

/**
 * Pure layout pass (shared by build and tests): glyph runs per line with
 * kerning + letter spacing, line widths and the block's max width.
 * `p.wrap` > 0 wraps long lines after roughly that many characters
 * (measured, not counted: budget = wrap x the width of "n"), so bound
 * post titles of any length keep a poster-friendly aspect.
 */
export function layoutLines( font, p ) {
	const scale = TEXT_SIZE / font.unitsPerEm;
	const spacing = TEXT_SIZE * ( ( p.letterSpacing || 0 ) / 100 );
	let lines = String( p.text || '' )
		.replace( /\r/g, '' )
		.split( '\n' )
		.map( ( s ) => s.replace( /\s+$/, '' ) );
	if ( p.wrap > 0 ) {
		const budget =
			p.wrap * Math.max( 1, font.getAdvanceWidth( 'n', TEXT_SIZE ) );
		lines = lines.flatMap( ( line ) => wrapLine( font, line, budget ) );
	}
	const styles = p.letterStyles || {};
	let vi = 0;
	const runs = lines.map( ( line ) => {
		const glyphs = font.stringToGlyphs( line );
		let x = 0;
		const items = [];
		glyphs.forEach( ( g, i ) => {
			if ( i > 0 ) {
				x +=
					font.getKerningValue( glyphs[ i - 1 ], g ) * scale +
					spacing;
			}
			// Visible glyphs (those that will get a mesh) share one
			// index sequence with buildText and the dialog's picker.
			const visible = g.path.commands.length > 0;
			const index = visible ? vi++ : null;
			const letterScale =
				visible && styles[ index ] && styles[ index ].scale
					? styles[ index ].scale / 100
					: 1;
			items.push( {
				g,
				x,
				adv: g.advanceWidth * scale * letterScale,
				index,
				letterScale,
			} );
			x += g.advanceWidth * scale * letterScale;
		} );
		return { items, width: x };
	} );
	return {
		runs,
		scale,
		maxW: Math.max( 1, ...runs.map( ( r ) => r.width ) ),
	};
}

/**
 * Build the text as a group of per-glyph meshes around the origin.
 * Baseline of the first line sits at y = 0 (the studio grounds the
 * group by its bounding box, so descenders touch the floor).
 */
export function buildText( font, p, mats, opts = {} ) {
	p = { ...p, ...normalizeDesign( p ) };
	const group = new THREE.Group();
	// Materials created for per-letter overrides; the studio disposes
	// them alongside the base pair on rebuild.
	group.userData.extraMats = [];
	if ( ! font ) {
		return group;
	}
	const styles = p.letterStyles || {};
	const overrideCache = new Map();
	const depthWorld = Math.max( 1.5, TEXT_SIZE * ( ( p.depth || 25 ) / 100 ) );
	const matsForIndex = ( index ) => {
		const st = styles[ index ];
		if ( ! st || ( ! st.color && ! st.preset ) ) {
			return mats;
		}
		const preset =
			st.preset || ( 'gradient' === p.preset ? 'gloss' : p.preset );
		const spec = PRESETS[ preset ] || PRESETS.gold;
		const face = st.color || spec.face;
		const key = preset + '|' + face;
		if ( ! overrideCache.has( key ) ) {
			const pair = makeMaterials(
				{
					...p,
					preset,
					faceColor: face,
					sideColor: st.color ? sideHex( st.color ) : spec.side,
				},
				depthWorld
			);
			overrideCache.set( key, pair );
			group.userData.extraMats.push( pair.face, pair.side );
		}
		return overrideCache.get( key );
	};
	const { runs, scale, maxW } = layoutLines( font, p );
	const complexity = runs.reduce(
		( sum, run ) =>
			sum +
			run.items.reduce(
				( n, it ) => n + Math.max( 1, it.g.path.commands.length / 55 ),
				0
			),
		0
	);
	const quality = designQuality( complexity, opts.fine );
	const material = designMaterialFactory(
		p,
		depthWorld,
		group.userData.extraMats
	);
	const designed =
		p.shape !== 'solid' ||
		p.profile !== 'classic' ||
		p.surface !== 'smooth';
	const depth = Math.max( 1.5, TEXT_SIZE * ( ( p.depth || 25 ) / 100 ) );
	const b = ( p.bevel || 0 ) / 100;
	const extrudeOpts = {
		depth,
		bevelEnabled: b > 0.004,
		bevelSize: 2.8 * b,
		bevelThickness: 2.2 * b,
		bevelSegments: opts.fine ? DETAIL.bevelFine : DETAIL.bevel,
		curveSegments: opts.fine ? DETAIL.curvesFine : DETAIL.curves,
	};
	const step = TEXT_SIZE * 1.1 * ( ( p.lineHeight || 100 ) / 100 );
	const arcRad =
		( Math.max( -160, Math.min( 160, p.arc || 0 ) ) * Math.PI ) / 180;
	const bent = Math.abs( arcRad ) > 0.02;
	const R = bent ? maxW / arcRad : 0;
	runs.forEach( ( run, li ) => {
		const start =
			'left' === p.align
				? -maxW / 2
				: 'right' === p.align
				? maxW / 2 - run.width
				: -run.width / 2;
		const baseY = -li * step;
		for ( const it of run.items ) {
			const shapes = glyphShapes( it.g, scale );
			if ( ! shapes.length ) {
				continue;
			}
			const st = styles[ it.index ] || {};
			const letterDepth = st.depth
				? Math.max( 1.5, TEXT_SIZE * ( st.depth / 100 ) )
				: depth;
			let mesh;
			const pair = matsForIndex( it.index );
			if ( designed ) {
				const glyphParams = st.color
					? {
							...p,
							faceColor: st.color,
							color2: st.color,
							layerColor: st.color,
							coreColor: st.color,
					  }
					: p;
				const sculpt = buildDesign(
					shapes,
					letterDepth,
					st.preset
						? {
								...glyphParams,
								preset: st.preset,
								faceMaterial: st.preset,
								coreMaterial: st.preset,
						  }
						: glyphParams,
					pair,
					material,
					quality
				);
				sculpt.position.x = -it.adv / 2;
				sculpt.scale.set( it.letterScale, it.letterScale, 1 );
				mesh = new THREE.Group();
				mesh.add( sculpt );
			} else {
				// Rounds shaded round, corners kept (smooth.js).
				const geo = smoothSides(
					new THREE.ExtrudeGeometry(
						shapes,
						letterDepth === depth
							? extrudeOpts
							: { ...extrudeOpts, depth: letterDepth }
					)
				);
				// Center the geometry on the glyph's own advance middle so
				// the curve bend can rotate each glyph around its center;
				// per-letter Size scales around that middle, off the
				// baseline (y = 0), so resized letters stay seated.
				geo.translate( -it.adv / 2, 0, -letterDepth / 2 );
				if ( 1 !== it.letterScale ) {
					geo.scale( it.letterScale, it.letterScale, 1 );
				}
				mesh = new THREE.Mesh( geo, [ pair.face, pair.side ] );
			}
			// Click-picking in the dialog: which letter is this mesh?
			mesh.userData.glyphIndex = it.index;
			mesh.userData.glyphChar = String.fromCodePoint(
				it.g.unicode || 63
			);
			mesh.traverse( ( child ) => {
				child.userData.glyphIndex = mesh.userData.glyphIndex;
				child.userData.glyphChar = mesh.userData.glyphChar;
			} );
			const s = start + it.x + it.adv / 2;
			const dy = ( ( st.dy || 0 ) / 100 ) * TEXT_SIZE;
			if ( bent ) {
				const theta = s / R;
				mesh.position.set(
					Math.sin( theta ) * R,
					baseY + dy,
					( Math.cos( theta ) - 1 ) * R
				);
				// Align the glyph's +x with the arc tangent (rotation.y
				// = a maps +x onto (cos a, 0, -sin a)).
				mesh.rotation.y = theta;
			} else {
				mesh.position.set( s, baseY + dy, 0 );
			}
			if ( st.rot ) {
				mesh.rotation.z = ( -st.rot * Math.PI ) / 180;
			}
			group.add( mesh );
		}
	} );
	deformDesign( group, p, quality );
	// Gradient span: 0..block height in grounded world space (abs()'d in
	// the shader, so the mirrored clone matches).
	const box = new THREE.Box3().setFromObject( group );
	if ( ! box.isEmpty() ) {
		for ( const mat of [
			mats.face,
			mats.side,
			...group.userData.extraMats,
		] ) {
			const u = mat.userData.gradUniforms;
			if ( u ) {
				u.y0.value = 0;
				u.y1.value = Math.max( 1, box.max.y - box.min.y );
			}
		}
	}
	return group;
}
