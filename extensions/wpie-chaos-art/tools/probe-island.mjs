import fs from 'node:fs';
import { chromium } from 'playwright-core';
const out = process.argv[ 2 ];
const browser = await chromium.launch( {
	executablePath:
		process.env.HOME +
		'/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
	args: [
		'--no-sandbox',
		'--disable-gpu',
		'--use-gl=swiftshader',
		'--enable-unsafe-swiftshader',
	],
} );
const page = await (
	await browser.newContext( { viewport: { width: 1600, height: 1000 } } )
).newPage();
const errors = [];
page.on( 'pageerror', ( e ) => errors.push( 'PAGEERROR: ' + e.message ) );
await page.addInitScript( () => {
	try {
		localStorage.setItem( 'wpie-tour-done', '1' );
	} catch ( e ) {}
} );
await page.goto( 'http://127.0.0.1:8791/index.html', {
	waitUntil: 'load',
	timeout: 60000,
} );
await page.waitForTimeout( 2000 );
await page.getByRole( 'button', { name: 'Open the studio' } ).first().click();
await page.waitForTimeout( 2000 );
const name = page.getByPlaceholder( /summer sale banner/i );
if ( await name.count() ) {
	await name.first().fill( 'Island probe' );
	await page.waitForTimeout( 200 );
	await page.locator( '.modal-backdrop .ai-btn.primary' ).first().click();
}
await page.waitForSelector( '.ed-canvas-area', { timeout: 60000 } );
await page.waitForTimeout( 1000 );
const res = await page.evaluate(
	async ( [ fam, stepsList ] ) => {
		const kit = window.WPIE.bridge.paint;
		const w = kit.wet;
		const SC = w.SC;
		const isle = 'paste' === fam ? w.createPaste() : w.createLiquid();
		const style = 'paste' === fam ? 'oil' : 'watercolour';
		const tip = 'paste' === fam ? 'oil-filbert' : 'wash-round';
		if ( isle.setPaper ) {
			isle.setPaper(
				w.PAPERS[ 'paste' === fam ? 'canvas' : 'cold-press' ] || null
			);
		}
		const ok = isle.ensure( { x: 300, y: 200, w: 500, h: 400 } );
		if ( isle.setGround ) {
			isle.setGround( null );
		}
		const preset = w.WET_STYLES[ style ];
		const tune = w.tuned( style, {} );
		const stroke = {
			family: fam,
			press: 1,
			tilt: 0,
			tip,
			size: 60,
			hardness: 85,
			docW: 1000,
			docH: 1000,
			gran: tune.gran,
		};
		if ( 'liquid' === fam ) {
			stroke.water =
				( preset.water[ 0 ] + preset.water[ 1 ] ) * tune.waterMul;
			stroke.pigment = preset.pigment * tune.pigMul;
			Object.assign(
				stroke,
				w.pigmentOf( '#8e2a9c', tune.sBase, preset.kMul )
			);
		} else {
			stroke.water =
				( preset.thick[ 0 ] + preset.thick[ 1 ] ) * tune.waterMul;
			stroke.pigment = preset.pigRate;
			Object.assign(
				stroke,
				w.pigmentOf( '#8e2a9c', tune.sBase, preset.kMul )
			);
		}
		const params =
			'liquid' === fam
				? {
						evapK: tune.evapK,
						sogK: tune.sogK,
						korn: tune.korn,
						depK: tune.depK,
						liftK: tune.liftK,
						viscK: tune.visc,
						seedK: 0,
				  }
				: {
						openK: tune.openK,
						blendK: tune.blendK,
						body: preset.body,
						gloss: preset.gloss,
						korn: tune.korn,
						pickK: tune.pickK ?? 0,
						advK: tune.advK ?? 0,
				  };
		isle.setParams( params );
		if ( isle.strokeBegin ) {
			isle.strokeBegin();
		}
		// one 60 px dab: segment from (500,380) to (560,400)
		const a = { x: 500, y: 380 },
			b = { x: 560, y: 400 };
		const reach = kit.tips.stampMaxReach( tip, 60, stroke ) + 2;
		const x0 = Math.min( a.x, b.x ) - reach,
			y0 = Math.min( a.y, b.y ) - reach,
			x1 = Math.max( a.x, b.x ) + reach,
			y1 = Math.max( a.y, b.y ) + reach;
		const gx = Math.floor( x0 / SC ),
			gy = Math.floor( y0 / SC ),
			gw = Math.ceil( ( x1 - x0 ) / SC ) + 1,
			gh = Math.ceil( ( y1 - y0 ) / SC ) + 1;
		const sc = document.createElement( 'canvas' );
		sc.width = gw;
		sc.height = gh;
		const ctx = sc.getContext( '2d', { willReadFrequently: true } );
		ctx.setTransform( 1 / SC, 0, 0, 1 / SC, -gx, -gy );
		if ( 'paste' === fam ) {
			isle.setParams( { advX: 0.95, advY: 0.31 } );
		}
		kit.drawStroke(
			ctx,
			{
				d: `M ${ a.x } ${ a.y } L ${ b.x } ${ b.y }`,
				pts: [ a, b ],
				color: '#000000',
				size: 60,
				opacity: 1,
				flow: 1,
				tip,
			},
			85
		);
		const img = ctx.getImageData( 0, 0, gw, gh );
		const alpha = new Float32Array( gw * gh );
		let cov = 0;
		for ( let i = 0; i < gw * gh; i++ ) {
			alpha[ i ] = img.data[ i * 4 + 3 ] / 255;
			if ( alpha[ i ] > 0.1 ) cov++;
		}
		isle.stamp( { data: alpha, w: gw, h: gh, gx, gy }, stroke );
		if ( isle.strokeEnd ) {
			isle.strokeEnd();
		}
		const shots = [];
		for ( const n of stepsList ) {
			if ( n ) {
				isle.steps( n );
			}
			isle.render();
			shots.push( {
				n,
				url: isle.canvas.toDataURL( 'image/png' ),
				wet: isle.wet,
			} );
		}
		return {
			ok,
			reach,
			gx,
			gy,
			gw,
			gh,
			cov,
			rx: isle.rx,
			ry: isle.ry,
			rw: isle.rw,
			rh: isle.rh,
			cw: isle.canvas.width,
			ch: isle.canvas.height,
			SC,
			shots,
		};
	},
	[
		process.argv[ 3 ] || 'paste',
		( process.env.STEPS || '0,100,400' ).split( ',' ).map( Number ),
	]
);
const { shots, ...info } = res;
console.log( JSON.stringify( info ) );
shots.forEach( ( s ) =>
	fs.writeFileSync(
		`${ out }/island-${ process.argv[ 3 ] || 'paste' }-${ s.n }.png`,
		Buffer.from( s.url.split( ',' )[ 1 ], 'base64' )
	)
);
console.log(
	'wet after steps:',
	shots
		.map(
			( s ) =>
				s.n +
				':' +
				( s.wet && s.wet.toFixed ? s.wet.toFixed( 2 ) : s.wet )
		)
		.join( ' ' )
);
console.log( 'errors:', errors.join( ' | ' ) || 'none' );
await browser.close();
