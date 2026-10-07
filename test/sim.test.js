// Headless tests for the authoritative simulation: knockouts, dragging, lifting, throwing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { BTN, ST, MAX_PLAYERS } from '../shared/constants.js';

function setup() {
  const g = new Game('TEST');
  const a = g.addPlayer(1, 'Alice');
  const dummy = [...g.players.values()].find((p) => p.dummy);
  let seq = 0;
  const step = (b = 0, mx = 0, mz = 0) => {
    g.pushInput(a.id, ++seq, mx, mz, b);
    g.step();
  };
  return { g, a, dummy, step };
}

test('level always has exactly one test dummy that is not a player slot', () => {
  const g = new Game('T');
  const dummies = [...g.players.values()].filter((p) => p.dummy);
  assert.equal(dummies.length, 1);
  for (let i = 0; i < MAX_PLAYERS; i++) assert.ok(g.addPlayer(i, 'P' + i));
  assert.equal(g.addPlayer(99, 'too many'), null);
});

test('punching a dazed dummy knocks it out', () => {
  const { a, dummy, step } = setup();
  a.x = dummy.x; a.z = dummy.z - 1; a.facing = 0; a.invuln = 0; dummy.invuln = 0;
  dummy.daze = 99;
  step(BTN.ATTACK);
  for (let i = 0; i < 90 && dummy.state !== ST.KO; i++) step();
  assert.equal(dummy.state, ST.KO);
  assert.ok(dummy.koStun > 0);
});

test('one trigger drags a knocked-out rascal, both triggers lift, X throws', () => {
  const { a, dummy, step } = setup();
  a.x = dummy.x; a.z = dummy.z - 1; a.facing = 0; a.invuln = 0; dummy.invuln = 0;
  dummy.koStun = 300;
  dummy.state = ST.KO;
  step(BTN.GRAB_L);
  assert.equal(a.grab, dummy.id);
  assert.equal(a.grabMask, 1);
  assert.equal(dummy.drag, true);
  // drag it along
  const startX = dummy.x;
  for (let i = 0; i < 60; i++) step(BTN.GRAB_L, -1, 0);
  assert.ok(dummy.x < startX - 3, 'dummy should be dragged several meters');
  assert.ok(Math.hypot(dummy.x - a.x, dummy.z - a.z) < 2, 'stays tethered to the dragger');
  // both triggers = overhead
  step(BTN.GRAB_L | BTN.GRAB_R, -1, 0);
  assert.equal(a.grabMask, 3);
  step(BTN.GRAB_L | BTN.GRAB_R, -1, 0);
  assert.ok(dummy.y - a.y > 1.5, 'lifted over the head');
  // X throws
  step(BTN.GRAB_L | BTN.GRAB_R | BTN.ATTACK, -1, 0);
  assert.equal(a.grab, -1);
  assert.equal(dummy.state, ST.TUMBLE);
  assert.ok(dummy.koStun > 0, 'still out cold while flying');
});

test('releasing the trigger lets go of a conscious rascal', () => {
  const { a, dummy, step } = setup();
  a.x = dummy.x; a.z = dummy.z - 1; a.facing = 0; a.invuln = 0; dummy.invuln = 0;
  step(BTN.GRAB_R);
  assert.equal(a.grab, dummy.id);
  assert.equal(dummy.state, ST.HELD);
  step(0);
  assert.equal(a.grab, -1);
  assert.notEqual(dummy.state, ST.HELD);
});

test('the dummy pops back after a ring-out', () => {
  const { g, dummy } = setup();
  dummy.y = -30;
  g.step();
  assert.equal(dummy.state, ST.DEAD);
  for (let i = 0; i < 120; i++) g.step();
  assert.notEqual(dummy.state, ST.DEAD);
  assert.equal(dummy.damage, 0);
});
