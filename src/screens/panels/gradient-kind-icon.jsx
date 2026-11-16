/** Monochrome diagrams, using the same SVG metrics as the AI cards. */
const PATHS = {
	linear: 'M5 12h14M3 10h4v4H3zM17 10h4v4h-4z',
	radial: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM14 12h7',
	angle: 'M20 12a8 8 0 1 0-8 8M12 12h9M12 12l6-6M12 11v2',
	freeform:
		'M6 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM13 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
	mesh: 'M3 3h18v18H3zM3 12c6-6 12 6 18 0M12 3c-6 6 6 12 0 18M10 10h4v4h-4z',
};
export function GradientKindIcon( { kind } ) {
	return (
		<svg
			width="22"
			height="22"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d={ PATHS[ kind ] } />
		</svg>
	);
}
