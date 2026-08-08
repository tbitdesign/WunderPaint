/**
 * Quick-start day templates. Each returns fresh block objects (minutes for
 * start/end, a colour and an emoji) so a click fills a believable day.
 */
const B = ( label, start, end, color, emoji ) => ( {
	label,
	start,
	end,
	color,
	emoji,
} );

export const PRESETS = {
	work: {
		label: 'Work day',
		title: 'My Work Day',
		blocks: () => [
			B( 'Sleep', 1380, 390, '#5c6bc0', '💤' ),
			B( 'Morning', 390, 480, '#ffb74d', '☀️' ),
			B( 'Commute', 480, 540, '#a5d8ff', '🚆' ),
			B( 'Deep work', 540, 720, '#4dabf7', '💻' ),
			B( 'Stand-up', 600, 630, '#f783ac', '🗣️' ),
			B( 'Lunch', 720, 780, '#51cf66', '🥗' ),
			B( 'Meetings', 780, 900, '#ffa94d', '📅' ),
			B( 'Focus', 900, 1050, '#4dabf7', '🎯' ),
			B( 'Gym', 1080, 1140, '#ff6b6b', '🏋️' ),
			B( 'Dinner', 1170, 1260, '#ffd43b', '🍽️' ),
			B( 'Read', 1260, 1350, '#9775fa', '📖' ),
		],
	},
	weekend: {
		label: 'Weekend',
		title: 'Lazy Sunday',
		blocks: () => [
			B( 'Sleep in', 1350, 540, '#5c6bc0', '💤' ),
			B( 'Brunch', 600, 690, '#ffd43b', '🥞' ),
			B( 'Walk', 720, 810, '#51cf66', '🌳' ),
			B( 'Hobby', 840, 1020, '#4dabf7', '🎨' ),
			B( 'Friends', 1080, 1260, '#ff70a6', '🥂' ),
			B( 'Movie', 1290, 1410, '#9775fa', '🍿' ),
		],
	},
	wedding: {
		label: 'Wedding day',
		title: 'Our Big Day',
		blocks: () => [
			B( 'Getting ready', 540, 720, '#ffd6a5', '💄' ),
			B( 'First look', 720, 780, '#ffadad', '📸' ),
			B( 'Ceremony', 840, 900, '#a0c4ff', '💍' ),
			B( 'Cocktails', 900, 1020, '#bdb2ff', '🍸' ),
			B( 'Dinner', 1020, 1140, '#caffbf', '🍽️' ),
			B( 'Speeches', 1140, 1200, '#ffc6ff', '🎤' ),
			B( 'Party', 1200, 1440, '#ff70a6', '🕺' ),
		],
	},
	travel: {
		label: 'Travel day',
		title: 'Day in the City',
		blocks: () => [
			B( 'Breakfast', 480, 540, '#ffd43b', '🥐' ),
			B( 'Old town', 540, 720, '#4dabf7', '🏛️' ),
			B( 'Lunch', 720, 780, '#51cf66', '🍝' ),
			B( 'Museum', 810, 960, '#9775fa', '🖼️' ),
			B( 'Beach', 990, 1140, '#22b8cf', '🏖️' ),
			B( 'Sunset', 1170, 1230, '#ffa94d', '🌅' ),
			B( 'Dinner', 1230, 1350, '#ff6b6b', '🍷' ),
		],
	},
	kids: {
		label: 'Kids routine',
		title: 'Daily Routine',
		blocks: () => [
			B( 'Sleep', 1200, 420, '#5c6bc0', '💤' ),
			B( 'Wake & dress', 420, 450, '#ffb74d', '👕' ),
			B( 'Breakfast', 450, 510, '#ffd43b', '🥣' ),
			B( 'School', 510, 900, '#4dabf7', '🎒' ),
			B( 'Play', 930, 1020, '#51cf66', '🧸' ),
			B( 'Homework', 1020, 1080, '#ffa94d', '✏️' ),
			B( 'Dinner', 1080, 1140, '#ff6b6b', '🍽️' ),
			B( 'Bath & story', 1140, 1200, '#9775fa', '🛁' ),
		],
	},
	study: {
		label: 'Study day',
		title: 'Study Plan',
		blocks: () => [
			B( 'Sleep', 1380, 420, '#5c6bc0', '💤' ),
			B( 'Morning routine', 420, 480, '#ffb74d', '☀️' ),
			B( 'Study block 1', 510, 630, '#4dabf7', '📚' ),
			B( 'Break', 630, 645, '#ffd43b', '☕' ),
			B( 'Study block 2', 645, 765, '#4dabf7', '📚' ),
			B( 'Lunch', 765, 825, '#51cf66', '🥗' ),
			B( 'Revision', 855, 1005, '#9775fa', '📝' ),
			B( 'Exercise', 1020, 1080, '#ff6b6b', '🏃' ),
			B( 'Free time', 1140, 1320, '#ff70a6', '🎮' ),
		],
	},
};

export const PRESET_LIST = Object.keys( PRESETS ).map( ( id ) => ( {
	id,
	label: PRESETS[ id ].label,
} ) );
