/** A numeric gesture can cross many render callbacks but creates one snapshot. */
let active = null;

export function beginNumberTransaction() {
	if ( active ) {
		endNumberTransaction( active );
	}
	const transaction = { commits: new Map() };
	active = transaction;
	return transaction;
}

export function numberCommit( owner, callback ) {
	if ( active ) {
		active.commits.set( owner, callback );
	} else {
		callback();
	}
}

export function endNumberTransaction( transaction, cancel = false ) {
	if ( active !== transaction ) {
		return;
	}
	active = null;
	if ( ! cancel ) {
		transaction.commits.forEach( ( commit ) => commit() );
	}
}
