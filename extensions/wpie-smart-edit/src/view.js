import { bounds, footprint } from './engine.js';
import { ICONS } from './icons.js';
import { objectAtPoint } from './relations.js';

export function createView( parent, { ui, t, onPick, onExplore, onSample } ) {
	const host = ui.el( 'div', 'wpiese-view', parent );
	const canvas = ui.el( 'canvas', 'wpiese-canvas', host );
	const tools = ui.el( 'div', 'wpiese-view-tools', host );
	let original = null,
		current = null,
		doc = null,
		layers = [],
		ids = [],
		excluded = new Set();
	let pickable = new Set(),
		marker = false;
	const mode = ui.select( tools, {
		options: [
			{ value: 'explore', label: t( 'Explore objects' ) },
			{ value: 'members', label: t( 'Include / exclude' ) },
		],
		value: 'explore',
		onChange: updateHint,
	} );
	mode.classList.add( 'wpiese-pick-mode' );
	mode.setAttribute( 'aria-label', t( 'Preview interaction' ) );
	let zoom = 1,
		sampleIds = null,
		dx = 0,
		dy = 0,
		compare = false,
		transform = null,
		disposed = false;
	const fit = () => {
		zoom = 1;
		dx = 0;
		dy = 0;
		draw();
	};
	ui.mini( tools, { icon: ICONS.fit, title: t( 'Fit' ), onClick: fit } );
	ui.mini( tools, {
		icon: ICONS.minus,
		title: t( 'Zoom out' ),
		onClick: () => {
			zoom = Math.max( 0.2, zoom / 1.25 );
			draw();
		},
	} );
	ui.mini( tools, {
		icon: ICONS.plus,
		title: t( 'Zoom in' ),
		onClick: () => {
			zoom = Math.min( 12, zoom * 1.25 );
			draw();
		},
	} );
	const compareBtn = ui.btn( tools, {
		label: t( 'Original' ),
		onClick: () => {
			compare = ! compare;
			ui.pressed( compareBtn, compare );
			draw();
		},
	} );
	ui.pressed( compareBtn, false );
	const hint = ui.el(
		'div',
		'wpiese-view-hint',
		host,
		t(
			'Click objects to include or exclude · drag to pan · scroll to zoom'
		)
	);
	function updateHint() {
		hint.textContent = sampleIds
			? t( 'Click a matching object to use as an example.' )
			: mode.value === 'explore'
			? t(
					'Click an object to discover related families · drag to pan · scroll to zoom'
			  )
			: marker
			? t( 'Click a number to move the highlight' )
			: t(
					'Click objects to include or exclude · drag to pan · scroll to zoom'
			  );
	}
	updateHint();
	function draw() {
		if ( disposed || ! host.clientWidth || ! host.clientHeight ) {
			return;
		}
		const width = host.clientWidth,
			height = host.clientHeight,
			dpr = Math.min( 2, window.devicePixelRatio || 1 );
		if ( canvas.width !== Math.round( width * dpr ) ) {
			canvas.width = Math.round( width * dpr );
		}
		if ( canvas.height !== Math.round( height * dpr ) ) {
			canvas.height = Math.round( height * dpr );
		}
		const g = canvas.getContext( '2d' );
		g.setTransform( dpr, 0, 0, dpr, 0, 0 );
		g.clearRect( 0, 0, width, height );
		const source = compare ? original : current || original;
		if ( ! source || ! doc ) {
			return;
		}
		const scale = Math.max(
			0.001,
			Math.min(
				( width - 32 ) / Math.max( 1, doc.w ),
				( height - 90 ) / Math.max( 1, doc.h )
			) * zoom
		);
		const x = ( width - doc.w * scale ) / 2 + dx,
			y = ( height - doc.h * scale ) / 2 + dy;
		transform = { x, y, scale };
		g.drawImage( source, x, y, doc.w * scale, doc.h * scale );
		if ( compare ) {
			return;
		}
		const theme = window.getComputedStyle( host );
		const accent = theme.getPropertyValue( '--accent' ).trim() || '#3b66ff';
		const muted = theme.getPropertyValue( '--text-muted' ).trim() || '#888';
		const selected = new Set( ids );
		for ( const l of layers ) {
			if ( ! selected.has( l.id ) ) {
				continue;
			}
			const b = footprint( l );
			g.strokeStyle = excluded.has( l.id ) ? muted : accent;
			g.lineWidth = 1.5;
			g.setLineDash( excluded.has( l.id ) ? [ 4, 4 ] : [] );
			g.strokeRect(
				x + b.x * scale - 2,
				y + b.y * scale - 2,
				b.w * scale + 4,
				b.h * scale + 4
			);
		}
		g.setLineDash( [] );
	}
	let drag = null;
	canvas.onpointerdown = ( e ) => {
		if ( e.button !== 0 && e.button !== 1 ) {
			return;
		}
		drag = { x: e.clientX, y: e.clientY, dx, dy, moved: false };
		canvas.setPointerCapture( e.pointerId );
		e.preventDefault();
	};
	canvas.onpointermove = ( e ) => {
		if ( ! drag ) {
			return;
		}
		if ( Math.hypot( e.clientX - drag.x, e.clientY - drag.y ) > 4 ) {
			drag.moved = true;
		}
		if ( drag.moved ) {
			dx = drag.dx + e.clientX - drag.x;
			dy = drag.dy + e.clientY - drag.y;
			draw();
		}
	};
	canvas.onpointerup = ( e ) => {
		if ( ! drag ) {
			return;
		}
		const click = ! drag.moved && e.button === 0;
		drag = null;
		if ( canvas.hasPointerCapture( e.pointerId ) ) {
			canvas.releasePointerCapture( e.pointerId );
		}
		if ( ! click || compare || ! transform ) {
			return;
		}
		const r = canvas.getBoundingClientRect(),
			p = {
				x: ( e.clientX - r.left - transform.x ) / transform.scale,
				y: ( e.clientY - r.top - transform.y ) / transform.scale,
			};
		if ( sampleIds ) {
			const id = objectAtPoint( layers, sampleIds, p );
			if ( id ) {
				onSample?.( id );
			}
			return;
		}
		if ( mode.value === 'explore' ) {
			const id = objectAtPoint( layers, pickable, p );
			if ( id ) {
				onExplore( id );
			}
			return;
		}
		for ( const l of [ ...layers ].reverse() ) {
			if ( ! ids.includes( l.id ) ) {
				continue;
			}
			const b = footprint( l );
			if (
				p.x >= b.x &&
				p.y >= b.y &&
				p.x <= b.x + b.w &&
				p.y <= b.y + b.h
			) {
				onPick( l.id );
				break;
			}
		}
	};
	canvas.onpointercancel = () => {
		drag = null;
	};
	canvas.ondblclick = fit;
	canvas.addEventListener(
		'wheel',
		( e ) => {
			e.preventDefault();
			if ( ! transform ) {
				return;
			}
			const r = canvas.getBoundingClientRect(),
				x = e.clientX - r.left - host.clientWidth / 2,
				y = e.clientY - r.top - host.clientHeight / 2;
			const next = Math.max(
					0.2,
					Math.min( 12, zoom * Math.exp( -e.deltaY * 0.0015 ) )
				),
				ratio = next / zoom;
			dx = x - ( x - dx ) * ratio;
			dy = y - ( y - dy ) * ratio;
			zoom = next;
			draw();
		},
		{ passive: false }
	);
	const resize = new ResizeObserver( draw );
	resize.observe( host );
	return {
		focus( list ) {
			if ( ! doc || ! host.clientWidth || ! host.clientHeight ) {
				return;
			}
			const selected = new Set( list );
			const box = selected.has( '@document' )
				? { x: 0, y: 0, w: doc.w, h: doc.h }
				: bounds( layers.filter( ( l ) => selected.has( l.id ) ) );
			if ( ! box || box.w <= 0 || box.h <= 0 ) {
				return;
			}
			const width = host.clientWidth - 64,
				height = host.clientHeight - 130;
			const baseScale = Math.min(
				( host.clientWidth - 32 ) / doc.w,
				( host.clientHeight - 90 ) / doc.h
			);
			const scale = Math.min( width / box.w, height / box.h );
			zoom = Math.max( 0.2, Math.min( 12, scale / baseScale ) );
			dx = ( doc.w / 2 - box.x - box.w / 2 ) * baseScale * zoom;
			dy = ( doc.h / 2 - box.y - box.h / 2 ) * baseScale * zoom;
			draw();
		},
		sampleMode( list = null ) {
			sampleIds = list ? new Set( list ) : null;
			mode.disabled = !! sampleIds;
			compareBtn.disabled = !! sampleIds;
			if ( sampleIds ) {
				compare = false;
				ui.pressed( compareBtn, false );
			}
			canvas.classList.toggle( 'is-picking-example', !! sampleIds );
			updateHint();
			draw();
		},
		pickable( list ) {
			pickable = new Set( list );
		},
		markerMode( on ) {
			if ( on ) {
				mode.value = 'members';
			} else if ( marker ) {
				mode.value = 'explore';
			}
			marker = on;
			updateHint();
		},
		set( base, result, document, list ) {
			original = base;
			current = result;
			doc = document;
			layers = list;
			draw();
		},
		highlight( list, omitted = new Set() ) {
			ids = list;
			excluded = omitted;
			updateHint();
			draw();
		},
		thumbnail( target, group, list, source = original ) {
			if ( ! source || ! doc ) {
				return;
			}
			const g = target.getContext( '2d' );
			g.clearRect( 0, 0, target.width, target.height );
			const representatives = group.hits.slice( 0, 3 );
			const n = Math.max( 1, representatives.length );
			for ( let i = 0; i < representatives.length; i++ ) {
				const h = representatives[ i ];
				const b =
					h.id === '@document'
						? { x: 0, y: 0, w: doc.w, h: doc.h }
						: bounds(
								list.filter(
									( l ) => l.id === h.id || l.id === h.shapeId
								)
						  );
				if ( ! b || ! b.w || ! b.h ) {
					continue;
				}
				const pad = Math.max( 3, Math.min( b.w, b.h ) * 0.12 );
				const x = Math.max( 0, b.x - pad ),
					y = Math.max( 0, b.y - pad );
				const w = Math.min( doc.w, b.x + b.w + pad ) - x,
					hgt = Math.min( doc.h, b.y + b.h + pad ) - y;
				if ( w <= 0 || hgt <= 0 ) {
					continue;
				}
				const cell = target.width / n,
					s = Math.min(
						( cell - 8 ) / w,
						( target.height - 10 ) / hgt
					);
				g.drawImage(
					source,
					( x * source.width ) / doc.w,
					( y * source.height ) / doc.h,
					( w * source.width ) / doc.w,
					( hgt * source.height ) / doc.h,
					i * cell + ( cell - w * s ) / 2,
					( target.height - hgt * s ) / 2,
					w * s,
					hgt * s
				);
			}
		},
		close() {
			disposed = true;
			resize.disconnect();
		},
	};
}
