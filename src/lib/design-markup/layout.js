import { stylesPadding } from '../raster';
import { LIMITS } from './catalog';

const H = ( a ) => ( a.includes( 'l' ) ? 0 : a.includes( 'r' ) ? 1 : 0.5 );
const V = ( a ) => ( a.includes( 't' ) ? 0 : a.includes( 'b' ) ? 1 : 0.5 );
const R = Math.round;

function gridRects( markup ) {
	const { w: W, h: Hc } = markup.canvas;
	const g = markup.grid;
	const short = Math.min( W, Hc );
	const margin = R( short * g.margin );
	const gutter = R( short * g.gutter );
	const cw = ( W - 2 * margin - ( g.cols - 1 ) * gutter ) / g.cols;
	const rh = ( Hc - 2 * margin - ( g.rows - 1 ) * gutter ) / g.rows;
	const areas = new Map();
	for ( const a of markup.areas ) {
		// A cell written back to front ("[11, 7, 1, 12]") used to give a
		// negative width; the order is the author's, the extent is ours.
		const c0 = Math.min( a.cell[ 0 ], a.cell[ 2 ] );
		const c1 = Math.max( a.cell[ 0 ], a.cell[ 2 ] );
		const r0 = Math.min( a.cell[ 1 ], a.cell[ 3 ] );
		const r1 = Math.max( a.cell[ 1 ], a.cell[ 3 ] );
		const x = margin + c0 * ( cw + gutter );
		const y = margin + r0 * ( rh + gutter );
		areas.set( a.id, {
			x: R( x ),
			y: R( y ),
			w: R( ( c1 - c0 ) * cw + ( c1 - c0 - 1 ) * gutter ),
			h: R( ( r1 - r0 ) * rh + ( r1 - r0 - 1 ) * gutter ),
		} );
	}
	return { areas, margin };
}

function sizeOf( size, base, refW, el, measure, W, Hc ) {
	const sw = size ? size[ 0 ] : 'fill';
	const sh = size ? size[ 1 ] : 'auto';
	// Memoizes the measure() call so an element that is 'auto' on both axes
	// (rare) only probes once; its `w` feeds the width, its `h` the height.
	let probe = null;
	let w;
	if ( 'fill' === sw ) {
		w = base.w;
	} else if ( 'match' === sw ) {
		w = refW;
	} else if ( 'auto' === sw ) {
		probe = measure( el, base.w );
		w = 'number' === typeof probe.w ? R( probe.w ) : base.w;
	} else {
		w = R( sw * W );
	}
	let h;
	if ( 'auto' === sh ) {
		h = R( ( probe || measure( el, w ) ).h );
	} else if ( 'fill' === sh || 'match' === sh ) {
		h = base.h;
	} else {
		h = R( sh * Hc );
	}
	return { w, h };
}

/**
 * Ein Rechteck in die Sicherheitszone zwingen: erst schrumpfen (nie
 * groesser als die Zone), dabei die verankerte Seite halten, dann
 * hineinschieben.
 *
 * Warum das hier passiert und nicht erst in der Reparatur: die Reparatur
 * VERSCHIEBT nur (`verify.js`, Fall `margin`), und genau das geht nicht,
 * wenn ein Element breiter ist als die Zone - dann bleibt die Verletzung
 * stehen und der Entwurf wird abgelehnt. Im ersten Lauf mit vollstaendigen
 * Markups war das der haeufigste Grund: das Modell schreibt gern
 * `rect: [0, 0, 1, 0.3]`, also randbuendig. Ein Rechteck ist ein Wunsch,
 * die Sicherheitszone ist das Gesetz.
 *
 * @param {Object} rect   Aufgeloestes Rechteck.
 * @param {Object} safe   Sicherheitszone.
 * @param {string} anchor Anker des Elements.
 * @return {Object} Geklemmtes Rechteck.
 */
