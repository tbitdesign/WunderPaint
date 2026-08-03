/**
 * Client/device facts for System Status and the support log export
 * (v1.306): browser, OS, display, CPU/RAM and the graphics stack -
 * the "does this machine have hardware WebGL?" question answers most
 * "the 3D studios freeze" support cases in one look.
 */

/** Probe WebGL once: version, renderer string, software vs hardware. */
function probeWebgl() {
	try {
		const probe = document.createElement( 'canvas' );
		const gl2 = probe.getContext( 'webgl2' );
		const gl = gl2 || probe.getContext( 'webgl' );
		if ( ! gl ) {
			return { version: 'none', renderer: '', software: false };
		}
		const dbg = gl.getExtension( 'WEBGL_debug_renderer_info' );
		let renderer = dbg
			? String( gl.getParameter( dbg.UNMASKED_RENDERER_WEBGL ) )
			: '';
		if ( ! renderer ) {
			// Newer Firefox deprecates the debug extension; RENDERER is
			// generic there but still catches software rasterizers.
			renderer = String( gl.getParameter( gl.RENDERER ) || '' );
		}
		const lose = gl.getExtension( 'WEBGL_lose_context' );
		if ( lose ) {
			lose.loseContext();
		}
		return {
			version: gl2 ? 'webgl2' : 'webgl',
			renderer,
			software: /swiftshader|llvmpipe|software|basic render/i.test(
				renderer
			),
		};
	} catch ( e ) {
		return { version: 'none', renderer: '', software: false };
	}
}

/**
 * Collect the client snapshot. Static per session, cheap to call once.
 *
 * @return {Object} Facts, all primitive and JSON-safe.
 */
export function collectClientInfo() {
	const nav = window.navigator || {};
	const uaData = nav.userAgentData;
	const brands = ( uaData?.brands || [] )
		.filter( ( b ) => ! /not.?a.?brand/i.test( b.brand ) )
		.map( ( b ) => `${ b.brand } ${ b.version }` );
	// Firefox/Safari have no userAgentData - derive a readable name.
	const uaName = ( ( ua ) => {
		const pick = [
			[ /Edg\/([\d.]+)/, 'Edge' ],
			[ /OPR\/([\d.]+)/, 'Opera' ],
			[ /Firefox\/([\d.]+)/, 'Firefox' ],
			[ /Chrome\/([\d.]+)/, 'Chrome' ],
			[ /Version\/([\d.]+).*Safari/, 'Safari' ],
		];
		for ( const [ re, name ] of pick ) {
			const m = re.exec( ua );
			if ( m ) {
				return `${ name } ${ m[ 1 ].split( '.' )[ 0 ] }`;
			}
		}
		return '';
	} )( nav.userAgent || '' );
	const platformName =
		{ Win32: 'Windows', MacIntel: 'macOS' }[
			uaData?.platform || nav.platform
		] ||
		uaData?.platform ||
		nav.platform ||
		'';
	const gl = probeWebgl();
	return {
		browser: brands.join( ', ' ) || uaName,
		userAgent: nav.userAgent || '',
		platform: platformName,
		language: nav.language || '',
		cores: nav.hardwareConcurrency || 0,
		// deviceMemory is capped at 8 by spec; still useful as a floor.
		memoryGb: nav.deviceMemory || 0,
		screen: window.screen
			? `${ window.screen.width }×${ window.screen.height }`
			: '',
		dpr: window.devicePixelRatio || 1,
		viewport: `${ window.innerWidth }×${ window.innerHeight }`,
		touch: !! ( nav.maxTouchPoints > 0 ),
		webgl: gl.version,
		glRenderer: gl.renderer,
		glSoftware: gl.software,
		webgpu: !! nav.gpu,
		offscreenCanvas: 'undefined' !== typeof window.OffscreenCanvas,
	};
}
