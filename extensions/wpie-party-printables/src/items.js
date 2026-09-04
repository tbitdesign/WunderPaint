/**
 * The item registry and the sheet renderer. renderSheet( params, env )
 * resolves the theme, renders the item's pieces in millimetres, imposes
 * them on the sheet and scales everything to 300 dpi px.
 */
import { ITEM as bunting } from './items/bunting.js';
import { ITEM as letterbanner } from './items/letterbanner.js';
import { ITEM as box } from './items/box.js';
import { ITEM as tags } from './items/tags.js';
import { ITEM as toppers } from './items/toppers.js';
import { ITEM as cupcakewrap } from './items/cupcakewrap.js';
import { ITEM as placecards } from './items/placecards.js';
import { ITEM as strawflags } from './items/strawflags.js';
import { ITEM as partyhat } from './items/partyhat.js';
import { ITEM as props } from './items/props.js';
import { ITEM as bottlelabels } from './items/bottlelabels.js';
import { ITEM as stickers } from './items/stickers.js';
import { ITEM as invitation } from './items/cards/invitation.js';
import { ITEM as savethedate } from './items/cards/savethedate.js';
import { ITEM as thankyou } from './items/cards/thankyou.js';
import { ITEM as reply } from './items/cards/reply.js';
import { ITEM as menu } from './items/cards/menu.js';
import { ITEM as drinks } from './items/cards/drinks.js';
import { ITEM as program } from './items/cards/program.js';
import { ITEM as tablenumbers } from './items/cards/tablenumbers.js';
import { ITEM as seating } from './items/cards/seating.js';
import { ITEM as welcome } from './items/cards/welcome.js';
import { ITEM as signpost } from './items/cards/signpost.js';
import { ITEM as voucher } from './items/cards/voucher.js';
import { ITEM as tickets } from './items/cards/tickets.js';
import { ITEM as addresslabels } from './items/cards/addresslabels.js';
import { ITEM as envelope } from './items/cards/envelope.js';
import { ITEM as wrapping } from './items/gifts/wrapping.js';
import { ITEM as glassmarkers } from './items/gifts/glassmarkers.js';
import { ITEM as napkinrings } from './items/gifts/napkinrings.js';
import { ITEM as coasters } from './items/gifts/coasters.js';
import { ITEM as bagtoppers } from './items/gifts/bagtoppers.js';
import { ITEM as chocolate } from './items/gifts/chocolate.js';
import { ITEM as jamlabels } from './items/gifts/jamlabels.js';
import { ITEM as candlewrap } from './items/gifts/candlewrap.js';
import { ITEM as garland } from './items/decor/garland.js';
import { ITEM as fan } from './items/decor/fan.js';
import { ITEM as photoframe } from './items/decor/photoframe.js';
import { ITEM as crown } from './items/decor/crown.js';
import { ITEM as caketopper } from './items/decor/caketopper.js';
import { ITEM as lantern } from './items/decor/lantern.js';
import { ITEM as doorhanger } from './items/decor/doorhanger.js';
import { ITEM as countdown } from './items/decor/countdown.js';
import { ITEM as confetti } from './items/decor/confetti.js';
import { ITEM as bingo } from './items/games/bingo.js';
import {
	SCAVENGER as scavenger,
	QUESTIONS as questions,
	HEADBANDS as headbands,
} from './items/games/cards.js';
import { ITEM as memory } from './items/games/memory.js';
import { ITEM as quartet } from './items/games/quartet.js';
import { ITEM as deck } from './items/games/deck.js';
import { ITEM as scoreboard } from './items/games/scoreboard.js';
import { ITEM as chess } from './items/games/chess.js';
import { ITEM as tactics } from './items/games/tactics.js';
import { ITEM as boardgame } from './items/games/boardgame.js';
import { ITEM as dice } from './items/games/dice.js';
import { ITEM as domino } from './items/games/domino.js';
import { ITEM as secretcode } from './items/games/secretcode.js';
import { ITEM as fortuneteller } from './items/games/fortuneteller.js';
import { ITEM as bracket } from './items/games/bracket.js';
import { ITEM as guessphoto } from './items/games/guessphoto.js';
import { ITEM as wordsearch } from './items/games/wordsearch.js';
import { ITEM as maze } from './items/games/maze.js';
import { ITEM as sudoku } from './items/games/sudoku.js';
import { ITEM as coloring } from './items/games/coloring.js';
import { ITEM as placemat } from './items/games/placemat.js';
import { ITEM as playmoney } from './items/games/playmoney.js';
import { ITEM as certificate } from './items/cards/certificate.js';
import { ITEM as medals } from './items/decor/medals.js';
import { resolveTheme } from './engine/theme.js';
import { sheetSize, px, PX_PER_MM, r } from './engine/units.js';
import { impose, cutMarks, foldLine } from './engine/sheet.js';
import { svgDoc } from './engine/svg.js';

