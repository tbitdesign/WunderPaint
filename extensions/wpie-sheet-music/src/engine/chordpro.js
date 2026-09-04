/**
 * ChordPro and "chords over lyrics" as one song model:
 * { title, subtitle, artist, key, capo, sections: [ { type, label, lines: [ { parts: [ { chord, text } ] } ] } ] }
 */
import { parseChord, transposeChord, keyPreference } from './chords.js';

const isChordToken = ( tok ) => !! parseChord( tok.replace( /[()|,]/g, '' ) );

/** A line made only of chord names (and bar marks) is a chord line. */
export function isChordLine( line ) {
	const toks = line.trim().split( /\s+/ ).filter( Boolean );
	if ( ! toks.length ) {
		return false;
	}
	return toks.every( ( t ) => isChordToken( t ) || /^[|:]+$/.test( t ) );
}

export function detectFormat( text ) {
	const t = String( text || '' );
	if ( ! t.trim() ) {
		return 'empty';
	}
	if ( /\[[A-Ha-h][^\]]*\]/.test( t ) || /^\s*\{[^}]+\}\s*$/m.test( t ) ) {
		return 'chordpro';
	}
	const lines = t.split( /\r?\n/ );
	for ( let i = 0; i < lines.length - 1; i++ ) {
		if (
			isChordLine( lines[ i ] ) &&
			lines[ i + 1 ].trim() &&
			! isChordLine( lines[ i + 1 ] )
		) {
			return 'overtext';
		}
	}
	return 'chordpro';
}

/** Chord tokens above a lyric line become [X] markers at the same columns. */
export function overTextToChordPro( text ) {
	const lines = String( text || '' ).split( /\r?\n/ );
	const out = [];
	for ( let i = 0; i < lines.length; i++ ) {
		const line = lines[ i ];
		if ( ! isChordLine( line ) ) {
			out.push( line );
			continue;
		}
		const next = lines[ i + 1 ];
		const spots = [];
		const re = /\S+/g;
		let m;
		while ( ( m = re.exec( line ) ) ) {
			if ( ! /^[|:]+$/.test( m[ 0 ] ) ) {
				spots.push( {
					col: m.index,
					chord: m[ 0 ].replace( /[()|,]/g, '' ),
				} );
			}
		}
		if ( next !== undefined && next.trim() && ! isChordLine( next ) ) {
			let lyric = next;
			for ( const s of [ ...spots ].reverse() ) {
				if ( lyric.length < s.col ) {
					lyric = lyric + ' '.repeat( s.col - lyric.length );
				}
				lyric =
					lyric.slice( 0, s.col ) +
					'[' +
					s.chord +
					']' +
					lyric.slice( s.col );
			}
			out.push( lyric );
			i++;
		} else {
			out.push( spots.map( ( s ) => '[' + s.chord + ']' ).join( ' ' ) );
		}
	}
	return out.join( '\n' );
}

const SECTION_START = {
	soc: 'chorus',
	start_of_chorus: 'chorus',
	sov: 'verse',
	start_of_verse: 'verse',
	sob: 'bridge',
	start_of_bridge: 'bridge',
	sot: 'verse',
	start_of_tab: 'verse',
};
const SECTION_END = {
	eoc: 1,
	end_of_chorus: 1,
	eov: 1,
	end_of_verse: 1,
	eob: 1,
	end_of_bridge: 1,
	eot: 1,
	end_of_tab: 1,
};
const DEFAULT_LABEL = { chorus: 'Chorus', bridge: 'Bridge', verse: '' };

export function parseChordPro( text ) {
	const song = {
		title: '',
		subtitle: '',
		artist: '',
		key: '',
		capo: 0,
		sections: [],
	};
	let cur = null;
	const open = ( type, label ) => {
		cur = {
			type,
			label: label !== undefined ? label : DEFAULT_LABEL[ type ] || '',
			lines: [],
		};
		song.sections.push( cur );
	};
	const close = () => {
		if ( cur && ! cur.lines.length && ! cur.label ) {
			song.sections.pop();
		}
		cur = null;
	};
	for ( const raw of String( text || '' ).split( /\r?\n/ ) ) {
		const line = raw.replace( /\s+$/, '' );
		if ( ! line.trim() ) {
			close();
			continue;
		}
		if ( /^\s*#/.test( line ) ) {
			continue;
		}
		const d = /^\s*\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/i.exec( line );
		if ( d ) {
			const name = d[ 1 ].toLowerCase();
			const arg = ( d[ 2 ] || '' ).trim();
			if ( 'title' === name || 't' === name ) {
				song.title = arg;
			} else if ( 'subtitle' === name || 'st' === name ) {
				song.subtitle = arg;
			} else if ( 'artist' === name || 'composer' === name ) {
				song.artist = arg;
			} else if ( 'key' === name ) {
				song.key = arg;
			} else if ( 'capo' === name ) {
				song.capo = parseInt( arg, 10 ) || 0;
			} else if (
				'comment' === name ||
				'c' === name ||
				'ci' === name ||
				'cb' === name
			) {
				close();
				song.sections.push( {
					type: 'comment',
					label: arg,
					lines: [],
				} );
			} else if ( SECTION_START[ name ] ) {
				close();
				open( SECTION_START[ name ], arg || undefined );
			} else if ( SECTION_END[ name ] ) {
				close();
			}
			continue;
		}
		if ( ! cur ) {
			open( 'verse' );
		}
		cur.lines.push( { parts: parseLine( line ) } );
	}
	close();
	return song;
}

/** '[G]Amazing [G7]grace' -> parts. Text before the first chord has chord null. */
export function parseLine( line ) {
	const parts = [];
	const re = /\[([^\]]*)\]/g;
	let last = 0;
	let chord = null;
	let m;
	while ( ( m = re.exec( line ) ) ) {
		const text = line.slice( last, m.index );
		if ( text || chord !== null ) {
			parts.push( { chord, text } );
		}
		chord = m[ 1 ].trim();
		last = m.index + m[ 0 ].length;
	}
	parts.push( { chord, text: line.slice( last ) } );
	return parts.filter(
		( p, i, a ) => p.text || p.chord !== null || a.length === 1
	);
}

export function chordsUsed( song ) {
	const out = [];
	for ( const s of song.sections ) {
		for ( const l of s.lines ) {
			for ( const p of l.parts ) {
				if (
					p.chord &&
					! out.includes( p.chord ) &&
					parseChord( p.chord )
				) {
					out.push( p.chord );
				}
			}
		}
	}
	return out;
}

/** A transposed copy; the spelling follows the new key when one is known. */
export function transposeSong( song, semitones, prefer ) {
	if ( ! semitones ) {
		return song;
	}
	const key = song.key
		? transposeChord( song.key, semitones, prefer || 'sharp' )
		: '';
	const pref = prefer || ( key ? keyPreference( key ) : 'sharp' );
	return {
		...song,
		key: song.key ? transposeChord( song.key, semitones, pref ) : '',
		sections: song.sections.map( ( s ) => ( {
			...s,
			lines: s.lines.map( ( l ) => ( {
				parts: l.parts.map( ( p ) => ( {
					...p,
					chord: p.chord
						? transposeChord( p.chord, semitones, pref )
						: p.chord,
				} ) ),
			} ) ),
		} ) ),
	};
}

/** Any text in, a Song out: over-text is converted first. */
export function songFromText( text ) {
	const fmt = detectFormat( text );
	return parseChordPro(
		'overtext' === fmt ? overTextToChordPro( text ) : text
	);
}
