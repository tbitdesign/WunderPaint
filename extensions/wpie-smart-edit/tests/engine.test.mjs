import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
	analyze,
	plan,
	editableScope,
	textRecords,
	groupIds,
	footprint,
} from '../src/engine.js';
import { applyPlan } from '../src/transaction.js';
import { ROWS } from '../src/i18n.js';
import { relatedFamilies, objectAtPoint } from '../src/relations.js';
import { sampleChanges } from '../src/sample.js';
import { syncRepeatLayers } from '../../../src/store/repeat-sync.js';
import {
	detachPatchedColorLinks,
	syncColorLinks,
} from '../../../src/lib/color-links.js';

const doc = { w: 800, h: 600, bg: '#ffffff' };
const text = ( id, extra = {} ) => ( {
	id,
	type: 'text',
	name: id,
	text: id,
	x: 20,
	y: 20,
	w: 100,
	h: 20,
	fontFamily: 'Arial',
	fontSize: 12,
	weight: 700,
	italic: true,
	color: '#ff0000',
	lineHeight: 1.05,
	fillType: 'solid',
	visible: true,
	...extra,
} );
const shape = ( id, extra = {} ) => ( {
	id,
	type: 'shape',
	name: id,
	shape: 'rect',
	x: 10,
	y: 10,
	w: 100,
	h: 50,
	radius: 20,
	fill: '#0000ff',
	opacity: 1,
	visible: true,
	...extra,
} );
const group = ( layers, kind, predicate = () => true ) =>
	analyze( layers, doc ).families.find(
		( g ) => g.kind === kind && predicate( g )
	);
const op = ( family, changes, extra = {} ) => ( {
	group: family,
	changes,
	...extra,
} );
const freeze = ( value ) => {
	if ( value && typeof value === 'object' ) {
		Object.values( value ).forEach( freeze );
		Object.freeze( value );
	}
	return value;
};

test( 'matching typography is recognized across names and positions, with explicit variations', () => {
	const layers = [
		text( 'heading' ),
		text( 'different-name', { x: 300 } ),
		text( 'body', { weight: 400 } ),
		text( 'other', { fontFamily: 'Georgia' } ),
	];
	const family = group( layers, 'text', ( g ) => g.name === 'Arial' );
	assert.equal( family.variants.length, 2 );
	assert.equal( family.variants[ 0 ].hits.length, 2 );
	assert.equal( family.hits.length, 3 );
	const out = plan( layers, doc, [
		op( family.variants[ 0 ], {
			family: 'Inter',
			weight: 500,
			italic: false,
			color: '#ffffff',
		} ),
	] );
	assert.equal( out.layers[ 0 ].fontFamily, 'Inter' );
	assert.equal( out.layers[ 0 ].weight, 500 );
	assert.equal( out.layers[ 0 ].italic, false );
	assert.equal( out.layers[ 0 ].fontSize, 12 );
	assert.equal( out.layers[ 1 ].color, '#ffffff' );
	assert.strictEqual( out.layers[ 2 ], layers[ 2 ] );
	assert.strictEqual( out.layers[ 3 ], layers[ 3 ] );
} );

test( 'matching spans change without affecting other words or splitting their text', () => {
	const l = text( 'mixed', {
		text: 'Red blue red',
		spans: [
			{ text: 'Red ', s: null },
			{ text: 'blue', s: { color: '#0000ff', family: 'Georgia' } },
			{ text: ' red', s: null },
		],
	} );
	const family = group( [ l ], 'text', ( g ) => g.name === 'Arial' );
	const out = plan( [ l ], doc, [
		op( family, { family: 'Inter', color: '#ffffff', italic: false } ),
	] ).layers[ 0 ];
	assert.equal( out.spans.map( ( s ) => s.text ).join( '' ), l.text );
	assert.equal( out.spans[ 0 ].s.family, 'Inter' );
	assert.deepEqual( out.spans[ 1 ], l.spans[ 1 ] );
	assert.equal( out.spans[ 2 ].s.italic, false );
	assert.equal( l.spans[ 0 ].s, null );
} );

test( 'whole text is explicit and legacy line styles retain unrelated fields', () => {
	const l = text( 'lines', {
		text: 'One\nTwo',
		lineStyles: [
			{ size: 18, underline: true },
			{ family: 'Georgia', color: '#0000ff' },
		],
	} );
	const family = group( [ l ], 'text', ( g ) => g.name === 'Arial' );
	const out = plan( [ l ], doc, [
		op( family, { color: '#ffffff' }, { wholeText: true } ),
	] ).layers[ 0 ];
	assert.equal( out.spans.map( ( s ) => s.text ).join( '' ), l.text );
	assert.ok( out.spans.every( ( s ) => s.s.color === '#ffffff' ) );
	assert.equal( out.spans[ 0 ].s.underline, true );
	assert.equal( out.spans[ 1 ].s.family, 'Georgia' );
	assert.equal( out.lineStyles, null );
} );

test( 'later edits can address original text ranges after a prior edit split a run', () => {
	const l = text( 'abcdef', { text: 'abcdef' } );
	const first = {
		id: 'one',
		kind: 'text',
		hits: [ { id: l.id, start: 1, end: 3 } ],
	};
	const last = {
		id: 'two',
		kind: 'text',
		hits: [ { id: l.id, start: 2, end: 5 } ],
	};
	const out = plan( [ l ], doc, [
		op( first, { color: '#00ff00' } ),
		op( last, { weight: 400 } ),
	] ).layers[ 0 ];
	const pieces = out.spans.flatMap( ( r ) =>
		Array.from( r.text, ( char ) => ( { char, ...r.s } ) )
	);
	assert.equal( pieces[ 1 ].color, '#00ff00' );
	assert.equal( pieces[ 2 ].weight, 400 );
	assert.equal( pieces[ 2 ].color, '#00ff00' );
	assert.equal( pieces[ 3 ].color, undefined );
	assert.equal( pieces[ 5 ].weight, undefined );
} );

