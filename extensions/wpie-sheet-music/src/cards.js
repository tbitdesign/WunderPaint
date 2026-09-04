/**
 * The four cards as pure functions: params in, an SVG picture out.
 * `render(params, env)` -> { svg, width, height, warnings }. env carries
 * what needs a browser: renderScore (abcjs), measure (canvas text
 * widths), t (translation), kits (brand kits), docW/docH.
 */
import { svgDoc, textEl, PAPERS, escapeXml } from './engine/svg.js';
import {
	parseChord,
	chordPitches,
	pitchClass,
	keyPreference,
	transposeChord,
} from './engine/chords.js';
import { scalePitches, SCALE_LABELS } from './engine/scales.js';
import {
	INSTRUMENTS,
	shapeFor,
	pianoKeys,
	noteToMidi,
} from './engine/voicings.js';
import { svgChordDiagram, svgFretboard, svgPiano } from './engine/fretboard.js';
import { songFromText, chordsUsed, transposeSong } from './engine/chordpro.js';
import { layoutLeadsheet } from './engine/leadsheet.js';
import {
	paperAbc,
	flashNotes,
	flashAbc,
	noteName,
	scaleAbc,
	CIRCLE_MAJORS,
	CIRCLE_MINORS,
} from './engine/notation.js';

export const DEFAULTS = {
	card: 'score',
	abc: '',
	chordpro: '',
	chords: 'C G Am F',
	instrument: 'guitar',
	tuning: 'standard',
	capo: 0,
	transpose: 0,
	tab: false,
	showChords: true,
	diagramRow: true,
	root: 'A',
	scale: 'minor-pentatonic',
	labels: 'names',
	fretFrom: 0,
	fretTo: 12,
	octaves: 2,
	layout: { format: 'line', scale: 1.5, margin: 48, columns: 1 },
	style: {
		paper: 'white',
		ink: '#1a1a1a',
		accent: '#8d1436',
		chordColor: '#8d1436',
		titleFont: 'Georgia',
		textFont: 'Arial',
	},
	text: { title: '', subtitle: '', composer: '' },
	paper: {
		clef: 'treble',
		key: 'C',
		meter: '4/4',
		bars: 4,
		staves: 10,
		sep: 90,
		tab: false,
		grids: 0,
	},
	flash: {
		clef: 'treble',
		range: 'all',
		names: 'letters',
		side: 'front',
		columns: 3,
	},
	scales: { mode: 'one', direction: 'up', octaves: 1, fingering: 'none' },
};

export const FORMATS = [
	{ value: 'line', label: 'Line (width of the document)' },
	{ value: 'document', label: 'Document' },
	{ value: 'page', label: 'Page' },
	{ value: 'square', label: 'Square' },
	{ value: 'wide', label: 'Wide' },
];

export const PAPER_OPTIONS = [
	{ value: 'white', label: 'White' },
	{ value: 'cream', label: 'Cream' },
	{ value: 'chalk', label: 'Chalkboard' },
	{ value: 'dark', label: 'Dark' },
	{ value: 'brand', label: 'Brand kit' },
];

export const LABEL_OPTIONS = [
	{ value: 'names', label: 'Note names' },
	{ value: 'intervals', label: 'Intervals' },
	{ value: 'degrees', label: 'Scale degrees' },
];

/** Deep-merge stored params over the defaults. */
export function normalizeParams( p ) {
	const src = p || {};
	return {
		...DEFAULTS,
		...src,
		layout: { ...DEFAULTS.layout, ...( src.layout || {} ) },
		style: { ...DEFAULTS.style, ...( src.style || {} ) },
		text: { ...DEFAULTS.text, ...( src.text || {} ) },
		paper: { ...DEFAULTS.paper, ...( src.paper || {} ) },
		flash: { ...DEFAULTS.flash, ...( src.flash || {} ) },
		scales: { ...DEFAULTS.scales, ...( src.scales || {} ) },
	};
}

