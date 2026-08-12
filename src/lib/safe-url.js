/**
 * One place that decides whether a URL somebody else wrote may become an
 * href.
 *
 * The rule is an allowlist of the four shapes a link in this editor can
 * legitimately have, because a denylist only starts an argument about
 * spelling: `JaVaScRiPt:`, `java\tscript:`, a leading control byte. None of
 * those begin with `https:`, `mailto:`, `tel:`, `/` or `#`, so none of them
 * get past a list that says what IS allowed.
 *
 * Why this matters here and not everywhere: WordPress 7.0.3 ships React
 * 18.3.1, and React writes a `javascript:` href into the DOM unchanged and
 * runs it when the link is clicked. React escapes text and attribute values,
 * so it stops the attribute-breakout kind of injection by itself - it does
 * not stop this one.
 */

/**
 * A URL fit to hand to an href, or an empty string.
 *
 * A protocol-relative address (`//host/path`) is refused as well. It carries
 * no script, but it reads like a path and lands on another host, and remote
 * data must not be able to redirect our own buttons.
 *
 * @param {*} url Anything; only strings can pass.
 * @return {string} The trimmed URL, or '' if it is not one of the allowed shapes.
 */
export function safeUrl( url ) {
	if ( 'string' !== typeof url ) {
		return '';
	}
	const value = url.trim();
	if ( value.startsWith( '//' ) ) {
		return '';
	}
	return /^(https?:|mailto:|tel:|\/|#)/i.test( value ) ? value : '';
}