test( 'shape variations distinguish size, rounding, paint and effects', () => {
	const layers = [
		shape( 'a' ),
		shape( 'b', { x: 200 } ),
		shape( 'c', { radius: 10 } ),
		shape( 'd', { w: 101 } ),
		shape( 'e', {
			styles: { dropShadow: { enabled: true, color: '#000000' } },
		} ),
	];
	const f = group( layers, 'shapes' );
	assert.equal( f.variants.length, 4 );
	const out = plan( layers, doc, [
		op( f.variants[ 0 ], { fill: '#00ff00' } ),
	] );
	assert.deepEqual( [ ...out.patches.keys() ], [ 'a', 'b' ] );
	assert.equal( out.layers[ 0 ].w, 100 );
	assert.equal( out.layers[ 0 ].radius, 20 );
} );

test( 'shape resizing stays centered and exclusion is honored', () => {
	const layers = [ shape( 'a' ), shape( 'b' ) ];
	const f = group( layers, 'shapes' );
	const out = plan( layers, doc, [
		op( f, { w: 200, h: 80 }, { excluded: new Set( [ 'b' ] ) } ),
	] );
	assert.equal( out.layers[ 0 ].x + out.layers[ 0 ].w / 2, 60 );
	assert.equal( out.layers[ 0 ].y + out.layers[ 0 ].h / 2, 35 );
	assert.strictEqual( out.layers[ 1 ], layers[ 1 ] );
} );

test( 'scope includes descendants, respects ancestors and rejects protected content', () => {
	const layers = [
		{ id: 'g', type: 'group' },
		shape( 'a', { parent: 'g' } ),
		shape( 'b' ),
		{ id: 'locked', type: 'group', locked: true },
		text( 'c', { parent: 'locked' } ),
		shape( 'generated', { generator: { id: 'test/a' } } ),
		{ id: 'smart', type: 'smart' },
		shape( 'inside', { parent: 'smart' } ),
	];
	assert.deepEqual(
		editableScope( layers, [ 'g' ] ).eligible.map( ( l ) => l.id ),
		[ 'a' ]
	);
	assert.deepEqual( editableScope( layers, [ 'c' ] ).eligible, [] );
	assert.deepEqual(
		editableScope( layers ).eligible.map( ( l ) => l.id ),
		[ 'a', 'b' ]
	);
	const f = {
		kind: 'shapes',
		hits: [ { id: 'c' }, { id: 'generated' }, { id: 'inside' } ],
	};
	assert.equal(
		plan( layers, doc, [ op( f, { fill: '#00ff00' } ) ] ).patches.size,
		0
	);
} );

test( 'cyclic parents and empty scopes are safe', () => {
	const layers = [
		shape( 'a', { parent: 'b' } ),
		shape( 'b', { parent: 'a' } ),
	];
	assert.equal( editableScope( layers ).eligible.length, 0 );
	assert.equal( analyze( [ shape( 'c' ) ], doc, [] ).families.length, 0 );
} );

test( 'color families reuse all core carriers and preserve individual alpha', () => {
	const layers = [
		shape( 'a', { fill: '#ff000080' } ),
		text( 'b', { spans: [ { text: 'b', s: { color: '#f00' } } ] } ),
		{
			id: 'gradient',
			type: 'gradient',
			stops: [
				{ at: 0, color: '#ff0000' },
				{ at: 1, color: '#00ff00' },
			],
		},
	];
	const f = group( layers, 'colors', ( g ) => g.color === '#ff0000' );
	const out = plan( layers, doc, [ op( f, { color: '#0000ff' } ) ] );
	assert.equal( out.layers[ 0 ].fill, '#0000ff80' );
	assert.equal( out.layers[ 1 ].spans[ 0 ].s.color, '#0000ff' );
	assert.equal( out.layers[ 2 ].stops[ 0 ].color, '#0000ff' );
	assert.equal( out.layers[ 2 ].stops[ 1 ].color, '#00ff00' );
} );

test( 'document background can be excluded from a color family', () => {
	const layers = [ shape( 'a', { fill: '#ffffff' } ) ];
	const f = group( layers, 'colors', ( g ) => g.color === '#ffffff' );
	assert.ok( groupIds( f ).includes( '@document' ) );
	const out = plan( layers, doc, [
		op( f, { color: '#000000' }, { excluded: new Set( [ '@document' ] ) } ),
	] );
	assert.equal( out.docPatch, null );
	assert.equal( out.layers[ 0 ].fill, '#000000' );
} );

test( 'color families swap original carriers without cascading, including split styled text', () => {
	const layers = [
		shape( 'a', {
			fill: '#ff0000',
			stroke: '#0000ff',
			strokeW: 2,
			styles: {
				gradientOverlay: {
					stops: [
						{ at: 0, color: '#ff0000' },
						{ at: 1, color: '#0000ff' },
					],
				},
			},
		} ),
		text( 'mixed', {
			text: 'red blue',
			spans: [
				{ text: 'red ', s: null },
				{ text: 'blue', s: { color: '#0000ff' } },
			],
		} ),
	];
	const first = {
		id: 'part',
		kind: 'text',
		hits: [ { id: 'mixed', start: 1, end: 6 } ],
	};
	const red = group( layers, 'colors', ( g ) => g.color === '#ff0000' );
	const blue = group( layers, 'colors', ( g ) => g.color === '#0000ff' );
	const out = plan( layers, doc, [
		op( first, { weight: 400 } ),
		op( red, { color: '#0000ff' } ),
		op( blue, { color: '#ff0000' } ),
	] );
	assert.equal( out.layers[ 0 ].fill, '#0000ff' );
	assert.equal( out.layers[ 0 ].stroke, '#ff0000' );
	assert.deepEqual(
		out.layers[ 0 ].styles.gradientOverlay.stops.map( ( s ) => s.color ),
		[ '#0000ff', '#ff0000' ]
	);
	const chars = textRecords( out.layers[ 1 ] ).flatMap( ( r ) =>
		Array.from( r.text, () => r.style )
	);
	assert.ok( chars.slice( 0, 4 ).every( ( c ) => c.color === '#0000ff' ) );
	assert.ok( chars.slice( 4 ).every( ( c ) => c.color === '#ff0000' ) );
	assert.equal( chars[ 2 ].weight, 400 );
	assert.equal( chars[ 6 ].weight, 700 );
} );