export function frameFor( params, docW, docH ) {
	switch ( params.layout.format ) {
		case 'document':
			return {
				width: Math.max( 200, docW || 1600 ),
				height: Math.max( 200, docH || 1000 ),
			};
		case 'page':
			return { width: 1600, height: 2263 };
		case 'square':
			return { width: 1600, height: 1600 };
		case 'wide':
			return { width: 1920, height: 1080 };
		default:
			return {
				width: docW ? Math.max( 600, Math.min( 2400, docW ) ) : 1600,
				height: null,
			};
	}
}

/** Colours and fonts from the paper choice, with the user's overrides. */
export function styleFor( params, kits ) {
	const st = params.style;
	let bg;
	let ink;
	let accent = st.accent;
	if ( 'brand' === st.paper ) {
		const kit = Array.isArray( kits ) && kits.length ? kits[ 0 ] : null;
		const cols = ( kit && kit.colors ? kit.colors : [] )
			.map( normHex )
			.filter( Boolean );
		const byLum = [ ...cols ].sort( ( a, b ) => lum( a ) - lum( b ) );
		bg = byLum.length ? byLum[ byLum.length - 1 ] : '#ffffff';
		ink = byLum.length ? byLum[ 0 ] : '#1a1a1a';
		accent =
			byLum.length > 2
				? byLum[ Math.floor( byLum.length / 2 ) ]
				: st.accent;
		if ( lum( bg ) - lum( ink ) < 60 ) {
			bg = lum( bg ) > 128 ? '#ffffff' : '#15171b';
		}
	} else {
		const paper = PAPERS[ st.paper ] || PAPERS.white;
		bg = paper.bg;
		ink = st.ink && st.ink !== DEFAULTS.style.ink ? st.ink : paper.ink;
	}
	return {
		bg,
		ink,
		accent,
		chordColor: st.chordColor || accent,
		fonts: {
			title: st.titleFont || 'Georgia',
			text: st.textFont || 'Arial',
		},
	};
}

const normHex = ( c ) => {
	if ( 'string' !== typeof c ) {
		return null;
	}
	const s = c.trim().toLowerCase();
	if ( /^#[0-9a-f]{6}$/.test( s ) ) {
		return s;
	}
	const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec( s );
	return m ? '#' + m[ 1 ] + m[ 1 ] + m[ 2 ] + m[ 2 ] + m[ 3 ] + m[ 3 ] : null;
};
const lum = ( h ) => {
	const n = parseInt( h.slice( 1 ), 16 );
	return (
		0.299 * ( ( n >> 16 ) & 255 ) +
		0.587 * ( ( n >> 8 ) & 255 ) +
		0.114 * ( n & 255 )
	);
};

/** Root tag off, inner markup and size out. Our builders always set width/height. */
export function stripSvg( svg ) {
	const m = /^<svg[^>]*>/.exec( svg );
	const head = m ? m[ 0 ] : '';
	const w = parseFloat(
		( /\swidth="([\d.]+)"/.exec( head ) || [] )[ 1 ] || 0
	);
	const h = parseFloat(
		( /\sheight="([\d.]+)"/.exec( head ) || [] )[ 1 ] || 0
	);
	return {
		inner: svg.replace( /^<svg[^>]*>/, '' ).replace( /<\/svg>\s*$/, '' ),
		w,
		h,
	};
}

/**
 * Stack blocks on the paper: an optional title, then every block centred
 * horizontally. A fixed frame clips and warns; a line frame grows.
 */
export function compose( {
	frame,
	style,
	margin,
	title,
	blocks,
	warnings = [],
	t,
} ) {
	const children = [];
	let y = margin;
	const width = frame.width;
	if ( title ) {
		y += 40;
		children.push(
			textEl( width / 2, y, title, {
				size: 40,
				font: style.fonts.title,
				fill: style.ink,
				weight: 700,
				anchor: 'middle',
			} )
		);
		y += 24;
	}
	for ( const b of blocks ) {
		const { inner, w, h } = stripSvg( b.svg );
		const x = Math.max( 0, ( width - w ) / 2 );
		children.push(
			`<g transform="translate(${ Math.round( x ) } ${ Math.round(
				y
			) })">${ inner }</g>`
		);
		y += h + ( b.gap === undefined ? 24 : b.gap );
	}
	let height = Math.ceil( y + margin - 24 );
	if ( frame.height ) {
		if ( height > frame.height ) {
			warnings.push(
				( t || ( ( s ) => s ) )(
					'The content is taller than the page. Lower the scale or the margin.'
				)
			);
		}
		height = frame.height;
	}
	return {
		svg: svgDoc( { width, height, bg: style.bg, children } ),
		width,
		height,
		warnings,
	};
}

