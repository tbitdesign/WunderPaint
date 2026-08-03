/**
 * Font management (v1.316): fonts-data.json is the full CATALOG. Only the 10
 * SHIPPED families (fonts-shipped.json) ship as woff2 with @font-face rules in
 * assets/fonts.css. The rest become available either after the one-time server
 * download (uploads/wpie-fonts/fonts.css; families listed in
 * window.WPIE.fontsDownloaded) or through the opt-in Google Fonts CDN. A family
 * is drawable only when it is bundled, downloaded, custom-uploaded or CDN-on;
 * the picker shows only those. The renderer awaits `document.fonts.load` so
 * canvas text never draws before its face is ready.
 */

import fontsData from './fonts-data.json';
import shippedList from './fonts-shipped.json';
import googleFonts from './google-fonts.json';

/** System families that are always available (no file to load). */
export const SYSTEM_FONTS = [ 'Helvetica', 'Arial', 'Georgia' ];

/** The families whose woff2 ship in the plugin (assets/fonts.css). */
export const SHIPPED_FONTS = new Set( shippedList );

/** Families the admin downloaded to uploads/wpie-fonts (served locally). */
export const downloadedFamilies = () => window.WPIE?.fontsDownloaded || [];
const isDownloaded = ( family ) => downloadedFamilies().includes( family );

/* ------------------------- optional font sources ------------------------ *
 * v1.136.0: two sources join the built-ins.
 *  - Custom fonts: uploaded in Settings → Fonts; their @font-face rules
 *    arrive with the editor page, we only await document.fonts.
 *  - Google Fonts CDN: admin OPT-IN; families load on demand through one
 *    <link> per family (privacy note lives on the settings page).
 */

/** Uploaded custom families (Settings → Fonts). */
export const customFamilies = () =>
	( window.WPIE?.customFonts || [] ).map( ( f ) => f.family );

/** Whether the Google Fonts CDN source is enabled by the admin. */
export const googleEnabled = () => !! window.WPIE?.fontsGoogle;

/** The curated CDN catalog (only meaningful when googleEnabled()). */
export const GOOGLE_FONTS = googleFonts.filter(
	( family ) => ! fontsData[ family ]
);

const googleLinked = new Map();

/**
 * Inject the css2 <link> for one CDN family (idempotent) and resolve once
 * the stylesheet has arrived. Awaiting this matters: document.fonts.load()
 * resolves empty (and would poison the cache) while the @font-face rules
 * are still in flight.
 *
 * @param {string} family Google family name.
 * @return {Promise<void>} Resolves when the stylesheet is loaded (or failed).
 */
function linkGoogleFont( family ) {
	if ( 'undefined' === typeof document ) {
		return Promise.resolve();
	}
	if ( ! googleLinked.has( family ) ) {
		googleLinked.set(
			family,
			new Promise( ( resolve ) => {
				const link = document.createElement( 'link' );
				link.rel = 'stylesheet';
				link.href =
					'https://fonts.googleapis.com/css2?family=' +
					encodeURIComponent( family ).replace( /%20/g, '+' ) +
					':ital,wght@0,400;0,700;1,400&display=swap';
				link.onload = () => resolve();
				link.onerror = () => resolve();
				document.head.appendChild( link );
			} )
		);
	}
	return googleLinked.get( family );
}

/** Self-hosted families → the weights that ship as woff2. */
export const LOCAL_FONTS = fontsData;

/** All pickable families: Inter first, system fonts, then the rest A–Z. */
export const ALL_FONT_FAMILIES = ( () => {
	const local = Object.keys( LOCAL_FONTS ).sort( ( a, b ) =>
		a.localeCompare( b )
	);
	const rest = local.filter( ( f ) => 'Inter' !== f );
	return [ 'Inter', ...SYSTEM_FONTS, ...rest ];
} )();

/** Nearest available weight for a family (canvas must match a real face). */
export function nearestWeight( family, weight ) {
	// Bundled and downloaded faces carry every catalog weight; a family
	// pulled from the CDN only has the two the css2 <link> requests.
	const localWeights =
		( SHIPPED_FONTS.has( family ) || isDownloaded( family ) ) &&
		LOCAL_FONTS[ family ];
	let weights = localWeights || null;
	if (
		! weights &&
		googleEnabled() &&
		( !! LOCAL_FONTS[ family ] || GOOGLE_FONTS.includes( family ) )
	) {
		weights = [ 400, 700 ]; // the css2 link loads exactly these
	}
	if ( ! weights || ! weights.length ) {
		return weight;
	}
	return weights.reduce(
		( best, w ) =>
			Math.abs( w - weight ) < Math.abs( best - weight ) ? w : best,
		weights[ 0 ]
	);
}

