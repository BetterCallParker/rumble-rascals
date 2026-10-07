// Headless tests for levels, moving platforms, blocking, new moves and the super.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { BTN, ST, GUARD, SPRINT } from '../shared/constants.js';
import { LEVELS } from '../shared/levels.js';
import { SUPER } from '../shared/combat.js';

function setup(level = 0) {
  const g = new Game('TEST');
  if (level) g.setLevel(level);
  const a = g.addPlayer(1, 'Alice');
  const b = g.addPlayer(2, 'Bob');
  const dummy = [...g.players.values()].find((p) => p.dummy);
  const seq = { a: 0, b: 0 };
  const step = (ia = {}, ib = {}) => {
    g.pushInput(a.id, ++seq.a, ia.mx || 0, ia.mz || 0, ia.b || 0);
    g.pushInput(b.id, ++seq.b, ib.mx || 0, ib.mz || 0, ib.b || 0);
    g.step();
  };
  return { g, a, b, dummy, step };
}

// put two players face to face on open floor
function faceOff(g, a, b, x = 0, z = -4) {
  for (const p of [a, b]) { p.invuln = 0; p.og = true; p.vx = p.vy = p.vz = 0; }
  a.x = x; a.z = z; a.y = 0; a.facing = 0;
  b.x = x; b.z = z + 1.0; b.y = 0; b.facing = Math.PI;
}

test('every level runs for 20 seconds with players moving around (no crashes)', () => {
  for (let lv = 0; lv < LEVELS.length; lv++) {
    const { g, a, b, step } = setup(lv);
    for (let i = 0; i < 1200; i++) {
      const t = i / 60;
      step(
        { mx: Math.sin(t), mz: Math.cos(t * 0.7), b: i % 40 < 3 ? BTN.ATTACK : i % 97 < 2 ? BTN.JUMP : 0 },
        { mx: -Math.cos(t * 1.3), mz: Math.sin(t), b: i % 55 < 3 ? BTN.KICK : i % 70 < 30 ? BTN.GRAB_R : 0 },
      );
    }
    assert.ok(g.tick === 1200, LEVELS[lv].id);
    assert.ok(JSON.stringify(g.snapshot()).length > 100);
    void a; void b;
  }
});

test('a knockout takes a real beating (more than 8 jabs)', () => {
  const { g, a, b, step } = setup();
  let jabs = 0;
  while (b.koStun === 0 && jabs < 60) {
    faceOff(g, a, b);
    b.state = ST.FREE;
    step({ b: BTN.ATTACK });
    for (let i = 0; i < 6; i++) step();
    jabs++;
  }
  assert.ok(jabs > 8, `KO after ${jabs} punches`);
});

test('blocked hits drain the guard until it shatters', () => {
  const { g, a, b, step } = setup();
  faceOff(g, a, b);
  // Bob holds block (past the parry window)
  for (let i = 0; i < 12; i++) step({}, { b: BTN.BLOCK });
  assert.equal(b.state, ST.BLOCK);
  let hits = 0;
  while (b.state === ST.BLOCK && hits < 30) {
    a.x = 0; a.z = -4; a.facing = 0; a.state = ST.FREE; a.act = null; a.hitstop = 0;
    step({ b: BTN.ATTACK }, { b: BTN.BLOCK });
    for (let i = 0; i < 8; i++) step({}, { b: BTN.BLOCK });
    hits++;
    b.x = 0; b.z = -3; b.facing = Math.PI;
  }
  assert.equal(b.state, ST.DIZZY, 'guard broke into dizzy');
  assert.ok(hits > 2, `guard held for ${hits} hits`);
  assert.ok(b.guard < GUARD.MAX);
});

test('blocking right before a hit parries and dizzies the attacker', () => {
  const { g, a, b, step } = setup();
  faceOff(g, a, b);
  step({ b: BTN.ATTACK }, {});
  step({}, { b: BTN.BLOCK }); // fresh block during the wind-up = parry window
  for (let i = 0; i < 6; i++) step({}, { b: BTN.BLOCK });
  assert.equal(a.state, ST.DIZZY);
});

test('sprinting then pressing X does a spear tackle that knocks down', () => {
  const { g, a, b, step } = setup();
  a.x = -10; a.z = 0; a.facing = Math.PI / 2; b.x = 0; b.z = 0; b.facing = -Math.PI / 2;
  a.invuln = b.invuln = 0;
  for (let i = 0; i < SPRINT.TICKS + 5; i++) step({ mx: 1 });
  assert.ok(a.spT > SPRINT.TICKS, 'sprinting');
  step({ mx: 1, b: BTN.ATTACK });
  assert.equal(a.act && a.act.k, 'spear');
  for (let i = 0; i < 40 && b.state !== ST.TUMBLE; i++) step({ mx: 1 });
  assert.equal(b.state, ST.TUMBLE);
});

test('ground pound slams down and shakes nearby rascals', () => {
  const { g, a, b, step } = setup();
  a.x = 0; a.z = 4; b.x = 1.5; b.z = 4; a.invuln = b.invuln = 0;
  step({ b: BTN.JUMP });
  for (let i = 0; i < 12; i++) step({ b: BTN.JUMP });
  step({ b: BTN.BLOCK });
  assert.equal(a.act && a.act.k, 'pound');
  const evs = [];
  for (let i = 0; i < 90; i++) { step(); evs.push(...g.events.map((e) => e.e)); g.events = []; }
  assert.ok(evs.includes('pound'));
  assert.ok(b.damage > 0, 'shockwave hit the neighbour');
});

