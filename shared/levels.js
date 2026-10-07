// Level definitions shared by server (collision, hazards) and client (rendering, prediction).
// Static colliders are axis-aligned boxes. Boxes with `move` are platforms that travel on a
// deterministic schedule (both sides evaluate them from server time). `conv` = conveyor belt,
// `bounce` = bounce pad. Everything loose in a level is a pickupable prop.

function box(kind, x0, y0, z0, x1, y1, z1, extra = {}) {
  return { kind, x0, y0, z0, x1, y1, z1, ...extra };
}

// ------------------------------------------------------------------ 1. ROOFTOP RUMBLE
const rooftop = {
  id: 'rooftop',
  name: 'ROOFTOP RUMBLE',
  tagline: 'Ride the crane pallet - dodge the wrecking ball!',
  music: 0,
  boxes: [
    box('deck', -18, -60, -12, 18, 0, 12),
    box('island', 21, -60, -4.5, 27, 0, 4.5),
    box('island', -27, -60, -4.5, -21, 0, 4.5),
    box('scaffold', -18, 0, -12, -12, 2.6, -6.5),
    box('scaffold', 12, 0, -12, 18, 2.6, -6.5),
    box('container', -4, 0, -12, 4, 2.8, -9),
    box('crate', -11.2, 0, -8.6, -9.8, 1.3, -7.2),
    box('crate', 9.8, 0, -8.6, 11.2, 1.3, -7.2),
    box('crate', -5.6, 0, -11.4, -4.2, 1.3, -10),
    box('ledge', -12, 0, -12.4, -4, 0.55, -12),
    box('ledge', 4, 0, -12.4, 12, 0.55, -12),
    box('bounce', 23.2, 0, -0.8, 24.8, 0.3, 0.8, { bounce: 19 }),
    box('bounce', -24.8, 0, -0.8, -23.2, 0.3, 0.8, { bounce: 19 }),
    // window-washer lift rising up the front of the building
    box('lift', -3, -0.45, 12.6, 3, 0, 15.6, { move: { axis: 'y', amp: 2.2, period: 8 } }),
    // pallet hanging from the crane, sliding over the roof
    box('pallet', -2.6, 4.0, -7.6, 2.6, 4.4, -4.4, { move: { axis: 'x', amp: 11.5, period: 13 } }),
  ],
  spawns: [[-8, 0, 0], [8, 0, 0], [0, 0, -5], [-4, 0, 8], [-13, 0, 6], [13, 0, 6], [-14, 0, -2], [14, 0, -2]],
  dummySpawn: [0, 0, 3.5],
  itemSpawns: [
    [-3, 0, 1], [3, 0, -1.5], [-11, 0, 3], [11, 0, 3], [0, 2.8, -10.5], [-15, 2.6, -9], [15, 2.6, -9],
    [24, 0, 2.5], [-24, 0, -2.5], [-4, 0, 10], [4, 0, 10.5], [0, 0, -6.5], [-7, 0, -3], [7, 0, -3.5],
    [6, 0, 6], [-8, 0, 7], [15, 0, 9], [-15, 0, 9], [10, 0, -5], [-10, 0, -5],
  ],
  props: [
    ['crate', -7, 0.6, 4], ['crate', 7, 0.6, 3], ['crate', 7.4, 0.6, 4.1], ['crate', 2, 0.6, 7], ['crate', -16.5, 0.6, 10.5],
    ['barrel', -13, 0.6, 9], ['barrel', 13.5, 0.6, 9.5], ['barrel', 0, 3.3, -10.5], ['tire', -15.5, 3.1, -9.5],
    ['cone', 5, 0.5, -4], ['cone', -5, 0.5, -4.5], ['cone', 16, 0.5, 2], ['chair', -3, 0.5, -7], ['chair', 3.5, 0.5, -7.2],
    ['trashcan', 16.5, 0.6, 10.5], ['bat', 3, 0.4, -1.5], ['pan', -3, 0.4, 1], ['plank', 15, 3.0, -8.5],
    ['bowlingball', 24, 0.5, 3], ['beachball', -24, 0.6, -3], ['watermelon', -9, 0.6, -6], ['guitar', 9, 0.4, 7],
  ],
  extra: 7,
  pool: {
    bat: 3, pan: 2, sign: 2, wrench: 2, plank: 2, chair: 2, guitar: 1, chicken: 1, cone: 2, golfclub: 1, mallet: 1,
    broom: 1, hammer: 1, fish: 1, crate: 3, barrel: 2, tire: 1, watermelon: 1, bowlingball: 1, beachball: 1, anvil: 1,
    trashcan: 1, tomato: 2, brick: 2, banana: 1, duck: 1, pie: 1,
    poppistol: 1, blunderbuss: 1, raygun: 1, rocket: 1, flamethrower: 1, acidgun: 1, torch: 1, grenade: 2, bomb: 1, acidflask: 1,
  },
  hazards: {
    balls: [{ pivot: [0, 13.4, -1], length: 12.2, radius: 1.25, period: 7.5, amplitude: 0.95, yawSpeed: 0.23, crane: true }],
  },
  killY: -32,
  outWord: 'RING OUT!',
};

