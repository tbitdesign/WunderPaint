/**
 * Sample moving pieces at their actual screen coordinates. The live DOM stays
 * visible underneath; this is never used as a replacement screenshot.
 */
export async function captureEditor( root, signal ) {
	const width = window.innerWidth;
	const height = window.innerHeight;
	const canvas = ( w = width, h = height ) => {
		const c = document.createElement( 'canvas' );
		c.width = Math.max( 1, Math.ceil( w ) );
		c.height = Math.max( 1, Math.ceil( h ) );
		return c;
	};
	const source = canvas();
	const erasePaint = canvas();
	const sc = source.getContext( '2d', { willReadFrequently: true } );
	const ec = erasePaint.getContext( '2d' );
	const styles = new WeakMap();
	const styleOf = ( el ) => {
		if ( ! styles.has( el ) ) {
			styles.set( el, window.getComputedStyle( el ) );
		}
		return styles.get( el );
	};
	const solid = ( color ) =>
		color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)';
	const background = ( el ) => {
		for ( let p = el; p; p = p.parentElement ) {
			if ( solid( styleOf( p ).backgroundColor ) ) {
				return styleOf( p ).backgroundColor;
			}
		}
		return '#181b23';
	};
	ec.fillStyle = background( root );
	ec.fillRect( 0, 0, width, height );
	const intersect = ( a, b ) => ( {
		left: Math.max( a.left, b.left ),
		top: Math.max( a.top, b.top ),
		right: Math.min( a.right, b.right ),
		bottom: Math.min( a.bottom, b.bottom ),
	} );
	const viewport = { left: 0, top: 0, right: width, bottom: height };
	const clips = new WeakMap();
	const clipFor = ( el ) => {
		if ( clips.has( el ) ) {
			return clips.get( el );
		}
		const parent = el.parentElement;
		let clip =
			parent && root.contains( parent ) ? clipFor( parent ) : viewport;
		const style = styleOf( el );
		if (
			style.display === 'none' ||
			style.visibility === 'hidden' ||
			Number( style.opacity ) === 0
		) {
			clip = { left: 0, top: 0, right: 0, bottom: 0 };
		} else if (
			/(hidden|clip|auto|scroll)/.test(
				style.overflowX + style.overflowY
			)
		) {
			clip = intersect( clip, el.getBoundingClientRect() );
		}
		clips.set( el, clip );
		return clip;
	};
	const paint = ( el, rect, draw ) => {
		const r = intersect( rect, clipFor( el ) );
		if ( r.right <= r.left || r.bottom <= r.top || signal.aborted ) {
			return;
		}
		ec.fillStyle = background( el.parentElement );
		ec.fillRect( r.left, r.top, r.right - r.left, r.bottom - r.top );
		sc.save();
		sc.beginPath();
		sc.rect( r.left, r.top, r.right - r.left, r.bottom - r.top );
		sc.clip();
		draw( sc );
		sc.restore();
	};
	const drawRaster = ( image, el, rect ) => {
		// Test each raster separately: one unreadable thumbnail must not taint
		// every moving pixel or require hiding/replacing any editor element.
		const tile = canvas( rect.width, rect.height );
		try {
			const tc = tile.getContext( '2d', { willReadFrequently: true } );
			tc.drawImage( image, 0, 0, tile.width, tile.height );
			tc.getImageData( 0, 0, 1, 1 );
			paint( el, rect, ( ctx ) =>
				ctx.drawImage(
					tile,
					rect.left,
					rect.top,
					rect.width,
					rect.height
				)
			);
		} catch ( error ) {
			// The original remains visible and untouched.
		} finally {
			tile.width = tile.height = 0;
		}
	};
	const pending = [];
	const sampleSvg = ( el, rect ) => {
		const copy = el.cloneNode( true );
		const originals = [ el, ...el.querySelectorAll( '*' ) ];
		const copies = [ copy, ...copy.querySelectorAll( '*' ) ];
		for ( let i = 0; i < originals.length; i++ ) {
			const target = copies[ i ];
			const style = styleOf( originals[ i ] );
			target.removeAttribute( 'style' );
			for ( const prop of [
				'color',
				'fill',
				'fill-rule',
				'stroke',
				'stroke-width',
				'stroke-linecap',
				'stroke-linejoin',
				'stroke-dasharray',
				'opacity',
			] ) {
				target.style.setProperty(
					prop,
					style.getPropertyValue( prop )
				);
			}
			for ( const attr of [ ...target.attributes ] ) {
				if (
					/^on/i.test( attr.name ) ||
					( /href$/.test( attr.name ) &&
						! attr.value.startsWith( '#' ) )
				) {
					target.removeAttribute( attr.name );
				}
			}
		}
		copy.setAttribute( 'xmlns', 'http://www.w3.org/2000/svg' );
		copy.setAttribute( 'width', rect.width );
		copy.setAttribute( 'height', rect.height );
		const image = new Image();
		pending.push(
			new Promise( ( resolve ) => {
				const finish = () => {
					clearTimeout( timer );
					signal.removeEventListener( 'abort', finish );
					image.onload = image.onerror = null;
					image.src = '';
					resolve();
				};
				const timer = setTimeout( finish, 1500 );
				image.onload = () => {
					drawRaster( image, el, rect );
					finish();
				};
				image.onerror = finish;
				signal.addEventListener( 'abort', finish, { once: true } );
				image.src =
					'data:image/svg+xml;charset=utf-8,' +
					encodeURIComponent(
						new window.XMLSerializer().serializeToString( copy )
					);
			} )
		);
	};
	const area = root.querySelector( '.ed-canvas-area' );
	const stage = root.querySelector( '.ed-canvas-stage' );
	let poster = {
		x: width * 0.3,
		y: height * 0.3,
		w: width * 0.4,
		h: height * 0.4,
	};
	if ( stage && area ) {
		const r = intersect(
			intersect(
				stage.getBoundingClientRect(),
				area.getBoundingClientRect()
			),
			viewport
		);
		if ( r.right > r.left && r.bottom > r.top ) {
			poster = {
				x: r.left,
				y: r.top,
				w: r.right - r.left,
				h: r.bottom - r.top,
			};
			const display = area.querySelector( ':scope > canvas' );
			if ( display ) {
				const rect = display.getBoundingClientRect();
				// Crop the genuine, already composited editor canvas. No DOM
				// layout reconstruction, CSS transforms or guessed document size.
				const piece = canvas( poster.w, poster.h );
				try {
					const pc = piece.getContext( '2d', {
						willReadFrequently: true,
					} );
					pc.drawImage(
						display,
						( ( r.left - rect.left ) * display.width ) / rect.width,
						( ( r.top - rect.top ) * display.height ) / rect.height,
						( poster.w * display.width ) / rect.width,
						( poster.h * display.height ) / rect.height,
						0,
						0,
						poster.w,
						poster.h
					);
					pc.getImageData( 0, 0, 1, 1 );
					sc.drawImage( piece, r.left, r.top );
					ec.fillStyle = background( area );
					ec.fillRect( r.left, r.top, poster.w, poster.h );
				} catch ( error ) {
					// Keep an unreadable document visible; UI pieces still work.
				} finally {
					piece.width = piece.height = 0;
				}
			}
		}
	}
	for ( const el of root.querySelectorAll( '*' ) ) {
		if (
			el.closest( '.ed-canvas-area' ) ||
			el.parentElement?.closest( 'svg' )
		) {
			continue;
		}
		const rect = el.getBoundingClientRect();
		const visible = intersect( rect, clipFor( el ) );
		if (
			rect.width < 1 ||
			rect.height < 1 ||
			visible.right <= visible.left ||
			visible.bottom <= visible.top
		) {
			continue;
		}
		const tag = el.tagName.toUpperCase();
		const style = styleOf( el );
		if ( tag === 'SVG' ) {
			sampleSvg( el, rect );
		} else if (
			( tag === 'IMG' && el.complete && el.naturalWidth ) ||
			tag === 'CANVAS'
		) {
			drawRaster( el, el, rect );
		} else if (
			rect.width < 620 &&
			rect.height < 150 &&
			solid( style.backgroundColor ) &&
			( /^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test( tag ) ||
				! el.childElementCount )
		) {
			paint( el, rect, ( ctx ) => {
				ctx.fillStyle = style.backgroundColor;
				ctx.beginPath();
				ctx.roundRect(
					rect.left,
					rect.top,
					rect.width,
					rect.height,
					Math.min(
						parseFloat( style.borderRadius ) || 0,
						rect.height / 2
					)
				);
				ctx.fill();
			} );
		}
	}
	// Browser Range provides actual glyph positions, including panel scrolling,
	// nested flex/grid layout and inherited fonts. Nothing is reflowed or cloned.
	const walker = document.createTreeWalker(
		root,
		window.NodeFilter.SHOW_TEXT
	);
	const range = document.createRange();
	while ( walker.nextNode() ) {
		const node = walker.currentNode;
		const el = node.parentElement;
		if (
			! el ||
			el.closest( '.ed-canvas-area, svg, script, style, textarea' ) ||
			! node.textContent.trim()
		) {
			continue;
		}
		const style = styleOf( el );
		sc.font = `${ style.fontStyle } ${ style.fontWeight } ${ style.fontSize } ${ style.fontFamily }`;
		sc.textBaseline = 'alphabetic';
		const descent = sc.measureText( 'Mg' ).fontBoundingBoxDescent || 0;
		let offset = 0;
		for ( let glyph of node.textContent ) {
			range.setStart( node, offset );
			offset += glyph.length;
			range.setEnd( node, offset );
			if ( ! glyph.trim() ) {
				continue;
			}
			const rect = range.getBoundingClientRect();
			if ( style.textTransform === 'uppercase' ) {
				glyph = glyph.toUpperCase();
			} else if ( style.textTransform === 'lowercase' ) {
				glyph = glyph.toLowerCase();
			}
			paint( el, rect, ( ctx ) => {
				ctx.fillStyle = style.color;
				ctx.fillText( glyph, rect.left, rect.bottom - descent );
			} );
		}
	}
	await Promise.all( pending );
	if ( signal.aborted ) {
		source.width = source.height = erasePaint.width = erasePaint.height = 0;
		throw new Error( 'Pixel sampling cancelled' );
	}
	const brand = root.querySelector( '.wpie-brandmark svg' );
	if ( ! brand ) {
		throw new Error( 'Editor logo unavailable' );
	}
	const brandShapes = [ ...brand.querySelectorAll( 'path,circle' ) ].map(
		( shape ) => ( {
			color:
				shape.getAttribute( 'fill' ) === '#3b66ff'
					? '#3b66ff'
					: '#fdfdfd',
			path:
				shape.tagName === 'path'
					? new window.Path2D( shape.getAttribute( 'd' ) )
					: null,
			circle:
				shape.tagName === 'circle'
					? [ 'cx', 'cy', 'r' ].map( ( attr ) =>
							Number( shape.getAttribute( attr ) )
					  )
					: null,
		} )
	);
	return { source, erasePaint, poster, brandShapes };
}
