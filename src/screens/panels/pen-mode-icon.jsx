/** Drawing-mode diagrams share the monochrome AI-card icon style. */
const PATHS = {
	pen: 'M4 18C4 5 20 19 20 6M4 18V5M20 6v13M2 16h4v4H2zM18 4h4v4h-4zM2 3h4v4H2zM18 17h4v4h-4z',
	curve: 'M3 18C8 18 7 6 12 6s4 12 9 12M2 17h2v2H2zM11 5h2v2h-2zM20 17h2v2h-2z',
	freehand: 'M3 17c6 0 1-11 7-11 5 0-3 13 2 13 3 0 3-9 6-9 2 0 0 7 3 7',
};
export function PenModeIcon( { mode } ) {
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
			<path d={ PATHS[ mode ] } />
		</svg>
	);
}
