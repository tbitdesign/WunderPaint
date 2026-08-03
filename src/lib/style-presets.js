/**
 * Curated visual style presets for AI prompts (v1.164.0): one click
 * appends a battle-tested style descriptor to whatever the user typed,
 * so "a fox in the forest" becomes a watercolor, a cyberpunk scene or a
 * 3D animation still without any prompting skill. The descriptors are
 * subject-neutral on purpose - they compose with Generate, Enhance
 * Layer, Sketch to Image, Inpaint and background replacement alike.
 *
 * Prompts stay in ENGLISH regardless of the UI language: image models
 * follow English style vocabulary far more reliably. Labels translate.
 * No studio or artist names - several providers block them; the look
 * is described instead (e.g. hand-painted anime film for the beloved
 * "Ghibli look").
 */

import { __ } from '@wordpress/i18n';

// Style and mood ride at the end of the prompt behind their markers
// (style first, mood last), so picking another one REPLACES its own
// slot instead of stacking - and a style and a mood can combine
// ("Watercolor" + "Romantic").
const STYLE_MARKER = 'Style: ';
const STYLE_RE = /(?:\n\s*)?\n?Style: [^]*$/;
const MOOD_MARKER = 'Mood: ';
const MOOD_RE = /(?:\n\s*)?\n?Mood: [^]*$/;

/**
 * Split a prompt into { base, style, mood } (mood strips first: it is
 *  always the last paragraph, the style regex would swallow it).
 */
const splitPrompt = ( text ) => {
	let rest = String( text || '' );
	let mood = '';
	let style = '';
	const m = rest.match( MOOD_RE );
	if ( m ) {
		mood = m[ 0 ].replace( /^\s*/, '' ).slice( MOOD_MARKER.length );
		rest = rest.replace( MOOD_RE, '' );
	}
	const st = rest.match( STYLE_RE );
	if ( st ) {
		style = st[ 0 ].replace( /^\s*/, '' ).slice( STYLE_MARKER.length );
		rest = rest.replace( STYLE_RE, '' );
	}
	return { base: rest.trimEnd(), style, mood };
};

const joinPrompt = ( base, style, mood ) =>
	[ base, style ? STYLE_MARKER + style : '', mood ? MOOD_MARKER + mood : '' ]
		.filter( Boolean )
		.join( '\n\n' );

/**
 * Prompt text with a style applied: any previous style paragraph is
 * replaced, the subject text and a picked mood stay untouched.
 *
 * @param {string} text   Current prompt.
 * @param {Object} preset Preset ({ prompt }); null/undefined removes.
 * @return {string} New prompt text.
 */
export function applyStylePrompt( text, preset ) {
	const { base, mood } = splitPrompt( text );
	return joinPrompt( base, preset?.prompt || '', mood );
}

/**
 * Prompt text with a mood applied (independent slot next to the style).
 *
 * @param {string} text   Current prompt.
 * @param {Object} preset Mood preset ({ prompt }); null/undefined removes.
 * @return {string} New prompt text.
 */
export function applyMoodPrompt( text, preset ) {
	const { base, style } = splitPrompt( text );
	return joinPrompt( base, style, preset?.prompt || '' );
}

/**
 * The style preset a prompt currently carries, or null.
 *
 * @param {string} text    Prompt text.
 * @param {Array}  presets Flat preset list.
 * @return {Object|null} Active preset.
 */
export function activeStylePreset( text, presets ) {
	const { style } = splitPrompt( text );
	return ( style && presets.find( ( p ) => p.prompt === style ) ) || null;
}

/**
 * The mood preset a prompt currently carries, or null.
 *
 * @param {string} text    Prompt text.
 * @param {Array}  presets Flat mood list.
 * @return {Object|null} Active mood.
 */
export function activeMoodPreset( text, presets ) {
	const { mood } = splitPrompt( text );
	return ( mood && presets.find( ( p ) => p.prompt === mood ) ) || null;
}

const g = ( label, items ) => ( { label, items } );
const p = ( id, label, prompt ) => ( { id, label, prompt } );

/**
 * Grouped style presets. Called per render so labels pick up the
 * current locale (same idiom as the binding catalog).
 *
 * @return {Array} [{ label, items: [{ id, label, prompt }] }]
 */
