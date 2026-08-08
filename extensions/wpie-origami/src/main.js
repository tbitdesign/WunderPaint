/**
 * WPIE extension: Origami Studio.
 *
 * Design both sides of a folding sheet, watch the sheet fold itself
 * into the figure in a real 3D scene, walk the instructions step by
 * step - each step is a place you can stand and look around - and
 * leave with print-ready pages: the sheet with cutting marks, its
 * back mirrored for duplex printing, and classic instruction
 * diagrams drawn from the same folds the preview just performed.
 */
import { OrigamiEngine, LIGHTS, GROUNDS, VIEWS } from './engine.js';
import { FIGURES, figureOf } from './core/figures/index.js';
import { drawDiagram } from './core/diagram.js';
import { sheetPage, instructionPages } from './core/sheet.js';

const GEN_ID = 'wpie-origami/studio';

import { t } from './i18n.js';

const sprintf = ( s, ...args ) =>
	s.replace( /%(\d)\$s/g, ( _, i ) => String( args[ i - 1 ] ) );

/* -------------------------------- patterns -------------------------------- */

const PATTERNS = [
	{ id: 'plain', label: 'Plain', paint: null },
	{
		id: 'dots',
		label: 'Dots',
		paint: ( g, S ) => {
			const step = S / 9;
			for ( let r = 0; r < 10; r++ ) {
				for ( let c = 0; c < 10; c++ ) {
					g.beginPath();
					g.arc(
						c * step + ( r % 2 ? step / 2 : 0 ),
						r * step + step / 2,
						step * 0.16,
						0,
						Math.PI * 2
					);
					g.fill();
				}
			}
		},
	},
	{
		id: 'stripes',
		label: 'Stripes',
		paint: ( g, S ) => {
			g.lineWidth = S * 0.03;
			for ( let i = -10; i < 20; i++ ) {
				g.beginPath();
				g.moveTo( ( i * S ) / 8, -S * 0.1 );
				g.lineTo( ( i * S ) / 8 - S * 0.5, S * 1.1 );
				g.stroke();
			}
		},
	},
	{
		id: 'zigzag',
		label: 'Zigzag',
		paint: ( g, S ) => {
			g.lineWidth = S * 0.018;
			const step = S / 8;
			for ( let r = 0; r < 10; r++ ) {
				g.beginPath();
				for ( let c = 0; c <= 16; c++ ) {
					const x = ( c * S ) / 16;
					const y = r * step + ( c % 2 ? 0 : step * 0.4 );
					if ( c ) {
						g.lineTo( x, y );
					} else {
						g.moveTo( x, y );
					}
				}
				g.stroke();
			}
		},
	},
	{
		id: 'stars',
		label: 'Stars',
		paint: ( g, S ) => {
			const star = ( cx, cy, r ) => {
				g.beginPath();
				for ( let i = 0; i < 10; i++ ) {
					const rr = i % 2 ? r * 0.45 : r;
					const a = ( i * Math.PI ) / 5 - Math.PI / 2;
					const x = cx + Math.cos( a ) * rr;
					const y = cy + Math.sin( a ) * rr;
					if ( i ) {
						g.lineTo( x, y );
					} else {
						g.moveTo( x, y );
					}
				}
				g.closePath();
				g.fill();
			};
			const step = S / 5;
			for ( let r = 0; r < 6; r++ ) {
				for ( let c = 0; c < 6; c++ ) {
					star(
						c * step + ( r % 2 ? step / 2 : 0 ),
						r * step + step / 2,
						step * 0.16
					);
				}
			}
		},
	},
	{
		id: 'checks',
		label: 'Checks',
		paint: ( g, S ) => {
			const step = S / 8;
			for ( let r = 0; r < 8; r++ ) {
				for ( let c = 0; c < 8; c++ ) {
					if ( ( r + c ) % 2 ) {
						g.fillRect( c * step, r * step, step, step );
					}
				}
			}
		},
	},
];

