/**
 * Art pen presets (Pen Tool round, 19.10.2026): the dry brush, the sketch,
 * the twisted ribbon and the ragged ink edge of the shared pen engine.
 * Data only; geometry stays in lib/pen-path.
 */
import { __ } from '@wordpress/i18n';
export const PEN_ART_PRESETS = [
	{
		id: 'art-dry-brush',
		name: () => __( 'Dry brush', 'wunderpaint' ),
		group: 'art',
		style: {
			width: 34,
			kind: 'bristle',
			strands: 11,
			texture: 45,
			rough: 20,
			start: 40,
			end: 10,
			inLength: 12,
			outLength: 40,
		},
	},
	{
		id: 'art-ink-brush',
		name: () => __( 'Ink brush', 'wunderpaint' ),
		group: 'art',
		style: {
			width: 28,
			kind: 'bristle',
			strands: 14,
			texture: 18,
			rough: 35,
			start: 60,
			end: 0,
			outLength: 55,
		},
	},
	{
		id: 'art-charcoal',
		name: () => __( 'Charcoal', 'wunderpaint' ),
		group: 'art',
		style: {
			width: 24,
			kind: 'bristle',
			strands: 9,
			texture: 75,
			rough: 55,
			start: 70,
			end: 50,
		},
	},
	{
		id: 'art-hair-brush',
		name: () => __( 'Hair brush', 'wunderpaint' ),
		group: 'art',
		style: {
			width: 14,
			kind: 'bristle',
			strands: 6,
			texture: 30,
			start: 0,
			end: 0,
			inLength: 30,
			outLength: 45,
		},
	},
	{
		id: 'art-pencil-sketch',
		name: () => __( 'Pencil sketch', 'wunderpaint' ),
		group: 'art',
		style: { width: 8, kind: 'sketch', strands: 9, texture: 45 },
	},
	{
		id: 'art-loose-sketch',
		name: () => __( 'Loose sketch', 'wunderpaint' ),
		group: 'art',
		style: { width: 12, kind: 'sketch', strands: 12, texture: 85 },
	},
	{
		id: 'art-twisted-ribbon',
		name: () => __( 'Twisted ribbon', 'wunderpaint' ),
		group: 'art',
		style: { width: 30, kind: 'ribbon', texture: 35 },
	},
	{
		id: 'art-silk-ribbon',
		name: () => __( 'Silk ribbon', 'wunderpaint' ),
		group: 'art',
		style: {
			width: 22,
			kind: 'ribbon',
			texture: 70,
			start: 40,
			end: 40,
		},
	},
	{
		id: 'art-rough-ink',
		name: () => __( 'Rough ink', 'wunderpaint' ),
		group: 'art',
		style: { width: 16, rough: 60, start: 30, end: 0, outLength: 50 },
	},
	{
		id: 'art-brush-pen',
		name: () => __( 'Brush pen', 'wunderpaint' ),
		group: 'art',
		style: {
			width: 20,
			nib: true,
			nibAngle: 35,
			nibRoundness: 25,
			rough: 25,
			start: 20,
			end: 0,
			outLength: 60,
		},
	},
];
