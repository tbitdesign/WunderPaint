/**
 * Shared AI provider display names. Generic on purpose: the exact model
 * is configurable in Settings, so the UI never hardcodes a model version.
 */

export const PROVIDER_LABELS = {
	gemini: 'Google Gemini',
	openai: 'OpenAI',
};

/**
 * Any text-capable provider configured? (Anthropic, OpenAI and Gemini can
 * all run captions, SEO, design specs and illustrations since v1.71.)
 *
 * The argument defaults to the bootstrap flags since v1.353.0. It used to be
 * required, while docs/extending.md and types/wpie-extension.d.ts both showed
 * `bridge.providers.hasTextProvider()` as a feature test - which returned
 * false on every installation, so any extension gating on it switched its AI
 * features off everywhere and the fault felt like a missing API key.
 *
 * `core` is WordPress' own AI client (7.0): the site owner configured a
 * provider once, at site level, and the plugin borrows it when it has no key
 * of its own. It counts here because plain text generation works through it.
 * It deliberately does NOT count in the per-provider checks elsewhere: that
 * path carries no image and no web search.
 *
 * @param {Object} [providers] WPIE.providers flags. Defaults to the
 *                             bootstrap object.
 * @return {boolean} Whether text AI features are available.
 */
export const hasTextProvider = ( providers = window.WPIE?.providers ) =>
	!! (
		providers?.anthropic ||
		providers?.openai ||
		providers?.gemini ||
		providers?.core
	);
