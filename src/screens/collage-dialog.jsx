/**
 * Collage & Photo Grid (v1.375.0, more layouts and looks in v1.433.0):
 * pick images from the media library or take the photos of the document,
 * choose a layout (grid, mosaic, bento, hero, strips, circles, polaroid,
 * filmstrip, contact sheet, before / after), tune gaps, corners, frames,
 * shadow and background on a live preview, then insert the whole collage
 * as an editable layer group - every photo stays a normal image layer
 * afterwards.
 */

import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __, _x, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { SwatchButton } from '../components/color-popover';
import { HelpLink } from './help-dialog';
import { wpMediaPick } from '../lib/media-pick';
import { detectFaces } from '../lib/face-detect';
import { localRuntimeAvailable } from '../lib/ml';
import {
	COLLAGE_GENERATOR_ID,
	collageLayerSpecs,
	panFocus,
	placeCollage,
	LAYOUTS,
	LAYOUTS_WITH_CAPTIONS,
	LAYOUTS_WITH_COLUMNS,
	LAYOUT_PHOTO_LIMIT,
} from '../lib/collage';
import {
	loadImage,
	makeGroup,
	makeImage,
	makeShape,
	makeText,
} from '../store/document';
import { paintCollage, shadowStyle } from '../lib/collage-paint';
import '../styles/editor/collage.css';

const clamp = ( v, lo, hi ) => Math.min( hi, Math.max( lo, v ) );

/** Placeholder photos for the layout cards before anything is picked. */
let placeholders = null;
const placeholderPicks = () => {
	if ( ! placeholders ) {
		const tones = [
			[ '#c7d2fe', '#818cf8' ],
			[ '#fde68a', '#f59e0b' ],
			[ '#bbf7d0', '#22c55e' ],
			[ '#fecaca', '#ef4444' ],
			[ '#bae6fd', '#0ea5e9' ],
			[ '#e9d5ff', '#a855f7' ],
		];
		const sizes = [
			[ 300, 200 ],
			[ 200, 300 ],
			[ 240, 240 ],
			[ 300, 200 ],
			[ 220, 280 ],
			[ 280, 210 ],
		];
		placeholders = tones.map( ( [ a, b ], i ) => {
			const c = document.createElement( 'canvas' );
			[ c.width, c.height ] = sizes[ i ];
			const g = c.getContext( '2d' );
			g.fillStyle = a;
			g.fillRect( 0, 0, c.width, c.height );
			g.fillStyle = b;
			g.beginPath();
			g.arc(
				c.width / 2,
				c.height * 0.62,
				c.height * 0.24,
				0,
				Math.PI * 2
			);
			g.fill();
			return {
				id: 'placeholder-' + i,
				src: 'placeholder-' + i,
				canvas: c,
				width: c.width,
				height: c.height,
			};
		} );
	}
	return placeholders;
};

/** One line about each layout, inside its card (20.10.2026). */
const layoutBlurb = ( id ) =>
	( {
		grid: __( 'Equal cells in rows and columns.', 'wunderpaint' ),
		mosaic: __(
			'Justified rows, every photo near its own shape.',
			'wunderpaint'
		),
		bento: __(
			'Tiles of different sizes that fill the area.',
			'wunderpaint'
		),
		hero: __(
			'One big photo, the others beside or below it.',
			'wunderpaint'
		),
		strips: __(
			'Tall strips side by side, or wide ones stacked.',
			'wunderpaint'
		),
		circles: __( 'Round photos packed like a honeycomb.', 'wunderpaint' ),
		polaroid: __(
			'Scattered instant photos with captions.',
			'wunderpaint'
		),
		filmstrip: __( 'One row on a strip of film.', 'wunderpaint' ),
		contact: __( 'A contact sheet with file names.', 'wunderpaint' ),
		beforeafter: __(
			'Two photos side by side with a divider.',
			'wunderpaint'
		),
		masonry: __(
			'Columns of photos in their own proportions.',
			'wunderpaint'
		),
		diagonal: __(
			'Up to four photos cut apart on a slant.',
			'wunderpaint'
		),
		hexagon: __( 'Six-sided photos that interlock.', 'wunderpaint' ),
		split: __( 'One photo across several panels.', 'wunderpaint' ),
		inset: __( 'A photo behind, framed prints on top.', 'wunderpaint' ),
	} )[ id ] || '';

