/**
 * Social-media crop presets with title-safe zones (F12, v0.5).
 * Zones are fractions of the crop rect: content outside `safe` risks
 * being covered by platform UI (usernames, captions, progress bars).
 */

export const SOCIAL_CROPS = [
	{
		id: 'ig-story',
		label: 'Story / Reel 9:16',
		ratio: '9:16',
		// Top 14% (username/camera) and bottom 20% (caption/CTA) overlap.
		safe: { x: 0.05, y: 0.14, w: 0.9, h: 0.66 },
	},
	{
		id: 'ig-post',
		label: 'Social Post 1:1',
		ratio: '1:1',
		safe: { x: 0.04, y: 0.04, w: 0.92, h: 0.92 },
	},
	{
		id: 'yt-thumb',
		label: 'YouTube 16:9',
		ratio: '16:9',
		// Bottom-right timestamp + bottom progress bar.
		safe: { x: 0.03, y: 0.05, w: 0.94, h: 0.82 },
	},
	{
		id: 'fb-cover',
		label: 'FB Cover 205:78',
		ratio: '205:78',
		safe: { x: 0.17, y: 0.08, w: 0.66, h: 0.84 },
	},
];

export const socialCropById = ( id ) =>
	SOCIAL_CROPS.find( ( c ) => c.id === id ) || null;

/**
 * Safe-zone rectangle in doc coordinates for a crop rect.
 *
 * @param {Object} crop   { x, y, w, h }.
 * @param {Object} preset SOCIAL_CROPS entry.
 * @return {{x:number,y:number,w:number,h:number}} Safe rect.
 */
export function safeZoneRect( crop, preset ) {
	return {
		x: crop.x + crop.w * preset.safe.x,
		y: crop.y + crop.h * preset.safe.y,
		w: crop.w * preset.safe.w,
		h: crop.h * preset.safe.h,
	};
}
