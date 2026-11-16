/** Direct tools and creative extensions, without duplicating the asset tray. */
import { __ } from '@wordpress/i18n';
import { I } from '../../icons';
import { useTip } from '../../components/use-tip';
import { useEditor } from '../../store/editor-context';
import { activateEasyTool, openEasySection } from './easy-actions';

export function EasyToolbar( { extras, navigation } ) {
	const editor = useEditor();
	const { state } = editor;
	const { area, section } = navigation;
	const { tipFor, tipNode } = useTip();
	const editing = area === 'edit';
	const painting = [ 'brush', 'pencil' ].includes( state.tool );
	const edit = ( next ) => openEasySection( editor, extras, next );
	const tools = [
		{
			id: 'move',
			icon: 'cursor',
			label: __( 'Select', 'wunderpaint' ),
			tip: __(
				'Move and arrange the elements on your canvas.',
				'wunderpaint'
			),
			run: () => activateEasyTool( editor, 'move', extras ),
			active:
				editing &&
				section === 'basics' &&
				[ 'move', 'select' ].includes( state.tool ),
		},
		{
			id: 'creative',
			icon: 'sparkles',
			label: __( 'Creative', 'wunderpaint' ),
			tip: __( 'Creative & AI', 'wunderpaint' ),
			run: () => openEasySection( editor, extras, 'basics', 'creative' ),
			active: area === 'creative',
		},
		{
			id: 'text',
			icon: 'text',
			label: __( 'Text', 'wunderpaint' ),
			tip: __( 'Add text and start typing.', 'wunderpaint' ),
			run: () => activateEasyTool( editor, 'text', extras ),
		},
		{
			id: 'shape',
			icon: 'shape',
			label: __( 'Shapes', 'wunderpaint' ),
			tip: __( 'Shapes', 'wunderpaint' ),
			run: () => {
				activateEasyTool( editor, 'move', extras );
				extras.openShapeStudioModal();
			},
		},
		{
			id: 'brush',
			icon: 'brush',
			label: __( 'Draw', 'wunderpaint' ),
			tip: __(
				'Draw with your brush, pencil or eraser. Settings appear on the right.',
				'wunderpaint'
			),
			run: () =>
				activateEasyTool(
					editor,
					painting ? state.tool : 'brush',
					extras
				),
			active: editing && painting,
		},
		{
			id: 'eraser',
			icon: 'eraser',
			label: __( 'Eraser', 'wunderpaint' ),
			run: () => activateEasyTool( editor, 'eraser', extras ),
			active: editing && state.tool === 'eraser',
		},
		{
			id: 'crop',
			icon: 'crop',
			label: __( 'Crop', 'wunderpaint' ),
			tip: __( 'Trim your design to a new size.', 'wunderpaint' ),
			run: () => activateEasyTool( editor, 'crop', extras ),
			active: editing && state.tool === 'crop',
		},
		{
			id: 'photo',
			icon: 'image',
			label: __( 'Photo', 'wunderpaint' ),
			tip: __( 'Improve photo', 'wunderpaint' ),
			run: () => edit( 'photo' ),
			active: editing && section === 'photo',
		},
		{
			id: 'looks',
			icon: 'palette',
			label: __( 'Looks', 'wunderpaint' ),
			run: () => edit( 'looks' ),
			active: editing && section === 'looks',
		},
		{
			id: 'layout',
			icon: 'textLayout',
			label: __( 'Layout', 'wunderpaint' ),
			run: () => edit( 'layout' ),
			active: editing && section === 'layout',
		},
	];
	return (
		<nav
			className="ed-toolbar ed-easy-toolbar"
			aria-label={ __( 'Tools', 'wunderpaint' ) }
		>
			{ tools.map( ( tool ) => (
				<button
					key={ tool.id }
					type="button"
					className="ai-tile ai-tile-compact ed-easy-tool"
					data-easy-tool={ tool.id }
					aria-pressed={ tool.active }
					{ ...tipFor( tool.tip || tool.label ) }
					aria-label={ tool.label }
					onClick={ tool.run }
				>
					<span className="ai-tile-icon" aria-hidden="true">
						{ I[ tool.icon ]( { size: 23 } ) }
					</span>
					<span className="ai-tile-name">{ tool.label }</span>
				</button>
			) ) }
			{ tipNode }
		</nav>
	);
}
