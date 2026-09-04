/**
 * MusicXML -> ABC through Wim Vree's xml2abc (LGPL-3.0), which ships
 * unmodified as assets/xml2abc.js and is loaded only when
 * someone imports a MusicXML file. It publishes `vertaal` globally.
 */
let loading = null;

export function ensureXml2abc( baseUrl, version ) {
	if ( window.vertaal ) {
		return Promise.resolve();
	}
	if ( ! loading ) {
		loading = new Promise( ( ok, bad ) => {
			const s = document.createElement( 'script' );
			s.src =
				baseUrl +
				'assets/xml2abc.js?ver=' +
				encodeURIComponent( version || '1' );
			s.onload = () =>
				window.vertaal
					? ok()
					: bad(
							new Error( 'The MusicXML converter did not start.' )
					  );
			s.onerror = () => {
				loading = null;
				bad(
					new Error( 'The MusicXML converter could not be loaded.' )
				);
			};
			document.head.appendChild( s );
		} );
	}
	return loading;
}

/**
 * xml2abc was written against jQuery and calls `$` freely: $(node),
 * .find('a>b'), .text(), .attr(), .children(), .each(), .map(), .eq(),
 * .add(), .get(), .first(), .filter(), .prop() and $.parseXML(). This is
 * that subset over the plain DOM, so nothing else has to be bundled and
 * the converter behaves the same in WordPress and in the Studio.
 */
class Q {
	constructor( els ) {
		this.els = els;
		this.length = els.length;
		els.forEach( ( e, i ) => ( this[ i ] = e ) );
	}
	find( sel ) {
		const out = [];
		for ( const e of this.els ) {
			if ( e && e.querySelectorAll ) {
				for ( const n of e.querySelectorAll( sel ) ) {
					if ( ! out.includes( n ) ) {
						out.push( n );
					}
				}
			}
		}
		return new Q( out );
	}
	text() {
		return this.els.map( ( e ) => ( e && e.textContent ) || '' ).join( '' );
	}
	attr( name ) {
		const e = this.els[ 0 ];
		if ( ! e || ! e.getAttribute ) {
			return undefined;
		}
		const v = e.getAttribute( name );
		return null === v ? undefined : v;
	}
	prop( name ) {
		return this.els[ 0 ] ? this.els[ 0 ][ name ] : undefined;
	}
	children( sel ) {
		const out = [];
		for ( const e of this.els ) {
			for ( const c of ( e && e.children ) || [] ) {
				if ( ! sel || ( c.matches && c.matches( sel ) ) ) {
					out.push( c );
				}
			}
		}
		return new Q( out );
	}
	each( fn ) {
		this.els.forEach( ( e, i ) => fn.call( e, i, e ) );
		return this;
	}
	map( fn ) {
		const out = [];
		this.els.forEach( ( e, i ) => {
			const r = fn.call( e, i, e );
			if ( Array.isArray( r ) ) {
				out.push(
					...r.filter( ( x ) => null !== x && undefined !== x )
				);
			} else if ( null !== r && undefined !== r ) {
				out.push( r );
			}
		} );
		return new Q( out );
	}
	eq( i ) {
		const k = i < 0 ? this.els.length + i : i;
		return new Q( this.els[ k ] !== undefined ? [ this.els[ k ] ] : [] );
	}
	first() {
		return this.eq( 0 );
	}
	add( other ) {
		const more =
			other instanceof Q
				? other.els
				: Array.isArray( other )
				? other
				: other
				? [ other ]
				: [];
		return new Q( [
			...this.els,
			...more.filter( ( e ) => ! this.els.includes( e ) ),
		] );
	}
	get( i ) {
		return undefined === i
			? [ ...this.els ]
			: this.els[ i < 0 ? this.els.length + i : i ];
	}
	filter( x ) {
		return new Q(
			'function' === typeof x
				? this.els.filter( ( e, i ) => x.call( e, i, e ) )
				: this.els.filter( ( e ) => e && e.matches && e.matches( x ) )
		);
	}
	toArray() {
		return [ ...this.els ];
	}
}

function dollar( x ) {
	if ( x instanceof Q ) {
		return x;
	}
	if ( Array.isArray( x ) ) {
		return new Q( x );
	}
	if ( x && 'number' === typeof x.length && ! x.nodeType ) {
		return new Q( Array.from( x ) );
	}
	return new Q( x ? [ x ] : [] );
}
dollar.parseXML = ( str ) =>
	new window.DOMParser().parseFromString( str, 'text/xml' );
export const jqueryLite = dollar;

const DEFAULTS = {
	u: 0,
	b: 0,
	n: 0,
	c: 0,
	v: 0,
	d: 0,
	m: 0,
	x: 0,
	t: 0,
	p: '',
	v1: 0,
	noped: 0,
	stm: 0,
	s: 0,
};

/** { abc, info } from MusicXML text; throws on unreadable XML. */
export function convertMusicXml( xmlText, options = {} ) {
	const doc = new window.DOMParser().parseFromString( xmlText, 'text/xml' );
	if ( ! doc || doc.querySelector( 'parsererror' ) ) {
		throw new Error( 'Not a readable MusicXML file.' );
	}
	const had = Object.prototype.hasOwnProperty.call( window, '$' );
	const prev = window.$;
	window.$ = dollar;
	let res;
	try {
		res = window.vertaal( doc, { ...DEFAULTS, ...options } );
	} finally {
		if ( had ) {
			window.$ = prev;
		} else {
			delete window.$;
		}
	}
	const abc = String( ( res && res[ 0 ] ) || '' );
	const info = String( ( res && res[ 1 ] ) || '' );
	if ( ! abc.trim() ) {
		throw new Error( info.trim() || 'The file could not be converted.' );
	}
	return { abc, info };
}