test( 'unsupported geometry remains intact while its color stays editable', () => {
	const layers = [
		shape( 'path', { pathD: 'M0 0H100V50Z' } ),
		shape( 'quad', { quad: { tl: { x: 0, y: 0 } } } ),
	];
	const out = plan( layers, doc, [
		op( group( layers, 'shapes' ), { w: 200, h: 80, fill: '#00ff00' } ),
	] );
	assert.deepEqual(
		out.layers.map( ( l ) => l.w ),
		[ 100, 100 ]
	);
	assert.equal( out.layers[ 0 ].pathD, layers[ 0 ].pathD );
	assert.strictEqual( out.layers[ 1 ].quad, layers[ 1 ].quad );
	assert.ok( out.layers.every( ( l ) => l.fill === '#00ff00' ) );
} );

test( 'source resizing previews the derived bounds of existing repeat layers', () => {
	const layers = syncRepeatLayers( [
		{
			id: 'repeat',
			type: 'repeat',
			sourceId: 'a',
			rule: { type: 'grid', rows: 2, cols: 3, gapX: 20, gapY: 10 },
		},
		shape( 'a' ),
	] );
	const out = plan( layers, doc, [
		op( group( layers, 'shapes' ), { w: 200 } ),
	] );
	assert.equal( out.layers.find( ( l ) => l.id === 'a' ).w, 200 );
	assert.ok( out.patches.has( 'repeat' ) );
	assert.strictEqual( syncRepeatLayers( out.layers ), out.layers );
} );

test( 'linked color preview agrees with the existing link system and direct edits detach', () => {
	const layers = [
		shape( 'a' ),
		text( 'b', {
			color: '#0000ff',
			colorLinks: {
				color: { sourceId: 'a', source: 'fill', lightness: 0 },
			},
		} ),
	];
	const out = plan( layers, doc, [
		op( group( layers, 'shapes' ), { fill: '#00ff00' } ),
	] );
	assert.equal( out.layers[ 1 ].color, '#00ff00' );
	assert.deepEqual( out.layers[ 1 ].colorLinks, layers[ 1 ].colorLinks );
	const applied = syncColorLinks(
		layers.map( ( l ) => ( {
			...l,
			...detachPatchedColorLinks( l, out.patches.get( l.id ) || {} ),
		} ) )
	);
	assert.deepEqual( applied[ 1 ].colorLinks, layers[ 1 ].colorLinks );
	assert.equal( applied[ 1 ].color, '#00ff00' );
	const direct = plan( layers, doc, [
		op( group( layers, 'text' ), { color: '#ffffff' } ),
	] );
	assert.equal( direct.layers[ 1 ].color, '#ffffff' );
	assert.deepEqual( direct.layers[ 1 ].colorLinks, {} );
} );

test( 'preview never mutates frozen layers, nested formatting or the document', () => {
	const layers = freeze( [
		text( 'a', { spans: [ { text: 'a', s: { weight: 700 } } ] } ),
		shape( 'b' ),
	] );
	const d = freeze( { ...doc } );
	const before = JSON.stringify( layers );
	plan( layers, d, [
		op( group( layers, 'text' ), { color: '#ffffff' } ),
		op( group( layers, 'shapes' ), { radius: 40 } ),
	] );
	assert.equal( JSON.stringify( layers ), before );
} );

test( 'labels and plates resize together while their horizontal padding stays intact', () => {
	const layers = [
		shape( 'plate', { w: 140, h: 50 } ),
		text( 'label', {
			text: 'Buy',
			x: 30,
			y: 25,
			w: 100,
			h: 20,
			italic: false,
		} ),
	];
	const f = group( layers, 'elements', ( g ) => ! g.marker );
	assert.ok( f );
	const out = plan(
		layers,
		doc,
		[ op( f, { text: 'Buy today' } ) ],
		( l ) => l.text.length * 10
	);
	assert.equal( out.layers[ 1 ].text, 'Buy today' );
	assert.equal( out.layers[ 1 ].x - out.layers[ 0 ].x, 20 );
	assert.equal( out.layers[ 0 ].w - out.layers[ 1 ].w, 40 );
	assert.equal( out.layers[ 0 ].x + out.layers[ 0 ].w / 2, 80 );
} );

test( 'ambiguous panels with multiple labels are not treated as a label-and-plate pair', () => {
	const layers = [
		shape( 'plate', { w: 300, h: 100 } ),
		text( 'one' ),
		text( 'two', { y: 50 } ),
	];
	assert.equal(
		analyze( layers, doc ).families.filter( ( g ) => g.kind === 'elements' )
			.length,
		0
	);
} );

test( 'later typography changes cover the full replacement label and use the supplied text measurement', () => {
	const layers = [
		shape( 'plate', { w: 140, h: 50 } ),
		text( 'label', {
			text: 'Buy',
			x: 30,
			y: 25,
			w: 100,
			h: 20,
			italic: false,
		} ),
	];
	const compound = group( layers, 'elements', ( g ) => ! g.marker );
	const typography = group( layers, 'text' );
	const measure = ( l ) => l.text.length * 10;
	measure.height = () => 35;
	const out = plan(
		layers,
		doc,
		[
			op( compound, { text: 'A longer label' }, { fitPlate: false } ),
			op( typography, { weight: 500, family: 'Inter' } ),
		],
		measure
	);
	assert.equal( out.layers[ 1 ].text, 'A longer label' );
	assert.equal( out.layers[ 1 ].fontFamily, 'Inter' );
	assert.equal( out.layers[ 1 ].weight, 500 );
	assert.equal( out.layers[ 1 ].h, 35 );
	assert.strictEqual( out.layers[ 0 ], layers[ 0 ] );
} );

test( 'bound, masked, rotated and raster fallback labels are not inferred as simple relationships', () => {
	for ( const extra of [
		{ binding: { field: 'title' } },
		{ mask: { type: 'path' } },
		{ rot: 5 },
		{ useRasterFallback: true },
	] ) {
		const layers = [
			shape( 'plate', { w: 140, h: 50 } ),
			text( 'label', { x: 30, y: 25, w: 100, h: 20, ...extra } ),
		];
		assert.equal(
			analyze( layers, doc ).families.some(
				( g ) => g.kind === 'elements'
			),
			false
		);
	}
} );

