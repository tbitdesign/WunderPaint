/**
 * The catalogue of figures, in the order the cards show them.
 */
import { fox } from './fox.js';
import { heart } from './heart.js';
import { boat } from './boat.js';
import { fortune } from './fortune.js';
import { butterfly } from './butterfly.js';
import { frog } from './frog.js';
import { masu } from './masu.js';
import { crane } from './crane.js';
import { swan } from './swan.js';
import { dove } from './dove.js';
import { plane } from './plane.js';
import { helmet } from './helmet.js';
import { fish } from './fish.js';
import { tulip } from './tulip.js';
import { dog } from './dog.js';
import { cat } from './cat.js';
import { penguin } from './penguin.js';
import { cup } from './cup.js';

export const FIGURES = [
	crane,
	fox,
	heart,
	boat,
	butterfly,
	fortune,
	frog,
	masu,
	swan,
	dove,
	plane,
	helmet,
	fish,
	tulip,
	dog,
	cat,
	penguin,
	cup,
];

export const figureOf = ( id ) =>
	FIGURES.find( ( f ) => f.id === id ) || FIGURES[ 0 ];
