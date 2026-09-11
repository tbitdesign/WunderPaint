import { makeImage, makeShape, makeGroup } from '../../../store/document';
import { scrimLayer } from '../../design-composer';
import { dynamicDefaults, dynamicShapeIds } from '../../shape-dynamics';
import { TREATS } from '../catalog';
import { dmId } from '../ids';
import { roleColor, applyCommon } from './common';
import { wrapSmart } from '../smart';

/** Behandlung -> Smart-Filter-Eintrag (Farbfelder als Rollen erlaubt). */
export function toFilter( treat, palette ) {
	const def = TREATS[ treat.fx ];
	const params = {};
	for ( const key of Object.keys( def.params ) ) {
		const v = treat[ key ] !== undefined ? treat[ key ] : def.params[ key ];
		params[ key ] = def.colors.includes( key )
			? roleColor( v, palette )
			: v;
	}
	return {
		id: def.fx,
		params,
		enabled: true,
		uid: dmId( `${ treat.fx }:${ JSON.stringify( params ) }`, 'fx' ),
	};
}

const SCRIM_DIR = { b: 'up', t: 'down', l: 'right', r: 'left' };

function scrimRegion( scrim, rect ) {
	const h = Math.round( rect.h * scrim.height );
	const w = Math.round( rect.w * scrim.height );
	switch ( scrim.from ) {
		case 't':
			return { x: rect.x, y: rect.y, w: rect.w, h };
		case 'l':
			return { x: rect.x, y: rect.y, w, h: rect.h };
		case 'r':
			return { x: rect.x + rect.w - w, y: rect.y, w, h: rect.h };
		default:
			return { x: rect.x, y: rect.y + rect.h - h, w: rect.w, h };
	}
}

/**
 * Die Scrim-Ebene EINES Fotos, aus `el.scrim` und dem Rechteck des Fotos.
 *
 * Steht hier und nicht im Bauer, weil die Kontrast-Reparatur sie seit
 * Stufe 2h neu baut, statt einen eigenen Balken hinter den Text zu legen:
 * ein Verlauf, der zum Foto gehoert und ueber dessen ganze Breite laeuft,
 * ist eine Entscheidung des Entwurfs - ein Kasten hinter einer einzelnen
 * Zeile ist ein Pflaster. Beide Seiten muessen dieselbe Ebene bauen, also
 * gibt es sie genau einmal.
 *
 * @param {Object} el   Foto-Element (`scrim` gesetzt).
 * @param {Object} rect Rechteck des Fotos.
 * @return {Object} Scrim-Ebene mit Id und `dm`.
 */
export function buildPhotoScrim( el, rect ) {
	const scrim = scrimLayer(
		scrimRegion( el.scrim, rect ),
		SCRIM_DIR[ el.scrim.from ],
		el.scrim.strength
	);
	scrim.id = dmId( el.id, 'scrim' );
	scrim.dm = { el: el.id, part: 'scrim' };
	return scrim;
}

/** Foto: Bildebene, optional Schnittmaske (clipped in Gruppe), Behandlung (Smart-Hülle), Scrim. */
export async function buildPhoto( el, rect, ctx ) {
	const palette = ctx.tokens.palette;
	const asset = el.bind ? null : ctx.assets.get( el.asset );
	// A real bound photo (a post's featured image) - as opposed to the
	// placeholder standing in for it - is only ever a URL at compile time;
	// nothing has decoded its pixels, so `rect` is the LAYOUT box, never
	// the photo's own natural size.
	const boundToRealPhoto = !! ( el.bind && ctx.previewContext?.featuredUrl );
	// A brand binding (brand.logo) is the kit's logo, not the post's
	// featured image; every image binding used to show and measure the
	// featured image.
	const brandBound = !! (
		el.bind && /^brand\./.test( String( el.bind.id ) )
	);
	const source = brandBound
		? ctx.brand?.logoUrl
			? { src: ctx.brand.logoUrl, w: rect.w, h: rect.h }
			: ctx.placeholder( rect )
		: el.bind
		? ctx.previewContext?.featuredUrl
			? { src: ctx.previewContext.featuredUrl, w: rect.w, h: rect.h }
			: ctx.placeholder( rect )
		: asset && asset.src
		? asset
		: ctx.placeholder( rect );
	const image = makeImage( {
		name: el.name && el.id !== el.name ? el.name : 'Photo',
		...rect,
		src: source.src,
		naturalW: source.w || rect.w,
		naturalH: source.h || rect.h,
		imageFit: { mode: el.fit, ax: el.focus[ 0 ], ay: el.focus[ 1 ] },
	} );
	if ( boundToRealPhoto ) {
		// Asserting a natural size equal to the layout box (as opposed to
		// leaving it unknown) told every consumer this photo truly IS that
		// shape - matching the box by construction, never the real photo's
		// aspect. design-assistant.js's own bound photos never do this:
		// they carry either a REAL measured naturalW/H or none at all.
		delete image.naturalW;
		delete image.naturalH;
	}
	image.id = dmId( el.id, 'image' );
	image.dm = { el: el.id, part: 'image' };
	let layers = [ image ];
	const parts = { main: image.id, image: image.id };
	if ( el.maskShape ) {
		const dynamic = dynamicShapeIds().includes( el.maskShape.family );
		const mask = makeShape( {
			name: `${ image.name } mask`,
			...rect,
			shape: el.maskShape.family,
			fill: '#000000',
			...( dynamic
				? {
						shapeParams: {
							...dynamicDefaults( el.maskShape.family ),
							...el.maskShape.params,
						},
				  }
				: {} ),
		} );
		mask.id = dmId( el.id, 'mask' );
		mask.dm = { el: el.id, part: 'mask' };
		const group = makeGroup( { name: image.name, ...rect } );
		group.id = dmId( el.id, 'group' );
		group.dm = { el: el.id, part: 'group' };
		image.clipped = true;
		mask.parent = group.id;
		image.parent = group.id;
		group.children = [ mask.id, image.id ];
		layers = [ group, mask, image ];
		parts.mask = mask.id;
		parts.group = group.id;
		parts.main = group.id;
	}
	if ( el.treat.length ) {
		const filters = el.treat.map( ( t ) => toFilter( t, palette ) );
		const smart = await wrapSmart( {
			layers,
			doc: ctx.doc,
			name: image.name,
			filters,
			render: ctx.render,
		} );
		applyCommon( smart, el, 'main', ctx );
		smart.name = image.name;
		layers = [ smart ];
		parts.main = smart.id;
		parts.smart = smart.id;
	} else {
		applyCommon( layers[ 0 ], el, 'main', ctx );
		layers[ 0 ].name = image.name;
		// applyCommon() just gave layers[0] its final 'main' id, replacing
		// whatever id it had when the maskShape block below already wired
		// the mask/image parent links and `parts` to the OLD value: re-sync
		// both to the id the group (or plain image) now actually carries.
		parts.main = layers[ 0 ].id;
		if ( layers.length > 1 ) {
			layers[ 1 ].parent = layers[ 0 ].id;
			layers[ 2 ].parent = layers[ 0 ].id;
			parts.group = layers[ 0 ].id;
		} else {
			parts.image = layers[ 0 ].id;
		}
	}
	if ( el.scrim ) {
		const scrim = buildPhotoScrim( el, rect );
		layers.push( scrim );
		parts.scrim = scrim.id;
	}
	return { layers, parts };
}
