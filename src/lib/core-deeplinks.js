/**
 * Deeplink names for the core's own features (v1.361.0).
 *
 * The `?wpie-open=` deeplink used to find only what the extension registry
 * knows: extension generators, core generators and extension menu items.
 * The core's own studios are none of those - they are plain actions on the
 * editor's `extras` object, the same ones the menu bar calls. So the
 * marketing site could link straight into any of the 28 extensions but not
 * into a single one of its 22 features; those links all landed on the demo
 * start page and left the visitor to find the studio themselves.
 *
 * This is the missing piece: a name for each of those actions.
 *
 * Three decisions worth keeping:
 *
 * 1. **The names are the marketing site's own slugs.** `check-contrast` is
 *    the slug of the page that links here. Nobody has to maintain a second
 *    vocabulary, and a wrong link is obvious to read.
 *
 * 2. **The `wpie-core/` prefix is reserved** (see lib/core-generators.js),
 *    so a core name can never collide with an extension slug - not even
 *    with one written years from now.
 *
 * 3. **The map is explicit, not derived from the action names.** Deriving
 *    `check-contrast` from `openContrast` would tie a public URL that lives
 *    on a marketing page to an internal function name, and the next rename
 *    would break links silently. The mapping below is the contract.
 */

/**
 * Public deeplink name (without the `wpie-core/` prefix) => the `extras`
 * action that opens it. Measured against the menu bar's own labels, not
 * guessed: every entry here is the action the menu item with that feature's
 * name calls.
 *
 * @type {Object<string,string>}
 */
export const CORE_DEEPLINKS = {
	actions: 'openActions',
	'asset-generator': 'openGenerate',
	'asset-library': 'openLibrary',
	'background-studio': 'openBackgroundStudio',
	'batch-watermark': 'openBatchWatermark',
	'brand-kits': 'openBrandKits',
	'chart-table': 'openChart',
	'check-contrast': 'openContrast',
	'color-schemer': 'openColorSchemer',
	'content-generator': 'openCreatePost',
	'design-generator': 'openDesignAssistant',
	'dynamic-templates': 'openTemplatePicker',
	'featured-images': 'openAutomate',
	'generate-from-csv': 'openMerge',
	'image-processor': 'openBatch',
	'media-library-manager': 'openMediaLibrary',
	'metadata-assistant': 'openAltText',
	'mockup-generator': 'openMockup',
	'qr-code-generator': 'openQr',
	'screenshot-beautifier': 'openBeautify',
	'stock-images': 'openStock',
	'vignette-film': 'openVignette',
};

/** Prefix reserved for the core, so nothing can shadow these names. */
export const CORE_PREFIX = 'wpie-core/';

/**
 * Resolve a `?wpie-open=` value to a core action name.
 *
 * Only the prefixed form counts. An unprefixed `check-contrast` is
 * deliberately NOT accepted: without the prefix an extension could take the
 * name later and the same link would suddenly open something else.
 *
 * @param {string} want The raw deeplink value.
 * @return {string|null} The `extras` action name, or null.
 */
export function coreDeeplinkAction( want ) {
	const raw = String( want || '' );
	if ( ! raw.startsWith( CORE_PREFIX ) ) {
		return null;
	}
	return CORE_DEEPLINKS[ raw.slice( CORE_PREFIX.length ) ] || null;
}