/**
 * One spec -> one editable layer (kinds map to the layer factories). The
 * names are in the editor's language (19.10.2026; they were English in
 * every language), and a photo remembers which pick it shows, so Edit
 * Collage can take a picture that only lives in this document from it.
 */
function specToLayer( spec, layout, unit ) {
	const isPolaroid = 'polaroid' === layout;
	const styles = spec.shadow
		? { styles: { dropShadow: shadowStyle( spec.shadow, unit ) } }
		: {};
	if ( 'photo' === spec.kind ) {
		return {
			...makeImage( {
				name: sprintf(
					/* translators: %d: number of the photo in the collage. */
					__( 'Photo %d', 'wunderpaint' ),
					spec.index + 1
				),
				src: spec.src,
				naturalW: spec.natW,
				naturalH: spec.natH,
				x: spec.x,
				y: spec.y,
				w: spec.w,
				h: spec.h,
				// The crop a drag in the preview chose, or the one that keeps
				// the faces in frame (20.10.2026).
				imageFit: {
					mode: 'cover',
					ax: spec.focus ? spec.focus.x : 0.5,
					ay: spec.focus ? spec.focus.y : 0.5,
				},
			} ),
			radius: spec.radius || 0,
			rot: spec.rot || 0,
			collageIndex: spec.index,
			// A shaped photo is clipped to the mask right below it.
			...( spec.clipped ? { clipped: true } : {} ),
			// What the collage wrote, so Edit can tell a crop changed on the
			// layer since from its own.
			collageFit: {
				ax: spec.focus ? spec.focus.x : 0.5,
				ay: spec.focus ? spec.focus.y : 0.5,
			},
			...styles,
		};
	}
	if ( 'caption' === spec.kind || 'badgeText' === spec.kind ) {
		const badge = 'badgeText' === spec.kind;
		return {
			...makeText( {
				name: badge ? spec.text : __( 'Caption', 'wunderpaint' ),
				text: spec.text || ' ',
				x: spec.x,
				y: spec.y,
				w: spec.w,
				h: spec.h,
				fontSize: badge
					? Math.round( spec.h * 0.46 )
					: Math.round( clamp( spec.h * 0.45, 10, 30 ) ),
				fontFamily: isPolaroid && ! badge ? 'Lora' : 'Inter',
				italic: isPolaroid && ! badge,
				weight: badge ? 600 : 500,
				color: badge ? '#ffffff' : '#4a4e55',
				align: 'center',
				valign: 'middle',
				fixedWidth: true,
			} ),
			rot: spec.rot || 0,
		};
	}
	// card / strip / holes / background / divider / knob / badge are shapes.
	const names = {
		card: __( 'Card', 'wunderpaint' ),
		strip: __( 'Film strip', 'wunderpaint' ),
		holes: __( 'Perforation', 'wunderpaint' ),
		backdrop: __( 'Background', 'wunderpaint' ),
		divider: __( 'Divider', 'wunderpaint' ),
		knob: __( 'Knob', 'wunderpaint' ),
		badge: __( 'Badge', 'wunderpaint' ),
		mask: __( 'Photo shape', 'wunderpaint' ),
	};
	return {
		...makeShape( {
			name: names[ spec.kind ] || __( 'Shape', 'wunderpaint' ),
			shape: 'rect',
			x: spec.x,
			y: spec.y,
			w: spec.w,
			h: spec.h,
			fill: spec.fill,
			radius: spec.radius || 0,
			...( spec.pathD ? { pathD: spec.pathD } : {} ),
		} ),
		rot: spec.rot || 0,
		...styles,
	};
}

/**
 * A pick as the recipe keeps it: pictures that only live in this document
 * (data URLs) are not copied into it again - the photo layers carry them.
 */
const recipePick = ( p ) => ( {
	id: p.id,
	src: /^data:/.test( p.src || '' ) ? null : p.src,
	preview: /^data:/.test( p.preview || '' ) ? null : p.preview,
	name: p.name || '',
	width: p.width,
	height: p.height,
	...( p.focus ? { focus: p.focus } : {} ),
	// The faces found in it, so Edit does not look again.
	...( Array.isArray( p.faces ) ? { faces: p.faces } : {} ),
} );

/** One pick, whichever way it came in. */
const pickKey = ( p ) => ( p.id ? 'id:' + p.id : 'src:' + p.src );

