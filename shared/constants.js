// Shared constants used by both the authoritative server and the client.
// Everything here must stay deterministic so client-side prediction matches the server.

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const SNAPSHOT_EVERY = 2; // server sends a snapshot every N ticks (30Hz)

// Input buttons (bitmask)
export const BTN = {
  JUMP: 1,
  ATTACK: 2,
  KICK: 4,
  GRAB_L: 8, // left hand (LT / Q) - hold to grab
  BLOCK: 16,
  DODGE: 32,
  TAUNT: 64,
  START: 128,
  GRAB_R: 256, // right hand (RT / E) - hold to grab
};
export const ALL_BTNS = 0x1ff;

// Player states
export const ST = {
  FREE: 0,
  ATTACK: 1,
  CHARGE: 2,
  BLOCK: 3,
  DODGE: 4,
  HELD: 5,
  TUMBLE: 6,
  DOWN: 7,
  DIZZY: 8,
  GETUP: 9,
  DEAD: 10,
  TAUNT: 11,
  STAGGER: 12,
  KO: 13, // knocked out cold: limp, can be dragged around
};

// States in which the player's own stick drives movement (and the client predicts).
export const CONTROLLABLE = new Set([ST.FREE, ST.ATTACK, ST.CHARGE, ST.BLOCK, ST.TAUNT]);

// Whether a player's movement is driven by deterministic stick input this tick.
// Dropkicks are ballistic, so they're excluded.
export function isPredictable(state, actKind) {
  return CONTROLLABLE.has(state) && actKind !== 'dk';
}

// Character body
export const PLAYER_RADIUS = 0.45;
export const PLAYER_HEIGHT = 1.7;

// Movement tuning (snappy but weighty, Party Animals / Gang Beasts style)
export const MOVE = {
  SPEED: 8.2,
  GROUND_ACCEL: 62,
  GROUND_DECEL: 75,
  AIR_ACCEL: 24,
  GRAVITY: 32,
  FALL_GRAVITY_MUL: 1.45,
  JUMP_CUT_GRAVITY_MUL: 2.2,
  JUMP_VEL: 11.5,
  MAX_FALL: 45,
  COYOTE_TICKS: 7,
  JUMP_BUFFER_TICKS: 7,
  STEP_HEIGHT: 0.42,
};

// Movement multipliers per state (also used by prediction)
export const STATE_MOVE_MUL = {
  [ST.FREE]: 1,
  [ST.ATTACK]: 0.32,
  [ST.CHARGE]: 0.45,
  [ST.BLOCK]: 0.35,
  [ST.TAUNT]: 0,
};
export const HOLD_HEAVY_MUL = 0.72;
export const HOLD_PLAYER_MUL = 0.66; // lifting a player overhead (both hands)
export const ONE_HAND_MUL = 0.75; // holding a conscious player by the collar
export const DRAG_MUL = 0.8; // dragging a knocked-out player by one hand

// Movement multiplier from what a player is carrying. Shared so prediction matches.
export function holdMoveMul(grabMask, dragging, heavy) {
  if (grabMask === 3) return HOLD_PLAYER_MUL;
  if (grabMask) return dragging ? DRAG_MUL : ONE_HAND_MUL;
  if (heavy) return HOLD_HEAVY_MUL;
  return 1;
}

// Knockout tuning
export const DAZE = {
  PER_DMG: 3.6, // daze added per point of damage
  DECAY_DELAY: 150, // ticks without being hit before daze recovers
  DECAY: 0.22, // per tick
  KO_TICKS: 360, // how long a knockout lasts (mashing shortens it)
  IMMUNE_TICKS: 150, // after waking up, daze can't build for a moment
};

export const KILL_Y = -14;
export const ROUND_WINS_TO_MATCH = 3;
export const MAX_PLAYERS = 8;

export const COLORS = [
  { name: 'Sunny', body: 0xffd21f, dark: 0xd99a00, glove: 0xe8322c },
  { name: 'Minty', body: 0x2fd4b8, dark: 0x16917c, glove: 0x222630 },
  { name: 'Bubbles', body: 0xff6fb5, dark: 0xc93d84, glove: 0xb5174f },
  { name: 'Blu', body: 0x2f5fe8, dark: 0x1a3596, glove: 0xffcc00 },
  { name: 'Pickles', body: 0x5ccf3a, dark: 0x2f8a1a, glove: 0x2b2b2b },
  { name: 'Chili', body: 0xf0372c, dark: 0xa8160f, glove: 0xffe14d },
  { name: 'Tangy', body: 0xff9420, dark: 0xc25a00, glove: 0x2f5fe8 },
  { name: 'Grape', body: 0x9b5cf0, dark: 0x5f2ab0, glove: 0x2fd4b8 },
];

export const PHASE = {
  LOBBY: 'lobby',
  COUNTDOWN: 'countdown',
  FIGHT: 'fight',
  ROUND_END: 'roundEnd',
  MATCH_END: 'matchEnd',
};

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function quantizeAxis(v) {
  return Math.round(clamp(v, -1, 1) * 100) / 100;
}
