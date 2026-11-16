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
panorama|Panoramic band
quatrefoil|Quatrefoil window
ogee|Ogee arch
sunburstwindow|Sunburst window
raindrop|Raindrop window` );
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
wintertree|Winter tree|winter
ginkgo|Ginkgo|garden
eucalyptus|Eucalyptus|garden` );
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
rosevine|Rose vines|garden
tulip|Tulips|garden
snowdrop|Snowdrops|winter
cotton|Cotton stems|garden
coral|Coral fans|coast` );
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
gate|Garden gate|garden
hotairballoon|Hot air balloon|fantasy
observatory|Observatory|mountains
greenhouse|Greenhouse|garden
campingtent|Camping tent|woodland
pagoda|Pagoda|garden
steppingstones|Stepping stones|garden
castle|Castle|town
chapel|Chapel|mountains
barn|Barn|farm
fence|Pasture fence|farm
townhouses|Row of townhouses|town
ferriswheel|Ferris wheel|festive
steamtrain|Steam train|town
christmastree|Christmas tree|festive
snowman|Snowman|winter
pumpkin|Pumpkins|festive
kite|Kite|garden
igloo|Igloo|polar
kelp|Kelp forest|ocean
bubbles|Air bubbles|ocean` );
export const THEMES = entries( `abstract|Paper sculptures
woodland|Woodland
mountains|Mountains
coast|Coast & sea
desert|Desert & savanna
tropical|Tropics
garden|Gardens & flowers
winter|Winter
fantasy|Fantasy
farm|Farm & country
polar|Polar regions
ocean|Under the sea
prehistoric|Dinosaurs
night|Night & stars
festive|Celebrations
town|Towns & castles` );
/**
 * Every animal with its name and the theme it belongs to (v3.8). The ids
 * are the silhouette slots; the generator lists decide where each one
 * lives (on the ground, in the water, in the sky).
 */
export const ANIMAL_ENTRIES = entries( `deer|Deer|woodland
moose|Moose|woodland
fox|Fox|woodland
hare|Hare|woodland
bear|Bear|woodland
wolf|Wolf|woodland
cat|Cat|garden
dog|Dog|garden
owl|Owl|night
horse|Horse|farm
squirrel|Squirrel|woodland
boar|Wild boar|woodland
ibex|Ibex|mountains
robin|Robin|garden
gull|Gull|coast
eagle|Eagle|mountains
heron|Heron|coast
gullfly|Gull in flight|coast
birdfly|Bird in flight|garden
butterfly|Butterfly|garden
owlfly|Owl in flight|night
bat|Bat|night
whale|Whale|coast
dolphin|Dolphin|coast
elephant|Elephant|desert
giraffe|Giraffe|desert
lion|Lion|desert
zebra|Zebra|desert
rhino|Rhino|desert
camel|Camel|desert
cow|Cow|farm
sheep|Sheep|farm
rooster|Rooster|farm
hedgehog|Hedgehog|woodland
frog|Frog|garden
flamingo|Flamingo|tropical
penguin|Penguin|polar
polarbear|Polar bear|polar
seal|Seal|polar
trex|T. rex|prehistoric
longneck|Brachiosaurus|prehistoric
stegosaurus|Stegosaurus|prehistoric
swan|Swan|garden
turtle|Sea turtle|ocean
octopus|Octopus|ocean
jellyfish|Jellyfish|ocean
seahorse|Seahorse|ocean
shark|Shark|ocean` );
export const LIBRARY_LABELS = Object.fromEntries(
	[
		...EXTRA_WINDOWS,
		...EXTRA_TREES,
		...EXTRA_PLANTS,
		...LANDFORMS,
		...DECORATIONS,
		...ANIMAL_ENTRIES,
	].map( ( e ) => [ e.id, e.label ] )
);
export const ORNAMENT_WINDOWS = [
	'postage',
	'branched',
	'leafwreath',
	'flowerwreath',
	'blossomwindow',
	'shell',
	'sunburstwindow',
];
export const IRREGULAR_WINDOWS = [ 'deckle', 'organic', 'mountainwindow' ];
export const MULTI_WINDOWS = [ 'doublearch', 'triplecircle', 'crossbar' ];