/** ABC pitch text for a written midi number: C4 = C, C5 = c, C3 = C, */
export function abcPitch( midi ) {
	const names = [
		'C',
		'^C',
		'D',
		'^D',
		'E',
		'F',
		'^F',
		'G',
		'^G',
		'A',
		'^A',
		'B',
	];
	const oct = Math.floor( midi / 12 ) - 1;
	let s = names[ midi % 12 ];
	if ( oct >= 5 ) {
		s = s.toLowerCase() + "'".repeat( oct - 5 );
	} else {
		s = s + ','.repeat( Math.max( 0, 4 - oct ) );
	}
	return s;
}

/** abcjs tab tuning: written pitch, an octave up for the transposing instruments. */
export function tabTuning( instrument, tuningId ) {
	const inst = INSTRUMENTS[ instrument ];
	if ( ! inst || ! inst.strings ) {
		return null;
	}
	const notes = inst.tunings[ tuningId ] || inst.tunings.standard;
	const up = [ 'guitar', 'bass', 'banjo' ].includes( instrument ) ? 12 : 0;
	return notes.map( ( n ) => abcPitch( noteToMidi( n ) + up ) );
}

const tOf = ( env ) => ( env && env.t ) || ( ( s ) => s );

/* --------------------------------- score ---------------------------------- */

async function renderScoreCard( params, env ) {
	const t = tOf( env );
	const frame = frameFor( params, env.docW, env.docH );
	const style = styleFor( params, env.kits );
	const margin = params.layout.margin;
	const abc = applyTextOverrides( params.abc, params.text );
	if ( ! abc.trim() ) {
		return compose( {
			frame,
			style,
			margin,
			blocks: [],
			warnings: [
				t( 'Paste ABC notation or import a MusicXML file to begin.' ),
			],
			t,
		} );
	}
	const r = await env.renderScore( abc, {
		width: frame.width,
		margin,
		scale: params.layout.scale,
		transpose: params.transpose,
		tab: params.tab
			? {
					tuning: tabTuning( params.instrument, params.tuning ),
					capo: params.capo,
			  }
			: null,
		fonts: style.fonts,
		ink: style.ink,
		accent: style.chordColor,
	} );
	const warnings = [ ...( r.warnings || [] ) ];
	// The score is drawn in unscaled units with a viewBox; on the paper it
	// becomes a group scaled by the same factor.
	const s = params.layout.scale || 1;
	const inner = `<g transform="scale(${ s })">${
		stripSvg( r.svg ).inner
	}</g>`;
	if ( ! frame.height ) {
		return {
			svg: svgDoc( {
				width: r.width,
				height: r.height,
				bg: style.bg,
				children: [ inner ],
			} ),
			width: r.width,
			height: r.height,
			warnings,
		};
	}
	return compose( {
		frame,
		style,
		margin: 0,
		blocks: [
			{
				svg: `<svg width="${ r.width }" height="${ r.height }">${ inner }</svg>`,
				gap: 0,
			},
		],
		warnings,
		t,
	} );
}

/** Title, subtitle and composer from the Text section override the ABC header. */
export function applyTextOverrides( abc, text ) {
	let out = String( abc || '' );
	const set = ( field, value ) => {
		if ( ! value ) {
			return;
		}
		const re = new RegExp( '^' + field + ':.*$', 'm' );
		if ( re.test( out ) ) {
			out = out.replace( re, field + ':' + value );
		} else {
			out = out.replace(
				/^(X:.*\n)/m,
				'$1' + field + ':' + value + '\n'
			);
		}
	};
	set( 'T', text.title );
	set( 'C', text.composer );
	if ( text.subtitle ) {
		if ( /^T:.*\n(?!T:)/m.test( out ) ) {
			out = out.replace( /^(T:.*\n)/m, '$1T:' + text.subtitle + '\n' );
		}
	}
	return out;
}

/* ------------------------------- leadsheet -------------------------------- */

