/** Transient interaction quality; deliberately absent from project data and exports. */
const editing = new Set();
export function setGradientEditing( id, active ) {
	if ( id ) {
		if ( active ) {
			editing.add( id );
		} else {
			editing.delete( id );
		}
	}
}
export const isGradientEditing = () => editing.size > 0;
