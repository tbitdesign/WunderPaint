/** Select parsed musical events, never split ABC text at a bar character.
 * Lyrics, inline fields and notes in other voices stay attached to their events. */
export function selectExcerpt( tune, options = {} ) {
	const from = Math.max( 1, Number( options.from ) || 1 ),
		to =
			Number( options.to ) > 0
				? Math.max( from, Number( options.to ) )
				: Infinity,
		chosen = Math.max( 0, Number( options.voice ) || 0 );
	const crop = from !== 1 || to !== Infinity || !! chosen;
	const counters = new Map(),
		states = new Map(),
		lines = [],
		keptVoices = new Map();
	for ( const line of tune.lines || [] ) {
		if ( ! line.staff ) {
			if ( from === 1 ) lines.push( line );
			continue;
		}
		let voiceNumber = 0;
		const staves = [];
		line.staff.forEach( ( staff, staffIndex ) => {
			const voices = [],
				titles = [];
			let initial = null;
			staff.voices.forEach( ( voice, voiceIndex ) => {
				voiceNumber++;
				const id = staffIndex + ':' + voiceIndex;
				let counter = counters.get( id ) || {
					bar: 1,
					notes: false,
					span: 1,
				};
				let state = {
					...( states.get( id ) || {} ),
					clef: staff.clef,
					key: staff.key,
					meter: staff.meter,
				};
				const output = [];
				let first = true;
				for ( const event of voice ) {
					if (
						[ 'clef', 'key', 'meter', 'stem', 'scale' ].includes(
							event.el_type
						)
					)
						state[ event.el_type ] = event;
					const span = event.rest?.type?.includes( 'multimeasure' )
						? Math.max( 1, +event.rest.text || 1 )
						: event.el_type === 'bar'
						? counter.span
						: 1;
					const firstBar = Math.max( counter.bar, from ),
						lastBar = Math.min( counter.bar + span - 1, to );
					event.wpieMeasure = counter.bar;
					event.wpieVoice = voiceNumber;
					event.wpieSpan = span;
					const include =
						firstBar <= lastBar &&
						( ! chosen || voiceNumber === chosen );
					if ( include ) {
						if ( first ) {
							initial = { ...state };
							first = false;
						}
						if (
							event.rest?.type?.includes( 'multimeasure' ) &&
							lastBar - firstBar + 1 !== span
						) {
							const length = lastBar - firstBar + 1;
							output.push( {
								...event,
								rest: { ...event.rest, text: length },
								duration: ( event.duration * length ) / span,
								wpieMeasure: firstBar,
								wpieSpan: length,
							} );
						} else output.push( event );
					}
					if ( event.el_type === 'note' ) {
						counter.notes = true;
						counter.span = span;
					}
					if ( event.el_type === 'bar' && counter.notes ) {
						counter = {
							bar: counter.bar + counter.span,
							notes: false,
							span: 1,
						};
					}
				}
				counters.set( id, counter );
				states.set( id, state );
				if ( output.some( ( e ) => e.el_type === 'note' ) ) {
					voices.push( output );
					titles.push( staff.title?.[ voiceIndex ] );
					keptVoices.set( id, [
						...( keptVoices.get( id ) || [] ),
						...output,
					] );
				}
			} );
			if ( voices.length ) {
				const out = { ...staff, voices };
				if ( initial ) {
					for ( const key of [ 'clef', 'key', 'meter' ] )
						if ( initial[ key ] )
							out[ key ] = { ...initial[ key ] };
				}
				if ( chosen ) {
					out.title = titles;
					delete out.brace;
					delete out.bracket;
					delete out.connectBarLines;
				}
				staves.push( out );
			}
		} );
		if ( staves.length ) lines.push( { ...line, staff: staves } );
	}
	if ( ! crop ) return;
	if ( ! keptVoices.size )
		throw new Error( 'No notes in the selected range.' );
	// Cropping never invents the missing partner of a tie or slur.
	for ( const events of keptVoices.values() ) {
		const notes = events.filter( ( e ) => e.el_type === 'note' );
		if ( from > 1 )
			for ( const pitch of notes[ 0 ]?.pitches || [] )
				delete pitch.endTie;
		if ( to !== Infinity )
			for ( const pitch of notes.at( -1 )?.pitches || [] )
				delete pitch.startTie;
		const nodes = notes.flatMap( ( n ) => [ n, ...( n.pitches || [] ) ] ),
			starts = new Set(),
			ends = new Set();
		for ( const node of nodes ) {
			for ( const slur of node.startSlur || [] )
				starts.add( slur.label ?? slur );
			for ( const slur of node.endSlur || [] )
				ends.add( slur.label ?? slur );
		}
		for ( const node of nodes ) {
			if ( node.startSlur )
				node.startSlur = node.startSlur.filter( ( s ) =>
					ends.has( s.label ?? s )
				);
			if ( node.endSlur )
				node.endSlur = node.endSlur.filter( ( s ) =>
					starts.has( s.label ?? s )
				);
		}
	}
	tune.lines = lines;
}

export function isEmphasized( element, svg, options = {} ) {
	let measure = null,
		voice = null,
		node = element;
	while ( node && node !== svg ) {
		const marked = node.getAttribute?.( 'data-wpiesm-emphasis' );
		if ( marked !== null && marked !== undefined ) return marked === '1';
		const cls = node.getAttribute?.( 'class' ) || '';
		const m = /\babcjs-mm(\d+)\b/.exec( cls ),
			v = /\babcjs-v(\d+)\b/.exec( cls );
		if ( m ) measure = +m[ 1 ] + Math.max( 1, +options.from || 1 );
		if ( v ) voice = options.voice > 0 ? +options.voice : +v[ 1 ] + 1;
		node = node.parentNode;
	}
	const first = +options.highlightFrom || 0,
		last = +options.highlightTo || first;
	return (
		( first > 0 &&
			measure !== null &&
			measure >= first &&
			measure <= Math.max( first, last ) ) ||
		( +options.highlightVoice > 0 && voice === +options.highlightVoice )
	);
}

/** Map emphasis to the original events, including compressed rest measures. */
export function markEmphasis( tunes, options = {} ) {
	const first = +options.highlightFrom || 0,
		last = Math.max( first, +options.highlightTo || first );
	for ( const tune of tunes )
		for ( const line of tune.lines || [] )
			for ( const staff of line.staff || [] )
				for ( const voice of staff.voices )
					for ( const event of voice ) {
						const selected =
							( first > 0 &&
								event.wpieMeasure <= last &&
								event.wpieMeasure +
									( event.wpieSpan || 1 ) -
									1 >=
									first ) ||
							( +options.highlightVoice > 0 &&
								event.wpieVoice === +options.highlightVoice );
						for ( const element of event.abselem?.elemset || [] )
							element.setAttribute?.(
								'data-wpiesm-emphasis',
								selected ? '1' : '0'
							);
					}
}