function numberGrid() {
	return [
		shape( 'marker', {
			shape: 'ellipse',
			x: 0,
			y: 0,
			w: 40,
			h: 40,
			radius: 0,
		} ),
		...[ 1, 2, 3, 4, 5, 6, 7 ].map( ( day, i ) =>
			text( 'day' + day, {
				text: String( day ),
				x: 10 + i * 50,
				y: 10,
				w: 20,
				h: 20,
				italic: false,
				color: day === 1 ? '#ffffff' : '#111111',
			} )
		),
	];
}
test( 'a numeric highlight transfers the marker and restores the old foreground', () => {
	const layers = numberGrid();
	const f = group( layers, 'elements', ( g ) => !! g.marker );
	assert.ok( f );
	const out = plan( layers, doc, [ op( f, { target: 'day4' } ) ] );
	assert.equal( out.layers[ 0 ].x, 150 );
	assert.equal( out.layers[ 1 ].color, '#111111' );
	assert.equal( out.layers[ 4 ].color, '#ffffff' );
	assert.deepEqual( out.layers[ 0 ].smartEditMarker, {
		textId: 'day4',
		originalColor: '#111111',
	} );
	const next = group( out.layers, 'elements', ( g ) => !! g.marker );
	assert.ok( next );
	const returned = plan( out.layers, doc, [
		op( next, { target: 'day1' } ),
	] );
	assert.equal( returned.layers[ 0 ].x, 0 );
	assert.equal( returned.layers[ 4 ].color, '#111111' );
	assert.equal( returned.layers[ 1 ].color, '#ffffff' );
} );

test( 'ambiguous weekday colors and duplicate numbers do not get an inferred highlight', () => {
	const colors = numberGrid();
	colors[ 3 ].color = '#ff0000';
	assert.equal(
		analyze( colors, doc ).families.some( ( g ) => g.marker ),
		false
	);
	const duplicates = numberGrid();
	duplicates[ 3 ].text = '2';
	assert.equal(
		analyze( duplicates, doc ).families.some( ( g ) => g.marker ),
		false
	);
} );

test( 'rotated selection footprints preserve the actual center', () => {
	const b = footprint(
		shape( 'a', { x: 10, y: 20, w: 100, h: 50, rot: 90 } )
	);
	assert.ok( Math.abs( b.w - 50 ) < 1e-8 );
	assert.ok( Math.abs( b.h - 100 ) < 1e-8 );
	assert.equal( b.x + b.w / 2, 60 );
} );

test( 'example suggestions separate typography, nearby sizes and font families within scope', () => {
	const layers = [
		text( 'a' ),
		text( 'color', { color: '#00ff00' } ),
		text( 'near', { fontSize: 12.3 } ),
		text( 'large', { fontSize: 24 } ),
		text( 'other-font', { fontFamily: 'Georgia' } ),
		text( 'other-weight', { weight: 400 } ),
		text( 'protected', { locked: true } ),
	];
	const related = relatedFamilies( analyze( layers, doc ), 'a' );
	const members = ( name ) =>
		related.find( ( g ) => g.relation === name ).hits.map( ( h ) => h.id );
	assert.deepEqual( members( 'Same text style' ), [ 'a' ] );
	assert.deepEqual( members( 'Same typography' ), [ 'a', 'color' ] );
	assert.deepEqual( members( 'Similar typography' ), [
		'a',
		'color',
		'near',
	] );
	assert.deepEqual( members( 'Same font size' ), [
		'a',
		'color',
		'other-font',
		'other-weight',
	] );
	assert.deepEqual( members( 'Same font' ), [
		'a',
		'color',
		'near',
		'large',
		'other-weight',
	] );
	const scoped = analyze( layers, doc, [ 'a', 'color' ] );
	assert.ok(
		relatedFamilies( scoped, 'a' ).every( ( g ) =>
			g.hits.every( ( h ) => [ 'a', 'color' ].includes( h.id ) )
		)
	);
	assert.deepEqual( relatedFamilies( scoped, 'large' ), [] );
	assert.deepEqual(
		relatedFamilies( analyze( layers, doc ), 'protected' ),
		[]
	);
	const keys = new Set( ROWS.map( ( row ) => row[ 0 ] ) );
	assert.ok( related.every( ( g ) => keys.has( g.relation ) ) );
} );

test( 'shape suggestions join different dimensions without flattening appearance or content', () => {
	const layers = [
		shape( 'a' ),
		shape( 'wide', { w: 220 } ),
		shape( 'near', { w: 101, fill: '#00ff00' } ),
		shape( 'other', { radius: 2 } ),
	];
	const related = relatedFamilies( analyze( layers, doc ), 'a' );
	const appearance = related.find(
		( g ) => g.relation === 'Same shape appearance'
	);
	assert.deepEqual( groupIds( appearance ), [ 'a', 'wide' ] );
	assert.deepEqual(
		groupIds(
			related.find( ( g ) => g.relation === 'Similar dimensions' )
		),
		[ 'a', 'near', 'other' ]
	);
	const out = plan( layers, doc, [ op( appearance, { radius: 30 } ) ] );
	assert.equal( out.layers[ 1 ].w, 220 );
	assert.equal( out.layers[ 1 ].radius, 30 );
	assert.strictEqual( out.layers[ 2 ], layers[ 2 ] );
} );

test( 'nearby colors retain separate sources on the same layer, per-object exclusions and alpha', () => {
	const layers = [
		shape( 'a', { fill: '#0000ff80', stroke: '#0404fc', strokeW: 3 } ),
		shape( 'b', { fill: '#0404fc' } ),
		shape( 'c', { fill: '#ff0000' } ),
	];
	const d = { ...doc, bg: '#0000ff' };
	const related = relatedFamilies( analyze( layers, d ), 'a' );
	assert.equal(
		related.filter( ( g ) => g.relation === 'Same color' ).length,
		2
	);
	const similar = related.find( ( g ) => g.relation === 'Similar colors' );
	assert.deepEqual( similar.colors, [ '#0000ff', '#0404fc' ] );
	const out = plan( layers, d, [
		op(
			similar,
			{ color: '#00ff00' },
			{ excluded: new Set( [ 'b', '@document' ] ) }
		),
	] );
	assert.equal( out.layers[ 0 ].fill, '#00ff0080' );
	assert.equal( out.layers[ 0 ].stroke, '#00ff00' );
	assert.strictEqual( out.layers[ 1 ], layers[ 1 ] );
	assert.strictEqual( out.layers[ 2 ], layers[ 2 ] );
	assert.equal( out.docPatch, null );
} );

