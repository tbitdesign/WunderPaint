/** Drinks menu: what the bar pours, in groups. */
import { LIST_SIZES, renderList } from './listcard.js';

export const ITEM = {
	id: 'drinks',
	label: 'Drinks menu',
	hint: 'What the bar pours, in groups: a blank line starts a group, its first line is the group name.',
	group: 'cards',
	uses: { text: 'lines', names: false, photo: 'none', event: [ 'title' ] },
	textLabel: 'Drinks, a blank line between groups',
	placeholder:
		'Cocktails\nAperol Spritz\nGin Basil Smash\n\nWine\nRiesling\nPinot Noir\n\nWithout alcohol\nHomemade lemonade\nSparkling water',
	sizes: LIST_SIZES,
	repeat: false,
	render( item, ctx, env ) {
		return renderList( item, ctx, env, { title: 'Drinks', mode: 'menu' } );
	},
};
