/**
 * The checks every studio dialog deserves, in one place.
 *
 * Written after a week in which four defects reached a user through
 * green test suites. None of them were arithmetic. They were a control
 * that quietly did nothing, a shape that came back a colour nobody asked
 * for, a group that listed every child twice, and a panel writing into
 * an object the canvas had already replaced. Unit tests cannot see any
 * of that; a pointer can.
 *
 *   import { baseline } from '../../shared/qa-kit/baseline.mjs';
 *   const report = await baseline( qa, { insert: true } );
 *
 * What it does, in order:
 *
 *   1. The dialog opened, and nothing threw on the way.
 *   2. Every control in the panel is nudged, and the ones that change
 *      nothing at all are reported. Not every one of them is a bug (a
 *      name field changes nothing visible), so this is a list to read
 *      rather than a failure - but a slider in that list is a bug.
 *   3. The primary button hands the editor layers, and those layers hold
 *      together: parents exist, no child arrives before its parent, no
 *      group lists the same child twice, everything is placed and sized.
 */

/**
 * A fingerprint of what the dialog looks like right now.
 *
 * Read at the canvas's own resolution, with a stride. Scaling a preview
 * down to a thumbnail first was cheaper and useless: a calendar in
 * October and the same calendar in July are the same handful of pixels
 * once they are 64 across, so every control looked dead.
 *
 * It is an expression that CALLS itself on purpose. page.evaluate with a
 * string evaluates the string; handing it a bare function expression
 * yields the function, which crosses back as undefined, and then every
 * comparison says nothing changed. That is a rubber stamp, not a test.
 */
const SIGNATURE = `( () => {
	const root = document.querySelector( '.dsm' ) || document.body;
	// Not every preview is a canvas. A stage built from DOM changes its
	// inline styles and classes when the look changes, and neither the
	// text nor the element count moves at all.
	let sig = root.innerText.length + ':' + root.innerHTML.length;
	let dom = 0;
	for ( const el of root.querySelectorAll( '*' ) ) {
		const t = ( el.getAttribute( 'style' ) || '' ) + '#' + ( el.className || '' );
		for ( let i = 0; i < t.length; i++ ) {
			dom = ( dom * 31 + t.charCodeAt( i ) ) >>> 0;
		}
	}
	sig += ':' + dom;
	for ( const c of root.querySelectorAll( 'canvas' ) ) {
		if ( ! c.width || ! c.height ) {
			continue;
		}
		try {
			const g = c.getContext( '2d' );
			if ( ! g ) {
				// WebGL: its own drawing buffer is not readable this way,
				// so the size is all there is to go on.
				sig += '|gl' + c.width + 'x' + c.height;
				continue;
			}
			const d = g.getImageData( 0, 0, c.width, c.height ).data;
			const step = Math.max( 4, 4 * Math.floor( d.length / 4 / 40000 ) );
			let h = 0;
			for ( let i = 0; i < d.length; i += step ) {
				h = ( h * 31 + d[ i ] + d[ i + 1 ] * 7 + d[ i + 3 ] ) >>> 0;
			}
			sig += '|' + h;
		} catch ( e ) {
			sig += '|x';
		}
	}
	return sig;
} )()`;

/**
 * Run the shared checks against an open dialog.
 *
 * @param {Object}  qa                The object launchQA returned.
 * @param {Object}  [opts]            Options.
 * @param {boolean} [opts.insert]     Press the primary button at the end.
 * @param {number}  [opts.settle]     Milliseconds to wait after each nudge.
 * @param {Array}   [opts.skip]       Control labels to leave alone.
 * @param {number}  [opts.maxControls] Stop after this many controls.
 * @param {boolean} [opts.startsEmpty] This studio needs material first, so an
 *                                     empty stage and a disabled button are
 *                                     the expected starting point.
 * @return {Promise<Object>} `{ inert, added, errors }`.
 */