export function stylePresetGroups() {
	return [
		g( __( 'Illustration', 'wunderpaint' ), [
			p(
				'anime-film',
				__( 'Anime Film', 'wunderpaint' ),
				'hand-painted anime feature film look: soft watercolor-washed backgrounds, painterly clouds and lush green scenery, warm nostalgic light, clean character line work with gentle cel shading, wistful storybook atmosphere, muted natural palette with pops of sky blue and leaf green'
			),
			p(
				'comic-book',
				__( 'Comic Book', 'wunderpaint' ),
				'classic comic book art: bold black ink outlines, halftone dot shading, flat saturated primary colors, dynamic panel-style composition, dramatic action angles, screen-printed texture, retro comic paper feel'
			),
			p(
				'flat-illustration',
				__( 'Flat Illustration', 'wunderpaint' ),
				'modern flat vector illustration: simple geometric shapes, clean edges without outlines, harmonious limited palette of 4-6 colors, subtle grain texture, generous negative space, friendly editorial tech-blog style, no gradients except soft long shadows'
			),
			p(
				'childrens-book',
				__( 'Children’s Book', 'wunderpaint' ),
				'warm children’s picture-book illustration: soft rounded shapes, gentle crayon and colored-pencil textures, cozy pastel palette, expressive friendly characters, whimsical details, hand-drawn imperfect charm, storytime warmth'
			),
			p(
				'line-art',
				__( 'Line Art', 'wunderpaint' ),
				'elegant minimal line art: a single confident continuous black line on a clean off-white background, no shading, no fill, negative space doing the work, refined gallery-print aesthetic, small accent in one muted color at most'
			),
			p(
				'pop-art',
				__( 'Pop Art', 'wunderpaint' ),
				'1960s pop art: bold flat colors in high contrast, thick black outlines, Ben-Day dots, repeated screen-print motifs, ironic advertising-poster energy, saturated red yellow cyan palette'
			),
		] ),
		g( __( 'Painterly', 'wunderpaint' ), [
			p(
				'watercolor',
				__( 'Watercolor', 'wunderpaint' ),
				'delicate watercolor painting: translucent layered washes, wet-on-wet color bleeds, visible cold-press paper texture, loose gestural brushwork, soft blooming edges, white paper left breathing as highlights, muted airy pigments'
			),
			p(
				'oil-painting',
				__( 'Oil Painting', 'wunderpaint' ),
				'rich classical oil painting: thick impasto brushstrokes with visible ridges, layered glazing depth, chiaroscuro lighting, warm gallery varnish glow, canvas weave showing through, masterly old-masters palette of umber, ochre and deep crimson'
			),
			p(
				'impressionist',
				__( 'Impressionist', 'wunderpaint' ),
				'impressionist painting en plein air: short broken dabs of pure color placed side by side, shimmering natural light, no hard outlines, atmosphere over detail, sun-drenched palette with violet shadows, fleeting-moment feeling'
			),
			p(
				'gouache',
				__( 'Gouache', 'wunderpaint' ),
				'matte gouache illustration: velvety opaque paint layers, chalky flat finish, crisp hand-painted edges, mid-century travel poster feel, saturated but earthy palette, subtle brush texture in large color fields'
			),
			p(
				'ink-wash',
				__( 'Ink Wash', 'wunderpaint' ),
				'East Asian ink wash painting (sumi-e): expressive black ink gradients from bold strokes to misty dilutions, vast intentional empty space, rice-paper texture, a single red seal stamp accent, meditative minimal composition'
			),
			p(
				'pastel-chalk',
				__( 'Soft Pastel', 'wunderpaint' ),
				'soft pastel chalk drawing: powdery blended strokes, velvety grain of toned paper showing through, dreamy diffused edges, tender rose, peach and lavender palette, fingertip-smudged transitions, gentle romantic mood'
			),
		] ),
		g( __( 'Photo & Film', 'wunderpaint' ), [
			p(
				'cinematic',
				__( 'Cinematic', 'wunderpaint' ),
				'cinematic film still: anamorphic widescreen framing, shallow depth of field, teal-and-orange color grade, volumetric light through haze, motivated practical lighting, subtle film grain, blockbuster production value'
			),
			p(
				'vintage-film',
				__( 'Vintage Film', 'wunderpaint' ),
				'vintage analog film photograph from the 1970s: faded warm tones, soft halation around highlights, visible film grain, slightly lifted blacks, expired-film color shifts toward amber and teal, nostalgic documentary feel'
			),
			p(
				'polaroid',
				__( 'Polaroid', 'wunderpaint' ),
				'instant photo look: soft focus, milky washed-out contrast, cool cyan shadows with creamy highlights, slight vignetting, intimate snapshot framing, dreamy faded memory atmosphere'
			),
			p(
				'golden-hour',
				__( 'Golden Hour', 'wunderpaint' ),
				'golden hour photography: low warm sun, long soft shadows, glowing rim light on edges, honey-toned atmosphere, gentle lens flare, rich amber and rose sky gradient, serene end-of-day mood'
			),
			p(
				'bw-fineart',
				__( 'Black & White', 'wunderpaint' ),
				'fine-art black and white photography: deep true blacks and luminous highlights, full tonal range, dramatic directional light, strong geometry and texture, timeless documentary gravitas, subtle silver-gelatin grain'
			),
			p(
				'studio-product',
				__( 'Studio Product', 'wunderpaint' ),
				'high-end studio product photography: seamless background, large softbox reflections with crisp speculars, perfect edge definition, controlled gradient lighting, commercial advertising polish, dust-free macro sharpness'
			),
		] ),
		g( __( 'Retro & Future', 'wunderpaint' ), [
			p(
				'cyberpunk',
				__( 'Cyberpunk', 'wunderpaint' ),
				'cyberpunk night scene: rain-slick streets reflecting neon signs in magenta and cyan, dense vertical megacity, holographic advertisements, moody fog, high-tech low-life atmosphere, cinematic backlight silhouettes'
			),
			p(
				'steampunk',
				__( 'Steampunk', 'wunderpaint' ),
				'steampunk Victorian retro-futurism: polished brass gears and copper pipes, riveted iron, leather and mahogany, hissing steam clouds, warm gaslight glow, ornate engraved details, airship-era adventure mood'
			),
			p(
				'synthwave',
				__( 'Synthwave', 'wunderpaint' ),
				'80s synthwave retrowave: neon grid horizon, glowing sunset with scanline sun, chrome typography reflections, purple-pink-blue gradient sky, VHS glow and slight chromatic aberration, outrun nostalgia'
			),
			p(
				'vaporwave',
				__( 'Vaporwave', 'wunderpaint' ),
				'vaporwave aesthetic: pastel pink and aqua gradients, classical marble statue motifs, checkerboard floors, retro computer UI fragments, palm silhouettes, dreamlike ironic mall-nostalgia atmosphere'
			),
			p(
				'art-deco',
				__( 'Art Deco', 'wunderpaint' ),
				'opulent Art Deco design: symmetrical geometric ornaments, sunburst and fan motifs, gold and black with jade accents, elegant elongated forms, luxurious 1920s Gatsby glamour, poster-flat rendering with metallic sheen'
			),
			p(
				'retro-poster',
				__( 'Retro Poster', 'wunderpaint' ),
				'mid-century retro poster: textured screen-print inks, limited palette of cream, mustard, teal and brick red, bold simplified shapes, paper grain and slight misregistration, optimistic 1950s advertising charm'
			),
		] ),
		g( __( '3D & Digital', 'wunderpaint' ), [
			p(
				'3d-animation',
				__( '3D Animation', 'wunderpaint' ),
				'still from a 3D animated feature film: appealing stylized characters with soft rounded forms, subsurface-scattered skin, big expressive eyes, cinematic global illumination, rich detailed environment, warm family-movie color script'
			),
			p(
				'claymation',
				__( 'Claymation', 'wunderpaint' ),
				'stop-motion claymation: hand-molded plasticine characters with visible fingerprints and tool marks, miniature handcrafted set, shallow tilt-shift depth, warm practical studio lighting, charming imperfect frame-by-frame feel'
			),
			p(
				'low-poly',
				__( 'Low Poly', 'wunderpaint' ),
				'low poly 3D art: faceted triangular surfaces, flat-shaded polygons without textures, clean gradient sky, isolated diorama floating on soft shadow, calm pastel-and-jewel palette, minimal geometric elegance'
			),
			p(
				'isometric',
				__( 'Isometric 3D', 'wunderpaint' ),
				'isometric 3D diorama: precise 45-degree top-down view, miniature cute scale, clean soft-plastic materials, tiny detailed props, gentle ambient occlusion, pastel palette, game-art tidiness on a plain background'
			),
			p(
				'voxel',
				__( 'Voxel', 'wunderpaint' ),
				'voxel art: everything built from tiny uniform 3D cubes, chunky playful blocky forms, bright toy-like colors, soft studio lighting with mild ambient occlusion, collectible diorama feel'
			),
			p(
				'neon-glow',
				__( 'Neon Glow', 'wunderpaint' ),
				'glowing neon light art on darkness: luminous tubes tracing the subject as clean bright lines, intense bloom and color falloff, reflections on a dark glossy floor, electric magenta, cyan and amber against near-black'
			),
		] ),
		g( __( 'Art & Abstract', 'wunderpaint' ), [
			p(
				'abstract-art',
				__( 'Abstract Art', 'wunderpaint' ),
				'bold abstract art: expressive non-representational composition, layered organic and geometric forms, confident large brush gestures, balanced asymmetry, gallery-canvas scale, sophisticated palette with one striking accent color'
			),
			p(
				'minimalist',
				__( 'Minimalist', 'wunderpaint' ),
				'radical minimalism: one clear subject, vast clean negative space, restrained two-tone palette, perfect balance and quiet tension, matte surfaces, no clutter, museum-poster serenity'
			),
			p(
				'bauhaus',
				__( 'Bauhaus', 'wunderpaint' ),
				'Bauhaus design language: primary red, yellow and blue with black on off-white, elementary circles, squares and triangles, strict grid with playful rotation, flat poster print, functional modernist clarity'
			),
			p(
				'surreal',
				__( 'Surrealism', 'wunderpaint' ),
				'dreamlike surrealism: impossible juxtapositions rendered with realistic detail, floating objects, melting or oversized elements, vast enigmatic landscapes, long theatrical shadows, quiet uncanny wonder'
			),
			p(
				'graffiti',
				__( 'Street Art', 'wunderpaint' ),
				'urban street art mural: vibrant spray-paint layers with soft overspray edges, bold wildstyle shapes, paint drips, stencil accents, weathered concrete wall texture, raw energetic city attitude'
			),
			p(
				'paper-cutout',
				__( 'Paper Cutout', 'wunderpaint' ),
				'layered paper cutout collage: hand-cut cardstock shapes stacked with real depth, soft drop shadows between layers, subtle paper fiber texture, cheerful matte colors, handcrafted diorama charm'
			),
		] ),
	];
}