// ------------------------------------------------------------------ 2. FREIGHT FRENZY (moving train)
const train = {
  id: 'train',
  name: 'FREIGHT FRENZY',
  tagline: 'Jump the low beams - get off the cargo for the high ones!',
  music: 1,
  boxes: [
    box('car', -25.25, -3.9, -3.6, -14.25, 0, 3.6),
    box('car', -12.75, -3.9, -3.6, -1.75, 0, 3.6),
    box('car', -0.25, -3.9, -3.6, 10.75, 0, 3.6),
    box('car', 12.25, -3.9, -3.6, 23.25, 0, 3.6),
    box('hatch', -22, 0, -1, -19.5, 0.45, 1),
    box('crate', -16.5, 0, 1.8, -15.3, 1.2, 3),
    box('container', -11.5, 0, -3.3, -5.5, 2.5, -0.4),
    box('crate', -5.5, 0, -2.4, -4.3, 1.25, -1.2),
    box('tank', 1, 0, -2, 9.5, 1.1, 2),
    box('crate', 19, 0, 1.4, 20.2, 1.2, 2.6),
    // scissor lift on the flatbed
    box('lift', 14, -1.4, -3.2, 17, 1.4, -0.4, { move: { axis: 'y', amp: 1.4, period: 6 } }),
  ],
  spawns: [[-23, 0, 2.4], [-23, 0, -2.4], [-17, 0, -2.4], [-9, 0, 2.2], [-3, 0, 2.5], [5, 1.1, 0], [18, 0, -2.2], [21, 0, 2.2]],
  dummySpawn: [-8, 0, 2.2],
  itemSpawns: [
    [-20.7, 0.45, 0], [-24, 0, -2.6], [-17, 0, 2.6], [-15.9, 1.2, 2.4], [-8.5, 2.5, -1.8], [-3, 0, 2.6], [-3, 0, -2.8],
    [5, 1.1, 0], [2.5, 1.1, 1], [8, 1.1, -1], [1, 0, 2.9], [9.5, 0, -2.9], [14, 0, 2.6], [19.6, 1.2, 2], [22, 0, -2.6],
  ],
  props: [
    ['crate', -13.5, 0.6, -2.6], ['crate', -24.3, 0.6, -2.7], ['barrel', -3, 0.6, 2.6], ['barrel', 11.4, 0.6, -2.6],
    ['coal', -21, 0.6, 0.3], ['coal', -20.4, 0.6, -0.3], ['coal', -2.5, 0.4, -2.8], ['coal', 21.5, 0.4, -2.5],
    ['shovel', -18, 0.4, -2.4], ['shovel', 6, 1.5, 0.6], ['tnt', -23.5, 0.6, 2.6], ['wrench', 0.4, 0.4, 2.8],
    ['plank', 4, 1.5, -1], ['anvil', 21.5, 0.6, -0.5], ['trashcan', -14.8, 0.6, -2.6], ['brick', 13, 0.4, 2.6],
  ],
  extra: 6,
  pool: {
    shovel: 3, wrench: 2, plank: 2, pan: 1, hammer: 1, bat: 1, chair: 1, guitar: 1, crate: 3, barrel: 2, tnt: 2,
    anvil: 1, coal: 4, brick: 2, banana: 1, tomato: 1, trashcan: 1,
    poppistol: 1, blunderbuss: 2, rocket: 1, grenade: 2, bomb: 1, torch: 1, flamethrower: 1,
  },
  hazards: {
    beams: { period: 7, warn: 1.7, speed: 36, from: 48, to: -48, low: [0.85, 1.45], high: [2.75, 3.35], z: [-5.5, 5.5], thick: 0.55 },
  },
  killY: -4.4,
  outWord: 'LEFT BEHIND!',
};