export async function baseline( qa, opts = {} ) {
	const { page, check } = qa;
	// Most studios debounce their preview by two or three hundred
	// milliseconds, so a shorter wait than this reports live controls as
	// dead and buries the real ones.
	const settle = opts.settle ?? 700;
	const skip = ( opts.skip || [] ).map( ( s ) => s.toLowerCase() );
	const max = opts.maxControls ?? 40;

	const titled = await page.locator( '.dsm-title' ).count();
	check(
		titled > 0 || ( await page.locator( '.dsm, [class*="dialog"]' ).count() ) > 0,
		`the dialog opened (${ titled ? 'shared shell' : 'own shell' })`
	);
	// A studio that has nothing to work on yet shows nothing yet: a wave
	// needs a sound file, a route needs a track. Say so rather than
	// calling an empty stage a defect.
	const canvases = await page.locator( '.dsm canvas, .wpie-dialog canvas' ).count();
	const pictures = await page.locator( '.dsm img, .wpie-dialog img' ).count();
	check(
		canvases > 0 || pictures > 0 || true === opts.startsEmpty,
		`it shows something (${ canvases } canvases, ${ pictures } pictures)`
	);

	/* ------------------------- controls that live ------------------------ */

	const inert = [];
	const controls = await page.evaluate( () => {
		// The shared shell is `.dsm`; the studios that predate it bring
		// their own, so fall back to whatever is on the page rather than
		// sweeping nothing and calling it a pass.
		const root =
			document.querySelector( '.dsm' ) ||
			document.querySelector( '[class*="dialog"]' ) ||
			document.body;
		const out = [];
		const seen = new Set();
		root.querySelectorAll(
			'input[type="range"], select, input[type="checkbox"]'
		).forEach( ( el, i ) => {
			// Name it by whatever the eye would call it.
			const row = el.closest(
				'.dsm-sliderrow, .dsm-rowline, .dsm-checkrow, label'
			);
			const label = (
				( row && row.innerText ) ||
				el.getAttribute( 'aria-label' ) ||
				el.name ||
				el.type
			)
				.split( '\n' )[ 0 ]
				.trim()
				.slice( 0, 40 );
			// A control in a panel nobody can see is not expected to change
			// anything, and reporting it as dead would bury the ones that are.
			if ( ! el.offsetParent && 'fixed' !== getComputedStyle( el ).position ) {
				return;
			}
			const key = el.type + ':' + label + ':' + i;
			if ( seen.has( key ) ) {
				return;
			}
			seen.add( key );
			el.setAttribute( 'data-qa-control', String( out.length ) );
			out.push( { index: out.length, label, kind: el.type, tag: el.tagName } );
		} );
		return out;
	} );

	for ( const control of controls.slice( 0, max ) ) {
		if ( skip.some( ( s ) => control.label.toLowerCase().includes( s ) ) ) {
			continue;
		}
		const was = await page.evaluate( ( index ) => {
			const el = document.querySelector( `[data-qa-control="${ index }"]` );
			if ( ! el ) {
				return null;
			}
			return 'checkbox' === el.type ? el.checked : el.value;
		}, control.index );
		const before = await page.evaluate( SIGNATURE );
		const moved = await page.evaluate( ( index ) => {
			const el = document.querySelector( `[data-qa-control="${ index }"]` );
			if ( ! el ) {
				return false;
			}
			const fire = ( type ) =>
				el.dispatchEvent( new Event( type, { bubbles: true } ) );
			if ( 'range' === el.type ) {
				const min = Number( el.min || 0 );
				const max2 = Number( el.max || 100 );
				const now = Number( el.value );
				// Move to whichever end is further away, so a nudge is
				// never lost in rounding.
				el.value = String(
					Math.abs( now - min ) > Math.abs( now - max2 ) ? min : max2
				);
				fire( 'input' );
				fire( 'change' );
				return true;
			}
			if ( 'checkbox' === el.type ) {
				el.checked = ! el.checked;
				fire( 'change' );
				return true;
			}
			if ( 'SELECT' === el.tagName && el.options.length > 1 ) {
				el.selectedIndex = ( el.selectedIndex + 1 ) % el.options.length;
				fire( 'change' );
				return true;
			}
			return false;
		}, control.index );
		if ( ! moved ) {
			continue;
		}
		await page.waitForTimeout( settle );
		const after = await page.evaluate( SIGNATURE );
		if ( before === after ) {
			inert.push( `${ control.label } (${ control.kind })` );
		}
		// Put it back. Without this the sweep walks the studio into a
		// corner - switching the record mode to "hand-picked" empties the
		// stage - and every control after that looks dead for a reason
		// the sweep caused itself.
		await page.evaluate(
			( { index, value } ) => {
				const el = document.querySelector( `[data-qa-control="${ index }"]` );
				if ( ! el || null === value ) {
					return;
				}
				if ( 'checkbox' === el.type ) {
					el.checked = value;
				} else {
					el.value = value;
				}
				el.dispatchEvent( new Event( 'input', { bubbles: true } ) );
				el.dispatchEvent( new Event( 'change', { bubbles: true } ) );
			},
			{ index: control.index, value: was }
		);
		await page.waitForTimeout( Math.min( 400, settle ) );
	}

	// Deliberately a report rather than a verdict. A control can sit in a
	// panel that is not showing, or drive an export rather than a
	// preview, and calling that a defect would bury the ones that are.
	// What this pass really proves is the check below it: every handler
	// in the studio ran, and none of them threw.
	const swept = controls.length;
	qa.note(
		`${ swept } controls moved, ${ inert.length } changed nothing visible` +
			( inert.length ? `: ${ inert.slice( 0, 12 ).join( ', ' ) }` : '' )
	);
	check(
		swept > 0 || true === opts.noControls,
		`the panel offers controls (${ swept })`
	);
	check(
		0 === qa.failures(),
		'nothing threw while every control was moved'
	);

	/* ------------------------------ inserting ---------------------------- */

	let added = [];
	if ( false !== opts.insert ) {
		const before = await page.evaluate(
			() => ( window.__editor.state.layers || [] ).map( ( l ) => l.id )
		);
		// Not every studio puts its footer in .dsm-actions; the button
		// that matters is the primary one, wherever it hangs.
		const primary = page
			.locator( '.dsm .ai-btn.primary, .dsm button.primary' )
			.last();
		const ready = ( await primary.count() ) && ! ( await primary.isDisabled() );
		if ( ! ready ) {
			// Some studios cannot insert until they have been given
			// something to work with: a sound file, a place, a picture.
			// That is not a defect, it is a different starting point, and
			// the caller says so by handing over a `prepare` step.
			check(
				! ( await primary.count() ) || true === opts.startsEmpty,
				'the primary button is ready to press'
			);
			return { inert, added: [] };
		}
		await primary.click();
		await page.waitForTimeout( opts.insertWait ?? 900 );
		const delivery = await page.evaluate( ( had ) => {
			const acts = window.__dispatched || [];
			const seen = new Set( had );
			const set = acts.filter( ( a ) => 'SET_LAYERS' === a.type ).pop();
			const fromSet = set ? set.layers.filter( ( l ) => ! seen.has( l.id ) ) : [];
			const fromAdd = acts
				.filter( ( a ) => 'ADD_LAYER' === a.type )
				.map( ( a ) => a.layer );
			return fromSet.length
				? { how: 'SET_LAYERS', layers: fromSet }
				: { how: 'ADD_LAYER', layers: fromAdd };
		}, before );
		added = delivery.layers;

		if ( ! added.length && true === opts.startsEmpty ) {
			// It let itself be pressed and produced nothing, which for a
			// studio that needs material first is the honest answer: it
			// asked for a picture, a track or a format and got none.
			qa.note( 'pressing it produced nothing, which this studio needs material for' );
			return { inert, added };
		}
		check( added.length > 0, `pressing it hands the editor layers (${ added.length })` );
		if ( added.length ) {
			const byId = new Map( added.map( ( l ) => [ l.id, l ] ) );
			const orphans = added.filter(
				( l ) => l.parent && ! byId.has( l.parent )
			);
			check(
				0 === orphans.length,
				`every layer is filed under one that came with it (${ orphans.length } orphans)`
			);
			// Only ADD_LAYER cares about the order: its reducer appends the
			// child's id to the parent it names, so the parent has to be
			// there already. SET_LAYERS hands over the whole list at once,
			// and the renderer walks it from the layers without a parent
			// and recurses by id, so where a child sits in the array does
			// not matter at all.
			if ( 'ADD_LAYER' === delivery.how ) {
				check(
					added.every(
						( l ) =>
							! l.parent ||
							added.indexOf( byId.get( l.parent ) ) < added.indexOf( l )
					),
					'and no child arrives before its parent'
				);
			}
			const doubled = added.filter(
				( l ) =>
					'group' === l.type &&
					( l.children || [] ).length !==
						new Set( l.children || [] ).size
			);
			check(
				0 === doubled.length,
				`no group lists the same child twice (${ doubled
					.map( ( l ) => l.name )
					.join( ', ' ) || 'none' })`
			);
			check(
				added.every(
					( l ) =>
						Number.isFinite( l.x ) &&
						Number.isFinite( l.y ) &&
						l.w >= 0 &&
						l.h >= 0
				),
				'all of them placed and sized'
			);
			check(
				added.every(
					( l ) =>
						'group' !== l.type ||
						( l.children || [] ).every( ( id ) => 'string' === typeof id )
				),
				'groups carry ids, the way the document stores them'
			);
		}
	}

	return { inert, added };
}
