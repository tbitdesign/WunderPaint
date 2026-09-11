import { OBSTACLE_TOOLS } from './tool-actions.js';
import { OBSTACLE_SHAPES, bounded } from './obstacle-shapes.js';
import { importObstacleLayer } from './obstacle-import.js';
import { labT as t } from './i18n.js';
const LABELS = {
	circle: 'Circle',
	heart: 'Heart',
	star: 'Star',
	pebble: 'Pebble',
	ring: 'Ring',
};
export function obstacleControls( host ) {
	const { ui, bridge, editor, color, refresh, changed, toast } = host;
	let selected = 0,
		model = null,
		loading = false,
		stamp = null,
		drag = null;
	let marker, preview, canvas;
	const current = () => host.sim.customObstacles;
	const reset = () => {
		selected = 0;
		stamp = null;
		drag = null;
		model = current();
	};
	const item = () => current().items.find( ( o ) => o.id === selected );
	const select = ( o ) => {
		selected = o?.id || 0;
		if ( o ) {
			Object.assign( host.settings, {
				obstacleShape: o.shape,
				obstacleColor: o.color,
				obstacleSize: o.size,
				obstacleAngle: o.angle,
			} );
		}
	};
	function error( e ) {
		toast.error( t( e.message ) );
	}
	function add( point ) {
		const p = host.settings;
		const o = current().add( {
			shape: p.obstacleShape,
			x: point.x,
			y: point.y,
			size: p.obstacleMode === 'paint' ? p.radius * 2 : p.obstacleSize,
			angle: p.obstacleAngle,
			color: p.obstacleColor,
		} );
		if ( ! o ) {
			toast.error( t( 'Remove an obstacle before adding another.' ) );
		}
		return o;
	}
	function erase( point ) {
		const sim = host.sim,
			m = current(),
			o = m.at( point.x, point.y );
		if ( o ) {
			m.remove( o.id );
			if ( selected === o.id ) {
				selected = 0;
			}
		} else if ( sim.wall && m.baseWall ) {
			const combined = sim.wall;
			sim.wall = m.baseWall;
			try {
				sim.obstacle( point.x, point.y, host.settings.radius, true );
			} finally {
				sim.wall = combined;
			}
			m.rebuild();
		} else {
			sim.obstacle( point.x, point.y, host.settings.radius, true );
		}
		changed();
	}
	return {
		attach( view, element ) {
			preview = view;
			canvas = element;
			marker = ui.el( 'span', 'wpiemb-obstacle-selection', view );
			marker.setAttribute( 'aria-hidden', 'true' );
			marker.hidden = true;
		},
		sync() {
			if ( ! marker ) {
				return;
			}
			const o = item();
			marker.hidden =
				! o ||
				! OBSTACLE_TOOLS.includes( host.settings.tool ) ||
				host.recording;
			if ( marker.hidden || ! host.renderer ) {
				return;
			}
			const p = host.renderer.projectPoint(
					o.x,
					o.y,
					host.sim.kind === 'volume' ? 0.652 : 0.05
				),
				a = canvas.getBoundingClientRect(),
				b = preview.getBoundingClientRect();
			marker.style.left = p.x + a.left - b.left + 'px';
			marker.style.top = p.y + a.top - b.top + 'px';
		},
		reset,
		activate( tool ) {
			drag = null;
			stamp = null;
			if ( tool === 'draw' ) {
				selected = 0;
			}
			if ( OBSTACLE_TOOLS.includes( tool ) ) {
				host.settings.obstacleMode =
					tool === 'draw' ? 'paint' : 'place';
			}
		},
		point( event, moving = false ) {
			const r = host.renderer;
			if ( host.sim.kind !== 'volume' ) {
				return r.point( event.clientX, event.clientY );
			}
			if ( moving && drag ) {
				return r.point( event.clientX, event.clientY, 0.65 );
			}
			const top = r.point( event.clientX, event.clientY, 0.65 );
			return top && current().at( top.x, top.y )
				? top
				: r.point( event.clientX, event.clientY, 0 );
		},
		down( point ) {
			if ( model !== current() ) {
				reset();
			}
			try {
				if ( host.settings.tool === 'erase' ) {
					erase( point );
					refresh();
					return;
				}
				const p = host.settings;
				if ( p.tool === 'duplicate' ) {
					const hit = current().at( point.x, point.y );
					if ( hit ) {
						select( hit );
					} else if ( item() ) {
						const copy = current().add( {
							...item(),
							x: point.x,
							y: point.y,
						} );
						if ( ! copy ) {
							toast.error(
								t( 'Remove an obstacle before adding another.' )
							);
						} else {
							changed();
						}
					} else {
						toast.error( t( 'Choose an obstacle to copy.' ) );
					}
					refresh();
					return;
				}
				if ( p.tool === 'draw' ) {
					add( point );
					stamp = point;
					changed();
					return;
				}
				const hit = current().at( point.x, point.y ),
					o = hit || add( point );
				select( o );
				drag = o ? { x: o.x - point.x, y: o.y - point.y } : null;
				changed();
				refresh();
			} catch ( e ) {
				error( e );
			}
		},
		move( point ) {
			if ( host.settings.tool === 'duplicate' ) {
				return;
			}
			try {
				if ( host.settings.tool === 'erase' ) {
					erase( point );
					return;
				}
				if ( host.settings.tool === 'draw' ) {
					const step = host.settings.radius * 0.65;
					if ( ! stamp ) {
						stamp = point;
						return;
					}
					const dx = point.x - stamp.x,
						dy = point.y - stamp.y,
						d = Math.hypot( dx * host.sim.aspect, dy );
					if ( d < step ) {
						return;
					}
					const n = Math.min( 16, Math.floor( d / step ) ),
						start = stamp;
					const p = host.settings;
					const stamps = Array.from( { length: n }, ( _, i ) => ( {
						shape: p.obstacleShape,
						x: start.x + ( dx * ( i + 1 ) ) / n,
						y: start.y + ( dy * ( i + 1 ) ) / n,
						size: p.radius * 2,
						angle: p.obstacleAngle,
						color: p.obstacleColor,
					} ) );
					if ( current().addMany( stamps ).length < n ) {
						toast.error(
							t( 'Remove an obstacle before adding another.' )
						);
					}

					stamp = point;
					changed();
					return;
				}
				if ( drag && item() ) {
					current().update( selected, {
						x: bounded( point.x + drag.x, 0, 1, 0.5 ),
						y: bounded( point.y + drag.y, 0, 1, 0.5 ),
					} );
					changed();
				}
			} catch ( e ) {
				error( e );
			}
		},
		end() {
			drag = null;
			stamp = null;
		},
		render( parent ) {
			if ( model !== current() ) {
				reset();
			}
			const p = host.settings,
				m = current();
			if (
				! OBSTACLE_SHAPES.includes( p.obstacleShape ) &&
				! m.assets.some( ( a ) => a.id === p.obstacleShape )
			) {
				p.obstacleShape = 'circle';
			}
			if ( ! OBSTACLE_TOOLS.includes( p.tool ) ) {
				return;
			}
			const box = ui.section( parent, {
				title: t( 'Obstacle shapes' ),
				icon: host.icons.comb,
			} );
			const choose = ( label, key, options, onChange ) => {
				const selectEl = ui.select( ui.row( box, t( label ) ), {
					options,
					value: p[ key ],
					onChange,
				} );
				selectEl.dataset.setting = key;
				selectEl.setAttribute( 'aria-label', t( label ) );
				return selectEl;
			};
			const selection = ui.select(
				ui.row( box, t( 'Selected obstacle' ) ),
				{
					options: [
						{
							value: '0',
							label: t(
								p.tool === 'duplicate'
									? 'Choose an obstacle to copy.'
									: 'New obstacle'
							),
						},
						...m.items.map( ( o ) => ( {
							value: String( o.id ),
							label:
								t( LABELS[ o.shape ] || 'Canvas layer' ) +
								' ' +
								o.id,
						} ) ),
					],
					value: String( selected ),
					onChange: ( v ) => {
						select( m.items.find( ( o ) => o.id === Number( v ) ) );
						p.obstacleMode = 'place';
						if ( p.tool !== 'duplicate' ) {
							p.tool = 'wall';
						}
						refresh();
					},
				}
			);
			selection.dataset.setting = 'selectedObstacle';
			selection.setAttribute( 'aria-label', t( 'Selected obstacle' ) );
			if ( p.tool === 'duplicate' ) {
				ui.el(
					'p',
					'wpiemb-note',
					box,
					t(
						'Click an obstacle to select it, then click empty space to place copies with the same shape, size, rotation and color.'
					)
				);
				return;
			}
			choose(
				'Obstacle shape',
				'obstacleShape',
				[
					...OBSTACLE_SHAPES.map( ( value ) => ( {
						value,
						label: t( LABELS[ value ] ),
					} ) ),
					...m.assets.map( ( a ) => ( {
						value: a.id,
						label: a.name,
					} ) ),
				],
				( v ) => {
					p.obstacleShape = v;
					if ( item() ) {
						m.update( selected, { shape: v } );
					}
					changed();
				}
			);
			const layers = ( editor.state.layers || [] ).filter(
				( l ) =>
					l.id !== host.layer?.id &&
					! [ 'adjustment', 'adjustment-layer' ].includes( l.type )
			);
			if ( layers.length && bridge.raster?.renderToCanvas ) {
				let layerId =
					layers.find( ( l ) => l.id === editor.state.activeId )
						?.id || layers[ layers.length - 1 ].id;
				const picker = ui.select( ui.row( box, t( 'Canvas layer' ) ), {
					options: layers.map( ( l ) => ( {
						value: String( l.id ),
						label: l.name || l.type,
					} ) ),
					value: String( layerId ),
					onChange: ( v ) => {
						layerId = layers.find(
							( l ) => String( l.id ) === v
						)?.id;
					},
				} );
				picker.dataset.setting = 'obstacleLayer';
				picker.setAttribute( 'aria-label', t( 'Canvas layer' ) );
				const button = ui.el(
					'button',
					'dsm-btn',
					box,
					loading
						? t( 'Reading silhouette…' )
						: t( 'Use layer silhouette' )
				);
				button.type = 'button';
				button.dataset.action = 'import-obstacle';
				button.disabled = loading;
				button.onclick = async () => {
					if ( loading ) {
						return;
					}
					loading = true;
					button.disabled = true;
					const target = current(),
						state = editor.state,
						name =
							layers.find( ( l ) => l.id === layerId )?.name ||
							t( 'Canvas layer' );
					try {
						const loops = await importObstacleLayer(
							bridge,
							state,
							layerId
						);
						if (
							host.closed ||
							host.recording ||
							target !== current()
						) {
							return;
						}
						p.obstacleShape = target.addAsset( name, loops );
						p.obstacleMode = 'place';
						p.tool = 'wall';
						selected = 0;
						changed();
					} catch ( e ) {
						if ( ! host.closed ) {
							error( e );
						}
					} finally {
						loading = false;
						if ( ! host.closed ) {
							refresh();
						}
					}
				};
			}
			for ( const [ label, key, property, min, max, step ] of [
				[ 'Obstacle size', 'obstacleSize', 'size', 0.024, 0.8, 0.004 ],
				[ 'Obstacle rotation', 'obstacleAngle', 'angle', -180, 180, 1 ],
			] ) {
				const control = ui.slider( box, {
					label: t( label ),
					value: p[ key ],
					min,
					max,
					step,
					format: ( v ) =>
						key === 'obstacleAngle'
							? Math.round( v ) + '°'
							: Math.round( v * 100 ) + '%',
					onInput: ( v ) => {
						p[ key ] = v;
						try {
							if ( item() ) {
								m.update( selected, { [ property ]: v } );
							}
							changed();
						} catch ( e ) {
							error( e );
						}
					},
				} );
				control.input.dataset.setting = key;
				control.input.setAttribute( 'aria-label', t( label ) );
			}
			color(
				box,
				'Obstacle color',
				p.obstacleColor,
				( v ) => {
					p.obstacleColor = v;
					if ( item() ) {
						m.update( selected, { color: v } );
					}
					changed();
				},
				true
			);
			if ( item() ) {
				const button = ui.el(
					'button',
					'dsm-btn',
					box,
					t( 'Remove selected obstacle' )
				);
				button.type = 'button';
				button.dataset.action = 'remove-obstacle';
				button.onclick = () => {
					m.remove( selected );
					selected = 0;
					changed();
					refresh();
				};
			}
			ui.el(
				'p',
				'wpiemb-note',
				box,
				t(
					p.tool === 'draw'
						? 'Drag to stamp the selected shape. Brush size controls the stamps.'
						: 'Click empty space to place a form. Drag a form to move it. Size, rotation and color change the selected form.'
				)
			);
		},
	};
}
