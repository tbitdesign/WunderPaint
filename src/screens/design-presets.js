/**
 * Design Generator studio (v1.430): presets, formats and check words.
 *
 * The presets are complete example briefs, not fill-in forms: one click
 * gives a brief that already produces a sensible design, and the user
 * edits it in place. The icons are Tabler paths copied out of
 * src/icons-lib/tabler.json so the dialog does not pull the 5000-icon
 * chunk for two dozen tiles.
 */

import { __, sprintf } from '@wordpress/i18n';
import { Icon } from '../icons';

// Tabler icon paths (MIT, see license-texts) used by the Design Generator
// presets and studio chrome; extracted from src/icons-lib/tabler.json so the
// dialog does not load the whole icon library chunk.
export const TABLER = {
	tag: 'M6.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3',
	percentage:
		'M16 17a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M6 7a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M6 18l12 -12',
	rocket: 'M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3 M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3 M14 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
	sparkles:
		'M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6',
	gift: 'M3 9a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1l0 -2 M12 8l0 13 M19 12v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-7 M7.5 8a2.5 2.5 0 0 1 0 -5a4.8 8 0 0 1 4.5 5a4.8 8 0 0 1 4.5 -5a2.5 2.5 0 0 1 0 5',
	hourglass:
		'M6.5 7h11 M6.5 17h11 M6 20v-2a6 6 0 1 1 12 0v2a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1 M6 4v2a6 6 0 1 0 12 0v-2a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1',
	'calendar-event':
		'M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12 M16 3l0 4 M8 3l0 4 M4 11l16 0 M8 15h2v2h-2l0 -2',
	presentation:
		'M3 4l18 0 M4 4v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-10 M12 16l0 4 M9 20l6 0 M8 12l3 -3l2 2l3 -3',
	'clock-hour-4': 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M12 12l3 2 M12 7v5',
	'building-store':
		'M3 21l18 0 M3 7v1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1h-18l2 -4h14l2 4 M5 21l0 -10.15 M19 21l0 -10.15 M9 21v-4a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v4',
	briefcase:
		'M3 9a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2l0 -9 M8 7v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2 M12 12l0 .01 M3 13a20 20 0 0 0 18 0',
	confetti:
		'M4 5h2 M5 4v2 M11.5 4l-.5 2 M18 5h2 M19 4v2 M15 9l-1 1 M18 13l2 -.5 M18 19h2 M19 18v2 M14 16.518l-6.518 -6.518l-4.39 9.58a1 1 0 0 0 1.329 1.329l9.579 -4.39',
	quote: 'M10 11h-4a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h3a1 1 0 0 1 1 1v6c0 2.667 -1.333 4.333 -4 5 M19 11h-4a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h3a1 1 0 0 1 1 1v6c0 2.667 -1.333 4.333 -4 5',
	'message-2-heart':
		'M8 9h8 M8 13h3.5 M10.5 19.5l-1.5 -1.5h-3a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v4 M18 22l3.35 -3.284a2.143 2.143 0 0 0 .005 -3.071a2.242 2.242 0 0 0 -3.129 -.006l-.224 .22l-.223 -.22a2.242 2.242 0 0 0 -3.128 -.006a2.143 2.143 0 0 0 -.006 3.071l3.355 3.296',
	bulb: 'M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7 M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3 M9.7 17l4.6 0',
	'chart-bar':
		'M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -6 M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -10 M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -14 M4 20h14',
	camera: 'M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2 M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0',
	news: 'M16 6h3a1 1 0 0 1 1 1v11a2 2 0 0 1 -4 0v-13a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1v12a3 3 0 0 0 3 3h11 M8 8l4 0 M8 12l4 0 M8 16l4 0',
	'chef-hat':
		'M12 3c1.918 0 3.52 1.35 3.91 3.151a4 4 0 0 1 2.09 7.723l0 7.126h-12v-7.126a4 4 0 1 1 2.092 -7.723a4 4 0 0 1 3.908 -3.151 M6.161 17.009l11.839 -.009',
	bread: 'M18 4a3 3 0 0 1 2 5.235v8.765a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-8.764a3 3 0 0 1 1.824 -5.231h12.176v-.005',
	home: 'M5 12l-2 0l9 -9l9 9l-2 0 M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7 M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6',
	bed: 'M5 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M22 17v-3h-20 M2 8v9 M12 14h10v-2a3 3 0 0 0 -3 -3h-7v5',
	school: 'M22 9l-10 -4l-10 4l10 4l10 -4v6 M6 10.6v5.4a6 3 0 0 0 12 0v-5.4',
	'heart-handshake':
		'M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572 M12 6l-3.293 3.293a1 1 0 0 0 0 1.414l.543 .543c.69 .69 1.81 .69 2.5 0l1 -1a3.182 3.182 0 0 1 4.5 0l2.25 2.25 M12.5 15.5l2 2 M15 13l2 2',
	square: 'M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14',
	'rectangle-vertical':
		'M5 5a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2l0 -14',
	rectangle:
		'M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10',
	photo: 'M15 8h.01 M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12 M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5 M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3',
	file: 'M14 3v4a1 1 0 0 0 1 1h4 M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2',
	'file-text':
		'M14 3v4a1 1 0 0 0 1 1h4 M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2 M9 9l1 0 M9 13l6 0 M9 17l6 0',
	'layout-grid':
		'M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4 M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4 M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4 M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4',
	adjustments:
		'M4 10a2 2 0 1 0 4 0a2 2 0 0 0 -4 0 M6 4v4 M6 12v8 M10 16a2 2 0 1 0 4 0a2 2 0 0 0 -4 0 M12 4v10 M12 18v2 M16 7a2 2 0 1 0 4 0a2 2 0 0 0 -4 0 M18 4v1 M18 9v11',
	history: 'M12 8l0 4l2 2 M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5',
	typography:
		'M4 20l3 0 M14 20l7 0 M6.9 15l6.9 0 M10.2 6.3l5.8 13.7 M5 20l6 -16l2 0l7 16',
	palette:
		'M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25 M7.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M11.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M15.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
	'mood-smile':
		'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M9 10l.01 0 M15 10l.01 0 M9.5 15a3.5 3.5 0 0 0 5 0',
	wand: 'M6 21l15 -15l-3 -3l-15 15l3 3 M15 6l3 3 M9 3a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2 M19 13a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2',
	refresh:
		'M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4 M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4',
	eye: 'M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0 M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6',
	trash: 'M4 7l16 0 M10 11l0 6 M14 11l0 6 M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12 M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3',
	'arrow-back-up': 'M9 14l-4 -4l4 -4 M5 10h11a4 4 0 1 1 0 8h-1',
	'device-mobile':
		'M6 5a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-14 M11 4h2 M12 17v.01',
	'device-desktop':
		'M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10 M7 20h10 M9 16v4 M15 16v4',
	link: 'M9 15l6 -6 M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464 M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463',
};