function renderLeadsheet( params, env ) {
	const t = tOf( env );
	const frame = frameFor( params, env.docW, env.docH );
	const style = styleFor( params, env.kits );
	const margin = params.layout.margin;
	const warnings = [];
	let song = songFromText( params.chordpro );
	if ( params.text.title ) {
		song.title = params.text.title;
	}
	if ( params.text.subtitle ) {
		song.subtitle = params.text.subtitle;
	}
	if ( params.text.composer ) {
		song.artist = params.text.composer;
	}
	if ( ! song.sections.length && ! song.title ) {
		warnings.push(
			t(
				'Paste a song in ChordPro form or with the chords above the words.'
			)
		);
	}
	const shift = ( params.transpose || 0 ) - ( params.capo || 0 );
	const soundingKey =
		song.key && params.transpose
			? transposeChord( song.key, params.transpose )
			: song.key;
	const prefer = keyPreference( soundingKey || song.key || 'C' );
	song = transposeSong( song, shift, prefer );
	song.key = soundingKey ? respellKey( soundingKey, prefer ) : '';
	const s = params.layout.scale;
	let diagrams = null;
	if ( params.diagramRow && INSTRUMENTS[ params.instrument ] ) {
		diagrams = [];
		for ( const name of chordsUsed( song ) ) {
			if ( 'piano' === params.instrument ) {
				const p = parseChord( name );
				const svg = svgPiano(
					pianoKeys( chordPitches( p ), p.root, 1, prefer ),
					{
						width: 150 * s,
						ink: style.ink,
						accent: style.chordColor,
						font: style.fonts.text,
					}
				);
				const { w, h } = stripSvg( svg );
				diagrams.push( {
					svg: `<svg width="${ w }" height="${
						h + 30 * s
					}">${ textEl( w / 2, 20 * s, name, {
						size: 18 * s,
						font: style.fonts.text,
						fill: style.ink,
						weight: 700,
						anchor: 'middle',
					} ) }<g transform="translate(0 ${ 28 * s })">${
						stripSvg( svg ).inner
					}</g></svg>`,
					width: w,
					height: h + 30 * s,
				} );
				continue;
			}
			const sh = shapeFor( name, params.instrument, params.tuning );
			if ( ! sh ) {
				warnings.push( t( 'No fingering found for' ) + ' ' + name );
				continue;
			}
			const size = 120 * s;
			diagrams.push( {
				svg: svgChordDiagram( sh, {
					name,
					strings: sh.frets.length,
					size,
					ink: style.ink,
					accent: style.chordColor,
					font: style.fonts.text,
				} ),
				width: size,
				height: size * 1.3,
			} );
		}
	}
	const sizes = {
		title: 44 * s,
		subtitle: 24 * s,
		text: 22 * s,
		chord: 20 * s,
		label: 18 * s,
	};
	const r = layoutLeadsheet(
		song,
		{
			width: frame.width,
			margin,
			columns: params.layout.columns,
			fonts: style.fonts,
			sizes,
			ink: style.ink,
			chordColor: style.chordColor,
			bg: style.bg,
			diagrams,
			keyLabel: t( 'Key' ),
			capoLabel: params.capo ? t( 'Capo' ) + ' ' + params.capo : '',
		},
		env.measure
	);
	if ( ! frame.height ) {
		return { ...r, warnings };
	}
	return compose( {
		frame,
		style,
		margin: 0,
		blocks: [ { svg: r.svg, gap: 0 } ],
		warnings,
		t,
	} );
}

function respellKey( key, prefer ) {
	return transposeChord( key, 12, prefer ) === key
		? key
		: transposeChord( key, 0, prefer );
}

/* -------------------------------- diagrams -------------------------------- */