function clampToSafe( rect, safe, anchor ) {
	// `place.rect` kommt ohne Anker (cleanPlace gibt dort frueh zurueck) -
	// dann bleibt beim Schrumpfen die obere linke Ecke stehen.
	const a = anchor || 'tl';
	const w = Math.min( rect.w, safe.w );
	const h = Math.min( rect.h, safe.h );
	let x = rect.x + ( rect.w - w ) * H( a );
	let y = rect.y + ( rect.h - h ) * V( a );
	x = Math.min( Math.max( x, safe.x ), safe.x + safe.w - w );
	y = Math.min( Math.max( y, safe.y ), safe.y + safe.h - h );
	return { x: R( x ), y: R( y ), w, h };
}

/**
 * Darf dieses Element aus der Sicherheitszone herausragen? Genau drei
 * duerfen es, und zwar dieselben drei, die auch die Randpruefung
 * (`verify.js`) ausnimmt: ein `cover`-Rechteck, ein Rahmen und ein
 * Hintergrund. Alles andere wird geklemmt.
 *
 * @param {Object} el Markup-Element.
 * @return {boolean} true = randbuendig erlaubt.
 */
/**
 * Wieviel Platz die eigene FARBE eines Elements ausserhalb seines Kastens
 * braucht: Schlagschatten, Schein, Kontur als Ebenenstil.
 *
 * Der Grund steht in Lauf 4: `panel` mit `rect: [0.61, 0.13, 0.31, 0.68]`
 * lag mit jeder Kante INNERHALB der Sicherheitszone - und wurde trotzdem
 * wegen `margin` abgelehnt, weil sein Schlagschatten weit darueber
 * hinausreichte. Das Layout klemmte nichts, weil es nur Geometrie kennt;
 * die Randpruefung misst aber die Farbe. Deshalb bekommt ein Element mit
 * Stilen hier eine engere Zone: der Schatten wird beim Platzieren
 * eingeplant, statt hinterher repariert zu werden.
 *
 * `layer.styles` und `el.styles` sind dasselbe Objekt (der Bereiniger
 * reicht es unveraendert durch, die Bauer kopieren es auf die Ebene), also
 * rechnet hier dieselbe Funktion wie in der Pruefung.
 *
 * @param {Object} el Markup-Element.
 * @return {number} Rand in Dokumentpixeln.
 */
function paintPad( el ) {
	return el.styles ? stylesPadding( el ) : 0;
}

function bleeds( el ) {
	return (
		!! el.place?.cover || 'frame' === el.role || 'background' === el.kind
	);
}

/** Topologische Reihenfolge: rel.to und parent vor dem Element. */
function orderOf( els ) {
	const byId = new Map( els.map( ( e ) => [ e.id, e ] ) );
	const out = [];
	const seen = new Set();
	const visit = ( e ) => {
		if ( ! e || seen.has( e.id ) ) {
			return;
		}
		seen.add( e.id );
		if ( e.parent ) {
			visit( byId.get( e.parent ) );
		}
		if ( e.place?.rel ) {
			visit( byId.get( e.place.rel.to ) );
		}
		out.push( e.id );
	};
	els.forEach( visit );
	return out;
}

/**
 * Löst Raster, Bereiche, Platzierung und Stapel zu Pixelrechtecken.
 * `measure( el, w ) -> { h }` liefert Auto-Höhen (Text, Komponenten).
 */