// ------------------------------------------------------------------ 3. ICE FLOE FIASCO (slippery!)
const ice = {
  id: 'ice',
  name: 'ICE FLOE FIASCO',
  tagline: 'Slippery ice, drifting floes and falling snowballs!',
  music: 2,
  boxes: [
    box('ice', -14, -1.6, -8, 14, 0, 8),
    box('ice', -9, -1.6, 8, 9, 0, 11),
    box('ice', -9, -1.6, -11, 9, 0, -8),
    box('ice', 14, -1.6, -4, 17, 0, 4),
    box('ice', -17, -1.6, -4, -14, 0, 4),
    box('igloo', -9, 0, -6.8, -5.6, 1.7, -3.6),
    box('iceblock', 5, 0, -6, 6.6, 1.2, -4.4),
    box('iceblock', 8, 0, 3.4, 9.6, 1.2, 5),
    // drifting floes
    box('floe', 19.5, -1.4, -2, 23.5, 0, 2, { move: { axis: 'z', amp: 6, period: 11 } }),
    box('floe', -23.5, -1.4, -2, -19.5, 0, 2, { move: { axis: 'z', amp: 6, period: 11, phase: Math.PI } }),
    box('floe', -2, -1.4, 13, 2, 0, 17, { move: { axis: 'x', amp: 9, period: 13 } }),
  ],
  spawns: [[-9, 0, 0], [9, 0, 0], [0, 0, -4], [0, 0, 5], [-5, 0, 9], [5, 0, -9.5], [12, 0, -2], [-12, 0, 2]],
  dummySpawn: [0, 0, 2],
  itemSpawns: [
    [-10, 0, -2], [10, 0, 2], [0, 0, -6], [0, 0, 9], [-5, 0, 4], [5, 0, -1], [15.5, 0, 0], [-15.5, 0, 0],
    [-3, 0, -3], [4, 0, 5], [-7.3, 1.7, -5.2], [5.8, 1.2, -5.2], [-8, 0, 9.5], [8, 0, -9.5], [11, 0, 6], [-11, 0, -6],
  ],
  props: [
    ['snowball', -2, 0.4, 0], ['snowball', -2.4, 0.4, 0.4], ['snowball', 2.5, 0.4, -2], ['snowball', 2.1, 0.4, -2.4],
    ['snowball', -11, 0.4, 5], ['snowball', 11, 0.4, -5], ['iceblock', -11, 0.6, 5.5], ['iceblock', 11, 0.6, -5.5],
    ['penguin', 6, 0.6, 9.5], ['penguin', -6, 0.6, -9.6], ['penguin', 15.5, 0.6, 3], ['fish', 0, 0.4, -9.5],
    ['hockeystick', -10, 0.4, -2.5], ['hockeystick', 10, 0.4, 2.5], ['beachball', 0, 0.6, 9.5], ['lollipop', -15.5, 0.4, -2.5],
  ],
  extra: 6,
  pool: {
    fish: 3, hockeystick: 3, shovel: 2, broom: 1, lollipop: 1, snowball: 6, iceblock: 3, penguin: 2, beachball: 1,
    barrel: 1, crate: 1, pie: 1,
    raygun: 2, acidgun: 1, grenade: 1, acidflask: 1, torch: 1,
  },
  phys: { accel: 22, decel: 6.5, air: 20, slide: 0.975 },
  hazards: {
    snow: { interval: 2.4, warn: 1.4, radius: 2.0 },
  },
  killY: -3,
  outWord: 'SPLASH!',
};