function renderDiagrams( params, env ) {
	const t = tOf( env );
	const frame = frameFor( params, env.docW, env.docH );
	const style = styleFor( params, env.kits );
	const margin = params.layout.margin;
	const warnings = [];
	const names = String( params.chords || '' )
		.split( /[\s,;]+/ )
		.filter( Boolean );
	const s = params.layout.scale;
	const tiles = [];
	const prefer = keyPreference( names[ 0 ] || 'C' );
	for ( const name of names ) {
		const p = parseChord( name );
		if ( ! p ) {
			warnings.push( t( 'Unknown chord:' ) + ' ' + name );
			continue;
		}
		if ( 'piano' === params.instrument ) {
			const svg = svgPiano(
				pianoKeys( chordPitches( p ), p.root, 1, prefer ),
				{
					width: 260 * s,
					ink: style.ink,
					accent: style.accent,
					font: style.fonts.text,
				}
			);
			const { w, h, inner } = stripSvg( svg );
			tiles.push( {
				svg: `<svg width="${ w }" height="${ h + 44 * s }">${ textEl(
					w / 2,
					28 * s,
					name,
					{
						size: 26 * s,
						font: style.fonts.text,
						fill: style.ink,
						weight: 700,
						anchor: 'middle',
					}
				) }<g transform="translate(0 ${
					40 * s
				})">${ inner }</g></svg>`,
				w,
				h: h + 44 * s,
			} );
			continue;
		}
		const sh = shapeFor( name, params.instrument, params.tuning );
		if ( ! sh ) {
			warnings.push( t( 'No fingering found for' ) + ' ' + name );
			continue;
		}
		const size = 180 * s;
		tiles.push( {
			svg: svgChordDiagram( sh, {
				name,
				strings: sh.frets.length,
				size,
				ink: style.ink,
				accent: style.accent,
				font: style.fonts.text,
			} ),
			w: size,
			h: size * 1.3,
		} );
	}
	if ( ! tiles.length && ! warnings.length ) {
		warnings.push( t( 'Type chord names, for example C G Am F.' ) );
	}
	// Grid.
	const gap = 24 * s;
	const inner = frame.width - 2 * margin;
	const tileW = tiles.length ? tiles[ 0 ].w : 100;
	const cols = Math.max(
		1,
		Math.min(
			tiles.length || 1,
			Math.floor( ( inner + gap ) / ( tileW + gap ) )
		)
	);
	const rows = [];
	for ( let i = 0; i < tiles.length; i += cols ) {
		rows.push( tiles.slice( i, i + cols ) );
	}
	const blocks = rows.map( ( row ) => {
		const w =
			row.reduce( ( a, tl ) => a + tl.w, 0 ) + gap * ( row.length - 1 );
		const h = Math.max( ...row.map( ( tl ) => tl.h ) );
		let x = 0;
		const parts = row.map( ( tl ) => {
			const g = `<g transform="translate(${ Math.round( x ) } 0)">${
				stripSvg( tl.svg ).inner
			}</g>`;
			x += tl.w + gap;
			return g;
		} );
		return {
			svg: `<svg width="${ w }" height="${ h }">${ parts.join(
				''
			) }</svg>`,
			gap,
		};
	} );
	const title =
		params.text.title ||
		( names.length > 1 && names.length <= 8 ? '' : '' );
	const inst = INSTRUMENTS[ params.instrument ];
	const subtitle = params.text.subtitle || ( inst ? t( inst.label ) : '' );
	return compose( {
		frame,
		style,
		margin,
		title: title || subtitle,
		blocks,
		warnings,
		t,
	} );
}

/* -------------------------------- fretboard ------------------------------- */