export function solveLayout( markup, tokens, measure ) {
	const { w: W, h: Hc } = markup.canvas;
	const notes = [];
	const { areas, margin } = gridRects( markup );
	const gap = tokens.space.gap;
	const byId = new Map( markup.elements.map( ( e ) => [ e.id, e ] ) );
	const rects = new Map();
	const order = orderOf( markup.elements );
	const children = ( gid ) =>
		markup.elements.filter( ( e ) => e.parent === gid );

	for ( const id of order ) {
		const el = byId.get( id );
		if ( el.parent ) {
			continue; // Stapelkinder setzt die Gruppe
		}
		const p = el.place;
		let rect;
		if ( p.cover ) {
			rect = { x: 0, y: 0, w: W, h: Hc };
		} else if ( p.rect ) {
			rect = {
				x: R( p.rect[ 0 ] * W ),
				y: R( p.rect[ 1 ] * Hc ),
				w: R( p.rect[ 2 ] * W ),
				h: R( p.rect[ 3 ] * Hc ),
			};
		} else if ( p.rel ) {
			const ref = rects.get( p.rel.to ) || {
				x: margin,
				y: margin,
				w: W - 2 * margin,
				h: 0,
			};
			const { w, h } = sizeOf(
				p.size,
				{ w: W - 2 * margin, h: Hc - 2 * margin },
				ref.w,
				el,
				measure,
				W,
				Hc
			);
			const g = p.rel.gap * gap;
			let x = ref.x + ( ref.w - w ) * H( p.anchor );
			let y = ref.y + ( ref.h - h ) * V( p.anchor );
			if ( 'below' === p.rel.side ) {
				y = ref.y + ref.h + g;
			} else if ( 'above' === p.rel.side ) {
				y = ref.y - g - h;
			} else if ( 'right' === p.rel.side ) {
				x = ref.x + ref.w + g;
			} else {
				x = ref.x - g - w;
			}
			rect = { x: R( x ), y: R( y ), w, h };
		} else {
			const area = areas.get( p.area ) || {
				x: margin,
				y: margin,
				w: W - 2 * margin,
				h: Hc - 2 * margin,
			};
			const ins = p.inset;
			const base = {
				x: area.x + R( ins[ 3 ] * area.w ),
				y: area.y + R( ins[ 0 ] * area.h ),
				w: R( area.w * ( 1 - ins[ 1 ] - ins[ 3 ] ) ),
				h: R( area.h * ( 1 - ins[ 0 ] - ins[ 2 ] ) ),
			};
			const { w, h } = sizeOf( p.size, base, base.w, el, measure, W, Hc );
			rect = {
				x: R( base.x + ( base.w - w ) * H( p.anchor ) ),
				y: R( base.y + ( base.h - h ) * V( p.anchor ) ),
				w,
				h,
			};
		}
		if ( ! bleeds( el ) ) {
			// Ein masslos grosser Schatten darf die Zone nicht auf null
			// oder ins Negative ziehen - dann bleibt es bei der reinen
			// Sicherheitszone, und die Randreparatur schrumpft das Element.
			let pad = paintPad( el );
			if ( 2 * pad >= Math.min( W, Hc ) - 2 * margin ) {
				pad = 0;
			}
			const safe = {
				x: margin + pad,
				y: margin + pad,
				w: W - 2 * ( margin + pad ),
				h: Hc - 2 * ( margin + pad ),
			};
			const clamped = clampToSafe( rect, safe, p.anchor );
			if (
				clamped.x !== rect.x ||
				clamped.y !== rect.y ||
				clamped.w !== rect.w ||
				clamped.h !== rect.h
			) {
				notes.push( {
					code: 'layout.clamped',
					path: `$.elements[${ id }]`,
					message: `${ rect.w }x${ rect.h } at ${ rect.x },${ rect.y } clamped into the safe area`,
				} );
			}
			rect = clamped;
		}
		rects.set( id, rect );
		if ( 'group' === el.kind && el.stack ) {
			stackChildren( el, rect, {
				gap,
				measure,
				rects,
				notes,
				W,
				Hc,
				children,
				depth: 0,
			} );
		}
	}
	return { rects, order, notes };
}

/**
 * Packt Stapelkinder entlang der Hauptachse (col = Höhe, row = Breite).
 * Nur `size`-Einträge mit `auto` AUF DER HAUPTACHSE dürfen schrumpfen (bei
 * `row` also die Breite, nicht die Höhe); die Querachse bleibt unangetastet.
 * Reicht der Platz nicht, schrumpft die Hauptachse bis zu einer Untergrenze
 * von 70% der gemessenen Größe (`stack.shrink`, nur wenn tatsächlich etwas
 * schrumpft). Reicht selbst das nicht — oder ist gar nichts schrumpfbar —,
 * wandert der Rest der Überlänge in die Lücken zwischen den Kindern (nie
 * negativ) statt sie zu vergrößern, und `layout.overflow` markiert, dass
 * der Stapel nicht passt.
 *
 * Ein Kind, das selbst eine Gruppe mit `stack` ist, wird nach seiner
 * Platzierung rekursiv gelöst — sonst bekämen die Enkel nie ein Rechteck
 * (die Hauptschleife überspringt alles mit `parent`, und nur Gruppen der
 * obersten Ebene riefen hier herein). Tiefe wie in `validateMarkup`:
 * höchstens `LIMITS.depth` Ebenen, damit ein Zyklus in `parent` (den der
 * Compiler vor dem Layout ablehnt, ein Direktaufruf aber nicht) nicht
 * endlos läuft.
 *
 * @param {Object} group Gruppen-Element mit `stack`.
 * @param {Object} G     Rechteck der Gruppe.
 * @param {Object} c     Kontext: gap, measure, rects, notes, W, Hc,
 *                       children( id ), depth.
 */