// ------------------------------------------------------------------ 4. GEAR WORKS (conveyors + crusher)
const factory = {
  id: 'factory',
  name: 'GEAR WORKS',
  tagline: "Don't ride the belts into the grinder!",
  music: 3,
  boxes: [
    box('metal', -17, -14, -11, -3, 0, 11),
    box('metal', 3, -14, -11, 17, 0, 11),
    box('bridge', -3, -0.6, 5, 3, 0, 11),
    box('conveyor', -13, 0, -5, -3, 0.2, -1.6, { conv: [3.6, 0] }),
    box('conveyor', 3, 0, -5, 13, 0.2, -1.6, { conv: [-3.6, 0] }),
    box('platform', -17, 0, -11, -12, 2.4, -7),
    box('platform', 12, 0, -11, 17, 2.4, -7),
    box('crate', -12, 0, -9, -10.8, 1.2, -7.8),
    box('crate', 10.8, 0, -9, 12, 1.2, -7.8),
    box('machine', -17, 0, 6, -14, 1.6, 11),
    box('machine', 14, 0, 6, 17, 1.6, 11),
    box('bounce', -15.8, 0, 2.2, -14.4, 0.3, 3.6, { bounce: 19 }),
    box('bounce', 14.4, 0, 2.2, 15.8, 0.3, 3.6, { bounce: 19 }),
    // shuttle cart sliding through the grinder pit
    box('shuttle', -3, -0.4, -9, 3, 0, -6, { move: { axis: 'z', amp: 4.5, period: 9 } }),
    // pistons pumping up and down
    box('piston', -10, -2, 2, -7.5, 1.5, 4.5, { move: { axis: 'y', amp: 1.5, period: 5 } }),
    box('piston', 7.5, -2, 2, 10, 1.5, 4.5, { move: { axis: 'y', amp: 1.5, period: 5, phase: Math.PI } }),
  ],
  spawns: [[-8, 0, 0], [8, 0, 0], [-8, 0, -9], [8, 0, -9], [-11, 0, 7], [11, 0, 7], [-6, 0, 8], [6, 0, 8]],
  dummySpawn: [-6, 0, 0],
  itemSpawns: [
    [-6, 0, 2], [6, 0, 2], [-14.5, 2.4, -9], [14.5, 2.4, -9], [-6, 0, -9], [6, 0, -9], [0, 0, 7.5],
    [-15.5, 1.6, 8.5], [15.5, 1.6, 8.5], [-5, 0, 0.5], [5, 0, 0.5], [-10, 0, 0], [10, 0, -0.5], [-11, 0, 9], [11, 0, 9],
  ],
  props: [
    ['gear', -5, 0.4, 2.5], ['gear', 5, 0.4, 2.5], ['gear', -8, 0.4, -9.5], ['gear', 8, 0.4, -9.5], ['anvil', 10, 0.6, -9.5],
    ['barrel', -14.5, 2.9, -9], ['barrel', 14.5, 2.9, -9], ['crate', -4.4, 0.6, 9.8], ['crate', 4.4, 0.6, 9.8],
    ['wrench', -8, 0.4, 5.5], ['pipe', 8, 0.4, 5.5], ['plunger', 0, 0.4, 10], ['trashcan', -13, 0.6, 2],
    ['mallet', 13, 0.4, 0], ['chicken', -12, 0.4, -4], ['tire', 15.5, 2.1, 8.5],
  ],
  extra: 6,
  pool: {
    wrench: 3, pipe: 3, plunger: 2, mallet: 2, hammer: 1, chicken: 1, gear: 4, anvil: 2, barrel: 2, crate: 2,
    trashcan: 1, tire: 1, brick: 2, banana: 1,
    flamethrower: 1, acidgun: 2, acidflask: 2, rocket: 1, raygun: 1, grenade: 1, torch: 1,
  },
  hazards: {
    crusher: { x0: -2.6, x1: 2.6, z0: 6, z1: 10, top: 7, bottom: 0.25, period: 6.5 },
  },
  killY: -13,
  outWord: 'GROUND UP!',
};

