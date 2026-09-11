import heroTitle from '../../../tools/design-markup/fixtures/hero-title.json';
import archPhoto from '../../../tools/design-markup/fixtures/arch-photo.json';
import splitStat from '../../../tools/design-markup/fixtures/split-stat.json';

/** Die Stufe-1-Fixtures (Dev-Haken, Tests, Prüfstand). */
export const FIXTURES = {
	'hero-title': heroTitle,
	'arch-photo': archPhoto,
	'split-stat': splitStat,
};

/**
 * Look up a fixture by name for the dev hook (`window.WPIE.designMarkup.run`)
 * - a console typo has no UI to catch it, so a missing name throws a
 * message that names the fixtures that DO exist instead of surfacing as a
 * bare TypeError the first time something reads `.meta` off `undefined`.
 */
export function fixtureByName( name ) {
	if ( ! FIXTURES[ name ] ) {
		throw new Error(
			`Unknown fixture "${ name }". Available: ${ Object.keys(
				FIXTURES
			).join( ', ' ) }`
		);
	}
	return FIXTURES[ name ];
}