/* ----------------------------- paper painting ----------------------------- */

const imageCache = {};

function loadImage( src, onReady ) {
	if ( imageCache[ src ] ) {
		return imageCache[ src ].complete ? imageCache[ src ] : null;
	}
	const img = new window.Image();
	img.crossOrigin = 'anonymous';
	img.onload = onReady;
	img.src = src;
	imageCache[ src ] = img;
	return null;
}

/**
 * Paint one side of the paper into a square context region.
 *
 * @param {CanvasRenderingContext2D} g    Context.
 * @param {number}                   S    Square size in px.
 * @param {Object}                   side { color, image, pattern, patternColor }.
 * @param {Object}                   o    { figure, side, regions, foldLines, onImage }.
 */
function paintSide( g, S, side, o = {} ) {
	g.save();
	g.fillStyle = side.color;
	g.fillRect( 0, 0, S, S );
	if ( side.image ) {
		const img = loadImage( side.image, o.onImage );
		if ( img ) {
			const scale = Math.max( S / img.width, S / img.height );
			const w = img.width * scale;
			const h = img.height * scale;
			g.drawImage( img, ( S - w ) / 2, ( S - h ) / 2, w, h );
		}
	}
	const pat = PATTERNS.find( ( p ) => p.id === side.pattern );
	if ( pat && pat.paint ) {
		g.fillStyle = side.patternColor;
		g.strokeStyle = side.patternColor;
		g.globalAlpha = side.image ? 0.55 : 0.85;
		pat.paint( g, S );
		g.globalAlpha = 1;
	}

	const fig = o.figure;
	const mirrorX = ( x ) => ( 'back' === o.side ? 1 - x : x );

	if ( o.foldLines && fig ) {
		g.strokeStyle = 'rgba(60,54,48,0.3)';
		g.lineWidth = Math.max( 1, S * 0.0022 );
		g.setLineDash( [ S * 0.012, S * 0.012 ] );
		const onBorder = ( p, q ) =>
			( p[ 0 ] < 1e-6 && q[ 0 ] < 1e-6 ) ||
			( p[ 0 ] > 1 - 1e-6 && q[ 0 ] > 1 - 1e-6 ) ||
			( p[ 1 ] < 1e-6 && q[ 1 ] < 1e-6 ) ||
			( p[ 1 ] > 1 - 1e-6 && q[ 1 ] > 1 - 1e-6 );
		for ( const pts of fig.faces ) {
			for ( let i = 0; i < pts.length; i++ ) {
				const p = pts[ i ];
				const q = pts[ ( i + 1 ) % pts.length ];
				if ( onBorder( p, q ) ) {
					continue;
				}
				g.beginPath();
				g.moveTo( mirrorX( p[ 0 ] ) * S, p[ 1 ] * S );
				g.lineTo( mirrorX( q[ 0 ] ) * S, q[ 1 ] * S );
				g.stroke();
			}
		}
		g.setLineDash( [] );
	}

	if ( o.regions && fig ) {
		for ( const region of fig.regions || [] ) {
			if ( region.side !== o.side ) {
				continue;
			}
			for ( const poly of region.polys ) {
				g.beginPath();
				poly.forEach( ( p, i ) => {
					const x = mirrorX( p[ 0 ] ) * S;
					const y = p[ 1 ] * S;
					if ( i ) {
						g.lineTo( x, y );
					} else {
						g.moveTo( x, y );
					}
				} );
				g.closePath();
				g.fillStyle = 'rgba(59,102,255,0.2)';
				g.fill();
				g.strokeStyle = 'rgba(59,102,255,0.75)';
				g.lineWidth = Math.max( 1, S * 0.003 );
				g.stroke();
				let cx = 0;
				let cy = 0;
				poly.forEach( ( p ) => {
					cx += mirrorX( p[ 0 ] );
					cy += p[ 1 ];
				} );
				cx = ( cx / poly.length ) * S;
				cy = ( cy / poly.length ) * S;
				g.fillStyle = '#22337a';
				g.font = `600 ${ Math.round(
					S * 0.032
				) }px system-ui, sans-serif`;
				g.textAlign = 'center';
				g.fillText( t( region.label ), cx, cy );
			}
		}
	}
	g.restore();
}

