/**
 * Target formats with per-platform safe zones (fractions of the target
 * frame; content placed by the re-layout stays out of the platform UI:
 * story username/caption bars, the YouTube timestamp/progress area).
 */

export const FORMATS = [
	{
		id: 'ig-square',
		label: 'Instagram Post',
		w: 1080,
		h: 1080,
		safe: { top: 0.04, right: 0.04, bottom: 0.04, left: 0.04 },
		on: true,
	},
	{
		id: 'ig-portrait',
		label: 'Instagram Portrait',
		w: 1080,
		h: 1350,
		safe: { top: 0.04, right: 0.04, bottom: 0.04, left: 0.04 },
		on: true,
	},
	{
		id: 'story',
		label: 'Story / Reel',
		w: 1080,
		h: 1920,
		// Username/camera row on top, caption/CTA block at the bottom.
		safe: { top: 0.14, right: 0.05, bottom: 0.2, left: 0.05 },
		on: true,
	},
	{
		id: 'pinterest',
		label: 'Pinterest Pin',
		w: 1000,
		h: 1500,
		safe: { top: 0.04, right: 0.04, bottom: 0.07, left: 0.04 },
		on: true,
	},
	{
		id: 'youtube',
		label: 'YouTube Thumbnail',
		w: 1280,
		h: 720,
		// Timestamp bottom-right, progress bar along the bottom.
		safe: { top: 0.05, right: 0.05, bottom: 0.13, left: 0.04 },
		on: true,
	},
	{
		id: 'og',
		label: 'Facebook / OG Image',
		w: 1200,
		h: 630,
		safe: { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 },
		on: true,
	},
	{
		id: 'x-post',
		label: 'X Post',
		w: 1600,
		h: 900,
		safe: { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 },
		on: true,
	},
	{
		id: 'linkedin',
		label: 'LinkedIn Post',
		w: 1200,
		h: 627,
		safe: { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 },
		on: false,
	},
	{
		id: 'x-header',
		label: 'X Header',
		w: 1500,
		h: 500,
		safe: { top: 0.08, right: 0.12, bottom: 0.08, left: 0.12 },
		on: false,
	},
	{
		id: 'fb-cover',
		label: 'Facebook Cover',
		w: 820,
		h: 312,
		// The profile picture overlaps the lower left on desktop.
		safe: { top: 0.08, right: 0.06, bottom: 0.12, left: 0.2 },
		on: false,
	},
];
