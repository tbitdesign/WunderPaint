import { labT as t } from './i18n.js';

const GROUPS = [
	[ 'apply', 'Apply liquid', [ 'pipette', 'pour', 'spray', 'ring' ], 'drop' ],
	[ 'flow', 'Flow', [ 'stir', 'air', 'vortex', 'comb' ], 'wave' ],
	[
		'sources',
		'Sources',
		[ 'heat', 'cool', 'magnet', 'removeSource' ],
		'magnet',
	],
	[
		'obstacles',
		'Obstacles',
		[ 'wall', 'draw', 'duplicate', 'erase' ],
		'comb',
	],
	[ 'depth', 'Depth', [ 'lift', 'drain' ], 'wave' ],
];

// Labels remain visible; the longer explanations describe the actual gesture.
const TOOLS = {
	pipette: [
		'Pipette',
		'drop',
		'Hold to add drops of the selected liquid. Drag to draw a trail.',
	],
	pour: [
		'Pour',
		'ink',
		'Hold to pour the selected liquid. The stream spreads as you hold.',
	],
	spray: [
		'Spray',
		'splatter',
		'Hold to scatter small drops of the selected liquid. Adjust the spread on the right.',
	],
	ring: [
		'Ring',
		'ringcomb',
		'Click or hold to apply the selected liquid in a ring around the pointer.',
	],
	comb: [
		'Comb',
		'comb',
		'Drag to pull parallel tracks through the liquid. Adjust the tine count and spacing on the right.',
	],
	draw: [
		'Draw',
		'stylus',
		'Drag to draw solid obstacles with the selected shape. Brush size controls the stamps.',
	],
	duplicate: [
		'Duplicate',
		'duplicate',
		'Click an obstacle to select it, then click empty space to place copies with the same shape, size, rotation and color.',
	],
	stir: [
		'Stir',
		'stylus',
		'Drag through the bath to move the liquid. The flow continues after release.',
	],
	air: [ 'Air', 'wave', 'Hold to blow liquid away from the pointer.' ],
	vortex: [
		'Whirlpool',
		'vortex',
		'Hold to spin the liquid around the pointer.',
	],
	lift: [
		'Lift',
		'wave',
		'Hold to lift liquid in the deep bath and let it splash back.',
	],
	heat: [
		'Heat',
		'heat',
		'Click to place a lasting heat source. Drag its handle to move it.',
	],
	cool: [
		'Cold',
		'cool',
		'Click to place a lasting cold source. Drag its handle to move it.',
	],
	magnet: [
		'Magnet',
		'magnet',
		'Click to place a lasting magnet. Drag its handle to move it. It acts on ferrofluid.',
	],
	removeSource: [
		'Remove source',
		'sourceOff',
		'Click a source handle to remove its lasting effect.',
	],
	wall: [
		'Obstacle',
		'comb',
		'Click to place a solid shape, or drag a shape to move it. Choose its form on the right.',
	],
	erase: [
		'Remove obstacle',
		'trash',
		'Click an obstacle to remove it. Drag to erase painted obstacles.',
	],
	orbit: [
		'Rotate view',
		'eye',
		'Drag to rotate the view. This changes the camera, not the liquid.',
	],
	drain: [
		'Drain',
		'drop',
		'Hold to remove liquid from the deep bath at the pointer.',
	],
};