function stackChildren( group, G, c ) {
	const { gap, measure, rects, notes, W, Hc, children, depth } = c;
	const kids = children( group.id );
	const col = 'col' === group.stack.dir;
	const mainSlot = col ? 1 : 0; // size tuple is always [ width, height ]
	const main = ( s ) => ( col ? s.h : s.w );
	const room = col ? G.h : G.w;
	const nGaps = Math.max( 0, kids.length - 1 );
	const naturalGap = group.stack.gap * gap;

	const sized = kids.map( ( k ) => {
		const { w, h } = sizeOf( k.size, G, G.w, k, measure, W, Hc );
		const auto = ! k.size || 'auto' === k.size[ mainSlot ];
		return { el: k, w, h, auto };
	} );
	const shrinkable = sized
		.filter( ( s ) => s.auto )
		.reduce( ( a, s ) => a + main( s ), 0 );
	const fixed = sized
		.filter( ( s ) => ! s.auto )
		.reduce( ( a, s ) => a + main( s ), 0 );
	const naturalGapTotal = naturalGap * nGaps;

	let f = 1;
	let gapTotal = naturalGapTotal;
	if ( shrinkable + fixed + naturalGapTotal > room ) {
		const ideal =
			shrinkable > 0
				? ( room - fixed - naturalGapTotal ) / shrinkable
				: 1;
		// With nothing shrinkable the ratio sentinel is always 1 (never < 0.7),
		// so overflow has to be judged on the raw fit instead in that case.
		const overflow =
			shrinkable > 0 ? ideal < 0.7 : fixed + naturalGapTotal > room;
		f = Math.max( 0.7, ideal );
		if ( f < 1 ) {
			notes.push( {
				code: 'stack.shrink',
				path: `$.elements[${ group.id }]`,
				message: `stack needs ${ R(
					shrinkable + fixed + naturalGapTotal
				) }px in ${ room }px`,
			} );
		}
		if ( overflow ) {
			// The floor keeps text readable; whatever room is still missing
			// comes out of the gaps (never below zero) instead of overflowing.
			gapTotal = Math.max( 0, room - ( shrinkable * f + fixed ) );
			notes.push( {
				code: 'layout.overflow',
				path: `$.elements[${ group.id }]`,
				message: 'shrink limit 0.7 reached',
			} );
		}
	}
	const used = shrinkable * f + fixed + gapTotal;
	const gapEach = nGaps > 0 ? gapTotal / nGaps : 0;
	const jf = { start: 0, center: 0.5, end: 1 }[ group.stack.justify ];
	const af = { start: 0, center: 0.5, end: 1 }[ group.stack.align ];
	let cursor = ( col ? G.y : G.x ) + Math.max( 0, room - used ) * jf;
	for ( const s of sized ) {
		const h = col ? ( s.auto ? R( s.h * f ) : s.h ) : s.h;
		const w = col ? s.w : s.auto ? R( s.w * f ) : s.w;
		const rect = col
			? { x: R( G.x + ( G.w - w ) * af ), y: R( cursor ), w, h }
			: { x: R( cursor ), y: R( G.y + ( G.h - h ) * af ), w, h };
		rects.set( s.el.id, rect );
		cursor += ( col ? h : w ) + gapEach;
		if ( 'group' === s.el.kind && s.el.stack && depth + 1 < LIMITS.depth ) {
			stackChildren( s.el, rect, { ...c, depth: depth + 1 } );
		}
	}
}
