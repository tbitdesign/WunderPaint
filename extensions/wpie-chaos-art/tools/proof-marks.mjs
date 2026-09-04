// A proof sheet of the mark vocabulary on node-canvas: does each medium
// read as its medium before any painter touches it?
// Usage: node tools/proof-marks.mjs <out.png>
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FlatStage } from '../src/flat/stage.js';
import { handPath, linePath } from '../src/flat/hand.js';
import { drawMotif } from '../src/core/gestures.js';
import { makeRng } from '../src/core/rng.js';
import { hexRgb } from '../src/core/palette.js';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const req = createRequire( path.resolve( here, '..', '..', '..', 'node_modules', 'x.js' ) );
const { createCanvas } = req( 'canvas' );
const out = process.argv[ 2 ] || path.resolve( here, '..', 'dist', 'proof-marks.png' );

const rng = makeRng( [ 3, 5, 7 ] );
const stage = new FlatStage( { createCanvas, aspect: 1.5, height: 900 } );
stage.setGround( { color: hexRgb( '#efe9dc' ), paper: 'paper', grain: 0.5 } );

const C = {
	ink: hexRgb( '#15151a' ),
	red: hexRgb( '#c8371d' ),
	blue: hexRgb( '#2b4f9e' ),
	ochre: hexRgb( '#c99a3c' ),
	green: hexRgb( '#3f7a52' ),
	violet: hexRgb( '#6b4b9a' ),
	white: hexRgb( '#f6f2ea' ),
};
let seed = 1;
const cmd = ( c ) => stage.push( { seed: seed++, ...c }, 0 );
const strokeAt = ( x, y, kind, tip, color, extra = {} ) => {
	const m = drawMotif( rng, [ kind ] );
	const pts = handPath( m, { at: [ x, y ], angle: -0.2 + rng() * 0.4, scale: 0.12, width: 0.03, rng, tremor: 0.4, haste: 0.5, overshoot: 0.5 } );
	cmd( { type: 'stroke', pts, tip, color, ...extra } );
};

// Row 1: strokes per tip, wet and dry, with relief.
strokeAt( 0.18, 0.14, 'arc', 'bristle', C.blue, { alpha: 0.95 } );
strokeAt( 0.5, 0.14, 'scurve', 'bristle', C.red, { dry: 0.9, alpha: 0.9 } );
strokeAt( 0.82, 0.14, 'slash', 'flat', C.ochre, { relief: 0.9 } );
strokeAt( 1.14, 0.14, 'hook', 'sumi', C.ink, { dry: 0.8 } );
strokeAt( 1.36, 0.14, 'arc', 'chalk', C.violet, { alpha: 0.8 } );
// Row 2: washes, dots, hatch, facet.
cmd( { type: 'wash', cx: 0.2, cy: 0.42, rx: 0.14, ry: 0.1, angle: 0.3, color: C.blue, alpha: 0.35, rim: 0.8, grain: 0.6, depth: 1 } );
cmd( { type: 'wash', cx: 0.3, cy: 0.46, rx: 0.1, ry: 0.08, angle: -0.5, color: C.red, alpha: 0.3, rim: 0.7, grain: 0.3 } );
cmd( { type: 'dots', cx: 0.6, cy: 0.42, rx: 0.14, ry: 0.1, n: 260, size: [ 0.006, 0.012 ], colors: [ C.blue, C.ochre, C.green, C.white ], tip: 'round', alpha: 0.95 } );
cmd( { type: 'dots', cx: 0.92, cy: 0.42, rx: 0.13, ry: 0.09, n: 140, size: [ 0.012, 0.028 ], colors: [ C.violet, C.ochre, C.white ], tip: 'bristle', along: -0.3, alongVar: 0.4, colorVar: 0.1, alpha: 0.95 } );
cmd( { type: 'hatch', x: 1.2, y: 0.42, angle: 0.6, n: 12, spacing: 0.012, len: 0.16, width: 0.0025, color: C.ink, alpha: 0.75 } );
cmd( { type: 'shape', kind: 'poly', pts: [ [ 1.3, 0.34 ], [ 1.46, 0.36 ], [ 1.44, 0.5 ], [ 1.32, 0.48 ] ], x: 1.38, y: 0.42, w: 0.16, h: 0.16, color: C.ochre, alpha: 0.9, gradient: { angle: 0.8, amount: 0.3 }, stroke: C.ink, strokeW: 0.002 } );
// Row 3: shapes crisp/print/ragged, cut paper, ring, drips, splatter, scrape, star, glaze.
cmd( { type: 'shape', kind: 'circle', x: 0.14, y: 0.72, w: 0.16, h: 0.16, color: C.red, edge: 'crisp' } );
cmd( { type: 'shape', kind: 'bar', x: 0.3, y: 0.72, w: 0.05, h: 0.26, angle: 0.4, color: C.ink, edge: 'print' } );
cmd( { type: 'shape', kind: 'tri', x: 0.44, y: 0.72, w: 0.14, h: 0.14, color: C.blue, edge: 'ragged', rag: 0.5 } );
cmd( { type: 'cut', x: 0.66, y: 0.7, w: 0.18, h: 0.14, angle: 0.15, color: hexRgb( '#e9dcc4' ), print: 'text', printScale: 1, paper: 'kraft', shadow: 0.7 } );
cmd( { type: 'cut', x: 0.72, y: 0.78, w: 0.12, h: 0.1, angle: -0.3, color: hexRgb( '#d8d1c6' ), print: 'halftone', shadow: 0.6 } );
cmd( { type: 'shape', kind: 'ring', x: 0.94, y: 0.72, w: 0.14, strokeW: 0.012, color: C.blue } );
cmd( { type: 'shape', kind: 'arc', x: 1.0, y: 0.76, w: 0.2, strokeW: 0.006, a0: 3.4, a1: 5.6, color: C.ink } );
cmd( { type: 'drip', x: 1.12, y: 0.62, len: 0.22, width: 0.008, color: C.red } );
cmd( { type: 'drip', x: 1.15, y: 0.64, len: 0.12, width: 0.005, color: C.red } );
cmd( { type: 'splatter', x: 1.3, y: 0.66, angle: 0.9, n: 40, reach: 0.16, size: [ 0.002, 0.018 ], color: C.ink, spread: 1.4 } );
cmd( { type: 'star', x: 1.42, y: 0.6, r: 0.02, width: 0.003, color: C.ink, arms: 4 } );
cmd( { type: 'line', pts: linePath( [ 0.05, 0.9 ], [ 0.6, 0.93 ], 0.0025, { rng, wobble: 0.6 } ), color: C.ink } );
cmd( { type: 'scrape', x: 0.7, y: 0.9, angle: 0.1, len: 0.25, width: 0.05, alpha: 0.9 } );
cmd( { type: 'glaze', x: 1.0, y: 0.84, w: 0.45, h: 0.14, color: C.blue, alpha: 0.25, blend: 'multiply' } );

stage.finishAll();
const outCanvas = createCanvas( stage.W, stage.H );
stage.render( outCanvas.getContext( '2d' ), stage.W, stage.H, { paper: 0.35, vignette: 0.12 } );
fs.mkdirSync( path.dirname( out ), { recursive: true } );
fs.writeFileSync( out, outCanvas.toBuffer( 'image/png' ) );
console.log( 'wrote', out, stage.W + 'x' + stage.H, 'marks', stage.marks );