export function CollageDialog( { onClose, extras, layerId = null } ) {
	const editor = useEditor();
	const { state, dispatch, commit } = editor;
	const { doc } = state;
	// Edit Collage (19.10.2026): the group keeps its recipe.
	const editGroup = layerId
		? state.layers.find(
				( l ) =>
					l.id === layerId && l.generator?.id === COLLAGE_GENERATOR_ID
		  ) || null
		: null;
	const recipe = editGroup?.generator?.params || {};
	const [ picks, setPicks ] = useState( () =>
		( recipe.picks || [] )
			.map( ( p, i ) => {
				const photo = state.layers.find(
					( l ) =>
						l.parent === editGroup.id &&
						'image' === l.type &&
						i === l.collageIndex
				);
				// A crop changed on the photo layer itself since wins over
				// the one in the recipe.
				const fit = photo?.imageFit;
				const wrote = photo?.collageFit;
				const changed =
					fit &&
					'cover' === fit.mode &&
					( ! wrote ||
						Math.abs( ( fit.ax ?? 0.5 ) - wrote.ax ) > 1e-3 ||
						Math.abs( ( fit.ay ?? 0.5 ) - wrote.ay ) > 1e-3 );
				const focus = changed
					? { x: fit.ax ?? 0.5, y: fit.ay ?? 0.5 }
					: p.focus;
				const own = focus ? { ...p, focus } : p;
				if ( p.src ) {
					return { ...own, preview: p.preview || p.src };
				}
				return photo?.src
					? { ...own, src: photo.src, preview: photo.src }
					: null;
			} )
			.filter( Boolean )
	);
	const [ layout, setLayout ] = useState( recipe.layout || 'grid' );
	const [ gap, setGap ] = useState( recipe.gap ?? 16 );
	const [ radius, setRadius ] = useState( recipe.radius ?? 0 );
	const [ frame, setFrame ] = useState( recipe.frame ?? 0 );
	const [ cols, setCols ] = useState( recipe.cols ?? 0 );
	const [ seed, setSeed ] = useState( recipe.seed ?? 1 );
	const [ captions, setCaptions ] = useState( recipe.captions ?? true );
	const [ frameColor, setFrameColor ] = useState(
		recipe.frameColor || '#ffffff'
	);
	const [ shadow, setShadow ] = useState( recipe.shadow ?? 0 );
	// Keep faces in frame (20.10.2026): the bundled face finder looks at
	// every photo once; without the local runtime the option is not shown.
	const [ faceFocus, setFaceFocus ] = useState( recipe.faces ?? true );
	const canFindFaces = localRuntimeAvailable();
	const [ backdropOn, setBackdropOn ] = useState( !! recipe.backdrop );
	const [ backdrop, setBackdrop ] = useState(
		recipe.backdrop || recipe.backdropColor || '#f4efe6'
	);
	// Click two photos in the preview to swap them (19.10.2026): which
	// picture is the hero, which one is "before".
	const [ swapFrom, setSwapFrom ] = useState( null );
	const [ loadTick, setLoadTick ] = useState( 0 );
	const canvasRef = useRef( null );
	const imgCache = useRef( new Map() );
	useEscape( onClose );

	const unit = Math.max( doc.w, doc.h );
	// The visible image layers of the document, as ready-made picks.
	const docImages = useMemo(
		() =>
			state.layers
				.filter(
					( l ) => 'image' === l.type && l.src && false !== l.visible
				)
				.map( ( l ) => ( {
					id: l.id,
					src: l.src,
					preview: l.src,
					name: l.name || '',
					width: l.naturalW || l.w,
					height: l.naturalH || l.h,
				} ) ),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[]
	);

	const specs = useMemo(
		() =>
			collageLayerSpecs( picks, {
				width: doc.w,
				height: doc.h,
				layout,
				gap,
				cols,
				seed,
				frame,
				radius,
				captions,
				frameColor,
				shadow,
				backdrop: backdropOn ? backdrop : '',
				faces: faceFocus,
			} ),
		[
			picks,
			doc.w,
			doc.h,
			layout,
			gap,
			cols,
			seed,
			frame,
			radius,
			captions,
			frameColor,
			shadow,
			backdropOn,
			backdrop,
			faceFocus,
		]
	);

	// Look for faces in every photo that has not been looked at, one at a
	// time; each answer lands on its pick, wherever it has moved to.
	const alive = useRef( true );
	useEffect(
		() => () => {
			alive.current = false;
		},
		[]
	);
	const faceJobs = useRef( new Set() );
	useEffect( () => {
		if ( ! faceFocus || ! canFindFaces ) {
			return;
		}
		const todo = picks.filter(
			( p ) =>
				undefined === p.faces &&
				( p.src || p.preview ) &&
				! faceJobs.current.has( pickKey( p ) )
		);
		if ( ! todo.length ) {
			return;
		}
		todo.forEach( ( p ) => faceJobs.current.add( pickKey( p ) ) );
		( async () => {
			for ( const p of todo ) {
				let faces = [];
				try {
					faces = await detectFaces(
						await loadImage( p.src || p.preview )
					);
				} catch ( e ) {
					faces = [];
				}
				if ( ! alive.current ) {
					return;
				}
				const key = pickKey( p );
				faceJobs.current.delete( key );
				setPicks( ( list ) =>
					list.map( ( q ) =>
						pickKey( q ) === key && undefined === q.faces
							? { ...q, faces }
							: q
					)
				);
			}
		} )();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ picks, faceFocus ] );
	const findingFaces =
		faceFocus &&
		canFindFaces &&
		picks.some( ( p ) => undefined === p.faces );

	// Warm the preview thumbnails once per pick.
	useEffect( () => {
		picks.forEach( ( p ) => {
			const src = p.preview || p.src;
			if ( imgCache.current.has( src ) ) {
				return;
			}
			const img = new window.Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => setLoadTick( ( t ) => t + 1 );
			img.src = src;
			imgCache.current.set( src, img );
		} );
	}, [ picks ] );

	// The picture behind a photo spec: its pick's loaded preview, or a
	// placeholder canvas on the layout cards.
	const imageFor = ( list ) => ( spec ) => {
		const p = list[ spec.index ] || {};
		if ( p.canvas ) {
			return p.canvas;
		}
		const img = imgCache.current.get( p.preview || spec.src );
		return img && img.complete && img.naturalWidth ? img : null;
	};

	// Live preview in the middle column: the document fitted into the stage,
	// drawn at the screen's pixel density.
	useEffect( () => {
		const canvas = canvasRef.current;
		if ( ! canvas ) {
			return;
		}
		const fit = Math.min( 620 / doc.w, 560 / doc.h );
		const dpr = Math.min( 2, window.devicePixelRatio || 1 );
		paintCollage( canvas, specs, {
			w: doc.w,
			h: doc.h,
			scale: fit * dpr,
			imageFor: imageFor( picks ),
			backdrop: backdropOn ? backdrop : '',
			layout,
			unit,
			selected: swapFrom,
		} );
		canvas.style.width = Math.round( doc.w * fit ) + 'px';
		canvas.style.height = Math.round( doc.h * fit ) + 'px';
	}, [
		specs,
		picks,
		doc.w,
		doc.h,
		layout,
		loadTick,
		backdropOn,
		backdrop,
		unit,
		swapFrom,
	] );

	// The layout cards: every layout drawn small with the picked photos (or
	// placeholders), a few per tick so the dialog never stalls.
	const [ thumbs, setThumbs ] = useState( {} );
	const thumbKey = JSON.stringify( [
		picks.map( pickKey ),
		loadTick,
		frameColor,
		doc.w,
		doc.h,
	] );
	useEffect( () => {
		const list = picks.length ? picks : placeholderPicks();
		const fit = Math.min( 128 / doc.w, 88 / doc.h );
		let i = 0;
		let timer = 0;
		const step = () => {
			const batch = {};
			for (
				const end = Math.min( LAYOUTS.length, i + 5 );
				i < end;
				i++
			) {
				const id = LAYOUTS[ i ].id;
				try {
					const c = document.createElement( 'canvas' );
					paintCollage(
						c,
						collageLayerSpecs( list, {
							width: doc.w,
							height: doc.h,
							layout: id,
							gap: Math.max( 6, unit * 0.012 ),
							cols: 0,
							seed: 1,
							frame: 0,
							radius: 0,
							captions: true,
							frameColor,
							shadow: 0,
							backdrop: '',
							faces: faceFocus,
						} ),
						{
							w: doc.w,
							h: doc.h,
							scale: fit,
							imageFor: imageFor( list ),
							layout: id,
							unit,
						}
					);
					batch[ id ] = c.toDataURL( 'image/jpeg', 0.85 );
				} catch ( e ) {
					// A card that cannot draw keeps its empty frame.
				}
			}
			setThumbs( ( prev ) => ( { ...prev, ...batch } ) );
			if ( i < LAYOUTS.length ) {
				timer = setTimeout( step, 0 );
			}
		};
		timer = setTimeout( step, 120 );
		return () => clearTimeout( timer );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ thumbKey ] );

	/** A vector in document pixels, turned into a photo's own frame. */
	const intoPhoto = ( spec, dx, dy ) => {
		const a = ( -( spec.rot || 0 ) * Math.PI ) / 180;
		return [
			dx * Math.cos( a ) - dy * Math.sin( a ),
			dx * Math.sin( a ) + dy * Math.cos( a ),
		];
	};

	/** The topmost photo under the pointer, or undefined. */
	const photoAt = ( e ) => {
		const canvas = canvasRef.current;
		if ( ! canvas ) {
			return undefined;
		}
		const rect = canvas.getBoundingClientRect();
		const x = ( ( e.clientX - rect.left ) / rect.width ) * doc.w;
		const y = ( ( e.clientY - rect.top ) / rect.height ) * doc.h;
		return [ ...specs ].reverse().find( ( spec ) => {
			if ( 'photo' !== spec.kind ) {
				return false;
			}
			const [ lx, ly ] = intoPhoto(
				spec,
				x - ( spec.x + spec.w / 2 ),
				y - ( spec.y + spec.h / 2 )
			);
			return Math.abs( lx ) <= spec.w / 2 && Math.abs( ly ) <= spec.h / 2;
		} );
	};

	const swapAt = ( e ) => {
		const hit = photoAt( e );
		if ( ! hit ) {
			setSwapFrom( null );
			return;
		}
		if ( null === swapFrom || swapFrom === hit.index || picks.length < 2 ) {
			setSwapFrom( swapFrom === hit.index ? null : hit.index );
			return;
		}
		setPicks( ( list ) => {
			const next = list.slice();
			[ next[ swapFrom ], next[ hit.index ] ] = [
				next[ hit.index ],
				next[ swapFrom ],
			];
			return next;
		} );
		setSwapFrom( null );
	};

	// Drag inside a photo to choose what its frame shows (20.10.2026); a
	// click without moving still selects and swaps.
	const drag = useRef( null );
	const onPointerDown = ( e ) => {
		const hit = photoAt( e );
		drag.current = {
			spec: hit || null,
			x0: e.clientX,
			y0: e.clientY,
			// A drag starts where the crop is, faces or not.
			focus: hit ? hit.focus || null : null,
			moved: false,
		};
		if ( hit ) {
			e.currentTarget.setPointerCapture?.( e.pointerId );
		}
	};
	const onPointerMove = ( e ) => {
		const d = drag.current;
		if ( ! d?.spec ) {
			return;
		}
		if (
			! d.moved &&
			Math.hypot( e.clientX - d.x0, e.clientY - d.y0 ) < 4
		) {
			return;
		}
		d.moved = true;
		const rect = canvasRef.current.getBoundingClientRect();
		const k = doc.w / rect.width;
		const [ lx, ly ] = intoPhoto(
			d.spec,
			( e.clientX - d.x0 ) * k,
			( e.clientY - d.y0 ) * k
		);
		const focus = panFocus( d.focus, d.spec, lx, ly );
		setPicks( ( list ) =>
			list.map( ( p, i ) => ( i === d.spec.index ? { ...p, focus } : p ) )
		);
	};
	const onPointerUp = ( e ) => {
		const d = drag.current;
		drag.current = null;
		if ( d && ! d.moved ) {
			swapAt( e );
		}
	};

	const removeSelected = () => {
		if ( null === swapFrom ) {
			return;
		}
		setPicks( ( list ) => list.filter( ( _, i ) => i !== swapFrom ) );
		setSwapFrom( null );
	};

	const pick = async ( add = false ) => {
		// The shared entry point routes to the Media Library Manager in
		// pick mode (or the classic modal, per the picker setting) - never
		// call the classic picker directly, the manager IS the picker.
		const picker = window.WPIE?.pickMedia || wpMediaPick;
		const items = await picker( {
			multiple: true,
			types: 'image',
			title: __( 'Pick collage images', 'wunderpaint' ),
			button: __( 'Use images', 'wunderpaint' ),
		} );
		if ( items && items.length ) {
			setSwapFrom( null );
			const chosen = items
				// Manager rows carry mime, classic items carry type.
				.filter( ( it ) =>
					it.type
						? 'image' === it.type
						: 0 ===
						  String( it.mime || 'image/' ).indexOf( 'image/' )
				)
				.map( ( it ) => ( {
					id: it.id,
					src: it.url,
					preview:
						it.thumb ||
						( it.sizes &&
							it.sizes.medium &&
							it.sizes.medium.url ) ||
						it.url,
					name: it.filename || it.title || '',
					width: it.width,
					height: it.height,
				} ) );
			// Add (20.10.2026) keeps the photos and their crops and only
			// appends what is not in the collage yet.
			setPicks( ( list ) =>
				add
					? [
							...list,
							...chosen.filter(
								( c ) =>
									! list.some(
										( p ) =>
											( c.id && p.id === c.id ) ||
											p.src === c.src
									)
							),
					  ]
					: chosen
			);
		}
	};

	const insert = () => {
		if ( ! specs.length ) {
			return;
		}
		const parts = specs.map( ( s ) => specToLayer( s, layout, unit ) );
		const group = makeGroup( { name: __( 'Collage', 'wunderpaint' ) } );
		group.generator = {
			id: COLLAGE_GENERATOR_ID,
			params: {
				picks: picks.map( recipePick ),
				layout,
				gap,
				radius,
				frame,
				cols,
				seed,
				captions,
				frameColor,
				shadow,
				backdrop: backdropOn ? backdrop : '',
				backdropColor: backdrop,
				faces: faceFocus,
			},
		};
		if ( editGroup ) {
			// Replace in place: the same group (id, name, parent, place in
			// the stack) with new contents.
			group.id = editGroup.id;
			group.name = editGroup.name || group.name;
			group.parent = editGroup.parent || null;
			group.visible = editGroup.visible;
			group.locked = editGroup.locked;
		}
		for ( const part of parts ) {
			part.parent = group.id;
		}
		group.children = parts.map( ( p ) => p.id );
		const layers = placeCollage(
			state.layers,
			parts,
			group,
			editGroup?.id
		);
		dispatch( { type: 'SET_LAYERS', layers } );
		dispatch( { type: 'SET_ACTIVE', id: group.id } );
		commit(
			editGroup
				? __( 'Edit collage', 'wunderpaint' )
				: __( 'Insert collage', 'wunderpaint' )
		);
		extras?.toasts?.success?.(
			editGroup
				? __( 'Collage updated.', 'wunderpaint' )
				: __( 'Collage inserted as an editable group.', 'wunderpaint' )
		);
		onClose();
	};

	const hasCaptions = LAYOUTS_WITH_CAPTIONS.includes( layout );
	const beforeAfter = 'beforeafter' === layout;
	const split = 'split' === layout;
	// Where corners, frames and the card color mean something.
	const shaped = [ 'circles', 'hexagon', 'diagonal', 'split' ].includes(
		layout
	);
	const hasRadius = ! shaped && 'polaroid' !== layout;
	const hasFrame = ! [ 'polaroid', 'diagonal', 'split' ].includes( layout );
	const hasCards =
		'polaroid' === layout ||
		'inset' === layout ||
		( hasFrame && frame > 0 );
	const limit = LAYOUT_PHOTO_LIMIT[ layout ];
	const limitNote = {
		beforeafter: __(
			'Before / After uses the first two photos.',
			'wunderpaint'
		),
		diagonal: __( 'Diagonal uses the first four photos.', 'wunderpaint' ),
		split: __(
			'Split spreads the first photo over its panels; Shuffle picks another.',
			'wunderpaint'
		),
		inset: __(
			'Inset puts the first photo behind and up to four on top.',
			'wunderpaint'
		),
	}[ layout ];
	const slider = ( label, value, set, min, max ) => (
		<div className="dsm-sliderrow">
			<div className="dsm-sliderrow-head">
				<span data-number-label>{ label }</span>
				<span className="dsm-sliderrow-val" data-number-value>
					{ value }
				</span>
			</div>
			<input
				type="range"
				className="dsm-range"
				min={ min }
				max={ max }
				value={ value }
				aria-label={ label }
				onChange={ ( e ) => set( Math.round( +e.target.value ) ) }
			/>
		</div>
	);
	const check = ( label, checked, set, extra = null ) => (
		<label className="dsm-checkrow">
			<input
				type="checkbox"
				checked={ checked }
				onChange={ ( e ) => set( e.target.checked ) }
			/>
			{ label }
			{ extra }
		</label>
	);

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="dsm clg"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-modal="true"
				aria-label={ __( 'Collage & Photo Grid', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Collage & Photo Grid', 'wunderpaint' ) }
							</span>
							<HelpLink article="collage" extras={ extras } />
						</div>
						<div className="dsm-sub">
							{ __(
								'Your photos, arranged - inserted as an editable group.',
								'wunderpaint'
							) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ onClose }
						aria-label={ __( 'Close', 'wunderpaint' ) }
					>
						{ I.close( { size: 17 } ) }
					</button>
				</div>

				<div className="clg-body">
					{ /* ------------------- layouts, as cards ------------------- */ }
					<div className="clg-left">
						<section className="dsm-card">
							<div className="dsm-card-head">
								{ I.grid( { size: 14 } ) }
								<span>{ __( 'Layout', 'wunderpaint' ) }</span>
							</div>
							<div className="dsm-picklist">
								{ LAYOUTS.map( ( l ) => (
									<button
										key={ l.id }
										type="button"
										className="dsm-pickrow clg-type"
										aria-pressed={ layout === l.id }
										onClick={ () => {
											setSwapFrom( null );
											setLayout( l.id );
										} }
									>
										<span className="dsm-pickrow-icon">
											{ thumbs[ l.id ] && (
												<img
													src={ thumbs[ l.id ] }
													alt=""
												/>
											) }
										</span>
										<span className="dsm-pickrow-text">
											<b>{ l.label }</b>
											<small>
												{ layoutBlurb( l.id ) }
											</small>
										</span>
									</button>
								) ) }
							</div>
						</section>
					</div>

					{ /* ------------------------- preview ------------------------- */ }
					<div className="clg-main">
						{ picks.length ? (
							<>
								<div className="clg-stage">
									<canvas
										ref={ canvasRef }
										onPointerDown={ onPointerDown }
										onPointerMove={ onPointerMove }
										onPointerUp={ onPointerUp }
										onPointerCancel={ () => {
											drag.current = null;
										} }
									/>
								</div>
								<p className="clg-note">
									{ picks.length > 1
										? __(
												'Click two photos to swap them. Drag inside a photo to choose what it shows.',
												'wunderpaint'
										  )
										: __(
												'Drag inside the photo to choose what it shows.',
												'wunderpaint'
										  ) }
								</p>
							</>
						) : (
							<div className="clg-empty">
								<div>
									{ __(
										'Pick a handful of photos from your library - the collage builds itself, and every layout stays fully editable after inserting.',
										'wunderpaint'
									) }
								</div>
								<div className="clg-empty-actions">
									<button
										className="ai-btn primary"
										onClick={ () => pick() }
									>
										{ __(
											'Choose images…',
											'wunderpaint'
										) }
									</button>
									{ docImages.length > 0 && (
										<button
											className="ai-btn secondary"
											onClick={ () =>
												setPicks( docImages )
											}
										>
											{ __(
												'Use the photos in this document',
												'wunderpaint'
											) }
										</button>
									) }
								</div>
							</div>
						) }
					</div>

					{ /* ------------------ photos, arrangement, look ------------------ */ }
					<div className="clg-right">
						<section className="dsm-card">
							<div className="dsm-card-head">
								{ I.image( { size: 14 } ) }
								<span>{ __( 'Photos', 'wunderpaint' ) }</span>
							</div>
							<div className="dsm-card-body">
								<div className="clg-buttons">
									<button
										className="ai-btn secondary"
										onClick={ () =>
											pick( picks.length > 0 )
										}
									>
										{ picks.length
											? __( 'Add images…', 'wunderpaint' )
											: __(
													'Choose images…',
													'wunderpaint'
											  ) }
									</button>
									{ picks.length > 0 && (
										<button
											className="ai-btn secondary"
											onClick={ () => pick() }
										>
											{ sprintf(
												/* translators: %d: number of picked images. */
												__(
													'Change images… (%d picked)',
													'wunderpaint'
												),
												picks.length
											) }
										</button>
									) }
									{ null !== swapFrom && (
										<button
											className="ai-btn secondary"
											onClick={ removeSelected }
										>
											{ __(
												'Remove selected photo',
												'wunderpaint'
											) }
										</button>
									) }
								</div>
								{ limit && picks.length > limit && (
									<p className="clg-note clg-note-left">
										{ limitNote }
									</p>
								) }
								{ canFindFaces &&
									check(
										__(
											'Keep faces in frame',
											'wunderpaint'
										),
										faceFocus,
										setFaceFocus,
										findingFaces ? (
											<span className="clg-busy">
												{ __(
													'Finding faces…',
													'wunderpaint'
												) }
											</span>
										) : null
									) }
							</div>
						</section>

						<section className="dsm-card">
							<div className="dsm-card-head">
								{ I.layers( { size: 14 } ) }
								<span>
									{ __( 'Arrangement', 'wunderpaint' ) }
								</span>
								<button
									type="button"
									className="dsm-mini dsm-head-end"
									disabled={
										beforeAfter ||
										( picks.length < 2 && ! split )
									}
									onClick={ () => setSeed( ( v ) => v + 1 ) }
									title={ __(
										'Re-roll the arrangement',
										'wunderpaint'
									) }
								>
									{ __( 'Shuffle', 'wunderpaint' ) }
								</button>
							</div>
							<div className="dsm-card-body">
								{ slider(
									beforeAfter
										? __( 'Divider', 'wunderpaint' )
										: __( 'Spacing', 'wunderpaint' ),
									gap,
									setGap,
									0,
									60
								) }
								{ split &&
									slider(
										_x(
											'Panels',
											'split collage',
											'wunderpaint'
										),
										cols > 1 ? Math.min( cols, 6 ) : 3,
										setCols,
										2,
										6
									) }
								{ ! split &&
									LAYOUTS_WITH_COLUMNS.includes( layout ) &&
									slider(
										__(
											'Columns (0 = auto)',
											'wunderpaint'
										),
										cols,
										setCols,
										0,
										8
									) }
								{ hasRadius &&
									slider(
										__( 'Corner radius', 'wunderpaint' ),
										radius,
										setRadius,
										0,
										40
									) }
								{ hasFrame &&
									slider(
										__( 'Frame', 'wunderpaint' ),
										frame,
										setFrame,
										0,
										30
									) }
							</div>
						</section>

						<section className="dsm-card">
							<div className="dsm-card-head">
								{ I.palette( { size: 14 } ) }
								<span>{ __( 'Look', 'wunderpaint' ) }</span>
							</div>
							<div className="dsm-card-body">
								{ slider(
									__( 'Shadow', 'wunderpaint' ),
									shadow,
									setShadow,
									0,
									100
								) }
								{ hasCards && (
									<div className="dsm-checkrow">
										<SwatchButton
											color={ frameColor }
											size={ 26 }
											title={ __(
												'Frame color',
												'wunderpaint'
											) }
											onChange={ ( v ) =>
												setFrameColor( v.slice( 0, 7 ) )
											}
										/>
										{ __( 'Frame color', 'wunderpaint' ) }
									</div>
								) }
								{ hasCaptions &&
									check(
										beforeAfter
											? __(
													'Before / After labels',
													'wunderpaint'
											  )
											: __(
													'Captions from file names',
													'wunderpaint'
											  ),
										captions,
										setCaptions
									) }
								{ check(
									__( 'Background', 'wunderpaint' ),
									backdropOn,
									setBackdropOn,
									backdropOn ? (
										<SwatchButton
											color={ backdrop }
											size={ 26 }
											title={ __(
												'Background color',
												'wunderpaint'
											) }
											onChange={ ( v ) =>
												setBackdrop( v.slice( 0, 7 ) )
											}
										/>
									) : null
								) }
							</div>
						</section>
					</div>
				</div>

				<div className="dsm-foot">
					<div className="dsm-hint">
						{ I.layers ? I.layers( { size: 14 } ) : null }
						{ editGroup
							? __(
									'Replaces the collage in place; every photo stays a normal image layer.',
									'wunderpaint'
							  )
							: __(
									'Lands as an editable group; every photo stays a normal image layer.',
									'wunderpaint'
							  ) }
					</div>
					<div style={ { display: 'flex', gap: 8 } }>
						<button
							className="ai-btn secondary"
							onClick={ onClose }
						>
							{ __( 'Cancel', 'wunderpaint' ) }
						</button>
						<button
							className="ai-btn primary"
							disabled={ ! specs.length }
							onClick={ insert }
						>
							{ editGroup
								? __( 'Update collage', 'wunderpaint' )
								: __( 'Insert collage', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
