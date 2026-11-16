/**
 * Build a studio's woff2 helper from the wawoff2 decompress binding.
 *
 * Three things happen to the binding on the way to woff2.js:
 *
 *  1. It is wrapped in an IIFE with a pre-defined `Module`, so the
 *     onRuntimeInitialized hook is attached BEFORE the Emscripten runtime
 *     boots (bundling it through esbuild lost the module object, and the
 *     init callback never fired). Nothing leaks but one API global.
 *
 *  2. Its two Embind spots that run code from strings are replaced by the
 *     static forms Emscripten itself emits with -sDYNAMIC_EXECUTION=0:
 *     createNamedFunction (names a function through `new Function`) and
 *     craftInvokerFunction (writes the JS source of every exported
 *     function's invoker and compiles it through the Function
 *     constructor). Under a Content-Security-Policy without 'unsafe-eval'
 *     the first one throws while the runtime starts, the helper never
 *     defines its global, and every woff2 face fails - which is what
 *     wunderpaint.com did to Type Flow, 3D Text Studio and Motion Graphics
 *     until 12.09.2026. The replacements are verified, not assumed: the
 *     build ends by running the helper under
 *     `node --disallow-code-generation-from-strings` (woff2-check.mjs),
 *     which is that policy in Node form.
 *
 *  3. Its content hash is written next to the sources as WOFF2_STAMP. The
 *     loaders append it to the helper's URL, because the file is fetched
 *     by a bare <script src> with a four-hour cache on the studio host: a
 *     rebuilt helper would otherwise be a stale one for the rest of the
 *     afternoon.
 *
 * Shared by the three packages' tools/build-woff2.mjs. Relative imports
 * only, like everything under shared/ (see shared/glyphs/README.md).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname( fileURLToPath( import.meta.url ) );

/** Cut `function <name>(...){...}` out of minified source by brace matching. */
function cutFunction( src, name ) {
	const start = src.indexOf( 'function ' + name + '(' );
	if ( -1 === start ) {
		throw new Error( 'woff2-build: ' + name + ' not found in the binding' );
	}
	let depth = 0;
	for ( let i = src.indexOf( '{', start ); i < src.length; i++ ) {
		if ( '{' === src[ i ] ) {
			depth++;
		} else if ( '}' === src[ i ] ) {
			depth--;
			if ( 0 === depth ) {
				return { start, end: i + 1, text: src.slice( start, i + 1 ) };
			}
		}
	}
	throw new Error( 'woff2-build: unbalanced braces in ' + name );
}

// Emscripten's own DYNAMIC_EXECUTION=0 form: a computed key names the
// function without compiling source.
const NAMED_STATIC =
	'function createNamedFunction(name,body){name=makeLegalFunctionName(name);' +
	'return{[name]:function(){return body.apply(this,arguments)}}[name]}';

// The generated invoker, written as a closure. Same steps in the same
// order as the source it used to compile: arity check, wire the receiver
// and the arguments (destructor stack only when a type needs one), call
// the C++ invoker with the target function first, run the destructors,
// unwire the return value.
const INVOKER_STATIC =
	'function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc){' +
	'var argCount=argTypes.length;' +
	'if(argCount<2){throwBindingError("argTypes array size mismatch! Must at least get return value and \'this\' types!")}' +
	'var isClassMethodFunc=argTypes[1]!==null&&classType!==null;' +
	'var needsDestructorStack=false;' +
	'for(var i=1;i<argTypes.length;++i){if(argTypes[i]!==null&&argTypes[i].destructorFunction===undefined){needsDestructorStack=true;break}}' +
	'var returns=argTypes[0].name!=="void";' +
	'var expectedArgCount=argCount-2;' +
	'return function(){' +
	'if(arguments.length!==expectedArgCount){throwBindingError("function "+humanName+" called with "+arguments.length+" arguments, expected "+expectedArgCount+" args!")}' +
	'var destructors=needsDestructorStack?[]:null;' +
	'var invokerArgs=[cppTargetFunc];' +
	'var thisWired;' +
	'if(isClassMethodFunc){thisWired=argTypes[1].toWireType(destructors,this);invokerArgs.push(thisWired)}' +
	'var argsWired=new Array(expectedArgCount);' +
	'for(var i=0;i<expectedArgCount;++i){argsWired[i]=argTypes[i+2].toWireType(destructors,arguments[i]);invokerArgs.push(argsWired[i])}' +
	'var rv=cppInvokerFunc.apply(null,invokerArgs);' +
	'if(needsDestructorStack){runDestructors(destructors)}' +
	'else{for(var i=isClassMethodFunc?1:2;i<argTypes.length;++i){var param=i===1?thisWired:argsWired[i-2];if(argTypes[i].destructorFunction!==null){argTypes[i].destructorFunction(param)}}}' +
	'if(returns){return argTypes[0].fromWireType(rv)}' +
	'}}';