function renderFretboard( params, env ) {
	const t = tOf( env );
	const frame = frameFor( params, env.docW, env.docH );
	const style = styleFor( params, env.kits );
	const margin = params.layout.margin;
	const warnings = [];
	const root = pitchClass( params.root );
	const pcs = root === null ? [] : scalePitches( root, params.scale );
	if ( ! pcs.length ) {
		warnings.push( t( 'Pick a root and a scale.' ) );
	}
	const prefer = keyPreference(
		params.root +
			( /minor|dorian|phrygian|aeolian|locrian|blues/.test( params.scale )
				? 'm'
				: '' )
	);
	const notes = pcs.map( ( pc ) => ( { pc, root: pc === root } ) );
	const title =
		params.text.title ||
		( root === null
			? ''
			: params.root +
			  ' ' +
			  t( SCALE_LABELS[ params.scale ] || params.scale ) );
	let block;
	if ( 'piano' === params.instrument ) {
		block = svgPiano(
			pianoKeys(
				pcs,
				root,
				Math.max( 1, Math.min( 4, params.octaves || 2 ) ),
				prefer
			),
			{
				width: frame.width - 2 * margin,
				ink: style.ink,
				accent: style.accent,
				font: style.fonts.text,
			}
		);
	} else {
		const inst = INSTRUMENTS[ params.instrument ] || INSTRUMENTS.guitar;
		const tuning = inst.tunings[ params.tuning ] || inst.tunings.standard;
		const from = Math.max(
			0,
			Math.min( params.fretFrom | 0, inst.frets - 3 )
		);
		const to = Math.max(
			from + 3,
			Math.min( params.fretTo | 0, inst.frets )
		);
		block = svgFretboard( notes, {
			tuning,
			from,
			to,
			labels: params.labels,
			rootPc: root,
			scaleOrder: pcs,
			ink: style.ink,
			accent: style.accent,
			font: style.fonts.text,
			width: frame.width - 2 * margin,
			prefer,
		} );
	}
	return compose( {
		frame,
		style,
		margin,
		title,
		blocks: [ { svg: block } ],
		warnings,
		t,
	} );
}

/* ------------------------------ manuscript paper -------------------------- */

/** A row of empty chord grids (six strings, four frets) to fill by hand. */
function blankGrids( n, size, ink, width ) {
	const gap = size * 0.3;
	const cols = Math.max(
		1,
		Math.min( n, Math.floor( ( width + gap ) / ( size + gap ) ) )
	);
	const rows = Math.ceil( n / cols );
	const h = size * 1.15;
	const out = [];
	for ( let i = 0; i < n; i++ ) {
		const x = ( i % cols ) * ( size + gap );
		const y = Math.floor( i / cols ) * ( h + gap );
		const left = x + size * 0.1;
		const top = y + size * 0.2;
		const gw = size * 0.8;
		const gh = size * 0.85;
		let d = `M${ left } ${ top }h${ gw }`;
		for ( let k = 0; k < 6; k++ ) {
			d += `M${ ( left + ( gw * k ) / 5 ).toFixed(
				2
			) } ${ top }v${ gh }`;
		}
		for ( let k = 1; k <= 4; k++ ) {
			d += `M${ left } ${ ( top + ( gh * k ) / 4 ).toFixed(
				2
			) }h${ gw }`;
		}
		out.push(
			`<path d="${ d }" fill="none" stroke="${ ink }" stroke-width="1"/><path d="M${ left } ${ top }h${ gw }" fill="none" stroke="${ ink }" stroke-width="3"/>`
		);
	}
	const w = cols * size + ( cols - 1 ) * gap;
	const hh = rows * h + ( rows - 1 ) * gap;
	return `<svg width="${ w }" height="${ hh }">${ out.join( '' ) }</svg>`;
}

async function renderPaper( params, env ) {
	const t = tOf( env );
	const frame = frameFor( params, env.docW, env.docH );
	const style = styleFor( params, env.kits );
	const margin = params.layout.margin;
	const pp = params.paper;
	const s = params.layout.scale || 1;
	const abc = paperAbc( {
		clef: pp.clef,
		key: pp.key,
		meter: pp.meter,
		bars: pp.bars,
		staves: pp.staves,
		sep: pp.sep,
	} );
	const r = await env.renderScore( abc, {
		width: frame.width,
		margin,
		scale: s,
		tab:
			pp.tab && 'grand' !== pp.clef
				? {
						tuning: tabTuning( params.instrument, params.tuning ),
						capo: 0,
				  }
				: null,
		fonts: style.fonts,
		ink: style.ink,
		accent: style.chordColor,
	} );
	const warnings = [ ...( r.warnings || [] ) ];
	const blocks = [];
	if ( pp.grids > 0 ) {
		blocks.push( {
			svg: blankGrids(
				pp.grids,
				90 * s,
				style.ink,
				frame.width - 2 * margin
			),
			gap: 8,
		} );
	}
	blocks.push( {
		svg: `<svg width="${ r.width }" height="${
			r.height
		}"><g transform="scale(${ s })">${ stripSvg( r.svg ).inner }</g></svg>`,
		gap: 0,
	} );
	return compose( {
		frame,
		style,
		margin: blocks.length > 1 || params.text.title ? margin : 0,
		title: params.text.title,
		blocks,
		warnings,
		t,
	} );
}