/**
 * Whether a family is drawable RIGHT NOW: a system face, one of the bundled
 * ten, a downloaded catalog face, a custom upload, or - when the CDN is on -
 * any catalog / extra Google family. This is what the picker filters on, so a
 * catalog family that is neither bundled nor downloaded stays hidden until the
 * admin downloads the library or enables the CDN (no phantom fallbacks).
 */
export const isLoadableFamily = ( family ) =>
	SYSTEM_FONTS.includes( family ) ||
	SHIPPED_FONTS.has( family ) ||
	isDownloaded( family ) ||
	customFamilies().includes( family ) ||
	( googleEnabled() &&
		( !! LOCAL_FONTS[ family ] || GOOGLE_FONTS.includes( family ) ) );

const loaded = new Set();

/**
 * Ensure a family is drawable on the canvas: await its self-hosted face.
 * System families and unknown names resolve immediately.
 *
 * @param {string} family Family name.
 * @param {number} weight Desired weight (nearest shipped one is loaded).
 * @return {Promise<void>} Resolves when the face is ready.
 */
export async function ensureFont( family, weight = 400 ) {
	if (
		! family ||
		SYSTEM_FONTS.includes( family ) ||
		typeof document === 'undefined' ||
		! document.fonts
	) {
		return;
	}
	// Bundled, downloaded and custom faces already have same-origin
	// @font-face rules on the page; anything beyond those needs the opt-in
	// CDN <link> injected first.
	const isLocal =
		SHIPPED_FONTS.has( family ) ||
		isDownloaded( family ) ||
		customFamilies().includes( family );
	const viaCdn =
		! isLocal &&
		googleEnabled() &&
		( !! LOCAL_FONTS[ family ] || GOOGLE_FONTS.includes( family ) );
	if ( ! isLocal && ! viaCdn ) {
		return;
	}
	if ( viaCdn ) {
		await linkGoogleFont( family );
	}
	const face = `${ nearestWeight( family, weight ) } 16px "${ family }"`;
	if ( loaded.has( face ) ) {
		return;
	}
	try {
		await document.fonts.load( face );
		await document.fonts.ready;
		// Cache only truly resident faces; a failed load stays retryable
		// (e.g. the CDN stylesheet was blocked on the first attempt).
		if ( ! document.fonts.check || document.fonts.check( face ) ) {
			loaded.add( face );
		}
	} catch ( e ) {
		// Missing file: canvas falls back to sans-serif silently.
	}
}

/** Preload every self-hosted font a layer stack uses (called from warm()). */
export async function ensureFontsForLayers( layers ) {
	const wanted = new Map();
	const collect = ( list ) => {
		for ( const layer of list || [] ) {
			if (
				'text' === layer.type &&
				layer.fontFamily &&
				isLoadableFamily( layer.fontFamily )
			) {
				wanted.set( layer.fontFamily + '|' + ( layer.weight || 400 ), [
					layer.fontFamily,
					layer.weight || 400,
				] );
			}
			// Per-line (v1.45) and per-span (v1.46) style overrides may use
			// their own families.
			if ( 'text' === layer.type ) {
				const overrides = [
					...( Array.isArray( layer.lineStyles )
						? layer.lineStyles
						: [] ),
					...( Array.isArray( layer.spans )
						? layer.spans.map( ( r ) => r?.s )
						: [] ),
				];
				for ( const s of overrides ) {
					if ( s?.family && isLoadableFamily( s.family ) ) {
						wanted.set( s.family + '|' + ( s.weight || 400 ), [
							s.family,
							s.weight || 400,
						] );
					}
				}
			}
			if ( layer.embedded?.layers ) {
				collect( layer.embedded.layers );
			}
		}
	};
	collect( layers );
	await Promise.all(
		Array.from( wanted.values() ).map( ( [ family, weight ] ) =>
			ensureFont( family, weight )
		)
	);
}

/** Test hook. */
export const __resetFontCache = () => {
	loaded.clear();
};
