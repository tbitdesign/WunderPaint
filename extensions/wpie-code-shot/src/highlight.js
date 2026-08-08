/**
 * Local syntax highlighting: highlight.js core with a curated language set.
 * We take highlight.js's escaped HTML output and parse it into lines of
 * coloured runs with a pure string parser (no innerHTML, no DOM), so the same
 * code works in the studio preview and in the headless dynamic re-render.
 * Nothing leaves the browser.
 */
import hljs from 'highlight.js/lib/core';
import { registerLanguages, AUTO_SUBSET } from './languages.js';
import { htmlToRuns, splitLines, escapeHtml } from './tokens.js';

registerLanguages( hljs );

/**
 * Tokenise code into lines of coloured runs.
 *
 * @param {string} code Source text (already tab-expanded, LF newlines).
 * @param {string} lang Language id or 'auto'.
 * @return {{ language: string, lines: Array }}
 */
export function tokenizeLines( code, lang ) {
	let res;
	try {
		res =
			lang && 'auto' !== lang && hljs.getLanguage( lang )
				? hljs.highlight( code, {
						language: lang,
						ignoreIllegals: true,
				  } )
				: hljs.highlightAuto( code, AUTO_SUBSET );
	} catch ( e ) {
		res = { value: escapeHtml( code ), language: lang };
	}
	return {
		language: res.language || lang || 'text',
		lines: splitLines( htmlToRuns( res.value ) ),
	};
}

export { hljs };