/* ------------------------------- note cards ------------------------------- */

async function renderFlash( params, env ) {
	const t = tOf( env );
	const frame = frameFor( params, env.docW, env.docH );
	const style = styleFor( params, env.kits );
	const margin = params.layout.margin;
	const fl = params.flash;
	const s = params.layout.scale || 1;
	const notes = flashNotes( fl.clef, fl.range );
	const cols = 4 === +fl.columns ? 4 : 3;
	const gap = 16;
	const innerW = frame.width - 2 * margin;
	const tileW = ( innerW - gap * ( cols - 1 ) ) / cols;
	const tileH = tileW * 0.66;
	const blocks = [];
	const warnings = [];
	for ( let i = 0; i < notes.length; i += cols ) {
		let row = notes.slice( i, i + cols );
		if ( 'back' === fl.side ) {
			row = row.slice().reverse();
		}
		const parts = [];
		for ( let k = 0; k < row.length; k++ ) {
			const note = row[ k ];
			const x =
				'back' === fl.side
					? ( cols - row.length + k ) * ( tileW + gap )
					: k * ( tileW + gap );
			parts.push(
				`<rect x="${ x.toFixed( 1 ) }" y="0" width="${ tileW.toFixed(
					1
				) }" height="${ tileH.toFixed( 1 ) }" fill="none" stroke="${
					style.ink
				}" stroke-width="1" stroke-dasharray="6 4" stroke-opacity="0.6"/>`
			);
			if ( 'back' === fl.side ) {
				parts.push(
					textEl(
						x + tileW / 2,
						tileH * 0.6,
						noteName( note, fl.names ),
						{
							size: tileH * 0.5,
							font: style.fonts.title,
							fill: style.ink,
							weight: 700,
							anchor: 'middle',
						}
					)
				);
				parts.push(
					textEl(
						x + tileW / 2,
						tileH * 0.86,
						( 'treble' === note.clef
							? t( 'Treble clef' )
							: t( 'Bass clef' ) ) +
							' · ' +
							note.letter +
							note.octave,
						{
							size: tileH * 0.1,
							font: style.fonts.text,
							fill: style.accent,
							anchor: 'middle',
						}
					)
				);
				continue;
			}
			const r = await env.renderScore( flashAbc( note ), {
				width: tileW * 0.8,
				margin: 4,
				scale: s * 1.5,
				tab: null,
				fonts: style.fonts,
				ink: style.ink,
				accent: style.chordColor,
			} );
			warnings.push( ...( r.warnings || [] ) );
			const { inner } = stripSvg( r.svg );
			const ox = x + ( tileW - r.width ) / 2;
			const oy = Math.max( 0, ( tileH - r.height ) / 2 );
			parts.push(
				`<g transform="translate(${ ox.toFixed( 1 ) } ${ oy.toFixed(
					1
				) }) scale(${ s * 1.5 })">${ inner }</g>`
			);
		}
		blocks.push( {
			svg: `<svg width="${ innerW }" height="${ tileH }">${ parts.join(
				''
			) }</svg>`,
			gap,
		} );
	}
	if ( ! notes.length ) {
		warnings.push( t( 'Pick a clef and a range.' ) );
	}
	return compose( {
		frame,
		style,
		margin,
		title: params.text.title,
		blocks,
		warnings,
		t,
	} );
}

/* ------------------------------- scale sheets ----------------------------- */

