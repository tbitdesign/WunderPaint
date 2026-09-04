/** A tiny seeded generator (mulberry32) so confetti and card draws repeat on Update. */
export function seeded( seed ) {
	let a = seed >>> 0 || 1;
	return () => {
		a += 0x6d2b79f5;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}
