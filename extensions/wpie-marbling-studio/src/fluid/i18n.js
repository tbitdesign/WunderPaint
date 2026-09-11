import { t } from '../i18n.js';
import { FLUID_STRINGS } from './strings.js';

const locale = ( window.WPIE?.locale || document.documentElement.lang || 'en' )
	.slice( 0, 2 )
	.toLowerCase();
const index = [ 'de', 'es', 'fr', 'it', 'pt', 'nl' ].indexOf( locale );
export function labT( key ) {
	return ( index >= 0 && FLUID_STRINGS[ key ]?.[ index ] ) || t( key );
}
