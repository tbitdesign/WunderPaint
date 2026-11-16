/** Resolve hook for node-resolve.mjs (runs on Node's loader thread). */
import { pathToFileURL } from 'node:url';

const SHARED = new URL( './', import.meta.url ).href;
const BARE = /^(?![./]|[a-z]+:)/i;

export async function resolve( specifier, context, next ) {
	if ( context.parentURL?.startsWith( SHARED ) && BARE.test( specifier ) ) {
		return next( specifier, {
			...context,
			parentURL: pathToFileURL( process.cwd() + '/package.json' ).href,
		} );
	}
	return next( specifier, context );
}