/** DOM adapter for the host's existing .ai-tip appearance, with a 3s delay. */
function toolTips( ui, root ) {
	let timer = 0,
		hideTimer = 0,
		anchor = null,
		bubble = null;
	const id = 'wpiemb-fluid-tool-tip';
	const hide = () => {
		window.clearTimeout( timer );
		window.clearTimeout( hideTimer );
		anchor?.removeAttribute( 'aria-describedby' );
		anchor = null;
		bubble?.remove();
		bubble = null;
	};
	const leave = () => {
		window.clearTimeout( timer );
		hideTimer = window.setTimeout( hide, 120 );
	};
	const bind = ( button, text ) => {
		const show = () => {
			hide();
			anchor = button;
			timer = window.setTimeout( () => {
				if (
					! button.isConnected ||
					button.hidden ||
					button.disabled
				) {
					hide();
					return;
				}
				bubble = ui.el(
					'div',
					'ai-tip wpiemb-lab-tooltip',
					root,
					text
				);
				bubble.id = id;
				bubble.setAttribute( 'role', 'tooltip' );
				const r = button.getBoundingClientRect();
				const half = bubble.getBoundingClientRect().width / 2;
				const cx = r.left + r.width / 2;
				const x = Math.max(
					half + 8,
					Math.min( window.innerWidth - half - 8, cx )
				);
				bubble.style.left = x + 'px';
				bubble.style.top =
					Math.max( bubble.offsetHeight + 8, r.top - 6 ) + 'px';
				bubble.style.setProperty( '--tip-ax', cx - x + 'px' );
				button.setAttribute( 'aria-describedby', id );
				bubble.onpointerenter = () => window.clearTimeout( hideTimer );
				bubble.onpointerleave = leave;
			}, 3000 );
		};
		button.onpointerenter = ( event ) => {
			if ( event.pointerType !== 'touch' ) {
				show();
			}
		};
		button.onpointerleave = leave;
		button.onfocus = show;
		button.onblur = hide;
	};
	const key = ( event ) => {
		if ( event.key === 'Escape' && bubble ) {
			event.stopPropagation();
			event.preventDefault();
			hide();
		}
	};
	// The dialog listens on document capture; dismiss its tooltip first.
	window.addEventListener( 'keydown', key, true );
	document.addEventListener( 'pointerdown', hide, true );
	document.addEventListener( 'scroll', hide, true );
	window.addEventListener( 'resize', hide );
	window.addEventListener( 'blur', hide );
	return {
		bind,
		hide,
		dispose() {
			hide();
			window.removeEventListener( 'keydown', key, true );
			document.removeEventListener( 'pointerdown', hide, true );
			document.removeEventListener( 'scroll', hide, true );
			window.removeEventListener( 'resize', hide );
			window.removeEventListener( 'blur', hide );
		},
	};
}

/** Buttons are mounted once so changing tools preserves keyboard focus. */
export function mountToolDeck( parent, { ui, icons, onSelect, tooltipRoot } ) {
	const deck = ui.el( 'div', 'wpiemb-lab-tool-deck', parent );
	deck.setAttribute( 'role', 'group' );
	deck.setAttribute( 'aria-label', t( 'Tool' ) );
	const groups = ui.el( 'div', 'wpiemb-lab-tool-groups', deck );
	const tips = toolTips( ui, tooltipRoot );
	const buttons = new Map(),
		groupNodes = new Map();
	for ( const [ id, label, tools, groupIcon ] of GROUPS ) {
		const body = ui.section( groups, {
			title: t( label ),
			icon: icons[ groupIcon ],
		} );
		const group = body.parentElement;
		group.classList.add( 'wpiemb-lab-tool-group' );
		group.dataset.toolGroup = id;
		group.setAttribute( 'role', 'group' );
		group.setAttribute( 'aria-label', t( label ) );
		const grid = ui.el( 'div', 'wpiemb-lab-tool-grid', body );
		for ( const tool of tools ) {
			const [ name, icon, explanation ] = TOOLS[ tool ];
			const shortName =
				{ removeSource: 'Remove', erase: 'Remove', duplicate: 'Copy' }[
					tool
				] || name;
			const { node: button } = ui.pickrow( grid, {
				title: t( shortName ),
				icon: icons[ icon ],
				compact: true,
				cls: 'wpiemb-tool',
			} );
			button.dataset.tool = tool;
			button.setAttribute( 'aria-label', t( name ) );
			tips.bind( button, t( explanation ) );
			button.onclick = () => {
				tips.hide();
				onSelect( tool );
			};
			buttons.set( tool, button );
		}
		groupNodes.set( id, group );
	}
	return {
		bindRotate( button ) {
			button.dataset.tool = 'orbit';
			button.setAttribute( 'aria-label', t( TOOLS.orbit[ 0 ] ) );
			tips.bind( button, t( TOOLS.orbit[ 2 ] ) );
			button.onclick = () => {
				tips.hide();
				onSelect( 'orbit' );
			};
			buttons.set( 'orbit', button );
		},
		refresh( settings, kind ) {
			tips.hide();
			for ( const [ id, button ] of buttons ) {
				button.hidden =
					[ 'lift', 'drain' ].includes( id ) && kind !== 'volume';
				button.setAttribute(
					'aria-pressed',
					String( settings.tool === id )
				);
			}
			for ( const [ id, , tools ] of GROUPS ) {
				groupNodes.get( id ).hidden = tools.every(
					( tool ) => buttons.get( tool ).hidden
				);
			}
		},
		dispose: tips.dispose,
	};
}