test( 'relative text sizes keep hierarchy, matching runs, exclusions and repeatable previews', () => {
	const layers = freeze( [
		text( 'a', { fontSize: 20 } ),
		text( 'b', { fontSize: 40 } ),
		text( 'c', {
			text: 'AB',
			spans: [
				{ text: 'A', s: { size: 30 } },
				{ text: 'B', s: { family: 'Georgia', size: 60 } },
			],
		} ),
		text( 'skip', { fontSize: 50 } ),
	] );
	const f = group( layers, 'text', ( g ) => g.name === 'Arial' );
	const operations = [
		op(
			f,
			{
				size: { mode: 'percent', value: 15 },
				ls: { mode: 'add', value: -1 },
			},
			{ excluded: new Set( [ 'skip' ] ) }
		),
	];
	const out = plan( layers, doc, operations );
	assert.equal( out.layers[ 0 ].fontSize, 23 );
	assert.equal( out.layers[ 1 ].fontSize, 46 );
	assert.equal( out.layers[ 0 ].letterSpacing, -1 );
	assert.equal( textRecords( out.layers[ 2 ] )[ 0 ].style.size, 34.5 );
	assert.equal( textRecords( out.layers[ 2 ] )[ 1 ].style.size, 60 );
	assert.strictEqual( out.layers[ 3 ], layers[ 3 ] );
	assert.deepEqual( plan( layers, doc, operations ), out );
	const whole = plan( layers, doc, [
		op( f, { size: { mode: 'add', value: 2 } }, { wholeText: true } ),
	] );
	assert.equal( textRecords( whole.layers[ 2 ] )[ 1 ].style.size, 62 );
	assert.equal(
		plan( layers, doc, [
			op( f, { size: { mode: 'percent', value: 0 } } ),
		] ).patches.size,
		0
	);
} );

test( 'relative numeric edits compose with staged edits and keep shape centers and limits', () => {
	const layers = [
		shape( 'a', { w: 100, h: 50, strokeW: 2, opacity: 0.6 } ),
		shape( 'b', { w: 200, h: 100, strokeW: 5 } ),
	];
	const f = group( layers, 'shapes' );
	const out = plan( layers, doc, [
		op( f, {
			w: { mode: 'percent', value: 20 },
			h: { mode: 'percent', value: 20 },
			strokeW: { mode: 'add', value: 1 },
			opacity: { mode: 'add', value: 0.6 },
		} ),
	] );
	assert.deepEqual(
		out.layers.map( ( l ) => l.w ),
		[ 120, 240 ]
	);
	assert.deepEqual(
		out.layers.map( ( l ) => l.strokeW ),
		[ 3, 6 ]
	);
	for ( let i = 0; i < layers.length; i++ ) {
		assert.equal(
			out.layers[ i ].x + out.layers[ i ].w / 2,
			layers[ i ].x + layers[ i ].w / 2
		);
		assert.equal(
			out.layers[ i ].y + out.layers[ i ].h / 2,
			layers[ i ].y + layers[ i ].h / 2
		);
		assert.equal( out.layers[ i ].opacity, 1 );
	}
	const combined = plan( layers, doc, [
		op( f, { w: 150 } ),
		op( f, { w: { mode: 'add', value: 10 } } ),
	] );
	assert.deepEqual(
		combined.layers.map( ( l ) => l.w ),
		[ 160, 160 ]
	);
	assert.equal(
		plan( layers, doc, [
			op( f, { w: { mode: 'percent', value: -100 } } ),
		] ).layers[ 0 ].w,
		1
	);
	assert.equal(
		plan( layers, doc, [
			op( f, {
				w: { mode: 'unknown', value: 2 },
				h: { mode: 'add', value: Infinity },
			} ),
		] ).patches.size,
		0
	);
} );

test( 'positive stroke widths enable missing paint while retaining existing colors and gradients', () => {
	const gradient = {
		kind: 'linear',
		stops: [
			{ at: 0, color: '#ff0000' },
			{ at: 1, color: '#0000ff' },
		],
	};
	const layers = freeze( [
		shape( 'default', { stroke: null, strokeW: 0 } ),
		shape( 'missing' ),
		shape( 'colored', { stroke: '#12345680', strokeW: 2 } ),
		shape( 'gradient', { stroke: '#ff0000', strokeGradient: gradient } ),
		shape( 'transparent', { stroke: 'transparent', strokeW: 2 } ),
		shape( 'excluded', { stroke: null, strokeW: 0 } ),
	] );
	const family = group( layers, 'shapes' );
	for ( const strokeW of [ 8, { mode: 'add', value: 8 } ] ) {
		const result = plan( layers, doc, [
			op( family, { strokeW }, { excluded: new Set( [ 'excluded' ] ) } ),
		] );
		assert.deepEqual(
			result.layers.map( ( l ) => l.stroke ),
			[
				'#000000',
				'#000000',
				'#12345680',
				'#ff0000',
				'transparent',
				null,
			]
		);
		assert.equal( result.layers[ 0 ].strokeW, 8 );
		assert.deepEqual( result.layers[ 3 ].strokeGradient, gradient );
		assert.strictEqual( result.layers[ 5 ], layers[ 5 ] );
	}
	assert.equal(
		plan( layers, doc, [ op( family, { strokeW: 8, stroke: '#abcdef' } ) ] )
			.layers[ 0 ].stroke,
		'#abcdef'
	);
	for ( const strokeW of [ 0, { mode: 'add', value: 0 } ] ) {
		const result = plan( layers, doc, [ op( family, { strokeW } ) ] );
		assert.equal( result.layers[ 0 ].stroke, null );
		assert.equal( result.layers[ 1 ].stroke, undefined );
	}
} );

