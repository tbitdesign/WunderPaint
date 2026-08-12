/**
 * Particle Strokes - the stamp maker.
 *
 * A workbench for ONE mark. Three columns: what you can add and what is
 * already there on the left, the square in the middle, the selected
 * element's own settings on the right.
 *
 * THE SHIFT FROM THE OLD MAKER: nothing here paints pixels. Every action
 * adds to or changes a list of elements (see stampdoc.js), and the square is
 * only ever a rendering of that list. So a circle keeps being a circle - you
 * can come back and give it a two-pixel outline - and "Surprise" hands you
 * something you can take apart instead of a picture you can only keep or
 * throw away.
 *
 * The one thing that still records pixels is Paint, and even that stores the
 * POINTS you dragged rather than the pixels they covered, so it survives a
 * change of square size like everything else.
 */

import {
	ELEMENT_TYPES,
	MOTIONS,
	PALETTE,
	makeElement,
	drawStamp,
	elementAt,
	surpriseDoc,
	isAnimated,
	drawStamp as drawStampInto,
	librarySnag,
	fromStored,
} from './stamp-doc';

const TAU = Math.PI * 2;
const clamp = ( v, a, b ) => ( v < a ? a : v > b ? b : v );

/** What the square is drawn at while you work. Big enough to judge an edge. */
const VIEW = 420;

/**
 * Which settings each type shows.
 *
 * A panel that offers "inner radius" for a bar teaches people that the
 * settings are noise. Only what the type actually uses appears.
 */
const FIELDS = {
	disc: [ 'size', 'hard', 'outline' ],
	ring: [ 'size', 'width' ],
	arc: [ 'size', 'width', 'sweep', 'rot' ],
	star: [ 'size', 'points', 'inner', 'outline', 'rot' ],
	poly: [ 'size', 'sides', 'outline', 'rot' ],
	bar: [ 'size', 'ratio', 'rot' ],
	leaf: [ 'size', 'ratio', 'vein', 'rot' ],
	dots: [ 'size', 'count', 'spread', 'hard', 'seed' ],
	path: [ 'brush', 'hard' ],
	icon: [ 'size', 'outline', 'rot' ],
	glyph: [ 'size', 'rot' ],
	image: [ 'size', 'rot', 'keepColour' ],
};

const nameOf = ( type ) => {
	const e = ELEMENT_TYPES.find( ( x ) => x.id === type );
	return e ? e.name : type;
};

/**
 * Open the maker.
 *
 * TWO EXITS, TWO CALLBACKS, and keeping them apart is not tidiness.
 * `onDone` fires only for the Done button. `onClose` fires whichever way
 * the dialog went away, Done included, and is for letting go of things.
 *
 * They used to be one, and a caller that saved on `onClose` therefore
 * saved when you pressed Escape - the brush tip editor did exactly that,
 * two lines under a comment promising that cancelling leaves the recipe
 * untouched. Anything that KEEPS what was drawn belongs on `onDone`.
 *
 * @param {Object}    deps          The maker's world.
 * @param {Object}    deps.ui       The dialog and control builders.
 * @param {Object}    deps.bridge   The editor bridge.
 * @param {Function}  deps.t        Translator.
 * @param {Object}    deps.doc      The recipe, edited IN PLACE.
 * @param {Object}    deps.images   Image store for image elements.
 * @param {Function}  deps.onChange Called after every edit.
 * @param {?Function} deps.onDone   Called when Done is pressed. Keep here.
 * @param {?Function} deps.onClose  Called on any exit. Release here.
 * @return {Object} The dialog handle.
 */