/* -------------------------------- the studio ------------------------------- */

function openStudio( ctx ) {
	const { editor } = ctx || {};
	const bridge = window.WPIE && window.WPIE.bridge;
	const ui = bridge && bridge.ui;
	if ( ! ui || ! ui.dialog || ! editor ) {
		return;
	}
	// Section icons in the studio CI stroke style (see 3D Flip Studio).
	const svg = ( d ) =>
		`<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ d }</svg>`;
	const ICONS = {
		figure: svg( '<path d="M4 4h9l7 7v9H4z"/><path d="M13 4v7h7"/>' ),
		paper: svg(
			'<path d="M4 4h16v16H4z"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="14" r="1"/>'
		),
		steps: svg(
			'<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>'
		),
		scene: svg(
			'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>'
		),
	};
	const stored =
		( ctx.layer && ctx.layer.generator && ctx.layer.generator.params ) ||
		null;

	const state = {
		figure: 'crane',
		front: {
			color: '#e05548',
			image: null,
			pattern: 'plain',
			patternColor: '#f6d9b8',
		},
		back: {
			color: '#f6efe0',
			image: null,
			pattern: 'plain',
			patternColor: '#d9a86e',
		},
		useBrand: false,
		brandKitId: '',
		showRegions: false,
		printLines: true,
		light: 'soft',
		ground: 'shadow',
		background: null,
		...( stored || {} ),
	};

	const modal = ui.dialog( {
		title: t( 'Origami' ),
		subtitle: t(
			'Design the paper, watch it fold itself, print sheet and instructions.'
		),
		width: 1460,
	} );
	modal.dialog.classList.add( 'wpieog' );

	const body = ui.el( 'div', 'wpieog-body', modal.body );
	const left = ui.el( 'div', 'wpieog-left', body );
	const view = ui.el( 'div', 'wpieog-view', body );
	const side = ui.el( 'div', 'wpieog-side', body );

	/* ------------------------------ 3D view ------------------------------- */

	const canvas = ui.el( 'canvas', 'wpieog-canvas', view );
	const engine = new OrigamiEngine( canvas );
	ui.el(
		'div',
		'wpieog-hint',
		view,
		t( 'Drag to turn the scene, wheel to zoom.' )
	);

	const viewBtns = ui.el( 'div', 'wpieog-views', view );
	for ( const [ key, label ] of [
		[ 'reader', 'Angled' ],
		[ 'front', 'Front' ],
		[ 'quarter', 'Three-quarter' ],
		[ 'flat', 'From above' ],
	] ) {
		ui.btn( viewBtns, {
			label: t( label ),
			onClick: () => {
				const fig = figureOf( state.figure );
				engine.setView( {
					...VIEWS[ key ],
					zoom: fig.view.zoom || 1,
				} );
			},
		} );
	}

	// Orbit.
	let dragging = null;
	canvas.addEventListener( 'pointerdown', ( e ) => {
		dragging = { x: e.clientX, y: e.clientY };
		canvas.setPointerCapture( e.pointerId );
		engine.stop();
	} );
	canvas.addEventListener( 'pointermove', ( e ) => {
		if ( ! dragging ) {
			return;
		}
		engine.params.yaw += ( e.clientX - dragging.x ) * 0.35;
		engine.params.pitch = Math.min(
			89,
			Math.max(
				4,
				engine.params.pitch + ( e.clientY - dragging.y ) * 0.3
			)
		);
		dragging = { x: e.clientX, y: e.clientY };
	} );
	canvas.addEventListener( 'pointerup', () => {
		dragging = null;
	} );
	canvas.addEventListener(
		'wheel',
		( e ) => {
			e.preventDefault();
			engine.params.zoom = Math.min(
				3,
				Math.max(
					0.45,
					engine.params.zoom * ( e.deltaY < 0 ? 1.08 : 0.93 )
				)
			);
		},
		{ passive: false }
	);

	// Progress bar under the canvas.
	const bar = ui.el( 'div', 'wpieog-bar', view );
	ui.btn( bar, {
		label: '▶ ' + t( 'Play' ),
		onClick: () => engine.play(),
	} );
	const progress = ui.el( 'input', 'wpieog-progress dsm-range', bar );
	progress.type = 'range';
	progress.min = '0';
	progress.max = '1000';
	progress.value = '1000';
	const stepLabel = ui.el( 'span', 'wpieog-steplabel dsm-mono', bar, '' );
	progress.oninput = () => {
		engine.stop();
		const fig = figureOf( state.figure );
		engine.setProgress(
			( Number( progress.value ) / 1000 ) * fig.steps.length
		);
	};

	/* ------------------------------- paper -------------------------------- */

	const SIZE = 1024;
	const frontCanvas = document.createElement( 'canvas' );
	const backViewCanvas = document.createElement( 'canvas' );
	const backMirror = document.createElement( 'canvas' );
	for ( const c of [ frontCanvas, backViewCanvas, backMirror ] ) {
		c.width = SIZE;
		c.height = SIZE;
	}

	const repaint = () => {
		const fig = figureOf( state.figure );
		const common = {
			figure: fig,
			regions: state.showRegions,
			foldLines: state.showRegions,
			onImage: () => repaint(),
		};
		paintSide( frontCanvas.getContext( '2d' ), SIZE, state.front, {
			...common,
			side: 'front',
		} );
		paintSide( backViewCanvas.getContext( '2d' ), SIZE, state.back, {
			...common,
			side: 'back',
		} );
		const g = backMirror.getContext( '2d' );
		g.save();
		g.clearRect( 0, 0, SIZE, SIZE );
		g.translate( SIZE, 0 );
		g.scale( -1, 1 );
		g.drawImage( backViewCanvas, 0, 0 );
		g.restore();
		engine.setPaper( frontCanvas, backMirror );
		paintPreviews();
	};

	/* ------------------------------- left column --------------------------- */

	const figBody = ui.section( left, {
		icon: ICONS.figure,
		title: t( 'Figure' ),
	} );
	const figGrid = ui.el( 'div', 'wpieog-figures', figBody );
	const figTiles = {};
	for ( const fig of FIGURES ) {
		const tile = ui.el( 'button', 'wpieog-figure', figGrid );
		tile.type = 'button';
		const thumb = ui.el( 'canvas', 'wpieog-figthumb', tile );
		thumb.width = 96;
		thumb.height = 96;
		drawDiagram( thumb.getContext( '2d' ), fig, fig.steps.length, {
			x: 4,
			y: 4,
			w: 88,
			h: 88,
		} );
		ui.el( 'span', null, tile, t( fig.label ) );
		tile.onclick = () => selectFigure( fig.id );
		figTiles[ fig.id ] = tile;
	}

	const paperBody = ui.section( left, {
		icon: ICONS.paper,
		title: t( 'The paper' ),
	} );
	const sidePreviews = {};
	const colorMounts = [];
	const swatches = {};

	const colour = ( parent, label, value, onChange ) => {
		const cell = ui.row( parent, label );
		if ( bridge.components && bridge.components.mountColorButton ) {
			const swatch = bridge.components.mountColorButton( cell, {
				color: value,
				onChange: ( c ) => {
					swatch.set( c );
					onChange( c );
				},
			} );
			colorMounts.push( swatch );
			return swatch;
		}
		const input = ui.el( 'input', null, cell );
		input.type = 'color';
		input.value = value;
		input.oninput = () => onChange( input.value );
		return { set: ( v ) => ( input.value = v ) };
	};

	const sideBlock = ( key, label ) => {
		const box = ui.el( 'div', 'wpieog-sidebox', paperBody );
		const head = ui.el( 'div', 'wpieog-sidehead', box );
		ui.el( 'span', null, head, t( label ) );
		const preview = ui.el( 'canvas', 'wpieog-paperview', head );
		preview.width = 72;
		preview.height = 72;
		sidePreviews[ key ] = preview;

		swatches[ key ] = colour(
			box,
			t( 'Colour' ),
			state[ key ].color,
			( c ) => {
				state[ key ].color = c;
				repaint();
			}
		);
		const btnRow = ui.el( 'div', 'wpieog-btnrow', box );
		ui.btn( btnRow, {
			label: t( 'Pick a picture' ),
			onClick: async () => {
				// pickMedia resolves an ARRAY of items (null = cancelled),
				// also for single picks.
				const picked = await window.WPIE.pickMedia( {
					multiple: false,
				} );
				const item = Array.isArray( picked ) ? picked[ 0 ] : picked;
				if ( item ) {
					state[ key ].image = item.fullUrl || item.url;
					repaint();
				}
			},
		} );
		ui.btn( btnRow, {
			label: t( 'Remove picture' ),
			onClick: () => {
				state[ key ].image = null;
				repaint();
			},
		} );
		ui.select( ui.row( box, t( 'Pattern' ) ), {
			options: PATTERNS.map( ( p ) => ( {
				value: p.id,
				label: t( p.label ),
			} ) ),
			value: state[ key ].pattern,
			onChange: ( v ) => {
				state[ key ].pattern = v;
				repaint();
			},
		} );
		colour(
			box,
			t( 'Pattern colour' ),
			state[ key ].patternColor,
			( c ) => {
				state[ key ].patternColor = c;
				repaint();
			}
		);
	};
	sideBlock( 'front', 'Front side' );
	sideBlock( 'back', 'Back side' );

	// Brand kit: front and back take the first two brand colours, so a
	// company crane comes out in the company's own paper. window.WPIE is
	// read live - the Brand Kits dialog reassigns the list (core 1.250.2).
	const brandKits = () =>
		(
			( bridge.brand && bridge.brand.kits && bridge.brand.kits() ) ||
			( window.WPIE && window.WPIE.brandKits ) ||
			[]
		).filter( ( k ) => k && Array.isArray( k.colors ) && k.colors.length );
	const brandColors = () => {
		const kits = brandKits();
		if ( ! kits.length ) {
			return (
				( window.WPIE &&
					window.WPIE.brand &&
					window.WPIE.brand.colors ) ||
				[]
			);
		}
		const chosen =
			kits.find(
				( k ) => String( k.id ) === String( state.brandKitId )
			) || kits[ 0 ];
		return chosen.colors || [];
	};
	const applyBrand = () => {
		if ( ! state.useBrand ) {
			return;
		}
		const c = brandColors();
		[ 'front', 'back' ].forEach( ( key, i ) => {
			if ( c[ i ] ) {
				state[ key ].color = c[ i ];
				if ( swatches[ key ] && swatches[ key ].set ) {
					swatches[ key ].set( c[ i ] );
				}
			}
		} );
		repaint();
	};
	if ( brandKits().length || brandColors().length ) {
		ui.check( paperBody, {
			label: t( 'Use brand colors' ),
			checked: state.useBrand,
			onChange: ( v ) => {
				state.useBrand = v;
				applyBrand();
			},
		} );
		if (
			brandKits().length > 1 &&
			bridge.components &&
			bridge.components.mountKitPicker
		) {
			bridge.components.mountKitPicker(
				ui.row( paperBody, t( 'Brand kit' ) ),
				{
					value: state.brandKitId || brandKits()[ 0 ].id,
					onChange: ( id ) => {
						state.brandKitId = id;
						state.useBrand = true;
						applyBrand();
					},
				}
			);
		}
		applyBrand();
	}

	ui.check( paperBody, {
		label: t( 'Show where things land' ),
		checked: state.showRegions,
		onChange: ( v ) => {
			state.showRegions = v;
			repaint();
		},
	} );
	ui.check( paperBody, {
		label: t( 'Print fold lines on the sheet' ),
		checked: state.printLines,
		onChange: ( v ) => {
			state.printLines = v;
		},
	} );

	function paintPreviews() {
		for ( const key of [ 'front', 'back' ] ) {
			const c = sidePreviews[ key ];
			const g = c.getContext( '2d' );
			g.clearRect( 0, 0, c.width, c.height );
			g.drawImage(
				'front' === key ? frontCanvas : backViewCanvas,
				0,
				0,
				c.width,
				c.height
			);
		}
	}

	/* ------------------------------ right column --------------------------- */

	const stepsBody = ui.section( side, {
		icon: ICONS.steps,
		title: t( 'Instructions' ),
	} );
	const stepsList = ui.el( 'div', 'wpieog-steps', stepsBody );

	const sceneBody = ui.section( side, {
		icon: ICONS.scene,
		title: t( 'Scene' ),
	} );
	ui.select( ui.row( sceneBody, t( 'Lighting' ) ), {
		options: LIGHTS.map( ( v ) => ( {
			value: v,
			label: t(
				{
					soft: 'Soft',
					warm: 'Warm',
					dramatic: 'Dramatic',
					studio: 'Studio',
				}[ v ]
			),
		} ) ),
		value: state.light,
		onChange: ( v ) => {
			state.light = v;
			engine.setLight( v );
		},
	} );
	ui.select( ui.row( sceneBody, t( 'Ground' ) ), {
		options: GROUNDS.map( ( v ) => ( {
			value: v,
			label: t(
				{
					shadow: 'Shadow only',
					plane: 'Table',
					mirror: 'Mirror',
					none: 'None',
				}[ v ]
			),
		} ) ),
		value: state.ground,
		onChange: ( v ) => {
			state.ground = v;
			engine.setGround( v );
		},
	} );
	colour(
		sceneBody,
		t( 'Background' ),
		state.background || '#20242b',
		( c ) => {
			state.background = c;
			engine.setBackground( c );
		}
	);

	/* ------------------------------ steps list ----------------------------- */

	let stepItems = [];

	function buildSteps() {
		const fig = figureOf( state.figure );
		stepsList.replaceChildren();
		stepItems = [];
		const mk = ( label, at, thumbAt ) => {
			const item = ui.el( 'button', 'wpieog-step', stepsList );
			item.type = 'button';
			const thumb = ui.el( 'canvas', 'wpieog-stepthumb', item );
			thumb.width = 64;
			thumb.height = 64;
			drawDiagram( thumb.getContext( '2d' ), fig, thumbAt, {
				x: 2,
				y: 2,
				w: 60,
				h: 60,
			} );
			ui.el( 'span', 'wpieog-steptext', item, label );
			item.onclick = () => {
				engine.stop();
				if ( at > 0 ) {
					engine.setProgress( at - 1 );
					engine.animateTo( at );
				} else {
					engine.animateTo( 0 );
				}
			};
			stepItems.push( { item, at } );
		};
		mk( t( 'The sheet' ), 0, 0 );
		fig.steps.forEach( ( step, i ) => {
			mk( `${ i + 1 }. ${ t( step.text ) }`, i + 1, i );
		} );
		markStep();
	}

	function markStep() {
		const fig = figureOf( state.figure );
		const p = engine.params.progress;
		const active = Math.round( p );
		for ( const { item, at } of stepItems ) {
			item.classList.toggle( 'is-on', at === active );
		}
		progress.value = String(
			Math.round( ( p / ( fig.steps.length || 1 ) ) * 1000 )
		);
		stepLabel.textContent =
			p < 1e-4
				? t( 'The sheet' )
				: p > fig.steps.length - 1e-4
				? t( 'Finished!' )
				: sprintf(
						t( 'Step %1$s of %2$s' ),
						Math.max( 1, Math.ceil( p - 1e-4 ) ),
						fig.steps.length
				  );
	}
	engine.onProgress = markStep;

	function selectFigure( id ) {
		state.figure = id;
		const fig = figureOf( id );
		for ( const [ fid, tile ] of Object.entries( figTiles ) ) {
			tile.classList.toggle( 'is-on', fid === id );
		}
		engine.setFigure( fig );
		engine.setView( { ...VIEWS.reader, ...fig.view } );
		buildSteps();
		repaint();
		// Show the finished figure at rest - folding only plays on Play
		// or when a step is clicked (user request 26.07.).
		engine.setProgress( fig.steps.length );
	}

	/* -------------------------------- output ------------------------------- */

	const status = ui.el( 'div', 'wpieog-status', modal.foot, '' );
	const setStatus = ( msg, bad ) => {
		status.textContent = msg || '';
		status.classList.toggle( 'is-bad', !! bad );
	};

	const storedParams = () => ( {
		figure: state.figure,
		front: { ...state.front },
		back: { ...state.back },
		useBrand: state.useBrand,
		brandKitId: state.brandKitId,
		showRegions: false,
		printLines: state.printLines,
		light: state.light,
		ground: state.ground,
		background: state.background,
	} );

	const printSquare = ( key ) => {
		const S = 1600;
		const c = document.createElement( 'canvas' );
		c.width = S;
		c.height = S;
		paintSide( c.getContext( '2d' ), S, state[ key ], {
			figure: figureOf( state.figure ),
			side: key,
			regions: false,
			foldLines: 'front' === key && state.printLines,
		} );
		return c;
	};

	function buildPages() {
		const fig = figureOf( state.figure );
		const doc = editor.state.doc;
		const scale = Math.min( 2, 2200 / Math.max( doc.w, doc.h ) );
		const w = Math.round( doc.w * scale );
		const h = Math.round( doc.h * scale );
		const name = t( fig.label );

		const front = printSquare( 'front' );
		const back = printSquare( 'back' );
		const pages = [
			{
				name: `${ name } - ${ t( 'Folding sheet' ) } 1`,
				canvas: sheetPage( {
					w,
					h,
					paint: ( g, x, y, size ) =>
						g.drawImage( front, x, y, size, size ),
					caption: `${ name } - ${ t( 'Folding sheet - front' ) }`,
				} ),
			},
			{
				name: `${ name } - ${ t( 'Folding sheet' ) } 2`,
				canvas: sheetPage( {
					w,
					h,
					mirror: true,
					paint: ( g, x, y, size ) =>
						g.drawImage( back, x, y, size, size ),
					caption: `${ name } - ${ t(
						'Folding sheet - back, mirrored for duplex print'
					) }`,
				} ),
			},
		];
		instructionPages( {
			w,
			h,
			figure: fig,
			title: `${ name } - ${ t( 'Folding instructions' ) }`,
			texts: fig.steps.map( ( s ) => t( s.text ) ),
			done: t( 'Finished!' ),
		} ).forEach( ( page, i ) => {
			pages.push( {
				name: `${ name } - ${ t( 'Folding instructions' ) } ${ i + 1 }`,
				canvas: page,
			} );
		} );
		return pages;
	}

	ui.btn( modal.foot, {
		label: t( 'Cancel' ),
		onClick: () => close(),
	} );
	ui.btn( modal.foot, {
		label: t( 'Insert as picture' ),
		onClick: () => {
			try {
				const url = engine.snapshot( 1400 );
				const doc = editor.state.doc;
				const size = Math.round( Math.min( doc.w, doc.h ) * 0.7 );
				const layer = bridge.documents.makeImage( {
					name: t( 'Origami picture' ),
					x: Math.round( ( doc.w - size ) / 2 ),
					y: Math.round( ( doc.h - size ) / 2 ),
					w: size,
					h: size,
					src: url,
					naturalW: 1400,
					naturalH: 1400,
				} );
				layer.generator = { id: GEN_ID, params: storedParams() };
				editor.dispatch( { type: 'ADD_LAYER', layer } );
				editor.dispatch( { type: 'SET_ACTIVE', id: layer.id } );
				editor.commit( t( 'Origami picture' ) );
				setStatus( t( 'Inserted.' ) );
			} catch ( e ) {
				setStatus(
					( e && e.message ) || t( 'Could not insert.' ),
					true
				);
			}
		},
	} );
	const applyBtn = ui.btn( modal.foot, {
		label: t( 'Insert sheet + instructions' ),
		primary: true,
		onClick: async () => {
			applyBtn.disabled = true;
			setStatus( t( 'Rendering the pages' ) );
			try {
				const doc = { ...editor.state.doc };
				const built = buildPages();
				const ser =
					bridge.documents.serializeLayers ||
					( ( layers ) => layers );
				const current = {
					doc,
					layers: ser( editor.state.layers ),
				};
				const list = editor.state.pages
					? ( () => {
							const l = [ ...editor.state.pages.list ];
							l[ editor.state.pages.current ] = current;
							return l;
					  } )()
					: [ current ];
				const firstNew = list.length;
				for ( const page of built ) {
					const layer = bridge.documents.makeImage( {
						name: page.name,
						x: 0,
						y: 0,
						w: doc.w,
						h: doc.h,
						src: page.canvas.toDataURL( 'image/png' ),
						naturalW: page.canvas.width,
						naturalH: page.canvas.height,
					} );
					list.push( { doc: { ...doc }, layers: [ layer ] } );
				}
				editor.dispatch( {
					type: 'LOAD_DOCUMENT',
					doc: { ...doc },
					layers: [],
					keepPages: true,
					label: t( 'Insert pages' ),
				} );
				editor.dispatch( {
					type: 'SET_PAGES',
					pages: list,
					current: firstNew,
				} );
				editor.commit( t( 'Insert pages' ) );
				setStatus( t( 'Inserted.' ) );
				close();
			} catch ( e ) {
				setStatus(
					( e && e.message ) || t( 'Could not insert.' ),
					true
				);
				applyBtn.disabled = false;
			}
		},
	} );

	/* --------------------------------- boot -------------------------------- */

	let raf = null;
	const loop = () => {
		engine.render();
		raf = requestAnimationFrame( loop );
	};

	const ro = new window.ResizeObserver( () => {
		const r = canvas.getBoundingClientRect();
		if ( r.width && r.height ) {
			engine.resize( Math.round( r.width ), Math.round( r.height ) );
		}
	} );
	ro.observe( canvas );

	function close() {
		cancelAnimationFrame( raf );
		ro.disconnect();
		engine.dispose();
		for ( const m of colorMounts ) {
			if ( m && m.unmount ) {
				m.unmount();
			}
		}
		modal.close();
	}
	modal.dialog.querySelector( '.dsm-close' ).onclick = close;

	engine.setLight( state.light );
	engine.setGround( state.ground );
	if ( state.background ) {
		engine.setBackground( state.background );
	}
	repaint();
	selectFigure( state.figure );
	loop();

	/* ---------------------------------- QA --------------------------------- */

	window.__wpieogState = () => ( {
		figure: state.figure,
		progress: engine.params.progress,
		steps: figureOf( state.figure ).steps.length,
		front: { ...state.front },
		back: { ...state.back },
		showRegions: state.showRegions,
		printLines: state.printLines,
		light: state.light,
		ground: state.ground,
		yaw: Math.round( engine.params.yaw ),
		pitch: Math.round( engine.params.pitch ),
		zoom: engine.params.zoom,
	} );
	window.__wpieogEngine = engine;
}

/* --------------------------------- register -------------------------------- */

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Origami',
		run: ( ctx ) => openStudio( ctx ),
		edit: ( ctx ) => openStudio( ctx ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else {
	window.wp.hooks.addAction( 'wpie.ready', 'wpie-origami', register );
}