/**
 * A Tabler icon as an element.
 *
 * @param {string} name Key in TABLER.
 * @param {number} size Pixel size.
 * @return {Object} Icon element.
 */
export const tab = ( name, size = 16 ) =>
	Icon( { d: TABLER[ name ] || TABLER.sparkles, size, sw: 1.6 } );

/** Preset groups: id, icon, name, hint and the brief the tile seeds. */
export const PRESET_GROUPS = () => [
	{
		id: 'sell',
		name: __( 'Sell', 'wunderpaint' ),
		presets: [
			{
				id: 'sale',
				icon: 'tag',
				name: __( 'Weekend Sale', 'wunderpaint' ),
				hint: __( 'Big discount, loud and urgent', 'wunderpaint' ),
				brief: 'Instagram post for a weekend sale at a small sneaker store: 30 percent off all running shoes, Friday to Sunday, code RUN30. Loud, urban, energetic, one huge number.',
			},
			{
				id: 'coupon',
				icon: 'percentage',
				name: __( 'Discount Code', 'wunderpaint' ),
				hint: __( 'The code as the hero, clear terms', 'wunderpaint' ),
				brief: 'A voucher card for an online tea shop: code TEA15 gives 15 percent off the first order, valid until the end of the month. The code sits in a dashed ticket-style box, calm green tones, friendly and trustworthy.',
			},
			{
				id: 'launch',
				icon: 'rocket',
				name: __( 'Product Launch', 'wunderpaint' ),
				hint: __( 'One benefit, dark tech look', 'wunderpaint' ),
				brief: "Link preview for the launch of a note-taking app called Quill: 'Your thoughts, finally in order.' Clean tech look, dark mode, one accent color, a subtle product hint.",
			},
			{
				id: 'newin',
				icon: 'sparkles',
				name: __( 'New Arrivals', 'wunderpaint' ),
				hint: __( 'Fresh collection, airy, photo-led', 'wunderpaint' ),
				brief: "Announcement of the new autumn collection at a small fashion label: 'New in: knits for cold mornings.' Soft photo of wool textures, warm neutrals, elegant serif headline, small 'Shop the collection' button.",
			},
			{
				id: 'bundle',
				icon: 'gift',
				name: __( 'Bundle Offer', 'wunderpaint' ),
				hint: __( 'A set deal with a price badge', 'wunderpaint' ),
				brief: 'A bundle offer for a coffee roastery: three single-origin bags for 29 euros instead of 36, free shipping. Earthy browns and cream, playful price badge, appetizing and handmade.',
			},
			{
				id: 'lastcall',
				icon: 'hourglass',
				name: __( 'Last Chance', 'wunderpaint' ),
				hint: __( 'Ends soon, one clear date', 'wunderpaint' ),
				brief: "Last-chance reminder for the early-bird ticket price of a design conference: 'Early bird ends Sunday.' Strong contrast, a clear date, one button 'Get your ticket', modern and confident.",
			},
		],
	},
	{
		id: 'announce',
		name: __( 'Announce', 'wunderpaint' ),
		presets: [
			{
				id: 'event',
				icon: 'calendar-event',
				name: __( 'Event Poster', 'wunderpaint' ),
				hint: __( 'Name, date and place', 'wunderpaint' ),
				brief: 'Poster for an open-air jazz evening on 12 July at the old harbour, doors 19:00, free entry, presented by the city library. Warm summer night, elegant, a little nostalgic.',
			},
			{
				id: 'webinar',
				icon: 'presentation',
				name: __( 'Webinar', 'wunderpaint' ),
				hint: __( 'Topic, speaker and time', 'wunderpaint' ),
				brief: "Announcement for a free webinar 'SEO for small shops' on 3 October at 6 pm with speaker Mia Lindqvist. Clear, professional, a small speaker photo, a 'Register now' button, cool blue palette.",
			},
			{
				id: 'hours',
				icon: 'clock-hour-4',
				name: __( 'Opening Hours', 'wunderpaint' ),
				hint: __( 'New hours or a holiday closing', 'wunderpaint' ),
				brief: 'Notice for a bike repair shop: new opening hours from September, Monday to Friday 9 to 18, Saturday 10 to 14. Friendly, clean, an easy-to-scan list of days, a small accent illustration hint.',
			},
			{
				id: 'opening',
				icon: 'building-store',
				name: __( 'Grand Opening', 'wunderpaint' ),
				hint: __( 'New location, festive invitation', 'wunderpaint' ),
				brief: 'Grand opening of a second bakery branch on Market Street 12 on 20 September, with free coffee from 8 am. Cosy, celebratory, warm colors, handmade feel, the address large and readable.',
			},
			{
				id: 'hiring',
				icon: 'briefcase',
				name: __( 'We Are Hiring', 'wunderpaint' ),
				hint: __( 'Job title and three perks', 'wunderpaint' ),
				brief: "Job post for a small web agency looking for a front-end developer, remote possible, four-day week. Modern, straightforward, one strong headline 'We're hiring', a short list of three perks, a button 'Apply now'.",
			},
			{
				id: 'greeting',
				icon: 'confetti',
				name: __( 'Seasonal Greeting', 'wunderpaint' ),
				hint: __( 'Holiday wishes or a thank-you', 'wunderpaint' ),
				brief: "Season's greetings card from a family-run garden center: 'Thank you for a wonderful year.' Festive but tasteful, deep green and gold, a little sparkle, warm and personal.",
			},
		],
	},
	{
		id: 'tell',
		name: __( 'Tell', 'wunderpaint' ),
		presets: [
			{
				id: 'quote',
				icon: 'quote',
				name: __( 'Quote Card', 'wunderpaint' ),
				hint: __( 'One sentence, lots of air', 'wunderpaint' ),
				brief: "A quote card for a yoga studio: 'Breathe in the morning, let the day follow.' Calm, airy, natural materials, plenty of space.",
			},
			{
				id: 'testimonial',
				icon: 'message-2-heart',
				name: __( 'Testimonial', 'wunderpaint' ),
				hint: __( 'A customer voice with a name', 'wunderpaint' ),
				brief: "Customer testimonial for a bookkeeping app: 'I finally stopped dreading month-end.' by Jonas Weber, freelance photographer. Trustworthy, warm, big quotation marks, small portrait placeholder, soft neutral palette.",
			},
			{
				id: 'tip',
				icon: 'bulb',
				name: __( 'Tip Card', 'wunderpaint' ),
				hint: __( 'Short advice with a number', 'wunderpaint' ),
				brief: "A tip card for a gardening blog: 'Water tomatoes in the morning, not at noon.' with two short supporting lines. Fresh, friendly, clear hierarchy, a small numbered chip 'Tip 07'.",
			},
			{
				id: 'stat',
				icon: 'chart-bar',
				name: __( 'Big Number', 'wunderpaint' ),
				hint: __( 'One statistic as the hero', 'wunderpaint' ),
				brief: "A results card for a nonprofit: 1,200 trees planted this spring thanks to donors. One big number as the hero, short thank-you line, button 'See the map'. Fresh green, optimistic.",
			},
			{
				id: 'bts',
				icon: 'camera',
				name: __( 'Behind the Scenes', 'wunderpaint' ),
				hint: __( 'A photo carries the story', 'wunderpaint' ),
				brief: "Behind-the-scenes post for a ceramics studio: 'Glazing day. 48 bowls, one kiln, six hours.' A full-bleed photo of the workshop, minimal type, a small kicker 'Studio diary', muted earthy tones.",
			},
			{
				id: 'editorial',
				icon: 'news',
				name: __( 'Editorial Cover', 'wunderpaint' ),
				hint: __( 'Magazine look, serif, kicker', 'wunderpaint' ),
				brief: 'Editorial cover for a long read about slow travel by train through the Alps. Serif typography, a photo of mountains, a small kicker, calm and premium.',
			},
		],
	},
	{
		id: 'host',
		name: __( 'Host & Home', 'wunderpaint' ),
		presets: [
			{
				id: 'menu',
				icon: 'chef-hat',
				name: __( 'Menu', 'wunderpaint' ),
				hint: __( 'Dishes with prices', 'wunderpaint' ),
				brief: "A weekly lunch menu for a small bistro with five dishes and prices, Monday to Friday, all under 12 euros. Clean list, appetizing, handwritten-feel headline 'This week', warm cream and terracotta.",
			},
			{
				id: 'dish',
				icon: 'bread',
				name: __( 'Dish of the Day', 'wunderpaint' ),
				hint: __( 'One dish, one photo, one price', 'wunderpaint' ),
				brief: "Announcement for a bakery's new sourdough Saturday: fresh loaves from 8 am, limited to 60 pieces. Cosy, handmade, appetizing, playful chip with the number.",
			},
			{
				id: 'realestate',
				icon: 'home',
				name: __( 'Property Listing', 'wunderpaint' ),
				hint: __( 'A home with three key facts', 'wunderpaint' ),
				brief: "Real estate post for a bright three-room apartment in Lisbon, 92 square meters, balcony, 1,450 euros per month. A large photo, three key facts as small chips, an elegant, calm style, a 'Book a viewing' button.",
			},
			{
				id: 'rental',
				icon: 'bed',
				name: __( 'Holiday Rental', 'wunderpaint' ),
				hint: __( 'Cabin or apartment, free dates', 'wunderpaint' ),
				brief: "Holiday rental post for a cabin by the lake, sleeps four, sauna, free weeks in October. Relaxed, natural, a wide photo, a soft 'Check availability' button, forest greens and wood tones.",
			},
			{
				id: 'course',
				icon: 'school',
				name: __( 'Course Offer', 'wunderpaint' ),
				hint: __( 'Workshop with date and price', 'wunderpaint' ),
				brief: "Workshop announcement: 'Watercolor basics', a Saturday course on 11 October, 10 to 16, 89 euros including materials, 8 places. Creative, light, a painterly accent, a clear 'Reserve a place' button.",
			},
			{
				id: 'thanks',
				icon: 'heart-handshake',
				name: __( 'Thank You', 'wunderpaint' ),
				hint: __( 'A warm note to customers', 'wunderpaint' ),
				brief: "A thank-you post for a small bookshop reaching 1,000 newsletter subscribers: 'One thousand of you. Thank you.' Warm, personal, understated, a paper-like background, soft red accent.",
			},
		],
	},
];

