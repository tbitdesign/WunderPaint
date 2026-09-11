/** Stable IDs and display labels for the expanded paper library. */
const entries = ( text ) =>
	text
		.split( '\n' )
		.filter( Boolean )
		.map( ( line ) => {
			const [ id, label, theme ] = line.split( '|' );
			return { id, label, theme };
		} );
export const EXTRA_WINDOWS = entries( `pointed|Pointed arch
horseshoe|Horseshoe arch
trefoil|Trefoil arch
keyhole|Keyhole
fan|Fan
shell|Scallop shell
cloudwindow|Cloud window
leafwindow|Leaf window
acorn|Acorn
egg|Egg
diamond|Diamond
octagon|Octagon
blossomwindow|Blossom window
postage|Postage stamp
deckle|Deckled edge
organic|Organic window
branched|Branch arch
leafwreath|Leaf wreath
flowerwreath|Flower wreath
mountainwindow|Mountain window
doublearch|Twin arches
triplecircle|Three round windows
crossbar|Window cross
panorama|Panoramic band` );
export const EXTRA_TREES = entries( `oldoak|Gnarled oak|woodland
willow|Weeping willow|garden
stonepine|Umbrella pine|coast
cypress|Cypress|garden
olive|Olive tree|garden
acacia|Acacia|desert
baobab|Baobab|desert
mangrove|Mangrove|tropical
bamboo|Bamboo|tropical
banana|Banana plant|tropical
cherry|Cherry blossom|garden
magnolia|Magnolia|garden
apple|Apple tree|garden
sequoia|Sequoia|woodland
wintertree|Winter tree|winter` );
export const EXTRA_PLANTS = entries( `fern|Ferns|woodland
monstera|Monstera|tropical
elephantear|Elephant ear|tropical
agave|Agave|desert
aloe|Aloe|desert
saguaro|Columnar cactus|desert
pricklypear|Prickly pear|desert
succulent|Succulents|desert
lotus|Lotus|garden
waterlily|Water lilies|garden
iris|Irises|garden
lavender|Lavender|garden
sunflower|Sunflowers|garden
poppy|Poppies|garden
daisy|Daisies|garden
bellflower|Bellflowers|garden
lupine|Lupines|garden
thistle|Thistles|garden
foxglove|Foxgloves|garden
mushroom|Mushrooms|woodland
cattail|Cattails|coast
pampas|Pampas grass|coast
ivy|Ivy|woodland
rosevine|Rose vines|garden` );
export const LANDFORMS = entries( `canyon|Canyon|mountains
mesa|Mesas|desert
cliff|Sea cliff|coast
fjord|Fjord|mountains
glacier|Glacier|winter
waterfall|Waterfall|mountains
riverbend|River bend|woodland
terraces|Rice terraces|tropical
fields|Field strips|garden
rockarch|Rock arch|coast
sandbank|Sandbank|coast
islands|Island chain|coast
volcano|Volcano|mountains
cave|Cave opening|mountains` );
export const DECORATIONS = entries( `lighthouse|Lighthouse|coast
cabin|Cabin|woodland
bridge|Arched bridge|garden
boardwalk|Boardwalk|coast
rowboat|Rowboat|coast
sailboat|Sailboat|coast
windmill|Windmill|garden
waterwheel|Waterwheel|garden
starfield|Star field|fantasy
aurora|Aurora|winter
lantern|Paper lantern|fantasy
gate|Garden gate|garden` );
export const THEMES = entries( `woodland|Woodland
mountains|Mountains
coast|Coast & sea
desert|Desert & savanna
tropical|Tropics
garden|Gardens & flowers
winter|Winter
fantasy|Fantasy` );
export const LIBRARY_LABELS = Object.fromEntries(
	[
		...EXTRA_WINDOWS,
		...EXTRA_TREES,
		...EXTRA_PLANTS,
		...LANDFORMS,
		...DECORATIONS,
	].map( ( e ) => [ e.id, e.label ] )
);
export const ORNAMENT_WINDOWS = [
	'postage',
	'branched',
	'leafwreath',
	'flowerwreath',
	'blossomwindow',
	'shell',
];
export const IRREGULAR_WINDOWS = [ 'deckle', 'organic', 'mountainwindow' ];
export const MULTI_WINDOWS = [ 'doublearch', 'triplecircle', 'crossbar' ];
