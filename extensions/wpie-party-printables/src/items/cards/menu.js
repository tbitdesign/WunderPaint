/** Menu card: courses from the text, a blank line between courses. */
import { LIST_SIZES, renderList } from './listcard.js';

export const ITEM = {
	id: 'menu',
	label: 'Menu card',
	hint: 'The courses of the dinner on one card: a blank line starts a course, its first line is the course name.',
	group: 'cards',
	uses: { text: 'lines', names: false, photo: 'none', event: [ 'title' ] },
	textLabel: 'Courses, a blank line between them',
	placeholder:
		'Starter\nBurrata with tomatoes\nPumpkin soup\n\nMain\nRoast chicken with rosemary\nMushroom risotto\n\nDessert\nLemon tart',
	sizes: LIST_SIZES,
	repeat: false,
	render( item, ctx, env ) {
		return renderList( item, ctx, env, { title: 'Menu', mode: 'menu' } );
	},
};