test( 'disabled properties retain their place and restore earlier overlapping changes', () => {
	const layers = [ shape( 'a' ), shape( 'b' ) ];
	const family = group( layers, 'shapes' );
	const first = op( family, { fill: '#ff0000', radius: 4 } );
	const second = op(
		family,
		{ fill: '#00ff00', strokeW: 3 },
		{ disabled: new Set( [ 'fill' ] ) }
	);
	const result = plan( layers, doc, [ first, second ] );
	assert.equal( result.layers[ 0 ].fill, '#ff0000' );
	assert.equal( result.layers[ 0 ].radius, 4 );
	assert.equal( result.layers[ 0 ].strokeW, 3 );
	second.disabled.clear();
	assert.equal(
		plan( layers, doc, [ first, second ] ).layers[ 0 ].fill,
		'#00ff00'
	);
	assert.equal( first.changes.fill, '#ff0000' );
	assert.equal( layers[ 0 ].fill, '#0000ff' );
} );

test( 'linked dimensions preserve each member ratio and center with bounds and exclusions', () => {
	const layers = [
		shape( 'a', { w: 100, h: 50 } ),
		shape( 'b', { w: 80, h: 160 } ),
		shape( 'excluded' ),
		shape( 'path', { pathD: 'M0 0h100v50Z' } ),
	];
	const family = group( layers, 'shapes' );
	for ( const changes of [
		{ w: 200 },
		{ h: 120 },
		{ w: { mode: 'percent', value: 25 } },
		{ h: { mode: 'add', value: 10 } },
		{ w: 20000 },
		{ h: 1 },
	] ) {
		const result = plan( layers, doc, [
			op( family, changes, {
				keepRatio: true,
				excluded: new Set( [ 'excluded' ] ),
			} ),
		] );
		for ( let i = 0; i < 2; i++ ) {
			const before = layers[ i ],
				after = result.layers[ i ];
			assert.ok(
				Math.abs( before.w / before.h - after.w / after.h ) < 1e-10
			);
			assert.equal( before.x + before.w / 2, after.x + after.w / 2 );
			assert.equal( before.y + before.h / 2, after.y + after.h / 2 );
			assert.ok(
				after.w >= 1 &&
					after.h >= 1 &&
					after.w <= 20000 &&
					after.h <= 20000
			);
		}
		assert.strictEqual( result.layers[ 2 ], layers[ 2 ] );
		assert.strictEqual( result.layers[ 3 ], layers[ 3 ] );
	}
} );

test( 'broader matching expands only similar suggestions and retains staged membership', () => {
	const layers = [
		text( 'a', { fontSize: 24 } ),
		text( 'b', { fontSize: 24.3 } ),
		text( 'c', { fontSize: 25.2 } ),
		text( 'far', { fontSize: 30 } ),
	];
	const analysis = analyze( layers, doc );
	const close = relatedFamilies( analysis, 'a', 'close' );
	const broad = relatedFamilies( analysis, 'a', 'broad' );
	const tightGroup = close.find(
		( g ) => g.relation === 'Similar typography'
	);
	const broadGroup = broad.find(
		( g ) => g.relation === 'Similar typography'
	);
	assert.deepEqual( groupIds( tightGroup ), [ 'a', 'b' ] );
	assert.deepEqual( groupIds( broadGroup ), [ 'a', 'b', 'c' ] );
	assert.notEqual( tightGroup.id, broadGroup.id );
	assert.deepEqual(
		close.find( ( g ) => g.relation === 'Same text style' ).hits,
		broad.find( ( g ) => g.relation === 'Same text style' ).hits
	);
	const result = plan( layers, doc, [ op( tightGroup, { size: 40 } ) ] );
	assert.equal( result.layers[ 2 ].fontSize, 25.2 );
	const colors = [
		shape( 'blue', { fill: '#0000ff' } ),
		shape( 'near', { fill: '#0404fc' } ),
		shape( 'looser', { fill: '#0060ff' } ),
		shape( 'far', { fill: '#ff0000' } ),
	];
	const palette = analyze( colors, doc );
	assert.deepEqual(
		relatedFamilies( palette, 'blue', 'close' ).find(
			( g ) => g.relation === 'Similar colors'
		).colors,
		[ '#0000ff', '#0404fc' ]
	);
	const broadColors = relatedFamilies( palette, 'blue', 'broad' ).find(
		( g ) => g.relation === 'Similar colors'
	);
	assert.ok( groupIds( broadColors ).includes( 'looser' ) );
	assert.ok( ! groupIds( broadColors ).includes( 'far' ) );
} );

test( 'example transfer copies selected paint and text passages without geometry or shared references', () => {
	const source = shape( 'source', {
		fill: '#ff0000',
		stroke: '#00ff00',
		strokeW: 6,
		radius: 9,
		strokeGradient: {
			kind: 'linear',
			stops: [
				{ at: 0, color: '#00ff00' },
				{ at: 1, color: '#0000ff' },
			],
		},
		fillType: 'gradient',
		gradientStops: [
			{ at: 0, color: '#ff0000' },
			{ at: 1, color: '#ffff00' },
		],
	} );
	const layers = [ shape( 'a' ), shape( 'b', { w: 180 } ) ];
	const family = group( layers, 'shapes' );
	const result = plan( layers, doc, [
		op( family, {
			...sampleChanges( source, 'stroke' ),
			...sampleChanges( source, 'fill' ),
			...sampleChanges( source, 'radius' ),
		} ),
	] );
	assert.equal( result.layers[ 0 ].strokeW, 6 );
	assert.equal( result.layers[ 0 ].fillType, 'gradient' );
	assert.equal( result.layers[ 0 ].radius, 9 );
	assert.equal( result.layers[ 1 ].w, 180 );
	assert.notStrictEqual(
		result.layers[ 0 ].strokeGradient,
		source.strokeGradient
	);
	assert.notStrictEqual(
		result.layers[ 0 ].strokeGradient,
		result.layers[ 1 ].strokeGradient
	);
	const rich = text( 'rich', {
		text: 'AB',
		spans: [
			{ text: 'A', s: { size: 30, family: 'Georgia' } },
			{ text: 'B', s: { size: 18, family: 'Arial', weight: 400 } },
		],
	} );
	const changes = sampleChanges( rich, 'typography', 1 );
	assert.equal( changes.size, 18 );
	assert.equal( changes.weight, 400 );
	assert.ok( ! ( 'color' in changes ) && ! ( 'text' in changes ) );
	const texts = [
		text( 'target', {
			text: 'AB',
			spans: [ { text: 'A' }, { text: 'B', s: { family: 'Georgia' } } ],
		} ),
	];
	const target = group( texts, 'text', ( g ) => g.name === 'Arial' );
	const modified = plan( texts, doc, [ op( target, changes ) ] ).layers[ 0 ];
	assert.equal( modified.text, 'AB' );
	assert.equal( textRecords( modified )[ 0 ].style.size, 18 );
	assert.equal( textRecords( modified )[ 1 ].style.family, 'Georgia' );
} );

