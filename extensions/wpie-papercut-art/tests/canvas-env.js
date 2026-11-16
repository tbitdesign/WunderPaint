/** Node canvas adapter for the renderer's polygon-only Path2D objects. No geometric approximation. */
import { createRequire } from 'node:module';
const require = createRequire( import.meta.url );
export const { createCanvas, loadImage } = require( 'canvas' );
class PolygonPath {
	constructor( source = '' ) {
		this.commands = [];
		if ( ! source ) return;
		const tokens =
			source.match(
				/[MLZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g
			) || [];
		for ( let i = 0; i < tokens.length;  ) {
			const op = tokens[ i++ ];
			if ( op === 'Z' ) this.closePath();
			else if ( op === 'M' || op === 'L' )
				this.commands.push( [
					op === 'M' ? 'moveTo' : 'lineTo',
					+tokens[ i++ ],
					+tokens[ i++ ],
				] );
			else throw Error( 'Unexpected path command: ' + op );
		}
	}
	moveTo( ...args ) {
		this.commands.push( [ 'moveTo', ...args ] );
	}
	lineTo( ...args ) {
		this.commands.push( [ 'lineTo', ...args ] );
	}
	closePath() {
		this.commands.push( [ 'closePath' ] );
	}
	rect( ...args ) {
		this.commands.push( [ 'rect', ...args ] );
	}
	trace( context ) {
		context.beginPath();
		for ( const [ op, ...args ] of this.commands ) context[ op ]( ...args );
	}
}
const proto = Object.getPrototypeOf( createCanvas( 1, 1 ).getContext( '2d' ) );
for ( const key of [ 'fill', 'stroke', 'clip', 'isPointInPath' ] ) {
	const original = proto[ key ];
	proto[ key ] = function ( first, ...rest ) {
		if ( first instanceof PolygonPath ) {
			first.trace( this );
			return original.call( this, ...rest );
		}
		return original.call( this, first, ...rest );
	};
}
globalThis.Path2D = PolygonPath;
globalThis.document = {
	createElement: ( tag ) => {
		if ( tag !== 'canvas' ) throw Error( 'Canvas only' );
		return createCanvas( 1, 1 );
	},
};
