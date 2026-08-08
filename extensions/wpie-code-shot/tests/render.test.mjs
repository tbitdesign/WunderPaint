import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	htmlToRuns,
	splitLines,
	expandTabs,
	unescapeHtml,
	colorKeyFor,
	parseLineSpec,
	splitDiff,
} from '../src/tokens.js';
import { THEMES, TOKEN_KEYS } from '../src/themes.js';

test( 'htmlToRuns maps highlight.js spans to theme keys and unescapes text', () => {
	const html =
		'<span class="hljs-comment">// hi</span>\n<span class="hljs-keyword">const</span> x = <span class="hljs-number">5</span>; a &lt; b';
	const runs = htmlToRuns( html );
	assert.deepEqual( runs[ 0 ], { text: '// hi', key: 'comment' } );
	const kw = runs.find( ( r ) => r.text === 'const' );
	assert.equal( kw.key, 'keyword' );
	const num = runs.find( ( r ) => r.text === '5' );
	assert.equal( num.key, 'number' );
	// entity was decoded back to a literal <
	assert.ok( runs.some( ( r ) => r.text.includes( 'a < b' ) ) );
} );

test( 'htmlToRuns handles nested spans via a scope stack', () => {
	const html =
		'<span class="hljs-string">"a<span class="hljs-subst">${x}</span>b"</span>';
	const runs = htmlToRuns( html );
	assert.equal( runs[ 0 ].key, 'string' ); // "a
	assert.equal( runs[ 1 ].key, 'text' ); // ${x}  (subst -> text)
	assert.equal( runs[ 2 ].key, 'string' ); // b"
	assert.equal( runs.map( ( r ) => r.text ).join( '' ), '"a${x}b"' );
} );

test( 'splitLines preserves empty lines and line count', () => {
	const runs = [ { text: 'a\n\nb', key: 'text' } ];
	const lines = splitLines( runs );
	assert.equal( lines.length, 3 );
	assert.equal( lines[ 1 ].length, 0 );
	assert.equal( lines[ 2 ][ 0 ].text, 'b' );
} );

test( 'expandTabs replaces tabs with the given width', () => {
	assert.equal( expandTabs( '\tx', 4 ), '    x' );
	assert.equal( expandTabs( 'a\tb', 2 ), 'a  b' );
} );

test( 'unescapeHtml decodes the entities highlight.js emits', () => {
	assert.equal(
		unescapeHtml( '&lt;a&gt; &amp; &quot;q&quot; &#x27;s&#39;' ),
		'<a> & "q" \'s\''
	);
} );

test( 'colorKeyFor falls back to text for unknown scopes', () => {
	assert.equal( colorKeyFor( 'keyword' ), 'keyword' );
	assert.equal( colorKeyFor( 'title' ), 'function' );
	assert.equal( colorKeyFor( 'nonsense' ), 'text' );
	assert.equal( colorKeyFor( '' ), 'text' );
} );

test( 'every theme defines every token colour', () => {
	const need = TOKEN_KEYS.concat( [ 'win', 'title', 'gutter' ] );
	for ( const id in THEMES ) {
		for ( const k of need ) {
			assert.ok( THEMES[ id ][ k ], id + ' missing ' + k );
		}
	}
} );

test( 'parseLineSpec understands ranges, lists and reversed pairs', () => {
	const s = parseLineSpec( '2-4, 7 9', 100 );
	assert.deepEqual(
		[ ...s ].sort( ( a, b ) => a - b ),
		[ 2, 3, 4, 7, 9 ]
	);
	assert.deepEqual( [ ...parseLineSpec( '5-3', 100 ) ], [ 3, 4, 5 ] );
	assert.equal( parseLineSpec( '', 100 ).size, 0 );
	assert.equal( parseLineSpec( 'x, 3', 2 ).has( 3 ), false ); // clamped to max
} );

test( 'splitDiff strips +/- markers and records the type per line', () => {
	const { code, types } = splitDiff( '+added\n-removed\n context\nplain' );
	assert.deepEqual( code.split( '\n' ), [
		'added',
		'removed',
		' context',
		'plain',
	] );
	assert.deepEqual( types, [ 'add', 'del', 'ctx', 'ctx' ] );
} );
