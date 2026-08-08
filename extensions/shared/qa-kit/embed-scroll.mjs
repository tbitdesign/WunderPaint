/**
 * An embedded viewer must not swallow the page it is sitting in.
 *
 * Every studio that hands out an embed code puts a canvas in the middle
 * of somebody else's article. Two lines of ordinary-looking setup turn
 * that canvas into a trap:
 *
 *   canvas.style.touchAction = 'none';        // nothing scrolls past it
 *   el.addEventListener('wheel', e => {       // on a phone, at all
 *       e.preventDefault();                   // and the wheel is eaten
 *
 * Both are RIGHT inside a studio dialog, where there is no page behind
 * the canvas, and wrong in an embed. The two look identical in review,
 * which is why this is a check and not a code-reading rule: found in the
 * 3D Gallery Studio on 29.07. (page moved 0 pixels), then found again in
 * the Flip Studio the same evening.
 *
 * A viewer passes if a reader can scroll straight past it, and can still
 * zoom it deliberately - after taking hold of it, or with ctrl held.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export const EDITOR = path.resolve(
	path.dirname( new URL( import.meta.url ).pathname ),
	'..',
	'..',
	'..'
);

/**
 * Put a viewer in the middle of a tall page and try to read past it.
 *
 * @param {Object} opts
 *   - name      what is being checked, for the output
 *   - outDir    where to write the scratch page and the screenshot
 *   - html      the embed snippet, exactly as the studio hands it out
 *   - selector  what to wait for inside it (default 'canvas')
 *   - settle    ms to let the viewer boot
 *   - zoomable  false if this viewer has no zoom to protect
 * @return {Promise<number>} count of failures.
 */
export async function embedScrollCheck( opts ) {
	const {
		name = 'viewer',
		outDir,
		html,
		selector = 'canvas',
		settle = 1500,
		zoomable = true,
	} = opts;

	fs.mkdirSync( outDir, { recursive: true } );
	const file = path.join( outDir, 'index.html' );
	fs.writeFileSync(
		file,
		`<!doctype html><html><head><meta charset="utf-8"><title>${ name }</title>
<style>body{margin:0;font:16px/1.6 system-ui}.pad{height:1200px;background:#eee}
.host{width:660px;margin:0 auto}</style></head><body>
<div class="pad">before</div>
<div class="host">${ html }</div>
<div class="pad">after</div>
</body></html>`
	);

	const req = createRequire( path.join( EDITOR, 'node_modules', 'x.js' ) );
	const { chromium } = req( 'playwright' );
	const browser = await chromium.launch( {
		args: [ '--enable-unsafe-swiftshader', '--no-sandbox' ],
	} );
	const page = await browser.newPage( { viewport: { width: 1100, height: 800 } } );
	let errors = 0;
	page.on( 'pageerror', ( e ) => {
		process.stderr.write( 'PAGEERROR: ' + e.message + '\n' );
		errors++;
	} );

	let fails = 0;
	const check = ( cond, msg ) => {
		process.stdout.write( ( cond ? 'ok   ' : 'FAIL ' ) + msg + '\n' );
		if ( ! cond ) {
			fails++;
		}
	};

	await page.goto( 'file://' + file );
	await page.waitForTimeout( settle );

	const view = page.locator( '.host ' + selector ).first();
	check( ( await view.count() ) > 0, `${ name }: the viewer booted inside the article` );
	if ( ! ( await view.count() ) ) {
		await browser.close();
		return fails;
	}

	// touch-action must leave the page a way to scroll. 'none' takes every
	// gesture and makes the viewer a dead spot on a phone.
	const ta = await view.evaluate( ( c ) => getComputedStyle( c ).touchAction );
	check(
		'none' !== ta,
		`${ name }: leaves vertical swiping to the page (touch-action: ${ ta })`
	);

	const scrollOf = () => page.evaluate( () => window.scrollY );
	const overIt = async () => {
		await view.scrollIntoViewIfNeeded();
		await page.waitForTimeout( 250 );
		const b = await view.boundingBox();
		const at = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
		await page.mouse.move( at.x, at.y );
		await page.waitForTimeout( 120 );
		return at;
	};

	await overIt();
	const before = await scrollOf();
	await page.mouse.wheel( 0, 300 );
	await page.waitForTimeout( 350 );
	const after = await scrollOf();
	check(
		after > before + 50,
		`${ name }: the page scrolls straight past it (${ before } -> ${ after })`
	);

	if ( zoomable ) {
		// And it must still be zoomable on purpose, or the fix has just
		// taken the feature away instead of the trap.
		const at = await overIt();
		const held = await scrollOf();
		await page.keyboard.down( 'Control' );
		await page.mouse.wheel( 0, -300 );
		await page.keyboard.up( 'Control' );
		await page.waitForTimeout( 350 );
		check(
			Math.abs( ( await scrollOf() ) - held ) < 30,
			`${ name }: ctrl and the wheel still belong to the viewer`
		);

		await page.mouse.move( at.x, at.y );
		await page.mouse.down();
		await page.mouse.move( at.x + 90, at.y, { steps: 6 } );
		await page.mouse.up();
		await page.waitForTimeout( 250 );
		const engaged = await scrollOf();
		await page.mouse.wheel( 0, 300 );
		await page.waitForTimeout( 350 );
		check(
			Math.abs( ( await scrollOf() ) - engaged ) < 30,
			`${ name }: and after taking hold of it, so does the bare wheel`
		);
	}

	await page.screenshot( { path: path.join( outDir, 'embed-article.png' ) } );
	check( 0 === errors, `${ name }: no errors on the page (${ errors })` );
	await browser.close();
	return fails;
}
