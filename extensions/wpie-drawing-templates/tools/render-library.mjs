/** Reproducible gallery images from the actual Canvas renderers, no network. */
import { createCanvas } from 'canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL_MODES, PRACTICE_MODES, PRESETS } from '../src/practice-catalog.js';
import { MOTIFS, motifCanvas } from '../src/motifs.js';
import { renderPractice } from '../src/practice-engine.js';
import * as engine from '../src/drawing-engine.js';

const root = fileURLToPath( new URL( '../assets/', import.meta.url ) );
const like = createCanvas( 1, 1 ),
	source = motifCanvas( like, 'fox', 720 );
const defaults = {
	motif: 'fox',
	rows: 5,
	practiceVariant: 0,
	seed: 3,
	difficulty: 'guided',
	segments: 8,
};
function render( p ) {
	if ( PRACTICE_MODES.some( ( m ) => m.id === p.mode ) )
		return renderPractice( like, p, source );
	const methods = {
		paintbynumbers: () =>
			engine.paintByNumbers( source, {
				colors: p.colors || 8,
				smooth: p.smooth || 2,
			} ).canvas,
		coloring: () =>
			motifCanvas( like, 'fox', 1200, {
				outline: true,
				weight: 1.5 + ( p.detail || 2 ),
			} ),
		tracing: () =>
			motifCanvas( like, 'fox', 1200, {
				outline: true,
				weight: 1.5 + ( p.detail || 2 ),
				color: '#a5adb5',
				dashed: true,
			} ),
		dots: () =>
			engine.connectTheDots( source, {
				count: p.dots || 60,
				hints: p.dotHints,
			} ).canvas,
		symmetry: () => engine.symmetrySheet( source, { axis: p.symAxis } ),
		grid: () => engine.gridSheet( source, { scale: p.gridScale } ),
		steps: () => engine.stepGuide( source, { steps: p.steps } ).canvas,
		code: () =>
			engine.colorByCode( source, {
				kind: p.codeKind || 'add',
				colors: p.codeColors || 6,
			} ).canvas,
		shade: () =>
			engine.shadeByNumbers( source, { shades: p.shades } ).canvas,
		oneline: () =>
			engine.oneLineDrawing( source, { style: p.lineStyle || 'waves' } )
				.canvas,
		finish: () =>
			engine.finishSheet( source, { variant: p.finishVariant || 'fade' } )
				.canvas,
		mandala: () => engine.mandalaSheet( source ),
	};
	return methods[ p.mode ]();
}
function save( group, id, sheet ) {
	const c = createCanvas( 264, 330 ),
		g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	const s = Math.min(
		( c.width - 12 ) / sheet.width,
		( c.height - 12 ) / sheet.height
	);
	g.drawImage(
		sheet,
		( c.width - sheet.width * s ) / 2,
		( c.height - sheet.height * s ) / 2,
		sheet.width * s,
		sheet.height * s
	);
	writeFileSync(
		root + group + '/' + id + '.png',
		c.toBuffer( 'image/png' )
	);
}
for ( const name of [ 'templates', 'presets', 'motifs' ] )
	mkdirSync( root + name, { recursive: true } );
for ( const m of ALL_MODES )
	save( 'templates', m.id, render( { ...defaults, mode: m.id } ) );
for ( const p of PRESETS )
	save( 'presets', p.id, render( { ...defaults, ...p.params } ) );
for ( const m of MOTIFS ) save( 'motifs', m.id, motifCanvas( like, m.id ) );
console.log(
	`Rendered ${ ALL_MODES.length } templates, ${ PRESETS.length } presets, ${ MOTIFS.length } motifs.`
);