export function openStampMaker( deps ) {
	const { ui, bridge, t, doc, images, onChange } = deps;
	// WHAT THE SAME MAKER IS FOR TWO CALLERS.
	//
	// Particle Strokes builds a stamp: it has colours and its parts can
	// move, because a swarm of moving marks is what it is for. A brush tip
	// is a COVERAGE MASK: the stroke supplies the colour and there is no
	// time axis to animate along, so both sets of controls would be knobs
	// that change nothing. One maker, two shapes of it - rather than a
	// second maker that drifts.
	const withColour = false !== deps.colour;
	const withMotion = false !== deps.motion;
	const mounts = [];
	let sel = doc.elements.length
		? doc.elements[ doc.elements.length - 1 ].id
		: '';
	let painting = false;
	let playing = true;
	let phase = 0;
	let raf = 0;

	const m = ui.dialog( {
		title: t( 'Draw a brush tip' ),
		subtitle: t( 'A tip is a SHAPE - what is transparent stays empty.' ),
		// × and Escape land here, and they are a CANCEL.
		onClose: () => teardown( false ),
	} );
	m.dialog.classList.add( 'wpie-sm-makerdlg' );
	// The same brand mark as the studio's own head: the maker is part of the
	// studio, and a nested dialog without it reads as a different product.
	// The markup is a constant handed in by the studio, never user input.
	if ( deps.badge || deps.badgeMount ) {
		const mark = document.createElement( 'span' );
		mark.className = 'dsm-badge';
		if ( deps.badge ) {
			mark.innerHTML = deps.badge;
		} else {
			// The editor keeps its mark as a component, not as markup, and
			// copying the path data over here to have a string would be a
			// second copy of the logo waiting to drift from the first.
			mounts.push( deps.badgeMount( mark ) );
		}
		m.head.insertBefore( mark, m.head.firstChild );
	}

	const wrap = ui.el( 'div', 'wpie-sm-maker', m.body );
	const leftCol = ui.el( 'div', 'wpie-sm-makerleft', wrap );
	const midCol = ui.el( 'div', 'wpie-sm-makermid', wrap );
	const rightCol = ui.el( 'div', 'wpie-sm-makerside', wrap );

	/* -------------------------------- square ------------------------------ */

	const view = ui.el( 'div', 'wpie-sm-makerview', midCol );
	const big = ui.el( 'canvas', 'wpie-sm-bigstamp', view );
	big.width = VIEW;
	big.height = VIEW;
	const bigCtx = big.getContext( '2d' );
	// Handles live in their own layer above the picture, so a selection ring
	// is never part of what gets rendered into the stamp.
	const marks = ui.el( 'canvas', 'wpie-sm-makermarks', view );
	marks.width = VIEW;
	marks.height = VIEW;
	const markCtx = marks.getContext( '2d' );
	ui.el(
		'div',
		'wpie-sm-makerhint',
		view,
		t( 'Drag an element to move it · Paint draws freely' )
	);

	const current = () => doc.elements.find( ( e ) => e.id === sel ) || null;

	function paintSquare() {
		bigCtx.clearRect( 0, 0, VIEW, VIEW );
		drawStamp( bigCtx, doc, VIEW, phase, images );
		markCtx.clearRect( 0, 0, VIEW, VIEW );
		const e = current();
		if ( ! e || painting ) {
			return;
		}
		const at = elementAt( e, phase );
		markCtx.save();
		markCtx.strokeStyle = 'rgba(59,102,255,0.95)';
		markCtx.lineWidth = 1.5;
		markCtx.setLineDash( [ 4, 3 ] );
		if ( 'path' === e.type ) {
			const pts = e.pts || [];
			markCtx.beginPath();
			for ( let i = 0; i < pts.length; i += 2 ) {
				const px = pts[ i ] * VIEW,
					py = pts[ i + 1 ] * VIEW;
				if ( 0 === i ) {
					markCtx.moveTo( px, py );
				} else {
					markCtx.lineTo( px, py );
				}
			}
			markCtx.stroke();
		} else {
			const r = Math.max( 6, at.size * VIEW );
			markCtx.beginPath();
			markCtx.arc( at.x * VIEW, at.y * VIEW, r + 3, 0, TAU );
			markCtx.stroke();
			markCtx.setLineDash( [] );
			markCtx.fillStyle = 'rgba(59,102,255,0.95)';
			markCtx.beginPath();
			markCtx.arc( at.x * VIEW, at.y * VIEW, 3, 0, TAU );
			markCtx.fill();
		}
		markCtx.restore();
	}

	function changed() {
		paintSquare();
		if ( onChange ) {
			onChange();
		}
	}

	function loop() {
		if ( playing && isAnimated( doc ) ) {
			phase = ( phase + 1 / 90 ) % 1;
			paintSquare();
		}
		raf = window.requestAnimationFrame( loop );
	}
	raf = window.requestAnimationFrame( loop );

	/* --------------------------- add, list, order -------------------------- */

	const addHead = ui.el( 'div', 'wpie-sm-sub', leftCol, t( 'Add' ) );
	const addRow = ui.el( 'div', 'wpie-sm-pick wpie-sm-pick3', leftCol );
	const listHead = ui.el( 'div', 'wpie-sm-sub', leftCol, t( 'Elements' ) );
	const list = ui.el( 'div', 'wpie-sm-ellist', leftCol );
	// The pickers borrow the left column rather than opening a third dialog
	// on top of two - a stack that deep stops feeling like one tool.
	const picker = ui.el( 'div', 'wpie-sm-makerpick', leftCol );
	picker.hidden = true;

	function addElement( type, over ) {
		const e = makeElement( type, over );
		doc.elements.push( e );
		sel = e.id;
		painting = 'path' === type;
		render();
		changed();
		return e;
	}

	ELEMENT_TYPES.forEach( ( it ) => {
		const b = ui.el( 'button', '', addRow, t( it.name ) );
		b.type = 'button';
		b.onclick = () => {
			if ( 'image' === it.id ) {
				openPicker( 'image' );
			} else if ( 'icon' === it.id || 'glyph' === it.id ) {
				openPicker( 'icon' );
			} else if ( 'path' === it.id ) {
				// Paint arms the square; the element is born on first drag,
				// so an accidental click does not leave an empty stroke in
				// the list.
				painting = true;
				sel = '';
				render();
				paintSquare();
			} else {
				addElement( it.id );
			}
		};
	} );

	function render() {
		list.replaceChildren();
		// Topmost first: that is the order they are seen in, and a list that
		// disagrees with the picture is a list nobody trusts.
		for ( let i = doc.elements.length - 1; i >= 0; i-- ) {
			const e = doc.elements[ i ];
			const row = ui.el( 'div', 'wpie-sm-elrow', list );
			if ( e.id === sel ) {
				row.classList.add( 'is-sel' );
			}
			const swatch = ui.el( 'span', 'wpie-sm-elswatch', row );
			swatch.style.background = e.erase ? 'transparent' : e.colour;
			if ( e.erase ) {
				swatch.classList.add( 'is-erase' );
			}
			ui.el( 'span', 'wpie-sm-elname', row, t( nameOf( e.type ) ) );
			if ( e.motion && 'none' !== e.motion.kind ) {
				ui.el( 'span', 'wpie-sm-elmove', row, '~' );
			}
			row.onclick = ( ev ) => {
				if ( ev.target.dataset.act ) {
					return;
				}
				sel = e.id;
				painting = false;
				render();
				paintSquare();
			};
			const act = ( label, name, title ) => {
				const b = ui.el( 'button', 'wpie-sm-elbtn', row, label );
				b.type = 'button';
				b.dataset.act = name;
				b.title = title;
				return b;
			};
			act( '↑', 'up', t( 'Bring forward' ) ).onclick = () => {
				if ( i < doc.elements.length - 1 ) {
					const [ x ] = doc.elements.splice( i, 1 );
					doc.elements.splice( i + 1, 0, x );
					render();
					changed();
				}
			};
			act( '↓', 'down', t( 'Send backward' ) ).onclick = () => {
				if ( i > 0 ) {
					const [ x ] = doc.elements.splice( i, 1 );
					doc.elements.splice( i - 1, 0, x );
					render();
					changed();
				}
			};
			act( '⧉', 'dup', t( 'Duplicate' ) ).onclick = () => {
				const copy = makeElement( e.type, {
					...e,
					id: undefined,
					x: clamp( e.x + 0.06, 0, 1 ),
					y: clamp( e.y + 0.06, 0, 1 ),
					pts: e.pts ? e.pts.slice() : null,
					motion: { ...e.motion },
				} );
				delete copy.id;
				const made = makeElement( e.type, copy );
				doc.elements.splice( i + 1, 0, made );
				sel = made.id;
				render();
				changed();
			};
			act( '✕', 'del', t( 'Delete' ) ).onclick = () => {
				doc.elements.splice( i, 1 );
				if ( e.id === sel ) {
					sel = doc.elements.length
						? doc.elements[ doc.elements.length - 1 ].id
						: '';
				}
				render();
				changed();
			};
		}
		if ( ! doc.elements.length ) {
			ui.el(
				'div',
				'wpie-sm-elempty',
				list,
				t( 'Nothing yet - add a shape or roll the dice.' )
			);
		}
		renderProps();
	}

	/* ------------------------------- pickers ------------------------------- */

	let pickHandle = null;
	function closePicker() {
		if ( pickHandle && pickHandle.unmount ) {
			pickHandle.unmount();
		}
		pickHandle = null;
		picker.replaceChildren();
		picker.hidden = true;
		addHead.hidden = false;
		addRow.hidden = false;
		listHead.hidden = false;
		list.hidden = false;
	}

	function openPicker( kind ) {
		closePicker();
		picker.hidden = false;
		addHead.hidden = true;
		addRow.hidden = true;
		listHead.hidden = true;
		list.hidden = true;
		ui.el(
			'div',
			'wpie-sm-sub',
			picker,
			t( 'image' === kind ? 'From the media library' : 'Icons and emoji' )
		);
		const host = ui.el( 'div', '', picker );
		const cmp = ( bridge && bridge.components ) || {};
		if ( 'image' === kind && cmp.mountMediaPicker ) {
			pickHandle = cmp.mountMediaPicker( host, {
				height: 300,
				onPick: ( item ) => {
					const src = item.fullUrl || item.url;
					loadInto( src, () => {
						closePicker();
						addElement( 'image', { src, size: 0.42 } );
					} );
				},
			} );
		} else if ( 'icon' === kind && cmp.mountIconPicker ) {
			pickHandle = cmp.mountIconPicker( host, {
				height: 300,
				onPick: ( item ) => {
					closePicker();
					if ( 'emoji' === item.type ) {
						addElement( 'glyph', { char: item.char, size: 0.34 } );
					} else {
						// Icons are outlines by nature, so give them a stroke
						// rather than a fill: filling a Tabler path turns it
						// into a blob and looks like a bug.
						addElement( 'icon', {
							path: item.path,
							size: 0.34,
							width: 0.014,
						} );
					}
				},
			} );
		} else {
			ui.el(
				'div',
				'wpie-sm-elempty',
				host,
				t( 'This picker is not available here.' )
			);
		}
		// A file of your own, for both kinds - it is the fallback that always
		// works, picker or no picker.
		const file = ui.el( 'input', 'wpie-sm-file', picker );
		file.type = 'file';
		file.accept = 'image/*';
		file.addEventListener( 'change', () => {
			const chosen = ( file.files || [] )[ 0 ];
			file.value = '';
			if ( ! chosen ) {
				return;
			}
			const fr = new window.FileReader();
			fr.onload = () => {
				loadInto( String( fr.result ), () => {
					closePicker();
					addElement( 'image', {
						src: String( fr.result ),
						size: 0.42,
					} );
				} );
			};
			fr.readAsDataURL( chosen );
		} );
		ui.btn( picker, { label: t( 'Cancel' ), onClick: closePicker } );
	}

	/** Load a source into the shared cache before anything draws with it. */
	function loadInto( src, done ) {
		if ( deps.load ) {
			deps.load( src, done );
			return;
		}
		if ( images.has( src ) ) {
			done();
			return;
		}
		const img = new window.Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			images.set( src, img );
			done();
		};
		img.onerror = () => {
			// A library image on another origin can refuse to be read back.
			// Better an honest gap than a stamp that silently stays empty.
			images.set( src, null );
			done();
		};
		img.src = src;
	}

	/* ------------------------------ properties ----------------------------- */

	const propHead = ui.el( 'div', 'wpie-sm-sub', rightCol, t( 'Element' ) );
	const props = ui.el( 'div', '', rightCol );

	function renderProps() {
		props.replaceChildren();
		const e = current();
		if ( ! e ) {
			propHead.textContent = t( 'Element' );
			ui.el(
				'div',
				'wpie-sm-elempty',
				props,
				t( 'Pick one on the left to change it.' )
			);
			return;
		}
		propHead.textContent = t( nameOf( e.type ) );

		const num = ( label, get, set, min, max, step, fmt ) =>
			ui.slider( props, {
				label: t( label ),
				min,
				max,
				step: step || 1,
				value: get(),
				format: fmt || String,
				onInput: ( v ) => {
					set( v );
					changed();
				},
			} );

		if ( withColour && ( 'image' !== e.type || ! e.keepColour ) ) {
			const cnode = ui.el( 'div', 'wpie-sm-makercol', props );
			if ( bridge.components && bridge.components.mountColorButton ) {
				mounts.push(
					bridge.components.mountColorButton( cnode, {
						color: e.colour,
						title: t( 'Color' ),
						onChange: ( c ) => {
							e.colour = c;
							render();
							changed();
						},
					} )
				);
			}
			const swatches = ui.el( 'div', 'wpie-sm-swatches', props );
			PALETTE.forEach( ( c ) => {
				const b = ui.el( 'button', '', swatches );
				b.type = 'button';
				b.style.background = c;
				b.title = c;
				b.onclick = () => {
					e.colour = c;
					render();
					changed();
				};
			} );
		}

		const pct = ( v ) => Math.round( v ) + ' %';
		const fields = FIELDS[ e.type ] || [ 'size' ];
		for ( const f of fields ) {
			if ( 'size' === f ) {
				num(
					'Size',
					() => Math.round( e.size * 200 ),
					( v ) => {
						e.size = v / 200;
					},
					1,
					140,
					1
				);
			} else if ( 'brush' === f ) {
				num(
					'Brush',
					() => Math.round( e.size * 200 ),
					( v ) => {
						e.size = v / 200;
					},
					1,
					60,
					1
				);
			} else if ( 'hard' === f ) {
				num(
					'Hardness',
					() => Math.round( e.hard * 100 ),
					( v ) => {
						e.hard = v / 100;
					},
					0,
					100,
					1,
					pct
				);
			} else if ( 'width' === f || 'outline' === f || 'vein' === f ) {
				// In PIXELS of a 512 square, because "2px outline" is the way
				// anybody actually thinks about it.
				num(
					'outline' === f
						? 'Outline'
						: 'vein' === f
						? 'Vein'
						: 'Line width',
					() => Math.round( e.width * 512 ),
					( v ) => {
						e.width = v / 512;
					},
					0,
					60,
					1,
					( v ) => ( 0 === v ? t( 'Filled' ) : v + ' px' )
				);
			} else if ( 'sweep' === f ) {
				num(
					'Sweep',
					() => Math.round( e.sweep * 100 ),
					( v ) => {
						e.sweep = v / 100;
					},
					2,
					100,
					1,
					pct
				);
			} else if ( 'points' === f || 'sides' === f || 'count' === f ) {
				num(
					'points' === f
						? 'Points'
						: 'sides' === f
						? 'Sides'
						: 'How many',
					() => e.n,
					( v ) => {
						e.n = v;
					},
					3,
					'count' === f ? 60 : 20,
					1
				);
			} else if ( 'inner' === f ) {
				num(
					'Waist',
					() => Math.round( e.inner * 100 ),
					( v ) => {
						e.inner = v / 100;
					},
					5,
					95,
					1,
					pct
				);
			} else if ( 'ratio' === f ) {
				num(
					'Thickness',
					() => Math.round( e.ratio * 100 ),
					( v ) => {
						e.ratio = v / 100;
					},
					2,
					150,
					1,
					pct
				);
			} else if ( 'spread' === f ) {
				num(
					'Spread',
					() => Math.round( e.spread * 100 ),
					( v ) => {
						e.spread = v / 100;
					},
					2,
					140,
					1,
					pct
				);
			} else if ( 'rot' === f ) {
				num(
					'Turn',
					() => Math.round( ( e.rot * 180 ) / Math.PI ),
					( v ) => {
						e.rot = ( v * Math.PI ) / 180;
					},
					-180,
					180,
					1,
					( v ) => v + '°'
				);
			} else if ( 'seed' === f ) {
				ui.btn( props, {
					label: t( 'Shuffle' ),
					onClick: () => {
						e.seed = 1 + ( ( Math.random() * 9999 ) | 0 );
						changed();
					},
				} );
			} else if ( 'keepColour' === f ) {
				ui.check( props, {
					label: t( 'Own colors' ),
					checked: !! e.keepColour,
					onChange: ( v ) => {
						e.keepColour = v;
						renderProps();
						changed();
					},
				} );
			}
		}

		num(
			'Opacity',
			() => Math.round( e.alpha * 100 ),
			( v ) => {
				e.alpha = v / 100;
			},
			2,
			100,
			1,
			pct
		);
		ui.check( props, {
			label: t( 'Cut out' ),
			checked: !! e.erase,
			onChange: ( v ) => {
				e.erase = v;
				render();
				changed();
			},
		} );

		/* ------------------------------ motion ----------------------------- */

		if ( ! withMotion ) {
			return;
		}
		ui.el( 'div', 'wpie-sm-sub', props, t( 'Motion' ) );
		ui.select( props, {
			options: MOTIONS.map( ( x ) => ( {
				value: x.id,
				label: t( x.name ),
			} ) ),
			value: e.motion.kind,
			onChange: ( v ) => {
				e.motion.kind = v;
				renderProps();
				render();
				changed();
			},
		} );
		if ( 'none' !== e.motion.kind ) {
			num(
				'Amount',
				() => Math.round( e.motion.amt * 100 ),
				( v ) => {
					e.motion.amt = v / 100;
				},
				0,
				100,
				1,
				pct
			);
			num(
				'Rate',
				() => Math.round( e.motion.speed * 10 ),
				( v ) => {
					e.motion.speed = v / 10;
				},
				5,
				40,
				1,
				( v ) => ( v / 10 ).toFixed( 1 ) + '×'
			);
			num(
				'Offset',
				() => Math.round( e.motion.phase * 100 ),
				( v ) => {
					e.motion.phase = v / 100;
				},
				0,
				99,
				1,
				pct
			);
			ui.el(
				'div',
				'wpie-sm-note',
				props,
				t(
					'Every particle shows a different moment of this, so the stroke shimmers instead of blinking in step.'
				)
			);
		}
	}

	/* ----------------------------- the pointer ----------------------------- */

	const at = ( ev ) => {
		const r = big.getBoundingClientRect();
		return {
			x: ( ev.clientX - r.left ) / Math.max( 1, r.width ),
			y: ( ev.clientY - r.top ) / Math.max( 1, r.height ),
		};
	};

	/** Topmost element under the point, or nothing. */
	function hit( p ) {
		for ( let i = doc.elements.length - 1; i >= 0; i-- ) {
			const e = elementAt( doc.elements[ i ], phase );
			if ( 'path' === e.type ) {
				const pts = e.pts || [];
				for ( let k = 0; k < pts.length; k += 2 ) {
					if (
						Math.hypot( pts[ k ] - p.x, pts[ k + 1 ] - p.y ) <
						e.size + 0.02
					) {
						return doc.elements[ i ];
					}
				}
				continue;
			}
			// Generous on purpose: a two-pixel ring is almost impossible to
			// hit exactly, and the alternative is a tool that feels broken.
			const r = Math.max( 0.03, e.size );
			if ( Math.hypot( e.x - p.x, e.y - p.y ) <= r + 0.02 ) {
				return doc.elements[ i ];
			}
		}
		return null;
	}

	let drag = null;
	big.addEventListener( 'pointerdown', ( ev ) => {
		big.setPointerCapture( ev.pointerId );
		const p = at( ev );
		if ( painting ) {
			const e = addElement( 'path', {
				pts: [ p.x, p.y ],
				size: 0.06,
				hard: 0.35,
			} );
			// addElement re-arms painting for a path; keep it armed so the
			// next drag starts another stroke.
			painting = true;
			drag = { kind: 'paint', e };
			return;
		}
		const e = hit( p );
		if ( ! e ) {
			sel = '';
			render();
			paintSquare();
			return;
		}
		sel = e.id;
		render();
		drag = { kind: 'move', e, dx: e.x - p.x, dy: e.y - p.y };
		paintSquare();
	} );
	big.addEventListener( 'pointermove', ( ev ) => {
		if ( ! drag ) {
			return;
		}
		const p = at( ev );
		if ( 'paint' === drag.kind ) {
			const pts = drag.e.pts;
			const n = pts.length;
			// Skip points closer than a pixel: they only make the recipe fat.
			if (
				n < 2 ||
				Math.hypot( p.x - pts[ n - 2 ], p.y - pts[ n - 1 ] ) > 1 / VIEW
			) {
				pts.push( p.x, p.y );
				paintSquare();
			}
			return;
		}
		drag.e.x = clamp( p.x + drag.dx, -0.2, 1.2 );
		drag.e.y = clamp( p.y + drag.dy, -0.2, 1.2 );
		paintSquare();
	} );
	const endDrag = () => {
		if ( drag ) {
			drag = null;
			changed();
		}
	};
	big.addEventListener( 'pointerup', endDrag );
	big.addEventListener( 'pointercancel', endDrag );

	/* ------------------------------ the library ---------------------------- */

	/*
	 * A strip of stamps under the square: the shipped ones first, then
	 * whatever has been saved. It sits HERE, next to the thing it changes,
	 * rather than in a column - a stamp is a picture and pictures belong
	 * where you are looking.
	 */
	const libWrap = ui.el( 'div', 'wpie-sm-libwrap', midCol );
	const libHead = ui.el( 'div', 'wpie-sm-libhead', libWrap );
	ui.el( 'span', '', libHead, t( 'Stamps' ) );
	const saveBtn = ui.el( 'button', 'wpie-sm-tool', libHead, t( 'Save' ) );
	saveBtn.type = 'button';
	const libStrip = ui.el( 'div', 'wpie-sm-libstrip', libWrap );
	const libNote = ui.el( 'div', 'wpie-sm-note', libWrap, '' );
	let saved = [];

	function libTile( entry, mine, index ) {
		const b = ui.el( 'button', 'wpie-sm-libtile', libStrip );
		b.type = 'button';
		b.title = entry.name || '';
		const c = ui.el( 'canvas', '', b );
		c.width = 54;
		c.height = 54;
		drawStampInto(
			c.getContext( '2d' ),
			fromStored( entry ),
			54,
			0,
			images
		);
		ui.el( 'span', '', b, entry.name || '' );
		b.onclick = () => {
			// Into the SAME object the studio holds, or the maker would edit
			// a copy nobody sees.
			doc.elements = fromStored( entry ).elements;
			sel = doc.elements.length
				? doc.elements[ doc.elements.length - 1 ].id
				: '';
			painting = false;
			render();
			changed();
		};
		if ( mine ) {
			const del = ui.el( 'span', 'wpie-sm-libdel', b, '✕' );
			del.title = t( 'Delete' );
			del.onclick = async ( ev ) => {
				ev.stopPropagation();
				saved.splice( index, 1 );
				await deps.library?.write?.( saved );
				paintLibrary();
			};
		}
	}

	function paintLibrary() {
		libStrip.replaceChildren();
		// The library is OPTIONAL. It used to be read without asking,
		// because the only caller always passed one - and the first caller
		// that did not got a half-built dialog and a TypeError, which is a
		// poor way to learn that a dependency was never really required.
		( ( deps.library && deps.library.starters ) || [] ).forEach( ( x ) =>
			libTile( x, false, -1 )
		);
		saved.forEach( ( x, i ) => libTile( x, true, i ) );
	}

	saveBtn.onclick = async () => {
		if ( ! doc.elements.length ) {
			libNote.textContent = t( 'There is nothing to save yet.' );
			return;
		}
		const snag = librarySnag( doc );
		if ( 'uploaded-image' === snag ) {
			// Honest and actionable: the store is 32 KB for the whole
			// extension and one pasted photo is bigger than that on its own.
			libNote.textContent = t(
				'A stamp with an uploaded picture is too big to save. Pick the picture from the media library instead.'
			);
			return;
		}
		if ( snag ) {
			libNote.textContent = t( 'This stamp is too big to save.' );
			return;
		}
		if ( saved.length >= 24 ) {
			libNote.textContent = t(
				'The library is full - delete one to make room.'
			);
			return;
		}
		saved.push( {
			id: 'u' + saved.length + '-' + doc.elements.length,
			name: t( 'Mine' ) + ' ' + ( saved.length + 1 ),
			elements: JSON.parse( JSON.stringify( doc.elements ) ),
		} );
		const ok = await deps.library?.write?.( saved );
		libNote.textContent = ok ? '' : t( 'Could not save it.' );
		paintLibrary();
	};

	if ( deps.library && deps.library.read ) {
		deps.library.read().then( ( stored ) => {
			saved = Array.isArray( stored ) ? stored : [];
			paintLibrary();
		} );
	} else {
		paintLibrary();
	}

	/* ------------------------------- the foot ------------------------------ */

	// The dialog's own foot, so this looks like every other editor modal
	// instead of growing a second button bar under the canvas. The old
	// class comes along ONLY on the fallback bar - on the dialog's foot it
	// would paint its own panel inside the real one.
	const foot = m.foot || ui.el( 'div', 'wpie-sm-makerfoot', midCol );
	ui.btn( foot, {
		label: t( 'Surprise' ),
		primary: true,
		onClick: () => {
			surpriseDoc( doc );
			sel = doc.elements.length
				? doc.elements[ doc.elements.length - 1 ].id
				: '';
			painting = false;
			render();
			changed();
		},
	} );
	ui.btn( foot, {
		label: t( 'Clear' ),
		onClick: () => {
			doc.elements.length = 0;
			sel = '';
			painting = false;
			render();
			changed();
		},
	} );
	if ( withMotion ) {
		const playBtn = ui.el( 'button', 'wpie-sm-tool', foot, t( 'Pause' ) );
		playBtn.type = 'button';
		playBtn.onclick = () => {
			playing = ! playing;
			playBtn.textContent = playing ? t( 'Pause' ) : t( 'Play' );
		};
	}
	ui.el( 'span', 'wpie-sm-makerspace', foot );
	ui.btn( foot, {
		label: t( 'Done' ),
		primary: true,
		// NOT m.close() on its own. `close()` just removes the dialog and
		// does not reach teardown, so what was drawn would be dropped -
		// Done used to lose the lot.
		onClick: () => {
			teardown( true );
			m.close();
		},
	} );

	let torn = false;
	/**
	 * @param {boolean} done True from the Done button, false from × or
	 *                       Escape. The caller keeps its work on the
	 *                       first and must not on the second.
	 */
	function teardown( done ) {
		// Both ways out reach this, and each callback runs at most once.
		if ( torn ) {
			return;
		}
		torn = true;
		if ( raf ) {
			window.cancelAnimationFrame( raf );
			raf = 0;
		}
		closePicker();
		mounts.forEach( ( x ) => x && x.unmount && x.unmount() );
		if ( done && deps.onDone ) {
			deps.onDone();
		}
		if ( deps.onClose ) {
			deps.onClose();
		}
	}

	render();
	paintSquare();
	return m;
}