/** Presets shown as examples in the empty result area. */
export const EXAMPLE_IDS = [
	'event',
	'quote',
	'stat',
	'launch',
	'dish',
	'hiring',
];

/**
 * A preset by id, across all groups.
 *
 * @param {string} id Preset id.
 * @return {?Object} Preset.
 */
export function presetById( id ) {
	for ( const g of PRESET_GROUPS() ) {
		const p = g.presets.find( ( x ) => x.id === id );
		if ( p ) {
			return p;
		}
	}
	return null;
}

/** Canvas formats offered while the document is still empty. */
export const FORMATS = () => [
	{
		id: 'square',
		icon: 'square',
		name: __( 'Square post', 'wunderpaint' ),
		w: 1080,
		h: 1080,
	},
	{
		id: 'portrait',
		icon: 'rectangle-vertical',
		name: __( 'Portrait post', 'wunderpaint' ),
		w: 1080,
		h: 1350,
	},
	{
		id: 'story',
		icon: 'device-mobile',
		name: __( 'Story', 'wunderpaint' ),
		w: 1080,
		h: 1920,
	},
	{
		id: 'link',
		icon: 'link',
		name: __( 'Link preview', 'wunderpaint' ),
		w: 1200,
		h: 630,
	},
	{
		id: 'wide',
		icon: 'device-desktop',
		name: __( 'Wide', 'wunderpaint' ),
		w: 1920,
		h: 1080,
	},
	{
		id: 'poster',
		icon: 'file',
		name: __( 'Poster', 'wunderpaint' ),
		w: 1414,
		h: 2000,
	},
];