/**
 * Moods & Vibes (v1.168.0): not an art technique but a feel - the
 * "make this cool" school of prompting, which works astonishingly
 * well. A mood combines with any style (own slot, own marker).
 *
 * @return {Array} [{ label, items: [{ id, label, prompt }] }]
 */
export function moodPresetGroups() {
	return [
		g( __( 'Moods & Vibes', 'wunderpaint' ), [
			p(
				'mood-cool',
				__( 'Cool', 'wunderpaint' ),
				'make it feel effortlessly cool: confident and relaxed, sleek modern styling, slightly desaturated palette with one bold accent, crisp contrast, a hint of urban editorial attitude'
			),
			p(
				'mood-professional',
				__( 'Professional', 'wunderpaint' ),
				'make it feel professional and trustworthy: clean and orderly, business-grade polish, calm blue-and-neutral palette, generous whitespace, precise details, no gimmicks'
			),
			p(
				'mood-romantic',
				__( 'Romantic', 'wunderpaint' ),
				'make it feel romantic: soft dreamy light, warm rose and blush tones, gentle sparkle, tender intimate atmosphere, delicate details'
			),
			p(
				'mood-cute',
				__( 'Cute', 'wunderpaint' ),
				'make it feel adorably cute: soft rounded forms, big friendly proportions, candy-pastel palette, cheerful little details, instantly lovable'
			),
			p(
				'mood-cozy',
				__( 'Cozy', 'wunderpaint' ),
				'make it feel warm and cozy: soft golden lamplight, comfortable homely textures like wool and wood, autumn warmth, inviting calm'
			),
			p(
				'mood-dramatic',
				__( 'Dramatic', 'wunderpaint' ),
				'make it feel dramatic: bold theatrical lighting with deep shadows, high contrast, intense atmosphere, cinematic tension, a powerful focal point'
			),
			p(
				'mood-playful',
				__( 'Playful', 'wunderpaint' ),
				'make it feel playful and fun: lively colors, bouncy dynamic arrangement, joyful energy, humorous charming details, nothing taken too seriously'
			),
			p(
				'mood-luxurious',
				__( 'Luxurious', 'wunderpaint' ),
				'make it feel luxurious: rich premium materials, gold and deep jewel tones, immaculate finish, elegant restraint, five-star exclusivity'
			),
			p(
				'mood-fresh',
				__( 'Fresh', 'wunderpaint' ),
				'make it feel fresh and clean: bright airy light, crisp whites with mint and citrus accents, dewy natural clarity, energizing lightness'
			),
			p(
				'mood-moody',
				__( 'Dark & Moody', 'wunderpaint' ),
				'make it feel dark and moody: low-key lighting, deep shadows with soft highlights, muted desaturated tones, mysterious introspective atmosphere'
			),
			p(
				'mood-energetic',
				__( 'Energetic', 'wunderpaint' ),
				'make it feel energetic: vibrant saturated colors, dynamic diagonal movement, action and momentum, punchy contrast, adrenaline and speed'
			),
			p(
				'mood-calm',
				__( 'Calm', 'wunderpaint' ),
				'make it feel calm and serene: soft even light, tranquil muted palette, balanced spacious composition, quiet minimal harmony, a deep breath of stillness'
			),
		] ),
	];
}

/** Flat list of all mood presets. */
export const allMoodPresets = () =>
	moodPresetGroups().flatMap( ( group ) => group.items );

/** Flat list of all presets. */
export const allStylePresets = () =>
	stylePresetGroups().flatMap( ( group ) => group.items );