export const ITEMS = {
	/* cards and stationery */
	invitation,
	savethedate,
	thankyou,
	reply,
	menu,
	drinks,
	program,
	tablenumbers,
	placecards,
	seating,
	welcome,
	signpost,
	voucher,
	tickets,
	addresslabels,
	envelope,
	certificate,
	/* gifts and favors */
	tags,
	box,
	wrapping,
	bottlelabels,
	glassmarkers,
	napkinrings,
	coasters,
	bagtoppers,
	chocolate,
	jamlabels,
	candlewrap,
	/* decor */
	bunting,
	letterbanner,
	garland,
	fan,
	photoframe,
	props,
	partyhat,
	crown,
	caketopper,
	toppers,
	cupcakewrap,
	strawflags,
	lantern,
	doorhanger,
	countdown,
	confetti,
	medals,
	/* games */
	bingo,
	scavenger,
	questions,
	headbands,
	memory,
	quartet,
	deck,
	scoreboard,
	chess,
	tactics,
	boardgame,
	dice,
	domino,
	secretcode,
	fortuneteller,
	bracket,
	guessphoto,
	wordsearch,
	maze,
	sudoku,
	coloring,
	placemat,
	playmoney,
	/* stickers live with the gifts */
	stickers,
};
export const ITEM_GROUPS = [
	{ id: 'cards', label: 'Cards and stationery' },
	{ id: 'gifts', label: 'Gifts and favors' },
	{ id: 'decor', label: 'Decor' },
	{ id: 'games', label: 'Games' },
];
export const itemById = ( id ) => ITEMS[ id ] || ITEMS.bunting;

export async function renderSheet( params, env ) {
	const t = ( env && env.t ) || ( ( s ) => s );
	const def = itemById( params.item.type );
	const theme = resolveTheme( params.theme, env.kits );
	const size = sheetSize( params.sheet );
	const warnings = [];
	let photo = null;
	let photos = [];
	if ( 'none' !== params.photo.source ) {
		try {
			if ( 'many' === def.uses.photo ) {
				photos = env.photos
					? ( await env.photos(
							params.photo,
							def,
							def.photoBox ? def.photoBox( params.item ) : null
					  ) ) || []
					: [];
			} else if ( env.photo ) {
				photo = await env.photo(
					params.photo,
					def,
					def.photoBox ? def.photoBox( params.item ) : null
				);
			}
		} catch ( e ) {
			warnings.push( t( 'The photo could not be loaded.' ) );
		}
	}
	if ( 'required' === def.uses.photo && ! photo ) {
		warnings.push( t( 'This item needs a photo.' ) );
	}
	const ctx = {
		theme,
		event: params.event,
		photo,
		photos,
		t,
		seed: 1,
		sheet: {
			w: size.w,
			h: size.h,
			margin: params.sheet.margin,
			gap: params.sheet.gap,
		},
	};
	let res;
	try {
		res = def.render( params.item, ctx, env );
	} catch ( e ) {
		res = { pieces: [], warnings: [ ( e && e.message ) || String( e ) ] };
	}
	warnings.push( ...( res.warnings || [] ) );
	const pieces = res.pieces || [];
	const width = Math.round( px( size.w ) );
	const height = Math.round( px( size.h ) );
	const children = [];
	let count = 0;
	let pages = 1;
	let page = 1;
	if ( pieces.length ) {
		const cellW = Math.max( ...pieces.map( ( p ) => p.w ) );
		const cellH = Math.max( ...pieces.map( ( p ) => p.h ) );
		const imp = impose( {
			sheetW: size.w,
			sheetH: size.h,
			margin: params.sheet.margin,
			bleed: params.sheet.bleed,
			gap: params.sheet.gap,
			itemW: cellW,
			itemH: cellH,
			fit: params.sheet.fit,
		} );
		if ( ! imp.count ) {
			warnings.push(
				t(
					'The piece is larger than the sheet. Choose a bigger sheet or a smaller size.'
				)
			);
		}
		// Pages: an item with more distinct pieces than fit on one sheet spreads over several sheets.
		// A repeat item fills the sheet by cycling its pieces, unless the guest names drive it:
		// then every guest gets exactly one piece.
		const repeat =
			'function' === typeof def.repeat
				? def.repeat( params.item, params.event )
				: def.repeat;
		const distinct =
			! repeat ||
			( 'names' === params.item.textFrom &&
				params.event.names &&
				params.event.names.length > 0 );
		pages =
			! distinct || ! imp.count
				? 1
				: Math.max( 1, Math.ceil( pieces.length / imp.count ) );
		page = Math.min(
			pages,
			Math.max( 1, Math.round( params.sheet.page || 1 ) )
		);
		const start = distinct ? ( page - 1 ) * imp.count : 0;
		const want = distinct
			? Math.min( pieces.length - start, imp.count )
			: imp.count;
		const marks = params.sheet.marks || 'cut';
		for ( let i = 0; i < want; i++ ) {
			const piece = pieces[ ( start + i ) % pieces.length ];
			const pos = imp.positions[ i ];
			const dx = pos.x + ( cellW - piece.w ) / 2;
			const dy = pos.y + ( cellH - piece.h ) / 2;
			let inner = piece.inner;
			if ( 'none' !== marks ) {
				inner += cutMarks(
					{ x: 0, y: 0, w: piece.w, h: piece.h },
					theme.colors.ink
				);
			}
			if ( 'cut+fold' === marks && piece.folds ) {
				for ( const [ x1, y1, x2, y2 ] of piece.folds ) {
					inner += foldLine( x1, y1, x2, y2, theme.colors.ink );
				}
			}
			children.push(
				`<g transform="translate(${ r( px( dx ) ) } ${ r(
					px( dy )
				) }) scale(${ r( PX_PER_MM ) })">${ inner }</g>`
			);
			count++;
		}
	}
	return {
		svg: svgDoc( { width, height, bg: '#ffffff', children } ),
		width,
		height,
		warnings,
		count,
		pages,
		page,
		pieces: pieces.length,
		sheet: size,
	};
}
