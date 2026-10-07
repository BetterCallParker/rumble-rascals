// Headless tests for characters, host settings, weapon categories, climbing and the chase race.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { BTN, ST, PHASE } from '../shared/constants.js';
import { LEVELS } from '../shared/levels.js';
import { ITEMS } from '../shared/items.js';

function setup(level = 0) {
  const g = new Game('TEST');
  g.hostClient = 1;
  g.settings.hazards = 0; // keep wrecking balls out of the tests
  if (level) g.setLevel(level);
  const a = g.addPlayer(1, 'Alice');
  const b = g.addPlayer(2, 'Bob');
  const seq = { a: 0, b: 0 };
  const step = (ia = {}, ib = {}) => {
    g.pushInput(a.id, ++seq.a, ia.mx || 0, ia.mz || 0, ia.b || 0, ia.ay);
    g.pushInput(b.id, ++seq.b, ib.mx || 0, ib.mz || 0, ib.b || 0, ib.ay);
    g.step();
  };
  for (const p of [a, b]) p.invuln = 0;
  return { g, a, b, step };
}

function give(g, p, kind, hand = 1) {
  const pr = g.spawnProp(kind, p.x, p.y + 1, p.z);
  g.takeProp(p, pr, ITEMS[kind].type === 'heavy' ? 2 : hand);
  return pr;
}

test('only the host can change match settings, and only in the lobby', () => {
  const { g } = setup();
  g.setSetting(2, 'rounds', 4);
  assert.equal(g.settings.rounds, 2);
  g.setSetting(1, 'rounds', 4);
  assert.equal(g.roundsToWin(), 5);
  g.setSetting(1, 'items', 0);
  assert.equal(g.props.size, 0, 'no items');
  g.setSetting(1, 'stages', 6);
  assert.equal(g.lv.id, 'chase', 'host picked the chase stage');
});

test('disabled weapon categories never spawn', () => {
  const { g } = setup();
  for (const c of ['melee', 'shooting', 'fire', 'acid', 'explosives']) g.setSetting(1, c, 0);
  for (let i = 0; i < 40; i++) g.skyDrop();
  for (const pr of g.props.values()) assert.equal(ITEMS[pr.kind].cat, 'throwable', pr.kind);
});

test('characters change stats: Bruiser takes less knockback than Zippy', () => {
  const run = (charIdx) => {
    const { g, a, b, step } = setup();
    g.setCharacter(2, b.id, charIdx);
    a.x = 0; a.z = 4; a.facing = 0; b.x = 0; b.z = 5; b.facing = Math.PI;
    b.damage = 60;
    const pr = give(g, a, 'bat');
    void pr;
    step({ b: BTN.ATTACK });
    for (let i = 0; i < 40; i++) step();
    return Math.hypot(b.x - 0, b.z - 5);
  };
  const bruiser = run(1), zippy = run(2);
  assert.ok(zippy > bruiser * 1.2, `zippy ${zippy.toFixed(1)} vs bruiser ${bruiser.toFixed(1)}`);
});

test('guns shoot where you aim and use ammo', () => {
  const { g, a, b, step } = setup();
  a.x = 8; a.z = -4; a.facing = 0; b.x = 8; b.z = 4; b.facing = Math.PI; // clear line of fire (dummy is at x=0)
  const gun = give(g, a, 'poppistol');
  const ammo = gun.ammo;
  step({ b: BTN.ATTACK, ay: 0 });
  assert.equal(gun.ammo, ammo - 1);
  assert.ok(g.bullets.length >= 1);
  for (let i = 0; i < 30; i++) step();
  assert.ok(b.damage > 0, 'cork hit Bob 8m away');
});