// ------------------------------------------------------------------ 5. STEAMROLLER STAMPEDE (chase race)
const chase = {
  id: 'chase',
  name: 'STEAMROLLER STAMPEDE',
  tagline: 'RUN! Knock rivals back into the roller - first to the finish wins!',
  music: 4,
  mode: 'race',
  finishX: 168,
  chaser: { startX: -16, v0: 3.4, v1: 8.2, ramp: 50, width: 16 },
  boxes: [
    box('track', -9, -14, -5.5, 20, 0, 5.5),
    box('track', 23, -14, -5.5, 40, 0, 5.5),
    box('conveyor', 27, 0, -5.5, 37, 0.2, 5.5, { conv: [-3.2, 0] }),
    box('crate', 30.5, 0.2, -4, 31.9, 1.6, -2.6),
    box('crate', 33.5, 0.2, 1.4, 34.9, 1.6, 2.8),
    box('track', 40, -14, -5.5, 58, 0, 5.5),
    box('step', 44, 0, -5.5, 47, 0.9, 5.5),
    box('step', 47, 0, -5.5, 50, 1.8, 5.5),
    box('step', 50, 0, -5.5, 55, 2.7, 5.5),
    box('platform', 59.5, -0.4, -2, 63.5, 0, 2, { move: { axis: 'z', amp: 3.4, period: 5 } }),
    box('platform', 65, -0.4, -2, 69, 0, 2, { move: { axis: 'z', amp: 3.4, period: 5, phase: Math.PI } }),
    box('platform', 70.5, -0.4, -2, 74.5, 0, 2, { move: { axis: 'z', amp: 3.4, period: 5 } }),
    box('track', 76, -14, -5.5, 82, 0, 5.5),
    box('bridge', 82, -14, -1.9, 100, 0, 1.9),
    box('track', 100, -14, -6.5, 122, 0, 6.5),
    box('crate', 106, 0, -2.2, 107.4, 1.4, -0.8),
    box('crate', 112, 0, 1.2, 113.4, 1.4, 2.6),
    box('crate', 117, 0, -4.4, 118.4, 1.4, -3),
    box('track', 122, -14, -5.5, 140, 0, 5.5),
    box('conveyor', 123, 0, -5.5, 137, 0.2, 5.5, { conv: [4.2, 0] }),
    box('bounce', 138.4, 0, -1.4, 140, 0.3, 1.4, { bounce: 15 }),
    box('track', 143, -14, -5.5, 165, 0, 5.5),
    box('hurdle', 148, 0, -5.5, 148.6, 0.85, 5.5),
    box('hurdle', 154, 0, -5.5, 154.6, 0.85, 5.5),
    box('hurdle', 160, 0, -5.5, 160.6, 0.85, 5.5),
    box('finish', 165, -14, -7, 186, 0, 7),
  ],
  spawns: [[3, 0, -3.6], [3, 0, -1.2], [3, 0, 1.2], [3, 0, 3.6], [0, 0, -3.6], [0, 0, -1.2], [0, 0, 1.2], [0, 0, 3.6]],
  dummySpawn: [8, 0, 0],
  itemSpawns: [
    [10, 0, -3], [14, 0, 3], [25, 0, 0], [42, 0, -3], [42, 0, 3], [52, 2.7, 0], [78, 0, -3], [79, 0, 3],
    [104, 0, -4], [104, 0, 4], [110, 0, 0], [115, 0, -4], [120, 0, 4], [146, 0, -3], [151, 0, 3], [157, 0, -2],
  ],
  props: [
    ['crate', 12, 0.6, -3], ['barrel', 16, 0.6, 3], ['bat', 6, 0.4, 2.5], ['pan', 6, 0.4, -2.5], ['banana', 25, 0.3, -2],
    ['banana', 25, 0.3, 2], ['crate', 44.5, 1.5, -3.5], ['tire', 56, 0.6, 3], ['bowlingball', 80, 0.5, 0],
    ['crate', 103, 0.6, 3], ['barrel', 108, 0.6, -4], ['plank', 110, 0.4, 3], ['chicken', 115, 0.4, 1],
    ['banana', 145, 0.3, 0], ['tomato', 144, 0.3, 2], ['tomato', 144, 0.3, -2],
  ],
  extra: 6,
  pool: {
    bat: 2, pan: 2, plank: 1, chicken: 1, golfclub: 1, crate: 2, barrel: 1, tire: 1, banana: 3, tomato: 2, brick: 2,
    poppistol: 1, blunderbuss: 1, grenade: 1, acidflask: 1, torch: 1, bowlingball: 1,
  },
  hazards: {
    balls: [
      { pivot: [87.5, 9, 0], length: 8.3, radius: 1.1, period: 3.4, amplitude: 1.05, fixedYaw: Math.PI / 2 },
      { pivot: [94.5, 9, 0], length: 8.3, radius: 1.1, period: 3.4, amplitude: 1.05, fixedYaw: Math.PI / 2, phase: Math.PI },
    ],
  },
  killY: -16,
  outWord: 'FELL BEHIND!',
};

export const LEVELS = [rooftop, train, ice, factory, chase];