test('holding a trigger next to a ledge hangs on, jump climbs up', () => {
  const { g, a, step } = setup();
  // just off the front edge of the rooftop deck (away from the lift), falling
  a.x = 10; a.z = 12.3; a.y = -1.3; a.vy = -1; a.og = false; a.state = ST.FREE; a.invuln = 0;
  step({ b: BTN.GRAB_L });
  assert.equal(a.state, ST.HANG);
  for (let i = 0; i < 20; i++) step({ b: BTN.GRAB_L });
  assert.equal(a.state, ST.HANG, 'still hanging');
  step({ b: BTN.GRAB_L | BTN.JUMP });
  assert.equal(a.state, ST.FREE);
  for (let i = 0; i < 30; i++) step();
  assert.ok(a.y > -0.01 && a.z < 12, 'climbed back onto the deck');
});

test('conveyor belts carry you, moving platforms carry you', () => {
  const { g, a, step } = setup(3); // factory
  const belt = g.boxes.find((bx) => bx.kind === 'conveyor');
  a.x = (belt.x0 + belt.x1) / 2; a.z = (belt.z0 + belt.z1) / 2; a.y = belt.y1; a.og = true; a.invuln = 0;
  const x0 = a.x;
  for (let i = 0; i < 30; i++) step();
  assert.ok(Math.abs(a.x - x0) > 1, 'moved by the belt');

  const ice = setup(2);
  const floeIdx = ice.g.lv.boxes.findIndex((bx) => bx.move);
  const floe = ice.g.boxes[floeIdx];
  const p = ice.a;
  p.x = (floe.x0 + floe.x1) / 2; p.z = (floe.z0 + floe.z1) / 2; p.y = floe.y1 + 0.01; p.og = false; p.invuln = 0;
  for (let i = 0; i < 5; i++) ice.step();
  const startZ = p.z, startFloeZ = (ice.g.boxes[floeIdx].z0 + ice.g.boxes[floeIdx].z1) / 2;
  for (let i = 0; i < 60; i++) ice.step();
  const floeZ = (ice.g.boxes[floeIdx].z0 + ice.g.boxes[floeIdx].z1) / 2;
  assert.ok(p.state !== ST.DEAD, 'still alive on the floe');
  assert.ok(Math.abs((p.z - startZ) - (floeZ - startFloeZ)) < 0.6, 'rode along with the floe');
});

test('bounce pads launch you', () => {
  const { g, a, step } = setup(0);
  const pad = g.boxes.find((bx) => bx.bounce);
  a.x = (pad.x0 + pad.x1) / 2; a.z = (pad.z0 + pad.z1) / 2; a.y = pad.y1 + 0.5; a.vy = -3; a.og = false; a.invuln = 0;
  let maxY = a.y;
  for (let i = 0; i < 40; i++) { step(); maxY = Math.max(maxY, a.y); }
  assert.ok(maxY > 4, `bounced to ${maxY.toFixed(1)}m`);
});

test('pressing a trigger as a projectile arrives catches it', () => {
  const { g, a, b, step } = setup();
  faceOff(g, a, b, 8, 2); // away from the wrecking ball
  b.z = 6; // 4m away, facing Alice
  const brick = g.spawnProp('brick', 8, 1.2, 2.8);
  a.held = -1;
  brick.state = 'thrown'; brick.owner = a.id; brick.ownerT = 0; brick.vx = 0; brick.vz = 20; brick.vy = 0;
  for (let i = 0; i < 12 && b.held < 0; i++) step({}, { b: i % 2 ? 0 : BTN.GRAB_R });
  assert.equal(b.held, brick.id, 'caught the brick');
});

test('blocking right as you get grabbed reverses it', () => {
  const { g, a, b, step } = setup();
  faceOff(g, a, b);
  step({ b: BTN.GRAB_L });
  assert.equal(a.grab, b.id);
  step({ b: BTN.GRAB_L }, { b: BTN.BLOCK });
  assert.equal(a.grab, -1);
  assert.equal(a.state, ST.DIZZY);
});

test('a full super meter + taunt unleashes SPIN-O-RAMA', () => {
  const { g, a, b, step } = setup();
  faceOff(g, a, b);
  a.super = SUPER.MAX;
  step({ b: BTN.TAUNT });
  assert.equal(a.state, ST.SUPER);
  assert.equal(a.super, 0);
  for (let i = 0; i < 10; i++) step();
  assert.ok(b.damage > 0, 'spin hit the neighbour');
  for (let i = 0; i < SUPER.TICKS; i++) step();
  assert.notEqual(a.state, ST.SUPER);
});

test('running over a banana peel makes you slip', () => {
  const { g, a, step } = setup();
  a.x = -3; a.z = 6; a.facing = Math.PI / 2; a.invuln = 0;
  const peel = g.spawnProp('banana', -1, 0.2, 6);
  peel.ownerT = 99;
  for (let i = 0; i < 10; i++) step();
  let slipped = false;
  for (let i = 0; i < 60 && !slipped; i++) { step({ mx: 1 }); slipped = a.state === ST.TUMBLE; }
  assert.ok(slipped);
  assert.ok(!g.props.has(peel.id), 'peel used up');
});

test('changing levels from the lobby respawns everyone on the new stage', () => {
  const { g, a } = setup();
  g.tick = 1000;
  g.requestLevel(1, 1);
  assert.equal(g.levelIndex, 1);
  assert.equal(g.lv.id, 'train');
  assert.ok(Math.abs(a.x) <= 25 && a.state !== ST.DEAD);
  assert.ok(g.props.size >= g.lv.props.length);
});
