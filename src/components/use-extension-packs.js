/**
 * Resolved extension template packs (v1.121): turns the registered pack
 * definitions (descriptor arrays or async loaders) into ready-to-render
 * starter templates with the SAME shape the bundled ones have:
 * `{ id, name, build() → Promise<{doc, layers}> }`. Resolution is cached
 * per pack id; the hook re-renders when new packs register (in-editor
 * installs land without a reload).
 */

import { useEffect, useState } from '@wordpress/element';

import {
	listExtensionTemplatePacks,
	subscribeExtensions,
	isTemplateDescriptor,
	recordExtensionIssue,
} from '../lib/extensions';
import { hydrateTemplate } from '../lib/template-io';
import { namespacePackCategories } from '../content/template-categories';

// pack.id → { label, templates } once resolved (null while in flight).
const resolved = new Map();
const waiters = new Set();

/**
 * Stable per-pack template id (v1.273.2): explicit descriptor.id, else a
 * slug of the name - the old array-index fallback shifted every runtime
 * id whenever a pack author reordered their file. `used` de-dupes inside
 * one pack deterministically.
 *
 * @param {Object} descriptor Template descriptor.
 * @param {number} index      Position (last-resort fallback).
 * @param {Set}    used       Ids already taken in this pack.
 * @return {string} Stable id.
 */
export function packTemplateId( descriptor, index, used ) {
	const slug = String( descriptor.id || descriptor.name || '' )
		.toLowerCase()
		.replace( /[^a-z0-9]+/g, '-' )
		.replace( /^-+|-+$/g, '' );
	const base = slug || 'template-' + index;
	let id = base;
	let n = 2;
	while ( used.has( id ) ) {
		id = base + '-' + n++;
	}
	used.add( id );
	return id;
}

const wrap = ( pack, descriptors ) => {
	// Vendor-namespaced categories (v1.273.2): third-party packs can
	// never collide on a chip; built-in ids keep merging on purpose.
	const ns = namespacePackCategories(
		pack.id,
		Array.isArray( pack.categories ) ? pack.categories : []
	);
	const used = new Set();
	return {
		id: pack.id,
		label: pack.label,
		categories: ns.categories,
		templates: descriptors
			.filter( ( d ) => {
				if ( isTemplateDescriptor( d ) ) {
					return true;
				}
				recordExtensionIssue(
					pack.id.split( '/' )[ 0 ],
					`Template pack "${ pack.label }": skipped an invalid template descriptor`
				);
				return false;
			} )
			.map( ( descriptor, index ) => ( {
				// Namespaced id keeps preview caches collision-free.
				id: `${ pack.id }:${ packTemplateId(
					descriptor,
					index,
					used
				) }`,
				name: descriptor.name,
				doc: descriptor.doc,
				// category + descriptor (v1.257.0): pack templates respond
				// to the category chips, color dots and copy search exactly
				// like the bundled set.
				category: ns.mapId( descriptor.category || '' ),
				descriptor,
				build: () => hydrateTemplate( descriptor ),
			} ) ),
	};
};

function ensureResolved() {
	for ( const pack of listExtensionTemplatePacks() ) {
		if ( resolved.has( pack.id ) ) {
			continue;
		}
		resolved.set( pack.id, null ); // in flight
		Promise.resolve(
			'function' === typeof pack.templates
				? pack.templates()
				: pack.templates
		)
			.then( ( list ) => {
				resolved.set(
					pack.id,
					wrap( pack, Array.isArray( list ) ? list : [] )
				);
			} )
			.catch( ( err ) => {
				resolved.set( pack.id, wrap( pack, [] ) );
				recordExtensionIssue(
					pack.id.split( '/' )[ 0 ],
					`Template pack "${ pack.label }" failed to load: ${
						err?.message || err
					}`
				);
			} )
			.finally( () => waiters.forEach( ( cb ) => cb() ) );
	}
}

const snapshot = () =>
	listExtensionTemplatePacks()
		.map( ( pack ) => resolved.get( pack.id ) )
		.filter( Boolean )
		.filter( ( pack ) => pack.templates.length );

/**
 * All resolved extension template packs: [{ id, label, templates }].
 *
 * @return {Array} Packs (empty until loaders settle).
 */
export function useExtensionTemplatePacks() {
	const [ packs, setPacks ] = useState( snapshot );
	useEffect( () => {
		const refresh = () => {
			ensureResolved();
			setPacks( snapshot() );
		};
		refresh();
		waiters.add( refresh );
		const unsubscribe = subscribeExtensions( refresh );
		return () => {
			waiters.delete( refresh );
			unsubscribe();
		};
	}, [] );
	return packs;
}