/** Replace the two dynamic-code spots; refuse a binding that looks different. */
export function stripDynamicCode( binding ) {
	const named = cutFunction( binding, 'createNamedFunction' );
	if ( ! named.text.includes( 'new Function(' ) ) {
		throw new Error( 'woff2-build: createNamedFunction has no `new Function` - binding changed, review the replacement' );
	}
	let out = binding.slice( 0, named.start ) + NAMED_STATIC + binding.slice( named.end );
	const invoker = cutFunction( out, 'craftInvokerFunction' );
	if ( ! invoker.text.includes( 'new_(Function' ) ) {
		throw new Error( 'woff2-build: craftInvokerFunction does not compile source - binding changed, review the replacement' );
	}
	out = out.slice( 0, invoker.start ) + INVOKER_STATIC + out.slice( invoker.end );
	for ( const marker of [ 'new Function(', 'new_(Function' ] ) {
		if ( out.includes( marker ) ) {
			throw new Error( 'woff2-build: `' + marker + '` still present after the rewrite' );
		}
	}
	return out;
}

export function buildWoff2( { binding, out, globalName, stampFile, fixture, pkgRoot } ) {
	const stripped = stripDynamicCode( fs.readFileSync( binding, 'utf8' ) );
	const preamble = `(function () {
'use strict';
var wpieResolve = null;
var wpieDone = false;
var Module = {
	onRuntimeInitialized: function () {
		wpieDone = true;
		if ( wpieResolve ) { wpieResolve(); }
	}
};
`;
	const postamble = `
;var wpieReady = new Promise( function ( resolve ) {
	if ( wpieDone || Module.calledRun ) { resolve(); } else { wpieResolve = resolve; }
} );
window.${ globalName } = {
	decompress: function ( bytes ) {
		return wpieReady.then( function () {
			var out = Module.decompress( bytes );
			if ( false === out ) {
				throw new Error( 'woff2 decompress failed' );
			}
			return out;
		} );
	}
};
})();
`;
	const helper = preamble + stripped + postamble;
	fs.writeFileSync( out, helper );
	const stamp = crypto.createHash( 'sha256' ).update( helper ).digest( 'hex' ).slice( 0, 8 );
	fs.writeFileSync(
		stampFile,
		'/**\n * Generated by tools/build-woff2.mjs: the content hash of woff2.js.\n' +
			' * The loader appends it to the helper URL, so a rebuilt helper is\n' +
			' * never served from a browser cache. Do not edit.\n */\n' +
			"export const WOFF2_STAMP = '" + stamp + "';\n"
	);
	const check = spawnSync(
		process.execPath,
		[
			'--disallow-code-generation-from-strings',
			path.join( here, 'woff2-check.mjs' ),
			out,
			globalName,
			fixture,
			pkgRoot,
		],
		{ stdio: 'inherit' }
	);
	if ( 0 !== check.status ) {
		fs.unlinkSync( out );
		throw new Error( 'woff2-build: the helper does not run without dynamic code; woff2.js removed' );
	}
	console.log( 'woff2.js written (' + ( helper.length / 1024 ).toFixed( 0 ) + ' KB), stamp ' + stamp );
}