test( 'visual exploration respects stacking, ancestor visibility, rotation and ellipse corners', () => {
	const layers = [ shape( 'a' ), shape( 'b', { locked: true } ) ];
	assert.equal(
		objectAtPoint( layers, new Set( [ 'a' ] ), { x: 20, y: 20 } ),
		null
	);
	layers[ 1 ].visible = false;
	assert.equal(
		objectAtPoint( layers, new Set( [ 'a' ] ), { x: 20, y: 20 } ),
		'a'
	);
	layers.push(
		{ id: 'hidden', type: 'group', visible: false },
		shape( 'child', { parent: 'hidden' } )
	);
	assert.equal(
		objectAtPoint( layers, new Set( [ 'a' ] ), { x: 20, y: 20 } ),
		'a'
	);
	const rotated = shape( 'rotated', {
		x: 10,
		y: 20,
		w: 100,
		h: 20,
		rot: 90,
	} );
	assert.equal(
		objectAtPoint( [ rotated ], new Set( [ 'rotated' ] ), {
			x: 60,
			y: 70,
		} ),
		'rotated'
	);
	assert.equal(
		objectAtPoint( [ rotated ], new Set( [ 'rotated' ] ), {
			x: 100,
			y: 30,
		} ),
		null
	);
	const ellipse = shape( 'ellipse', { shape: 'ellipse' } );
	assert.equal(
		objectAtPoint( [ ellipse ], new Set( [ 'ellipse' ] ), {
			x: 11,
			y: 11,
		} ),
		null
	);
} );

test( 'one application creates one undo entry and only planned patches', () => {
	const layers = [ shape( 'a' ), shape( 'b' ) ],
		base = { layers, doc },
		calls = [];
	const editor = {
		state: base,
		dispatch: ( a ) => calls.push( a ),
		commit: ( name ) => calls.push( name ),
	};
	const result = plan( layers, doc, [
		op( group( layers, 'shapes' ), { radius: 12 } ),
	] );
	assert.equal( applyPlan( editor, base, result, 'Smart Edit' ), 'applied' );
	assert.equal( calls.length, 2 );
	assert.deepEqual( calls[ 0 ].ids, [ 'a', 'b' ] );
	assert.deepEqual( calls[ 0 ].patchFor( layers[ 0 ] ), { radius: 12 } );
	assert.equal( calls[ 1 ], 'Smart Edit' );
} );

test( 'stale documents and no-ops never dispatch or create history entries', () => {
	const layers = [ shape( 'a' ) ],
		base = { layers, doc };
	let calls = 0;
	const editor = {
		state: { layers: [ ...layers ], doc },
		dispatch: () => calls++,
		commit: () => calls++,
	};
	const result = plan( layers, doc, [
		op( group( layers, 'shapes' ), { radius: 20 } ),
	] );
	assert.equal( result.patches.size, 0 );
	assert.equal( applyPlan( editor, base, result, 'Smart Edit' ), 'stale' );
	editor.state = base;
	assert.equal( applyPlan( editor, base, result, 'Smart Edit' ), 'empty' );
	assert.equal( calls, 0 );
} );

test( 'all interface strings are present in every supported language', () => {
	const keys = new Set( ROWS.map( ( row ) => row[ 0 ] ) );
	assert.equal( keys.size, ROWS.length );
	for ( const row of ROWS ) {
		assert.equal( row.length, 7 );
		assert.ok( row.every( ( s ) => typeof s === 'string' && s.trim() ) );
	}
	for ( const file of [ 'src/main.js', 'src/view.js' ] ) {
		const code = readFileSync( file, 'utf8' );
		for ( const m of code.matchAll( /\bt\(\s*'([^']+)'/g ) ) {
			if ( m[ 1 ] !== 'Smart Edit' ) {
				assert.ok( keys.has( m[ 1 ] ), m[ 1 ] );
			}
		}
		for ( const m of code.matchAll(
			/\b(?:numeric|select|colorField|field)\(\s*\w+,\s*'([^']+)'/g
		) ) {
			assert.ok( keys.has( m[ 1 ] ), m[ 1 ] );
		}
	}
} );

/* ------------------------------ 1.2 catalog ------------------------------ */

const hsl = ( hex ) => {
	const [ r, g, b ] = [ 1, 3, 5 ].map(
		( i ) => parseInt( hex.slice( i, i + 2 ), 16 ) / 255
	);
	const mx = Math.max( r, g, b ),
		mn = Math.min( r, g, b );
	let h = 0;
	if ( mx !== mn ) {
		const d = mx - mn;
		h =
			60 *
			( mx === r
				? ( g - b ) / d + ( g < b ? 6 : 0 )
				: mx === g
				? ( b - r ) / d + 2
				: ( r - g ) / d + 4 );
	}
	return { h, l: ( mx + mn ) / 2 };
};

