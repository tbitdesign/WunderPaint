import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	parseTime,
	fmtTime,
	fmtDur,
	duration,
	toSegments,
	assignLanes,
	angleFor,
	arcAngles,
	DAY_MINUTES,
} from '../src/blocks.js';

test( 'fmtDur reads hours and minutes', () => {
	assert.equal( fmtDur( 90 ), '1h30' );
	assert.equal( fmtDur( 60 ), '1h' );
	assert.equal( fmtDur( 45 ), '45m' );
	assert.equal( fmtDur( 540 ), '9h' );
} );

test( 'parseTime accepts HH:MM, plain hours and half hours', () => {
	assert.equal( parseTime( '07:30' ), 450 );
	assert.equal( parseTime( '7' ), 420 );
	assert.equal( parseTime( '7.5' ), 450 );
	assert.equal( parseTime( '00:00' ), 0 );
	assert.equal( parseTime( 450 ), 450 );
	assert.equal( parseTime( 'nonsense' ), null );
	assert.equal( parseTime( '25:00' ), 60 ); // wraps into range
} );

test( 'fmtTime pads to HH:MM', () => {
	assert.equal( fmtTime( 450 ), '07:30' );
	assert.equal( fmtTime( 0 ), '00:00' );
	assert.equal( fmtTime( 1440 ), '00:00' );
} );

test( 'duration honours wrap past midnight', () => {
	assert.equal( duration( 540, 720 ), 180 ); // 09:00-12:00
	assert.equal( duration( 1380, 390 ), 450 ); // 23:00-06:30 wraps
	assert.equal( duration( 600, 600 ), DAY_MINUTES ); // equal = full day
} );

test( 'toSegments splits a wrapping block into two', () => {
	assert.deepEqual( toSegments( 540, 720 ), [ [ 540, 720 ] ] );
	assert.deepEqual( toSegments( 1380, 390 ), [
		[ 1380, 1440 ],
		[ 0, 390 ],
	] );
} );

test( 'angleFor puts midnight at the top and runs clockwise', () => {
	assert.ok( Math.abs( angleFor( 0 ) - -Math.PI / 2 ) < 1e-9 ); // 00:00 top
	assert.ok( Math.abs( angleFor( 720 ) - Math.PI / 2 ) < 1e-9 ); // 12:00 bottom
	assert.ok( angleFor( 360 ) > angleFor( 0 ) ); // clockwise
} );

test( 'arcAngles sweep equals the duration fraction', () => {
	const { a0, a1, dur } = arcAngles( 1380, 390 ); // 23:00-06:30, wraps
	assert.equal( dur, 450 );
	assert.ok( Math.abs( a1 - a0 - ( 450 / 1440 ) * 2 * Math.PI ) < 1e-9 );
} );

test( 'assignLanes nests overlapping blocks on separate rings', () => {
	const blocks = [
		{ id: 'a', start: 540, end: 720 }, // 09:00-12:00 deep work
		{ id: 'b', start: 600, end: 630 }, // 10:00-10:30 stand-up (inside a)
		{ id: 'c', start: 780, end: 840 }, // 13:00-14:00 (separate)
	];
	const { laneOf, lanes } = assignLanes( blocks );
	assert.notEqual( laneOf[ 0 ], laneOf[ 1 ] ); // a and b must not share a lane
	assert.equal( laneOf[ 0 ], laneOf[ 2 ] ); // a and c can share the outer lane
	assert.equal( lanes, 2 );
} );

test( 'assignLanes handles a wrapping overnight block against a morning block', () => {
	const blocks = [
		{ id: 'sleep', start: 1380, end: 390 }, // 23:00-06:30 wraps
		{ id: 'wake', start: 360, end: 420 }, // 06:00-07:00 overlaps the tail
	];
	const { laneOf } = assignLanes( blocks );
	assert.notEqual( laneOf[ 0 ], laneOf[ 1 ] );
} );

test( 'assignLanes is deterministic', () => {
	const b = [
		{ id: 'x', start: 100, end: 200 },
		{ id: 'y', start: 150, end: 250 },
	];
	assert.deepEqual( assignLanes( b ), assignLanes( b ) );
} );
