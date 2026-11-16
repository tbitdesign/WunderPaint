/** Procedural paper surfaces. Tiles are shared, bounded and independent of preview resolution. */
import { rng } from '../core/geom.js';
import { paperLight, FINISH_DEFAULTS } from '../core/finishes.js';

const tiles = new Map();
const clamp = ( v, lo, hi ) => Math.max( lo, Math.min( hi, v ) );

export function paperTexture( material ) {
	if ( tiles.has( material ) ) return tiles.get( material );
	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = 256;
	const g = canvas.getContext( '2d' );
	const r = rng(
		1907 + [ ...material ].reduce( ( n, c ) => n + c.charCodeAt( 0 ), 0 )
	);
	const data = g.createImageData( 256, 256 );
	for ( let y = 0; y < 256; y++ ) {
		for ( let x = 0; x < 256; x++ ) {
			const cloud =
				Math.sin( ( x * Math.PI ) / 32 ) *
					Math.cos( ( y * Math.PI ) / 64 ) +
				Math.sin( ( ( x + y ) * Math.PI ) / 16 );
			let relief = 0;
			if ( material === 'watercolor' )
				relief =
					cloud * 13 +
					Math.sin( x * 0.6 + Math.sin( y * 0.37 ) * 3 ) * 9;
			if ( material === 'cotton' ) relief = cloud * 7;
			if ( material === 'linen' )
				relief =
					Math.sin( ( x * Math.PI ) / 3 ) * 23 +
					Math.cos( ( y * Math.PI ) / 3 ) * 18;
			if ( material === 'laid' )
				relief =
					( y % 5 === 0 ? 29 : y % 5 === 1 ? -22 : 0 ) +
					( x % 64 < 2 ? 14 : 0 );
			if ( material === 'foil' )
				relief =
					Math.sin( x * 0.21 + Math.sin( y * 0.09 ) * 4 ) * 16 +
					cloud * 10;
			const value = clamp(
				128 +
					relief +
					( r() - 0.5 ) * ( material === 'smooth' ? 24 : 56 ),
				0,
				255
			);
			const i = ( y * 256 + x ) * 4;
			data.data[ i ] = data.data[ i + 1 ] = data.data[ i + 2 ] = value;
			data.data[ i + 3 ] = 255;
		}
	}
	g.putImageData( data, 0, 0 );
	if ( [ 'fibre', 'cotton', 'watercolor' ].includes( material ) ) {
		for ( let i = 0; i < 850; i++ ) {
			const x = r() * 256,
				y = r() * 256;
			const length = ( material === 'fibre' ? 22 : 7 ) * ( 0.3 + r() );
			const angle =
				material === 'fibre' ? ( r() - 0.5 ) * 0.65 : r() * Math.PI * 2;
			g.strokeStyle =
				i % 2 ? 'rgba(245,245,245,0.28)' : 'rgba(15,15,15,0.23)';
			g.lineWidth = 0.4 + r() * 0.7;
			g.beginPath();
			g.moveTo( x, y );
			g.quadraticCurveTo(
				x + Math.cos( angle ) * length * 0.6,
				y + Math.sin( angle ) * length * 0.6 + 1,
				x + Math.cos( angle ) * length,
				y + Math.sin( angle ) * length
			);
			g.stroke();
		}
	}
	tiles.set( material, canvas );
	return canvas;
}

export function paperTint( color, amount ) {
	const n = parseInt( color.slice( 1 ), 16 );
	const c = ( shift ) => {
		const value = ( n >> shift ) & 255;
		return Math.round(
			amount >= 0
				? value + ( 255 - value ) * amount
				: value * ( 1 + amount )
		);
	};
	return 'rgb(' + c( 16 ) + ',' + c( 8 ) + ',' + c( 0 ) + ')';
}

/** Shade only inside the cut silhouette. Holes and transparent exports remain holes. */
export function paintPaperSurface(
	g,
	path,
	color,
	material,
	params,
	{ w, h, index = 0 }
) {
	const light = paperLight( params );
	const unit = h / 700;
	const sheen = ( params.sheen ?? FINISH_DEFAULTS.sheen ) / 100;
	const grain = ( params.grain ?? 35 ) / 100;
	const size = Math.max( w, h );
	g.save();
	g.clip( path, 'evenodd' );
	if ( grain > 0 ) {
		const scale =
			unit *
			( 0.6 +
				( params.textureScale ?? FINISH_DEFAULTS.textureScale ) *
					0.024 );
		g.save();
		g.scale( scale, scale );
		g.translate( ( index * 67 ) % 256, ( index * 101 ) % 256 );
		g.globalCompositeOperation = 'soft-light';
		g.globalAlpha = grain * ( material === 'smooth' ? 0.42 : 0.9 );
		g.fillStyle = g.createPattern( paperTexture( material ), 'repeat' );
		g.fillRect( -256, -256, w / scale + 512, h / scale + 512 );
		g.restore();
	}
	if ( material === 'foil' || material === 'pearl' ) {
		const grad = g.createLinearGradient(
			w * 0.5 - light.nx * size * 0.65,
			h * 0.5 - light.ny * size * 0.65,
			w * 0.5 + light.nx * size * 0.65,
			h * 0.5 + light.ny * size * 0.65
		);
		const shift = Math.sin( index * 1.7 ) * 0.035;
		if ( material === 'foil' ) {
			grad.addColorStop( 0, 'rgba(0,0,0,0.4)' );
			grad.addColorStop( 0.3 + shift, 'rgba(255,255,255,0.25)' );
			grad.addColorStop( 0.43 + shift, 'rgba(255,255,255,0.82)' );
			grad.addColorStop( 0.49 + shift, 'rgba(15,10,0,0.35)' );
			grad.addColorStop( 0.65, 'rgba(255,255,255,0.34)' );
			grad.addColorStop( 1, 'rgba(0,0,0,0.25)' );
		} else {
			grad.addColorStop( 0, 'rgba(60,65,110,0.2)' );
			grad.addColorStop( 0.4 + shift, 'rgba(255,255,245,0.12)' );
			grad.addColorStop( 0.63 + shift, 'rgba(255,245,232,0.62)' );
			grad.addColorStop( 1, 'rgba(140,175,205,0.2)' );
		}
		g.globalAlpha = sheen;
		g.fillStyle = grad;
		g.fillRect( 0, 0, w, h );
		g.globalAlpha = 1;
	}
	const amount = ( params.edgeLight ?? FINISH_DEFAULTS.edgeLight ) / 100;
	if ( amount > 0 ) {
		const rim =
			unit *
			( 0.35 +
				amount * 1.5 +
				( params.thickness ?? FINISH_DEFAULTS.thickness ) * 0.016 );
		g.lineWidth = rim * 1.55;
		g.lineJoin = 'round';
		g.save();
		g.translate( light.nx * rim * 0.72, light.ny * rim * 0.72 );
		g.strokeStyle = paperTint( color, -0.36 );
		g.globalAlpha = amount * 0.7;
		g.stroke( path );
		g.restore();
		g.save();
		g.translate( -light.nx * rim * 0.72, -light.ny * rim * 0.72 );
		g.strokeStyle = paperTint( color, material === 'foil' ? 0.9 : 0.64 );
		g.globalAlpha = amount * 0.92;
		g.stroke( path );
		g.restore();
	}
	g.restore();
}