test( 'the catalog names text by its role, in reading order', () => {
	const long = 'A body sentence that carries most of the reading here';
	const layers = [
		text( 'small', { fontSize: 11, text: 'Photo: someone' } ),
		text( 'body1', { fontSize: 16, weight: 400, text: long } ),
		text( 'title', {
			fontSize: 64,
			fontFamily: 'Anton',
			text: 'Big news',
		} ),
		text( 'body2', {
			fontSize: 16,
			weight: 400,
			fontFamily: 'Georgia',
			text: long,
		} ),
		text( 'sub', { fontSize: 22, text: 'A subheading' } ),
	];
	const { catalog } = analyze( layers, doc );
	const roles = catalog.filter( ( g ) => g.kind === 'text' );
	assert.deepEqual(
		roles.map( ( g ) => g.name ),
		[ 'Headlines', 'Subheadings', 'Body text', 'Small text' ]
	);
	const body = roles.find( ( g ) => g.name === 'Body text' );
	// One role across two fonts, each font a variation of it.
	assert.deepEqual( groupIds( body ).sort(), [ 'body1', 'body2' ] );
	assert.equal( body.variants.length, 2 );
	assert.ok( body.role );
	// The role edits like any text family.
	const result = plan( layers, doc, [ op( body, { size: 18 } ) ] );
	assert.equal(
		result.layers.find( ( l ) => l.id === 'body1' ).fontSize,
		18
	);
	assert.equal(
		result.layers.find( ( l ) => l.id === 'body2' ).fontSize,
		18
	);
	assert.equal(
		result.layers.find( ( l ) => l.id === 'title' ).fontSize,
		64
	);
} );

test( 'colors form families of tones that move together and keep their distance', () => {
	const layers = [
		shape( 'a', { fill: '#457b9d' } ),
		shape( 'b', { fill: '#457b9d', x: 200 } ),
		shape( 'dark', { fill: '#2a4d63', x: 400 } ),
		shape( 'light', { fill: '#a8c6da', y: 200 } ),
		shape( 'red', { fill: '#e63946', y: 400 } ),
	];
	const colors = analyze( layers, doc ).catalog.filter(
		( g ) => g.kind === 'colors'
	);
	const blue = colors.find( ( g ) => g.tones );
	assert.ok( blue, 'a family of tones' );
	assert.equal( blue.color, '#457b9d', 'the most used tone is the base' );
	assert.deepEqual(
		blue.tones.map( ( t ) => t.color ),
		[ '#a8c6da', '#457b9d', '#2a4d63' ],
		'lightest first'
	);
	assert.equal( blue.variants.length, 3, 'each tone stays reachable' );
	assert.ok(
		colors.some( ( g ) => g.color === '#e63946' && ! g.tones ),
		'red is a color of its own'
	);
	const result = plan( layers, doc, [ op( blue, { color: '#9d4545' } ) ] );
	const fill = ( id ) => result.layers.find( ( l ) => l.id === id ).fill;
	assert.equal( fill( 'a' ), '#9d4545' );
	assert.equal( fill( 'b' ), '#9d4545' );
	assert.equal( fill( 'red' ), '#e63946' );
	// The other tones follow into red, the lighter one stays lighter and
	// the darker one darker.
	for ( const id of [ 'dark', 'light' ] ) {
		const { h } = hsl( fill( id ) );
		assert.ok(
			Math.min( h, 360 - h ) < 12,
			`${ id } is now red: ${ fill( id ) }`
		);
	}
	assert.ok( hsl( fill( 'light' ) ).l > hsl( '#9d4545' ).l );
	assert.ok( hsl( fill( 'dark' ) ).l < hsl( '#9d4545' ).l );
} );

test( 'a tone keeps its own transparency when it moves', () => {
	const layers = [
		shape( 'a', { fill: '#457b9d' } ),
		shape( 'b', { fill: '#457b9d', x: 200 } ),
		shape( 'dark', { fill: '#2a4d6380', x: 400 } ),
	];
	const blue = analyze( layers, doc ).catalog.find( ( g ) => g.tones );
	assert.ok( blue );
	const result = plan( layers, doc, [ op( blue, { color: '#9d4545' } ) ] );
	const fill = String( result.layers.find( ( l ) => l.id === 'dark' ).fill );
	assert.notEqual( fill.slice( 0, 7 ), '#2a4d63', 'it moved' );
	assert.match( fill, /80$|0\.5/, 'and stayed half transparent: ' + fill );
} );

test( 'shapes group by how they look, not by size or color', () => {
	const layers = [
		shape( 'card1', { fill: '#ff0000' } ),
		shape( 'card2', { fill: '#0000ff', w: 200, x: 200 } ),
		shape( 'sharp', { radius: 0, y: 200 } ),
		shape( 'framed', { stroke: '#000000', strokeW: 2, y: 300 } ),
	];
	const looks = analyze( layers, doc ).catalog.filter(
		( g ) => g.kind === 'shapes'
	);
	const cards = looks.find( ( g ) => groupIds( g ).includes( 'card1' ) );
	assert.deepEqual( groupIds( cards ).sort(), [ 'card1', 'card2' ] );
	assert.equal( looks.length, 3, 'corners and an outline set looks apart' );
	// Two sizes, none repeated: no list of variations, just objects.
	assert.deepEqual( cards.variants, [] );
	const more = analyze(
		[ ...layers, shape( 'card3', { fill: '#00ff00', y: 450 } ) ],
		doc
	).catalog.find( ( g ) => g.kind === 'shapes' && g.hits.length === 3 );
	assert.equal( more.variants.length, 2, 'a repeated size is a variation' );
	// Editing the look changes the cards and nothing else.
	const result = plan( layers, doc, [ op( cards, { radius: 4 } ) ] );
	assert.equal( result.layers.find( ( l ) => l.id === 'card2' ).radius, 4 );
	assert.equal( result.layers.find( ( l ) => l.id === 'sharp' ).radius, 0 );
} );

test( 'the data-level families stay as they were for explorations', () => {
	const layers = [
		text( 'a', { fontSize: 40 } ),
		text( 'b', { fontSize: 12 } ),
		shape( 's1' ),
		shape( 's2', { radius: 0, x: 300 } ),
	];
	const { families } = analyze( layers, doc );
	assert.ok(
		families.some( ( g ) => g.kind === 'text' && g.name === 'Arial' )
	);
	assert.ok(
		families.some( ( g ) => g.kind === 'shapes' && g.name === 'rect' )
	);
} );