// Where the steamroller is, t seconds after the race starts
export function chaserX(cfg, t) {
  if (t <= 0) return cfg.startX;
  const r = cfg.ramp;
  if (t < r) return cfg.startX + cfg.v0 * t + (0.5 * (cfg.v1 - cfg.v0) * t * t) / r;
  return cfg.startX + cfg.v0 * r + 0.5 * (cfg.v1 - cfg.v0) * r + cfg.v1 * (t - r);
}

// ------------------------------------------------------------------ moving platforms
// Returns the level's colliders at time t. Static boxes are returned as-is; movers are
// copied with their current offset plus `vel` (3D) and `carry` ([vx, vz] they drag riders with).
export function levelBoxesAt(lv, t, out = []) {
  const src = lv.boxes;
  out.length = src.length;
  for (let i = 0; i < src.length; i++) {
    const b = src[i];
    const m = b.move;
    if (!m) {
      out[i] = b;
      continue;
    }
    const w = (Math.PI * 2) / m.period;
    const ph = t * w + (m.phase || 0);
    const off = Math.sin(ph) * m.amp;
    const vel = Math.cos(ph) * m.amp * w;
    let o = out[i];
    if (!o || o === b || o.src !== b) o = { ...b, src: b, vel: [0, 0, 0], carry: [0, 0] };
    o.x0 = b.x0; o.x1 = b.x1; o.y0 = b.y0; o.y1 = b.y1; o.z0 = b.z0; o.z1 = b.z1;
    o.vel[0] = o.vel[1] = o.vel[2] = 0;
    if (m.axis === 'x') { o.x0 += off; o.x1 += off; o.vel[0] = vel; }
    else if (m.axis === 'y') { o.y0 += off; o.y1 += off; o.vel[1] = vel; }
    else { o.z0 += off; o.z1 += off; o.vel[2] = vel; }
    o.carry[0] = o.vel[0];
    o.carry[1] = o.vel[2];
    out[i] = o;
  }
  return out;
}

export function hasMovers(lv) {
  return lv.boxes.some((b) => b.move);
}

// ------------------------------------------------------------------ deterministic hazard helpers
export function ballPosition(ball, t) {
  const ph = (Math.PI * 2 * t) / ball.period + (ball.phase || 0);
  const ang = ball.amplitude * Math.sin(ph);
  const yaw = ball.fixedYaw !== undefined ? ball.fixedYaw : 0.7 * Math.sin(t * ball.yawSpeed);
  const horiz = Math.sin(ang) * ball.length;
  return {
    x: ball.pivot[0] + Math.cos(yaw) * horiz,
    y: ball.pivot[1] - Math.cos(ang) * ball.length,
    z: ball.pivot[2] + Math.sin(yaw) * horiz,
    ang,
    yaw,
    dang: Math.cos(ph),
  };
}

// Overhead beams sweeping along the train (from +x toward -x)
export function beamState(cfg, t) {
  const i = Math.floor(t / cfg.period);
  const lt = t - i * cfg.period;
  const high = i % 2 === 1;
  const ys = high ? cfg.high : cfg.low;
  if (lt < cfg.warn) return { phase: 'warn', i, high, x: cfg.from, y0: ys[0], y1: ys[1], k: lt / cfg.warn };
  const x = cfg.from - (lt - cfg.warn) * cfg.speed;
  if (x < cfg.to) return { phase: 'idle', i, high, x: cfg.to, y0: ys[0], y1: ys[1], k: 1 };
  return { phase: 'move', i, high, x, y0: ys[0], y1: ys[1], k: 1 };
}

// Hydraulic press: idle up, warning shake, SLAM, hold, rise
export function crusherState(cfg, t) {
  const P = cfg.period;
  const i = Math.floor(t / P);
  const lt = t - i * P;
  const top = cfg.top, bot = cfg.bottom;
  if (lt < 3.4) return { phase: 'idle', i, y: top, k: 0 };
  if (lt < 4.8) return { phase: 'warn', i, y: top - 0.15 * Math.abs(Math.sin(lt * 40)), k: (lt - 3.4) / 1.4 };
  if (lt < 4.95) {
    const k = (lt - 4.8) / 0.15;
    return { phase: 'slam', i, y: top + (bot - top) * k * k, k };
  }
  if (lt < 5.6) return { phase: 'hold', i, y: bot, k: 1 };
  const k = (lt - 5.6) / (P - 5.6);
  return { phase: 'rise', i, y: bot + (top - bot) * k, k };
}
