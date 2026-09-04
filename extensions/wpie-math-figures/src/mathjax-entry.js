/**
 * The formula engine as its own bundle (assets/mathjax.js): MathJax TeX
 * input and SVG output through the lite adaptor, so it runs without a DOM
 * (node tests import this file directly) and is loaded in the editor only
 * when a formula is typeset. Glyphs come out as paths (fontCache none).
 */
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js';
import 'mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js';
import 'mathjax-full/js/input/tex/color/ColorConfiguration.js';
import 'mathjax-full/js/input/tex/cancel/CancelConfiguration.js';
import 'mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import 'mathjax-full/js/input/tex/bbox/BboxConfiguration.js';
import 'mathjax-full/js/input/tex/textmacros/TextMacrosConfiguration.js';
import 'mathjax-full/js/input/tex/unicode/UnicodeConfiguration.js';
import 'mathjax-full/js/input/tex/mhchem/MhchemConfiguration.js';
import 'mathjax-full/js/input/tex/html/HtmlConfiguration.js';
import 'mathjax-full/js/input/tex/configmacros/ConfigMacrosConfiguration.js';

let doc = null;
let adaptor = null;

function ready() {
	if ( ! doc ) {
		adaptor = liteAdaptor();
		RegisterHTMLHandler( adaptor );
		// \mark{key}{...} tags a part of the formula (html package: \cssId);
		// the flattener reports the box of every mk-<key> group for labels.
		const tex = new TeX( {
			packages: [
				'base',
				'ams',
				'newcommand',
				'noundefined',
				'color',
				'cancel',
				'boldsymbol',
				'bbox',
				'textmacros',
				'unicode',
				'mhchem',
				'html',
				'configmacros',
			],
			macros: { mark: [ '\\cssId{mk-#1}{#2}', 2 ] },
		} );
		const svg = new SVG( { fontCache: 'none' } );
		doc = mathjax.document( '', { InputJax: tex, OutputJax: svg } );
	}
}

/** LaTeX -> the SVG markup MathJax produces (an <svg> with viewBox in em/1000 units). */
export function typeset( latex, display = true ) {
	ready();
	const node = doc.convert( latex, { display: !! display } );
	const html = adaptor.outerHTML( node );
	const m = /<svg[\s\S]*<\/svg>/.exec( html );
	if ( ! m ) {
		throw new Error( 'No SVG from MathJax' );
	}
	// MathJax reports errors as a merror node with the message as data-mjx-error.
	const err = /data-mjx-error="([^"]*)"/.exec( html );
	return {
		svg: m[ 0 ],
		error: err ? err[ 1 ].replace( /&quot;/g, '"' ) : null,
	};
}

if ( 'undefined' !== typeof window ) {
	window.__wpieMathJax = { typeset };
}
