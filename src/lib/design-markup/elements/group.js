import { makeGroup } from '../../../store/document';
import { applyCommon } from './common';

export function buildGroup( el, rect, ctx ) {
	const group = makeGroup( {
		name: el.name && el.name !== el.id ? el.name : 'Group',
		...rect,
		children: [],
	} );
	applyCommon( group, el, 'main', ctx );
	group.children = [];
	return { layers: [ group ], parts: { main: group.id } };
}