test('flamethrower sets rascals on fire, dodge-rolling puts it out', () => {
  const { g, a, b, step } = setup();
  a.x = 0; a.z = 3; a.facing = 0; b.x = 0; b.z = 5.5; b.facing = Math.PI;
  give(g, a, 'flamethrower');
  for (let i = 0; i < 30 && !b.burn; i++) step({ b: BTN.ATTACK, ay: 0 });
  assert.ok(b.burn > 0, 'Bob is burning');
  const dmg = b.damage;
  for (let i = 0; i < 45; i++) step();
  assert.ok(b.damage > dmg, 'burn damage over time');
  step({}, { b: BTN.DODGE });
  step();
  assert.equal(b.burn, 0, 'rolled it out');
});

test('acid flask leaves a corroding puddle', () => {
  const { g, a, b, step } = setup();
  a.x = 0; a.z = 2; a.facing = 0; b.x = 0; b.z = 6; b.facing = Math.PI;
  give(g, a, 'acidflask');
  step({ b: BTN.ATTACK, ay: 0 });
  for (let i = 0; i < 40; i++) step();
  assert.ok(g.puddles.length >= 1, 'puddle');
  assert.ok(b.acid > 0, 'Bob got acid on him');
});

test('grenades are hot potatoes: catch one and it still blows', () => {
  const { g, a, b, step } = setup();
  a.x = 0; a.z = 3; a.facing = 0; b.x = 0; b.z = 7; b.facing = Math.PI;
  const nade = give(g, a, 'grenade');
  step({ b: BTN.ATTACK, ay: 0 });
  assert.ok(nade.fuse > 0, 'lit');
  let caught = false;
  for (let i = 0; i < 20 && !caught; i++) { step({}, { b: i % 2 ? 0 : BTN.GRAB_R }); caught = b.held === nade.id; }
  assert.ok(caught, 'Bob caught it');
  let boom = false;
  for (let i = 0; i < 120 && !boom; i++) { step({}, { b: BTN.GRAB_R }); boom = g.events.some((e) => e.e === 'explode'); g.events = []; }
  assert.ok(boom, 'it exploded in his hands');
});

test('you can climb back up the side of the building', () => {
  const { g, a, step } = setup();
  // knocked off the front edge, falling past the wall 4m below the roof
  a.x = 10; a.z = 12.4; a.y = -4; a.vy = -2; a.og = false; a.state = ST.FREE;
  step({ b: BTN.GRAB_L });
  assert.equal(a.state, ST.CLIMB, 'clinging to the wall');
  // stick toward the wall (-z) to climb
  for (let i = 0; i < 160 && a.state === ST.CLIMB; i++) step({ mz: -1, b: BTN.GRAB_L });
  assert.equal(a.state, ST.HANG, 'reached the ledge');
  step({ b: BTN.GRAB_L | BTN.JUMP });
  for (let i = 0; i < 30; i++) step();
  assert.ok(a.y > -0.05 && a.z < 12, 'back on the roof');
});

test('chase race: the steamroller flattens stragglers, crossing the finish wins', () => {
  const chase = LEVELS.findIndex((l) => l.id === 'chase');
  const { g, a, b, step } = setup(chase);
  g.startRound();
  for (let i = 0; i < 200; i++) step(); // countdown
  assert.equal(g.phase, PHASE.FIGHT);
  // Bob stands still, Alice gets teleported near the finish
  a.x = g.lv.finishX - 2; a.z = 0; a.y = 0.1;
  let squashed = false;
  for (let i = 0; i < 60 * 12 && g.phase === PHASE.FIGHT; i++) {
    step({ mx: 1 });
    squashed = squashed || b.state === ST.DEAD;
  }
  assert.ok(g.phase === PHASE.ROUND_END, 'round over');
  assert.equal(a.wins, 1, 'Alice won');
  void squashed;
  // a straggler parked behind the roller gets flattened
  const r2 = setup(chase);
  r2.g.startRound();
  for (let i = 0; i < 200; i++) r2.step();
  r2.b.x = -10;
  for (let i = 0; i < 120; i++) r2.step({ mx: 1 });
  assert.equal(r2.b.state, ST.DEAD, 'Bob got squashed');
});
