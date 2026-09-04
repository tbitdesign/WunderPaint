/**
 * Starters: a finished sheet per entry that the user changes. Two or
 * three per occasion; names and subtitles stay untranslated (they are
 * shown as the party would print them). Event data typed before a
 * starter is loaded survives the switch (main.js merges it).
 */

const s = ( id, name, subtitle, occasion, item, extra = {} ) => ( {
	id,
	name,
	subtitle,
	params: {
		v: 3,
		item,
		theme: { occasion, ...( extra.theme || {} ) },
		event: extra.event || {},
		sheet: extra.sheet || {},
		photo: extra.photo || {},
	},
} );

const GUESTS = [
	'Anna',
	'Ben',
	'Clara',
	'David',
	'Emma',
	'Felix',
	'Greta',
	'Henry',
];
const KIDS = [ 'Mia', 'Leo', 'Ada', 'Noah', 'Ella', 'Max' ];

export const STARTERS = [
	/* Kids' birthday */
	s(
		'birthday-kids-bunting',
		'Birthday bunting',
		'HAPPY BIRTHDAY on pennants',
		'birthday-kids',
		{ type: 'bunting', text: 'HAPPY BIRTHDAY', shape: 'triangle' }
	),
	s(
		'birthday-kids-toppers',
		'Star toppers',
		'A big number on every cupcake',
		'birthday-kids',
		{ type: 'toppers', text: '6', shape: 'star' }
	),
	s(
		'birthday-kids-hats',
		'Party hats',
		'Two cones per sheet',
		'birthday-kids',
		{ type: 'partyhat' }
	),
	s(
		'birthday-kids-tags',
		'Goodie bag tags',
		'One per little guest',
		'birthday-kids',
		{ type: 'tags', text: 'Thanks for coming', textFrom: 'names' },
		{ event: { names: KIDS } }
	),
	/* Birthday */
	s( 'birthday-banner', 'Letter banner', 'One letter per card', 'birthday', {
		type: 'letterbanner',
		text: 'HAPPY BIRTHDAY',
	} ),
	s(
		'birthday-bottles',
		'Bottle labels',
		'For the drinks on the table',
		'birthday',
		{ type: 'bottlelabels', text: 'Cheers to 40' },
		{ event: { title: 'Cheers to 40', date: 'Saturday 14 March' } }
	),
	s(
		'birthday-props',
		'Photo props',
		'Moustaches, glasses, a speech bubble',
		'birthday',
		{ type: 'props', text: '40!' }
	),
	/* Wedding */
	s(
		'wedding-placecards',
		'Place cards',
		'Tent cards, one per guest',
		'wedding',
		{ type: 'placecards', tent: true },
		{ event: { names: GUESTS } }
	),
	s(
		'wedding-tags',
		'Favor tags',
		'Thank you on a heart',
		'wedding',
		{ type: 'tags', text: 'Thank you', shape: 'heart' },
		{ event: { title: 'Anna & Ben' } }
	),
	s(
		'wedding-strawflags',
		'Straw flags',
		'Mr & Mrs on every straw',
		'wedding',
		{ type: 'strawflags', text: 'Mr & Mrs' }
	),
	/* Baby shower */
	s(
		'baby-stickers',
		'Baby stickers',
		'Round stickers for the favors',
		'baby',
		{ type: 'stickers', text: 'Hello baby', shape: 'circle' }
	),
	s(
		'baby-toppers',
		'Oh baby toppers',
		'Cupcake toppers with a rattle',
		'baby',
		{ type: 'toppers', text: 'Oh baby', shape: 'circle' }
	),
	/* Christening */
	s(
		'christening-placecards',
		'Christening place cards',
		'Soft colors, a dove',
		'christening',
		{ type: 'placecards', tent: true },
		{ event: { names: GUESTS.slice( 0, 6 ) } }
	),
	s(
		'christening-tags',
		'Christening tags',
		'For the almond favors',
		'christening',
		{ type: 'tags', text: 'With love', shape: 'tag' },
		{ event: { title: 'Emma' } }
	),
	/* School */
	s(
		'school-banner',
		'First day banner',
		'Letters for the classroom door',
		'school',
		{ type: 'letterbanner', text: 'WELCOME' }
	),
	s(
		'school-stickers',
		'Name stickers',
		'Square stickers for books and boxes',
		'school',
		{ type: 'stickers', text: 'Mia', shape: 'rect' }
	),
	/* Graduation */
	s(
		'graduation-bunting',
		'Congrats bunting',
		'CONGRATS in caps and gowns',
		'graduation',
		{ type: 'bunting', text: 'CONGRATS', shape: 'swallowtail' }
	),
	s(
		'graduation-props',
		'Graduation props',
		'Hat, glasses and a bubble',
		'graduation',
		{
			type: 'props',
			text: 'Class of 2027',
			kinds: 'hat glasses bubble moustache',
		}
	),
	/* Retirement */
	s(
		'retirement-banner',
		'Retirement banner',
		'HAPPY RETIREMENT',
		'retirement',
		{ type: 'letterbanner', text: 'HAPPY RETIREMENT' }
	),
	s(
		'retirement-bottles',
		'Retirement labels',
		'For the bottles of the send-off',
		'retirement',
		{ type: 'bottlelabels', text: 'The next chapter' },
		{ event: { title: 'The next chapter', date: 'Friday 5 June' } }
	),
	/* Anniversary */
	s(
		'anniversary-placecards',
		'Anniversary place cards',
		'Gold on cream',
		'anniversary',
		{ type: 'placecards', tent: true },
		{ event: { names: GUESTS } }
	),
	s(
		'anniversary-wrappers',
		'Cupcake wrappers',
		'Scalloped, rings motif',
		'anniversary',
		{ type: 'cupcakewrap', scallop: true }
	),
	/* Christmas */
	s(
		'christmas-tags',
		'Gift tags',
		'One tag per name under the tree',
		'christmas',
		{
			type: 'tags',
			text: 'Merry Christmas',
			textFrom: 'names',
			shape: 'tag',
		},
		{ event: { names: GUESTS.slice( 0, 8 ) } }
	),
	s(
		'christmas-box',
		'Gift box',
		'A small cube box with a ribbon',
		'christmas',
		{ type: 'box', text: 'Merry Christmas', size: 40, ribbon: true }
	),
	s(
		'christmas-bunting',
		'Christmas bunting',
		'Snowflakes and red',
		'christmas',
		{ type: 'bunting', text: 'MERRY CHRISTMAS', shape: 'scallop' }
	),
	/* New Year */
	s(
		'newyear-props',
		'New Year props',
		'Glasses and bubbles for midnight',
		'newyear',
		{ type: 'props', text: '2027', kinds: 'glasses bubble hat lips' }
	),
	s(
		'newyear-strawflags',
		'Countdown flags',
		'The year on every straw',
		'newyear',
		{ type: 'strawflags', text: '2027' }
	),
	/* Easter */
	s(
		'easter-stickers',
		'Egg stickers',
		'Round stickers with eggs',
		'easter',
		{ type: 'stickers', text: 'Happy Easter', shape: 'circle' }
	),
	s(
		'easter-toppers',
		'Easter toppers',
		'Bunny ears on a scalloped round',
		'easter',
		{ type: 'toppers', text: 'Hop', shape: 'scallopCircle' }
	),
	/* Halloween */
	s( 'halloween-bunting', 'BOO bunting', 'Pumpkins on black', 'halloween', {
		type: 'bunting',
		text: 'BOO',
		shape: 'flag',
	} ),
	s(
		'halloween-wrappers',
		'Halloween wrappers',
		'Cupcake wrappers with pumpkins',
		'halloween',
		{ type: 'cupcakewrap', scallop: true }
	),
	/* Corporate */
	s(
		'corporate-bottles',
		'Event bottle labels',
		'For the welcome drinks',
		'corporate',
		{ type: 'bottlelabels', text: 'Summit 2027' },
		{ event: { title: 'Summit 2027', date: '12 May' } }
	),
	s(
		'corporate-placecards',
		'Table cards',
		'Plain and readable',
		'corporate',
		{ type: 'placecards', tent: true },
		{ event: { names: GUESTS } }
	),
	s(
		'corporate-brand',
		'Brand kit bunting',
		'Your brand colors on pennants',
		'corporate',
		{ type: 'bunting', text: 'WELCOME', shape: 'flag' },
		{ theme: { palette: 'brand' } }
	),
	/* Summer */
	s( 'summer-bunting', 'Summer bunting', 'Waves and sun', 'summer', {
		type: 'bunting',
		text: 'SUMMER',
		shape: 'scallop',
	} ),
	s(
		'summer-strawflags',
		'Pool party flags',
		'Cheers on every straw',
		'summer',
		{ type: 'strawflags', text: 'Cheers' }
	),
	/* Mother's Day */
	s(
		'mothersday-box',
		'Little gift box',
		'A cube box with blooms',
		'mothersday',
		{ type: 'box', text: 'For Mom', size: 40, ribbon: true }
	),
	s(
		'mothersday-tags',
		'Flower tags',
		'Heart tags for the bouquet',
		'mothersday',
		{ type: 'tags', text: 'For Mom', shape: 'heart' }
	),
	/* 3.1 cards and stationery */
	s(
		'wedding-invitation',
		'Wedding invitation',
		'Postcard with the event data',
		'wedding',
		{ type: 'invitation', text: 'Together with their families' },
		{
			event: {
				title: 'Anna & Ben',
				subtitle: 'are getting married',
				date: 'Saturday 14 March 2027',
				time: '2 pm',
				place: 'Villa Rosa, Lake Garda',
				host: 'The Millers',
			},
		}
	),
	s(
		'wedding-invitation-folded',
		'Folded invitation',
		'Outside and inside, A4 landscape',
		'wedding',
		{
			type: 'invitation',
			w: 210,
			h: 148,
			fold: true,
			text: 'Together with their families\n\nWe would love to celebrate this day with you. Dinner and dancing follow the ceremony; please let us know by the first of March whether you can join us.',
		},
		{
			event: {
				title: 'Anna & Ben',
				subtitle: 'are getting married',
				date: 'Saturday 14 March 2027',
				time: '2 pm',
				place: 'Villa Rosa, Lake Garda',
				host: 'The Millers',
			},
			sheet: { landscape: true },
		}
	),
	s(
		'birthday-kids-invitation',
		'Party invitation',
		'For the kids and their parents',
		'birthday-kids',
		{ type: 'invitation', text: 'You are invited to' },
		{
			event: {
				title: 'Mia turns 6',
				subtitle: 'Come and play',
				date: 'Sunday 7 June',
				time: '3 pm',
				place: 'Our garden',
				host: 'Mia and her parents',
			},
		}
	),
	s(
		'wedding-savethedate',
		'Save the date',
		'The names and the day',
		'wedding',
		{ type: 'savethedate' },
		{
			event: {
				title: 'Anna & Ben',
				date: '14 March 2027',
				place: 'Lake Garda',
			},
		}
	),
	s(
		'anniversary-savethedate',
		'Anniversary date',
		'Fifty years, save the date',
		'anniversary',
		{ type: 'savethedate', text: 'Invitation to follow' },
		{
			event: {
				title: 'Rita & Karl',
				subtitle: 'fifty years',
				date: '2 May 2027',
				place: 'Old Mill',
			},
		}
	),
	s(
		'wedding-thankyou',
		'Thank-you card',
		'After the wedding',
		'wedding',
		{
			type: 'thankyou',
			text: 'Thank you\nfor celebrating with us, for the gift and for the dance.',
		},
		{ event: { host: 'Anna & Ben' } }
	),
	s(
		'baby-thankyou',
		'Baby thank-you',
		'For the gifts and the visit',
		'baby',
		{
			type: 'thankyou',
			text: 'Thank you\nfor the tiny socks and the big hugs.',
		},
		{ event: { host: 'Emma, Tom and little Jonah' } }
	),
	s(
		'wedding-reply',
		'Reply card',
		'Accept or decline, with a name line',
		'wedding',
		{ type: 'reply', by: '1 March' }
	),
	s(
		'corporate-reply',
		'Event reply card',
		'Attending, with dietary needs',
		'corporate',
		{ type: 'reply', text: 'Will attend\nCannot attend', by: '30 April' }
	),
	s(
		'wedding-menu',
		'Dinner menu',
		'Three courses on A5',
		'wedding',
		{ type: 'menu' },
		{ event: { title: 'Anna & Ben' } }
	),
	s(
		'christmas-menu',
		'Christmas menu',
		'The festive dinner',
		'christmas',
		{
			type: 'menu',
			text: 'Starter\nBeetroot carpaccio\nChestnut soup\n\nMain\nRoast goose with red cabbage\nWild mushroom strudel\n\nDessert\nCinnamon parfait',
		},
		{ event: { title: 'Christmas Eve' } }
	),
	s(
		'summer-drinks',
		'Bar menu',
		'Cocktails and lemonades',
		'summer',
		{ type: 'drinks' },
		{ event: { title: 'Pool party' } }
	),
	s(
		'corporate-drinks',
		'Reception drinks',
		'What the bar pours',
		'corporate',
		{
			type: 'drinks',
			text: 'Sparkling\nProsecco\nElderflower fizz\n\nWine\nGrüner Veltliner\nMerlot\n\nSoft\nApple spritzer\nStill and sparkling water',
		},
		{ event: { title: 'Summit 2027' } }
	),
	s(
		'wedding-program',
		'Order of the day',
		'From the ceremony to the party',
		'wedding',
		{ type: 'program' },
		{ event: { title: 'Anna & Ben' } }
	),
	s(
		'corporate-program',
		'Agenda',
		'The day, hour by hour',
		'corporate',
		{
			type: 'program',
			text: '09:00 Registration and coffee\n09:30 Welcome\n10:00 Keynote\n12:00 Lunch\n13:30 Workshops\n17:00 Wrap-up and drinks',
		},
		{ event: { title: 'Summit 2027' } }
	),
	s(
		'wedding-tablenumbers',
		'Table numbers',
		'Tent cards 1 to 10',
		'wedding',
		{ type: 'tablenumbers', count: 10 },
		{ event: { title: 'Anna & Ben' } }
	),
	s(
		'corporate-tablenumbers',
		'Table cards',
		'Flat A6 cards',
		'corporate',
		{ type: 'tablenumbers', count: 12, w: 105, h: 148, tent: false },
		{ event: { title: 'Gala dinner' } }
	),
	s(
		'wedding-seating',
		'Seating chart',
		'A board with a box per table',
		'wedding',
		{ type: 'seating' },
		{ event: { title: 'Anna & Ben' } }
	),
	s(
		'anniversary-seating',
		'Family seating',
		'Who sits where',
		'anniversary',
		{
			type: 'seating',
			text: 'Head table: Rita, Karl, Anna, Ben\nTable 2: Emma, Tom, Jonah, Greta\nTable 3: Felix, Ida, Jonas, Klara\nTable 4: Lukas, Mia, Leo, Ada',
		},
		{ event: { title: 'Fifty golden years' } }
	),
	s(
		'wedding-welcome',
		'Welcome sign',
		'For the easel at the entrance',
		'wedding',
		{ type: 'welcome', text: 'Welcome' },
		{
			event: {
				title: 'to the wedding of Anna & Ben',
				date: '14 March 2027',
				place: 'Villa Rosa',
			},
		}
	),
	s(
		'school-welcome',
		'First day sign',
		'For the classroom door',
		'school',
		{ type: 'welcome', text: 'Welcome' },
		{ event: { title: 'Class 1b', subtitle: 'We are glad you are here' } }
	),
	s( 'summer-signpost', 'Signposts', 'Party, bar, restrooms', 'summer', {
		type: 'signpost',
		text: 'Party\nBar\nRestrooms\nPool',
		direction: 'both',
	} ),
	s(
		'wedding-signpost',
		'Wedding signs',
		'Ceremony, dinner, dancing',
		'wedding',
		{
			type: 'signpost',
			text: 'Ceremony\nDinner\nDance floor',
			direction: 'right',
		}
	),
	s(
		'birthday-voucher',
		'Birthday vouchers',
		'Three wishes to redeem',
		'birthday',
		{ type: 'voucher', text: 'One breakfast in bed', count: 3 }
	),
	s(
		'mothersday-voucher',
		'Vouchers for Mom',
		'Coupons for the whole year',
		'mothersday',
		{ type: 'voucher', text: 'One evening off', count: 6 },
		{ event: { title: 'For Mom' } }
	),
	s(
		'corporate-tickets',
		'Entry tickets',
		'Numbered, with a stub',
		'corporate',
		{ type: 'tickets', count: 8, start: 1 },
		{
			event: {
				title: 'Summer gala',
				date: '12 June',
				time: '7 pm',
				place: 'Town hall',
			},
		}
	),
	s(
		'school-raffle',
		'Raffle tickets',
		'For the school fair',
		'school',
		{ type: 'tickets', mode: 'raffle', count: 40, start: 1, text: '' },
		{ event: { title: 'School fair raffle', date: '20 June' } }
	),
	s(
		'wedding-addresslabels',
		'Guest address labels',
		'One address per block',
		'wedding',
		{
			type: 'addresslabels',
			text: 'Anna and Ben Miller\n12 Rose Street\n10115 Berlin\n\nClara Schmidt\n5 Lake Road\n80331 Munich\n\nDavid and Emma Weber\n3 Park Lane\n50667 Cologne',
		},
		{ sheet: { margin: 7, gap: 2.5 } }
	),
	s(
		'christmas-addresslabels',
		'Return address labels',
		'One block repeats over the sheet',
		'christmas',
		{
			type: 'addresslabels',
			text: 'The Millers\n12 Rose Street\n10115 Berlin',
		},
		{ sheet: { margin: 7, gap: 2.5 } }
	),
	s( 'wedding-envelope', 'Lined envelope', 'C6 for the A6 card', 'wedding', {
		type: 'envelope',
	} ),
	s(
		'christening-envelope',
		'Christening envelope',
		'Soft colours, a dove on the flap',
		'christening',
		{ type: 'envelope' }
	),
	/* 3.1 gifts and favors */
	s(
		'christmas-wrapping',
		'Wrapping paper',
		'Snowflakes and trees over the sheet',
		'christmas',
		{ type: 'wrapping' }
	),
	s(
		'birthday-kids-wrapping',
		'Party wrapping paper',
		'Confetti and balloons',
		'birthday-kids',
		{ type: 'wrapping', text: 'Hooray' }
	),
	s(
		'wedding-glassmarkers',
		'Glass markers',
		'One per guest on the stem',
		'wedding',
		{ type: 'glassmarkers', textFrom: 'names' },
		{ event: { names: GUESTS } }
	),
	s(
		'newyear-glassmarkers',
		'Midnight glass markers',
		'Cheers on every glass',
		'newyear',
		{ type: 'glassmarkers', text: '2027' }
	),
	s(
		'wedding-napkinrings',
		'Napkin rings',
		'Rings on the dinner table',
		'wedding',
		{ type: 'napkinrings', text: 'Enjoy' }
	),
	s(
		'easter-napkinrings',
		'Easter napkin rings',
		'Bunnies and eggs',
		'easter',
		{ type: 'napkinrings', text: 'Happy Easter' }
	),
	s( 'summer-coasters', 'Coasters', 'Round, for the cold drinks', 'summer', {
		type: 'coasters',
		text: 'Cheers',
	} ),
	s(
		'retirement-coasters',
		'Retirement coasters',
		'Hexagons for the send-off',
		'retirement',
		{ type: 'coasters', text: 'The next chapter', shape: 'hexagon' }
	),
	s(
		'birthday-kids-bagtoppers',
		'Treat bag toppers',
		'Close the bags with a staple',
		'birthday-kids',
		{ type: 'bagtoppers', text: 'Thanks for coming' }
	),
	s(
		'halloween-bagtoppers',
		'Trick or treat toppers',
		'For the candy bags',
		'halloween',
		{ type: 'bagtoppers', text: 'Trick or treat' }
	),
	s(
		'mothersday-chocolate',
		'Chocolate wrapper',
		'A bar for Mom',
		'mothersday',
		{ type: 'chocolate', text: 'For the best Mom' }
	),
	s(
		'corporate-chocolate',
		'Branded chocolate',
		'Wrapper in the brand colours',
		'corporate',
		{ type: 'chocolate', text: 'Thank you' },
		{ theme: { palette: 'brand' }, event: { title: 'Summit 2027' } }
	),
	s(
		'christmas-jamlabels',
		'Jam labels',
		'Round labels for the jars',
		'christmas',
		{ type: 'jamlabels', text: 'Plum jam\nhomemade with love' },
		{ event: { date: 'December 2026', host: 'Grandma' } }
	),
	s(
		'summer-jamlabels',
		'Strawberry jam labels',
		'For the summer jars',
		'summer',
		{
			type: 'jamlabels',
			text: 'Strawberry jam\nfrom the garden',
			shape: 'rect',
			w: 70,
			h: 50,
		}
	),
	s(
		'christmas-candlewrap',
		'Candle wraps',
		'Bands for the jar candles',
		'christmas',
		{ type: 'candlewrap', text: 'Light and love' }
	),
	s(
		'wedding-candlewrap',
		'Wedding candle wraps',
		'Table candles in the theme',
		'wedding',
		{ type: 'candlewrap', text: 'Anna & Ben' }
	),
	/* 3.2 decor */
	s(
		'birthday-kids-garland',
		'Balloon garland',
		'Circles with balloons on a cord',
		'birthday-kids',
		{ type: 'garland' }
	),
	s(
		'christmas-garland',
		'Star garland',
		'Stars with snowflakes',
		'christmas',
		{ type: 'garland', shape: 'star' }
	),
	s(
		'wedding-fan',
		'Paper rosettes',
		'Strips to fold into rosettes',
		'wedding',
		{ type: 'fan' }
	),
	s(
		'summer-fan',
		'Summer fans',
		'Wide strips for the photo wall',
		'summer',
		{ type: 'fan', w: 280, h: 120 },
		{ sheet: { landscape: true } }
	),
	s(
		'wedding-photoframe',
		'Photo frame',
		'For the 10 x 15 print',
		'wedding',
		{ type: 'photoframe', text: 'Our day' },
		{ event: { date: '14 March 2027' } }
	),
	s(
		'graduation-photoframe',
		'Graduation frame',
		'The diploma photo, framed',
		'graduation',
		{ type: 'photoframe', text: 'Class of 2027' }
	),
	s(
		'birthday-kids-crown',
		'Birthday crown',
		'Three pieces with the name',
		'birthday-kids',
		{ type: 'crown', text: 'Mia' }
	),
	s( 'newyear-crown', 'Midnight crowns', 'For the whole table', 'newyear', {
		type: 'crown',
		text: '2027',
		w: 150,
		h: 110,
		parts: 4,
	} ),
	s(
		'birthday-kids-caketopper',
		'Cake topper',
		'The number and the name',
		'birthday-kids',
		{ type: 'caketopper', text: '6\nMia' }
	),
	s(
		'wedding-caketopper',
		'Wedding cake topper',
		'The names on a heart',
		'wedding',
		{ type: 'caketopper', text: 'Anna & Ben', shape: 'heart' }
	),
	s(
		'christmas-lantern',
		'Lantern wraps',
		'Stars for the tea lights',
		'christmas',
		{ type: 'lantern', window: 'star' }
	),
	s(
		'wedding-lantern',
		'Wedding lanterns',
		'Hearts for the table lights',
		'wedding',
		{ type: 'lantern', window: 'heart' }
	),
	s(
		'birthday-kids-doorhanger',
		'Door hanger',
		'Party in progress',
		'birthday-kids',
		{ type: 'doorhanger' }
	),
	s( 'baby-doorhanger', 'Baby sleeping', 'For the nursery door', 'baby', {
		type: 'doorhanger',
		text: 'Shh\nbaby sleeping',
	} ),
	s(
		'christmas-countdown',
		'Advent numbers',
		'1 to 24 for the calendar',
		'christmas',
		{ type: 'countdown', from: 1, to: 24 }
	),
	s( 'newyear-countdown', 'Countdown to midnight', '10 to 1', 'newyear', {
		type: 'countdown',
		from: 10,
		to: 1,
		shape: 'star',
		d: 65,
	} ),
	s( 'summer-confetti', 'Confetti sheet', 'Circles to punch', 'summer', {
		type: 'confetti',
	} ),
	s(
		'wedding-confetti',
		'Heart confetti',
		'For the table and the exit',
		'wedding',
		{ type: 'confetti', shape: 'heart' }
	),
	/* 3.2 games */
	s(
		'birthday-kids-bingo',
		'Number bingo',
		'Six different cards and the call list',
		'birthday-kids',
		{ type: 'bingo', mode: 'numbers', count: 6 }
	),
	s(
		'baby-bingo',
		'Baby shower bingo',
		'Words from the lines',
		'baby',
		{
			type: 'bingo',
			mode: 'words',
			grid: 4,
			count: 8,
			text: 'Bottle\nRattle\nDiaper\nLullaby\nStroller\nBib\nPacifier\nOnesie\nBooties\nCrib\nMobile\nBlanket\nTeddy\nBath\nBurp cloth\nStory',
		},
		{ event: { title: 'Baby bingo' } }
	),
	s(
		'easter-bingo',
		'Motif bingo',
		'Pictures for the little ones',
		'easter',
		{ type: 'bingo', mode: 'motifs', grid: 3, count: 6 },
		{ event: { title: 'Easter bingo' } }
	),
	s(
		'birthday-kids-scavenger',
		'Scavenger hunt',
		'Tasks with a box to tick',
		'birthday-kids',
		{ type: 'scavenger' }
	),
	s(
		'summer-scavenger',
		'Garden hunt',
		'Find, collect, photograph',
		'summer',
		{
			type: 'scavenger',
			text: 'Find a yellow flower\nCollect three pebbles\nSpot a butterfly\nFind the hidden key\nTake a photo of a cloud animal\nFind something that floats',
		}
	),
	s(
		'wedding-questions',
		'Table questions',
		'Icebreakers for the dinner',
		'wedding',
		{
			type: 'questions',
			text: 'How do you know the couple?\nWhat is your best travel memory?\nWhich song gets you dancing?\nWhat is the best advice you ever got?\nWhat would you cook for the couple?\nWhere would you send them on honeymoon?',
		}
	),
	s(
		'corporate-questions',
		'Icebreaker cards',
		'For the team day',
		'corporate',
		{
			type: 'questions',
			text: 'What did you want to be as a child?\nWhat is your hidden talent?\nWhich tool could you not work without?\nWhat was your first job?\nCoffee or tea, and why?\nWhat did you learn this year?',
		}
	),
	s(
		'birthday-headbands',
		'Who am I?',
		'Cards for the headband game',
		'birthday',
		{ type: 'headbands' }
	),
	s( 'newyear-headbands', 'Famous faces', 'Guess who you are', 'newyear', {
		type: 'headbands',
		text: 'Marie Curie\nFreddie Mercury\nFrida Kahlo\nAlbert Einstein\nAudrey Hepburn\nA penguin\nA lighthouse\nThe Moon',
	} ),
	s(
		'easter-memory',
		'Motif memory',
		'Twelve pairs from the motifs',
		'easter',
		{ type: 'memory', pairs: 12 }
	),
	s(
		'birthday-kids-memory',
		'Photo memory',
		'Pairs from your pictures',
		'birthday-kids',
		{ type: 'memory', pairs: 8 },
		{ photo: { source: 'media' } }
	),
	s(
		'birthday-quartet',
		'Family quartet',
		'Cards with values from the lines',
		'birthday',
		{ type: 'quartet' }
	),
	s( 'school-quartet', 'Class quartet', 'Pictures and facts', 'school', {
		type: 'quartet',
		text: 'A | Mia | Age 6 | Height 1.15 m | Books 12\nA | Leo | Age 6 | Height 1.20 m | Books 8\nA | Ada | Age 7 | Height 1.18 m | Books 30\nA | Noah | Age 6 | Height 1.22 m | Books 5',
	} ),
	s(
		'wedding-deck',
		'Playing cards',
		'A full deck with the names on the aces',
		'wedding',
		{ type: 'deck', text: 'Anna & Ben' }
	),
	s(
		'corporate-deck',
		'Branded deck',
		'Cards in the brand colours',
		'corporate',
		{ type: 'deck' },
		{ theme: { palette: 'brand' }, event: { title: 'Summit 2027' } }
	),
	s(
		'birthday-scoreboard',
		'Scoreboard',
		'A column per guest',
		'birthday',
		{ type: 'scoreboard', text: 'Game night' },
		{ event: { names: [ 'Anna', 'Ben', 'Clara', 'David' ] } }
	),
	s(
		'summer-scoreboard',
		'Tournament sheet',
		'Rounds and totals',
		'summer',
		{ type: 'scoreboard', text: 'Beach tournament', rounds: 8 },
		{ event: { names: [ 'Team red', 'Team blue', 'Team green' ] } }
	),
	s(
		'corporate-chess',
		'Chess puzzle',
		'A position with an arrow',
		'corporate',
		{ type: 'chess', caption: 'White to move' }
	),
	s(
		'retirement-draughts',
		'Draughts board',
		'The starting position',
		'retirement',
		{ type: 'chess', board: 'draughts', text: '' }
	),
	s( 'school-go', 'Go diagram', 'Stones on a 19 x 19 board', 'school', {
		type: 'chess',
		board: 'go',
		text: 'b: d4 q16 d16\nw: q4 k10',
		d: 160,
	} ),
	s(
		'summer-tactics',
		'Football tactics',
		'A formation with a run and a pass',
		'summer',
		{ type: 'tactics', sport: 'football' },
		{ event: { title: 'Sunday league' } }
	),
	s(
		'school-tactics',
		'Basketball board',
		'Players, run and ball',
		'school',
		{
			type: 'tactics',
			sport: 'basketball',
			text: 'X 20 50\nX 40 30\nX 40 70\nO 60 50\nO 70 35\n> 20 50 45 45\n~ 40 30 40 70\n* 40 30',
		},
		{ event: { title: 'Team practice' } }
	),
	/* 3.3 more games */
	s(
		'birthday-kids-boardgame',
		'Party race',
		'A board with event fields',
		'birthday-kids',
		{ type: 'boardgame' },
		{ event: { title: 'Party race' } }
	),
	s(
		'christmas-boardgame',
		'Winter race',
		'Roll and move on A3',
		'christmas',
		{
			type: 'boardgame',
			w: 281,
			h: 404,
			text: 'Slide ahead 3\nSnowed in, skip a turn\nBack 2\nRoll again',
		},
		{ event: { title: 'Race to the tree' }, sheet: { format: 'a3' } }
	),
	s(
		'birthday-kids-dice',
		'Paper dice',
		'Two dice with dots',
		'birthday-kids',
		{ type: 'dice', mode: 'dots' }
	),
	s( 'summer-storydice', 'Story dice', 'Words on the faces', 'summer', {
		type: 'dice',
		mode: 'words',
		text: 'Sing\nDance\nTell a joke\nHug someone\nMake a wish\nRoll again',
	} ),
	s(
		'easter-domino',
		'Easter domino',
		'The 28 tiles with bunnies and eggs',
		'easter',
		{ type: 'domino' }
	),
	s(
		'birthday-kids-domino',
		'Party domino',
		'Balloons and cake as pips',
		'birthday-kids',
		{ type: 'domino', w: 30, h: 60 }
	),
	s(
		'halloween-secretcode',
		'Secret code',
		'A key card and two spooky messages',
		'halloween',
		{ type: 'secretcode' },
		{ event: { title: 'Haunted hunt' } }
	),
	s(
		'birthday-kids-secretcode',
		'Treasure code',
		'Messages for the treasure hunt',
		'birthday-kids',
		{
			type: 'secretcode',
			text: 'The treasure is under the big tree\nLook behind the red door\nAsk the host for the last clue',
		}
	),
	s(
		'birthday-kids-fortuneteller',
		'Fortune teller',
		'Eight fortunes under the flaps',
		'birthday-kids',
		{ type: 'fortuneteller' }
	),
	s(
		'summer-fortuneteller',
		'Summer fortunes',
		'Sun, sea and eight dares',
		'summer',
		{
			type: 'fortuneteller',
			text: 'Jump in the pool\nBring the host a drink\nSing a summer song\nYou win an ice cream\nTell a beach story\nDance in the sun\nHug your neighbour\nMake a wish',
		}
	),
	s(
		'summer-bracket',
		'Tournament bracket',
		'Eight players from the guest list',
		'summer',
		{ type: 'bracket', slots: 8 },
		{
			event: { title: 'Table football cup', names: GUESTS },
			sheet: { landscape: true },
		}
	),
	s(
		'corporate-bracket',
		'Team bracket',
		'Sixteen teams on A3',
		'corporate',
		{ type: 'bracket', slots: 16, w: 404, h: 281 },
		{
			event: { title: 'Summit cup' },
			sheet: { format: 'a3', landscape: true },
		}
	),
	s(
		'baby-guessphoto',
		'Who is the baby?',
		'Photo cards and answer cards',
		'baby',
		{ type: 'guessphoto', text: 'Who is this baby?' },
		{ photo: { source: 'media' }, event: { names: GUESTS.slice( 0, 6 ) } }
	),
	s(
		'birthday-guessphoto',
		'Guess the photo',
		'Faces from the past',
		'birthday',
		{ type: 'guessphoto', text: 'Who is this?' },
		{ photo: { source: 'media' } }
	),
	/* 3.3 puzzles and activities */
	s(
		'birthday-wordsearch',
		'Party word search',
		'Ten hidden words and a solution',
		'birthday',
		{ type: 'wordsearch' },
		{ event: { title: 'Party word search' } }
	),
	s(
		'wedding-wordsearch',
		'Wedding word search',
		'For the kids at the table',
		'wedding',
		{
			type: 'wordsearch',
			text: 'Bride\nGroom\nRings\nCake\nDance\nFlowers\nKiss\nLove\nVows\nToast',
		},
		{ event: { title: 'Anna & Ben' } }
	),
	s(
		'birthday-kids-maze',
		'Maze',
		'Easy, with the balloon at the exit',
		'birthday-kids',
		{ type: 'maze', level: 'easy' },
		{ event: { title: 'Find the cake' } }
	),
	s(
		'halloween-maze',
		'Haunted maze',
		'Hard, for the big kids',
		'halloween',
		{ type: 'maze', level: 'hard' },
		{ event: { title: 'Escape the haunted house' } }
	),
	s( 'birthday-kids-sudoku', 'Kids sudoku', 'Four by four', 'birthday-kids', {
		type: 'sudoku',
		n: 4,
		d: 90,
	} ),
	s(
		'retirement-sudoku',
		'Sudoku',
		'Nine by nine, hard',
		'retirement',
		{ type: 'sudoku', n: 9, level: 'hard' },
		{ event: { title: 'Sudoku' } }
	),
	s(
		'birthday-kids-coloring',
		'Coloring page',
		'The balloon big to colour',
		'birthday-kids',
		{ type: 'coloring' }
	),
	s(
		'christmas-coloring',
		'Christmas coloring page',
		'The tree to colour',
		'christmas',
		{ type: 'coloring', text: 'Coloured by' }
	),
	s(
		'wedding-placemat',
		"Kids' place mat",
		'Maze, colouring and games for the kids table',
		'wedding',
		{ type: 'placemat' },
		{
			event: { title: 'Anna & Ben', names: KIDS.slice( 0, 4 ) },
			sheet: { landscape: true },
		}
	),
	s(
		'birthday-kids-placemat',
		'Party place mat',
		'One per little guest',
		'birthday-kids',
		{ type: 'placemat' },
		{ event: { names: KIDS }, sheet: { landscape: true } }
	),
	/* 3.3 awards */
	s(
		'graduation-certificate',
		'Certificate',
		'Best of the class',
		'graduation',
		{ type: 'certificate', text: 'Outstanding achievement' },
		{
			event: {
				title: 'Class of 2027',
				date: 'June 2027',
				host: 'The teachers',
				names: GUESTS.slice( 0, 4 ),
			},
			sheet: { landscape: true },
		}
	),
	s(
		'birthday-kids-certificate',
		'Party awards',
		'Best dancer, bravest pirate',
		'birthday-kids',
		{ type: 'certificate', text: 'Bravest pirate' },
		{
			event: {
				title: 'Mia turns 6',
				date: '7 June',
				host: 'The captain',
				names: KIDS,
			},
			sheet: { landscape: true },
		}
	),
	s(
		'summer-medals',
		'Medals',
		'Gold, silver, bronze',
		'summer',
		{ type: 'medals', text: '1\n2\n3' },
		{ event: { title: 'Beach games' } }
	),
	s(
		'birthday-kids-medals',
		'Party medals',
		'One per little winner',
		'birthday-kids',
		{ type: 'medals', text: 'Best dancer\nBest singer\nFastest runner\n' },
		{ event: { title: 'Mia turns 6' } }
	),
	s(
		'birthday-kids-playmoney',
		'Play money',
		'For the party shop',
		'birthday-kids',
		{ type: 'playmoney' },
		{ event: { title: 'Mia bank' } }
	),
	s(
		'newyear-playmoney',
		'Casino money',
		'For the casino night',
		'newyear',
		{ type: 'playmoney', text: '10\n50\n100\n500', copies: 4 },
		{ event: { title: 'Casino royale' } }
	),
	s(
		'corporate-humanbingo',
		'Find someone who',
		'Human bingo for the team day',
		'corporate',
		{
			type: 'bingo',
			mode: 'words',
			grid: 4,
			count: 10,
			text: 'has a dog\nspeaks three languages\nran a marathon\nplays an instrument\nwas born abroad\nhates coffee\nhas twins\nclimbed a mountain\nsings in the shower\nmet a celebrity\nrides a bike to work\nhas a tattoo\nloves karaoke\nbakes bread\ncan juggle\nnever misses a deadline',
		},
		{ event: { title: 'Find someone who' } }
	),
];

export function starterById( id ) {
	return STARTERS.find( ( x ) => x.id === id ) || null;
}
