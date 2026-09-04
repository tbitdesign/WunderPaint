/** Program: the order of the day, a time and a line each. */
import { LIST_SIZES, renderList } from './listcard.js';

export const ITEM = {
	id: 'program',
	label: 'Program',
	hint: 'The order of the day: one line per point, a time first when there is one.',
	group: 'cards',
	uses: { text: 'lines', names: false, photo: 'none', event: [ 'title' ] },
	textLabel: 'One point per line, the time first',
	placeholder:
		'14:00 Ceremony\n15:00 Champagne and photos\n17:00 Dinner\n20:00 First dance\n21:00 Party',
	sizes: LIST_SIZES,
	repeat: false,
	render( item, ctx, env ) {
		return renderList( item, ctx, env, {
			title: 'Program',
			mode: 'program',
		} );
	},
};
