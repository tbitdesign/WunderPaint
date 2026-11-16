import { __ } from '@wordpress/i18n';
import { socialCropById } from './safe-zones';

export const CROP_FORMATS = [
	[ 'free', () => __( 'Free', 'wunderpaint' ) ],
	[ 'original', () => __( 'Original', 'wunderpaint' ) ],
	...[ '1:1', '4:3', '3:2', '16:9', '4:5', '9:16', '21:9' ].map( ( id ) => [
		id,
		() => id,
	] ),
];

export const MORE_CROP_FORMATS = [
	...[ '3:4', '2:3', '5:4', '5:7', '7:5', '2:1', '1.91:1' ].map( ( id ) => [
		id,
		() => id,
	] ),
	[ 'paper', () => __( 'A4 / A3 (ratio)', 'wunderpaint' ) ],
	[ '17:22', () => __( 'Letter (ratio)', 'wunderpaint' ) ],
];

/** Shared by the cards, numeric inputs and canvas handles. */
export function cropRatioValue( option, doc ) {
	if ( option === 'original' ) {
		return doc?.w > 0 && doc?.h > 0 ? doc.w / doc.h : null;
	}
	if ( option === 'paper' ) {
		return 1 / Math.SQRT2;
	}
	const value = String( option ).startsWith( 'social:' )
		? socialCropById( option.slice( 7 ) )?.ratio
		: option;
	if ( ! /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test( value ) ) {
		return null;
	}
	const [ w, h ] = value.split( ':' ).map( Number );
	const ratio = w / h;
	return w > 0 && h > 0 && Number.isFinite( ratio ) ? ratio : null;
}

export function cropBase( state ) {
	return state.crop?.w >= 1 && state.crop?.h >= 1
		? state.crop
		: { x: 0, y: 0, w: state.doc.w, h: state.doc.h };
}

/** Keep the long edge stable when comparing formats, fitted to the document. */
export function fitCropRatio( rect, ratio, bounds = rect ) {
	if ( ! ratio ) {
		return { ...rect };
	}
	const side = Math.max( rect.w, rect.h );
	const rawW = side * Math.min( 1, ratio );
	const rawH = side / Math.max( 1, ratio );
	const scale = Math.min( 1, bounds.w / rawW, bounds.h / rawH );
	const w = Math.max( 1, Math.round( rawW * scale ) );
	const h = Math.max( 1, Math.round( rawH * scale ) );
	const bx = bounds.x || 0,
		by = bounds.y || 0;
	return {
		x: Math.round(
			Math.max(
				bx,
				Math.min( bx + bounds.w - w, rect.x + ( rect.w - w ) / 2 )
			)
		),
		y: Math.round(
			Math.max(
				by,
				Math.min( by + bounds.h - h, rect.y + ( rect.h - h ) / 2 )
			)
		),
		w,
		h,
	};
}

export function setCropFormat( editor, ratio ) {
	editor.dispatch( {
		type: 'SET_TOOL_OPTS',
		tool: 'crop',
		patch: { ratio },
	} );
	editor.dispatch( {
		type: 'SET_CROP',
		crop: fitCropRatio(
			cropBase( editor.state ),
			cropRatioValue( ratio, editor.state.doc ),
			editor.state.doc
		),
	} );
}

export function setCropDimension( editor, key, value ) {
	if ( ! Number.isFinite( value ) || value < 1 ) {
		return;
	}
	const crop = { ...cropBase( editor.state ), [ key ]: Math.round( value ) };
	const ratio = cropRatioValue(
		editor.state.toolOpts.crop.ratio,
		editor.state.doc
	);
	if ( ratio ) {
		const other = key === 'w' ? 'h' : 'w';
		crop[ other ] = Math.max(
			1,
			Math.round( key === 'w' ? crop.w / ratio : crop.h * ratio )
		);
	}
	editor.dispatch( { type: 'SET_CROP', crop } );
}

export function swapCropOrientation( editor ) {
	const rect = cropBase( editor.state );
	const crop = {
		x: Math.round( rect.x + ( rect.w - rect.h ) / 2 ),
		y: Math.round( rect.y + ( rect.h - rect.w ) / 2 ),
		w: rect.h,
		h: rect.w,
	};
	const old = editor.state.toolOpts.crop.ratio;
	let ratio = 'free';
	if ( old !== 'free' ) {
		const value = cropRatioValue( old, editor.state.doc );
		// Preserve named numeric presets (16:9 <-> 9:16) exactly.
		ratio = /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test( old )
			? old.split( ':' ).reverse().join( ':' )
			: `${ 1 / value }:1`;
	}
	editor.dispatch( {
		type: 'SET_TOOL_OPTS',
		tool: 'crop',
		patch: { ratio },
	} );
	editor.dispatch( { type: 'SET_CROP', crop } );
}

/** Resize from the opposite corner, using the drag-start rect to avoid drift. */
export function resizeCropCorner( rect, corner, point, ratio ) {
	const west = corner.includes( 'w' );
	const north = corner.includes( 'n' );
	const x = west ? rect.x + rect.w : rect.x;
	const y = north ? rect.y + rect.h : rect.y;
	let w = west ? x - point.x : point.x - x;
	let h = north ? y - point.y : point.y - y;
	if ( w < 1 || h < 1 ) {
		return null;
	}
	if ( ratio ) {
		w = Math.max( w, h * ratio );
		h = w / ratio;
	}
	return { x: west ? x - w : x, y: north ? y - h : y, w, h };
}