async function renderScales( params, env ) {
	const t = tOf( env );
	const frame = frameFor( params, env.docW, env.docH );
	const style = styleFor( params, env.kits );
	const margin = params.layout.margin;
	const sc = params.scales;
	const s = params.layout.scale || 1;
	const list =
		'majors' === sc.mode
			? CIRCLE_MAJORS.map( ( root ) => ( { root, scale: 'major' } ) )
			: 'minors' === sc.mode
			? CIRCLE_MINORS.map( ( root ) => ( {
					root,
					scale: 'harmonic-minor',
			  } ) )
			: [ { root: params.root || 'C', scale: params.scale || 'major' } ];
	const blocks = [];
	const warnings = [];
	const many = list.length > 1;
	for ( const item of list ) {
		const minorish = /minor|blues|dorian|phrygian|locrian/.test(
			item.scale
		);
		const prefer = keyPreference( item.root + ( minorish ? 'm' : '' ) );
		const title =
			item.root + ' ' + t( SCALE_LABELS[ item.scale ] || item.scale );
		const abc = scaleAbc( {
			root: item.root,
			scale: item.scale,
			octaves: sc.octaves >= 2 ? 2 : 1,
			direction: sc.direction,
			fingering: 'tab' === sc.fingering ? 'none' : sc.fingering,
			prefer,
			clef: 'left' === sc.fingering ? 'bass' : 'treble',
			title: many ? title : '',
		} );
		// Width by the number of notes, so a short scale sits centred instead of left.
		const body = abc
			.split( '\n' )
			.filter(
				( l ) => l && ! /^%%/.test( l ) && ! /^[A-Za-z]:/.test( l )
			)
			.join( ' ' )
			.replace( /"[^"]*"/g, '' );
		const noteCount = body.match( /[A-Ga-g][,']*/g ) || [];
		const width = Math.min(
			frame.width,
			Math.max( 520, noteCount.length * 46 * s + 260 * s )
		);
		const r = await env.renderScore( abc, {
			width,
			margin: many ? 24 : margin,
			scale: s,
			tab:
				'tab' === sc.fingering
					? {
							tuning: tabTuning(
								params.instrument &&
									INSTRUMENTS[ params.instrument ] &&
									INSTRUMENTS[ params.instrument ].strings
									? params.instrument
									: 'guitar',
								params.tuning
							),
							capo: 0,
					  }
					: null,
			fonts: style.fonts,
			ink: style.ink,
			accent: style.chordColor,
		} );
		warnings.push( ...( r.warnings || [] ) );
		blocks.push( {
			svg: `<svg width="${ r.width }" height="${
				r.height
			}"><g transform="scale(${ s })">${
				stripSvg( r.svg ).inner
			}</g></svg>`,
			gap: many ? 0 : 8,
		} );
	}
	const title =
		params.text.title ||
		( many
			? 'majors' === sc.mode
				? t( 'The twelve major scales' )
				: t( 'The twelve harmonic minor scales' )
			: list[ 0 ].root +
			  ' ' +
			  t( SCALE_LABELS[ list[ 0 ].scale ] || list[ 0 ].scale ) );
	return compose( {
		frame,
		style,
		margin: title ? margin : 0,
		title,
		blocks,
		warnings,
		t,
	} );
}

/* --------------------------------- cards ---------------------------------- */

export const CARDS = [
	{
		id: 'score',
		label: 'Score',
		hint: 'Paste ABC or import MusicXML. Lyrics, voices, chords, tab.',
		render: renderScoreCard,
	},
	{
		id: 'leadsheet',
		label: 'Chord Sheet',
		hint: 'Lyrics with the chords exactly over the syllable.',
		render: ( p, e ) => Promise.resolve( renderLeadsheet( p, e ) ),
	},
	{
		id: 'diagrams',
		label: 'Chord Diagrams',
		hint: 'Chord names become fingering charts for your instrument.',
		render: ( p, e ) => Promise.resolve( renderDiagrams( p, e ) ),
	},
	{
		id: 'fretboard',
		label: 'Fretboard and Keys',
		hint: 'A scale or arpeggio on the neck or on the keys.',
		render: ( p, e ) => Promise.resolve( renderFretboard( p, e ) ),
	},
	{
		id: 'paper',
		label: 'Manuscript Paper',
		hint: 'Blank staves to order: clef, key, meter, bars, TAB lines, chord grids.',
		render: renderPaper,
	},
	{
		id: 'flash',
		label: 'Note Cards',
		hint: 'A note on the staff on the front, its name on the back.',
		render: renderFlash,
	},
	{
		id: 'scales',
		label: 'Scale Sheets',
		hint: 'A scale with piano fingerings or guitar TAB, or all twelve keys.',
		render: renderScales,
	},
];

export const cardById = ( id ) =>
	CARDS.find( ( c ) => c.id === id ) || CARDS[ 0 ];

export { escapeXml };