// The compiler's check codes in the user's words. Codes without an entry
// (missing-ref, dup-id, empty-content, empty-label, unknown-kind ...) all
// mean the model left the design incomplete.
const CHECK_WORDS = () => ( {
	contrast: __( 'Contrast too low', 'wunderpaint' ),
	'overlap-text': __( 'Texts overlap', 'wunderpaint' ),
	margin: __( 'Too close to the edge', 'wunderpaint' ),
	'min-size': __( 'Text too small', 'wunderpaint' ),
	lines: __( 'Too many lines', 'wunderpaint' ),
	overflow: __( 'Text does not fit', 'wunderpaint' ),
	'asset-missing': __( 'Image missing', 'wunderpaint' ),
	'build-error': __( 'Could not be built', 'wunderpaint' ),
	'verify-error': __( 'Could not be checked', 'wunderpaint' ),
	limit: __( 'Too many elements', 'wunderpaint' ),
} );

/**
 * The design's own name (the model names every design), else a number.
 *
 * @param {Object} v Variant from prepareDesignVariants().
 * @param {number} i Index.
 * @return {string} Name.
 */
export function designName( v, i ) {
	const name =
		( v.markup && ( v.markup.name || v.markup.concept?.idea ) ) || '';
	if ( name ) {
		return String( name ).length > 48
			? String( name ).slice( 0, 46 ) + '…'
			: String( name );
	}
	return sprintf(
		/* translators: %d: design number. */
		__( 'Design %d', 'wunderpaint' ),
		i + 1
	);
}

/**
 * What the compiler's checks say about a design, in user words.
 *
 * @param {Object} v Variant (status + report).
 * @return {{ok: boolean, headline: string, items: Array<{code: string, text: string}>}} Checks.
 */
export function designChecks( v ) {
	const words = CHECK_WORDS();
	const ok = 'valid' === v.status;
	const items = [];
	const seen = new Set();
	const add = ( code, fallback ) => {
		if ( ! code || seen.has( code ) ) {
			return;
		}
		seen.add( code );
		items.push( { code, text: words[ code ] || fallback } );
	};
	for ( const e of v.report?.errors || [] ) {
		add( e.code, __( 'Incomplete design', 'wunderpaint' ) );
	}
	for ( const x of v.report?.metrics?.violations || [] ) {
		add( x.code, x.code );
	}
	const repairs = ( v.report?.repairs || [] ).length;
	return {
		ok,
		repairs,
		headline: ok
			? __( 'Checked', 'wunderpaint' )
			: items[ 0 ]?.text || __( 'Unchecked', 'wunderpaint' ),
		items,
	};
}
