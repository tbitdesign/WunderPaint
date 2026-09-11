import {
	buttonComponent,
	badgeComponent,
	scrimLayer,
} from '../../design-composer';
import { dmId } from '../ids';
import { applyCommon } from './common';

const SCRIM_DIR = { b: 'up', t: 'down', l: 'right', r: 'left' };

/** Die drei Ebenen einer Komponente auf deterministische IDs umschreiben. */
function relink( built, el, ctx ) {
	const [ group, shape, text ] = built.layers;
	// The group carries every common field - name/opacity/blend/rot/styles,
	// the latter with palette roles resolved - through the exact same
	// applyCommon() path as group.js and the scrim branch below; no
	// hand-rolled styles handling here. The label/face stay neutral: only
	// id/parent/dm, no common fields.
	applyCommon( group, el, 'main', ctx );
	shape.id = dmId( el.id, 'face' );
	text.id = dmId( el.id, 'label' );
	shape.parent = group.id;
	text.parent = group.id;
	group.children = [ shape.id, text.id ];
	shape.dm = { el: el.id, part: 'face' };
	text.dm = { el: el.id, part: 'label' };
	// buttonComponent()/badgeComponent() build the group with makeGroup({
	// name }) only, so it never gets its own x/y/w/h (see offsetLayers()'s
	// "groups have no own geometry" in design-composer.js); derive a real
	// box from the already-positioned face shape, or the compiler and the
	// verifier would see x/y/w/h = 0.
	group.x = shape.x;
	group.y = shape.y;
	group.w = shape.w;
	group.h = shape.h;
	return {
		layers: [ group, shape, text ],
		parts: { main: group.id, face: shape.id, label: text.id },
	};
}

/** Scrim-Region: t/b = volle Breite (Höhenanteil), l/r = volle Höhe (Breitenanteil). */
function scrimRegion( props, rect ) {
	const h = Math.round( rect.h * props.height );
	const w = Math.round( rect.w * props.height );
	switch ( props.from ) {
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

export function buildComponent( el, rect, ctx ) {
	const { palette, docMin, type } = ctx.tokens;
	const body = type.pairing.support[ 0 ];
	// Components read a canvas-scaled reference, not just the shorter edge:
	// on a short/wide canvas (e.g. a 1200x630 share card) `docMin` alone
	// under-sizes labels well below the min-size floor (which itself scales
	// with `doc.w`). `sizeRef` never sizes DOWN from `docMin` — it only
	// grows the reference on canvases wider than they are tall.
	const sizeRef = Math.max( docMin, Math.round( 0.7 * ctx.doc.w ) );
	if ( 'button' === el.type ) {
		const built = buttonComponent( el.props.label, palette, sizeRef, {
			x: rect.x,
			y: rect.y,
			maxW:
				'fill' === el.props.maxW
					? rect.w
					: Math.round( el.props.maxW * ctx.doc.w ),
			pill: !! el.props.pill,
			arrow: !! el.props.arrow,
			body,
		} );
		return relink( built, el, ctx );
	}
	if ( 'chip' === el.type ) {
		const built = badgeComponent( el.props.label, palette, sizeRef, {
			tilt: el.props.tilt || 0,
			body,
		} );
		// badgeComponent() ignores x/y and always builds at the origin -
		// every real caller in design-composer.js repositions its layers
		// afterwards (offsetLayers()); do the same before relinking.
		for ( const layer of built.layers ) {
			if ( 'group' !== layer.type ) {
				layer.x = Math.round( layer.x + rect.x );
				layer.y = Math.round( layer.y + rect.y );
			}
		}
		return relink( built, el, ctx );
	}
	// scrim
	const layer = scrimLayer(
		scrimRegion( el.props, rect ),
		SCRIM_DIR[ el.props.from ] || 'up',
		el.props.strength
	);
	applyCommon( layer, el, 'main', ctx );
	return { layers: [ layer ], parts: { main: layer.id } };
}
