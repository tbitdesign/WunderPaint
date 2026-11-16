/**
 * The fixed model instructions behind the prompt-based AI Studio buttons.
 *
 * One source for two readers: ai-actions.js runs them, ai-buttons.js shows
 * them as the starting point when an admin duplicates a built-in button
 * (spec 2026-09-16). English on purpose - image models are more reliable
 * with English - and never user-facing UI text, so no __().
 */
export const AI_PROMPTS = {
	enhanceLayer:
		'Recreate this image at a much higher quality: sharper focus, finer detail, cleaner edges, richer color depth and improved, natural lighting for a crisp, high-resolution finish. Preserve the exact subject, composition, colors, proportions and overall style, improving only the fidelity and craftsmanship.',
	enhanceDesign:
		'Redesign the following graphic, photo or composition to a professional, high-end standard. Keep the existing layout, structure, text content and overall composition exactly as they are; do not move, add or remove elements or change the wording. Elevate the visual design instead: refined typographic treatment, polished color and contrast, tasteful depth, lighting and shadow, cohesive spacing and visual hierarchy, and premium finishing details, so the result looks dramatically cooler, more striking and more professionally designed while remaining faithful to the original arrangement.',
	colorize:
		'Colorize this black-and-white image with natural, realistic colors. Keep every detail, the composition and the lighting exactly unchanged.',
	cartoon:
		'Redraw this image in a clean, vibrant cartoon illustration style with bold outlines and flat, cel-shaded colors. Keep the same subject, pose and composition.',
	restore:
		'Restore this old, damaged photograph: remove scratches, dust, creases, stains and noise, repair torn or faded areas, and improve sharpness and clarity, while keeping the original composition, content and era-accurate look.',
};
