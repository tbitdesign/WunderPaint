import {
	APPLY_TOOLS,
	OBSTACLE_TOOLS,
	applyPattern,
	holdPattern,
	combStroke,
	toolRadius,
} from './tool-actions.js';
import { obstacleControls } from './obstacle-controls.js';
import { mountToolDeck } from './tool-deck.js';
import { restoreSimulation } from './state.js';
import {
	MATERIALS,
	MAX_EXPERIMENT_BYTES,
	cleanSettings,
	clamp,
} from './simulation.js';
import { FluidRenderer } from './renderer.js';
import {
	acidity,
	SOURCE_TYPES,
	DEFAULT_INDICATOR_COLORS,
} from './influences.js';
import { EXPERIMENTS, createExperiment } from './experiments.js';
import { labT as t } from './i18n.js';
import { canRecordVideo, startRecorder } from '../engine.js';

const VIEWS = [
	{ id: 'top', label: 'Top view', angle: 0, yaw: 0 },
	{ id: 'perspective', label: 'Perspective', angle: 55, yaw: -25 },
	{ id: 'side', label: 'Side view', angle: 90, yaw: 0 },
	{ id: 'bottom', label: 'Bottom view', angle: 180, yaw: 0 },
];

const GEN_ID = 'wpie-marbling-studio/marbling';
// Detached canvases only: retaining a card would retain its entire old dialog.
const thumbnailCache = new Map();

const download = ( blob, name ) => {
	const url = URL.createObjectURL( blob ),
		a = document.createElement( 'a' );
	a.href = url;
	a.download = name;
	a.click();
	window.setTimeout( () => URL.revokeObjectURL( url ), 4000 );
};

export function openFluidLab( ctx, { draft, classic, onClassic, icons } ) {
	const boot = window.WPIE,
		{ bridge } = boot,
		{ ui } = bridge,
		{ editor } = ctx;
	const layer = ctx.layer?.generator?.id === GEN_ID ? ctx.layer : null;
	const doc = editor.state.doc || { w: 1600, h: 1200 };
	const aspect = clamp(
		( layer?.w || doc.w ) / ( layer?.h || doc.h ),
		0.5,
		2
	);
	let settings,
		sim,
		restoreError = false;
	try {
		if ( draft?.snapshot ) {
			sim = restoreSimulation( draft.snapshot );
			settings = cleanSettings( draft.settings );
		} else if ( draft?.settings ) {
			// A layer saved in the document carries the SETTINGS but not the
			// grid: the grid is megabytes and belongs in an experiment file,
			// not in every copy of the design (see insertLayer). Rebuild the
			// bath from the settings - the same bath, one run of the
			// simulation away, and the person keeps every value they set.
			( { sim } = createExperiment( 'islands', aspect ) );
			settings = cleanSettings( draft.settings );
		} else {
			( { sim, settings } = createExperiment( 'islands', aspect ) );
			settings.boundary = 'open';
		}
	} catch ( e ) {
		restoreError = true;
		( { sim, settings } = createExperiment( 'islands', aspect ) );
		settings.boundary = 'open';
	}
	let closed = false,
		paused = false; // Only graphics failure and the QA hook suspend evolution.
	let viewDirty = false;
	const viewSliders = new Map();
	let indicatorState = 'neutral';
	// Session-local preference: choosing a material always resumes applying it.
	let applyTool = APPLY_TOOLS.includes( settings.tool )
		? settings.tool
		: 'pipette';
	const indicatorButtons = new Map();
	let raf = 0,
		last = 0,
		accumulator = 0,
		dirty = true,
		gesture = null,
		selectedSource = 0,
		hoverPoint = null,
		thumbTimer = 0,
		thumbRenderer = null;
	let recording = false,
		recordAbort = false,
		colorMounts = [],
		statusTime = -1;
	let renderer,
		observer,
		activeRecorder,
		recordRaf = 0,
		recordTimer = 0;
	const toast = ctx.extras?.toasts || {
		error: ( message ) => window.console.error( message ),
	};
	const obstacles = obstacleControls( {
		ui,
		bridge,
		editor,
		color,
		icons,
		layer,
		toast,
		get sim() {
			return sim;
		},
		get settings() {
			return settings;
		},
		get renderer() {
			return renderer;
		},
		get closed() {
			return closed;
		},
		get recording() {
			return recording;
		},
		refresh: () => {
			renderControls();
			sync();
		},
		changed: () => {
			dirty = true;
		},
	} );
	const modal = ui.dialog( {
		title: 'Marble Bath',
		subtitle: t(
			'Experiment with liquids, stir the bath and catch the light.'
		),
		onClose: cleanup,
		closeOnBackdrop: true,
	} );
	modal.dialog.classList.add( 'wpiemb-dialog', 'wpiemb-lab-dialog' );
	ui.badge( modal.head );
	const body = ui.el( 'div', 'wpiemb-body', modal.body );
	const left = ui.el( 'div', 'wpiemb-left wpiemb-lab-left', body );
	const middle = ui.el( 'div', 'wpiemb-lab-middle', body );
	const view = ui.el( 'div', 'wpiemb-view wpiemb-lab-view', middle );
	const side = ui.el( 'div', 'wpiemb-side', body );
	const toolDeck = mountToolDeck( middle, {
		ui,
		icons,
		tooltipRoot: modal.backdrop.parentElement,
		onSelect: ( id ) => {
			if ( recording ) {
				return;
			}
			settings.tool =
				id === 'orbit' && settings.tool === 'orbit' ? applyTool : id;
			if ( id !== 'removeSource' ) {
				selectedSource = 0;
			}
			gesture = null;
			obstacles.activate( settings.tool );
			renderControls();
			sync();
		},
	} );
	const canvas = ui.el( 'canvas', 'wpiemb-lab-canvas', view );
	canvas.setAttribute( 'aria-label', t( 'Fluid bath' ) );
	obstacles.attach( view, canvas );
	const views = ui.el( 'div', 'wpiemb-lab-views', view );
	views.setAttribute( 'role', 'group' );
	views.setAttribute( 'aria-label', t( 'View' ) );
	const viewButtons = new Map();
	for ( const preset of VIEWS ) {
		const button = ui.el(
			'button',
			'dsm-viewbtn',
			views,
			t( preset.label )
		);
		button.type = 'button';
		button.dataset.view = preset.id;
		button.onclick = () => {
			if ( recording ) {
				return;
			}
			settings[ sim.kind === 'volume' ? 'volumeAngle' : 'angle' ] =
				preset.angle;
			settings.viewYaw = preset.yaw;
			settings.viewZoom = 1;
			viewDirty = true;
			if ( settings.tool === 'orbit' ) {
				settings.tool = applyTool;
				gesture = null;
				renderControls();
			}
			sync();
		};
		viewButtons.set( preset.id, button );
	}
	const rotateButton = ui.el( 'button', 'dsm-viewbtn', views, t( 'Rotate' ) );
	rotateButton.type = 'button';
	toolDeck.bindRotate( rotateButton );
	const cursor = ui.el( 'div', 'wpiemb-lab-cursor', view );
	const sourceOverlay = ui.el( 'div', 'wpiemb-lab-sources', view );
	sourceOverlay.setAttribute( 'aria-hidden', 'true' );
	const sourceMarkers = new Map();
	const hint = ui.el(
		'div',
		'dsm-viewhint wpiemb-hint',
		view,
		t( 'Hold to add liquid · drag to stir · capture a moment with PNG' )
	);
	const status = ui.el( 'div', 'dsm-hint wpiemb-status', modal.foot );
	status.setAttribute( 'aria-live', 'polite' );
	const foot = ui.el( 'div', 'wpiemb-footbtns', modal.foot );
	ui.btn( foot, { label: t( 'Cancel' ), onClick: close } );
	const insert = ui.btn( foot, {
		label: t( layer ? 'Update' : 'Insert' ),
		primary: true,
		onClick: insertLayer,
	} );
	const modes = ui.el( 'div', 'wpiemb-lab-modes', left );
	const classicButton = ui.btn( modes, {
		label: t( 'Classic' ),
		onClick: () => {
			if ( recording ) {
				return;
			}
			const state = save();
			close();
			onClassic( state );
		},
	} );
	classicButton.dataset.mode = 'classic';
	const labButton = ui.btn( modes, {
		label: t( 'Fluid Lab' ),
		primary: true,
	} );
	labButton.setAttribute( 'aria-pressed', 'true' );
	const libraryScroll = ui.el( 'div', 'wpiemb-lab-scroll', left );
	const materials = ui.section( libraryScroll, {
		title: t( 'Liquids' ),
		icon: icons.drop,
	} );
	let materialTab = MATERIALS.find( ( m ) => m.id === settings.material )
		?.reagent
		? 'chemistry'
		: 'liquids';
	const tabs = ui.el( 'div', 'dsm-seg wpiemb-lab-palettes', materials );
	tabs.setAttribute( 'role', 'group' );
	tabs.setAttribute( 'aria-label', t( 'Liquids' ) );
	const paletteButtons = new Map();
	for ( const [ id, label ] of [
		[ 'liquids', 'Liquids' ],
		[ 'chemistry', 'Chemistry' ],
	] ) {
		const button = ui.el( 'button', '', tabs, t( label ) );
		button.type = 'button';
		button.onclick = () => {
			materialTab = id;
			sync();
		};
		button.dataset.fluidPalette = id;
		paletteButtons.set( id, button );
	}
	const materialGrid = ui.el( 'div', 'wpiemb-lab-materials', materials );
	const materialButtons = new Map();
	for ( const material of [
		...MATERIALS.filter( ( m ) => ! m.reagent ),
		...MATERIALS.filter( ( m ) => m.reagent ),
	] ) {
		const button = ui.el(
			'button',
			'dsm-pick wpiemb-lab-material',
			materialGrid
		);
		button.type = 'button';
		button.dataset.material = material.id;
		const swatch = ui.el( 'span', 'wpiemb-lab-drop', button );
		swatch.style.setProperty(
			'--fluid-color',
			settings.colors[ material.id ]
		);
		ui.el( 'span', '', button, t( material.label ) );
		button.onclick = () => {
			if ( recording ) {
				return;
			}
			settings.material = material.id;
			materialTab = material.reagent ? 'chemistry' : 'liquids';
			settings.tool = applyTool;
			selectedSource = 0;
			gesture = null;
			renderControls();
			sync();
		};
		materialButtons.set( material.id, button );
	}
	const experiments = ui.section( libraryScroll, {
		title: t( 'Experiments' ),
		icon: icons.cards,
	} );
	experiments.parentElement.classList.add( 'wpiemb-lab-library' );
	const experimentNote = ui.el(
		'div',
		'dsm-note wpiemb-lab-experiment-note',
		experiments
	);
	const variant = ui.btn( experiments, {
		label: t( 'New variation' ),
		onClick: () =>
			choose(
				settings.experiment,
				( settings.seed * 48271 ) % 999983 || 17
			),
	} );
	variant.classList.add( 'wpiemb-lab-variation' );
	const list = ui.el( 'div', 'wpiemb-lab-experiments', experiments );
	const cards = new Map(),
		thumbnails = [];
	for ( const recipe of EXPERIMENTS ) {
		const button = ui.el(
			'button',
			'dsm-pick wpiemb-lab-experiment',
			list
		);
		button.type = 'button';
		button.dataset.experiment = recipe.id;
		if ( recipe.description ) {
			button.title = t( recipe.description );
		}
		const thumb = ui.el( 'canvas', '', button );
		thumb.width = 160;
		thumb.height = 120;
		ui.el( 'span', '', button, t( recipe.label ) );
		button.onclick = () => choose( recipe.id, settings.seed );
		cards.set( recipe.id, button );
		if ( thumbnailCache.has( recipe.id ) ) {
			thumb
				.getContext( '2d' )
				.drawImage( thumbnailCache.get( recipe.id ), 0, 0 );
			thumb.dataset.ready = 'true';
		} else {
			thumbnails.push( { recipe, thumb } );
		}
	}

	function save() {
		return {
			settings: cleanSettings( settings ),
			snapshot: sim.snapshot(),
		};
	}
	function restore( state ) {
		sim = restoreSimulation( state.snapshot );
		settings = cleanSettings( state.settings );
		renderer.setSimulation( sim );
		dirty = true;
		accumulator = 0;
		gesture = null;
		selectedSource = 0;
		renderControls();
		sync();
	}
	function choose( id, seed ) {
		if ( recording || ! renderer ) {
			return;
		}
		const boundary = settings.boundary;
		( { sim, settings } = createExperiment( id, sim.aspect, seed ) );
		settings.boundary = boundary;
		materialTab = MATERIALS.find( ( m ) => m.id === settings.material )
			.reagent
			? 'chemistry'
			: 'liquids';
		renderer.setSimulation( sim );
		gesture = null;
		selectedSource = 0;
		dirty = true;
		insert.disabled = false;
		if ( restoreError ) {
			paused = false;
			restoreError = false;
		}
		renderControls();
		sync();
	}
	function syncSources() {
		obstacles.sync();
		sourceOverlay.hidden =
			! settings.showSources && settings.tool !== 'removeSource';
		for ( const [ id, marker ] of sourceMarkers ) {
			if ( ! sim.sources.some( ( source ) => source.id === id ) ) {
				marker.remove();
				sourceMarkers.delete( id );
			}
		}
		if ( ! renderer ) {
			return;
		}
		const canvasRect = canvas.getBoundingClientRect(),
			viewRect = view.getBoundingClientRect();
		for ( const source of sim.sources ) {
			let marker = sourceMarkers.get( source.id );
			if ( ! marker ) {
				marker = ui.el( 'span', 'wpiemb-lab-source', sourceOverlay );
				marker.dataset.source = source.id;
				sourceMarkers.set( source.id, marker );
			}
			// A different experiment can reuse an ID for another kind of source.
			if ( marker.dataset.kind !== source.type ) {
				marker.dataset.kind = source.type;
				marker.innerHTML = icons[ source.type ];
			}
			const point = renderer.projectSource( source.x, source.y );
			marker.style.left =
				point.x + canvasRect.left - viewRect.left + 'px';
			marker.style.top = point.y + canvasRect.top - viewRect.top + 'px';
			marker.hidden =
				point.x < 0 ||
				point.x > canvasRect.width ||
				point.y < 0 ||
				point.y > canvasRect.height;
			marker.classList.toggle(
				'is-selected',
				source.id === selectedSource
			);
		}
	}

	function syncViews() {
		const angle =
			settings[ sim.kind === 'volume' ? 'volumeAngle' : 'angle' ];
		for ( const preset of VIEWS ) {
			viewButtons
				.get( preset.id )
				.setAttribute(
					'aria-pressed',
					String(
						Math.abs( angle - preset.angle ) < 0.05 &&
							Math.abs( settings.viewYaw - preset.yaw ) < 0.05
					)
				);
		}
		for ( const [ key, control ] of viewSliders ) {
			control.set( settings[ key ] );
		}
	}
	function sync() {
		syncViews();
		const recipe = EXPERIMENTS.find(
			( item ) => item.id === settings.experiment
		);
		experimentNote.hidden = ! recipe?.description;
		experimentNote.textContent = recipe?.description
			? t( recipe.description )
			: '';
		for ( const [ id, button ] of paletteButtons ) {
			button.setAttribute( 'aria-pressed', String( id === materialTab ) );
		}
		const indicatorColors =
			settings.indicatorColors || DEFAULT_INDICATOR_COLORS;
		for ( const [ id, button ] of indicatorButtons ) {
			button.style.borderBottomColor = indicatorColors[ id ];
		}
		for ( const [ id, button ] of materialButtons ) {
			const material = MATERIALS.find( ( m ) => m.id === id );
			button.hidden =
				( material.volume && sim.kind !== 'volume' ) ||
				( material.reagent ? 'chemistry' : 'liquids' ) !== materialTab;
			button.setAttribute(
				'aria-pressed',
				String( id === settings.material )
			);
			button.firstElementChild.style.setProperty(
				'--fluid-color',
				id === 'indicator'
					? indicatorColors.neutral
					: settings.colors[ id ]
			);
		}
		for ( const [ id, button ] of cards ) {
			button.setAttribute(
				'aria-pressed',
				String( id === settings.experiment )
			);
		}
		statusTime = Math.floor( sim.time );
		status.textContent =
			t( 'Fluid Lab' ) +
			' · ' +
			t( MATERIALS.find( ( m ) => m.id === settings.material ).label );
		if ( hoverPoint ) {
			const x = Math.round( hoverPoint.x * ( sim.w - 1 ) ),
				y = Math.round( hoverPoint.y * ( sim.h - 1 ) );
			const i =
				sim.kind === 'volume'
					? sim.probe( hoverPoint.x, hoverPoint.y )
					: y * sim.w + x;
			status.textContent +=
				' · ' +
				( sim.temperature[ i ] ?? settings.ambientTemperature ).toFixed(
					1
				) +
				' °C';
			if ( sim.indicator[ i ] > 0.01 ) {
				const ph = acidity(
					sim.acid[ i ],
					sim.base[ i ],
					settings.bufferCapacity
				);
				status.textContent +=
					' · ' +
					t(
						ph < 6.5 ? 'Acidic' : ph > 7.5 ? 'Alkaline' : 'Neutral'
					);
			}
		}
		hint.textContent = t(
			settings.tool === 'orbit'
				? 'Drag to orbit · scroll to zoom · camera movement leaves the bath unchanged'
				: SOURCE_TYPES.includes( settings.tool )
				? 'Click to place a source · drag its handle to move it'
				: settings.tool === 'removeSource'
				? 'Click a source handle to remove it'
				: settings.tool === 'duplicate'
				? 'Click an obstacle to select it, then click empty space to place copies with the same shape, size, rotation and color.'
				: settings.tool === 'draw'
				? 'Drag to stamp the selected shape. Brush size controls the stamps.'
				: OBSTACLE_TOOLS.includes( settings.tool )
				? 'Select Obstacle to place or move forms. Remove obstacle deletes the form under the pointer.'
				: 'Hold to add liquid · drag to stir · capture a moment with PNG'
		);
		syncSources();
	}
	function slider( parent, label, key, min, max, step ) {
		const control = ui.slider( parent, {
			label: t( label ),
			value: settings[ key ],
			min,
			max,
			step,
			format: ( n ) => Number( n.toFixed( 2 ) ).toString(),
			onInput: ( value ) => {
				settings[ key ] = value;
				if ( viewSliders.has( key ) ) {
					viewDirty = true;
					syncViews();
					return;
				}
				const source = sim.sources.find(
					( item ) => item.id === selectedSource
				);
				const property = {
					sourceRadius: 'radius',
					sourcePower: 'power',
					magnetGap: 'gap',
				}[ key ];
				if ( source && property ) {
					source[ property ] = value;
				}
				dirty = true;
			},
		} );
		control.input.setAttribute( 'aria-label', t( label ) );
		if (
			[ 'angle', 'volumeAngle', 'viewYaw', 'viewZoom' ].includes( key )
		) {
			viewSliders.set( key, control );
		}
		control.input.dataset.setting = key;
	}
	function color( parent, label, value, change, wheel = false ) {
		const inline =
			wheel && typeof bridge.components.mountColorWheel === 'function';
		let target;
		if ( inline ) {
			const wrap = ui.el( 'div', 'wpiemb-pigment-control', parent );
			ui.el(
				'span',
				'',
				ui.el( 'div', 'dsm-sliderrow-head', wrap ),
				t( label )
			);
			target = ui.el( 'div', 'wpiemb-pigment-wheel', wrap );
		} else {
			target = ui.el( 'span', '', ui.row( parent, t( label ) ) );
		}
		const mount = bridge.components[
			inline ? 'mountColorWheel' : 'mountColorButton'
		]( target, {
			color: value,
			title: t( label ),
			onChange: ( v ) => {
				// Sechs Hexstellen, egal was der Waehler liefert. Der
				// Farbdialog des Kerns zeigt immer einen Alpha-Regler, und
				// unter 100 Prozent antwortet er mit acht Stellen. Der
				// Renderer liest die ersten sechs, die Vorschau sah also
				// richtig aus - cleanSettings() und mergeParams() pruefen
				// beim Laden aber /^#[0-9a-f]{6}$/ und fielen auf die
				// Werksfarbe zurueck. Fuer eine Bad- oder Pigmentfarbe hat
				// Alpha keine Bedeutung.
				const s = String( v || '' ).trim();
				change( /^#[0-9a-f]{8}$/i.test( s ) ? s.slice( 0, 7 ) : s );
				dirty = true;
				sync();
			},
		} );
		colorMounts.push( mount );
	}
	function renderControls() {
		viewSliders.clear();
		indicatorButtons.clear();
		if (
			sim.kind !== 'volume' &&
			( MATERIALS.find( ( m ) => m.id === settings.material )?.volume ||
				[ 'lift', 'drain' ].includes( settings.tool ) )
		) {
			settings.material = 'water';
			settings.tool = 'pipette';
		}
		sim.settings = settings;
		if ( renderer ) {
			renderer.settings = settings;
			renderer.viewControls?.configure();
		}
		materialTab = MATERIALS.find( ( m ) => m.id === settings.material )
			?.reagent
			? 'chemistry'
			: 'liquids';
		for ( const mount of colorMounts ) {
			mount?.unmount?.();
		}
		colorMounts = [];
		const scroll = side.scrollTop;
		side.textContent = '';
		if ( APPLY_TOOLS.includes( settings.tool ) ) {
			applyTool = settings.tool;
		}
		toolDeck.refresh( settings, sim.kind );
		if (
			! [ 'removeSource', 'orbit', 'wall', 'duplicate' ].includes(
				settings.tool
			)
		) {
			const options = ui.section( side, {
				title: t( 'Tool' ),
				icon: icons.tool,
			} );
			options.parentElement.classList.add( 'wpiemb-lab-tool-settings' );
			if ( [ 'heat', 'cool', 'magnet' ].includes( settings.tool ) ) {
				slider(
					options,
					'Source size',
					'sourceRadius',
					0.04,
					0.3,
					0.01
				);
				slider(
					options,
					'Source strength',
					'sourcePower',
					0.1,
					3,
					0.05
				);
			} else {
				slider( options, 'Brush size', 'radius', 0.012, 0.14, 0.002 );
				if ( APPLY_TOOLS.includes( settings.tool ) ) {
					slider( options, 'Flow rate', 'amount', 0.1, 1, 0.05 );
				} else if (
					[ 'stir', 'air', 'vortex', 'comb', 'lift' ].includes(
						settings.tool
					)
				) {
					slider( options, 'Force', 'force', 0.1, 2, 0.05 );
				}
			}
			if ( settings.tool === 'spray' ) {
				slider(
					options,
					'Spray spread',
					'spraySpread',
					0.04,
					0.3,
					0.01
				);
			}
			if ( settings.tool === 'ring' ) {
				slider( options, 'Ring radius', 'ringRadius', 0.05, 0.3, 0.01 );
			}
			if ( settings.tool === 'comb' ) {
				slider( options, 'Tines', 'combTeeth', 2, 12, 1 );
				slider(
					options,
					'Tine spacing',
					'combSpacing',
					0.025,
					0.1,
					0.005
				);
			}
		}
		obstacles.render( side );
		if ( SOURCE_TYPES.includes( settings.tool ) || sim.sources.length ) {
			const sources = ui.section( side, {
				title: t( 'Sources' ),
				icon: icons.magnet,
			} );
			const labels = {
				heat: 'Heat source',
				cool: 'Cold source',
				magnet: 'Magnet',
			};
			const selection = ui.select(
				ui.row( sources, t( 'Selected source' ) ),
				{
					options: [
						{ value: '0', label: t( 'New source' ) },
						...sim.sources.map( ( source ) => ( {
							value: String( source.id ),
							label: t( labels[ source.type ] ) + ' ' + source.id,
						} ) ),
					],
					value: String( selectedSource ),
					onChange: ( value ) => {
						selectedSource = Number( value );
						const source = sim.sources.find(
							( item ) => item.id === selectedSource
						);
						if ( source ) {
							if ( settings.tool !== 'removeSource' ) {
								settings.tool = source.type;
							}
							settings.sourceRadius = source.radius;
							settings.sourcePower = source.power;
							settings.magnetGap = source.gap;
						}
						renderControls();
						sync();
					},
				}
			);
			selection.dataset.setting = 'selectedSource';
			if ( SOURCE_TYPES.includes( settings.tool ) ) {
				if ( settings.tool === 'magnet' ) {
					slider(
						sources,
						'Magnet distance',
						'magnetGap',
						0.04,
						0.5,
						0.01
					);
				}
				ui.el(
					'div',
					'dsm-note',
					sources,
					t(
						'Sources stay active after release. Select a handle to adjust or move it.'
					)
				);
			}
			ui.check( sources, {
				label: t( 'Show source handles' ),
				checked: settings.showSources,
				onChange: ( value ) => {
					settings.showSources = value;
					syncSources();
				},
			} );
			if ( selectedSource ) {
				ui.btn( sources, {
					label: t( 'Remove selected source' ),
					onClick: () => {
						sim.removeSource( selectedSource );
						dirty = true;
						selectedSource = 0;
						renderControls();
						sync();
					},
				} ).dataset.action = 'removeSource';
			}
		}
		const liquid = ui.section( side, {
			title: t(
				MATERIALS.find( ( m ) => m.id === settings.material ).label
			),
			icon: icons.ink,
		} );
		const selected = MATERIALS.find( ( m ) => m.id === settings.material );
		ui.el(
			'div',
			'dsm-note wpiemb-liquid-intro',
			liquid,
			t( selected.description )
		);
		if ( ! selected.reagent ) {
			color(
				liquid,
				'Pigment color',
				settings.colors[ settings.material ],
				( value ) => {
					settings.colors[ settings.material ] = value;
				},
				true
			);
		}
		if ( selected.id === 'indicator' ) {
			const states = ui.el(
				'div',
				'wpiemb-lab-palettes wpiemb-indicator-states',
				liquid
			);
			states.setAttribute( 'role', 'group' );
			states.setAttribute( 'aria-label', t( 'Indicator colors' ) );
			for ( const [ id, label ] of [
				[ 'acid', 'Acidic' ],
				[ 'neutral', 'Neutral' ],
				[ 'base', 'Alkaline' ],
			] ) {
				const button = ui.btn( states, {
					label: t( label ),
					onClick: () => {
						indicatorState = id;
						renderControls();
						sync();
						indicatorButtons.get( id )?.focus();
					},
				} );
				button.dataset.indicatorState = id;
				button.setAttribute(
					'aria-pressed',
					String( id === indicatorState )
				);
				indicatorButtons.set( id, button );
			}
			color(
				liquid,
				'Indicator color',
				( settings.indicatorColors || DEFAULT_INDICATOR_COLORS )[
					indicatorState
				],
				( value ) => {
					settings.indicatorColors = {
						...( settings.indicatorColors ||
							DEFAULT_INDICATOR_COLORS ),
						[ indicatorState ]: value,
					};
				},
				true
			);
			ui.el(
				'div',
				'dsm-note',
				liquid,
				t(
					'Choose the acidic, neutral and alkaline colors. The palette applies to all indicator ink in the bath; acidity controls the transition.'
				)
			);
			ui.btn( liquid, {
				label: t( 'Reset indicator colors' ),
				onClick: () => {
					settings.indicatorColors = null;
					dirty = true;
					renderControls();
					sync();
				},
			} ).dataset.action = 'resetIndicatorColors';
		}
		if ( sim.kind === 'volume' && ! selected.additive ) {
			const density = ui.slider( liquid, {
				label: t( 'Relative density' ),
				min: 0.5,
				max: 8,
				step: 0.05,
				value: settings.densities[ selected.id ],
				format: ( v ) => v.toFixed( 2 ),
				onInput: ( value ) => {
					settings.densities[ selected.id ] = value;
				},
			} );
			density.input.setAttribute( 'aria-label', t( 'Relative density' ) );
		}
		if ( ! selected.additive ) {
			const viscosity = ui.slider( liquid, {
				label: t( 'Viscosity' ),
				min: 0.02,
				max: 30,
				step: 0.02,
				value: settings.viscosities[ settings.material ],
				format: ( value ) => value.toFixed( 2 ),
				onInput: ( value ) => {
					settings.viscosities[ settings.material ] = value;
				},
			} );
			viscosity.input.setAttribute( 'aria-label', t( 'Viscosity' ) );
			ui.el(
				'div',
				'dsm-note',
				liquid,
				t(
					'Color applies to new drops. Viscosity affects this liquid throughout the bath.'
				)
			);
		}
		if ( selected.id === 'wax' ) {
			slider(
				liquid,
				'Pour temperature (°C)',
				'waxPourTemperature',
				20,
				90,
				1
			);
			slider(
				liquid,
				'Melting point (°C)',
				'waxMeltingPoint',
				35,
				75,
				1
			);
		}
		if ( selected.volume ) {
			slider(
				liquid,
				'Reagent concentration',
				'reagentStrength',
				0.1,
				2,
				0.05
			);
		} else if ( selected.reagent ) {
			slider(
				liquid,
				'Reagent concentration',
				'reagentStrength',
				0.1,
				2,
				0.05
			);
			slider( liquid, 'Buffer capacity', 'bufferCapacity', 0, 1, 0.05 );
			ui.el(
				'div',
				'dsm-note',
				liquid,
				t(
					'Acid and base are clear and neutralize each other. Indicator ink reveals acidity using the palette selected under Indicator ink.'
				)
			);
		} else if ( selected.id === 'metal' ) {
			slider( liquid, 'Cohesion', 'metalTension', 0.2, 4, 0.05 );
			ui.el(
				'div',
				'dsm-note',
				liquid,
				t(
					'Reflective beads stay separate from water and oil. Stir to stretch them into veins.'
				)
			);
		} else if ( selected.id === 'alcohol' ) {
			slider(
				liquid,
				'Spreading strength',
				'alcoholStrength',
				0,
				2,
				0.05
			);
			slider( liquid, 'Evaporation', 'evaporation', 0, 0.6, 0.02 );
			ui.el(
				'div',
				'dsm-note',
				liquid,
				t(
					'Add to a colored area to push the surface outward. The alcohol fades; its dye remains in the water.'
				)
			);
		} else if ( selected.id === 'surfactant' ) {
			slider(
				liquid,
				'Spreading strength',
				'surfactantStrength',
				0,
				2,
				0.05
			);
			ui.el(
				'div',
				'dsm-note',
				liquid,
				t(
					'Lowers local surface tension and opens paths through oil. The additive remains active as it spreads.'
				)
			);
		}

		const bath = ui.section( side, {
			title: t( 'Bath' ),
			icon: icons.water,
		} );
		const boundary = ui.select( ui.row( bath, t( 'Edges' ) ), {
			value: settings.boundary,
			options: [
				{ value: 'open', label: t( 'Open edges' ) },
				{ value: 'closed', label: t( 'Closed edges' ) },
			],
			onChange: ( value ) => {
				settings.boundary = value;
				// The camera follows the chosen artwork framing. Reset zoom so
				// returning from an inspected close-up gives a complete document crop.
				settings.viewZoom = 1;
				dirty = true;
				syncViews();
			},
		} );
		boundary.setAttribute( 'aria-label', t( 'Edges' ) );
		boundary.dataset.setting = 'boundary';
		ui.el(
			'div',
			'dsm-note',
			bath,
			t(
				'Open edges let liquid flow out of the artwork. The wet surface fills the document without a basin border.'
			)
		);
		if ( sim.kind === 'volume' ) {
			slider( bath, 'Injection depth', 'injectionDepth', 0, 1, 0.02 );
			slider( bath, 'Drop height', 'dropHeight', 0, 0.5, 0.01 );
			slider( bath, 'Gravity', 'gravity', 0, 4, 0.05 );
			slider( bath, 'Tilt left / right', 'tiltX', -35, 35, 1 );
			slider( bath, 'Tilt front / back', 'tiltY', -35, 35, 1 );
			slider( bath, 'Crystal growth', 'crystalRate', 0, 4, 0.05 );
			slider( bath, 'Reaction rate', 'reactionRate', 0, 3, 0.05 );
			ui.el(
				'div',
				'dsm-note',
				bath,
				t(
					'Use Drain to make room for more liquid. Injection depth reaches below the surface; drop height adds a falling stream.'
				)
			);
		}
		slider( bath, 'Surface tension', 'tension', 0, 2, 0.05 );
		slider( bath, 'Ink diffusion', 'diffusion', 0, 1, 0.02 );
		slider( bath, 'Oil color mixing', 'oilDiffusion', 0, 1, 0.02 );
		slider(
			bath,
			'Ambient temperature (°C)',
			'ambientTemperature',
			0,
			80,
			1
		);
		ui.el(
			'div',
			'dsm-note',
			bath,
			t(
				'Warmth lowers viscosity and speeds mixing and alcohol evaporation. Temperature differences also move the surface.'
			)
		);
		color( bath, 'Bath color', settings.bath, ( value ) => {
			settings.bath = value;
		} );
		const surface = ui.section( side, {
			title: t( 'Surface' ),
			icon: icons.eye,
		} );
		if ( sim.kind !== 'volume' ) {
			slider( surface, 'Relief', 'depth', 0.15, 1.5, 0.05 );
		}
		slider( surface, 'Gloss', 'gloss', 0, 1, 0.02 );
		slider( surface, 'Fluorescence', 'fluorescence', 0, 1, 0.02 );
		ui.el(
			'div',
			'dsm-note',
			surface,
			t(
				'Colored glow for all liquids in Wet surface. Choose a bright pigment and lower Light to make it stand out.'
			)
		);
		slider( surface, 'Transparency', 'transparency', 0, 1, 0.02 );
		slider( surface, 'Oil iridescence', 'iridescence', 0, 1, 0.02 );
		slider( surface, 'Light', 'light', 0.2, 2, 0.05 );
		const camera = ui.section( side, {
			title: t( 'View' ),
			icon: icons.eye,
		} );
		slider(
			camera,
			'View angle',
			sim.kind === 'volume' ? 'volumeAngle' : 'angle',
			0,
			180,
			1
		);
		slider( camera, 'View rotation', 'viewYaw', -180, 180, 1 );
		slider( camera, 'Zoom', 'viewZoom', 0.45, 4, 0.05 );
		ui.btn( camera, {
			label: t( 'Reset view' ),
			onClick: () => {
				settings.angle = 12;
				settings.volumeAngle = 55;
				settings.viewYaw = 0;
				settings.viewZoom = 1;
				viewDirty = true;
				renderControls();
				sync();
			},
		} ).dataset.action = 'resetView';
		ui.el(
			'div',
			'dsm-note',
			camera,
			t(
				'Right-drag to orbit. Scroll to zoom. Rotate view also works with left-drag or touch. The camera does not move the liquid.'
			)
		);
		const output = ui.section( side, {
			title: t( 'Output' ),
			icon: icons.exportIc,
		} );
		const format = ui.select( ui.row( output, t( 'Appearance' ) ), {
			options: [
				{ value: 'wet', label: t( 'Wet surface' ) },
				{
					value: 'print',
					label: t(
						sim.kind === 'volume' ? 'Top view' : 'Paper print'
					),
				},
			],
			value: settings.output,
			onChange: ( value ) => {
				settings.output = value;
			},
		} );
		format.dataset.setting = 'output';
		ui.btn( output, {
			label: t( 'Download PNG' ),
			onClick: () => {
				if ( recording ) {
					return;
				}
				sync();
				renderer.update( settings );
				const size = outSize();
				const image = renderer.still( size.w, size.h, settings.output );
				image.toBlob( ( blob ) => {
					if ( blob ) {
						download( blob, 'marble-bath.png' );
					} else {
						toast.error( t( 'Could not export.' ) );
					}
				} );
			},
		} ).dataset.action = 'png';
		ui.btn( output, {
			label: t( 'Record 6 seconds' ),
			onClick: record,
		} ).dataset.action = 'record';
		ui.btn( output, {
			label: t( 'Save experiment' ),
			onClick: () => {
				sync();
				download(
					new Blob(
						[
							JSON.stringify( {
								type: 'wpie-fluid-lab',
								version: 1,
								...save(),
							} ),
						],
						{ type: 'application/json' }
					),
					'marble-bath-experiment.json'
				);
			},
		} ).dataset.action = 'save';
		const input = ui.el( 'input', 'wpiemb-lab-file', output );
		input.type = 'file';
		input.accept = '.json,application/json';
		input.hidden = true;
		input.onchange = async () => {
			const file = input.files?.[ 0 ];
			if ( ! file ) {
				return;
			}
			try {
				if ( file.size > MAX_EXPERIMENT_BYTES ) {
					throw new Error( 'size' );
				}
				const state = JSON.parse( await file.text() );
				if ( closed ) {
					return;
				}
				if ( state.type !== 'wpie-fluid-lab' || state.version !== 1 ) {
					throw new Error( 'type' );
				}
				restoreSimulation( state.snapshot );
				restore( state );
				sync();
			} catch ( e ) {
				if ( ! closed ) {
					toast.error( t( 'This experiment could not be opened.' ) );
				}
			}
		};
		ui.btn( output, {
			label: t( 'Open experiment' ),
			onClick: () => input.click(),
		} );
		side.scrollTop = scroll;
	}

	function outSize() {
		const ratio = ( layer?.w || doc.w ) / ( layer?.h || doc.h );
		return {
			w: ratio >= 1 ? 1600 : Math.max( 2, Math.round( 1600 * ratio ) ),
			h: ratio >= 1 ? Math.max( 2, Math.round( 1600 / ratio ) ) : 1600,
		};
	}
	function insertLayer() {
		if ( recording || ! renderer ) {
			return;
		}
		try {
			renderer.update( settings );
			// The DOCUMENT gets the settings, not the grid.
			//
			// save() carries `snapshot`, and that is the entire simulation
			// grid as base64: every field of every cell, four bytes each. The
			// package's own example file measures it - dist/qa-fluid-
			// experiment.json is 4.35 MB and 4.35 MB of that is one base64
			// string. Two or three such layers and a save runs into the 32 MB
			// ceiling of /designs and comes back 413, with the work
			// unsaveable. It is the shape EXTZUSTAND-02 described, only as a
			// raw grid instead of an image copy: the IMPORT has had a 12 MB
			// cap since then, the way INTO the document had none.
			//
			// The settings are what a person edits and they are small, so
			// reopening the layer rebuilds the bath from them. The exact grid
			// still travels through "Save experiment", which is a file the
			// person chooses to write.
			const state = save();
			delete state.snapshot;
			const { w, h } = outSize();
			const src = renderer
				.still( w, h, settings.output )
				.toDataURL( 'image/png' );
			const generator = {
				id: GEN_ID,
				params: { mode: 'fluid', lab: state, classic },
			};
			if ( layer ) {
				editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: { src, naturalW: w, naturalH: h, generator },
				} );
			} else {
				const image = bridge.documents.makeImage( {
					name: 'Marble Bath',
					x: 0,
					y: 0,
					w: doc.w,
					h: doc.h,
					src,
					naturalW: w,
					naturalH: h,
				} );
				image.generator = generator;
				editor.dispatch( { type: 'ADD_LAYER', layer: image } );
				editor.dispatch( { type: 'SET_ACTIVE', id: image.id } );
			}
			editor.commit(
				t( layer ? 'Update fluid bath' : 'Insert fluid bath' )
			);
			close();
		} catch ( e ) {
			toast.error( t( 'Could not insert.' ) );
		}
	}

	async function record() {
		if ( recording || ! renderer ) {
			return;
		}
		if ( ! canRecordVideo( bridge.video ) ) {
			toast.error(
				t( 'Video recording is unavailable in this browser.' )
			);
			return;
		}
		// Video and the editor preview share exactly the same renderer and solver.
		recording = true;
		body.inert = true;
		renderer.setViewEnabled( false );
		recordAbort = false;
		gesture = null;
		const controls = [
			...body.querySelectorAll( 'button,input,select' ),
			insert,
		];
		const disabled = controls.map( ( el ) => el.disabled );
		controls.forEach( ( el ) => {
			el.disabled = true;
		} );
		status.textContent = t( 'Recording…' );
		try {
			const { w, h } = outSize();
			const scale = Math.min( 1, 960 / Math.max( w, h ) );
			renderer.resize(
				Math.floor( ( w * scale ) / 2 ) * 2,
				Math.floor( ( h * scale ) / 2 ) * 2
			);
			renderer.update( settings );
			renderer.render();
			activeRecorder = startRecorder( canvas, {
				fps: 30,
				bitsPerSecond: 8000000,
				video: bridge.video,
			} );
			let previous = performance.now(),
				debt = 0;
			const step = ( now ) => {
				if ( closed || recordAbort ) {
					activeRecorder?.stop();
					return;
				}
				debt += Math.min( 0.1, ( now - previous ) / 1000 );
				previous = now;
				if ( debt >= 1 / 30 ) {
					sim.step( settings, 1 / 30 );
					debt = Math.min( 1 / 30, debt - 1 / 30 );
				}
				renderer.update( settings );
				renderer.render();
				recordRaf = window.requestAnimationFrame( step );
			};
			recordRaf = window.requestAnimationFrame( step );
			recordTimer = window.setTimeout(
				() => activeRecorder?.stop(),
				6000
			);
			const blob = await activeRecorder.blob;
			if ( ! closed && blob.size ) {
				download( blob, 'marble-bath.' + activeRecorder.extension );
			}
		} catch ( e ) {
			if ( ! closed ) {
				toast.error( t( 'Recording failed.' ) );
			}
		} finally {
			window.cancelAnimationFrame( recordRaf );
			window.clearTimeout( recordTimer );
			activeRecorder?.stop();
			activeRecorder = null;
			recording = false;
			body.inert = false;
			renderer?.setViewEnabled( true );
			if ( ! closed ) {
				last = 0;
				accumulator = 0;
				controls.forEach( ( el, i ) => {
					el.disabled = disabled[ i ];
				} );
				insert.disabled = false;
				fit();
				sync();
			}
		}
	}

	function applyHeld( dt ) {
		if ( ! gesture ) {
			return;
		}
		const { x, y } = gesture.at,
			tool = settings.tool;
		if ( tool === 'pipette' || tool === 'pour' ) {
			gesture.poured = ( gesture.poured || 0 ) + dt * settings.amount;
			const spread = Math.sqrt(
				1 + gesture.poured * ( tool === 'pour' ? 1.8 : 0.65 )
			);
			sim.drop(
				x,
				y,
				Math.min(
					0.28,
					settings.radius * spread * ( tool === 'pour' ? 1.25 : 1 )
				),
				settings.material,
				settings.colors[ settings.material ],
				settings.amount * dt * ( tool === 'pour' ? 6 : 2.5 ),
				settings.reagentStrength,
				settings.waxPourTemperature
			);
		}
		if ( tool === 'spray' || tool === 'ring' ) {
			holdPattern( sim, settings, gesture, dt );
		}
		if ( tool === 'lift' && sim.kind === 'volume' ) {
			sim.impulse(
				x,
				y,
				settings.radius * 3,
				0,
				0,
				0,
				dt * settings.force * 10
			);
		}
		if ( tool === 'drain' && sim.kind === 'volume' ) {
			sim.drain( x, y, settings.radius * 2, dt * settings.amount * 120 );
		}
		if ( tool === 'vortex' ) {
			sim.impulse(
				x,
				y,
				settings.radius * 3,
				0,
				0,
				settings.force * dt * 65
			);
		}
		if ( tool === 'air' ) {
			sim.impulse(
				x,
				y,
				settings.radius * 3,
				( gesture.dx || 0.6 ) * dt * settings.force * 30,
				( gesture.dy || -0.25 ) * dt * settings.force * 30
			);
		}
		dirty = true;
	}
	canvas.onpointerdown = ( event ) => {
		if (
			recording ||
			settings.tool === 'orbit' ||
			event.button !== 0 ||
			! event.isPrimary
		) {
			return;
		}
		const sourceTool =
			SOURCE_TYPES.includes( settings.tool ) ||
			settings.tool === 'removeSource';
		const hitSource = sourceTool
			? renderer.pickSource( event.clientX, event.clientY )
			: null;
		const point = hitSource
			? { x: hitSource.x, y: hitSource.y }
			: sourceTool
			? renderer.sourcePoint( event.clientX, event.clientY )
			: OBSTACLE_TOOLS.includes( settings.tool )
			? obstacles.point( event )
			: renderer.point( event.clientX, event.clientY );
		if ( ! point ) {
			return;
		}
		gesture = { at: point, dx: 0, dy: 0, id: event.pointerId };
		canvas.setPointerCapture( event.pointerId );
		if ( SOURCE_TYPES.includes( settings.tool ) ) {
			const source =
				hitSource ||
				sim.sourceAt( point.x, point.y ) ||
				sim.addSource( settings.tool, point.x, point.y, settings );
			if ( ! source ) {
				gesture = null;
				toast.error( t( 'Remove a source before adding another.' ) );
				return;
			}
			selectedSource = source.id;
			gesture.sourceId = source.id;
			settings.tool = source.type;
			settings.sourceRadius = source.radius;
			settings.sourcePower = source.power;
			settings.magnetGap = source.gap;
			renderControls();
			sync();
			return;
		}
		if ( settings.tool === 'removeSource' ) {
			const source = hitSource || sim.sourceAt( point.x, point.y );
			if ( source ) {
				sim.removeSource( source.id );
				dirty = true;
			}
			selectedSource = 0;
			gesture = null;
			renderControls();
			sync();
			return;
		}
		if ( [ 'pipette', 'pour' ].includes( settings.tool ) ) {
			sim.drop(
				point.x,
				point.y,
				settings.radius,
				settings.material,
				settings.colors[ settings.material ],
				settings.amount,
				settings.reagentStrength,
				settings.waxPourTemperature
			);
		}
		if ( settings.tool === 'spray' || settings.tool === 'ring' ) {
			applyPattern( sim, settings, point, settings.amount );
		}
		if ( OBSTACLE_TOOLS.includes( settings.tool ) ) {
			obstacles.down( point );
		}
		dirty = true;
		sync();
	};
	canvas.onpointermove = ( event ) => {
		if ( settings.tool === 'orbit' || event.buttons & 2 ) {
			cursor.style.display = 'none';
			hoverPoint = null;
			return;
		}
		const sourceTool =
			SOURCE_TYPES.includes( settings.tool ) ||
			settings.tool === 'removeSource';
		const point = sourceTool
			? renderer?.sourcePoint( event.clientX, event.clientY )
			: OBSTACLE_TOOLS.includes( settings.tool )
			? obstacles.point( event, true )
			: renderer?.point( event.clientX, event.clientY );
		hoverPoint = point;
		cursor.style.display = point ? 'block' : 'none';
		const rect = view.getBoundingClientRect();
		cursor.style.left = event.clientX - rect.left + 'px';
		cursor.style.top = event.clientY - rect.top + 'px';
		const size = toolRadius( settings ) * canvas.clientHeight * 1.8;
		cursor.style.width = cursor.style.height = size + 'px';
		if ( ! gesture || ! point || event.pointerId !== gesture.id ) {
			return;
		}
		if ( OBSTACLE_TOOLS.includes( settings.tool ) ) {
			obstacles.move( point );
			gesture.at = point;
			return;
		}
		if ( gesture.sourceId ) {
			const source = sim.sources.find(
				( item ) => item.id === gesture.sourceId
			);
			if ( source ) {
				source.x = point.x;
				source.y = point.y;
			}
			gesture.at = point;
			dirty = true;
			syncSources();
			return;
		}
		const dx = point.x - gesture.at.x,
			dy = point.y - gesture.at.y;
		gesture.dx = clamp( dx * 120, -1, 1 );
		gesture.dy = clamp( dy * 120, -1, 1 );
		if ( settings.tool === 'comb' ) {
			combStroke( sim, settings, gesture.at, point );
		}
		const distance = Math.hypot( dx * sim.aspect, dy );
		const count = Math.min(
			24,
			Math.max( 1, Math.ceil( distance / ( settings.radius * 0.5 ) ) )
		);
		for ( let i = 1; i <= count; i++ ) {
			const x = gesture.at.x + ( dx * i ) / count,
				y = gesture.at.y + ( dy * i ) / count;
			if ( settings.tool === 'stir' ) {
				sim.impulse(
					x,
					y,
					settings.radius * 2.5,
					( dx * sim.w * settings.force * 6 ) / count,
					( dy * sim.h * settings.force * 6 ) / count
				);
			}
			if ( [ 'pipette', 'pour' ].includes( settings.tool ) ) {
				sim.drop(
					x,
					y,
					settings.radius,
					settings.material,
					settings.colors[ settings.material ],
					settings.amount * 0.16,
					settings.reagentStrength,
					settings.waxPourTemperature
				);
			}
		}
		if ( distance > settings.radius * 0.3 ) {
			gesture.poured = 0;
		}
		gesture.at = point;
		dirty = true;
	};
	const end = () => {
		obstacles.end();
		gesture = null;
	};
	canvas.onpointerup = end;
	canvas.onpointercancel = end;
	canvas.onlostpointercapture = end;
	canvas.onpointerleave = () => {
		cursor.style.display = 'none';
		hoverPoint = null;
	};
	canvas.addEventListener( 'webglcontextlost', ( event ) => {
		event.preventDefault();
		if ( ! closed ) {
			paused = true;
			status.textContent = t(
				'Graphics interrupted. Save the experiment and reopen it.'
			);
		}
	} );
	const blur = () => {
		obstacles.end();
		gesture = null;
		last = 0;
		accumulator = 0;
	};
	window.addEventListener( 'blur', blur );
	document.addEventListener( 'visibilitychange', blur );
	function fit() {
		if ( renderer && ! recording ) {
			const r = view.getBoundingClientRect();
			const scale = Math.min( 2, window.devicePixelRatio || 1 );
			const ratio = ( layer?.w || doc.w ) / ( layer?.h || doc.h );
			const width = Math.min( r.width, r.height * ratio ),
				height = width / ratio;
			canvas.style.width = width + 'px';
			canvas.style.height = height + 'px';
			renderer.resize( width * scale, height * scale );
			dirty = true;
		}
	}
	function frame( now ) {
		if ( closed ) {
			return;
		}
		raf = window.requestAnimationFrame( frame );
		const dt = last ? Math.min( ( now - last ) / 1000, 0.05 ) : 0;
		last = now;
		if ( document.hidden || recording || ! renderer ) {
			return;
		}
		applyHeld( dt );
		if ( ! paused ) {
			accumulator += dt;
			if ( accumulator >= 1 / 30 ) {
				sim.step( settings, 1 / 30 );
				accumulator = Math.min( 1 / 30, accumulator - 1 / 30 );
				dirty = true;
			}
		}
		if ( dirty || viewDirty ) {
			if ( dirty ) {
				renderer.update( settings );
			} else {
				renderer.frame();
			}
			viewDirty = false;
			renderer.render();
			dirty = false;
			syncSources();
		}
		if ( Math.floor( sim.time ) !== statusTime ) {
			sync();
		}
	}
	function cleanup() {
		if ( closed ) {
			return;
		}
		closed = true;
		toolDeck.dispose();
		recordAbort = true;
		window.cancelAnimationFrame( recordRaf );
		window.clearTimeout( recordTimer );
		activeRecorder?.stop();
		window.cancelAnimationFrame( raf );
		window.clearTimeout( thumbTimer );
		observer?.disconnect();
		window.removeEventListener( 'blur', blur );
		document.removeEventListener( 'visibilitychange', blur );
		for ( const mount of colorMounts ) {
			mount?.unmount?.();
		}
		thumbRenderer?.dispose();
		thumbRenderer = null;
		renderer?.dispose();
		if ( window.__wpieFluidLab?.canvas === canvas ) {
			delete window.__wpieFluidLab;
		}
	}
	function close() {
		cleanup();
		modal.close();
	}
	try {
		renderer = new FluidRenderer( canvas, { interactive: true } );
		renderer.onViewChange = () => {
			viewDirty = true;
			syncViews();
			syncSources();
		};
		renderer.setSimulation( sim );
		renderControls();
		observer = new ResizeObserver( fit );
		observer.observe( view );
		fit();
		sync();
		raf = window.requestAnimationFrame( frame );
		// Cards use the very same simulation and optical renderer. Only one
		// temporary thumbnail context exists, and is disposed when finished.
		let index = 0;
		const nextThumb = () => {
			if ( closed || index >= thumbnails.length ) {
				thumbRenderer?.dispose();
				thumbRenderer = null;
				return;
			}
			if ( recording ) {
				thumbTimer = window.setTimeout( nextThumb, 200 );
				return;
			}
			try {
				if ( ! thumbRenderer ) {
					thumbRenderer = new FluidRenderer(
						document.createElement( 'canvas' )
					);
					thumbRenderer.resize( 160, 120 );
				}
				const { recipe, thumb } = thumbnails[ index++ ];
				const item = createExperiment( recipe.id, 4 / 3, 17, 56 );
				thumbRenderer.setSimulation( item.sim );
				thumbRenderer.update( item.settings );
				thumbRenderer.render();
				thumb
					.getContext( '2d' )
					.drawImage( thumbRenderer.canvas, 0, 0 );
				thumb.dataset.ready = 'true';
				const cached = document.createElement( 'canvas' );
				cached.width = 160;
				cached.height = 120;
				cached.getContext( '2d' ).drawImage( thumb, 0, 0 );
				thumbnailCache.set( recipe.id, cached );
				thumbTimer = window.setTimeout( nextThumb, 60 );
			} catch ( e ) {
				thumbRenderer?.dispose();
				thumbRenderer = null;
			}
		};
		thumbTimer = window.setTimeout( nextThumb, 250 );
		if ( restoreError ) {
			paused = true;
			insert.disabled = true;
			toast.error( t( 'This experiment could not be opened.' ) );
		}
		if ( window.__wpieQA ) {
			window.__wpieFluidLab = {
				canvas,
				get sim() {
					return sim;
				},
				get settings() {
					return settings;
				},
				renderer,
				save,
				restore,
				choose,
				pause: ( value = true ) => {
					paused = value;
					sync();
				},
				get paused() {
					return paused;
				},
				close,
			};
		}
	} catch ( e ) {
		paused = true;
		insert.disabled = true;
		status.textContent = t(
			'Fluid Lab needs WebGL2. Classic marbling is still available.'
		);
		canvas.style.display = 'none';
	}
}
